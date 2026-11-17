Procurement Widget v1.9.22 - 2026-11-16

WORKING BASE: v1.9.21. UI only; procurement backend functions untouched.

NEW:
- Brand is an interactive CRM link: click resolves the exact Brands record by name,
  then opens it in Zoho CRM. Lookup is cached; no new metadata fields required.
- Official CRM Product Name opens that Products record by its CRM ID.
- Supplier and # columns are narrower in List and Grouped modes.
- Every editable PO Unit Cost row shows Copy and Paste buttons. Copy holds a
  validated price within the widget and attempts to copy to the OS clipboard.
  Paste accepts that copied price or the system clipboard if supported.
- New Paste Excel Column button opens a visible textarea: paste one price per line
  and click Apply prices. Starts at first selected visible line (or first visible).
  Whole input is validated atomically before applying any prices.
- Ctrl+V / Cmd+V in an individual PO Unit Cost input remains supported.
- SO Number, both name columns, filters, split, supplier selection, existing PO,
  owner handling, and Create PO save flow are unchanged.

INSTALL: Replace only the Create PO/Procurement widget ZIP in Zoho CRM.
Deluge functions and Sales Orders Client Scripts do not need updating.

--- PREVIOUS VERSION HISTORY ---

Procurement Widget v1.9.21 - 2026-11-16

WORKING BASE: v1.9.20. Only presentation of SO number in List view changed.

NEW:
- One-row-per-product List view has a dedicated SO Number column after the short # column.
- The actual Sales Order number is shown on each line and opens that Sales Order on click.
- Grouped view keeps its existing visible SO group heading and does not repeat the number per item.
- Table widths adjusted for the additional column. Mobile cards also show the SO number.
- Both product-name columns, Supplier, quantities, PO Unit Cost paste-from-Excel,
  SO grouping, filters, Split, PO creation and saving logic remain unchanged.
- Server-side Deluge functions and Client Scripts remain unchanged.

INSTALL: Replace only the Create PO/Procurement widget ZIP in Zoho CRM.

--- PREVIOUS VERSION HISTORY ---

Procurement Widget v1.9.20 - 2026-11-16

WORKING BASE: v1.9.19. UI layout and Excel price paste only.

NEW:
- Full-width desktop workspace with 10 clear columns: select, compact line #,
  Brand, UPC, CRM Product Name, Offer Product Name, Supplier, SO Qty,
  PO Qty, PO Unit Cost. Supplier/line number columns narrowed.
- Grouped and flat modes both keep the Sales Order links and accounting status
  (group header / inline flat row details). Split and saved supplier editing remain.
- Paste a copied single Excel column of prices into any PO Unit Cost field:
  prices fill consecutive visible editable rows starting from that field.
  Validation is atomic: wrong values, extra columns and overshooting visible
  lines reject the entire paste. Comma decimals, grouped thousands and $ prefixes
  are supported. Enter moves focus to next visible price input.
- Mobile table cards show the same fields in a readable stacked layout.
- No Deluge changes; server-side v1.9.19 offer-name handling is unchanged.

INSTALL: replace only the Create PO / Procurement widget ZIP.
DO NOT replace the Sales Orders AI Builder or Client Scripts.
Prices are not saved to the CRM until the user confirms a real PO, as before.

--- PREVIOUS VERSION HISTORY ---

Procurement Widget v1.9.19 - 2026-11-16

WORKING BASE: v1.9.18. Preserves all existing functions and owner assignment.

NEW:
- Display both Official CRM Product Name and Customer offer (SO Offer_Product_Name)
  on each procurement row and in the final PO review.
- Keyword search also searches the customer offer name.
- PO Purchase_Items keeps its Product_Name product lookup and stores the SO
  Offer_Product_Name text independently.
- If the SO offer name is empty, widget indicates that it is unspecified;
  the backend retains its existing fallback to the catalog product name.

ZOHO CRM SERVER FUNCTIONS UPDATED (2026-11-16):
- procurement_get_demand: COQL and recovered SO rows include Offer_Product_Name.
- procurement_create_po: combines items only when product, cost AND offer name match,
  so customer-specific names do not overwrite each other.
