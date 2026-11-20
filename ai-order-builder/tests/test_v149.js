'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert');
const dir=path.join(__dirname,'../versions/widget-v1.49/app');
const Pipeline=require(path.join(dir,'order-pipeline.js'));
const Enricher=require(path.join(dir,'product-enrichment.js'));
const html=fs.readFileSync(path.join(dir,'widget.html'),'utf8');
assert(html.includes('Version 1.49'));
assert(html.includes('border-bottom:2px solid #b7c5d6'));
assert(html.includes('data-trade-field="hs"')&&html.includes('data-trade-field="coo"'));
assert(html.includes('function saveTradeEditor()')&&html.includes('CRM did not confirm the new customs fields.'));
assert(html.includes('autoEnrich:true'));
assert(html.includes('var hsLine=lineHS(it),cooLine=lineCOO(it)'));
assert(html.includes('if(hsLine)row.HS_Code=hsLine'));
assert(html.includes('if(cooLine)row.Country_of_origin=cooLine'));
assert(html.includes('researchOfficialRetry:researchOfficialRetry'));
assert(html.includes('function offerNameWithoutBrand'));
assert(html.includes('window.OrderPipeline.officialNameSource(fact,fact.brand)'));
const a={identifier:'3605973023352',requestedBrand:"KIEHL'S",requestedName:'Kiehls Nice Earth Deep Pore Cleansing Masque 125ml',offerName:'Nice Earth Deep Pore Cleansing Masque 125ml',quantity:30,price:27,product:null,match:'pending'};
const b={identifier:'3614274101584',requestedBrand:'Helena Rubinstein',requestedName:'Helena Rubinstein RePlasty Age Recovery Skin Repairing Night Care 100ml',offerName:'RePlasty Age Recovery Skin Repairing Night Care 100ml',quantity:20,price:357.40,product:null,match:'pending'};
assert(Pipeline.vettedOfficialProduct(a));assert(Pipeline.vettedOfficialProduct(b));
assert.strictEqual(Pipeline.vettedOfficialProduct({...a,identifier:'3605973023353'}),null);
assert.strictEqual(Pipeline.vettedOfficialProduct({...b,requestedName:'Helena Rubinstein 50ml'}),null);
(async()=>{
 let writes=[],checked=0;
 const pipeline=new Pipeline({
   match:async x=>{checked++;x.product=null;x.match='missing'},
   research:async ins=>ins.map((x,i)=>({key:String(i),verified:true,upc:x.identifier,brand:x.product_name,product_name:x.product_name,official_url:'https://www.sephora.com/retailer'})),
   researchOfficialRetry:async ins=>ins.map((x,i)=>({key:String(i),verified:true,upc:x.identifier,brand:x.requestedBrand,product_name:x.requestedName,official_url:'https://www.sephora.com/retailer'})),
   create:async fact=>{writes.push(fact);return{id:String(writes.length),Product_Name:fact.product_name,UPC:fact.upc}},
   enrichExisting:async()=>{},autoEnrich:true,wait:async()=>{}
 });
 await pipeline.run([a,b]);assert.strictEqual(writes.length,2);assert.strictEqual(checked,4);
 assert.strictEqual(a.product.Product_Name,'Rare Earth Deep Pore Cleansing Mask 125 ml');
 assert.strictEqual(b.product.Product_Name,'Replasty Age Recovery Night Cream 100 ml');
 assert.strictEqual(a.offerName,'Nice Earth Deep Pore Cleansing Masque 125ml');
 const store={id:'p1',UPC:'3605973023352',Product_Name:'Mask',Brand_text:"KIEHL'S",Brand:{id:'B1'},HS_Code:null,Country_of_origin:null};
 const changes=[];
 const enricher=new Enricher({
   read:async()=>({...store}),
   update:async patch=>{changes.push(patch);Object.assign(store,patch)},
   research:async()=>[{key:'0',verified:true,upc:store.UPC,hs_code:'3304.99',country_of_origin:'United States'}],
   shouldPause:()=>false
 });
 const target={product:store,match:'matched',createdInCrm:true};
 await enricher.run([target]);
 assert.strictEqual(changes.length,1);
 assert.strictEqual(store.HS_Code,'3304.99');
 assert.strictEqual(store.Country_of_origin,'United States');
 console.log('PASS v1.49: official UPCs, exact titles, catalog metadata enrichment, UI pencils, custom-field payload');
})().catch(err=>{console.error(err);process.exitCode=1;});