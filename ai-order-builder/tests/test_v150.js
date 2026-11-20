'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..'),dir=path.join(root,'client-scripts');
const html=fs.readFileSync(path.join(root,'versions/widget-v1.50/app/widget.html'),'utf8');
assert(html.includes('Version 1.50'));
assert(html.includes('Unit price (US decimal point)" type="text"'));
assert(html.includes('priceInvalidText'));
assert(html.includes('officialNameSource'));
assert(html.includes('data-trade-field="hs"'));
assert(html.includes('data-trade-field="coo"'));
const a=html.indexOf('    function enteredNumber(value)');
const b=html.indexOf('    function priceFor(it)',a);
assert(a>=0&&b>a);
const numeric=Function('clean',html.slice(a,b)+';return enteredNumber;')(v=>String(v==null?'':v).trim());
for(const [v,expected] of [['27.15',27.15],['10000.00',10000],
 ['10,000',null],['27,15',null],['1,000.50',null],['',null],
 ['12000',12000],[27.15,27.15]])assert.strictEqual(numeric(v),expected);

const btnCode=fs.readFileSync(path.join(dir,'Fill_with_AI_BUTTON_v1.37.js'),'utf8');
const onloadCode=fs.readFileSync(path.join(dir,'Sales_Orders_CREATE_onLoad_v1.37.js'),'utf8');
assert(btnCode.includes('var aiBridgeV137'));assert(onloadCode.includes('var aiBridgeV137'));
assert(btnCode.includes('repairFields.Supplier'));
assert(btnCode.includes('Supplier was not saved on row'));
const bridgeBody=btnCode.slice(0,btnCode.indexOf('// Existing Sales Orders > Create Page > Fill with AI button > onClick.'));
function simulate(mode) {
 let rows=[],messages=[];
 const clone=x=>JSON.parse(JSON.stringify(x));
 const ZDK={
  Page:{
   getField:n=>n==='Ordered_Items'?{getValue:()=>clone(rows),setValue:v=>{rows=clone(v)}}:{setValue:()=>{}},
   getSubform:()=>({
    getValues:()=>clone(rows),
    setValues:v=>{rows=clone(v).map((it,i)=>i===0?{...it,Supplier:null,...(mode==='lost-product'?{Product_Name:null}:{})}:it)},
    getRow:i=>({
     getCell:n=>({setValue:v=>{rows[i][n]=clone(v)}}),
     setValues:patch=>{for(const [k,v] of Object.entries(patch))if(!(mode==='reject-supplier'&&i===0&&k==='Supplier'))rows[i][k]=clone(v)}
    }),
    deleteRow:i=>{rows.splice(i,1)},
    insertRows:(v,i)=>{rows.splice(i,0,...clone(v))}
   })
  },
  Client:{showMessage:msg=>messages.push(msg),showAlert:msg=>messages.push(msg)}
 };
 const bridge=Function('ZDK',bridgeBody+';return aiBridgeV137;')(ZDK);
 const payload=[1,2,3].map(n=>({Product_Name:{id:'P'+n,name:'Product '+n},
  Quantity:10*n,List_Price:n===1?27.15:10000,Offer_Product_Name:'Offer '+n,Supplier:{id:'S1',name:'SUP'}}));
 let result;
 try{bridge.applyDraft({ai_order_builder:'1.9',ai_order_builder_mode:'sync_1.30',Ordered_Items:payload});result='success'}
 catch(e){result=e.message}
 if(mode==='reject-supplier')assert(result.includes('Supplier was not saved on row 1'));
 else{
  assert.strictEqual(result,'success');
  rows.forEach(it=>assert.strictEqual(it.Supplier.id,'S1'));
  assert(messages[0].includes('Supplier verified on 3 line(s)'));
 }
}
simulate('lost-supplier');simulate('lost-product');simulate('reject-supplier');

const addressFiles=[
 'Sales_Orders_CREATE_onSave_Account_Only_v1.0.js',
 'Sales_Orders_EDIT_onSave_Account_Only_v1.0.js',
 'Sales_Orders_CREATE_onChange_Account_Contact_v1.0.js',
 'Sales_Orders_EDIT_onChange_Account_Contact_v1.0.js'
];
for(const name of addressFiles){
 const code=fs.readFileSync(path.join(dir,name),'utf8');
 const address={},parts=['Street','City','State','Code','Country'];
 for(const scope of ['Billing','Shipping'])for(const part of parts)address[scope+'_'+part]='Account '+part;
 const current={Account_Name:{id:'A1'},Contact_Name:{id:'C1'}};
 Object.keys(address).forEach(k=>current[k]='Contact '+k);
 const ZDK={Page:{getField:key=>({getValue:()=>current[key],setValue:value=>{current[key]=value}})},
    Apps:{CRM:{Accounts:{fetchById:()=>({id:'A1',...address})}}},
    Client:{showMessage:()=>{}}};
 const fn=Function('ZDK','field_name',code);
 fn(ZDK,'Contact_Name');
 for(const key of Object.keys(address))assert.strictEqual(current[key],address[key]);
 if(name.includes('onSave')){
  const missing={...ZDK,Page:{getField:key=>({getValue:()=>key==='Account_Name'?null:current[key],setValue:()=>{}})}};
  assert.strictEqual(fn(missing,'Contact_Name'),false);
 }
}
console.log('PASS v1.50: dot-only price, 3 Supplier regressions, 4 Account-only address events');
