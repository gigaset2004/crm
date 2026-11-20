AI Order Builder v1.54 — 2026-11-20

Fix: the second optional POST /v1/research was rejected as HTTP 400 immediately.
The v1.53 widget sent research_focus and require_field_sources properties in each
product. The Cloud Run service's strict research request contract expects only
key, identifier and product_name. v1.54 passes that supported structure and puts
the country-of-manufacture search hint in the supported product_name string.

UI:
- Missing HS / COO each receive a small red border, like the price warning.
- HS and COO are still OPTIONAL and never block Fill Sales Order.
- Edit pencils have no rectangular background/border and are smaller.

Installation:
1. Upload AI_Order_Builder_Widget_v1.54.zip to Developer Hub > Widgets > AI Order Builder.
2. Reopen and check the footer says Version 1.54.
3. Do NOT reinstall Client Scripts: leave the two existing v1.39 scripts.

Regression test: any matched Product with missing HS/COO now sends a supported
second research request. Web research and verified source extraction remain
subject to the Cloud Run AI service. Correct country is NOT guaranteed without
corroborated source evidence; no static UPC/country overrides were added.

The HTTP 400 was supported by the November 20 Cloud Run request logs, request
b6cec473336042768ce25bcb6d380c88. Unit tests simulate the strict request
schema and verify optional field highlighting. Live UI re-test is needed.
