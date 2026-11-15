# AI Order Builder for Zoho CRM

Latest working configuration (confirmed in live CRM on 2026-11-15):

- **Widget:** v1.39 (saved SO edit, clean messages, auto refresh after Save SO Products)
- **Client Scripts:** v1.33 (Fill with AI in Record + AI Order Fill Products)

## Download / Install

Use the packaged files in [`releases/`](releases/):

1. Upload `AI_Order_Builder_v1.39_CLEAN_AUTO_REFRESH.zip` via **Zoho CRM Developer Hub → Widgets → AI Order Builder → Edit**.
2. In existing Client Script **Fill with AI in Record**, replace code with `client-scripts/Fill_with_AI_BUTTON_v1.33.js`.
3. In existing Client Script **AI Order Fill Products**, replace code with `client-scripts/Sales_Orders_CREATE_onLoad_v1.33.js`.
4. Leave **Sales Order Subject** unchanged.
5. Existing CRM button **Fill with AI** on saved Sales Order detail page must remain configured with widget `AI_Order_Builder`; edit mode is restricted to `Requested`.

### Important

- v1.33 Client Scripts are the last working version. Do not replace with experimental v1.30–v1.32.
- v1.39 widget loads existing `Ordered_Items`, allows quantity, price, Supplier and Offer Product Name edits; adds/removes products, then closes/reloads the Sales Order after verified save.
- Existing rows linked to PO are protected.
- Original widget ZIP root contains `plugin-manifest.json` and `app/`.
- Check out [`releases/CRM_AI_Order_Builder_WORKING_v1.39_ALL.zip`](releases/CRM_AI_Order_Builder_WORKING_v1.39_ALL.zip) for a full local backup.

These files are snapshots of the tested working installation. Do not push local service tokens or credentials.
