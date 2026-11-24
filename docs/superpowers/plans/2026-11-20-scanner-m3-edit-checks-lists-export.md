# MyBizMate Scan, milestone 3: edit after scan, the checks, the lists, sale or purchase, and the import files — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A scan becomes a checked sale or purchase that the person can correct and save. Saved scans then become files in MyBizMate's Sales and Purchases import formats. In detail:
- the checks (the date, each row's math, the total, the VAT, and matching the customer and the items), ported from the Python;
- fixing any box after a scan, with the checks run again at once;
- the business's customer, supplier and item lists, kept on the phone;
- saving a scan as a sale or a purchase;
- the import files, shared from the phone: sales, purchases, and the new customers and suppliers.

**Architecture:** Everything new is TypeScript. The C++ core and the camera don't change.
- **`lib/checks/`** is a pure TypeScript port of `postprocess.finalize` and its helpers, with rapidfuzz's scores. It imports nothing from React Native, Expo or the scanner, so it can move into MyBizMate's own app. New fixtures from the Python keep it identical to the Python.
- **`lib/sale.ts`** applies the app's own rules on top: the person's edits, empty lists, sale versus purchase, the tax type, and the import's Gross.
- **The lists, the settings and the saved scans** are JSON files in the app's own files folder. Saving a scan moves its folder to `saved/<id>/`, where the scanner's newest-6 cleanup can't reach it.
- **The export** writes an .xlsx in each import template's own layout and hands it to the phone's share sheet.

**Tech Stack:** As in milestone 2: Expo SDK 58, React Native 0.88, jest-expo and RNTL 14. New: expo-sharing. The fixtures come from the Python reference (Python 3.12.16, rapidfuzz 3.14.6).

**Spec:** `docs/2026-11-19-expo-scanner-design.md`, milestone 3: "Edit after scan, the checks, the lists, sale or purchase, and the Sales/Purchase import files".
- The design describes it in Goals 2, 8 and 9 and in four sections: "Lists", "Sale or purchase, and the export files", "Checks (TypeScript)" and "Edit after scan".
- The import templates and their column map are in `docs/mybizmate-templates/README.md`.
- This plan builds on milestones 1 and 2: `docs/superpowers/plans/2026-11-20-scanner-m2-camera-and-both-forms.md` and its rulings, `2026-11-20-scanner-m2-rulings.md`.

### Decided in this plan

**1. Gross, when tax is withheld** (the templates README's item 5). Gross is the invoice's total with VAT included, before the discount and before the withholding tax. On the Service Invoice, that is Total Sales.
- **How it's worked out:** the total the checks agree on (Total Amount Due), plus the discount and the withholding tax read on the invoice. This is the Python's own `gross`, the figure it checks the VAT against.
- **On the MyBizMate Sales Invoice**, and on a Service Invoice with no discount or withholding, Gross is Total Amount Due.
- **The Discount column** gets the discount box's amount.
- **The withholding** goes in as an ATC code: in CWT IT on a sale, in EWT on a purchase. The person types the code when saving, and the app remembers it. MyBizMate works out the tax from the code, so the amount itself isn't exported.
- **Why:** the import's note on Gross says "the invoice total, VAT included", and the import has its own Discount column. Its withholding columns take codes, which MyBizMate applies to the gross. A Gross that is already after withholding would have the tax taken off twice.
- **Checked on MyBizMate's own importer** in Task 13, with a made-up invoice in the team's test company, and only if the user says so.

**2. The account and tax-code defaults.**
- **The accounts.** The person types the Revenue Account for sales and the Expense Account for purchases, as a code or a name from their chart of accounts. MyBizMate's import matches either.
  - The chart of accounts isn't on the phone, and isn't fetched.
  - The first save asks for the account. Settings keeps it, and the last one used becomes the default.
  - Each save can change it.
- **VAT registration.** Whether the business is VAT-registered is asked once, at the first sale, and kept in Settings.
- **The tax type (`Type`)** is suggested for each invoice. The person can change it when saving.
  - **A sale by a business that isn't VAT-registered:** `NONVAT`.
  - **A sale by a VAT-registered business:**
    - `ZERO` when the only amounts in the VAT boxes are zero-rated;
    - `EXEMPT` when they are only VAT-exempt;
    - otherwise `VAT`.
  - **A purchase, or a sale before the VAT question is answered:**
    - `VAT` when a VAT box has an amount (VATable sales, VAT, Less VAT, Net of VAT or Add VAT);
    - otherwise `ZERO` or `EXEMPT`, by the same rule as above;
    - otherwise `NONVAT`.

**3. A customer who isn't in the list.** The Customer column gets one of three things.
- **A list party's MyBizMate code.** This is when the scan matched the party by its TIN and name, or the person chose it. A list party with no code gets its name instead.
- **The name as written**, with the person's corrections. This is when the name isn't in the list, or when the closest match wasn't confirmed. The app never writes a guessed code: it could book the sale to the wrong customer. MyBizMate's import then matches the name itself.
- **`VARIOUS-CUST`**, MyBizMate's walk-in customer, when no name or TIN is written.

The export screen lists the names that aren't list parties with a code. It asks the person to check that they exist in MyBizMate before importing. One tap adds a scan's customer, or a purchase's supplier, to the phone's list.

**New customers and suppliers go out in their own file**, in MyBizMate's Parties import format (the user asked for it in review). It holds the parties added from scans that have no MyBizMate code yet.
- **What it holds:** each party's type, entity type, name and TIN (in MyBizMate's 123-456-789-00000 form), and the address as read, in Street.
- **What it leaves blank:** City / Municipality, Province and ZIP. The paper doesn't give them, and MyBizMate needs them, so the person fills them in with Excel or Google Sheets before importing. The export says so.
- **The order:** the person imports it before the sales and purchases that name these parties. MyBizMate then matches those rows by name.
- **The codes come back later:** when the person next imports MyBizMate's own parties list into the app, the codes MyBizMate gave these parties land on the phone.

**4. Smaller decisions.**
- **The export files are .xlsx**, in the templates' own layout: one sheet, "Import", with the same header row word for word. An import always reads its own template's format. The app writes the file with a small zip writer, so no spreadsheet library is added.
- **The lists are read from CSV files**, as the design says.
  - Customers and suppliers use the Parties import's column names, so MyBizMate's own parties file, saved as CSV, imports as it is. Items use Name, Unit and Price.
  - Contact numbers and emails are never read into the app.
- **Two Expo modules handle the files.** Picking a CSV uses expo-file-system 58's `File.pickFileAsync`. Sharing an export uses expo-sharing, the only new package.
- **The checks follow the Python** (`postprocess.py` with rapidfuzz 3.14.6), not the Java port. The Java simplifies `WRatio`, and it sums left to right where Python 3.12's `sum()` is compensated.
- **Rules the design adds to the Python**, each with its own tests:
  - empty lists skip their checks;
  - a purchase skips the customer and item-list checks: its customer boxes name the buyer, which is the business itself;
  - a party is matched on the best of its names: its registered or full name, and its trade name;
  - the date is checked against the day of the scan, by the phone's clock. Samples are checked as of 2026-11-18, the day they were made for.
- **Samples can't be saved.** They are made up, so they must never reach an export.

### Changed from the design

- **The export's date range is one of four choices:**
  - not exported yet (the default);
  - this month;
  - last month;
  - all.
- **An invoice is marked as exported only when the person says so.** Android's share sheet doesn't tell the app whether the file was sent, so the app asks after the sheet closes. A cancelled share doesn't hide invoices from the next export, and a sent file isn't exported twice.

### Not in this milestone

- **Milestone 4:** the training-data export and the team's annotation mode. This milestone keeps every edit apart from the reading it replaces, so that milestone 4 can tell the edited boxes from the read ones.
- **Milestone 5:** PDF import and the BIR 2307. The 2307's ATC table will also let the app check a withholding amount against its code.
- **Later:**
  - reading lists from .xlsx files;
  - editing list entries one by one (in this milestone, lists are imported, added to from scans, or cleared);
  - sending files to MyBizMate, which needs the backend;
  - clearing old saved scans' images, to be decided with milestone 4's training queue, which needs the crops.
- **Milestone 2's deferred minors.** Two of them are folded in, because this milestone changes their code, both in Task 5:
  - the `recent.json` writes, which can interleave;
  - the logo jump between the two splashes (Task 5 changes `BrandSplash`).

  The other 9 are in code this milestone doesn't touch: the camera view, the core, the JNI and the manifest.

## Global Constraints

- **Location and git.**
  - Work on branch `m3-edit-checks-lists-export`, made from `master` in `mybizmate-ocr/`.
  - Before making the branch, check that the checkout is on `master` with nothing uncommitted. If it isn't, another session may be working there: stop and ask the user.
  - In `prototype/`, only Task 1 changes files: the checks' exporter and its test.
  - Every task that changes `mybizmate-ocr/` ends with a commit.
  - Nothing is pushed and no PR is opened. The user merges into `master` and pushes when they say so.
- **Reference behaviour.**
  - **The checks:** `prototype/benchmark/postprocess.py`, run with the project's `.venv` (Python 3.12.16, rapidfuzz 3.14.6).
  - **The result screen's words and look:** the test app's `ResultActivity.java` and `Checks.Sale.problems()`.
  - **Everything else:** the copy this plan quotes.
- **Parity.** On every case in `fixtures/checks/`:
  - `finalize`'s output equals the Python's: the same values, and the same flags in the same order;
  - the fuzzy scores equal rapidfuzz's;
  - the dates, the amounts and the quantities equal the Python's.
- **Porting rules.**
  - Python's `round(x, n)` becomes `pyRound`: it rounds half to even, on the exact binary value.
  - `sum()` of floats becomes `pySum`, CPython 3.12's Neumaier sum.
  - Dicts keep their insertion order, `max()` takes the first of equals, and sorts are stable.
  - Strings split on runs of whitespace, as Python's `str.split()` does.
- **The actual app.**
  - **Team-only tools:** only the speed test, and only in team builds.
  - **No logging of content:** no names, TINs, amounts, edits or file contents.
  - **People's data persists:** edits, lists, settings and saved scans survive closing the app.
  - **The app's files stay in its own storage**, which is kept out of Android's backups.
- **Offline.** No network code. Sharing hands a file to an app the person picks; this app sends nothing.
- **Privacy.**
  - Fixtures are synthetic.
  - Nothing under `prototype/data/real_private/` is read by code, copied, committed or screenshotted.
  - The lists never keep contact numbers or emails, not even in memory after an import.
  - The templates' notes list a company's own customers, suppliers and accounts. None of that is copied into the app or its fixtures.
- **Pure checks.** Nothing under `lib/checks/` imports React Native, Expo or the scanner module.
- **Copy.** User-facing text is exactly what this plan quotes.
- **Look.**
  - Colours come only from `lib/theme.ts`.
  - Sheets use `components/Sheet.tsx`, and buttons use `components/Buttons.tsx`.
- **New packages.** Only expo-sharing, added with `npx expo install expo-sharing`.
- **Before a task is done:** `npx jest`, `npx tsc --noEmit` and `npm run lint` are all clean (AGENTS.md).
- **This laptop.**
  - Milestone 2's gotchas still hold:
    - the Windows path-limit plugin;
    - emulator storage;
    - `MSYS_NO_PATHCONV=1`;
    - starting the emulator from outside the project folder;
    - `await render` (RNTL 14).
  - The `.venv` has no pytest. Python tests are plain scripts that print "N of N right" and exit with 1 when one fails.
  - A new route file needs a full reload of the development build.

## Review Focus

1. **A scan made before 8 in the morning is checked against the day before.** `toISOString()` gives the UTC day, and Manila is 8 hours ahead. An invoice dated today would then be flagged as in the future. Tests: Task 3, `localIsoDate uses the phone's own day`; Task 6, `the date is checked against the day of the scan`.
2. **Exporting twice adds the same invoices, or the same new customers, to MyBizMate twice.** Tests:
   - Task 10: `marked invoices leave the default export`, `"Not yet" keeps them for the next export` and `a choice with exported invoices warns`;
   - Task 11: `marked parties leave the next Parties file`.
3. **On a purchase, the customer boxes hold the business's own name.** They must not be matched against the customers or flagged. Test: Task 6, `a purchase doesn't check the customer boxes`.
4. **A saved invoice is lost to the scanner's cleanup**, which keeps only the newest 6 scan folders. Tests: Task 9, `saving moves the scan's folder out of scans/ and rewrites its files' URIs`; Task 13 reads 7 more scans, then opens the saved invoice.
5. **A CSV saved by Excel or Google Sheets.** It can have:
   - a byte order mark;
   - CRLF line ends;
   - commas inside quotes;
   - prices like "1,500.00";
   - " *" and " †" in the headers;
   - Contact number and Email columns.

   Tests in Task 5: `parses what Excel writes`, `imports MyBizMate's parties columns` and `never keeps contact numbers or emails`.

---

## File structure

```
mybizmate-ocr/
  lib/checks/       fuzzy.ts (Task 2) · num.ts, dates.ts (Task 3) · finalize.ts, index.ts (Task 4)    pure TypeScript
  lib/              jsonFile, csv, lists, settings, startup (Task 5) · sale (Task 6) · exportRows, saved (Task 9) ·
                    zip, xlsx, exportFile (Task 10) · scans, forms, format (changed)
  components/       SaleRow, BoxSheet, TermsSheet, Segmented (Task 7) · PartyPicker, PartySheet, SupplierSheet (Task 8) ·
                    Chips, SaveSheet (Task 9) · ExportSheet (Tasks 10–11) · StatusCard, BoxRow, RecentRow, BrandSplash (changed)
  app/              result.tsx (Tasks 7–9) · settings.tsx (Task 9) · saved.tsx (Tasks 10–11) · lists.tsx (Task 12) ·
                    index.tsx, _layout.tsx (changed)
  test-utils/       memoryFs.ts (Task 5) · unzip.ts (Task 10)
  fixtures/checks/  scan_pack, numbers, dates, fuzzy, finalize (.json)          written by the exporter (Task 1)
  fixtures/lists/   parties.csv, items.csv                                     made-up lists (Task 1)
prototype/benchmark/export_check_fixtures.py, test_export_check_fixtures.py       (Task 1)
```

The app's files on the phone, in `Paths.document` (the app's files folder):

| File | What it holds |
|---|---|
| `recent.json` | The newest 6 scans, as in milestone 2, now with their edits. |
| `lists.json` | `{ parties, items }` |
| `settings.json` | The export defaults. |
| `saved.json` | One summary per saved scan, with its import row. |
| `saved/<id>/` | A saved scan's folder (moved from `scans/<ms>`), plus `scan.json`, the whole scan. |

## The shared shapes

These types are used across tasks. Each is defined in the task named, exactly as shown.

