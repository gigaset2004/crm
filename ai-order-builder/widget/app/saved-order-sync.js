/* AI Order Builder 1.38: safe API-backed editing of saved Requested Sales Orders.
 * This module is not used on new / unsaved SO forms.
 * Zoho CRM API v8 subforms: update with row.id, add without id, delete with _delete:null.
 */
(function (root) {
  'use strict';
  function str(x) { return x == null ? '' : String(x).trim(); }
  function idOf(x) { return x && x.id != null ? str(x.id) : ''; }
  function num(x) { var n = Number(x); return Number.isFinite(n) ? n : NaN; }
  function moneyEqual(a,b) { return Number.isFinite(num(a)) && Number.isFinite(num(b)) && Math.abs(num(a)-num(b)) < 0.00001; }
  function requestAllowed(status) { return str(status) === 'Requested' || str(status) === 'Created'; }
  function checkResult(data, action) {
    var payload=payloadOf(data);
    var x = payload && Array.isArray(payload.data) ? payload.data[0] : null;
    if (!x || x.code !== 'SUCCESS') {
      throw new Error(action + ': ' + str(x && (x.message || x.code) || data && (data.message || data.code) || 'Zoho did not confirm the operation'));
    }
  }
  // v1.38: Widget SDK's legacy API wrapper can omit inventory line items.
  // ZRC uses the current authenticated CRM REST v8 API and preserves the full
  // Ordered_Items subform. Never treat an unverified empty array as a blank SO.
  function payloadOf(response) {
    if (response && response.data && Array.isArray(response.data.data)) return response.data;
    return response;
  }
  function errorText(error) {
    if (error == null) return 'unknown error';
    if (typeof error === 'string') return error.slice(0,200);
    var parts=[];
    var data=error.data || error.response && error.response.data || {};
    if (error.code) parts.push(str(error.code));
    if (error.message) parts.push(str(error.message));
    if (data.code) parts.push(str(data.code));
    if (data.message) parts.push(str(data.message));
    if (error.status) parts.push('HTTP '+error.status);
    return (parts.join(' / ') || 'unexpected SDK response').slice(0,250);
  }
  function readParentRecord(response, soId) {
    var payload=payloadOf(response);
    var list=payload && payload.data;
    var rec=Array.isArray(list)?list[0]:null;
    if(!rec || str(rec.id)!==str(soId)) throw new Error('CRM did not return the requested Sales Order (ID '+str(soId)+'). '+errorText(payload));
    if(!str(rec.Status)) throw new Error('CRM did not return Sales Order Status. Editing blocked.');
    return rec;
  }
  function validateLines(lines, soId, source) {
    if(!Array.isArray(lines))throw new Error(source+': no product array in response');
    if(lines.length>100)throw new Error('SO contains over 100 products; safe editing is blocked.');
    var ids=Object.create(null);
    for(var i=0;i<lines.length;i++){
      var line=lines[i],id=str(line && line.id);
      if(!id || ids[id])throw new Error(source+': missing or duplicate line ID ('+(i+1)+')');
      ids[id]=true;
      if(!line.Product_Name || !str(line.Product_Name.id)){
        throw new Error(source+': missing Product lookup on line '+(i+1));
      }
      if(line.Parent_Id && str(line.Parent_Id.id)!==str(soId)){
        throw new Error(source+': product line does not belong to this SO');
      }
    }
    return lines;
  }
  function linesFromCOQLResponse(response, soId, source){
    var payload=payloadOf(response);
    if(payload && Array.isArray(payload.data)){
      if(payload.info && payload.info.more_records)throw new Error(source+': too many product lines');
      return validateLines(payload.data,soId,source);
    }
    if(payload && payload.code==='NO_DATA')return [];
    if(response && response.status===204)return [];
    throw new Error(source+': '+errorText(payload));
  }
  function coqlSQL(soId){
    return 'select id, Parent_Id, Product_Name, Quantity, List_Price, Offer_Product_Name, Supplier, UPC, Brand, Purchase_Order '+
      "from Ordered_Items where Parent_Id = '"+str(soId)+"' limit 0, 200";
  }
  async function getRecordWithProducts(zoho, soId){
    if(!zoho||!zoho.CRM||!zoho.CRM.API)throw new Error('Zoho CRM SDK is unavailable.');
    soId=str(soId);
    if(!/^\d{12,20}$/.test(soId))throw new Error('Invalid Sales Order ID');
    var errors=[],record=null,rows=null;
    var zrc=typeof window!=='undefined'?window.zrc:null;
    // 1. REST v8 record by ID, documented to include Ordered_Items.
    if(zrc&&typeof zrc.get==='function'){
      try{
        var v8response=await zrc.get('/crm/v8/Sales_Orders/'+soId);
        record=readParentRecord(v8response,soId);
        if(Array.isArray(record.Ordered_Items) && record.Ordered_Items.length){
          record.Ordered_Items=validateLines(record.Ordered_Items,soId,'v8 GET');
          record.__ai_product_source='v8 GET';
          return record;
        }
      }catch(e){errors.push('v8 GET: '+errorText(e));}
      // 2. REST v8 COQL: direct query of subform rows (not a Sales Order join).
      // Also verify apparent zero-row orders, because old wrappers return [].
      if(typeof zrc.post==='function'){
        try{
          var cq=await zrc.post('/crm/v8/coql',{select_query:coqlSQL(soId)});
          rows=linesFromCOQLResponse(cq,soId,'v8 COQL');
          if(!record){
            // COQL returns line items, not SO status or Modified_Time.
            record=readParentRecord(await zoho.CRM.API.getRecord({Entity:'Sales_Orders',RecordID:soId}),soId);
          }
          record.Ordered_Items=rows;
          record.__ai_product_source='v8 COQL';
          return record;
        }catch(e){errors.push('v8 COQL: '+errorText(e));}
      }else errors.push('v8 COQL: ZRC.post not available');
    }else errors.push('v8 GET: ZRC not available');
    // 3. Compatibility path when newer ZRC is missing or permission-scoped.
    if(!record){
      try{
        record=readParentRecord(await zoho.CRM.API.getRecord({Entity:'Sales_Orders',RecordID:soId}),soId);
      }catch(e){errors.push('SDK getRecord: '+errorText(e));}
    }
    if(record && Array.isArray(record.Ordered_Items) && record.Ordered_Items.length){
      record.Ordered_Items=validateLines(record.Ordered_Items,soId,'SDK getRecord');
      record.__ai_product_source='SDK getRecord';
      return record;
    }
    if(typeof zoho.CRM.API.coql==='function'){
      try{
        rows=linesFromCOQLResponse(await zoho.CRM.API.coql({select_query:coqlSQL(soId)}),soId,'SDK COQL');
        if(!record)throw new Error('SO parent record not available for Status check');
        record.Ordered_Items=rows;
        record.__ai_product_source='SDK COQL';
        return record;
      }catch(e){errors.push('SDK COQL: '+errorText(e));}
    }else errors.push('SDK COQL: method unavailable');
    // Never expose an empty table until zero rows have been verified by COQL.
    throw new Error('v1.38 | Cannot verify existing SO products. '+errors.join(' ; ').slice(0,700));
  }
  function buildPlan(current, requested) {
    if (!Array.isArray(current) || !Array.isArray(requested)) throw new Error('Invalid SO product list.');
    if (!requested.length || requested.length > 100) throw new Error('SO must have 1–100 product lines.');
    var originals = Object.create(null), existingIdSet = Object.create(null);
    var result = [], seenProducts = Object.create(null), keptIds = Object.create(null);
    var stats = {added:0, changed:0, removed:0, unchanged:0};
    for (var i=0; i<current.length; i++) {
      var row = current[i], rowId = str(row && row.id);
      if (!rowId || Object.prototype.hasOwnProperty.call(originals,rowId)) throw new Error('Missing or duplicate saved SO row ID on line ' + (i+1));
      originals[rowId] = row;
      existingIdSet[rowId] = true;
    }
    for (var j=0; j<requested.length; j++) {
      var incoming=requested[j], p=incoming && incoming.Product_Name;
      var prodId=idOf(p), qty=num(incoming && incoming.Quantity), price=num(incoming && incoming.List_Price);
      var offer=str(incoming && incoming.Offer_Product_Name), supplierId=idOf(incoming && incoming.Supplier);
      var rowId=str(incoming && incoming.__ai_record_id);
      if (!prodId || !Number.isFinite(qty) || qty<=0 || !Number.isFinite(price) || price<0 || !offer || offer.length>255) {
        throw new Error('Invalid Product / Quantity / Price / Offer Product Name on line ' + (j+1));
      }
      if (incoming.Supplier && !supplierId) throw new Error('Supplier is not linked to Supplier_Codes on line ' + (j+1));
      if (Object.prototype.hasOwnProperty.call(seenProducts,prodId) && !rowId) {
        throw new Error('This product is already in the SO: ' + str(p.name || prodId));
      }
      seenProducts[prodId]=true;
      if (rowId) {
        var old=originals[rowId];
        if (!old) throw new Error('SO row ' + rowId + ' no longer exists. Reopen the widget.');
        if (Object.prototype.hasOwnProperty.call(keptIds,rowId)) throw new Error('Saved SO row submitted twice: ' + rowId);
        keptIds[rowId]=true;
        if (idOf(old.Product_Name) !== prodId) throw new Error('Cannot replace an existing Product ID on line ' + (j+1) + '; remove and add instead.');
        var changes={id:rowId}, has=false;
        if (!moneyEqual(old.Quantity,qty)) {changes.Quantity=qty;has=true;}
        if (!moneyEqual(old.List_Price,price)) {changes.List_Price=price;has=true;}
        if (str(old.Offer_Product_Name)!==offer) {changes.Offer_Product_Name=offer;has=true;}
        if (idOf(old.Supplier)!==supplierId) {changes.Supplier=supplierId?{id:supplierId}:null;has=true;}
        if (has) {
          if (idOf(old.Purchase_Order)) throw new Error('SO line '+(j+1)+' is linked to a PO and cannot be edited here.');
          result.push(changes);stats.changed++;
        } else stats.unchanged++;
      } else {
        var newRow={Product_Name:{id:prodId},Quantity:qty,List_Price:price,Offer_Product_Name:offer};
        if(supplierId)newRow.Supplier={id:supplierId};
        if(str(incoming.UPC))newRow.UPC=str(incoming.UPC);
        if(str(incoming.Brand))newRow.Brand=str(incoming.Brand);
        result.push(newRow);stats.added++;
      }
    }
    for(var k=0;k<current.length;k++){
      var before=current[k], beforeId=str(before.id);
      if (!Object.prototype.hasOwnProperty.call(keptIds,beforeId)) {
        if (idOf(before.Purchase_Order)) throw new Error('Cannot remove a product already linked to a Purchase Order (SO row '+(k+1)+').');
        result.push({id:beforeId,_delete:null});stats.removed++;
      }
    }
    return {changes:result,stats:stats};
  }
  function verify(current,requested) {
    if(current.length!==requested.length)throw new Error('CRM returned '+current.length+' rows, expected '+requested.length+'. Reload the SO to review before retrying.');
    var byId=Object.create(null),byProduct=Object.create(null);
    for(var i=0;i<current.length;i++){
      var r=current[i];byId[str(r.id)]=r;
      var p=idOf(r.Product_Name);if(!byProduct[p])byProduct[p]=[];byProduct[p].push(r);
    }
    for(var j=0;j<requested.length;j++){
      var w=requested[j],pid=idOf(w.Product_Name),rid=str(w.__ai_record_id);
      var got=rid?byId[rid]:null;
      if(!got){
        var matches=byProduct[pid]||[];
        for(var m=0;m<matches.length;m++){
          var candidate=matches[m];
          if(!candidate.__verifiedNew) {got=candidate;candidate.__verifiedNew=true;break;}
        }
      }
      if(!got || idOf(got.Product_Name)!==pid || !moneyEqual(got.Quantity,w.Quantity) || !moneyEqual(got.List_Price,w.List_Price) || str(got.Offer_Product_Name)!==str(w.Offer_Product_Name) || idOf(got.Supplier)!==idOf(w.Supplier)){
        throw new Error('CRM response differs at product line '+(j+1)+'. The update may have been saved; reload to check before retrying.');
      }
    }
  }
  async function apply(zoho,soId,expectedModified,requested){
    if(!zoho || !zoho.CRM || !zoho.CRM.API)throw new Error('Zoho SDK is unavailable.');
    var before=await getRecordWithProducts(zoho,soId);
    if(!requestAllowed(before.Status))throw new Error('Editing is allowed only while this Sales Order is Requested. Current status: '+str(before.Status));
    if(expectedModified && str(before.Modified_Time)!==str(expectedModified))throw new Error('Sales Order was modified since the widget opened. Close the widget, refresh the SO and reopen to avoid overwriting changes.');
    var plan=buildPlan(before.Ordered_Items,requested);
    if(!plan.changes.length)return {record:before,stats:plan.stats};
    var zrc=typeof window!=='undefined'?window.zrc:null;
    var result;
    if(zrc && typeof zrc.put==='function'){
      // Update only changed subform rows. CRM v8 appends new rows and does not
      // touch unspecified rows. _delete:null removes exactly one row by ID.
      result=await zrc.put('/crm/v8/Sales_Orders/'+str(soId),{
        data:[{id:str(soId),Ordered_Items:plan.changes}],trigger:[]
      });
    }else{
      result=await zoho.CRM.API.updateRecord({Entity:'Sales_Orders',APIData:{id:str(soId),Ordered_Items:plan.changes},Trigger:[]});
    }
    checkResult(result,'Save Sales Order products');
    var after=await getRecordWithProducts(zoho,soId);
    verify(after.Ordered_Items,requested);
    return {record:after,stats:plan.stats};
  }
  root.SavedOrderSync={requestAllowed:requestAllowed,buildPlan:buildPlan,apply:apply,verify:verify,getRecordWithProducts:getRecordWithProducts};
})(typeof window!=='undefined'?window:globalThis);
