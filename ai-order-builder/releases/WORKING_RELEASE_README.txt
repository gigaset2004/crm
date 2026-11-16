Zoho CRM AI Order Builder - confirmed working 2026-11-16

Widget: AI Order Builder v1.42
Client Scripts: Fill with AI v1.36 + Sales Orders Create onLoad v1.36

INSTALL:
1. CRM > Setup > Developer Hub > Widgets: replace current AI_Order_Builder widget with AI_Order_Builder_Widget_v1.42.zip. Publish.
2. CRM > Setup > Developer Hub > Client Script: REPLACE existing Fill with AI in Record button onClick code with Fill_with_AI_BUTTON_v1.36.js. Save/publish.
3. REPLACE existing Sales Orders Standard Create page onLoad code with Sales_Orders_CREATE_onLoad_v1.36.js. Save/publish.
4. Do not add duplicate client scripts. Close old Sales Order tabs and reopen them. Check Widget footer Version 1.42.

FUNCTIONS:
- Create with AI, Find Products by UPC/SKU/Name or CRM Brand, fill native Sales Order inventory subform.
- Mandatory validation: product, quantity and price required; bad fields highlighted red, action blocked.
- Saved SO editing, supplier code, Offer Product Name and copy from official Product Name.
- CRM brand catalog loaded in COQL batches of 200; ranking errors do not hide catalog products.
- Existing Purchase Order linked line protection, duplicate prevention and final readback checks preserved.

Version 1.39 widget and 1.33 scripts remain as historical rollback snapshots in GitHub.