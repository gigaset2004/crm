/* AI Order Builder v1.38 — Sales Orders native form bridge.
 * No external dependencies. Designed for AI_Order_Builder widget v1.41 or later.
 * Uses plain sequential loops for all comparisons; does not traverse Zoho SDK
 * data by Object.keys(), .forEach(), .map() or object-index dictionaries.
 * All modifications are planned and checked before the first write.
 */
var aiBridgeV138 = (function () {
    var VERSION = "1.38";

    function errorText(e) {
        if (typeof e === "string") { return e; }
        if (e == null) { return "Unknown CRM error"; }
        try { if (e.message) { return String(e.message); } } catch (ignored) {}
        try { if (e.code) { return String(e.code); } } catch (ignored2) {}
        return "Zoho CRM returned an unexpected error";
    }
    function str(v) { return v == null ? "" : String(v).trim(); }
    function recordId(v) { return v && v.id != null ? str(v.id) : ""; }
    function asLookup(v) {
        var id = recordId(v);
        if (!id) { return null; }
        return {id: id, name: str(v.name || v.Name || v.display_value)};
    }
    function num(v) {
        if (v === null || v === undefined || str(v) === "") { return NaN; }
        var n = typeof v === "number" ? v : Number(str(v).replace(/,/g, ""));
        return isFinite(n) ? n : NaN;
    }
    // Widget prices must use a literal decimal point; reject comma groupings
    // rather than silently reading 10,000 as 10.00 or 10000.00.
    function strictWidgetPrice(v) {
        if (typeof v === "number") { return isFinite(v) ? v : NaN; }
        var value = str(v);
        if (!/^[-+]?\d+(?:\.\d+)?$/.test(value)) { return NaN; }
        var result = Number(value);
        return isFinite(result) ? result : NaN;
    }
    function takeState() {
        var field = ZDK.Page.getField("Ordered_Items");
        if (!field || typeof field.getValue !== "function") {
            throw new Error("Ordered_Items is not accessible on this form.");
        }
        var raw = field.getValue();
        if (raw == null) { raw = []; }
        if (!Array.isArray(raw)) { throw new Error("Zoho returned invalid Ordered_Items values."); }
        return {field: field, raw: raw, subform: null};
    }
    function takeRows(state) {
        var rows = [];
        var raw = state.raw;
        for (var i = 0; i < raw.length; i++) {
            var src = raw[i];
            if (!src) { continue; }
            var product = asLookup(src.Product_Name);
            if (!product) {
                // A default Zoho template line is empty. Do not overwrite a
                // user-entered partial line with no Product Name, however.
                var partialQty = num(src.Quantity), partialPrice = num(src.List_Price);
                var hasUserData = !!(str(src.Offer_Product_Name) || str(src.UPC) ||
                    str(src.Brand) || recordId(src.Supplier) || recordId(src.Purchase_Order) ||
                    (isFinite(partialQty) && partialQty > 1) ||
                    (isFinite(partialPrice) && partialPrice > 0));
                if (hasUserData) {
                    throw new Error("SO inventory line " + (i + 1) +
                        " has values but no CRM Product Name. Complete or remove this line before Fill with AI.");
                }
                continue;
            }
            var quantity = num(src.Quantity), price = num(src.List_Price);
            rows.push({
                __ai_source_index: i,
                Product_Name: product,
                Quantity: isFinite(quantity) && quantity > 0 ? quantity : 1,
                List_Price: isFinite(price) && price >= 0 ? price : 0,
                Offer_Product_Name: str(src.Offer_Product_Name),
                Supplier: asLookup(src.Supplier),
                UPC: str(src.UPC),
                Brand: str(src.Brand),
                HS_Code: str(src.HS_Code),
                Country_of_origin: str(src.Country_of_origin),
                Purchase_Order: asLookup(src.Purchase_Order)
            });
        }
        return rows;
    }
    function parseWidgetRows(value, sync) {
        if (!Array.isArray(value) || value.length > 100 || (!sync && value.length === 0)) {
            throw new Error("Invalid widget product list (maximum 100 items).");
        }
        var items = [];
        for (var i = 0; i < value.length; i++) {
            var w = value[i];
            if (!w) { throw new Error("Missing product on widget line " + (i + 1)); }
            var p = asLookup(w.Product_Name);
            if (!p || !p.name) { throw new Error("Invalid CRM Product on widget line " + (i + 1)); }
            var qty = num(w.Quantity), price = strictWidgetPrice(w.List_Price);
            if (!isFinite(qty) || qty <= 0 || !isFinite(price) || price < 0) {
                throw new Error("Invalid quantity or unit price on widget line " + (i + 1) + ". Unit price must use a dot (27.15); commas are not allowed.");
            }
            var supplier = asLookup(w.Supplier);
            if (w.Supplier && (!supplier || !supplier.name)) {
                throw new Error("Supplier Code is missing its CRM ID or Name on widget line " + (i + 1));
            }
            var offer = str(w.Offer_Product_Name) || p.name;
            if (!offer || offer.length > 255) {
                throw new Error("Offer Product Name is too long or missing on widget line " + (i + 1));
            }
            var srcIndex = null;
            if (w.__ai_source_index !== undefined && w.__ai_source_index !== null && w.__ai_source_index !== "") {
                srcIndex = Number(w.__ai_source_index);
                if (!isFinite(srcIndex) || srcIndex < 0 || Math.floor(srcIndex) !== srcIndex) {
                    throw new Error("Invalid original SO row reference on widget line " + (i + 1));
                }
            }
            items.push({
                source: srcIndex, product: p, qty: qty, price: price,
                offer: offer, supplier: supplier,
                upc: str(w.UPC), brand: str(w.Brand),
                hs: str(w.HS_Code), coo: str(w.Country_of_origin)
            });
        }
        return items;
    }
    function includesNumber(array, number) {
        for (var i = 0; i < array.length; i++) { if (array[i] === number) { return true; } }
        return false;
    }
    function includesId(array, id) {
        for (var i = 0; i < array.length; i++) { if (array[i] === id) { return true; } }
        return false;
    }
    function indexForSource(current, source) {
        for (var i = 0; i < current.length; i++) {
            if (current[i].__ai_source_index === source) { return i; }
        }
        return -1;
    }
    function equalLookup(a, b) { return recordId(a) === recordId(b); }
    function rowData(item) {
        var row = {
            Product_Name: {id:item.product.id, name:item.product.name},
            Quantity: item.qty,
            List_Price: item.price,
            Offer_Product_Name: item.offer
        };
        if (item.supplier) { row.Supplier = {id:item.supplier.id,name:item.supplier.name}; }
        if (item.upc) { row.UPC = item.upc; }
        if (item.brand) { row.Brand = item.brand; }
        if (item.hs) { row.HS_Code = item.hs; }
        if (item.coo) { row.Country_of_origin = item.coo; }
        return row;
    }
    function formSubform(state) {
        if (state.subform) { return state.subform; }
        var sub = ZDK.Page.getSubform("Ordered_Items");
        if (!sub) { throw new Error("Zoho subform editing is unavailable."); }
        state.subform = sub;
        return sub;
    }
    // v1.36: Native inventory subforms sometimes expose an old snapshot via
    // getField().getValue(). Prefer the dedicated Subform API, and compare both
    // before deciding that a CRM Product lookup failed.
    function readInventory(state, expected) {
        var alternatives = [];
        try {
            var form = formSubform(state);
            if (typeof form.getValues === "function") {
                var current = form.getValues();
                if (Array.isArray(current)) { alternatives.push(current); }
            }
        } catch (ignoredSubformRead) {}
        try {
            var fieldRows = state.field.getValue();
            if (Array.isArray(fieldRows)) { alternatives.push(fieldRows); }
        } catch (ignoredFieldRead) {}
        if (!alternatives.length) { throw new Error("CRM did not return the inventory rows."); }
        var best = alternatives[0], topScore = -1;
        for (var a = 0; a < alternatives.length; a++) {
            var values = alternatives[a], score = 0;
            for (var i = 0; i < expected.length; i++) {
                for (var j = 0; j < values.length; j++) {
                    if (recordId(values[j] && values[j].Product_Name) === expected[i].product.id) {
                        score += 10;
                        if (str(values[j].Offer_Product_Name) === expected[i].offer) { score += 3; }
                        if (expected[i].qty !== undefined && isFinite(num(values[j].Quantity)) &&
                            Math.abs(num(values[j].Quantity) - expected[i].qty) < 0.000001) { score += 2; }
                        if (expected[i].price !== undefined && isFinite(num(values[j].List_Price)) &&
                            Math.abs(num(values[j].List_Price) - expected[i].price) < 0.000001) { score += 2; }
                        if (recordId(values[j].Supplier) === recordId(expected[i].supplier)) { score += 5; }
                        break;
                    }
                }
            }
            if (score > topScore) { topScore = score; best = values; }
        }
        return best;
    }

    function missingLookupIndex(rows, id) {
        for (var i = 0; i < rows.length; i++) {
            if (recordId(rows[i] && rows[i].Product_Name) === id) { return -1; }
        }
        for (var j = 0; j < rows.length; j++) {
            if (!recordId(rows[j] && rows[j].Product_Name)) { return j; }
        }
        return -1;
    }

    // A cell-level product lookup write is supported by Zoho on Create pages.
    // Only use it on an empty/unresolved line (never replace an existing product).
    function repairNewProductLookups(state, added) {
        var editor = formSubform(state);
        var expected = [];
        for (var i = 0; i < added.length; i++) {
            expected.push({product:added[i].product, offer:added[i].offer, qty:added[i].qty, price:added[i].price, supplier:added[i].supplier, hs:added[i].hs, coo:added[i].coo});
        }
        var rows = readInventory(state, expected);
        for (var p = 0; p < added.length; p++) {
            var item = added[p], at = missingLookupIndex(rows, item.product.id);
            if (at < 0) { continue; }
            var zrow = editor.getRow(at);
            if (!zrow) { continue; }
            var lookup = {id:item.product.id, name:item.product.name};
            var done = false;
            try {
                var cell = typeof zrow.getCell === "function" ? zrow.getCell("Product_Name") : null;
                if (cell && typeof cell.setValue === "function") {
                    cell.setValue(lookup);
                    done = true;
                }
            } catch (ignoredCellWrite) {}
            if (!done && typeof zrow.setValues === "function") {
                zrow.setValues({Product_Name:lookup});
            }
            if (typeof zrow.setValues === "function") {
                // v1.37: the first product-lookup repair must also restore Supplier.
                // The original v1.36 left this field out on its fallback path.
                var repairFields={Quantity:item.qty, List_Price:item.price,
                    Offer_Product_Name:item.offer};
                if (item.supplier) { repairFields.Supplier={id:item.supplier.id,name:item.supplier.name}; }
                if (item.upc) { repairFields.UPC=item.upc; }
                if (item.brand) { repairFields.Brand=item.brand; }
                if (item.hs) { repairFields.HS_Code=item.hs; }
                if (item.coo) { repairFields.Country_of_origin=item.coo; }
                zrow.setValues(repairFields);
            }
            rows = readInventory(state, expected);
        }
    }

    function isEmptyTemplate(row) {
        if (!row || recordId(row.Product_Name) || str(row.Offer_Product_Name) ||
            str(row.UPC) || str(row.Brand) || recordId(row.Supplier) ||
            recordId(row.Purchase_Order)) { return false; }
        var qty = num(row.Quantity), price = num(row.List_Price);
        return (!isFinite(qty) || qty === 0 || qty === 1) &&
               (!isFinite(price) || price === 0);
    }

    // Remove only Zoho-created blank templates; never delete partial user data.
    function removeExtraBlankTemplates(state, expected) {
        var actual = readInventory(state, expected);
        if (actual.length <= expected.length) { return; }
        var extra = [];
        for (var i = 0; i < actual.length; i++) {
            if (recordId(actual[i] && actual[i].Product_Name)) { continue; }
            if (!isEmptyTemplate(actual[i])) { continue; }
            extra.push(i);
        }
        if (actual.length - extra.length !== expected.length) { return; }
        var editor = formSubform(state);
        for (var j = extra.length - 1; j >= 0; j--) { editor.deleteRow(extra[j]); }
    }

    // v1.37: verify EVERY required inventory field, especially Supplier.
    // Zoho sometimes drops the first row's Supplier during its native
    // Product_Name lookup initialization. Repair the actual native row, then
    // read it again; never report success when Supplier was not accepted.
    function confirmOffers(state, expected) {
        var observed = readInventory(state, expected);
        var used = [];
        for (var i = 0; i < expected.length; i++) {
            var want = expected[i], at = -1;
            for (var j = 0; j < observed.length; j++) {
                if (!includesNumber(used, j) &&
                    recordId(observed[j] && observed[j].Product_Name) === want.product.id) {
                    at = j; break;
                }
            }
            if (at < 0) {
                throw new Error("CRM Product Name missing on row " + (i + 1) +
                    " (" + want.product.name + ").");
            }
            used.push(at);
            var actual = observed[at], patch = {}, changed = false;
            if (want.offer && (want.force || str(actual.Offer_Product_Name) !== want.offer)) {
                patch.Offer_Product_Name = want.offer; changed = true;
            }
            if (want.qty !== undefined &&
                (!isFinite(num(actual.Quantity)) || Math.abs(num(actual.Quantity) - want.qty) > 0.000001)) {
                patch.Quantity = want.qty; changed = true;
            }
            if (want.price !== undefined &&
                (!isFinite(num(actual.List_Price)) || Math.abs(num(actual.List_Price) - want.price) > 0.000001)) {
                patch.List_Price = want.price; changed = true;
            }
            // Preserve independently researched HS/COO alongside the row.
            if (want.hs && str(actual.HS_Code) !== want.hs) {
                patch.HS_Code = want.hs; changed = true;
            }
            if (want.coo && str(actual.Country_of_origin) !== want.coo) {
                patch.Country_of_origin = want.coo; changed = true;
            }
            if (recordId(actual.Supplier) !== recordId(want.supplier)) {
                patch.Supplier = want.supplier
                    ? {id:want.supplier.id,name:want.supplier.name} : null;
                changed = true;
            }
            // Re-submit Supplier alongside other fields even when it was
            // already visible; Zoho can reset row-one lookups after writing Offer.
            if (changed && want.supplier) {
                patch.Supplier = {id:want.supplier.id,name:want.supplier.name};
            }
            if (changed) {
                var row = formSubform(state).getRow(at);
                if (!row || typeof row.setValues !== "function") {
                    throw new Error("CRM cannot correct inventory row " + (i + 1) +
                        " (Product / Quantity / Unit Price / Supplier).");
                }
                row.setValues(patch);
            }
        }
        // Always check the result, including the first row and rows with a
        // Supplier selected in the widget. No silent best-effort success.
        var confirmed = readInventory(state, expected), seen = [], supplierCount = 0;
        for (var k = 0; k < expected.length; k++) {
            var item = expected[k], found = -1;
            for (var n = 0; n < confirmed.length; n++) {
                if (!includesNumber(seen, n) &&
                    recordId(confirmed[n] && confirmed[n].Product_Name) === item.product.id) {
                    found = n; break;
                }
            }
            if (found < 0) {
                throw new Error("CRM has not confirmed Product Name for row " + (k + 1) + ".");
            }
            seen.push(found);
            var actualLine = confirmed[found];
            if (str(actualLine.Offer_Product_Name) !== item.offer) {
                throw new Error("Offer Product Name was not saved on row " + (k + 1) + ".");
            }
            if (item.qty !== undefined &&
                (!isFinite(num(actualLine.Quantity)) || Math.abs(num(actualLine.Quantity) - item.qty) > 0.000001)) {
                throw new Error("Quantity was not saved on row " + (k + 1) + ".");
            }
            if (item.price !== undefined &&
                (!isFinite(num(actualLine.List_Price)) || Math.abs(num(actualLine.List_Price) - item.price) > 0.000001)) {
                throw new Error("Unit Price was not saved on row " + (k + 1) + ".");
            }
            if (item.hs && str(actualLine.HS_Code) !== item.hs) {
                throw new Error("HS Code was not transferred on row " + (k + 1) + ".");
            }
            if (item.coo && str(actualLine.Country_of_origin) !== item.coo) {
                throw new Error("Country of Origin was not transferred on row " + (k + 1) + ".");
            }
            if (recordId(actualLine.Supplier) !== recordId(item.supplier)) {
                // One final targeted row-level retry is safe. Re-read the exact
                // Product row and NEVER report success until Supplier matches.
                var supplierRow = formSubform(state).getRow(found);
                if (!supplierRow || typeof supplierRow.setValues !== "function") {
                    throw new Error("CRM cannot write Supplier on row " + (k + 1) + ".");
                }
                supplierRow.setValues({Supplier:item.supplier
                    ? {id:item.supplier.id,name:item.supplier.name}:null});
                var retryRows = readInventory(state, expected), confirmedSupplier = false;
                for (var ri=0;ri<retryRows.length;ri++) {
                    if (recordId(retryRows[ri].Product_Name) === item.product.id &&
                        recordId(retryRows[ri].Supplier) === recordId(item.supplier) &&
                        str(retryRows[ri].Offer_Product_Name) === item.offer &&
                        isFinite(num(retryRows[ri].Quantity)) &&
                        Math.abs(num(retryRows[ri].Quantity)-item.qty)<0.000001 &&
                        isFinite(num(retryRows[ri].List_Price)) &&
                        Math.abs(num(retryRows[ri].List_Price)-item.price)<0.000001 &&
                        (!item.hs || str(retryRows[ri].HS_Code)===item.hs) &&
                        (!item.coo || str(retryRows[ri].Country_of_origin)===item.coo)) {
                        confirmedSupplier=true;break;
                    }
                }
                if (!confirmedSupplier) {
                    throw new Error("Supplier was not saved on row " + (k + 1) +
                        " (" + item.product.name + "). Expected " +
                        (item.supplier ? item.supplier.name : "(none)") +
                        ". Do NOT save this Sales Order until the supplier is corrected.");
                }
            }
            if (item.supplier) { supplierCount++; }
        }
        return supplierCount;
    }

    function applyDraft(draft, savedState) {
        var stage = "validate widget response";
        try {
            if (!draft || draft.ai_order_builder !== "1.9") {
                throw new Error("Unexpected AI Order Builder response.");
            }
            var sync = draft.ai_order_builder_mode === "sync_1.30";
            stage = "read existing SO rows";
            var state = savedState || takeState();
            var current = takeRows(state);
            stage = "validate widget product rows";
            var items = parseWidgetRows(draft.Ordered_Items, sync);

            // Reconciliation uses only arrays of plain primitives, and no callbacks.
            // Separating its phases makes any future Zoho SDK error traceable.
            stage = "plan 1/4: resolve existing lines";
            var keepSources = [];
            var keepItems = [];
            for (var i = 0; i < items.length; i++) {
                var item = items[i];
                if (!sync || item.source === null) { continue; }
                var oldIndex = indexForSource(current, item.source);
                if (oldIndex < 0) { throw new Error("SO row " + (item.source + 1) + " no longer exists. Close and reopen the widget."); }
                if (current[oldIndex].Product_Name.id !== item.product.id) {
                    throw new Error("Product changed outside widget in SO row " + (item.source + 1) + ".");
                }
                if (includesNumber(keepSources, item.source)) {
                    throw new Error("Same SO row was submitted twice: " + (item.source + 1));
                }
                keepSources.push(item.source);
                keepItems.push(item);
            }
            stage = "plan 2/4: protect existing PO lines";
            var removeSources = [];
            var finalIds = [];
            for (var ci = 0; ci < current.length; ci++) {
                var original = current[ci];
                var stillThere = !sync || includesNumber(keepSources, original.__ai_source_index);
                if (stillThere) {
                    if (!includesId(finalIds, original.Product_Name.id)) { finalIds.push(original.Product_Name.id); }
                } else {
                    if (recordId(original.Purchase_Order)) {
                        throw new Error("SO line " + (original.__ai_source_index + 1) + " is linked to a PO and cannot be removed.");
                    }
                    removeSources.push(original.__ai_source_index);
                }
            }
            stage = "plan 3/4: identify new products";
            var addItems = [];
            var duplicates = 0;
            for (var j = 0; j < items.length; j++) {
                var it = items[j];
                if (sync && it.source !== null) { continue; }
                if (includesId(finalIds, it.product.id)) { duplicates++; continue; }
                finalIds.push(it.product.id);
                addItems.push(it);
            }
            stage = "plan 4/4: check maximum items";
            if (sync && items.length === 0) {
                throw new Error("Sales Order cannot be left without products.");
            }
            if (current.length - removeSources.length + addItems.length > 100) {
                throw new Error("Sales Order would exceed 100 products.");
            }

            // No modifications happened during the previous four phases.
            stage = "write changed existing SO rows";
            var changed = 0, verifiedSuppliers = 0;
            for (var k = 0; k < keepItems.length; k++) {
                var target = keepItems[k];
                var old = current[indexForSource(current, target.source)];
                var changes = {};
                var hasChanges = false;
                if (old.Quantity !== target.qty) { changes.Quantity = target.qty; hasChanges = true; }
                if (old.List_Price !== target.price) { changes.List_Price = target.price; hasChanges = true; }
                if (old.Offer_Product_Name !== target.offer) { changes.Offer_Product_Name = target.offer; hasChanges = true; }
                if (target.hs && str(old.HS_Code)!==target.hs) {
                    changes.HS_Code=target.hs; hasChanges=true;
                }
                if (target.coo && str(old.Country_of_origin)!==target.coo) {
                    changes.Country_of_origin=target.coo; hasChanges=true;
                }
                if (!equalLookup(old.Supplier, target.supplier)) {
                    changes.Supplier = target.supplier ? {id:target.supplier.id,name:target.supplier.name} : null;
                    hasChanges = true;
                }
                if (hasChanges) {
                    stage = "write existing row " + (target.source + 1);
                    var zr = formSubform(state).getRow(target.source);
                    if (!zr || typeof zr.setValues !== "function") {
                        throw new Error("Zoho cannot update this inventory row.");
                    }
                    zr.setValues(changes);
                    changed++;
                }
            }

            stage = "delete removed SO rows";
            var insertionIndex = state.raw.length - removeSources.length;
            // Descending order preserves indices of earlier rows.
            for (var d = removeSources.length - 1; d >= 0; d--) {
                for (var e = 0; e < d; e++) {
                    if (removeSources[e] < removeSources[d]) {
                        var tmp = removeSources[e];
                        removeSources[e] = removeSources[d];
                        removeSources[d] = tmp;
                    }
                }
            }
            for (var di = 0; di < removeSources.length; di++) {
                stage = "delete row " + (removeSources[di] + 1);
                formSubform(state).deleteRow(removeSources[di]);
            }

            stage = "insert new SO rows";
            if (addItems.length) {
                var newRows = [];
                for (var a = 0; a < addItems.length; a++) { newRows.push(rowData(addItems[a])); }
                if (current.length - removeSources.length === 0) {
                    // Do not use Ordered_Items Field.setValue() for the initial
                    // inventory lookup write. It intermittently leaves a blank
                    // Product Name in native Sales Orders even with valid IDs.
                    stage = "fill empty SO with native subform";
                    var emptyForm = formSubform(state);
                    if (typeof emptyForm.setValues === "function") {
                        emptyForm.setValues(newRows);
                    } else {
                        state.field.setValue(newRows);
                    }
                } else {
                    stage = "append new SO rows (single write)";
                    formSubform(state).insertRows(newRows, insertionIndex);
                }
            }

            stage = "verify Product Name and Offer Product Name";
            var expected = [];
            for (var vi = 0; vi < current.length; vi++) {
                var oldRow = current[vi];
                if (includesNumber(removeSources, oldRow.__ai_source_index)) { continue; }
                var edited = null;
                for (var ei = 0; ei < keepItems.length; ei++) {
                    if (keepItems[ei].source === oldRow.__ai_source_index) { edited = keepItems[ei]; break; }
                }
                var wantedOffer = edited ? edited.offer : oldRow.Offer_Product_Name;
                expected.push({product:oldRow.Product_Name, offer:wantedOffer,
                    qty:edited ? edited.qty : oldRow.Quantity,
                    price:edited ? edited.price : oldRow.List_Price,
                    supplier:edited ? edited.supplier : oldRow.Supplier,
                    hs:edited ? (edited.hs||oldRow.HS_Code) : oldRow.HS_Code,
                    coo:edited ? (edited.coo||oldRow.Country_of_origin) : oldRow.Country_of_origin,
                    force:!!(edited && wantedOffer !== oldRow.Offer_Product_Name)});
            }
            for (var ai = 0; ai < addItems.length; ai++) {
                expected.push({product:addItems[ai].product, offer:addItems[ai].offer, qty:addItems[ai].qty, price:addItems[ai].price, supplier:addItems[ai].supplier, hs:addItems[ai].hs, coo:addItems[ai].coo, force:true});
            }
            // On an otherwise empty SO only, recover a rejected lookup with
            // per-cell Product_Name.setValue(). No existing product is replaced.
            if (!current.length && addItems.length) {
                var firstVerificationError = null;
                try { verifiedSuppliers = confirmOffers(state, expected); }
                catch (firstCheck) { firstVerificationError = firstCheck; }
                if (firstVerificationError !== null) {
                    stage = "repair Product Name cells";
                    repairNewProductLookups(state, addItems);
                    stage = "verify repaired inventory";
                    verifiedSuppliers = confirmOffers(state, expected);
                }
                stage = "remove default blank inventory templates";
                removeExtraBlankTemplates(state, expected);
                var actualRows = readInventory(state, expected);
                if (actualRows.length !== expected.length) {
                    throw new Error("CRM has " + actualRows.length + " inventory rows instead of " +
                        expected.length + ". Check the extra blank row before saving.");
                }
            } else {
                verifiedSuppliers = confirmOffers(state, expected);
            }

            if (!current.length && addItems.length) {
                stage = "set requested status";
                var status = ZDK.Page.getField("Status");
                if (status && typeof status.setValue === "function") { status.setValue("Requested"); }
            }
            stage = "notify";
            var notice = "SO updated: " + addItems.length + " added, " + removeSources.length +
                " removed, " + changed + " changed, " + duplicates + " duplicates skipped. Supplier verified on " + verifiedSuppliers + " line(s).";
            ZDK.Client.showMessage(notice, {type: "success"});
            return true;
        } catch (problem) {
            throw new Error("v1.38 | " + stage + ": " + errorText(problem));
        }
    }
    function openBuilder() {
        var state, existing;
        try {
            state = takeState();
            existing = takeRows(state);
        } catch (err) { throw new Error("Reading SO products: " + errorText(err)); }
        if (existing.length > 100) { throw new Error("SO has more than 100 products."); }
        try { ZDK.Client.hideLoader(); } catch (ignored) {}
        var reply;
        try {
            reply = ZDK.Client.openPopup({
                api_name:"AI_Order_Builder", type:"widget", header:"AI Order Builder",
                animation_type:5, width:"90vw", height:"90vh", left:"center"
            }, {data:{
                ai_order_builder_bridge:"1.9",
                ai_order_builder_target:"current_form",
                ai_order_builder_mode:"sync_1.30",
                existing_rows:existing
            }});
        } catch (err2) { throw new Error("Opening AI widget: " + errorText(err2)); }
        if (reply) {
            try { applyDraft(reply, state); }
            catch (err3) { throw new Error("Updating SO from Fill Sales Order: " + errorText(err3)); }
        }
    }
    function showError(err) {
        if (errorText(err) === "widget_closed") { return; }
        ZDK.Client.showAlert(errorText(err), "AI Order Builder");
    }
    return {version:VERSION,openBuilder:openBuilder,applyDraft:applyDraft,showError:showError};
})();

// Existing Sales Orders > Standard Create Page > onLoad.
// Ordinary Create Sales Order is unaffected unless launched by the AI button.
var aiNavigation = $Page.navigation_data;
if (aiNavigation && aiNavigation.ai_order_builder === "1.9") {
    try { aiBridgeV138.applyDraft(aiNavigation); }
    catch (aiReturnError) { aiBridgeV138.showError(aiReturnError); }
} else {
    var aiUrl = typeof $Client !== "undefined" ? String($Client.url || "") : "";
    var aiQuery = aiUrl.split("#")[0].split("?").slice(1).join("?");
    var aiUrlMarker = /(?:^|&)ai_order_builder_launch=1\.10(?:&|$)/.test(aiQuery);
    if ((aiNavigation && aiNavigation.ai_order_builder_launch === "1.10") || aiUrlMarker) {
        try { aiBridgeV138.openBuilder(); }
        catch (aiLaunchError) { aiBridgeV138.showError(aiLaunchError); }
    }
}