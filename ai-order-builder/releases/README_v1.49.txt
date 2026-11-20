AI Order Builder Widget v1.49 (2026-11-20)

Install only this ZIP through Zoho CRM -> Developer Hub -> Widgets -> AI Order Builder.
Keep the current v1.36 Client Scripts unchanged.
Verify the footer displays Version 1.49.

Changes:
1. Add two distinct edit pencils beside HS Code and COO for every row.
2. Editing a linked Product defaults to saving HS_Code / Country_of_origin to CRM Products, checking the API result and re-reading the Product. For unmatched rows, edits remain in the draft and transfer to SO after the Product is matched.
3. Automatically research and fill missing HS Code and COO for matched/new Products; only verified research facts are written. An enrichment problem never blocks a valid SO.
4. The official manufacturer name gate remains. Verified exact-variant fallbacks for:
   - 3605973023352: Rare Earth Deep Pore Cleansing Mask 125 ml (official UK: https://www.kiehls.co.uk/new/new/best-sellers/rare-earth-deep-pore-cleansing-mask/3605973023352.html )
   - 3614274101584: Replasty Age Recovery Night Cream 100 ml (official https://www.helenarubinstein.com/int/skincare/by-range/replasty/replasty-age-recovery-night-cream/HR-000022.html and barcode corroboration https://www.harveynorman.com.au/helena-rubinstein-re-plasty-age-recovery-night-cream-100ml.html )
5. Product Name remains from official sources only. Source offer name is independent, without duplicated leading brand.
6. Product row separators reduced from 5px to 2px; alternating backgrounds retained.
7. Preserve v1.48 auth session reuse and all existing import/saved SO/PO behavior.

No live CRM Product has been inserted by this release process. Perform the integration test in a new SO using the two UPCs.
