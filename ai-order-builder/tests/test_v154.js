'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const dir=path.join(__dirname,'../versions/widget-v1.54/app');
const html=fs.readFileSync(path.join(dir,'widget.html'),'utf8');
assert(html.includes('Version 1.54'));
assert(html.includes('trade-missing'));
assert(html.includes('hs?"trade-present":"trade-missing"'));
assert(html.includes('coo?"trade-present":"trade-missing"'));
assert(html.includes('border:0!important;box-shadow:none!important;background:transparent!important'));
assert(html.includes('researchMissingTrade'));
assert(!html.includes('research_focus:"country_of_origin,hs_code"'));
assert(!html.includes('require_field_sources:true'));
assert(!html.includes('vettedOfficialProduct'));
assert(!html.includes('corroboratedOrigin'));
assert(html.includes('lineHS(it)')&&html.includes('lineCOO(it)'));
const start=html.indexOf('    function researchMissingTrade(batch){');
const end=html.indexOf('    async function enrichExisting(value,notify){',start);
assert(start>0&&end>start);
let request=null,options=null;
const fn=Function('clean','researchProducts',html.slice(start,end)+';return researchMissingTrade;')(
 v=>String(v==null?'':v).trim(),
 async (products,opts)=>{
   const keys=Object.keys(products[0]).sort();
   assert.deepStrictEqual(keys,['identifier','key','product_name']);
   request=products[0];options=opts;
   return [{key:'0',verified:true,upc:products[0].identifier}];
 });
(async()=>{
 const result=await fn([{identifier:'1234567890123',brand:'Brand',product_name:'Test Cream'}]);
 assert.equal(request.identifier,'1234567890123');
 assert.equal(options.timeoutMs,20000);
 assert.equal(result.length,1);
 const line=html.slice(html.indexOf('    function lineIssues('),html.indexOf('    function researchProducts('));
 assert(!line.includes('errs.push("HS'));
 assert(!line.includes('errs.push("COO'));
 console.log('PASS v1.54: API payload contract, optional customs fields, unframed tiny pencils');
})().catch(e=>{console.error(e.stack);process.exitCode=1});
