# MyBizMate Scan

The MyBizMate Scan app: an Expo (React Native) app that reads handwritten MyBizMate Sales Invoices and Service
Invoices on the phone, offline. Its scanner is one C++ core (OpenCV 5.1.0 and ONNX Runtime 1.32.0, PP-OCRv6 small
cut to 98 Latin characters) inside a local Expo module, so Android and iPhone will read a photo the same way.

- Design: `../docs/2026-11-19-expo-scanner-design.md`
- Plans: milestone 1, `../docs/superpowers/plans/2026-11-19-scanner-m1-core-reads-a-photo.md`; milestone 2,
  `../docs/superpowers/plans/2026-11-20-scanner-m2-camera-and-both-forms.md`; milestone 3,
  `../docs/superpowers/plans/2026-11-20-scanner-m3-edit-checks-lists-export.md`
- MyBizMate's import templates, and which of the scanner's boxes go in which column: `../docs/mybizmate-templates/`
- The Python reference the core is checked against: `../prototype/benchmark/`

## What it does

### Reading a form (milestone 2)

- **The camera:** the live picture in 3:4 with the form's outline (the Sales Invoice by its 4 corner squares, the
  Service Invoice by its table), a status line ("MyBizMate Sales Invoice · hold still"), and the photo taken by
  itself once the outline holds still and sharp. Manual mode, the torch on phones that have one, the gallery from
  the camera, and the phone's own camera app when the scanner's camera can't be used (no permission, or a camera
  that won't start).
- **Both forms:** the Sales Invoice and the Service Invoice, every box read, with its crop, confidence and backup
  readings.
- **The photo checks:** a dark or blurry photo is the first thing to check, with a retake; a photo where no form is
  found says what to get in the picture. Turned and sideways photos are read upright.
- **The scan view:** the straightened page as Enhanced, B&W or the Original photo with the found outline; Save puts
  the page in Pictures/MyBizMate Scan.
- **Recent scans:** the newest 6, kept on the phone between launches; each opens its result again and says where it
  stands: Form not found, Saved as a sale (or a purchase), N to check, or Ready to post.
- **Samples:** 8 synthetic sample invoices to try without a form.
- **Brand splash:** the logo while the scanner loads and reads one sample, so the first real scan is quick.
- **Privacy:** nothing leaves the phone and nothing is logged. The app's files are kept out of Android's backups. A
  camera photo, or the gallery's copy of one, is deleted once read, whether or not it could be; any left by a closed
  app are cleared at the next start. Each kept scan's files (its page, crops and original) live in the app's own
  storage, the newest 6 only. A JPEG over twice the 2400 px cap is decoded smaller first, so a 50 MP photo doesn't
  need 150 MB.

### Checking, saving and exporting (milestone 3)

- **The checks** (`lib/checks/`): a TypeScript port of the Python's `postprocess.finalize`
  (`../prototype/benchmark/postprocess.py`, with rapidfuzz 3.14.6's scores and Python's rounding and `sum()`), the
  same as the Python on every fixture (`fixtures/checks/`). They check the date, the customer against your customers
  (by TIN, then by name), the terms, each row's quantity × price, each row's item and price against your items, the
  rows against the total, and the VAT breakdown. The status card lists what to check, or says "Ready to post". A
  sample is checked as of 2026-11-18, the day the samples were made; any other scan as of the day it was read. The
  name matching counts common subsequences bit-parallel, as rapidfuzz does, so long lists stay quick: against 3,000
  customers and 1,000 items, one check takes about 0.1 s on a laptop (it took 2.5 s before the final review).
- **Fixing a box:** tap any box and type what it says; the checks run again at once. Terms has its own sheet ("Cash"
  or "On account").
- **A sale or a purchase:** a scan is a sale, to the form's customer. "A purchase" asks who sold it: the business
  printed at the top of the invoice, which the scanner doesn't read, so it's chosen from your suppliers, typed, or
  "Various suppliers". The form's customer boxes then show as "Sold to". Switching between a sale and a purchase
  drops the party chosen for the other.
