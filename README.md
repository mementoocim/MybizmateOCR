# MyBizMate Scan

The MyBizMate Scan app: an Expo (React Native) app that reads handwritten MyBizMate Sales Invoices and Service
Invoices, and BIR Form 2307s, on the phone, offline, from a photo or a PDF. Its scanner is one C++ core (OpenCV 5.1.0,
ONNX Runtime 1.32.0 with PP-OCRv6 small cut to 98 Latin characters, and pdfium for PDFs) inside a local Expo module,
so Android and iPhone will read a photo or a PDF the same way.

- Design: `../docs/2026-11-19-expo-scanner-design.md`
- Plans: milestone 1, `../docs/superpowers/plans/2026-11-19-scanner-m1-core-reads-a-photo.md`; milestone 2,
  `../docs/superpowers/plans/2026-11-20-scanner-m2-camera-and-both-forms.md`; milestone 3,
  `../docs/superpowers/plans/2026-11-20-scanner-m3-edit-checks-lists-export.md`; milestone 5,
  `../docs/superpowers/plans/2026-11-20-scanner-m5-pdf-and-2307.md`
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
    the type the phone gives it. Android's picker keeps a lasting access to every file it hands over; the app gives
    it up once the file has been read.
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

### PDF import and BIR Form 2307 (milestone 5)

- **Import PDF** (Home): Android's file picker, for PDFs. Page 1 is read; when there are more pages, the result says
  "Only page 1 of N was read." The scan is labelled "PDF: <the file's name>", or just "PDF" when the file's app gives
  no name. A file that is a PDF neither by its name nor by its type gets "Choose a PDF file."
- **Found like a photo, then read from the text:** page 1 is rendered at the photo pipeline's size, and the form is
  found and straightened as in a photo, so any faithful copy of the form works, whatever program made the PDF. Each
  box then takes the PDF's own text inside it (typed text, or a value typed into a fillable PDF's field), exact, with
  no OCR; the box's sheet says "From the PDF's text". A box with no text is read from the page. The footnote says
  "Read from the PDF: N boxes from its text, M read from the page." Typed values are checked like written ones. When
  no form is found on page 1, the card says "Page 1 of this PDF isn't a MyBizMate Sales Invoice, a Service Invoice or
  a BIR Form 2307. Import another PDF."
- **A picture PDF** (a scan, or a photo saved as a PDF) has no visible text. It is read like a photo, photo checks
  included, and says "The PDF is a picture: read like a photo." The hidden text a scanner app lays over its scans is
  that app's own OCR, so it is ignored: text that is never painted (render mode 3, invisible, or 7, clip only), and
  text drawn under an image that covers most of the page (80% of its area or more). Text drawn on top of such an
  image, as a background, is the page's own.