```ts
// lib/checks/num.ts (Task 3)
export type Box = { text: string; alts?: readonly string[] };
// lib/checks/dates.ts (Task 3)
export type DateChoice = { date: string | null; flagged: boolean; rebuilt: boolean; other: string | null };
// lib/checks/finalize.ts (Task 4)
export type Terms = 'cash' | 'account';
export type PhotoMeasures = { sharpness: number; sharp_min: number; light: number; dark_max: number };
export type Raw = { boxes: Readonly<Record<string, Box>>; terms: Terms | null; photo: PhotoMeasures | null };
export type PackCustomer = { id: string; name: string; tin: string; names?: readonly string[] }; // names: other names
export type PackItem = { id: string; description: string; unit: string; price: number };
export type Pack = { customers: readonly PackCustomer[]; items: readonly PackItem[] };
export type CustomerStatus = 'auto' | 'unsure' | 'new' | 'blank';
export type FinalItem = { row: number; item_id: string | null; description: string; qty: number | null;
  unit_price: number | null; amount: number | null };
export type Final = {
  // postprocess.finalize's dict, key for key:
  invoice_no: string; date: string | null; customer_id: string; terms: Terms | null; items: FinalItem[];
  total_due: number | null; vat: number | null; vatable_sales: number | null; flags: string[];
  // and what the screens need, from the same computation:
  customer_status: CustomerStatus; date_choice: DateChoice; less: number; gross: number | null;
};
// lib/settings.ts (Task 5)
export type TaxType = 'VAT' | 'NONVAT' | 'ZERO' | 'EXEMPT' | 'NA';
export type Settings = { vatRegistered: boolean | null; revenueAccount: string; expenseAccount: string; atc: string };
// lib/lists.ts (Task 5)
export type PartyType = 'customer' | 'supplier' | 'both';
export type Party = { id: string; code: string; type: PartyType; entity: 'company' | 'individual';
  registeredName: string; lastName: string; firstName: string; middleName: string; tradeName: string;
  tin: string; address: string; vatStatus: 'vat' | 'nonvat' | ''; terms: Terms | ''; fromScan: boolean;
  exportedAt: string | null };            // when it went out in a Parties import file (Task 11)
export type ListItem = { id: string; name: string; unit: string; price: number | null };
export type Lists = { parties: readonly Party[]; items: readonly ListItem[]; version: number };
// lib/scans.ts (Task 6)
export type Kind = 'sale' | 'purchase';
export type PartyChoice = { listId: string } | { name: string } | { various: true };
export type SaveDetails = { taxType: TaxType; account: string; terms: Terms; atc: string };
export type StoredScan = { id: string; label: string; source: ScanSource; sampleId?: string; at: Date;
  result: ScanResult;
  edits: Readonly<Record<string, string>>; // box name -> what the person says the box says
  terms: Terms | null;                     // the person's pick; null: the ticks on the paper
  kind: Kind; party: PartyChoice | null; saved: { savedAt: string; details: SaveDetails } | null };
// lib/sale.ts (Task 6)
export type PartyStatus = 'auto' | 'chosen' | 'unsure' | 'new' | 'unlisted' | 'blank' | 'typed' | 'various' | 'missing';
export type SaleView = {
  final: Final;          // the checks, without the list checks this app skips
  problems: string[];    // the status card's words, in order
  party: { status: PartyStatus; column: string; shown: string; written: string; listParty: Party | null };
  terms: Terms | null;   // the person's pick, else the ticks
  gross: number | null; discount: number | null; withholding: number | null;
  taxType: TaxType;      // the suggestion
  listPrices: Readonly<Record<number, number>>;  // item row -> the list price of the item it matched
};
// lib/exportRows.ts (Task 9)
export type ExportRow = Readonly<Record<string, string | number>>; // template header -> value; a missing one is blank
// lib/saved.ts (Task 9)
export type SavedSummary = { id: string; kind: Kind; label: string; partyName: string; partyId: string | null;
  date: string; gross: number; row: ExportRow; listed: boolean; savedAt: string; exportedAt: string | null };
```

---

### Task 1: The checks' fixtures (Python exporter)

**Files:**
- Create: `prototype/benchmark/export_check_fixtures.py`, `prototype/benchmark/test_export_check_fixtures.py`
- Writes into `mybizmate-ocr/`: `fixtures/checks/{scan_pack,numbers,dates,fuzzy,finalize}.json` and `fixtures/lists/{parties,items}.csv`

**Interfaces:**
- **Consumes:**
  - from `postprocess`: `finalize`, `date_choice`, `date_repairs`, `parse_date`, `parse_amount`, `candidates`, `qty_values`, `words_to_number` and `match_customer`;
  - `rapidfuzz.fuzz`, `rapidfuzz.process` and `rapidfuzz.fuzz_py`;
  - the `CASES` of `test_checks.py` and `test_dates.py`;
  - `data/scan_pack.json`;
  - `mybizmate-ocr/fixtures/core/expected/*.json`, the reads of every fixture photo.
- **Produces:** `export(app_root: Path, core_expected: Path) -> None`, which writes these files:

| File | Format |
|---|---|
| `scan_pack.json` | `data/scan_pack.json`, byte for byte. |
| `numbers.json` | `{"parse_amount": [[s, v]], "candidates": [[box, [v]]], "qty_values": [[s, [v]]], "words_to_number": [[s, v]], "round": [[x, n, round(x, n)]], "fsum": [[[x], sum(xs)]]}`. A box is `{"text", "alts"}`; a v can be null. |
| `dates.json` | `{"cases": [{"readings", "today", "parse": [parse_date(r)], "repairs": [{iso: cost}], "choice": {"date", "flagged", "rebuilt", "other"}}]}` |
| `fuzzy.json` | `{"pairs": [{"a", "b", "ratio", "partial_ratio", "token_sort_ratio", "token_set_ratio", "token_ratio", "partial_token_ratio", "WRatio"}], "extract_one": [{"query", "choices", "result": [choice, score, index] or null}], "extract": [{"query", "choices": [[key, value]], "limit", "result": [[value, score, key]]}]}`. extract_one scores with `fuzz.ratio`, extract with `fuzz.WRatio`. |
| `finalize.json` | `{"today": "2026-11-18", "cases": [{"name", "raw", "expected"}]}`. `raw` is the Python's flat dict. `expected` is `finalize(raw, PACK, today)` plus four keys: `customer_status` (from `match_customer`), `date_choice` (from `date_choice` on the date box's reading and backups), `less` and `gross`, worked out as `finalize` does. |
| `parties.csv`, `items.csv` | Made-up lists; see below. |

The inputs:
- **numbers.json** takes:
  - **`parse_amount`:** every text and backup of every `amount` and `number` read in the fixtures, plus "P1,500.00", "1,500", "1,50", "1.500,00", "1.5.0", "₱ 75", "abc", "", ".5" and "007";
  - **`candidates`:** every amount box in the fixtures, plus `{"text": "P5.00", "alts": []}`;
  - **`qty_values`:** every `number` read's text and backups, plus "1/2", "12", "112", "172", "1 1/2", "11/2", "3/4", "1/0", "0/2" and "";
  - **`words_to_number`:** every `amount_words` text, plus "One thousand five hundred seventy-five pesos only", "Seven hundred fifty and 25/100 pesos", "Twenty-one thousand", "Thousnd" and "";
  - **`round`:**
    - at 2 decimals: (2.675, 2), (0.125, 2), (0.375, 2), (0.005, 2), (1.005, 2), (-0.125, 2) and (142.5, 2);
    - at 6 decimals: (1/3, 6), (2/3, 6) and (1.0000005, 6);
    - every quantity × unit price from the fixture rows (their first candidates), at 2;
  - **`fsum`:** [0.1] × 10, [1e16, 1.0, -1e16], [0.1, 0.2, 0.3], [] and [5.0], plus every fixture's item amounts (their first candidates) when it has 2 or more.
- **dates.json** takes:
  - the 32 `test_dates.CASES`, with that test's today, 2026-11-19;
  - every fixture's date box (its text and backups), with today 2026-11-18;
  - five more cases with today 2026-11-18: ["Feb 29, 2024"], ["02/29/2026"], ["Sep10 2026"], ["2026/10/21"] and ["0ct 21 2026"].
- **fuzzy.json** takes:
  - **pairs:**
    - every fixture's `customer_name` text against each pack customer's name, both lower-cased;
    - the item descriptions of the 8 samples and svc_0000–0003 against the pack's descriptions, and their units against the pack's units, all lower-cased;
    - these pairs: ("", "abc"), ("abc", ""), ("", ""), ("dela cruz, juan", "juan dela cruz"), ("sample co", "sample company"), ("a a b", "a b"), ("ab", "abcdefghijklmnopqrstuvwxyz"), ("abc store", "xyz store") and ("ñiño's", "nino's");
  - **extract_one:**
    - the month queries `_month` makes from the fixtures' date texts, plus "jux", "maz", "0ct" and "sep", each against the 12 months;
    - every word `words_to_number` looks up in the fixtures' `amount_words`, against its number words;
  - **extract:**
    - `match_customer`'s ranking for every fixture's customer name: the name lower-cased, over `[id, name.lower()]` of the pack, limit 3;
    - a tie: "abc store" over `[["X1", "abc store"], ["X2", "abc store"], ["X3", "abd store"]]`, limit 3.
- **finalize.json** takes:
  - **`test_checks: <name>`:** the 12 `test_checks.CASES`;
  - **`fixture: <stem>`:** every aligned file in `core_expected`. Its raw is the reads (`{"text", "alts", "conf"}` by box name), plus `"terms"` and `"photo"`, which is the file's `quality`;
  - **`variant: <stem> <mutation>`:** the 8 samples and svc_0000–0003, each with the 6 mutations below. A mutation that doesn't apply to a stem is skipped.

| Mutation | The change to the fixture's raw |
|---|---|
| `no_date` | The `date` box is removed. |
| `slashes_dropped` | The date's text loses every "/", "-", ".", "," and space, and its backups. |
| `peso_sign` | "P" goes in front of the text of every `amount` box that has text. |
| `digit_lost` | `item1_amount`'s text loses its first digit. Only when it has 2 or more digits. |
| `walk_in` | `customer_name` and `customer_tin` are removed. |
| `terms_unclear` | `terms` is null. |

**The made-up lists:**
- Both files are UTF-8 with a byte order mark and CRLF line ends, as Excel saves "CSV UTF-8". A field holding a comma is quoted.
- **`parties.csv`:**
  - **Header:** `Code,Type *,Entity type,Registered name,Last name,First name,Middle name,Trade name,TIN *,Sub-street †,Street †,Barangay †,City / Municipality *,Province *,ZIP *,Contact number,Email,VAT status,Payment terms`.
  - **Rows:**
    - **the pack's 20 customers:** Code = id, Type "Customer", Entity type "Company", Registered name = name, TIN = tin, Street = address, City "Cauayan City", Province "Isabela", ZIP "3305", Contact number "0917 000 0000", Email "accounts@example.com", VAT status "VAT-registered", Payment terms "Cash";
    - **a supplier:** Code "S001", Type "Supplier", Entity type "Company", Registered name "Isabela Wholesale Trading", TIN "900-000-001-00000", Payment terms "On Account";
    - **a customer and supplier:** Code "B001", Type "Customer and Supplier", Entity type "Individual", Last name "Reyes", First name "Maria", Middle name "Santos", Trade name "Maria's Store", TIN "900-000-002-00000";
    - **a row with no name:** Code "X001", Type "Customer", everything else empty.
- **`items.csv`:**
  - **Header:** `Name,Unit,Price`.
  - **Rows:** the pack's 18 items, with prices written to 2 decimals with a thousands comma ("1,350.00").

- [ ] **Step 1: Make the branch, then write the failing test** in `test_export_check_fixtures.py`

  In `mybizmate-ocr/`, check that `git status` is clean and the branch is `master`, then run `git switch -c m3-edit-checks-lists-export`.

  The test calls `export()` into a temporary folder, with `core_expected` set to `mybizmate-ocr/fixtures/core/expected`. Then it checks:
  - `scan_pack.json` equals `data/scan_pack.json`, byte for byte.
  - Each of `test_dates.CASES` is in `dates.json`, with `(choice.date, choice.flagged)` equal to that test's expected pair.
  - Each of `test_checks.CASES` is in `finalize.json`, and its lambda holds on the exported `expected`.
  - There is a `fixture: <stem>` case for every aligned file, and at least 66 `variant:` cases.
  - Every pair's 7 scores equal what `fuzz_py`'s function of the same name gives. This is the pure-Python code the app ports, checked against the C++ that `postprocess.py` uses.
  - `numbers.json`'s `round` holds `[2.675, 2, 2.67]` and `[0.125, 2, 0.12]`, and its `fsum` holds ten 0.1s summing to 1.0.
  - `parties.csv` starts with the byte order mark, has CRLF line ends, and its header has "Contact number" and "Email".

- [ ] **Step 2: Run it and check that it fails**

  From `prototype/benchmark`, run `..\..\.venv\Scripts\python.exe test_export_check_fixtures.py`. Expected: it FAILS, because the module doesn't exist.

- [ ] **Step 3: Implement `export_check_fixtures.py`**

  Build each file from the inputs above. `main()` runs `export(APP, APP / "fixtures/core/expected")`. Write JSON with `ensure_ascii=False`, in UTF-8.

- [ ] **Step 4: Run the test, then the exporter**

  1. Run the test again. Expected: PASS, with "N of N right".
  2. Run `..\..\.venv\Scripts\python.exe export_check_fixtures.py`. It writes into `mybizmate-ocr/`.

- [ ] **Step 5: Commit** (in `mybizmate-ocr/`)

```bash
git add fixtures/checks fixtures/lists
git commit -m "test(fixtures): the checks' cases and made-up lists from the Python"
```

---

### Task 2: rapidfuzz in TypeScript

**Files:**
- Create: `lib/checks/fuzzy.ts`
- Test: `__tests__/checksFuzzy.test.ts`

**Interfaces:**
- **Consumes:** `fixtures/checks/fuzzy.json` (Task 1).
- **Produces:**

```ts
export type Scorer = (a: string, b: string) => number;
export function ratio(a: string, b: string): number;
export function partialRatio(a: string, b: string): number;
export function tokenSortRatio(a: string, b: string): number;
export function tokenSetRatio(a: string, b: string): number;
export function tokenRatio(a: string, b: string): number;
export function partialTokenRatio(a: string, b: string): number;
export function wRatio(a: string, b: string): number;
export function extractOne(query: string, choices: readonly string[], scorer: Scorer): [string, number, number] | null;
export function extract(query: string, choices: readonly (readonly [string, string])[], scorer: Scorer,
                        limit: number): [string, number, string][];  // [value, score, key], best first
```

- [ ] **Step 1: Write the failing tests**

