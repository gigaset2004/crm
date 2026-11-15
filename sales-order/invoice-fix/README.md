# Historical SalesOrder invoice repair files

**Current production version:** [SalesOrder v3.0.0](../SalesOrder/README.md), dated 2026-11-15.

## File status

| File | Meaning |
| --- | --- |
| [SalesOrder_LIVE.deluge](SalesOrder_LIVE.deluge) | Legacy path, synchronized with published **v3.0.0** for compatibility |
| [SalesOrder_before_fix.deluge](SalesOrder_before_fix.deluge) | Older pre-repair reference backup |
| [SalesOrder_invoice_multipart_fix.deluge](SalesOrder_invoice_multipart_fix.deluge) | Earlier **uninstalled draft** containing additional changes; do not treat as production |

The canonical current file is **[../SalesOrder/CURRENT.deluge](../SalesOrder/CURRENT.deluge)**. Frozen version snapshots and history are in [../SalesOrder](../SalesOrder/README.md).

## Deployed fix, 2026-11-15

The published function corrects how Front multipart sends represent multiple CC addresses. It uses separate indexed fields `cc[n]` rather than passing an entire list as one `cc[]` value. The fix covers deposit, regular and balance invoice routes.

A live deposit invoice was confirmed accepted by Front, with CRM statuses and dispatch lock updated accordingly. Other routes were modified but not separately live-tested.

## Caution

The separate `SalesOrder_invoice_multipart_fix.deluge` draft also proposes an explicit multipart content-type and Accounting/QBO amount consistency checks; those extra changes **are not installed** in the published function. Review and test them separately if needed. Never reset claimed email dispatch locks without independently checking sent-mail history in Front.
