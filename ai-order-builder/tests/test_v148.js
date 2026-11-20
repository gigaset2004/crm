'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const base=path.join(__dirname,'..','versions','widget-v1.48','app');
const Pipeline=require(path.join(base,'order-pipeline.js'));
const html=fs.readFileSync(path.join(base,'widget.html'),'utf8');
assert(html.includes('Version 1.48'));
assert(html.includes('window.sessionStorage'));
assert(html.includes('rememberAISession(e.data.token)'));
assert(html.includes('clearAISession()'));
assert(html.includes('prepareItem:inferBrandForItem'));
assert(html.includes('researchOfficialRetry:researchOfficialRetry'));
assert(html.includes('Brand creation not confirmed'));
assert(html.includes('offerNameWithoutBrand'));
assert(html.includes('border-bottom:5px solid #9baec6'));
const cases=[
 ['NARS','https://www.narscosmetics.com/foundation',true],
 ["Kiehl's",'https://www.kiehls.com/masks',true],
 ['Clé de Peau Beauté','https://www.cledepeaubeaute.com/primer',true],
 ['Helena Rubinstein','https://www.helenarubinstein.com/int/age-recovery',true],
 ["Kiehl's",'https://sephora.com/product',false],
 ["Kiehl's",'https://kiehls.com.evil.com/fake',false]
];
cases.forEach(([brand,url,expected])=>assert.strictEqual(!!Pipeline.officialNameSource({verified:true,product_name:'Test',official_url:url},brand),expected));
(async()=>{
  async function run(official,otherUPC){let creates=0,retries=0;
    const item={identifier:'3605973023352',requestedName:'Kiehls Rare Earth Mask 125ml',offerName:'Rare Earth Mask 125ml',quantity:30,price:27,match:'pending',product:null,sourceType:'import'};
    const p=new Pipeline({prepareItem:it=>{it.requestedBrand="Kiehl's"},match:async it=>{it.product=null;it.match='missing';},
      research:async()=>[{key:'0',verified:true,upc:item.identifier,brand:"Kiehl's",product_name:'Rare Earth Mask 125ml',official_url:'https://sephora.com/test'}],
      researchOfficialRetry:async()=>{retries++;return[{key:'0',verified:true,upc:otherUPC?'999999999999':item.identifier,brand:"Kiehl's",product_name:'Rare Earth Mask 125ml',official_url:official?'https://www.kiehls.com/skincare/masks/rare-earth/':'https://sephora.com/test'}]},
      create:async f=>{creates++;return{id:'CRMNEW',Product_Name:f.product_name,UPC:f.upc};}
    });await p.run([item]);return{creates,retries,item};
  }
  const ok=await run(true,false),bad=await run(false,false),wrong=await run(true,true);
  assert.strictEqual(ok.creates,1);assert.strictEqual(ok.retries,1);assert.strictEqual(bad.creates,0);assert.strictEqual(wrong.creates,0);
  assert.strictEqual(ok.item.offerName,'Rare Earth Mask 125ml');
  console.log('PASS v1.48: official site, UPC safety, research retry, short-lived authorization and legacy behavior');
})().catch(e=>{console.error(e.stack);process.exitCode=1;});