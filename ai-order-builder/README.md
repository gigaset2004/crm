# AI Order Builder for Zoho CRM

## Current working release (confirmed by CRM user on 2026-11-16)

- **Widget:** v1.42
- **Sales Orders Create / Fill with AI Client Scripts:** v1.36 (both scripts)
- **Repository:** `gigaset2004/crm`

### Install

1. In **Zoho CRM → Setup → Developer Hub → Widgets → AI Order Builder**, upload [AI_Order_Builder_Widget_v1.42.zip](releases/AI_Order_Builder_Widget_v1.42.zip). The ZIP root has `plugin-manifest.json` and `app/`.
2. In Client Scripts, replace the **Fill with AI in Record** script with [Fill_with_AI_BUTTON_v1.36.js](client-scripts/Fill_with_AI_BUTTON_v1.36.js).
3. Replace the **Sales Orders Create onLoad / AI Order Fill Products** script with [Sales_Orders_CREATE_onLoad_v1.36.js](client-scripts/Sales_Orders_CREATE_onLoad_v1.36.js).
4. Confirm **Version 1.42** in the widget footer, and verify the Client Script is v1.36.
5. **Do not** change Sales Order Subject or unrelated functions.

A [full working backup](releases/AI_Order_Builder_WORKING_v1.42_Widget_v1.36_Scripts.zip) includes the widget and both Client Scripts.

### Working behavior

- Import Excel/CSV product requests, or search the CRM product catalog manually.
- Missing product/quantity/price is visibly flagged; incomplete lines cannot be submitted.
- Search by brand and Enter displays brand products, paginated without sales-ranking query failures hiding results.
- Select/add products; copy CRM Product Name to Offer Product Name without changing the CRM product catalog.
- On creating a Sales Order, update Ordered_Items, validate inserted Product Name and Offer Product Name, and handle blank row behavior.
- Editing existing Requested Sales Orders retains existing items, can update/remove/add lines, and protects PO-linked rows.

### Source and tests

- Widget source: [widget/](widget/) (current version)
- Immutable v1.42 source snapshot: [versions/widget-v1.42/](versions/widget-v1.42/)
- Client Scripts: [client-scripts/](client-scripts/)
- Tests: [tests/test_v142.js](tests/test_v142.js), [tests/test_v136.js](tests/test_v136.js)

### Historical releases (preserved)

- v1.39 widget backup and v1.33 Client Scripts remain in [releases/](releases/) and [client-scripts/](client-scripts/).
- Do not remove working historical versions.

No credentials or API tokens should be committed.
