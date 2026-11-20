AI Order Builder v1.53 — 2026-11-20

PURPOSE
Remove product-specific workarounds added in v1.49/v1.52.
No UPC, product title, brand or country is pre-mapped to a customs result.

WHAT IT DOES
- For any new Product: verify its official name and UPC through the normal
  worldwide manufacturer research flow. Do not insert a Product based only
  on the supplier title.
- For any existing/new Product missing HS_Code and/or Country_of_origin:
  run general UPC+brand+official-title research.
- If metadata remains inconclusive, run one short, COO/HS-focused search.
- Write only when matching the exact UPC and nonconflicting brand.
- Country_of_origin additionally requires an HTTPS source attached
  specifically to that field in the AI research response.
- Do not overwrite populated Product customs fields.
- Do not silently fill COO from EAN prefix, headquarters, marketplace
  shipping origin, product-specific hardcoded constants or hallucinations.
- Leave missing COO blank and keep its editable pencil if unverified.
- Keep v1.52 brand punctuation normalization and widget-close behavior.
- Keep Client Scripts v1.39 without changes.

TIMEOUT
Optional customs research = up to 25 sec initial + 20 sec targeted search
per group of five. Product-name identity research is separate.

INSTALL
Replace only AI_Order_Builder_Widget_v1.52.zip with v1.53.zip in
Zoho CRM -> Developer Hub -> Widgets -> AI Order Builder.
Confirm Version 1.53 in the widget footer.
No Client Scripts updates or new scripts.

TEST
Try different brands and UPCs, with existing filled/missing COO:
- Existing COO: not overwritten
- Missing COO + verified identity + field-specific evidence: updated
- No country-of-origin evidence: blank with pencil/manual option
- New official Product Name: still requires official manufacturer source
- Supplier, Qty, Price, Offer Product Name and HS/COO transfer unchanged

LIMITATION
This fix is a generic client-side research/verification workflow; actual
web retrieval depends on the Cloud Run AI Research backend's sources and
field-level evidence. It does NOT guarantee discovering a valid COO for
every product. Live CRM import was not executed in this release.
