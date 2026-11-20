AI Order Builder v1.48 — 2026-11-20
Issue: Text input: product research ran (HTTP 200) but three products stayed Not Found because official manufacturer evidence was missing. Authorization popup occurred repeatedly after reopening the widget.
Changes:
- Cache short-lived service token in browser sessionStorage (same browser tab) until 14-minute expiry; clear on HTTP 401. OAuth consent after expiry or outside same tab requires backend authorization refresh support.
- Infer a missing CRM brand from known brand-name prefix; fallback aliases for Kiehl's and Clé de Peau Beauté.
- If official evidence not found on first research, perform a second manufacturer-focused global/regional research query; the UPC must stay exact and official manufacturer brand-domain evidence must verify the returned name. Unverified products remain in review (no guessed CRM titles).
- After manufacturer verification, create missing Brand only after checking CRM again, then create product automatically. Do not create duplicates.
- Keep v1.47 prices, quantities, offer-name handling, row styling, and client scripts.
Diagnostics sample: UPCs 729238161825 / 3614274101584 / 3605973023352 were researched but not confirmed in service evidence; these require new official-site results before creation.
Test import in a NEW Sales Order. No CRM writes were performed by this release process.
