from pathlib import Path
from playwright.sync_api import sync_playwright
ns={}
target=Path('/mnt/data/ai_v139_save_reload/test_v139.py').read_text().split('with sync_playwright() as p:')[0]
exec(target,ns)
source=ns['source'];code=ns['code']
original_sdk='<script src="https://live.zwidgets.com/js-sdk/1.5/ZohoEmbededAppSDK.min.js"></script>'

def run_case(browser, name, patched, expected_message, expected_refresh, expected_quantity):
    html=source.replace(original_sdk,'<script>'+patched+'</script>')
    page=browser.new_page(viewport={'width':1440,'height':870})
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.set_content(html,wait_until='load')
    page.wait_for_function("document.querySelectorAll('#rows tr').length===1 && !document.getElementById('createBtn').disabled",timeout=15000)
    page.locator('#rows input[data-k="quantity"]').first.fill('7')
    page.locator('#createBtn').click()
    page.wait_for_function('arg=>document.getElementById("matchMessage").textContent.includes(arg)',arg=expected_message,timeout=15000)
    refresh=page.evaluate('window.__refreshCount||0')
    quantity=page.evaluate('window.__test.getState().Ordered_Items[0].Quantity')
    assert refresh==expected_refresh,(name,refresh)
    assert quantity==expected_quantity,(name,quantity)
    assert 'API v8' not in page.locator('#savedSOStatusBanner').inner_text(),name
    assert not errors,(name,errors)
    print('PASS',name, 'quantity',quantity,'refresh',refresh,'message',page.locator('#matchMessage').inner_text()[:140])
    page.close()

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    c=code.replace('__MODE__','getfull')
    # API rejects update: do not close/reload and do not claim changes saved.
    fail=c.replace('put:async(path,payload)=>{updates.push', 'put:async(path,payload)=>{throw new Error("Save was rejected");updates.push')
    assert fail!=c
    run_case(browser,'failed save does not reload',fail,'Could not confirm the changes',0,1)
    # If the Zoho popup host has no closeReload(), keep user in the widget and show manual instruction.
    no_refresh=c.replace('Popup:{closeReload:async()=>{window.__refreshCount=(window.__refreshCount||0)+1;return true;}}', 'Popup:{}')
    assert no_refresh!=c
    run_case(browser,'missing popup refresh fallback',no_refresh,'Please close this window and refresh the Sales Order',0,7)
    # A rejected popup-close should not change the saved status or misreport a failed save.
    false_refresh=c.replace('return true;}}}', 'return false;}}}')
    assert false_refresh!=c
    run_case(browser,'popup refresh returns false',false_refresh,'Please close this window and refresh the Sales Order',1,7)
    browser.close()
