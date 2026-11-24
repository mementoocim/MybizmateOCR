### Task 1: The camera keeps shooting (native), 100 scans, and the checks counter

**Files:**
- Modify: `modules/scanner/android/src/main/java/expo/modules/scanner/AutoCapture.kt`
- Modify: `modules/scanner/android/src/main/java/expo/modules/scanner/ScannerCameraView.kt` (both `onPhoto(...)` calls, :277 and :293; `analyze` :230-245; the test image's check :338-345)
- Modify: `modules/scanner/android/src/main/java/expo/modules/scanner/ScannerModule.kt` (`scan` :149, `readPdf` :241, `keepNewest`'s comment :375, `KEEP_SCANS` :385)
- Create: `modules/scanner/android/src/main/java/expo/modules/scanner/CheckRate.kt`
- Test: `modules/scanner/android/src/test/java/expo/modules/scanner/AutoCaptureTest.kt`, `.../CheckRateTest.kt` (new)
- Modify: `modules/scanner/src/ScannerCameraView.tsx:10`, `lib/cameraCopy.ts:13-18`, `lib/scans.ts:9-13,82` (and the comments there that say 20)
- Test: `__tests__/scans.test.ts:32`, `__tests__/camera.test.tsx:145-152`

**Interfaces:**
- Produces:

```kotlin
internal enum class CameraStatus { LOOKING, HOLDING, BLURRY, FOUND, CAPTURE, TAKEN } // TAKEN goes to TypeScript as "taken"
internal class AutoCapture(/* shift, holdMs, minFrames, sharpWaitMs as today */ private val clearMs: Long = 500) {
  fun photoTaken() // the photo went to TypeScript: Auto takes no other until no outline has shown for clearMs
  fun reset()      // the hold starts over; a photo's wait stays, so a stop and start never retakes the sheet in view
}
internal class CheckRate(private val windowMs: Long = 1000) {
  fun onCheck(nowMs: Long, reading: Boolean): Pair<Int, Boolean>? // once a window has passed: its checks, and whether a read ran in it
}
// ScannerModule
internal fun reading(): Boolean // a photo or PDF read is under way
```
```ts
// modules/scanner/src/ScannerCameraView.tsx
export type CameraStatus = 'looking' | 'holding' | 'blurry' | 'found' | 'capturing' | 'taken';
// lib/cameraCopy.ts: statusText('taken', form) === 'Taken · put in the next one' (any form)
// lib/scans.ts
export const KEEP = 100; // the scans recent.json keeps, newest first; ScannerModule's KEEP_SCANS is the same number
```

- [ ] **Step 1: Branch.** `git status --short` (expected: empty) and `git rev-parse --short HEAD` (expected: 3720049), then `git switch -c camera-first`.

- [ ] **Step 2: Write the failing Kotlin tests.**

  In `AutoCaptureTest.kt` (keep every existing test):
  - `` `after a photo, the same sheet in view is never taken again` ``:
    - a capture at 800, then `photoTaken()`;
    - `sales()` frames every 100 ms to 10000 all give `TAKEN`, and no `capture`.
  - `` `no outline for 500 ms re-arms it, and the next sheet is taken after its hold` ``:
    - after `photoTaken()`: `null` at 1000 and 1499 give `LOOKING`;
    - `null` at 1500 re-arms it;
    - `sales()` at 1600 gives `HOLDING`, and `capture` comes at 2400 (800 ms and 3 frames, as today).
  - `` `an outline back within 500 ms starts the wait over` ``:
    - after `photoTaken()`: `null` at 1000, `sales()` at 1400 (`TAKEN`), `null` at 1500;
    - `null` at 1999 is still waiting: `sales()` at 2000 gives `TAKEN`.
  - `` `manual mode shows the form found while Auto waits` ``: after `photoTaken()`, `sales()` with `auto = false` gives `FOUND`.
  - `` `a stop keeps the wait, so the sheet still in view isn't taken again` ``: `photoTaken()`, then `reset()`, then `sales()` gives `TAKEN`.

  In `CheckRateTest.kt`:
  - `` `counts each second's checks, and whether a read ran in it` ``:
    - checks at 0, 100, …, 900 with `reading = false`, then one at 1000, which returns `10 to false`;
    - checks to 1900, one of them with `reading = true`; the one at 2000 returns `10 to true`.
  - `` `nothing is reported before a second has passed` ``: checks at 0 to 999 all return `null`.

- [ ] **Step 3: Find the module's Gradle project and run the tests.**
  - From `android/`, with `JAVA_HOME` and `ANDROID_HOME` as README "Reinstalling without losing the app's data" step 1 sets them, run `./gradlew projects`. Expected: `:scanner` is listed (README's Tests section runs `:scanner:testDebugUnitTest`).
  - Then run `./gradlew :scanner:testDebugUnitTest`. Expected: the compile fails (`photoTaken`, `TAKEN` and `CheckRate` are unresolved).

- [ ] **Step 4: Implement.**
  - **`AutoCapture`:** add `private var waiting = false` and `private var clearSince: Long? = null`. `photoTaken()` sets `taken = false`, `waiting = true` and `clearSince = null`, and drops the anchor, form and steady count. `reset()` leaves `waiting` as it is and sets `clearSince = null`. In `onFrame`, after the `taken` check:

    ```kotlin
    if (waiting) {  // a photo went out: the sheet must leave the frame first
      if (d != null) {
        clearSince = null
        return Step(if (auto) CameraStatus.TAKEN else CameraStatus.FOUND, 0f, false)
      }
      val since = clearSince ?: nowMs.also { clearSince = it }
      if (nowMs - since < clearMs) return Step(CameraStatus.LOOKING, 0f, false)
      waiting = false  // gone long enough: look as at the start
      clearSince = null
    }
    ```

  - **`CheckRate`:**
    - its first check starts the window;
    - a check at or past `windowMs` after the window's start returns the window's count and whether any of its checks saw `reading`, then starts a new window counting this check;
    - otherwise it returns `null`.
  - **`ScannerCameraView`:**
    - Right after each `onPhoto(...)` call (the test image's copy and `onImageSaved`), run `synchronized(auto) { auto.photoTaken() }`, `capturing = false` and `lastStatus = null`. The camera stays bound.
    - In `analyze` and in the test image's check, after `detectFrame`:

      ```kotlin
      if (debuggable) rate.onCheck(SystemClock.uptimeMillis(), scannerModule()?.reading() == true)
        ?.let { (n, r) -> Log.d("MbsCheckRate", "form checks/s=$n reading=$r") }
      ```

      These are figures only.
  - **`ScannerModule`:**
    - `const val KEEP_SCANS = 100`, with a comment: Sessions keep 100 unsaved scans, and `lib/scans.ts`'s `KEEP` is the same.
    - An `AtomicInteger` counts reads in flight: up at the start of `scan()` and `readPdf()`, down in a `finally`. `reading()` returns whether it's above 0.

- [ ] **Step 5: Run** `./gradlew :scanner:compileDebugKotlin :scanner:testDebugUnitTest`. Expected: BUILD SUCCESSFUL, with the 32 existing tests and the new ones passing. There's no rebuild or install here: Task 14 does that.

- [ ] **Step 6: Write the failing jest tests.**
  - `__tests__/scans.test.ts`: `'keeps the newest 20, newest first'` becomes `'keeps the newest 100, newest first'`. It adds 101 scans and expects length 100, `[0].label` `'Scan 101'` and `[99].label` `'Scan 2'`.
  - Add to the same file `'the scanner keeps as many scan folders as the app keeps scans'`: read `ScannerModule.kt` with `fs`, match `/const val KEEP_SCANS = ([0-9]+)/`, and expect `Number(m[1])` to be `KEEP`.
  - `__tests__/camera.test.tsx`'s status-text test adds `expect(statusText('taken', 'sales_invoice')).toBe('Taken · put in the next one')`.
  - Run `npx jest __tests__/scans.test.ts __tests__/camera.test.tsx`. Expected: FAIL.

- [ ] **Step 7: Implement.**
  - Export `KEEP = 100`, and change the comments that say 20.
  - Add `'taken'` to `CameraStatus`.
  - `statusText` returns 'Taken · put in the next one' for it.
  - Run `npm test` and the gates. Expected: PASS.

- [ ] **Step 8: Commit** with the message `feat(scanner): the camera keeps shooting: it re-arms after each photo, waits for the sheet to leave, keeps 100 scans, and counts its checks in debug builds`.

---

