# Sales Order — CRM code

## Main function

**[SalesOrder](SalesOrder/README.md)** — production Deluge function for sales order invoice dispatch, payment confirmations, QuickBooks syncing, and Front handoff.

Current version: **v3.0.0 — 2026-11-15**.

- [Current production source](SalesOrder/CURRENT.deluge)
- [Release history](SalesOrder/CHANGELOG.md)
- [Immutable version snapshot](SalesOrder/versions/v3.0.0.deluge)
- [Previous production backup](SalesOrder/archive/pre-v3.0.0-2026-11-15.deluge)

## Historical invoice repair working files

[invoice-fix](invoice-fix/) holds earlier repair drafts and diagnostics. Those files are **not** the canonical current production source; the canonical source is `SalesOrder/CURRENT.deluge`.

The function remains named `automation.SalesOrder` in Zoho CRM; only the version marker/description changed in release v3.0.0.
