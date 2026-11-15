# Sales Order — invoice sending repair

## Current production version

**Live in Zoho CRM as of November 15, 2026.** The exact published Deluge source has been backed up to [SalesOrder_LIVE.deluge](SalesOrder_LIVE.deluge).

- Function: `automation.SalesOrder(String salesOrderId)`
- Zoho CRM function ID: `4888374000129079057`
- Source of truth: published Zoho CRM function, not this repository.
- Entire function saved, including the existing Sales Order / Accounting / QBO / Front logic.

## Deployed fix

Front multipart CC recipient handling is corrected in all three invoice email paths (deposit, regular, and balance). Each CC address is supplied as a separately indexed `cc[n]` field rather than a list value under `cc[]`.

**Verified:** A deposit invoice was accepted by Front after the update; the related Sales Order and Accounting records changed to `Deposit invoice sent`, and the dispatch lock became `Accepted`. The regular and balance invoice paths were updated but were **not independently live-tested** in this repair session.

## Historical files — do not deploy as current

- `SalesOrder_before_fix.deluge`: source backup from before the CC correction.
- `SalesOrder_invoice_multipart_fix.deluge`: separate earlier **draft**, containing additional uninstalled changes (multipart Content-Type and Accounting/QBO amount consistency checks). Its contents do **not** represent the currently deployed function. Review and test those extra changes separately before any future deployment.

For the latest known live working code in this folder, use **`SalesOrder_LIVE.deluge`**.
