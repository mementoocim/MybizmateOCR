# MyBizMate Scan, milestone 2: the camera, both forms, the photo checks and the scan view — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The real MyBizMate Scan app, the one clients install (not a test app), gets everything the Android test app does except the checks. That means:
- the in-app scanner camera, with its live outline and automatic photo;
- both forms: the MyBizMate Sales Invoice and the office's Service Invoice;
- the photo checks;
- the scan view: Enhanced / B&W / Original, full screen, and save;
- recent scans, the splash and the brand look;
- the team's speed test.

**Architecture:** Three parts change.
- **The C++ core** gains three things: the Service Invoice (its table-border finder and box cutter, ported from `frame_template.py`), live frame detection, and the scan view's image modes.
- **A camera view inside the scanner Expo module**, built on CameraX. It feeds camera frames to the core, draws the outline and takes the photo itself. It sends TypeScript only status changes and the finished photo.
- **The screens** stay TypeScript and take on the test app's look.

New fixtures from the Python reference keep the core and the Python identical. They include synthetic Service Invoices.

**Tech Stack:** As in milestone 1: Expo SDK 58, React Native 0.88, C++17 with OpenCV 5.1.0 and ONNX Runtime 1.32.0, jest-expo, and doctest on the emulator. New: CameraX 1.7.0, react-native-svg 15.16.0 and expo-splash-screen ~58.0.14.

**Spec:** `docs/2026-11-19-expo-scanner-design.md`, milestone 2: "The camera, both forms, the photo checks and the scan view: everything the test app does". The design's Goals item 1 and its "Camera" section describe it. This plan builds on milestone 1's code; see `docs/superpowers/plans/2026-11-19-scanner-m1-core-reads-a-photo.md`.

### Changed from the design: the camera library

The design chose react-native-vision-camera, and listed it as open to change. This plan uses CameraX inside the scanner module's own view instead, for three reasons:
- **VisionCamera 5 needs Nitro modules.** VisionCamera 5 (5.2.4, the current version) runs frame code only in Nitro modules. The scanner would need a second native module of a different kind, with its own code generator, linking the C++ core a second time. It would also need four more packages: react-native-worklets, react-native-vision-camera-worklets, react-native-nitro-modules and react-native-nitro-image.
- **expo-camera has no frame access.** expo-camera 58 gives no access to frames.
- **The test app's camera ports directly.** Its camera (Camera2, `CameraActivity.java`) ports into one Kotlin view. The scanner module stays self-contained, so it can move into MyBizMate's app with nothing else to install.

**The cost:** milestone 9 needs an iOS camera view (AVFoundation) next to this one. The frame detection is C++ and is shared. The auto-capture rules are about 25 lines, with tests.

### Not in this milestone

- **Milestone 3: the checks and everything built on them.** That includes the sale, the Invoice / Items / Totals sections, "Ready to post", the check flags, and Save to Sales. In this milestone the result shows the photo checks, plus every box's crop and reading.
- **Milestone 3: editing after a scan, the lists, sale or purchase.**
- **Milestone 5: PDF import and the 2307.**
- **Never: the test app's "About this test" dialog.** It describes a test app.
- **From milestone 1's deferred list, only the recognizer's dictionary check waits (for milestone 7).** Everything else on that list is in this plan:
  - the HEIC decode (Task 6);
  - memory on 50 MP photos (Tasks 6 and 12);
  - scan-folder cleanup (Task 6);
  - scans off Expo's shared queue (Task 6);
  - the double-tap guard (Task 8);
  - TypeScript rounding of the photo measures (Task 8).

## Global Constraints

- **Location and git.**
  - Work on branch `m2-camera-both-forms`, made from `master` in `mybizmate-ocr/`.
  - In `prototype/`, only Tasks 1 and 2 change files: the Service Invoice generator, the exporter, and their tests.
  - Every task that changes `mybizmate-ocr/` ends with a commit. Nothing is pushed until the user asks.
- **Reference behaviour.** The Python in `prototype/benchmark/` is the arbiter. Where it has no version (the live camera, the screens, their copy and their look), the Android test app in `prototype/android_test/` is the reference. The tasks name the test app's files.
- **Parity.** Milestone 1's rules now hold for both forms:
  - readings and backup readings identical;
  - confidence within 0.002;
  - corners within 0.5 px;
  - turned, terms and blanks equal;
  - sharpness within 1%, light within 1.0.

  New in this milestone: the live outline within 1.0 px, with the same form. The tolerances for the scan view's images are in Task 5.
- **Porting rules** (from milestone 1):
  - compute in float32 where the Python does;
  - Python's `round` and `np.round` become `std::nearbyint`;
  - the first candidate wins a tie;
  - sorts are stable;
  - the recognizer reads in batches of 8.
- **Photo flags.** From postprocess.py:449-455 and photo_quality.py:51-55:
  - `blurry`: the sharpness, rounded to 4 decimals, is under the form's minimum;
  - `dark`: the light, rounded to 1 decimal, is under 50;
  - both comparisons are strict, and `blurry` comes first.
- **Thresholds** (from `photo_quality.py` and `PhotoQuality.java`):
  - Sales Invoice: scan 1.0, live 1.2;
  - Service Invoice: scan 0.5, live 0.7;
  - dark: under 50.
- **The actual app.** This is the app clients install, not a test app.
  - **Team-only tools** show only in team builds: the speed test's menu entry, and the result's stage timings. A team build is a development build, or a release built with `EXPO_PUBLIC_TEAM_BUILD=1` (`lib/build.ts`, Task 8).
  - **No logging of content.** Nothing the app reads is ever logged: no names, TINs, amounts or photos.
  - **Recent scans survive closing the app.** They are kept on the phone (Tasks 6 and 8).
- **Offline.** No network code anywhere.
- **Privacy.**
  - Fixtures, samples and assets are synthetic.
  - Nothing under `prototype/data/real_private/` is read by code, copied, committed or screenshotted.
  - The Service Invoice template holds coordinates only.
  - The emulator's gallery may hold a real receipt photo, so never screenshot the photo picker.
- **Android.** API 26 or newer, portrait only, package `com.mybizmate.scan`. The only new permission is CAMERA.
- **iOS-ready core.** Nothing under `modules/scanner/cpp/` uses JNI or Android headers.
- **Copy.** User-facing text is exactly what this plan quotes. Most of it is the test app's.
- **Look.** Colours come only from `lib/theme.ts` (Task 8), which uses the test app's `colors.xml` values.
- **New packages.**
  - CameraX 1.7.0 (camera-core, camera-camera2, camera-lifecycle, camera-view), added in the module's Gradle file.
  - react-native-svg, expo-splash-screen and expo-file-system, added with `npx expo install react-native-svg expo-splash-screen expo-file-system`.
  - No others.
- **This laptop.** Milestone 1's gotchas still hold:
  - the Windows path-limit plugin;
  - emulator storage;
  - `MSYS_NO_PATHCONV=1`;
  - start the emulator from outside the project folder.

## Review Focus

1. **Real camera frames arrive turned and padded.** On most phones they come rotated 90°, with rows wider than the image (row stride > width). The outline must still sit on the sheet. Tests: Task 5, `uprightGray turns and unpads a plane`; Task 12, on a real phone.
2. **Leaving the camera mid-photo** (the back button, switching apps) must not crash. The camera must be released, and a photo that arrives late must not be scanned. Tests: Task 7, `nothing more after a capture until reset`; Task 10, `a photo that arrives after leaving is not scanned`.
3. **Camera permission refused for good.** "Allow the camera" opens the app's settings. The phone's camera app needs the same permission, so the app says so. Tests: Task 10, the two permission tests.
4. **A 50 MP or HEIC photo from the gallery** is decoded at most 2400 px on its long side, without running out of memory. Tests: Task 6, `decodeTarget`; Task 12 measures peak memory on a real phone.
5. **Save tapped twice, or on Android 8 or 9.** Saving twice gives one file. Android 8 and 9 get "Saving needs Android 10 or newer.". Tests: Task 8, the two Save tests.

---

## File structure

```
mybizmate-ocr/
  app.json                       + splash, icons, CAMERA, portrait (Task 9)
  app/_layout.tsx                the stack under the brand splash (Task 9)
  app/index.tsx                  Home (Task 9)
  app/camera.tsx                 the scanner camera (Task 10)
  app/result.tsx                 the result and the scan view (Task 8)
  app/speed.tsx                  the speed test (Task 11)
  components/                    icons, ScanIllustration, Buttons, Sheet, StatusCard, ScanImage, BoxRow,
                                 ReadingOverlay, RecentRow, BrandSplash
  lib/                           theme, forms, format, photoChecks, toast, scans, scanFlow, samples, speedTest
  assets/brand/                  logo_mark.png, splash-logo.png
  assets/icon.png, android-icon-*.png   regenerated from the logo (Task 9)
  assets/samples/inv_*.json      what was written and what the laptop read (exporter)
  modules/scanner/
    assets/scanner/service_invoice.json             (exporter)
    index.ts · src/types.ts · src/parse.ts · src/ScannerModule.ts · src/ScannerCameraView.tsx
    android/build.gradle                            + CameraX 1.7.0
    android/src/main/java/expo/modules/scanner/     ScannerModule, NativeScanner, ScannerHolder, ImageSizing,
                                                    ScannerCameraView, ScanOverlayView, AutoCapture
    android/src/main/cpp/scanner_jni.cpp
    android/src/test/java/expo/modules/scanner/     ScannerHolderTest, ImageSizingTest, AutoCaptureTest
    cpp/core/                    + service_template, frame_aligner, box_cut, frame_input, enhance
    cpp/tests/                   + test_frame_aligner, test_box_cut, test_detect, test_enhance
  fixtures/core/                 + svc_* photos, inv_0051_dark2, frames/, enhance/, crops/svc_0000/ (exporter)
prototype/benchmark/synth_service_invoice.py, test_synth_service_invoice.py      (Task 1)
prototype/benchmark/export_core_fixtures.py, test_export_core_fixtures.py        (Task 2)
prototype/data/synth_service/svc_0000.jpg … svc_0005.jpg, each with a .json      (Task 1's output)
```

## The scan result, version 2

The JSON is milestone 1's (that plan's "The scan result"), with these changes:

| Key | In version 2 |
|---|---|
| `form` | Can also be `"service_invoice"`. |
| `darkMax` | 50 when aligned; null otherwise. |
| `pageFile` | The page at most 1200 px wide (JPEG q90). For the Sales Invoice it is the whole page; for the Service Invoice it is its `paper` rectangle [22,186,1130,1804]. |
| `originalFile` | `original.jpg` (JPEG q90): the photo after the 2400 px cap, at most 900 px wide. When aligned, its corners are joined by a 4 px coral line (BGR 76,124,252) and each is circled (radius 14, line 5 px). It is written whenever files are kept, aligned or not. |
| `scanDir` | The scan's folder; null when files aren't kept. |
| `reads` | For a Service Invoice, in the template's field order. `amount_words2` never appears: it is merged into `amount_words`. A read cut into 2 lines has one crop, its lines stacked. |