- **Your lists** (⋮ → Your lists): customers, suppliers and items, imported from CSV files and kept on the phone. In
  MyBizMate, export your parties, open the file in Excel or Google Sheets, save it as CSV, copy it to the phone, then
  Import CSV.
  - Customers and suppliers: MyBizMate's Parties import columns, by their header names: Code, Type, Entity type,
    Registered name, Last name, First name, Middle name, Trade name, TIN, Sub-street, Street, Barangay, City /
    Municipality, Province, ZIP, VAT status and Payment terms. Other columns are skipped, and contact numbers and
    emails are never kept. A row with no name is skipped; a blank Type takes the tab it's imported on. A row with a
    known code, or the same TIN and name, updates that party and keeps what its blank cells leave out.
  - Items: Name (or Description), Unit and Price (or List price). The same name updates the item.
  - A file picked from Android's Downloads may come as a link without its name, so a CSV is known by its name or by
    the type the phone gives it.
  - Excel's plain "CSV (Comma delimited)" (Windows-1252) and "CSV UTF-8", and Google Sheets' download, all keep their
    ñ: the file is read as UTF-8 when it is valid UTF-8, else as Windows-1252.
- **Saving** (Save, on a scan): the date, the customer or supplier, Gross (VAT included), the tax type (suggested
  from the VAT boxes and whether the business is VAT-registered, which the first save asks), the account (a code or
  name from your chart of accounts, remembered in Settings), the terms, and the ATC code when tax was withheld. A
  saved invoice keeps its own files (page, crops, original), apart from the 6 recent scans. A saved invoice changed
  afterwards says "Changed since it was saved. The export still has the saved version: tap Save changes." Samples
  can't be saved, and their names can't be added to the lists: they're made up. Saved invoices (⋮, or the row on
  Home) lists them, "To export" or "Exported"; long-press one to delete it.
- **The exports** (Saved invoices): .xlsx files in MyBizMate's own import layouts (the "Import" sheet with the
  template's header row, word for word), sent with the phone's share sheet (email, Drive, chat):
  - **Export sales** (the Sales import) and **Export purchases** (the Purchases import): one row per invoice: Date,
    Customer or Supplier (its code when it's in your list, else the name as written; a blank customer is
    `VARIOUS-CUST`), Gross (the VAT-inclusive total before the discount and the withholding), Type, the account, the
    ATC code (CWT IT on sales, EWT on purchases), Terms, the invoice number, Description (the items) and Discount.
  - **Export new customers and suppliers** (the Parties import): those added from scans, which have no MyBizMate code
    yet. Before importing it, fill in each one's City / Municipality, Province and ZIP, and its TIN where it's blank.
  - Sales and purchases go out by the ones not exported yet, this month's, last month's, or all; new customers and
    suppliers by the ones not sent yet, or all added from scans. After the share sheet, the app
    asks "Did the file go where you wanted?": only "Mark as exported" marks them, so a share that didn't go through
    loses nothing. A file holding invoices exported before says so, since importing them again adds them twice.
  - **In MyBizMate, import the Parties file first** (Masters → Parties → Import), so the new customers and suppliers
    exist, **then the Sales and Purchases files.** The sales and purchases sheet says so when a file names a party
    that hasn't gone out yet.
- **Settings** (⋮ → Settings): whether the business is VAT-registered, the revenue account for sales, the expense
  account for purchases, and the withholding tax ATC.
- **Privacy:** the lists, Settings and saved invoices stay in the app's own storage, kept out of Android's backups.
  Nothing leaves the phone but the files the person shares. An export is written to the app's cache for the share
  sheet, and the next export replaces it.

## Team builds

Debug builds are team builds. A release is a client build unless it's built with `EXPO_PUBLIC_TEAM_BUILD=1`:

- client: Home's ⋮ menu has Saved invoices, Your lists and Settings;
- team: the menu also has the **Speed test** (also at `mybizmatescan://speed`, on any build), and the Result's
  footnote shows the straighten and read times.

