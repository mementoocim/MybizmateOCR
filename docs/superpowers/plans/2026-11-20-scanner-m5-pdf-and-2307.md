# MyBizMate Scan, milestone 5: PDF import and BIR Form 2307 (page 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Read page 1 of a PDF (any of the three forms) and BIR Form 2307 page 1 (from a photo or a PDF), check a 2307, save it, and export saved 2307s as rows of MyBizMate's 2307-CWT (received) import.

**Architecture:** pdfium (prebuilt, no JavaScript) joins the C++ core. `renderPdf` renders page 1 at the photo pipeline's size and lists its visible text with positions. The rendered page then goes through the usual `scanImage`, so a PDF is found and straightened like a photo. Where a box has PDF text inside it (mapped through the form's homography), that text replaces the OCR reading with confidence 1. The 2307 becomes a second "frame form" beside the Service Invoice: the frame template, the aligner and the box cutter are generalized to load any number of frame templates. The app gets the 2307's checks in TypeScript, its own result sections, a save step, and a third export (the 2307-CWT import).

**Tech Stack:** Expo SDK 58, React Native 0.88, TypeScript, jest-expo, RNTL 14; the C++ core (OpenCV 5.1.0, ONNX Runtime 1.32.0, doctest) with pdfium from `bblanchon/pdfium-binaries` release `chromium/8125` (PDFium 158.0.8125.0, the non-V8 Android builds); Kotlin (Expo module); Python 3.12 in `../.venv` for the template and fixtures, with `pypdfium2` added.

**Spec:** `docs/2026-11-19-expo-scanner-design.md`, the sections "PDF import" and "BIR Form 2307 (page 1)", milestone 5 ("PDF import and BIR Form 2307 (template, checks, text reading, its CSV)").

**Settled with the user (2026-11-20):**
- **Milestone 5 runs before milestone 4** (the training-data export and annotation mode come right after).
- **The MyBizMate-printed test 2307** is certificate `2307I-000001` of the test company "Sales Bizmate" (Sheets → WTP → Print 2307 → Download PDF; test values: payee "Dela Cruz, Juan", payor "Bizmate, Intelligence"). Its file is `prototype/data/template/bir2307/mybizmate-printed/BIR-2307-2307I-000001-Dela-Cruz-Juan.pdf`. It stays in `prototype/` (never pushed) and is only used for checks on this laptop and the emulator.
- **The official blank form** is `prototype/data/template/bir2307/2307 Jan 2018 ENCS v3.pdf`, from bir.gov.ph (made by Excel 2016, two pages: the form and the ATC table).
- **Where 2307s go:** MyBizMate's Sheets → CWT ("2307-CWT", the 2307s received). Its import template is `docs/mybizmate-templates/2307-received-import/2307-received-import-template.xlsx`, sheet "Import": `Date *`, `Customer *`, `Tax Base (Net)`, `CWT IT`, `IT Amt`, `CWT VT`, `VT Amt`, `Offset Account *`, `Cert No.`, `Branch`, `Particulars`. This replaces the design's stopgap CSV.

## Global Constraints

- **This is the actual app, not a test app.** Team tools appear only in team builds (`lib/build.ts` `TEAM_BUILD`), people's data persists across launches, and no invoice or certificate content is ever logged.
- **Privacy:**
  - Real client receipts in `../prototype/data/real_private/` and the main dev's BIR 2307 sample are never read by code, copied, committed or screenshotted.
  - The MyBizMate-printed test 2307 stays in `prototype/`. `prototype/` is never pushed.
  - Contact numbers and emails are never kept on the phone.
- **PDF safety** (design, "PDF import"):
  - pdfium's non-V8 build: no JavaScript, no form actions, nothing fetched from the internet.
  - Files over 20 MB, pages too big to render, and broken or password-protected PDFs are refused with a plain message.
  - Page 1 only. When there are more pages, the result says only page 1 was read.
