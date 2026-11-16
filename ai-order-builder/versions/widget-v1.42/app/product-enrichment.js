(function(root){
  "use strict";
  function text(v){return String(v==null?"":v).trim();}
  function empty(p,k){return Object.prototype.hasOwnProperty.call(p,k)&&!text(p[k]);}
  function needed(p){return ["UPC","HS_Code","Country_of_origin","Brand_text"].some(function(k){return empty(p,k);})||(Object.prototype.hasOwnProperty.call(p,"Brand")&&!(p.Brand&&p.Brand.id));}
  function note(item,message){item.note=(item.createdInCrm?"New product created · ":"")+message;}
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
        if(item.createdInCrm||(!needed(fresh)&&!checkName)){entry[1].forEach(function(it){it.enrichmentDone=true;});continue;}
        pending.push({id:id,item:item,product:fresh});
      }catch(e){entry[1].forEach(function(it){note(it,"Could not check product details. Existing product retained.");});}
    }
    for(var offset=0;offset<pending.length;offset+=5){
      if(self.options.shouldPause&&self.options.shouldPause())return;
      var batch=pending.slice(offset,offset+5),facts;
      if(notify)notify("Finding missing product details: "+Math.min(offset+5,pending.length)+" of "+pending.length+"…");
      try{facts=await self.options.research(batch.map(function(row,index){var brand=self.options.brandHint?self.options.brandHint(row.item,row.product):text(row.product.Brand_text)||text(row.product.Brand&&row.product.Brand.name);return {key:String(index),identifier:text(row.product.UPC)||(/^\d{8,14}$/.test(text(row.item.identifier))?text(row.item.identifier):""),product_name:(brand+" "+text(row.product.Product_Name)).trim().slice(0,255)};}));}
      catch(e){pending.slice(offset).forEach(function(row){groups.get(row.id).forEach(function(it){note(it,"Missing details could not be checked. Try Extract and match again later.");});});return;}
      var retryError=null;
      for(var index=0;index<batch.length;index++){
        if(self.options.shouldPause&&self.options.shouldPause())return;
        var row=batch[index],fact=facts.find(function(f){return f.key===String(index);}),lines=groups.get(row.id);
        if(fact&&fact.retryable_error){lines.forEach(function(it){note(it,"Missing details could not be checked. Continue processing to retry.");});retryError=new Error(fact.retryable_error);continue;}
        try{
          if(!fact||!fact.verified){lines.forEach(function(it){it.enrichmentDone=true;note(it,"No confirmed additional details found.");});continue;}
          // Read again after web research; do not write values which are now populated.
          var current=await self.options.read(row.id),patch={id:row.id},upc=text(current.UPC);
          if(upc&&upc.replace(/^0+/,"")!==text(fact.upc).replace(/^0+/,"")){throw new Error("Product identity changed; nothing updated.");}
          var official=self.options.officialName&&self.options.officialName(fact);
          if(official&&official!==text(current.Product_Name))patch.Product_Name=official.slice(0,255);
          if(empty(current,"UPC")&&/^\d{8,14}$/.test(text(fact.upc)))patch.UPC=text(fact.upc);
          if(empty(current,"HS_Code")&&/^\d{6,10}$/.test(text(fact.hs_code).replace(/[.\s]/g,"")))patch.HS_Code=text(fact.hs_code);
          if(empty(current,"Country_of_origin")&&text(fact.country_of_origin))patch.Country_of_origin=text(fact.country_of_origin).slice(0,255);
          var existingBrand=current.Brand&&current.Brand.id;
          var brandName=text(current.Brand_text)||text(current.Brand&&current.Brand.name)||text(fact.brand);
          if(empty(current,"Brand_text")&&brandName)patch.Brand_text=brandName.slice(0,255);
          if(Object.prototype.hasOwnProperty.call(current,"Brand")&&!existingBrand&&brandName){var brand=await self.options.findBrand(brandName);if(brand)patch.Brand={id:String(brand.id)};}
          if(Object.keys(patch).length>1){
            await self.options.update(patch);
            var confirmed=await self.options.read(row.id);
            if(Object.keys(patch).some(function(k){return k!=="id"&&(k==="Brand"?!(confirmed.Brand&&String(confirmed.Brand.id)===patch.Brand.id):text(confirmed[k])!==text(patch[k]));}))throw new Error("CRM did not confirm the updated fields.");
            share(row.id,confirmed);lines.forEach(function(it){it.enrichmentDone=true;it.enrichedInCrm=true;note(it,"Missing product details filled in CRM.");});
          }else{share(row.id,current);lines.forEach(function(it){it.enrichmentDone=true;note(it,"No confirmed additional details found.");});}
        }catch(e){lines.forEach(function(it){note(it,"Product details update could not be confirmed. Check the product record.");});}
      }
      if(retryError)throw retryError;
    }
  };
  root.ProductEnricher=Enricher;if(typeof module!=="undefined"&&module.exports)module.exports=Enricher;
})(typeof window!=="undefined"?window:globalThis);