# SalesOrder (Zoho CRM)

**Current version: v3.0.0** (2026-11-15)  
**Zoho function:** `void automation.SalesOrder(String salesOrderId)`  
**Function ID:** `4888374000129079057`  
**Category:** Automation  
**Environment:** Production / Zoho CRM  
**Runtime:** Deluge 1.0  

## Where is the real code?

| File | Meaning |
| --- | --- |
| [CURRENT.deluge](CURRENT.deluge) | Exact copy of the currently published function at the time of the release |
| [versions/v3.0.0.deluge](versions/v3.0.0.deluge) | Frozen v3.0.0 release |
| [archive/pre-v3.0.0-2026-11-15.deluge](archive/pre-v3.0.0-2026-11-15.deluge) | Production code immediately before the version marker |
| [CHANGELOG.md](CHANGELOG.md) | Changes by release |

## Function routes

The single `SalesOrder` function uses `Sales_Orders.Accounting_status` and linked Accounting records to select a route.

| Route | Purpose |
| --- | --- |
| `request_deposit` | Prepare/reuse Accounting deposit request; Accounting workflow handles QBO and dispatch |
| `request_full` | Prepare/reuse full invoice request through Accounting workflow |
| `deposit` | Send deposit invoice PDF and message through Front |
| `invoice` | Send full invoice PDF and message through Front |
| `remainder` | Send remaining balance invoice through Front |
| `deposit_received` | Send deposit payment confirmation |
| `payment_received` | Send final payment confirmation |
| `sync_qbo` | Synchronize eligible QBO invoice totals |

The function is also invoked by Sales Order Blueprint and Accounting automation. **Do not rename its function signature or argument** without updating all dependencies.

## Versioning convention

- `vMAJOR.MINOR.PATCH` is used in source comment, startup `info` log, Zoho function description, and GitHub.
- Before any change, save the old code under `archive/` or a frozen `versions/` entry.
- After a tested Zoho deployment, update `CURRENT.deluge`, write an immutable `versions/vX.Y.Z.deluge` snapshot, and add a changelog entry.
- GitHub files are backups/reference; the published Zoho CRM function is the authoritative executable source.
- Version log at startup: `[SalesOrder] VERSION 3.0.0`.

## Safety

All invoice methods have duplicate-send protection via `Email_Dispatch_Locks`. Do not clear a claimed lock without checking the actual Front sent-message outcome. Secrets are stored in CRM connections and variables; never commit OAuth tokens or credentials.
