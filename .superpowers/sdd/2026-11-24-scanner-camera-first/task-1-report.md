# Task 1 report: the camera keeps shooting (native), 100 scans, and the checks counter

**Status:** DONE_WITH_CONCERNS. The concerns are notes for later tasks; none blocks this one.

**Commit:** `a57b683 feat(scanner): the camera keeps shooting: it re-arms after each photo, waits for the sheet to leave, keeps 100 scans, and counts its checks in debug builds`, on `camera-first`, on top of 3720049. It isn't pushed.

Step 1: `git branch --show-current` printed `camera-first`, `git rev-parse --short HEAD` printed `3720049`, and `git status --short` was empty. The branch wasn't created again.

## What I implemented

**`AutoCapture.kt`**
- `CameraStatus` gains `TAKEN`. `setStatus` already lowercases every name except `CAPTURE`, so TypeScript gets `"taken"` with no mapping.
- The constructor gains `clearMs: Long = 500`. The class has two new fields: `waiting` and `clearSince: Long?`.
- `onFrame` runs the brief's `if (waiting)` block right after the `taken` check:
  - an outline in view resets `clearSince`, and gives `TAKEN` in Auto or `FOUND` in manual (held 0, no capture);
  - no outline gives `LOOKING` until `clearMs` has passed since the first frame with none;
  - after that, it clears `waiting` and looks as at the start.
- `photoTaken()` runs `reset()`, then sets `waiting = true`. So it clears `taken`, `clearSince`, the anchor, the form and the steady count, plus `since`, which changes nothing.
- `reset()` leaves `waiting` alone and now also clears `clearSince`. Time with the camera stopped therefore never counts as time without the sheet.
- The class comment, "After a photo it waits for reset()", now describes `photoTaken()` and the wait.

**`CheckRate.kt` (new), per ruling P-F18**
- `internal data class CheckWindow(val checks: Int, val elapsedMs: Long, val reading: Boolean)`.
- `CheckRate(windowMs = 1000).onCheck(nowMs, reading): CheckWindow?`. The first check starts a window. A check at or past `windowMs` after the window's start returns `CheckWindow(count, nowMs - start, any read seen)`, then starts the next window, counting itself and its own `reading`. Every other check returns `null`.

**`ScannerCameraView.kt`**
- `sendPhoto(file)` replaces both `onPhoto(...)` calls: the test image's copy and `onImageSaved`. It calls `onPhoto`, then `synchronized(auto) { auto.photoTaken() }`, `capturing = false` and `lastStatus = null`. The camera stays bound.
- `countCheck()` runs right after `detectFrame` in `analyze` and in the test image's check. Both run on the single `analysis` executor, so `rate` is only ever touched from that thread.
  - It returns at once unless the build is debuggable.
  - Otherwise it runs `rate.onCheck(SystemClock.uptimeMillis(), scannerModule()?.reading() == true)`.
  - When a window closes, it logs `Log.d("MbsCheckRate", "checks=$checks ms=$elapsedMs reading=$reading")`, which holds figures only.
- `android.util.Log` is imported, and the class comment mentions both re-arming and the counter.

**`ScannerModule.kt`**
- `private val readsInFlight = AtomicInteger()`, and `internal fun reading() = readsInFlight.get() > 0`.
- `useForRead { handle -> }` wraps `scanner.use`: it increments, runs the block, and decrements in `finally`. It's the whole body of `scan()` and `readPdf()`: each one's `= scanner.use { handle ->` became `= useForRead { handle ->`. The count therefore goes up at the very start of each and comes down in a `finally`, even when `scanner.use` itself throws `ScannerClosedException`.
- `KEEP_SCANS = 100`, with the comment "Sessions keep 100 unsaved scans, and lib/scans.ts's KEEP is the same."
- `keepNewest`'s comment no longer says "Recent scans shows 20".

