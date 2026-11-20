'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
const dirname=path.join(root,'versions/widget-v1.53/app');
const E=require(path.join(dirname,'product-enrichment.js'));
const P=require(path.join(dirname,'order-pipeline.js'));
const html=fs.readFileSync(path.join(dirname,'widget.html'),'utf8');

assert(html.includes('Version 1.53'));
assert(html.includes('researchMissingTrade'));
assert(html.includes('researchMetadata:researchMissingTrade'));
assert(html.includes('window.ProductEnricher.verifiedTradeFields'));
assert(html.includes('timeoutMs:25000')&&html.includes('timeoutMs:20000'));
assert(html.includes('offerNameWithoutBrand'));
assert(!html.includes('corroboratedOrigin'));
assert(!('vettedOfficialProduct' in P));
for(const source of [html,fs.readFileSync(path.join(dirname,'product-enrichment.js'),'utf8'),
 fs.readFileSync(path.join(dirname,'order-pipeline.js'),'utf8')]){
 assert(!source.includes('3614274101584'));
 assert(!source.includes('3605973023352'));
}
assert.deepStrictEqual(E.verifiedTradeFields({
 verified:true,upc:'1234567890123',brand:'Example Brand Cosmetics',
 hs_code:'3304.99',country_of_origin:'Portugal',
 evidence:{country_of_origin:{value:'Portugal',url:'https://brand.example/origin'}}
},{UPC:'1234567890123',Brand_text:'Example Brand'},{}),
 {hs:'3304.99',coo:'Portugal'});
const verified=(upc,coo,evidence,verified=true)=>({
 key:'0',verified,upc,brand:'Example Brand',
 product_name:'Hydrating Cream 100 ml',
 hs_code:'3304.99',country_of_origin:coo,
 evidence:{country_of_origin:evidence?{url:evidence,value:coo}:null}
});
async function run({first,second,oldCOO=null}){
 const upc='1234567890123',brand='Example Brand';
 let store={id:'P1',UPC:upc,Product_Name:'Hydrating Cream 100 ml',
   Brand_text:brand,Country_of_origin:oldCOO,HS_Code:null},
   writes=[],retries=0;
 const item={product:{...store},match:'matched',identifier:upc,requestedBrand:brand};
 const e=new E({
  read:async()=>({...store}),
  update:async patch=>{writes.push(patch);store={...store,...patch}},
  research:async()=>first?[first]:[],
  researchMetadata:async()=>{retries++;return second?[second]:[]},
  brandHint:()=>brand,shouldPause:()=>false
 });
 await e.run([item]);
 return {store,writes,retries};
}
(async()=>{
 const good=await run({first:verified('1234567890123','Portugal','https://example.com/origin')});
 assert.equal(good.store.Country_of_origin,'Portugal');
 assert.equal(good.retries,0);
 const secondary=await run({
  first:verified('1234567890123','Portugal',null),
  second:verified('1234567890123','Canada','https://shop.example.com/product')
 });
 assert.equal(secondary.store.Country_of_origin,'Canada');
 assert.equal(secondary.retries,1);
 const noProof=await run({first:verified('1234567890123','Portugal',null)});
 assert.equal(noProof.store.Country_of_origin,null);
 const wrongBarcode=await run({first:verified('9999999999999','Portugal','https://shop.example.com/p')});
 assert.equal(wrongBarcode.store.Country_of_origin,null);
 const wrongBrand=await run({first:{...verified('1234567890123','Portugal','https://shop.example.com/p'),brand:'Other Brand'}});
 assert.equal(wrongBrand.store.Country_of_origin,null);
 const existing=await run({first:verified('1234567890123','Portugal','https://shop.example.com/p'),oldCOO:'Japan'});
 assert.equal(existing.store.Country_of_origin,'Japan');
 assert.equal(existing.retries,0);
 console.log('PASS v1.53: generic two-pass metadata; source/UPC/brand checks; no static COO map; existing origin preserved');
})().catch(e=>{console.error(e.stack);process.exitCode=1});
