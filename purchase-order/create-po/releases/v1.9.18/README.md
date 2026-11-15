# Create PO — unified release v1.9.18

Release contains the original widget, updated widget, and published Deluge function.

## Files

- `widget-before/Create_PO_v1.9.17_original.zip` — **original uploaded widget**, unchanged (rollback).
- `widget-after/Create_PO_v1.9.18_Owner_Fix.zip` — updated Zoho CRM widget.
- `functions/Procurement_Create_PO_v1.9.18.deluge` — published standalone function from Zoho CRM (function ID `4888374000129888132`).

## Changes in v1.9.18

Create PO now captures the logged-in CRM user and passes their ID to the server. The Deluge function assigns that user to the `Owner` field **at PO creation**; the creator/Created By remains the OAuth function owner. Prior routes for splitting sales-order lines, listing POs, and appending to existing POs remain supported.

## Installation

The Deluge function has already been updated in Zoho CRM. Install the **widget-after** ZIP in Zoho CRM > Setup > Developer Hub > Widgets > Create PO. Keep the **widget-before** ZIP as rollback.

## Verification

The `Requested` Blueprint transition and outgoing Front message for PO `4888374000132255472` were observed, with PO Owner `Anastasiia Hrudii`. Actual email delivery to the recipient has not been independently confirmed. This repository snapshot does not modify the Blueprint's Transition Owners configuration.

All files are grouped under a single release directory `v1.9.18`.
