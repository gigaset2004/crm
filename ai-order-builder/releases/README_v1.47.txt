AI Order Builder Widget v1.47 — 2026-11-20

INSTALL
Replace only the AI Order Builder ZIP in Zoho CRM Developer Hub → Widgets.
Verify the footer says Version 1.47.
Client Scripts v1.36 remain unchanged.

CHANGES
- Strong 5px separators and alternate row colors.
- Customer ORDER (column E) drives Quantity. Supplier QTY (column C) is stock only.
- Unit Price is read from PRICE USD (column D).
- Summary/formula and footnote rows with no positive ORDER quantity are not items.
- Re-importing the same file replaces only prior UNSAVED imported lines from that file; manual lines and linked SO/PO lines are preserved.
- Offer Product Name drops only a leading brand from the supplier title (Nars Sheer Glow -> Sheer Glow). Raw supplier title remains available as requestedName for research; official CRM Product_Name is untouched.
- Existing Products with Brand=null and Brand_text matching the imported NARS brand are linked to the pre-existing Brands/Nars record. Products with a different Brand or a valid Brand lookup are left alone.
- Automatic creation of a missing CRM Product still requires a verified name backed by an official manufacturer regional site. Never create Products using the supplier Excel title.

NARS source fixture: 18 ordered rows; 2,000 units; $49,000 total.
Check the SOURCE version at the bottom of the widget; old v1.44 cannot use ORDER or PRICE USD.
