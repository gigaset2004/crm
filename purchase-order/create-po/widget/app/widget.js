/* MinMaxDeals Procurement Widget v1.9.22 — CRM links, compact columns, visible copy/paste price buttons; Deluge unchanged. */
'use strict';

const STATE = {
  items: [],
  selected: new Set(),
  costs: new Map(),
  copiedUnitCost: '',
  brandRecordIds: new Map(),
  brandLookups: new Map(),
  poQty: new Map(),
  supplierCodes: [],
  ownerNames: {'4888374000000337001':'Andrew Stetsenko'},
  currentUserId: '',
  createdPoNotifications: [],
  collapsedSO: new Set(),
  savingSupplier: new Set(),
  busy: false,
  ready: false,
  more: true,
  offset: 0,
  batchSize: 200,
  maxRows: 2000,
  lockedAfterPartial: false,
  viewMode: 'grouped',
  targetMode: 'new',
  existingPOs: [],
  launchSoId: '',
  focusedSoId: '',
  focusLoading: false,
  splitItemId: '',
  reconciledSO: new Set()
};
const FUNCTION_API_NAME = 'procurement_create_po';
const APPEND_FUNCTION_API_NAME = 'procurement_add_to_existing_po';
const LIST_EXISTING_PO_FUNCTION = 'procurement_get_existing_pos';
const ELIGIBLE_PO_STATUSES = new Set(['Created','Requested','Confirmed','Deposit paid','Partially Paid']);
const FETCH_FUNCTION_API_NAME = 'procurement_get_demand';
const SUPPLIER_CODES_FUNCTION = 'procurement_get_supplier_codes';
const ASSIGN_SUPPLIER_FUNCTION = 'procurement_assign_supplier';
const $ = (id) => document.getElementById(id);
const fmtNumber = (value) => Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
const fmtMoney = (value) => Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function getStatus(item) {
  return String(item['Parent_Id.Accounting_status'] || item.Accounting_status || '').trim();
}
function isReady(item) {
  return ['Deposit paid', 'Paid'].includes(getStatus(item));
}
function getCode(item) { return item.Supplier?.name || ''; }
function isSelectable(item) {
  return Boolean(!item.Purchase_Order && Number(item.Quantity) > 0);
}
function isEligible(item) {
  return Boolean(item.Supplier?.id && isSelectable(item));
}
function showAlert(message, type = '') {
  const el = $('alertBox');
  el.textContent = String(message || '');
  el.className = 'alert' + (type ? ' ' + type : '');
  if (!message) el.classList.add('hidden');
}
function setBusy(busy) {
  STATE.busy = busy;
  $('refreshBtn').disabled = busy;
  $('createPoBtn').disabled = busy || STATE.selected.size === 0 || STATE.lockedAfterPartial;
  $('existingPoBtn').disabled = busy || STATE.selected.size === 0 || STATE.lockedAfterPartial;
  $('loadMoreBtn').disabled = busy;
  $('confirmCreateBtn').disabled = busy;
  $('confirmCreateBtn').textContent = busy ? 'Saving PO…' : (STATE.targetMode === 'existing' ? 'Confirm & add items' : 'Confirm & create PO');
}
function connection(status, label) {
  const el = $('connectionStatus');
  el.className = 'status' + (status ? ' ' + status : '');
  el.lastChild.textContent = label;
}
function openRecord(module, id) {
  try {
    ZOHO.CRM.UI.Record.open({ Entity: module, RecordID: String(id), Target: '_blank' }).catch((error) => console.error('Record open:', error));
  } catch (error) {
    console.error('Record open:', error);
  }
}
// SO lines store Brand as text, so Brand must be resolved to a CRM record ID on click.
// Cache only successful exact-name matches and never link to an unrelated brand.
async function openBrandRecord(item, sourceButton) {
  const raw=item.Brand;
  const name=String(typeof raw==='string' ? raw : raw?.name || raw?.Name || '').trim();
  if (!name) return;
  const key=name.toLocaleLowerCase();
  const directId=String(raw?.id || item.Brand_Id || item.Product_Name?.Brand?.id || '');
  let brandId=directId || STATE.brandRecordIds.get(key) || '';
  if (!brandId) {
    if (!window.ZOHO?.CRM?.API?.searchRecord) {
      showAlert('CRM brand lookup is unavailable. Open the widget inside Zoho CRM.', 'error');
      return;
    }
    if (sourceButton) sourceButton.disabled=true;
    try {
      // Deduplicate overlapping user clicks without querying the entire Brands module.
      if (!STATE.brandLookups.has(key)) {
        const lookup=ZOHO.CRM.API.searchRecord({ Entity:'Brands', Type:'word', Query:name })
          .then(response => {
            const list=response?.data?.data || response?.data || [];
            if (!Array.isArray(list)) throw new Error('Invalid Brands lookup response');
            const exact=list.filter(rec => String(rec?.Name || rec?.name || '').trim().toLocaleLowerCase()===key && rec?.id);
            if (exact.length!==1) throw new Error(exact.length>1?'More than one matching Brand found':'No matching Brand record found');
            return String(exact[0].id);
          });
        STATE.brandLookups.set(key,lookup);
      }
      brandId=await STATE.brandLookups.get(key);
      STATE.brandRecordIds.set(key,brandId);
    } catch (error) {
      STATE.brandLookups.delete(key);
      showAlert('Could not open Brand '+name+': '+String(error?.message || error)+'. Check Brands access.','error');
      return;
    } finally {
      if(sourceButton)sourceButton.disabled=false;
    }
  }
  openRecord('Brands',brandId);
}
// The Sales Orders record button opens this Web Tab with the SO ID. The list-view
// button passes no ID. Zoho can deliver web-tab launch data through PageLoad or
// the URL; both forms are supported without relying on cross-origin parent access.
const SO_ID_PATTERN = /^\d{15,20}$/;
function normalizeSoId(value) {
  if (Array.isArray(value)) return normalizeSoId(value[0]);
  if (value && typeof value === 'object') return normalizeSoId(value.id ?? value.Id ?? value.ID ?? value.EntityId ?? value.RecordID);
  const id = String(value ?? '').trim();
  return SO_ID_PATTERN.test(id) ? id : '';
}
function launchIdFromUrl(value, allowRecordPath = false) {
  if (!value) return '';
  try {
    const url = new URL(value, window.location.href);
    for (const key of ['soId', 'salesOrderId', 'sales_order_id', 'recordId']) {
      const id = normalizeSoId(url.searchParams.get(key));
      if (id) return id;
    }
    // Zoho sometimes supplies the resource URL nested within a query string.
    for (const key of ['url', 'open_url', 'redirect', 'resource']) {
      const nested = url.searchParams.get(key);
      if (nested && nested !== value) {
        const nestedId = launchIdFromUrl(nested);
        if (nestedId) return nestedId;
      }
    }
    const fragment = url.hash.includes('?') ? url.hash.substring(url.hash.indexOf('?') + 1) : url.hash.replace(/^#/, '');
    const hashParams = new URLSearchParams(fragment);
    for (const key of ['soId', 'salesOrderId', 'sales_order_id', 'recordId']) {
      const id = normalizeSoId(hashParams.get(key));
      if (id) return id;
    }
    // The source-record URL can be preserved as the iframe referrer, while
    // Zoho may not forward the Web Tab query string to the widget iframe.
    if (allowRecordPath && /(^|\.)zoho\.com$/i.test(url.hostname)) {
      const match = url.pathname.match(/\/tab\/SalesOrders\/(\d{15,20})(?:\/|$)/i);
      if (match) return match[1];
    }
  } catch (error) { console.warn('[Procurement] Invalid launch URL', error); }
  return '';
}
function resolveLaunchSoId(payload) {
  if (!payload) return '';
  if (typeof payload === 'string') {
    const fromUrl = launchIdFromUrl(payload);
    if (fromUrl) return fromUrl;
    if ((payload.startsWith('{') || payload.startsWith('[')) && payload.length < 5000) {
      try { return resolveLaunchSoId(JSON.parse(payload)); } catch (_) { /* Not JSON. */ }
    }
    return '';
  }
  if (Array.isArray(payload)) {
    for (const entry of payload) {
      const id = resolveLaunchSoId(entry);
      if (id) return id;
    }
    return '';
  }
  if (typeof payload !== 'object') return '';
  const entity = String(payload.Entity || payload.entity || payload.module || payload.Module || '').replace(/[_\s]/g, '').toLowerCase();
  if (entity === 'salesorders' || entity === 'webtab9' || entity === 'webtab9widget') {
    const entityId = normalizeSoId(payload.EntityId || payload.entityId || payload.RecordID || payload.record_id || payload.id);
    // WebTab ID is not a Sales Order ID; do not select anything for plain-tab launch.
    if (entityId && entityId !== '4888374000129998108') return entityId;
  }
  for (const key of ['soId', 'salesOrderId', 'sales_order_id']) {
    const id = normalizeSoId(payload[key]);
    if (id) return id;
  }
  for (const key of ['url', 'URL', 'url_expression', 'webTabUrl', 'pageUrl']) {
    const id = launchIdFromUrl(payload[key]);
    if (id) return id;
  }
  for (const key of ['Message', 'message', 'data', 'Data', 'params', 'Params', 'navigation_data', 'navigationData', 'custom_data', 'context', 'arguments', 'payload']) {
    const id = resolveLaunchSoId(payload[key]);
    if (id) return id;
  }
  return '';
}
function getLaunchSoId() {
  // Prefer the widget's own URL. Referrer is a fallback for Zoho Web Tabs.
  const widgetId = launchIdFromUrl(window.location.href);
  if (widgetId) return widgetId;
  const referrerId = launchIdFromUrl(document.referrer, true);
  if (referrerId) return referrerId;
  try { // Usually inaccessible because Zoho widgets use a different origin.
    if (window.top && window.top !== window) return launchIdFromUrl(window.top.location.href, true);
  } catch (_) { /* Standard cross-origin iframe restriction. */ }
  return '';
}
async function loadFocusedSO(soId) {
  if (!SO_ID_PATTERN.test(String(soId || '')) || !STATE.ready || STATE.focusLoading) return;
  STATE.focusLoading = true;
  setBusy(true);
  showAlert('');
  $('loadCounter').textContent = 'Loading selected Sales Order…';
  try {
    if (!window.ZOHO?.CRM?.API?.getRecord) throw new Error('Zoho CRM record lookup unavailable.');
    const response = await ZOHO.CRM.API.getRecord({ Entity:'Sales_Orders', RecordID:String(soId) });
    const so = response?.data?.[0] || response?.data?.data?.[0];
    if (!so || String(so.id) !== String(soId)) throw new Error('Sales Order not found or access denied.');
    if (!Array.isArray(so.Ordered_Items)) throw new Error('Ordered_Items were not returned by Zoho CRM.');
    const alreadyLinked = so.Ordered_Items.filter(line => line && line.id && line.Purchase_Order);
    const linkedPOs = [...new Set(alreadyLinked.map(line => String(line.Purchase_Order?.name || line.Purchase_Order?.id || 'an existing PO')))];
    const pending = so.Ordered_Items.filter(line => line && line.id && !line.Purchase_Order && Number(line.Quantity) > 0);
    const normalized = pending.map(line => normalizeItem({
      ...line,
      Parent_Id: { id: String(so.id), name: String(so.Subject || so.id) },
      'Parent_Id.Subject': String(so.Subject || so.id),
      'Parent_Id.Accounting_status': so.Accounting_status || '',
      'Parent_Id.Status': so.Status || '',
      'Parent_Id.Owner': so.Owner || null,
      'Parent_Id.Account_Name': so.Account_Name || null
    }));
    STATE.items = normalized;
    STATE.selected.clear();
    STATE.costs.clear();
    STATE.poQty.clear();
    STATE.collapsedSO.clear();
    STATE.offset = normalized.length;
    STATE.more = false;
    STATE.focusedSoId = String(soId);
    STATE.lockedAfterPartial = false;
    for (const item of normalized.slice(0,60)) STATE.selected.add(item.id);
    $('searchInput').value = '';
    $('statusFilter').value = 'all';
    $('supplierFilter').value = '';
    $('clientFilter').value = '';
    $('soFilter').value = '';
    connection('connected','Zoho CRM connected');
    render();
    if (normalized.length) {
      $('soFilter').value = String(soId);
      render();
      const suppliers = new Set(normalized.filter(item => item.Supplier?.id).map(item => String(item.Supplier.id)));
      const messages = ['SO ' + String(so.Subject || soId) + ': selected ' + STATE.selected.size + ' of ' + normalized.length + ' unassigned-to-PO lines.'];
      if (alreadyLinked.length) messages.push(alreadyLinked.length + ' other line(s) already assigned to ' + linkedPOs.join(', ') + ' were skipped.');
      if (normalized.length > 60) messages.push('Only the first 60 can be selected at once; create another PO for the remaining lines.');
      if (suppliers.size > 1) messages.push('Multiple suppliers: deselect other suppliers before creating one PO.');
      if (normalized.some(item => !item.Supplier?.id)) messages.push('Assign Supplier Code to rows missing a supplier before creating a PO.');
      showAlert(messages.join(' '), suppliers.size > 1 || normalized.length > 60 ? 'warning' : '');
    } else {
      const detail = alreadyLinked.length
        ? alreadyLinked.length + ' item(s) already assigned to ' + linkedPOs.join(', ') + '. These cannot be selected again.'
        : 'This Sales Order has no product lines with an unassigned positive quantity.';
      showAlert('SO ' + String(so.Subject || soId) + ': 0 items available to create a PO. ' + detail, 'warning');
    }
  } catch (error) {
    console.warn('[Procurement] Direct SO lookup failed, checking the pending-demand list', error);
    // Fallback: the server's existing demand function can still expose rows if
    // the SDK does not return the Ordered_Items subform for this user's role.
    STATE.focusLoading = false;
    setBusy(false);
    await loadData(true);
    let pending = STATE.items.filter(item => getOrderId(item) === String(soId) && isSelectable(item));
    while (!pending.length && STATE.more && STATE.offset < STATE.maxRows) {
      await loadData(false);
      pending = STATE.items.filter(item => getOrderId(item) === String(soId) && isSelectable(item));
    }
    if (pending.length) {
      STATE.items = pending;
      STATE.selected = new Set(pending.slice(0,60).map(item => item.id));
      STATE.more = false;
      STATE.focusedSoId = String(soId);
      STATE.collapsedSO.clear();
      $('searchInput').value = '';
      $('supplierFilter').value = '';
      $('clientFilter').value = '';
      $('statusFilter').value = 'all';
      render();
      $('soFilter').value = String(soId);
      render();
      const suppliers = new Set(pending.filter(item => item.Supplier?.id).map(item => String(item.Supplier.id)));
      let note = 'SO ' + getOrderName(pending[0]) + ': selected ' + STATE.selected.size + ' pending items.';
      if (pending.length > 60) note += ' The first 60 lines are selected.';
      if (suppliers.size > 1) note += ' Multiple suppliers: keep one supplier per PO.';
      showAlert(note);
    } else {
      STATE.items = [];
      STATE.selected.clear();
      STATE.more = false;
      STATE.focusedSoId = String(soId);
      render();
      showAlert('SO ' + soId + ': no unassigned items could be loaded. Confirm that its Ordered Items are present and are not already linked to a PO. No items were selected.', 'error');
    }
    return;
  } finally {
    STATE.focusLoading = false;
    setBusy(false);
    render();
  }
}
function onWidgetPageLoad(data) {
  const id = resolveLaunchSoId(data);
  if (!id || id === STATE.launchSoId) return;
  STATE.launchSoId = id;
  if (STATE.ready && !STATE.focusLoading) loadFocusedSO(id);
}
function normalizeRows(response) {
  const root = response?.data?.data ? response.data : response;
  const rows = root?.data;
  if (!Array.isArray(rows)) {
    if (root?.code === 'NO_CONTENT' || root?.status === 'NO_CONTENT' || root?.info?.count === 0) return { rows: [], more: false };
    throw new Error(root?.error || 'Unexpected server response when loading Sales Order items.');
  }
  return { rows, more: Boolean(root?.info?.more_records) };
}
function normalizeItem(raw) {
  return {
    ...raw,
    id: String(raw.id),
    Parent_Id: raw.Parent_Id || {},
    Product_Name: raw.Product_Name || {},
    Offer_Product_Name: typeof raw.Offer_Product_Name === 'string' ? raw.Offer_Product_Name : '',
    Supplier: raw.Supplier || null,
    Purchase_Order: raw.Purchase_Order || null,
    Quantity: Number(raw.Quantity) || 0,
  };
}

// COQL can omit an Ordered_Items row even though it remains unlinked in the SO.
// Verify each displayed SO against the authoritative SO subform, without
// modifying the Sales Order or changing any existing widget selection/cost.
async function reconcileDemandFromSalesOrders(batchRows) {
  if (!window.ZOHO?.CRM?.API?.getRecord || STATE.focusedSoId || STATE.launchSoId) return 0;
  const orderIds = [...new Set(batchRows.map(getOrderId).filter(id => SO_ID_PATTERN.test(id)))];
  const pending = orderIds.filter(id => !STATE.reconciledSO.has(id));
  // Bound CRM API traffic when there are unusually many orders in a single COQL page.
  const toCheck = pending.slice(0, 40);
  if (!toCheck.length) return 0;
  let restored = 0;
  let failed = 0;
  for (let start = 0; start < toCheck.length; start += 4) {
    const batch = toCheck.slice(start, start + 4);
    const results = await Promise.allSettled(batch.map(async soId => {
      const response = await ZOHO.CRM.API.getRecord({ Entity:'Sales_Orders', RecordID:soId });
      const so = response?.data?.[0] || response?.data?.data?.[0];
      if (!so || String(so.id) !== soId || !Array.isArray(so.Ordered_Items)) {
        throw new Error('No full Sales Order item list for ' + soId);
      }
      return so;
    }));
    if (STATE.focusedSoId || STATE.launchSoId) return restored;
    for (let i = 0; i < results.length; i++) {
      const entry = results[i];
      const soId = batch[i];
      if (entry.status !== 'fulfilled') {
        failed++;
        console.warn('[Procurement] SO reconciliation skipped:', soId, entry.reason);
        continue; // Keep the COQL lines that were already loaded.
      }
      const so = entry.value;
      STATE.reconciledSO.add(soId);
      const knownIds = new Set(STATE.items.map(item => item.id));
      const recovered = [];
      for (const line of so.Ordered_Items) {
        if (!line?.id || line.Purchase_Order || !(Number(line.Quantity) > 0)) continue;
        const lineId = String(line.id);
        if (knownIds.has(lineId)) continue;
        recovered.push(normalizeItem({
          ...line,
          Parent_Id: { id:soId, name:String(so.Subject || soId) },
          'Parent_Id.Subject': String(so.Subject || soId),
          'Parent_Id.Accounting_status': so.Accounting_status || '',
          'Parent_Id.Status': so.Status || '',
          'Parent_Id.Owner': so.Owner || null,
          'Parent_Id.Account_Name': so.Account_Name || null
        }));
        knownIds.add(lineId);
      }
      // Put recovered lines into the existing SO group, not at the end of all orders.
      if (recovered.length) {
        const index = STATE.items.findIndex(item => getOrderId(item) === soId);
        STATE.items.splice(index < 0 ? STATE.items.length : index, 0, ...recovered);
        restored += recovered.length;
        console.info('[Procurement] Recovered missing SO items:', soId, recovered.map(line => line.id));
      }
    }
    $('loadCounter').textContent = 'Verifying Sales Order items… ' + Math.min(start + 4, toCheck.length) + '/' + toCheck.length;
  }
  if (failed) console.warn('[Procurement] SO reconciliation could not verify', failed, 'orders; existing COQL lines were preserved.');
  if (pending.length > toCheck.length) console.warn('[Procurement] Reconciliation capped at 40 Sales Orders in one page.');
  return restored;
}

async function loadData(reset = false) {
  if (!STATE.ready || STATE.busy) return;
  if (reset) {
    STATE.offset = 0;
    STATE.more = true;
    STATE.items = [];
    STATE.selected.clear();
    STATE.costs.clear();
    STATE.poQty.clear();
    STATE.collapsedSO.clear();
    STATE.lockedAfterPartial = false;
    STATE.reconciledSO.clear();
  }
  if (!STATE.more || STATE.offset >= STATE.maxRows) return;
  setBusy(true);
  showAlert('');
  $('loadCounter').textContent = 'Loading…';
  try {
    const response = await ZOHO.CRM.FUNCTIONS.execute(FETCH_FUNCTION_API_NAME, {
      arguments: JSON.stringify({ offsetText: String(STATE.offset) })
    });
    const serverResult = functionResult(response);
    if (serverResult.error) throw new Error(serverResult.error);
    const data = normalizeRows(serverResult);
    if (STATE.focusedSoId && STATE.launchSoId === STATE.focusedSoId) return;
    if (serverResult.ownerNames && typeof serverResult.ownerNames === "object") Object.assign(STATE.ownerNames, serverResult.ownerNames);
    const existing = new Set(STATE.items.map((item) => item.id));
    const newRows = data.rows.map(normalizeItem).filter(item => !existing.has(item.id));
    STATE.items.push(...newRows);
    // The server can append missing SO lines to the COQL page. Only the original
    // COQL count must advance the next-page offset to avoid skipping demand.
    const rawCoqlCount = Number(serverResult.coqlCount);
    STATE.offset += Number.isSafeInteger(rawCoqlCount) && rawCoqlCount >= 0
      ? rawCoqlCount : data.rows.length;
    STATE.more = data.more && STATE.offset < STATE.maxRows;
    // The server checks the complete SO subform, which is authoritative for
    // inventory-module line items. Keep the SDK recovery only as a fallback.
    const recovered = serverResult.serverReconciled === true
      ? 0 : await reconcileDemandFromSalesOrders(newRows);
    connection('connected', 'Zoho CRM connected');
    const restoredCount = Math.max(0, Number(serverResult.recoveredCount) || 0) + recovered;
    if (restoredCount) console.info('[Procurement] SO line reconciliation:', restoredCount);
    render();
  } catch (error) {
    console.error('[Procurement] Demand function failed', error);
    const message = String(error?.message || JSON.stringify(error));
    const apiDisabled = /api is inactive|inactive for the given custom function/i.test(message);
    connection('error', apiDisabled ? 'Function REST API disabled' : 'Could not load CRM');
    showAlert(apiDisabled
      ? 'Zoho Function REST API is disabled. Open Setup → Developer Hub → Functions → Procurement Get Demand → REST API and enable OAuth 2.0. Also enable OAuth 2.0 for Procurement Create PO. Then click Refresh.'
      : 'Unable to load purchase demand: ' + message + '\nCheck Procurement Get Demand logs and CRM connection zoho_crm_connection.', 'error');
    $('ordersBody').innerHTML = '<tr><td colspan="'+(STATE.viewMode==='flat'?'11':'10')+'" class="empty">CRM data is unavailable. See the error above.</td></tr>';
    $('loadCounter').textContent = 'Load failed';
  } finally {
    setBusy(false);
    render();  // Rebuild rows after busy=false; initial selection must work immediately.
  }
}

async function loadOwnerNames() {
  if (!window.ZOHO?.CRM?.API?.getAllUsers) return;
  try {
    const result=await ZOHO.CRM.API.getAllUsers({Type:'AllUsers',per_page:200,page:1});
    const allUsers=result?.users || result?.data?.users || [];
    for (const user of allUsers) {
      const fullname=String(user.full_name || [user.first_name,user.last_name].filter(Boolean).join(' ')).trim();
      if (user.id && fullname) STATE.ownerNames[String(user.id)]=fullname;
    }
    if (STATE.items.length) render();
  } catch (error) {
    console.warn('[Procurement] Could not resolve CRM full user names; server/fallback names used.', error);
  }
}

// The standalone create function runs under its configured OAuth user, so it
// must receive the actual operator ID to set PO Owner at INSERT time.
// Do not change PO ownership later from this widget: sales profiles need not
// have Change Owner permission. Never silently fall back to administrator.
async function resolveCurrentUserId() {
  if (STATE.currentUserId && SO_ID_PATTERN.test(STATE.currentUserId)) return STATE.currentUserId;
  if (!window.ZOHO?.CRM?.CONFIG?.getCurrentUser) throw new Error('Zoho CRM current-user API unavailable.');
  const response = await ZOHO.CRM.CONFIG.getCurrentUser();
  const user = response?.users?.[0] || response?.user || response?.data?.users?.[0] || response?.data?.user || response;
  const id = String(user?.id || '').trim();
  if (!SO_ID_PATTERN.test(id)) throw new Error('Could not verify the current Zoho CRM user ID.');
  STATE.currentUserId = id;
  return id;
}

function getOrderId(item) { return String(item.Parent_Id?.id || ''); }
function getOfficialProductName(item) { return String(item.Product_Name?.name || 'Unnamed product').trim(); }
function getOfferProductName(item) { return String(item.Offer_Product_Name || '').trim(); }
function getOrderName(item) { return String(item['Parent_Id.Subject'] || item.Parent_Id?.name || item.Parent_Id?.id || 'Sales Order'); }
function getOrderOwner(item) {
  const owner = item['Parent_Id.Owner'];
  return String(STATE.ownerNames[String(owner?.id || '')] || owner?.full_name || owner?.name || 'Not assigned');
}
function getOrderAccount(item) { return String(item['Parent_Id.Account_Name']?.name || 'No account'); }
function getAccountId(item) { return String(item['Parent_Id.Account_Name']?.id || '__missing__'); }
function getPurchaseQty(item) {
  const stored = STATE.poQty.get(item.id);
  return stored === undefined ? item.Quantity : Number(stored);
}
function validPurchaseQty(item) {
  const value = getPurchaseQty(item);
  return Number.isSafeInteger(value) && value > 0 && value <= 999999999;
}
function filterItems(options={}) {
  const keyword=$('searchInput').value.trim().toLowerCase();
  const supplier=options.ignoreSupplier ? '' : $('supplierFilter').value;
  const orderId=options.ignoreOrder ? '' : $('soFilter').value;
  const accountId=options.ignoreClient ? '' : $('clientFilter').value;
  const status=$('statusFilter').value;
  return STATE.items.filter((item)=>{
    // Never show items already assigned to a Purchase Order.
    if (item.Purchase_Order) return false;
    if (supplier && String(item.Supplier?.id || '__missing__')!==supplier) return false;
    if (orderId && getOrderId(item)!==orderId) return false;
    if (accountId && getAccountId(item)!==accountId) return false;
    if (status==='ready' && !isReady(item)) return false;
    if (status==='notready' && isReady(item)) return false;
    if (status==='deposit' && getStatus(item)!=='Deposit paid') return false;
    if (status==='paid' && getStatus(item)!=='Paid') return false;
    if (keyword) {
      const text=[getOrderName(item),getOrderOwner(item),getOrderAccount(item),item.Product_Name?.name,item.Offer_Product_Name,item.Brand,item.UPC,getCode(item)].join(' ').toLowerCase();
      if (!text.includes(keyword)) return false;
    }
    return true;
  });
}
function getVisibleItems() {return filterItems();}
function refreshSupplierOptions() {
  const old=$('supplierFilter').value;
  const codes=new Map();
  // Only suppliers actually present in current pending SO lines, not all CRM Suppliers.
  const scope=filterItems({ignoreSupplier:true});
  for (const item of scope) if(item.Supplier?.id) codes.set(String(item.Supplier.id),getCode(item));
  const select=$('supplierFilter');
  select.replaceChildren(new Option('All suppliers',''));
  for (const [id,name] of [...codes].sort((a,b)=>a[1].localeCompare(b[1]))) select.append(new Option(name,id));
  if(scope.some(item=>!item.Supplier?.id)) select.append(new Option('Unassigned','__missing__'));
  select.value=[...select.options].some(o=>o.value===old)?old:'';
  window.ProcurementSearchSelect?.sync(select);
}
function refreshOrderOptions() {
  const old=$('soFilter').value;
  // The filter includes only orders which still contain pending (not yet purchased) lines
  // under the chosen accounting status and supplier.
  const orders=new Map();
  for (const item of filterItems({ignoreOrder:true})) orders.set(getOrderId(item),getOrderName(item));
  const select=$('soFilter');
  select.replaceChildren(new Option('All order numbers',''));
  for (const [id,name] of [...orders].sort((a,b)=>a[1].localeCompare(b[1]))) select.append(new Option(name,id));
  select.value=orders.has(old)?old:'';
  window.ProcurementSearchSelect?.sync(select);
}
function refreshClientOptions() {
  const select=$('clientFilter');
  const previous=select.value;
  const clients=new Map();
  // Ignore this filter while collecting options; other filters still apply.
  for (const item of filterItems({ignoreClient:true})) {
    const id=getAccountId(item);
    clients.set(id,getOrderAccount(item));
  }
  select.replaceChildren(new Option('All clients',''));
  for (const [id,name] of [...clients].sort((a,b)=>a[1].localeCompare(b[1]))) select.append(new Option(name,id));
  select.value=clients.has(previous)?previous:'';
  window.ProcurementSearchSelect?.sync(select);
}
function appendCell(tr, className, text) {
  const td = document.createElement('td');
  if (className) td.className = className;
  td.textContent = String(text ?? '');
  tr.append(td);
  return td;
}
function supplierOptions(select, item) {
  const current = item.Supplier?.id ? String(item.Supplier.id) : '';
  select.replaceChildren(new Option(current ? getCode(item) : 'Select supplier…',current));
  if (!current) select.options[0].disabled=true;
  const ids=new Set([current]);
  for (const c of STATE.supplierCodes) {
    if (!ids.has(String(c.id))) {
      select.append(new Option(c.name,String(c.id)));
      ids.add(String(c.id));
    }
  }
  select.value=current;
}
async function saveSupplier(item, newSupplierId) {
  if (!newSupplierId || STATE.busy || STATE.savingSupplier.has(item.id)) return;
  if (String(item.Supplier?.id||'')===String(newSupplierId)) return;
  const otherSupplier=getSelectedItems().filter(x=>x.id!==item.id&&x.Supplier?.id).map(x=>String(x.Supplier.id))[0];
  if (STATE.selected.has(item.id) && otherSupplier && otherSupplier!==String(newSupplierId)) {
    showAlert('Selected lines must have the same supplier. Deselect the other lines before changing this Supplier Code.','error');
    render();
    return;
  }
  STATE.savingSupplier.add(item.id);
  setBusy(true);
  showAlert('Saving Supplier Code for '+getOrderName(item)+'…');
  try {
    const response=await ZOHO.CRM.FUNCTIONS.execute(ASSIGN_SUPPLIER_FUNCTION,{
      arguments:JSON.stringify({salesOrderId:getOrderId(item),lineId:item.id,supplierCodeId:String(newSupplierId)})
    });
    const result=functionResult(response);
    if (result.status!=='success') throw new Error(result.message || 'CRM did not confirm supplier update.');
    item.Supplier={id:String(result.supplierId),name:String(result.supplierName)};
    showAlert('Saved Supplier '+result.supplierName+' to '+getOrderName(item)+'.','success');
  } catch(error) {
    const message=String(error?.message || error);
    const disabled=/api is inactive|inactive for the given custom function/i.test(message);
    showAlert(disabled ? 'Enable OAuth REST API for Procurement Assign Supplier in Developer Hub → Functions.' : 'Supplier not saved: '+message,'error');
  } finally {
    STATE.savingSupplier.delete(item.id);
    setBusy(false);
    render();
  }
}
function addSupplierEditor(cell,item) {
  const select=document.createElement('select');
  select.className='supplier-select';
  select.setAttribute('aria-label','Assign supplier to '+getOrderName(item)+' '+(item.Product_Name.name||''));
  select.disabled=STATE.busy || STATE.lockedAfterPartial || !STATE.supplierCodes.length || STATE.savingSupplier.has(item.id);
  if (!STATE.supplierCodes.length) {
    select.append(new Option('Supplier list unavailable',''));
    select.title='Enable OAuth 2.0 REST API for Procurement Get Supplier Codes and Procurement Assign Supplier.';
  } else {
    supplierOptions(select,item);
    select.title='Select a Supplier Code and it will be saved in this Sales Order line.';
  }
  select.addEventListener('change',()=>saveSupplier(item,select.value));
  cell.append(select);
  window.ProcurementSearchSelect?.enhance(select, { variant: 'supplier', label: 'Supplier Code' });
}
function selectionSupplier() {
  return getSelectedItems().find(item => item.Supplier?.id)?.Supplier?.id || null;
}
function canSelectAlongside(item, supplierId) {
  return !supplierId || !item.Supplier?.id || String(item.Supplier.id) === String(supplierId);
}
function toggleOneGroupSelection(lines, select) {
  if (!select) {
    for (const item of lines) STATE.selected.delete(item.id);
    render();
    return;
  }
  const selectable=lines.filter(isSelectable);
  const supplier=selectionSupplier() || selectable.find(item => item.Supplier?.id)?.Supplier?.id || null;
  for (const item of selectable) {
    if (STATE.selected.size>=60) break;
    if (canSelectAlongside(item,supplier)) STATE.selected.add(item.id);
  }
  render();
}
function addGroupRow(tbody, orderId, lines, index) {
  const tr=document.createElement('tr');
  tr.className='so-group';
  const td=appendCell(tr,'group-cell','');
  td.colSpan=7; // Seven columns before SO Qty: checkbox, #, brand, UPC, CRM name, offer name, supplier.
  const wrap=document.createElement('div');
  wrap.className='group-content';
  const left=document.createElement('div');
  left.className='group-left';
  const selectable=lines.filter(isSelectable);
  const groupCheck=document.createElement('input');
  groupCheck.type='checkbox';
  groupCheck.disabled=selectable.length===0 || STATE.busy || STATE.lockedAfterPartial;
  groupCheck.checked=selectable.length>0 && selectable.every(item=>STATE.selected.has(item.id));
  groupCheck.indeterminate=selectable.some(item=>STATE.selected.has(item.id))&&!groupCheck.checked;
  groupCheck.setAttribute('aria-label','Select items from '+getOrderName(lines[0]));
  groupCheck.addEventListener('change',()=>toggleOneGroupSelection(lines,groupCheck.checked));
  left.append(groupCheck);
  const toggle=document.createElement('button');
  toggle.type='button';
  toggle.className='group-toggle';
  const collapsed=STATE.collapsedSO.has(orderId);
  toggle.setAttribute('aria-expanded',String(!collapsed));
  toggle.textContent=(collapsed?'▸':'▾')+' '+getOrderName(lines[0]);
  toggle.addEventListener('click',()=>{
    if (collapsed) STATE.collapsedSO.delete(orderId);
    else STATE.collapsedSO.add(orderId);
    render();
  });
  left.append(toggle);
  const orderPending=STATE.items.filter(item=>getOrderId(item)===orderId);
  const totalSoQty=orderPending.reduce((n,item)=>n+item.Quantity,0);
  const status=document.createElement('span');
  status.className='tag '+(isReady(lines[0])?'ready':'pending');
  status.textContent=getStatus(lines[0]) || 'Not paid';
  left.append(status);
  const open=document.createElement('button');
  open.type='button';
  open.className='order-link group-open';
  open.textContent='Open SO ↗';
  open.addEventListener('click',()=>openRecord('Sales_Orders',orderId));
  left.append(open);
  const meta=document.createElement('div');
  meta.className='group-meta';
  const account=document.createElement('span');
  account.className='group-account';
  account.textContent=getOrderAccount(lines[0]);
  account.classList.add('account-link');
  const accountId=lines[0]['Parent_Id.Account_Name']?.id;
  if (accountId) {
    account.setAttribute('role','button');
    account.setAttribute('tabindex','0');
    account.title='Open customer Account';
    account.addEventListener('click',()=>openRecord('Accounts',accountId));
    account.addEventListener('keydown',(ev)=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();openRecord('Accounts',accountId);}});
  }
  const owner=document.createElement('span');
  owner.className='group-owner';
  owner.textContent=getOrderOwner(lines[0]);
  meta.append(account,owner);
  wrap.append(left,meta);
  td.append(wrap);
  const summaryQty=appendCell(tr,'numeric group-so-total',fmtNumber(totalSoQty));
  summaryQty.title='Total SO Qty across this order (pending lines)';
  appendCell(tr,'group-tail','').colSpan=2;
  tbody.append(tr);
}
function addProductRow(tbody,item,index,orderIndex=0) {
  const tr=document.createElement('tr');
  tr.className='product-row '+(STATE.viewMode==='flat' && index===0?'flat-so-start ':'')+(!isSelectable(item)?'row-disabled ':'')+(STATE.selected.has(item.id)?'row-selected':'');
  const checkCell=appendCell(tr,'checkbox-col','');
  const check=document.createElement('input');
  check.type='checkbox';
  check.checked=STATE.selected.has(item.id);
  check.disabled=!isSelectable(item) || STATE.busy || STATE.lockedAfterPartial;
  check.setAttribute('aria-label','Select '+(item.Product_Name.name||item.id));
  check.addEventListener('change',()=>toggleSelected(item,check.checked));
  checkCell.append(check);
  const lineCell=appendCell(tr,'line-counter','');
  const lineNumber=document.createElement('span');
  lineNumber.textContent='#'+(index+1);
  lineCell.append(lineNumber);
  lineCell.title='SO line '+(index+1)+' · '+getOrderName(item);
  // List view shows the actual Sales Order number in its own dedicated column.
  // Group view hides this cell because the SO number is already in the group heading.
  const soNumberCell=appendCell(tr,'so-number-column so-number-cell','');
  const soNumberLink=document.createElement('button');
  soNumberLink.type='button';
  soNumberLink.className='order-link so-number-link';
  soNumberLink.textContent=getOrderName(item);
  soNumberLink.title='Open Sales Order '+getOrderName(item);
  soNumberLink.setAttribute('aria-label','Open Sales Order '+getOrderName(item));
  soNumberLink.addEventListener('click',()=>openRecord('Sales_Orders',getOrderId(item)));
  soNumberCell.append(soNumberLink);
  const brandCell=appendCell(tr,'cell-brand','');
  const brandValue=String(typeof item.Brand==='string' ? item.Brand : item.Brand?.name || item.Brand?.Name || '').trim();
  const brand=document.createElement(brandValue?'button':'span');
  brand.className='product-brand'+(brandValue?' crm-record-link':'');
  brand.textContent=brandValue || '\u2014';
  if (brandValue) {
    brand.type='button';
    brand.title='Open Brand '+brandValue+' in Zoho CRM';
    brand.setAttribute('aria-label','Open Brand '+brandValue+' in Zoho CRM');
    brand.addEventListener('click',()=>openBrandRecord(item,brand));
  }
  brandCell.append(brand);
  const upcCell=appendCell(tr,'cell-upc','');
  const upc=document.createElement('span');
  upc.className='upc-value';
  upc.textContent=String(item.UPC || '—');
  upcCell.append(upc);
  const productCell=appendCell(tr,'cell-product','');
  const productId=String(item.Product_Name?.id || '');
  const official=document.createElement(productId?'button':'div');
  official.className='product-name'+(productId?' crm-record-link':'');
  official.textContent=getOfficialProductName(item);
  if (productId) {
    official.type='button';
    official.title='Open CRM Product in Zoho CRM';
    official.setAttribute('aria-label','Open CRM Product '+getOfficialProductName(item));
    official.addEventListener('click',()=>openRecord('Products',productId));
  }
  productCell.append(official);
  // Flat mode keeps customer, owner and payment context; SO number is now in its own column.
  if (STATE.viewMode==='flat') {
    const details=document.createElement('div');
    details.className='flat-product-context';
    const account=document.createElement('span');
    account.textContent=getOrderAccount(item)+' · '+getOrderOwner(item);
    details.append(account);
    const payment=document.createElement('span');
    payment.className='tag '+(isReady(item)?'ready':'pending');
    payment.textContent=getStatus(item)||'Not paid';
    details.append(payment);
    productCell.append(details);
  }
  const offerCell=appendCell(tr,'cell-offer','');
  const offer=document.createElement('div');
  offer.className='offer-product-name';
  offer.textContent=getOfferProductName(item)||'Not specified in SO';
  if(!getOfferProductName(item)) offer.classList.add('offer-product-empty');
  offerCell.append(offer);
  addSupplierEditor(appendCell(tr,'',''),item);
  const soQtyCell=appendCell(tr,'numeric so-qty','');
  const soQtyContent=document.createElement('span');
  soQtyContent.className='so-qty-content';
  const soQtyNumber=document.createElement('span');
  soQtyNumber.textContent=fmtNumber(item.Quantity);
  soQtyContent.append(soQtyNumber);
  // Keep the Split action compact and show it only for a checked SO item.
  if (STATE.selected.has(item.id) && isSelectable(item) && Number.isSafeInteger(Number(item.Quantity)) && Number(item.Quantity)>=2) {
    const splitButton=document.createElement('button');
    splitButton.type='button';
    splitButton.className='split-line-btn';
    splitButton.textContent='→ Split';
    splitButton.disabled=STATE.busy || STATE.lockedAfterPartial;
    splitButton.title='Split this SO item between two suppliers';
    splitButton.setAttribute('aria-label','Split SO quantity for '+(item.Product_Name?.name||item.id));
    splitButton.addEventListener('click',()=>openSplit(item));
    soQtyContent.append(splitButton);
  }
  soQtyCell.append(soQtyContent);
  const poQtyCell=appendCell(tr,'numeric','');
  const qtyInput=document.createElement('input');
  qtyInput.type='number';
  qtyInput.className='qty-input';
  qtyInput.min='1';
  qtyInput.max='999999999';
  qtyInput.step='1';
  qtyInput.inputMode='numeric';
  qtyInput.value=String(STATE.poQty.get(item.id) ?? item.Quantity);
  qtyInput.disabled=STATE.lockedAfterPartial;
  qtyInput.title='PO quantity may be below, equal to or above the Sales Order quantity. PO Available can become negative.';
  qtyInput.setAttribute('aria-label','PO quantity for '+(item.Product_Name.name||item.id));
  qtyInput.classList.toggle('invalid',!validPurchaseQty(item));
  qtyInput.addEventListener('input',()=>{
    STATE.poQty.set(item.id,qtyInput.value);
    qtyInput.classList.toggle('invalid',!validPurchaseQty(item));
    updateSelection();
  });
  poQtyCell.append(qtyInput);
  const costCell=appendCell(tr,'numeric','');
  const cost=document.createElement('input');
  cost.type='text';
  cost.className='cost-input';
  cost.dataset.itemId=String(item.id);
  cost.autocomplete='off';
  cost.placeholder='Enter cost';cost.inputMode='decimal';
  cost.disabled=!isSelectable(item) || STATE.lockedAfterPartial;
  cost.value=STATE.costs.get(item.id) ?? '';
  cost.classList.toggle('invalid',STATE.selected.has(item.id) && !validCost(cost.value));
  cost.setAttribute('aria-label','Purchase unit cost for '+(item.Product_Name.name||item.id));
  cost.addEventListener('paste',(event)=>{
    const text=event.clipboardData?.getData('text/plain')||'';
    if(/[\t\r\n]/.test(text)) {
      event.preventDefault();
      pasteCostColumn(cost,text);
    }
  });
  cost.addEventListener('keydown',(event)=>{
    if(event.key!=='Enter')return;
    event.preventDefault();
    const fields=Array.from(document.querySelectorAll('#ordersBody tr.product-row .cost-input:not(:disabled)'));
    const next=fields[fields.indexOf(cost)+1];
    if(next){next.focus();next.select();}
  });
  cost.addEventListener('input',()=>{ 
    STATE.costs.set(item.id,cost.value);
    cost.classList.toggle('invalid',STATE.selected.has(item.id)&&!validCost(cost.value));
    updateSelection();
  });
  cost.addEventListener('blur',()=>{
    const canonical=costToCanonical(cost.value);
    if (canonical) {
      cost.value=canonical;
      STATE.costs.set(item.id,canonical);
    }
    cost.classList.toggle('invalid',STATE.selected.has(item.id)&&!validCost(cost.value));
    updateSelection();
  });
  costCell.append(cost);
  const costActions=document.createElement('div');
  costActions.className='cost-row-actions';
  const copyPrice=document.createElement('button');
  copyPrice.type='button';
  copyPrice.className='cost-mini-btn copy-price-btn';
  copyPrice.textContent='Copy';
  copyPrice.title='Copy this PO Unit Cost for pasting into another row';
  copyPrice.setAttribute('aria-label','Copy PO Unit Cost for '+getOfficialProductName(item));
  copyPrice.disabled=!validCost(cost.value);
  copyPrice.addEventListener('click',()=>copyUnitCost(cost));
  const pastePrice=document.createElement('button');
  pastePrice.type='button';
  pastePrice.className='cost-mini-btn paste-price-btn';
  pastePrice.textContent='Paste';
  pastePrice.title='Paste a copied price or a column from Excel into this row';
  pastePrice.setAttribute('aria-label','Paste PO Unit Cost for '+getOfficialProductName(item));
  pastePrice.disabled=cost.disabled;
  pastePrice.addEventListener('click',()=>pasteUnitCost(cost));
  costActions.append(copyPrice,pastePrice);
  costCell.append(costActions);
  cost.addEventListener('input',()=>{copyPrice.disabled=!validCost(cost.value);});
  cost.addEventListener('blur',()=>{copyPrice.disabled=!validCost(cost.value);});
  tbody.append(tr);
}
function render() {
  window.ProcurementSearchSelect?.close(false);
  $('ordersTable').classList.toggle('grouped-mode', STATE.viewMode==='grouped');
  refreshOrderOptions();
  refreshSupplierOptions();
  refreshClientOptions();
  const list=getVisibleItems();
  const tbody=$('ordersBody');
  tbody.replaceChildren();
  if(!list.length){const tr=document.createElement('tr');appendCell(tr,'empty',STATE.items.length?'No lines match the current filters.':'No pending Sales Order lines found.').colSpan=STATE.viewMode==='flat'?11:10;tbody.append(tr);}
  const bySO=new Map();
  for (const item of list){const id=getOrderId(item);if(!bySO.has(id))bySO.set(id,[]);bySO.get(id).push(item);}
  for (const [orderId,lines] of bySO) {
    if (STATE.viewMode === 'grouped') {
      addGroupRow(tbody,orderId,lines);
      if (!STATE.collapsedSO.has(orderId)) lines.forEach((item,i)=>addProductRow(tbody,item,i,[...bySO.keys()].indexOf(orderId)));
    } else {
      lines.forEach((item,i)=>addProductRow(tbody,item,i,[...bySO.keys()].indexOf(orderId)));
    }
  }
  $('toggleGroupsBtn').hidden=STATE.viewMode !== 'grouped';
  $('toggleGroupsLabel').textContent=bySO.size>0&&[...bySO.keys()].every(id=>STATE.collapsedSO.has(id))?'Expand all':'Collapse all';
  $('viewGroupedBtn').classList.toggle('active',STATE.viewMode==='grouped');
  $('viewFlatBtn').classList.toggle('active',STATE.viewMode==='flat');
  $('viewGroupedBtn').setAttribute('aria-pressed',String(STATE.viewMode==='grouped'));
  $('viewFlatBtn').setAttribute('aria-pressed',String(STATE.viewMode==='flat'));
  $('soItemHeading').textContent='#';
  $('metricPending').textContent=fmtNumber(STATE.items.length);
  $('metricReady').textContent=fmtNumber(STATE.items.filter(isReady).length);
  $('metricMissing').textContent=fmtNumber(STATE.items.filter(item=>!item.Supplier?.id).length);
  $('loadCounter').textContent=fmtNumber(list.length)+' lines · '+fmtNumber(bySO.size)+' SOs · '+fmtNumber(STATE.items.length)+' loaded';
  $('loadMoreBtn').hidden=!STATE.more;
  updateSelection();
}