Build a team release for a phone (PowerShell, phone connected with USB debugging):

```powershell
$env:EXPO_PUBLIC_TEAM_BUILD='1'; npx expo run:android --variant release --device
```

That release holds all four Android ABIs: about 450 MB. For one phone, build its ABI only (most phones:
arm64-v8a, about 110 MB; the emulator's x86_64 is 168 MB), from `android/` with `JAVA_HOME` set, then install it:

```powershell
$env:EXPO_PUBLIC_TEAM_BUILD='1'; .\gradlew.bat app:assembleRelease -PreactNativeArchitectures=arm64-v8a
```
```powershell
adb install -r app\build\outputs\apk\release\app-release.apk
```

Clients should get an Android App Bundle through Google Play, which sends each phone its own ABI only.

## Run it on the Android emulator

Expo Go can't run this app (it has native code); it uses a development build.

1. Start the emulator:
   `%LOCALAPPDATA%\Android\Sdk\emulator\emulator.exe -avd Medium_Phone_API_36.1 -no-snapshot-load -no-boot-anim`
2. Build, install and open the app (the first build takes several minutes):
   `npx expo run:android` with `JAVA_HOME` set to Android Studio's JDK (`C:\Program Files\Android\Android Studio\jbr`).
   Opened later from its icon, a debug build shows the dev client's launcher: pick the development server.

The debug APK is about 230 MB (the full OpenCV and ONNX Runtime, CameraX). Android wants that much plus about 500 MB
free on the emulator; if an install fails with `INSUFFICIENT_STORAGE`, uninstall the old build first
(`adb uninstall com.mybizmate.scan`) and remove the core tests' files (`adb shell rm -rf /data/local/tmp/scanner_tests`).

In a debug build, the dev client's Tools button starts over Home's ⋮ menu: drag it aside. On the emulator, a tap sent
with `adb shell input` can open Gboard's "Try out your stylus" once; Cancel it.

On Windows, `plugins/with-windows-native-paths.js` keeps the native builds under Windows' 260-character path
limit: it moves each library's CMake build folder to `%LOCALAPPDATA%\mbs-cxx` (a build cache that can be deleted
any time).

### The camera's test photo (debug builds only)

`mybizmatescan://camera?test=<sample>` shows a sample (`inv_0051`, say) in place of the camera picture, and
`?test=file:///…` any photo in the app's own storage. The camera then finds the form, takes the photo by itself and
reads it, as with a real sheet. For a Service Invoice:

```powershell
adb push fixtures/core/photos/svc_0000.jpg /data/local/tmp/
```
```powershell
adb shell "run-as com.mybizmate.scan cp /data/local/tmp/svc_0000.jpg cache/"
```
```powershell
adb shell am start -a android.intent.action.VIEW -d "mybizmatescan://camera?test=file:///data/user/0/com.mybizmate.scan/cache/svc_0000.jpg" com.mybizmate.scan
```

## Tests

- `npm test`: the screens and the TypeScript side (jest).
- `npm run test:core`: the C++ core's tests (doctest). They are built for the x86_64 emulator with NDK 28.2 and run
  there (the emulator must be running). Pass doctest arguments after `--`, for example
  `npm run test:core -- -tc="*parity*"`. They compare the core with the Python on every fixture photo, both forms.