TypeScript gets `pageUri`, `originalUri`, `scanDir` and each `cropUri` as file:// URIs (parse.ts), as in milestone 1.

The fixtures' expected files add three keys:
- `darkMax`;
- `quality`: Python's rounded `{sharpness, sharp_min, light, dark_max}`, or null;
- `photoFlags`.

For Service photos they also add `score`.

---

### Task 1: Synthetic Service Invoices (Python)

**Files:**
- Create: `prototype/benchmark/synth_service_invoice.py`
- Create: `prototype/benchmark/test_synth_service_invoice.py`
- Writes: `prototype/data/synth_service/svc_0000.jpg … svc_0005.jpg`, each with a `.json`

**Interfaces:**
- **Consumes:**
  - `frame_template.load()` and `FrameAligner`;
  - `pipelines.Aligner` and `load_template`;
  - from `synth`: `make_invoice`, `write_hand`, `write_check`, `money`, `amount_in_words`, `photo_effects`;
  - `common.FONTS`.
- **Produces:**
  - `draw_blank(tmpl) -> np.ndarray`: the blank page, 1160 × 1860, BGR.
  - `make_service_invoice(rng, discount: bool, withholding: bool) -> dict`: `{"terms": "cash"|"account", "truth": {field: text}}`.
  - `render(inv, rng, font_path) -> np.ndarray`: the photo.
  - Each JSON: `{"font": "Caveat"|"PatrickHand", "terms", "truth"}`, the same shape as the samples' JSON (Task 2).

- [ ] **Step 1: Write the failing tests**

```python
def test_blank_draws_the_template_rules():
    page = draw_blank(load())
    assert page.shape == (1860, 1160, 3)
    assert page[844, 600].max() < 100        # the table border's top rule (y 843.5)
    assert page[856, 600].min() > 200        # 12 px below it: paper

def test_truth_has_the_written_boxes():
    t = make_service_invoice(np.random.default_rng(1), discount=True, withholding=True)["truth"]
    assert {"date", "customer_name", "customer_tin", "customer_address", "amount_words", "amount_figure",
            "item1_description", "item1_qty", "item1_unit_price", "item1_amount", "total_sales", "less_vat",
            "net_of_vat", "add_vat", "vatable_sales", "vat", "discount", "withholding", "total_due",
            "total_due_2", "invoice_no"} <= set(t)
    assert len(t["invoice_no"]) == 7 and t["invoice_no"].isdigit()
    assert len(t["amount_words"]) <= 38 and "zero_rated" not in t

PHOTOS = sorted((DATA / "synth_service").glob("svc_*.jpg"))

def test_six_photos():
    assert [p.stem for p in PHOTOS] == [f"svc_{i:04d}" for i in range(6)]

@pytest.mark.parametrize("path", PHOTOS, ids=lambda p: p.stem)
def test_a_service_invoice_not_a_sales_invoice(path):
    gray = cv2.cvtColor(cv2.imread(str(path)), cv2.COLOR_BGR2GRAY)
    found = FrameAligner(load()).find(gray)
    assert found is not None and found[1] >= 0.75
    assert Aligner(load_template()).markers(gray) is None

def test_the_printed_number_reads():
    # FrameReader with the reference recognizer (export_core_fixtures.Reference().rec, pipelines.CHARSETS)
    assert sum(read_invoice_no(p) == truth(p)["invoice_no"] for p in PHOTOS) >= 5
```

- [ ] **Step 2: Run the tests and check that they fail**

  Run: `.venv\Scripts\python -m pytest prototype\benchmark\test_synth_service_invoice.py -q`. Expected: FAIL, because the module doesn't exist.