function toggleSelected(item, enabled) {
  if (STATE.busy || STATE.lockedAfterPartial || !isSelectable(item)) return;
  if (enabled) {
    const selected = Array.from(STATE.selected).map((id) => STATE.items.find((v) => v.id === id)).filter(Boolean);
    const currentSupplier = selected.find(v=>v.Supplier?.id)?.Supplier?.id;
    if (currentSupplier && item.Supplier?.id && String(currentSupplier) !== String(item.Supplier.id)) {
      showAlert('One Purchase Order must have one supplier. Deselect the current supplier before selecting ' + getCode(item) + '.', 'error');
      render();
      return;
    }
    if (STATE.selected.size >= 60) {
      showAlert('Maximum 60 Sales Order lines per Purchase Order.', 'error');
      render();
      return;
    }
    STATE.selected.add(item.id);
  } else {
    STATE.selected.delete(item.id);
  }
  showAlert('');
  render();
}
function getSelectedItems() {
  return [...STATE.selected].map((id) => STATE.items.find((i) => i.id === id)).filter(Boolean);
}
// Visible per-row Copy and Paste controls; copied cost persists through table re-render.
function copyUnitCost(input) {
  if (STATE.busy || STATE.lockedAfterPartial) return false;
  const value=costToCanonical(input?.value);
  if(!value){showAlert('Enter a valid PO Unit Cost before copying.','error');return false;}
  STATE.copiedUnitCost=value;
  // The internal clipboard always works even when CRM's widget iframe denies system clipboard access.
  if (typeof navigator!=='undefined' && navigator.clipboard?.writeText) {
    Promise.resolve(navigator.clipboard.writeText(value)).catch(()=>{});
  }
  showAlert('Copied PO Unit Cost '+value+'. Click Paste in another row.','success');
  return true;
}
async function pasteUnitCost(input) {
  if(!input || input.disabled || STATE.busy || STATE.lockedAfterPartial)return false;
  // First try the OS clipboard (Excel and other applications), then the widget's own copy buffer.
  let value='';
  try {
    if (typeof navigator!=='undefined' && navigator.clipboard?.readText) {
      value=await navigator.clipboard.readText();
    }
  }catch(_){ /* Clipboard-read permission is optional in embedded Zoho iframes. */ }
  if (!value) value=STATE.copiedUnitCost;
  if(!value){
    showAlert('No price on the clipboard. Use Copy on a price above, or paste with Ctrl+V / Cmd+V into the price field.','error');
    return false;
  }
  if(!pasteCostColumn(input,value))return false;
  return true;
}
function openCostPastePanel() {
  $('priceColumnPastePanel').classList.remove('hidden');
  $('priceColumnText').focus();
}
function closeCostPastePanel() {
  $('priceColumnPastePanel').classList.add('hidden');
}
function pasteCostColumnFromPanel() {
  const fields=Array.from(document.querySelectorAll('#ordersBody tr.product-row .cost-input:not(:disabled)'));
  if(!fields.length){showAlert('No editable PO Unit Cost rows are visible.','error');return false;}
  const selectedFirst=fields.find(field=>STATE.selected.has(String(field.dataset.itemId)));
  const first=selectedFirst || fields[0];
  if(!pasteCostColumn(first,$('priceColumnText').value))return false;
  $('priceColumnText').value='';
  closeCostPastePanel();
  return true;
}
// Paste a single Excel price column into consecutive visible, editable PO Unit Cost cells.
// All rows are validated before any state is changed: malformed prices never partially apply.
function pasteCostColumn(startInput,pastedText) {
  if(STATE.busy||STATE.lockedAfterPartial){showAlert('Cost editing is temporarily locked.','error');return false;}
  const raw=String(pastedText||'').replace(/\r\n?/g,'\n');
  const lines=raw.split('\n');
  while(lines.length&&lines[lines.length-1].trim()==='')lines.pop();
  if(!lines.length){showAlert('No prices were pasted.','error');return false;}
  if(lines.some(row=>row.includes('\t'))){
    showAlert('Copy only one Excel column containing PO Unit Cost (not several columns).','error');
    return false;
  }
  const canonical=lines.map(line=>costToCanonical(line));
  const invalidAt=canonical.findIndex(value=>!value);
  if(invalidAt!==-1){
    showAlert('Prices not pasted: invalid or empty PO Unit Cost on clipboard line '+(invalidAt+1)+'. Check that each price is greater than zero and has up to 2 decimals.','error');
    return false;
  }
  const fields=Array.from(document.querySelectorAll('#ordersBody tr.product-row .cost-input:not(:disabled)'));
  const start=fields.indexOf(startInput);
  if(start<0||start+canonical.length>fields.length){
    showAlert('Prices not pasted: '+canonical.length+' prices exceed the visible editable rows starting at this cell. Expand SO groups or paste a shorter column.','error');
    return false;
  }
  const updates=[];
  for(let i=0;i<canonical.length;i++){
    const input=fields[start+i];
    const id=String(input.dataset.itemId||'');
    if(!id||!STATE.items.some(item=>String(item.id)===id)){
      showAlert('Prices not pasted: row reference changed. Refresh the widget.','error');
      return false;
    }
    updates.push({input,id,value:canonical[i]});
  }
  for(const update of updates){
    STATE.costs.set(update.id,update.value);
    update.input.value=update.value;
    update.input.classList.remove('invalid');
    // Bulk paste sets the value programmatically; enable its visible Copy button.
    const copyButton=update.input.parentElement?.querySelector?.('.copy-price-btn');
    if (copyButton) copyButton.disabled=false;
  }
  updateSelection();
  showAlert('Pasted '+updates.length+' PO Unit Cost value'+(updates.length===1?'':'s')+' into visible rows.','success');
  return true;
}
function costToCanonical(value) {
  const raw=String(value ?? '').trim().replace(/\s+/g,'').replace(/^\$/,'');
  let numberText=raw;
  // 12,5 means 12.5; 1,250.00 means 1250.00.
  if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(raw)) numberText=raw.replace(/,/g,'');
  else if (/^\d{1,10},\d{1,2}$/.test(raw)) numberText=raw.replace(',','.');
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(numberText) || Number(numberText)<=0) return '';
  return numberText;
}
function validCost(value) { return Boolean(costToCanonical(value)); }
function updateSelection() {
  const selected = getSelectedItems();
  const totalUnits = selected.reduce((total, item) => total + getPurchaseQty(item), 0);
  const supplierIds = new Set(selected.filter(item=>item.Supplier?.id).map(item=>String(item.Supplier.id)));
  const valid = selected.length > 0 && selected.length <= 60 && supplierIds.size === 1 && selected.every((item) => isEligible(item) && validCost(STATE.costs.get(item.id) || '') && validPurchaseQty(item));
  const total = selected.reduce((sum, item) => sum + getPurchaseQty(item) * Number(costToCanonical(STATE.costs.get(item.id)) || 0), 0);
  const supplier = selected.find(item=>item.Supplier?.id)?.Supplier?.name || ''; 
  $('metricSelected').textContent = selected.length + ' items selected';
  $('metricQuantity').textContent = fmtNumber(totalUnits);
  $('selectedBadge').textContent = String(selected.length);
  $('supplierBadge').textContent = supplier ? 'Supplier ' + supplier : 'No supplier selected';
  $('totalPreview').textContent = 'Total: ' + (selected.length ? fmtMoney(total) : '—');
  $('createPoBtn').disabled = !valid || STATE.busy || STATE.lockedAfterPartial;
  $('existingPoBtn').disabled = !valid || STATE.busy || STATE.lockedAfterPartial;
  const missingSuppliers=selected.filter(x=>!x.Supplier?.id).length;
  const missingCosts=selected.filter(x=>!validCost(STATE.costs.get(x.id))).length;
  let reason='';
  if (STATE.lockedAfterPartial) reason='PO outcome needs reconciliation; do not create another.';
  else if (selected.length===0) reason='Select products to create a PO.';
  else if (supplierIds.size>1) reason='Selected SOs contain different suppliers. One PO = one supplier.';
  else if (missingSuppliers) reason='Assign Supplier Code to '+missingSuppliers+' selected item(s).';
  else if (missingCosts) reason='Enter Unit Cost for '+missingCosts+' selected item(s).';
  else if (selected.some(x=>!validPurchaseQty(x))) reason='PO Qty must be a positive whole number.';
  else if (selected.some(item=>!isReady(item))) reason='Customer payment missing: confirmation required before PO creation.';
  else reason='Ready to create one PO from '+new Set(selected.map(getOrderId)).size+' SO(s).';
  $('actionReason').textContent=reason;
  $('actionReason').classList.toggle('action-ready',valid);
  $('createPoBtn').title=reason;
  $('selectAll').disabled = STATE.busy || STATE.lockedAfterPartial;
  const eligible = getVisibleItems().filter(isSelectable);
  $('selectAll').checked = eligible.length > 0 && eligible.every((item) => STATE.selected.has(item.id));
  $('selectAll').indeterminate = eligible.some((item) => STATE.selected.has(item.id)) && !$('selectAll').checked;
  if (selected.some(item=>!item.Supplier?.id)) $('selectionHint').textContent = 'Assign a Supplier Code to each selected row before creating the PO.';
  else if (supplierIds.size>1) $('selectionHint').textContent = 'Only one supplier can be included in a Purchase Order.';
  else if (selected.some(item=>!validPurchaseQty(item))) $('selectionHint').textContent = 'PO Qty must be a positive whole number.';
  else if (selected.some(item=>!validCost(STATE.costs.get(item.id)))) $('selectionHint').textContent = 'Enter a positive Unit Cost in every selected row (up to 2 decimals). Fields needing a price are outlined in red.';
  else if (selected.some(item=>!isReady(item))) $('selectionHint').textContent = 'Payment not received for '+new Set(selected.filter(item=>!isReady(item)).map(getOrderId)).size+' selected SO(s). You may create a PO after acknowledging this warning.';
  else $('selectionHint').textContent = 'Assign Supplier, enter purchase quantities and costs, then create the PO. PO Available may be negative.';
  if (!$('selectionHint').textContent.includes('PO Qty must')) $('selectionHint').textContent += ' PO Qty must be a positive whole number.';
}
function selectAllVisible(checked) {
  const visible = getVisibleItems().filter(isSelectable);
  if (!checked) {
    for (const item of visible) STATE.selected.delete(item.id);
    render();
    return;
  }
  const selected = getSelectedItems();
  const existingSupplier = selected.find(item=>item.Supplier?.id)?.Supplier?.id || visible.find(item=>item.Supplier?.id)?.Supplier?.id || null;
  let added = 0;
  for (const item of visible) {
    if (STATE.selected.size >= 60) break;
    if (canSelectAlongside(item,existingSupplier)) {
      if (!STATE.selected.has(item.id)) added++;
      STATE.selected.add(item.id);
    }
  }
  if (added < visible.length) showAlert('Selected eligible rows for one supplier (up to 60 lines). Other suppliers were not selected.');
  render();
}
function buildReview() {
  const selected = getSelectedItems();
  if (!selected.length || selected.length > 60) throw new Error('Select 1–60 rows.');
  if (selected.some((item) => !isEligible(item))) throw new Error('At least one selected row is no longer eligible. Refresh the list.');
  const supplierId = selected[0].Supplier.id;
  if (selected.some((item) => item.Supplier.id !== supplierId)) throw new Error('Only one supplier per PO.');
  if (selected.some((item) => !validCost(STATE.costs.get(item.id) || ''))) throw new Error('Enter a positive purchase unit cost for every selected row.');
  if (selected.some((item) => !validPurchaseQty(item))) throw new Error('PO Qty must be a positive whole number.');
  return { selected, supplierId,
    rows: selected.map((item) => ({
      soId: String(item.Parent_Id.id),
      lineId: String(item.id),
      cost: costToCanonical(STATE.costs.get(item.id)),
      product: (item.Brand ? item.Brand + ' — ' : '') + getOfficialProductName(item),
      offer: getOfferProductName(item),
      qty: getPurchaseQty(item),
      total: getPurchaseQty(item) * Number(costToCanonical(STATE.costs.get(item.id)))
    }))
  };
}
async function loadEligibleExistingPOs(supplierCodeId) {
  // Function returns only PO ID, Subject and Status; real Vendor lookups are
  // never delivered to the widget or exposed to users without Vendor access.
  // Route through the already OAuth-enabled create endpoint. The server
  // recognizes this read-only command and delegates to the PO-list function.
  // This is NOT a create request and cannot create a Purchase Order.
  const response=await ZOHO.CRM.FUNCTIONS.execute(FUNCTION_API_NAME, {
    arguments: JSON.stringify({supplierCodeId: String(supplierCodeId),linesJson:'__PROCUREMENT_LIST_EXISTING_PO__'})
  });
  const result=functionResult(response);
  if(result.status!=='success' || !Array.isArray(result.pos))
    throw new Error(result.message || 'Could not load eligible Purchase Orders.');
  return result.pos
    .filter(po=>ELIGIBLE_PO_STATUSES.has(String(po.status||'')) && /^\d{15,20}$/.test(String(po.id||'')))
    .map(po=>({id:String(po.id),subject:String(po.subject||po.id),status:String(po.status)}))
    .sort((a,b)=>b.id.localeCompare(a.id));
}
async function openReview(mode='new') {
  try {
    STATE.targetMode = mode === 'existing' ? 'existing' : 'new';
    const review = buildReview();
    const poSelector=$('existingPoPicker');
    poSelector.classList.toggle('hidden',STATE.targetMode!=='existing');
    $('existingPoSelect').replaceChildren(new Option('Choose existing PO…',''));
    $('modalTitle').textContent=STATE.targetMode==='existing'?'Add items to existing PO':'Confirm purchase order';
    $('confirmCreateBtn').textContent=STATE.targetMode==='existing'?'Confirm & add items':'Confirm & create PO';
    const totalUnits = review.selected.reduce((s, item) => s + getPurchaseQty(item), 0);
    const total = review.rows.reduce((s, item) => s + item.total, 0);
    $('modalSubtitle').textContent = STATE.targetMode==='existing'?'Select an open PO for the same supplier. Existing PO items will be preserved.':'Verify supplier, quantities and purchase prices before creating the CRM record.';
    const unpaidOrders = new Map();
    for (const item of review.selected) {
      if (!isReady(item)) unpaidOrders.set(getOrderId(item), {number:getOrderName(item),status:getStatus(item)||'Not paid'});
    }
    const hasUnpaid = unpaidOrders.size > 0;
    const warning = $('unpaidOrderWarning');
    const checkbox = $('unpaidPaymentAck');
    checkbox.checked = false;
    warning.classList.toggle('hidden', !hasUnpaid);
    $('unpaidOrderList').replaceChildren();
    if (hasUnpaid) {
      for (const order of unpaidOrders.values()) {
        const li=document.createElement('li');
        li.textContent=order.number+' — '+order.status;
        $('unpaidOrderList').append(li);
      }
    }
    $('confirmCreateBtn').disabled=hasUnpaid || STATE.targetMode==='existing';

    $('summarySupplier').textContent = review.selected[0].Supplier.name;
    $('summaryOrders').textContent = String(new Set(review.rows.map((row) => row.soId)).size);
    $('summaryUnits').textContent = fmtNumber(totalUnits);
    $('summaryCost').textContent = fmtMoney(total);
    $('summaryRows').replaceChildren();
    for (const item of review.rows) {
      const tr = document.createElement('tr');
      const productCell=appendCell(tr, '', '');
      const official=document.createElement('div');
      official.className='review-official-product';
      official.textContent=item.product;
      const offer=document.createElement('div');
      offer.className='review-offer-product';
      offer.textContent='Customer offer: '+(item.offer || 'Not specified in SO');
      productCell.append(official,offer);
      appendCell(tr, 'numeric', fmtNumber(item.qty));
      appendCell(tr, 'numeric', fmtMoney(item.cost));
      appendCell(tr, 'numeric', fmtMoney(item.total));
      $('summaryRows').append(tr);
    }
    $('confirmModal').classList.remove('hidden');
    if (STATE.targetMode==='existing') {
      $('existingPoHelp').textContent='Loading matching Purchase Orders…';
      try {
        STATE.existingPOs=await loadEligibleExistingPOs(review.supplierId);
        if(STATE.targetMode!=='existing' || $('confirmModal').classList.contains('hidden')) return;
        for(const po of STATE.existingPOs)
          $('existingPoSelect').append(new Option(po.subject+' · '+po.status,po.id));
        $('existingPoHelp').textContent=STATE.existingPOs.length?STATE.existingPOs.length+' eligible PO(s) found.':'No matching PO found in allowed statuses (Created, Requested, Confirmed, Deposit paid, Partially Paid).';
        $('confirmCreateBtn').disabled=true;
      } catch(error) {
        $('existingPoHelp').textContent='Unable to load Purchase Orders: '+String(error.message||error);
        $('confirmCreateBtn').disabled=true;
      }
    }
  } catch (error) {
    showAlert(error.message, 'error');
  }
}
function closeReview() { if (!STATE.busy) $('confirmModal').classList.add('hidden'); }
function functionResult(apiResponse) {
  if (!apiResponse || String(apiResponse.code || '').toLowerCase() !== 'success') {
    throw new Error(apiResponse?.message || 'Zoho did not execute the function.');
  }
  let value = apiResponse?.details?.output;
  if (typeof value === 'string') {
    try { value = JSON.parse(value); }
    catch (error) { throw new Error('Unexpected function output: ' + value.slice(0, 300)); }
  }
  if (!value || typeof value !== 'object') throw new Error('The function returned no structured result. Check function logs.');
  return value;
}
function purchaseOrderUrl(id) {
  if (!/^\d{15,20}$/.test(String(id))) return '';
  return 'https://crm.zoho.com/crm/minmaxdeals/tab/PurchaseOrders/'+encodeURIComponent(String(id));
}
function addCreatedPoNotice(result, partial=false) {
  const holder=$('createdPoNotices');
  const entry=document.createElement('div');
  entry.className='created-po-notice'+(partial?' notice-warning':'');
  const label=document.createElement('span');
  label.textContent=(partial?'Check linking for ':(STATE.targetMode==='existing'?'Updated ':'Created '))+(result.poSubject || 'Purchase Order')+' · ';
  const link=document.createElement('a');
  link.href=purchaseOrderUrl(result.poId);
  link.target='_blank';
  link.rel='noopener noreferrer';
  link.textContent='Open PO ↗';
  const close=document.createElement('button');
  close.type='button';close.className='notice-close';
  close.setAttribute('aria-label','Dismiss Purchase Order notification');
  close.textContent='×';
  close.addEventListener('click',()=>entry.remove());
  entry.append(label,link,close);
  holder.prepend(entry);
}
async function createPurchaseOrder() {
  if (STATE.busy || STATE.lockedAfterPartial) return;
  let review;
  try { review=buildReview(); }
  catch(error) {closeReview();showAlert(error.message,'error');return;}
  const hasUnpaid=review.selected.some(item=>!isReady(item));
  const mode=STATE.targetMode;
  const chosenPO=STATE.existingPOs.find(po=>po.id===$('existingPoSelect').value);
  if(mode==='existing' && (!chosenPO || !ELIGIBLE_PO_STATUSES.has(chosenPO.status))){showAlert('Choose an eligible existing PO.','error');return;}
  if (hasUnpaid && !$('unpaidPaymentAck').checked) {
    $('confirmCreateBtn').disabled=true;
    return;
  }
  // Browsers block tabs opened after async calls. Open on user's confirmation click,
  // then navigate it only if Zoho actually created the PO.
  let poTab=null;
  try {poTab=window.open('about:blank','_blank');}
  catch(error){console.warn('Popup prevented:',error);}
  if(poTab) {
    try {poTab.document.title='Creating Purchase Order';poTab.document.body.textContent='Creating Purchase Order in Zoho CRM…';}
    catch(error){console.warn('Cannot set popup text:',error);}
  }
  setBusy(true);
  try {
    const acknowledgement=hasUnpaid && $('unpaidPaymentAck').checked;
    const payload={supplierCodeId:review.supplierId,linesJson:JSON.stringify(review.rows.map(({soId,lineId,cost,qty})=>({soId,lineId,cost,qty,paymentAcknowledged:acknowledgement})))};
    if(mode==='new') {
      // Backward-compatible envelope: does not change the existing two-argument
      // Deluge function or its split / list / append command routes.
      const ownerId=await resolveCurrentUserId();
      payload.linesJson='__PROCUREMENT_CREATE_FOR_USER__:'+JSON.stringify({ownerId,linesJson:payload.linesJson});
    }
    if(mode==='existing') {
      // Server dispatch: never call the REST-disabled append function directly.
      // Existing create logic remains unchanged for mode 'new'.
      payload.linesJson='__PROCUREMENT_ADD_EXISTING_PO__:'+JSON.stringify({poId:chosenPO.id,linesJson:payload.linesJson});
    }
    const response=await ZOHO.CRM.FUNCTIONS.execute(FUNCTION_API_NAME,{arguments:JSON.stringify(payload)});
    const result=functionResult(response);
    $('confirmModal').classList.add('hidden');
    if ((result.status==='success'||result.status==='partial')&&result.poId) {
      const dest=purchaseOrderUrl(result.poId);
      if (poTab && !poTab.closed) {
        try {poTab.location.replace(dest);} catch(error){console.warn('Popup navigation:',error);openRecord('Purchase_Orders',result.poId);}
      } else {
        openRecord('Purchase_Orders',result.poId);
      }
      addCreatedPoNotice(result,result.status==='partial');
      if(result.status==='success') {
        // Update the pending list *in place* rather than resetting or reloading the page.
        const bookedIds=new Set(review.selected.map(item=>item.id));
        STATE.items=STATE.items.filter(item=>!bookedIds.has(item.id));
        for(const id of bookedIds) {STATE.selected.delete(id);STATE.costs.delete(id);STATE.poQty.delete(id);}
        showAlert('');
      } else {
        STATE.lockedAfterPartial=true;
        showAlert(result.message || 'PO created, but source links need reconciliation. Do not create again.','error');
      }
    } else {
      if(poTab&&!poTab.closed) poTab.close();
      showAlert(result.message || 'Purchase Order was not created.','error');
    }
  } catch(error) {
    if(poTab&&!poTab.closed) poTab.close();
    console.error('[Procurement] PO creation failed',error);
    $('confirmModal').classList.add('hidden');
    const message=String(error?.message||error);
    const disabled=/api is inactive|inactive for the given custom function/i.test(message);
    showAlert(disabled?'Enable REST API OAuth for Procurement Create PO.': 'Unable to confirm result: '+message+'. Check Purchase Orders before trying again.','error');
    STATE.lockedAfterPartial=!disabled;
  } finally {setBusy(false);render();}
}

