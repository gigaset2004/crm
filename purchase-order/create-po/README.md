# Procurement Workspace / Create PO widget

## Current archived widget: v1.9.22 (2026-11-16)

- **Widget:** v1.9.22 — [source](widget/) | [installation ZIP](releases/v1.9.22/Procurement_Widget_v1.9.22.zip)
- [Immutable v1.9.22 source snapshot](releases/v1.9.22/widget/)
- [Full release notes](releases/v1.9.22/widget/README.txt)

### Install

Upload the v1.9.22 ZIP in **Zoho CRM → Developer Hub → Widgets → Procurement Workspace / Create PO**. Replace only the widget files; the linked Deluge functions do not need changes for this UI release.

### Main changes

- Wide, compact table with separate Brand, UPC, CRM Product Name, Offer Product Name, Supplier, SO Number, SO Qty, PO Qty, PO Unit Cost columns.
- SO Number, Brand, and CRM Product Name links to CRM records.
- Narrow number and supplier columns.
- Visible per-line Copy/Paste price controls and paste-from-Excel price column.
- Product/offer names passed through the existing procurement Deluge functions; v1.9.19 added Offer_Product_Name handling and preserves distinct offer-name rows.

### Dependencies and history

The CRM Deluge backend remains at its separately managed production version (last related updates were v1.9.19). Widget releases are UI packages; installing them alone does not deploy Deluge code.

Previous releases remain unchanged, including [v1.9.18](releases/v1.9.18/) and earlier.