- procurement_add_to_existing_po: same grouping protection for appended items.
- procurement_split_so_line: copies Offer_Product_Name when splitting a source SO row.

INSTALLED FILES: replace only the existing Create PO/Procurement Web Tab widget ZIP.
The four server functions were updated in Zoho CRM already. No changes to
Sales Orders AI Builder, any Client Scripts, or Blueprint transitions.

NOTE: PO offer name is taken directly from the authoritative SO subform at
creation, not trusted from the browser. No test PO was created as part of QA.

--- PREVIOUS VERSION HISTORY ---

Procurement Widget v1.9.18 - 2026-11-15

FIX: PO Owner = user logged into Zoho CRM and operating this widget.
- Uses official ZOHO.CRM.CONFIG.getCurrentUser() after SDK initialization.
- Passes operator ID to the existing procurement_create_po Deluge function
  through a new __PROCUREMENT_CREATE_FOR_USER__: envelope in linesJson.
- Deluge creates the PO with Owner set at insertion time, before Blueprint entry.
- This requires the accompanying compatible Deluge function revision to be
  deployed FIRST; without it new PO creation will be rejected by the old code.
- Existing PO append, SO split, other function routes, purchase fields, and
  UI flows are unchanged; old clients remain supported by the Deluge function.
- New PO creation fails closed if current CRM user ID cannot be verified;
  it never silently creates under administrator.