```ts
const F = require('../fixtures/checks/fuzzy.json');
const SCORERS = { ratio, partial_ratio: partialRatio, token_sort_ratio: tokenSortRatio, token_set_ratio: tokenSetRatio,
  token_ratio: tokenRatio, partial_token_ratio: partialTokenRatio, WRatio: wRatio };

test('every pair scores like rapidfuzz', () => {
  for (const p of F.pairs)
    for (const [key, fn] of Object.entries(SCORERS)) expect([p.a, p.b, key, fn(p.a, p.b)]).toEqual([p.a, p.b, key, p[key]]);
});
test('extractOne picks like rapidfuzz: the first of equals', () => {
  for (const c of F.extract_one) expect(extractOne(c.query, c.choices, ratio)).toEqual(c.result);
});
test('extract ranks like rapidfuzz: equals keep their order', () => {
  for (const c of F.extract) expect(extract(c.query, c.choices, wRatio, c.limit)).toEqual(c.result);
});
test("ratio keeps rapidfuzz's arithmetic", () => {
  expect(ratio('abc', 'abd')).toBe(100 * (1 - 2 / 6));
});
```

- [ ] **Step 2: Run them and check that they fail**

  Run `npx jest __tests__/checksFuzzy.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement `lib/checks/fuzzy.ts`**

  Port `.venv/Lib/site-packages/rapidfuzz/fuzz_py.py` (version 3.14.6) function by function, and `extractOne` and `extract` from `process_py.py`.
  - **No processor and no score cutoff.** The callers lower-case their strings. A cutoff only skips work: it never changes the answer of the calls the checks make.
  - **Keep each formula's arithmetic as written:**
    - `ratio` and every partial window use Indel's `100 * (1 - dist / lensum)`, where `dist = lensum - 2 * LCS`;
    - `token_set_ratio`'s `_norm_distance` uses `100 - 100 * dist / lensum`;
    - WRatio multiplies by 0.95 first, then by the partial scale.
  - **`partialRatio`** follows `_partial_ratio_impl`:
    - its three loops of windows, with their first-character and last-character filters;
    - a strict `>`, so the first of equals wins;
    - when both strings have the same length, a second pass with them swapped.
  - **`extract`** sorts by score, best first. Equal scores keep their input order.

- [ ] **Step 4: Run the tests and check that they pass**

  Run `npx jest __tests__/checksFuzzy.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/checks/fuzzy.ts __tests__/checksFuzzy.test.ts
git commit -m "feat(checks): rapidfuzz's scores in TypeScript, like the Python"
```

---

### Task 3: Numbers and dates

**Files:**
- Create: `lib/checks/num.ts`, `lib/checks/dates.ts`
- Test: `__tests__/checksNum.test.ts`, `__tests__/checksDates.test.ts`

**Interfaces:**
- **Consumes:** Task 2's `extractOne` and `ratio`; `fixtures/checks/numbers.json` and `dates.json`.
- **Produces:** `Box` and `DateChoice` (see "The shared shapes"), and:

```ts
// lib/checks/num.ts
export function pyRound(x: number, digits: number): number;
export function pySum(xs: readonly number[]): number;
export function close(a: number | null | undefined, b: number | null | undefined): boolean;  // |a - b| < 0.011
export function parseAmount(s: string | null | undefined): number | null;
export function candidates(box: Box | null | undefined): number[];
export function qtyValues(s: string | null | undefined): number[];
export function qtyCandidates(box: Box | null | undefined): number[];
export function wordsToNumber(s: string | null | undefined): number | null;
// lib/checks/dates.ts
export function parseDate(s: string | null | undefined): string | null;
export function dateRepairs(s: string | null | undefined): Map<string, number>;   // ISO date -> fewest changes
export function dateChoice(readings: readonly string[], today: string, maxAgeDays?: number): DateChoice;  // 180
export function localIsoDate(d: Date): string;   // the phone's own day, YYYY-MM-DD
```

- [ ] **Step 1: Write the failing tests**

```ts
const N = require('../fixtures/checks/numbers.json');
test('pyRound is Python round', () => {
  for (const [x, n, want] of N.round) expect(pyRound(x, n)).toBe(want);
  expect([0.125, 0.375, 0.005, 1.005, -0.125].map((x) => pyRound(x, 2))).toEqual([0.12, 0.38, 0.01, 1, -0.12]);
});
test("pySum is Python 3.12's sum", () => {
  for (const [xs, want] of N.fsum) expect(pySum(xs)).toBe(want);
  expect(pySum(Array(10).fill(0.1))).toBe(1);
});
test('amounts, quantities and words like the Python', () => {
  for (const [s, v] of N.parse_amount) expect([s, parseAmount(s)]).toEqual([s, v]);
  for (const [box, vs] of N.candidates) expect(candidates(box)).toEqual(vs);
  for (const [s, vs] of N.qty_values) expect([s, qtyValues(s)]).toEqual([s, vs]);
  for (const [s, v] of N.words_to_number) expect([s, wordsToNumber(s)]).toEqual([s, v]);
});
// checksDates.test.ts
const D = require('../fixtures/checks/dates.json');
test('every date case like the Python', () => {
  for (const c of D.cases) {
    expect(c.readings.map(parseDate)).toEqual(c.parse);
    expect(c.readings.map((r: string) => Object.fromEntries(dateRepairs(r)))).toEqual(c.repairs);
    expect([c.readings, dateChoice(c.readings, c.today)]).toEqual([c.readings, c.choice]);
  }
});
test("localIsoDate uses the phone's own day", () => {
  expect(localIsoDate(new Date(2026, 10, 20, 7, 30))).toBe('2026-11-20');
  expect(localIsoDate(new Date(2026, 0, 5, 0, 1))).toBe('2026-01-05');
});
```

- [ ] **Step 2: Run them and check that they fail**

  Run `npx jest __tests__/checksNum.test.ts __tests__/checksDates.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement `pyRound` and `pySum`**

  Python rounds the exact binary value of x. `toFixed` does the same, except on an exact tie, where Python goes to the even neighbour:

```ts
export function pyRound(x: number, digits: number): number {
  const scale = 10 ** digits;
  const n = x * 2 * scale;   // on an exact tie, n is an odd multiple of 5^digits and x is exactly n / (2 * scale)
  if (Number.isInteger(n) && n % 2 !== 0 && n % 5 ** digits === 0 && n / (2 * scale) === x) {
    const down = (n - 1) / 2;
    return (down % 2 === 0 ? down : down + 1) / scale;
  }
  return Number(x.toFixed(digits));
}
export function pySum(xs: readonly number[]): number {   // CPython 3.12's builtin sum() over floats
  if (xs.length === 0) return 0;
  let sum = xs[0];
  let c = 0;
  for (let i = 1; i < xs.length; i++) {
    const t = sum + xs[i];
    c += Math.abs(sum) >= Math.abs(xs[i]) ? sum - t + xs[i] : xs[i] - t + sum;
    sum = t;
  }
  return c !== 0 && Number.isFinite(c) ? sum + c : sum;
}
```

- [ ] **Step 4: Implement the rest of `num.ts` and `dates.ts`**

  Port `postprocess.py`'s functions line by line:
  - `parse_amount`, `candidates`, `qty_values`, `qty_candidates`, `words_to_number` and `close`;
  - `_month`, `_make_date`, `_numeric_date`, `parse_date`, `_splits`, `date_repairs` and `date_choice`.

  Some details:
  - `float(s)` becomes `Number(s)`.
  - `words_to_number` and `_month` look words up with Task 2's `extractOne(…, ratio)`, at 75 and 60.
  - `itertools.product` becomes an odometer over the options.
  - `date_choice`'s `min` compares the tuples `[cost, i, age, iso]` element by element.
  - Ages count days in UTC: `Date.UTC(y, m - 1, d) / 86_400_000`.
  - A valid date has a year from 1 to 9999 and follows the Gregorian leap years. `isoformat` pads the year to 4 digits.
  - `localIsoDate` uses `getFullYear`, `getMonth` and `getDate`, never `toISOString`.

- [ ] **Step 5: Run the tests and check that they pass**

  Run the same command. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/checks/num.ts lib/checks/dates.ts __tests__/checksNum.test.ts __tests__/checksDates.test.ts
git commit -m "feat(checks): amounts, quantities, words and dates, like the Python"
```

---

### Task 4: The checks: `finalize` in TypeScript

**Files:**
- Create: `lib/checks/finalize.ts`, `lib/checks/index.ts` (it re-exports `fuzzy`, `num`, `dates` and `finalize`)
- Test: `__tests__/checksFinalize.test.ts`

**Interfaces:**
- **Consumes:** Tasks 2 and 3; `fixtures/checks/finalize.json` and `scan_pack.json`.
- **Produces:** the `finalize` types in "The shared shapes", and:

```ts
export function matchCustomer(name: string, tinDigits: string, pack: Pack): [string, CustomerStatus];
export function matchItem(desc: string, pack: Pack, unit?: string | null, price?: number | null): [string | null, number];
export function finalize(raw: Raw, pack: Pack, today: string, maxAgeDays?: number): Final;   // maxAgeDays: 180
```

- [ ] **Step 1: Write the failing tests**

```ts
const PACK: Pack = require('../fixtures/checks/scan_pack.json');
const FZ = require('../fixtures/checks/finalize.json');
const toRaw = ({ terms = null, photo = null, ...boxes }: Record<string, any>): Raw => ({ boxes, terms, photo });

test('every case like the Python', () => {
  for (const c of FZ.cases) expect([c.name, finalize(toRaw(c.raw), PACK, FZ.today)]).toEqual([c.name, c.expected]);
});
test('a party is matched on the best of its names', () => {
  const juan = { id: 'P1', name: 'Juan Dela Cruz', tin: '111-222-333-00000' };
  expect(matchCustomer('jdc hardware', '', { customers: [{ ...juan, names: ['JDC Hardware'] }], items: [] }))
    .toEqual(['P1', 'auto']);
  expect(matchCustomer('jdc hardware', '', { customers: [juan], items: [] })[1]).not.toBe('auto');
});
```

- [ ] **Step 2: Run them and check that they fail**

  Run `npx jest __tests__/checksFinalize.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement `matchCustomer`, `matchItem` and `finalize`**

  Port `postprocess.py:233-267` and `:332-457` line by line, using Tasks 2 and 3. Some details:
  - **Ranking the customers** is `extract(name.toLowerCase(), …, wRatio, 3)` over `[id, name.toLowerCase()]`. When a customer has `names`, its score is the best over `[name, ...names]`, all lower-cased. Score each customer, then sort stably by score, best first, and take 3. With no `names`, this is the same as `extract`.
  - **The votes** are a `Map<number, Set<string>>` in insertion order. The winner is the first with the most sources, and `total_due` breaks ties, as the Python's `max` with the key `(len, "total_due" in sources)`.
  - **Every `sum` is `pySum`, and every `round` is `pyRound`.**
  - **The flags** are pushed exactly where the Python appends them. The photo flags come last.
  - **The four extra keys:**
    - `customer_status` is `matchCustomer`'s status;
    - `date_choice` is the `dateChoice` result;
    - `less` is the discount plus the withholding, as computed;
    - `gross` is `pyRound(total + less, 2)`, or null when there's no total.

- [ ] **Step 4: Run the tests and check that they pass**

  Run the same command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/checks __tests__/checksFinalize.test.ts
git commit -m "feat(checks): finalize in TypeScript, identical to the Python on every case"
```

---

### Task 5: The app's files, the lists and the settings

**Files:**
- Create: `lib/jsonFile.ts`, `lib/csv.ts`, `lib/lists.ts`, `lib/settings.ts`, `lib/startup.ts`, `test-utils/memoryFs.ts`
- Modify: `lib/scans.ts` (its file goes through `jsonFile`), `components/BrandSplash.tsx` (it loads the app's data and fixes the logo jump)
- Tests: `__tests__/jsonFile.test.ts`, `__tests__/csv.test.ts`, `__tests__/lists.test.ts`, `__tests__/settings.test.ts`, `__tests__/splash.test.tsx` (updated), and `__tests__/scans.test.ts` (its tests kept, on `memoryFs`)

**Interfaces:**
- **Consumes:** `parseAmount` (Task 3) and `Pack` (Task 4).
- **Produces:** `TaxType`, `Settings`, `Party`, `ListItem` and `Lists` (see "The shared shapes"), and:

```ts
// lib/jsonFile.ts — JSON files under Paths.document; path is relative ('lists.json', 'saved/<id>/scan.json')
export function readJson<T>(path: string): Promise<T | null>;  // null when missing or broken; `<path>.tmp` when only it is there
export function writeJson(path: string, value: unknown): Promise<void>;  // one write at a time per path: <path>.tmp, then
                                                                         // it replaces <path>; folders are made as needed
// lib/csv.ts
export function parseCsv(text: string): string[][];
// lib/lists.ts
export function lists(): Lists;
export function subscribeLists(listener: () => void): () => void;
export function loadLists(): Promise<void>;
export function partyName(p: Party): string;    // a company: its registered name; a person: "First Middle Last"
export function exportName(p: Party): string;   // a company: its registered name; a person: "Last, First Middle"
export function customersOf(l: Lists): Party[]; // type customer or both, in list order
export function suppliersOf(l: Lists): Party[]; // type supplier or both
export function packFor(l: Lists): Pack;        // customers named partyName, with names: [tradeName] when it has one;
                                                // items with description = name, and a null price as 0
export function formatTin(digits: string): string;  // 9, 12 or 14 digits -> 123-456-789, -000 or -00000; else as given
export class ListImportError extends Error { code: 'no_columns' }
export type ImportSummary = { added: number; updated: number; skipped: number; customers: number; suppliers: number };
export function importPartiesCsv(text: string, defaultType: 'customer' | 'supplier'): Promise<ImportSummary>;
export function importItemsCsv(text: string): Promise<ImportSummary>;
export function addParty(p: Omit<Party, 'id' | 'exportedAt'>): Promise<Party>;   // exportedAt starts null
export function addItem(i: Omit<ListItem, 'id'>): Promise<ListItem>;
export function clearParties(type: 'customer' | 'supplier'): Promise<void>;  // a 'both' party keeps its other side
export function clearItems(): Promise<void>;
// lib/settings.ts — defaults: { vatRegistered: null, revenueAccount: '', expenseAccount: '', atc: '' }
export function settings(): Settings;
export function subscribeSettings(listener: () => void): () => void;
export function loadSettings(): Promise<void>;
export function updateSettings(change: Partial<Settings>): Promise<void>;
// lib/startup.ts
export function loadAppData(): Promise<void>;   // recent scans, lists and settings; Task 9 adds the saved scans
// test-utils/memoryFs.ts — an in-memory expo-file-system for jest:
//   jest.mock('expo-file-system', () => require('../test-utils/memoryFs').memoryFs.module)
export const memoryFs: { module: object; files: Map<string, string | Uint8Array>; reset(): void };
```

`memoryFs` covers what the app uses:
- `new File(...)` and `new Directory(...)`, built from a `Directory` (or URI) and names;
- `uri`, `exists`, `write`, `text`, `bytes`, `delete`, `move`, `create` and `list`;
- `Paths.document` (`file:///docs/`) and `Paths.cache` (`file:///cache/`).

