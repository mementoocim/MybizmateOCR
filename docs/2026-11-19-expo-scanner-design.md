# MyBizMate Scan in Expo: design (2026-11-19)

## Why

The handwritten-invoice OCR built in `prototype/` works: on the laptop, in the demo GUI, and in the Android test app
(`prototype/android_test/`, "MyBizMate Scan"). Two things now matter:

1. **It has to become the real scanner**, on Android first (Play Store) and on iPhone soon after. The team has the
   App Store and Play Store accounts, and the fees are covered.
2. **It has to learn from real handwriting.** Training on handwriting fonts doesn't carry over to people: a
   date-focused fine-tune kept the separators in 96% of unseen-font dates (up from 71%) but read the office's real
   receipt worse (date right in 0 of 10 versions instead of 8; `prototype/training/date_test/results.md`). The main
   dev's direction: after a scan, people fix what was misread, and their corrections and photos become fine-tuning
   data, with their consent.

So: rebuild the test app in Expo (React Native) so one codebase serves Android and iOS, add editing after a scan,
and collect consented corrections as training data.

**Update (the main dev, same day):** this is the actual app, not a test app. The plan is: fine-tune first on
annotated real data, then release on the Play Store, then use people's scans and their edits to the OCR results for
further fine-tuning. Also from the main dev:

- **What a scan becomes**: the MyBizMate invoice's table goes to MyBizMate's **Sales import** (for a sale) or
  **Purchase import** (for a purchase). So a saved scan should produce rows in those import formats.
- **A third form: BIR Form 2307, page 1 only** ("Certificate of Creditable Tax Withheld at Source", January 2018
  ENCS). Page 1 has the period (From/To, MM/DD/YYYY in digit boxes), the payee's and the payor's TIN (digit boxes),
  name, registered address and ZIP code, and Part III's table: each income payment with its ATC code, the amounts for
  the quarter's 3 months, their total and the tax withheld, then a total row; and a second table for money payments
  subject to business tax. Page 2 is only the list of ATC codes and rates. The sample the main dev sent is printed by
  MyBizMate (typed, not handwritten). It gives strong checks: the 3 months add up to the row's total; the tax
  withheld is the total times the ATC's rate (WC160 is 2%: 13,713.55 x 2% = 274.27); the rows add up to the total
  row; the period is one quarter. Its digit boxes have tick marks between the digits that must be erased before
  reading, like the printed rules on the Service Invoice. A 2307 that exists as a PDF (like the sample) has its text
  inside: it can be imported exactly, without OCR.
- **Detector vs recognizer**: the main dev thinks the text detector may also need training for handwriting. With
  fixed forms the app needs no detector (the template gives the boxes) and the recognizer is what gets trained; a
  detector matters for layouts the app doesn't have a template for.

**Decided next (the team, same day):** for now it is **one standalone OCR app**, published on its own (not inside
another MyBizMate app yet, and no MyBizMate backend details yet), so it can be built soon. It takes **both paper and
PDF**: a photo of a paper form, or a PDF file. Also confirmed: the real MyBizMate Sales Invoice that clients print
and fill in has the prototype form's layout and corner squares (final; only its printed seller header and footer
differ per business, and those aren't read), and MyBizMate's own mobile app is Expo/React Native, so the scanner
module, checks included, can later move into it as is.

## Goals

First version (Android):

