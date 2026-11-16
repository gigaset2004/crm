AI Order Builder - Widget v1.42
Date: 2026-11-16

FIX: CRM Brand Catalog / Search & Add Products
- Selecting a CRM brand (such as DOVE), then pressing Enter, retrieves every matching product from CRM, paged in batches of 200.
- Entering the exact CRM brand name in the UPC/Product name search box also opens that brand's entire product catalog.
- Querying Sales Order quantity statistics is now optional. If the ranking query fails or returns LIMIT_EXCEEDED, products still appear alphabetically and are available for adding.
- Selecting the same brand again with Enter triggers the search. Previously, a re-selection could be ignored.
- Search pagination supports up to 100,000 matching Products via the embedded CRM COQL SDK. If that limit is reached, the widget reports it instead of claiming a complete list.
- Existing Excel import validation, red missing-field alerts, Add, Fill Sales Order, saved SO mode, Offer Product Name copy action, and all other existing code remain unchanged.

INSTALL:
1. Zoho CRM > Setup > Developer Hub > Widgets > AI_Order_Builder.
2. Upload AI_Order_Builder_Widget_v1.42.zip as the replacement widget package and publish.
3. Reopen Create with AI. Check the widget footer: Version 1.42.
4. Search & Add Products > Brand > type DOVE > Enter. The user should see the 26 CRM product rows (as checked on 2026-11-16).

Only the widget package is changed. Do NOT replace your Client Scripts for this fix.

TESTS:
- Locally mocked DOVE 26 products, failed ranking query -> all 26 shown.
- Pagination across 450 products -> 3 calls (0, 200, 400) and all 450 shown.
- Ranking result changes order without clearing selected products.
- Exact brand name in the text search opens the brand catalog.
- Zero products shows a precise empty state.
- Brand re-selection is not ignored.

Live installation and end-user UI validation are still required.