# Assign PO v1.21 — Pickup Locations auto-fill

On a PO link, the widget synchronizes `Pickup_Locations` from linked Purchase Orders and Vendors. It copies `Supplier_invoice` into `Pickup_Reference`, supplier and PO as lookups, PO-selected pickup address, and supplier warehouse phone, hours, and pickup notes. Existing manually entered values and Packing List Links are not overwritten. On repeated sync, rows are matched by Purchase Order lookup to prevent duplicates. A single PO Lookup allows one linked PO per pickup row.

`CreateShipmentFromPOs v1.5` is separately deployed in CRM to populate pickup rows when Shipment is created via the PO button.

Install the widget ZIP v1.21 in Zoho CRM; GitHub source updates do not deploy the widget automatically. Source versions are immutable.
