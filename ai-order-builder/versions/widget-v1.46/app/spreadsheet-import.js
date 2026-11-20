/* AI Order Builder: deterministic spreadsheet order extraction.  Do not ask AI to transcribe UPCs. */
(function(root){
  "use strict";
  function text(value){return String(value==null?"":value).replace(/\u00a0/g," ").trim();}
  function flat(value){return text(value).replace(/\s+/g," ");}
  function heading(value){return flat(value).toLowerCase().replace(/[^a-z0-9]/g,"");}
  function numeric(value){
    var s=text(value).replace(/[$€£\s]/g,"");
    if(!s)return null;
    if(/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s))s=s.replace(/,/g,"");
    else if(/^\d+,\d+$/.test(s))s=s.replace(",",".");
    var n=Number(s);return Number.isFinite(n)?n:null;
  }
  function upc(value){
    var raw=text(value),normalized=raw.replace(/^'/,"");
    if(!normalized)return{value:"",original:raw,converted:false,error:"Missing UPC"};
    // OOXML stores numeric barcodes like 607845066033 as 6.07845066033E11.
    // Expanding the exponent is exact for every UPC/EAN/GTIN up to 14 digits.
    if(/^[+]?(?:\d+(?:\.\d*)?|\.\d+)[eE][+-]?\d+$/.test(normalized)){
      var n=Number(normalized);
      if(!Number.isSafeInteger(n)||n<0)return{value:"",original:raw,converted:false,error:"Barcode is too large or imprecise. Store it as Text in Excel."};
      normalized=n.toFixed(0);
    }else if(/^\d+\.0+$/.test(normalized))normalized=normalized.split(".")[0];
    else if(/^\d+(?:[\s-]\d+)+$/.test(normalized))normalized=normalized.replace(/[\s-]/g,"");
    if(!/^\d{8,14}$/.test(normalized))return{value:"",original:raw,converted:normalized!==raw,error:"Expected an 8-14 digit UPC/EAN/GTIN; found "+raw};
    return{value:normalized,original:raw,converted:normalized!==raw,error:""};
  }
  function findColumn(headers,choices){
    for(var i=0;i<headers.length;i++){if(choices.indexOf(headers[i])>=0)return i;}
    return -1;
  }
  function guessBrand(grid,headerIndex){
    var invalid=/^(upc|gtin|ean|sku|invoice|customer|supplier|total|products?|description|name|quantity|qty|order|price|brand|item|us[dr]p)$/i;
    for(var i=0;i<headerIndex;i++){
      for(var j=0;j<(grid[i]||[]).length;j++){
        var s=flat(grid[i][j]);
        if(/^[A-Z][A-Z0-9& .'-]{1,29}$/.test(s)&&!invalid.test(s)&&!/^\d+$/.test(s))return s;
      }
    }
    return "";
  }
  function parseGrid(grid,fileName){
    if(!Array.isArray(grid))return null;
    var headers=null,index=-1;
    for(var i=0;i<Math.min(grid.length,45);i++){
      var row=grid[i]||[], normalized=row.map(heading);
      var cols={
        upc:findColumn(normalized,["upc","upcnumber","barcode","barcodeid","gtin","gtin12","gtin13","gtin14","ean","ean13","eancode"]),
        name:findColumn(normalized,["description","productname","productdescription","itemdescription","itemname","product","item","name"]),
        qty:findColumn(normalized,["order","orderqty","orderquantity","orderedqty","orderedquantity","quantityordered","qtyordered","qty","quantity","unitsordered"]),
        price:findColumn(normalized,["price","priceusd","unitpriceusd","usdprice","priceinusd","unitprice","netprice","wholesaleprice","cost","unitcost","purchaseprice","customerprice"])
      };
      // Customer ORDER overrides an earlier stock QTY column.
      var oi=findColumn(normalized,["order","orderqty","orderquantity","orderedqty","orderedquantity","quantityordered","qtyordered","unitsordered"]);
      if(oi>=0)cols.qty=oi;
      cols.orderColumn=oi>=0;
      // Support incomplete supplier templates too: keep rows and flag absent columns.
      if((cols.upc>=0||cols.name>=0)&&(cols.qty>=0||cols.price>=0||(cols.upc>=0&&cols.name>=0))){headers=cols;index=i;break;}
    }
    if(!headers)return null; // Unstructured sheet: original AI import remains available.
    var items=[],warnings=[],countScientific=0,ignored=0,failed=0,qtyTotal=0,amountTotal=0,candidates=0;
    var brand=guessBrand(grid,index),rowNumbers=grid.__rowNumbers||[];
    for(var n=index+1;n<grid.length;n++){
      var cells=grid[n]||[],sourceName=flat(cells[headers.name]),rawUPC=text(cells[headers.upc]),rawQty=text(cells[headers.qty]),rawPrice=text(cells[headers.price]);
      var rowNo=rowNumbers[n]||n+1;
      // Only blank rows and explicit totals/notes are skipped. A product with an
      // empty quantity/price must remain in the review table, never disappear.
      if(headers.orderColumn&&!sourceName&&!rawUPC){ignored++;continue;} // total/footer
      if(!sourceName&&!rawUPC&&!rawQty&&!rawPrice){ignored++;continue;}
      if(/^(grand\s*total|sub\s*total|total|tax|vat|shipping|freight|discount|notes?|balance\s*due|amount\s*due)\b/i.test(sourceName)&&!rawUPC){ignored++;continue;}
      var cellQuantity=numeric(cells[headers.qty]),unitPrice=numeric(cells[headers.price]);
      // In customer ORDER sheets, QTY is stock availability, not ordered units.
      // Blank and zero ORDER values are not order lines; nonempty bad entries remain for review.
      if(headers.orderColumn&&(!rawQty||cellQuantity===0)){ignored++;continue;}
      candidates++;
      var barcode=upc(cells[headers.upc]),rowIssues=[];
      if(cellQuantity==null||cellQuantity<=0)rowIssues.push('quantity missing or invalid');
      if(unitPrice==null||unitPrice<=0)rowIssues.push('unit price missing or invalid');
      if(!sourceName&&!barcode.original)rowIssues.push('product name / UPC missing');
      if(barcode.error)rowIssues.push(barcode.error);
      if(!sourceName&&barcode.original)rowIssues.push('name missing; match by UPC');
      if(barcode.converted)countScientific++;
      if(rowIssues.length){failed++;warnings.push('Excel row '+rowNo+': '+rowIssues.join('; ')+'.');}
      items.push({
        identifier:barcode.value,requestedName:sourceName,offerName:sourceName,requestedBrand:brand,
        quantity:cellQuantity,price:unitPrice,product:null,match:'pending',sourceType:'import',
        sourceFile:fileName,sourceRow:rowNo,sourceUPC:barcode.original,importWarning:rowIssues.join('; '),
        autoCreateFromSheet:!!(headers.orderColumn&&barcode.value&&sourceName&&brand&&cellQuantity>0&&unitPrice>0)
      });
      if(cellQuantity>0)qtyTotal+=cellQuantity;
      if(cellQuantity>0&&unitPrice>0)amountTotal+=unitPrice*cellQuantity;
    }
    return{items:items,audit:{file:fileName,headerRow:rowNumbers[index]||index+1,sourceRows:grid.length-index-1,
      productRows:candidates,imported:items.length,quantity:qtyTotal,amount:Math.round(amountTotal*100)/100,
      scientificConverted:countScientific,ignored:ignored,problemRows:failed,warnings:warnings.slice(0,75),brand:brand,
      orderColumn:!!headers.orderColumn,quantityHeader:headers.qty>=0?heading(grid[index][headers.qty]):'',priceHeader:headers.price>=0?heading(grid[index][headers.price]):''}};
  }
  function normalizeRawGrid(grid){
    // If a workbook doesn't have recognized order columns, still fix scientific
    // UPC tokens before passing tabular text to the existing AI extractor.
    return(grid||[]).map(function(row){return(row||[]).map(function(cell){
      var value=text(cell);
      if(/^[+]?(?:\d+(?:\.\d*)?|\.\d+)[eE][+]?(?:10|11|12|13)$/.test(value)){
        var normalized=upc(value);if(normalized.value)return normalized.value;
      }
      return value;
    }).join("\t");}).join("\n");
  }
  var api={parseGrid:parseGrid,normalizeUPC:upc,normalizeRawGrid:normalizeRawGrid,numeric:numeric};
  root.OrderSpreadsheetImport=api;
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:globalThis);
