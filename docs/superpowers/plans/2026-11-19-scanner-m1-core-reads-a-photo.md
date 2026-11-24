# MyBizMate Scan, milestone 1: the C++ core reads a gallery photo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An Expo app in `mybizmate-ocr/` whose C++ scanner core reads a MyBizMate Sales Invoice photo from the gallery on Android, with the same readings as the Python reference.

**Architecture:** A local Expo module, `modules/scanner`, holds a platform-free C++ core (OpenCV and ONNX Runtime). The core is ported from the Android test app's `OcrEngine.java` and `PhotoQuality.java`; where the Java and the Python in `prototype/benchmark/` disagree, the Python wins. A thin JNI and Kotlin layer gives TypeScript `scanPhoto(uri)`, and two expo-router screens (Home and Result) show the readings. The core's tests run as a native program on the x86_64 emulator, against fixtures exported by the Python.

**Tech Stack:**
- **App:** Expo SDK 58 (expo-router, expo-dev-client, expo-image-picker, expo-build-properties), TypeScript, Kotlin.
- **Core:** C++17; OpenCV 5.1.0 (Maven AAR, used through prefab); ONNX Runtime 1.32.0 (Maven AAR); CMake 3.22.1 with Ninja and the Android NDK; nlohmann/json 3.11.3; doctest 2.4.11.
- **Tests and fixtures:** jest-expo with React Native Testing Library; the project's Python venv (`.venv`, cv2 5.1.0, onnxruntime 1.32.0) for the exporter.

**Spec:** `docs/2026-11-19-expo-scanner-design.md`. This plan is its milestone 1 of 9; each later milestone gets its own plan. Milestone 2 adds the camera, the Service Invoice, the photo-check flags and the scan view; milestone 3 adds the checks and editing.

## Global Constraints

- **Location**: the app lives in `mybizmate-ocr/`, next to `prototype/`. `prototype/` stays the Python reference: this plan only adds two files to it (the exporter and its test).
- **Reference behaviour**: "The reference behaviour is the Python pipeline in `prototype/benchmark/`". "Thresholds and constants keep their values from the Python".
- **Parity**: "the same readings and flags on the test fixtures". For milestone 1 that means:
  - readings and backup readings identical;
  - confidence within 0.002;
  - corners within 0.5 px;
  - turned, terms and blanks equal;
  - sharpness within 1% and light within 1.0.