// Splitting is persisted by the server as two separate Sales Order line IDs.
// Never synthesize duplicate IDs in the browser or reuse the same SO line for two POs.
function splitLine() { return STATE.items.find(item=>item.id===STATE.splitItemId); }
function openSplit(item) {
  if (STATE.busy || STATE.lockedAfterPartial || !isSelectable(item) || !Number.isSafeInteger(item.Quantity) || item.Quantity < 2) return;
  STATE.splitItemId=item.id;
  $('splitLabel').textContent=getOrderName(item)+' · '+(item.Product_Name?.name||'Product')+' · '+fmtNumber(item.Quantity)+' units';
  $('splitQtyA').max=String(item.Quantity-1);
  $('splitQtyA').value=String(Math.floor(item.Quantity/2));
  for(const id of ['splitSupplierA','splitSupplierB']) {
    const select=$(id);
    select.replaceChildren(new Option('Choose supplier…',''));
    for(const code of STATE.supplierCodes) select.append(new Option(code.name,String(code.id)));
  }
  const current=String(item.Supplier?.id||'');
  $('splitSupplierA').value=current;
  $('splitSupplierB').value='';
  $('splitCostA').value=STATE.costs.get(item.id)||'';
  $('splitCostB').value='';
  $('splitError').textContent='';
  $('splitModal').classList.remove('hidden');
  window.ProcurementSearchSelect?.sync($('splitSupplierA'));
  window.ProcurementSearchSelect?.sync($('splitSupplierB'));
  recalculateSplit();
}
function closeSplit() {
  if (STATE.busy) return;
  $('splitModal').classList.add('hidden');
  STATE.splitItemId='';
}
function recalculateSplit() {
  const item=splitLine();
  if(!item)return;
  const a=Number($('splitQtyA').value);
  const b=Number(item.Quantity)-a;
  $('splitQtyB').value=Number.isSafeInteger(a)&&a>0&&b>0 ? String(b):'';
  validateSplit();
}
function validateSplit() {
  const item=splitLine();
  if(!item)return false;
  const first=Number($('splitQtyA').value);
  const second=Number(item.Quantity)-first;
  const a=$('splitSupplierA').value,b=$('splitSupplierB').value;
  let error='';
  if(!Number.isSafeInteger(first)||first<=0||!Number.isSafeInteger(second)||second<=0) error='Enter a positive whole number smaller than the original SO Qty.';
  else if(!a||!b) error='Choose both suppliers.';
  else if(a===b) error='Choose two different suppliers.';
  else if(!validCost($('splitCostA').value)||!validCost($('splitCostB').value)) error='Enter a positive unit cost for both suppliers.';
  $('splitSaveBtn').disabled=Boolean(error)||STATE.busy||STATE.lockedAfterPartial;
  $('splitError').textContent=error;
  return !error;
}
async function saveSplit() {
  if(STATE.busy||!validateSplit())return;
  const item=splitLine();
  if(!item)return;
  const soId=getOrderId(item), originalId=item.id;
  const firstQty=String(Number($('splitQtyA').value));
  const firstSupplierId=$('splitSupplierA').value,secondSupplierId=$('splitSupplierB').value;
  const firstCost=costToCanonical($('splitCostA').value),secondCost=costToCanonical($('splitCostB').value);
  // The Split modal is already the confirmation. Do not show a second native browser prompt.
  setBusy(true);
  $('splitSaveBtn').disabled=true;
  $('splitModal').classList.add('hidden');
  $('splitProgress').classList.remove('hidden');
  $('splitProgressElapsed').textContent='0s elapsed';
  const startedAt=Date.now();
  const progressInterval=window.setInterval(()=>{
    $('splitProgressElapsed').textContent=Math.floor((Date.now()-startedAt)/1000)+'s elapsed';
  },1000);
  showAlert('');
  try {
    render(); // Disable checkboxes and Split links while the CRM update is pending.
    // Allow the browser to paint the saving indicator before the slow CRM function runs.
    await new Promise(resolve=>window.requestAnimationFrame(()=>resolve()));
    const cmd='__PROCUREMENT_SPLIT_SO_LINE__:'+JSON.stringify({soId,lineId:originalId,firstQty,firstSupplierId,secondSupplierId,expectedQty:String(item.Quantity)});
    const response=await ZOHO.CRM.FUNCTIONS.execute(FUNCTION_API_NAME,{arguments:JSON.stringify({supplierCodeId:firstSupplierId,linesJson:cmd})});
    const result=functionResult(response);
    if(result.status!=='success') {
      if(result.status==='partial') STATE.lockedAfterPartial=true;
      throw new Error(result.message||'The Sales Order split was not verified.');
    }
    if(!SO_ID_PATTERN.test(String(result.newLineId||''))) throw new Error('Split response lacks verified new line ID. Refresh Sales Order before retrying.');
    STATE.splitItemId='';
    STATE.launchSoId=soId;
    // Reset focus guard before re-reading newly created CRM line IDs.
    STATE.focusLoading=false;
    await loadFocusedSO(soId);
    STATE.selected.clear();
    if(STATE.items.some(v=>v.id===originalId))STATE.selected.add(originalId);
    if(firstCost)STATE.costs.set(originalId,firstCost);
    if(secondCost)STATE.costs.set(String(result.newLineId),secondCost);
    showAlert('SO split saved: '+firstQty+' units with '+(result.firstSupplierName||'supplier 1')+'; '+result.secondQty+' units with '+(result.secondSupplierName||'supplier 2')+'. Choose a supplier group, then create the PO.','success');
  } catch(error) {
    console.error('[Procurement] Split failed',error);
    $('splitError').textContent=String(error?.message||error);
    showAlert('SO split: '+String(error?.message||error),'error');
  } finally {
    window.clearInterval(progressInterval);
    $('splitProgress').classList.add('hidden');
    setBusy(false);
    render();
    validateSplit();
  }
}

