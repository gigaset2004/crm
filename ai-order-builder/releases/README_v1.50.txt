AI ORDER BUILDER v1.50 RELEASE (2026-11-20)
Includes:
- Widget: decimal POINT only for unit price; no commas, no silent
  fallback or locale comma display. Version 1.50.
- Bridge v1.37: verifies Product, Offer Name, Quantity, Price AND Supplier
  for EVERY row, including row 1. Repairs Supplier missing during Zoho
  native Product Name lookup fallback. Raises error if not confirmed.
- Address: four Create/Edit onChange/onSave Client Scripts that read
  Accounts.Billing_* and Accounts.Shipping_* only. Contacts addresses
  never used. onSave is final source-of-truth enforcement.
- Preserve v1.49 AI Research, official Product Name, HS/COO editor,
  logistics, Supplier bulk assignment, saved SO and other behavior.

INSTALL: See client-scripts/INSTALL.txt for exact Developer Hub setup.
Zoho CRM connector cannot deploy Client Scripts (OAUTH_SCOPE_MISMATCH).
Versions v1.49 and v1.36 are kept for rollback.
