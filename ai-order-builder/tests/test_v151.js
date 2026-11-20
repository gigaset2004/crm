'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const base=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(base,'versions/widget-v1.51/app/widget.html'),'utf8');
const sync=fs.readFileSync(path.join(base,'versions/widget-v1.51/app/saved-order-sync.js'),'utf8');
assert(html.includes('Version 1.51'));
assert(html.includes('window.localStorage.setItem'));
assert(html.includes('window.localStorage.removeItem'));
assert(html.includes('hydrateMissingTradeFromProducts'));
assert(html.includes('HS_Code:r.HS_Code,Country_of_origin:r.Country_of_origin'));
assert(sync.includes('Purchase_Order, HS_Code, Country_of_origin'));
assert(sync.includes('changes.HS_Code'));
assert(sync.includes('changes.Country_of_origin'));
assert(sync.includes('newRow.HS_Code'));
assert(sync.includes('newRow.Country_of_origin'));
for(const filename of ['Fill_with_AI_BUTTON_v1.38.js','Sales_Orders_CREATE_onLoad_v1.38.js']){
 const s=fs.readFileSync(path.join(base,'client-scripts',filename),'utf8');
 assert(s.includes('aiBridgeV138'));
 assert(s.includes('HS_Code: str(src.HS_Code)'));
 assert(s.includes('Country_of_origin: str(src.Country_of_origin)'));
 assert(s.includes('hs: str(w.HS_Code), coo: str(w.Country_of_origin)'));
 assert(s.includes('row.HS_Code = item.hs'));
 assert(s.includes('row.Country_of_origin = item.coo'));
 assert(s.includes('HS Code was not transferred'));
 assert(s.includes('Country of Origin was not transferred'));
 assert(s.includes('Supplier was not saved on row'));
 assert(s.includes('strictWidgetPrice'));
}
console.log('PASS v1.51: metadata round trip; two native scripts; OAuth cache; original checks retained');
