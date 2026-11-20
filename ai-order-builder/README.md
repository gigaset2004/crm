# AI Order Builder for Zoho CRM

## Current release: widget v1.55 / Client Scripts v1.40 (2026-11-20)

- **Widget:** v1.55 — [source](widget/) | [installation ZIP](releases/AI_Order_Builder_Widget_v1.55.zip)
- **Two existing Client Scripts:** [Fill with AI onClick v1.40](client-scripts/Fill_with_AI_BUTTON_v1.40.js) and [Create onLoad v1.40](client-scripts/Sales_Orders_CREATE_onLoad_v1.40.js).
- [Immutable widget source snapshot](versions/widget-v1.55/)
- [Release details and verification](releases/README_v1.55.txt)

### Install

1. Upload `AI_Order_Builder_Widget_v1.55.zip` to **Zoho CRM → Developer Hub → Widgets → AI Order Builder**.
2. Replace the code of the two existing Sales Orders Create-page Client Scripts: **Fill with AI / onClick** and **AI Order Fill Products / onLoad**, using the complete v1.40 files above.
3. Do not add extra Client Scripts. The two replacements preserve Supplier, unit price, HS/COO transfer and the existing order logic.
4. Reopen the widget, confirm **Version 1.55**, then run **Extract and match** again. Close it with X to verify silent cancellation.
5. The connected Client Script API returns `OAUTH_SCOPE_MISMATCH`, so these two script changes require installation in Zoho; uploading only the widget ZIP does not replace native Client Scripts.

### v1.55 changes

- Fix the server cache behind repeated blank COO: standard identity lookup was cached by UPC, so changing the retry title still returned the previous result without a search. The optional second pass now uses explicit `research_mode: "customs"`, a dedicated query for the actually missing fields and an independent cache. Incomplete requested customs results are not cached.
- Preserve the supplier's size/variant as an untrusted search hint, while the exact UPC and source evidence control identification. The hint never replaces the official CRM Product Name.
- Accept a separate COO source only with its own checked quotation of the exact same UPC; it need not be the primary product-name source. Preserve product-specific origin validation. Unresolved conflicting origin claims remain blank with a reason; no UPC-to-country mapping or predetermined product URL is added.
- Client Scripts v1.40 silently handle ordinary `widget_closed` cancellation in string and SDK wrapper forms. Genuine opening/transfer errors remain visible.
- Diagnostics now show version 1.55, optional missing HS/COO per row, cache hits and field-validation reasons. HS/COO remain optional; their red hints and small transparent pencils are preserved.
- All older versions remain archived unchanged.

### v1.54 changes

- Removed unsupported product request properties that caused HTTP 400 on the second HS/COO request. v1.55 additionally fixes the server cache that prevented that accepted request from doing a new search.
- Added optional missing HS/COO highlights and small transparent pencils.

### Behavior

- Import or manually find CRM Products; show CRM Product Name and customer Offer Product Name separately.
- Highlight missing/invalid product, quantity, or price and prevent submitting incomplete rows.
- Browse by brand with paginated results.
- Saved Sales Orders can load and edit products regardless of SO Status (Requested, Ordered, Shipped, Cancelled), including non-PO fields on lines linked to PO.
- Linked Purchase Orders are **not** automatically synchronized when Sales Order lines change; deletion of PO-linked SO lines is protected.

- The v1.45 `ORDER` over `QTY`, `PRICE USD`, exclusion of unordered rows, and visual row separators are preserved unchanged; only its incorrect automatic product-name sourcing is fixed.

- **v1.46**: restored the original product research pipeline; the accidental v1.45 path that automatically created CRM Products with the supplier Excel name was removed. Automatic product creation now requires a verified manufacturer's product-name source on a brand-controlled HTTPS domain from any country. `Offer Product Name` remains the exact customer/supplier title. If research cannot confirm an official source, creation is blocked for review. Manually creating a new product requires an explicit confirmation that the official name was checked.

- **v1.47**: Imported Offer Product Name removes an exact leading brand (e.g. Nars), without changing the official CRM Product Name or raw supplier name used for research. Matching pre-existing Products with text-only Brand_text="NARS" and no Brand lookup are linked to the existing Brands/Nars record only when the brand names match; no other brand is changed. Re-importing the same Excel file replaces its previous unsaved draft rows, preserving manual and PO-linked lines. Row boundaries increased to 5px with alternating bands. Structured import still uses ORDER, not stock QTY, and recognizes PRICE USD; missing/zero ORDER values, totals and notes are skipped.

- **v1.48**: Store short-lived AI authorization in sessionStorage so reopening the widget within its valid session does not always restart OAuth. Expired tokens still require authorization until the backend supports refresh. For missing Products, research first, retry with a manufacturer-first global/regional query when official evidence is absent, validate UPC+official brand domain, and only then create the CRM Product. Infer known CRM brands from the input; a missing brand can be created only after verified manufacturer evidence and a second CRM duplicate check. No writes when evidence is inconclusive.

