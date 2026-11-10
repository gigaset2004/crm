import Front from '@frontapp/plugin-sdk';
import {mergeParticipants} from './participants.js';
import {loadConversationParticipants} from './conversation-participants.js';
import {recordEmails,showRecordTitle,applyTextUpdate} from './record-presentation.js';
import {relationRequired} from './create-relations.js';
// Full-history mode requires separate approval to store the Front token on WPX.
const completeHistoryEnabled=false;
const relationSearchState=new WeakMap();
let relationListId=0;
import {providerValue,providerRecords} from './provider.js';
import {leadStatuses} from './lead-status.js';
import {LookupCache,runLimited} from './lookup-cache.js';
import {recordCategory,availableCategories,sortRecords} from './card-groups.js';
import {createTypes,createStatuses} from './create-options.js';
import {currentOwnerId} from './current-owner.js';
const lookupCache=new LookupCache();
let activeConversationKey='',contextLoadVersion=0;
const conversationSnapshots=new Map();
const $ = id => document.getElementById(id);
let context, participants = [], recordsByEmail = new Map(), version = 0, connected = false, poll, selectedFilter = 'All', crmUsers = [];
function readSavedTicket(){try{const saved=localStorage.getItem('minmax-zoho-session');if(saved)return saved;}catch{}try{return sessionStorage.getItem('minmax-zoho-session')||'';}catch{return '';}}
function saveTicket(value){try{localStorage.setItem('minmax-zoho-session',value);}catch{}try{sessionStorage.setItem('minmax-zoho-session',value);}catch{}}
let ticket = readSavedTicket();
if(ticket)saveTicket(ticket);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const recordUrl = (base,module,id) => `${base}/${encodeURIComponent(module)}/${encodeURIComponent(id)}`;
const participantKey = p => p.email || p.phone;
function setConnection(value) {
  connected=value; $('connect').hidden=value;
  $('connection-status').innerHTML=`<span class="status-dot ${value?'is-connected':''}"></span>${value?'Zoho connected':'Connect your Zoho CRM'}`;
}
async function api(action, extra={}, method='GET') {
  if(method==='GET'&&['lookup','users','relation_search'].includes(action))return lookupCache.get(JSON.stringify([ticket,action,extra]),action==='users'?300000:30000,()=>requestApi(action,extra,method));
  if(method!=='GET'){lookupCache.clear();conversationSnapshots.clear();}
  try{return await requestApi(action,extra,method);}finally{if(method!=='GET')lookupCache.clear();}
}
async function requestApi(action, extra={}, method='GET') {
  const isWrite=method!=='GET';
  const query=new URLSearchParams({action,...(!isWrite?extra:{})});
  const result=await fetch(`zoho.php?${query}`,{method,headers:{Authorization:`Bearer ${ticket}`,...(isWrite?{'Content-Type':'application/json'}:{})},body:isWrite?JSON.stringify(extra):undefined,cache:'no-store'});
  const data=await result.json();
  if(!result.ok){if(result.status===401)setConnection(false);if(data.diagnostic==='OAUTH_SCOPE_MISMATCH'){$('connect').hidden=false;$('connect').textContent='Reconnect Zoho';}throw new Error(data.error||'Could not load Zoho records.');}
  return data;
}
async function checkConnection(){if(!ticket){setConnection(false);return false;}try{await api('status');setConnection(true);return true;}catch{setConnection(false);return false;}}
$('content').addEventListener('click',async event=>{
  const relationEdit=event.target.closest('[data-relation-edit]');
  if(relationEdit){const wrapper=relationEdit.closest('.relation-value');wrapper.querySelector('.field-value').hidden=true;relationEdit.hidden=true;const form=wrapper.querySelector('form');form.hidden=false;form.elements.relation_search.focus();return;}
  const removeProvider=event.target.closest('[data-remove-provider]');
  if(removeProvider){const form=removeProvider.closest('form');form.elements.provider_ids.value=JSON.stringify(JSON.parse(form.elements.provider_ids.value).filter(p=>p.id!==removeProvider.dataset.removeProvider));renderProviderChoices(form);return;}
  const choice=event.target.closest('[data-related-choice]');
  if(choice){const form=choice.closest('form'),input=form.elements.relation_search;if(form.dataset.provider==='true'){const providers=JSON.parse(form.elements.provider_ids.value);if(!providers.some(p=>p.id===choice.dataset.relatedChoice))providers.push({id:choice.dataset.relatedChoice,name:choice.dataset.relatedName});form.elements.provider_ids.value=JSON.stringify(providers);renderProviderChoices(form);input.value='';}else{form.elements.related_id.value=choice.dataset.relatedChoice;input.value=choice.dataset.relatedName;}input.setAttribute('aria-expanded','false');form.querySelector('[data-relation-results]').hidden=true;form.querySelector('[data-relation-status]').textContent=`Selected: ${choice.dataset.relatedName}`;form.querySelector('.edit-error').textContent='';return;}
  const filter=event.target.closest('[data-filter]');
  if(filter){selectedFilter=filter.dataset.filter;renderCards();return;}
  const edit=event.target.closest('[data-edit]');
  if(edit){const row=edit.closest('.editable-field');row.querySelector('.field-value').hidden=true;row.querySelector('.edit-button').hidden=true;const form=row.querySelector('form');form.hidden=false;form.querySelector('input').focus();form.querySelector('input').select();return;}
  const cancel=event.target.closest('[data-cancel]');
  if(cancel){renderCards();return;}
  const create=event.target.closest('[data-create]');
  if(create){const card=create.closest('.no-match');card.querySelector('.create-actions').hidden=true;card.querySelector(`[data-create-form="${create.dataset.create}"]`).hidden=false;card.querySelector(`[data-create-form="${create.dataset.create}"] input[name="name"]`).focus();return;}
  const link=event.target.closest('a');
  if(link&&context&&window.top!==window.self){event.preventDefault();try{await context.openUrl(link.href);}catch{$('connection-status').textContent='Front could not open this link.';}}
});
$('content').addEventListener('submit',async event=>{
  const form=event.target.closest('.edit-form, .create-form, .relation-edit-form');if(!form)return;event.preventDefault();
  if(form.matches('.relation-edit-form')){
    if(form.dataset.provider!=='true'&&!form.elements.related_id.value){form.querySelector('.edit-error').textContent='Select a CRM record from the results.';return;}
    const buttons=[...form.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);form.querySelector('.edit-error').textContent='';
    try{const saved=await api('relation_update',{module:form.dataset.module,id:form.dataset.id,related_ids:form.dataset.provider==='true'?JSON.parse(form.elements.provider_ids.value).map(p=>p.id):[form.elements.related_id.value],expected_ids:JSON.parse(form.elements.expected_ids.value)},'POST');
      for(const rows of recordsByEmail.values())for(const record of rows)if(record.module===form.dataset.module&&record.id===form.dataset.id){record.related=saved.related;record.logistics_services=saved.logistics_services;record.nicknames=saved.nicknames||[];}
      renderCards();
    }catch(error){buttons.forEach(b=>b.disabled=false);form.querySelector('.edit-error').textContent=error.message;}return;
  }
  if(form.matches('.create-form')){
    if(!form.querySelector('[data-relation]').hidden&&!form.elements.related_id.value&&(relationRequired(form.dataset.module,form.elements.record_type.value)||form.elements.relation_search.value.trim())){form.querySelector('.edit-error').textContent='Select a matching CRM record from the search results, or clear the optional Account field.';form.elements.relation_search.focus();return;}
    const submit=form.querySelector('[type="submit"]'),data=Object.fromEntries(new FormData(form));
    submit.disabled=true;form.querySelector('.edit-error').textContent='';
    try{const email=form.dataset.email,phone=form.dataset.phone,key=email||phone;const created=await api('create',{module:form.dataset.module,email,phone,name:data.name,mobile:data.mobile,title:data.title,owner_id:data.owner_id,record_type:data.record_type,lead_status:data.lead_status,related_id:data.related_id},'POST');const provisional={...created,emails:new Set(email?[email]:[]),crmBase:'https://crm.zoho.com/crm/minmaxdeals/tab'};recordsByEmail.set(key,[provisional]);renderCards();try{const result=await api('lookup',phone?{phone}:{email});const rows=result.records||[];rows.crmBase=result.crm_base;if(rows.length)recordsByEmail.set(key,rows);renderCards();}catch{}}
    catch(error){submit.disabled=false;form.querySelector('.edit-error').textContent=error.message;}return;
  }
  const input=form.querySelector('input'),record=[...recordsByEmail.values()].flat().find(r=>r.id===form.dataset.id);
  if(!record)return;
  form.querySelectorAll('button').forEach(button=>button.disabled=true);
  try{
    const saved=await api('update',{module:record.module,id:record.id,field:form.dataset.field,value:input.value},'POST');
    applyTextUpdate(recordsByEmail,record,saved);
    renderCards();
  }catch(error){form.querySelectorAll('button').forEach(button=>button.disabled=false);form.querySelector('.edit-error').textContent=error.message;}
});
$('content').addEventListener('change',async event=>{
  const typeSelect=event.target.closest('[name="record_type"]');
  if(typeSelect){const form=typeSelect.closest('form'),type=typeSelect.value;const label=type==='Customer'?'Account':type==='Supplier'?'Vendor':['Warehouse','Broker','Carrier','Forwarder'].includes(type)&&form.dataset.module==='Contacts'?'Logistics':'';const titleField=form.querySelector('[data-create-title]');if(titleField){titleField.hidden=label!=='Logistics';form.elements.title.disabled=label!=='Logistics';}const section=form.querySelector('[data-relation]');section.hidden=!label;section.querySelector('[data-relation-label]').textContent=label+(label==='Account'?' (optional)':'');form.elements.related_id.value='';form.elements.relation_search.value='';form.elements.relation_search.required=!!label&&relationRequired(form.dataset.module,type);form.elements.relation_search.setAttribute('aria-expanded','false');form.querySelector('[data-relation-results]').hidden=true;form.querySelector('[data-relation-status]').textContent='Type at least 2 characters to search.';const previous=relationSearchState.get(form);if(previous)clearTimeout(previous.timer);relationSearchState.delete(form);return;}
  const select=event.target.closest('.owner-select');if(!select)return;
  const record=[...recordsByEmail.values()].flat().find(r=>r.id===select.dataset.id);if(!record)return;
  select.disabled=true;select.closest('.editable-field').querySelector('.edit-error').textContent='';
  try{const saved=await api('update',{module:record.module,id:record.id,field:'Owner',value:select.value},'POST');record.owner=saved.owner;record.owner_id=saved.owner_id;}
  catch(error){select.closest('.editable-field').querySelector('.edit-error').textContent=error.message;select.value=record.owner_id||'';}
  finally{select.disabled=false;}
});
function queueRelationSearch(input){
  const form=input.closest('form'),previous=relationSearchState.get(form);if(previous)clearTimeout(previous.timer);
  const state={};relationSearchState.set(form,state);
  form.elements.related_id.value='';
  const list=form.querySelector('[data-relation-results]'),status=form.querySelector('[data-relation-status]');
  list.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');
  const term=input.value.trim(),type=form.elements.record_type.value;
  if(term.length<2){status.textContent='Type at least 2 characters to search.';return;}
  status.textContent='Searching…';
  state.timer=setTimeout(async()=>{
    try{const data=await api('relation_search',{type,word:term});
      if(!form.isConnected||relationSearchState.get(form)!==state||input.value.trim()!==term||form.elements.record_type.value!==type)return;
      const records=data.records||[];
      list.innerHTML=records.map((r,i)=>`<button type="button" role="option" aria-selected="false" id="${list.id}-${i}" data-related-choice="${esc(r.id)}" data-related-name="${esc(r.name)}"><span>${esc(r.name)}</span><small>CRM record · ${esc(r.id)}</small></button>`).join('');
      list.hidden=!records.length;input.setAttribute('aria-expanded',String(!!records.length));
      status.textContent=records.length?`${records.length} match${records.length===1?'':'es'} — select a record below.`:'No matching records. Try another name.';
    }catch(error){if(form.isConnected&&relationSearchState.get(form)===state)status.textContent=error.message;}
  },300);
}
$('content').addEventListener('input',event=>{if(event.target.matches('[name="relation_search"]'))queueRelationSearch(event.target);});
$('content').addEventListener('keydown',event=>{
  const input=event.target.closest('[name="relation_search"]');if(!input)return;
  const list=input.closest('form').querySelector('[data-relation-results]');
  if(event.key==='Escape'){list.hidden=true;input.setAttribute('aria-expanded','false');return;}
  if(list.hidden)return;
  const options=[...list.querySelectorAll('[role="option"]')];let index=options.findIndex(option=>option.getAttribute('aria-selected')==='true');
  if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();index=(index+(event.key==='ArrowDown'?1:-1)+options.length)%options.length;options.forEach((option,i)=>option.setAttribute('aria-selected',String(i===index)));input.setAttribute('aria-activedescendant',options[index].id);options[index].scrollIntoView({block:'nearest'});}
  if(event.key==='Enter'){event.preventDefault();if(index>=0)options[index].click();}
});
$('connect').onclick=()=>{
  ticket=Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');
  saveTicket(ticket);
  window.open(new URL(`zoho.php?action=start&ticket=${ticket}`,location.href).href,'minmax-zoho-auth','width=720,height=760');
  $('connection-status').innerHTML='<span class="status-dot"></span>Approve access in the Zoho window';
  clearInterval(poll);let attempts=0;
  poll=setInterval(async()=>{if(++attempts>120){clearInterval(poll);setConnection(false);return;}if(await checkConnection()){clearInterval(poll);if(participants.length)lookupAll();else renderEmpty();}},3000);
};
function renderEmpty(){if(window.top===window.self){renderManual();return;}$('content').innerHTML='<div class="empty">Open a conversation in Front to see matching CRM records.</div>';}
function renderManual(){
  $('content').innerHTML='<div class="empty"><strong>CRM lookup</strong><p>Enter emails or international phone numbers separated by commas.</p><form id="test-form"><input id="test-email" placeholder="Email or +country-code phone" required><button>Search CRM</button></form></div>';
  $('test-form').onsubmit=event=>{event.preventDefault();participants=mergeParticipants($('test-email').value.split(/[,;]+/).map(handle=>({type:handle.includes('@')?'email':'phone',handle:handle.trim()})));lookupAll();};
}
function filterMatches(record){
  if(selectedFilter==='All')return true;
  return recordCategory(record).toLowerCase()===selectedFilter.toLowerCase();
}
function nameEditor(r,base){
  const name=[r.first_name,r.last_name].filter(Boolean).join(' ')||'Unnamed';
  return `<div class="editable-field"><span class="field-value"><a class="record-name" href="${recordUrl(base,r.module,r.id)}">${esc(name)}</a></span><button class="edit-button" data-edit aria-label="Edit name" title="Edit name">✎</button><form class="edit-form" data-id="${esc(r.id)}" data-field="Name" hidden><input aria-label="Name" value="${esc(name)}" maxlength="255" required><button type="submit" aria-label="Save name">Save</button><button type="button" data-cancel>Cancel</button><span class="edit-error" role="alert"></span></form></div>`;
}
function mobileEditor(r){
  const field=r.mobile?'Mobile':r.phone?'Phone':'Mobile',value=r.mobile||r.phone||'';
  return `<div class="editable-field"><span class="field-value">${esc(value||'—')}</span><button class="edit-button" data-edit aria-label="Edit phone" title="Edit phone">✎</button><form class="edit-form" data-id="${esc(r.id)}" data-field="${field}" hidden><input aria-label="${field}" type="tel" value="${esc(value)}" maxlength="30"><button type="submit" aria-label="Save phone">Save</button><button type="button" data-cancel>Cancel</button><span class="edit-error" role="alert"></span></form></div>`;
}
function titleEditor(r){
  return `<div class="editable-field"><span class="field-value">${esc(r.title||'—')}</span><button class="edit-button" data-edit aria-label="Edit title" title="Edit title">✎</button><form class="edit-form" data-id="${esc(r.id)}" data-field="Title" hidden><input aria-label="Title" value="${esc(r.title||'')}" maxlength="100"><button type="submit" aria-label="Save title">Save</button><button type="button" data-cancel>Cancel</button><span class="edit-error" role="alert"></span></form></div>`;
}
function ownerEditor(r){
  const options=crmUsers.map(user=>`<option value="${esc(user.id)}" ${user.id===r.owner_id?'selected':''}>${esc(user.name)}</option>`).join('');
  const current=crmUsers.some(user=>user.id===r.owner_id)?'':`<option value="${esc(r.owner_id||'')}">${esc(r.owner||'Select owner')}</option>`;
  return `<div class="editable-field owner-editor"><select class="owner-select" data-id="${esc(r.id)}" aria-label="Record owner" ${crmUsers.length?'':'disabled'}>${current}${options}</select><span class="edit-error" role="alert"></span></div>`;
}
function renderProviderChoices(form){form.querySelector('[data-provider-choices]').innerHTML=JSON.parse(form.elements.provider_ids.value).map(p=>`<span class="provider-choice">${esc(p.name)}<button type="button" data-remove-provider="${esc(p.id)}" aria-label="Remove ${esc(p.name)}">×</button></span>`).join('')||'<span class="muted">No providers selected</span>';}
function relationValueEditor(r,html,label,provider=false){
  const providers=provider?providerRecords(r.logistics_services):[];
  const selected=provider?providers:(r.related?[r.related]:[]);
  const listId=`relation-results-${++relationListId}`;
  const choices=provider?`<input type="hidden" name="provider_ids" value="${esc(JSON.stringify(providers))}"><div class="provider-choices" data-provider-choices>${providers.map(p=>`<span class="provider-choice">${esc(p.name)}<button type="button" data-remove-provider="${esc(p.id)}" aria-label="Remove ${esc(p.name)}">×</button></span>`).join('')}</div>`:'';
  return `<div class="editable-field relation-value"><span class="field-value">${html}</span><button class="edit-button" data-relation-edit aria-label="Edit ${label}" title="Edit ${label}">✎</button><form class="relation-edit-form" data-id="${esc(r.id)}" data-module="${esc(r.module)}" data-provider="${provider}" hidden><input type="hidden" name="record_type" value="${esc(r.type)}"><input type="hidden" name="expected_ids" value="${esc(JSON.stringify(selected.map(p=>p.id)))}"><input type="hidden" name="related_id" value="${provider?'':esc(r.related?.id||'')}">${choices}<label>${provider?'Add provider':`Select ${label}`}<input name="relation_search" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${listId}" autocomplete="off" placeholder="Type to search CRM records…" maxlength="100" value="${provider?'':esc(r.related?.name||'')}"></label><div class="relation-results" id="${listId}" role="listbox" aria-label="Matching CRM records" data-relation-results hidden></div><div class="relation-status" role="status" data-relation-status>Changes are saved only when you press Save.</div><div class="create-submit"><button type="submit">Save</button><button type="button" data-cancel>Cancel</button></div><span class="edit-error" role="alert"></span></form></div>`;
}
function createForm(value,module,displayName,isPhone=false){
  const typeField=`<label>${module==='Leads'?'Lead Type':'Contact Type'}<select name="record_type" required><option value="">Select type</option>${createTypes.map(t=>`<option value="${esc(t.value)}">${esc(t.label)}</option>`).join('')}</select></label>`;
  const statusField=module==='Leads'?`<label>Lead Status<select name="lead_status" required><option value="">Select status</option>${createStatuses.map(s=>`<option value="${esc(s.value)}">${esc(s.label)}</option>`).join('')}</select></label>`:'';
  const listId=`relation-results-${++relationListId}`;
  const relationField=`<section data-relation hidden><label><span data-relation-label></span><input name="relation_search" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${listId}" autocomplete="off" placeholder="Type to search CRM records…" maxlength="100"></label><input type="hidden" name="related_id"><div class="relation-results" id="${listId}" role="listbox" aria-label="Matching CRM records" data-relation-results hidden></div><div class="relation-status" role="status" data-relation-status>Type at least 2 characters to search.</div></section>`;
  const nameField=`<label>Name<input name="name" value="${esc(displayName||'')}" maxlength="255" required></label>`;
  const mobileField=`<label>Mobile ${isPhone?'':'<span class="muted">(optional)</span>'}<input name="mobile" type="tel" value="${isPhone?esc(value):''}" maxlength="30" ${isPhone?'required':''}></label>`;
  const ownerField=`<label>Owner<select name="owner_id" required><option value="">Select owner</option>${crmUsers.map(user=>`<option value="${esc(user.id)}" ${String(user.id)===currentOwnerId(crmUsers,context?.teammate)?'selected':''}>${esc(user.name)}</option>`).join('')}</select></label>`;
  const titleField='<label data-create-title hidden>Title<input name="title" maxlength="100" disabled></label>';
  const fields=module==='Leads'?typeField+statusField+nameField+mobileField+relationField+ownerField:typeField+relationField+nameField+mobileField+titleField+ownerField;
  return `<form class="create-form" data-create-form="${module}" data-module="${module}" data-email="${isPhone?'':esc(value)}" data-phone="${isPhone?esc(value):''}" hidden>${fields}<div class="create-submit"><button type="submit">Create ${module==='Leads'?'Lead':'Contact'}</button><button type="button" data-cancel>Cancel</button></div><span class="edit-error" role="alert"></span></form>`;
}
function recordCard(r,base){
  const moduleLabel=r.module==='Leads'?'Lead':'Contact';
  const isProvider=['warehouse','broker','carrier','forwarder'].includes(String(r.type||'').trim().toLowerCase());
  const providers=providerRecords(r.logistics_services);
  const nickname=(r.nicknames||[]).filter(Boolean).join(', ');
  const nicknameHtml=nickname?`<span class="badge badge-nickname">${esc(nickname)}</span>`:'';
  const providerHtml=providers.length?providers.map(p=>`<a href="${recordUrl(base,p.module,p.id)}">${esc(p.name)}</a>`).join(', '):esc(providerValue(r.logistics_services)||'—');
  const fifthRow=isProvider?`<div class="field-row nickname-inline"><span class="field-label">Provider</span>${r.module==='Contacts'?relationValueEditor(r,providerHtml,'Provider',true):`<span class="provider-links">${providerHtml}</span>`}${nicknameHtml}</div>`:`<div class="field-row"><span class="field-label">Owner</span>${ownerEditor(r)}</div>`;
  const status=leadStatuses[r.lead_status]||{label:r.lead_status,color:null};
  const statusStyle=/^#[0-9a-f]{6}$/i.test(status.color||'')?` style="background:${status.color}26;color:color-mix(in srgb, ${status.color} 65%, #6b7280)"`:'';
  const statusBadge=r.module==='Leads'&&r.lead_status&&r.lead_status!=='-None-'?`<span class="badge badge-status"${statusStyle}>${esc(status.label)}</span>`:'';
  const badges=`${r.type?`<span class="badge badge-type-${esc(r.type.toLowerCase().replace(/[^a-z0-9]+/g,'-'))}">${esc(r.type)}</span>`:'<span></span>'}<span class="record-kind"><span class="badge badge-${moduleLabel.toLowerCase()}">${moduleLabel}</span>${statusBadge}</span>`;
  let related='';
  if(r.related)related=`<div class="related ${r.related.module==='Vendors'?'nickname-inline':''}"><span class="field-label">${esc(r.related.label)}</span>${relationValueEditor(r,`<a href="${recordUrl(base,r.related.module,r.related.id)}">${esc(r.related.name)}</a>`,r.related.label)}${r.related.module==='Vendors'?nicknameHtml:''}</div>`;
  else if(['customer','supplier'].includes(String(r.type).toLowerCase())){const label=String(r.type).toLowerCase()==='customer'?'Account':'Vendor';related=`<div class="related"><span class="field-label">${label}</span>${relationValueEditor(r,'<span class="muted">Not linked</span>',label)}</div>`;}
  const titleRow=showRecordTitle(r)?`<div class="field-row"><span class="field-label">Title</span>${titleEditor(r)}</div>`:'';
  return `<article class="card"><div class="badges">${badges}</div><div class="field-row name-row"><span class="field-label">Name</span>${nameEditor(r,base)}</div><div class="record-emails"><span class="field-label">Email</span><span>${[...r.emails].map(esc).join('<br>')}</span></div><div class="field-row"><span class="field-label">Phone</span>${mobileEditor(r)}</div>${titleRow}${fifthRow}${related}</article>`;
}
function renderCards(){
  const grouped=new Map(), unmatched=[], errors=[];
  for(const person of participants){
    if(!recordsByEmail.has(participantKey(person)))continue;
    const rows=recordsByEmail.get(participantKey(person))||[];
    if(rows.error){errors.push({email:participantKey(person),error:rows.error});continue;}
    if(!rows.length){unmatched.push(participantKey(person));continue;}
    for(const record of rows){const key=`${record.module}:${record.id}`;if(!grouped.has(key))grouped.set(key,{...record,emails:new Set(recordEmails(record)),crmBase:rows.crmBase||'https://crm.zoho.com/crm/minmaxdeals/tab'});else for(const email of recordEmails(record))grouped.get(key).emails.add(email);if(person.email)grouped.get(key).emails.add(String(person.email).trim().toLowerCase());}
  }
  const all=sortRecords([...grouped.values()]);
  const filters=availableCategories(all,unmatched.length).map(type=>[type,type]);
  if(selectedFilter!=='All'&&!filters.some(([key])=>key===selectedFilter))selectedFilter='All';
  const controls=filters.length?`<nav class="filters" aria-label="Filter records"><button data-filter="All" class="${selectedFilter==='All'?'active':''}">All</button>${filters.map(([key,label])=>`<button data-filter="${esc(key)}" class="${selectedFilter===key?'active':''}">${esc(label)}</button>`).join('')}</nav>`:'';
  const visible=all.filter(filterMatches);
  const cards=visible.map(record=>recordCard(record,record.crmBase)).join('');
const missing=(selectedFilter==='All'||selectedFilter==='Unknown')?unmatched.map(value=>{const person=participants.find(p=>participantKey(p)===value);const phone=!!person?.phone;const displayName=phone&&person?.name===value?'':person?.name||'';return `<article class="card no-match"><div class="record-emails"><span class="field-label">${phone?'Phone':'Email'}</span><span>${esc(value)}</span></div><strong>No CRM record found</strong><p>No Lead or Contact matches this ${phone?'phone number':'email'}.</p><div class="create-actions"><button data-create="Leads">Create Lead</button><button data-create="Contacts">Create Contact</button></div>${createForm(value,'Leads',displayName,phone)}${createForm(value,'Contacts',displayName,phone)}</article>`;}).join(''):'';
  const failures=errors.map(item=>`<article class="card"><div class="record-emails"><span class="field-label">Email</span><span>${esc(item.email)}</span></div><div class="empty error">${esc(item.error)}</div></article>`).join('');
  const pending=participants.filter(p=>!recordsByEmail.has(participantKey(p))).length;
  const body=cards+missing+failures+(pending?'<div class="empty">Loading CRM records…</div>':'')||'<div class="empty">No records match this filter.</div>';
  $('sender').textContent=`${participants.length} participant${participants.length===1?'':'s'}`;
  $('content').innerHTML=controls+body;
}
async function lookupAll(){
  const current=++version;const people=[...participants];recordsByEmail=new Map();selectedFilter='All';renderCards();
  if(!connected){$('content').innerHTML='<div class="empty">Connect Zoho to see matching records.</div>';return;}
  const usersTask=api('users').then(data=>{if(current===version){crmUsers=data.users||[];renderCards();}}).catch(()=>{if(current===version)crmUsers=[];});
  await runLimited(people,3,async person=>{
    if(current!==version)return;
    try{const data=await api('lookup',person.phone?{phone:person.phone}:{email:person.email});if(current!==version)return;if(data.nickname_scope_missing){$('connect').hidden=false;$('connect').textContent='Reconnect Zoho';$('connection-status').innerHTML='<span class="status-dot is-connected"></span>Reconnect Zoho to read Logistics nicknames';}else if(data.nickname_unavailable){$('connection-status').textContent='Some nicknames could not be loaded. Refresh or check CRM permissions.';}const rows=data.records||[];rows.crmBase=data.crm_base;recordsByEmail.set(participantKey(person),rows);}
    catch(error){if(current!==version)return;const rows=[];rows.error=error.message;recordsByEmail.set(participantKey(person),rows);}
    if(current===version)renderCards();
  });
  await usersTask;
}
async function onContext(next,force=false){
  const key=next.type==='singleConversation'&&next.conversation?.id?JSON.stringify([ticket,next.teammate?.id,next.conversation.id]):'';
  context=next;
  // Front emits new context IDs when scrolling/loading messages; the stable
  // conversation ID, not context.id, determines whether data must be loaded.
  if(key&&!force&&key===activeConversationKey)return;
  const loadVersion=++contextLoadVersion;
  activeConversationKey=key;
  if(force&&key)conversationSnapshots.delete(key);
  const snapshot=!force&&key?conversationSnapshots.get(key):null;
  if(snapshot){version++;participants=structuredClone(snapshot.participants);recordsByEmail=structuredClone(snapshot.records);selectedFilter=snapshot.filter;renderCards();return;}
  context=next;const current=++version;participants=[];recordsByEmail=new Map();$('sender').textContent='';
  if(next.type!=='singleConversation'){renderEmpty();return;}
  $('content').innerHTML='<div class="empty">Loading conversation participants…</div>';
  try{
    let recipients=[],messages=[];
    if(completeHistoryEnabled)recipients=await loadConversationParticipants(next,api,force);
    else{let token;const visited=new Set();do{const page=await next.listRecipients(token);if(current!==version)return;recipients.push(...page.results.filter(Boolean));token=page.nextPageToken;if(token&&visited.has(token))throw new Error('Front repeated a participant page. Refresh the panel.');if(token)visited.add(token);}while(token);try{messages=(await next.listMessages()).results.filter(Boolean);}catch{}}
    if(current!==version)return;participants=mergeParticipants(recipients,messages);
    if(!participants.length){$('content').innerHTML='<div class="empty">No email addresses or phone numbers in this conversation.</div>';return;}
    await lookupAll();
    if(loadVersion===contextLoadVersion&&key&&key===activeConversationKey&&connected&&![...recordsByEmail.values()].some(rows=>rows.error)){
      if(conversationSnapshots.size>=20)conversationSnapshots.delete(conversationSnapshots.keys().next().value);
      conversationSnapshots.set(key,{participants:structuredClone(participants),records:structuredClone(recordsByEmail),filter:selectedFilter});
    }
  }catch(error){if(current===version){activeConversationKey='';$('content').innerHTML=`<div class="empty error">${esc(error.message)}</div>`;}}
}
$('refresh').onclick=async()=>{lookupCache.clear();await checkConnection();if(context)await onContext(context,true);else if(participants.length)await lookupAll();};
checkConnection().then(()=>{if(context)onContext(context,true);else renderEmpty();});
Front.contextUpdates.subscribe(onContext);
if(window.top===window.self)renderManual();
