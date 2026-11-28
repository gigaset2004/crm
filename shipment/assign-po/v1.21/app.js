/*
 * Shipment Add Purchase Orders v1.21
 * The new Shipment_PO_Links module stores the many-to-many relation.
 * Preserves existing Blueprint and product sync, adds Pickup Locations sync from linked PO and Vendor.
 */
(() => {
  "use strict";

  const MODULE = "Shipments";
  const PO_MODULE = "Purchase_Orders";
  const LINK_MODULE = "Shipment_PO_Links";
  const RELATED_LIST = "Purchase_Orders";
  const PAGE_SIZE = 5; // PO list scrolls inside the widget; action buttons remain visible
  const LINK_PAGE_SIZE = 200;
  const BLUEPRINT_MODE = document.body.dataset.mode === "blueprint";
  const STATUS_LABELS = Object.freeze({
    "Approved": "Requested",
    "Invoice received": "Confirmed",
    "Cancelled": "Canceled"
  });
  // Exact CRM picklist colours, read from Purchase_Orders.Accounting_status metadata.
  const ACCOUNTING_COLORS = Object.freeze({
    "No deposit required": "#ffda62",
    "To Pay Deposit": "#5cb3fd",
    "Deposit Paid": "#f5c72f",
    "To Pay Balance": "#5cb3fd",
    "To Pay": "#5cb3fd",
    "To Pay Full": "#5cb3fd", // API actual value for display label "To Pay"
    "Partially Paid": "#f5c72f",
    "Paid": "#67c480"
  });
  const ACCOUNTING_LABELS = Object.freeze({"To Pay Full": "To Pay"});
  const STATUS_COLORS = Object.freeze({
    "Created": "#dbdbdb",
    "Requested": "#f5c72f",
    "Approved": "#f5c72f",
    "Confirmed": "#5cb3fd",
    "Invoice received": "#5cb3fd",
    "Ordered": "#67c480",
    "Closed": "#dbdbdb",
    "Canceled": "#eb4d4d",
    "Cancelled": "#eb4d4d",
    "Delivered": "#ffda62",
    "Claim": "#98d681",
    "Deposit paid": "#fea36a",
    "Info requested": "#98d681",
    "Paid": "#c9ba46",
    "Partially Delivered": "#168aef",
    "Partially Paid": "#ffd6bc",
    "To Pay": "#4137be"
  });
  const state = {
    shipmentId: null,
    shipment: null,
    links: [],
    items: [],
    selected: new Set(),
    page: 1,
    hasMore: false,
    query: "",
    busy: false
  };
  const el = id => document.getElementById(id);
  const idOf = value => String(Array.isArray(value) ? value[0] : (value || "")).trim();
  const validId = value => /^\d{15,20}$/.test(String(value || ""));
  const text = value => value == null ? "" : String(value);
  const lookupId = value => value && typeof value === "object" ? idOf(value.id) : idOf(value);
  const getData = response => Array.isArray(response?.data) ? response.data : Array.isArray(response) ? response : [];
  const isNoRecords = response => response == null || response?.status === 204 || response?.code === "NO_CONTENT" || response?.code === "NO_RECORDS";
  const failure = response => {
    const item = response?.data?.[0] || response;
    return item?.message || item?.code || "Zoho CRM did not confirm the action.";
  };
  const ok = response => (response?.data?.[0]?.code || response?.code) === "SUCCESS";

  function setBusy(value) {
    state.busy = !!value;
    for (const id of ["refresh", "search", "doSearch", "prev", "next", "add", "selectAll"]) {
      el(id).disabled = !!value;
    }
    for (const button of document.querySelectorAll("#linkedList button[data-po-id]")) {
      button.disabled = !!value || hasShipmentLineFor(button.dataset.poId);
    }
    refreshSelection();
  }
  function message(str, kind = "") {
    const box = el("message");
    box.textContent = str;
    box.className = "message" + (kind ? " " + kind : "");
    box.hidden = !str;
  }
  function cell(value, cls = "") {
    const td = document.createElement("td");
    td.textContent = text(value);
    if (cls) td.className = cls;
    return td;
  }
  function recordUrl(id) {
    return "https://crm.zoho.com/crm/minmaxdeals/tab/PurchaseOrders/" + encodeURIComponent(id);
  }
  function vendorUrl(id) {
    return "https://crm.zoho.com/crm/minmaxdeals/tab/Vendors/" + encodeURIComponent(id);
  }
  function addRecordAnchor(holder, url, label) {
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = label;
    holder.appendChild(a);
  }
  function addPOAnchor(holder, id, label) {
    addRecordAnchor(holder, recordUrl(id), label || id);
  }
  function addVendorAnchor(holder, po) {
    const id = lookupId(po?.Vendor_Name);
    const name = vendorName(po) || "Supplier not specified";
    if (validId(id)) {
      addRecordAnchor(holder, vendorUrl(id), name);
    } else {
      holder.textContent = name;
    }
  }
  function poName(po) {return text(po?.Subject || po?.Purchase_Order?.name || po?.Name || po?.id);}
  function vendorName(po) {return text(po?.Vendor_Name?.name || po?.Vendor_Name || "");}
  function ownerName(po) {
    const owner = po?.Owner;
    return nonblank(owner && typeof owner === "object" ? owner.name : owner) || "—";
  }
  function createdDate(po) {
    const raw = nonblank(po?.Created_Time);
    if (!raw) return "—";
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return raw.slice(0, 10);
    return date.toLocaleDateString("en-US", {month:"short",day:"numeric",year:"numeric"});
  }
  function addBadge(holder, value, colors, labels = {}) {
    const raw = nonblank(value);
    if (!raw || raw === "-None-") { holder.textContent = "—"; return; }
    const badge = document.createElement("span");
    badge.className = "status";
    badge.textContent = labels[raw] || raw;
    if (colors[raw]) {
      badge.style.backgroundColor = colors[raw];
      badge.style.color = ["Canceled","Cancelled","Partially Delivered","To Pay"].includes(raw) && colors === STATUS_COLORS ? "#ffffff" : "#24313c";
    }
    holder.appendChild(badge);
  }

  // One Pickup Location display per PO. Never display purchase prices to Logistics.
  const warehouseRequestCache = new Map();
  const nonblank = value => text(value).trim();
  function pickupDisplay(po) {
    const selection = nonblank(po?.Pickup_Location);
    if (selection === "Other Location") {
      return {type:"custom",label:"Custom",address:nonblank(po?.Other_Pickup_Location) || "Address not specified"};
    }
    if (selection === "Supplier Warehouse") {
      return {type:"warehouse",label:"Warehouse",address:nonblank(po?.__pickupWarehouse?.location) || "Address not specified"};
    }
    return {type:"unset",label:"Not set",address:""};
  }
  function warehouseLocationFromVendor(vendor) {
    if (!vendor) return {location:""};
    const same = nonblank(vendor.Warehouse_Address_is_the_Same_as_business_address).toLowerCase() === "yes";
    const warehouseCity = nonblank(vendor.Warehouse_City);
    const warehouseCountry = nonblank(vendor.Warehouse_Country);
    const city = same ? (nonblank(vendor.City) || warehouseCity) : warehouseCity;
    const country = same ? (nonblank(vendor.Country) || warehouseCountry) : warehouseCountry;
    return {location:[city,country].filter(Boolean).join(", ")};
  }
  async function fetchWarehouseLocation(vendorId) {
    if (!validId(vendorId)) return {location:""};
    if (!warehouseRequestCache.has(vendorId)) {
      warehouseRequestCache.set(vendorId,
        ZOHO.CRM.API.getRecord({Entity:"Vendors",RecordID:vendorId})
          .then(res => warehouseLocationFromVendor(getData(res)[0]))
          .catch(error => {
            console.warn("Could not load supplier warehouse location", vendorId, error);
            return {location:""};
          })
      );
    }
    return warehouseRequestCache.get(vendorId);
  }
  // Some list API responses omit extended values. Enrich only incomplete rows.
  // Individual PO fetches happen in parallel and do not expose pricing in the UI.
  async function addMissingPOFields(items) {
    await Promise.all(items.map(async po => {
      if (po?.Owner && po?.Created_Time && po?.Accounting_status !== undefined) return;
      try {
        const response = await ZOHO.CRM.API.getRecord({Entity:PO_MODULE,RecordID:idOf(po.id)});
        const full = getData(response)[0];
        if (!full) return;
        for (const key of ["Owner","Created_Time","Accounting_status"]) {
          if (po[key] === undefined || po[key] === null) po[key] = full[key];
        }
      } catch (error) {
        console.warn("Could not load PO owner / date / accounting status", po.id, error);
      }
    }));
  }
  async function addPickupLocationsToCandidates(items) {
    await Promise.all(items.map(async po => {
      if (nonblank(po?.Pickup_Location) !== "Supplier Warehouse") return;
      po.__pickupWarehouse = await fetchWarehouseLocation(lookupId(po?.Vendor_Name));
    }));
  }

  async function getAllLinks() {
    const all = [];
    for (let page = 1; page <= 10; page++) {
      const response = await ZOHO.CRM.API.getRelatedRecords({
        Entity: MODULE, RecordID: state.shipmentId, RelatedList: RELATED_LIST,
        page, per_page: LINK_PAGE_SIZE
      });
      if (isNoRecords(response)) break;
      if (response?.code && !Array.isArray(response?.data)) throw new Error("Cannot read PO links: " + failure(response));
      const rows = getData(response);
      for (const record of rows) {
        const poId = lookupId(record.Purchase_Order);
        if (validId(poId) && validId(record.id)) {
          all.push({
            id: idOf(record.id),
            poId,
            subject: text(record.Purchase_Order?.name || poId)
          });
        }
      }
      if (!response?.info?.more_records) break;
      if (page === 10) throw new Error("Too many linked POs; use a smaller Shipment or extend pagination.");
    }
    // Some Blueprint widget contexts return an empty Related List response while
    // the CRM record's related list contains rows. Cross-check with COQL.
    if (!all.length && typeof ZOHO.CRM?.API?.coql === "function") {
      try {
        const query = "select id, Purchase_Order from " + LINK_MODULE +
          " where Shipment = '" + state.shipmentId + "' limit 0, 2000";
        const response = await ZOHO.CRM.API.coql({select_query:query});
        if (response?.code && !isNoRecords(response) && !Array.isArray(response?.data)) {
          throw new Error(failure(response));
        }
        for (const record of getData(response)) {
          const poId = lookupId(record.Purchase_Order);
          if (validId(poId) && validId(record.id)) {
            all.push({
              id: idOf(record.id), poId,
              subject: text(record.Purchase_Order?.name || poId)
            });
          }
        }
      } catch(error) {
        console.warn("COQL fallback unavailable; retaining related-list results:",error);
      }
    }
    return all;
  }

  async function loadLinked() {
    state.links = await getAllLinks();
    el("linkedCount").textContent = state.links.length;
    const container = el("linkedList");
    container.replaceChildren();
    if (!state.links.length) {
      container.textContent = "No Purchase Orders linked yet.";
      refreshSelection();
      return;
    }
    for (const link of state.links) {
      const row = document.createElement("div");
      row.className = "linked-item";
      const left = document.createElement("div");
      addPOAnchor(left, link.poId, link.subject);
      row.appendChild(left);
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "secondary";
      remove.dataset.poId = link.poId;
      remove.textContent = "Remove";
      remove.disabled = state.busy || hasShipmentLineFor(link.poId);
      remove.title = remove.disabled ? "This PO is used in Shipped Products" : "Unlink this PO from the Shipment";
      remove.addEventListener("click", () => removePO(link));
      row.appendChild(remove);
      container.appendChild(row);
    }
    refreshSelection();
  }
  function hasShipmentLineFor(poId) {
    const lines = Array.isArray(state.shipment?.Shipped_Products) ? state.shipment.Shipped_Products : [];
    return lines.some(line => lookupId(line?.Purchase_Order) === poId);
  }

  async function loadCandidates() {
    const query = state.query.trim();
    let response;
    if (query) {
      response = await ZOHO.CRM.API.searchRecord({
        Entity: PO_MODULE, Type: "criteria", Query: "(Subject:starts_with:" + query.replace(/[()\\]/g, "") + ")", delay: false
      }, state.page, PAGE_SIZE);
    } else {
      response = await ZOHO.CRM.API.getAllRecords({Entity: PO_MODULE, page: state.page, per_page: PAGE_SIZE, sort_order: "desc"});
    }
    if (isNoRecords(response)) {
      state.items = [];
      state.hasMore = false;
    } else if (response?.code && !Array.isArray(response?.data)) {
      throw new Error("Cannot load Purchase Orders: " + failure(response));
    } else {
      state.items = getData(response).filter(po => po?.id && String(po?.Status || "").toLowerCase() !== "cancelled");
      state.hasMore = !!response?.info?.more_records;
    }
    await Promise.all([
      addPickupLocationsToCandidates(state.items),
      addMissingPOFields(state.items)
    ]);
    drawCandidates();
  }

  // v1.10: card-only presentation; the CRM read/write and Blueprint logic are unchanged.
  function drawCandidates() {
    const container = el("poRows");
    container.replaceChildren();
    const linked = new Set(state.links.map(link => link.poId));
    for (const po of state.items) {
      const id = idOf(po.id);
      const isLinked = linked.has(id);
      const card = document.createElement("article");
      card.className = "po-card" + (isLinked ? " linked" : "");

      const check = document.createElement("div");
      check.className = "po-card-check";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = id;
      input.checked = state.selected.has(id);
      input.disabled = isLinked || state.busy;
      input.setAttribute("aria-label", "Select " + poName(po));
      input.addEventListener("change", e => {
        if (e.target.checked) state.selected.add(id); else state.selected.delete(id);
        refreshSelection();
      });
      check.appendChild(input);
      card.appendChild(check);

      const identity = document.createElement("div");
      identity.className = "po-card-identity";
      const poHeading = document.createElement("div");
      poHeading.className = "po-card-title";
      addPOAnchor(poHeading, id, poName(po));
      if (isLinked) {
        const marker = document.createElement("span");
        marker.className = "linked-details";
        marker.textContent = "Linked";
        poHeading.appendChild(marker);
      }
      identity.appendChild(poHeading);
      const supplier = document.createElement("div");
      supplier.className = "po-card-supplier";
      addVendorAnchor(supplier, po);
      identity.appendChild(supplier);
      card.appendChild(identity);

      const badges = document.createElement("div");
      badges.className = "po-card-badges";
      for (const field of [
        {label:"PO", value:po.Status, colors:STATUS_COLORS, labels:STATUS_LABELS},
        {label:"Accounting", value:po.Accounting_status, colors:ACCOUNTING_COLORS, labels:ACCOUNTING_LABELS}
      ]) {
        const badgeField = document.createElement("div");
        badgeField.className = "po-card-badge-field";
        const label = document.createElement("span");
        label.className = "po-card-label";
        label.textContent = field.label;
        badgeField.appendChild(label);
        const badgeHolder = document.createElement("span");
        addBadge(badgeHolder, field.value, field.colors, field.labels);
        badgeField.appendChild(badgeHolder);
        badges.appendChild(badgeField);
      }
      card.appendChild(badges);

      const pickup = document.createElement("div");
      pickup.className = "po-card-pickup";
      const pickupLabel = document.createElement("span");
      pickupLabel.className = "po-card-label";
      pickupLabel.textContent = "Pickup";
      pickup.appendChild(pickupLabel);
      const pickupInfo = pickupDisplay(po);
      const pickupKind = document.createElement("span");
      pickupKind.className = "pickup-kind pickup-kind-" + pickupInfo.type;
      pickupKind.textContent = pickupInfo.label;
      pickup.appendChild(pickupKind);
      if (pickupInfo.address) {
        const pickupText = document.createElement("span");
        pickupText.className = "po-pickup-value";
        pickupText.textContent = pickupInfo.address;
        pickupText.title = pickupInfo.address;
        pickup.appendChild(pickupText);
      }
      card.appendChild(pickup);

      const meta = document.createElement("div");
      meta.className = "po-card-meta";
      for (const field of [{label:"Owner",value:ownerName(po)},{label:"Created",value:createdDate(po)}]) {
        const item = document.createElement("span");
        item.className = "po-card-meta-item";
        const label = document.createElement("span");
        label.className = "po-card-label";
        label.textContent = field.label;
        item.appendChild(label);
        const value = document.createElement("span");
        value.textContent = field.value;
        item.appendChild(value);
        meta.appendChild(item);
      }
      card.appendChild(meta);
      container.appendChild(card);
    }
    if (!state.items.length) {
      const empty = document.createElement("div");
      empty.className = "no-data muted";
      empty.textContent = "No matching Purchase Orders.";
      container.appendChild(empty);
    }
    el("pageText").textContent = "Page " + state.page;
    el("pageInfo").textContent = state.items.length + " shown";
    el("prev").disabled = state.busy || state.page <= 1;
    el("next").disabled = state.busy || !state.hasMore;
    refreshSelection();
  }

  function refreshSelection() {
    el("selectedCount").textContent = state.selected.size + " selected";
    el("add").disabled = state.busy || state.selected.size === 0 || !state.shipmentId;
    if (BLUEPRINT_MODE) {
      el("proceed").disabled = state.busy || state.links.length === 0 || !state.shipmentId;
      el("proceedHelp").textContent = state.links.length
        ? state.links.length + " PO linked. Ready to complete."
        : "Add at least one PO to continue.";
    }
    const available = state.items.filter(po => !state.links.some(link => link.poId === idOf(po.id)));
    el("selectAll").checked = available.length > 0 && available.every(po => state.selected.has(idOf(po.id)));
    el("selectAll").indeterminate = available.some(po => state.selected.has(idOf(po.id))) && !el("selectAll").checked;
    for (const input of document.querySelectorAll("#poRows input[type=checkbox]")) {
      const linkExists = state.links.some(x => x.poId === input.value);
      input.disabled = state.busy || linkExists;
      input.checked = state.selected.has(input.value) && !linkExists;
    }
  }

  function parseIds(value) {return Array.from(new Set((text(value).match(/\d{15,20}/g) || [])));}
  async function syncShipmentMirror(removedPoId = null) {
    // Preserve existing legacy references which are not yet stored in the new link module.
    const current = await ZOHO.CRM.API.getRecord({Entity:MODULE,RecordID:state.shipmentId});
    const latestShipment = getData(current)[0];
    if (!latestShipment) throw new Error("Cannot read current Shipment before syncing PO IDs.");
    const oldIds = parseIds(latestShipment.POs_IDs);
    const singlePO = lookupId(latestShipment.Purchase_Order);
    if (validId(singlePO)) oldIds.push(singlePO);
    const all = new Set([...oldIds,...state.links.map(link => link.poId)]);
    if (removedPoId && removedPoId !== singlePO && !state.links.some(link => link.poId === removedPoId)) {
      all.delete(removedPoId);
    }
    const value = [...all].join(",");
    const result = await ZOHO.CRM.API.updateRecord({
      Entity: MODULE, APIData:{id:state.shipmentId,POs_IDs:value},Trigger:[]
    });
    if (!ok(result)) throw new Error("POs IDs field not updated: " + failure(result));
    if (state.shipment) state.shipment.POs_IDs = value;
  }
  async function syncPOMirror(poId, add) {
    const response = await ZOHO.CRM.API.getRecord({Entity: PO_MODULE, RecordID: poId});
    const po = getData(response)[0];
    if (!po) throw new Error("Cannot read Purchase Order " + poId);
    const old = text(po.Shipments_IDs);
    const ids = parseIds(old);
    if (add) {
      if (!ids.includes(state.shipmentId)) ids.push(state.shipmentId);
    } else {
      const idx = ids.indexOf(state.shipmentId);
      if (idx >= 0) ids.splice(idx,1);
    }
    // If the existing field has non-ID content, do not overwrite it.
    const leftover = old.replace(/\d{15,20}/g, "").replace(/[\s,;|]+/g, "");
    if (leftover !== "") throw new Error("PO " + poName(po) + " has a nonstandard Shipments IDs field. Its value was not overwritten.");
    const result = await ZOHO.CRM.API.updateRecord({
      Entity: PO_MODULE, APIData:{id:poId,Shipments_IDs:ids.join(",")},Trigger:[]
    });
    if (!ok(result)) throw new Error("PO reverse link not updated: " + failure(result));
  }

  // Shipment Products Sync v1.0: populate the existing Shipped_Products subform
  // directly from the linked Purchase Orders. Product lookup is the official
  // CRM name; Offer_Product_Name is copied separately from each PO line.
  // Existing quantities (especially Fact_Qty), inventory fields, claims and
  // logistics statuses are NEVER overwritten or deleted.
  async function syncShipmentProducts() {
    const shipmentResponse = await ZOHO.CRM.API.getRecord({Entity:MODULE,RecordID:state.shipmentId});
    const latest = getData(shipmentResponse)[0];
    if (!latest) throw new Error("Cannot read Shipment for product synchronization.");
    const existing = Array.isArray(latest.Shipped_Products) ? latest.Shipped_Products : [];
    const linkedPOs = await getAllLinks();
    if (!linkedPOs.length) return {created:0,updated:0,total:existing.length};
    const incoming = [];
    const errors = [];
    for (const link of linkedPOs) {
      const poResponse = await ZOHO.CRM.API.getRecord({Entity:PO_MODULE,RecordID:link.poId});
      const po = getData(poResponse)[0];
      if (!po) { errors.push("Cannot read PO " + link.subject); continue; }
      const lines = Array.isArray(po.Purchase_Items) ? po.Purchase_Items : [];
      if (!lines.length) { errors.push("No Purchase Items in " + poName(po)); continue; }
      for (const line of lines) {
        const lineId = idOf(line.id);
        const productId = lookupId(line.Product_Name);
        const quantity = Number(line.Quantity);
        if (!validId(lineId) || !validId(productId)) {
          errors.push(poName(po) + ": a purchase item has no valid Product or line ID");
          continue;
        }
        if (!Number.isSafeInteger(quantity) || quantity < 0) {
          errors.push(poName(po) + ": PO item " + lineId + " has invalid quantity (Shipped Products requires an integer)");
          continue;
        }
        incoming.push({
          lineId, productId, poId:link.poId, quantity,
          offer:nonblank(line.Offer_Product_Name),
          upc:nonblank(line.UPC), brand:nonblank(line.Brand)
        });
      }
    }
    if (errors.length) throw new Error("Products were not synchronized: " + errors.slice(0,5).join("; "));

    // v1.20: Source_PO_Item_ID is no longer a visible subform field.
    // Match by the linked PO + official Product lookup, preserving the exact
    // number of rows even when the same Product occurs multiple times in a PO.
    // First match by offer/UPC/brand; then match remaining rows by PO + Product.
    // Never overwrite existing quantities, inventory, claims or logistics data.
    const incomingByPair = new Map();
    for (const item of incoming) {
      const key = item.poId + "|" + item.productId;
      if (!incomingByPair.has(key)) incomingByPair.set(key,[]);
      incomingByPair.get(key).push(item);
    }
    const existingByPair = new Map();
    for (const row of existing) {
      const poId = lookupId(row.Purchase_Order);
      const productId = lookupId(row.Product);
      if (!validId(poId) || !validId(productId)) continue;
      const key = poId + "|" + productId;
      if (!existingByPair.has(key)) existingByPair.set(key,[]);
      existingByPair.get(key).push(row);
    }
    const normalize = value => nonblank(value).trim().toLowerCase();
    const matches = (item,row) => normalize(row.Offer_Product_Name) === normalize(item.offer)
      && normalize(row.UPC) === normalize(item.upc)
      && normalize(row.Brand) === normalize(item.brand);
    const changes = [];
    let created = 0;
    const updated = 0;
    for (const [key,group] of incomingByPair) {
      const unmatched = group.slice();
      const candidates = (existingByPair.get(key)||[]).slice();
      // Prefer exact row matches to handle repeated Products with different offers.
      for (let i=unmatched.length-1;i>=0;i--) {
        const j = candidates.findIndex(row => matches(unmatched[i],row));
        if (j>=0) {
          candidates.splice(j,1);
          unmatched.splice(i,1);
        }
      }
      // Existing edited rows are still valid; do not overwrite Qty or offer names.
      while (candidates.length && unmatched.length) {
        candidates.shift();
        unmatched.shift();
      }
      for (const item of unmatched) {
        const row = {
          Product:{id:item.productId}, Purchase_Order:{id:item.poId},
          Plan_Qty:item.quantity
        };
        if (item.offer) row.Offer_Product_Name = item.offer;
        if (item.upc) row.UPC = item.upc;
        if (item.brand) row.Brand = item.brand;
        changes.push(row);
        created++;
      }
    }

    // A standard Zoho CRM subform is limited to at most 100 entries.
    // Abort BEFORE saving any rows rather than partially importing a large PO.
    if (existing.length + created > 100) {
      throw new Error("Shipment supports up to 100 product rows in Shipped Products. This PO would require " + (existing.length + created) + ". Split into multiple Shipments or use a dedicated Shipment Items module.");
    }
    // Zoho V8 appends new subform rows and updates only rows with an ID; it
    // preserves all untouched lines. Never send an empty subform array (that
    // would delete every row), and batch large shipments for API safety.
    for (let start=0; start<changes.length; start+=50) {
      const batch=changes.slice(start,start+50);
      const updateResponse = await ZOHO.CRM.API.updateRecord({
        Entity:MODULE,APIData:{id:state.shipmentId,Shipped_Products:batch},Trigger:[]
      });
      if (!ok(updateResponse)) {
        throw new Error("Shipment Products sync failed after " + start + " rows: " + failure(updateResponse) + ". Existing rows were preserved; retry is safe.");
      }
    }
    const afterResponse = await ZOHO.CRM.API.getRecord({Entity:MODULE,RecordID:state.shipmentId});
    const after = getData(afterResponse)[0];
    if (!after) throw new Error("Shipment Products updated, but the record could not be reopened for verification.");
    const shipped = Array.isArray(after.Shipped_Products) ? after.Shipped_Products : [];
    // Verify row counts per PO + Product. This remains safe when internal source
    // IDs are removed from the layout and excluded from CRM record responses.
    const afterCountByPair = new Map();
    for (const row of shipped) {
      const key = lookupId(row.Purchase_Order) + "|" + lookupId(row.Product);
      afterCountByPair.set(key,(afterCountByPair.get(key)||0)+1);
    }
    for (const [key,items] of incomingByPair) {
      if ((afterCountByPair.get(key)||0) < items.length) {
        throw new Error("Product lines for PO + Product " + key + " could not be verified. Retry synchronization before completing Blueprint.");
      }
    }
    state.shipment = after;
    return {created,updated,total:shipped.length};
  }


  // Pickup Locations Sync v1.21: one PO lookup per row.
  // Keep human changes. The PO's Supplier_invoice is copied into Pickup_Reference.
  const pickupVendorDetailsCache = new Map();
  async function pickupVendorDetails(vendorId) {
    if (!validId(vendorId)) return null;
    if (!pickupVendorDetailsCache.has(vendorId)) {
      pickupVendorDetailsCache.set(vendorId,
        ZOHO.CRM.API.getRecord({Entity:"Vendors",RecordID:vendorId})
          .then(response => {
            const vendor = getData(response)[0];
            if (!vendor) throw new Error("Vendor " + vendorId + " could not be loaded");
            return vendor;
          })
          .catch(error => {
            pickupVendorDetailsCache.delete(vendorId);
            throw error;
          })
      );
    }
    return pickupVendorDetailsCache.get(vendorId);
  }
  function composePickupAddress(po,vendor) {
    const selection = nonblank(po?.Pickup_Location);
    if (selection === "Other Location") return nonblank(po?.Other_Pickup_Location);
    if (selection !== "Supplier Warehouse" || !vendor) return "";
    const same = nonblank(vendor.Warehouse_Address_is_the_Same_as_business_address).toLowerCase()==="yes";
    const address = [
      same ? vendor.Street : vendor.Warehouse_Street,
      same ? vendor.City : vendor.Warehouse_City,
      same ? vendor.State : vendor.Warehouse_State,
      same ? vendor.Zip_Code : vendor.Warehouse_Zip,
      same ? vendor.Country : vendor.Warehouse_Country
    ].map(nonblank).filter(Boolean).join(", ");
    return address || nonblank(vendor.Logistics_Address_Combined);
  }
  async function syncShipmentPickups() {
    const snapshotResponse = await ZOHO.CRM.API.getRecord({Entity:MODULE,RecordID:state.shipmentId});
    const shipment = getData(snapshotResponse)[0];
    if (!shipment) throw new Error("Cannot read Shipment before Pickup Locations synchronization.");
    const rows = Array.isArray(shipment.Pickup_Locations) ? shipment.Pickup_Locations : [];
    const links = await getAllLinks();
    if (!links.length) return {created:0,filled:0,total:rows.length};
    const existingByPO = new Map();
    for (const row of rows) {
      const poId = lookupId(row.Purchase_Order);
      if (validId(poId) && !existingByPO.has(poId)) existingByPO.set(poId,row);
    }
    const changes = [];
    let created=0, filled=0;
    for (const link of links) {
      const resp = await ZOHO.CRM.API.getRecord({Entity:PO_MODULE,RecordID:link.poId});
      const po = getData(resp)[0];
      if (!po) throw new Error("Cannot read PO " + link.subject + " for Pickup Locations.");
      const supplierId = lookupId(po.Vendor_Name);
      const vendor = validId(supplierId) ? await pickupVendorDetails(supplierId) : null;
      const values = {
        Purchase_Order:{id:link.poId}
      };
      if (validId(supplierId)) values.Supplier={id:supplierId};
      const reference=nonblank(po.Supplier_invoice);
      if (reference) values.Pickup_Reference=reference;
      const address=composePickupAddress(po,vendor);
      if (address) values.Pickup_Address=address;
      if (vendor && po.Pickup_Location === "Supplier Warehouse") {
        const phone=nonblank(vendor.Warehouse_Phone);
        const hours=nonblank(vendor.Hours_of_operation);
        const notes=nonblank(vendor.Warehouse_Pickup_Notes) || nonblank(vendor.Comments);
        if (phone) values.Pickup_Phone=phone;
        if (hours) values.Pickup_Hours=hours;
        if (notes) values.Pickup_Notes=notes;
      }
      const current = existingByPO.get(link.poId);
      if (current) {
        // Only fill empty fields. Never override a logistics team's edited address,
        // phone, reference, hours, notes, supplier or Packing List Link.
        const patch={id:idOf(current.id)};
        if (!validId(patch.id)) throw new Error("Pickup row has no valid ID for PO " + link.poId);
        for (const [field,val] of Object.entries(values)) {
          if (field==="Purchase_Order") continue;
          if (field==="Supplier") {
            if (!validId(lookupId(current.Supplier))) patch.Supplier=val;
          } else if (!nonblank(current[field])) {
            patch[field]=val;
          }
        }
        if (Object.keys(patch).length>1) {changes.push(patch);filled++;}
      } else {
        changes.push(values);
        created++;
      }
    }
    if (rows.length + created > 100) throw new Error("Pickup Locations exceeds its 100-row limit; split the Shipment.");
    // Zoho appends new subform rows and updates only rows carrying their ID.
    for (let i=0;i<changes.length;i+=30) {
      const result = await ZOHO.CRM.API.updateRecord({
        Entity:MODULE,APIData:{id:state.shipmentId,Pickup_Locations:changes.slice(i,i+30)},Trigger:[]
      });
      if (!ok(result)) throw new Error("Pickup Locations save failed: " + failure(result));
    }
    const checkResp=await ZOHO.CRM.API.getRecord({Entity:MODULE,RecordID:state.shipmentId});
    const after=getData(checkResp)[0];
    if (!after) throw new Error("Pickup Locations were saved but Shipment could not be verified.");
    const saved=Array.isArray(after.Pickup_Locations)?after.Pickup_Locations:[];
    const savedByPO=new Map(saved.map(r=>[lookupId(r.Purchase_Order),r]));
    const missing=links.filter(l=>!savedByPO.has(l.poId));
    if (missing.length) throw new Error("Pickup Locations missing for " + missing.length + " linked PO(s); retry synchronization.");
    state.shipment=after;
    return {created,filled,total:saved.length};
  }

  async function addSelected() {
    if (state.busy || !state.selected.size) return;
    setBusy(true);
    message("Checking existing links...");
    const wanted = [...state.selected];
    const errors = [];
    let added = 0;
    try {
      state.links = await getAllLinks();
      const known = new Set(state.links.map(link => link.poId));
      for (const poId of wanted) {
        if (known.has(poId)) continue;
        try {
          const result = await ZOHO.CRM.API.insertRecord({
            Entity: LINK_MODULE,
            APIData:{Shipment:{id:state.shipmentId},Purchase_Order:{id:poId}},
            Trigger:[]
          });
          if (!ok(result)) throw new Error(failure(result));
          added++;
          known.add(poId);
        } catch (error) {
          errors.push(poId + ": " + error.message);
        }
      }
      state.selected.clear();
      state.links = await getAllLinks();
      await syncShipmentMirror().catch(e => errors.push(e.message));
      for (const poId of wanted) {
        if (state.links.some(x => x.poId === poId)) {
          await syncPOMirror(poId,true).catch(e => errors.push(e.message));
        }
      }
      let productSummary = "";
      try {
        const synced = await syncShipmentProducts();
        productSummary = " Products: " + synced.total + " (" + synced.created + " added).";
      } catch (syncError) {
        errors.push("Products: " + (syncError?.message || String(syncError)));
      }
      let pickupSummary = "";
      try {
        const pickups = await syncShipmentPickups();
        pickupSummary = " Pickups: " + pickups.total + " (" + pickups.created + " added).";
      } catch (pickupError) {
        errors.push("Pickups: " + (pickupError?.message || String(pickupError)));
      }
      await loadLinked();
      await loadCandidates();
      message(added + " Purchase Order(s) linked." + productSummary + pickupSummary + (errors.length ? " Issues: " + errors.join("; ") : ""),errors.length ? "error" : "success");
    } catch(error) {
      message("Could not finish adding POs: " + error.message,"error");
    } finally {setBusy(false);drawCandidates();}
  }

  async function removePO(link) {
    if (state.busy || hasShipmentLineFor(link.poId)) return;
    if (!confirm("Unlink " + link.subject + " from this Shipment?")) return;
    setBusy(true);
    const errors = [];
    try {
      // Recheck before deletion to avoid removing a PO referenced by a new product line.
      const fresh = await ZOHO.CRM.API.getRecord({Entity:MODULE,RecordID:state.shipmentId});
      state.shipment = getData(fresh)[0] || state.shipment;
      if (hasShipmentLineFor(link.poId)) throw new Error("This PO is used in Shipped Products. Remove the product lines first.");
      const result = await ZOHO.CRM.API.deleteRecord({Entity:LINK_MODULE,RecordID:link.id});
      if (!ok(result)) throw new Error(failure(result));
      state.links = await getAllLinks();
      await syncShipmentMirror(link.poId).catch(e => errors.push(e.message));
      if (!state.links.some(x => x.poId === link.poId)) {
        await syncPOMirror(link.poId,false).catch(e => errors.push(e.message));
      }
      await loadLinked();
      await loadCandidates();
      message(link.subject + " unlinked." + (errors.length ? " Issues: " + errors.join("; ") : ""), errors.length ? "error" : "success");
    } catch(error) {
      message("Cannot unlink: " + error.message,"error");
    } finally {setBusy(false);drawCandidates();}
  }

  async function refresh() {
    if (!state.shipmentId || state.busy) return;
    setBusy(true);
    message("");
    try {
      const response = await ZOHO.CRM.API.getRecord({Entity:MODULE,RecordID:state.shipmentId});
      state.shipment = getData(response)[0];
      if (!state.shipment) throw new Error("Shipment cannot be opened. Check access rights.");
      const shipmentName = text(state.shipment.Name).trim();
      el("shipmentLabel").textContent = shipmentName && shipmentName.toLowerCase() !== "null"
        ? shipmentName : ("Shipment #" + state.shipmentId);
      await loadLinked();
      await loadCandidates();
    } catch(error) {message(error.message,"error");}
    finally {setBusy(false);drawCandidates();}
  }

  async function movePage(by) {
    if (state.busy || state.page + by < 1 || (by > 0 && !state.hasMore)) return;
    state.page += by;
    setBusy(true);
    try {await loadCandidates();}catch(e){state.page -= by;message(e.message,"error");}
    finally{setBusy(false);drawCandidates();}
  }
  async function search() {
    if (state.busy) return;
    state.page = 1;
    state.query = el("search").value.trim();
    setBusy(true);
    try {await loadCandidates();message("");}catch(e){message(e.message,"error");}
    finally{setBusy(false);drawCandidates();}
  }

  // Blueprint Assign PO is a self-loop: New -> New. Its completion does not
  // change Shipment_Status. It saves links and refreshes the host detail view.
  // Wait until the CRM API sees the linked POs before refreshing the parent.
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function waitForLinkedPOs() {
    const expected = new Set(state.links.map(link => link.poId));
    for (let attempt = 0; attempt < 7; attempt++) {
      try {
        const links = await getAllLinks();
        if ([...expected].every(poId => links.some(link => link.poId === poId))) {
          // The Blueprint host can need one additional tick to finish its
          // transition after its API has resolved.
          await wait(550);
          return true;
        }
      } catch (error) {
        console.warn("Assign PO: cannot yet verify links", error);
      }
      if (attempt < 6) await wait(400);
    }
    return false;
  }

  function showReopenShipmentLink() {
    const box = el("message");
    box.textContent = "Assign PO completed. Open the updated Shipment:";
    box.className = "message success";
    box.hidden = false;
    const a = document.createElement("a");
    a.href = "https://crm.zoho.com/crm/minmaxdeals/tab/CustomModule11/" + encodeURIComponent(state.shipmentId);
    a.target = "_top";
    a.textContent = " Open updated Shipment";
    a.className = "reopen-shipment";
    a.style.marginLeft = "6px";
    a.style.textDecoration = "underline";
    a.style.fontWeight = "700";
    box.appendChild(a);
  }

  // Zoho's Blueprint popup runs in a separate iframe. window.location.reload()
  // would reload only that iframe, not the parent Shipment record. Use SDK
  // Record.open plus Popup.closeReload, as in working Request Info v1.8.
  async function closeCompletedBlueprintPopup() {
    const ui = ZOHO.CRM?.UI;
    const recordUI = ui?.Record;
    const popup = ui?.Popup;
    let opened = false;

    if (typeof recordUI?.open === "function") {
      for (const entity of ["CustomModule11", "Shipments"]) {
        try {
          const response = await recordUI.open({Entity:entity, RecordID:state.shipmentId});
          console.info("Assign PO: host Record.open", entity, response);
          if (response !== false) { opened = true; break; }
        } catch (error) { console.warn("Assign PO: host Record.open failed", entity, error); }
      }
    }
    if (typeof popup?.closeReload === "function") {
      try {
        const response = await popup.closeReload();
        console.info("Assign PO: Popup.closeReload", response);
        if (response !== false) return true;
      } catch (error) { console.warn("Assign PO: Popup.closeReload failed", error); }
    }
    if (opened && typeof popup?.close === "function") {
      try {
        const response = await popup.close();
        if (response !== false) return true;
      } catch (error) { console.warn("Assign PO: Popup.close failed", error); }
    }
    return false;
  }

  async function proceedBlueprint() {
    if (!BLUEPRINT_MODE || state.busy) return;
    setBusy(true);
    message("Checking linked Purchase Orders...");
    try {
      const actualLinks = await getAllLinks();
      state.links = actualLinks;
      if (!actualLinks.length) {
        await loadLinked();
        message("At least one Purchase Order is required before completing Assign PO.","error");
        return;
      }
      const current = await ZOHO.CRM.API.getRecord({Entity:MODULE,RecordID:state.shipmentId});
      const shipment = getData(current)[0];
      if (!shipment) throw new Error("Shipment cannot be read. Try again.");
      if (shipment.Shipment_Status !== "New") {
        throw new Error("Shipment is no longer in New status. Refresh its page.");
      }
      // Also backfill products for POs linked before v1.20. Never finish the
      // Blueprint transition if linked Purchase Items are not visible in Shipment.
      const synced = await syncShipmentProducts();
      console.info("Assign PO: Shipped Products verified",synced);
      const pickups=await syncShipmentPickups();
      console.info("Assign PO: Pickup Locations verified",pickups);
      if (!ZOHO.CRM.BLUEPRINT || typeof ZOHO.CRM.BLUEPRINT.proceed !== "function") {
        throw new Error("Blueprint transition API is not available. Open this widget from the Assign PO transition.");
      }
      // Zoho completes the active During widget transition only after this direct action.
      const result = await ZOHO.CRM.BLUEPRINT.proceed();
      if (result === false || result?.status === "error" || result?.status === "failure") {
        throw new Error("Zoho CRM did not confirm the Blueprint transition.");
      }
      console.info("Blueprint proceed result:", result);
      message("Assign PO completed. Refreshing Shipment...","success");
      const verified = await waitForLinkedPOs();
      if (!verified) console.warn("Assign PO: saved PO links were not confirmed before host refresh");
      const closed = await closeCompletedBlueprintPopup();
      if (!closed) showReopenShipmentLink();
    } catch(error) {
      message("Cannot complete Assign PO: " + (error?.message || String(error)),"error");
    } finally {
      setBusy(false);
    }
  }

  if (BLUEPRINT_MODE) {
    const controls = el("blueprintActions");
    controls.hidden = false;
    el("proceed").addEventListener("click",proceedBlueprint);
  }

  el("refresh").addEventListener("click",refresh);
  el("doSearch").addEventListener("click",search);
  el("search").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();search();}});
  el("prev").addEventListener("click",()=>movePage(-1));
  el("next").addEventListener("click",()=>movePage(1));
  el("add").addEventListener("click",addSelected);
  el("selectAll").addEventListener("change",e=>{
    const linked = new Set(state.links.map(link=>link.poId));
    for(const po of state.items){const id=idOf(po.id);if(!linked.has(id)){if(e.target.checked)state.selected.add(id);else state.selected.delete(id);}}
    refreshSelection();
  });

  if (!window.ZOHO?.embeddedApp) {
    message("Zoho SDK is not available. Open this widget inside Zoho CRM.","error");
    return;
  }
  ZOHO.embeddedApp.on("PageLoad", event => {
    if (event?.Entity && !["Shipments","CustomModule11"].includes(event.Entity)) {
      message("Open this button from a Shipment record, not another module.","error");
      return;
    }
    const incomingId = idOf(event?.EntityId || event?.recordId || event?.RecordID);
    if (!validId(incomingId)) {
      message("Shipment ID is missing. Open the widget from an existing Shipment record.","error");
      return;
    }
    state.shipmentId = incomingId;
    requestLargeDialog();
    refresh();
  });
  function requestLargeDialog() {
    // The CRM host owns the outer modal. The SDK Resize request is the supported way
    // to enlarge it when this widget placement permits resizing.
    if (typeof ZOHO.CRM?.UI?.Resize !== "function") {
      console.warn("Zoho CRM SDK Resize is unavailable in this widget placement.");
      return;
    }
    try {
      Promise.resolve(ZOHO.CRM.UI.Resize({
        width: String(Math.min(1600, Math.max(320, Math.round((window.screen?.availWidth || 1660) * 0.96)))),
        height: String(Math.min(850, Math.max(380, Math.round((window.screen?.availHeight || 950) * 0.89))))
      }))
        .then(result => {
          if (result === false) {
            console.warn("Zoho CRM refused modal resizing in this placement.");
          }
        })
        .catch(error => console.warn("Zoho CRM modal resize failed:", error));
    } catch (error) {
      console.warn("Zoho CRM modal resize is not supported here:",error);
    }
  }
  ZOHO.embeddedApp.init().then(() => {
    requestLargeDialog();
  }).catch(error => message("Zoho CRM initialization failed: " + error.message,"error"));
})();