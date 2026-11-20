(function(root){
  "use strict";
  function text(v){return String(v==null?"":v).trim();}
  function empty(p,k){return !text(p&&p[k]);}
  function needed(p){return ["UPC","HS_Code","Country_of_origin","Brand_text"].some(function(k){return empty(p,k);})||(Object.prototype.hasOwnProperty.call(p,"Brand")&&!(p.Brand&&p.Brand.id));}
  function note(item,message){item.note=(item.createdInCrm?"New product created · ":"")+message;}
  // v1.53: all customs values come from research for THIS product.
  // Never predefine a UPC -> country/HS mapping. Verify UPC, brand, and
  // a field-specific web source before writing a discovered COO to CRM.
  function comparable(v){return text(v).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^\p{L}\p{N}]/gu,"");}
  function genericBrandKey(v){
    return comparable(text(v).replace(/(?:[\s\-]+(?:cosmetics|beauty|make\s?up|skin\s?care))\s*$/iu,""));
  }
  function sameBarcode(a,b){
    var x=text(a).replace(/^0+/,""),y=text(b).replace(/^0+/,"");
    return !!x&&!!y&&x===y;
  }
  function matchingIdentity(fact,product,item){
    if(!fact||fact.verified!==true)return false;
    var knownUPC=text(product&&product.UPC)||text(item&&item.identifier);
    if(!/^\d{8,14}$/.test(knownUPC)||!sameBarcode(knownUPC,fact.upc))return false;
    var knownBrand=text(product&&product.Brand_text)||text(product&&product.Brand&&product.Brand.name)||text(item&&item.requestedBrand);
    if(knownBrand&&text(fact.brand)&&genericBrandKey(knownBrand)!==genericBrandKey(fact.brand))return false;
    return true;
  }
  function sourceUrls(value){
    if(!value)return [];
    if(typeof value==="string")return /^https:\/\//i.test(value)?[value]:[];
    if(Array.isArray(value))return value.reduce(function(acc,item){return acc.concat(sourceUrls(item));},[]);
    if(typeof value==="object"){
      var values=[value.url,value.source,value.source_url,value.sourceUrl,value.link];
      if(value.sources)values.push(value.sources);
      if(value.urls)values.push(value.urls);
      return values.reduce(function(acc,v){return acc.concat(sourceUrls(v));},[]);
    }
    return [];
  }
  function fieldEvidence(fact,field,value){
    var proof=fact&&fact.evidence&&fact.evidence[field];
    if(!proof&&field==="country_of_origin")proof=fact&&fact.evidence&&(fact.evidence.coo||fact.evidence.country_of_manufacture);
    var all=sourceUrls(proof);
    if(field==="country_of_origin"){
      all=all.concat(sourceUrls(fact&&fact.country_of_origin_source),
        sourceUrls(fact&&fact.country_of_origin_sources));
    }
    if(proof&&typeof proof==="object"&&!Array.isArray(proof)&&text(proof.value)&&
       comparable(proof.value)!==comparable(value))return false;
    return all.some(function(url){
      try{var u=new URL(url);return u.protocol==="https:"&&!!u.hostname&&u.hostname.indexOf(".")>0;}catch(e){return false;}
    });
  }
  function validCountry(value){
    var v=text(value);
    return v.length>=2&&v.length<=80&&!/\d/.test(v)&&
      /^[\p{L}\p{M}][\p{L}\p{M}\s'.\-()]*$/u.test(v)&&
      !/^(?:unknown|not known|n\/?a|varies|various|multiple|other|tbd|europe|eu)$/i.test(v);
  }
  function verifiedTradeFields(fact,product,item){
    if(!matchingIdentity(fact,product,item))return {};
    var result={},hs=text(fact.hs_code),coo=text(fact.country_of_origin);
    if(/^\d{6,10}$/.test(hs.replace(/[.\s]/g,"")))result.hs=hs;
    if(validCountry(coo)&&fieldEvidence(fact,"country_of_origin",coo))result.coo=coo;
    return result;
  }
  function Enricher(options){this.options=options;}
  Enricher.prototype.run=async function(items,notify){
    var self=this,groups=new Map(),pending=[];
    items.forEach(function(item){if(item.product&&item.product.id&&item.match==="matched"){var id=String(item.product.id);if(!groups.has(id))groups.set(id,[]);groups.get(id).push(item);}});
    function share(id,p){groups.get(id).forEach(function(item){item.product=p;});}
    for(var entry of groups){
      if(self.options.shouldPause&&self.options.shouldPause())return;
      var id=entry[0],item=entry[1][0];
      if(entry[1].every(function(it){return it.enrichmentDone;}))continue;
      if(notify)notify("Checking product details…");
      try{
        var fresh=await self.options.read(id);
        if(self.options.repairIdentity)fresh=await self.options.repairIdentity(fresh,item);
        share(id,fresh);
        var checkName=self.options.officialName&&/gucci|colorete|—/i.test(text(fresh.Product_Name));
        if(!needed(fresh)&&!checkName){entry[1].forEach(function(it){it.enrichmentDone=true;});continue;}
        pending.push({id:id,item:item,product:fresh});
      }catch(e){entry[1].forEach(function(it){note(it,"Could not check product details. Existing product retained.");});}
    }
    for(var offset=0;offset<pending.length;offset+=5){
      if(self.options.shouldPause&&self.options.shouldPause())return;
      var batch=pending.slice(offset,offset+5),facts;
      if(notify)notify("Finding missing product details: "+Math.min(offset+5,pending.length)+" of "+pending.length+"…");
      try{facts=await self.options.research(batch.map(function(row,index){var brand=self.options.brandHint?self.options.brandHint(row.item,row.product):text(row.product.Brand_text)||text(row.product.Brand&&row.product.Brand.name);return {key:String(index),identifier:text(row.product.UPC)||(/^\d{8,14}$/.test(text(row.item.identifier))?text(row.item.identifier):""),product_name:(brand+" "+text(row.product.Product_Name)).trim().slice(0,255)};}));}
      catch(e){pending.slice(offset).forEach(function(row){groups.get(row.id).forEach(function(it){note(it,"Missing details could not be checked. Try Extract and match again later.");});});return;}
      // If initial worldwide research could not corroborate a missing
      // customs field, make ONE targeted web research attempt for that field.
      // This is generic: same procedure for any UPC, brand, or country.
      var secondary=[],secondByIndex={};
      if(self.options.researchMetadata){
        batch.forEach(function(row,index){
          var first=facts&&facts.find(function(f){return f.key===String(index);});
          var found=verifiedTradeFields(first,row.product,row.item);
          var fields=[];
          if(empty(row.product,"Country_of_origin")&&!found.coo)fields.push("country_of_origin");
          if(empty(row.product,"HS_Code")&&!found.hs)fields.push("hs_code");
          if(fields.length)secondary.push({row:row,index:index,fields:fields});
        });
        if(secondary.length){
          if(notify)notify("Searching product-specific customs sources…");
          try{
            var researchRows=secondary.map(function(x,index){return {
              key:String(index),
              identifier:text(x.row.product.UPC)||text(x.row.item.identifier),
              brand:self.options.brandHint?self.options.brandHint(x.row.item,x.row.product):text(x.row.product.Brand_text),
              research_fields:x.fields,
              // Preserve a supplier's size/shade as an untrusted search hint.
              // Barcode evidence still controls identity; never save this title.
              product_name:(text(x.row.product.Product_Name)+
                (text(x.row.item.requestedName)&&comparable(x.row.item.requestedName)!==comparable(x.row.product.Product_Name)?
                  " | Supplier title: "+text(x.row.item.requestedName):"")).slice(0,255)
            };});
            var extra=await self.options.researchMetadata(researchRows);
            if(Array.isArray(extra))secondary.forEach(function(x,i){
              secondByIndex[x.index]=extra.find(function(f){return f.key===String(i);})||null;
            });
          }catch(metadataError){
            secondary.forEach(function(x){
              groups.get(x.row.id).forEach(function(it){
                note(it,"Customs research incomplete. Existing values retained; you can edit HS / COO.");
              });
            });
          }
        }
      }
      facts=Array.isArray(facts)?facts:[];
      var retryError=null;
      for(var index=0;index<batch.length;index++){
        if(self.options.shouldPause&&self.options.shouldPause())return;
        var row=batch[index],fact=facts.find(function(f){return f.key===String(index);}),lines=groups.get(row.id);
        if(fact&&fact.retryable_error){lines.forEach(function(it){note(it,"Missing details could not be checked. Continue processing to retry.");});retryError=new Error(fact.retryable_error);continue;}
        try{
          var fallback=secondByIndex[index],firstValid=verifiedTradeFields(fact,row.product,row.item),
              secondValid=verifiedTradeFields(fallback,row.product,row.item);
          if((!fact||!fact.verified)&&(!fallback||!fallback.verified)){
            lines.forEach(function(it){it.enrichmentDone=true;note(it,"No verified customs source found. HS / COO can be edited manually.");});
            continue;
          }
          // Read again after web research; do not write values which are now populated.
          var current=await self.options.read(row.id),patch={id:row.id},upc=text(current.UPC);
          if(upc&&fact&&text(fact.upc)&&!sameBarcode(upc,fact.upc) &&
             !matchingIdentity(fallback,current,row.item))
            throw new Error("Product identity changed; nothing updated.");
          var official=matchingIdentity(fact,current,row.item)&&self.options.officialName&&self.options.officialName(fact);
          if(official&&official!==text(current.Product_Name))patch.Product_Name=official.slice(0,255);
          if(empty(current,"UPC")&&matchingIdentity(fact,current,row.item))patch.UPC=text(fact.upc);
          if(empty(current,"HS_Code")&&(firstValid.hs||secondValid.hs))
            patch.HS_Code=firstValid.hs||secondValid.hs;
          if(empty(current,"Country_of_origin")&&(firstValid.coo||secondValid.coo))
            patch.Country_of_origin=firstValid.coo||secondValid.coo;
          var existingBrand=current.Brand&&current.Brand.id;
          var brandName=text(current.Brand_text)||text(current.Brand&&current.Brand.name)||text(fact&&fact.brand)||text(fallback&&fallback.brand);
          if(empty(current,"Brand_text")&&brandName)patch.Brand_text=brandName.slice(0,255);
          if(Object.prototype.hasOwnProperty.call(current,"Brand")&&!existingBrand&&brandName){var brand=await self.options.findBrand(brandName);if(brand)patch.Brand={id:String(brand.id)};}
          if(Object.keys(patch).length>1){
            await self.options.update(patch);
            var confirmed=await self.options.read(row.id);
            if(Object.keys(patch).some(function(k){return k!=="id"&&(k==="Brand"?!(confirmed.Brand&&String(confirmed.Brand.id)===patch.Brand.id):text(confirmed[k])!==text(patch[k]));}))throw new Error("CRM did not confirm the updated fields.");
            share(row.id,confirmed);lines.forEach(function(it){
              it.enrichmentDone=true;it.enrichedInCrm=true;
              note(it,empty(confirmed,"Country_of_origin")?
                "Verified product fields updated; COO still needs product-specific source evidence.":
                "Verified product details updated in CRM.");
            });
          }else{share(row.id,current);lines.forEach(function(it){it.enrichmentDone=true;note(it,"No confirmed additional details found.");});}
        }catch(e){lines.forEach(function(it){note(it,"Product details update could not be confirmed. Check the product record.");});}
      }
      if(retryError)throw retryError;
    }
  };
  Enricher.verifiedTradeFields=verifiedTradeFields;
  root.ProductEnricher=Enricher;if(typeof module!=="undefined"&&module.exports)module.exports=Enricher;
})(typeof window!=="undefined"?window:globalThis);
