// Front Sidebar 2.0 — orders and Blueprint controls, layered on the verified 1.9 app.
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
  const groups = [
    ['information','Information',null],
    ['sales_orders','SO','Sales Orders'],
    ['purchase_orders','PO','Purchase Orders'],
    ['shipments','Shipments','Shipments']
  ];
  const recordTypes = new Set(['Sales_Orders','Purchase_Orders','Shipments']);
  const supportedTypes = new Set(['picklist','text','textarea','multiline','email','phone','website','integer','double','currency','percent','date','datetime','boolean','checkbox']);
  const info = $('sender'), content = $('content'), main = content?.parentElement;
  if (!info || !content || !main) return;
  const navigation = document.createElement('nav');
  navigation.id = 'crm-order-tabs';
  navigation.className = 'crm-order-tabs';
  navigation.setAttribute('aria-label','Zoho CRM sections');
  const informationPane = document.createElement('section');
  informationPane.id = 'crm-information-pane';
  info.before(navigation);
  informationPane.append(info, content);
  navigation.after(informationPane);
  const ordersPane = document.createElement('section');
  ordersPane.id = 'crm-orders-pane';
  ordersPane.setAttribute('aria-live','polite');
  informationPane.after(ordersPane);
  let conversation = '', selected = 'information', loading = false, records = {}, errors = {}, loadId = 0;

  const getTicket = () => {
    try { return localStorage.getItem('minmax-zoho-session') || sessionStorage.getItem('minmax-zoho-session') || ''; }
    catch { return ''; }
  };
  async function api(action, params = {}, data = null) {
    const ticket = getTicket();
    if (!ticket) throw new Error('Connect Zoho in Information first.');
    const query = new URLSearchParams({action, conversation_id: conversation, ...params});
    const response = await fetch('zoho.php?' + query, {
      method: data === null ? 'GET' : 'POST',
      headers: {Authorization:'Bearer ' + ticket, ...(data === null ? {} : {'Content-Type':'application/json'})},
      body: data === null ? undefined : JSON.stringify(data),
      cache:'no-store'
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Zoho CRM request failed.');
    return body;
  }
  const total = key => (records[key] || []).length;
  function renderNavigation() {
    navigation.innerHTML = groups.filter(([key]) => key === 'information' || total(key) || errors[key]).map(([key,label]) => {
      const count = key === 'information' ? '' : errors[key] ? ' !' : ' ' + total(key);
      return '<button type="button" data-crm-tab="' + escapeHtml(key) + '" class="' + (selected === key ? 'active' : '') +
        '" aria-selected="' + (selected === key ? 'true' : 'false') + '">' + escapeHtml(label + count) + '</button>';
    }).join('');
  }
  function formatMoney(value) {
    if (value === null || value === undefined || value === '') return '—';
    const n = Number(value);
    return Number.isFinite(n) ? new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(n) : String(value);
  }
  function line(label,value) {
    return '<div class="field-row"><span class="field-label">' + escapeHtml(label) + '</span><span>' + escapeHtml(value ?? '—') + '</span></div>';
  }
  function recordCard(item) {
    const link = 'https://crm.zoho.com/crm/minmaxdeals/tab/' + encodeURIComponent(item.crm_tab) + '/' + encodeURIComponent(item.id);
    return '<article class="card crm-order-card" data-order-id="' + escapeHtml(item.id) + '" data-order-module="' + escapeHtml(item.module) + '">' +
      '<div class="crm-order-card-title"><a target="_blank" rel="noopener noreferrer" href="' + escapeHtml(link) + '">' + escapeHtml(item.name || item.id) + '</a>' +
      '<span class="badge badge-status">' + escapeHtml(item.status || '—') + '</span></div>' +
      line('Created',item.created ? item.created.slice(0,10) : '—') +
      (item.party ? line(item.module === 'Sales_Orders' ? 'Customer' : 'Supplier',item.party) : '') +
      (item.type ? line('Type',item.type) : '') +
      (item.total !== null && item.total !== undefined ? line('Total',formatMoney(item.total)) : '') +
      (item.quantity !== null && item.quantity !== undefined ? line('Qty',item.quantity) : '') +
      (item.owner ? line('Owner',item.owner) : '') +
      '<div class="crm-order-actions"><button type="button" data-blueprint>Blueprint actions</button></div>' +
      '<div class="crm-blueprint" hidden></div>' +
    '</article>';
  }
  function render() {
    if (selected !== 'information' && !total(selected) && !errors[selected]) selected = 'information';
    renderNavigation();
    informationPane.hidden = selected !== 'information';
    ordersPane.hidden = selected === 'information';
    if (ordersPane.hidden) return;
    if (loading) {ordersPane.innerHTML = '<div class="empty">Loading CRM orders…</div>';return;}
    if (errors[selected]) {
      const message = errors[selected] === 'reconnect' ? 'Reconnect Zoho in Information to grant permissions for these records.' : 'This CRM module could not be loaded. Refresh or check Zoho permissions.';
      ordersPane.innerHTML = '<div class="empty error">' + escapeHtml(message) + '</div>';
      return;
    }
    const rows = records[selected] || [];
    ordersPane.innerHTML = rows.length ? rows.map(recordCard).join('') : '<div class="empty">No linked records.</div>';
  }
  async function loadOrders(force = false) {
    const current = window.__minmaxFrontContext || {};
    const nextId = current.type === 'singleConversation' ? String(current.conversation_id || '') : '';
    if (!force && nextId === conversation) return;
    conversation = /^cnv_[a-z0-9]{5,40}$/i.test(nextId) ? nextId : '';
    const generation = ++loadId;
    selected = 'information'; records = {};errors = {};
    if (!conversation) {loading = false;render();return;}
    loading = true;render();
    try {
      const result = await api('conversation_records');
      if (generation !== loadId) return;
      records = result; errors = result.errors || {};
    } catch (error) {
      if (generation !== loadId) return;
      errors = {sales_orders:'unavailable',purchase_orders:'unavailable',shipments:'unavailable'};
      // Do not hide a backend failure as "no records".
      ordersPane.dataset.loadError = error.message;
    } finally {
      if (generation === loadId) {loading = false;render();}
    }
  }
  function fieldControl(field,value) {
    const label = escapeHtml(field.label || field.api_name), name = escapeHtml(field.api_name);
    const mandatory = field.mandatory ? ' required' : '';
    const current = value === null || value === undefined ? '' : String(value);
    if (field.data_type === 'picklist') {
      const options = (field.options || []).map(opt => '<option value="' + escapeHtml(opt.value) + '"' + (String(opt.value) === current ? ' selected' : '') + '>' + escapeHtml(opt.label) + '</option>').join('');
      return '<label>' + label + '<select name="' + name + '"' + mandatory + '><option value="">Select…</option>' + options + '</select></label>';
    }
    if (['boolean','checkbox'].includes(field.data_type))
      return '<label class="crm-checkbox"><input type="checkbox" name="' + name + '"' + (current === 'true' || current === '1' ? ' checked' : '') + '>' + label + '</label>';
    if (['textarea','multiline'].includes(field.data_type))
      return '<label>' + label + '<textarea name="' + name + '"' + mandatory + ' maxlength="2000">' + escapeHtml(current) + '</textarea></label>';
    let type = 'text';
    if (field.data_type === 'date') type = 'date';
    else if (field.data_type === 'datetime') type = 'datetime-local';
    else if (field.data_type === 'email') type = 'email';
    else if (['integer','double','currency','percent'].includes(field.data_type)) type = 'number';
    const step = type === 'number' ? ' step="' + (field.data_type === 'integer' ? '1' : 'any') + '"' : '';
    return '<label>' + label + '<input type="' + type + '" name="' + name + '" value="' + escapeHtml(current) + '"' + step + mandatory + ' maxlength="2000"></label>';
  }
  function transitionPanel(transition) {
    const allowed = transition.available && transition.supported && (transition.fields || []).every(f => f.kind === 'fields' && supportedTypes.has(f.data_type));
    if (!transition.available) return '';
    if (!allowed) return '<div class="crm-transition"><strong>' + escapeHtml(transition.name) + '</strong><p>Additional Zoho fields or widgets required. Open this record in CRM.</p></div>';
    const inputs = (transition.fields || []).map(f => fieldControl(f, Object.prototype.hasOwnProperty.call(transition.values || {}, f.api_name) ? transition.values[f.api_name] : f.content)).join('');
    const danger = /cancel|delete|reject|void/i.test(transition.name);
    return '<form class="crm-transition" data-blueprint-submit data-transition-id="' + escapeHtml(transition.id) + '" data-transition-name="' + escapeHtml(transition.name) + '">' +
      '<strong>' + escapeHtml(transition.name) + '</strong>' + inputs +
      '<div class="crm-transition-controls"><button type="submit"' + (danger ? ' class="crm-danger"' : '') + '>Apply ' + escapeHtml(transition.name) + '</button></div>' +
      '<span class="edit-error" role="alert"></span></form>';
  }
  navigation.addEventListener('click',event => {
    const button = event.target.closest('[data-crm-tab]');if (!button) return;
    selected = button.dataset.crmTab;render();
  });
  ordersPane.addEventListener('click', async event => {
    const button = event.target.closest('[data-blueprint]');if (!button) return;
    const card = button.closest('[data-order-id]');
    const panel = card.querySelector('.crm-blueprint');
    if (!panel.hidden) {panel.hidden = true;return;}
    panel.hidden = false;panel.innerHTML = '<div class="empty">Loading transitions…</div>';
    const atConversation = conversation;
    try {
      const response = await api('record_blueprint',{module:card.dataset.orderModule,id:card.dataset.orderId});
      if (conversation !== atConversation) return;
      const options = (response.transitions || []).map(transitionPanel).join('');
      panel.innerHTML = options || '<div class="empty">No available manual Blueprint transitions.</div>';
    } catch (error) {if (conversation === atConversation) panel.innerHTML = '<div class="empty error">' + escapeHtml(error.message) + '</div>';}
  });
  ordersPane.addEventListener('submit',async event => {
    const form = event.target.closest('[data-blueprint-submit]');if(!form)return;
    event.preventDefault();
    const card = form.closest('[data-order-id]');
    const name = form.dataset.transitionName;
    if (!window.confirm('Apply Zoho Blueprint transition "' + name + '"? CRM automation may run.')) return;
    const fields = {};
    for (const element of form.querySelectorAll('[name]')) fields[element.name] = element.type === 'checkbox' ? element.checked : element.value;
    const button = form.querySelector('button[type=submit]'),message = form.querySelector('.edit-error');
    button.disabled = true; message.textContent = '';
    const atConversation = conversation;
    try {
      const result = await api('blueprint_transition',{module:card.dataset.orderModule,id:card.dataset.orderId},{transition_id:form.dataset.transitionId,data:fields});
      if (conversation !== atConversation) return;
      message.textContent = 'Updated: ' + (result.record?.status || 'success');
      await loadOrders(true);
    } catch (error) {message.textContent = error.message; button.disabled = false;}
  });
  $('refresh')?.addEventListener('click', () => {void loadOrders(true);});
  window.addEventListener('minmax-front-context', () => {void loadOrders();});
  // The original app may emit context before this companion script loads.
  void loadOrders(true);
})();