1. **Everything the Android test app does today**: home (take photo, choose from gallery, sample invoices, recent
   scans), the in-app scanner camera (live outline, automatic photo when the outline holds still and the frame is
   sharp, torch, manual button, camera permission flow, the phone's camera app as a fallback), both forms (the
   MyBizMate Sales Invoice by its corner squares, the office's Service Invoice by its table border), the photo
   checks (upside-down form turned back; blurry and dark photos flagged), the result (the sale, "ready to post" or
   "N things to check", each box's crop and reading), the scan view (Enhanced / B&W / Original, full screen, save),
   and a speed test for the team.
2. **Edit after scan**: every box can be corrected from the result screen, and the checks run again at once.
3. **Training data with consent**: people who opt in give their corrections and crops (see "Training data") for
   fine-tuning.
4. **The same results as the Python reference** (`prototype/benchmark/`): the same readings and flags on the
   test fixtures, on Android now and on iOS later.
5. **A Play Store build**: final package name, signing, privacy policy, Data safety form.
6. **BIR Form 2307, page 1**: a third template, with its own checks (ATC rates, the months adding up, the period
   being one quarter).
7. **PDF as well as paper**, for every form: a PDF with a text layer (like the 2307 sample) is read exactly from
   its text by position, with no OCR; a PDF that is only a picture (a scanned page) is rendered and read like a
   photo. Page 1 only, unless a form says otherwise.
8. **Saved scans as MyBizMate import rows**: Sales import for sales, Purchase import for purchases, exported as files
   in those formats until there is a backend to send them to.
9. **The business's own customer, supplier and item lists**, kept in the app (imported from a file, and added from
   scans). With no list, the list checks are skipped instead of flagging every name.

Then iOS: the same app built with EAS and installed through TestFlight.

## Non-goals (for now)

- Logging in with MyBizMate accounts, syncing with MyBizMate's backend, or living inside another MyBizMate app (no
  details yet). The scanner is still built as a self-contained module, so it can move later.
- Uploading training data to a server (no backend yet): the first version exports it (see "Training data").
- Training on the phone, per-client models, a web version.

## Anti-goals (failures even if it works)

- Scanning that needs internet. Reading stays on the phone.
- Anything leaving the phone without the person's opt-in.
- Android and iPhone reading the same photo differently.
- More wrong sales that no check flags (today: 0 of 100 synthetic invoices, 1 in 720 stress-test photos).
- Training labels that aren't what the box says (for example an edit that changes the price of the sale rather
  than fixing what was read).

## Constraints

- **Development machine**: Windows 10 laptop with Node 24.20 and npm 11.19, the Android SDK with NDK 28.2 and
  CMake 3.22.1, Android Studio's JDK, the emulator `Medium_Phone_API_36.1`, and an RTX 3050 (4 GB) for training.
  No Mac: iOS is built in the cloud with EAS and installed through TestFlight.
- **Expo Go can't run it** (it has native code): it uses development builds (`npx expo run:android` on this laptop)
  and, for testers, normal builds (APK/AAB, TestFlight).
- **The model**: PP-OCRv6 small with its output cut to 98 Latin characters, a 12 MB ONNX file, run by ONNX
  Runtime. The same file serves Android and iOS. Fine-tunes become this file through
  `prototype/training/onnx_from_checkpoint.py` and `prototype/benchmark/optimize_models.py`'s Latin cut.
- **The reference behaviour** is the Python pipeline in `prototype/benchmark/`: `pipelines.py` (MyBizMate form),
  `frame_template.py` (Service Invoice), `photo_quality.py`, `enhance.py`, `ocr_engine.py` (crop preparation,
  per-box character sets, decoding with backup readings) and `postprocess.py` (the checks), with their tests
  `test_dates.py` (32 cases), `test_checks.py` (12) and `test_photo.py` (9). The Java app is a checked port of it
  (same reading on 243 of 243 sample boxes, same date and quantity answers on 4,000+ readings).
- **Privacy**: the photos show the clients' customers' details (names, addresses, TINs, signatures). The app user's
  consent is not their customers' consent, and a person's TIN is likely sensitive personal information under the
  Data Privacy Act. The team will get consent and check the rest with their data protection officer or lawyer.
- **App size**: about 90 MB today, mostly the full OpenCV and ONNX Runtime libraries.

## Approaches

1. **One C++ scanner core for both platforms (chosen)**: OpenCV and ONNX Runtime in C++, inside an Expo module,
   with a thin Android wrapper (Kotlin/JNI) and a thin iOS wrapper (Objective-C++/Swift). The screens and the
   checks are TypeScript.
2. **Wrap the Java scanner for Android, write an iOS one later**: the fastest Android build, but two scanners to
   keep identical forever. Rejected: iOS is coming soon, and the two scanners would cut boxes slightly differently,
   so one model would read differently on each phone and the training data would mix two kinds of crops.
