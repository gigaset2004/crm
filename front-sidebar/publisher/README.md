# Front app remote publisher

Application: https://minmaxdeals.com/front-app/index.html
Google Cloud project: `minmaxdeals-crm-email` (67003629024).
Cloud Run Job: `front-app-publisher`, region `us-east1`.
Runtime identity: `front-app-publisher@minmaxdeals-crm-email.iam.gserviceaccount.com`.

The job reads only these Secret Manager entries: `front-sftp-host`,
`front-sftp-port`, `front-sftp-username`, `front-sftp-password`.
Do not read or display their values in chat, command output, or logs.
The job has no public HTTP endpoint and runs only on demand.
Zoho secrets are not used by this publisher.

## Pending participant history fix (2026-10-15)

2026-10-24 latest deployed patch: exporters.sg excluded alongside minmaxdeals.com
from SDK participant collection (From/To/CC/BCC), server roster filtering,
CRM lookup and creation. Exact domain comparison, case-insensitive through
existing email normalization; similar domains remain eligible. No CRM records
or messages deleted. Asset app-1.9.4.js, footer Version 1.9. Release
5c87336b-578d-4190-8d4a-06a0f3bb47be, execution front-app-publisher-29gmx.
12 Node tests pass, PHP syntax checked (60c4f5ce-52c4-4515-82ee-6a0694d18ae9),
live index and JS hashes confirmed. Other email-monitoring services were not
modified; this exclusion applies to the Front sidebar application.

2026-10-21 latest deployed patch: Customer Account is optional for Contacts as
well as Leads, on client and server. Vendor and Logistics requirements remain
unchanged. Asset app-1.9.3.js, footer Version 1.9. Release
bf31071f-ed16-423a-acd3-aaace209d2ff, execution front-app-publisher-ztwxt.
12 Node tests and nine PHP create-relation scenarios pass; full PHP syntax
checked (build 79d7c5e5-11da-40c9-9dc1-6f24d8f08f66). Live index and JS hashes
confirmed. No real CRM records were created for testing.

2026-10-19 latest deployed patch: Lead Customer Account is optional on both
client and server. Contact Account, Supplier Vendor and Contact Logistics
requirements are unchanged. Optional Account still validates a selected ID;
unselected search text must be cleared before submission. Asset app-1.9.2.js,
footer Version 1.9. Release ba603580-587f-4716-89c6-fdf05cc8860d, execution
front-app-publisher-6js5l. 12 Node tests pass; five PHP validation scenarios
and syntax check pass (build 06979b8b-90ad-4df7-991c-06bbf511d2a2). Public
index/JS hashes confirmed. No real CRM records were created for this test.

Latest deployed patch: Title inline editing (footer still Version 1.9, asset
app-1.9.1.js). Release 45fd4db5-44f8-4ef9-a29a-131dadca6022, execution
front-app-publisher-tnsqs. Title uses the existing authenticated update action,
accepts empty text or up to 100 characters, verifies CRM readback, and updates
all local copies of a record. 11 Node tests pass; PHP syntax and five mocked
Title-update scenarios pass (build 9d132ad3-e588-4257-8448-9c5a7a1990c1).
Index and JS live hashes verified; unauthenticated update returned 401.
Browser UI test was unavailable due to a browser connection failure; no live
CRM record was changed for testing.

IMPORTANT: Version 1.9 is now deployed (release
c85b2941-c46a-4c6f-aa71-c0f2b37a3c11, execution front-app-publisher-85z5p).
Its src.js sets completeHistoryEnabled=false: whole-history mode is NOT active.
The explicit request to store the Front API token on WPX was not approved;
install_front_token was blocked and never executed. Do not retry without that
specific consent. FRONT_API_TOKEN was removed from job secret mounts. The
dedicated identity still has its approved secret-level IAM grant.

Current publisher image: publisher:v4, supports payload chunks PAYLOAD_B64_0
through PAYLOAD_B64_7 (concatenated in order). Use --update-env-vars overrides;
the connector does not support --flags-file. Default job action remains probe.

Version 1.9 includes Customer Title when available, all scalar CRM email values,
soft Broker color, debounced inline relation search, and relation editing.
Account/Vendor are single-lookup links; Provider preserves a multiple-provider
selection and applies additions/removals via linking record IDs. Writes require
Save, validate current CRM type and expected relation IDs, use
If-Unmodified-Since and read back the saved links. Lead Logistics is not added.
10 Node tests and 3 publisher validation tests pass. PHP syntax and six mocked
relation-update scenarios pass (build fadd4b42-3eba-46e1-8fa8-d8a20db9848e).
UI Account/Provider saves were tested against fictional local fixtures, NOT
real CRM records. Live index, app-1.9.js and style-1.9.css hashes were confirmed;
unauthenticated participants/relation_update requests returned 401.

The following historical preparation notes do not authorize publishing 1.8.1:

Local version 1.8.1 replaces SDK-visible messages with the authenticated
`zoho.php?action=participants&conversation_id=cnv_...` endpoint. That endpoint
follows all Core API message pages, returns recipients only, and caches a
complete roster for 120 seconds. No partial roster is accepted by the client.
Local Node tests: 8 passing. Publisher validation tests: 3 passing.

User approved use of the existing `front-api-token` secret on WPX. The new
publisher actions `install_front_token` and `verify_front` expect this secret
as FRONT_API_TOKEN. It must never be sent as a command literal or printed.
It is installed as .zoho-private/front-token.php with mode 0600 and a PHP guard.
No existing CRM config or session files should be overwritten.

Not yet published: IAM secret access grant is blocked on Google Cloud browser
passkey reauthentication. Cloud Build ab01ee90-24ad-4edd-8c90-ca2e1c291dc9
builds publisher:v3 and lints zoho.php. After verifying success, grant only
front-api-token secretAccessor to the dedicated publisher identity, update job
image and secret reference, execute install_front_token, then publish only
zoho.php, app-1.8.1.js, index.html. Keep default ACTION=probe. Run verify_front
to confirm rf@rftradingalliance.com and r.ferraz@doctorskinonline.com across
all messages of cnv_1gsaz26q. Check public asset and unauthenticated endpoint
response. Do not claim the live UI is verified without opening it in Front.

## Actions

Default `ACTION=probe`: connect and stat index.html and zoho.php, no writes.
`ACTION=write_probe`: create a unique temporary file, verify its contents,
test atomic rename, and remove it. Does not edit application files.
`ACTION=publish`: requires PAYLOAD_B64, a base64-encoded gzip JSON object:
`{"files":[{"name":"app-1.8.js","content":"BASE64_BYTES","sha256":"HEX_SHA256"}]}`.
See publisher.py for the exact allowlist. Never send secrets in the payload.

Execute with per-execution environment overrides rather than persisting payload
or changing the default probe mode. Test locally before publishing. The job
backs up replaced files and publishes index.html last. Verify actual public
responses after any publication. The runtime cannot return remote source files;
another computer needs the current source separately before editing it.

Local source lives in the parent front-sidebar directory; sources/ in the
project mirror is read-only. New chats must independently verify job settings,
authorization, deployed version, and availability of current source. Do not
claim publishing worked based only on a successful read-only probe.
