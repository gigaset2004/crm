// Front Sidebar 2.0 — orders and Blueprint controls, layered on the verified 1.9 app.
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
  const groups = [
    ['information','Information',null],
    ['sales_orders','SO','Sales Orders'],
    ['purchase_orders','PO','Purchase Orders'],
    ['shipments','Shipment','Shipments']
  ];
  // Picklist colors read from Zoho Shipments metadata, not guessed theme colors.
  const shipmentTypeColors = {
    'Inbound':'#67c480', 'Dropship':'#af38fa', 'Outbound':'#f27e22', 'Direct Shipment':'#168aef'
  };
  const safeColor = value => /^#[0-9a-f]{6}$/i.test(String(value || '')) ? value : '';
  const readableColor = color => {
    const raw = safeColor(color); if (!raw) return '#293955';
    const parts = [1,3,5].map(i => parseInt(raw.slice(i,i+2),16)/255);
    const luminance = parts.map(c => c <= .04045 ? c/12.92 : Math.pow((c+.055)/1.055,2.4));
    return luminance[0]*.2126 + luminance[1]*.7152 + luminance[2]*.0722 > .45 ? '#20242c' : '#ffffff';
  };
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
  let users = [], usersReady = false;
  const blueprintCache = new Map();

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
      return '<button type="button" data-crm-tab="' + escapeHtml(key) + '" class="' + (selected === key ? 'active' : '') +
        '" aria-selected="' + (selected === key ? 'true' : 'false') + '">' + escapeHtml(label) + '</button>';
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
  function findOrder(card) {
    const group = Object.values(records).find(value => Array.isArray(value) && value.some(row => row.id === card.dataset.orderId && row.module === card.dataset.orderModule));
    return group?.find(row => row.id === card.dataset.orderId && row.module === card.dataset.orderModule);
  }
  function ownerRow(item) {
    const current = users.find(user => String(user.id) === String(item.owner_id));
    const shown = current?.name || item.owner || '—';
    const valid = users.length > 0 && item.owner_id;
    if (!valid) return line('Owner',shown);
    const options = users.map(user => '<option value="' + escapeHtml(user.id) + '"' + (String(user.id) === String(item.owner_id) ? ' selected' : '') + '>' + escapeHtml(user.name) + '</option>').join('');
    const hasCurrent = users.some(user => String(user.id) === String(item.owner_id));
    const fallback = hasCurrent ? '' : '<option selected value="' + escapeHtml(item.owner_id) + '">' + escapeHtml(shown) + '</option>';
    return '<div class="field-row crm-owner-row"><span class="field-label">Owner</span><div class="editable-field owner-editor"><select class="owner-select crm-order-owner" aria-label="Record owner" data-owner-id="' + escapeHtml(item.owner_id) + '">' + fallback + options + '</select><span class="edit-error" role="alert"></span></div></div>';
  }
  function recordCard(item) {
    const link = 'https://crm.zoho.com/crm/minmaxdeals/tab/' + encodeURIComponent(item.crm_tab) + '/' + encodeURIComponent(item.id);
    const isShipment = item.module === 'Shipments';
    const color = shipmentTypeColors[item.type];
    const typeTag = isShipment && item.type ? '<span class="badge crm-shipment-type" style="' +
      (safeColor(color) ? 'background:' + color + ';color:' + readableColor(color) : '') + '">' + escapeHtml(item.type) + '</span>' : '';
    const statusTag = '<span class="badge badge-status">' + escapeHtml(item.status || '—') + '</span>';
    return '<article class="card crm-order-card" data-order-id="' + escapeHtml(item.id) + '" data-order-module="' + escapeHtml(item.module) + '">' +
      '<div class="crm-order-card-title"><a target="_blank" rel="noopener noreferrer" href="' + escapeHtml(link) + '">' + escapeHtml(item.name || item.id) + '</a>' +
      '<div class="crm-order-badges">' + statusTag + typeTag + '</div></div>' +
      line('Created',item.created ? item.created.slice(0,10) : '—') +
      (item.party ? line(item.module === 'Sales_Orders' ? 'Customer' : 'Supplier',item.party) : '') +
      (item.total !== null && item.total !== undefined ? line('Total',formatMoney(item.total)) : '') +
      (item.quantity !== null && item.quantity !== undefined ? line('Qty',item.quantity) : '') +
      ownerRow(item) +
      '<div class="crm-order-actions create-actions" aria-label="Blueprint transitions"><span class="muted">Loading transitions…</span></div>' +
      '<div class="crm-blueprint" hidden></div>' +
    '</article>';
  }
  function render() {
    if (!loading && selected !== 'information' && !total(selected) && !errors[selected]) selected = 'information';
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
    if (rows.length) for (const card of ordersPane.querySelectorAll('.crm-order-card')) void loadBlueprintButtons(card);
  }
  async function loadOrders(force = false) {
    const current = window.__minmaxFrontContext || {};
    const nextId = current.type === 'singleConversation' ? String(current.conversation_id || '') : '';
    if (!force && nextId === conversation) return;
    const previousConversation = conversation;
    conversation = /^cnv_[a-z0-9]{5,40}$/i.test(nextId) ? nextId : '';
    const generation = ++loadId;
    if (conversation !== previousConversation) selected = 'information';
    records = {};errors = {};
    blueprintCache.clear();
    if (!conversation) {loading = false;render();return;}
    loading = true;render();
    try {
      const result = await api('conversation_records');
      if (generation !== loadId) return;
      records = result; errors = result.errors || {};
      if (!usersReady) {
        try {
          const roster = await api('users');
          if (generation !== loadId) return;
          users = (roster.users || []).filter(user => user.id && user.name);
          usersReady = true;
        } catch { users = []; }
      }
      if (Object.values(errors).includes('reconnect')) {
        const connect = $('connect');
        if (connect) {connect.hidden = false; connect.textContent = 'Reconnect Zoho';}
      }
    } catch (error) {
      if (generation !== loadId) return;
      errors = {sales_orders:'unavailable',purchase_orders:'unavailable',shipments:'unavailable'};
      // Do not hide a backend failure as "no records".
      ordersPane.dataset.loadError = error.message;
    } finally {
      if (generation === loadId) {loading = false;render();}
    }
  }
  // Only server-verified field transitions execute here; custom widgets stay in Zoho.
  const supportedTypes = new Set(['picklist','text','textarea','multiline','email','phone','website','integer','double','currency','percent','date','datetime','boolean','checkbox']);
  function fieldControl(field, value) {
    const label = escapeHtml(field.label || field.api_name), name = escapeHtml(field.api_name);
    const required = field.mandatory ? ' required' : '';
    const current = value === null || value === undefined ? '' : String(value);
    if (field.data_type === 'picklist') {
      const options = (field.options || []).map(opt => '<option value="' + escapeHtml(opt.value) + '"' + (String(opt.value) === current ? ' selected' : '') + '>' + escapeHtml(opt.label) + '</option>').join('');
      return '<label>' + label + '<select name="' + name + '"' + required + '><option value="">Select…</option>' + options + '</select></label>';
    }
    if (field.data_type === 'boolean' || field.data_type === 'checkbox')
      return '<label class="crm-checkbox"><input type="checkbox" name="' + name + '"' + (current === 'true' || current === '1' ? ' checked' : '') + '> ' + label + '</label>';
    if (field.data_type === 'textarea' || field.data_type === 'multiline')
      return '<label>' + label + '<textarea name="' + name + '" maxlength="2000"' + required + '>' + escapeHtml(current) + '</textarea></label>';
    let type = 'text';
    if (field.data_type === 'date') type = 'date';
    else if (field.data_type === 'datetime') type = 'datetime-local';
    else if (field.data_type === 'email') type = 'email';
    else if (field.data_type === 'integer' || field.data_type === 'double' || field.data_type === 'currency' || field.data_type === 'percent') type = 'number';
    const step = type === 'number' ? ' step="' + (field.data_type === 'integer' ? '1' : 'any') + '"' : '';
    const inputValue = type === 'datetime-local' ? current.slice(0,16) : current;
    return '<label>' + label + '<input type="' + type + '" name="' + name + '" value="' + escapeHtml(inputValue) + '"' + step + required + ' maxlength="2000"></label>';
  }
  function inlineBlueprintForm(transition) {
    if (transition.mode !== 'inline' || !transition.supported || (transition.fields || []).some(f => f.kind !== 'fields' || !supportedTypes.has(f.data_type)))
      return '<div class="empty error">This transition must be completed in Zoho CRM.</div>';
    const fields = (transition.fields || []).map(f => fieldControl(f, Object.prototype.hasOwnProperty.call(transition.values || {}, f.api_name) ? transition.values[f.api_name] : f.content)).join('');
    const notes = (transition.messages || []).map(v => '<p class="crm-blueprint-note">' + escapeHtml(v) + '</p>').join('');
    return '<form class="crm-transition create-form" data-blueprint-submit data-transition-id="' + escapeHtml(transition.id) +
      '" data-transition-name="' + escapeHtml(transition.name) + '">' +
      '<strong>' + escapeHtml(transition.name) + '</strong>' + notes + fields +
      (notes || fields ? '' : '<p class="crm-blueprint-note">No additional fields are required.</p>') +
      '<div class="create-submit"><button type="submit">Save</button><button type="button" data-blueprint-cancel>Cancel</button></div>' +
      '<span class="edit-error" role="alert"></span></form>';
  }
  function blueprintKey(item) { return item.module + ':' + item.id; }
  async function loadBlueprintButtons(card) {
    const item = findOrder(card); if (!item) return;
    const key = blueprintKey(item);
    const targetConversation = conversation;
    const footer = card.querySelector('.crm-order-actions');
    try {
      if (!blueprintCache.has(key)) {
        const pending = api('record_blueprint',{module:item.module,id:item.id})
          .then(data => {
            if (data.needs_reconnect) {
              const connect = $('connect');
              if (connect) { connect.hidden = false; connect.textContent = 'Reconnect Zoho'; }
            }
            return (data.transitions || []).filter(t => t.available).sort((a,b) => (a.sequence ?? 9999) - (b.sequence ?? 9999));
          })
          .catch(error => {blueprintCache.delete(key); throw error;});
        blueprintCache.set(key,pending);
      }
      const transitions = await blueprintCache.get(key);
      if (conversation !== targetConversation || !card.isConnected) return;
      footer.innerHTML = transitions.length ? transitions.map(transition => {
        const color = safeColor(transition.color);
        const foreground = safeColor(transition.text_color) || readableColor(color);
        const style = color ? ' style="background:' + color + ';border-color:' + color + ';color:' + foreground + '"' : '';
        const canInline = transition.mode === 'inline' && transition.supported;
        if (canInline) {
          return '<button type="button" class="crm-transition-button" data-blueprint-inline="' + escapeHtml(transition.id) +
            '" title="Complete ' + escapeHtml(transition.name) + ' in Front"' + style + '>' + escapeHtml(transition.name) + '</button>';
        }
        const recordUrl = 'https://crm.zoho.com/crm/minmaxdeals/tab/' + encodeURIComponent(item.crm_tab) + '/' + encodeURIComponent(item.id);
        return '<a class="crm-transition-button" data-blueprint-link data-blueprint-name="' + escapeHtml(transition.name) +
          '" title="' + escapeHtml(transition.mode_reason || 'This transition requires Zoho CRM') + '" href="' + escapeHtml(recordUrl) +
          '" target="_blank" rel="noopener noreferrer"' + style + '>' + escapeHtml(transition.name) + '</a>';
      }).join('') : '<span class="muted">No available transitions</span>';
    } catch (error) {
      if (conversation === targetConversation && card.isConnected) footer.innerHTML = '<span class="edit-error">Could not load transitions. Refresh the panel.</span>';
    }
  }
  navigation.addEventListener('click',event => {
    const button = event.target.closest('[data-crm-tab]');if (!button) return;
    selected = button.dataset.crmTab;render();
  });
  ordersPane.addEventListener('click', async event => {
    const cancel = event.target.closest('[data-blueprint-cancel]');
    if (cancel) {
      const panel = cancel.closest('.crm-blueprint');
      if (panel) {panel.hidden = true;panel.innerHTML = '';}
      return;
    }
    const inline = event.target.closest('[data-blueprint-inline]');
    if (inline) {
      const card = inline.closest('[data-order-id]'), item = findOrder(card);
      if (!card || !item) return;
      const panel = card.querySelector('.crm-blueprint');
      if (!panel.hidden && panel.dataset.transitionId === inline.dataset.blueprintInline) {
        panel.hidden = true;panel.innerHTML = '';return;
      }
      const transitions = await blueprintCache.get(blueprintKey(item)) || [];
      if (!card.isConnected) return;
      const transition = transitions.find(t => String(t.id) === inline.dataset.blueprintInline);
      panel.dataset.transitionId = inline.dataset.blueprintInline;
      panel.innerHTML = transition ? inlineBlueprintForm(transition) : '<div class="empty error">Transition unavailable. Refresh the panel.</div>';
      panel.hidden = false;
      panel.querySelector('input:not([type="hidden"]),select,textarea')?.focus();
      return;
    }
    const link = event.target.closest('a[data-blueprint-link]');
    if (!link) return;
    // Native Zoho widgets and complex transitions must run in CRM.
    if (typeof window.__minmaxOpenCrmUrl === 'function') {
      event.preventDefault();
      try { await window.__minmaxOpenCrmUrl(link.href); }
      catch {
        const notice = link.closest('.crm-order-actions');
        if (notice) {
          const message = document.createElement('span');
          message.className = 'crm-open-warning';
          message.textContent = 'Could not open CRM automatically. Use the record name link above.';
          notice.append(message);
        }
      }
    }
  });
  ordersPane.addEventListener('change',async event => {
    const select = event.target.closest('.crm-order-owner');if (!select) return;
    const card = select.closest('[data-order-id]'), item = findOrder(card);
    if (!item) return;
    const originalId = String(item.owner_id || '');
    const nextId = select.value;
    if (originalId === nextId) return;
    select.disabled = true;
    const error = select.parentElement.querySelector('.edit-error');
    error.textContent = '';
    const currentConversation = conversation;
    try {
      const response = await api('record_owner_update',{module:item.module,id:item.id},{
        owner_id:nextId, expected_owner_id:originalId
      });
      if (conversation !== currentConversation) return;
      Object.assign(item,response.record);
      // Existing user list gives the same First Last display as Information.
      const matched = users.find(user => String(user.id) === String(item.owner_id));
      if (matched) item.owner = matched.name;
      render();
    } catch (problem) {
      select.value = originalId;
      error.textContent = problem.message;
      select.disabled = false;
    }
  });
  ordersPane.addEventListener('submit', async event => {
    const form = event.target.closest('[data-blueprint-submit]');
    if (!form) return;
    event.preventDefault();
    const card = form.closest('[data-order-id]');
    if (!card) return;
    const transitionName = form.dataset.transitionName;
    if (!window.confirm('Apply Zoho Blueprint transition "' + transitionName + '"? CRM automation may run.')) return;
    const values = {};
    for (const element of form.querySelectorAll('[name]'))
      values[element.name] = element.type === 'checkbox' ? element.checked : element.value;
    const save = form.querySelector('button[type="submit"]'), message = form.querySelector('.edit-error');
    const atConversation = conversation;
    save.disabled = true;
    message.textContent = '';
    try {
      await api('blueprint_transition', {module:card.dataset.orderModule,id:card.dataset.orderId},
        {transition_id:form.dataset.transitionId,data:values});
      if (conversation !== atConversation) return;
      await loadOrders(true);
    } catch (error) {
      if (conversation !== atConversation) return;
      message.textContent = error.message;
      save.disabled = false;
    }
  });
  $('refresh')?.addEventListener('click', () => {void loadOrders(true);});
  window.addEventListener('minmax-front-context', () => {void loadOrders();});
  // The original app may emit context before this companion script loads.
  void loadOrders(true);
})();