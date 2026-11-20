AI ORDER BUILDER v1.55 / CLIENT SCRIPTS v1.40
Release date: 2026-11-20

INSTALL:
1. Upload AI_Order_Builder_Widget_v1.55.zip to the existing AI Order Builder widget.
2. Replace the existing Sales Orders Create-page Fill with AI button onClick
   with the complete client-scripts/Fill_with_AI_BUTTON_v1.40.js.
3. Replace the existing Sales Orders Create-page onLoad AI Order Fill Products
   with the complete client-scripts/Sales_Orders_CREATE_onLoad_v1.40.js.
4. Reopen the widget, verify Version 1.55, and run Extract and match again.

No additional Client Scripts are required. Client Scripts cannot be installed
through the connected API because it returns OAUTH_SCOPE_MISMATCH.
Updating only the widget ZIP cannot remove a native Client Script alert.

WHY COO WAS STILL EMPTY:
- The standard server cache used UPC alone. A different retry product title
  therefore returned the same previous empty COO without another web search.
- The broad customs query spent effort on HS even when that code was already
  populated, and failed to establish origin on exact-size product sources.
- Valid origin evidence was rejected when its page differed from the selected
  primary name/UPC source, even if that origin page showed the same exact UPC.

FIX:
- Explicit customs research mode and an independent mode/UPC/title/field cache.
- Only genuinely missing fields are requested. An incomplete requested field
  is not cached. The supplier title preserves size/variant as a search hint.
- Focused country searches include multilingual manufacturing labels and
  exact-variant source scope. UPC and product-specific evidence guards remain.
- A separate origin page can now prove identity through its own literal exact-UPC
  quotation, matched to the researched dossier and the same origin-source URL.
  Missing, mismatched, unsearched or sibling-product proofs are still rejected.
- Unresolved conflicting origin evidence leaves COO blank with a diagnostic.
- No UPC-specific country mapping, predetermined product page or automatic
  overwrite of existing Product customs fields.
- Optional research is bounded to 75 seconds for the second pass.
- HS/COO remain optional, with the existing red hints and transparent pencils.
- Both v1.40 scripts treat normal widget_closed cancellations as silent.
  Real errors remain visible; order-transfer logic is retained.
- Diagnostic filename/report version now matches 1.55 and includes optional
  customs fields, search mode, cache state and field-validation reasons.

LOCAL VERIFICATION:
- 74 backend tests: original behavior, HTTP contract, requested fields,
  cache separation, exact-UPC/source safeguards and conflict rejection.
- Widget integration: COO only, HS only and both fields; exact UPC plus size
  hints, confirmed readback, optional missing values and retained existing data.
- Both Client Scripts: normal and wrapped close, genuine errors, successful
  Supplier/decimal price/HS/COO transfer.
- Diagnostic optional/manual values and safe event fields.
- Widget ZIP: all eight entries CRC-checked and matched to source snapshot.

LIVE SERVICE VERIFICATION AND DEPLOYMENT:
The deployed service reports research version 1.55-customs.1.
Health check passed after switching traffic to the tested release; existing
runtime settings, secret references, resource limits and identity are retained.
Standard research uses its existing model; only the optional customs search
uses the stronger model already configured for order extraction.

A real public lookup using the exact widget request confirmed:
- UPC 3614274101584, Helena Rubinstein Replasty Age Recovery Night Cream.
- COO France, supported by the actual package label with the same barcode:
  https://i.ebayimg.com/images/g/a94AAeSwY3xqM5xS/s-l1600.webp
- 52,741 ms, two customs passes, cache_hit=false.
- The negative example was unconfirmed and received no country.
No country was manually written to CRM during this check.
The native Zoho UI awaits installation of the widget and two Client Scripts;
normal closing and order transfer were tested using the actual scripts with
an SDK test harness.

Previous widget and Client Script versions remain archived unchanged.