- **v1.49**: Two inline pencils next to HS Code and COO on every line open a verified CRM Product editor; fields can also be changed on unmatched draft rows. Catalog writes are read back and checked, and line-level customs fields transfer into the Sales Order. Auto HS/COO enrichment now processes missing values for both matched and newly created Products, without blocking order creation when optional research fails. Previously blocked UPCs 3605973023352 (official Kiehl's UK page) and 3614274101584 (Helena Rubinstein official 100ml + corroborating UPC listing) have verified exact-variant fallback while general manufacturer research stays active. Thin 2px separators replace 5px borders. Source titles from Excel remain in Offer Product Name, and official names are never inferred from retailer evidence alone.

- **v1.50 / native Client Scripts v1.37:** Verify Product Name, Offer Product Name, Quantity, Unit Price and Supplier after native SO transfer; repair missing Supplier on any row including the first. Unit price now displays and accepts only decimal-dot values (27.15); values containing commas are rejected. New Account-only onChange/onSave scripts enforce Sales Orders Billing and Shipping fields from Account instead of Contact.

- **v1.51 / 2 Client Scripts v1.38:** preserve HS_Code and Country_of_origin end-to-end between widget, native Sales Orders subform and reopening. Verify both fields after transfer; retain Product catalog metadata when Zoho omits line fields. Saved SO COQL/read/update also includes HS/COO. OAuth popup iframe destroys sessionStorage in some CRM contexts: a 14-minute token is now also cached in origin-scoped localStorage to reduce repeated login within its validity. This does **not** extend the server session or eliminate reauthorization after expiry; backend refresh-token support would be required for persistent access.

- **v1.52 / Client Scripts v1.39**: strip leading brand from Offer Product Name across apostrophes (KIEHL\'S / Kiehls / Kiehl’s), accents and punctuation while retaining official CRM Product Name. UPC 3614274101584 Helena Rubinstein Replasty Age Recovery Night Cream 100ml has vendor-corroborated France COO fallback, written only when Product COO is empty with readback verification, both during Extract and when reopening the widget. Optional HS/COO research expires in 45s. Closing AI widget with X silently ignores the normal widget_closed event in the two existing Client Scripts. Genuine errors still show alerts. No additional Client Scripts.

- **v1.53**: remove the exceptional UPC-to-Product and UPC-to-COO rules added in v1.49/v1.52. Instead, existing and missing Products use the same general web research for every UPC; missing HS/COO triggers a short, manufacturer/country-of-origin-focused second search. Only matching, verified UPC/brand facts can add HS; country-of-origin updates additionally require a product-specific HTTPS evidence source. Existing CRM trade data is never silently overwritten. The widget no longer invents or stores a country because a particular UPC appears in its JavaScript. Client Scripts v1.39 remain unchanged.

### History retained

- [v1.52 source](versions/widget-v1.52/) and [v1.52 ZIP](releases/AI_Order_Builder_Widget_v1.52.zip) retained for audit, but v1.53 removes the hardcoded item overrides.
- [v1.51 source](versions/widget-v1.51/) and [v1.51 ZIP](releases/AI_Order_Builder_Widget_v1.51.zip) are retained.
- [v1.50 source](versions/widget-v1.50/) and [v1.50 ZIP](releases/AI_Order_Builder_Widget_v1.50.zip) are retained.
- [v1.49 source](versions/widget-v1.49/) and [v1.49 ZIP](releases/AI_Order_Builder_Widget_v1.49.zip) are retained.
- [v1.48 source](versions/widget-v1.48/) and [v1.48 release ZIP](releases/AI_Order_Builder_Widget_v1.48.zip) are retained.
- [v1.47 source](versions/widget-v1.47/) and [v1.47 ZIP](releases/AI_Order_Builder_Widget_v1.47.zip) are retained.
- [v1.46 archived source](versions/widget-v1.46/) and [v1.46 release ZIP](releases/AI_Order_Builder_Widget_v1.46.zip) are retained.
- [v1.45 archived source](versions/widget-v1.45/) and [v1.45 release ZIP](releases/AI_Order_Builder_Widget_v1.45.zip) are retained for audit but should **not** be installed: v1.45 used the Excel title as an official CRM Product Name.
- [v1.44 archived source](versions/widget-v1.44/) and [v1.44 ZIP](releases/AI_Order_Builder_Widget_v1.44.zip) are retained.
- The [v1.42 source](versions/widget-v1.42/) and [v1.42 release ZIP](releases/AI_Order_Builder_Widget_v1.42.zip) remain available.
- Previous widget releases (including v1.39) and prior Client Scripts remain unchanged.
- Historical versions are not deleted or overwritten.

No API keys, OAuth tokens, or CRM connection secrets should be stored here.