- From `android/`: `./gradlew :scanner:testDebugUnitTest`: the module's Kotlin tests (auto capture, image sizes).
- `npx tsc --noEmit`: the typecheck. `npm run lint`: ESLint (Expo's config).
- From `../prototype/benchmark`: `..\..\.venv\Scripts\python.exe test_export_check_fixtures.py`: the test of the
  exporter that writes `fixtures/checks/` and `fixtures/lists/`.

## Checked on the emulator (milestone 3)

A debug build on the emulator (Medium Phone, API 36, x86_64), 2026-11-20, with the made-up lists. On the final tree,
every suite passed: jest (34 suites, 201 tests; 35 suites, 212 tests after the final review's fixes), the typecheck
and ESLint, the core's doctest (36 test cases, 6048 assertions), the module's Kotlin tests, and the checks' fixture
exporter's test (9 of 9).

1. **The splash:** the logo stays put from the phone's splash to the brand splash, to the pixel: (406, 1067)–(674,
   1332) on the phone's splash and (406, 1067)–(675, 1333) on the brand splash, measured on screenshots. A debug
   build shows the dev client's blank loading screen between the two while it loads the JavaScript.
2. **Sample 0007:** the status card ("Ready to post"), A sale / A purchase, the invoice (SI no., Date, Customer,
   Terms), its 6 items and the totals. "13/45/2026" typed in the Date box turns the card into "1 thing to check"
   (Date: "Couldn't make out a date"). The Terms sheet sets Cash ("Chosen by you"). "A purchase" shows Supplier ("Not
   chosen yet") and Sold to. A sample has no Save: "Sample invoices are made up, so they can't be saved."
3. **Your lists:** both lists imported from the picker's Downloads: Customers (21), Suppliers (2), Items (18), with
   "Sample Company · TIN 123-456-789-00000 · C001" and "Rice 25kg · sack · ₱1,350.00". The tabs' labels fit on one
   line.
4. **Saving:** `inv_0051` from the camera's test photo: "Flores Grocery, TIN 556-677-889-00000 · matched in your
   customers", 2 things to check (Date, VAT breakdown). The first save asked "Your business is"; saved with the account
   "Sales": "Saved as a sale on Nov 20, 2026. Not exported yet." Home showed "Saved invoices, 1 to export" and the
   recent scan as "Saved as a sale"; Saved invoices listed "Flores Grocery, Sale · Oct 21, 2026 · ₱2,251.00, To
   export". The next save didn't ask about VAT again and started with the account.
5. **The cleanup:** after 7 more samples, the scans folder kept its newest 6, and the saved invoice, opened from Saved
   invoices, still showed its page as Enhanced and as B&W, and its crops (the Date box's "21 Oct 2026"), from its own
   folder.
6. **The export:** Export sales, the share sheet closed, "Not yet": still "To export". Again, "Mark as exported":
   "Exported". The share sheet was closed each time, so nothing was sent anywhere.
7. **The file:** `MyBizMate Sales import 2026-11-20.xlsx` (4,823 bytes) tests clean as a zip; its row 1 matches the
   Sales template's 27 headers, and its row 2 is `2026-10-21`, `C015`, `2251`, `VAT`, `Sales`, `On Account`,
   `0008869` and "2 × Plywood 1/4; 2 × Nescafe; 12 × Bear Brand".
8. **New customers and suppliers:** on `inv_0041` (no customer written), the name box set to "Bagong Tindahan",
   added to the customers, and the sale saved. The sales sheet then said "Check that these are in MyBizMate before
   you import: Bagong Tindahan. Export new customers and suppliers first: they go in before this file." The Parties
   file (4,364 bytes) tests clean; its row 1 matches the Parties template's 25 headers, and its row 2 is Customer,
   Company, Bagong Tindahan, with City / Municipality, Province and ZIP blank. Your lists then showed it as "sent in a
   Parties file".
9. **Settings:** this check found a bug, now fixed: an account typed in Settings was lost when the screen was left
   with the back arrow, since it was saved only when the field was left. Now "4000 Sales Revenue" stays, and the next
   save sheet starts with it.
10. **After the final review's fixes:** a Windows-1252 CSV imported "Parañaque Hardware" intact, and a made-up list of
    3,000 parties imported, with Home's recent scans still showing their status. (The lists were then reset to the
    made-up ones.)

**Still open:**
- **MyBizMate's own importer.** No exported file has been imported into MyBizMate yet. That check waits for the
  user's go-ahead: a sale exported as `VARIOUS-CUST` imported into the test company, every column read and its Gross;
  then, if wanted, the Parties file (with City, Province and ZIP filled in) and a sale that names "Bagong Tindahan".
- **Milestone 2's real-phone checks** (below), and on the same phone, how long a check takes with a few thousand
  parties and items in the lists.

## Measured (milestone 2)

On the emulator (Medium Phone, API 36, x86_64), **debug build**, 2026-11-20:

| | |
|---|---|
| Speed test, per invoice | 957 ms median, slowest 10% 1.9 s or more |
| Reading the boxes | 897 ms of each invoice |
| Read exactly as written | 217 of 241 boxes (the 8 samples) |
| Same as the laptop | 243 of 243 boxes |
| Peak memory | 662 MB (peak resident size of the debug app, Metro's JavaScript included) |
| Starting the scanner | 316 ms |
| Checks | splash then Home with the new icon; Sample 0007 reads `0007655`, all three views and Save; the camera's test photo on `inv_0051` and `svc_0000` (outline, automatic photo, read); the emulator's own camera ("Looking for the form…", shutter); `svc_0000_cw.jpg` from the gallery reads upright |

The same emulator, **client release** (x86_64 only, 168 MB APK): the phone's splash, the brand splash, then Home
with no ⋮ menu; Sample 0051 reads ("Photo looks good", 1.5 s); the live camera finds frames ("Looking for the
form…"); the speed test gives 1.2 s median per invoice, slowest 10% 2.2 s or more, reading the boxes 1.1 s, 217 of
241 boxes exactly as written, 243 of 243 the same as the laptop, peak memory 480 MB, starting the scanner 650 ms.
The emulator's times move with the laptop's load (this run came right after a 12-minute build): only a phone's
numbers count.

**Still open: a real arm64 phone.** No phone was connected for this milestone, so these still need checking with a
team release:
- the speed test's numbers (the design's target is under 3 s from photo to result);
- peak memory after 50 MP, 108 MP and 200 MP gallery photos (decoded smaller first now), and a HEIC one if the phone
  takes them;
- the live camera on a printed form: the outline sits on the sheet in the preview, the automatic photo, the torch
  (also after leaving the app and coming back), and Manual mode;
- how long a frame check takes on a cluttered desk;
- in a release build, that a speed-test run keeps no scan folders and a camera photo is deleted once read.

## Fixtures and assets

`fixtures/core/`, `modules/scanner/assets/scanner/` and `assets/samples/` are written by the Python reference:
from `../prototype/benchmark`, run `..\..\.venv\Scripts\python.exe export_core_fixtures.py` (its test:
`test_export_core_fixtures.py`). The Service Invoice photos come from `synth_service_invoice.py`. They are
synthetic: no client data.

`fixtures/checks/` (the Python's own results for the checks: fuzzy scores, numbers, dates, and whole results on the
fixtures and on variants of them) and `fixtures/lists/` are written by `export_check_fixtures.py`, from the same
folder (its test: `test_export_check_fixtures.py`). Git keeps their bytes as written (`.gitattributes`).

### The made-up lists

`fixtures/lists/parties.csv` holds the checks' 20 customers, a supplier, one party that is both, and a row with no
name, saved as Excel saves CSV UTF-8 (a byte order mark, CRLF), with contact numbers and emails for the app to leave
out. `fixtures/lists/items.csv` holds 18 items. Every name and TIN is made up. To try them on the emulator:

```powershell
adb push fixtures/lists/parties.csv fixtures/lists/items.csv /sdcard/Download/
```

If the picker doesn't list them yet, have Android index them:

```powershell
adb shell content call --uri content://media --method scan_file --arg /sdcard/Download/parties.csv
```
```powershell
adb shell content call --uri content://media --method scan_file --arg /sdcard/Download/items.csv
```

Then, on the phone, ⋮ → Your lists → Import CSV → Downloads: `parties.csv` on Customers gives 21 customers and 2
suppliers (1 row skipped: no name), and `items.csv` on Items gives 18 items.