async function startup() {
  window.ProcurementSearchSelect?.enhance($('soFilter'), { label: 'By Order Number' });
  window.ProcurementSearchSelect?.enhance($('supplierFilter'), { label: 'By Supplier' });
  window.ProcurementSearchSelect?.enhance($('clientFilter'), { label: 'By Client' });
  window.ProcurementSearchSelect?.enhance($('splitSupplierA'), { label: 'First supplier' });
  window.ProcurementSearchSelect?.enhance($('splitSupplierB'), { label: 'Second supplier' });
  $('openPricePasteBtn').addEventListener('click',openCostPastePanel);
  $('applyPricePasteBtn').addEventListener('click',pasteCostColumnFromPanel);
  $('cancelPricePasteBtn').addEventListener('click',closeCostPastePanel);
  $('priceColumnText').addEventListener('keydown',ev=>{
    if(ev.key==='Escape'){ev.preventDefault();closeCostPastePanel();}
  });
  $('refreshBtn').addEventListener('click', () => STATE.launchSoId ? loadFocusedSO(STATE.launchSoId) : loadData(true));
  $('loadMoreBtn').addEventListener('click', () => loadData(false));
  $('searchInput').addEventListener('input', render);
  $('soFilter').addEventListener('change', render);
  $('toggleGroupsBtn').addEventListener('click',()=>{
    const ids=new Set(getVisibleItems().map(getOrderId));
    const fullyCollapsed=[...ids].every(id=>STATE.collapsedSO.has(id));
    for (const id of ids){if(fullyCollapsed)STATE.collapsedSO.delete(id);else STATE.collapsedSO.add(id);}
    render();
  });
  $('viewGroupedBtn').addEventListener('click',()=>{STATE.viewMode='grouped';render();});
  $('viewFlatBtn').addEventListener('click',()=>{STATE.viewMode='flat';render();});
  $('supplierFilter').addEventListener('change', render);
  $('clientFilter').addEventListener('change',render);
  $('statusFilter').addEventListener('change', render);
  $('clearFiltersBtn').addEventListener('click', () => {
    $('searchInput').value = '';
    $('supplierFilter').value = '';
    $('clientFilter').value = '';
    $('soFilter').value = '';
    $('statusFilter').value = 'all';
    // Explicit reset leaves the SO-specific launch view and shows all demand.
    STATE.launchSoId = '';
    STATE.focusedSoId = '';
    loadData(true);
  });
  $('splitQtyA').addEventListener('input',recalculateSplit);
  $('splitSupplierA').addEventListener('change',validateSplit);
  $('splitSupplierB').addEventListener('change',validateSplit);
  $('splitCostA').addEventListener('input',validateSplit);
  $('splitCostB').addEventListener('input',validateSplit);
  $('splitSaveBtn').addEventListener('click',saveSplit);
  $('splitCancelBtn').addEventListener('click',closeSplit);
  $('splitCloseBtn').addEventListener('click',closeSplit);
  $('splitModal').addEventListener('click',e=>{if(e.target===$('splitModal')) closeSplit();});
  $('selectAll').addEventListener('change', (ev) => selectAllVisible(ev.target.checked));
  $('createPoBtn').addEventListener('click',()=>openReview('new'));
  $('existingPoBtn').addEventListener('click',()=>openReview('existing'));
  const canConfirm=()=>!STATE.busy && (STATE.targetMode!=='existing'||Boolean($('existingPoSelect').value)) && (!getSelectedItems().some(x=>!isReady(x))||$('unpaidPaymentAck').checked);
  $('existingPoSelect').addEventListener('change',()=>{$('confirmCreateBtn').disabled=!canConfirm();});
  $('closeModalBtn').addEventListener('click', closeReview);
  $('cancelModalBtn').addEventListener('click', closeReview);
  $('confirmCreateBtn').addEventListener('click', createPurchaseOrder);
  $('unpaidPaymentAck').addEventListener('change',()=>{
    $('confirmCreateBtn').disabled=!canConfirm();
  });
  $('confirmModal').addEventListener('click', (ev) => { if (ev.target === $('confirmModal')) closeReview(); });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') {closeReview();closeSplit();} });
  if (!window.ZOHO?.embeddedApp || !window.ZOHO?.CRM?.FUNCTIONS?.execute) {
    connection('error', 'Zoho SDK unavailable');
    showAlert('Zoho CRM SDK failed to load. Open this page as an Internal Widget inside Zoho CRM, not as a local HTML file.', 'error');
    return;
  }
  try {
    STATE.launchSoId = getLaunchSoId();
    ZOHO.embeddedApp.on('PageLoad', onWidgetPageLoad);
    await ZOHO.embeddedApp.init();
    STATE.ready = true;
    try { await resolveCurrentUserId(); }
    catch(error) { console.warn('[Procurement] Current CRM user not yet resolved:',error); }
  // Resolve full names even when SO owner lookup returns surname only.
  loadOwnerNames();
    let supplierError='';
    try {
      const response=await ZOHO.CRM.FUNCTIONS.execute(SUPPLIER_CODES_FUNCTION,{arguments:JSON.stringify({})});
      const codesResult=functionResult(response);
      if(codesResult.status!=='success'||!Array.isArray(codesResult.codes)) throw new Error(codesResult.message||'Invalid supplier code list.');
      STATE.supplierCodes=codesResult.codes.sort((a,b)=>String(a.name).localeCompare(String(b.name)));
    } catch(error){
      supplierError=String(error?.message||error);
      console.error('[Procurement] Supplier codes failed',error);
    }
    // WebTab PageLoad may be delivered during or immediately after init.
    // If a specific SO was supplied, resolve it before loading generic demand.
    if (STATE.launchSoId) await loadFocusedSO(STATE.launchSoId);
    else await loadData(true);
    if(supplierError) {
      const disabled=/api is inactive|inactive for the given custom function/i.test(supplierError);
      showAlert((disabled?'Supplier selection is unavailable: enable OAuth 2.0 REST API for Procurement Get Supplier Codes and Procurement Assign Supplier in Developer Hub → Functions. ':'Supplier Code list unavailable: ')+supplierError,'error');
    }
  } catch (error) {
    connection('error', 'Initialization failed');
    showAlert('Zoho Widget initialization failed: ' + (error?.message || String(error)), 'error');
    console.error('[Procurement] SDK init failure', error);
  }
}
document.addEventListener('DOMContentLoaded', startup);
