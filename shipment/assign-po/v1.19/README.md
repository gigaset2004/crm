# Assign PO v1.19 — Shipped Products sync

Automatically copies `Purchase_Items` from linked Purchase Orders to the existing Shipment `Shipped_Products` subform. Maps official Product lookup, Offer Product Name, UPC, Brand, PO reference, Plan Qty and source PO line ID. Fact Qty and other logistics fields are preserved. Supports idempotent re-sync and stops before the 100-row subform limit. Built on the previous v1.18 Assign PO widget.

Server-side `CreateShipmentFromPOs` function v1.1 has been extended to fill the same fields when creating a Shipment directly from the PO list. Deployed separately in Zoho CRM.

Do not edit historical versions in this repository; add a new version folder for changes.
