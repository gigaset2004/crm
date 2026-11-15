# Purchase Order — Offer Product Name

**Deployed to Zoho CRM on 2026-11-15.**

- Added `Purchase_Items.Offer_Product_Name` (text, 255 chars), field ID `4888374000132391005`.
- Updated `procurement_create_po` and `procurement_add_to_existing_po` to copy Offer Product Name from selected Sales Order items, with official product lookup name as fallback.
- Updated inventory template `Purchase Order` (ID `4888374000000343121`) to show Offer Product Name and smaller official product name for historical records.
- Updated SO invoice template `Invoice` (ID `4888374000000343119`) to retain the mandatory product merge tag hidden while keeping Offer Product Name visible.
- Existing Purchase Orders were not mass-updated. New POs have Offer field populated by the two backend functions.

Invoice sending fix is available separately but is NOT deployed to CRM.
