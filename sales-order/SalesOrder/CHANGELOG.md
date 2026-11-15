# SalesOrder changelog

## v3.0.0 — 2026-11-15 — Production

- Established an explicit, human-readable version reference at the top of the live `automation.SalesOrder` function.
- Added an execution-log marker: `[SalesOrder] VERSION 3.0.0`.
- Added `SalesOrder v3.0.0 (2026-11-15)` to the Zoho function description.
- No business logic changes in this version: verified that removing the version comment/log from v3.0.0 yields the previous published source byte-for-byte.
- Published source backed up to `CURRENT.deluge` and `versions/v3.0.0.deluge`.

### Fix included from preceding live revision (2026-11-15)

- Front multipart message CC email fields corrected in regular, deposit and balance invoice paths: one indexed `cc[n]` field per CC recipient.
- Deposit invoice sending verified end-to-end with Zoho status update and Front acceptance.
- Regular and balance paths contain the fix, but were not separately confirmed by live sends in the original fix session.

## Pre-v3.0.0 — 2026-11-15 — Archived

- Prior production source preserved under `archive/pre-v3.0.0-2026-11-15.deluge`.
- Historical draft code and notes remain under `../invoice-fix/` for reference; the draft contains changes not deployed to production.
