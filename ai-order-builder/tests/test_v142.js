const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const html = fs.readFileSync('/mnt/data/ai_builder_v142/widget/app/widget.html','utf8');
function grab(name){
  const regexp = new RegExp('(?:async\\s+)?function\\s+'+name+'\\s*\\(');
  const m=regexp.exec(html);
  assert(m,'missing function '+name);
  let j=html.indexOf('{',m.index+m[0].length),depth=1,i=j+1,quote='',escaped=false;
  while(depth && i<html.length){let c=html[i];if(quote){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c===quote)quote='';}
    else if(c==='"'||c==="'"||c==='`')quote=c;else if(c==='{')depth++;else if(c==='}')depth--;i++;}
  return html.slice(m.index,i);
}
const BRAND_ID='4888374000063587438';
const makeProducts=(count)=>Array.from({length:count},(_,i)=>({id:String(900000+i),Product_Name:'Dove item '+String(i).padStart(4,'0'),UPC:String(100000000000+i),Brand_text:'Dove',Unit_Price:5.5}));
function sandbox(products,rankFn){
  const calls=[],messages=[],state={render:0};
  const fields={manualSearchBtn:{disabled:false},manualBrand:{value:BRAND_ID},manualQuery:{value:''},manualResults:{innerHTML:''},catalogCount:{textContent:''}};
  const s={console,Promise,Map,Set,Number,Array,String,Math,manualCatalogLoading:false,manualSearching:false,manualCatalogToken:0,manualCatalogProducts:[],manualCatalogSelected:new Set(),manualCatalogPage:0,manualCatalogIsRanked:false,manualBrandCache:new Map(),managerBrandRecords:[{id:BRAND_ID,name:'DOVE'}],crmReady:true,
    $:id=>fields[id]||(fields[id]={}),clean:v=>v==null?'':String(v).trim(),brandKey:v=>String(v||'').toLowerCase().replace(/[^a-z0-9]/g,''),
    sqlValue:v=>String(v||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'"),num:v=>Number(v)||0,esc:v=>String(v),
    msg:(id,msg)=>messages.push([id,msg]),uniqueProducts:rows=>[...new Map(rows.map(p=>[p.id,p])).values()],
    catalogRankSort:(a,b)=>(Number(b.confirmedQty)||0)-(Number(a.confirmedQty)||0)||a.Product_Name.localeCompare(b.Product_Name),
    renderCatalogResults:()=>{state.render++},
    catalogSetProducts:function(rows,ranked){s.manualCatalogProducts=rows.slice().sort(ranked?s.catalogRankSort:(a,b)=>a.Product_Name.localeCompare(b.Product_Name));s.manualCatalogIsRanked=ranked;s.manualCatalogSelected.clear();s.manualCatalogPage=0;s.renderCatalogResults();},
    window:{ProcurementSearchSelect:{sync(){state.synced=true;}}}
  };
  s.ZOHO={CRM:{API:{coql:async ({select_query:query})=>{
    calls.push(query);
    const m=query.match(/limit\s+(\d+),\s*(\d+)$/i);
    assert(m,'every COQL call has LIMIT');
    const offset=Number(m[1]),size=Number(m[2]);
    assert.strictEqual(size,200,'do not trigger SDK 2000-record LIMIT_EXCEEDED');
    if(query.includes('from Products')){
      const data=products.slice(offset,offset+size);
      return {data,info:{more_records:offset+size<products.length}};
    }
    if(query.includes('from Ordered_Items'))return await rankFn(query,offset,size);
    throw Error('unexpected COQL '+query);
  }}}};
  vm.createContext(s);
  for(const name of ['coqlPaged','loadBrandCatalog','searchCatalogManual'])vm.runInContext(grab(name),s);
  return {s,fields,calls,messages,state};
}
(async()=>{
  // Actual connected CRM checked earlier: DOVE has 26 product rows.
  {
    const t=sandbox(makeProducts(26),async()=>({code:'LIMIT_EXCEEDED',message:'limit exceeded'}));
    await t.s.loadBrandCatalog(BRAND_ID);
    assert.strictEqual(t.s.manualCatalogProducts.length,26);
    assert.strictEqual(t.s.manualCatalogIsRanked,false);
    assert(t.messages.at(-1)[1].includes('26 product(s)'));
    assert(t.messages.at(-1)[1].includes('ranking unavailable'));
    assert.strictEqual(t.fields.manualSearchBtn.disabled,false);
    assert(t.calls.some(q=>q.includes("Brand_text = 'DOVE'")));
    console.log('PASS: DOVE 26 items all visible when ranking returns LIMIT_EXCEEDED');
  }
  {
    const t=sandbox(makeProducts(450),async()=>({data:[],info:{more_records:false}}));
    await t.s.loadBrandCatalog(BRAND_ID);
    assert.strictEqual(t.s.manualCatalogProducts.length,450);
    assert.strictEqual(t.s.manualCatalogIsRanked,true);
    const offsets=t.calls.filter(q=>q.includes('from Products')).map(q=>Number(q.match(/limit (\d+),/)[1]));
    assert.deepStrictEqual(offsets,[0,200,400]);
    console.log('PASS: 450 products loaded across three COQL pages without truncation');
  }
  {
    const product=makeProducts(3);
    const t=sandbox(product,async()=>({data:[{Product_Name:{id:product[1].id},'SUM(Quantity)':500}],info:{more_records:false}}));
    // simulate a user selecting an item while sales ranking is loading
    const original=t.s.catalogSetProducts;
    t.s.catalogSetProducts=(rows,ranked)=>{original(rows,ranked);if(rows.length)t.s.manualCatalogSelected.add(product[0].id);};
    await t.s.loadBrandCatalog(BRAND_ID);
    assert.strictEqual(t.s.manualCatalogProducts.length,3);
    assert.strictEqual(t.s.manualCatalogProducts[0].id,product[1].id);
    assert(t.s.manualCatalogSelected.has(product[0].id));
    console.log('PASS: ranking sorts by sales quantity without clearing user selection');
  }
  {
    const t=sandbox(makeProducts(26),async()=>({data:[],info:{more_records:false}}));
    t.fields.manualBrand.value='';t.fields.manualQuery.value='dove';
    t.s.searchCatalogManual();
    assert.strictEqual(t.fields.manualBrand.value,BRAND_ID);
    assert.strictEqual(t.fields.manualQuery.value,'');
    await new Promise(resolve=>setImmediate(resolve));
    assert.strictEqual(t.s.manualCatalogProducts.length,26);
    assert(t.state.synced);
    console.log('PASS: entering DOVE in product search and pressing Enter opens brand catalog');
  }
  {
    const t=sandbox(makeProducts(0),async()=>({data:[],info:{more_records:false}}));
    await t.s.loadBrandCatalog(BRAND_ID);
    assert.strictEqual(t.s.manualCatalogProducts.length,0);
    assert(t.messages.at(-1)[1].includes('No Products in CRM'));
    assert.strictEqual(t.s.manualSearching,false);
    console.log('PASS: zero brand products are reported explicitly');
  }
  {
    const f=fs.readFileSync('/mnt/data/ai_builder_v142/widget/app/searchable-select.js','utf8');
    assert(f.includes("changed || inst.select.id === 'manualBrand'"));
    assert(html.includes('Version 1.42'));
    assert(html.includes('line-validation-error')&&html.includes('data-copy-product-name'));
    console.log('PASS: re-selecting brand retries; validation and copy-name remain intact');
  }
})().catch(e=>{console.error(e.stack);process.exitCode=1;});