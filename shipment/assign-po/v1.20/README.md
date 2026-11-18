# Assign PO v1.20

Shipped Products columns in Zoho CRM were updated directly in the `Shipped_Products` layout to:

1. UPC
2. Brand
3. Product (official CRM name)
4. Offer Product Name
5. Purchase Order
6. Qty (`Plan_Qty` API field)
7. Logistics Status

Unused `Inventory_ID`, `Claim`, `Shipping_Costs`, `Source_PO_Item_ID` were moved to Unused Fields without permanent deletion. `Fact_Qty` was already unused.

Widget source no longer relies on the removed Source PO Item ID column. Repeat-safe synchronization matches the pair `(Purchase_Order, Product)` and preserves multiple occurrences. Existing rows and logistic details are never overwritten; missing rows are appended and quantities are left unchanged. Source-name, brand, UPC and offer title remain separate fields.

`CreateShipmentFromPOs` function v1.2 removes the write to unused `Source_PO_Item_ID`; all other behavior is preserved. Deployment: CRM function is live; widget ZIP must be uploaded to the Zoho widget separately.
