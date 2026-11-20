# Accounting Payment Reminders — Zoho CRM + Front

Current versions: November 19, 2026.

## How it works

When an Accounting invoice is due, we email the customer from accounting@minmaxdeals.com in the original Front conversation and attach the current Invoice.pdf from Zoho CRM.

We send up to five reminders: the first on the due date, then every two business days (0, 2, 4, 6 and 8 working days overdue). Each email is more direct. After each email, Front gets a short private comment: "Reminder 1 of 5" through "Reminder 5 of 5". The CRM dispatch log prevents duplicate messages.

After reminders 1–4, the Front conversation is snoozed in the Accounting inbox until 8:00 AM Miami time two business days later. A customer response can reopen the conversation sooner.

After the fifth reminder, the conversation moves to the Sales inbox, is assigned to the Sales Order Owner, and stays Open. It is not snoozed again. The final email asks the customer to contact their Sales Manager about payment and next steps. Sales decides what to do. The system does not add an ON HOLD tag or automatically put the order on hold.

Payment reminders stop once the invoice is paid, the order is canceled, or five reminders have been sent. The existing Overdue tag is maintained where applicable.

## Functions

- `functions/Accounting_Payment_Reminders_Daily_v1.3.1.deluge` — invoice checks, five email templates, PDF attachment, dispatch log, Front reply and private comment.
- `functions/AccountingReminder_FrontAfterSend_v1.1.1.deluge` — Snooze and final Sales handoff.
- `functions/FrontSalesOrderTags_v2.3.deluge` — existing Front tag/assignment sync and protection against sending a final-reminder conversation back to Accounting.

## Activation

The main function is currently in TEST MODE (`sendEnabled = false`). Production automatic sending and the 8:00 AM Zoho Schedule have not yet been enabled. The scheduling arrangement must be configured before launch.
