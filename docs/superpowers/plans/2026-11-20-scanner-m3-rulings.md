# Milestone 3: rulings and deferred minors

Every decision made while executing `2026-11-20-scanner-m3-edit-checks-lists-export.md` (Native, 2026-11-20), copied from the execution ledger before it was deleted. Branch `m3-edit-checks-lists-export` in `mybizmate-ocr/`, made from master 7650d2e; head 7478e6b; merged into master as 36ea084 and pushed on 2026-11-20 (the branch was then deleted).

## Rulings, in the order they were made

- Task 1: Ruling: export_check_fixtures.py's main() also takes an optional app folder (default ../mybizmate-ocr) — lets the exporter write elsewhere without editing it — cost if wrong: none.
- Task 2: Ruling: Python's whitespace for str.split() is built with String.fromCharCode in a RegExp, not \u escapes in a regex literal — a written U+2028 ended the literal's line — cost if wrong: none.
- Task 3: Ruling: dateChoice keeps the smallest (cost, reading, age, iso) tuple as it goes, not a list then min — the same answer as Python's min(rebuilt) — cost if wrong: none. dayNumber uses the civil-from-days formula, not Date.UTC, which maps years 0-99 to 19xx — cost if wrong: none.
- Task 5: Ruling: a CSV row that updates a party keeps what its blank cells leave out (type, names, TIN, address, VAT status, payment terms), and a code match keeps the stored code — MyBizMate's own Parties notes say a blank keeps the party's value on an update — cost if wrong: an update can't blank out a field.
- Task 5: Ruling: memoryFs also exposes `dirs` (folders that exist) and keeps its store on globalThis — the scans test marks a kept folder, and a test that resets modules (a restart) must still find the files — cost if wrong: none (test-only).
- Task 5: Ruling: the splash's logo test uses testIDs splash-logo and splash-brand with StyleSheet.flatten — RNTL's style matchers aren't set up here — cost if wrong: none.
- Task 6: Ruling: the plan's test "an amount edited to letters still checks" expected "Row 1 math", but the Python's row repair fixes that row from qty x price when the rows still add up to the total — the test now checks the repair, then garbles the price too and expects "Row 1 math" — cost if wrong: none (the Python is the reference).
- Task 6: Ruling: on a sale, a customer the matcher calls new but with no name written (only a TIN) goes out as VARIOUS-CUST (status blank), so the required Customer column is never empty; the customer_new flag stays for the person to look at — cost if wrong: such a sale is booked to the walk-in customer.
- Task 7: Ruling: the emulator check in Step 4 (Sample 0007's sale, fixing the Date box) runs in Task 13's emulator pass, which lists the same check — this task changes only JavaScript (jest covers it), and Task 10 adds native code (expo-sharing) that needs one rebuild anyway — cost if wrong: an on-phone layout problem shows up in Task 13 instead of now.
- Task 7: Ruling: the result test's "an item row" garbles the unit price as well as the amount to get " · doesn't add up" — the Python's row repair fixes a row whose amount alone is wrong (as Task 6 found) — cost if wrong: none.
- Task 7: Ruling: added copy the plan didn't give: a box edited to nothing shows "You cleared it."; the auto customer's line is "Matched in your customers" when neither the party nor the paper has a TIN — cost if wrong: two lines of copy to change.
- Task 7: Ruling: the result test's show() makes sample scans by default (checked as of 2026-11-18), with source 'gallery' where milestone 2's tests need it — cost if wrong: none.
- Task 7: Ruling: the editor's Save and each box's Fix button carry testIDs (box-save, fix-<box>) — the scan view also has a "Save", and a sheet has a Fix button per box — cost if wrong: none.
- Task 8: Ruling: an item sheet's "Add to your items" is passed to BoxSheet as its children from app/result.tsx (BoxSheet itself is unchanged) — the plan named BoxSheet; children already carry extra content — cost if wrong: none.
- Task 8: Ruling: PartyPicker shows the first 50 matches, with "Showing the first 50. Type to find the others." under them — a business with thousands of parties would otherwise render them all in a sheet — cost if wrong: one line of copy.
- Task 8: Ruling: added tests "add a typed supplier to the list" (the plan's SupplierSheet behaviour without a named test) — cost if wrong: none.
- Task 9: Ruling: a scan's folder is moved to saved/<id>/ when its path ends in /scans/<name>, not by comparing it with Paths.document's URI — the core's file:// paths and expo-file-system's may spell the same files folder differently — cost if wrong: a folder elsewhere named scans/ would also be moved (the core writes only filesDir/scans).
- Task 9: Ruling: memoryFs's Directory.move now follows expo-file-system 58's Android code (FileSystemPath.getMoveOrCopyPath, read in node_modules): into the destination when it exists, else renamed to it when its parent exists — cost if wrong: none (test-only).
- Task 9: Ruling: added forgetScan(id) to lib/scans.ts (deleteSaved needs to drop the scan from the recent scans and the opened ones), a TextField component (the save sheet and Settings share it), and the toast "Couldn't save the invoice." for a save that fails — cost if wrong: one line of copy.
- Task 9: Ruling: the Settings screen's test is __tests__/settingsScreen.test.tsx — settings.test.ts is Task 5's store test — cost if wrong: none.
- Task 9: Ruling: a saved scan's save sheet starts on its saved details (tax type, account, terms, ATC), and its Save button reads "Save changes" — cost if wrong: none.
- Task 9: Ruling: the emulator check in Step 4 (saving a camera test photo) runs in Task 13 with the one native rebuild Task 10 needs — Task 13 also checks the saved scan's files after 7 more scans — cost if wrong: a folder-move problem on the phone shows up in Task 13.
- Task 9: Ruling: test-utils/today.ts pins only Date (timers stay real), so screens' tests still settle and camera scans are checked as of 2026-11-18 — cost if wrong: none.
- Task 10: Ruling: `npx expo install expo-sharing` also added its config plugin to app.json (and re-wrapped the permissions array); kept — the plugin's share-into-the-app part is off unless enabled (plugin/build/withShareExtension.js: android.enabled ?? false), so the app is no share target — cost if wrong: none.
- Task 10: Ruling: the build needs ANDROID_HOME set (C:\Users\Mico\AppData\Local\Android\Sdk): prebuild regenerated android/ for the new plugin, without local.properties; android/ is generated, so nothing was written there by hand — cost if wrong: none.
- Task 10: Ruling: Step 4's build passed (BUILD SUCCESSFUL); installing it on the emulator failed with INSUFFICIENT_STORAGE, milestone 2's known emulator gotcha, handled in Task 13 (uninstall the old build first) — cost if wrong: none.
- Task 10: Ruling: the Saved invoices screen shows its export buttons only when something is saved; one exported invoice reads "1 of them was exported before. Importing it again adds it to MyBizMate twice." (the plan's wording, made singular) — cost if wrong: two lines of copy.
- Task 11: Ruling: ExportSheet is split into InvoicesExport and PartiesExport sharing one share-then-ask helper (shareThenAsk), rather than branching inside one component — cost if wrong: none.
- Task 12: Ruling: a picked file counts as a CSV when its name ends in .csv (any case) OR its type is text/csv, text/comma-separated-values, application/csv or text/x-csv — the brief checks the name only, but expo-file-system 58's File.name is the basename of the URI and Android's Downloads can hand over content://…/document/msf%3A123, which has no .csv in it, so a name-only check would turn away real CSVs — cost if wrong: a non-CSV file that a provider labels as CSV gets read and ends in the no-columns toast instead of "Choose a .csv file".
- Task 12: Ruling: home.test's M2 test 'the team menu' (no ⋮ in a client build) is replaced by 'the menu in a client build' and 'the menu in a team build', and 'recent scans' now expects "Ready to post" in place of "Read" — the spec puts the ⋮ in every build and gives RecentRow new statuses; home.test also moves to memoryFs (saved.json for the saved row) and pins the day to 2026-11-20 so a gallery scan's date check can't drift — cost if wrong: none beyond the M2 wording the spec replaced.
- Task 12: Ruling: RecentRow says "Form not found" whenever the scan has no sale view (not aligned, or aligned with no form), the same condition as the scan screen's status card, so Home and the scan screen never disagree — cost if wrong: none; an aligned scan with no form can't be saved or checked either way.
- Task 12: Ruling: two quick presses on "Import CSV" open the picker once (a ref guard, tested), beyond the brief, like Home's scan flow — cost if wrong: none.
- Task 12: Ruling: lib/photoChecks.ts (and its test) now has no app user — the checks' finalize flags blurry/dark itself and RecentRow uses saleOf — kept as is, since removing it is cleanup outside this brief — cost if wrong: a dead module until it's removed.
- Task 13: Ruling: the emulator check found Settings' text fields saved only on blur (Task 9's plan: "saved when it's left"), so an account typed and left with the back arrow was lost (React Native calls no onBlur on unmount); fixed by saving each field as it's typed — test 'what was typed is kept when the screen is left from the field' RED ("4010") → GREEN, and Task 9's test now reads 'a field is saved as it is typed' — cost if wrong: a few more small settings.json writes while typing.
- Task 13: Ruling: the share sheet was dismissed with Back both times in step 6 (and in step 8), so no file was sent anywhere from the emulator; the app can't tell a dismissed sheet from a used one, and the Alert's answer is what the step checks — cost if wrong: none for the app; a real share target stays untried on the emulator.
- Task 13: Ruling: Step 3 (MyBizMate's own importer) wasn't run: it needs the user's go-ahead in chat, which this run doesn't have; recorded as still open in the README — cost if wrong: the import check waits for the user.

## Final review

- Final review: fresh reviewer (fable, read-only) on 7650d2e..49f257f — "With fixes": no Critical, 5 Important, 13 Minor; Focus 1–5 checked and sound.

### Fixed (each test failed first, then passed)

- Final: fixed I1 (matching too slow for long lists, on Home and on every edit; the CSV import quadratic) — 'checking inv_0051/svc_0000 against 3,000 customers and 1,000 items takes a moment' (2.5 s → 0.1 s per check), 'the checks run once for a scan as it stands, however many screens show it' and 'importing 5,000 parties takes a moment, not seconds' RED→GREEN, with the guard 'the fast common-subsequence count gives the plain one' (2,000 random pairs, the fixtures' parity unchanged), suite 212/212
- Final: fixed I2 (Excel's plain CSV, Windows-1252, lost every ñ) — "a file's bytes: UTF-8 as written, else Windows-1252 (Excel's plain CSV)", 'bytes that only look like UTF-8 at first are read as Windows-1252' and "a CSV saved by Excel's plain CSV keeps its ñ" RED→GREEN; on the emulator a Windows-1252 file imported "Parañaque Hardware" through File.bytes(), suite 212/212
- Final: fixed I3 (a saved invoice's later changes were shown but not exported, with no word) — 'a change after saving says the export still has the saved version' RED→GREEN, suite 212/212
- Final: fixed I4 (a sample's made-up names could be added to the lists and reach a Parties file) — "a sample's made-up names aren't added to the lists" RED→GREEN (Task 8's adding tests now use a camera scan), suite 212/212
- Final: fixed I5 (switching between a sale and a purchase kept the chosen party) — 'switching between a sale and a purchase drops the chosen party' RED→GREEN, suite 212/212

### Rulings on the review

- Final: Ruling: the speed tests time real work in jest with limits of 750 ms (one check) and 1 s (a 5,000-party import), against 0.1 s alone and 0.3 s beside the other suites now and 2.5 s before — a limit near the new times failed while the suites ran in parallel — cost if wrong: a much slower machine could fail them with no real regression.
- Final: Ruling: I3 is fixed with a notice ("Changed since it was saved. The export still has the saved version: tap Save changes.") rather than a re-save on every change — a re-save would rewrite an exported invoice's row while the person tries things, and a state that can't be saved (no date) couldn't be — cost if wrong: a person who ignores the notice exports the saved version.
- Final: Ruling: I4's copy: "Samples are made up, so their names aren't added to your lists." in place of the add buttons, and the empty-list note without "or add this customer now" on a sample — cost if wrong: two lines of copy.
- Final: Ruling: kept Task 6's ruling (a TIN written with no name goes out as VARIOUS-CUST) where the reviewer would block the save — such a paper is rare, the card still says "Customer (not in your list)", the person can type the name, and a block would stop a sale rightly booked to the walk-in customer — cost if wrong: such a sale is booked to VARIOUS-CUST unless the name is added.
- Final: Ruling: (declined to judge) the C++ core, camera and JNI — unchanged in this range — cost if wrong: none.
- Final: Ruling: (declined to judge) the fixture JSON contents — generated by the Python exporter, whose own test passes (9 of 9), and the ports match them — cost if wrong: a wrong fixture would hide a wrong port, both coming from the same Python.
- Final: Ruling: (declined to judge) whether MyBizMate's importer accepts the files — still open: Task 13's Step 3 needs the user's go-ahead (README, Still open) — cost if wrong: an import problem shows when the user first imports.
- Final: Ruling: (declined to judge) a real arm64 phone — still open, as milestone 2's checks, now with a few thousand parties' timing (README) — cost if wrong: phone-only problems.
- Final: Ruling: (declined to judge) when Sharing.shareAsync resolves on other Android skins — stands: if it never resolves nothing is marked, the safe side — cost if wrong: the "Did the file go…" question doesn't appear there.
- Final: Ruling: (declined to judge) iOS — out of scope (Android first; iOS is milestone 9) — cost if wrong: none now.
- Final: Ruling: (declined to judge) the new sheets' look and accessibility — checked by eye on the emulator (Your lists, the saved invoice) — cost if wrong: polish.
- Final: Ruling: (declined to judge) storage growth of saved/<id>/ — the plan leaves it to milestone 4 — cost if wrong: storage grows with saved invoices.
- Final: Ruling: (declined to judge) a blank ATC on an invoice with withholding exports no code — the plan makes the ATC optional, and the save sheet asks for it when withholding is read — cost if wrong: such a sale imports without its withholding code.
- Final: Ruling: (declined to judge) scan-added customers are always "Company" — the plan fixes that shape — cost if wrong: a person's name goes out as a registered name, fixable in the file before import.
- Final: Ruling: (declined to judge) semicolon-delimited CSVs — not a Philippine default — cost if wrong: such a file gets the no-columns toast.
- Final: Ruling: (declined to judge) an export staying in the app's private cache until the next one — private storage, replaced by the next export — cost if wrong: none known.
- Final: Ruling: (declined to judge) the README's wording — proofread in Task 13 — cost if wrong: wording.

## Deferred minors

- a save cut short between moving the scan's folder and writing scan.json loses the invoice and orphans the folder (write scan.json first).
- failed writes after "Mark as exported", a delete, a settings change or a clear reject unhandled: the change stays in memory only, with no toast.
- a saved index rebuilt from scan.json (saved.json unreadable) marks every invoice "To export" (keep exportedAt in scan.json too).
- loadLists and loadSaved throw on valid JSON of the wrong shape, which leaves the splash on its error.
- the before-8-a.m. test (localIsoDate) depends on the machine's timezone; pin TZ=Asia/Manila for jest.
- "Share the file" can open two shares, and "Add … to your customers" can add the same party twice, on two quick presses (state guards, not refs).
- a list TIN written with spaces never matches by TIN (the matcher strips only dashes; normalise to digits in packFor).
- a scan-added party with no TIN, or renamed in Excel, comes back from a CSV as a duplicate instead of gaining its code.
- Saved invoices renders every row in a ScrollView (not virtualised).
- the CSV parser opens a quoted field at a quote in the middle of an unquoted field (Excel and Sheets never write that).
- a VAT status of "Non-VAT" in a CSV reads as VAT-registered (only "not" is checked).
- the CSV gate can still turn away a real CSV that a provider labels text/plain or application/vnd.ms-excel with no .csv in its link (sniff the content instead).
- lib/photoChecks.ts and its test have no user now.
- a sale with a TIN but no name written shows "No customer written" in its Customer row while the card says "Customer (not in your list)".

## Pre-flight (shared interfaces)

- T1→T2: fuzzy.json {pairs, extract_one, extract} — matches T2's tests. OK.
- T1→T3: numbers.json {parse_amount, candidates, qty_values, words_to_number, round, fsum}, dates.json {cases[readings,today,parse,repairs,choice]} — matches. OK.
- T2→T3: extractOne(query, choices, ratio) for _month (60) and words (75). OK.
- T1+T2+T3→T4: finalize.json expected = Python dict + customer_status, date_choice, less, gross = Final type. OK.
- T3/T4→T5: parseAmount; Pack/PackCustomer.names for packFor. OK.
- T3/T4/T5→T6: pyRound, candidates, localIsoDate, finalize, packFor/customersOf/suppliersOf/partyName/exportName. OK.
- T5/T6→T7: saleOf, boxValue, setEdit, updateScan, formFields, subscribeRecent/Lists/Settings. OK.
- T5/T6/T7→T8: addParty takes Omit<Party,'id'|'exportedAt'> (Task 8's calls pass no exportedAt), addItem, BoxSheet children. OK.
- T5/T6/T7→T9: writeJson/readJson paths under Paths.document; qty/peso/prettyDate; SavedSummary.partyId set in saveScan. OK.
- T3/T5/T7/T9→T10: savedList, markExported, SALES/PURCHASE_COLUMNS, partiesToCheck(rows, lists) reads Party.exportedAt (always null until T11). OK.
- T5/T9/T10→T11: workbook, exportFileName(Kind|'parties'), unzipStored, ExportSheet kind widened to Kind|'parties'. OK.
- T5/T6/T7/T9→T12: lists functions, saleOf for RecentRow, savedList for Home. OK.
- Runtime assumption to verify in T9 step 4: Paths.document is the app's filesDir, the parent of the core's scans/ folder.

## MyBizMate's own importer (Task 13 Step 3, run 2026-11-20 at the user's go-ahead)

- Passed. A made-up sale (the synthetic `inv_0011` from the camera, its customer's name and TIN cleared) went out as `MyBizMate Sales import 2026-11-20.xlsx` and was imported into the test company "Sales Bizmate" (Sheets → Sales → Import) in the user's Brave.
- Map columns: MyBizMate matched every column the app writes by its header (Date, Customer, Gross, Type, Revenue Account, CWT IT, CWT VT, Terms, SI/OR No., Branch, CTYPE, Cash/Bank/Advance, Description, Discount, Beneficiary, ID No., Statutory, Child's Name, Particulars). The 8 it doesn't match automatically (Term Type, Credit Days, Due Date, ID Type, Beneficiary TIN, Discount Prices, Cap Left, Child's Birth Date) stayed unmapped; the app leaves them blank.
- Review: 1 new row, Ready, no errors or warnings, total ₱4,520.00. Done: "Imported 1 sales. 1 created · 0 updated · 0 skipped · 0 failed".
- The row in the Sales sheet: a draft (Ready, not posted), 10/11/2026, VARIOUS CUSTOMERS (from `VARIOUS-CUST`), Gross 4,520.00, NONVAT, Sales - Goods (from `4010`), CWT None, Cash, SI/OR No. 0000538, Branch Main, CTYPE Regular, Cash on Hand, the items' Description with its "×" intact, Flag OK.
- Ruling: the file was written by the app's own export code (saleOf → exportRow → workbook, with Not VAT-registered and the account 4010, as Sales Bizmate is non-VAT) in a jest run, not on the emulator — the emulator's adb shell stopped answering (about 300 orphaned adb clients of another tool, each running `dumpsys package com.google.android.gms`, piled up from 9:43 PM) — the phone's own export was already checked byte for byte in Task 13 — cost if wrong: a difference between the phone's file and jest's would go unseen.
- Not run: the Parties file part (step 5), which the user didn't ask for.
