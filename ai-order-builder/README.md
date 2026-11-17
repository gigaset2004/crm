# AI Order Builder for Zoho CRM

## Current archived widget: v1.44 (2026-11-16)

- **Widget:** v1.44 — [source](widget/) | [installation ZIP](releases/AI_Order_Builder_Widget_v1.44.zip)
- **Sales Orders Create / Fill with AI Client Scripts:** v1.36 (unchanged). See [Fill with AI](client-scripts/Fill_with_AI_BUTTON_v1.36.js) and [Create onLoad](client-scripts/Sales_Orders_CREATE_onLoad_v1.36.js).
- [Immutable widget source snapshot](versions/widget-v1.44/)

### Install

1. Upload `AI_Order_Builder_Widget_v1.44.zip` to **Zoho CRM → Developer Hub → Widgets → AI Order Builder**.
2. Keep existing v1.36 Client Scripts; this release changes only the widget.
3. Confirm **Version 1.44** appears in the widget footer.

### Behavior

- Import or manually find CRM Products; show CRM Product Name and customer Offer Product Name separately.
- Highlight missing/invalid product, quantity, or price and prevent submitting incomplete rows.
- Browse by brand with paginated results.
- Saved Sales Orders can load and edit products regardless of SO Status (Requested, Ordered, Shipped, Cancelled), including non-PO fields on lines linked to PO.
- Linked Purchase Orders are **not** automatically synchronized when Sales Order lines change; deletion of PO-linked SO lines is protected.

### History retained

- The [v1.42 source](versions/widget-v1.42/) and [v1.42 release ZIP](releases/AI_Order_Builder_Widget_v1.42.zip) remain available.
- Previous widget releases (including v1.39) and prior Client Scripts remain unchanged.
- Historical versions are not deleted or overwritten.

No API keys, OAuth tokens, or CRM connection secrets should be stored here.
