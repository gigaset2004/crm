# Front Sidebar — source and live snapshot

This folder contains the Front sidebar application source, server code and publishing instructions, plus the previously saved `live-v1.9/` snapshot. The source was copied from the local project on 2026-11-10; before publishing, verify it matches the running server and account for any later changes.

- `src.js` and adjacent modules: editable sidebar source and tests.
- `public/`: current bundled frontend and PHP backend, including access-control files.
- `publisher/README.md`: Google Cloud publishing workflow and operational history.
- `live-v1.9/`: the prior public frontend snapshot retained unchanged.

Configuration files, credentials, sessions, local backups, and installed dependencies are deliberately excluded. Restore dependencies from the lockfile and configure secrets separately. Never commit credentials. Review the publisher instructions carefully: some entries are historical and do not authorize copying a Front API token to WPX.

## Live release — 2.0 (2026-11-10)

Production now loads `app-2.0.js` (the preserved v1.9.4 bundle with a conversation-context bridge), `app-2.0.1.js` (the new tabs), and `style-2.0.css`. The existing Information Lead/Contact functionality is preserved. SO, PO and Shipments appear when linked to the current Front Conversation ID; available Zoho Blueprint transitions open inline forms with required fields and explicit user confirmation.

The server action handlers in `public/zoho.php` validate the Zoho user session, module, exact Front Conversation ID linkage, transition availability, and required field inputs before executing an API transition. No CRM records were modified for release testing.

Existing connected users must click **Reconnect Zoho** to authorize the new SO/PO/custom UPDATE and COQL scopes. Front sidebar UI and real Blueprint writes still require an interactive acceptance test in Front; backend and static tests alone do not establish that.

The pre-release SHA-256 manifest confirmed exact server parity for the five preexisting v1.9 files, including PHP. Production releases and validation are documented in `publisher/README.md`. The original `live-v1.9/` snapshot remains unchanged.

## Version 2.0.1 — Blueprint buttons, owner editing, Shipment type (2026-11-10)

- Current manual Blueprint transitions appear as a footer button row, ordered by Zoho `sequence`, using `color_code` and `text_color_code` directly from the Blueprint API. Choosing a button opens an inline form styled like the Lead/Contact creation form (Save/Cancel); no transition is run without confirmation.
- SO/PO/Shipment Owner selectors display the full name resolved from the already authenticated `users` endpoint. Changing an Owner is supported for each linked CRM record, validates an active user and exact Front Conversation ID, verifies the prior owner ID, and confirms the change via Zoho readback.
- Shipment Type displays in the card's upper-right corner, using the exact existing Zoho Shipment_Type picklist colors verified on this date: Inbound #67c480, Dropship #af38fa, Outbound #f27e22, Direct Shipment #168aef. Shipment status remains visible on the next line.
- Node and PHP tests passed: Cloud Build `427ac2ce-2258-427b-a025-c0760f966a3d`. Published through existing Cloud Run publisher in two releases: assets `ce7ab596-7c76-42d5-bfa2-11564359fa75` and backend/index `83d8da0f-076b-4bf7-bcd9-9fb407bb9992`. Live page reports Version 2.0.1, health works, and unauthenticated owner writes are blocked. No actual CRM record was changed for testing.
- Live authenticated user interaction remains to be checked inside Front; the deploy and unauthenticated checks do not constitute end-to-end Blueprint/Owner write verification.