- Does not change Blueprint Transition Owners; those permissions must still
  allow the PO Owner (or the operator's role) to execute Request.

Procurement Widget v1.9.15 — 2026-10-26

BASED ON: working v1.9.14 Compact Split. No changes to PO / SO Deluge functions.

FIX: Generic demand list may omit a valid, unlinked Sales Order subform line,
for example SO 261016LTE (4888374000129246120): Shampoo 550ml x10,000.

After each COQL demand page, the widget reads the full Ordered_Items subform
from the Sales Orders represented on that page (up to 40 orders, 4 concurrent
requests) and restores any missing, positive-quantity, unlinked source lines.
Existing visible lines, selection, entered prices, SO/PO changes, split behavior,
filters, and pagination offset are preserved. Orders that cannot be read are
kept in the original COQL list (logged in console).

Other existing v1.9.14 features remain unchanged.
Procurement Widget v1.9.14 — 2026-10-26

BASED ON: Verified working v1.9.13. UI-only modification; all Deluge functions, record validation,
SO split persistence, PO creation and existing purchase order functions remain unchanged.

CHANGES
1. Removed redundant native window.confirm after the Split form: "Split & save in SO" is the single confirmation.
2. Moved split action from Product column to the SO Qty column next to quantity as a small "→ Split" link.
3. Action is rendered only when that exact SO row checkbox is checked and SO Qty allows a split.
4. While server processing runs, close the editor modal and display a visible spinner and elapsed timer.
   Duplicate Split, saving, selection and refresh actions remain locked while data is being changed.
   Existing server calls can still take time; the UI now communicates progress.

Install ZIP as update to the existing Create PO widget. Keep index /app/index.html.
No additional Deluge deployment or button changes required.

--- PREVIOUS VERSION NOTES ---

Procurement Widget v1.9.13 — 2026-10-26

BASED ON: Working v1.9.12 Searchable Dropdowns; all existing PO creation, SO
context selection, Supplier Code lookup, grouped/flat views and review workflow
are retained.

NEW
1. By Client: searchable Account_Name filter by account ID; combines with the
   existing SO number, Supplier Code, status and keyword filters.
2. PO Qty: any positive whole number, including below SO Qty. Purchase Orders
   can have negative Available when linked SO demand exceeds PO quantity.
3. Split between suppliers: button on every unlinked SO product row with >=2
   whole units. Select two distinct active Supplier Codes, divide SO Qty,
   enter separate positive purchase costs. Click Split & save in SO, then
   create separate supplier-specific POs. The widget does not create a PO
   during the split operation. Original SO total units must be conserved.

BACKEND CHANGES ALREADY INSTALLED IN THIS CRM (NOT INCLUDED IN ZIP):
- procurement_create_po (4888374000129888132): retains all existing flows,
  accepts positive PO Qty below SO Qty, routes SO split requests.
- procurement_add_to_existing_po (4888374000129862146): accepts positive PO
  Qty below SO Qty; existing lines and validations remain.
- procurement_split_so_line (4888374000130263025): newly deployed standalone
  Deluge server function. Uses actual SO line IDs, preserves other rows,
  verifies quantity, original SO total and new supplier-specific records.
  It rejects stale quantities and already purchased rows. Called internally
  via procurement_create_po; no separate REST OAuth enablement is required.
- po_recalculate_available: unchanged. Supports negative Available.

INSTALL
Replace Create PO Web Tab ZIP with this v1.9.13 ZIP. Keep widget index
/app/index.html (matching prior working internal widget). Hard refresh.
The SO detail Client Script / Create PO button DOES NOT change.

CAUTION
Sales Orders are immediately updated when an operator confirms Split; the
order's product line subform gains a new actual row. Verify on a disposable
SO with two active Supplier Codes before production use. There was NO live
SO/PO write as part of QA for this delivery. JS syntax and simulated widget
validation passed. Existing POs have not been altered by this preparation.

----- PREVIOUS VERSION HISTORY (PRESERVED) -----

Procurement Widget v1.9.12 | 2026-10-26

Changes from v1.9.9: searchable dropdown (search field + complete list) for per-product Supplier Code, By Supplier filter, and By Order Number filter. No server-side Deluge, SO selection, quantity, PO creation or existing PO logic changed.

Procurement Widget v1.9.7 | 2026-10-25

Change: Unpaid Sales Orders may be selected and included in POs. Explicit acknowledgement in the final review is mandatory for any selected SO without Accounting_status Paid/Deposit paid. Server-side validation independently requires paymentAcknowledged flag for such rows. No other PO logic intentionally changed.

MINMAXDEALS PROCUREMENT WIDGET v1.9.2
Build: 2026-10-24

INSTALLATION
1. In Zoho CRM: Setup > Developer Hub > Widgets > Procurement.
2. Replace current ZIP with Procurement_Widget_v1.9.2.zip.
3. Confirm the main widget index URL remains /app/index.html.
4. Refresh Procurement web tab with Cmd+Shift+R / Ctrl+Shift+R.
5. Confirm the footer reads "Procurement Widget v1.9.2".

DEPENDENCIES (already created in the connected CRM)
- procurement_get_demand (read sales-order product lines, including Brand)
- procurement_get_supplier_codes (active suppliers lookup)
- procurement_assign_supplier (updates one Ordered_Items Supplier lookup)
- procurement_create_po (create PO and write Purchase_Order refs back to SO lines)

Each function requires REST API OAuth permission in its Zoho CRM function settings.
It is generally a one-time setting per function, not one per code edit. Do not enable API keys.

CHANGES v1.5.0
- Fix checkbox disabled on initial data load (render after loading state clears).
- Brand displayed above product description.
- Center PO Qty, Accounting, Unit Cost (PO) headings.
- Switch between SO grouped and one-row-per-item views.
- Stable column widths for Unit Cost and PO Qty when rows are selected.
- Persistent footer explanation of why Create PO is disabled (e.g. supplier mismatch/cost missing).
- Search now also matches Brand.

BACKEND CHANGES INCLUDED IN CRM (not in ZIP)
- procurement_get_demand now returns Ordered_Items.Brand.
- procurement_assign_supplier reads the Sales Order using CRM v8 and falls back to the CRM v8 GET endpoint.
- procurement_create_po reads the Sales Order using CRM v8, supports cross-SO consolidation, and verifies PO links after updating source records. It rejects partial quantities lower than SO Qty to avoid losing unpurchased balances.

SECURITY
- Sales reps must not be granted access to Procurement web tab or real Vendors module.
- Widget should only be exposed to Procurement/admin profiles. The function can access real vendors.

TEST STATUS
JavaScript syntax checked with Node.js.
Playwright mocked-Zoho-SDK user flows passed: initial checkbox, two SO rows with same supplier, cost layout stable, brand rendering, toggle group/flat, supplier save, review confirmation modal.
Real CRM PO creation should first be tested with a controlled test SO; no real PO was created during testing.


VERSION 1.6.0 (2026-10-23)
- Strong black 6px boundary between consecutive Sales Orders in both views.
- White product rows without alternating order tints; selection remains highlighted.
- Existing backend procurement_create_po updated in CRM separately: v8 createRecord, structured Vendor and Product lookups, detailed CRM error messages if rejected.
- Do NOT re-enable REST OAuth after code changes: setting remains active.
- No production PO was created during this deployment.

VERSION 1.7.0 (2026-10-23)
- Slimmed Sales Order separators to a calm 2px slate gray line, pale neutral header.
- In grouped SO view, Accounting is shown once in the SO header and hidden from item rows and column headings.
- Moved SO units next to SO number in grouped view.
- Added customer Account and Sales Order Owner to grouped header and flat per-product view.
- Added Account and Owner to keyword search.
- Changes to standalone CRM functions are deployed separately; they are not embedded in the ZIP:
  * procurement_get_demand: selects Parent_Id.Owner and Parent_Id.Account_Name in addition to all previous fields.
  * procurement_create_po: corrected decimal cost validator to use character class [.], so 4.5 and 3.12 are accepted by Deluge.
- The previous successful PO PROC-ADV-261023183522 was observed with CRM Grand_Total=0 despite Quantity=10,000, Cost=6. Do not assume Zoho computed its financial totals. Confirm PO totals before using the PO operationally.
- Did NOT change existing SO quantities or create any PO during this update.

INSTALL v1.7.0
1. Developer Hub > Widgets > Procurement, replace ZIP with Procurement_Widget_v1.9.2.zip.
2. Keep index URL /app/index.html, then hard refresh the Procurement web tab.
3. The persistent footer must read Procurement Widget v1.7.0.
4. OAuth access for all four function API names was already enabled; no re-enable should be necessary.

VERSION 1.8.0 (2026-10-24)
- Replaced temporary MM square with supplied transparent MinMaxDeals LLC logo (embedded image).
- Removed Account: and Owner: prefixes. Displays linked customer Account as a clickable CRM record and owner first+last name using CRM Users full_name mapping.
- Updated filter labels to By Order Number, By Supplier, By Accounting Status; added exact Deposit paid/Paid filtering; product / UPC search remains.
- Grouped view shows "X units" for number of line items and puts the sum of ordered quantities in the SO Qty column instead of beside the order number.
- Replaced View dropdown with icon buttons, grouped/flat, with tooltips and accessible aria labels.
- Restyled Collapse all as a separate contrasting outline control.
- Backend code updated in connected CRM (functions are NOT embedded in this ZIP):
  procurement_get_demand - joins active/inactive CRM Users full_name via /crm/v8/users?type=AllUsers to return ownerNames keyed by user ID.
  procurement_create_po - subject pattern YYMMDD-SupplierCode-Brand or YYMMDD-SupplierCode-Mix for multi-brand selection; checks existing PO Subject via COQL (HTTP 204 means no match) and adds a 3-random-letter suffix on collision (up to 30 attempts).
- Example single brand: 261024-5ST-Gucci; multi-brand: 261024-5ST-Mix; duplicate: 261024-5ST-Gucci-ABC.
- IMPORTANT: existing Purchase Order Grand_Total and Purchase_Items.Net_Total were previously observed as 0 despite nonzero Cost and Quantity; validate Zoho's calculation before sending financial documents.
- Web UI tested with static HTML/CSS/JS validation and direct CRM field metadata; live end-to-end purchase creation is NOT performed during this update.


v1.9: NEW display status is actual CRM Status Created. Compact header/metrics, user full names, dynamic filters, PO Qty prefilled from SO Qty, persistent dismissible PO notifications, open created PO tab.

v1.9.2: Removed the redundant per-row SO Qty to PO Qty arrow and the header Copy All arrow. PO Qty remains prefilled with SO Qty on load and manually editable; all other v1.9 behavior is preserved.

VERSION 1.9.2 (2026-10-24)
- Adds "Purchase Orders" navigation button to Procurement widget header; opens CRM Purchase Orders module in a new tab.
- The reciprocal "Open Procurement" CRM Custom Buttons were created in Purchase Orders module (list utility and record detail).
- All product selection, supplier assignment, PO generation and backend code remain unchanged from v1.9.1.


v1.9.6 -- Add to Existing PO (desktop/mobile)
- Two bottom actions: Create New PO, Add to Existing PO.
- Existing PO picker calls procurement_get_existing_pos and lists eligible POs whose actual Vendor lookup matches the selected Supplier Code; no Vendor name/ID is sent to the widget. Status in Created / Requested / Confirmed / Deposit paid / Partially Paid.
- Old and new PO subject formats are supported through direct Vendor ID matching on the server.
- The server always validates the actual Vendor lookup and PO Status regardless of client matching.
- Existing PO add invokes standalone Deluge function procurement_add_to_existing_po with parameters poId, supplierCodeId, linesJson.
- Backend functions CREATED in CRM: procurement_add_to_existing_po (4888374000129862146) and procurement_get_existing_pos (4888374000129890232). MUST enable REST API OAuth 2.0 for BOTH in Developer Hub -> Functions before using Add to Existing PO. Newly created functions default to None.
- CRM Status currently may not have Requested or Confirmed: add those picklist values if desired.
- Existing Purchase_Items remain unchanged; only new subform rows are appended (Zoho CRM V8 Subforms append semantics), and source SO item lookup Purchase_Order is linked and Available recalculated.
- Unpaid SO acknowledgement is mandatory. Existing PO status and supplier are revalidated server-side.
- PO list is loaded through a server function to protect private Vendor identities in the browser/mobile client.
- No live PO mutation performed as a QA test.


v1.9.7 — SO record context launch
- Sales Orders > record detail > Create PO passes source Sales Order ID using the SO record merge field.
- The widget attempts to load the selected Sales Order directly using the SDK, lists only unlinked positive-quantity Ordered_Items, and prechecks up to 60 rows.
- Multiple suppliers or missing supplier codes still block creation until corrected (existing one-supplier-per-PO rule).
- Sales Orders list utility Create PO stays context-free, no automatic selection.
- Widget Web Tab receives context through URL query or embedded PageLoad payload.
- Reset filters exits focused mode and restores the general pending-demand workspace.
- Function logic/CRM fields not changed.


v1.9.8 — SO launch diagnostics / robust context
- SO detail button stays dynamic Web Tab with Sales_Orders.Id merge field.
- Extracts launch SO ID from widget query/hash, SDK PageLoad data (including nested objects/arrays), or Zoho SO-record referrer URL.
- Shows explicit message when all source lines are linked to an existing PO, including their PO number. Linked rows are NEVER preselected for repeat purchasing.
- When some lines are linked, shows number already linked and prechecks up to 60 unassigned positive-quantity lines.
- When SO read fails, do not silently drop SO context; explain error and allow Reset filters.
- All backend functions, costs, supplier rules, mobile CSS and PO creation logic unchanged.


v1.9.9 - Fix Add Existing PO REST inactive and SO auto-selection context
- Routes existing PO listing and adding via the already OAuth-enabled procurement_create_po function, which delegates to dedicated server functions; new PO creation logic unchanged.
- Uses the same explicit source SO context detection plus WebTab9 PageLoad EntityId fallbacks. List-mode launch stays unselected.
- No production PO was created in the QA process.


v1.9.16 — server-side missing-order-line recovery
- Procurement Get Demand now reconciles COQL rows against each returned Sales Order's actual Ordered_Items subform in Deluge.
- Missing unlinked positive-quantity item IDs are appended once, with full SO context, including supplier and product.
- The embedded widget skips redundant CRM SDK reconciliation if the server confirms its check and maintains COQL-native pagination offsets.
- Original PO creation, split behavior, filters, permissions and Sales Order data are unchanged.
