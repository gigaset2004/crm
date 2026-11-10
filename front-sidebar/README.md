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
