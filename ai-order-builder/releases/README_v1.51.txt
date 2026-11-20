AI Order Builder v1.51 / Client Scripts v1.38 — 2026-11-20

WHY COO AND HS DISAPPEARED
Native Sales Orders Client Scripts v1.37 did not include HS_Code and
Country_of_origin in the snapshot of current form rows, their parse
function, new-row writes or readback checks.
The saved SO COQL fallback also omitted these two fields.
Widget reopen therefore showed HS: — and COO: — despite values in CRM.

FIXED
- v1.38: BOTH existing Client Scripts now carry and verify both fields.
  No third/fourth Client Script is needed.
- Native row creation, Product lookup fallback, edited rows, and
  verification include HS/COO.
- v1.51 widget restores missing metadata from linked CRM Products,
  without overwriting line values or manual edits.
- SavedOrderSync now queries, writes, and confirms HS/COO on saved SOs.
- OAuth: browser sessionStorage may be recreated with the widget iframe.
  Store the short-lived (14-minute) token in same-origin localStorage as
  a fallback, with expiry/401 cleanup. It prevents frequent repeat
  authorization during the valid token lifetime, but a long-lived
  no-consent session needs a backend OAuth refresh-token implementation.
- All v1.50 quantity, supplier, decimals and official name behavior kept.

INSTALL
1. Replace existing Widget ZIP: AI_Order_Builder_Widget_v1.51.zip.
2. Replace exactly two existing Zoho CRM Client Scripts:
   Button 'Fill with AI in Record' -> onClick:
      Fill_with_AI_BUTTON_v1.38.js
   Page 'AI Order Fill Products' -> onLoad:
      Sales_Orders_CREATE_onLoad_v1.38.js
3. No extra Client Scripts. Existing onSave / onChange scripts are NOT
   a requirement for this release. Account-only invoice address policy
   requires a separate server-side rule and is not part of this fix.

TEST
- Open unsaved SO containing 2 matched CRM Products with HS and COO.
- Reopen widget: both metadata fields should display.
- Fill Sales Order and confirm fields appear in native SO.
- Reopen widget again; metadata still there.
- Test after <14 min; if third-party storage is enabled the cached AI
  session should avoid a repeated popup.
- Test a server-expired token: reauthorization may still be required.

Connected Zoho CRM Client Script API scope is insufficient to deploy
script changes automatically, so install via Developer Hub.
