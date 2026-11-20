'use strict';
const assert=require('assert');
const Pipeline=require('../versions/widget-v1.46/app/order-pipeline.js');
const Parser=require('../versions/widget-v1.46/app/spreadsheet-import.js');
const fs=require('fs');
const path=require('path');
const html=fs.readFileSync(path.join(__dirname,'../versions/widget-v1.46/app/widget.html'),'utf8');
assert(html.includes('Version 1.46'));
assert(html.includes('quickOfficialConfirmed'));
assert(html.includes('manualOfficialNameConfirmed:true'));
assert(html.includes('Official manufacturer source for Product Name is missing'));
const sources=[
  ['https://www.narscosmetics.com/en/foundation','NARS',true],
  ['https://www.narscosmetics.co.uk/foundation','NARS',true],
  ['https://www.narscosmetics.fr/teint','NARS',true],
  ['https://www.narscosmetics.jp/foundation','NARS',true],
  ['https://sephora.com/nars','NARS',false],
  ['https://narscosmetics.com.evil.com/nars','NARS',false],
  ['', 'NARS',false]
];
sources.forEach(([u,brand,expected])=>{
  const result=!!Pipeline.officialNameSource({verified:true,product_name:'Light Reflecting Foundation 30ml',evidence:{product_name:{url:u}}},brand);
  assert.strictEqual(result,expected,'Official manufacturer URL filtering: '+u);
});
const grid=[['NARS'],['UPC','Product Name','QTY','PRICE USD','ORDER'],['607845012351','Nars Foundation (supplier title)',916,26,100],['607845012313','Nars Concealer',480,20,''],['607845012337','Nars Lipstick',40,10,0]];
const parsed=Parser.parseGrid(grid,'nars.xlsx');
assert.strictEqual(parsed.items.length,1);
assert.strictEqual(parsed.items[0].quantity,100);
assert.strictEqual(parsed.items[0].price,26);
assert.strictEqual(parsed.audit.quantity,100);
assert.strictEqual(parsed.audit.orderColumn,true);
async function run(source,resultUPC){
  let created=[],lookups=0;
  const item={identifier:'607845012351',requestedName:'Nars Foundation (supplier title)',offerName:'Nars Foundation (supplier title)',requestedBrand:'NARS',quantity:100,price:26,sourceType:'import',autoCreateFromSheet:true,match:'pending',product:null};
  const p=new Pipeline({
    match:async it=>{lookups++;it.product=null;it.match='missing';},
    research:async()=>[{key:'0',verified:true,upc:resultUPC||item.identifier,brand:'NARS',product_name:'Light Reflecting Foundation 30ml',evidence:{product_name:{url:source}}}],
    create:async fact=>{created.push(fact);return{id:'CRM-NEW',UPC:fact.upc,Product_Name:fact.product_name};}
  });
  await p.run([item]);
  return{item,created,lookups};
}
(async()=>{
  const ok=await run('https://www.narscosmetics.co.uk/foundation');
  assert.strictEqual(ok.created.length,1);
  assert.strictEqual(ok.created[0].product_name,'Light Reflecting Foundation 30ml');
  assert.strictEqual(ok.item.offerName,'Nars Foundation (supplier title)');
  assert.strictEqual(ok.item.quantity,100);
  assert.strictEqual(ok.item.price,26);
  assert.strictEqual(ok.lookups,2);
  const retail=await run('https://sephora.com/nars');
  assert.strictEqual(retail.created.length,0);
  const unknown=await run('');
  assert.strictEqual(unknown.created.length,0);
  assert(unknown.item.note.includes('NOT created'));
  const mismatch=await run('https://www.narscosmetics.com/foundation','607845999999');
  assert.strictEqual(mismatch.created.length,0);
  console.log('PASS: v1.46 official-source-only creation and offer/order preservation');
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
