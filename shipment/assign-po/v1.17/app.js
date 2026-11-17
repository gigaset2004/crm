/*
 * Shipment Add Purchase Orders v1.17
 * The new Shipment_PO_Links module stores the many-to-many relation.
 * Existing Blueprint, Shipment function, product lines and pickup locations are not modified.
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
      await loadLinked();
      await loadCandidates();
      message(added + " Purchase Order(s) linked." + (errors.length ? " Issues: " + errors.join("; ") : ""),errors.length ? "error" : "success");
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

  // The Blueprint transition and popup dismissal are separate SDK actions.
  // Close/reload only after proceed() has confirmed a successful transition.
  // v1.17: Refresh the host Shipment record after the Assign PO transition.
  // Zoho Popup.closeReload() alone can close the modal without redrawing the
  // parent Blueprint/status section, so request a host Record.open first.
  async function closeCompletedBlueprintPopup() {
    const ui = ZOHO.CRM?.UI;
    const recordUI = ui?.Record;
    const popup = ui?.Popup;
    let opened = false;

    if (typeof recordUI?.open === "function") {
      for (const entity of ["CustomModule11", "Shipments"]) {
        try {
          const response = await recordUI.open({Entity:entity, RecordID:state.shipmentId});
          console.info("Assign PO: host Record.open",entity,response);
          if (response !== false) {opened = true; break;}
        } catch (error) {console.warn("Assign PO: host Record.open failed",entity,error);}
      }
    }

    if (typeof popup?.closeReload === "function") {
      try {
        const response = await popup.closeReload();
        console.info("Assign PO: Popup.closeReload",response);
        if (response !== false) return true;
      } catch (error) {console.warn("Assign PO: Popup.closeReload failed",error);}
    }
    if (opened && typeof popup?.close === "function") {
      try {
        const response = await popup.close();
        if (response !== false) return true;
      } catch (error) {console.warn("Assign PO: Popup.close failed",error);}
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
      if (!ZOHO.CRM.BLUEPRINT || typeof ZOHO.CRM.BLUEPRINT.proceed !== "function") {
        throw new Error("Blueprint transition API is not available. Open this widget from the Assign PO transition.");
      }
      // Zoho completes the active During widget transition only after this direct action.
      const result = await ZOHO.CRM.BLUEPRINT.proceed();
      if (result === false || result?.status === "error" || result?.status === "failure") {
        throw new Error("Zoho CRM did not confirm the Blueprint transition.");
      }
      console.info("Blueprint proceed result:", result);
      message("Assign PO completed.","success");
      const closed = await closeCompletedBlueprintPopup();
      if (!closed) {
        message("Assign PO completed. Close the window with X to refresh the Shipment.","success");
      }
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