- **Refused, each with its message** (a toast, and no scan is added):
  - over 20 MB (20 × 1024 × 1024 bytes): "That PDF is over 20 MB. Choose a smaller file." It is refused before any
    of it is copied when its app gives its size, else as soon as the copy passes 20 MB;
  - a page over 14,400 pt (200 inches, the PDF format's own limit) on its long side: "That PDF's page is too big to
    read." Within it, a page's size costs nothing (it is always rendered 2400 px on its long side), so a photo saved
    as a PDF at 1 px = 1 pt reads;
  - a password: "That PDF has a password. Save a copy without one, then import it.";
  - broken, or not a PDF inside: "Couldn't read that PDF."
- **Safe to open:** pdfium's build has no JavaScript and no XFA, runs no form actions and fetches nothing. The PDF is
  only read: a picked file is copied into the scanner's work folder for the read, and the copy is deleted afterwards.
  Android's picker keeps a lasting access to the file it hands over; the app gives it up once the file has been read,
  or refused. A refusal carries only its code, never the failure behind it (whose message could name the file).
- **Form fields, typed notes and stamps:** a value typed into a fillable PDF's field, a note typed onto the page
  (FreeText, as phone PDF editors keep typed values) and a stamp are read with the page: a copy of page 1 is made in
  memory, holding its own copy of everything the page inherits (its `/Resources`, its boxes), and the copy is
  flattened. A page with no such annotation, or only links and popups, is read as it is.
- **BIR Form 2307, page 1** (`modules/scanner/assets/scanner/bir_2307.json`, 160 boxes): the period From and To; the
  payee's and the payor's TIN, name, registered address and ZIP; Part III's 10 income payment rows and 10 business
  tax rows (the payment, its ATC, the quarter's 3 months, the total and the tax withheld), and each table's total
  row. It is found by its printed border, like the Service Invoice, in the camera, a photo or a PDF; the camera's
  status line says "BIR Form 2307 · hold still". The ticks and grey dash cells between the period's, TINs' and ZIPs'
  digits are erased before reading.
- **On the scan screen:** PERIOD ("Oct 1 – Dec 31, 2026 (Q4)"), PAYEE, PAYOR (matched against your customers, like
  an invoice's customer), INCOME PAYMENTS (one row per payment: "<ATC> · <payment>", its total and the tax withheld),
  BUSINESS TAX (when that table has rows) and TOTALS. Every row opens its boxes, as on an invoice.
- **The checks** (`lib/checks/bir2307.ts`): the period is one calendar quarter; each TIN is 9 digits, or 9 and a
  3-, 4- or 5-digit branch code (MyBizMate prints 4), one rule shared with the TIN as the app shows it and as the
  Parties export writes it (`lib/checks/tin.ts`); the payor is in your customers (when you have a list); each row's 3
  months add up to its total, its tax is the total times its ATC's rate (within ₱0.05: a tax withheld month by month is
  rounded each month), and its ATC is in its own table's list; each table's rows add up to its total row in every
  column the total row prints (MyBizMate's own 2307 prints only the Total and the Tax; a cell written with no amount,
  "-", counts as 0, and a total row with nothing printed is flagged when its rows add up to something); and a photo, or
  a PDF with a box read from its page, gets the photo checks (a PDF whose boxes all came from its text gets none). An
  unsure payor is shown as written, the name that goes out, with "Closest match: <the customer>" under it, until a
  2307's payor can be chosen. The card lists what to check, or says "Ready to save". The ATC list
  (`lib/checks/atc2307.json`, 161 codes) is MyBizMate's own (its income tax codes for the income payments, its VAT and
  business tax codes for the second table, with their rates), plus the 12 codes only the form's page 2 prints; a code
  with no rate skips the tax check.
- **Save 2307:** the payor, the period, the tax withheld, and the offset account MyBizMate's import needs, asked at the
  first save and then kept (⋮ → Settings → "Offset account for 2307s"). A 2307 can't be saved without its period
  ("Add the period first: tap Period."), a payor ("Add the payor first: tap Payor.") or a payment ("No income
  payments were read."). Saved 2307s are in Saved invoices ("2307 · Q4 2026 · Tax ₱…" under the payor), and a recent
  scan says "Ready to save" or "Saved as a 2307".
- **Export 2307s** (Saved invoices, under Export sales and Export purchases): `MyBizMate 2307-CWT import <date>.xlsx`,
  in MyBizMate's 2307-CWT import layout (Sheets → CWT → Import), one row per payment: Date * (the period's last day),
  Customer * (the payor's code when it matched one of your customers, else the name as written), Tax Base (Net) (the
  payment's total), CWT IT and IT Amt for an income payment or CWT VT and VT Amt for a business tax, Offset Account *,
  and Particulars ("BIR 2307 for Oct–Dec 2026"). Cert No. and Branch stay blank: the paper has no certificate number,
  and the branch is the business's own. The ranges, the warning for 2307s exported before and the "Mark as exported"
  question are the same as for sales; the ranges go by the period's last day.

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

## Release checklist

The app promises that nothing leaves the phone. Before a client release, and again whenever ONNX Runtime or pdfium
changes version:

- **No telemetry provider:** the merged release manifest has no `ai.onnxruntime.TelemetryInitializer`.
  onnxruntime-android's AAR adds that provider, which starts by itself when the app does (Microsoft's telemetry client,
  which reads the phone's `android_id`).
- **No sockets in the native libraries:** `libonnxruntime.so` and `libpdfium.so` (and ONNX Runtime's
  `libonnxruntime4j_jni.so`) import no socket function. For each ABI's copy in the APK (`llvm-nm` is the NDK's, in
  `toolchains/llvm/prebuilt/windows-x86_64/bin`), this prints nothing (checked 2026-11-22 on ONNX Runtime 1.32.0 and
  pdfium chromium/8125, all four ABIs):

  ```bash
  llvm-nm -D --undefined-only libonnxruntime.so | grep -wE 'socket|connect|bind|listen|accept|accept4|getaddrinfo|gethostbyname|send|sendto|sendmsg|recv|recvfrom|recvmsg'
  ```

- **The INTERNET permission:** onnxruntime-android's AAR and expo-file-system ask for it (the AAR also for
  `ACCESS_NETWORK_STATE`), and so does the app's own manifest. Whether client release builds remove it (a config
  plugin's `tools:node="remove"`) is decided here. Debug builds keep it: Metro needs it. Debug builds also carry the
  dev launcher's ML Kit barcode scanner and Google's `datatransport`, as debug-only dependencies.
