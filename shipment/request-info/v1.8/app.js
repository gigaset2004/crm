/* Request Supplier Info — Shipment Blueprint Widget v1.8
   The widget reads Shipment_PO_Links, Purchase_Orders and Vendors.
   It prepares editable messages in the widget and sends replies via
   a server-side Zoho CRM standalone function using the Front connection.
   The Blueprint completes only after Front accepts all selected messages.
*/
(() => {
  "use strict";
  const PAGE_SIZE = 5;
  const state = {shipmentId:"", shipmentName:"", rows:[], page:1, editorId:null, busy:false, sendingStarted:false, transitionCompleted:false, frontConversationId:""};
  const $ = id => document.getElementById(id);
  const val = value => value == null ? "" : String(value).trim();
  const lookupId = value => val(value && typeof value === "object" ? value.id : value);
  const validId = value => /^\d{15,20}$/.test(val(value));
  const emailOk = email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val(email));
  const record = (data) => Array.isArray(data?.data) ? data.data[0] : null;
  const all = (data) => Array.isArray(data?.data) ? data.data : [];
  const url = (moduleName, id) => `https://crm.zoho.com/crm/minmaxdeals/tab/${moduleName}/${encodeURIComponent(id)}`;
  const fail = (response) => {
    const entry = all(response)[0] || response;
    if (entry?.code && entry.code !== "SUCCESS") return entry.message || entry.code;
    if (response?.code && response.code !== "SUCCESS") return response.message || response.code;
    return "";
  };
  function notice(text, kind="") {
    const item=$("notice"); item.textContent = text; item.className = "notice"+(kind?" "+kind:""); item.hidden = !text;
  }
  function setBusy(value) {state.busy = !!value; render();}
  function selected(row) {return row.pickup || row.packing;}
  function selectedRows() {return state.rows.filter(selected);}
  function pendingRows() {return selectedRows().filter(row=>!row.sent);}
  function render() {
    const rows = state.rows;
    const pages=Math.max(1,Math.ceil(rows.length/PAGE_SIZE));
    state.page=Math.max(1,Math.min(state.page,pages));
    $("count").textContent = `${rows.length} PO${rows.length===1?"":"s"}`;
    $("shipmentName").textContent = state.shipmentName || (state.shipmentId ? `Shipment ${state.shipmentId}` : "Connecting…");
    $("pageLabel").textContent = `Page ${state.page}/${pages}`;
    $("prev").disabled = state.busy || state.page===1;
    $("next").disabled = state.busy || state.page>=pages;
    $("refresh").disabled = state.busy;
    $("allPickup").disabled = state.busy || state.sendingStarted;
    $("allPacking").disabled = state.busy || state.sendingStarted;
    $("allPickup").checked = rows.length>0 && rows.every(r=>r.pickup);
    $("allPacking").checked = rows.length>0 && rows.every(r=>r.packing);
    // One action: send all selected requests, then finish the Blueprint.
    // A missing email is reported on click; it is not displayed in the list.
    $("complete").disabled = state.busy || state.transitionCompleted || selectedRows().length===0;
    const root=$("list"); root.hidden=Boolean(state.editorId); $("editor").hidden=!state.editorId;
    if(state.editorId) {
      const editRow=rows.find(r=>r.id===state.editorId);
      if(editRow){ $("editorTitle").textContent="Message · "+editRow.name; $("messageBody").value=editRow.editedBody===null?compose(editRow).content:editRow.editedBody; $("messageBody").disabled=state.busy; $("resetMessage").disabled=state.busy; $("backToList").disabled=state.busy; }
    }
    root.replaceChildren();
    const pageRows=rows.slice((state.page-1)*PAGE_SIZE,state.page*PAGE_SIZE);
    if (!pageRows.length){const empty=document.createElement("div");empty.className="empty";empty.textContent="No linked Purchase Orders found. Use Assign PO first.";root.appendChild(empty);return;}
    pageRows.forEach((row)=>{
      const card=document.createElement("article"); card.className="po-card";
      // Same two-column card typography and pickup badges as Assign PO v1.16.
      const identity=document.createElement("div");identity.className="po-identity";
      const po=document.createElement("a");po.href=url("PurchaseOrders",row.id);po.target="_blank";po.rel="noopener noreferrer";po.className="po-number";po.textContent=row.name;identity.appendChild(po);
      const supplier=document.createElement(validId(row.vendorId)?"a":"span");supplier.className="supplier-link";supplier.textContent=row.vendorName||"Supplier not set";
      if(validId(row.vendorId)){supplier.href=url("Vendors",row.vendorId);supplier.target="_blank";supplier.rel="noopener noreferrer";}
      const vendorLine=document.createElement("div");vendorLine.className="supplier-row";
      vendorLine.appendChild(supplier);
      const editBtn=document.createElement("button");editBtn.type="button";editBtn.className="edit-message";editBtn.textContent="Edit message";
      editBtn.disabled=state.busy||!selected(row)||row.sent;
      editBtn.addEventListener("click",()=>openEditor(row.id));vendorLine.appendChild(editBtn);
      identity.appendChild(vendorLine);card.appendChild(identity);
      const location=document.createElement("div");location.className="po-pickup";
      const locationLabel=document.createElement("span");locationLabel.className="pickup-label";locationLabel.textContent="Pickup";
      const locationKind=document.createElement("span");locationKind.className="pickup-kind pickup-kind-"+(row.pickupLocation?.type||"unset");
      locationKind.textContent=row.pickupLocation?.label||"Not set";
      location.append(locationLabel,locationKind);
      if(row.pickupLocation?.address){const locationValue=document.createElement("span");locationValue.className="pickup-value";locationValue.textContent=row.pickupLocation.address;locationValue.title=row.pickupLocation.address;location.appendChild(locationValue);}
      card.appendChild(location);
      const options=document.createElement("div"); options.className="details";
      [["pickup","Pickup Details"],["packing","Packing Details"]].forEach(([field,label])=>{
        const item=document.createElement("label");item.className="option";
        const check=document.createElement("input");check.type="checkbox";check.checked=row[field];check.disabled=state.busy || row.sent;
        check.addEventListener("change",()=>{row[field]=check.checked;render();});
        item.append(check,document.createTextNode(label));options.appendChild(item);
      });card.appendChild(options);
      // There is no email address or generic "Ready" badge in the card.
      // Only a meaningful confirmation is shown after actual send success.
      if(row.sent){const sent=document.createElement("span");sent.className="sent-indicator";sent.textContent="Sent";options.appendChild(sent);}
      root.appendChild(card);
    });
  }
  async function getCRM(path, params) {
    const response=await zrc.get(path,params?{params}:undefined);
    return response?.data || {};
  }
  async function load() {
    if(!validId(state.shipmentId)) throw new Error("Shipment ID is missing. Open Request Info from a Shipment Blueprint transition.");
    const shipment=record(await getCRM(`/crm/v8/Shipments/${state.shipmentId}`));
    if(!shipment)throw new Error("Shipment was not found.");
    state.shipmentName=val(shipment.Name)||state.shipmentId;
    state.frontConversationId=val(shipment.Front_Conversation_ID);
    if(shipment.Shipment_Status !== "New")throw new Error("Request Info is available only while Shipment status is New.");
    // Search the actual link module: no POs_IDs and no Linked_PO_Count dependencies.
    let links=[];
    for(let page=1;page<=10;page++) {
      let data;
      try {data=await getCRM("/crm/v8/Shipment_PO_Links/search",{criteria:`(Shipment:equals:${state.shipmentId})`,page,per_page:200});}
      catch(error){if(error?.status===204 || error?.data?.code==="NO_CONTENT")break; throw error;}
      links.push(...all(data));
      if(!data.info?.more_records)break;
    }
    const ids=[...new Set(links.map(item=>lookupId(item.Purchase_Order)).filter(validId))];
    const existing = new Map(state.rows.map(r=>[r.id,r]));
    const loaded=await Promise.all(ids.map(async(id)=>{
      const po=record(await getCRM(`/crm/v8/Purchase_Orders/${id}`));
      if(!po)throw new Error("Could not load linked Purchase Order "+id);
      const vendorId=lookupId(po.Vendor_Name);
      let vendor={};
      if(validId(vendorId))vendor=record(await getCRM(`/crm/v8/Vendors/${vendorId}`)) || {};
      const old=existing.get(id);
      return {id,name:val(po.Subject)||id,vendorId,vendorName:val(vendor.Vendor_Name)||val(po.Vendor_Name?.name),email:val(vendor.Email),pickupLocation:pickupDisplay(po,vendor),pickup:old?old.pickup:false,packing:old?old.packing:false,sent:old?old.sent:false,editedBody:old?old.editedBody:null, frontId:val(po.Front_Conversation_ID)};
    }));
    // Don't silently remove previously-sent requests while the transition is in progress.
    state.rows=loaded;
    state.page=Math.min(state.page,Math.max(1,Math.ceil(loaded.length/PAGE_SIZE)));
  }
  // Same Pickup Location formatting as Assign PO to Shipment v1.16.
  // This is display-only: Supplier Warehouse uses vendor location,
  // Other Location uses the text entered on the Purchase Order.
  function pickupDisplay(po, vendor) {
    const selection=val(po?.Pickup_Location);
    if(selection==="Other Location") {
      return {type:"custom",label:"Custom",address:val(po?.Other_Pickup_Location)||"Address not specified"};
    }
    if(selection==="Supplier Warehouse") {
      const same=val(vendor?.Warehouse_Address_is_the_Same_as_business_address).toLowerCase()==="yes";
      const warehouseCity=val(vendor?.Warehouse_City);
      const warehouseCountry=val(vendor?.Warehouse_Country);
      const city=same?(val(vendor?.City)||warehouseCity):warehouseCity;
      const country=same?(val(vendor?.Country)||warehouseCountry):warehouseCountry;
      return {type:"warehouse",label:"Warehouse",address:[city,country].filter(Boolean).join(", ")||"Address not specified"};
    }
    return {type:"unset",label:"Not set",address:""};
  }
  function compose(row) {
    const requested=[];
    if(row.pickup)requested.push("Pickup Details: pickup address, warehouse contact person, phone/email, business hours, and date the goods will be ready for collection.");
    if(row.packing)requested.push("Packing Details: total cartons and pallets, gross weight, carton/pallet dimensions, and packing list (if available).");
    const subject=`Pickup / Packing information request — ${row.name}`;
    const content=`Hello,\n\nPlease provide the following information for our Purchase Order ${row.name}:\n\n${requested.map((s,i)=>`${i+1}. ${s}`).join("\n\n")}\n\nPlease reply to this email with the requested information.\n\nBest regards,\nMinMaxDeals Logistics`;
    return {subject,content};
  }
  function saveEditor() {
    if(!state.editorId)return;
    const row=state.rows.find(r=>r.id===state.editorId);
    if(row)row.editedBody=$("messageBody").value;
  }
  function openEditor(id) {
    if(state.busy||state.sendingStarted)return;
    saveEditor();state.editorId=id;render();$("messageBody").focus();
  }
  function backToList() {
    saveEditor();state.editorId=null;render();
  }
  function resetMessage() {
    const row=state.rows.find(r=>r.id===state.editorId);
    if(!row)return;
    row.editedBody=null;$("messageBody").value=compose(row).content;
  }
  function parseFunctionOutput(response){
    if(response?.code!=="success")throw new Error(response?.message||"Zoho CRM function was not executed.");
    let raw=response?.details?.output;
    if(typeof raw!=="string")throw new Error("Front function returned no delivery confirmation.");
    raw=raw.trim();
    if(raw.startsWith('"') && raw.endsWith('"')){try{raw=JSON.parse(raw);}catch(_){}}
    if(raw==="SENT")return true;
    if(raw.startsWith("UNKNOWN|"))throw new Error("UNKNOWN DELIVERY: "+raw.slice(8));
    if(raw.startsWith("ERROR|"))throw new Error(raw.slice(6));
    throw new Error("Unexpected Front response: "+raw.slice(0,160));
  }
  async function sendViaFront(row, content){
    if(!ZOHO.CRM?.FUNCTIONS || typeof ZOHO.CRM.FUNCTIONS.execute!=="function")
      throw new Error("Zoho CRM FUNCTIONS SDK is unavailable.");
    const response=await ZOHO.CRM.FUNCTIONS.execute("shipment_request_info_front",{
      arguments:JSON.stringify({shipmentId:state.shipmentId,poId:row.id,messageText:content})
    });
    parseFunctionOutput(response);
  }
  // Send the edited text to Front, then execute the existing Blueprint transition.
  // On uncertain delivery outcome do not retry automatically.
  async function complete() {
    if(state.busy || state.transitionCompleted)return;
    saveEditor();
    const chosen=selectedRows();
    if(!chosen.length){notice("Select Pickup Details and/or Packing Details for at least one PO.","error");return;}
    if(!ZOHO.CRM?.BLUEPRINT || typeof ZOHO.CRM.BLUEPRINT.proceed!=="function"){
      notice("Open this widget through the Request info Blueprint transition.","error");return;
    }
    const pending=pendingRows();
    for(const row of pending){
      const body=row.editedBody===null?compose(row).content:row.editedBody;
      if(!body.trim()){notice(`Message for ${row.name} is empty. Open Edit message.`,"error");return;}
      if(!/^cnv_[a-zA-Z0-9]+$/.test(row.frontId||state.frontConversationId)){
        notice(`Front Conversation ID missing for ${row.name}. Add it to the PO or Shipment.`,"error");return;
      }
      if(!emailOk(row.email)){
        notice(`Supplier email is missing for ${row.name}. Update Supplier first.`,"error");return;
      }
    }
    // Multiple different suppliers must never share a shipment-level conversation.
    const grouped=new Map();
    for(const row of pending){
      const id=row.frontId||state.frontConversationId;
      const vendors=grouped.get(id)||new Set();vendors.add(row.vendorId);grouped.set(id,vendors);
    }
    for(const vendors of grouped.values())if(vendors.size>1){
      notice("Different suppliers share one Front conversation. Set each PO's own Front Conversation ID before sending.","error");return;
    }
    state.sendingStarted=true; state.editorId=null;setBusy(true);
    try {
      for(let i=0;i<pending.length;i++){
        const row=pending[i];
        notice(`Sending Front messages (${i+1}/${pending.length})...`);
        const content=row.editedBody===null?compose(row).content:row.editedBody;
        await sendViaFront(row,content);
        row.sent=true;render();
      }
      notice("Front accepted the messages. Completing Blueprint...");
      const result=await ZOHO.CRM.BLUEPRINT.proceed();
      if(result===false || result?.status==="error" || result?.status==="failure" || result?.code && result.code!=="SUCCESS")
        throw new Error("Zoho did not confirm the Blueprint transition.");
      // Wait for the new Blueprint state to be readable from Zoho CRM before
      // asking the host to reload. Opening the record *before* closeReload()
      // (old v1.6 behavior) prevented a reliable refresh in the host UI.
      if(!await shipmentIsInfoRequested())
        throw new Error("Blueprint completed, but the new Shipment state is not yet visible.");
      state.transitionCompleted=true;
      notice("Request info completed. Refreshing Shipment...","success");
      const refreshed=await closeAndRefreshShipment();
      if(!refreshed)showOpenShipmentLink("Shipment is Info requested. Open the updated record:");
    } catch(error) {
      console.error("Complete Request Info failed",error);
      // If the transition succeeded but the SDK acknowledgement failed, never attempt it twice.
      if(!pendingRows().length && await shipmentIsInfoRequested()){
        state.transitionCompleted=true;
        notice("Shipment is Info requested. Refreshing Shipment...","success");
        const refreshed=await closeAndRefreshShipment();
        if(!refreshed)showOpenShipmentLink("Shipment is already Info requested. Open the updated record:");
      } else {
        const pendingCount=pendingRows().length;
        notice(`${error?.message||String(error)}. ${pendingCount?"Unsent messages remain. Check Front before retrying (a network error may have occurred after sending).":"All messages accepted; retry only Blueprint."}`,"error");
      }
    } finally {setBusy(false);}
  }
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function shipmentIsInfoRequested() {
    // The Blueprint callback can arrive before CRM's detail API exposes the
    // new status. Poll briefly, never resend already accepted Front messages.
    for(let attempt=0;attempt<7;attempt++){
      try {
        const shipment=record(await getCRM(`/crm/v8/Shipments/${state.shipmentId}`));
        if(val(shipment?.Shipment_Status)==="Info requested")return true;
      } catch(error){console.warn("Shipment status verification failed",error);}
      if(attempt<6)await delay(400);
    }
    return false;
  }
  function showOpenShipmentLink(message){
    notice(message,"success");
    // This fallback is shown only when the host cannot refresh its own view.
    // An actual user click on target=_top can navigate the embedding tab.
    const anchor=document.createElement("a");
    anchor.className="reload-shipment-link";
    anchor.textContent="Open updated Shipment";
    anchor.href=url("CustomModule11",state.shipmentId);
    anchor.target="_top";
    $("notice").appendChild(document.createTextNode(" "));
    $("notice").appendChild(anchor);
  }
  // v1.8: Refresh the CRM host record, not the embedded widget iframe.
  // A successful popup closeReload() result does not guarantee a refresh of
  // the underlying Shipment Blueprint strip in Zoho's record detail page.
  async function closeAndRefreshShipment() {
    const ui = ZOHO.CRM?.UI;
    const recordUI = ui?.Record;
    const popup = ui?.Popup;
    let opened = false;

    // Explicitly navigate the HOST to the current Shipment Detail Page.
    // Use the CRM module's system reference name first, not the API alias.
    // In v1.7 Record.open was never called whenever closeReload returned true.
    if (typeof recordUI?.open === "function") {
      for (const entity of ["CustomModule11", "Shipments"]) {
        try {
          const response = await recordUI.open({Entity:entity, RecordID:state.shipmentId});
          console.info("Request Info: host Record.open",entity,response);
          if (response !== false) {opened = true; break;}
        } catch (error) {console.warn("Request Info: host Record.open failed",entity,error);}
      }
    }

    // Once the CRM host has been asked to re-open the record, close the
    // Blueprint modal. The host SDK will refresh the visible record view.
    if (typeof popup?.closeReload === "function") {
      try {
        const response = await popup.closeReload();
        console.info("Request Info: Popup.closeReload",response);
        if (response !== false) return true;
      } catch (error) {console.warn("Request Info: Popup.closeReload failed",error);}
    }
    if (opened && typeof popup?.close === "function") {
      try {
        const response = await popup.close();
        if (response !== false) return true;
      } catch (error) {console.warn("Request Info: Popup.close failed",error);}
    }
    return false;
  }
  async function refresh() {
    if(state.busy)return;
    saveEditor();
    setBusy(true);notice("Loading linked Purchase Orders…");
    try {await load();notice("");}catch(error){console.error(error);notice(error?.message||String(error),"error");}
    finally{setBusy(false);}
  }
  $("prev").addEventListener("click",()=>{saveEditor();state.editorId=null;state.page-=1;render();});
  $("next").addEventListener("click",()=>{saveEditor();state.editorId=null;state.page+=1;render();});
  $("refresh").addEventListener("click",refresh);
  $("allPickup").addEventListener("change",e=>{state.rows.forEach(r=>r.pickup=e.target.checked);render();});
  $("allPacking").addEventListener("change",e=>{state.rows.forEach(r=>r.packing=e.target.checked);render();});
  $("complete").addEventListener("click",complete);
  $("backToList").addEventListener("click",backToList);
  $("resetMessage").addEventListener("click",resetMessage);
  if(!window.ZOHO?.embeddedApp){notice("Zoho CRM SDK unavailable. Open this widget inside a Blueprint transition.","error");return;}
  ZOHO.embeddedApp.on("PageLoad",async(event)=>{
    const shipmentId=val(Array.isArray(event?.EntityId)?event.EntityId[0]:event?.EntityId || event?.RecordID || event?.recordId);
    if(event?.Entity && !["Shipments","CustomModule11"].includes(event.Entity)){notice("Open from a Shipment record.","error");return;}
    if(!validId(shipmentId)){notice("Missing Shipment ID.","error");return;}
    state.shipmentId=shipmentId;
    try {
      // Front connection handles sender identity server-side; user email is not required.
    } catch(error){console.error("Initialization failed",error);notice(error?.message||String(error),"error");}
    await refresh();
  });
  ZOHO.embeddedApp.init();
  render();
})();