- **The pdfium binaries** are pinned:
  - release `chromium/8125`, the four `pdfium-android-{arm64,arm,x64,x86}.tgz`, each checked against a SHA-256 written in the fetch script;
  - every ABI the app builds gets its `libpdfium.so`;
  - `libpdfium.so` must be aligned for 16 KB pages (checked, not assumed);
  - its license (BSD-3-Clause, with the binaries project's notice) is listed in the README.
- **Same results everywhere:**
  - the Sales and Service Invoice parity with the Python stays exact (`npm run test:core`);
  - the 2307 and PDF reading have no Python version: their expected values are the values written into the synthetic fixtures.
- **TDD for every step** that changes behaviour. Before a task is done, run `npx jest`, `npx tsc --noEmit` and `npm run lint`, plus the core and Kotlin tests for native tasks.
- **Written deliverables are in English.** Copy follows the app's voice: short, plain sentences.
- **The repo's only developer.** No pull requests. Work is merged into `master` and pushed only when the user says so.
- **Tool gotchas** (from milestone 3):
  - the Write tool turns `\u` escapes into characters, so write code with `String.fromCharCode` or literal characters;
  - files are CRLF in the working tree;
  - Git Bash needs `MSYS_NO_PATHCONV=1` for `/sdcard` paths.

## Review Focus

1. **A scanned PDF with its scanner app's hidden OCR text.** It must be read as a picture: its text is invisible (render mode 3) and is ignored. Test: Task 5, `a scan's hidden text is ignored`.
2. **PDF text near a box's edge.** A value's characters can straddle the box, or a neighbouring box's text can lie close. A character belongs to the box that holds its centre, mapped through the homography. Tests: Task 5, `text goes to the box that holds its centre` and the MyBizMate-printed 2307 check in Task 11.
3. **A PDF that can't be read normally:** password-protected, broken, over 20 MB, a huge page, or several pages. Each gets its plain message, or the "page 1 of N" note. Tests: Task 3 (the core) and Task 8 (the screens).
4. **A 2307 with blank rows between filled rows, or amounts like "1,500.00".** Only rows with values count, and amounts parse as on invoices. Test: Task 7, `blank rows are skipped and commas parse`.
5. **The two frame forms told apart.** A Service Invoice photo must never be read as a 2307, nor the reverse. Tests: Task 4, `each frame form is found as itself`, with every Service Invoice fixture still found as a Service Invoice.

---

### Task 1: The 2307 template and its ATC table, measured on the official blank form

**Files:**
- Create: `../prototype/benchmark/make_2307_template.py`, `../prototype/benchmark/test_make_2307_template.py`
- Create (written by the script): `modules/scanner/assets/scanner/bir_2307.json`, `lib/checks/atc2307.json`
- Modify: `../.venv` (add `pypdfium2` and `pypdf`, the versions current at build time) and `../prototype/README.md:27` (the same two names added to its install line)

**Interfaces:**
- **Produces `bir_2307.json`,** in the Service Invoice template's shape (`service_template.cpp` parses it). It has:
  - `name: "bir_2307"`, `title: "BIR Form 2307"`, `page: [w, h]` (pixels at 200 DPI of the form's page size), `frame{tl,tr,br,bl}` (the outer border), `grid{h,v}` (the ruled lines), `slack`, `paper` and `fields[]`;
  - a field is `{name, bbox:[x0,y0,x1,y1], type, label}` (`label` is new, read by the app; optional `grab`/`multiline` as today).
- **The 2307's field names:**
  - `period_from` and `period_to`, of type `digits` (eight digits, MMDDYYYY);
  - `payee_tin` and `payor_tin`, of type `tin` (digits; the cutter erases the dashes and ticks);
  - `payee_name`, `payee_address`, `payor_name` and `payor_address`, of type `text`;
  - `payee_zip` and `payor_zip`, of type `digits`;
  - for each table row r, `ewt{r}_payment` (`text`), `ewt{r}_atc` (`code`), and `ewt{r}_m1`, `ewt{r}_m2`, `ewt{r}_m3`, `ewt{r}_total` and `ewt{r}_tax` (`amount`), for r = 1..R;
  - `ewt_total_m1`, `ewt_total_m2`, `ewt_total_m3`, `ewt_total_total` and `ewt_total_tax`;
  - the same for the business-tax table, with the prefixes `bt{r}_` and `bt_total_`;
  - R and the business-tax table's row count are measured on the form.
- **The new box types** are `digits` (0–9) and `code` (A–Z, 0–9).
- **Produces `atc2307.json`:** `[{code, rate, description, table: 'ewt'|'bt'}]`, from page 2's ATC table. `rate` is a fraction (0.01 for 1%).

- [ ] **Step 1: Write the failing test** `test_make_2307_template.py` (a plain script, like the other benchmark tests). It checks:
  - `the template has every box`: all the names above, with R ≥ 8, each bbox inside `page`, and no two boxes overlapping;
  - `the boxes sit on the form's own lines`: rendering the blank page 1 at 200 DPI (pypdfium2) and measuring each table cell's ruled lines finds every Part III box within 3 px of its bbox;
  - `the ATC table reads like page 2`: at least 30 codes, including `WC158` (rate 0.01), `WI010` and `WC010` (0.05 or 0.10, as page 2 says), and `WV010` (in table `bt`, rate 0.05); every rate is between 0 and 0.35;
  - `the MyBizMate-printed 2307 lines up`: after its page is rendered and aligned to the template by the frame corners, the grid lines are within 6 px. It runs only when the local file exists, and prints "skipped (local file missing)" otherwise.

- [ ] **Step 2: Run it.** `..\..\.venv\Scripts\python.exe test_make_2307_template.py` from `../prototype/benchmark`. Expected: FAIL (no script yet).

- [ ] **Step 3: Implement `make_2307_template.py`.**
  - Render page 1 of the blank form at 200 DPI.
  - Find the ruled lines with OpenCV morphology, the way `make_service_invoice_template.py` measures its grid, but from the blank form, not by hand.
  - Name the boxes from the form's printed layout: item numbers 1–8, Part III's columns, and the two tables.
  - Read page 2's text for the ATC codes and rates.
  - Write both JSON files with `indent=1`, and copy them into the app as `export_core_fixtures.py` does. Don't touch the private sample.

- [ ] **Step 4: Run it.** Expected: PASS. Look once at the overlay `bir_2307_overlay.png` (written to the scratch folder, not the repo): every box drawn on the blank form sits in its cell.

- [ ] **Step 5: Commit** (in `mybizmate-ocr`; `prototype/` is never pushed):

```bash
git add modules/scanner/assets/scanner/bir_2307.json lib/checks/atc2307.json
git commit -m "feat(scanner): the BIR 2307 template and its ATC table, measured on the official blank form"
```

---

### Task 2: Synthetic 2307s with made-up values: text PDF, picture PDF and photo

**Files:**
- Create: `../prototype/benchmark/synth_2307.py`, `../prototype/benchmark/test_synth_2307.py`
- Modify: `../prototype/benchmark/export_core_fixtures.py` (it also exports the 2307 fixtures)
- Create (written by the exporter): `fixtures/core/pdf/*.pdf`, `fixtures/core/photos/bir2307_*.jpg`, `fixtures/core/expected2307/*.json`

**Interfaces:**
- **Consumes:** Task 1's `bir_2307.json` and `atc2307.json`.
- **Produces fixtures:**
  - `fixtures/core/pdf/bir2307_text_{0..2}.pdf`: the blank form with values as real PDF text, in Helvetica (pdfium's standard font), drawn with pypdfium2's page-object API;
  - `bir2307_picture_{0..1}.pdf`: the page rendered and saved as an image-only PDF; one of them gets an invisible OCR text layer (render mode 3) holding wrong text, standing in for a scanner app's layer;
  - `bir2307_photo_{0..2}.jpg`: `synth.photo_effects` on the rendered page;
  - `sales_text_0.pdf` and `sales_picture_0.pdf`: a sample invoice image saved as an image PDF, plus a typed text version with Helvetica values in Sales Invoice boxes;
  - the refused files and the long one:
    - `broken.pdf`: a text 2307 cut to its first half;
    - `password.pdf`: a text 2307 encrypted with pypdf's `PdfWriter.encrypt("secret")`;
    - `two_pages.pdf`: a text 2307 with the official form's page 2 (the ATC table) kept, as real 2307 PDFs often have it.
- **Produces `expected2307/<stem>.json`:** `{stem, kind: 'text'|'picture'|'photo', form: 'bir_2307', pageCount, values: {<field>: <text as written>}}`.

- [ ] **Step 1: Write the failing test** `test_synth_2307.py`. It checks:
  - `made-up values that add up`: each month sums to the row total, the tax is round(total × rate, 2), the totals rows add up, the period is one calendar quarter, and the TINs have 9+5 digits;
  - `the text PDF holds the values as text`: pypdfium2's text page finds each value inside its box (centres within the bbox at 200 DPI);
  - `the picture PDF has no visible text`: `bir2307_picture_1.pdf`'s only text is render mode 3;
  - `the photos are photos`: JPEG, long side 1700–2300 px;
  - `the refused files are refused`: pypdfium2 raises for `broken.pdf` and `password.pdf`; `two_pages.pdf` has 2 pages.

- [ ] **Step 2: Run it.** Expected: FAIL.

- [ ] **Step 3: Implement `synth_2307.py`.**
  - Use `Random(2026)`. Payees and payors are made-up businesses and people, as in `synth.py`'s customers, with made-up TINs and addresses.
  - Use 1–4 EWT rows with real ATC codes from `atc2307.json`, and 0–1 business-tax rows.
  - Leave blank rows between some filled rows.
  - Write amounts with thousands commas and two decimals.
  - Export it from `export_core_fixtures.py`, keeping the existing outputs byte for byte (its test still passes).

- [ ] **Step 4: Run** `test_synth_2307.py` and `test_export_core_fixtures.py`. Expected: PASS.

- [ ] **Step 5: Commit:**

```bash
git add fixtures/core
git commit -m "test(fixtures): synthetic BIR 2307s and PDFs: text, picture, photo and refused files"
```

---

### Task 3: pdfium in the core: fetch, link, package, and `renderPdf`

**Files:**
- Create: `scripts/fetch-pdfium.mjs`, `modules/scanner/cpp/core/pdf_reader.{h,cpp}`, `modules/scanner/cpp/tests/test_pdf_reader.cpp`
- Modify: `modules/scanner/cpp/CMakeLists.txt` (link `scanner::pdfium`), `modules/scanner/android/CMakeLists.txt` (the imported target, after :14), `modules/scanner/android/build.gradle` (a `fetchPdfium` task before `configureCMake*`, `-DPDFIUM_DIR`), `modules/scanner/cpp/tests/CMakeLists.txt` (after :15), `scripts/core-test.mjs` (pass `PDFIUM_DIR`, push `libpdfium.so` at :97-104), `.gitignore`

**Interfaces:**
- **Produces `fetch-pdfium.mjs`:**
  - It downloads `https://github.com/bblanchon/pdfium-binaries/releases/download/chromium%2F8125/pdfium-android-<abi>.tgz` for `arm64`, `arm`, `x64` and `x86`.
  - It checks each file's SHA-256 against the constants in the script. Fill them in the first run, from the downloaded files, and record the values in the commit message.
  - It extracts into `%LOCALAPPDATA%/mbs-cxx/pdfium/chromium-8125/<android ABI>/` (`os.homedir()/.cache/mbs-pdfium/...` on other systems), with `include/` and `lib/libpdfium.so`.
  - It does nothing when the files are already there and verified.
- **Produces `pdf_reader.h`:**

```cpp
namespace mbm {
struct PdfChar { char32_t ch; cv::Rect2f box; };             // in the rendered page's pixels
struct PdfPage { cv::Mat bgr; std::vector<PdfChar> chars; int pageCount; bool picture; };
struct PdfError : std::runtime_error { std::string code; };  // "too_big", "broken", "password", "page_too_big"
PdfPage renderPdf(const std::string& path);                  // page 1, long side MAX_SIDE (2400)
}
```

  - `picture` is true when page 1 has no visible characters. Characters in render mode 3 (invisible) are left out of `chars`.
  - Form-field values are flattened into the page before its text is read (`FPDFPage_Flatten`, then the page is reloaded).
  - The file must be at most 20 MB. A page whose long side is over 2000 pt is refused with `page_too_big`.
  - pdfium is initialised once, with no V8.

- [ ] **Step 1: Write the failing tests** `test_pdf_reader.cpp`:
  - `a text PDF's page and characters`: `bir2307_text_0.pdf` has pageCount 1 and picture false; its long side is 2400; `payee_name`'s value appears in `chars` in order, inside the box scaled to the render.
  - `a picture PDF`: `bir2307_picture_1.pdf` has picture true, and no characters of its invisible layer.
  - `the refused PDFs`: `broken.pdf` → `broken`, `password.pdf` → `password`, a 21 MB file (made in the test) → `too_big`.
  - `two pages`: `two_pages.pdf` has pageCount 2, and page 1 is rendered.

- [ ] **Step 2: Run** `npm run test:core -- -tc="*pdf*"` (the emulator running). Expected: FAIL to build (no `pdf_reader`).

- [ ] **Step 3: Implement.** Write the fetch script, the CMake and Gradle wiring, and `pdf_reader.cpp` with pdfium's C API:
  - `FPDF_LoadDocument` and `FPDF_GetLastError`;
  - `FPDF_LoadPage`, then `FPDFPage_Flatten` and a reload;
  - `FPDFBitmap_CreateEx` with BGRx, a white fill, and `FPDF_RenderPageBitmap` with `FPDF_ANNOT`;
  - `FPDFText_LoadPage`, with `FPDFText_GetUnicode`, `FPDFText_GetCharBox` and `FPDFText_GetTextObject` plus `FPDFTextObj_GetTextRenderMode` to skip invisible text.
  - Page points become pixels as `x · scale`, `(H − y) · scale`.

- [ ] **Step 4: Run** `npm run test:core` (all cases), then build the debug APK.
  - Expected: PASS, and `unzip -l android/app/build/outputs/apk/debug/app-debug.apk | grep libpdfium` lists it once per ABI.
  - `llvm-readelf -l` on the arm64 `libpdfium.so` (from the NDK) shows LOAD alignment `0x4000` or more. If it doesn't, stop and report.

- [ ] **Step 5: Commit:**

```bash
git add scripts modules/scanner .gitignore
git commit -m "feat(scanner): pdfium (chromium/8125, no V8) renders a PDF's page 1 and lists its visible text"
```

---

### Task 4: The 2307 as a second frame form

**Files:**
- Modify:
  - `modules/scanner/cpp/core/service_template.{h,cpp}`: a general frame template, keeping the class name and adding the optional `label`;
  - `frame_aligner.{h,cpp}`: one aligner per template;
  - `scanner.{h,cpp}`: `Assets` gains `bir2307Json` after `serviceJson`; `scanImage` tries each frame form; `readService` becomes `readFrameForm(const FrameForm&)`;
  - `box_cut.cpp`: ticks erased in `tin` and `digits` boxes;
  - `recognizer.cpp`: the `digits` and `code` types;
  - `photo_quality.h`: the 2307 uses the Service Invoice's sharpness and light thresholds.
- Modify: `modules/scanner/android/src/main/cpp/scanner_jni.cpp` (`create` gains the JSON; `detectFrame`'s form code 2), `NativeScanner.kt`, `ScannerModule.kt` (load `bir_2307.json`), `ScannerCameraView.kt:317-322` (code 2 → `bir_2307`), and `test_scanner.cpp` and `test_detect.cpp` (the positional `Assets`)
- Test: `modules/scanner/cpp/tests/test_frame_forms.cpp`

**Interfaces:**
- **Consumes:** Task 1's template, Task 2's photos and picture-PDF pages.
- **Produces:**
  - the result `form` `"bir_2307"`, with reads named as in Task 1;
  - `detectFrame` returns the 2307's outline in the camera, labelled "BIR Form 2307";
  - `scanImage` picks the frame form with the highest aligner score of at least `MIN_SCORE` (0.75);
  - the Sales corner squares are still tried first.
- **Blank boxes:**
  - a 2307 box with no ink (the Sales rule, `cropField`'s ink test) goes into `blanks` and isn't read;
  - so a mostly empty Part III costs little.

- [ ] **Step 1: Write the failing tests** `test_frame_forms.cpp`:
  - `each frame form is found as itself`: every Service Invoice fixture is still `service_invoice`; every `bir2307_photo_*` and the rendered `bir2307_picture_*` pages are `bir_2307`.
  - `the 2307's printed values read right`: on the rendered picture-PDF pages, every written value reads exactly (typed text, no handwriting), except at most 2 boxes per page, each still within one character.
  - `the photos read`: across `bir2307_photo_*`, at least 90% of the written boxes read exactly.
  - `ticks don't read as ones`: no `tin` reading has more digits than written.
  - The existing parity suite stays exact: 27 photos, 243 sample boxes, 45 reads for inv_0007.

- [ ] **Step 2: Run** `npm run test:core`. Expected: FAIL (no `bir_2307` form).

- [ ] **Step 3: Implement as listed under Files.** Keep the Sales and Service code paths' arithmetic as it is, so the parity suite stays exact. Tick erasure:
  - inside `tin` and `digits` boxes, vertical strokes taller than 0.5 × the box height and thinner than 4 px are painted paper grey before the crop;
  - this happens in `box_cut.cpp` next to the rules erasure.

- [ ] **Step 4: Run** `npm run test:core` and `./gradlew :scanner:testDebugUnitTest`. Expected: PASS.

- [ ] **Step 5: Commit:**

```bash
git add modules/scanner
git commit -m "feat(scanner): BIR Form 2307 as a second frame form: found, straightened, ticks erased, read"
```

---

### Task 5: `scanPdf`: the page read like a photo, then each box's own PDF text

**Files:**
- Modify: `modules/scanner/cpp/core/scanner.{h,cpp}` (`scanPdf`; `scanImage` also returns the photo-to-page homography internally), `result_json.cpp`
- Test: `modules/scanner/cpp/tests/test_scan_pdf.cpp`

**Interfaces:**
- **Consumes:** `renderPdf` (Task 3) and `scanImage` with frame forms (Task 4).
- **Produces** `ScanResult Scanner::scanPdf(const std::string& pdfPath, const std::string& outDir)`. Its JSON adds:
  - `source: "pdf"`, `pageCount` and `picture` (null for photos);
  - each read's `fromText` (true when its text came from the PDF).
- **Mapping text into boxes:**
  - each box's template rect is mapped onto the rendered page with the inverse homography;
  - a character belongs to the box whose mapped quadrilateral holds its centre;
  - the characters are joined in pdfium's order, generated spaces kept and runs of spaces squeezed;
  - such a read gets `conf` 1 and `alts` [], and its crop is still cut from the rendered page;
  - a box with no characters is read by the model as usual;
  - a picture page skips the text step entirely, and the photo checks apply as for any photo.
- **Errors:** `PdfError` reaches JNI as `IOException("pdf_<code>")`.

- [ ] **Step 1: Write the failing tests** `test_scan_pdf.cpp`:
  - `a text 2307 reads exactly from its text`: for each `bir2307_text_*`, every value written equals the read, with `fromText` true and conf 1.
  - `text goes to the box that holds its centre`: a value drawn 40% over a box's right edge goes to the box holding its centre, and nothing leaks into the neighbour.
  - `a scan's hidden text is ignored`: `bir2307_picture_1.pdf` reads like its photo, with no `fromText` and the wrong layer text nowhere.
  - `an invoice PDF reads like its photo`: `sales_picture_0.pdf`'s reads match the same image as a photo; `sales_text_0.pdf`'s typed boxes come from text.
  - `page 1 of 2`: `two_pages.pdf` gives `pageCount` 2.

- [ ] **Step 2: Run** `npm run test:core -- -tc="*scan_pdf*"`. Expected: FAIL.

- [ ] **Step 3: Implement as listed under Interfaces.**

- [ ] **Step 4: Run** `npm run test:core`. Expected: PASS, the parity suite unchanged.

- [ ] **Step 5: Commit:**

```bash
git add modules/scanner
git commit -m "feat(scanner): scanPdf: a PDF's page found like a photo, each box from its own text"
```

---

### Task 6: `readPdf` for the app: Kotlin, JNI and the JS module

**Files:**
- Modify: `modules/scanner/android/src/main/cpp/scanner_jni.cpp` (`scanPdf`), `NativeScanner.kt`, `ScannerModule.kt`, `modules/scanner/src/index.ts`, `src/types.ts`, `src/parse.ts`, `test-utils/coreJson.ts`
- Test: `modules/scanner/android/src/test/java/expo/modules/scanner/PdfInputTest.kt`, `__tests__/scanResult.test.ts`

**Interfaces:**
- **Produces** `readPdf(uri: string): Promise<ScanResult>`. It works like `scanPhoto`:
  - it runs on the scanner thread and copies a `content://` URI to the work folder;
  - it deletes that copy, never the person's file;
  - it keeps the newest 6 scan folders.
- **Rejected promises** carry the codes `pdf_too_big`, `pdf_broken`, `pdf_password`, `pdf_page_too_big` and `pdf_unreadable`. A file over 20 MB is refused before it is copied: `PdfInput.sizeOk(bytes)`.
- **The types change:**
  - `FormName` gains `'bir_2307'`; `FieldType` gains `'digits'` and `'code'`;
  - `ScanResult` gains `source: 'photo'|'pdf'`, `pageCount: number | null` and `picture: boolean | null`;
  - `BoxRead` gains `fromText: boolean`.
- `coreJson(stem)` also reads `fixtures/core/expected2307` (the expected JSON gains the core's PDF fields).

- [ ] **Step 1: Write the failing tests:**
  - `PdfInputTest`: `sizeOk` takes 20 MB and refuses 20 MB + 1 byte; the work copy is removed after a read and after a failure.
  - `scanResult.test.ts`: `a PDF result parses`, covering `source`, `pageCount`, `picture` and `fromText`, with an old photo JSON still parsing with `source: 'photo'`.

- [ ] **Step 2: Run** `./gradlew :scanner:testDebugUnitTest` and `npx jest __tests__/scanResult.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run** both suites, `npx tsc --noEmit` and `npm run lint`. Expected: PASS.

- [ ] **Step 5: Commit:**

```bash
git add modules/scanner test-utils __tests__
git commit -m "feat(scanner): readPdf for the app, with its refusals and the PDF fields in the result"
```

---

### Task 7: The 2307's checks in TypeScript

**Files:**
- Create: `lib/checks/bir2307.ts`, `__tests__/checks2307.test.ts`
- Modify: `lib/forms.ts` (FORMS and fields for `bir_2307`, with labels from the template), `lib/checks/index.ts`

**Interfaces:**
- **Consumes:** `atc2307.json` and `num.ts` (`parseAmount`, `candidates`, `pyRound`); `matchCustomer` (finalize.ts) for the payor; `packFor` (lists.ts); `localIsoDate` (dates.ts).
- **Produces:**

```ts
export type CertRow = { table: 'ewt' | 'bt'; row: number; payment: string; atc: string | null; rate: number | null;
  months: [number | null, number | null, number | null]; total: number | null; tax: number | null };
export type Cert2307 = { from: string | null; to: string | null; quarter: string | null;  // "2026-Q4"
  payee: { tin: string; name: string; address: string; zip: string };
  payor: { tin: string; name: string; address: string; zip: string };
  payorMatch: { id: string; status: CustomerStatus };
  rows: CertRow[]; totals: { ewt: CertRow | null; bt: CertRow | null }; flags: string[] };
export function check2307(raw: Raw, pack: Pack): Cert2307;
export function problems2307(c: Cert2307): string[];
```

- **The flags:**

  | Flag | Raised when | Its problem word |
  |---|---|---|
  | `period` | the period isn't one calendar quarter or can't be read | "Period" |
  | `payee_tin` | a TIN isn't 9, 12 or 14 digits | "Payee's TIN" |
  | `payor_tin` | the same, for the payor | "Payor's TIN" |
  | `payor_new` | the payor isn't in a non-empty customers list | "Payor (not in your customers)" |
  | `payor_unsure` | the payor's match is unsure | "Payor (confirm the match)" |
  | `ewt{r}_sum` | the 3 months don't add up to the row's total (±0.01) | "Row r months" |
  | `ewt{r}_tax` | the tax isn't round(total × rate, 2) (±0.05: monthly roundings) | "Row r tax" |
  | `ewt{r}_atc` | the code isn't in the table | "Row r ATC" |
  | `ewt_total` | the rows don't add up to the total row, per column | "Totals" |
  | `bt…` | the same checks for the business-tax table | "Business tax row r …" |

- **Rows:**
  - a row counts when any of its amounts or its ATC has a value;
  - blank rows are skipped;
  - each amount takes the first candidate that makes the row add up, as the invoice rows do.

- [ ] **Step 1: Write the failing tests** `checks2307.test.ts`, using the values of Task 2's expected files as raw boxes:
  - `a made-up 2307 has no flags`: every `expected2307` stem gives `flags: []`.
  - `the period must be one quarter`: `10/01/2026` to `12/31/2026` → `2026-Q4`; `10/01/2026` to `11/30/2026` raises `period`.
  - `a row's months and its tax`: a month off by 10 raises `ewt1_sum`; a tax at 2% for WC158 raises `ewt1_tax`; `WZ999` raises `ewt1_atc`.
  - `blank rows are skipped and commas parse`: rows 1 and 4 filled, 2 and 3 blank, with "1,500.00" → 2 rows, total 1500.
  - `the payor against the customers`: with PACK_LISTS, a payor named like a pack customer is `auto`; with empty lists there's no payor flag.
  - `the problem words`, in the order of the table above.

- [ ] **Step 2: Run** `npx jest __tests__/checks2307.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run** `npx jest`, `npx tsc --noEmit` and `npm run lint`. Expected: PASS.

- [ ] **Step 5: Commit:**

```bash
git add lib __tests__
git commit -m "feat(checks): BIR Form 2307 checks: the quarter, TINs, each row's months and tax, totals, the payor"
```

---

### Task 8: Import PDF from Home, and PDF results on the scan screen

**Files:**
- Modify: `app/index.tsx` ("Import PDF"), `lib/scanFlow.ts` (`fromPdf`; `retake` for a PDF picks again), `lib/scans.ts` (`ScanSource` gains `'pdf'`), `app/result.tsx` (the PDF footnote), `components/BoxSheet.tsx` ("From the PDF's text"), `components/StatusCard.tsx` (the "Couldn't find the form" text names all three forms)
- Test: `__tests__/home.test.tsx`, `__tests__/pdfFlow.test.tsx`, `__tests__/result.test.tsx`

**Interfaces:**
- **Consumes:** `readPdf` (Task 6), `File.pickFileAsync` (expo-file-system 58).
- **Produces `flow.fromPdf()`:**
  - It picks with `File.pickFileAsync({ mimeTypes: ['application/pdf'] })`. A cancelled pick does nothing.
  - A file with neither a `.pdf` name nor the `application/pdf` type toasts "Choose a PDF file." (as Your lists does for CSVs).
  - It reads with `readPdf(uri)` and saves a scan labelled "PDF: <file name>", with source `'pdf'`.
- **The toasts for the refusal codes:**

  | Code | Toast |
  |---|---|
  | `pdf_too_big` | "That PDF is over 20 MB. Choose a smaller file." |
  | `pdf_password` | "That PDF has a password. Save a copy without one, then import it." |
  | `pdf_broken` / `pdf_unreadable` | "Couldn't read that PDF." |
  | `pdf_page_too_big` | "That PDF's page is too big to read." |

- **On the scan screen:**
  - the footnote is "Read from the PDF: N boxes from its text, M read from the page." When `pageCount` > 1, it ends "Only page 1 of N was read.";
  - a picture PDF's footnote says "The PDF is a picture: read like a photo.";
  - a text-read box in the box sheet says "From the PDF's text", instead of "Read as … · N% sure".

- [ ] **Step 1: Write the failing tests:**
  - `home.test.tsx`: `the Import PDF button` opens the picker with the PDF type.
  - `pdfFlow.test.tsx`: `a PDF is read and opened`, `a cancelled pick does nothing`, `not a PDF`, and one test per refusal toast.
  - `result.test.tsx`: `a PDF's footnote and its page count`, `a picture PDF's footnote`, and `a text box says where it came from`.

- [ ] **Step 2: Run** `npx jest`. Expected: FAIL.

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run** `npx jest`, `npx tsc --noEmit` and `npm run lint`. Expected: PASS.

- [ ] **Step 5: Commit:**

```bash
git add app components lib __tests__
git commit -m "feat(app): Import PDF on Home, PDF results and text-read boxes on the scan screen"
```

---

### Task 9: The 2307 on the scan screen

**Files:**
- Create: `components/CertificateSections.tsx`, `lib/cert.ts` (`certOf(scan, lists, settings)`, memoised per scan as `saleOf` is)
- Modify: `app/result.tsx` (a 2307 shows its own sections and card), `components/RecentRow.tsx` (status from `certOf` for a 2307), `lib/sale.ts` (`saleOf` only for the two invoices)
- Test: `__tests__/certificate.test.tsx`, `__tests__/recentRow.test.tsx`

**Interfaces:**
- **Consumes:** `check2307`, `problems2307`, `rawFromScan` and `BoxSheet`.
- **Produces the sections:**
  - **PERIOD:** "Oct 1 – Dec 31, 2026 (Q4)", or the boxes as read with "Not one calendar quarter".
  - **PAYEE:** name, then "TIN … · ZIP …".
  - **PAYOR:** name, matched like a customer ("matched in your customers" or "Not in your customers"), then TIN and ZIP.
  - **INCOME PAYMENTS:** one row per filled Part III row: "<ATC> · <payment>", the total, and "Tax withheld <peso>", each with its flag sub-line.
  - **TOTALS:** the income payments' total and the tax withheld.
  - Every row opens `BoxSheet` with its boxes, as invoice rows do.
- **The card:** the problems, or "Ready to save".
- **RecentRow:** "N to check", "Ready to save" or "Saved as a 2307".

- [ ] **Step 1: Write the failing tests:**
  - `certificate.test.tsx`: `a 2307's sections` (from a Task 2 expected file as a scan), `fixing a month re-runs the checks`, and `the payor's match`.
  - `recentRow.test.tsx`: `a 2307's status`.

- [ ] **Step 2: Run** `npx jest`. Expected: FAIL.

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run** `npx jest`, `npx tsc --noEmit` and `npm run lint`. Expected: PASS.

- [ ] **Step 5: Commit:**

```bash
git add app components lib __tests__
git commit -m "feat(app): a BIR 2307 on the scan screen: period, payee, payor, income payments and checks"
```

---

### Task 10: Saving a 2307, and the 2307-CWT export

**Files:**
- Modify: `lib/scans.ts` (`Kind` gains `'2307'`, set for a 2307 scan), `lib/exportRows.ts` (`CWT_COLUMNS`, `certRows`, `saveBlock` for a 2307), `lib/saved.ts` (summaries of 2307s), `lib/exportFile.ts` (`exportFileName('2307')` → "MyBizMate 2307-CWT import <date>.xlsx"), `lib/settings.ts` (`offsetAccount`), `app/settings.tsx` ("Offset account for 2307s"), `components/SaveSheet.tsx` (the 2307's sheet), `components/ExportSheet.tsx` ("Export 2307s"), `app/saved.tsx`
- Test: `__tests__/exportRows.test.ts`, `__tests__/save.test.tsx`, `__tests__/exportFile.test.ts`, `__tests__/savedScreen.test.tsx`, `__tests__/settingsScreen.test.tsx`

**Interfaces:**
- **`CWT_COLUMNS`** is the template's header row word for word: `Date *`, `Customer *`, `Tax Base (Net)`, `CWT IT`, `IT Amt`, `CWT VT`, `VT Amt`, `Offset Account *`, `Cert No.`, `Branch` and `Particulars`.
- **`certRows(scan, cert, details): ExportRow[]`** gives one row per filled Part III row:
  - `Date *` is the period's last day (YYYY-MM-DD);
  - `Customer *` is the payor: the list party's code, else the name as written;
  - `Tax Base (Net)` is the row's total;
  - an EWT row fills `CWT IT` (the ATC) and `IT Amt` (the tax); a business-tax row fills `CWT VT` and `VT Amt`;
  - `Offset Account *` is `details.account`;
  - `Particulars` is "BIR 2307 for <Oct–Dec 2026>".
- **`saveBlock` for a 2307:**
  - `sample`;
  - `no_period`: "Add the period first: tap Period.";
  - `no_payor`: "Add the payor first: tap Payor." (no name and no list match);
  - `no_rows`: "No income payments were read.".
- **The save sheet** shows "Save 2307", the payor, the period, the rows' total tax and the offset account. The account is typed, remembered in Settings, and asked at the first save.
- **Saved invoices:**
  - a 2307 row reads "<payor> · 2307 · Q4 2026 · Tax <peso>";
  - "Export 2307s" sits beside "Export sales" and "Export purchases", with the same ranges, the same warning for rows exported before, and the same "Mark as exported" question;
  - its summary line reads "<n> 2307s · tax <peso>".

- [ ] **Step 1: Write the failing tests:**
  - `exportRows.test.ts`: `a 2307's rows`, with two EWT rows and one business-tax row giving three rows with the right columns, and `CWT_COLUMNS` matching the template's header row (read with `test-utils/unzip.ts`).
  - `save.test.tsx`: `saving a 2307` (the first save asks for the offset account) and its three blocks.
  - `exportFile.test.ts`: `the 2307 file`, with its name and its rows under the CWT headers.
  - `savedScreen.test.tsx`: `a 2307 in Saved invoices` and `Export 2307s`.
  - `settingsScreen.test.tsx`: `the offset account is kept as typed`.

- [ ] **Step 2: Run** `npx jest`. Expected: FAIL.

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run** `npx jest`, `npx tsc --noEmit` and `npm run lint`. Expected: PASS.

- [ ] **Step 5: Commit:**

```bash
git add app components lib __tests__
git commit -m "feat(app): save a BIR 2307 and export 2307s in MyBizMate's 2307-CWT import format"
```

---

### Task 11: On the emulator, MyBizMate's importer, and the README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Run every suite on the final tree:**
  - `npx jest`, `npx tsc --noEmit` and `npm run lint`;
  - `npm run test:core`;
  - `./gradlew :scanner:testDebugUnitTest`;
  - from `../prototype/benchmark`: `test_make_2307_template.py`, `test_synth_2307.py` and `test_export_core_fixtures.py`.

  All must PASS. If the emulator's adb shell doesn't answer, as on 2026-11-20 when another tool's adb clients piled up, cold-boot it first.

- [ ] **Step 2: Check on the emulator** (debug build). Push the fixture PDFs to `/sdcard/Download/` and index them as the README says for the lists. Never screenshot the picker.
  1. **Import PDF:**
     - `bir2307_text_0.pdf` reads every value from its text, and the card says "Ready to save";
     - `bir2307_picture_1.pdf` says "The PDF is a picture";
     - `two_pages.pdf` says page 1 of 2;
     - `password.pdf` and `broken.pdf` give their toasts.
  2. **The MyBizMate-printed 2307** (local file): pushed under a neutral name, then imported. Record which boxes came from text, and whether its values match what MyBizMate printed: period 10/01/2026–12/31/2026, payee "Dela Cruz, Juan", payor "Bizmate, Intelligence", WC158, and the amounts of certificate 2307I-000001. Delete the pushed copy afterwards.
  3. **The camera:**
     - `mybizmatescan://camera?test=file:///…/bir2307_photo_0.jpg` (pushed into the app's cache as the README shows for svc_0000) shows the outline labelled "BIR Form 2307" and reads it;
     - a Service Invoice still reads as a Service Invoice.
  4. **Saving and exporting:**
     - save the text 2307 and the photo 2307 (the first save asks for the offset account);
     - Export 2307s;
     - copy the file out with `adb exec-out run-as …` in Git Bash;
     - check it: zip tests clean, and row 1 matches the 2307-CWT template's.

- [ ] **Step 3: MyBizMate's 2307-CWT importer** (only with the user's go-ahead in chat). Import the exported file into "Sales Bizmate" (Sheets → CWT → Import). Check that every column is read, and the Tax Base, ATC and amounts it shows. Leave the imported test rows as drafts unless the user says otherwise.

- [ ] **Step 4: Update the README:**
  - PDF import (page 1, text versus picture, the limits) and the 2307 (its boxes, checks and export);
  - the pdfium version, its license and the fetch script;
  - the 2307 fixtures;
  - what was checked;
  - what's still open.

- [ ] **Step 5: Commit:**

```bash
git add README.md
git commit -m "docs: milestone 5: PDF import, BIR 2307, the 2307-CWT export, and what was checked"
```

After this task: a whole-branch review on the most capable model. Then the user decides when to merge into `master` and push.
