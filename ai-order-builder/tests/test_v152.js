'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
const widget=fs.readFileSync(path.join(root,'versions/widget-v1.52/app/widget.html'),'utf8');
const moduleEnricher=require(path.join(root,'versions/widget-v1.52/app/product-enrichment.js'));
assert(widget.includes('Version 1.52'));
assert(widget.includes('for(var ch of original)'));
assert(widget.includes('timeoutMs:45000'));
assert(widget.includes('data-trade-field="coo"'));
assert(widget.includes('window.localStorage.setItem'));
const clean=v=>String(v==null?'':v).trim();
const brandIndex=widget.indexOf('    function brandKey('),brandEnd=widget.indexOf('    function publicBrandName(',brandIndex);
const start=widget.indexOf('function offerNameWithoutBrand(value,brand){'),end=widget.indexOf('    function offerNameFor(',start);
const strip=Function('clean',widget.slice(brandIndex,brandEnd)+widget.slice(start,end)+'\nreturn offerNameWithoutBrand;')(clean);
for(const [title,brand,expected]of [
 ["Kiehls Rare Earth Deep Pore Cleansing Mask","KIEHL'S","Rare Earth Deep Pore Cleansing Mask"],
 ["Kiehl’s Rare Earth Mask","Kiehls","Rare Earth Mask"],
 ["KIEHL'S Rare Earth Mask","Kiehls","Rare Earth Mask"],
 ["Kiehl s Rare Earth Mask","Kiehl's","Rare Earth Mask"],
 ["Kiehlsmask","Kiehls","Kiehlsmask"],
 ["Nars Cosmetics Light Reflecting Foundation","Nars","Light Reflecting Foundation"],
 ["Narsoline Lotion","Nars","Narsoline Lotion"],
 ["Clé de Peau Beauté Correcting Cream","Cle De Peau Beaute","Correcting Cream"]
])assert.strictEqual(strip(title,brand),expected);
assert(moduleEnricher.corroboratedOrigin);
assert.strictEqual(moduleEnricher.corroboratedOrigin({
 UPC:'3614274101584',Product_Name:'Replasty Age Recovery Night Cream',
 Brand_text:'Helena Rubinstein'},{}).country,'France');
assert.strictEqual(moduleEnricher.corroboratedOrigin({
 UPC:'3614274101585',Product_Name:'Replasty Age Recovery Night Cream',
 Brand_text:'Helena Rubinstein'},{}),null);
const scripts=['Fill_with_AI_BUTTON_v1.39.js','Sales_Orders_CREATE_onLoad_v1.39.js'];
for(const f of scripts){
 const s=fs.readFileSync(path.join(root,'client-scripts',f),'utf8');
 assert(s.includes('var aiBridgeV139'));
 assert(s.includes('widget_closed'));
 assert(s.includes('Supplier was not saved on row'));
 assert(s.includes('HS Code was not transferred'));
 assert(s.includes('Country of Origin was not transferred'));
 assert(s.includes('strictWidgetPrice'));
}
console.log('PASS v1.52/v1.39: brand aliases, COO verification, cancellation and regressions');
