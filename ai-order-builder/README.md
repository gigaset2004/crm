# AI Order Builder for Zoho CRM

## Current archived widget: v1.47 (2026-11-20)

- **Widget:** v1.47 — [source](widget/) | [installation ZIP](releases/AI_Order_Builder_Widget_v1.47.zip)
- **Sales Orders Create / Fill with AI Client Scripts:** v1.36 (unchanged). See [Fill with AI](client-scripts/Fill_with_AI_BUTTON_v1.36.js) and [Create onLoad](client-scripts/Sales_Orders_CREATE_onLoad_v1.36.js).
- [Immutable widget source snapshot](versions/widget-v1.47/)

### Install

1. Upload `AI_Order_Builder_Widget_v1.47.zip` to **Zoho CRM → Developer Hub → Widgets → AI Order Builder**.
2. Keep existing v1.36 Client Scripts; this release changes only the widget.
3. Confirm **Version 1.47** appears in the widget footer.

### Behavior

- Import or manually find CRM Products; show CRM Product Name and customer Offer Product Name separately.
- Highlight missing/invalid product, quantity, or price and prevent submitting incomplete rows.
- Browse by brand with paginated results.
- Saved Sales Orders can load and edit products regardless of SO Status (Requested, Ordered, Shipped, Cancelled), including non-PO fields on lines linked to PO.
- Linked Purchase Orders are **not** automatically synchronized when Sales Order lines change; deletion of PO-linked SO lines is protected.

- The v1.45 `ORDER` over `QTY`, `PRICE USD`, exclusion of unordered rows, and visual row separators are preserved unchanged; only its incorrect automatic product-name sourcing is fixed.

- **v1.46**: restored the original product research pipeline; the accidental v1.45 path that automatically created CRM Products with the supplier Excel name was removed. Automatic product creation now requires a verified manufacturer's product-name source on a brand-controlled HTTPS domain from any country. `Offer Product Name` remains the exact customer/supplier title. If research cannot confirm an official source, creation is blocked for review. Manually creating a new product requires an explicit confirmation that the official name was checked.

- **v1.47**: Imported Offer Product Name removes an exact leading brand (e.g. Nars), without changing the official CRM Product Name or raw supplier name used for research. Matching pre-existing Products with text-only Brand_text="NARS" and no Brand lookup are linked to the existing Brands/Nars record only when the brand names match; no other brand is changed. Re-importing the same Excel file replaces its previous unsaved draft rows, preserving manual and PO-linked lines. Row boundaries increased to 5px with alternating bands. Structured import still uses ORDER, not stock QTY, and recognizes PRICE USD; missing/zero ORDER values, totals and notes are skipped.

### History retained

- [v1.46 archived source](versions/widget-v1.46/) and [v1.46 release ZIP](releases/AI_Order_Builder_Widget_v1.46.zip) are retained.
- [v1.45 archived source](versions/widget-v1.45/) and [v1.45 release ZIP](releases/AI_Order_Builder_Widget_v1.45.zip) are retained for audit but should **not** be installed: v1.45 used the Excel title as an official CRM Product Name.
- [v1.44 archived source](versions/widget-v1.44/) and [v1.44 ZIP](releases/AI_Order_Builder_Widget_v1.44.zip) are retained.
- The [v1.42 source](versions/widget-v1.42/) and [v1.42 release ZIP](releases/AI_Order_Builder_Widget_v1.42.zip) remain available.
- Previous widget releases (including v1.39) and prior Client Scripts remain unchanged.
- Historical versions are not deleted or overwritten.

No API keys, OAuth tokens, or CRM connection secrets should be stored here.