3. **TypeScript with JavaScript bindings** (`react-native-fast-opencv`, `onnxruntime-react-native`): no native
   code to write, but the heavy steps (the table-border finder, the live camera) would likely be too slow, and
   some OpenCV functions the pipeline uses aren't exposed. Rejected.

Chosen because one implementation means the same crops and readings on both platforms, so one model and one
training set serve both, and iOS becomes a thin wrapper plus a build.

## The design

```
Expo app, TypeScript (one for Android and iOS)
  screens: Home (take photo · choose from gallery · import PDF) · Camera · Result + Edit ·
           Lists (customers, suppliers, items) · Training data & consent · Settings · Speed test (team)
  checks: postprocess.finalize ported to TypeScript (dates, rows, totals, VAT, matching) plus the 2307's,
          run again on every edit
  local data: recent scans, saved scans, the lists, the training-data queue, the export files
      │
      ├─ camera: react-native-vision-camera, a frame processor calls the core's detectFrame()
      ├─ PDF: the system file picker hands the file to the core's readPdf()
      └─ scanner module (Expo module)
            C++ core: corner squares · Service Invoice finder · 2307 finder · straighten ·
                      upside-down / sharpness / light · cut the boxes · prepare the crops · ONNX Runtime ·
                      decode with backup readings · enhance · PDF: render a page, take each box's own text
            Android: JNI wrapper            iOS: Objective-C++ wrapper
            assets: the model, its characters, the three form templates, the small blank forms, the ATC table
```

### The scanner core (C++)

A port of the Java core (`OcrEngine`, `FrameTemplate`, `PhotoQuality`, `Enhance`, about 1,900 lines) with the
Python as the reference. What the app can ask it:

- `scanPhoto(photo)`: which form, its corners, whether it was turned, the photo's sharpness and light (with the
  form's thresholds), the straightened page, the cash/account tick, and every box read: its name and type, its
  reading, confidence and backup readings, and its crop exactly as the model saw it (an image file the edit
  screen and the training data use).
- `detectFrame(frame)`, as a vision-camera frame processor: which form, the sheet's outline in the frame, and the
  frame's sharpness with the form's live threshold.
- `enhance(page, mode)`: the Enhanced or B&W view of the page.
- `readPdf(file)`: page 1 of a PDF, rendered and found like a photo, with each box read from the PDF's own text when
  it has some (see "PDF import"); the same answer as `scanPhoto`, plus which boxes came from text and the PDF's page
  count.

It loads the model and templates once, from the app's assets. Thresholds and constants keep their values from the
Python (`photo_quality.py`, `frame_template.py` and the rest). A template is data (a JSON of boxes plus a small
blank image, like `prototype/data/template/field_map.json` and `service_invoice.json`), so a new or changed form is
new data, not new code. Layouts the app has no template for are not read in the first version: the result says it
couldn't find the form.

### PDF import

