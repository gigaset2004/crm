'use strict';
const assert=require('assert');
const fs=require('fs');
const vm=require('vm');
const path=require('path');
const root=path.join(__dirname,'..','versions','widget-v1.47','app');
const html=fs.readFileSync(path.join(root,'widget.html'),'utf8');
const Parser=require(path.join(root,'spreadsheet-import.js'));
const Pipeline=require(path.join(root,'order-pipeline.js'));
const priceSheet=[
 ['NARS'],
 ['EAN','NAME','QTY','PRICE USD','ORDER','TOTAL'],
 ['607845012351','Nars Radiant Creamy Concealer #Ginger',9420,16,100,1600],
 ['607845012665','Nars Radiant Creamy Concealer #Creme Brulee',660,16,null,0],
 ['607845066033','Nars Natural Radiant Longwear Foundation #Gobi',1519,26,350,9100],
 [null,null,null,null,2000,null],
 ['*Orders cannot be cancelled after submission',null,null,null,null,null]
];
const parsed=Parser.parseGrid(priceSheet,'Nars stock MinMaxDeals_18032049073 order.xlsx');
assert.strictEqual(parsed.items.length,2);
assert.strictEqual(parsed.items[0].quantity,100);
assert.strictEqual(parsed.items[0].price,16);
assert.strictEqual(parsed.audit.quantity,450);
assert.strictEqual(parsed.audit.amount,10700);
assert.strictEqual(parsed.audit.orderColumn,true);
assert.strictEqual(parsed.audit.priceHeader,'priceusd');
assert(html.includes('Version 1.47'));
assert(html.includes('border-bottom:5px solid #9baec6'));
assert(html.includes('importedFiles=new Set'));
assert(html.includes('linkMissingBrand:linkMissingBrandForImport'));
assert(html.includes('officialNameSource')); // original manufacturer evidence restriction
assert(html.includes('Offer Product Name'));
function extract(name){
 const re=new RegExp('(?:async\\s+)?function\\s+'+name+'\\s*\\(');
 const match=re.exec(html);assert(match,'missing '+name);
 const start=html.indexOf('{',match.index+match[0].length);
 let depth=0,i=start,quote='',escape=false;
 for(;i<html.length;i++){
   const c=html[i];if(quote){if(escape)escape=false;else if(c==='\\')escape=true;else if(c===quote)quote='';continue;}
   if(c==='"'||c==="'")quote=c;
   else if(c==='{')depth++;
   else if(c==='}'&&!--depth){i++;break;}
 }
 return html.slice(match.index,i);
}
const ctx={clean:s=>String(s==null?'':s).trim(),
brandKey:s=>String(s==null?'':s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]/gu,''),
canonicalBrand:s=>/^(nars|nars cosmetics|nars beauty)$/i.test(s)?'Nars':s||'',
};
vm.createContext(ctx);
vm.runInContext(extract('offerNameWithoutBrand'),ctx);
for(const [source,brand,expected] of [
 ['Nars Radiant Creamy Concealer 6Ml #Ginger','Nars','Radiant Creamy Concealer 6Ml #Ginger'],
 ['NARS Cosmetics Sheer Glow Foundation','Nars','Sheer Glow Foundation'],
 ['NARS—Light Reflecting Foundation','Nars','Light Reflecting Foundation'],
 ['Sheer Glow Foundation by Nars','Nars','Sheer Glow Foundation by Nars'],
 ['NARS','Nars','NARS'],
 ['Narsoline Makeup','Nars','Narsoline Makeup'],
 ['Gucci Beauty Flora Gorgeous Jasmine','Gucci','Flora Gorgeous Jasmine']
])assert.strictEqual(ctx.offerNameWithoutBrand(source,brand),expected);
assert.strictEqual(typeof Pipeline.officialNameSource,'function');
assert.strictEqual(Pipeline.officialNameSource({verified:true,product_name:'Test',evidence:{product_name:{url:'https://www.sephora.com/product/example'}}},'NARS'),'');
assert(Pipeline.officialNameSource({verified:true,product_name:'Test',evidence:{product_name:{url:'https://www.narscosmetics.jp/product/example'}}},'NARS'));
console.log('PASS v1.47: ORDER, PRICE USD, footer, offer brand trimming, official manufacturer gate, brand-link hook and UI rules');
