# AI Order Builder for Zoho CRM

## Current archived widget: v1.52 (2026-11-20)

- **Widget:** v1.52 — [source](widget/) | [installation ZIP](releases/AI_Order_Builder_Widget_v1.52.zip)
- **Sales Orders Create / Fill with AI Client Scripts:** v1.39. See [Fill with AI](client-scripts/Fill_with_AI_BUTTON_v1.39.js) and [Create onLoad](client-scripts/Sales_Orders_CREATE_onLoad_v1.39.js).
- [Immutable widget source snapshot](versions/widget-v1.52/)

### Install

1. Upload `AI_Order_Builder_Widget_v1.52.zip` to **Zoho CRM → Developer Hub → Widgets → AI Order Builder**.
2. Replace the two existing Create-page Client Scripts with v1.39 (button onClick and page onLoad).
3. Only two Client Scripts are needed for AI Order Builder. Do not install additional onSave/onChange scripts; Account-only address enforcement is a separate server automation that is NOT included in this release.
4. Confirm **Version 1.52** in the widget footer and test first-row Supplier, dot-only prices and Account addresses.
5. The connected Zoho Client Script API returned OAUTH_SCOPE_MISMATCH; install exactly the two v1.38 scripts through Developer Hub.

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

### History retained

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