- **Open-source notices:** a release carries pdfium's (see below) and those of the other libraries it ships.

## Run it on the Android emulator

Expo Go can't run this app (it has native code); it uses a development build.

1. Start the emulator:
   `%LOCALAPPDATA%\Android\Sdk\emulator\emulator.exe -avd Medium_Phone_API_36.1 -no-snapshot-load -no-boot-anim`
2. Build, install and open the app (the first build takes several minutes):
   `npx expo run:android` with `JAVA_HOME` set to Android Studio's JDK (`C:\Program Files\Android\Android Studio\jbr`).
   Opened later from its icon, a debug build shows the dev client's launcher: pick the development server.

The debug APK is about 245 MB (the full OpenCV, ONNX Runtime and pdfium, CameraX). Replacing an installed build
(`adb install -r`) needs about 780 MB free on the emulator: the new APK beside the old one, and Android's own reserve.
If an install fails with `INSUFFICIENT_STORAGE`, remove the core tests' files with
`adb shell rm -rf /data/local/tmp/scanner_tests` (in PowerShell as it is; in Git Bash, run `export MSYS_NO_PATHCONV=1`
first, or Git Bash turns the path into a Windows one and nothing is removed). If that isn't enough, the old build has
to be uninstalled first, and uninstalling deletes the app's data (the lists, Settings, saved invoices and recent
scans): to keep it, see "Reinstalling without losing the app's data", below.

In a debug build, the dev client's Tools button starts over Home's ⋮ menu: drag it aside. On the emulator, a tap sent
with `adb shell input` can open Gboard's "Try out your stylus" once; Cancel it.

On Windows, `plugins/with-windows-native-paths.js` keeps the native builds under Windows' 260-character path
limit: it moves each library's CMake build folder to `%LOCALAPPDATA%\mbs-cxx` (a build cache that can be deleted
any time).

### Reinstalling without losing the app's data

