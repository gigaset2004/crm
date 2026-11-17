(function(root){
  "use strict";
  var allowed=new Set(['stage','status','request_id','duration_ms','count','cache_hit','model','provider','line','upc','product_id','hs_digits','coo_found','brand_found','retry_after','error_code','message']);
  function str(value){return String(value==null?"":value).replace(/[\u0000-\u001f\u007f]/g," ").trim();}
  function number(value){return Number(value)||0;}
  function effectivePrice(item){return item.price==null?((item.sourceType==='import'||item.sourceFile)?null:(item.product&&item.product.Unit_Price)):item.price;}
  function priceDescription(item){var value=effectivePrice(item);return value==null||!Number.isFinite(Number(value))?'MISSING':money(value);}
  function money(value){return "$"+number(value).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});}
  function Log(build){this.build=build;this.started=Date.now();this.id=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10);this.events=[];this.sources=[];}
  Log.prototype.addSources=function(requestId,stages){var self=this;(stages||[]).forEach(function(stage){(stage.source_urls||[]).slice(0,30).forEach(function(value){try{var url=new URL(value);if(url.protocol!=="https:"||url.username||url.password)return;Array.from(url.searchParams.keys()).forEach(function(k){if(!/^(sku(?:id)?|pid|shade|colou?r|dwvar_.+|variant|product(?:id)?|size)$/i.test(k))url.searchParams.delete(k);});url.hash="";self.sources.push({request_id:str(requestId).replace(/[^a-z0-9-]/gi,"").slice(0,60),stage:str(stage.stage).replace(/[^a-z0-9_]/gi,"").slice(0,50),url:url.href.slice(0,1500),opened:(stage.opened_urls||[]).includes(value)});}catch(ignore){}});});if(this.sources.length>300)this.sources=this.sources.slice(-300);};
  Log.prototype.add=function(event,details){var out={at:new Date().toISOString(),elapsed_ms:Date.now()-this.started,event:str(event).replace(/[^a-z0-9_.-]/gi,'').slice(0,60)};Object.keys(details||{}).forEach(function(k){var v=details[k];if(!allowed.has(k))return;if(typeof v==='number'||typeof v==='boolean')out[k]=v;else if(typeof v==='string')out[k]=str(v).slice(0,280);});this.events.push(out);if(this.events.length>2000)this.events.shift();};
  Log.prototype.report=function(items,context){
    items=Array.isArray(items)?items:[];context=context||{};
    var imported=Array.isArray(context.imports)?context.imports:[],failed=context.lastError||null;
    var result=['AI ORDER BUILDER — HUMAN-READABLE DIAGNOSTIC','Version: '+this.build,'Run ID: '+this.id,'Started: '+new Date(this.started).toLocaleString(),'Elapsed: '+Math.round((Date.now()-this.started)/1000)+' seconds',''];
    function line(text){result.push(text);}
    function status(item){if(item.product&&item.product.id)return item.createdInCrm?'CREATED':'MATCHED';if(item.writeState==='unknown'||item.writeState==='inflight'||item.match==='uncertain')return 'CREATE NOT CONFIRMED';if(item.match==='web_choice'||item.match==='ambiguous')return 'REVIEW REQUIRED';if(item.researchDone)return 'NOT FOUND / REVIEW';return 'NOT PROCESSED';}
    line('1. SOURCE FILE VALIDATION');
    if(!imported.length)line('No structured Excel/CSV import was recorded. Input was text or images and used the AI extractor.');
    imported.forEach(function(a){line('File: '+str(a.file));line('  Excel heading row: '+a.headerRow+' | Source product rows: '+(a.productRows==null?a.imported:a.productRows)+' | Imported rows: '+a.imported+' | Units: '+number(a.quantity).toLocaleString('en-US')+' | Amount: '+money(a.amount));line('  UPC scientific notation expanded: '+number(a.scientificConverted)+' | Rows requiring review: '+number(a.problemRows));if(a.brand)line('  Brand printed in file: '+str(a.brand));(a.warnings||[]).forEach(function(w){line('  WARNING: '+str(w));});});
    var matched=0,created=0,pending=0,review=0,uncertain=0,qty=0,amount=0;
    items.forEach(function(it){var s=status(it);if(s==='MATCHED')matched++;else if(s==='CREATED')created++;else if(s==='CREATE NOT CONFIRMED')uncertain++;else if(s==='NOT PROCESSED')pending++;else review++;qty+=number(it.quantity);amount+=number(it.quantity)*number(effectivePrice(it));});
    line('');line('2. CRM PROCESSING SUMMARY');
    line('Order lines: '+items.length+' | Matched existing CRM: '+matched+' | Created in CRM: '+created+' | Not processed: '+pending+' | Review: '+review+' | Creation unconfirmed: '+uncertain);
    line('Order quantity: '+qty.toLocaleString('en-US')+' | Order total: '+money(amount));
    if(failed){line('');line('3. WHY PROCESSING STOPPED');line('Stage: '+str(failed.stage||'unknown'));line('Problem: '+str(failed.message||'unknown CRM error'));if(failed.line)line('Order line: '+failed.line);if(failed.sourceRow)line('Excel row: '+failed.sourceRow);if(failed.upc)line('UPC: '+str(failed.upc));line('NOTE: Do not retry an unconfirmed product creation until CRM has been checked for the same UPC.');}
    var problemItems=items.map(function(item,index){return{item:item,index:index};}).filter(function(x){return status(x.item)!=='MATCHED'&&status(x.item)!=='CREATED';});
    line('');line('4. ITEMS THAT STILL NEED ATTENTION ('+problemItems.length+')');
    if(!problemItems.length)line('None.');
    problemItems.forEach(function(x){var it=x.item;line('  #'+(x.index+1)+(it.sourceRow?' | Excel row '+it.sourceRow:'')+' | UPC '+str(it.identifier||'(missing)')+' | '+status(it));line('     Name: '+str(it.offerName||it.requestedName).slice(0,200));if(it.sourceUPC&&str(it.sourceUPC)!==str(it.identifier))line('     Original Excel value: '+str(it.sourceUPC));if(it.importWarning)line('     UPC warning: '+str(it.importWarning));if(it.note)line('     Reason: '+str(it.note).slice(0,350));});
    line('');line('5. ALL ORDER ROWS (source -> normalized UPC -> CRM result)');
    items.forEach(function(it,index){line('  #'+(index+1)+(it.sourceRow?' / Excel '+it.sourceRow:'')+' | UPC '+str(it.identifier||'?')+' | '+status(it)+' | '+number(it.quantity)+' x '+priceDescription(it)+' | '+str(it.offerName||it.requestedName).slice(0,100));if(it.sourceUPC&&str(it.sourceUPC)!==str(it.identifier))line('      Excel UPC: '+str(it.sourceUPC)+' => '+str(it.identifier||'(invalid)'));});
    line('');line('6. SERVICE AND ERROR EVENTS');
    var reduced=this.events.filter(function(e){return e.event!=='research_item';});
    if(!reduced.length)line('No service events collected.');
    reduced.slice(-60).forEach(function(e){line('  '+new Date(e.at).toLocaleTimeString()+' '+e.event+(e.stage?' ['+e.stage+']':'')+(e.status!=null?' status='+e.status:'')+(e.duration_ms!=null?' time='+e.duration_ms+'ms':'')+(e.error_code&&e.error_code!=='none'?' error='+e.error_code:'')+(e.message?' '+str(e.message):''));});
    line('');line('Request IDs for support: '+reduced.filter(function(e){return e.request_id;}).map(function(e){return e.request_id;}).slice(-15).join(', '));
    line('--- End of diagnostic ---');
    return result.join('\n')+'\n';
  };
  root.OrderDiagnostics=Log;if(typeof module!=='undefined'&&module.exports)module.exports=Log;
})(typeof window!=='undefined'?window:globalThis);
