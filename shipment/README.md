# Zoho CRM Shipment Blueprint Widgets

Versioned source code:

- `assign-po/v1.17`: Assign PO to Shipment. Preserves PO linking and handles Blueprint completion followed by Shipment record refresh (`closeReload`).
- `request-info/v1.8`: Request Info. Editable supplier messages through Front, Blueprint completion followed by Shipment record reopen/refresh.

The root `index.html` under each version references that version's local `app.js` and `styles.css`. Keep each version immutable when publishing new iterations.

The related CRM standalone function `shipment_request_info_front` is deployed separately in Zoho CRM and is not included in these widget source files.
