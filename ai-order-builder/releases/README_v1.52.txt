AI Order Builder Widget v1.52 / Client Scripts v1.39 — November 20, 2026.

- Brand-aware offer name now ignores straight/curly/missing apostrophes,
  capitalization, Unicode accents and punctuation while enforcing a
  word boundary. Kiehl’s, KIEHL'S and Kiehls are one brand.
- Linked official CRM Product Name and UPC are never replaced by the
  supplier's offer text.
- ProductEnricher gets a narrow, vendor-corroborated COO France
  fallback for Helena Rubinstein Replasty Age Recovery Night Cream,
  UPC 3614274101584 only. Checks CRM fields first, writes only empty COO,
  re-reads and confirms; packaging is final authority for customs.
- Other optional metadata research is interrupted after 45 seconds
  rather than blocking form import for many minutes.
- Both native Client Scripts silently dismiss the ordinary
  widget_closed event. Real SDK and update failures remain visible.
- The successful v1.51 product matching, Supplier verification,
  HS/COO transfer, decimal dot pricing and order logic are retained.

MANUAL INSTALL: see ai-order-builder/client-scripts/INSTALL.txt