- **Getting a PDF in**: Home → "Import PDF" opens the system file picker (Android's document picker, iOS Files).
  Opening a PDF from another app ("Open with", the share sheet) can come later.
- **Page 1 only**: the 2307 needs only page 1, and an invoice PDF is one invoice at first. When a PDF has more pages,
  the result says only page 1 was read.
- **Found like a photo, then read from the text where there is text**: the page is rendered at the photo pipeline's
  resolution, and the form is found and straightened exactly as in a photo, so any faithful copy of the form works,
  whatever program made the PDF. Each box then takes the PDF's own text that falls inside it (typed page text, or a
  value typed into a fillable PDF's form field), exact, with no OCR (confidence 1, no backup readings). A box with no
  text is read from the rendered page like a photo. A page that is a picture (a scan, or a phone photo saved as a
  PDF) is read entirely like a photo, photo checks included; the hidden text that scanner apps lay over their scans
  is their own OCR, so it is ignored. If the form isn't found, the result says so, as for a photo.
- **Checks**: the same as for a photo. Text readings are checked too (typed values can be wrong: the 2307's sums and
  rates still have to agree).
- **Training data**: boxes read from the text are typed and exact, so they never become training data; boxes read
  from the rendered page do, like photos.
- **Safety**: a PDF can come from anywhere. The reader runs without JavaScript or form actions and fetches nothing
  from the internet. Files over 20 MB, pages too big to render, and broken or password-protected PDFs are refused with
  a plain message.
- **Library**: pdfium (Chromium's PDF library, BSD license, built for Android and iOS) inside the C++ core, so both
  platforms render and read text the same way.

### BIR Form 2307 (page 1)

- **Whose 2307**: the business is the payee. A customer who withheld tax on a payment gives the business a 2307,
  which the business keeps to claim the tax credit. So 2307s arrive from many payors' programs, on paper or as PDFs.
- **Template**: measured on the official blank form (January 2018 ENCS, from the BIR website) and checked against the
  main dev's MyBizMate-printed sample (coordinates only; the sample's contents never go into the app or the repo).
  The tick marks between the digit boxes are erased before reading, like the Service Invoice's printed rules.
- **Boxes**: the period From/To, the payee's and the payor's TIN (9 digits plus the branch code), name, registered
  address and ZIP; Part III's rows (income payment, ATC, months 1-3, total, tax withheld) and its total row; the second
  table (money payments subject to business tax).
- **Checks**: each row's 3 months add up to its total; the tax withheld is the total times the ATC's rate (the ATC
  table from page 2 ships with the app); the rows add up to the total row; the period is one calendar quarter; the
  TINs have the right number of digits; the payor is matched against the customers list when there is one.
- **What it becomes**: MyBizMate has no 2307 import that we know of yet, so a saved 2307 is exported as its own CSV
  (one line per Part III row, with the period and the payor) until the team says where 2307s go.

### Lists

- **Customers, suppliers and items**, kept on the phone. Customers and suppliers keep what the forms show (last,
  first and middle name, trade name, TIN with branch code, address, payment terms), never contact numbers or emails;
  items keep name, unit and list price. They also keep any code the import templates need that isn't on the paper
  (a customer or item code, for example).
- **Filled** by importing a CSV (columns shown in the app; MyBizMate's own export format too, once the team shares
  it) and from scans: a name or item the lists don't have can be added from the result screen with one tap.
- **Empty lists skip their checks** (no "customer not in the list", no price-against-list flag), so a new install
  isn't all flags.
- **Matching** keeps today's rules: TIN plus name (a TIN isn't unique), word order ignored.

### Sale or purchase, and the export files

