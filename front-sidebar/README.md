# Front Sidebar — source and live snapshot

This folder contains the Front sidebar application source, server code and publishing instructions, plus the previously saved `live-v1.9/` snapshot. The source was copied from the local project on 2026-11-10; before publishing, verify it matches the running server and account for any later changes.

- `src.js` and adjacent modules: editable sidebar source and tests.
- `public/`: current bundled frontend and PHP backend, including access-control files.
- `publisher/README.md`: Google Cloud publishing workflow and operational history.
- `live-v1.9/`: the prior public frontend snapshot retained unchanged.

Configuration files, credentials, sessions, local backups, and installed dependencies are deliberately excluded. Restore dependencies from the lockfile and configure secrets separately. Never commit credentials. Review the publisher instructions carefully: some entries are historical and do not authorize copying a Front API token to WPX.
