# AI Order Builder for Zoho CRM

## Current archived widget: v1.46 (2026-11-19)

- **Widget:** v1.46 — [source](widget/) | [installation ZIP](releases/AI_Order_Builder_Widget_v1.46.zip)
- **Sales Orders Create / Fill with AI Client Scripts:** v1.36 (unchanged). See [Fill with AI](client-scripts/Fill_with_AI_BUTTON_v1.36.js) and [Create onLoad](client-scripts/Sales_Orders_CREATE_onLoad_v1.36.js).
- [Immutable widget source snapshot](versions/widget-v1.46/)

### Install

1. Upload `AI_Order_Builder_Widget_v1.46.zip` to **Zoho CRM → Developer Hub → Widgets → AI Order Builder**.
2. Keep existing v1.36 Client Scripts; this release changes only the widget.
3. Confirm **Version 1.46** appears in the widget footer.

### Behavior

- Import or manually find CRM Products; show CRM Product Name and customer Offer Product Name separately.
- Highlight missing/invalid product, quantity, or price and prevent submitting incomplete rows.
- Browse by brand with paginated results.
- Saved Sales Orders can load and edit products regardless of SO Status (Requested, Ordered, Shipped, Cancelled), including non-PO fields on lines linked to PO.
- Linked Purchase Orders are **not** automatically synchronized when Sales Order lines change; deletion of PO-linked SO lines is protected.

- The v1.45 `ORDER` over `QTY`, `PRICE USD`, exclusion of unordered rows, and visual row separators are preserved unchanged; only its incorrect automatic product-name sourcing is fixed.

- **v1.46**: restored the original product research pipeline; the accidental v1.45 path that automatically created CRM Products with the supplier Excel name was removed. Automatic product creation now requires a verified manufacturer's product-name source on a brand-controlled HTTPS domain from any country. `Offer Product Name` remains the exact customer/supplier title. If research cannot confirm an official source, creation is blocked for review. Manually creating a new product requires an explicit confirmation that the official name was checked.

### History retained

- [v1.45 archived source](versions/widget-v1.45/) and [v1.45 release ZIP](releases/AI_Order_Builder_Widget_v1.45.zip) are retained for audit but should **not** be installed: v1.45 used the Excel title as an official CRM Product Name.
- [v1.44 archived source](versions/widget-v1.44/) and [v1.44 ZIP](releases/AI_Order_Builder_Widget_v1.44.zip) are retained.
- The [v1.42 source](versions/widget-v1.42/) and [v1.42 release ZIP](releases/AI_Order_Builder_Widget_v1.42.zip) remain available.
- Previous widget releases (including v1.39) and prior Client Scripts remain unchanged.
- Historical versions are not deleted or overwritten.

No API keys, OAuth tokens, or CRM connection secrets should be stored here.
