# MyBizMate Scan

The MyBizMate Scan app: an Expo (React Native) app that reads handwritten MyBizMate Sales Invoices and Service
Invoices on the phone, offline. Its scanner is one C++ core (OpenCV 5.1.0 and ONNX Runtime 1.32.0, PP-OCRv6 small
cut to 98 Latin characters) inside a local Expo module, so Android and iPhone will read a photo the same way.

- Design: `../docs/2026-11-19-expo-scanner-design.md`
- Plans: milestone 1, `../docs/superpowers/plans/2026-11-19-scanner-m1-core-reads-a-photo.md`; milestone 2,
  `../docs/superpowers/plans/2026-11-20-scanner-m2-camera-and-both-forms.md`
- The Python reference the core is checked against: `../prototype/benchmark/`

## What it does (milestone 2)

- **The camera:** the live picture in 3:4 with the form's outline (the Sales Invoice by its 4 corner squares, the
  Service Invoice by its table), a status line ("MyBizMate Sales Invoice · hold still"), and the photo taken by
  itself once the outline holds still and sharp. Manual mode, the torch on phones that have one, the gallery from
  the camera, and the phone's own camera app when the scanner's camera can't be used (no permission, or a camera
  that won't start).
- **Both forms:** the Sales Invoice and the Service Invoice, every box read, with its crop, confidence and backup
  readings.
- **The photo checks:** a dark or blurry photo is said before the boxes, with a retake; a photo where no form is
  found says what to get in the picture. Turned and sideways photos are read upright.
- **The scan view:** the straightened page as Enhanced, B&W or the Original photo with the found outline; Save puts
  the page in Pictures/MyBizMate Scan.
- **Recent scans:** the newest 6, kept on the phone between launches; each opens its result again.
- **Samples:** 8 synthetic sample invoices to try without a form.
- **Brand splash:** the logo while the scanner loads and reads one sample, so the first real scan is quick.
- **Privacy:** nothing leaves the phone and nothing is logged. The app's files are kept out of Android's backups. A
  camera photo, or the gallery's copy of one, is deleted once read, whether or not it could be; any left by a closed
  app are cleared at the next start. Each kept scan's files (its page, crops and original) live in the app's own
  storage, the newest 6 only. A JPEG over twice the 2400 px cap is decoded smaller first, so a 50 MP photo doesn't
  need 150 MB.

## Team builds

Debug builds are team builds. A release is a client build unless it's built with `EXPO_PUBLIC_TEAM_BUILD=1`:

- client: no ⋮ menu on Home;
- team: Home's ⋮ menu has the **Speed test** (also at `mybizmatescan://speed`, on any build), and the Result's
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

## Measured

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
team release: the speed test's numbers (the design's target is under 3 s from photo to result), peak memory after a
50 MP gallery photo (and a HEIC one if the phone takes them), and the live camera on a printed form: the outline,
the automatic photo, the torch and Manual mode.

## Fixtures and assets

`fixtures/core/`, `modules/scanner/assets/scanner/` and `assets/samples/` are written by the Python reference:
from `../prototype/benchmark`, run `..\..\.venv\Scripts\python.exe export_core_fixtures.py` (its test:
`test_export_core_fixtures.py`). The Service Invoice photos come from `synth_service_invoice.py`. They are
synthetic: no client data.