**TypeScript**
- `modules/scanner/src/ScannerCameraView.tsx`: `CameraStatus` gains `'taken'`, and the file comment says what it means.
- `lib/cameraCopy.ts`: `statusText('taken', any form)` returns `'Taken · put in the next one'`. It's checked before the form test, so a null form gives the same words. The bytes are a plain space, `C2 B7` and a plain space, as in the other pill copy (checked with `od -c`).
- `lib/scans.ts`:
  - `export const KEEP = 100`, with a doc comment naming `KEEP_SCANS`;
  - the file comment says 100 for both the list and the folders;
  - `recentScans()`'s doc says "KEEP at most".

## Where I departed from the brief's wording, and why

1. **Three small helpers** stand in for code the brief writes inline: `sendPhoto` (two call sites), `countCheck` (two call sites) and `useForRead` (two functions).
   - Each says once what the brief says twice.
   - Each keeps the brief's order: after `onPhoto`; after `detectFrame`; up at the start, down in `finally`.
   - `useForRead` also avoids re-indenting `scan()` and `readPdf()` (about 50 lines) inside a try block.
2. **The brief's local `val since` became `val gone`.** A local named `since` would shadow the hold's `since` field in the same function.
3. **`photoTaken()` is `reset()` then `waiting = true`.** That is exactly the brief's list, plus zeroing `since`, which is harmless.
4. **Tests added beyond the brief:**
   - `CheckRateTest`'s third test, `a stall is one window as long as the stall`. Without it, nothing pins `elapsedMs` to the window's real length (P-F18's point): a `CheckRate` that always reported `windowMs` would pass the brief's two tests.
   - The stop test also pins that `reset()` clears `clearSince`.
   - The manual-mode test uses the shutter's photo, which is the real manual case, and then checks that Auto still waits.
   - `statusText('taken', null)` pins the interface's "(any form)".
5. **`__tests__/scans.test.ts` flushes in the 100-scan test.** `await flush()` comes right after its 101 `addScan` calls. See "Self-review findings" for why.

## Tests and results

**Kotlin** (`./gradlew :scanner:compileDebugKotlin :scanner:testDebugUnitTest`): BUILD SUCCESSFUL, 40 tests, 0 failures, 0 skipped, and no `e:` or `w:` lines.
- 32 tests existed before, as the brief counts.
- `AutoCaptureTest` has 14: the 9 existing tests pass unchanged, plus 5 new ones:
  - `after a photo, the same sheet in view is never taken again`
  - `no outline for 500 ms re-arms it, and the next sheet is taken after its hold`
  - `an outline back within 500 ms starts the wait over`
  - `manual mode shows the form found while Auto waits`
  - `a stop keeps the wait, so the sheet still in view isn't taken again`
- `CheckRateTest` has 3:
  - `counts each second's checks, and whether a read ran in it` (`CheckWindow(10, 1000, false)`, then `CheckWindow(10, 1000, true)`);
  - `nothing is reported before a second has passed`;
  - `a stall is one window as long as the stall` (`CheckWindow(2, 3500, true)`).
- The other suites' counts are unchanged: DisplayName 3, ImageSizing 7, PdfInput 5, PdfRefusedException 1, PickedAccess 2 and ScannerHolder 5.

**Jest:**
- `__tests__/scans.test.ts`:
  - `keeps the newest 100, newest first` adds 101 scans, then expects length 100, `[0]` 'Scan 101', `[99]` 'Scan 2', the first scan gone and the 101st kept.
  - The new `the scanner keeps as many scan folders as the app keeps scans` reads `ScannerModule.kt` with `fs`, matches `/const val KEEP_SCANS = ([0-9]+)/`, and expects `Number(m?.[1])` to be `KEEP`.
- `__tests__/camera.test.tsx`: `status copy` adds `statusText('taken', 'sales_invoice')` and `statusText('taken', null)`, each expecting `'Taken · put in the next one'`.

## TDD evidence

### Kotlin RED
From `android/`:
```
JAVA_HOME='C:\Program Files\Android\Android Studio\jbr' ANDROID_HOME="$LOCALAPPDATA/Android/Sdk" ./gradlew :scanner:testDebugUnitTest
```
```
> Task :scanner:compileDebugUnitTestKotlin
e: AutoCaptureTest.kt:136:7 Unresolved reference 'photoTaken'.
e: AutoCaptureTest.kt:146:33 Unresolved reference 'TAKEN'.
e: AutoCaptureTest.kt:169:31 Unresolved reference 'TAKEN'.
e: AutoCaptureTest.kt:172:31 Unresolved reference 'TAKEN'.
e: AutoCaptureTest.kt:179:7 Unresolved reference 'photoTaken'.
e: AutoCaptureTest.kt:183:31 Unresolved reference 'TAKEN'.
e: AutoCaptureTest.kt:190:31 Unresolved reference 'TAKEN'.
e: AutoCaptureTest.kt:195:31 Unresolved reference 'TAKEN'.
e: CheckRateTest.kt:10:16 Unresolved reference 'CheckRate'.
e: CheckRateTest.kt:12:18 Unresolved reference 'CheckWindow'.
e: CheckRateTest.kt:14:18 Unresolved reference 'CheckWindow'.
e: CheckRateTest.kt:19:16 Unresolved reference 'CheckRate'.
e: CheckRateTest.kt:25:16 Unresolved reference 'CheckRate'.
e: CheckRateTest.kt:28:18 Unresolved reference 'CheckWindow'.
> Task :scanner:compileDebugUnitTestKotlin FAILED
BUILD FAILED in 16s
```
(The `e:` paths are shortened here; they're under `modules/scanner/android/src/test/java/expo/modules/scanner/`.)

### Kotlin GREEN
From `android/`:
```
JAVA_HOME='C:\Program Files\Android\Android Studio\jbr' ANDROID_HOME="$LOCALAPPDATA/Android/Sdk" ./gradlew :scanner:compileDebugKotlin :scanner:testDebugUnitTest
```
Output: `BUILD SUCCESSFUL in 28s`. The JUnit XML lists 40 tests with 0 failures, by suite as above.

### Proof that the new Kotlin tests catch wrong behaviour
The RED above was a compile error, which shows nothing about what the tests check. So I applied five one-line mutations, one at a time, ran `./gradlew :scanner:testDebugUnitTest --console=plain --no-watch-fs`, and restored the sources after each. The sources were checked byte for byte against a backup with `cmp`, and all the gates ran after the restore. Each mutation failed exactly one test, the one meant for it:

| Mutation | Test that failed (alone) |
|---|---|
| M1: an outline back no longer resets `clearSince` | `an outline back within 500 ms starts the wait over` |
| M2: `reset()` also clears `waiting` | `a stop keeps the wait, so the sheet still in view isn't taken again` |
| M3: re-arm with `<=` instead of `<` | `no outline for 500 ms re-arms it, and the next sheet is taken after its hold` |
| M4: `CheckWindow` reports `windowMs` as `elapsedMs` | `a stall is one window as long as the stall` |
| M5: `reset()` keeps `clearSince` | `a stop keeps the wait, so the sheet still in view isn't taken again` |

Each run printed `40 tests completed, 1 failed`.

A tooling note: my first try at M1 and M2 used `sed` patterns ending in `\r`. Git Bash's sed reads CRLF files with the CR stripped, so those two never applied and the build passed. I re-ran all five as exact string replacements in Node, which keeps the CRLF; those are the results in the table.

### Jest RED
```
npx jest __tests__/scans.test.ts __tests__/camera.test.tsx --ci --reporters=default
```
```
FAIL __tests__/camera.test.tsx
  ● status copy
    Expected: "Taken · put in the next one"
    Received: "MyBizMate Sales Invoiceundefined"
FAIL __tests__/scans.test.ts
  ● keeps the newest 100, newest first
    Expected length: 100
    Received length: 20
  ● the scanner keeps as many scan folders as the app keeps scans
    Expected: undefined
    Received: 100
Test Suites: 2 failed, 2 total
Tests:       3 failed, 35 passed, 38 total
```
The KEEP test got 100 from the Kotlin side because Kotlin had already gone GREEN; `lib/scans.ts` didn't export `KEEP` yet.

### Jest GREEN
Same command:
```
PASS __tests__/scans.test.ts
PASS __tests__/camera.test.tsx
Test Suites: 2 passed, 2 total
Tests:       38 passed, 38 total
```
No console output. `scans.test.ts` alone passed 6 runs out of 6 (12 tests each).

## Gates, run once before the commit
Each was run after the last source change.

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | exit 0, no output |
| `npx expo lint` | exit 0 |
| `npx eslint lib __tests__ test-utils` | exit 0 |
| `npm test` | 75 suites, 704 tests passed |
| `npx jest --ci --reporters=default` | 75 suites, 704 tests passed, with no console, warning or act() lines |
| `./gradlew :scanner:compileDebugKotlin :scanner:testDebugUnitTest` | BUILD SUCCESSFUL, 40 tests, 0 failures |

`noLiterals` and `layers` are in that run and pass.

## Gradle

- **Project:** `:scanner` (`./gradlew projects` lists `project ':scanner' - \..\modules\scanner\android`).
- **Commands:** all run from `mybizmate-ocr/android`, with `JAVA_HOME='C:\Program Files\Android\Android Studio\jbr' ANDROID_HOME="$LOCALAPPDATA/Android/Sdk"`:
  - `./gradlew projects`
  - `./gradlew :scanner:testDebugUnitTest` (RED)
  - `./gradlew :scanner:compileDebugKotlin :scanner:testDebugUnitTest` (GREEN, and the gate)
  - `./gradlew :scanner:testDebugUnitTest --console=plain --no-watch-fs` (the mutation runs)
- **Not done:** nothing under `android/` was edited, there was no prebuild, nothing was assembled or installed, and no emulator was touched. No `--stop` was needed.

## Files changed (11, all in a57b683)
- `modules/scanner/android/src/main/java/expo/modules/scanner/AutoCapture.kt`
- `modules/scanner/android/src/main/java/expo/modules/scanner/CheckRate.kt` (new)
- `modules/scanner/android/src/main/java/expo/modules/scanner/ScannerCameraView.kt`
- `modules/scanner/android/src/main/java/expo/modules/scanner/ScannerModule.kt`
- `modules/scanner/android/src/test/java/expo/modules/scanner/AutoCaptureTest.kt`
- `modules/scanner/android/src/test/java/expo/modules/scanner/CheckRateTest.kt` (new)
- `modules/scanner/src/ScannerCameraView.tsx`
- `lib/cameraCopy.ts`
- `lib/scans.ts`
- `__tests__/scans.test.ts`
- `__tests__/camera.test.tsx`

The new files are CRLF in the working tree, like their neighbours, and LF in the index (`core.autocrlf=true`). `git diff --cached --check` was clean.

## Self-review findings, and what I fixed
- **The test-isolation leak (fixed).**
  - The first jest RED had a fourth, unplanned failure: `edits, checked boxes … come back after a restart`.
  - The cause: the 101 `addScan` calls queue 101 `recent.json` saves. They run as a chain of microtasks in the old module instance, and `memoryFs` keeps its files on `globalThis`. So the chain went on writing after the next test's `beforeEach` had cleared the files, and its last write, full of scans whose folders didn't exist, replaced the restart test's file. The old 21-scan test leaked the same way, but its chain finished in time.
  - The fix: `await flush()` right after the adds, before the assertions, so the chain finishes even when an assertion fails.
- **Renamed the local `since` to `gone`** in `onFrame`, so it no longer shadows the field.
- **Reworded the comment on `clearSince`.**
- **Thread safety:**
  - `rate` is used only on the `analysis` executor, which has one thread.
  - `reading()` reads an `AtomicInteger`.
  - `photoTaken()` and `reset()` run under `synchronized(auto)`, like `onFrame`.
  - `capturing` is `@Volatile`, and `lastStatus` is only used on the main thread.
- **The decrement can't be skipped.** `readPdf()`'s own `catch` turns failures into `PdfRefusedException` inside the block, so the `finally` in `useForRead` still runs, and so it does when `scanner.use` throws before the block.
- **Logs hold figures only:** an Int, a Long and a Boolean. Release builds return before counting.

## Concerns, for the controller
1. **Home's caption is now wrong until Task 12.** `app/index.tsx:150` says "The last 20 scans stay here. Save a scan to keep it.", and `home.test.tsx:384-397` pins that text, but 100 are kept now. Home also renders every recent scan as a row, so up to 100 rows instead of 20. Both last only until Task 12 replaces Home with cards. I didn't touch them: they're outside this task's files.
2. **Other text that still says 20 is left to Task 13,** as the pre-flight scan's row for Task 13 expects:
   - `lib/saved.ts:28` ("which keeps only its newest 20");
   - README lines 42, 100 and 667;
   - the comment at `recentRow.test.tsx:159`.
3. **The camera screen behaves differently until Task 7.**
   - The wait survives a stop and start, by design. So on today's camera screen, a failed read that comes back to the camera with the same sheet in view shows "Taken · put in the next one", and Auto won't take that sheet again until it has been out of view for 0.5 s. The shutter still works. Before, Auto re-held and retook it at once.
   - In the moment between `onPhoto` and TypeScript setting `active=false` for the read, the native side may already send `taken`. The pill could flash it under the reading card.
4. **For Task 14's measurement:**
   - A window that spans a camera stop, such as leaving the tab, is reported when the camera restarts, with the whole gap as its `ms`. It's visible in the line, but totals of checks over time should leave such windows out, or keep the camera live for the whole measurement.
   - `reading` covers only `scan()` and `readPdf()`. The model's first load (`preload`) and `enhance` aren't counted.
5. **The `?test=` hook (dev only):** a still never leaves the frame, so Auto takes it once and then stays at "taken". A `testImage` changed in place also keeps the wait. That matches the pre-flight scan's note for Task 15 (Auto takes the first photo; the middle button takes the other nine).

---

## Fix round 1: Ruling T1-1, an explicit re-arm for a Retake

**Commit:** `54258f9 fix(scanner): the camera can be re-armed for a Retake`, on top of a57b683. It isn't pushed.

### Changes
- **`AutoCapture.kt`**
  - `rearm()` is `reset()` followed by `waiting = false`. It clears the wait (`waiting`, and `clearSince` through `reset()`) and the hold. After `photoTaken()` and then `rearm()`, the sheet held in view is taken again after its normal hold.
  - `reset()` is unchanged, so it still keeps the wait.
  - The class comment adds "A Retake ends that wait (rearm)."
- **`ScannerCameraView.kt`**
  - `fun rearm()` runs `synchronized(auto) { auto.rearm() }`, then `lastStatus = null`, so the next status event is always sent.
  - It runs directly, not through `main.post`. Expo already runs every view `AsyncFunction` on the main queue: `ViewDefinitionBuilder.build()` in expo-modules-core calls `function.runOnQueue(Queues.MAIN)` for each one. A posted call could also be dropped by `stop()`'s `main.removeCallbacksAndMessages(null)`.
  - It leaves `capturing` alone. A photo already in flight still lands, and its `photoTaken()` starts a new wait.
- **`ScannerModule.kt`:** `AsyncFunction("rearm") { view: ScannerCameraView -> view.rearm() }`, next to `takePhoto`.
- **`modules/scanner/src/ScannerCameraView.tsx`**
  - `ScannerCameraRef` is now `{ takePhoto(): Promise<void>; rearm(): Promise<void> }`, with a doc comment.
  - The wrapper forwards `rearm` the way it forwards `takePhoto`.
- **`__tests__/camera.test.tsx`:** this suite's mock of the native camera is the only jest mock of it; test-utils and jestSetup have none. Its ref now lists `rearm: mockRearm` beside `takePhoto`, so it has the type's shape when Task 7 calls it.
- Nothing calls `rearm()` yet.

### Covering tests
- **New in `AutoCaptureTest`:** `rearm clears the wait, so the sheet in view is taken after its hold`.
  - Auto takes a photo at 800, then `photoTaken()`, then `rearm()`.
  - `sales()` every 100 ms from 1000 to 1700 gives HOLDING with no capture.
  - The frame at 1800 captures: 800 ms after the hold began, and well past 3 frames.
- **Still green:** `a stop keeps the wait, so the sheet still in view isn't taken again`, so `reset()` still keeps the wait.
- **The TS wrapper has no jest test of its own,** because `camera.test.tsx` mocks the whole `../modules/scanner`. Following the ruling's "if", I added none. tsc checks the forwarding instead, since the handle must satisfy `ScannerCameraRef` (the type-level RED below).
- `CheckRateTest` is unchanged, as the round asked.

### Commands and output
**Kotlin RED.** From `android/`, with `JAVA_HOME='C:\Program Files\Android\Android Studio\jbr' ANDROID_HOME="$LOCALAPPDATA/Android/Sdk"`:
```
./gradlew :scanner:testDebugUnitTest --console=plain
```
```
> Task :scanner:compileDebugUnitTestKotlin FAILED
e: AutoCaptureTest.kt:201:7 Unresolved reference 'rearm'.
BUILD FAILED in 7s
```

**Kotlin GREEN:**
```
./gradlew :scanner:compileDebugKotlin :scanner:testDebugUnitTest --console=plain
```
```
> Task :scanner:compileDebugKotlin
> Task :scanner:compileDebugUnitTestKotlin
> Task :scanner:testDebugUnitTest
BUILD SUCCESSFUL in 12s
```
The JUnit XML lists 41 tests with 0 failures: `AutoCaptureTest` 15, `CheckRateTest` 3, and the other suites as before.

**Mutation M6:** `rearm()` without `waiting = false`, applied as an exact string replacement, then restored and checked byte for byte with `cmp`. Run with `./gradlew :scanner:testDebugUnitTest --console=plain --no-watch-fs`:
```
AutoCaptureTest > rearm clears the wait, so the sheet in view is taken after its hold FAILED
41 tests completed, 1 failed
```

**TypeScript RED.** I changed the type first, then ran `npx tsc --noEmit`:
```
modules/scanner/src/ScannerCameraView.tsx(38,34): error TS2741: Property 'rearm' is missing in type '{ takePhoto: () => Promise<void>; }' but required in type 'ScannerCameraRef'.
```
**TypeScript GREEN:** after the forwarding line, `npx tsc --noEmit` exits 0.

**Focused jest:** `npx jest __tests__/camera.test.tsx --ci --reporters=default` passes 26 of 26, with no console output.

**Gates.** Each ran once, after the last change. The Gradle gate ran after the mutation's restore.

| Gate | Result |
|---|---|
| `./gradlew :scanner:compileDebugKotlin :scanner:testDebugUnitTest` | BUILD SUCCESSFUL, 41 tests, 0 failures, no `e:` or `w:` lines |
| `npx tsc --noEmit` | exit 0 |
| `npx expo lint` | exit 0 |
| `npx eslint lib __tests__ test-utils` | exit 0 |
| `npm test` | 75 suites, 704 tests passed |
| `npx jest --ci --reporters=default` | 75 suites, 704 tests passed, with no console lines |

### Files changed in 54258f9 (6)
- `modules/scanner/android/src/main/java/expo/modules/scanner/AutoCapture.kt`
- `modules/scanner/android/src/main/java/expo/modules/scanner/ScannerCameraView.kt`
- `modules/scanner/android/src/main/java/expo/modules/scanner/ScannerModule.kt`
- `modules/scanner/android/src/test/java/expo/modules/scanner/AutoCaptureTest.kt`
- `modules/scanner/src/ScannerCameraView.tsx`
- `__tests__/camera.test.tsx`

### Notes
- **My first M6 run didn't apply.** A quoting slip wrote raw newlines into my scratch mutation script, so node refused it and nothing was mutated; `cmp` confirmed the sources were untouched. I rewrote the script and ran M6 again; the result above is from that second run.
- **For Task 7:** call `rearm()` when the camera opens for a Retake. It can come before or after `active` turns true: `setActive(true)` and `stop()` only call `reset()`, which never sets the wait again. Only a photo that lands afterwards starts a new wait.