**CSV:**
- A leading U+FEFF is dropped.
- Fields are separated by commas. Records end at CRLF, LF or CR.
- A field that starts with `"` runs to its closing `"`. Inside it, `""` is one quote, and commas and line breaks are kept.
- Records whose fields are all empty are skipped.

**Reading the columns.** Headers are matched in lower case, with `*` and `†` dropped and spaces squeezed.
- **For parties, the app reads these columns:** `code`, `type`, `entity type`, `registered name`, `last name`, `first name`, `middle name`, `trade name`, `tin`, `sub-street`, `street`, `barangay`, `city / municipality`, `province`, `zip`, `vat status` and `payment terms`.
- **Every other column is skipped and never stored.** That includes Contact number, Email and RDO.
- **For items:** `name` (or `description`), `unit`, and `price` (or `list price`).
- **A file without the columns it needs** throws `ListImportError('no_columns')`:
  - parties need a registered name, last name or first name column;
  - items need a name or description column.

**Each party row:**
- **Type:** "customer" or "c" makes a customer; "supplier" or "s" a supplier; "customer and supplier", "both" or "b" both. A blank type takes `defaultType`.
- **Entity type:** read from its column. When it's blank, the party is an individual if it has a last or first name but no registered name; otherwise it's a company.
- **Name:** a company needs a registered name, and an individual a last or first name. A row without one is skipped.
- **Address:** sub-street, street, barangay, city, province and ZIP, the non-empty ones joined with ", ".
- **VAT status:** "nonvat" when it holds "not", "vat" when it holds "vat", else ''.
- **Payment terms:** "account" when it holds "account", "cash" when it holds "cash", else ''.
- **The TIN** is trimmed.
- **Updating a party that's already in the list:**
  - a row with the same code (non-empty, any case) updates that party and keeps its id;
  - otherwise, a row with the same first 9 TIN digits and the same `partyName` (any case) updates it;
  - otherwise, the row is added, with `fromScan` false and `exportedAt` null.
  - An update keeps the party's id and `exportedAt`, and sets `fromScan` to false. That way a party added from a scan picks up its MyBizMate code when the person imports MyBizMate's own list.
- **The counts:** `customers` and `suppliers` count the rows added or updated, by their type ('both' counts in each).

**Each item row:** the name is needed. The unit is trimmed. The price goes through `parseAmount`, and is null when it's blank. A row with the same name as a listed item (any case) updates that item.

**The splash.** `BrandSplash` calls `loadAppData()` in place of `loadRecent()`.

It also fixes milestone 2's deferred logo jump. The phone's splash draws the logo at 104 dp at the centre of the screen, and the brand splash now draws it in the same place:
- the logo is at 104 dp, with its centre at the screen's centre: `top: '50%'`, `marginTop: -52`;
- the logo doesn't move or fade in;
- only the wordmark and the tagline under it fade in and rise, with milestone 2's 450 ms animation.