Run these in Git Bash, from the repo's folder, in this order (PowerShell's `>` would change the backup's bytes).
Each block starts with `export MSYS_NO_PATHCONV=1`: without it, Git Bash turns the device's paths (`/data/...`) into
Windows paths, the backup fails, and the file holds an error message instead. The backup goes to Git Bash's `/tmp`
(Windows' temp folder), outside the repo, since it holds the app's data.

1. Build the new APK first, so a failed build never leaves the app uninstalled. Don't use `npx expo run:android`
   here: it opens the app before its data is back.

   ```bash
   export MSYS_NO_PATHCONV=1
   (cd android && JAVA_HOME='C:\Program Files\Android\Android Studio\jbr' ANDROID_HOME="$LOCALAPPDATA/Android/Sdk" ./gradlew assembleDebug -PreactNativeArchitectures=x86_64)
   ```

2. Back up the app's data, and check the backup:

   ```bash
   export MSYS_NO_PATHCONV=1
   adb shell am force-stop com.mybizmate.scan
   adb exec-out run-as com.mybizmate.scan tar -cf - -C /data/data/com.mybizmate.scan . > /tmp/scan-appdata.tar
   tar -tf /tmp/scan-appdata.tar > /dev/null && echo "the backup is whole"
   tar -tf /tmp/scan-appdata.tar | grep -cxE '\./(files|shared_prefs)/'
   tar -tf /tmp/scan-appdata.tar | grep -cE '^\./(files|shared_prefs|no_backup)/.*[^/]$'
   adb shell "run-as com.mybizmate.scan find files shared_prefs no_backup -type f" | wc -l
   ```

   Check all three before going on. The first `tar` line must print only "the backup is whole": a backup cut short
   prints `tar: Unexpected EOF in archive` instead, though it still lists the files it holds. The next line must print
   2: the backup lists `./files/` and `./shared_prefs/`. The last two counts must be the same: the backup holds every
   file the app has. If any of them fails, stop here and don't uninstall.

3. Uninstall, install the new build, and put the data back, without opening the app in between:

   ```bash
   export MSYS_NO_PATHCONV=1
   adb uninstall com.mybizmate.scan
   adb install android/app/build/outputs/apk/debug/app-debug.apk
   adb push "$(cygpath -w /tmp/scan-appdata.tar)" /data/local/tmp/scan-appdata.tar
   adb shell "run-as com.mybizmate.scan tar -xf /data/local/tmp/scan-appdata.tar -C /data/data/com.mybizmate.scan ./files ./shared_prefs ./no_backup"
   adb shell rm /data/local/tmp/scan-appdata.tar
   ```

4. Check the restore. The two counts must be the same: every file in the backup is back.

   ```bash
   export MSYS_NO_PATHCONV=1
   tar -tf /tmp/scan-appdata.tar | grep -cE '^\./(files|shared_prefs|no_backup)/.*[^/]$'
   adb shell "run-as com.mybizmate.scan find files shared_prefs no_backup -type f" | wc -l
   ```

   When they are, delete the backup (`rm /tmp/scan-appdata.tar`). Then start Metro (`npx expo start --dev-client`)
   and open the app from its icon.

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

A 2307 works the same way, with `fixtures/core/bir2307/bir2307_photo_0.jpg`. Delete the copies afterwards, from
`/data/local/tmp/` and from the app's `cache/` (`adb shell "run-as com.mybizmate.scan rm cache/svc_0000.jpg"`).

### PDFs on the emulator

Push a PDF to Downloads and have Android index it, as for the made-up lists (below):

```powershell
adb push fixtures/core/pdf/bir2307_text_0.pdf /sdcard/Download/
```
```powershell
adb shell content call --uri content://media --method scan_file --arg /sdcard/Download/bir2307_text_0.pdf
```

Then Home → Import PDF → Downloads. To remove it, delete it (`adb shell rm /sdcard/Download/bir2307_text_0.pdf`) and
run the same `scan_file` again.

## pdfium (reading PDFs)

- **Which:** release `chromium/8125` of [bblanchon/pdfium-binaries](https://github.com/bblanchon/pdfium-binaries)
  (PDFium 158.0.8125.0), its Android builds without V8 and XFA (`pdf_enable_v8 = false` and `pdf_enable_xfa = false`
  in each build's `args.gn`): no JavaScript.
- **License:** PDFium is BSD-3-Clause (Copyright 2014 The PDFium Authors). The binaries project adds its own notice
  (MIT, Copyright 2014-2025 Benoit Blanchon), and `libpdfium.so` also holds third-party code under its own licenses
  (FreeType, HarfBuzz, ICU, libjpeg-turbo, OpenJPEG, libpng, Little CMS, zlib, Abseil and others). Every text is in
  each ABI's folder (below): `LICENSE` and `licenses/`. BSD-3-Clause asks for its notice to go with the binary, so a
  release has to carry it: the app doesn't show any notices yet.
- **The fetch script:** `scripts/fetch-pdfium.mjs` downloads the release's four Android archives, checks each against
  the SHA-256 pinned in the script, and unpacks it into a cache folder outside the repo, one folder per ABI with
  `include/` and `lib/libpdfium.so`: `%LOCALAPPDATA%\mbs-cxx\pdfium\chromium-8125\<ABI>` on Windows,
  `~/.cache/mbs-pdfium/chromium-8125/<ABI>` elsewhere. An archive that doesn't match isn't unpacked. A folder already
  unpacked from its pinned archive is left as it is, so the next run downloads nothing. Nothing of it is committed.
- **The pins** (the script holds them; from the first download, 2026-11-21, the same digests GitHub lists for the
  release's files):

  | Archive | ABI | SHA-256 |
  |---|---|---|
  | `pdfium-android-arm64.tgz` | arm64-v8a | `0495e57163429937caaee1bdd9b07924a7098dbd51d1b97645d124e349f097b4` |
  | `pdfium-android-arm.tgz` | armeabi-v7a | `ac4ac5319ded88ba5d885747a6b2641e7f712c9797de0770465104abe4dbf7da` |
  | `pdfium-android-x64.tgz` | x86_64 | `bd68707f29f2316c20f9d5c793b8731796a4a65408ac4d3c30bc606390354e41` |
  | `pdfium-android-x86.tgz` | x86 | `9d4f7edf5b46e1ab155d9da3e56520f2554900997c74e21951f524ea7928c622` |

- **When it runs:** the scanner module's `fetchPdfium` Gradle task runs it on every Gradle build, before CMake (about
  0.1 s when nothing is missing), and `npm run test:core` runs it too. The first run needs the internet.
- **In the app:** each ABI the app builds packages its own `libpdfium.so`, aligned for 16 KB pages (LOAD alignment
  0x4000, checked on arm64 with the NDK's `llvm-readelf -l`).
- **A new version:** change `RELEASE`, the folder name `chromium-8125` (in the script and in
  `modules/scanner/android/build.gradle`) and the four SHA-256s together.

## Tests

- `npm test`: the screens and the TypeScript side (jest).
- `npm run test:core`: the C++ core's tests (doctest). They are built for the x86_64 emulator with NDK 28.2 and run
  there (the emulator must be running). Pass doctest arguments after `--`, for example
  `npm run test:core -- -tc="*parity*"`. They compare the core with the Python on every fixture photo, both forms,
  and read the 2307s and PDFs against the values written into them. They push about 200 MB to
  `/data/local/tmp/scanner_tests` (265 MB after a run); remove that folder when the emulator is short of space.
- From `android/`: `./gradlew :scanner:testDebugUnitTest`: the module's Kotlin tests (auto capture, image sizes, the
  scanner holder, the PDF's size limit and work copy, a refusal's code, a picked file's name, and what of a picked
  file's lasting access is given up).
- `npx tsc --noEmit`: the typecheck. `npm run lint`: ESLint (Expo's config).
- From `../prototype/benchmark`: `..\..\.venv\Scripts\python.exe test_export_check_fixtures.py`: the test of the
  exporter that writes `fixtures/checks/` and `fixtures/lists/`.
- From the same folder: `test_make_2307_template.py` (the 2307's template and ATC list), `test_synth_2307.py` (the
  synthetic 2307s and PDFs) and `test_export_core_fixtures.py` (everything the core's exporter writes).

## Checked on the emulator (milestone 5)

A debug build on the emulator (Medium Phone, API 36, x86_64), 2026-11-22, with the made-up lists; the JavaScript came
from Metro. On the final tree, every suite passed: jest (38 suites, 277 tests), the typecheck and ESLint, the core's
doctest (68 test cases, 8938 assertions), the module's Kotlin tests (29), and the Python tests: the 2307's template
(5 of 5), the synthetic 2307s (9 of 9) and the core's exporter (30 of 30).

1. **A text 2307** (`bir2307_text_0.pdf`, from the picker's Downloads): "Ready to save". All 28 written boxes came
   from the PDF's text and equal what was written: "Read from the PDF: 28 boxes from its text, 0 read from the page."
   Read in 631 ms.
2. **A picture 2307** (`bir2307_picture_1.pdf`, with its hidden layer of wrong text): "The PDF is a picture: read like
   a photo." 41 of 41 boxes read exactly as written, none from the hidden text. "Ready to save", in 4.0 s.
3. **Two pages** (`two_pages.pdf`): "Read from the PDF: 55 boxes from its text, 0 read from the page. Only page 1 of
   2 was read." 55 of 55 boxes as written.
4. **The refusals:** `password.pdf`, `broken.pdf`, a 22.4 MB PDF and a PDF whose page is 2142 × 3276 pt each gave
   their message, and no scan was added. (Since the final review's fixes, such a page reads: the limit is now the
   format's own 14,400 pt.)
5. **The MyBizMate-printed test 2307** (pushed under a neutral name; the PDF was deleted afterwards): 17 boxes, every
   one from the PDF's text, and every one the same as what MyBizMate printed (read on the laptop with pypdfium2): the
   period; the payee's name, address, TIN and ZIP; the payor's name and TIN; the payment (its description, ATC, month,
   total and tax); and both total rows. "Only page 1 of 2 was read." It showed 4 things to check: the payee's TIN
   (only a branch code is printed), the payor's TIN (a 4-digit branch code), the payor (not in the made-up
   customers), and Totals (its total row prints only the Total and the Tax). The final review's fixes since then
   accept a 4-digit branch code and check a total row only in the columns it prints, so a certificate printed that
   way is no longer flagged for those two.
6. **The camera:** `bir2307_photo_0.jpg` as the test photo: the outline, "BIR Form 2307 · hold still", the photo taken
   by itself, 22 of 22 boxes exact, "Ready to save". `svc_0000.jpg` still shows "Service Invoice · hold still", reads
   as a Service Invoice (35 of 35 boxes the same as the laptop) and says "Ready to post".
7. **Saving:** the first 2307 saved (the text one) asked for the offset account; saved with `1105` (Accounts
   Receivable - Trade, from the 2307-CWT template's list). The photo 2307 and the picture 2307 then started with
   `1105`. Each scan then said it was saved and not exported yet.
8. **Export 2307s:** "3 2307s · tax ₱83,476.11". The share sheet was closed and the answer was "Not yet", so nothing
   was sent and they stay "To export". The file (5,720 bytes) tests clean as a zip, and its row 1 equals the 2307-CWT
   template's 11 headers, cell by cell. Its 6 rows: `2025-12-31`, `C015`, 419626.03, `WC158`, 4196.26; `2026-03-31`,
   `C005`, 114402.88, `WC610`, 1144.03; `2026-03-31`, `C005`, 444788.1, `WC160`, 8895.76; `2026-06-30`, `C009`,
   546839, `WI060`, 27341.95; `2026-06-30`, `C009`, 646962.98, `WI010`, 32348.15; and `2026-06-30`, `C009`,
   318332.15, with `WB082` and 9549.96 under CWT VT and VT Amt. Each has Offset Account `1105` and Particulars "BIR
   2307 for Oct–Dec 2025", "… Jan–Mar 2026" or "… Apr–Jun 2026"; Cert No. and Branch are blank.
9. **Saved invoices' bottom bar** fits: Export sales and Export purchases side by side, Export 2307s under them, each
   label on one line.
10. **The time of a full 2307:** synthetic 2307 photos with Part III filled, from the camera's test photo in the app
    and from the core's test program, on the same emulator. The one with both tables full (160 boxes) read 159 of its
    boxes exactly, the one with the income payments full (85 boxes) 84, and both said "Ready to save".

    | Photo | Boxes | Core test program (release build) | The app (debug build) |
    |---|---|---|---|
    | `bir2307_photo_0.jpg` | 22 | 1.7–1.9 s | 3.5 s |
    | Income payments table full | 85 | 4.6–4.8 s | 7.0 s |
    | All of Part III full | 160 | 7.8–8.1 s | 12.0–12.2 s |

    When the 2307 was added, the fixture 2307s (22 to 41 boxes) took 1.95–2.88 s in the same test program. Reading
    takes about 45 ms per box, so a full Part III is well over the design's 3 s target on the emulator. The app's
    debug build compiles the core without optimization; the test program is a release build. Only a phone's numbers
    count.

**MyBizMate's 2307-CWT importer** (2026-11-22, at the user's go-ahead): passed. The file above went into the test
company's 2307-CWT import (Sales Bizmate → Sheets → CWT → Import), with only its Customer codes replaced by the
company's own, since the emulator's lists are made up. MyBizMate mapped all 11 columns by itself, and its review said
6 new rows, all ready. The import created 6 rows, with 0 updated, 0 skipped and 0 failed. The sheet showed each row's
Tax Base, its ATC with the rate (CWT IT for the income rows, CWT VT for the business-tax row), the tax equal to the Tax
Base times that rate, and the offset account 1105. The rows stay as drafts, dated outside the working period.

**Still open:**
- **The payor chooser.** A 2307's payor can't be chosen from your customers yet. Only a payor matched in your
  customers goes out with its code; an unsure match is shown and goes out as written, with its closest customer named
  under it ("Closest match: …"); fixing the payor's name or TIN is the only way to settle it.
- **A phone's time.** A full Part III takes 8 s in the emulator's release-built core; a phone's time, with a team
  release, is still to measure (with milestone 2's phone checks, below).
- **ONNX Runtime's telemetry.** The core switches ONNX Runtime's own telemetry off (`DisableTelemetryEvents` on its
  environment), and `libonnxruntime.so` imports no socket function. onnxruntime-android 1.32.0's Java layer still
  adds a provider that starts its telemetry client when the app does (Microsoft's, which reads the phone's
  `android_id`); today it fails ("ORTTelemetry: Unable to initialize telemetry", an UnsatisfiedLinkError), and it is
  to be removed from the merged manifest.
- **Open-source notices.** The app shows none yet. A release needs them: pdfium's (above), and those of the other
  libraries it ships.

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

**MyBizMate's own importer** (2026-11-20, at the user's go-ahead): passed. A made-up sale (the synthetic `inv_0011`,
its customer's name and TIN cleared, so it went out as `VARIOUS-CUST`) was written by the app's own export code in a
jest run, as `MyBizMate Sales import 2026-11-20.xlsx`: the emulator's adb had stopped answering. It went into the test
company's Sales import (Sales Bizmate → Sheets → Sales → Import). MyBizMate matched every column the app writes by its
header; the 8 it doesn't match by itself (Term Type, Credit Days, Due Date, ID Type, Beneficiary TIN, Discount Prices,
Cap Left, Child's Birth Date) stayed unmapped, and the app leaves them blank. Its review said 1 new row, ready, with no
errors or warnings, ₱4,520.00. The import created 1 row, with 0 updated, 0 skipped and 0 failed: a draft with VARIOUS
CUSTOMERS, Gross 4,520.00, NONVAT, the account 4010 (Sales - Goods), Cash, its SI/OR No., and the items' Description
with its "×" intact.

**Still open:**
- **The Parties file in MyBizMate's importer** (with City, Province and ZIP filled in), and a sale that names a party
  from it: not run, since it wasn't asked for.
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

### The 2307s and PDFs

The core's PDF and 2307 tests read files written by `synth_2307.py`, through the same exporter (its test:
`test_synth_2307.py`). Every value is made up: payees, payors (the made-up customers), TINs, addresses and amounts that
add up, on the official blank form (January 2018 ENCS, from bir.gov.ph):

- `fixtures/core/pdf/bir2307_text_{0,1,2}.pdf`: the values as PDF text (Helvetica);
- `fixtures/core/pdf/bir2307_picture_{0,1}.pdf`: the page as a picture only; `picture_1` also has a hidden layer of
  wrong text, like a scanner app's OCR;
- `fixtures/core/bir2307/bir2307_photo_{0,1,2}.jpg`: the page photographed (kept apart from `photos/`, so the Python
  parity suite's counts stay as they are);
- `fixtures/core/pdf/two_pages.pdf` (with the form's page 2, the ATC table), `broken.pdf` (cut in half) and
  `password.pdf` (password "secret");
- `fixtures/core/pdf/sales_text_0.pdf` and `sales_picture_0.pdf`: a Sales Invoice with typed values, and a sample
  photo saved as a PDF;
- `fixtures/core/expected2307/<name>.json`: what was written in each box.

The 2307's template (`modules/scanner/assets/scanner/bir_2307.json`) and ATC list (`lib/checks/atc2307.json`) are
written by `make_2307_template.py`, from the official blank form (page 1's ruled lines, page 2's ATC table) and
MyBizMate's own ATC list (its income tax codes and its VAT and business tax codes; final taxes go on a 2306, so
they're left out). Its test: `test_make_2307_template.py`.

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