- The person marks an invoice scan as a **sale** (the default) or a **purchase** when saving. A sale's party is matched
  against customers; a purchase's against suppliers, chosen from the list or typed, because the seller printed on
  the form's header isn't one of the boxes read. A purchase can only be scanned when the supplier's invoice is one
  of the known forms (another business's MyBizMate Sales Invoice).
- Saved scans become rows in MyBizMate's **Sales import** or **Purchase import** format; 2307s become their CSV
  (above). "Export" shares the files (by date range, not yet exported first) so the person can import them into
  MyBizMate. Sending them straight to MyBizMate comes with the backend.

### Checks (TypeScript)

`postprocess.finalize` and its helpers (`Checks.java`, `Dates.java`, `Fuzzy.java`, about 900 lines) as pure
TypeScript functions: readings plus the scan pack (customers and items) plus today's date in, the sale and its
flags out. They run again after every edit. Same flag names and behaviour as the Python, checked with the same
cases (the Python tests' cases exported as shared fixtures).

### Camera

The current camera's behaviour, in React Native with vision-camera: the sheet's outline drawn over the preview, the
automatic photo once the outline has held still for 0.8 s (and at least 3 frames) and a frame is sharp enough, or
after 2 s more anyway (the scan then flags a blurry photo), "Auto/Manual", torch, gallery, and the permission flow
with the phone's camera app as a fallback.

### Edit after scan

On the result screen every field can be tapped. The editor shows the box's crop (what the camera saw), the box's
own reading (not the list's name a fuzzy match put in the sale), the backup readings as quick picks, and a text
field. An edit means "the box says this": the scanner fixes readings, it doesn't change the sale (changes to the
sale happen later, in Sales). So every edit is a clean training label. Saving re-runs the checks, so the flags and
"ready to post" update at once.

The person confirms the scan by saving it (as a sale or a purchase). That is the "checked" signal the training data needs
(below): a box nobody edited is only trustworthy if the person looked at the scan and saved it.

### Training data

- **Consent**: off until the person opts in; asked once, in plain words (what is kept, why, that it never includes
  the boxes listed below, how to stop), with "Not now"; changeable in Settings. Stopping deletes everything not yet
  sent.
- **Which scans**: only scans the person saved (confirmed). Not the sample invoices, not scans that were retaken or
  thrown away.
- **What is kept for each of those scans** (decided here as the default, to be confirmed with the team): for each
  box read, its crop as the model saw it, the first reading with its confidence and backup readings, the value the
  checks used when it differs (a backup reading the row math picked, a date rebuilt from its digits), the final
  text, and two marks: edited (the person changed it) and confirmed (the scan was saved); plus the box name and
  type, the form, and the model and app versions. Per scan: the photo checks (sharpness, light, turned), the flags,
  and a random ID made when the app was installed (no name or TIN), which keeps one phone's handwriting together. Edited boxes are the strong labels; the training script decides how far to trust confirmed, unedited ones
  (for example only when their reading agrees with what the checks used). Without these marks the data couldn't be
  cleaned later.
- **Kept out by default**: the name, TIN and address boxes (the customer's on invoices; the payee's and the payor's
  on a 2307), and anything outside the boxes (signatures, the full photo). The training value is in the dates, amounts, quantities, prices, units, item names and amounts
  in words, which is also where the money errors are. Whole photos and personal boxes only if the team decides so
  and their DPO agrees.
- **Where it goes**: a queue in the app's private storage. First version: "Export training data" shares a zip
  with the team. Upload to a server comes when the team chooses the destination.
- **The team's annotation mode (before the Play Store)**: the first fine-tune uses real invoices the team collects
  (with the clients' permission) and corrects in the app itself. In this mode, a setting in team builds, a scan can
  only be saved once every box is confirmed or corrected, so every label is checked. Each scan also gets a source
  tag the team picks (a code for the client and the writer, never a name), because a few team phones will scan many
  clients' handwriting. Its export has the same format, so the team's data and people's data take one path to the
  training set. The team can start photographing real invoices now and annotate them once this mode exists
  (milestone 4). Aim: at least 20 different writers, with at least 5 kept out of training for testing.
- **Using it**: a script turns exports into the training set format of `prototype/training/` (crops and labels),
  split by writer (the source tag for the team's data, the install ID for people's data) so testing uses writers the
  model never trained on; then fine-tune, evaluate on those held-out writers (plus the synthetic benchmark, so nothing
  regresses), convert with `onnx_from_checkpoint.py`, cut to Latin, and ship only if the held-out writers are read
  better.

### Model updates

First version: the model ships inside the app, so a new model means an app update. Later: the app downloads a newer
model when online (checked by version and checksum). Both platforms always get the same file.

### Same results everywhere (tests)

- **Fixtures**: the 8 sample invoices, the photo test images (upright, upside down, blurred, shaken, dark), synthetic
  Service Invoices drawn from its template (the one real photo is client data, so it is only used for checks on
  this laptop and emulator, never shipped), 2307s filled with made-up values on the blank form (as a text PDF, a
  picture PDF and a photo; never the main dev's sample), and the date and check cases. Expected outputs: the Python
  reference's for the existing forms; for the 2307s, the values written in (the 2307 and PDF reading are new, with
  no Python version).
- **The core**: a test run on the emulator (and on iOS later) compares every reading, flag and photo measure with
  the Python's, the way the Java port was checked.
- **The checks**: unit tests in Node on the shared cases.

### Releases

- **Android**: the final package name (proposal: `com.mybizmate.scan`; it can't change after publishing), an
  upload key, an AAB, Play Console internal testing, then closed testing and production; a privacy policy and the
  Data safety form (camera; files the person picks; corrections and crops only with consent).
- **Phones**: Android 8.0 (API 26) or newer. The Play build carries arm64-v8a and armeabi-v7a (budget phones still
  run 32-bit Android); x86_64 only in development builds, for the emulator. Before the Play Store: the emulator plus
  at least one real arm64 phone, and the speed test on a mid-range phone (target: under 3 seconds from photo to
  result, to be checked against the first real-phone numbers).
- **The model at release**: whichever reads the team's held-out writers better. If the first fine-tune loses to the
  pretrained model (as the date fine-tune did on the office receipt), the release ships the pretrained model
  instead of waiting.
- **Play account**: a personal developer account created after November 2023 must first run a closed test with at
  least 12 testers for 14 days (Google's rule; check it at release time); an organization account doesn't.
- **iOS**: EAS builds (development, then TestFlight), the bundle id, the camera usage text, App Privacy details.

### Milestones

1. The Expo app and the C++ core read a gallery photo on Android, with the same readings as the Python.
2. The camera, both forms, the photo checks and the scan view: everything the test app does.
3. Edit after scan, the checks, the lists, sale or purchase, and the Sales/Purchase import files.
4. The training-data export and the team's annotation mode. The team annotates while 5 and 6 are built.
5. PDF import and BIR Form 2307 (template, checks, text reading, its CSV).
6. Consent and the training-data queue for people's scans.
7. The first fine-tune on the team's annotated invoices: the new model ships only if it reads the held-out writers
   better and is no worse on the synthetic benchmark.
8. A Play Store build, tested on real phones: internal testing, then closed testing and production.
9. iOS through EAS and TestFlight.

## Decided

By the team: Expo with development builds; one C++ scanner core (approach 1); Android first, then iOS; edits after
a scan; corrections and photos become training data only with consent, which the team collects; this is the actual
app, built as one standalone OCR app for now (no MyBizMate login or backend yet); both paper and PDF; BIR Form 2307
page 1 as a third form; scans become Sales import or Purchase import rows; annotated real data and a first
fine-tune before the Play Store, then people's consented edits for further fine-tuning; the prototype form's layout
is the real MyBizMate Sales Invoice's (final); the checks in TypeScript, since MyBizMate's mobile app is Expo/React
Native too.

My calls (open to change): vision-camera for the camera; personal boxes and whole photos
kept out of the training data by default; only saved scans give training data, with "edited" and "confirmed" marks
per box; a random install ID (not the business's name or TIN) to keep each phone's data together; the team's
annotation mode with a source tag per scan, built before the PDF and 2307 work so annotating starts early; at least
20 writers, 5 held out; the release ships the better model and doesn't wait for a fine-tune win; export before
upload; the model inside the app at first; synthetic Service Invoices for the shared tests; templates as data, and
unknown layouts not read; PDFs: page 1, found like a photo, then exact text where a box has text, else OCR, pdfium,
20 MB limit; the business as the 2307's payee; the lists kept on the phone, filled from CSV and from scans, skipped
when empty; sale by default, purchase on request; the 2307 exported as its own CSV; Android 8.0 or newer, arm64 and
32-bit ARM; the app in a new folder `mybizmate-ocr/` next to `prototype/`, which stays the Python reference and
training workspace.

## Needed from the team

Before milestone 3:

- The **Sales import** and **Purchase import** templates (their columns and an example file). If they need values
  that aren't on the paper (a customer or item code, a VAT class), the lists and the save step must ask for them.
- MyBizMate's export format for customers, suppliers and items, if the lists should read it.

Before milestone 5:

- Where 2307s go in MyBizMate, if anywhere yet (until then, the CSV).
- A few 2307 PDFs with made-up values: one printed by MyBizMate from a test account, and others from other programs
  or the BIR's fillable form, if the team has them.

Before milestone 8:

- Whether the Play developer account is an organization or a personal one, and the final package name and iOS
  bundle id.

## Left to the builder

Library versions (current at build time), navigation and state libraries, the C++ code's structure, how OpenCV,
ONNX Runtime and pdfium are linked on each platform, how the 2307 is found in a photo (its outer border and section
lines, like the Service Invoice's frame), the lists' CSV columns, screen layouts within the existing MyBizMate look,
and the test framework.