**`lib/scans.ts`.** It reads and writes `recent.json` with `readJson` and `writeJson` (milestone 2's deferred minor: two quick saves no longer interleave).

- [ ] **Step 1: Write the failing tests**

  **`jsonFile.test.ts`** (memoryFs):
  - `two quick writes land in order`: `void writeJson('a.json', 1); await writeJson('a.json', 2)`, then `readJson('a.json')` is 2.
  - `a write cut short leaves the last good file`: a broken `a.json.tmp` next to a good `a.json` reads the good one.
  - `only the temp file: it is used`.
  - `a broken file reads as null`.

  **`csv.test.ts`:**

```ts
test('parses what Excel writes', () => {
  expect(parseCsv('﻿Name,Price\r\n"Rice, 25kg","1,350.00"\r\n\r\n"Say ""hi""",5\r\n'))
    .toEqual([['Name', 'Price'], ['Rice, 25kg', '1,350.00'], ['Say "hi"', '5']]);
  expect(parseCsv('a,b\n"x\ny",z')).toEqual([['a', 'b'], ['x\ny', 'z']]);
});
```

  **`lists.test.ts`** (memoryFs, with the text of `fixtures/lists/*.csv`):
  - `imports MyBizMate's parties columns`:
    - `importPartiesCsv(parties, 'customer')` returns `{ added: 22, updated: 0, skipped: 1, customers: 21, suppliers: 2 }`;
    - the first customer matches `{ code: 'C001', type: 'customer', entity: 'company', tin: '123-456-789-00000', terms: 'cash', vatStatus: 'vat' }`;
    - "B001" is `both`, an `individual`, and `partyName` gives "Maria Santos Reyes" and `exportName` "Reyes, Maria Santos".
  - `never keeps contact numbers or emails`: after the import, neither `lists.json` nor `JSON.stringify(lists())` contains "example.com" or "0917".
  - `the same code updates; the same TIN and name update; anything else is added`.
  - `no name column: no_columns`: `importPartiesCsv('A,B\n1,2', 'customer')` rejects with `{ code: 'no_columns' }`, and so does `importItemsCsv('Unit\npc')`.
  - `items`: `importItemsCsv(items)` adds 18 items, and "Rice 25kg" matches `{ unit: 'sack', price: 1350 }`.
  - `packFor`: it has 21 customers (customers and 'both'), and Reyes has `names: ["Maria's Store"]`.
  - `clearing customers keeps the suppliers, and a both party becomes a supplier`.
  - `formatTin`: '123456789' gives '123-456-789'; '123456789000' gives '123-456-789-000'; '12345678900000' gives '123-456-789-00000'; '12345' stays '12345'.
  - `the lists survive a restart`: after `jest.resetModules()`, `loadLists()` brings them back.

  **`settings.test.ts`:**
  - the defaults;
  - `updateSettings` writes `settings.json`;
  - `loadSettings` brings it back.

  **`splash.test.tsx`:**
  - milestone 2's two tests, with `loadAppData` mocked in place of `loadRecent`;
  - `the logo starts where the phone's splash drew it`: the logo (testID `splash-logo`) is 104 × 104, inside a view styled `top: '50%'`, `marginTop: -52`.

- [ ] **Step 2: Run them and check that they fail**

  Run `npx jest`. Expected: the new tests FAIL.

- [ ] **Step 3: Implement the modules, `memoryFs`, and the changes to `scans.ts` and `BrandSplash`**

  Build them as specified above. Every list or settings change bumps `Lists.version`, writes its file, and tells the subscribers.

- [ ] **Step 4: Run the checks**

  `npx jest`, `npx tsc --noEmit` and `npm run lint`: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib test-utils components/BrandSplash.tsx __tests__
git commit -m "feat(app): the lists and settings on the phone, CSV import, and files written one at a time"
```

---

### Task 6: The sale: the checks on a scan, with the app's rules

**Files:**
- Create: `lib/sale.ts`
- Modify: `lib/scans.ts` (a scan's edits, terms, kind, party and save), `lib/forms.ts` (`formFields`)
- Tests: `__tests__/sale.test.ts`, `__tests__/scans.test.ts`, `__tests__/forms.test.ts`

**Interfaces:**
- **Consumes:** Tasks 3–5: `finalize`, `pyRound`, `candidates`, `localIsoDate`, `packFor`, `customersOf`, `suppliersOf`, `partyName` and `exportName`.
- **Produces:** `Kind`, `PartyChoice`, `SaveDetails`, `StoredScan`, `PartyStatus` and `SaleView` (see "The shared shapes"), and:

```ts
// lib/scans.ts (adds; addScan keeps its call shape)
export function addScan(s: Pick<StoredScan, 'label' | 'source' | 'sampleId' | 'result'>): string;
  // the new fields start as: edits {}, terms null, kind 'sale', party null, saved null
export function getScan(id: string): StoredScan | undefined;   // the recent scans, then saved scans opened this session
export function updateScan(id: string, change: Partial<Pick<StoredScan,
  'edits' | 'terms' | 'kind' | 'party' | 'saved' | 'result'>>): StoredScan | undefined;
export function setEdit(id: string, box: string, text: string): void;
  // the text is trimmed; the box's own reading (or '' on a box that wasn't read) removes the edit
export function cacheScan(scan: StoredScan): void;  // keeps a saved scan opened from Saved invoices (Task 9)
// subscribeRecent now also fires on updateScan and cacheScan.
// lib/forms.ts (adds)
export function formFields(form: FormName): string[];
  // the template's boxes in order, without the checkboxes and amount_words2
// lib/sale.ts
export const SAMPLE_DAY = '2026-11-18';
export const VARIOUS_CUSTOMER = 'VARIOUS-CUST';
export const VARIOUS_SUPPLIER = 'VARIOUS-SUPP';
export function boxValue(scan: StoredScan, box: string): string | null;   // the edit, else the reading, else null
export function rawFromScan(scan: StoredScan): Raw;
export function checkDay(scan: StoredScan): string;                       // samples: SAMPLE_DAY; else localIsoDate(at)
export function suggestTaxType(kind: Kind, raw: Raw, vatRegistered: boolean | null): TaxType;
export function problemWords(final: Final, kind: Kind, supplierMissing: boolean): string[];
export function saleOf(scan: StoredScan, lists: Lists, settings: Settings): SaleView;
```

`loadRecent` gives older entries, saved by milestone 2 without the new fields, those fields' starting values.

**`rawFromScan`:**
- **A box that was read:** `{ text, alts }`, from the core's reading and backups.
- **An edited box:** `{ text: edit, alts: [] }`. An edit of '' leaves the box out, as if it were blank.
- **A box that wasn't read but was edited:** `{ text: edit, alts: [] }`.
- **`terms`:** the person's pick, else the scan's ticks.
- **`photo`:** `{ sharpness: pyRound(sharpness, 4), sharp_min: sharpMin, light: pyRound(light, 1), dark_max: darkMax }` when all four are known; otherwise null.

**`saleOf`:**
1. Run `finalize(rawFromScan(scan), pack, checkDay(scan))`. The pack is `packFor(lists)` for a sale, and `{ customers: [], items: [] }` for a purchase.
2. Take these flags out of its answer:
   - `customer_unsure` and `customer_new`, on a purchase, when the list has no customers, or when the person chose a party;
   - `item<N>` and `price<N>`, on a purchase or when the list has no items.
3. Fill in the party, from the tables below. "The name as written" is `boxValue(scan, 'customer_name')`, trimmed.
4. Fill in the rest:
   - `gross` is `final.gross`.
   - `discount` and `withholding` are their boxes' first candidates, or null when there is none or it's 0.
   - `taxType` is `suggestTaxType(kind, raw, settings.vatRegistered)`, following decision 2.
   - `listPrices` maps each item row to its matched item's list price, when the price is above 0.
   - `problems` is `problemWords(final, kind, status === 'missing')`.

On a sale:

| When | Status | Column | Shown |
|---|---|---|---|
| the person chose a list party that is still in the list | chosen | its code, else `exportName` | `partyName` |
| `matchCustomer` says `auto` | auto | its code, else `exportName` | `partyName` |
| `unsure` | unsure | the name as written | the closest party's `partyName` |
| `new`, with customers in the list | new | the name as written | the name as written |
| `new`, with no customers in the list | unlisted | the name as written | the name as written |
| `blank` | blank | `VARIOUS-CUST` | "Walk-in (VARIOUS)" |

On a purchase:

| When | Status | Column | Shown |
|---|---|---|---|
| a list party chosen | chosen | its code, else `exportName` | `partyName` |
| a name typed | typed | the name | the name |
| various suppliers | various | `VARIOUS-SUPP` | "Various suppliers" |
| nothing yet | missing | '' | "Not chosen yet" |

**`problemWords`**, in this order (`Checks.Sale.problems()`, plus the supplier):

| Flag | Words |
|---|---|
| blurry | Blurry photo (retake it) |
| dark | Dark photo (retake it) |
| date | Date |
| customer_unsure | Customer (confirm the match) |
| customer_new | Customer (not in your list) |
| a purchase with no supplier | Supplier (choose one) |
| terms | Terms |
| row`N`, item`N`, price`N` | "Row N math", else "Row N item", else "Row N price": one per row, rows in order |
| total | Total |
| total_rows | Rows vs total |
| any `check_*` | VAT breakdown (once) |

- [ ] **Step 1: Write the failing tests**

  **`sale.test.ts`:**
  - **The scans** come from `addScan` with `parseScanResult(coreJson(stem))`, as samples unless a test says otherwise.
  - **The clock** is pinned with `jest.useFakeTimers().setSystemTime(new Date(2026, 10, 18, 10, 0))`, so a scan that isn't a sample is also checked as of 2026-11-18. The later tasks' tests do the same.
  - **The lists** are either empty or made from the pack: one customer party per pack customer (code = its id) and one item per pack item.

  The tests:
  - `builds the raw the Python was given`: for every `fixture:` case in `finalize.json`, `rawFromScan` equals its raw, without `conf`.
  - `an edit replaces the reading and its backups; an empty edit removes the box; a blank box can be filled`.
  - `the date is checked against the day of the scan`:
    - a camera scan made at `new Date(2026, 10, 20, 7, 30)` has `checkDay` '2026-11-20';
    - a sample has '2026-11-18'.
  - `empty lists skip the list checks`: inv_0007's problems are `[]`, and its party is `unlisted`, with the name as written.
  - `with the pack's lists, the checks are the Python's`: for inv_0007, inv_0051 and svc_0000_blur, `final.flags` equals the fixture case's flags.
  - `a purchase doesn't check the customer boxes`: inv_0007 as a purchase, with the pack's lists:
    - the problems contain "Supplier (choose one)", and nothing that matches /Customer|Row \d+ (item|price)/;
    - the party is `{ status: 'missing', column: '' }`;
    - with `party: { various: true }`, it's `{ status: 'various', column: 'VARIOUS-SUPP' }`.
  - `two customers with the same name and no TIN on the paper: unsure, and the name as written goes out`. The lists hold "Santos Trading" twice: code C1 with TIN 900-000-011-00000, and code C2 with TIN 900-000-012-00000. On inv_0007, customer_name is edited to "Santos Trading" and customer_tin to ''. The party is `{ status: 'unsure', column: 'Santos Trading' }`.
  - `a chosen customer clears the customer checks and exports its code`: `party: { listId: <C2's id> }` gives `{ status: 'chosen', column: 'C2' }`, and no "Customer" problem.
  - `matched by TIN and name`: customer_tin edited to C1's TIN gives `{ status: 'auto', column: 'C1' }`.
  - `no name or TIN: the walk-in customer`: inv_0041 gives `{ status: 'blank', column: 'VARIOUS-CUST' }`.
  - `the Service Invoice's gross is before the discount`: on svc_0002, `gross` is `pyRound(final.total_due + 77.95, 2)` and `discount` is 77.95. With withholding edited to "50.00", `withholding` is 50.
  - `suggestTaxType`:
    - a sale with VAT amounts by a business that isn't VAT-registered: NONVAT;
    - a VAT-registered sale with only zero-rated amounts: ZERO, and only VAT-exempt amounts: EXEMPT;
    - a purchase with no VAT boxes: NONVAT; with a VAT amount: VAT;
    - a sale before the question: the purchase rule.
  - `problemWords keeps the test app's order`: the flags `['total', 'row2', 'check_vat', 'terms', 'date', 'blurry', 'check_add_vat']` give `['Blurry photo (retake it)', 'Date', 'Terms', 'Row 2 math', 'Total', 'VAT breakdown']`.
  - `an amount edited to letters still checks`: item1_amount edited to "abc" doesn't throw, and the problems contain "Row 1 math".

  **`scans.test.ts`** (memoryFs):
  - `edits, terms, kind and party are kept, and come back after a restart`;
  - `a scan saved by milestone 2 loads with no edits, as a sale`;
  - `the reading itself removes the edit`.

  **`forms.test.ts`:**
  - `formFields('sales_invoice')` has 65 boxes, starting with 'invoice_no';
  - `formFields('service_invoice')` has 39, starting with 'date', without 'amount_words2'.

- [ ] **Step 2: Run them and check that they fail**

  Run `npx jest`. Expected: the new tests FAIL.

- [ ] **Step 3: Implement `lib/sale.ts` and the changes to `scans.ts` and `forms.ts`**

  Build them as specified above. `formFields` reads `modules/scanner/assets/scanner/field_map.json` and `service_invoice.json` with `require`.

- [ ] **Step 4: Run the checks**

  `npx jest`, `npx tsc --noEmit` and `npm run lint`: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib __tests__
git commit -m "feat(app): a scan's sale: the checks with the person's edits, the lists, sale or purchase"
```

---

### Task 7: The Result screen: the sale, its checks, and fixing a box

**Files:**
- Modify: `app/result.tsx`, `components/StatusCard.tsx`, `components/BoxRow.tsx`, `lib/format.ts`
- Create: `components/SaleRow.tsx`, `components/BoxSheet.tsx`, `components/TermsSheet.tsx`, `components/Segmented.tsx`
- Tests: `__tests__/result.test.tsx` (rewritten around the sale; milestone 2's tests of the views, saving the image, full screen, Retake and the footnotes are kept), `__tests__/format.test.ts`

**Interfaces:**
- **Consumes:** Task 6's `saleOf`, `boxValue`, `setEdit`, `updateScan` and `formFields`; Task 5's `subscribeLists` and `subscribeSettings`.
- **Produces:**

```ts
// lib/format.ts (adds)
export function peso(v: number | null): string;           // '₱1,575.00'; null -> '—'
export function qty(v: number | null): string;            // up to 2 decimals, with thousands commas: '1,500', '0.5', '0.33';
                                                          // null -> '?'
export function prettyDate(iso: string | null): string | null;  // 'Oct 21, 2026'
// components
export function StatusCard(props: { result: ScanResult; problems: string[] | null }): JSX.Element;  // null: not aligned
export function SaleRow(props: { label?: string; value: string | null; sub?: string | null; flagged?: boolean;
  amount?: string; onPress?: () => void }): JSX.Element;
export function BoxSheet(props: { visible: boolean; title: string; scan: StoredScan; boxes: readonly string[];
  onClose: () => void; children?: ReactNode }): JSX.Element;   // children: more under the boxes (Task 8)
export function TermsSheet(props: { visible: boolean; scan: StoredScan; onClose: () => void }): JSX.Element;
export function Segmented<T extends string>(props: { options: readonly { value: T; label: string }[]; value: T;
  onChange: (v: T) => void }): JSX.Element;
```

`peso`, `qty` and `prettyDate` format by hand, like `formatClock`, because Hermes' `Intl` can differ.

**The Result screen.** It reads the scan, the lists and the settings with `useSyncExternalStore` (`subscribeRecent`, `subscribeLists`, `subscribeSettings`). The sale is a `useMemo` of `saleOf`, so every edit runs the checks again at once.

When the form is found, the screen shows, top to bottom:

**1. StatusCard** (`ResultActivity.showSale`)

| When | Title | Body | Style |
|---|---|---|---|
| Not aligned | (as in milestone 2) | | |
| No problems | "Ready to post" | "Every check passed. Read on this phone in <t>, offline." | pine |
| Problems | "1 thing to check" / "N things to check" | "Check: <problems joined with ', '>.\nRead on this phone in <t>, offline." | amber |

**2. ScanImage**, unchanged.

**3. Sale or purchase**
- A section label, "THIS INVOICE IS", then a Segmented control: "A sale" | "A purchase". Changing it calls `updateScan(id, { kind })`.
- Under it, a caption:
  - a sale: "You issued it. It becomes a row in MyBizMate's Sales import."
  - a purchase: "Another business issued it to you. It becomes a row in MyBizMate's Purchases import."

**4. "INVOICE"**

| Row | Value | Sub | Flagged | Boxes in its sheet |
|---|---|---|---|---|
| the form's `number` | `invoice_no`, or "—" | — | no | invoice_no |
| Date | `prettyDate(date)`, else the date box's value | see below | the `date` flag | date |
| Customer (a sale) | `party.shown` | see below | unsure or new | customer_name, customer_tin, customer_address |
| Supplier (a purchase) | `party.shown` | see below | missing | (Task 8's sheet) |
| Sold to (a purchase) | the customer_name box's value, or "—" | "You, as the invoice names you" | no | customer_name, customer_tin, customer_address |
| Terms | the form's cash or account words, or "Unclear" | when unclear: "Tick <cash> or <account> clearly"; when picked: "Chosen by you" | the `terms` flag | (TermsSheet) |

The Date sub:
- a rebuilt date: "Read as “<the box's value>”, the slashes unclear. Check the date."
- another plausible date: "Could also be read as <prettyDate(other)>. Check the date."
- flagged with no date: "Couldn't make out a date"
- flagged otherwise: "Not a date in the last 6 months"

The Customer sub:
- auto: "TIN <the party's TIN> · matched in your customers"
- chosen: "Chosen from your customers"
- unsure: "Closest match. Tap to compare."
- new: "Not in your customer list"
- unlisted: "Add your customers in Your lists to check names"
- blank: "No customer written"

The Supplier sub:
- chosen: "From your suppliers"
- typed: "Not in your supplier list"
- various: "Exported as VARIOUS-SUPP"
- missing: "Printed at the top of the invoice: tap to choose it"

**5. The items.** The section label is "1 ITEM" or "N ITEMS". Each row of `final.items` shows:
- **the value:** its description, or "Item N";
- **the sub:** "<qty> × <peso(price)>", then " · doesn't add up" for its `row` flag, " · not in your item list" for its `item` flag, and " · your list price is <peso(listPrices[N])>" for its `price` flag;
- **the amount**, right-aligned: `peso(amount)`;
- **flagged:** any of the three flags;
- **its sheet's boxes:** the row's qty, unit, description, unit_price and amount, those the form has.

With no items, there's one row, "No items read".

**6. "TOTALS"**

| Row | Shown | Value | Sub | Flagged | Boxes |
|---|---|---|---|---|---|
| VATable sales | when the tax type is VAT, a `check_` flag is set, or one of its boxes was read or edited | `peso(vatable_sales)` | flagged: "A written VATable amount doesn't match the total" | check_vatable_sales or check_net_of_vat | vatable_sales, net_of_vat |
| VAT 12% | as above, for its own boxes | `peso(vat)` | flagged: "A written VAT doesn't match 12/112" | check_vat, check_less_vat or check_add_vat | vat, less_vat, add_vat |
| Zero-rated sales | when its first candidate is above 0 | `peso` of it | — | no | zero_rated |
| VAT-exempt sales | when its first candidate is above 0 | `peso` of it | — | no | vat_exempt |
| Total due | always | `peso(total_due)` | see below | total, total_rows or check_total_sales | total_due, total_due_2, total_sales, amount_figure, amount_words, discount, withholding, zero_rated, vat_exempt |
| Gross (VAT included) | when `less` > 0 | `peso(gross)` | "Before the discount and withholding tax. This goes to MyBizMate." | no | total_sales, discount, withholding |

Every box the form has is in at least one row's sheet, so every box can be fixed. Milestone 2's list of every box ("WHAT THE CAMERA SAW") gives way to these sections.

The Total due sub:
- `total`: "The written totals don't agree"
- `total_rows`: "The rows add up to <peso(their sum)>. Check each row's price and amount."
- `check_total_sales`: "Total sales doesn't match the total due"
- otherwise: "The written totals agree"

**7. The footnotes and the bottom bar**, as in milestone 2. Task 9 adds Save.

**A sheet lists only the boxes the form has**, in `formFields` order.

**BoxSheet.** Its title is the row's label. Its subtitle: "What the camera saw in each box. If a box was read wrong, type what it says."
- **Each box:**
  - its BoxRow: the label, the crop, and "Read as “…” · N% sure". A box that wasn't read shows "Empty box".
  - when it's edited: "You changed it to “<edit>”." in pine;
  - a text button, "Fix it" ("Add what it says" on an empty box).
- **Editing**, in the same sheet:
  - the box's label as the heading;
  - its crop, 72 dp tall;
  - "Read as “…” · N% sure";
  - "OTHER READINGS": a chip for each backup reading, plus the reading itself when the box is edited;
  - a TextInput (accessibilityLabel "What the box says") holding the edit, else the reading;
  - the note "Type exactly what is written, even if it looks wrong. The checks then show what doesn't add up.";
  - [Save] (primary) and [Cancel] (text).
- **A chip** puts its text in the input.
- **Save** calls `setEdit(scan.id, box, text)` and goes back to the boxes.

**TermsSheet.** Its title is "Terms". Its subtitle is one of:
- "On the paper: <cash> is ticked."
- "On the paper: <account> is ticked."
- "On the paper, neither box is clearly ticked."

It has two options, "<cash>" and "<account>", with the chosen one marked. When the person has picked one, a third option shows: "Use the tick on the paper". Choosing calls `updateScan(id, { terms })` (null for the paper's tick) and closes the sheet.

- [ ] **Step 1: Write the failing tests**

  **`result.test.tsx`** (memoryFs, with the scanner module and expo-router mocked as in milestone 2):
  - `ready to post`: Sample 0007 with empty lists shows "Ready to post", and "Every check passed. Read on this phone in …, offline.".
  - `fix a box, and the checks run again`: on Sample 0007, the steps are:
    1. press "Date";
    2. press "Fix it";
    3. type "13/45/2026";
    4. press "Save".

    The card then shows "1 thing to check" and "Check: Date.", the sheet shows "You changed it to “13/45/2026”.", and the Date row shows "Couldn't make out a date".
  - `the box sheet`: pressing "SI no." shows "Read as “0007655” · 100% sure".
  - `a backup reading is a quick pick`: in Sample 0007's "Total due" sheet, the total_due box's chip "24.377" puts "24.377" in the input.
  - `an empty box can be filled`: in svc_0000's "Total due" sheet, the zero_rated box (not read) shows "Add what it says". Typing "100.00" there adds a "Zero-rated sales" row of ₱100.00.
  - `terms`:
    - with the scan's terms set to null (`show`'s `edit`), the row shows "Unclear" and "Tick Cash or On account clearly", and the problems include "Terms";
    - choosing "Cash" in the sheet shows "Cash" and "Chosen by you", and "Terms" leaves the card.
  - `a purchase`: pressing "A purchase" shows the Supplier row, "Not chosen yet", and "Sold to"; the card lists "Supplier (choose one)".
  - `the Service Invoice's gross`: svc_0002 shows "Gross (VAT included)" with `peso(total_due + 77.95)`.
  - `an item row`: it shows "<qty> × <price>" and its amount. With item1_amount edited to "1.00", it adds " · doesn't add up".
  - `a blurry photo`: inv_0051_blur's card starts its body with "Check: Blurry photo (retake it)".
  - Milestone 2's kept tests:
    - `no form`;
    - `a Service Invoice`: the subtitle "Service Invoice", and the Terms row "Cash sales" (svc_0000's tick);
    - `views`;
    - `save once`;
    - `save on Android 9`;
    - `full screen`;
    - `retake`;
    - `footnote`;
    - `sample footnote`.

  **`format.test.ts`:**
  - `peso(1575)` is '₱1,575.00', and `peso(null)` is '—';
  - `qty(0.5)` is '0.5', `qty(1500)` is '1,500', and `qty(1/3)` is '0.33';
  - `prettyDate('2026-10-21')` is 'Oct 21, 2026'.

- [ ] **Step 2: Run them and check that they fail**

  Run `npx jest`. Expected: FAIL.

- [ ] **Step 3: Implement the components, `format.ts` and `app/result.tsx`**

  Build them as specified above. `SaleRow` follows the test app's `Ui.row`:
  - a 104 dp label column (left out for items);
  - the value in 15 sp bold ink, and the sub in 12 sp, ember when flagged, else mute;
  - an amber dot when flagged;
  - a chevron when it can be tapped.

- [ ] **Step 4: Run the checks**

  1. `npx jest`, `npx tsc --noEmit` and `npm run lint`: PASS.
  2. `npx expo run:android`: Sample 0007 shows its sale, and fixing the Date box changes the card at once.

- [ ] **Step 5: Commit**

```bash
git add app/result.tsx components lib/format.ts __tests__
git commit -m "feat(app): the result shows the checked sale; any box can be fixed and the checks run again"
```

---

### Task 8: The customer, the supplier and new items

**Files:**
- Create: `components/PartyPicker.tsx`, `components/PartySheet.tsx`, `components/SupplierSheet.tsx`
- Modify: `app/result.tsx`, `components/BoxSheet.tsx` (an item's "Add to your items")
- Test: `__tests__/parties.test.tsx`

**Interfaces:**
- **Consumes:** Task 5's `addParty`, `addItem`, `customersOf`, `suppliersOf`, `partyName` and `formatTin`; Task 6's `updateScan`, `boxValue` and `saleOf`; Task 7's `BoxSheet`.
- **Produces:**

```ts
export function PartyPicker(props: { parties: readonly Party[]; placeholder: string; onPick: (p: Party) => void }): JSX.Element;
export function PartySheet(props: { visible: boolean; scan: StoredScan; sale: SaleView; onClose: () => void }): JSX.Element;
export function SupplierSheet(props: { visible: boolean; scan: StoredScan; sale: SaleView; onClose: () => void }): JSX.Element;
```

**PartyPicker**
- A TextInput with the placeholder.
- The parties whose `partyName`, trade name or code contains the text (any case), or whose TIN digits contain its digits.
- Each row shows `partyName` in bold, and "TIN <tin> · <code>" with the missing parts left out.
- Nothing found: "No match.".
- Tapping a row picks it.

**PartySheet** (the Customer row) is a BoxSheet titled "Customer", with the 3 customer boxes. Under them, a section labelled "IN YOUR CUSTOMERS":

| Status | Text | Buttons |
|---|---|---|
| auto | "<shown> · TIN <tin>" and "Matched by its TIN and name." | Choose another |
| chosen | "<shown> · TIN <tin>" and "You chose this customer." | Choose another |
| unsure | "Closest match: <shown> · TIN <tin>" | That's the one · Choose another · Add “<written>” as a new customer |
| new | "Not in your customer list." | Add “<written>” to your customers · Choose from your customers |
| unlisted | "Your customer list is empty. Import it in Your lists, or add this customer now." | Add “<written>” to your customers |
| blank | "No customer written. It's exported as VARIOUS-CUST, the walk-in customer." | Choose from your customers |

" · TIN <tin>" is left out when the party has no TIN.
- **"Choose another" and "Choose from your customers"** show a PartyPicker of `customersOf(lists)`, with the placeholder "Search your customers". Picking calls `updateScan(id, { party: { listId } })`.
- **"That's the one"** chooses the closest party.
- **Adding** calls `addParty` with:
  - `code: ''`, `type: 'customer'`, `entity: 'company'`;
  - `registeredName`: the name as written;
  - `tin`: `formatTin` of the TIN box's digits;
  - `address`: the address box's value;
  - `fromScan: true`, and the other fields ''.

  Then it chooses the new party, and toasts "Added to your customers.".

**SupplierSheet** (the Supplier row on a purchase). Title "Supplier". Subtitle "Who sold it to you: the business printed at the top of the invoice. The scanner doesn't read that part, so choose it here."
- A PartyPicker of `suppliersOf(lists)`, with the placeholder "Search your suppliers", when the list has any.
- A row "Various suppliers", with "Exported as VARIOUS-SUPP" under it. It sets `party: { various: true }`.
- A section labelled "NOT IN YOUR LIST?":
  - a TextInput (accessibilityLabel "Supplier's name");
  - [Use this name] sets `party: { name }`;
  - [Add to your suppliers] calls `addParty` (type 'supplier', the typed name as `registeredName`, `fromScan: true`), chooses it, and toasts "Added to your suppliers.".
- Choosing anything closes the sheet.

**An item not in the list.** On a sale, an item row's sheet shows a button when the row's `item_id` is null and it has a description: [Add “<description>” to your items]. It calls `addItem({ name: description, unit: the unit box's value or '', price: the row's unit price })`, then toasts "Added to your items.".

- [ ] **Step 1: Write the failing tests** (`parties.test.tsx`, memoryFs, with the made-up lists imported from `fixtures/lists/`)

  - `a matched customer`: Sample 0007's PartySheet says "Matched by its TIN and name.".
  - `choose another`: press "Choose another", type "santos", and press "Santos General Merchandise". The Customer row then shows it, with "Chosen from your customers".
  - `add a new customer`:
    1. Edit the customer's name to "Bagong Tindahan" and its TIN to "900-000-003".
    2. The sheet says "Not in your customer list.".
    3. Press "Add “Bagong Tindahan” to your customers".

    The toast shows; the list has the party with TIN '900-000-003' and `fromScan` true; the row shows "Chosen from your customers"; and no "Customer" problem is left.
  - `an empty customer list`: with no lists, the sheet says "Your customer list is empty. …".
  - `a supplier from the list`: as a purchase, open Supplier and type "wholesale". Pressing "Isabela Wholesale Trading" shows it in the row, with "From your suppliers".
  - `a typed supplier`: "Use this name" shows the name, with "Not in your supplier list".
  - `various suppliers`: the row shows "Various suppliers".
  - `search by TIN`: in the supplier picker, typing "900000002" finds "Maria Santos Reyes".
  - `add an item from a scan`: with an empty item list, Sample 0007's first item row's sheet has "Add “<its description>” to your items". Pressing it adds the item with the row's price.

- [ ] **Step 2: Run them and check that they fail**

  Run `npx jest __tests__/parties.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement the sheets and wire them into `app/result.tsx`**

  The Customer row opens the PartySheet, and the Supplier row the SupplierSheet.

- [ ] **Step 4: Run the checks**

  `npx jest`, `npx tsc --noEmit` and `npm run lint`: PASS.

- [ ] **Step 5: Commit**

```bash
git add components app/result.tsx __tests__/parties.test.tsx
git commit -m "feat(app): choose or add the customer or supplier, and add new items, from the result"
```

---

### Task 9: Saving: the import row, saved invoices and Settings

**Files:**
- Create: `lib/exportRows.ts`, `lib/saved.ts`, `components/Chips.tsx`, `components/SaveSheet.tsx`, `app/settings.tsx`
- Modify: `app/result.tsx` (Save and the saved line), `app/_layout.tsx` (the `settings` route), `lib/startup.ts` (`loadSaved`)
- Tests: `__tests__/exportRows.test.ts`, `__tests__/saved.test.ts`, `__tests__/save.test.tsx`, `__tests__/settings.test.tsx`

**Interfaces:**
- **Consumes:** Task 6's `saleOf`, `getScan`, `updateScan` and `cacheScan`; Task 5's `writeJson`, `readJson`, `settings` and `updateSettings`; Task 7's `qty`, `peso` and `prettyDate`.
- **Produces:** `ExportRow` and `SavedSummary` (see "The shared shapes"), and:

```ts
// lib/exportRows.ts
export const SALES_COLUMNS: readonly string[];     // the Sales import's 27 headers, A to AA, word for word
export const PURCHASE_COLUMNS: readonly string[];  // the Purchases import's 17 headers, A to Q
export type SaveBlock = 'sample' | 'no_form' | 'no_date' | 'no_total' | 'no_supplier';
export function saveBlock(scan: StoredScan, sale: SaleView | null): SaveBlock | null;
export function itemsDescription(final: Final): string;
export function exportRow(scan: StoredScan, sale: SaleView, details: SaveDetails): ExportRow;
// lib/saved.ts
export function savedList(): readonly SavedSummary[];    // the newest saved first
export function subscribeSaved(listener: () => void): () => void;
export function savedSummary(id: string): SavedSummary | undefined;
export function loadSaved(): Promise<void>;
export function saveScan(id: string, details: SaveDetails): Promise<void>;
export function openSaved(id: string): Promise<StoredScan | null>;
export function deleteSaved(id: string): Promise<void>;
export function markExported(ids: readonly string[], at: Date): Promise<void>;
// components
export function Chips<T extends string>(props: { label: string; options: readonly { value: T; label: string }[];
  value: T | null; onChange: (v: T) => void }): JSX.Element;
export function SaveSheet(props: { visible: boolean; scan: StoredScan; sale: SaleView; onClose: () => void }): JSX.Element;
```

**The headers**, word for word from the templates:
- `SALES_COLUMNS`: 'Date \*', 'Customer \*', 'Gross \*', 'Type \*', 'Revenue Account \*', 'CWT IT', 'CWT VT', 'Terms \*', 'SI/OR No.', 'Branch', 'CTYPE', 'Cash/Bank/Advance', 'Description', 'Discount', 'Beneficiary', 'ID No.', 'Statutory', "Child's Name", 'Term Type', 'Credit Days', 'Due Date', 'ID Type', 'Beneficiary TIN', 'Discount Prices', 'Cap Left', "Child's Birth Date", 'Particulars'.
- `PURCHASE_COLUMNS`: 'Date \*', 'Supplier \*', 'Gross \*', 'Type \*', 'Expense Account \*', 'EWT', 'WVAT', 'Terms \*', 'Inv No.', 'Branch', 'Cash/Bank/Advance', 'Description', 'Discount', 'Term Type', 'Credit Days', 'Due Date', 'Particulars'.

**`exportRow`.** Columns not listed here stay blank.

| Sales column | Purchases column | Value |
|---|---|---|
| Date \* | Date \* | `final.date` |
| Customer \* | Supplier \* | `sale.party.column` |
| Gross \* | Gross \* | `sale.gross`, as a number |
| Type \* | Type \* | `details.taxType` |
| Revenue Account \* | Expense Account \* | `details.account` |
| CWT IT | EWT | `details.atc`, only when `sale.withholding` is set |
| Terms \* | Terms \* | "Cash" or "On Account" |
| SI/OR No. | Inv No. | `final.invoice_no`, when it isn't '' |
| Description | Description | `itemsDescription(final)`, when it isn't '' |
| Discount | Discount | `sale.discount`, as a number, when it's set |

**`itemsDescription`** takes each item that has a description and writes "<qty(qty)> × <description>". An item with no quantity is just its description. The items are joined with "; ".

**`saveBlock`**, checked in this order:
- `sample` for a sample;
- `no_form` when the form isn't aligned or there's no sale;
- `no_date` when `final.date` is null;
- `no_total` when `gross` is null;
- `no_supplier` for a purchase whose party is `missing`.

**`saveScan(id, details)`:**
1. Get the scan and its `saleOf`. A save block throws `Error(block)`.
2. If the scan's folder is under `scans/` in `Paths.document`, move it to `saved/<id>/`. Then rewrite every file URI in its result (`scanDir`, `pageUri`, `originalUri` and each `cropUri`): the old folder's URI prefix becomes the new one's.
3. `updateScan(id, { result, saved: { savedAt: <now, ISO>, details } })`.
4. `writeJson('saved/<id>/scan.json', …)`: the scan, with `at` as ISO.
5. Write the summary into `saved.json`, replacing the old one. It holds:
   - id, kind and label;
   - `partyName`: `party.shown`;
   - `partyId`: the list party's id when the party is chosen or auto, else null;
   - `date`, `gross` and `row`;
   - `listed`: true when the party is chosen or auto and has a code, or is blank or various;
   - `savedAt`;
   - `exportedAt`: the old summary's, else null.
6. `updateSettings` with the account (`revenueAccount` on a sale, `expenseAccount` on a purchase) and, when it was typed, the ATC.

**The other functions:**
- **`loadSaved`** reads `saved.json`. It then indexes again any `saved/<id>/scan.json` that has no summary there: a save that was cut short.
- **`openSaved`** reads `saved/<id>/scan.json`, turns `at` back into a Date, and `cacheScan`s it. A missing file gives null.
- **`deleteSaved`** removes the folder, the summary, and the scan from the recent scans and the cache.
- **`markExported`** sets those summaries' `exportedAt`.
- **`loadAppData`** (Task 5) now also runs `loadSaved`.

**The SaveSheet**
- **Title:** "Save as a sale" / "Save as a purchase".
- **Subtitle:** "It becomes a row in MyBizMate's Sales import. Export it from Saved invoices." For a purchase, "Purchases import".
- **A summary:**
  - "Date": `prettyDate`;
  - "Customer" or "Supplier": `party.shown`. Add " (not in your list)" for new, unlisted and typed, and " (match not confirmed)" for unsure;
  - "Gross (VAT included)": `peso(gross)`;
  - "Discount": `peso`, when it's set.
- **"Your business is"** (on a sale, while `settings.vatRegistered` is null): Chips "VAT-registered" / "Not VAT-registered". Choosing calls `updateSettings({ vatRegistered })`, and the tax type follows.
- **"Tax type":** Chips with the values VAT, NONVAT, ZERO, EXEMPT and NA, labelled "VAT", "Non-VAT", "Zero-rated", "VAT-exempt" and "Not applicable". They start on `sale.taxType`.
- **"Revenue account" / "Expense account":** a TextInput with the placeholder "Code or name, as in MyBizMate", starting on the account in Settings.
- **"Terms":** Chips "Cash" / "On Account", starting on `sale.terms`, else the party's payment terms, else none.
- **"Withholding tax ATC"** (when `sale.withholding` is set): a TextInput, placeholder "e.g. WC158", starting on `settings.atc` and upper-cased. Under it: "The invoice shows <peso(w)> withheld. MyBizMate works out the tax from the ATC code."
- **When problems remain:** "1 thing is still marked to check. You can save anyway." / "N things are still marked to check. You can save anyway."
- **Buttons:**
  - "Save sale" / "Save purchase" (primary). It stays off until the account and the terms are set, and, on a sale, until the VAT question is answered.
  - "Cancel".
- **Saving** calls `saveScan`, closes the sheet, and toasts "Saved. Export it from Saved invoices.".

**On the Result screen**
- **The bottom bar:** Retake (outlined) and, when the form is found and it isn't a sample, a primary "Save sale" / "Save purchase". On a saved scan, it reads "Save changes".
- **Pressing Save while something blocks it** shows a toast:
  - no_date: "Add the date first: tap Date."
  - no_total: "Add the total first: tap Total due."
  - no_supplier: "Choose the supplier first: tap Supplier."
- **A sample** has no Save. Its footnote adds "Sample invoices are made up, so they can't be saved."
- **A saved scan** has a line over the bottom bar:
  - "Saved as a sale on <prettyDate(the day saved)>. Not exported yet."
  - "Saved as a sale on <…>. Exported <prettyDate(the day exported)>."
  - a purchase: "Saved as a purchase …".
- **`from=saved`** works like `from=recent` for Retake: it goes back.

**Settings** (`/settings`, header "Settings")
- A section labelled "EXPORTS TO MYBIZMATE".
- "Your business is": the same Chips as in the SaveSheet.
- Three TextInputs, each saved when it loses focus: "Revenue account for sales", "Expense account for purchases" and "Withholding tax ATC", with the SaveSheet's placeholders.
- The note: "These fill in what MyBizMate's import needs that isn't on the paper. You can change them on each invoice when you save it."

- [ ] **Step 1: Write the failing tests**

  **`exportRows.test.ts`:**
  - `the headers are the templates'`: `SALES_COLUMNS` and `PURCHASE_COLUMNS` equal the two lists above, with 27 and 17 entries.
  - `a sale's row`: inv_0007's result added with source 'camera' (so not a sample), the pack's lists, and `{ taxType: 'VAT', account: '4010', terms: 'account', atc: '' }`. The row equals, with every other column absent:
    - `'Date *'`: `final.date`;
    - `'Customer *'`: its matched party's code (`sale.party.listParty.code`);
    - `'Gross *'`: `final.total_due`;
    - `'Type *'`: 'VAT';
    - `'Revenue Account *'`: '4010';
    - `'Terms *'`: 'On Account';
    - `'SI/OR No.'`: '0007655';
    - `'Description'`: `itemsDescription(final)`.
  - `the Service Invoice's Gross is before the discount and withholding`: svc_0002, with withholding edited to "50.00" and an ATC of 'WC158':
    - `'Gross *'` equals `sale.gross` and `pyRound(final.total_due + final.less, 2)`;
    - `Discount` is 77.95;
    - `'CWT IT'` is 'WC158'.
  - `a purchase's row` uses 'Supplier \*', 'Expense Account \*', 'EWT' and 'Inv No.'.
  - `saveBlock`: a sample gives 'sample'; the date edited to "hello" gives 'no_date'; a purchase with no supplier gives 'no_supplier'.
  - `itemsDescription`: "10 × Detergent 1kg; 5 × Nails 2in", for the test_checks "plain invoice" case's final.

  **`saved.test.ts`** (memoryFs; the scan's folder made in memory under `docs/scans/123`):
  - `saving moves the scan's folder out of scans/ and rewrites its files' URIs`:
    - every URI in the result starts with `file:///docs/saved/<id>/`;
    - the old folder is gone;
    - `saved/<id>/scan.json` exists.
  - `the summary`: `savedList()[0]` matches `{ kind: 'sale', date, gross, listed: true }`.
  - `saving again keeps the export date`: `markExported`, then `saveScan` again: `exportedAt` stays.
  - `a save cut short is found again`: a `scan.json` with no summary is listed after `loadSaved`.
  - `openSaved and deleteSaved`.
  - `the account used becomes the default`.

  **`save.test.tsx`** (the Result screen with the SaveSheet):
  - `the first sale asks whether the business is VAT-registered`: "Not VAT-registered" selects "Non-VAT".
  - `Save stays off until the account and the terms are set`.
  - `saving`: the toast; the line "Saved as a sale on … Not exported yet."; and the button now reads "Save changes".
  - `a sample can't be saved`: there's no "Save sale", and the footnote line shows.
  - `the blocks`: the toasts for no date and no supplier.
  - `withholding asks for the ATC`: svc_0002 with withholding edited.

  **`settings.test.tsx`:** the fields show the settings, and editing the revenue account then leaving the field saves it.

- [ ] **Step 2: Run them and check that they fail**

  Run `npx jest`. Expected: FAIL.

- [ ] **Step 3: Implement the modules, the components, Settings and the Result changes**

  Build them as specified above. Use expo-file-system's `Directory.move` for the folder; check its behaviour in the SDK 58 docs, as AGENTS.md asks.

- [ ] **Step 4: Run the checks**

  1. `npx jest`, `npx tsc --noEmit` and `npm run lint`: PASS.
  2. On the emulator: save a camera test photo (`mybizmatescan://camera?test=inv_0051`) as a sale.

- [ ] **Step 5: Commit**

```bash
git add lib components app __tests__
git commit -m "feat(app): save a scan as a sale or a purchase, as a MyBizMate import row; Settings"
```

---

### Task 10: The export: .xlsx files, Saved invoices and sharing

**Files:**
- Create: `lib/zip.ts`, `lib/xlsx.ts`, `lib/exportFile.ts`, `components/ExportSheet.tsx`, `app/saved.tsx`, `test-utils/unzip.ts`
- Modify: `app/_layout.tsx` (the `saved` route), `package.json` and `package-lock.json`
- Run: `npx expo install expo-sharing`
- Tests: `__tests__/zip.test.ts`, `__tests__/xlsx.test.ts`, `__tests__/exportFile.test.ts`, `__tests__/savedScreen.test.tsx`

**Interfaces:**
- **Consumes:** Task 9's `savedList`, `subscribeSaved`, `openSaved`, `deleteSaved`, `markExported`, `SALES_COLUMNS` and `PURCHASE_COLUMNS`; Task 7's `peso` and `prettyDate`; Task 5's `lists`; Task 3's `localIsoDate`.
- **Produces:**

```ts
// lib/zip.ts
export function crc32(data: Uint8Array): number;   // unsigned
export function zipStored(files: readonly { name: string; data: Uint8Array }[], at: Date): Uint8Array;
// lib/xlsx.ts
export function columnLetter(index: number): string;    // 0 -> 'A', 25 -> 'Z', 26 -> 'AA'
export function workbook(sheetName: string, columns: readonly string[], rows: readonly ExportRow[], at: Date): Uint8Array;
// lib/exportFile.ts
export type ExportRange = 'new' | 'this_month' | 'last_month' | 'all';
export function exportChoice(kind: Kind, range: ExportRange, today: Date): SavedSummary[];
export function partiesToCheck(rows: readonly SavedSummary[], l: Lists): string[];
export function exportFileName(kind: Kind | 'parties', today: Date): string;  // 'MyBizMate Sales import 2026-11-20.xlsx';
                                                       // 'Purchases import' and, for Task 11, 'Parties import'
export function writeExport(kind: Kind, rows: readonly SavedSummary[], now: Date): Promise<string>;  // a file:// URI
// test-utils/unzip.ts
export function unzipStored(bytes: Uint8Array): { name: string; data: Uint8Array; crcOk: boolean }[];
```

**The zip** is stored (method 0, no compression), and every number in it is little-endian. In order:
1. **Each file:** a local header, then the file's data. The header holds:
   - the signature 0x04034b50;
   - version 20, and flags 0x0800 (UTF-8 names);
   - method 0, and the DOS time and date from `at`;
   - the CRC-32, the sizes and the name's length, with extra 0;
   - then the name.
2. **The central directory:** one header per file. It holds:
   - the signature 0x02014b50;
   - "made by" 20 and "needed" 20, flags 0x0800, and method 0;
   - the same time, date, CRC and sizes, and the name's length;
   - extra, comment, disk and attributes all 0;
   - the offset of the file's local header;
   - then the name.
3. **The end record:**
   - the signature 0x06054b50;
   - disks 0 and 0;
   - the count of files, twice;
   - the directory's size and offset;
   - a comment of 0.

The CRC-32 uses the reversed polynomial 0xEDB88320.

**The workbook's parts**, in UTF-8:

| Part | What it holds |
|---|---|
| `[Content_Types].xml` | Defaults for `rels` (application/vnd.openxmlformats-package.relationships+xml) and `xml` (application/xml). Overrides for `/xl/workbook.xml` (application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml) and `/xl/worksheets/sheet1.xml` (application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml). |
| `_rels/.rels` | rId1, of type `http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument`, targeting `xl/workbook.xml`. |
| `xl/workbook.xml` | One sheet: name = `sheetName`, sheetId 1, `r:id` rId1. |
| `xl/_rels/workbook.xml.rels` | rId1, of type `…/relationships/worksheet`, targeting `worksheets/sheet1.xml`. |
| `xl/worksheets/sheet1.xml` | Row 1 holds the columns. Then comes one row per ExportRow, each value in its column's place. |

In the sheet:
- **A text cell:** `<c r="B2" t="inlineStr"><is><t xml:space="preserve">…</t></is></c>`. Its text has `& < > " '` escaped, and control characters other than tab and newline removed.
- **A number:** `<c r="C2"><v>1575</v></c>`.
- **A blank cell** is left out.

The namespaces:
- the sheet: `http://schemas.openxmlformats.org/spreadsheetml/2006/main`;
- `r:`: `http://schemas.openxmlformats.org/officeDocument/2006/relationships`;
- the rels files: `http://schemas.openxmlformats.org/package/2006/relationships`.

**Choosing what to export: `exportChoice`.** It takes the summaries of that kind:
- `new`: those with no `exportedAt`;
- `this_month`: those whose invoice date is in today's month (on the phone's clock);
- `last_month`: those in the month before;
- `all`: every one.

They are sorted by invoice date, then by the time saved.

**The rest of `exportFile.ts`:**
- **`partiesToCheck`** gives the `partyName` of every row whose `listed` is false, once each, in order. It leaves out a row whose `partyId` names a party that already went out in a Parties import file (its `exportedAt` is set, Task 11).
- **`writeExport`** empties `Paths.cache/exports/`. Then it writes `workbook('Import', <the kind's columns>, rows' row, now)` as `exportFileName(kind, now)`, and returns the file's URI.

**Saved invoices** (`/saved`, header "Saved invoices")
- **When there are none:** "No saved invoices yet. Save a scan as a sale or a purchase, and it shows here, ready to export to MyBizMate."
- **One row per saved invoice**, the newest saved first:
  - `partyName`, in bold;
  - "<Sale | Purchase> · <prettyDate(date)> · <peso(gross)>";
  - on the right, "To export" in coralText, or "Exported" in mute.
- **Tapping a row** calls `openSaved`, then opens `/result?id=<id>&from=saved`. A missing one toasts "Couldn't open that invoice.".
- **Long-pressing a row** asks with an Alert: "Delete this saved invoice?", "It's removed from this phone. Files you already exported don't change.", [Cancel] [Delete]. Delete calls `deleteSaved`.
- **The bottom bar** has "Export sales" and "Export purchases" (outlined). Each opens the ExportSheet for its kind.

**The ExportSheet**
- **Title:** "Export sales" / "Export purchases".
- **Subtitle:** "A file in MyBizMate's Sales import format, to import at mybizmate.io." For purchases, "Purchases import".
- **Chips:** "Not exported yet" (the default), "This month", "Last month" and "All".
- **The summary:**
  - "1 sale · <peso(the gross total)>", "N sales · …", "1 purchase · …" or "N purchases · …";
  - when there's nothing: "Nothing to export for this choice."
- **When some were exported before:** "<k> of them were exported before. Importing them again adds them to MyBizMate twice."
- **When `partiesToCheck` isn't empty:** "Check that these are in MyBizMate before you import: <names joined with ', '>."
- **"Share the file"** (primary; off when there's nothing). It runs `writeExport`, then `Sharing.shareAsync(uri, { mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', dialogTitle: 'Send the file' })`.
- **After the share sheet closes**, an Alert asks "Did the file go where you wanted?", with the body "Mark these N sales as exported, so the next export leaves them out." (one: "Mark this sale as exported, …"). The buttons are [Not yet] and [Mark as exported].
  - [Mark as exported] calls `markExported(ids, now)` and toasts "Marked N sales as exported." (one: "Marked 1 sale as exported.").
  - Purchases use "purchase" and "purchases".
- **When sharing isn't available** (`isAvailableAsync` is false): the toast "This phone can't share files.". **A failure:** "Couldn't make the file.".

- [ ] **Step 1: Write the failing tests**

  **`zip.test.ts`:**
  - `crc32` of "123456789" is 0xcbf43926;
  - `zipStored`, read back with `unzipStored`, gives the same names and bytes, every `crcOk`, including a UTF-8 name.

  **`xlsx.test.ts`:**
  - `columnLetter` of 0, 25 and 26 gives 'A', 'Z' and 'AA'.
  - `workbook` has the 5 parts.
  - `xl/workbook.xml` names the sheet "Import".
  - In the sheet:
    - row 1 has 27 inline-string cells, A1 to AA1, with `SALES_COLUMNS`;
    - a number is written as `<v>1575</v>`;
    - "Tom & Jerry's <Store>" is escaped;
    - a control character is removed;
    - blank cells aren't written.

  **`exportFile.test.ts`** (memoryFs):
  - `exportChoice`:
    - with today 2026-11-01, 'last_month' is October;
    - with today 2026-01-10, 'last_month' is December 2025;
    - 'new' leaves out the exported ones;
    - they come oldest first.
  - `partiesToCheck`: unlisted names, once each; a party that went out in a Parties import file is left out.
  - `writeExport` writes one file, "MyBizMate Sales import 2026-11-20.xlsx", in `cache/exports`, and removes the older files there.

  **`savedScreen.test.tsx`** (expo-sharing and Alert mocked):
  - `no saved invoices`.
  - `rows and their tags`.
  - `export sales: share, then mark`:
    - `shareAsync` gets a URI ending in ".xlsx";
    - pressing "Mark as exported" toasts "Marked 2 sales as exported.";
    - the rows then read "Exported".
  - `"Not yet" keeps them for the next export`: the rows stay "To export".
  - `marked invoices leave the default export`: opening the sheet again shows "Nothing to export for this choice.".
  - `a choice with exported invoices warns`: "All" shows "2 of them were exported before. …".
  - `names to check`: an unlisted customer's name is in the warning.
  - `delete`: a long press, then Delete, removes the row.

- [ ] **Step 2: Run them and check that they fail**

  Run `npx jest`. Expected: FAIL.

- [ ] **Step 3: Install expo-sharing, and implement**

  Run `npx expo install expo-sharing`. Then implement the modules, the sheet and the screen as specified above.

- [ ] **Step 4: Run the checks**

  1. `npx jest`, `npx tsc --noEmit` and `npm run lint`: PASS.
  2. `npx expo run:android` builds; expo-sharing is new native code.

- [ ] **Step 5: Commit**

```bash
git add lib components app test-utils __tests__ package.json package-lock.json
git commit -m "feat(app): export saved invoices as MyBizMate's Sales and Purchases import files"
```

---

### Task 11: New customers and suppliers: a Parties import file

**Files:**
- Modify: `lib/lists.ts`, `lib/exportRows.ts`, `lib/exportFile.ts`, `components/ExportSheet.tsx`, `app/saved.tsx`
- Tests: `__tests__/partiesFile.test.ts`, and more cases in `__tests__/savedScreen.test.tsx`

**Interfaces:**
- **Consumes:** Task 5's lists; Task 9's `ExportRow`; Task 10's `workbook`, `exportFileName`, `unzipStored`, the ExportSheet and the Saved invoices screen.
- **Produces:**

```ts
// lib/lists.ts (adds)
export function newParties(l: Lists, includeSent: boolean): Party[];  // added from scans, with no code, in list order;
                                                                       // those already sent only with includeSent
export function markPartiesExported(ids: readonly string[], at: Date): Promise<void>;
// lib/exportRows.ts (adds)
export const PARTIES_COLUMNS: readonly string[];  // the Parties import's 25 headers, A to Y, word for word
export function partiesTin(tin: string): string;  // MyBizMate's 123-456-789-00000, or '' when it can't be made
export function partyRow(p: Party): ExportRow;
// lib/exportFile.ts (adds)
export function writePartiesExport(parties: readonly Party[], now: Date): Promise<string>;   // a file:// URI
export function newPartiesFirst(rows: readonly SavedSummary[], l: Lists): boolean;  // a row names a party not yet sent
```

**`PARTIES_COLUMNS`**, word for word from the template, with its `†` marks: 'Code', 'Type \*', 'Entity type', 'Registered name', 'Last name', 'First name', 'Middle name', 'Trade name', 'TIN \*', 'RDO', 'Sub-street †', 'Street †', 'Barangay †', 'City / Municipality \*', 'Province \*', 'ZIP \*', 'Contact number', 'Email', 'VAT status', 'Payment terms', 'Authorized representative', 'Representative title', 'Representative TIN', 'Trade type', 'Default branch'.

**`partiesTin`** works from the TIN's digits:
- 9 digits: the head office, "123-456-789-00000";
- 12 digits (a 3-digit branch): the branch padded to 5 digits, "123-456-789-00000" for "000";
- 14 digits: as they are, grouped;
- anything else: '', for the person to fill in.

**`partyRow`.** Columns not listed here stay blank. Code is left for MyBizMate to give.

| Column | Value |
|---|---|
| Type \* | "Customer", "Supplier" or "Customer and Supplier" |
| Entity type | "Company" or "Individual" |
| Registered name | a company's registered name |
| Last name, First name, Middle name | an individual's names |
| Trade name | when it has one |
| TIN \* | `partiesTin(tin)`, when it isn't '' |
| Street † | the address, when it has one |
| VAT status | "VAT-registered" or "Not VAT-registered", when set |
| Payment terms | "Cash" or "On Account", when set |

**`writePartiesExport`** works like `writeExport`: it empties `Paths.cache/exports/`, then writes `workbook('Import', PARTIES_COLUMNS, parties.map(partyRow), now)` as `exportFileName('parties', now)`, "MyBizMate Parties import 2026-11-20.xlsx".

**`newPartiesFirst`** is true when a row's `partyId` names a party that `newParties(l, false)` holds.

**The ExportSheet for parties** (its kind is now `Kind | 'parties'`):
- **Title:** "Export new customers and suppliers".
- **Subtitle:** "A file in MyBizMate's Parties import format, with the customers and suppliers you added from scans."
- **Chips:** "Not exported yet" (the default) and "All added from scans".
- **The summary:** "1 party" or "N parties"; with none, "Nothing to export for this choice."
- **A note, always shown:** "Before you import, fill in each one's City / Municipality, Province and ZIP, and its TIN where it's blank: MyBizMate needs them. Import this file before the sales and purchases that name them."
- **When some were sent before:** "<k> of them were exported before. Importing them again adds them to MyBizMate twice."
- **"Share the file"** shares it as the invoice files do. After the share sheet closes, the same Alert asks "Did the file go where you wanted?", with the body "Mark these N parties as exported, so the next file leaves them out." (one: "Mark this party as exported, …"). [Mark as exported] calls `markPartiesExported` and toasts "Marked N parties as exported." (one: "Marked 1 party as exported.").

**On the Saved invoices screen:** when `newParties(lists, true)` isn't empty, a text button, "Export new customers and suppliers", sits above the bottom bar, even when no invoice is saved. It opens the parties' ExportSheet.

**In the sales and purchases ExportSheet:** when `newPartiesFirst(rows, lists)`, the line of names to check ends with " Export new customers and suppliers first: they go in before this file."

- [ ] **Step 1: Write the failing tests**

  **`partiesFile.test.ts`** (memoryFs):
  - `the headers are the template's`: `PARTIES_COLUMNS` equals the list above, 25 entries.
  - `partiesTin`: '123456789' gives '123-456-789-00000'; '123-456-789-000' gives '123-456-789-00000'; '12345678900001' gives '123-456-789-00001'; '1234' gives ''.
  - `a company added from a scan`: `partyRow` of a customer company "Bagong Tindahan", TIN '900-000-003', address 'Purok 2, San Mateo' equals `{ 'Type *': 'Customer', 'Entity type': 'Company', 'Registered name': 'Bagong Tindahan', 'TIN *': '900-000-003-00000', 'Street †': 'Purok 2, San Mateo' }`.
  - `an individual who is both`: the last, first and middle names, and "Customer and Supplier".
  - `newParties`: only parties added from scans with no code; those already sent only with `includeSent`.
  - `writePartiesExport`: it writes "MyBizMate Parties import 2026-11-20.xlsx", whose sheet's row 1 holds `PARTIES_COLUMNS` (read back with `unzipStored`).
  - `MyBizMate's own list brings the code`: a party added from a scan, then `importPartiesCsv` of a row with the same name and TIN and a code. The party now has the code and `fromScan` false, and `newParties` no longer holds it.

  **`savedScreen.test.tsx`** (adds):
  - `export new customers and suppliers`: with one party added from a scan, the steps are:
    1. press "Export new customers and suppliers";
    2. the sheet shows "1 party" and the note;
    3. share, then press "Mark as exported".

    The toast says "Marked 1 party as exported.".
  - `marked parties leave the next Parties file`: opening the sheet again shows "Nothing to export for this choice.".
  - `the sales sheet says to send new parties first`: a saved sale naming a party added from a scan has "Export new customers and suppliers first: they go in before this file.".
  - `a party that went out is no longer a name to check`: after it's marked, that name leaves the sales sheet's line.

- [ ] **Step 2: Run them and check that they fail**

  Run `npx jest`. Expected: FAIL.

- [ ] **Step 3: Implement the additions to the lists, the rows, the file, the sheet and the screen**

  Build them as specified above.

- [ ] **Step 4: Run the checks**

  `npx jest`, `npx tsc --noEmit` and `npm run lint`: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib components app __tests__
git commit -m "feat(app): export new customers and suppliers as a MyBizMate Parties import file"
```

---

### Task 12: The lists screen, Home, and recent scans

**Files:**
- Create: `app/lists.tsx`
- Modify: `app/index.tsx`, `app/_layout.tsx` (the `lists` route), `components/RecentRow.tsx`
- Tests: `__tests__/listsScreen.test.tsx`, `__tests__/home.test.tsx`, `__tests__/recentRow.test.tsx`

**Interfaces:**
- **Consumes:** Task 5's lists functions and `ListImportError`; Task 6's `saleOf`; Task 9's `savedList` and `subscribeSaved`; Task 7's `Segmented` and `peso`.
- **Produces:** the `/lists` route.

**Your lists** (`/lists`, header "Your lists")
- **A Segmented control:** "Customers (<n>)", "Suppliers (<n>)", "Items (<n>)".
- **An intro for each:**
  - Customers: "Your scans' customers are matched against these names and TINs. In MyBizMate, export your parties, open the file in Excel or Google Sheets, save it as CSV, then import it here."
  - Suppliers: "The suppliers you choose from when you save a purchase. Import them the same way as customers."
  - Items: "Your items and their list prices. A row whose price is far from its list price is marked to check."
- **Buttons:**
  - "Import CSV" (outlined);
  - "Which columns?" (text), which opens a Sheet.
- **The "Which columns?" sheet:**
  - for parties, titled "Columns for customers and suppliers": "The first row names the columns, as in MyBizMate's Parties import: Code, Type, Entity type, Registered name, Last name, First name, Middle name, Trade name, TIN, Sub-street, Street, Barangay, City / Municipality, Province, ZIP, VAT status and Payment terms. Other columns are skipped. Contact numbers and emails are never kept."
  - for items, titled "Columns for items": "The first row names the columns: Name, Unit and Price."
- **The rows:**
  - a party: `partyName` in bold, then "TIN <tin> · <code>". A party added from a scan, with no code, ends that line with " · added from a scan", or " · sent in a Parties file" once it went out (Task 11);
  - an item: its name in bold, then "<unit> · <peso(price)>";
  - missing parts are left out;
  - an empty list: "No customers yet.", "No suppliers yet." or "No items yet.".
- **Clearing.** When the list has any, a text button in ember: "Clear customers" / "Clear suppliers" / "Clear items". It asks with an Alert: "Clear all customers?" (or suppliers, or items), "They're removed from this phone only.", [Cancel] [Clear].
- **Importing:**
  - It opens `File.pickFileAsync({ mimeTypes: ['*/*'] })`. A cancelled pick does nothing.
  - A file whose name doesn't end in ".csv" (any case) toasts "Choose a .csv file. In Excel or Google Sheets, save or download the sheet as CSV.".
  - Otherwise it reads the file's `text()`, then calls `importPartiesCsv(text, <the tab's type>)` or `importItemsCsv(text)`.
  - The toasts:
    - parties: "Imported <a> customers and <b> suppliers.", then " <k> rows skipped: no name." when some were skipped (with "1 customer", "1 supplier" and "1 row" for one);
    - items: "Imported <n> items." (with the same skipped part);
    - `no_columns` for parties: "That file has no Registered name, Last name or First name column. Use the columns of MyBizMate's Parties import.";
    - `no_columns` for items: "That file has no Name column.";
    - any other failure: "Couldn't read that file.".

**Home**
- **The ⋮ button now shows in every build.** Its menu:
  - "Saved invoices", to `/saved`;
  - "Your lists", to `/lists`;
  - "Settings", to `/settings`;
  - "Speed test", to `/speed`, in team builds only.
- **Under the scan card**, when there are saved invoices: a card row, "Saved invoices", with "<n> to export" (or "All exported") and a chevron. It goes to `/saved`.

**RecentRow**
- **Its status:**
  - "Form not found" when it isn't aligned;
  - "Saved as a sale" or "Saved as a purchase" when saved;
  - "1 to check" or "N to check" when there are problems;
  - otherwise "Ready to post".
- **Its icon:** a pine check when saved or ready, an ember error otherwise.
- **The problems** come from `saleOf(scan, lists(), settings())`.

- [ ] **Step 1: Write the failing tests**

  **`listsScreen.test.tsx`** (memoryFs; `File.pickFileAsync` mocked to give a file named "parties.csv" whose `text()` is `fixtures/lists/parties.csv`):
  - `import customers`:
    - the toast "Imported 21 customers and 2 suppliers. 1 row skipped: no name.";
    - "Customers (21)";
    - a row "Sample Company", with "TIN 123-456-789-00000 · C001".
  - `not a CSV`, and `no columns`: their toasts.
  - `items`: importing `items.csv` toasts "Imported 18 items.", and there's a row "Rice 25kg" with "sack · ₱1,350.00".
  - `clear`: after the Alert's Clear, "No customers yet."; the suppliers stay.
  - `which columns`: the parties' sheet text.

  **`home.test.tsx`:**
  - milestone 2's tests are kept;
  - `the menu in a client build` has "Saved invoices", "Your lists" and "Settings", and no "Speed test";
  - `the menu in a team build` also has "Speed test";
  - `the saved invoices row` shows "1 to export" and pushes `/saved`.

  **`recentRow.test.tsx`:** the four statuses.

- [ ] **Step 2: Run them and check that they fail**

  Run `npx jest`. Expected: FAIL.

- [ ] **Step 3: Implement `app/lists.tsx`, and the Home and RecentRow changes**

  Build them as specified above.

- [ ] **Step 4: Run the checks**

  `npx jest`, `npx tsc --noEmit` and `npm run lint`: PASS.

- [ ] **Step 5: Commit**

```bash
git add app components __tests__
git commit -m "feat(app): Your lists with CSV import; Home's menu, saved invoices and recent scans' status"
```

---

### Task 13: On the emulator, and the README

**Files:**
- Modify: `README.md` (milestone 3's features, the CSV columns, the export, and what was checked)

- [ ] **Step 1: Run every suite on the final tree**

  All of these must PASS:
  - `npx jest`, `npx tsc --noEmit` and `npm run lint`;
  - `npm run test:core` (the emulator running);
  - the Kotlin tests: from `android/`, with `JAVA_HOME` set to Android Studio's jbr, `./gradlew :scanner:testDebugUnitTest --console=plain`;
  - the exporter's test: from `prototype/benchmark`, `..\..\.venv\Scripts\python.exe test_export_check_fixtures.py`.

- [ ] **Step 2: Check on the emulator** (debug build)

  Record each result in the README.
  1. **The splash:** the logo stays put from the phone's splash to the brand splash.
  2. **Sample 0007:**
     - its sale's sections show;
     - fixing the Date box changes the card;
     - the Terms sheet works;
     - "A purchase" shows Supplier and Sold to;
     - a sample has no Save.
  3. **Your lists:**
     1. Push the made-up lists: `adb push fixtures/lists/parties.csv /sdcard/Download/`, and the same for `items.csv`.
     2. Import both from the picker's Downloads. Never screenshot the picker.
     3. Check the counts: 21 customers, 2 suppliers and 18 items.
  4. **Saving:**
     1. Open `mybizmatescan://camera?test=inv_0051`. The customer matches the list.
     2. Save it as a sale. The first save asks the VAT question; type an account.
     3. Saved invoices lists it as "To export".
  5. **The cleanup:** read 7 samples, then open the saved invoice from Saved invoices. Its crops, Enhanced and B&W still show.
  6. **The export:**
     1. Export sales, and cancel the share sheet. Answer "Not yet": the invoice is still "To export".
     2. Export again, share, and answer "Mark as exported": it's "Exported".
  7. **Read the file back**, without screenshots:
     1. Copy it out, in Git Bash (PowerShell's `>` changes the bytes): `adb exec-out run-as com.mybizmate.scan sh -c 'cat cache/exports/*.xlsx' > <scratch>/sales.xlsx`.
     2. With a short stdlib script in the session's scratch folder (not in the repo), check that `zipfile.ZipFile(<file>).testzip()` is None.
     3. Check that its `xl/worksheets/sheet1.xml` row 1 holds the same texts as the Sales template's (`docs/mybizmate-templates/sales-import/sales-import-template.xlsx`, read the same way).
  8. **New customers and suppliers:**
     1. On another camera test photo, edit the customer's name to "Bagong Tindahan", add it to your customers, and save the sale.
     2. On Saved invoices, the sales sheet says to export new customers and suppliers first.
     3. Export new customers and suppliers, share, and mark it.
     4. Read the file back as in step 7. Its row 1 holds the same texts as the Parties template's (`docs/mybizmate-templates/parties-import/parties-import-template.xlsx`), and row 2 is "Bagong Tindahan" with City, Province and ZIP blank.
  9. **Settings:** change the revenue account. The next save sheet starts with it.

- [ ] **Step 3: MyBizMate's own importer (only with the user's go-ahead in chat)**

  Run this only if the user says yes. If the user would rather do it, or says no, record the check as still open.
  1. Save one more camera test photo with its customer's name and TIN cleared, so it exports as VARIOUS-CUST.
  2. Export it.
  3. Import it into MyBizMate's test company ("Sales Bizmate") in the user's browser.
  4. Check that the import reads every column, and the Gross it shows.
  5. If the user also wants the Parties file checked: fill in City, Province and ZIP in step 8's file with a spreadsheet app, import it into the same test company, then import a sale that names "Bagong Tindahan", and check that MyBizMate matches it by name.
  6. Delete the imported test entries if MyBizMate allows it.

- [ ] **Step 4: Update the README**
  - milestone 3's features: the checks, fixing boxes, the lists and their CSV columns, sale or purchase, saving, and the three exports with how to import them (the new customers and suppliers first, then the sales and purchases);
  - the made-up lists for testing;
  - what's still open: milestone 2's real-phone checks, and the MyBizMate import if Step 3 wasn't done.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: milestone 3's features, the lists' columns, the export, and what was checked"
```

After this task: a whole-branch review on the most capable model. Then the user decides when to merge into `master` and push.
