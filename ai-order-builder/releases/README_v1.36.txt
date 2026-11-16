AI ORDER BUILDER - SALES ORDERS CREATE PAGE BRIDGE v1.36
2026-11-16

PROBLEM
- The error "v1.34 | verify Product Name..." proves that the v1.34 Client Script is still executing.
- The original code inserted Ordered_Items by ZDK.Page.getField(...).setValue() and then checked that same field immediately. On the native SO inventory subform, this may leave an empty product lookup or read an outdated snapshot. The staff CRM profiles have Products VIEW and Sales Orders CREATE/EDIT permissions.

FIX v1.36
- For an empty Sales Order, writes Ordered_Items using ZDK.Page.getSubform('Ordered_Items').setValues() first.
- Reads the inventory through the native Subform.getValues() before the generic Field.getValue(); compares both snapshots.
- If Zoho drops the Product_Name lookup in a brand-new SO, retries on the specific empty row with getRow(i).getCell('Product_Name').setValue({id,name}).
- Removes only extra completely empty native template rows, without deleting partially edited or PO-linked items.
- Verifies both Product Name and Offer Product Name; never returns success when verification actually fails.
- Keeps all previous reconciliation, duplicate, linked PO protection, quantities, prices, supplier/UPC/brand, status, and error messages.

INSTALL - BOTH CLIENT SCRIPTS REQUIRED
1) Zoho CRM -> Setup -> Developer Hub -> Client Script.
   Find the EXISTING 'Fill with AI in Record' custom button onClick script
   (Sales Orders -> Standard Create page; custom button 'Fill with AI').
   Replace its WHOLE body with Fill_with_AI_BUTTON_v1.36.js. Save/publish.
2) Find the EXISTING Sales Orders -> Standard Create page -> onLoad script.
   Replace its WHOLE body with Sales_Orders_CREATE_onLoad_v1.36.js. Save/publish.
3) Do NOT create duplicate client scripts, and do NOT replace the widget
   if AI Order Builder widget v1.41 is already installed.
4) Close old CRM Create tabs, reopen Create with AI, select one product,
   click Fill Sales Order. Check Product Name and Offer Product Name are
   both present before Zoho Save.
5) If any error STILL says v1.34 or v1.35, the old script is still active
   or another duplicate button/onLoad Client Script is running.

VALIDATION
- Node.js syntax checks for both JavaScript files passed.
- 10 mock SDK regression scenarios passed (one product, cached field,
  rejected lookup with cell repair, dropped offer, native blank template,
  real write failure, multiple products, existing product append, no price,
  PO-linked row protection).
- Not yet validated in an actual employee browser/session; user must test.
- Connected Zoho CRM plugin cannot retrieve or update Client Script code:
  OAUTH_SCOPE_MISMATCH. No CRM scripts were modified remotely.

KEEP
- AI Order Builder widget v1.41 and its Excel mandatory Qty/Price checks.