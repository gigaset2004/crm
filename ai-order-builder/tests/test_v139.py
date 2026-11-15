from pathlib import Path
from playwright.sync_api import sync_playwright
import json
base=Path('/mnt/data/ai_v139_save_reload/app')
source=(base/'widget.html').read_text()
for script in ['product-enrichment.js','order-pipeline.js','diagnostics.js','searchable-select.js','spreadsheet-import.js','saved-order-sync.js']:
    source=source.replace('<script src="'+script+'"></script>','<script>'+(base/script).read_text().replace('</script>','<\\/script>')+'</script>')
assert '<script src="' not in source.replace('<script src="https://live.zwidgets.com/js-sdk/1.5/ZohoEmbededAppSDK.min.js"></script>','')
code='''(()=>{
const id='4888374000132396005';
const original={id,Subject:'SO-261115UQS-Nars',Status:'Requested',Modified_Time:'2026-11-15T09:44:10-05:00',Ordered_Items:[{id:'4888374000132396006',Product_Name:{id:'4888374000015167036',name:'Nars And God Created The Woman Eye Kit #8313'},Quantity:1,List_Price:15,UPC:'607845083139',Brand:'Nars',Offer_Product_Name:'Nars from offer',Supplier:{id:'s1',name:'AN2'},Purchase_Order:null}]};
let state=JSON.parse(JSON.stringify(original)),onLoad,updates=[],zrcGets=0,zrcPosts=0,sdkCoql=0;
const mode='__MODE__';const failAll=(mode==='fail');
const copy=x=>JSON.parse(JSON.stringify(x));
const subform=()=>copy(state.Ordered_Items).map(x=>({...x,Parent_Id:{id,name:state.Subject}}));
const parent=()=>{let p=copy(state);delete p.Ordered_Items;return p};
window.__test={getState:()=>state,getUpdates:()=>updates,stats:()=>({zrcGets,zrcPosts,sdkCoql}),fire:(d)=>onLoad(d)};
window.ZOHO={embeddedApp:{on:(event,fn)=>{if(event==='PageLoad')onLoad=fn;},init:()=>{onLoad({Entity:'SalesOrders',EntityId:[id],ButtonPosition:'DetailView'});return Promise.resolve(true);}},CRM:{CONFIG:{getCurrentUser:()=>Promise.resolve({users:[{id:'user1'}]}),getOrgInfo:()=>Promise.resolve({org:[{id:'org1'}]})},UI:{Resize:()=>Promise.resolve(true),Popup:{closeReload:async()=>{window.__refreshCount=(window.__refreshCount||0)+1;return true;}}},API:{getRecord:async(o)=>({data:[parent()]}),updateRecord:async(o)=>{updates.push(o);return {data:[{code:'SUCCESS'}]};},getAllRecords:async(o)=>({data:o.Entity==='Supplier_Codes'?[{id:'s1',Name:'AN2'},{id:'s2',Name:'SUP'}]:o.Entity==='Brands'?[{id:'b1',Name:'Nars'}]:[]}),searchRecord:async(o)=>({data:[{id:'p2',Product_Name:'Other Nars Product',UPC:'999999999999',Brand_text:'Nars',Unit_Price:10.5}]}),coql:async(c)=>{sdkCoql++;if(failAll)throw {code:'OAUTH_SCOPE_MISMATCH',message:'Cannot query records'};return {data:subform(),info:{count:state.Ordered_Items.length,more_records:false}};}}}};
if(mode!=='sdk'){
window.zrc={
get:async(path)=>{zrcGets++; if(failAll||mode==='getthrows')throw {status:403,code:'NO_PERMISSION',message:'No read access'};let p=parent();if(mode==='getfull')p.Ordered_Items=copy(state.Ordered_Items);if(mode==='getempty')p.Ordered_Items=[];return {status:200,data:{data:[p]}};},
post:async(path,body)=>{zrcPosts++;if(failAll)throw {status:401,code:'OAUTH_SCOPE_MISMATCH',message:'Cannot run COQL'};if(!path.endsWith('/coql')||!body.select_query.includes(id))throw Error('wrong query');return {status:200,data:{data:subform(),info:{count:state.Ordered_Items.length,more_records:false}}};},
put:async(path,payload)=>{updates.push({path,payload});let changed=copy(state);for(const u of payload.data[0].Ordered_Items){if(Object.prototype.hasOwnProperty.call(u,'_delete')){changed.Ordered_Items=changed.Ordered_Items.filter(i=>i.id!==u.id);continue;}if(u.id){let r=changed.Ordered_Items.find(i=>i.id===u.id);Object.assign(r,u)}else{changed.Ordered_Items.push({...u,id:'newID'})}}changed.Modified_Time='2026-11-15T10:12:00-05:00';state=changed;return {status:200,data:{data:[{code:'SUCCESS'}]}};}
};
}
})();'''

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    for mode in ['getfull','getmissing','getempty','getthrows']:
        html=source.replace('<script src="https://live.zwidgets.com/js-sdk/1.5/ZohoEmbededAppSDK.min.js"></script>','<script>'+code.replace('__MODE__',mode)+'</script>')
        page=browser.new_page(viewport={'width':1550,'height':900})
        errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.set_content(html,wait_until='load')
        page.wait_for_function("document.getElementById('createBtn').textContent==='Save SO Products' && !document.getElementById('createBtn').disabled && document.querySelectorAll('#rows tr').length===1",timeout=15000)
        assert 'Nars And God Created' in page.locator('#rows').inner_text(),(mode,page.locator('#sourceMessage').inner_text())
        assert page.locator('#rows input[data-k="quantity"]').first.input_value()=='1'
        assert page.locator('#rows input[data-k="offerName"]').first.input_value()=='Nars from offer'
        assert page.locator('#rows select[data-k="supplierCode"]').first.input_value()=='s1'
        page.locator('#rows input[data-k="quantity"]').first.fill('7')
        page.locator('#createBtn').click()
        page.wait_for_function("window.__refreshCount===1",timeout=15000)
        state=page.evaluate('window.__test.getState()')
        assert state['Ordered_Items'][0]['Quantity']==7,(mode,state)
        assert page.evaluate('window.__test.getUpdates()[0].payload.data[0].Ordered_Items[0].Quantity')==7
        assert page.locator('#savedSOStatusTitle').inner_text()=='Sales Order ready',mode
        assert 'via' not in page.locator('#savedSOStatusText').inner_text(),mode
        page.locator('#tabManual').click()
        page.locator('#manualQuery').fill('Other Nars')
        page.locator('#manualSearchBtn').click()
        page.locator('button[data-catalog-add="p2"]').wait_for(timeout=15000)
        page.locator('button[data-catalog-add="p2"]').click()
        assert page.locator('#rows tr').count()==2
        page.locator('#rows input[data-k="quantity"]').nth(1).fill('4')
        page.locator('#rows input[data-k="price"]').nth(1).fill('12.75')
        page.locator('#rows input[data-k="offerName"]').nth(1).fill('Nars offer only name')
        page.locator('#rows select[data-k="supplierCode"]').nth(1).evaluate("el => {el.value='s2';el.dispatchEvent(new Event('change',{bubbles:true}));}")
        page.locator('#createBtn').click()
        page.wait_for_function("window.__refreshCount===2",timeout=15000)
        state=page.evaluate('window.__test.getState()')
        assert len(state['Ordered_Items'])==2,(mode,state)
        assert state['Ordered_Items'][1]['Offer_Product_Name']=='Nars offer only name'
        assert state['Ordered_Items'][1]['Quantity']==4
        assert state['Ordered_Items'][1]['Supplier']['id']=='s2'
        assert state['Ordered_Items'][1]['List_Price']==12.75
        page.locator('#rows button[data-remove]').nth(1).click()
        page.locator('#createBtn').click()
        page.wait_for_function("window.__refreshCount===3",timeout=15000)
        state=page.evaluate('window.__test.getState()')
        assert len(state['Ordered_Items'])==1,(mode,state)
        assert state['Ordered_Items'][0]['Quantity']==7
        assert not errors,(mode,errors)
        print('PASS',mode,'read source & edit/append/remove',page.evaluate('window.__test.stats()'))
        page.close()
    # Missing permissions: do not enable saving empty form and show actionable reason.
    mode='fail'
    html=source.replace('<script src="https://live.zwidgets.com/js-sdk/1.5/ZohoEmbededAppSDK.min.js"></script>','<script>'+code.replace('__MODE__',mode)+'</script>')
    page=browser.new_page()
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.set_content(html,wait_until='load')
    page.wait_for_function("document.getElementById('savedSOStatusTitle').textContent==='Could not load products'",timeout=15000)
    assert page.locator('#createBtn').is_disabled(), 'saving should be blocked on failed load'
    err=page.locator('#savedSOStatusText').inner_text()
    assert 'API v8' not in err and 'v1.38' not in err and 'Could not load' in err,err
    assert not errors,errors
    print('PASS',mode,'no data corruption, error',err[:180])
    page.close()
    browser.close()
