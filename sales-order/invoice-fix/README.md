# Sales Order — invoice sending repair (PENDING MANUAL INSTALL)

Source: current live Zoho CRM `automation.SalesOrder` (function ID `4888374000129079057`).

## Status

**NOT deployed to Zoho CRM.** Connected Zoho function uploader rejects the complete source (HTTP 400 due to request size). Use the Zoho CRM Function editor to review and install the full `SalesOrder_invoice_multipart_fix.deluge` only after making a backup of the current function.

## Minimal changes

- Add `content-type:"multipart/form-data"` to all three Front `invokeurl` calls that carry an `Invoice.pdf` file attachment.
- Protect switching between deposit/full invoice modes if an existing QBO-linked Accounting request is for a different amount.
- Block sending the deposit PDF if the existing Accounting payment request differs from `Deposit_required`.

Other code is retained. Do not reset Email_Dispatch_Locks until the Front sent-mail history is independently checked.

## Example affected record

SO `4888374000132396005`: Grand Total 41 USD, deposit 20% = 8.20 USD. Existing Accounting `4888374000132254478` references QBO invoice `64776` for 41 USD. Locks for `:invoice` and `:deposit` have `Send_Status=Claimed`. Do **not** resend or change QBO amounts blindly.
