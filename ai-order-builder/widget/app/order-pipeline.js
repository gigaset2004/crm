(function(root){
  "use strict";
  function key(item){return item.identifier?"id:"+String(item.identifier).trim().toLowerCase():"name:"+String(item.requestedName||"").toLowerCase().replace(/\s+/g," ").trim();}
  function errorDetails(error){
    if(typeof error==="string")return error;
    if(!error)return "Unknown error";
    var values=[];
    function add(x){if(!x)return;if(typeof x==="object"){if(x.message)add(x.message);else try{add(JSON.stringify(x));}catch(e){}}else if(String(x)!=="[object Object]")values.push(String(x));}
    add(error.message);add(error.code);add(error.error);add(error.data&&error.data.message);
    if(error.data&&Array.isArray(error.data)&&error.data[0]){add(error.data[0].code);add(error.data[0].message);}
    if(!values.length)try{add(JSON.stringify(error));}catch(e){}
    return(values.join(" · ")||"Unknown error").slice(0,650);
  }
  function withLineContext(error,item,line,stage){
    var reason=errorDetails(error),err=error instanceof Error?error:new Error(reason);
    if(!err.message||err.message==="[object Object]")err.message=reason;
    err.orderLine=line;err.upc=String(item&&item.identifier||"").slice(0,40);
    err.sourceRow=item&&item.sourceRow||null;err.stage=stage;
    return err;
  }
  function copyMatch(to,from){to.product=from.product;to.match=from.match;to.candidates=from.candidates||[];if(from.publicCandidates)to.publicCandidates=from.publicCandidates;if(from.createdInCrm)to.createdInCrm=true;if(from.researchDone)to.researchDone=true;if(from.note)to.note=from.note;}
  // v1.46: Official Product_Name requires evidence from the brand's own website.
  // No geographic TLD restriction: accept worldwide regional brand sites.
  // Excel product names can be SEARCH TERMS only, never automatic CRM Product_Name.
  function officialNameSource(fact,brand){
    if(!fact||!fact.verified||!String(fact.product_name||"").trim())return "";
    function normalized(s){return String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");}
    var brandRoot=normalized(brand||fact.brand),sources=[
      fact.official_url,
      fact.evidence&&fact.evidence.product_name&&fact.evidence.product_name.url
    ];
    if(brandRoot.length<3)return "";
    for(var i=0;i<sources.length;i++){
      var url=String(sources[i]||"").trim();
      if(!/^https:\/\//i.test(url))continue;
      try{
        var host=new URL(url).hostname.toLowerCase().replace(/^www\./,"");
        var parts=host.split(".");
        if(parts.length<2)continue;
        var twoPartSuffix=/^(co|com|net|org|ac|edu)\.[a-z]{2}$/.test(parts.slice(-2).join("."));
        var domainRoot=normalized(parts[parts.length-(twoPartSuffix?3:2)]||"");
        if(domainRoot===brandRoot||domainRoot.indexOf(brandRoot)===0)return url;
      }catch(e){}
    }
    return "";
  }
  function Pipeline(options){this.options=options;this.items=[];this.running=false;this.paused=false;this.nextAttemptAt=0;}
  Pipeline.describeLine=function(item){
    if(item.product&&item.product.id)return item.createdInCrm?"New product created":"Found in CRM";
    if(item.writeState==="inflight"||item.writeState==="unknown"||item.match==="uncertain")return "Creation not confirmed — check CRM";
    if(item.match==="ambiguous")return "Choose a product";
    if(item.match==="web_choice")return "Choose the product line and size";
    if(item.researchDone)return "Not found — search again or create a product";
    return "Not processed yet";
  };
  Pipeline.report=function(items){
    var result={lines:items.length,ready:0,found:0,created:0,pending:0,choose:0,notFound:0,uncertain:0},created=new Set();
    items.forEach(function(it){
      if(it.product&&it.product.id){result.ready++;if(it.createdInCrm)created.add(String(it.product.id));else result.found++;}
      else if(it.writeState==="inflight"||it.writeState==="unknown"||it.match==="uncertain")result.uncertain++;
      else if(it.match==="ambiguous"||it.match==="web_choice")result.choose++;
      else if(it.researchDone)result.notFound++;
      else result.pending++;
    });result.created=created.size;return result;
  };
  Pipeline.prototype.save=function(){
    if(!this.options.storage||!this.options.storageKey)return;
    try{this.options.storage.setItem(this.options.storageKey,JSON.stringify({version:1,updatedAt:Date.now(),nextAttemptAt:this.nextAttemptAt,items:this.items}));}catch(e){this.storageFailed=true;}
  };
  Pipeline.prototype.load=function(){
    if(!this.options.storage||!this.options.storageKey)return null;
    try{var d=JSON.parse(this.options.storage.getItem(this.options.storageKey)||"null");if(!d||d.version!==1||Date.now()-d.updatedAt>7*86400000||!Array.isArray(d.items)||d.items.length>100)return null;this.items=d.items;this.nextAttemptAt=d.nextAttemptAt||0;return this.items;}catch(e){return null;}
  };
  Pipeline.prototype.notify=function(text){this.save();if(this.options.changed)this.options.changed(this.items,text);};
  Pipeline.prototype.pause=function(){this.paused=true;};
  Pipeline.prototype.run=async function(input){
    if(this.running)return this.items;
    if(input)this.items=input;
    if(this.nextAttemptAt>Date.now()){var cooling=new Error("Search limit reached. Resume after "+new Date(this.nextAttemptAt).toLocaleTimeString()+".");cooling.paused=true;throw cooling;}
    this.running=true;this.paused=false;var cache=new Map(),self=this;
    try{
      for(var i=0;i<this.items.length;i++){
        if(this.paused)break;
        var item=this.items[i],identity=key(item);
        if(this.options.prepareItem)this.options.prepareItem(item);
        if(!item.requestedBrand&&/\bgucci\b/i.test(item.requestedName||""))item.requestedBrand="Gucci";
        if(item.product&&item.match==="matched"){
          if(this.options.linkMissingBrand){try{await this.options.linkMissingBrand(item);}catch(e){item.note="Brand lookup update failed: "+errorDetails(e);}}
          cache.set(identity,item);continue;
        }
        if(cache.has(identity))copyMatch(item,cache.get(identity));
        else{try{await this.options.match(item);}catch(e){throw withLineContext(e,item,i+1,"crm_lookup");}cache.set(identity,item);}
        if(item.product&&item.product.id&&this.options.linkMissingBrand){
          try{await this.options.linkMissingBrand(item);}catch(e){item.note="Brand lookup update failed: "+errorDetails(e);}
        }
        // Never blindly repeat a write whose outcome was lost on a closed tab/network error.
        if(!item.product&&(item.writeState==="inflight"||item.writeState==="unknown")){item.match="uncertain";item.note="Product creation could not be confirmed. Search CRM before creating another product.";}
        this.notify("Checking CRM: "+(i+1)+" of "+this.items.length);
      }
      while(!this.paused){
        var seen=new Set(),batch=this.items.filter(function(it){var k=key(it);if(it.match!=="missing"||it.researchDone||seen.has(k))return false;seen.add(k);return true;}).slice(0,5);
        if(!batch.length)break;
        this.notify("Finding "+batch.length+" new products…");
        var facts;
        try{facts=await this.options.research(batch.map(function(it,index){return{key:String(index),identifier:it.identifier||"",product_name:((it.requestedBrand||"")+" "+(it.requestedName||"")).trim().slice(0,255)};}));}
        catch(e){var failure=withLineContext(e,batch[0],this.items.indexOf(batch[0])+1,"product_research");if(e.retryAfter){this.nextAttemptAt=Date.now()+e.retryAfter*1000;}failure.paused=true;throw failure;}
        var hadRowLevelIssue=false;
        for(var b=0;b<batch.length;b++){
          if(this.paused)break;
          var current=batch[b],fact=facts.find(function(f){return f.key===String(b);});
          if(fact&&fact.needs_selection&&Array.isArray(fact.candidates)&&fact.candidates.length){current.research=fact;current.publicCandidates=fact.candidates;current.match="web_choice";current.researchDone=true;current.note=fact.clarification||"Choose the product line and size.";this.items.forEach(function(other){if(other!==current&&key(other)===key(current))copyMatch(other,current);});this.notify(current.note);continue;}
          if(fact&&fact.retryable_error){
            current.match="missing";current.researchDone=true;current.note="Research could not confirm this UPC: "+errorDetails(fact.retryable_error)+". Use Search again on THIS line.";hadRowLevelIssue=true;
            self.items.forEach(function(other){if(other!==current&&key(other)===key(current))copyMatch(other,current);});self.notify(current.note);continue;
          }
          if(!fact||!fact.verified){current.research=fact||null;current.researchDone=true;current.note="Product not confirmed. Search again or create the product below.";this.items.forEach(function(other){if(other!==current&&key(other)===key(current))copyMatch(other,current);});this.notify(current.note);continue;}
          // First research may only have a retailer URL. Retry a manufacturer-first
          // worldwide search and use only a verified, matching-UPC official result.
          var manufacturerSource=officialNameSource(fact,current.requestedBrand||fact.brand);
          if(!manufacturerSource&&this.options.researchOfficialRetry){
            try{
              var moreFacts=await this.options.researchOfficialRetry([{
                identifier:current.identifier,requestedName:current.requestedName,
                requestedBrand:current.requestedBrand||fact.brand,brand:fact.brand
              }]);
              var alternative=Array.isArray(moreFacts)?moreFacts[0]:null;
              if(alternative&&alternative.verified&&String(alternative.upc||"")===String(current.identifier||"")){
                var officialCandidate=officialNameSource(alternative,current.requestedBrand||alternative.brand);
                if(officialCandidate){fact=alternative;manufacturerSource=officialCandidate;}
              }
            }catch(researchError){
              current.note="Additional official-site lookup failed: "+errorDetails(researchError);
            }
          }
          if(!manufacturerSource){
            current.research=fact;current.match="missing";current.researchDone=true;
            current.note="Official product title not confirmed after two internet searches. Product was not created to prevent an incorrect catalog entry. Search again when an official source becomes available.";
            this.items.forEach(function(other){if(other!==current&&key(other)===key(current))copyMatch(other,current);});this.notify(current.note);continue;
          }
          fact.official_product_name_source=manufacturerSource;
          // Never replace a supplied Excel UPC with a different barcode proposed by AI.
          // A mismatch must be reviewed by a person, not created as a different CRM product.
          if(/^\d{8,14}$/.test(String(current.identifier||""))&&String(fact.upc||"")!==String(current.identifier)){
            current.research=fact;current.researchDone=true;current.match="missing";
            current.note="UPC mismatch: Excel has "+current.identifier+", research suggested "+String(fact.upc||"(none)")+". Product was NOT created; review manually.";
            this.items.forEach(function(other){if(other!==current&&key(other)===key(current))copyMatch(other,current);});this.notify(current.note);continue;
          }
          // The supplier spreadsheet is authoritative for the brand. AI may call Nars "NARS Cosmetics".
          // Reuse the linked CRM brand name/ID instead of AI's branding variation.
          if(current.selectedBrandId){fact.brand=current.requestedBrand||fact.brand;fact.brandId=current.selectedBrandId;}
          else if(current.sourceFile&&current.requestedBrand)fact.brand=current.requestedBrand;
          else if(!fact.brand&&current.requestedBrand)fact.brand=current.requestedBrand;
          current.research=fact;
          // Check again immediately before a write: another manager may have added it.
          if(!current.identifier)current.identifier=fact.upc;
          try{await this.options.match(current);}catch(e){throw withLineContext(e,current,this.items.indexOf(current)+1,"crm_recheck_before_create");}
          if(current.product||current.match==="ambiguous"){current.researchDone=true;this.notify("Product checked in CRM.");continue;}
          // User-entered customs data belongs to this specific source line and
          // takes precedence over incomplete web metadata when creating Product.
          if(Object.prototype.hasOwnProperty.call(current,"hsManual"))fact.hs_code=current.hsManual;
          if(Object.prototype.hasOwnProperty.call(current,"cooManual"))fact.country_of_origin=current.cooManual;
          current.writeState="inflight";this.notify("Adding new product: "+fact.product_name);
          try{
            var product=await this.options.create(fact);
            if(!product||!product.id)throw new Error("CRM did not confirm the new product ID.");
            current.product=product;current.match="matched";current.candidates=[product];current.createdInCrm=true;current.writeState="done";current.researchDone=true;
            current.note="New product created";
            // Preserve every order line and quantity; share the single CRM product across duplicates.
            this.items.forEach(function(other){if(other!==current&&key(other)===key(current)){copyMatch(other,current);other.note=current.note;other.writeState="done";}});
          }catch(e){
            var safe=!!(e&&e.safeNoWrite);
            current.writeState=safe?"none":"unknown";current.match=safe?"missing":"uncertain";current.researchDone=true;
            current.note=safe?"Product not created: "+errorDetails(e):"Creation not confirmed: "+errorDetails(e)+". Check CRM by UPC before retrying; do not create duplicates.";
            hadRowLevelIssue=true;this.notify(current.note);continue;
          }
          this.notify("New product created.");
        }
        // Errors for individual UPCs do not abort the entire order. Other independent rows continue.
        // A service-wide HTTP failure still throws above and pauses for a later retry.
        if(!this.paused&&this.items.some(function(it){return it.match==="missing"&&!it.researchDone;}))await (this.options.wait||function(ms){return new Promise(function(resolve){setTimeout(resolve,ms);});})(this.options.batchDelayMs==null?250:this.options.batchDelayMs);
      }
      // Optional HS/COO/brand metadata enrichment must never delay order creation.
      // Keep the working enrichment implementation; invoke only on explicit opt-in.
      if(!this.paused&&this.options.enrichExisting&&this.options.autoEnrich===true){
        try{await this.options.enrichExisting(this.items,function(message){self.notify(message);});}
        catch(e){
          // A failed optional customs lookup cannot invalidate already matched
          // Products or prevent a valid Sales Order from being filled.
          this.notify("HS / COO research needs review: "+errorDetails(e));
        }
      }
      this.notify(this.paused?"Processing paused.":this.items.every(function(it){return it.product&&it.product.id;})?"Products are ready.":"Review the unresolved products.");return this.items;
    }finally{self.running=false;self.save();}
  };
  Pipeline.officialNameSource=officialNameSource;
  root.OrderPipeline=Pipeline;if(typeof module!=="undefined"&&module.exports)module.exports=Pipeline;
})(typeof window!=="undefined"?window:globalThis);
