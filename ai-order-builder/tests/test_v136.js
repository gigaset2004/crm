const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const src = fs.readFileSync('/mnt/data/Fill_with_AI_BUTTON_v1.36.js', 'utf8').split('// Existing Sales Orders > Create Page > Fill with AI button > onClick.')[0];
function cp(v){return JSON.parse(JSON.stringify(v));}
function item(id,name,offer,source=null){return {Product_Name:{id:String(id),name},Offer_Product_Name:offer,Quantity:3,List_Price:15, ...(source===null?{}:{__ai_source_index:source})};}
function draft(rows){return {ai_order_builder:'1.9',ai_order_builder_mode:'sync_1.30',Ordered_Items:rows};}
function zdk(m={}){
  const state={rows:cp(m.startRows || [{Product_Name:null,Quantity:1,List_Price:0}]),formCalls:0,subformCalls:0,cellCalls:0,alerts:[],messages:[],status:null};
  const field={getValue(){return m.staleField?cp(m.startRows||[{Product_Name:null,Quantity:1,List_Price:0}]):cp(state.rows);},setValue(v){state.formCalls++;state.rows=cp(v);}};
  const sub={getValues(){return m.staleSubform?cp(m.startRows||[{Product_Name:null,Quantity:1,List_Price:0}]):cp(state.rows);},setValues(v){state.subformCalls++;if(m.appendBlank){state.rows=[{Product_Name:null,Quantity:1,List_Price:0},...cp(v)];}else{state.rows=cp(v);}
    if(m.dropLookup){state.rows[0].Product_Name=null;}if(m.dropOffers){for(const row of state.rows)delete row.Offer_Product_Name;}
  },getRow(i){if(!state.rows[i])return null;return {getCell(field){return {setValue(v){state.cellCalls++;if(!m.ignoreCell){state.rows[i][field]=cp(v);}}};},setValues(ch){Object.assign(state.rows[i],cp(ch));if(m.dropProductOnPatch){state.rows[i].Product_Name=null;}},getValues(){return cp(state.rows[i]);}};},insertRows(v,i){let p=typeof i==='number'?i:state.rows.length;state.rows.splice(p,0,...cp(v));},deleteRow(i){state.rows.splice(i,1);}};
  const ZDK={Page:{getField(n){return n==='Ordered_Items'?field:{setValue(v){state.status=v;}};},getSubform(){return sub;}},Client:{showMessage(m){state.messages.push(m);},showAlert(m){state.alerts.push(m);},hideLoader(){}}};
  let scope={ZDK,console};vm.runInNewContext(src,scope);
  return{state,bridge:scope.aiBridgeV136};
}
const p1=item('4888374000031326072','CHANEL Powder','CHANEL TEST'),p2=item('4888374000007805006','Clarins UV','Clarins OFFER');
{
 const {bridge,state}=zdk();assert.equal(bridge.applyDraft(draft([p1])),true);assert.equal(state.rows.length,1);assert.equal(state.rows[0].Product_Name.id,p1.Product_Name.id);assert.equal(state.rows[0].Offer_Product_Name,p1.Offer_Product_Name);assert.equal(state.formCalls,0);assert.equal(state.subformCalls,1);assert.equal(state.status,'Requested');console.log('PASS one product: native subform writes all data with no field.setValue');
}
{
 const {bridge,state}=zdk({staleField:true});assert.equal(bridge.applyDraft(draft([p1])),true);assert.equal(state.rows[0].Product_Name.id,p1.Product_Name.id);console.log('PASS stale field: read native subform instead of false missing lookup');
}
{
 const {bridge,state}=zdk({dropLookup:true});assert.equal(bridge.applyDraft(draft([p1])),true);assert.equal(state.rows[0].Product_Name.id,p1.Product_Name.id);assert.equal(state.cellCalls,1);console.log('PASS missing CRM Product Name: cell-level repair');
}
{
 const {bridge,state}=zdk({dropLookup:true,dropOffers:true});assert.equal(bridge.applyDraft(draft([p1])),true);assert.equal(state.rows[0].Offer_Product_Name,'CHANEL TEST');console.log('PASS missing both fields: cell-level lookup and offer repair');
}
{
 const {bridge,state}=zdk({appendBlank:true});assert.equal(bridge.applyDraft(draft([p1])),true);assert.equal(state.rows.length,1);assert.equal(state.rows[0].Product_Name.id,p1.Product_Name.id);console.log('PASS Zoho blank template: extra empty row removed');
}
{
 const {bridge,state}=zdk({dropLookup:true,ignoreCell:true});assert.throws(()=>bridge.applyDraft(draft([p1])),/lookup missing|has not confirmed/i);assert.equal(state.messages.length,0);console.log('PASS write rejected: no fake success');
}
{
 const {bridge,state}=zdk();assert.equal(bridge.applyDraft(draft([p1,p2])),true);assert.equal(state.rows.length,2);assert.equal(state.rows[1].Product_Name.id,p2.Product_Name.id);console.log('PASS two products written');
}
{
 const {bridge,state}=zdk({startRows:[{Product_Name:p1.Product_Name,Offer_Product_Name:'OLD',Quantity:2,List_Price:4}]});assert.equal(bridge.applyDraft(draft([{...p1,__ai_source_index:0},p2])),true);assert.equal(state.rows.length,2);assert.equal(state.rows[0].Offer_Product_Name,'CHANEL TEST');assert.equal(state.rows[1].Product_Name.id,p2.Product_Name.id);console.log('PASS existing line edit plus additional product');
}
{
 const {bridge,state}=zdk();const bad={...p1,List_Price:null};assert.throws(()=>bridge.applyDraft(draft([bad])),/Invalid quantity\/price/);assert.equal(state.subformCalls,0);console.log('PASS reject missing price before writing');
}
{
 const {bridge,state}=zdk({startRows:[{Product_Name:p1.Product_Name,Purchase_Order:{id:'123'},Quantity:2,List_Price:4}]});assert.throws(()=>bridge.applyDraft(draft([p2])),/linked to a PO/);assert.equal(state.subformCalls,0);console.log('PASS never remove PO-linked line');
}
console.log('ALL v1.36 TESTS PASSED');