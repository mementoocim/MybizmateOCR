# MyBizMate import templates for the scanner app

These are the MyBizMate import templates that matter to MyBizMate Scan.

| Template | File | Where it came from |
|---|---|---|
| Sales import | `sales-import/sales-import-template.xlsx` | sent by the user |
| Purchases import | `purchases-import/purchases-import-template.xlsx` | sent by the user |
| Parties import | `parties-import/parties-import-template.xlsx` | mybizmate.io → Masters → Parties → Import → Download template |

All three were downloaded on 2026-11-20 from the company "Sales Bizmate".

How the templates are laid out:
- Each template has one sheet, "Import": a header row, and a note on every column.
- The Parties template also has an "Example (not imported)" sheet with one made-up row.
- MyBizMate writes the notes for each company. Their "Match one of" lists (customers, suppliers, accounts, branches) come from that company's own data, so the app must not hardcode them.

The scanner's box names below (`date`, `invoice_no`, …) are from `mybizmate-ocr/modules/scanner/assets/scanner/field_map.json` (the Sales Invoice) and `service_invoice.json` (the Service Invoice).

## What this means for milestone 3

1. **One row per invoice.** Neither import has line items, so a saved scan becomes a single Sales or Purchases row.
   - `Gross` is the invoice total, VAT included.
   - The item rows on the paper still matter for the checks (they should add up) and for an optional Description.
   - The import doesn't need an item list.
2. **Three required columns aren't on the paper as such.** The save step has to supply them:
   - **Revenue Account** (sales) or **Expense Account** (purchases). This is a code or name from the company's chart of accounts, so it needs a default in the app or a pick at save.
   - **Type**, a tax code: `VAT`, `NONVAT`, `ZERO`, `EXEMPT` or `NA`. The paper's `vatable_sales`, `zero_rated` and `vat_exempt` boxes can suggest it. A non-VAT business uses `NONVAT`.
   - **Terms**, `Cash` or `On Account`. The paper's tick boxes give it: `terms_cash`, `terms_account`.
3. **Customer and Supplier are matched by code or name.**
   - A party list on the phone, filled from a Parties file, lets the app match the scan's `customer_name` and `customer_tin` to a party code before export. Otherwise the name goes into the file as written, and MyBizMate's import has to match it.
   - **On a purchase, the supplier is the seller printed at the top of the form, which the scanner doesn't read.** The person picks the supplier.
4. **The withholding columns take BIR ATC codes (for example WC158), not amounts.** These are `CWT IT` and `CWT VT` on sales, `EWT` and `WVAT` on purchases. The Service Invoice's `withholding` amount can't fill them by itself.
5. **Gross when tax is withheld.** On a Service Invoice that withholds tax, "Total Amount Due" (`total_due`) is probably after the withholding. `Gross` wants the VAT-inclusive invoice total before it. Settle which box to use in the milestone 3 plan.
6. **Dates are written YYYY-MM-DD.**
7. **Some columns can be left out.** A note saying "Not matched automatically" means the column is mapped by hand in MyBizMate's import step.
8. **The Parties file.**
   - `TIN` is required, written 123-456-789-00000 (00000 is the head office).
   - Each row needs at least one of Sub-street, Street or Barangay, plus City / Municipality, Province and ZIP.
   - The phone keeps code, type, names, trade name, TIN, address, VAT status and payment terms. It never keeps the contact number or email.
   - Customers that a scan finds and that aren't in the list could be exported in this format, so MyBizMate creates them before the sales rows are imported.

## Sales import (`Import` sheet, columns A–AA)

| Column | Required | Takes | From the scan |
|---|---|---|---|
| Date | yes | YYYY-MM-DD | `date` |
| Customer | yes | party code or name | `customer_name` and `customer_tin`, matched to the party list |
| Gross | yes | invoice total, VAT included | Sales Invoice: `total_due`. Service Invoice: see item 5 above |
| Type | yes | tax code or its description: EXEMPT, NA, NONVAT, VAT, ZERO | the VAT boxes, or the business's VAT status |
| Revenue Account | yes | account code or name | not on paper |
| CWT IT, CWT VT | no | BIR ATC code | not on paper |
| Terms | yes | Cash, On Account | `terms_cash` / `terms_account` |
| SI/OR No. | no | text | `invoice_no` |
| Branch | no | one of the company's branches | not on paper |
| CTYPE | no | Regular, Senior Citizen, PWD, Solo Parent, Athlete/Coach, Medal of Valor | not on paper |
| Cash/Bank/Advance | no | account code or name | not on paper |
| Description | no | text | could list the items |
| Discount | no | amount | `discount` (Service Invoice only) |
| Beneficiary, ID No., Statutory, Child's Name | no | details of a senior citizen, PWD or solo-parent discount | not on paper |
| Term Type, Credit Days, Due Date, ID Type, Beneficiary TIN, Discount Prices, Cap Left, Child's Birth Date | no | mapped by hand in MyBizMate | leave out |
| Particulars | no | remarks on the entry | — |

## Purchases import (`Import` sheet, columns A–Q)

| Column | Required | Takes | From the scan |
|---|---|---|---|
| Date | yes | YYYY-MM-DD | `date` |
| Supplier | yes | party code or name | picked by the person (the seller is printed, not read) |
| Gross | yes | invoice total, VAT included | `total_due` (see item 5 above) |
| Type | yes | tax code: EXEMPT, NA, NONVAT, VAT, ZERO | the VAT boxes |
| Expense Account | yes | account code or name | not on paper |
| EWT, WVAT | no | BIR ATC code | not on paper |
| Terms | yes | Cash, On Account | `terms_cash` / `terms_account` |
| Inv No. | no | text | `invoice_no` |
| Branch, Cash/Bank/Advance, Description, Discount | no | as in the Sales import | — |
| Term Type, Credit Days, Due Date | no | mapped by hand in MyBizMate | leave out |
| Particulars | no | remarks on the entry | — |

## Parties import (`Import` sheet, columns A–Y)

| Column | Required | Notes |
|---|---|---|
| Code | no | Blank gets a serial code. Re-using a code updates that party. |
| Type | for a new party | Customer, Supplier, or Customer and Supplier. C, S or B also work. |
| Entity type | no | Company (the default) or Individual |
| Registered name | for a company | |
| Last name, First name | for an individual | |
| Middle name, Trade name | no | |
| TIN | yes | 123-456-789-00000 |
| RDO | no | |
| Sub-street, Street, Barangay | at least one | |
| City / Municipality, Province, ZIP | yes | |
| Contact number, Email | no | never kept on the phone |
| VAT status | no | VAT-registered or Not VAT-registered |
| Payment terms | no | Cash or On Account. This fills Terms when the party is picked. |
| Authorized representative, Representative title, Representative TIN | no | who signs the conforme on 2307s |
| Trade type | no | Both trade and non-trade, Trade, Non-trade |
| Default branch | no | the company's branch name or code |

## Not fetched

- **The chart of accounts template:** the user asked for the templates connected to the OCR only.
- **The file from Export Parties:** it holds the company's own party data.
  - We assume it uses the same columns as the Parties import, since re-using a code updates a party.
  - Check this with an export of made-up parties before the app relies on it.