- [ ] **Step 3: Implement `draw_blank`**

  Start from a white page, then draw:
  - **The grid rules**: every `grid.h` entry [y, x0, x1] and `grid.v` entry [x, y0, y1], as 3 px lines in (40,40,40), end to end.
  - **Header underlines**: a 2 px line 6 px above the bottom of every header field (a field whose box top is above the frame's top, 843.5), except the checkboxes.
  - **The two checkbox squares.**
  - **Printed labels** in cv2 Hershey simplex 0.55. None may be inside any field's box or grab area:
    - "SERVICE INVOICE" and a made-up seller, "SAMPLE SERVICES CO.";
    - "Cash Sales" and "Charge Sales", right of their checkboxes;
    - "Date", "Registered Name", "TIN", "Business Address" and "the sum of", left of their fields;
    - the 4 table headings, in the band above row 1 (y 843.5–903);
    - each total's label, left of its box.

- [ ] **Step 4: Implement `make_service_invoice`**

  Start from `synth.make_invoice(rng)` and take or compute these values:
  - **From that invoice:**
    - the date as written (`date_text`);
    - the customer's name and TIN as written;
    - the address, split into 2 lines at the comma nearest the middle;
    - up to 5 of its items, without units.
  - **The number:** `invoice_no` is 7 random digits.
  - **Amounts** are written the way `synth.money` writes them:
    - `total_sales` is the sum of the amounts;
    - `less_vat` is `total_sales × 12/112`, to 2 decimals;
    - `net_of_vat` is `total_sales − less_vat`; `vatable_sales` equals `net_of_vat`;
    - `vat` and `add_vat` equal `less_vat`;
    - `discount` is 5% of `total_sales` and `withholding` is 1% of `net_of_vat`, each only when asked;
    - `total_due` and `total_due_2` are `total_sales − discount − withholding`;
    - `amount_figure` is `money(total_due)`.
  - **Amount in words:** `amount_in_words(total_due)`, cut at the last space before 38 characters, with the rest in `amount_words2`.
  - **Left out:** `zero_rated` and `vat_exempt`.

- [ ] **Step 5: Implement `render` and `main`**

  `render`:
  1. Write every truth value with `write_hand` in its field's box. `customer_address` puts line 1 in the box's top half and line 2 in the bottom half.
  2. Tick the terms box with `write_check`.
  3. Print `invoice_no` in its box: `cv2.FONT_HERSHEY_DUPLEX`, scale 1.4, thickness 2, colour (30,30,160).
  4. Cut the sheet to `paper` and pass it to `photo_effects`.

  `main`:
  - writes 6 invoices from `np.random.default_rng(2026)` as JPEG q95;
  - uses Caveat for the even-numbered invoices and PatrickHand for the odd ones;
  - puts a discount on invoices 2 and 4, and withholding on 4 and 5.

- [ ] **Step 6: Generate the photos and run the tests**

  Run `.venv\Scripts\python prototype\benchmark\synth_service_invoice.py`, then the tests. Expected: PASS.

  If a photo isn't found, fix the drawing, never the finder. The usual cause is a label or underline running past the border's corners.

  `prototype/` is not a git repository, so there is nothing to commit here. Task 2 commits the fixtures made from these photos.

---

### Task 2: Fixtures for milestone 2 (Python exporter)

**Files:**
- Modify: `prototype/benchmark/export_core_fixtures.py`, `prototype/benchmark/test_export_core_fixtures.py`
- Modify (one line, removed in Task 4): `modules/scanner/cpp/tests/test_scanner.cpp`
- Writes into `mybizmate-ocr/`:
  - `modules/scanner/assets/scanner/service_invoice.json`;
  - `assets/samples/inv_*.json`;
  - `fixtures/core/photos/` (+10 photos) and `fixtures/core/expected/` (version 2);
  - `fixtures/core/frames/`, `fixtures/core/enhance/`, `fixtures/core/crops/svc_0000/`.

**Interfaces:**
- **Consumes:** Task 1's photos; `frame_template.FrameReader`, `FrameAligner` and `load`; `enhance.enhanced` and `enhance.black_white`; `photo_quality.quality`; `robust_service_invoice.variants`.
- **Produces:** these fixture formats, which later tasks rely on:
  - **Expected scans:** `expected/<stem>.json`, version 2 (above).
  - **Live frames:** `frames/<stem>.png`, 960 × 1280 grey. `frames/expected.json` is `{stem: {"form", "outline": [[x,y] × 4] (tl,tr,br,bl), "sharpness", "sharpMin"} | null}`.
  - **Scan view images:**
    - inputs `enhance/inv_0051_page.png` and `enhance/svc_0000_paper.png`;
    - outputs `<input>_enhanced.png` and `<input>_bw.png`.
  - **Service crops:** `crops/svc_0000/<field>_<k>.png`, where k is the line (0 or 1). `crops/svc_0000/expected.json` is `{field: [[w,h], …]}`, for every field with parts.
  - **Sample truths:** `assets/samples/<id>.json` is `{"font", "truth", "laptop"}`.

- [ ] **Step 1: Make the branch, then write the failing tests** in `test_export_core_fixtures.py`

  In `mybizmate-ocr/`, run `git switch -c m2-camera-both-forms master` first. Every change from here on lands on that branch.

  Keep all 11 existing checks, and add these:

```python
SERVICE_FIELD_ORDER = [f["name"] for f in frame_template.load()["fields"]]

def test_service_template_is_copied():
    assert (ASSETS / "service_invoice.json").read_bytes() == (PROTO / "data/template/service_invoice.json").read_bytes()

def test_sample_truths():
    for sid in SAMPLES:
        s = json.loads((APP / "assets/samples" / f"{sid}.json").read_text("utf-8"))
        assert s["font"] in ("Caveat", "PatrickHand") and s["truth"]
        assert s["laptop"] == {r["name"]: r["text"] for r in expected(sid)["reads"]}

SERVICE = ["svc_0000", "svc_0001", "svc_0002", "svc_0003", "svc_0000_cw", "svc_0000_turned", "svc_0000_tilt",
           "svc_0000_small", "svc_0000_blur"]

@pytest.mark.parametrize("stem", SERVICE)
def test_service_photos_are_read(stem):
    e = expected(stem)
    assert e["aligned"] and e["form"] == "service_invoice" and e["turned"] is False
    assert e["score"] >= 0.75 and e["sharpMin"] == 0.5 and e["darkMax"] == 50
    names = [r["name"] for r in e["reads"]]
    assert "amount_words2" not in names and names == [n for n in SERVICE_FIELD_ORDER if n in names]

def test_turned_service_photos_read_like_the_original():
    number = lambda stem: next(r["text"] for r in expected(stem)["reads"] if r["name"] == "invoice_no")
    assert number("svc_0000_cw") == number("svc_0000_turned") == number("svc_0000")

@pytest.mark.parametrize("stem", ["svc_0000_top", "blank_page"])
def test_no_form(stem):
    e = expected(stem)
    assert not e["aligned"] and e["form"] is None and e["photoFlags"] == [] and e["quality"] is None

def test_photo_flags():
    assert expected("inv_0051_dark2")["photoFlags"] == ["dark"]
    assert expected("inv_0051_dark")["photoFlags"] == []        # light 51.0: just light enough
    assert expected("inv_0051_blur")["photoFlags"] == ["blurry"]
    assert expected("inv_0051_shake")["photoFlags"] == ["blurry"]
    assert expected("svc_0000_blur")["photoFlags"] == ["blurry"]
    assert expected("inv_0007")["photoFlags"] == []

def test_frames():
    f = json.loads((FIX / "frames/expected.json").read_text())
    assert f["inv_0007"]["form"] == "sales_invoice" and f["inv_0007"]["sharpMin"] == 1.2
    assert f["svc_0000"]["form"] == f["svc_0000_cw"]["form"] == "service_invoice"
    assert f["svc_0000"]["sharpMin"] == 0.7 and f["blank_page"] is None
    for stem in f:
        assert cv2.imread(str(FIX / "frames" / f"{stem}.png"), cv2.IMREAD_UNCHANGED).shape == (1280, 960)

def test_enhance_outputs():
    for name in ("inv_0051_page", "svc_0000_paper"):
        src = cv2.imread(str(FIX / "enhance" / f"{name}.png"))
        assert cv2.imread(str(FIX / "enhance" / f"{name}_enhanced.png")).shape == src.shape
        bw = cv2.imread(str(FIX / "enhance" / f"{name}_bw.png"), cv2.IMREAD_GRAYSCALE)
        assert bw.shape == src.shape[:2] and set(np.unique(bw)) <= {0, 255}

def test_service_crops():
    e = json.loads((FIX / "crops/svc_0000/expected.json").read_text())
    assert 1 <= len(e["customer_address"]) <= 2
    for field, sizes in e.items():
        for k, (w, h) in enumerate(sizes):
            assert cv2.imread(str(FIX / f"crops/svc_0000/{field}_{k}.png"), cv2.IMREAD_UNCHANGED).shape[:2] == (h, w)
```

- [ ] **Step 2: Run the tests and check that they fail**

  Run: `.venv\Scripts\python -m pytest prototype\benchmark\test_export_core_fixtures.py -q`. Expected: the new tests FAIL.

- [ ] **Step 3: Extend the assets, the sample truths and `Reference.scan`** in `export_core_fixtures.py`

  **Assets.** `write_assets` copies `prototype/data/template/service_invoice.json` byte for byte.

  **Sample truths.** `assets/samples/<id>.json` takes `font` and `truth` from `prototype/android_test/app/src/main/assets/samples/<id>.json`, plus `laptop` from this exporter's own scan of the sample.

  **`Reference.scan`.** Its `__init__` gains `self.service = FrameReader(self.rec, frame_template.load(), CHARSETS)`. When the corner squares aren't found, the scan tries `self.service.straighten(img)`. When that finds the form, the result is:
  - **Fixed values:** form `service_invoice`, turned `False`, sharpMin 0.5.
  - **From the finder:** `corners` and `score`, from the straighten info.
  - **Measures:** sharpness and light from the page's grey, unrounded.
  - **Terms:** from `read_page`.
  - **Blanks:** the non-checkbox fields with no parts, `amount_words2` included.
  - **Reads:** in the template's field order, from `read_page`'s raw result. `amount_words` keeps its field's place.
  - **Each read's `cropSize`:** [the widest part's width, the sum of its parts' heights]. For `amount_words`, the parts are its own parts followed by `amount_words2`'s.

  **Both forms** gain `darkMax` 50, `quality` (`quality(page, form)`) and `photoFlags`, following the Global Constraints' rule. When nothing is aligned: `darkMax` and `quality` are null, and `photoFlags` is [].

- [ ] **Step 4: Add the new photos, frames, scan view images and crops** in `export_core_fixtures.py`

  **`write_photos`** adds these, all JPEG q95:
  - **`inv_0051_dark2`:** `convertScaleAbs(alpha=0.18)`, with light 46. It is still aligned; at 0.15 the corner squares are lost.
  - **svc_0000 to svc_0003:** copied from `data/synth_service`.
  - **Variants of svc_0000:**
    - `_cw`: ROTATE_90_CLOCKWISE;
    - `_turned`: ROTATE_180;
    - `_tilt`: `robust_service_invoice.variants()`' tilted 0.8;
    - `_small`: half size, INTER_AREA;
    - `_blur`: GaussianBlur with σ the smallest integer from 3 up that gets it flagged `blurry`;
    - `_top`: rows 0 to h/2 only.

  **`write_frames`** builds a frame from a photo: cap it, convert it to grey, resize it with INTER_AREA to fit inside 960 × 1280 keeping its shape, and centre it on a 960 × 1280 canvas of grey 128.
  - It does this for inv_0007, inv_0051_blur, svc_0000, svc_0000_cw and blank_page.
  - Each frame's expected value comes from `reference_detect(frame)`, which mirrors OcrEngine.java:344-373:
    - **Sales Invoice:** try the corner squares first. The outline is the page corners (0,0),(1700,0),(1700,2200),(0,2200) mapped through inv(H). The sharpness is measured on the frame warped onto the 1700 × 2200 page (INTER_LINEAR, border 255), and sharpMin is 1.2.
    - **Service Invoice:** otherwise, try the Service Invoice aligner without its corner refit (a `FrameAligner` subclass whose `_refine` returns `np.float32(q)`). The outline is the paper corners (22,186),(1130,186),(1130,1804),(22,1804) through inv(H). The sharpness is measured on the frame warped onto 1160 × 1860 with border 255, and sharpMin is 0.7.
    - **Neither:** None.

  **`write_enhance`** writes the two inputs:
  - `inv_0051_page.png`: `Reference.page(inv_0051)` resized to 1200 wide (INTER_AREA, with Python's `round` for the height);
  - `svc_0000_paper.png`: svc_0000's page cut to `paper`.

  Then `enhanced()` and `black_white()` write the outputs.

  **`write_service_crops`** writes svc_0000's crops from `read_page`.

- [ ] **Step 5: Keep milestone 1's parity test green until Task 4**

  In `test_scanner.cpp`'s "parity on every fixture photo" loop, skip expected files whose `form` is `service_invoice`. This is one line, marked `// until Task 4`.

- [ ] **Step 6: Run the exporter, then all the checks**

  1. Run `.venv\Scripts\python prototype\benchmark\export_core_fixtures.py`.
  2. Run the tests above: PASS, the old ones included.
  3. Run `npm run test:core` in `mybizmate-ocr`: PASS. Milestone 1's 20 cases still pass on the new expected files; their extra keys are ignored.

- [ ] **Step 7: Commit**

```bash
git add modules/scanner/assets/scanner/service_invoice.json assets/samples fixtures/core modules/scanner/cpp/tests/test_scanner.cpp
git commit -m "test(fixtures): Service Invoices, photo flags, live frames and scan view images from the Python"
```

---

### Task 3: The Service Invoice finder (C++)

**Files:**
- Create: `modules/scanner/cpp/core/service_template.h/.cpp`, `modules/scanner/cpp/core/frame_aligner.h/.cpp`
- Create: `modules/scanner/cpp/tests/test_frame_aligner.cpp` (add it to `cpp/tests/CMakeLists.txt`)

**Interfaces:**
- **Consumes:** `assets/scanner/service_invoice.json`, and the fixtures from Task 2.
- **Produces:**

```cpp
namespace mbm {
struct ServiceField {
  std::string name, type;
  cv::Rect box;                    // bbox [x0,y0,x1,y1]
  std::optional<cv::Rect> grab;    // the JSON's "grab", when present
  bool multiline = false;          // the JSON's "multiline"
};
struct ServiceTemplate {
  std::string name, title;         // "service_invoice", "Service Invoice"
  cv::Size page;                   // 1160 x 1860
  std::array<cv::Point2f, 4> frame;          // tl, tr, br, bl
  std::vector<cv::Vec3f> gridH, gridV;       // [y, x0, x1] and [x, y0, y1]
  cv::Vec2i slackHeader, slackTable;
  cv::Rect paper;                  // [22,186,1130,1804]
  std::vector<ServiceField> fields;          // in file order
  static ServiceTemplate parse(const std::string& json);
};
struct FrameFound {
  cv::Matx33d H;                   // photo -> page
  double score;
  std::array<cv::Point2f, 4> corners;        // the table border in the photo: tl, tr, br, bl of the form
};
class FrameAligner {
 public:
  explicit FrameAligner(const ServiceTemplate& t);
  std::optional<FrameFound> find(const cv::Mat& gray, bool refit = true) const;
};
}
```

- [ ] **Step 1: Write the failing tests** in `test_frame_aligner.cpp`

```cpp
TEST_CASE("the Service Invoice template parses") {
  auto t = ServiceTemplate::parse(readText(assetsDir() + "/service_invoice.json"));
  CHECK(t.fields.size() == 42);
  CHECK(t.page == cv::Size(1160, 1860));
  CHECK(t.frame[0] == cv::Point2f(69.5f, 843.5f));
  CHECK(t.paper == cv::Rect(22, 186, 1108, 1618));
  CHECK(field(t, "customer_address").multiline);
  CHECK(field(t, "item1_description").grab->x == 40);
}
TEST_CASE("finds every Service Invoice fixture like the Python") {
  // every expected/*.json with form service_invoice: decodePhoto, grey, find(gray, true)
  // corners within 0.5 px of "corners"; score within 0.005 of "score"
}
TEST_CASE("finds no Service Invoice in a Sales Invoice, a blank page or half a form") {
  for (auto stem : {"inv_0007", "blank_page", "svc_0000_top"}) CHECK_FALSE(aligner.find(grayOf(stem)));
}
```

- [ ] **Step 2: Run them and check that they fail**

  Run: `npm run test:core`. Expected: the build fails, because the headers don't exist.

- [ ] **Step 3: Implement `ServiceTemplate::parse`**

  Parse the JSON keys as they are: `name`, `title`, `page`, `frame`, `grid.h`/`grid.v`, `slack.header`/`slack.table`, `paper` and `fields`. Convert `paper` from [x0,y0,x1,y1] to a `cv::Rect`.

- [ ] **Step 4: Implement `FrameAligner::find` and its helpers**

  Port `frame_template.py:25-308` exactly. That covers:
  - `_binarize`, `_merge`, `_profile`, `_share`, `_inked`, `_ends`, `_intersect` and `_convex`;
  - the constructor's `on`/`beside` points;
  - `find` (the 1400 px work copy, HoughLinesP, the candidates in 4 rotations, the quick then full `_score`, the 8 finalists, the minimum 0.75);
  - `_refine` (only when `refit` is true; otherwise the corners are `q / s`).

  The milestone 1 parity rules apply in particular:
  - `on`, `beside`, `dst` and `q` are float32;
  - `_hits` rounds with `std::nearbyint`;
  - the quick sort is stable, descending;
  - `max` takes the first of equals.

- [ ] **Step 5: Run the tests and check that they pass**

  Run: `npm run test:core`. Expected: PASS, milestone 1's cases included.

- [ ] **Step 6: Commit**

```bash
git add modules/scanner/cpp
git commit -m "feat(core): find the Service Invoice by its table border, like the Python"
```

---

### Task 4: Reading the Service Invoice, and the original view (C++)

**Files:**
- Create: `modules/scanner/cpp/core/box_cut.h/.cpp`, `modules/scanner/cpp/tests/test_box_cut.cpp`
- Modify: `cpp/core/scanner.h/.cpp`, `cpp/core/photo_quality.h`, `cpp/core/result_json.cpp`, `cpp/tests/test_scanner.cpp`, `cpp/tests/test_photo_quality.cpp`
- Modify (to keep the app running): `android/src/main/cpp/scanner_jni.cpp` (`create`), `NativeScanner.kt` and `ScannerModule.kt` (pass `service_invoice.json`)

**Interfaces:**
- **Consumes:** Task 3's `ServiceTemplate` and `FrameAligner`.
- **Produces:**
  - `std::vector<cv::Mat> cropBox(const cv::Mat& page, const ServiceField& f, cv::Vec2i slack)`: 0, 1 or 2 parts.
  - `Assets::serviceJson` (std::string).
  - `ScanResult` gains `double darkMax`, `std::string originalFile` and `std::string scanDir`.
  - `quality::SERVICE_SHARP_MIN = 0.5`, `quality::SERVICE_LIVE_MIN = 0.7`.
  - `NativeScanner.create(model, dict, fieldMap, formPng, serviceJson, threads)`.

- [ ] **Step 1: Write the failing tests**

  - **`test_box_cut.cpp`, "cuts svc_0000's boxes like the Python".** Straighten svc_0000 with `FrameAligner`. Warp it to 1160 × 1860 with INTER_LINEAR and a white border. For every field in `crops/svc_0000/expected.json`, `cropBox` returns the same number of parts, each equal to its PNG pixel for pixel. Every other non-checkbox field returns no parts.
  - **`test_scanner.cpp`:**
    - Remove Task 2's skip line, so the parity loop covers the Service photos. Compare their reads by name: text and backups identical, confidence within 0.002, `cropSize` equal.
    - "a Service Invoice's page is its paper": svc_0000's `pageFile` decodes to 1108 × 1618.
    - "the original view is written, at most 900 px wide": for inv_0007 (aligned) and blank_page (not aligned), `originalFile` exists and its width ≤ 900.
    - "json version 2": `darkMax`, `originalFile` and `scanDir` are present; `darkMax` is 50 when aligned and null when not.
  - **`test_photo_quality.cpp`, "the Service Invoice's thresholds":** SERVICE_SHARP_MIN == 0.5 and SERVICE_LIVE_MIN == 0.7.

- [ ] **Step 2: Run them and check that they fail**

  Run: `npm run test:core`. Expected: FAIL.

- [ ] **Step 3: Implement `cropBox`**

  Port `frame_template.py:312-417` exactly: `_rules`, `_reach`, `crop_box` and `_line_bands`. In detail:
  - a stroke belongs to a box when its centre is in `grab` (by default the box ±4 px in x and ±2 px in y);
  - the header slack applies when the box's top is above 843.5;
  - printed rules are erased, and strokes crossing a rule are joined back (BRIDGE 12);
  - other boxes' strokes are blanked to the paper's grey;
  - the padding is 6 px;
  - a `multiline` box is split into 1 or 2 lines.

- [ ] **Step 4: Read the Service Invoice in `Scanner::scanImage`**

  When the corner squares aren't found, the scan falls through to `FrameAligner::find(gray, true)`, as OcrEngine.java:249-258 does. When it finds the form:
  - **Page:** warp to 1160 × 1860 with INTER_LINEAR and a white border.
  - **Measures:** sharpness and light from the whole page's grey; sharpMin is `SERVICE_SHARP_MIN`.
  - **Fixed values:** turned is false; corners are the found corners.
  - **Terms:** `inkRatio` with inset 3, under the milestone 1 rule.
  - **Crops:** `cropBox` for every non-checkbox field, with the header slack when `box.y < 843.5`, else the table slack.
  - **Blanks:** non-checkbox fields with no parts.
  - **Reading:** each type's parts are read together, in field order, the same way the Sales Invoice is read. Port `read_page` (frame_template.py:444-483) exactly:
    - **Dates:** read again with the digits charset `0123456789/-., ` and 3 backups. Collect `extra`, the second reading and its backups that differ from the first reading. The read's backups become `extra`, followed by the first reading's backups that aren't already in `extra`.
    - **A 2-line box:** the texts are joined with a space and trimmed. The confidence is the lower one, and there are no backups.
    - **The amount in words:** `amount_words` and `amount_words2` merge into `amount_words`: the present ones' texts joined with `" "`, the lowest confidence, no backups. They are dropped when the joined text is empty.
  - **A read's crop:** the parts stacked top to bottom, left-aligned, padded on the right with white to the widest part.
  - **Page file:** the paper rectangle, at most 1200 px wide.

- [ ] **Step 5: Write the version 2 outputs for both forms**

  - **Original view.** When files are kept, write `original.jpg` as described in "The scan result, version 2" (aligned or not), and set `scanDir`.
  - **`darkMax`.** Set it to `quality::DARK_MAX` when aligned.
  - **JSON.** `result_json` writes `darkMax` (null when not aligned), `originalFile` and `scanDir` (null when empty).

- [ ] **Step 6: Pass the Service Invoice template from Android**

  `scanner_jni.cpp`'s `create` takes `serviceJson`. `ScannerModule`'s create lambda reads `scanner/service_invoice.json` and passes it.

- [ ] **Step 7: Run the tests and check that they pass**

  Run `npm run test:core`. Expected: PASS.

  Then run `npx expo run:android`. Sample 0007 still reads `0007655`.

- [ ] **Step 8: Commit**

```bash
git add modules/scanner
git commit -m "feat(core): read the Service Invoice like the Python; write the original view"
```

---

### Task 5: Live detection and the scan view's images (C++)

**Files:**
- Create: `modules/scanner/cpp/core/frame_input.h/.cpp`, `modules/scanner/cpp/core/enhance.h/.cpp`
- Create: `modules/scanner/cpp/tests/test_detect.cpp`, `modules/scanner/cpp/tests/test_enhance.cpp`
- Modify: `cpp/core/scanner.h/.cpp`

**Interfaces:**
- **Consumes:** Tasks 3 and 4.
- **Produces:**

```cpp
namespace mbm {
struct FrameDetection {
  std::string form;                           // "sales_invoice" | "service_invoice"
  std::array<cv::Point2f, 4> outline;         // the whole sheet in the frame: tl, tr, br, bl
  double sharpness = 0, sharpMin = 0;         // sharpMin: the form's live minimum
};
// Scanner:
std::optional<FrameDetection> detectFrame(const cv::Mat& gray) const;  // never takes the scan lock
// frame_input.h: a camera's Y plane, unpadded and turned upright (rotationDegrees clockwise: 0/90/180/270)
cv::Mat uprightGray(const uint8_t* y, int width, int height, int rowStride, int rotationDegrees);
// enhance.h (input: the page, BGR)
cv::Mat enhanced(const cv::Mat& bgr);   // BGR
cv::Mat blackWhite(const cv::Mat& bgr); // 8-bit, 0 or 255
}
```

- [ ] **Step 1: Write the failing tests**

  - **`test_detect.cpp`:**
    - "live detection matches the Python on every frame". For each frame in `frames/expected.json`: null when expected; otherwise the same form, each outline point within 1.0 px, sharpness within 1%, and sharpMin equal.
    - "uprightGray turns and unpads a plane". A 4 × 3 plane holding values 0–11, with rowStride 8 and padding bytes of 255: rotation 0 gives the plane itself; 90 gives a 3 × 4 image whose first row is `8 4 0`; 180 gives a first row of `11 10 9 8`; 270 gives `3 7 11`.
  - **`test_enhance.cpp`:**
    - "Enhanced matches the Python": on both inputs, the mean absolute difference per channel ≤ 0.5, and ≥ 99.5% of pixels within 2 levels on every channel.
    - "B&W matches the Python": ≥ 99.5% of pixels equal.

- [ ] **Step 2: Run them and check that they fail**

  Run: `npm run test:core`. Expected: FAIL.

- [ ] **Step 3: Implement `detectFrame` and `uprightGray`**

  **`detectFrame`** mirrors `reference_detect` (Task 2) and OcrEngine.java:344-373:
  - **Sales Invoice:** the corner squares first. Outline the whole page; measure the frame's sharpness on its warp to the page (border 255); sharpMin is `SALES_LIVE_MIN`.
  - **Service Invoice:** otherwise `find(gray, false)`. Outline the paper; measure on the warp to 1160 × 1860 (border 255); sharpMin is `SERVICE_LIVE_MIN`.
  - **Neither:** nullopt.

  It reads only the fixed templates. It never locks the scan mutex.

  **`uprightGray`** copies `height` rows of `width` bytes, then calls `cv::rotate` for 90 / 180 / 270.

- [ ] **Step 4: Implement `enhanced` and `blackWhite`**

  Port `prototype/benchmark/enhance.py` exactly.

  **`enhanced()`:**
  1. Estimate the paper's light: shrink to a quarter (INTER_AREA), MORPH_CLOSE with an ellipse of size max(15, (min/12)|1), GaussianBlur σ k/2, then resize back with INTER_LINEAR.
  2. Divide the page by that light and multiply by 255.
  3. Map (x − 20)·255/218, clipped.
  4. Apply a gamma LUT of 1.25.
  5. Sharpen with an unsharp mask (1.6 / −0.6, σ 1.2).
  6. Multiply the HSV saturation by 1.25.

  **`black_white()`:**
  1. Adaptive threshold (GAUSSIAN_C, block 25, C 12) on the enhanced grey.
  2. Force pixels under 110 to black.
  3. Remove black specks of 6 px or less.

- [ ] **Step 5: Run the tests and check that they pass**

  Run: `npm run test:core`. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add modules/scanner/cpp
git commit -m "feat(core): live frame detection and the Enhanced and B&W views"
```

---

### Task 6: The module's new functions (Kotlin, JNI, TypeScript)

**Files:**
- Modify: `modules/scanner/android/src/main/cpp/scanner_jni.cpp`, `NativeScanner.kt`, `ScannerModule.kt`, `ScannerHolder.kt`
- Create: `modules/scanner/android/src/main/java/expo/modules/scanner/ImageSizing.kt`
- Create: `modules/scanner/android/src/test/java/expo/modules/scanner/ImageSizingTest.kt`
- Modify: `modules/scanner/src/types.ts`, `src/parse.ts`, `src/ScannerModule.ts`, `index.ts`, `__tests__/scanResult.test.ts`

**Interfaces:**
- **Consumes:** Tasks 4 and 5.
- **Produces** (JNI and Kotlin):

```kotlin
// NativeScanner
external fun scanPhoto(handle: Long, path: String, outDir: String): String          // outDir "" = no files
external fun detectFrame(handle: Long, y: ByteBuffer, width: Int, height: Int, rowStride: Int,
                         rotation: Int): FloatArray?   // [form 0 sales / 1 service, x0,y0 … x3,y3, sharpness, sharpMin]
external fun enhance(pagePath: String, mode: Int, outPath: String)                  // 0 Enhanced (JPEG q92), 1 B&W (PNG)
// ImageSizing.kt
fun decodeTarget(width: Int, height: Int, maxSide: Int = 2400): Pair<Int, Int>     // long side <= maxSide, Math.rint
fun isInside(file: File, dir: File): Boolean                                        // canonical paths
// ScannerModule (for Task 7)
internal fun detectFrame(y: ByteBuffer, width: Int, height: Int, rowStride: Int, rotation: Int): FloatArray?
```

- **Produces** (TypeScript, from `modules/scanner`):

```ts
export type FormName = 'sales_invoice' | 'service_invoice';
export type ScanResult = { /* milestone 1's fields */ form: FormName | null; darkMax: number | null;
  originalUri: string | null; scanDir: string | null; /* … */ };
export function scanPhoto(uri: string, options?: { keepFiles?: boolean; deletePhoto?: boolean }): Promise<ScanResult>;
export function enhance(pageUri: string, mode: 'enhanced' | 'bw'): Promise<string>;   // the image's file:// URI
export function saveToPictures(fileUri: string): Promise<string>;                     // the saved file's name
export function stats(): Promise<{ loadMs: number | null; peakKb: number }>;
```

- [ ] **Step 1: Write the failing tests**

  **`ImageSizingTest.kt`:**
  - `decodeTarget(4032, 3024) == 2400 to 1800`;
  - `decodeTarget(6120, 8160) == 1800 to 2400`;
  - `decodeTarget(3809, 4800) == 1904 to 2400`;
  - `decodeTarget(1000, 800) == 1000 to 800`;
  - `isInside` is true for `cache/scans/x.jpg` in `cache`, false for `/sdcard/DCIM/x.jpg`, and false for `cache/../files/x`.

  **`scanResult.test.ts`:**
  - parsing a Service fixture with files gives `form` 'service_invoice', `originalUri` and `scanDir` starting with `file://`, and `darkMax` 50;
  - parsing a result without files gives null URIs.

- [ ] **Step 2: Run them and check that they fail**

  Run the Kotlin tests: from `android/`, with `JAVA_HOME` set to Android Studio's jbr, run `./gradlew :scanner:testDebugUnitTest --console=plain`. Then run `npx jest`. Expected: FAIL.

- [ ] **Step 3: Implement the JNI and `ScannerModule` changes**

  - **Scans off Expo's shared queue.** `scanPhoto` runs as `AsyncFunction("scanPhoto") Coroutine { … }` on one dedicated single-thread dispatcher.
  - **Photos OpenCV can't open** (HEIC, for one). On API 28+, decode with `ImageDecoder` at `decodeTarget`'s size; it applies the orientation. On API 26–27, keep milestone 1's `BitmapFactory`.
  - **Where scans live.** Scan folders move from the cache to the app's files folder, `filesDir/scans/<ms>`, so the system never clears them. The newest 6 are kept, matching Recent scans; milestone 1's `keepNewest(10)` becomes 6.
  - **Cleanup.** After every scan, delete the scan folder's `input` and `photo.png` copies. With `deletePhoto`, also delete the photo itself, but only a `file://` that `isInside` the app's cache.
  - **`keepFiles: false`** passes an empty outDir, so no folder is made.
  - **`enhance(pageUri, mode)`** writes `enhanced.jpg` or `bw.png` next to the page, and returns the existing file when there is one.
  - **`saveToPictures(fileUri)`** writes to MediaStore `Pictures/MyBizMate Scan/scan_<ms>.<jpg|png>`. On API < 29 it throws `ERR_SAVE_NEEDS_ANDROID_10`; on any other failure, `ERR_SAVE_FAILED`.
  - **`stats()`.** `loadMs` is the time `NativeScanner.create` took, which `ScannerHolder` records. `peakKb` is VmHWM from `/proc/self/status`.

- [ ] **Step 4: Implement the TypeScript side**

  `types.ts`, `parse.ts` and `ScannerModule.ts` cover the new fields and functions. `scanPhoto` keeps its milestone 1 call shape (`scanPhoto(uri)`), with options defaulting to `keepFiles: true` and `deletePhoto: false`.

- [ ] **Step 5: Run the tests and check that they pass**

  Run the Kotlin tests, `npx jest` and `npx tsc --noEmit`: PASS. Then run `npx expo run:android`; the samples still read.

- [ ] **Step 6: Commit**

```bash
git add modules/scanner __tests__
git commit -m "feat(scanner): scans on their own thread, HEIC at 2400 px, enhance, save to Pictures, stats"
```

---

### Task 7: The camera view (Kotlin)

**Files:**
- Create in `modules/scanner/android/src/main/java/expo/modules/scanner/`: `ScannerCameraView.kt`, `ScanOverlayView.kt`, `AutoCapture.kt`
- Create: `modules/scanner/android/src/test/java/expo/modules/scanner/AutoCaptureTest.kt`
- Modify: `ScannerModule.kt` (its `View(...)` definition), `modules/scanner/android/build.gradle` (CameraX 1.7.0: camera-core, camera-camera2, camera-lifecycle, camera-view)
- Create: `modules/scanner/src/ScannerCameraView.tsx`; modify `modules/scanner/index.ts`

**Interfaces:**
- **Consumes:** `ScannerModule.detectFrame` (Task 6).
- **Produces:**

```kotlin
data class Detection(val form: String, val outline: FloatArray /* tl,tr,br,bl as x,y */, val sharpness: Double,
                     val sharpMin: Double)
enum class CameraStatus { LOOKING, HOLDING, BLURRY, FOUND, CAPTURE }
data class Step(val status: CameraStatus, val held: Float, val capture: Boolean)
class AutoCapture(shift: Double = 0.03, holdMs: Long = 800, minFrames: Int = 3, sharpWaitMs: Long = 2000) {
  fun onFrame(d: Detection?, frameWidth: Int, nowMs: Long, auto: Boolean): Step
  fun reset()
}
```

```ts
export type CameraStatus = 'looking' | 'holding' | 'blurry' | 'found' | 'capturing';
export type CameraErrorCode = 'no_camera' | 'start' | 'capture' | 'keep';
export type ScannerCameraProps = ViewProps & {
  active: boolean; auto: boolean; torch: boolean; testImage?: string | null;
  onReady?: (e: { nativeEvent: { hasTorch: boolean } }) => void;
  onStatus?: (e: { nativeEvent: { status: CameraStatus; form: FormName | null } }) => void;
  onPhoto?: (e: { nativeEvent: { uri: string } }) => void;
  onCameraError?: (e: { nativeEvent: { code: CameraErrorCode; message: string } }) => void;
};
export type ScannerCameraRef = { takePhoto(): Promise<void> };
export const ScannerCameraView: ForwardRefExoticComponent<ScannerCameraProps & RefAttributes<ScannerCameraRef>>;
// requireNativeView('Scanner') from 'expo': the module's only view
```

- [ ] **Step 1: Write the failing tests** in `AutoCaptureTest.kt`

  The detections are fixed: frame width 960, the same outline, sharp unless stated otherwise.
  - `no form looks and starts over`: `onFrame(null, …)` gives LOOKING with held 0, and the next detection settles again (held 0).
  - `takes the photo after 800 ms and 3 still sharp frames`: frames at t = 0 and 400 give HOLDING; at t = 800, capture is true and the status is CAPTURE.
  - `2 frames aren't enough, even after 800 ms`: at t = 0 and 900, HOLDING; a third at 950 captures.
  - `a move of 3% of the frame width starts the hold again`: at t = 600, one corner moved 29 px (≥ 0.03 × 960 = 28.8) gives HOLDING with held 0; one moved 28 px stays held.
  - `not sharp: blurry until 2.8 s, then takes it anyway`: unsharp frames every 100 ms give HOLDING before 800, BLURRY from 800, and capture at t = 2800.
  - `manual mode never takes the photo`: `auto = false` gives FOUND and capture false at any time.
  - `another form starts the hold again`.
  - `nothing more after a capture until reset`: after a capture, `onFrame` returns capture false until `reset()`.

- [ ] **Step 2: Run them and check that they fail**

  Run `./gradlew :scanner:testDebugUnitTest --console=plain` from `android/`. Expected: FAIL.

- [ ] **Step 3: Implement `AutoCapture`**

  Port CameraActivity.java:460-506. The constants come from CameraActivity.java:69-75.
  - **No form:** a null detection resets everything and returns LOOKING.
  - **Still or moved:** a frame is still when it is the same form and every corner is within `shift × frameWidth` of the anchor (strict, Euclidean). A still frame adds 1 to the count. Otherwise the count becomes 1, the anchor becomes this outline, and the hold starts now.
  - **How long held:** `held = min(1, (now − since) / holdMs)`, and the outline has settled when `held >= 1 && count >= minFrames`.
  - **The status:**
    - in manual mode: FOUND;
    - settled and (sharp, or `now − since ≥ holdMs + sharpWaitMs`): CAPTURE, with capture true;
    - settled otherwise: BLURRY;
    - not yet settled: HOLDING.
  - **After a capture:** it ignores frames until `reset()`.

- [ ] **Step 4: Implement `ScannerCameraView` and `ScanOverlayView`**

  **`ScannerCameraView`** is an `ExpoView` with `shouldUseAndroidLayout = true`. Its preview and overlay fill a 3:4 rectangle centred on black, as CameraActivity.java:150-164 does.

  **CameraX use cases**, bound to the activity as its `LifecycleOwner`:
  - **Preview:** PreviewView in COMPATIBLE mode, FIT_CENTER; 4:3, about 1440 px on the long side.
  - **ImageAnalysis:** YUV_420_888, KEEP_ONLY_LATEST; 4:3, about 1280 × 960.
  - **ImageCapture:** MINIMIZE_LATENCY, JPEG quality 92; 4:3, up to 4032 × 3024.

  **Each frame:**
  1. Pass the Y plane to `ScannerModule.detectFrame` (found through the app context's module registry), with its row stride and `rotationDegrees`.
  2. Feed the result to `AutoCapture`.
  3. Draw the outline. Scale it with `sx = overlay width / frame width` and `sy = overlay height / frame height` (CameraActivity.java:490).
  4. Send `onStatus` only when the status or the form changes. The status goes out in lower case, with CAPTURE sent as `capturing`.
  5. On CAPTURE, take the photo.

  **Taking the photo:** stop analysing, then save the photo to `cacheDir/camera/capture_<ms>.jpg`. CameraX writes the EXIF rotation, which the core applies. Then send `onPhoto({uri})`. A failed capture sends `onCameraError({code: 'capture'})`; a failed save sends `'keep'`. After either, `AutoCapture.reset()` and analysing resumes.

  **`takePhoto()`** (the manual shutter) takes the photo even when no form is in view.

  **Props:**
  - `torch` calls `enableTorch`;
  - `active = false`, or the view being detached, unbinds the camera.

  **Startup events:**
  - after binding, the view sends `onReady({hasTorch})`;
  - with no back camera it sends `onCameraError({code: 'no_camera'})`;
  - a failed bind sends `'start'` with the message.

  **Test image** (debuggable builds only, checked with `ApplicationInfo.FLAG_DEBUGGABLE`). When `testImage` is set, CameraX is not bound:
  - the view shows the image instead;
  - it builds the grey frame the way Task 2's `write_frames` does;
  - it runs detection every 250 ms, starting after 400 ms;
  - capturing copies the image to `capture_<ms>.jpg`.

  This is the test app's `camera:asset:` mode.

  **`ScanOverlayView`** ports ScanOverlay.java:40-55:
  - a coral fill with alpha (40 + 50 · held) out of 255;
  - a coral line (2.5 + 2 · held) dp wide;
  - at each corner, a 7 dp coral ring around a 5 dp white dot.

- [ ] **Step 5: Write the TypeScript wrapper**

  `src/ScannerCameraView.tsx` wraps `requireNativeView('Scanner')` with the types above and forwards `takePhoto` through its ref.

- [ ] **Step 6: Run the checks**

  1. The Kotlin tests: PASS.
  2. `npx tsc --noEmit`: clean.
  3. `npx expo run:android`: builds. The screen that uses the view is Task 10.

- [ ] **Step 7: Commit**

```bash
git add modules/scanner
git commit -m "feat(scanner): CameraX scanner camera with live outline and automatic photo"
```

---

### Task 8: The look, the scan flow and the Result screen (TypeScript)

**Files:**
- Create: `lib/build.ts`, `lib/theme.ts`, `lib/forms.ts`, `lib/format.ts`, `lib/photoChecks.ts`, `lib/toast.ts`, `lib/scanFlow.ts`
- Create: `components/icons.tsx`, `components/Buttons.tsx`, `components/StatusCard.tsx`, `components/ScanImage.tsx`, `components/BoxRow.tsx`
- Modify: `lib/scans.ts`, `lib/samples.ts`, `app/result.tsx`
- Tests: `__tests__/photoChecks.test.ts`, `__tests__/format.test.ts`, `__tests__/forms.test.ts`, `__tests__/scans.test.ts`, `__tests__/result.test.tsx`
- Run: `npx expo install react-native-svg expo-file-system`

**Interfaces:**
- **Consumes:** Task 6's `scanPhoto`, `enhance` and `saveToPictures`.
- **Produces:**

```ts
// lib/build.ts
export const TEAM_BUILD: boolean;  // __DEV__ || process.env.EXPO_PUBLIC_TEAM_BUILD === '1'
// lib/theme.ts — the test app's colors.xml
export const colors = { coral: '#FC7C4C', ember: '#E26331', coralText: '#B13E03', coralTint: '#FFEEE6',
  ink: '#201913', mute: '#635C57', line: '#E1DDD8', paper: '#FAF7F0', panel: '#FFFFFF', pine: '#3E7A52',
  pineTint: '#E8F3EB', amber: '#8F5300', amberTint: '#FCEFD9', scrim: '#CCFAF7F0', imageBg: '#F1EEE8',
  cropBg: '#F4F1EB', fullScreen: '#161310', pill: '#B3201913' } as const;
export const bold: TextStyle; // Android: fontFamily 'sans-serif-medium'; elsewhere fontWeight '600'
// lib/forms.ts
export const FORMS: Record<FormName, { title: string; cash: string; account: string; number: string }>;
//   sales_invoice:   'MyBizMate Sales Invoice', 'Cash', 'On account', 'SI no.'
//   service_invoice: 'Service Invoice', 'Cash sales', 'Charge sales', 'Invoice no.'
export function fieldLabel(form: FormName, name: string): string;
// lib/format.ts
export function formatMs(ms: number): string;      // < 1000: `${Math.round(ms)} ms`; else `${(ms / 1000).toFixed(1)} s`
export function formatClock(d: Date): string;      // toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
// lib/photoChecks.ts
export type PhotoFlag = 'blurry' | 'dark';
export const FLAG_TEXT: Record<PhotoFlag, string>; // 'Blurry photo (retake it)', 'Dark photo (retake it)'
export function photoFlags(r: ScanResult): PhotoFlag[];
// lib/scans.ts
export type ScanSource = 'camera' | 'camera_app' | 'gallery' | 'sample';
export type StoredScan = { id: string; label: string; source: ScanSource; sampleId?: string; at: Date; result: ScanResult };
export function addScan(s: Omit<StoredScan, 'id' | 'at'>): string;  // also saves the list (below)
export function getScan(id: string): StoredScan | undefined;
export function recentScans(): StoredScan[];       // newest first, 6 at most; older ones are forgotten
export function loadRecent(): Promise<void>;       // at start: the saved list, minus scans whose folder is gone
//   saved as JSON in new File(Paths.document, 'recent.json') (expo-file-system); `at` as an ISO string
// lib/toast.ts
export function toast(message: string): void;      // ToastAndroid.LONG on Android
// lib/scanFlow.ts
export function useScanFlow(): {
  reading: boolean;
  scanUri(uri: string, label: string, source: ScanSource,
          opts?: { sampleId?: string; deletePhoto?: boolean; replace?: boolean }): Promise<void>;
  fromGallery(opts?: { replace?: boolean }): Promise<void>;
  fromCameraApp(opts?: { replace?: boolean }): Promise<void>;
  fromSample(id: string): Promise<void>;
  retake(scan: StoredScan, openedFromRecent: boolean): Promise<void>;
};
// lib/samples.ts (adds)
export function sampleInfo(id: string): { font: string; truth: Record<string, string>; laptop: Record<string, string> };
```

**`fieldLabel` rules:**
- `invoice_no` → the form's `number`.
- `item<N>_<col>` → `Row N · ` + one of: Qty, Unit, Description, Unit price, Amount.
- Otherwise from this map:

| Field | Label |
|---|---|
| date | Date |
| customer_name | Customer |
| customer_tin | TIN |
| customer_address | Address |
| amount_words | Amount in words |
| amount_figure | Amount in figures |
| vatable_sales | VATable sales |
| vat | VAT |
| zero_rated | Zero-rated sales |
| vat_exempt | VAT-exempt sales |
| total_sales | Total sales |
| less_vat | Less VAT |
| net_of_vat | Net of VAT |
| add_vat | Add VAT |
| discount | Discount |
| withholding | Withholding tax |
| total_due | Total due |
| total_due_2 | Total due (left column) |

**Scan flow copy and behaviour:**
- **Labels:** "Camera photo" (camera and camera_app), "Photo from gallery", "Sample 0051".
- **A guard:** a `useRef` flag stops a second scan while one runs.
- **Navigation:** `router.push`, or `router.replace` with `replace`, to `/result?id=<id>`.
- **Errors (toasts):**
  - a picker failure: "Couldn't open that photo.";
  - `ERR_UNREADABLE_IMAGE`: "Couldn't read that photo: This file isn't a photo the scanner can open.";
  - any other scan failure: "Couldn't read that photo: <message>";
  - a sample failure: "Couldn't open that sample.".
- **`fromCameraApp`:**
  1. Asks `ImagePicker.requestCameraPermissionsAsync()`.
  2. If that's refused: toast "The camera app needs the camera permission too. Choose a photo from the gallery instead.".
  3. Otherwise `launchCameraAsync({ mediaTypes: ['images'], quality: 1 })`, then scans with `deletePhoto: true`.
- **`retake`:**
  - opened from Recent scans, or a sample: `router.back()`;
  - `camera`: `router.replace('/camera')` (the route arrives in Task 10);
  - `camera_app`: `fromCameraApp({replace: true})`;
  - `gallery`: `fromGallery({replace: true})`.

**The Result screen** (ResultActivity.java and activity_result.xml, without the checks). Its header reads "Scan", with the form's title as a 13 sp subtitle. Then, on paper:

**1. StatusCard (one of three)**

| When | Title | Body | Style |
|---|---|---|---|
| Not aligned | "Couldn't find the form" | "Get the whole form in the photo: all 4 black corner squares of a MyBizMate Sales Invoice, or the whole table of a Service Invoice. Then retake it." | amber on amberTint, ember error icon |
| Photo flags | "1 thing to check" / "N things to check" | "Check: <FLAG_TEXT joined with ', '>.\nRead on this phone in <formatMs(totalMs)>, offline." | amber on amberTint, ember error icon |
| Neither | "Photo looks good" | "Read on this phone in <…>, offline." | pine on pineTint, check icon |

**2. ScanImage**
- **The card:** 300 dp tall, background imageBg.
- **The toggle:** Enhanced (the default) / B&W / Original; 40 dp tall, 13 sp; the chosen one is coralText on coralTint.
- **Save:** a coralText text button with the download icon, hidden in Original.
- **Each view's image:** Enhanced and B&W come from `enhance(pageUri, mode)` the first time each is chosen, with a spinner meanwhile. Original is `originalUri`.
- **Full screen:** tapping the image opens it full screen on fullScreen; tapping again closes it.
- **Saving:** Save is disabled while it saves. The outcomes:
  - success: "Saved to Pictures/MyBizMate Scan";
  - `ERR_SAVE_NEEDS_ANDROID_10`: "Saving needs Android 10 or newer.";
  - anything else: "Couldn't save the scan.".
- **When not aligned:** only the Original image shows, with no toggle and no Save.

**3. "WHAT THE CAMERA SAW"**
- The heading is a section label (13 sp, bold, mute, capitals, letter spacing 0.06), with "Each box is cut out and read on its own." under it.
- Then one BoxRow per read: `fieldLabel`; the crop (48 dp tall, cropBg, 12 dp corners, contain); and "Read as “<text>” · <round(conf × 100)>% sure", in ember when conf < 0.9. An empty text reads "Couldn't make out any writing".
- Then, when aligned, a Terms row: the form's `cash` or `account` label. When the terms are unclear it shows "Unclear", with the note "Tick <cash> or <account> clearly".

**4. Footnote**
- **Aligned:** "<n> boxes read on this phone in <total>. Nothing left the phone." Team builds add the stage timings: "<n> boxes read on this phone in <total> (straighten <alignMs>, read <readMs>). Nothing left the phone."
- **Samples add:** "Sample invoice: <a> of <b> boxes read exactly as written." Here b is the sample's truth fields with text, and a is the reads equal to their truth.
- **Not aligned:** "Checked on this phone in <total>. Nothing left the phone."

**5. Bottom bar**
- **Aligned:** Retake, as an outlined button.
- **Not aligned:** Retake as a filled button with the camera icon.

**Icons** (`components/icons.tsx`) are react-native-svg ports of the test app's `res/drawable` vectors: arrow_back, bolt, camera, check_circle, chevron_right, close, download, error, flash_off, flash_on, image and lock, plus a ⋮ "more" icon of 3 dots. Each takes `{ size, color }`.

**Buttons** (themes.xml):
- primary: ember, at least 56 dp tall, 16 dp corners, 16 sp bold, white text;
- outlined: ink text with a line border;
- text: coralText, 15 sp.

- [ ] **Step 1: Write the failing tests**

```ts
// photoChecks.test.ts
test('flags match the Python on every fixture', () => {
  for (const e of allExpected()) expect(photoFlags(toScanResult(e))).toEqual(e.photoFlags);  // test-utils/coreJson
});
test('rounds like the Python before comparing', () => {
  expect(photoFlags(make({ sharpness: 0.99996, sharpMin: 1, light: 200 }))).toEqual([]);         // 1.0
  expect(photoFlags(make({ sharpness: 0.99994, sharpMin: 1, light: 200 }))).toEqual(['blurry']); // 0.9999
  expect(photoFlags(make({ sharpness: 2, sharpMin: 1, light: 49.96 }))).toEqual([]);             // 50.0
  expect(photoFlags(make({ sharpness: 0.4, sharpMin: 0.5, light: 30 }))).toEqual(['blurry', 'dark']);
  expect(photoFlags(make({ aligned: false }))).toEqual([]);
});
// format.test.ts
expect(formatMs(57)).toBe('57 ms'); expect(formatMs(1400)).toBe('1.4 s'); expect(formatMs(12345)).toBe('12.3 s');
// forms.test.ts
expect(fieldLabel('sales_invoice', 'invoice_no')).toBe('SI no.');
expect(fieldLabel('service_invoice', 'invoice_no')).toBe('Invoice no.');
expect(fieldLabel('sales_invoice', 'item10_unit_price')).toBe('Row 10 · Unit price');
expect(fieldLabel('service_invoice', 'total_due_2')).toBe('Total due (left column)');
// scans.test.ts: 7 scans added → recentScans() has the newest 6, newest first; the first is forgotten (getScan undefined)
// scans.test.ts (expo-file-system mocked): the list is saved to recent.json; loadRecent() restores it, and drops a
//   scan whose folder no longer exists
```

  **`result.test.tsx`** mocks the scanner module, expo-router, the toast and the scan flow:
  - `no form`: the not-found card, a filled Retake, and no toggle.
  - `a blurry photo`: "1 thing to check" and "Check: Blurry photo (retake it).".
  - `a good photo`: "Photo looks good".
  - `a Service Invoice`: the subtitle "Service Invoice", and the Terms row "Charge sales".
  - `rows`: "Read as “0007655” · 99% sure"; a read at conf 0.85 is in ember.
  - `footnote`: a client build shows "29 boxes read on this phone in 1.4 s. Nothing left the phone."; a team build shows "29 boxes read on this phone in 1.4 s (straighten 57 ms, read 1.2 s). Nothing left the phone.". Mock `lib/build` for each.
  - `sample footnote`: "Sample invoice: 30 of 31 boxes read exactly as written.".
  - `views`: on open, `enhance(pageUri, 'enhanced')`; pressing "B&W" calls it with 'bw'; pressing "Original" shows `originalUri` and hides Save.
  - `save once`: two quick presses call `saveToPictures` once, and the toast says "Saved to Pictures/MyBizMate Scan".
  - `save on Android 9`: a rejection with `ERR_SAVE_NEEDS_ANDROID_10` gives the toast "Saving needs Android 10 or newer.".
  - `full screen`: tapping the image shows the full-screen view, and tapping again closes it.
  - `retake`: a sample calls `router.back()`; a gallery scan calls `fromGallery({replace: true})`; a camera scan calls `router.replace('/camera')`.

- [ ] **Step 2: Run them and check that they fail**

  Run: `npx jest`. Expected: FAIL.

- [ ] **Step 3: Implement the libraries, the components and `app/result.tsx`**

  Implement them as specified above. `photoFlags` rounds half to even at 4 decimals (sharpness) and 1 decimal (light), then compares strictly.

- [ ] **Step 4: Run the checks**

  1. `npx jest` and `npx tsc --noEmit`: PASS.
  2. `npx expo run:android`. A sample's result shows the new card, the three views and the rows.

- [ ] **Step 5: Commit**

```bash
git add lib components app/result.tsx __tests__ package.json package-lock.json
git commit -m "feat(app): the test app's look; Result with photo checks, scan view and every box"
```

---

### Task 9: Splash and Home (TypeScript)

**Files:**
- Create: `components/BrandSplash.tsx`, `components/ScanIllustration.tsx`, `components/Sheet.tsx`, `components/ReadingOverlay.tsx`, `components/RecentRow.tsx`
- Modify: `app/_layout.tsx`, `app/index.tsx`, `app.json`
- Create: `assets/brand/logo_mark.png` (copied from the test app's `res/drawable-nodpi/logo_mark.png`) and `assets/brand/splash-logo.png`
- Replace: `assets/icon.png`, `assets/android-icon-foreground.png`, `assets/android-icon-background.png`, `assets/android-icon-monochrome.png`
- Tests: `__tests__/home.test.tsx` (rewritten), `__tests__/splash.test.tsx`
- Run: `npx expo install expo-splash-screen`

**Interfaces:**
- **Consumes:** Task 8's `useScanFlow`, `recentScans`, `sampleInfo`, `formatMs`, `formatClock`, `photoFlags`, theme and icons.
- **Produces:** `BrandSplash({ onReady }: { onReady(): void })`, and the `/` route.

**`app.json`:**
- `"orientation": "portrait"`;
- `"android.permissions": ["android.permission.CAMERA"]`;
- the expo-splash-screen plugin with `image: ./assets/brand/splash-logo.png`, `imageWidth: 104`, `backgroundColor: "#FAF7F0"`;
- expo-image-picker's `cameraPermission`: "The scanner needs the camera to see the invoice. Nothing it sees leaves the phone.".

**Brand images** come from `logo_mark.png` (512 × 512), made once with the venv's PIL (no script is committed):
- `icon.png`: 1024 white, with the logo at 512 centred (an inset of 25%);
- the foreground: 1024 transparent, with the logo at 512 centred;
- the background: 1024 white;
- the monochrome icon: the foreground's alpha, in black;
- `splash-logo.png`: the logo at 512.

**The splash** (SplashActivity.java and activity_splash.xml):
1. Keep the native splash with `SplashScreen.preventAutoHideAsync()`, and hide it once BrandSplash has laid out.
2. **What BrandSplash shows, on paper:**
   - the logo at 104 dp;
   - "mybizmate.io" at 32 sp bold, with ".io" in coralText;
   - "Scan invoices. Even offline." in mute;
   - at the bottom, a 140 dp loading bar and "Getting the scanner ready…".
3. **The brand fades in:** opacity 0 → 1 and a slide up from 12 dp to 0, over 450 ms.
4. **While it shows,** it runs `preload()`, `loadRecent()` and a warm-up `scanPhoto(sampleUri('inv_0001'), { keepFiles: false })`. It stays at least 1200 ms, then fades out and calls `onReady`.
5. **On failure** it stays, showing "The scanner couldn't start: <message>".

**Home** (activity_home.xml and HomeActivity.java). The stack header is hidden; the screen has its own toolbar, then content on paper.

**Toolbar**
- The logo at 30 dp, and "mybizmate.io" at 20 sp.
- In team builds only (`TEAM_BUILD`), a ⋮ button opens a menu with one item, "Speed test", which goes to `/speed`.

**Content, top to bottom**
1. **Header:** "Scan an invoice" (30 sp bold ink), then "Take a photo of a filled-in MyBizMate Sales Invoice or Service Invoice. It's read right here on your phone, in a second or two, even without internet."
2. **The scan card** (white, 1 dp line border, 18 dp corners):
   - the ScanIllustration (a react-native-svg port of `ill_scan.xml`);
   - a primary "Take photo" button with the camera icon, which goes to `/camera`;
   - an outlined "Choose from gallery" button with the image icon, which calls `fromGallery()`.
3. **Tips:** "FOR THE BEST SCAN", then three numbered tips:
   1. "The whole form in the photo: every corner square, or the whole table"
   2. "Flat on a table, in good light"
   3. "Phone held straight above it, no strong shadows"
4. **Recent scans:** "RECENT SCANS", hidden when there are none. Each RecentRow has:
   - an icon: a pine check, or an ember error when a form wasn't found or a photo is flagged;
   - the scan's label;
   - "<status> · <formatMs(totalMs)> · <formatClock(at)>", where the status is "Form not found", "N to check" (photo flags) or "Read".

   Tapping a row opens `/result?id=<id>&from=recent`.
5. **Samples:** a text button, "No form handy? Try a sample invoice". It opens a Sheet titled "Sample invoices", with the subtitle "Filled in with 2 handwriting styles the model never trained on, photographed like a phone would.". It has one row per sample: a 52 × 64 dp thumbnail, "Sample 0001", and "Caveat handwriting" or "Patrick Hand handwriting".
6. **Footer:** the lock icon, then "Read on this phone · no internet access".

**While reading**
- A ReadingOverlay covers the screen: scrim behind a 260 dp card.
- The card shows "Reading the invoice…", a loading bar, and "Straightening the photo and reading every box".

- [ ] **Step 1: Write the failing tests**

  **`splash.test.tsx`** (fake timers):
  - `onReady` comes after `preload` and the warm-up, and not before 1200 ms;
  - a failed `preload` shows "The scanner couldn't start: boom" and never calls `onReady`.

  **`home.test.tsx`:**
  - the title, the description and the 3 tips are shown;
  - "Take photo" pushes `/camera`;
  - "Choose from gallery" calls the picker and then `scanPhoto`, and pushes `/result?id=…`;
  - pressing it twice while reading scans once;
  - the samples sheet lists 8 rows, from "Sample 0001", with "Caveat handwriting";
  - after a scan, Recent scans shows "Photo from gallery" and "Read · 1.4 s · 2:41 PM";
  - in a team build, ⋮ then "Speed test" pushes `/speed`; a client build has no ⋮ button.

- [ ] **Step 2: Run them and check that they fail**

  Run: `npx jest`. Expected: FAIL.

- [ ] **Step 3: Implement the splash, Home, the components, `app.json` and the brand images**

  Build them as specified above.

- [ ] **Step 4: Run the checks**

  1. `npx jest` and `npx tsc --noEmit`: PASS.
  2. `npx expo run:android`. It opens on the splash, then Home, with the new icon.

- [ ] **Step 5: Commit**

```bash
git add app components assets app.json package.json package-lock.json __tests__
git commit -m "feat(app): brand splash and the test app's Home, with recent scans and samples"
```

---

### Task 10: The camera screen (TypeScript)

**Files:**
- Create: `app/camera.tsx`, `lib/cameraCopy.ts`
- Test: `__tests__/camera.test.tsx`

**Interfaces:**
- **Consumes:** Task 7's `ScannerCameraView`, and Task 8's `useScanFlow`, `FORMS`, theme and icons.
- **Produces:** the `/camera` route, and

```ts
export function statusText(status: CameraStatus | 'starting', form: FormName | null): string;
export const CAMERA_ERRORS: { capture: string; keep: string; noCamera: string; start(message?: string): string };
```

**Copy** (CameraActivity.java):

| Status / error | Text |
|---|---|
| starting | "Starting the camera…" |
| looking | "Looking for the form…" |
| holding | "<title> · hold still" |
| blurry | "<title> · blurry, hold still" |
| found | "<title> found · tap the button" |
| capturing | "Taking the photo…" |
| capture | "Couldn't take the photo. Try the button again." |
| keep | "Couldn't keep the photo. Try again." |
| noCamera | "This phone has no camera the scanner can use." |
| start | "The camera couldn't start: <message>", or "The camera couldn't start." without one |
| permission panel | "The scanner needs the camera to see the invoice. Nothing it sees leaves the phone." |

**The screen** (activity_camera.xml). The header is hidden; the screen is black with light status bar text.

**Top bar** (56 dp)
- A close button (calls `router.back()`).
- The title "Scan an invoice" (18 sp bold white).
- An Auto / Manual button: coral, with the bolt icon. It starts on "Auto"; pressing it switches to "Manual" and sets `auto={false}`.
- A torch button, shown only after `onReady` reports `hasTorch`. It switches between the flash_on and flash_off icons.

**The picture**
- `ScannerCameraView` fills a 3:4 box centred between the bars.
- A status pill sits at the bottom of the picture: background pill, 20 dp corners, 15 sp white text.

**Bottom bar** (128 dp)
- A 56 dp gallery button, 40 dp from the left edge. It calls `fromGallery({replace: true})`.
- An 80 dp shutter: a white disc inside a 4 dp coral ring, 9 dp inset. It calls `ref.takePhoto()`.

**Permission**
- On focus, call `ImagePicker.getCameraPermissionsAsync()`. When the camera isn't granted and `canAskAgain`, ask for it once.
- When it is refused, show a problem panel in place of the picture, with the permission text and two buttons:
  - [Allow the camera]: asks again when `canAskAgain`, otherwise `Linking.openSettings()`;
  - [Use the phone's camera app instead]: `fromCameraApp({replace: true})`.
- Camera errors use the same panel:
  - `no_camera` shows noCamera, with one button, [Choose from gallery];
  - `start` shows start, with [Try again] (remount the view) and the camera-app button.

**The photo**
- `onPhoto` calls `scanUri(uri, 'Camera photo', 'camera', { deletePhoto: true, replace: true })`.
- While it reads, `active={false}` and the ReadingOverlay shows.
- A photo that arrives after the screen has lost focus is ignored. The view is inactive whenever the screen isn't focused.
- `capture` and `keep` errors show their text in the pill.

**Development test hook** (in `__DEV__` only): `/camera?test=<sample id or file:// URI>` passes the sample's `sampleUri`, or the URI, as `testImage`.

- [ ] **Step 1: Write the failing tests** (`camera.test.tsx`, with the native view and expo-image-picker mocked)

  - `status copy`: holding + service gives "Service Invoice · hold still"; blurry + sales gives "MyBizMate Sales Invoice · blurry, hold still"; found gives "… found · tap the button"; before any status, "Starting the camera…".
  - `errors`: capture and keep show their text in the pill; no_camera shows the panel with "This phone has no camera the scanner can use."; start with "boom" shows "The camera couldn't start: boom".
  - `permission can be asked again`: refused with `canAskAgain` true, "Allow the camera" calls `requestCameraPermissionsAsync`.
  - `permission refused for good`: refused with `canAskAgain` false, "Allow the camera" calls `Linking.openSettings`.
  - `camera app needs the permission too`: the camera-app button with the permission refused shows the toast "The camera app needs the camera permission too. Choose a photo from the gallery instead.".
  - `torch`: hidden until `onReady({hasTorch: true})`; pressing it sets `torch={true}`.
  - `auto and manual`: pressing "Auto" shows "Manual" and sets `auto={false}`.
  - `shutter`: pressing it calls `takePhoto`.
  - `a photo is read`: `onPhoto` calls `scanUri` with `deletePhoto: true, replace: true`, and the view gets `active={false}`.
  - `a photo that arrives after leaving is not scanned`: after the screen loses focus, `onPhoto` doesn't call `scanUri`.

- [ ] **Step 2: Run them and check that they fail**

  Run: `npx jest`. Expected: FAIL.

- [ ] **Step 3: Implement `lib/cameraCopy.ts` and `app/camera.tsx`**

  Build them as specified above.

- [ ] **Step 4: Run the checks**

  1. `npx jest` and `npx tsc --noEmit`: PASS.
  2. On the emulator, open `mybizmatescan://camera?test=inv_0051`. Within about 2 s it takes the photo by itself and shows the MyBizMate Sales Invoice result.

- [ ] **Step 5: Commit**

```bash
git add app/camera.tsx lib/cameraCopy.ts __tests__/camera.test.tsx
git commit -m "feat(app): the scanner camera screen, with permission flow and the camera app as a fallback"
```

---

### Task 11: The speed test (TypeScript)

**Files:**
- Create: `lib/speedTest.ts`, `app/speed.tsx`
- Test: `__tests__/speedTest.test.ts`, `__tests__/speed.test.tsx`

**Interfaces:**
- **Consumes:** Task 6's `scanPhoto` and `stats`, and Task 8's `sampleInfo` and `formatMs`.
- **Produces:**

```ts
export function percentile(xs: number[], q: number): number;  // numpy's default (linear)
export type SpeedResult = { medianMs: number; p90Ms: number; readMedianMs: number;
  exact: { a: number; b: number }; laptop: { a: number; b: number }; peakMb: number; loadMs: number | null };
export function runSpeedTest(onProgress: (done: number, total: number) => void, repeats?: number): Promise<SpeedResult>;
```

**Who reaches it:** the team, from Home's team menu, or with `mybizmatescan://speed` on any build.

**How it runs** (SpeedTestActivity.java):
- **The runs:** the 8 samples, 3 times each, so 24 scans with `keepFiles: false`, one after another.
- **Times:**
  - `medianMs` and `p90Ms` come from each scan's `totalMs`;
  - `readMedianMs` comes from `readMs`.
- **Accuracy**, from the first round only:
  - `exact`: reads equal to their truth, out of the truth fields with text;
  - `laptop`: reads equal to the laptop's reading, out of the laptop's reads.
- **Memory and startup:**
  - `peakMb` is `stats().peakKb / 1024`, rounded;
  - `loadMs` is `stats().loadMs`.

**The screen**

*Header:* the header reads "Speed test". Under it:
- the title "How fast this phone reads invoices";
- the device line, "<Brand> <Model> · Android <Release>" (from `Platform.constants`);
- the median, big, with "per invoice, median" under it.

*Progress line:* "Getting ready…", then "Invoice <d> of 24", then "24 invoices read on this phone".

*Rows:*

| Row | Value |
|---|---|
| Slowest 10% | `p90Ms` |
| Reading the boxes | `readMedianMs` |
| Read exactly as written | "<a> of <b> boxes" |
| Same as the laptop | "<a> of <b> boxes" |
| Peak memory | "<n> MB" |
| Starting the scanner | `loadMs` |

*Button:* "Run speed test", then "Run again".

*Note:* "Reads 8 sample invoices 3 times with this phone's processor, about 30 seconds. Nothing is sent anywhere."

- [ ] **Step 1: Write the failing tests**

  **`speedTest.test.ts`:**
  - `percentile([1,2,3,4], 90) === 3.7` and `percentile([3,1,2], 50) === 2`;
  - with `scanPhoto` mocked, `runSpeedTest` makes 24 calls with `keepFiles: false`, calls `onProgress` from (1, 24) to (24, 24), and returns the medians, the p90 and the a/b counts worked out from the mocks.

  **`speed.test.tsx`:** pressing "Run speed test" shows "Invoice 1 of 24", then the six rows with their values, and the button "Run again".

- [ ] **Step 2: Run them and check that they fail**

  Run: `npx jest`. Expected: FAIL.

- [ ] **Step 3: Implement `lib/speedTest.ts` and `app/speed.tsx`**

  Build them as specified above.

- [ ] **Step 4: Run the checks**

  1. `npx jest` and `npx tsc --noEmit`: PASS.
  2. On the emulator, the speed test finishes with "Same as the laptop: 243 of 243 boxes".

- [ ] **Step 5: Commit**

```bash
git add lib/speedTest.ts app/speed.tsx __tests__
git commit -m "feat(app): the team's speed test"
```

---

### Task 12: On the emulator and a real phone

**Files:**
- Modify: `README.md` (milestone 2's features, the camera test hook, and the measured numbers)

- [ ] **Step 1: Run every suite on the final tree**

  `npm run test:core`, the Kotlin tests, `npx jest`, `npx tsc --noEmit` and the exporter's tests: all PASS.

- [ ] **Step 2: Check on the emulator** (debug build, `npx expo run:android`)

  Record each result in the README.
  1. **Splash and Home:** the splash, then Home, with the new launcher icon.
  2. **A sample:** Sample 0007 gives "Photo looks good", reads `0007655`, and Enhanced / B&W / Original all show. Save puts a file in Pictures: check with `adb shell ls "/sdcard/Pictures/MyBizMate Scan"`.
  3. **The camera on a Sales Invoice:** `mybizmatescan://camera?test=inv_0051` shows the outline, takes the photo by itself and reads it.
  4. **The camera on a Service Invoice:**
     1. Push the photo: `adb push fixtures/core/photos/svc_0000.jpg /data/local/tmp/`.
     2. Copy it into the app: `adb shell run-as com.mybizmate.scan cp /data/local/tmp/svc_0000.jpg cache/`.
     3. Open `mybizmatescan://camera?test=file:///data/user/0/com.mybizmate.scan/cache/svc_0000.jpg`.

     It shows "Service Invoice" with its invoice number.
  5. **The emulator's own camera** (its virtual scene): the screen starts, says "Looking for the form…", and the shutter works.
  6. **The gallery:** svc_0000_cw.jpg reads upright. Push it to `/sdcard/Pictures/`. Never screenshot the picker.
  7. **The speed test:** record its numbers, marked "emulator, debug build".

- [ ] **Step 3: Check on a real arm64 phone**

  This needs the team's phone, with USB debugging on.
  1. Build and install a team release: in PowerShell, `$env:EXPO_PUBLIC_TEAM_BUILD='1'`, then `npx expo run:android --variant release --device`.
  2. Record in the README:
     - the speed test's numbers (the design's target is under 3 s from photo to result);
     - the peak memory after scanning a 50 MP gallery photo, and a HEIC photo if the phone takes them;
     - the live camera on a printed sample: the outline, the automatic photo, the torch, Manual mode.
  3. Build a client release, without the variable. Its Home has no ⋮ menu.
  4. If no phone is connected, write that this check is still open, and stop here; don't mark it done.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: milestone 2's features, camera test hook and measured numbers"
```

After this task: a whole-branch review on the most capable model (Native execution), then the user decides on push and PR.