- **The model**: "PP-OCRv6 small with its output cut to 98 Latin characters, a 12 MB ONNX file, run by ONNX Runtime. The same file serves Android and iOS."
- **Offline**: "Scanning that needs internet" is an anti-goal. The core opens no network connection.
- **Privacy**: the fixtures and assets are synthetic only. Nothing under `prototype/data/real_private/` is read, copied or committed.
- **Android**: minimum Android 8.0 (API 26); package `com.mybizmate.scan` (the design's proposal, final before milestone 8). "Expo Go can't run it": development builds with `npx expo run:android`.
- **Same libraries on both sides**: OpenCV 5.1.0 and ONNX Runtime 1.32.0, the same versions as the Python venv and the Java test app.
- **iOS-ready core**: nothing under `modules/scanner/cpp/` may use JNI or Android headers. The iOS wrapper (milestone 9) will compile the same files.
- **Git**: `mybizmate-ocr/` becomes its own git repository in Task 1, and every task ends with a commit.

## Review Focus

1. **A portrait phone photo stored sideways with an EXIF rotation tag** should read upright, exactly like the same photo stored straight. Test: Task 7, `exif photo reads upright`.
2. **A file OpenCV can't open.** A HEIC photo from a newer phone is decoded by Android instead. A broken or non-image file shows "This file isn't a photo the scanner can open." and never crashes. Tests: Task 7, `unreadable file throws UnreadableImage`; Task 9, the alert test. Task 8's HEIC fallback has no automated test here, because there is no HEIC fixture: note it for milestone 2's first real-phone test.
3. **A photo with no form in it** should show "Couldn't find the form" with no readings, not an error. Tests: Task 7, blank-page parity; Task 9, the Result screen test.
4. **A very large photo** (48-50 MP phones) should be shrunk to 2400 px on its long side before reading, without running out of memory. Test: Task 7, `large photo is capped`.
5. **Two scans started at once** (a double tap) should both finish with the right readings. Tests: Task 7, `concurrent scans`; Task 9, buttons disabled while reading.

---

## File structure

```
mybizmate-ocr/
  app.json · package.json · tsconfig.json · README.md
  app/_layout.tsx               root stack; calls preload() once
  app/index.tsx                 Home: Choose from gallery, Sample invoices
  app/result.tsx                Result: the page, then every box's crop and reading
  lib/samples.ts                the 8 bundled sample invoices
  lib/scans.ts                  in-memory store of finished scans
  assets/samples/inv_*.jpg      the 8 synthetic samples (written by the exporter)
  __tests__/                    home, result, scanResult (jest)
  fixtures/core/                photos, expected results, pages, crops (written by the exporter)
  scripts/core-test.mjs         builds the C++ tests for x86_64 and runs them on the emulator
  modules/scanner/
    expo-module.config.json · index.ts · src/ScannerModule.ts · src/types.ts · src/parse.ts
    assets/scanner/             inference_latin.onnx, dict.txt, field_map.json, form_small.png (exporter)
    android/build.gradle · android/CMakeLists.txt
    android/src/main/java/expo/modules/scanner/ScannerModule.kt · NativeScanner.kt
    android/src/main/cpp/scanner_jni.cpp
    cpp/CMakeLists.txt          static library scanner_core (every core/*.cpp)
    cpp/core/                   info · form_template · photo_quality · align · crop · recognizer · scanner · result_json
    cpp/third_party/            nlohmann/json.hpp · doctest/doctest.h
    cpp/tests/                  CMakeLists.txt · main.cpp · fixtures.h/.cpp · test_*.cpp
prototype/benchmark/export_core_fixtures.py · test_export_core_fixtures.py
```

## The scan result: the core's JSON, which TypeScript reads and the fixtures share

```jsonc
{
  "aligned": true,
  "form": "sales_invoice",                     // null when not aligned
  "photoSize": [1617, 2021],                   // width, height after the 2400 px cap
  "turned": false,                             // the page was upside down and was turned back
  "corners": [[x, y], [x, y], [x, y], [x, y]], // tl, tr, br, bl in photo pixels; null when not aligned
  "sharpness": 1.2345, "sharpMin": 1.0, "light": 231.0,  // null when not aligned
  "terms": "cash",                             // "cash" | "account" | null
  "blanks": 20,                                // boxes with no writing (not counting the 2 checkboxes)
  "reads": [{ "name": "invoice_no", "type": "printed_digits", "text": "0007655", "conf": 0.9981,
              "alts": [], "cropSize": [212, 49], "cropFile": "/…/invoice_no.png" }],  // in field_map order
  "pageFile": "/…/page.jpg",                   // null when not aligned
  "timing": { "alignMs": 0, "cropMs": 0, "readMs": 0, "totalMs": 0 }
}
```

The fixtures' expected files (`fixtures/core/expected/<photo stem>.json`) differ in three ways. They have the same keys, plus `"photo": "<file name in photos/>"`. They have no `cropFile`, `pageFile` or `timing`. Their sharpness and light are not rounded.

---

### Task 1: An Expo app that runs on the emulator

**Files:**
- Create: `mybizmate-ocr/` (template), `app/_layout.tsx`, `app/index.tsx`, `__tests__/home.test.tsx`
- Modify: `package.json`, `app.json`, `.gitignore`
- Delete: the template's `App.tsx` and `index.ts`

**Interfaces:**
- Produces: the routes `/` (Home) and the testing setup (jest-expo preset, `npm test`).

- [ ] **Step 1: Create the app.** From the project root, run `npx create-expo-app@latest mybizmate-ocr --template blank-typescript@sdk-58`. Expected: `package.json` lists `expo` 58.x.
- [ ] **Step 2: Add the libraries.**
  - Run `npx expo install expo-router react-native-safe-area-context react-native-screens expo-linking expo-constants expo-status-bar expo-dev-client expo-image-picker expo-build-properties`.
  - Then run `npx expo install jest-expo jest @testing-library/react-native @types/jest -- --save-dev`.
- [ ] **Step 3: Configure.**
  - In `package.json`: `"main": "expo-router/entry"`; scripts `"test": "jest"` and `"test:core": "node scripts/core-test.mjs"`; `"jest": { "preset": "jest-expo" }`.
  - In `app.json`: name `MyBizMate Scan`, slug `mybizmate-scan`, scheme `mybizmatescan`, `android.package` `com.mybizmate.scan`, plugins `["expo-router", ["expo-build-properties", { "android": { "minSdkVersion": 26 } }]]`.
  - Delete `App.tsx` and `index.ts`.
  - In `.gitignore`, make sure `/android` and `/ios` are anchored to the root, so `modules/scanner/android` stays tracked. Add `modules/scanner/cpp/tests/build/`, `modules/scanner/android/build/` and `modules/scanner/android/.cxx/`.
- [ ] **Step 4: Write the failing test** `__tests__/home.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react-native';
import Home from '../app/index';
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
test('home offers the gallery', () => {
  render(<Home />);
  expect(screen.getByText('Choose from gallery')).toBeTruthy();
});
```

- [ ] **Step 5: Run it.** Run `npm test`. Expected: FAIL, because `../app/index` can't be found.
- [ ] **Step 6: Implement the screens.** `app/_layout.tsx` is an expo-router `Stack`, and `app/index.tsx` is a `Home` default export. Home has the title "MyBizMate Scan" and a "Choose from gallery" button that does nothing yet.
- [ ] **Step 7: Run it again.** Run `npm test`. Expected: PASS (1 test).
- [ ] **Step 8: Check on the emulator.**
  - Start it: `%LOCALAPPDATA%\Android\Sdk\emulator\emulator.exe -avd Medium_Phone_API_36.1 -no-snapshot-load -no-boot-anim`.
  - Then run `npx expo run:android` (the first build takes several minutes; run it in the background).
  - Then run `adb shell uiautomator dump /sdcard/ui.xml` and `adb shell grep -c "Choose from gallery" /sdcard/ui.xml`. Expected: `1`.
- [ ] **Step 9: Commit.** Run `git init`, `git add -A`, `git commit -m "chore: Expo SDK 58 app shell for MyBizMate Scan"`.

### Task 2: The Python exporter for the scanner's assets and the core's fixtures

**Files:**
- Create: `prototype/benchmark/export_core_fixtures.py`, `prototype/benchmark/test_export_core_fixtures.py`
- Writes into `mybizmate-ocr/`: `modules/scanner/assets/scanner/*`, `fixtures/core/**`, `assets/samples/*.jpg`

**Interfaces:**
- Produces: `export(app_root: Path) -> None`, and this layout under `fixtures/core/`:
  - `photos/`: 15 files.
    - The 8 samples, `inv_0001`, `0007`, `0011`, `0017`, `0027`, `0041`, `0051` and `0091` (`.jpg`), copied from `prototype/data/synth/`.
    - Six variants of `inv_0051`, `blank_page.png` and `not_an_image.jpg`. The variants: `inv_0051_turned.jpg`, `inv_0051_blur.jpg`, `inv_0051_shake.jpg`, `inv_0051_dark.jpg` and `inv_0051_exif6.jpg`.
  - `expected/<stem>.json`: one file per photo except `not_an_image`, in the format above.
  - `pages/inv_0051_page.jpg`, `pages/inv_0051_page_turned.jpg` and `pages/expected.json` (`{file: {sharpness, light, upsideDown}}`).
  - `crops/inv_0007/<field>.png` (45 crops) and `crops/inv_0007/expected.json` (`{field: {type, text, conf, alts}}`).
- Assets in `modules/scanner/assets/scanner/`, written the way `prototype/android_test/prepare_assets.py` writes them:
  - `inference_latin.onnx`, from `prototype/assets/models/PP-OCRv6_small/rec`;
  - `dict.txt`, "\n"-joined, UTF-8, no trailing newline;
  - `field_map.json`, `{"markers", "fields": [{name, bbox, type}]}` in file order;
  - `form_small.png`, 425×550, INTER_AREA, grey.

- [ ] **Step 1: Write the failing test.** `test_export_core_fixtures.py` is a plain script, following the pattern of `test_photo.py`. It exports into a temporary folder, prints `N/N passed` and exits 1 on any failure. Its named checks:

```python
SAMPLES = ["inv_0001", "inv_0007", "inv_0011", "inv_0017", "inv_0027", "inv_0041", "inv_0051", "inv_0091"]
JAVA_LAPTOP = PROTO / "android_test/app/src/main/assets/samples"     # the readings the Java port matched 243/243
check("assets", model_bytes > 10_000_000 and len(dict_lines) == 98 and len(fmap["fields"]) == 67
      and fmap["markers"]["tl"] == [85.0, 85.0])
check("photos", len(photos) == 15 and len(expected_files) == 14)
check("243 boxes", sum(len(exp(s)["reads"]) for s in SAMPLES) == 243)
check("same as the Java port's laptop readings",
      all({r["name"]: r["text"] for r in exp(s)["reads"]} == java_laptop(s) for s in SAMPLES))
check("turned", exp("inv_0051_turned")["aligned"] and exp("inv_0051_turned")["turned"])
check("blank page", not exp("blank_page")["aligned"] and exp("blank_page")["reads"] == []
      and exp("blank_page")["corners"] is None)
check("exif applied", exp("inv_0051_exif6")["aligned"] and not exp("inv_0051_exif6")["turned"]
      and exp("inv_0051_exif6")["photoSize"] == exp("inv_0051")["photoSize"])
check("crops", len(crops_expected) == 45 and crops_expected["invoice_no"]["text"] == "0007655")
check("pages", pages["inv_0051_page.jpg"]["upsideDown"] is False and pages["inv_0051_page_turned.jpg"]["upsideDown"] is True)
check("app samples", len(list((root / "assets/samples").glob("inv_*.jpg"))) == 8)
```

- [ ] **Step 2: Run it.** From `prototype/benchmark`, run `..\..\.venv\Scripts\python.exe test_export_core_fixtures.py`. Expected: FAIL with `ModuleNotFoundError: export_core_fixtures`.
- [ ] **Step 3: Implement `export(app_root: Path) -> None`.** Mirror `ApproachB.run` (`pipelines.py`), with these differences:
  - **Markers only**: call `Aligner.markers`, then `upright`. Never the ORB fallback, which the core doesn't have.
  - **The cap first**: apply the demo's cap (`MAX_SIDE` 2400, INTER_AREA).
  - **Recognizer**: `TextRecognizer(MODELS/"PP-OCRv6_small"/"rec", threads=4, batch=8, onnx_name="inference_latin.onnx", yml_name="inference_latin.yml")`, with `CHARSETS` and `alts=3` for amount, number and date.
  - **Output values**:
    - corners: `cv2.perspectiveTransform(dst, inv(H))`;
    - reads in field_map order, each with `cropSize`;
    - `blanks = 65 - len(reads)`;
    - sharpness and light unrounded, from `photo_quality.sharpness`/`paper_light` on the final page;
    - `sharpMin` 1.0.
  - **The variants**, made from `inv_0051`:
    - turned: `cv2.rotate` 180°;
    - blur: `GaussianBlur(σ=2)`;
    - shake: `filter2D` with a 1×9 kernel of 1/9;
    - dark: pixels × 0.2;
    - exif6: pixels rotated 90° counter-clockwise, saved with PIL with EXIF Orientation = 6;
    - all JPEG quality 95.
  - **Blank page**: 1700×2200, all 245, PNG.
  - **Not an image**: `b"not a photo\n"`.
  - **Decoded files**: every expected value comes from the saved file read back with `cv2.imread`, so both sides decode the same bytes.
  - **Pages**: the straightened `inv_0051` page, and the same page rotated 180°, as JPEG quality 95.
  - **Crops**: `inv_0007`'s crops as PNG.
  - **App samples**: copy the 8 samples to `assets/samples/`.
  - **README**: write `fixtures/core/README.md`, one paragraph: synthetic data only, plus how to regenerate it.
- [ ] **Step 4: Run the test again.** Expected: `10/10 passed`.
- [ ] **Step 5: Export for real.** Run `..\..\.venv\Scripts\python.exe export_core_fixtures.py` (its `__main__` exports to `<project>/mybizmate-ocr`). Expected: it prints `15 photos, 14 expected, 2 pages, 45 crops`.
- [ ] **Step 6: Commit.** In `mybizmate-ocr/`, run `git add modules/scanner/assets fixtures assets/samples` and `git commit -m "test: scanner assets and core fixtures exported from the Python reference"`. Mention the exporter's path in the message: `prototype/` is not in this repository.

### Task 3: A native module that links OpenCV and ONNX Runtime, with C++ tests on the emulator

**Files:**
- Create (generator): `modules/scanner/` via `npx create-expo-module@58.0.5 scanner --local --name Scanner --package expo.modules.scanner --platform android apple --features Function AsyncFunction --barrel --description "MyBizMate Scan scanner core"`. If it puts the module elsewhere, move it to `modules/scanner/`. Leave its iOS stub as generated.
- Create: `android/CMakeLists.txt`, `android/src/main/cpp/scanner_jni.cpp`, `android/src/main/java/expo/modules/scanner/NativeScanner.kt`, `cpp/CMakeLists.txt`, `cpp/core/info.h/.cpp`, `cpp/tests/{CMakeLists.txt,main.cpp,fixtures.h,fixtures.cpp,test_info.cpp}`, `scripts/core-test.mjs`
- Vendor:
  - `cpp/third_party/nlohmann/json.hpp`, from <https://github.com/nlohmann/json/releases/download/v3.11.3/json.hpp>;
  - `cpp/third_party/doctest/doctest.h`, from <https://raw.githubusercontent.com/doctest/doctest/v2.4.11/doctest/doctest.h>.
- Modify: `modules/scanner/android/build.gradle`, `ScannerModule.kt`, `index.ts`, `app/index.tsx`, `__tests__/home.test.tsx`

**Interfaces:**
- Produces (C++): `namespace mbm { std::string coreInfoJson(); }`, which returns `{"opencv":"5.1.0","onnxruntime":"1.32.0"}` (from `CV_VERSION` and `Ort::GetVersionString()`).
- Produces (build): the static library `scanner_core`, made of every `cpp/core/*.cpp` (`file(GLOB … CONFIGURE_DEPENDS)`). It has public include dirs `cpp/` and `cpp/third_party/`, uses C++17, and links the targets `scanner::opencv` and `scanner::onnxruntime`, which each caller defines.
- Produces (tests):
  - `npm run test:core -- [doctest args]`;
  - in `cpp/tests/fixtures.h`: `const std::string& assetsDir()`, `const std::string& fixturesDir()`, `std::string tmpDir()` (a fresh folder per call), `std::string readText(const std::string&)`, `std::vector<uint8_t> readBytes(const std::string&)`, `nlohmann::json readJson(const std::string&)`.
- Produces (TS): `coreInfo(): { opencv: string; onnxruntime: string }`, exported from `modules/scanner`.

- [ ] **Step 1: Write the failing native test** `cpp/tests/test_info.cpp`:

```cpp
TEST_CASE("core info names the library versions") {
  auto j = nlohmann::json::parse(mbm::coreInfoJson());
  CHECK(j["opencv"] == "5.1.0");
  CHECK(j["onnxruntime"] == "1.32.0");
}
```

- [ ] **Step 2: Write the test build and the runner.**
  - **`cpp/tests/CMakeLists.txt`**:
    - Define `scanner::opencv` as an IMPORTED SHARED library: `${OPENCV_DIR}/prefab/modules/opencv_java5/libs/android.${ANDROID_ABI}/libopencv_java5.so`, with includes from `…/opencv_java5/include`.
    - Define `scanner::onnxruntime`: `${ORT_DIR}/jni/${ANDROID_ABI}/libonnxruntime.so`, with includes from `${ORT_DIR}/headers`.
    - `add_subdirectory(.. core)`, then the executable `scanner_tests` from `*.cpp`.
  - **`main.cpp`**: implements doctest's main. It takes out `--assets=DIR` and `--fixtures=DIR` and passes every other argument to doctest.
  - **`scripts/core-test.mjs`**, in Node with no dependencies, does six things:
    1. Finds the SDK (`ANDROID_HOME`, else `%LOCALAPPDATA%\Android\Sdk`), NDK `28.2.13676358`, `cmake/3.22.1/bin/{cmake,ninja}` and `platform-tools/adb`.
    2. Finds the two AARs under `~/.gradle/caches/modules-2/files-2.1/{org.opencv/opencv/5.1.0,com.microsoft.onnxruntime/onnxruntime-android/1.32.0}/*/`. If they're missing, it exits 1 with "Run `npx expo run:android` once so Gradle downloads OpenCV 5.1.0 and ONNX Runtime 1.32.0".
    3. Extracts each AAR once into `cpp/tests/build/deps/<name>`, with Windows' own `%SystemRoot%\System32\tar.exe -xf`, which reads zip files.
    4. Configures and builds with `-G Ninja -DCMAKE_TOOLCHAIN_FILE=<ndk>/build/cmake/android.toolchain.cmake -DANDROID_ABI=x86_64 -DANDROID_PLATFORM=android-26 -DANDROID_STL=c++_shared -DCMAKE_BUILD_TYPE=Release`.
    5. Requires `adb get-state` to be `device`. Then it pushes the binary and three libraries to `/data/local/tmp/scanner_tests/`: `libopencv_java5.so`, `libonnxruntime.so`, and the NDK's `toolchains/llvm/prebuilt/windows-x86_64/sysroot/usr/lib/x86_64-linux-android/libc++_shared.so`. It also pushes `modules/scanner/assets/scanner` as `assets` and `fixtures/core` as `fixtures`.
    6. Runs `cd /data/local/tmp/scanner_tests && rm -rf tmp && mkdir tmp && LD_LIBRARY_PATH=. ./scanner_tests --assets=assets --fixtures=fixtures <args>`, and exits with its code.
- [ ] **Step 3: Run it.** With the emulator running, run `npm run test:core`. Expected: the build fails because `core/info.h` doesn't exist.
- [ ] **Step 4: Implement the core library.** Write `cpp/CMakeLists.txt` and `cpp/core/info.{h,cpp}`.
- [ ] **Step 5: Run it again.** Run `npm run test:core`. Expected: `[doctest] test cases: 1 | 1 passed`.
- [ ] **Step 6: Wire up the app build.**
  - **`android/build.gradle`**:
    - Add `implementation "org.opencv:opencv:5.1.0"` and `implementation "com.microsoft.onnxruntime:onnxruntime-android:1.32.0"`.
    - Add an `ortAar` configuration with the same AAR (`@aar`), and an `extractOrt` Copy task that takes `headers/**` and `jni/**` into `build/ort`. Make `preBuild` depend on it.
    - Add `buildFeatures { prefab true }`, and `externalNativeBuild { cmake { path "CMakeLists.txt"; version "3.22.1" } }`.
    - Pass the CMake arguments `-DANDROID_STL=c++_shared` and `-DORT_DIR=<build/ort>`.
    - Add `sourceSets.main.assets.srcDirs += ["../assets"]` and `packaging { jniLibs { pickFirsts += ["**/libc++_shared.so"] } }`.
    - Don't hard-code `ndkVersion`. Use the app's (`rootProject.ext.ndkVersion` when set), so `libc++_shared.so` matches React Native's.
  - **`android/CMakeLists.txt`**:
    - `find_package(OpenCV REQUIRED CONFIG)`.
    - `scanner::opencv`: an INTERFACE IMPORTED target that links `OpenCV::opencv_java5`.
    - `scanner::onnxruntime`: an IMPORTED SHARED target from `ORT_DIR`.
    - `add_subdirectory(../cpp …)`, then the shared library `scanner` from `scanner_jni.cpp`, linking `scanner_core` and `log`.
  - **JNI**: `Java_expo_modules_scanner_NativeScanner_coreInfo` returns `mbm::coreInfoJson()`.
  - **`NativeScanner.kt`**: `internal object NativeScanner { init { System.loadLibrary("scanner") }; external fun coreInfo(): String }`.
  - **`ScannerModule.kt`**: `Name("Scanner")` and `Function("coreInfo") { NativeScanner.coreInfo() }`.
  - **`index.ts`**: exports `coreInfo()`, which parses the JSON.
- [ ] **Step 7: Write the failing jest test.** In `__tests__/home.test.tsx`, add `jest.mock('../modules/scanner', () => ({ coreInfo: () => ({ opencv: '5.1.0', onnxruntime: '1.32.0' }) }))`, and the test `home shows the core's libraries`, which expects the text `OpenCV 5.1.0 · ONNX Runtime 1.32.0`. Run `npm test`. Expected: FAIL.
- [ ] **Step 8: Show the versions on Home.** Add that line to Home as a small footer. Run `npm test`. Expected: PASS (2 tests).
- [ ] **Step 9: Check on the emulator.** Run `npx expo run:android`, then dump the screen as in Task 1 and grep `ONNX Runtime 1.32.0`. Expected: `1`.
- [ ] **Step 10: Commit.** Run `git commit -m "feat: scanner module links OpenCV 5.1.0 and ONNX Runtime 1.32.0; C++ tests on the emulator"`.

### Task 4: The form template and the photo measures

**Files:**
- Create: `cpp/core/form_template.{h,cpp}`, `cpp/core/photo_quality.{h,cpp}`, `cpp/tests/test_form_template.cpp`, `cpp/tests/test_photo_quality.cpp`

**Interfaces:**
- Produces:

```cpp
namespace mbm {
constexpr int PAGE_W = 1700, PAGE_H = 2200;
struct Field { std::string name, type; cv::Rect box; };       // box from bbox [x0, y0, x1, y1]
struct FormTemplate {
  std::array<cv::Point2f, 4> markers;                          // tl, tr, br, bl on the page
  std::vector<Field> fields;                                   // file order
  static FormTemplate parse(const std::string& fieldMapJson);
};
namespace quality {
constexpr double SALES_SHARP_MIN = 1.0, SALES_LIVE_MIN = 1.2, DARK_MAX = 50, TURN_MARGIN = 0.15;
double sharpness(const cv::Mat& gray);
double paperLight(const cv::Mat& gray);
cv::Mat inkMap(const cv::Mat& gray);                // CV_32F 220 x 170, zero mean, unit norm
bool upsideDown(const cv::Mat& gray, const cv::Mat& ref);
double percentile(const cv::Mat& gray8, double q);  // numpy's default linear interpolation
}}
```

- [ ] **Step 1: Write the failing tests.**

```cpp
TEST_CASE("field map parses") {
  auto t = mbm::FormTemplate::parse(readText(assetsDir() + "/field_map.json"));
  CHECK(t.fields.size() == 67);
  CHECK(t.markers[0] == cv::Point2f(85, 85));  CHECK(t.markers[2] == cv::Point2f(1615, 2115));
  CHECK(t.fields[0].name == "invoice_no");     CHECK(t.fields[0].box == cv::Rect(1240, 200, 310, 52));
  CHECK(std::count_if(t.fields.begin(), t.fields.end(), [](auto& f) { return f.type == "checkbox"; }) == 2);
}
TEST_CASE("percentile matches numpy") {
  cv::Mat m = (cv::Mat_<uint8_t>(2, 2) << 0, 10, 20, 30);
  CHECK(mbm::quality::percentile(m, 90) == doctest::Approx(27.0));
}
TEST_CASE("page measures match the Python") {   // each entry of fixtures/core/pages/expected.json
  // gray = imread(page, IMREAD_GRAYSCALE); ref = inkMap(imread(assets/form_small.png, IMREAD_GRAYSCALE))
  CHECK(sharpness(gray) == doctest::Approx(exp["sharpness"]).epsilon(0.01));
  CHECK(std::abs(paperLight(gray) - double(exp["light"])) <= 1.0);
  CHECK(upsideDown(gray, ref) == bool(exp["upsideDown"]));
}
```

- [ ] **Step 2: Run them.** Run `npm run test:core`. Expected: the build fails (the headers are missing).
- [ ] **Step 3: Implement.**
  - Port `PhotoQuality.java` (`sharpness`, `paperLight`, `inkMap`, `upsideDown`) and `OcrEngine.percentile`/`kth`; `prototype/benchmark/photo_quality.py` is the arbiter.
  - `FormTemplate::parse` reads the ordered field_map format from Task 2, with nlohmann/json.
- [ ] **Step 4: Run them again.** Run `npm run test:core`. Expected: every test case passes.
- [ ] **Step 5: Commit.** Run `git commit -m "feat(core): form template and photo measures"`.

### Task 5: Finding the corner squares and cutting the boxes

**Files:**
- Create: `cpp/core/align.{h,cpp}`, `cpp/core/crop.{h,cpp}`, `cpp/tests/test_align_crop.cpp`

**Interfaces:**
- Consumes: `FormTemplate`, `quality::percentile` (Task 4).
- Produces:

```cpp
namespace mbm {
std::optional<cv::Mat> findMarkers(const cv::Mat& gray, const FormTemplate& form);   // photo -> page homography, 3x3 CV_64F
std::array<cv::Point2f, 4> photoCorners(const cv::Mat& H, const FormTemplate& form); // tl, tr, br, bl in photo pixels
std::optional<cv::Mat> cropField(const cv::Mat& pageBgr, const cv::Rect& box, int inset); // nullopt: no writing
double inkRatio(const cv::Mat& pageBgr, const cv::Rect& box, int inset);                  // checkboxes
}
```

- [ ] **Step 1: Write the failing tests.** Each loads its photo with `cv::imread(path, cv::IMREAD_COLOR)`; all of them are under 2400 px.
  - `corners match the Python`: for the 8 samples and `inv_0051_exif6`, `findMarkers` succeeds and every corner is within 0.5 px of `expected["corners"]`.
  - `no form, no corners`: `findMarkers` on `blank_page.png` is `nullopt`.
  - `crops match the Python`:
    - For `inv_0007`, warp to 1700×2200 (INTER_LINEAR) and cut every non-checkbox field with inset 6.
    - The set of fields that come back non-empty equals the names in `expected/inv_0007.json`'s reads.
    - Each `cropSize` is within ±2 px of the expected one. Pixel rounding between builds can move a stroke's edge by one pixel; the readings themselves must still match exactly (Task 7).
  - `terms tick matches`: for the 8 samples, the terms rule gives `expected["terms"]`. The rule: `inkRatio` with inset 3 on `terms_cash` and `terms_account`; `null` when the larger is under 0.04 or they differ by less than 0.02; otherwise the larger one.
- [ ] **Step 2: Run them.** Run `npm run test:core -- -tc="*corner*,*crop*,*terms*,*no form*"`. Expected: the build fails.
- [ ] **Step 3: Implement.** Port `OcrEngine.markers`, `f32`, `convex`, `cropField` and `inkRatio` (`OcrEngine.java` lines 502-648). Three details the signatures don't settle:
  - The Python keeps the corners as float32 (`f32`).
  - Where several points tie, the first one in contour order wins (numpy argmin/argmax).
  - `#include <opencv2/opencv.hpp>`: OpenCV 5 moved the contour functions into its `geometry` module.
- [ ] **Step 4: Run them again.** Same command. Expected: all pass.
- [ ] **Step 5: Commit.** Run `git commit -m "feat(core): corner squares and box cutting"`.

### Task 6: The recognizer

**Files:**
- Create: `cpp/core/recognizer.{h,cpp}`, `cpp/tests/test_recognizer.cpp`

**Interfaces:**
- Produces:

```cpp
namespace mbm {
struct Reading { std::string text; float conf = 0; std::vector<std::string> alts; };  // alts: most likely first
int altsFor(const std::string& type);   // 3 for amount, number, date; 0 otherwise
class Recognizer {
 public:
  Recognizer(const std::vector<uint8_t>& onnxModel, const std::string& dictText, int threads);
  std::vector<Reading> recognize(const std::vector<cv::Mat>& bgrCrops, const std::string& type, int nAlts);
  size_t charCount() const;             // "<blank>" + dict + " "
};
}
```

- **Character sets, exact**:
  - `printed_digits` = `0123456789`;
  - `date` = digits + `/-., ` + `A–Z a–z`;
  - `tin` = digits + `-`;
  - `amount` = digits + `,.P`;
  - `number` = digits + `,./ ` (with a space);
  - `text` = ASCII 32–126 + `ÑñÉé`.

  The Service Invoice's `date_digits` comes in milestone 2. Sets are compared as UTF-8 characters, not bytes.

- [ ] **Step 1: Write the failing tests.**

```cpp
TEST_CASE("recognizer has 100 classes")  { CHECK(rec.charCount() == 100); }
TEST_CASE("readings match the Python on inv_0007's crops") {
  // for each entry of fixtures/core/crops/inv_0007/expected.json, grouped by type, read with altsFor(type):
  CHECK(r.text == exp["text"]);
  CHECK(r.alts == exp["alts"].get<std::vector<std::string>>());
  CHECK(std::abs(r.conf - float(exp["conf"])) <= 0.002f);
  // and the anchors: invoice_no "0007655", date "Sep 20, 2026", item4_description "Egqs"
}
TEST_CASE("no crops, no work") { CHECK(rec.recognize({}, "text", 0).empty()); }
```

- [ ] **Step 2: Run them.** Run `npm run test:core -- -tc="*recogni*,*crops*"`. Expected: the build fails.
- [ ] **Step 3: Implement.** Port `OcrEngine.recognize` and `decode` (lines 672-784); the Python `TextRecognizer.__call__`/`_decode` (`ocr_engine.py`) is the arbiter.
  - **The ONNX Runtime session**: built from the model bytes, with intra-op threads = `threads`, inter-op 1, sequential execution and `ORT_ENABLE_ALL`.
  - **Dictionary**: when a character appears twice, the later index wins.
  - **Preprocessing**:
    - Batches of 8, in order of width/height ratio, with `std::stable_sort` (as everywhere the Python uses `sorted`).
    - Batch width `int(48 * max(320/48, the batch's largest ratio))`.
    - Each crop resized to `(min(width, ceil(48 * ratio)), 48)` with INTER_LINEAR, values `(v/255 − 0.5)/0.5` in BGR order, zero padding on the right.
  - **Decoding**: restricted to the set's columns, blank first, then ascending dictionary index. On ties, the first maximum wins.
- [ ] **Step 4: Run them again.** Same command. Expected: all pass.
- [ ] **Step 5: Commit.** Run `git commit -m "feat(core): recognizer with per-box character sets and backup readings"`.

### Task 7: `Scanner::scanPhoto` and parity with the Python

**Files:**
- Create: `cpp/core/scanner.{h,cpp}`, `cpp/core/result_json.{h,cpp}`, `cpp/tests/test_scanner.cpp`

**Interfaces:**
- Consumes: Tasks 4–6.
- Produces:

```cpp
namespace mbm {
constexpr int MAX_SIDE = 2400, PAGE_SHOW = 1200;
struct Assets { std::vector<uint8_t> model; std::string dict, fieldMap; std::vector<uint8_t> formPng; int threads = 4; };
struct BoxRead { std::string name, type, text; float conf = 0; std::vector<std::string> alts; cv::Size cropSize; std::string cropFile; };
struct Timing { double alignMs = 0, cropMs = 0, readMs = 0, totalMs = 0; };
struct ScanResult {
  bool aligned = false; std::string form; cv::Size photoSize; bool turned = false;
  std::array<cv::Point2f, 4> corners{}; double sharpness = 0, sharpMin = 0, light = 0;
  std::optional<std::string> terms; int blanks = 0; std::vector<BoxRead> reads; std::string pageFile; Timing timing;
};
struct UnreadableImage : std::runtime_error { using std::runtime_error::runtime_error; };
cv::Mat decodePhoto(const std::string& path);  // IMREAD_COLOR (applies EXIF); long side capped at MAX_SIDE, INTER_AREA,
                                               // std::lround sizes; throws UnreadableImage when empty
class Scanner {
 public:
  explicit Scanner(const Assets& assets);
  ScanResult scanPhoto(const std::string& photoPath, const std::string& outDir);  // decodePhoto + scanImage
  ScanResult scanImage(const cv::Mat& bgr, const std::string& outDir);
};
std::string toJson(const ScanResult& r);       // the contract at the top of this plan
}
```

- **What `scanImage` does**: `OcrEngine.scan` (lines 244-323) for the Sales Invoice only.
  - The page is warped to 1700×2200 with INTER_LINEAR. An upside-down page is turned 180°. The page is measured, with `sharpMin` 1.0.
  - Checkboxes use inset 3; other boxes are cut with inset 6, and an empty box counts as a blank.
  - Boxes are read by type, in the order each type first appears; reads are stored in field order.
- **Files it writes**:
  - `outDir/page.jpg`: at most 1200 px wide, INTER_AREA, JPEG quality 90;
  - `outDir/<name>.png`: one per read.
- **Its folder**: `outDir` is created with `std::filesystem::create_directories`.
- **One scan at a time**: a `std::mutex` makes scans wait for each other.

- [ ] **Step 1: Write the failing tests** in `test_scanner.cpp`:
  - `parity on every fixture photo`: for each `expected/*.json`, scan `photos/<photo>` into `tmpDir()`, then check:
    - `aligned`, `form`, `photoSize`, `turned`, `terms` and `blanks` are equal;
    - corners are within 0.5 px, sharpness within 1% relative, light within 1.0;
    - read names are equal and in the same order;
    - texts and `alts` are equal;
    - `conf` is within 0.002.
  - `the 8 samples read 243 boxes`: the sum of `reads.size()` over the samples is 243.
  - `exif photo reads upright`: for `inv_0051_exif6.jpg`, `turned` is false and `photoSize` equals `inv_0051`'s.
  - `unreadable file throws UnreadableImage`: `CHECK_THROWS_AS(s.scanPhoto(fixturesDir() + "/photos/not_an_image.jpg", tmpDir()), mbm::UnreadableImage)`.
  - `large photo is capped`: `inv_0007` scaled ×3.5 (INTER_LINEAR) and written as a temporary JPEG gives `max(photoSize) == 2400`, `aligned`, and `reads.size() >= 40`. The page must still read; exact parity isn't expected at a different scale.
  - `concurrent scans`: two `std::thread`s scan `inv_0007` and `inv_0051` on one `Scanner`. Each text list equals the one from a sequential scan.
  - `writes the page and the crops`: after scanning `inv_0007`, `page.jpg` is 1200×1553, and every read's `cropFile` exists with its `cropSize`.
  - `json follows the contract`: for `inv_0007`, every key of the contract is present. For `blank_page`, `form`, `corners`, `sharpness`, `sharpMin`, `light` and `pageFile` are `null`, and `reads` is `[]`.
- [ ] **Step 2: Run them.** Run `npm run test:core -- -tc="*parity*,*243*,*exif*,*unreadable*,*large*,*concurrent*,*writes*,*json*"`. Expected: the build fails.
- [ ] **Step 3: Implement `scanner.cpp` and `result_json.cpp`.**
- [ ] **Step 4: Run all the core tests.** Run `npm run test:core`. Expected: every test case passes. Paste the doctest summary line into the commit message.
- [ ] **Step 5: Commit.** Run `git commit -m "feat(core): scanPhoto with parity to the Python on 14 fixture photos"`.

### Task 8: The Kotlin/JNI bridge and the TypeScript API

**Files:**
- Modify: `scanner_jni.cpp`, `NativeScanner.kt`, `ScannerModule.kt`, `modules/scanner/index.ts`, `app/_layout.tsx`
- Create: `modules/scanner/src/types.ts`, `modules/scanner/src/parse.ts`, `__tests__/scanResult.test.ts`

**Interfaces:**
- Consumes: `mbm::Scanner`, `mbm::toJson`, `mbm::UnreadableImage` (Task 7).
- Produces (JNI and Kotlin, on `NativeScanner`):
  - `external fun create(model: ByteArray, dict: String, fieldMap: String, formPng: ByteArray, threads: Int): Long`;
  - `external fun scanPhoto(handle: Long, path: String, outDir: String): String`. An `UnreadableImage` becomes `java.io.IOException("unreadable_image")`, and any other `std::exception` becomes `RuntimeException(what())`;
  - `external fun destroy(handle: Long)`.
- Produces (TS, from `modules/scanner`):
  - `type FieldType = 'printed_digits' | 'date' | 'tin' | 'amount' | 'number' | 'text'`;
  - `type BoxRead = { name: string; type: FieldType; text: string; conf: number; alts: string[]; cropSize: [number, number]; cropUri: string }`;
  - `type ScanResult = { aligned: boolean; form: 'sales_invoice' | null; photoSize: [number, number]; turned: boolean; corners: [number, number][] | null; sharpness: number | null; sharpMin: number | null; light: number | null; terms: 'cash' | 'account' | null; blanks: number; reads: BoxRead[]; pageUri: string | null; timing: { alignMs: number; cropMs: number; readMs: number; totalMs: number } }`;
  - `parseScanResult(json: string): ScanResult`, which turns the paths into `file://` URIs;
  - `preload(): Promise<void>`;
  - `scanPhoto(uri: string): Promise<ScanResult>`, which rejects with code `ERR_UNREADABLE_IMAGE` and the message `This file isn't a photo the scanner can open.`.

- [ ] **Step 1: Write the failing test** `__tests__/scanResult.test.ts`:
  - `parses a read scan`: build the JSON from `fixtures/core/expected/inv_0007.json`, adding the paths `/data/x/page.jpg` and `/data/x/<name>.png` and a zero `timing`. Then `reads[0].name === 'invoice_no'`, `reads[0].text === '0007655'`, `reads[0].cropUri === 'file:///data/x/invoice_no.png'`, and `pageUri === 'file:///data/x/page.jpg'`.
  - `parses a scan that found no form`: from `expected/blank_page.json`, `aligned === false`, `reads` is `[]` and `pageUri === null`.
- [ ] **Step 2: Run it.** Run `npm test -- scanResult`. Expected: FAIL, because `parseScanResult` doesn't exist.
- [ ] **Step 3: Implement the types and the parser.** Write `types.ts` and `parse.ts`, and export them from `index.ts`. Run `npm test -- scanResult`. Expected: PASS.
- [ ] **Step 4: Implement the bridge.**
  - **JNI**: `create`, `scanPhoto` and `destroy`.
  - **`ScannerModule.kt`**:
    - **The scanner**: one, created lazily under a lock from `assets.open("scanner/…")` with 4 threads, and destroyed in `OnDestroy`.
    - **`AsyncFunction("preload")`**: creates the scanner.
    - **`AsyncFunction("scanPhoto") { uri: String -> … }`**:
      - **Input**: a `file://` path is used as is; a `content://` URI is first copied into the cache.
      - **Output folder**: `cacheDir/scans/<System.currentTimeMillis()>`.
      - **Unreadable photo**: on `IOException("unreadable_image")`, decode the photo with `BitmapFactory.decodeFile` (HEIC on Android 9 and later), save it as `outDir/photo.png`, and scan that. If `BitmapFactory` also returns `null`, throw `CodedException("ERR_UNREADABLE_IMAGE", "This file isn't a photo the scanner can open.", null)`.
      - **Cleanup**: afterwards, keep only the 10 newest folders under `cacheDir/scans`.
  - **`app/_layout.tsx`**: calls `preload()` once and logs `scanner ready in N ms`.
- [ ] **Step 5: Check on the emulator.** Run `npx expo run:android`. Expected: the app starts, and the Metro log shows `scanner ready in` followed by a number.
- [ ] **Step 6: Commit.** Run `git commit -m "feat: scanPhoto bridge (JNI, Kotlin, TypeScript) with the HEIC fallback"`.

### Task 9: The Home and Result screens

**Files:**
- Create: `lib/samples.ts`, `lib/scans.ts`, `app/result.tsx`, `__tests__/result.test.tsx`, `README.md`
- Modify: `app/index.tsx`, `__tests__/home.test.tsx`

**Interfaces:**
- Consumes: `scanPhoto`, `ScanResult`, `parseScanResult` (Task 8).
- Produces:
  - `SAMPLES: { id: string; label: string; source: number }[]`, with labels `Sample 0001`, …, `Sample 0091`, each `id` with `inv_` replaced by `Sample `;
  - `sampleUri(id: string): Promise<string>`, through `expo-asset` (`downloadAsync`, then `localUri`);
  - `addScan(label: string, result: ScanResult): string`;
  - `getScan(id: string): { id: string; label: string; result: ScanResult } | undefined`;
  - the route `/result?id=<id>`.

- [ ] **Step 1: Write the failing tests.** Mock `expo-router`, `expo-image-picker`, `expo-asset` and `../modules/scanner`.
  - `home lists the 8 samples`: `getByText('Sample 0001')` through `getByText('Sample 0091')`.
  - `a sample is read and shown`: pressing `Sample 0007` calls `scanPhoto` with that sample's URI, then `router.push('/result?id=…')`.
  - `buttons wait while reading`: with `scanPhoto` pending, `Reading…` is shown and `Choose from gallery` is disabled.
  - `an unreadable photo says so`: when `scanPhoto` rejects with `{ code: 'ERR_UNREADABLE_IMAGE' }`, `Alert.alert` is called with `("Can't open this photo", "This file isn't a photo the scanner can open.")`.
  - `result without a form`: a stored scan from `expected/blank_page.json` shows `Couldn't find the form` and the hint `Make sure the whole invoice and its 4 corner squares are in the photo.`.
  - `result with readings`: a stored scan from `expected/inv_0007.json` shows `0007655`, `Sep 20, 2026` and `Egqs`.
- [ ] **Step 2: Run them.** Run `npm test`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement the two screens.**
  - **Home** has three parts:
    - "Choose from gallery": `ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 })`; nothing happens when it's cancelled.
    - The sample list.
    - While reading, a `Reading…` spinner, with both actions disabled.
  - **Result**, when no form was found, shows the heading and the hint above.
  - **Result**, when a form was found, shows:
    - the page image;
    - "MyBizMate Sales Invoice", and "Turned the right way up" when `turned`;
    - "Read in {Math.round(totalMs)} ms";
    - then, for each read, its crop, its name, its text, `{Math.round(conf * 100)}%` and `Backup: a, b` when there are backup readings.
- [ ] **Step 4: Run them again.** Run `npm test`. Expected: all pass.
- [ ] **Step 5: Check on the emulator.**
  1. Run `npx expo run:android`. Tap `Sample 0007`, then dump the screen. Expected: it contains `0007655` and `Egqs`.
  2. Load the sideways photo into the gallery:
     - `adb push fixtures/core/photos/inv_0051_exif6.jpg /sdcard/Download/`
     - `adb shell content call --uri content://media --method scan_volume --arg external_primary`
  3. In the app, choose that photo from the gallery. Expected: the invoice number equals `invoice_no` in `fixtures/core/expected/inv_0051_exif6.json`.
- [ ] **Step 6: Write `README.md`.** It covers how to:
  - start the emulator;
  - run `npx expo run:android`;
  - run `npm test` and `npm run test:core`;
  - re-export the fixtures from `prototype/benchmark`.
- [ ] **Step 7: Commit.** Run `git commit -m "feat: Home and Result screens read a gallery photo or a sample"`.
