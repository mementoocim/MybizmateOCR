# MyBizMate Scan

The MyBizMate Scan app: an Expo (React Native) app that reads handwritten MyBizMate Sales Invoices on the phone,
offline. Its scanner is one C++ core (OpenCV 5.1.0 and ONNX Runtime 1.32.0, PP-OCRv6 small cut to 98 Latin
characters) inside a local Expo module, so Android and iPhone will read a photo the same way.

- Design: `../docs/2026-11-19-expo-scanner-design.md`
- This milestone's plan: `../docs/superpowers/plans/2026-11-19-scanner-m1-core-reads-a-photo.md`
- The Python reference the core is checked against: `../prototype/benchmark/`

Milestone 1 (this state): pick a photo from the gallery, or one of the 8 sample invoices, and see every box's
reading, its confidence, its backup readings and its crop.

## Run it on the Android emulator

Expo Go can't run this app (it has native code); it uses a development build.

1. Start the emulator:
   `%LOCALAPPDATA%\Android\Sdk\emulator\emulator.exe -avd Medium_Phone_API_36.1 -no-snapshot-load -no-boot-anim`
2. Build, install and open the app (the first build takes several minutes):
   `npx expo run:android` with `JAVA_HOME` set to Android Studio's JDK (`C:\Program Files\Android\Android Studio\jbr`).

The debug APK is about 224 MB (the full OpenCV and ONNX Runtime). Android wants that much plus about 500 MB free
on the emulator; if an install fails with `INSUFFICIENT_STORAGE`, uninstall the old build first
(`adb uninstall com.mybizmate.scan`) and remove the core tests' files (`adb shell rm -rf /data/local/tmp/scanner_tests`).

On Windows, `plugins/with-windows-native-paths.js` keeps the native builds under Windows' 260-character path
limit: it moves each library's CMake build folder to `%LOCALAPPDATA%\mbs-cxx` (a build cache that can be deleted
any time).

## Tests

- `npm test`: the screens and the TypeScript side (jest).
- `npm run test:core`: the C++ core's tests (doctest). They are built for the x86_64 emulator with NDK 28.2 and run
  there (the emulator must be running). Pass doctest arguments after `--`, for example
  `npm run test:core -- -tc="*parity*"`. They compare the core with the Python on every fixture photo.
- `npx tsc --noEmit`: the typecheck.

## Fixtures and assets

`fixtures/core/`, `modules/scanner/assets/scanner/` and `assets/samples/` are written by the Python reference:
from `../prototype/benchmark`, run `..\..\.venv\Scripts\python.exe export_core_fixtures.py` (its test:
`test_export_core_fixtures.py`). They are synthetic: no client data.
