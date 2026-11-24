# MyBizMate Scan: camera first, a bottom bar and sessions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After the splash, MyBizMate Scan opens on the camera. A floating bar of five icons (Home, Sessions, Camera, Export, Profile) replaces Home's buttons and menus. A run of photos is a session: each photo is read while the camera stays live, and checking comes after Done. Everything design B built keeps working, and scans from before the update show up as one-scan sessions.

**Architecture:**
- **Navigation:** expo-router 58's own `Tabs` (`expo-router/js-tabs`) in `app/(tabs)/`, with the app's bar (`components/TabBar.tsx`) as its `tabBar`.
  - Sessions and Export are folders with their own Stack, so their inner screens keep the bar.
  - The Scan screen, Your lists, the licenses and the team screens stay in the root Stack, above the tabs.
  - A launch with no link goes to `/camera` (`app/+native-intent.tsx`).
- **Sessions:**
  - A scan carries the id of the session it was taken in. The field is optional, so older scans load as they are.
  - `lib/session.ts` holds the one session the camera continues, in memory and in `session.json`.
  - `lib/captureQueue.ts` keeps photos in `files/queue/<session id>/` and reads them one at a time through today's read path.
  - `lib/sessions.ts` builds Sessions, their counts and their badges from the recent and saved scans. No session file is kept.
- **Native:** the module's camera re-arms after each photo, and Auto waits for the sheet to leave before it takes another. The module keeps 100 scan folders, and debug builds log the camera's form checks per second.
- **Screens:**
  - the camera is today's, with a tray, and the bar's middle button as its shutter;
  - Sessions, and a session screen;
  - the Export tab is today's export sheet as screens, with Saved's list under each kind;
  - Home is cards;
  - Profile is today's Settings.

**Tech Stack:**
- Expo SDK 58, React Native 0.88.1 (Fabric), React 19.3, TypeScript 6.
- expo-router 58.0.32: `expo-router/js-tabs`, its fork of React Navigation's bottom tabs.
- expo-file-system 58, and expo-linking 58, which is already a dependency.
- The scanner module's Kotlin (CameraX), with JUnit 4.
- jest-expo 58, @testing-library/react-native 14 and `expo-router/testing-library`.

**Spec:** `docs/2026-11-24-mybizmate-scan-camera-first-design.md`, approved 2026-11-24. It's called "the spec" below and cited by §.
- It builds on design B (`docs/2026-11-22-mybizmate-scan-ui-ux-design.md`).
- Design B's rulings (`docs/superpowers/plans/2026-11-22-scanner-ui-design-b-rulings.md`) still bind unless the spec overrides them.
- The approved mockup is `.superpowers/brainstorm/570-1795475173/content/nav-camera-first.html`.

Paths in tasks are relative to `mybizmate-ocr/`, unless they start with `docs/` or `.superpowers/`. Those are in the parent folder, outside git.

## Calls this plan makes

The spec leaves these to the builder (§9), or is silent or self-contradictory on them. The plan settles each one as follows. The user can overrule any of them while reviewing.

1. **Opening on the camera.**
   - At launch, expo-router opens `/`, which is Home (`index`, §6.1's name). An anchor only puts a screen under a link; it doesn't change where the app opens.
   - `app/+native-intent.tsx` sends a launch whose link has no route to `/camera`. That covers the app's own root link and a dev-client launch link.
   - Every link with a route (`camera?test=…`, `/speed`, `/training`) keeps it.
   - The Tabs are anchored on `camera` with `backBehavior: 'initialRoute'`. The root Stack is anchored on `(tabs)`: T24-1's anchor moves there.
2. **Done keeps the session's "couldn't be read" entries** for the session screen it opens. They stay until the next session starts, 30 minutes pass or the app restarts; that's when the session closes. §6.3 drops them "when the session closes", and the screen Done opens must still say why.
3. **Retake** makes that session the camera's again.
   - Its next capture (a photo, a gallery pick or a PDF) replaces the unsaved scan once it reads. A read that fails keeps the old scan.
   - The link lives in the session store, not in route params, so leaving the camera and coming back keeps it.
   - A saved scan is never replaced.
4. **What waits where.**
   - Camera, gallery and camera-app photos wait in `files/queue/<session id>/` as `<ms>-<n>-<source>[-test].<ext>`, so a restart knows each one's kind.
   - A PDF waits in memory: it's the person's own file, and it stays on the phone.
   - A Retake's link doesn't survive a restart. The session closes then anyway.
5. **A failed read's words** are plain only, in every build: "It isn't a photo the scanner can open.", a refused PDF's own words (today's), or "The scanner stopped while reading it." The scanner's own message never shows. A picker that fails, or a file that isn't a PDF, isn't a read, so those keep their dialogs.
6. **A "taken" camera status.** While Auto waits for the sheet to leave, the pill says "Taken · put in the next one", not "found · tap the button". That's one more value in the module's status, native and TypeScript.
7. **The tray before the first photo.**
   - The gallery and PDF buttons always sit at its ends, since a session can start with either (§6.3).
   - The middle holds the status pill, today's hint, until the session has a photo.
   - After that, the middle holds the thumbnails and Done · N, and the pill sits above the tray, as in the mockup.
8. **The camera tab:**
   - it has no Close; Back leaves the app;
   - its status bar is light only while it's the tab on top;
   - it starts, and asks for the camera, only once the splash has gone.
9. **"N to check."**
   - On Sessions rows and on Home, it counts every unsaved scan whose form was found, ready or not. That's Home's own definition (§6.5).
   - The session card splits them into "ready" and "to check", and counts failed reads among "to retake".
   - Samples count nowhere.
10. **A scan's badge** is design B's `homeBadge`, except:
    - "Couldn't find the form" reads "Retake";
    - a saved scan reads Saved (success), or Exported (neutral).

    "Changed" and "Can't save yet" stay where design B shows them, though §6.4's list doesn't name them.
11. **A scan with no session id opens its Scan screen** from Sessions and from Home's Check now, not a one-row session screen. Its row reads "<label> <time>", as in "Camera photo 4:10 PM".
12. **A saved scan no longer among the newest 100** joins Sessions through its summary.
    - Its time is the one in its id (scan ids begin with their creation time in ms), else its saved time.
    - Search finds it by party and number. Its TIN isn't in the summary, and the stored formats don't change.
13. **The Export tab is a folder with its own Stack** (`export/index`, `export/[which]`, `export/invoices`), as Sessions is, so Back walks its steps. §6.7 names it `export.tsx`.
    - Its header is the mockup's: "Send to MyBizMate", with "N saved, not sent yet".
    - The header's Back replaces step 2's Close.
    - Each step's buttons sit at its end, not in a pinned bar over the floating one.
    - "See invoices" is a row in each kind's step.
    - With nothing waiting, "Everything is sent" and the last export's date head step 1. The kinds stay, since "All" can still go again (design B's call 13).
14. **View, after a save outside a session,** opens that kind's See invoices in the Export tab, as today's View opened Saved at that kind.
15. **The save's snackbar keeps today's words** ("Saved as a sale", "Changes saved", with no full stop). In a session it has no View.
16. **The Scan screen in a session.**
    - An unsaved scan's Retake opens the camera in that session.
    - The not-found bar is Retake alone; the gallery and the PDF are in the camera's tray.
    - A just-saved scan's primary is Next invoice, or Back to session. A change after the save brings Save changes back.
17. **Profile's fields save as they're typed**, as today. §6.8's "on blur" describes the save loosely, and saving on blur would lose a change made just before Back. Customers and items sits under a "Your lists" strip, after Export defaults.
18. **Home.**
    - The "Take your first photo" card has a line pointing at the round button, and its own "Open the camera".
    - "Last session" shows the newest session with an id, and opens it with "Open the session".
    - Home's footer stays.
    - New copy is quoted in Task 12.
19. **The bar's measures are tokens:** `radius.bar` (20) and a `bar` group in `lib/theme.ts` (circle 60, raise 26, ring 4, dot 5). The inactive icons use `colors.chevron`, 3.74:1 on white. There's no new color.
20. **The new icons** (house, files, send, circle-user) come from Lucide at tag 1.77.0, the app's set, after the user's OK. If that's declined, they're copied from the approved mockup (an older Lucide drawing), and `icons.tsx` says so.
21. **Approach 2 is one switch:** `READ_WHILE_SHOOTING` in `lib/captureQueue.ts`. Task 14 sets it from the measurement. The counter is a debug-only logcat line, `MbsCheckRate`, with figures only.
22. **A tab is opened with `router.navigate`**, never `push`, which would stack a second tab navigator. `useNavigateOnce` runs it once (F-6). The Sessions and Export stacks are anchored on their lists.
23. **A session id** is `<ms>-<4 base-36 characters>`. §9 leaves the format to the builder.
24. **A font-size or display-size change** re-runs the start (README, UI pass, item 10). So it closes an open session, as a restart does.

## Global Constraints

Every task's requirements include these.

**Where and how the work goes in**
- Work in `C:/Users/Mico/Desktop/OCR with python model with machine learning/mybizmate-ocr` itself, on branch `camera-first`, cut from master at 3720049. No worktree: deeper paths break the Windows native build.
- Gates on every task, all passing before its commit:
  - `npx tsc --noEmit`;
  - `npx expo lint`;
  - `npx eslint lib __tests__ test-utils`;
  - `npm test`.
- `noLiterals` and `layers` stay green.
- Check the console per suite, or with `npx jest --ci --reporters=default`: Jest 30's AgentReporter hides console output when AI_AGENT or CLAUDECODE is set.
- Kotlin tasks also run the module's unit tests (`./gradlew :scanner:testDebugUnitTest`, from `android/`).
- `npm run test:core` isn't touched: it runs once, in Task 15.
- **Jest quirks:**
  - jest runs as iOS: font pins use `test-utils/typeStyles.ts`'s `typeStylesOf`;
  - the mock window is 750 dp at fontScale 2;
  - a known flaky VirtualizedList act() warning can follow `listsScreen` (about 1 run in 3 to 5).
- **The tool-harness quirk:** a backslash-u-hex sequence in any tool parameter becomes the literal character.
  - Write a no-break space as the escape built indirectly: `String.fromCharCode(0xa0)` in a test, or the source escape written into the file by a shell `printf`.
  - Check the bytes with `od -c`.
  - `monthDay` and `formatSeconds` already join with a no-break space, so a test builds its expected string with them.
- **Commits:**
  - Merging into master and pushing happen only at the user's word, with no pull request.
  - Subjects follow the repo's style: `feat(app): …`, `fix(app): …`, `test(app): …`, `docs: …`, and `feat(scanner): …` / `fix(scanner): …` for the native module.
  - Every message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

**What must not change**
- The C++ core, the models, the frame finders and the export files' layouts.
- The scanner module, except for Task 1's changes: re-arming after each photo, the "taken" status, `KEEP_SCANS` 100 and the debug counter.
- `lib/checks/*`.
- The stored formats. The exceptions:
  - the optional `session` on a scan (`recent.json`, `scan.json`) and on a saved summary (`saved.json`);
  - the new `session.json` and `files/queue/`.
- Data persists across the update: scans kept or saved before it open, show, export and delete.
- Design B's settled rules:
  - an edit means "the box says this";
  - samples can't be saved;
  - Gross is VAT-inclusive;
  - a customer not in the list goes out as written;
  - switching between sale and purchase drops the party;
  - scans are marked exported only after the person confirms.
- Annotation mode's behaviour (milestone 4's rulings).
- Design B's rulings bind unless the spec overrides them:
  - T24-1, whose anchor moves to the tabs group;
  - T26-4: going back through the live screen's navigation, never the global `router`, and compare-and-clear registrations;
  - F-6: a press that opens a screen runs once;
  - T17-3: one rule for what's waiting;
  - F-2: a mark is written first;
  - T26-3 and T26-5: Segmented's stacking.

**Dependencies and downloads**
- No new dependency. The tabs are expo-router 58's own (`expo-router/js-tabs`), and expo-linking is already a dependency.
- A new dependency would need the user's OK and a Windows build check.
- The one download is Lucide's four SVGs (Task 5), after the user's OK, into a new, empty scratch folder first.

**Product rules**
- Nothing leaves the phone.
- No names, TINs, amounts or photos in logs. The debug counter logs figures only.
- Team tools stay behind `TEAM_BUILD`, deep links included: the speed test, the training export, annotation mode and raw error messages.
- Light theme only; English UI; portrait phones only.
- On the device:
  - never screenshot the photo picker;
  - QA captures hold samples or made-up data only;
  - a uiautomator dump is never of a screen showing a real scan.

**Design rules**
- **Tokens and components:** design B's only: `lib/theme.ts`; Screen, Header, Button, ListRow, Badge, Banner, Sheet, Snackbar and the others.
  - The bar's measures become tokens (Task 5).
  - A truly one-off nudge stays inline, on a line marked `// optical: <why>`.
- **Copy:**
  - sentence case;
  - no "OCR", "confidence", "AI" or "% sure";
  - copy quoted in the spec is final;
  - new copy is quoted in its task.
- **Formats** come from `lib/format.ts`: `amount()`, `peso()`, `monthDay()`, `prettyDate()` and `formatClock()` ("9:41 AM").
- **Motion:** only design B's six; nothing new animates. The bar's press is the ripple.
- **Touch and text:**
  - every target is at least 48×48 dp;
  - text is at least 12 sp;
  - no `allowFontScaling={false}`, no fixed height around text, and no `numberOfLines` on a value.

**The shared emulator.** emulator-5554 (Medium_Phone_API_36.1) is shared with other sessions.
- Before using it, check that no other session is using it, and ask the user when unsure.
- Installs follow README "Reinstalling without losing the app's data".

## Review Focus

These failure modes are what the spec implies but no feature test would catch on its own, most likely first. Each has its test in the task that owns the code.

1. **The app is killed with photos waiting,** mid-session or during a read. At the next start, every queued photo is read into its session once: none is lost, and none is read twice. A photo is deleted only after its scan is in `recent.json`. (Task 3.)
2. **Scans from before this update.** These are:
   - kept and saved scans with no session id;
   - saved scans no longer among the newest 100;
   - samples.

   They show in Sessions as one-scan sessions, open, export from See invoices, and delete. (Tasks 4, 8 and 10.)
3. **Nothing hides behind the floating bar:** the end of every tab's scroll, Export's Share the file, the snackbar and a focused field all sit above it. With the keyboard up, the bar hides and takes no space. (Task 5.)
4. **The camera tab stays mounted under the other tabs.** Its light status bar, its live camera and its shutter must not carry over to Home or Sessions. (Tasks 6 and 7.)
5. **A fast double press runs once.** That covers Done, Check the next one, Next invoice, Back to session, Retake, Remove, a tab, a Sessions row and Home's cards. (Tasks 6, 7, 8, 9, 11 and 12.)

## File structure

**New**

| File | Responsibility |
|---|---|
| `app/(tabs)/_layout.tsx` | The Tabs: the bar, the camera first, Back to the camera, the bar hidden while the keyboard is up |
| `app/(tabs)/sessions/_layout.tsx` | The Sessions tab's Stack, anchored on its list |
| `app/(tabs)/sessions/index.tsx` | Sessions: a row per session, by day, and the search |
| `app/(tabs)/sessions/[id].tsx` | One session: its card, its scans, Check the next one, the reads that failed |
| `app/(tabs)/export/_layout.tsx` | The Export tab's Stack, anchored on step 1 |
| `app/(tabs)/export/index.tsx` | Step 1: what's waiting to send, per kind, and the parties |
| `app/(tabs)/export/[which].tsx` | Steps 2–3: the file, then "Did the file go where you wanted?" |
| `app/(tabs)/export/invoices.tsx` | See invoices: one kind's saved scans (Saved's list) |
| `app/+native-intent.tsx` | A launch with no route opens the camera |
| `components/TabBar.tsx` | The floating bar: five tabs, the raised middle button, Export's count |
| `components/SessionTray.tsx` | The camera's tray: gallery, the session's thumbnails and Done, PDF |
| `components/Card.tsx` | A card with one button (Home, the session screen) |
| `lib/session.ts` | The session the camera continues: its id, last change, failed reads and Retake; `session.json`; the 30-minute and restart close |
| `lib/captureQueue.ts` | Captures waiting to be read, photos in `files/queue/<session id>/`, read one at a time |
| `lib/pickers.ts` | The gallery, the camera app and the PDF picker, without reading |
| `lib/readFailures.ts` | A failed read in plain words (moved out of `lib/scanFlow.ts`) |
| `lib/sessions.ts` | Sessions from the recent and saved scans: grouping, days, counts, badges, the next to check, the tray, search fields |
| `lib/shutter.ts` | The camera's shutter, which the bar's middle button presses |
| `lib/exportSteps.ts` | The export's files and what each holds (moved out of `components/ExportSheet.tsx`) |
| `modules/scanner/android/src/main/java/expo/modules/scanner/CheckRate.kt` | Debug builds: form checks per second, and whether a read ran |
| `test-utils/routes.tsx` | The app's routes for `renderRouter`: the real layouts, stand-ins for the rest |

**Moved** (`git mv`, with imports one folder deeper):
- `app/index.tsx` → `app/(tabs)/index.tsx`;
- `app/camera.tsx` → `app/(tabs)/camera.tsx`;
- `app/settings.tsx` → `app/(tabs)/profile.tsx`;
- `__tests__/settingsScreen.test.tsx` → `__tests__/profileScreen.test.tsx`.

**Deleted** by their last task:
- `app/saved.tsx`, `components/ExportSheet.tsx`, `__tests__/savedScreen.test.tsx` and `__tests__/exportSheet.test.tsx` (Task 10; their tests move into `__tests__/exportTab.test.tsx`);
- `components/RecentRow.tsx` and `__tests__/recentRow.test.tsx` (Task 12).

**Changed in place:**
- in `lib/`: `scans.ts`, `saved.ts`, `startup.ts`, `scanFlow.ts`, `navigation.ts`, `cameraCopy.ts`, `confirmDelete.ts`, `search.ts`, `format.ts` and `theme.ts`;
- in `components/`: `Screen.tsx`, `ListRow.tsx`, `SaveSheet.tsx` and `icons.tsx`;
- in `app/`: `_layout.tsx` and `result.tsx`;
- in the scanner module: `AutoCapture.kt`, `ScannerCameraView.kt`, `ScannerModule.kt` and `src/ScannerCameraView.tsx`;
- `README.md`.

---

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

### Task 2: A scan's session, and the session store

**Files:**
- Create: `lib/session.ts`
- Modify: `lib/scans.ts` (`StoredScan.session`, `addScan`, `scansWritten`, `deleteScan`), `lib/saved.ts:31-42,91-124` (`SummaryBase.session`, `summaryOf`), `lib/startup.ts:12-15` (`loadSession`)
- Test: `__tests__/session.test.ts` (new), `__tests__/scans.test.ts`, `__tests__/saved.test.ts`, `__tests__/startup.test.ts`

**Interfaces:**
- Consumes: `writeJson`, `readJson` (`lib/jsonFile.ts`).
- Produces:

```ts
// lib/scans.ts
export type StoredScan = { /* as today */ session?: string }; // the session it was taken in; none before camera first, nor for a sample
export function addScan(s: Pick<StoredScan, 'label' | 'source' | 'sampleId' | 'result' | 'testImage' | 'session'>): string;
export function scansWritten(): Promise<void>; // resolves once recent.json holds every change made so far (or its write failed)
export function deleteScan(id: string): void;  // an unsaved scan: forgotten, and its folder under files/scans/ deleted; throws Error('saved') for a saved one
// lib/saved.ts: SummaryBase gains `session?: string`, copied from the scan by summaryOf; scan.json carries it through the spread
// lib/session.ts
export type FailedRead = { at: string; reason: string }; // an ISO time; plain words (lib/readFailures), never the scanner's own
export type SessionState = {
  id: string;
  changedAt: string;          // ISO: its last capture, stored read or failed read
  open: boolean;              // false once Done ended it: no capture goes in, its failed reads stay for its screen
  failed: readonly FailedRead[];
  replaces: string | null;    // Retake: the scan its next capture replaces
};
export const IDLE_MS = 30 * 60 * 1000;
export function newSessionId(now: Date): string;   // `${now.getTime()}-${4 base-36 characters}`
export function currentSession(): SessionState | null; // replaced, never changed in place: screens subscribe to it
export function subscribeSession(listener: () => void): () => void;
export function takeCapture(now: Date): { session: string; replaces: string | null };
export function touchSession(id: string, now: Date): void;
export function addFailedRead(id: string, reason: string, now: Date): void;
export function endSession(id: string): void;
export function retakeIn(id: string, scanId: string, now: Date): void;
export function closeIdleSession(now: Date): boolean;
export function loadSession(): Promise<void>;
```

**The rules** (spec §6.3 and §6.9, and calls 2, 3, 23 and 24):
- **`takeCapture`:**
  - First it closes an idle session: one whose `changedAt` is `IDLE_MS` or more ago, open or ended.
  - With an open one, it touches it, and returns its id and its `replaces`, which it then clears.
  - Otherwise a new open session replaces whatever was there (an ended one's failed reads go with it), and it returns `replaces: null`.
- **`touchSession` and `addFailedRead`** act only when `id` is the current session's. `addFailedRead` appends `{ at: now.toISOString(), reason }` and touches it.
- **`endSession`** (Done) sets `open: false` and `replaces: null`.
- **`retakeIn`** makes `id` the current, open session, with `replaces: scanId` and `changedAt: now`.
  - It keeps `failed` when `id` was already the current session.
  - Otherwise `failed` starts empty, and the session that was there closes.
- **`closeIdleSession`** returns true when it closed one.
- **`session.json`:**
  - It holds the state, or `null`, through `writeJson`, written after each change.
  - Like `recent.json`, it's a convenience: a failed write changes nothing in memory.
  - `loadSession()` is the restart rule: the current session is `null`, and when the file held one, it writes `null`. `loadAppData` runs it in its `Promise.all`.
- **`addScan`** keeps `s.session` when it's given.
- **`scansWritten`:** `save()` keeps the promise of its latest `writeJson`, failures caught, and `scansWritten()` returns it.

- [ ] **Step 1: Write the failing tests.** Use `memoryFs` and `pinToday`.

  `__tests__/session.test.ts`:
  - `'the first capture opens a session; the next ones join it, and session.json follows'`:
    - the id matches `/^[0-9]{13}-[0-9a-z]{4}$/`;
    - a second `takeCapture` a minute later returns the same id;
    - `readJson('session.json')` equals `{ id, changedAt: <that minute>.toISOString(), open: true, failed: [], replaces: null }`.
  - `'Done ends it: the next capture opens another, and the ended one's failed reads go'`.
  - `'a failed read is kept, with its time and words, only while its session is the current one'`: `addFailedRead('other', …)` changes nothing.
  - `'30 minutes after its last change, it closes by itself'`:
    - `closeIdleSession(t + IDLE_MS - 1)` is false;
    - `closeIdleSession(t + IDLE_MS)` is true, and then `currentSession()` is null;
    - a `takeCapture` after that idle gives a new id.
  - `'a restart closes it'`: `jest.resetModules()`, then `loadSession()`. `currentSession()` is null, and `session.json` holds `null`.
  - `"Retake: that session is the camera's again, and its next capture replaces the scan, once"`:
    - with A open, `retakeIn(B, 'scan-1', t)` closes A;
    - `takeCapture` gives `{ session: B, replaces: 'scan-1' }`, then `replaces: null`;
    - a B that Done had ended keeps its failed reads.

  `__tests__/scans.test.ts`:
  - `'a scan keeps its session, in recent.json too; one kept before camera first has none'`.
  - `'scansWritten waits until recent.json holds the scan just added'`.
  - `'deleting an unsaved scan forgets it and its folder; a saved one is refused'`.

  `__tests__/saved.test.ts`:
  - `"a save keeps the scan's session in saved.json and scan.json; a summary from before has none, and loads"`.

  `__tests__/startup.test.ts`:
  - `'a session open when the app stopped is closed at the next start; its scans keep their session'`.

- [ ] **Step 2: Run** `npx jest __tests__/session.test.ts __tests__/scans.test.ts __tests__/saved.test.ts __tests__/startup.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement** the signatures above.

- [ ] **Step 4: Run** `npm test` and the gates. Expected: PASS.

- [ ] **Step 5: Commit** with the message `feat(app): a scan keeps the session it was taken in; the open session, its 30 minutes, its failed reads and its retake`.

---

### Task 3: The capture queue

**Files:**
- Create: `lib/captureQueue.ts`, `lib/pickers.ts`, `lib/readFailures.ts`
- Modify: `lib/scanFlow.ts`. It uses the pickers, and `photoFailed`, `pdfFailed`, `failureDialog`, `PDF_REFUSED` and `scannerFailed` move into `lib/readFailures.ts`. Its behaviour doesn't change.
- Modify: `lib/startup.ts` (`setStarted`, `useStarted`) and `app/_layout.tsx`.
  - On mount, the layout runs `setStarted(false)`.
  - In `onReady`, it runs `setStarted(true)` and `void resumeQueue()`.
- Test: `__tests__/captureQueue.test.ts` (new), `__tests__/rootLayout.test.tsx`
- Test: `__tests__/scanFlow.test.ts` and `__tests__/pdfFlow.test.tsx`. They pass unchanged, apart from `failureDialog`'s import.

**Interfaces:**
- Consumes:
  - `takeCapture`, `touchSession`, `addFailedRead` (Task 2);
  - `addScan`, `scansWritten`, `deleteScan`, `getScan` (Task 2);
  - `scanPhoto`, `readPdf`, `releaseAccess` (modules/scanner).
- Produces:

```ts
// lib/readFailures.ts
export function photoFailed(e: unknown): string;   // today's dialog words, moved
export function pdfFailed(e: unknown): string;     // today's, moved
export function failureDialog(words: string): [title: string, message?: string]; // today's, moved
export function failedReadReason(kind: 'photo' | 'pdf', e: unknown): string;
// "It isn't a photo the scanner can open." (ERR_UNREADABLE_IMAGE) | a pdf_* refusal's words (PDF_REFUSED) | "The scanner stopped while reading it."
// lib/pickers.ts
export function pickPhoto(): Promise<string | null>;  // the gallery: the picker's copy in the app's cache; null if cancelled; throws if the picker fails
export function cameraAppPhoto(): Promise<string | null | 'no_permission'>;
export type PickedPdf = { uri: string; name: string | null };
export function pickPdf(): Promise<PickedPdf | 'not_pdf' | null>; // a file that isn't a PDF has its access given up already
export function letGoOfPdf(uri: string): void;    // after its read: a file:// copy deleted, a content:// access given up
// lib/captureQueue.ts
export const READ_WHILE_SHOOTING: boolean = true; // spec §5: approach 1. false is approach 2: the camera holds reads while it's live
export type Capture = {
  key: string; session: string; at: Date; kind: 'photo' | 'pdf';
  uri: string; // a photo's file in files/queue/<session>/ (or where it was, if it couldn't move); a PDF's picked uri
  source: ScanSource; testImage: boolean; name: string | null; replaces: string | null; reading: boolean;
};
export function queuePhoto(from: string, p: { session: string; source: 'camera' | 'gallery' | 'camera_app'; testImage?: boolean; replaces?: string | null }, at: Date): Promise<void>;
export function queuePdf(pdf: PickedPdf, p: { session: string; replaces?: string | null }, at: Date): void;
export function captures(): readonly Capture[];   // waiting and reading, oldest first; replaced, never changed in place
export function subscribeQueue(listener: () => void): () => void;
export function pendingIn(session: string): number;
export function whenRead(session: string): Promise<void>; // once none of that session's captures waits or reads
export function holdReads(held: boolean): void;
export function resumeQueue(): Promise<void>;     // at start: what's left in files/queue, oldest first; idempotent
export function queuedName(at: Date, seq: number, source: 'camera' | 'gallery' | 'camera_app', testImage: boolean, ext: string): string;
// `${at.getTime()}-${seq}-${source}${testImage ? '-test' : ''}.${ext}`
export function parseQueuedName(name: string): { at: Date; seq: number; source: 'camera' | 'gallery' | 'camera_app'; testImage: boolean } | null;
// lib/startup.ts
export function setStarted(started: boolean): void; // the splash has gone (true), or a new root shows it (false)
export function useStarted(): boolean;
```

**The rules** (spec §6.3, calls 4 and 5):
- **`queuePhoto`:**
  - It takes the next `seq` at once, so the reading order is the call order.
  - Then it moves `from` (a `file://` in the app's cache: the camera's capture, or a picker's copy) to `files/queue/<session>/<queuedName(…)>`, keeping `from`'s extension. A move that fails reads the photo where it is.
- **Reading** goes one capture at a time, in `(at, seq)` order, unless held:
  - A photo goes through `scanPhoto(uri, { deletePhoto: false })`, and a PDF through `readPdf(uri)`.
  - Then `addScan({ label, source, result, testImage, session })`. In the same tick, the capture leaves `captures()`.
  - Then `touchSession`, and a `replaces` scan that's still unsaved is deleted (`deleteScan`).
  - The photo's file is deleted once `scansWritten()` resolves. A PDF runs `letGoOfPdf(uri)` in a `finally`.
  - A form not found is a scan like any other.
- **Labels** are today's:
  - camera and camera app: "Camera photo";
  - gallery: "Photo from gallery";
  - a PDF: `PDF: ${name}`, or "PDF".
- **A read that throws:**
  - `addFailedRead(session, failedReadReason(kind, e), new Date())`;
  - the photo is deleted;
  - the next capture goes on;
  - no dialog, and nothing is logged.
- **`resumeQueue`:**
  - It lists `files/queue/<session>/`, and skips a file that's already queued (by uri).
  - It parses each name. A name it can't read is a camera photo, read after the others.
  - It removes empty folders.
- **`holdReads(true)`:** no new read starts; one under way finishes.

- [ ] **Step 1: Write the failing tests.**

  `__tests__/captureQueue.test.ts`. Use `memoryFs` and `pinToday`, with modules/scanner mocked: each read is a deferred promise.
  - `"a photo moves into files/queue/<session>/ before it's read, named by its time, its place and its source"`: `parseQueuedName(queuedName(at, 3, 'gallery', true, 'png'))` round-trips.
  - `"one at a time, in the order taken, through the camera's read path"`:
    - with two queued, `scanPhoto` is called once until the first settles;
    - its call is `(<the queued uri>, { deletePhoto: false })`.
  - `'a read keeps its scan in its session, then deletes the photo once recent.json has it'` (Review Focus 1):
    - `recentScans()[0]` has `session` 'S', label 'Camera photo' and `testImage` true;
    - the queued file still exists until `scansWritten()` resolves, and then it's gone;
    - `captures()` is empty.
  - `'a form not found is a scan like any other'`.
  - `"a read that fails is the session's failed read, in plain words, and the photo goes"`:
    - `{ code: 'ERR_UNREADABLE_IMAGE' }` gives the reason "It isn't a photo the scanner can open.";
    - an `Error('boom')` gives "The scanner stopped while reading it.", with no 'boom' anywhere in `session.json`;
    - `Alert.alert` isn't called.
  - `'Retake: the new scan replaces the unsaved one once it reads; a failed read keeps it; a saved one is never replaced'`.
  - `"a PDF waits in memory, is read through readPdf, then the picker's access is given up"`:
    - its scan has the label 'PDF: a.pdf' and source 'pdf';
    - `releaseAccess` is called for a `content://` uri;
    - a `pdf_password` refusal gives the reason 'That PDF has a password. Save a copy without one, then import it.'.
  - `"at start, what's left in files/queue is read into its sessions, oldest first; a second resume adds nothing"` (Review Focus 1):
    - two folders and three files; `resumeQueue()` runs twice;
    - `scanPhoto` is called three times, in time order;
    - the scans carry their folders' session ids, and `testImage` comes from the name.
  - `"a photo that can't be moved is read where it is"`.
  - `'whenRead waits for its own session only'`.
  - `'held, no new read starts until it lets go (approach 2)'`.
  - `"failedReadReason never holds the scanner's own message, in a team build too"`.

  `__tests__/rootLayout.test.tsx`:
  - `'once the splash has gone, the app is started and the queue resumes'`. The BrandSplash mock calls `onReady`, and `resumeQueue` is mocked: it's called once, and `useStarted()` is true.

- [ ] **Step 2: Run** `npx jest __tests__/captureQueue.test.ts __tests__/rootLayout.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement.**
  - Move the failure words into `lib/readFailures.ts`, and the pickers out of `useScanFlow` into `lib/pickers.ts`. `useScanFlow` uses both, with its behaviour as it is.
  - Then build the queue.

- [ ] **Step 4: Run** `npm test` and the gates. `scanFlow.test.ts`, `pdfFlow.test.tsx`, `home.test.tsx` and `result.test.tsx` pass unchanged, apart from `failureDialog`'s import. Expected: PASS.

- [ ] **Step 5: Commit** with the message `feat(app): photos wait in files/queue and are read one at a time into their session; the pickers apart from reading`.

---

### Task 4: Sessions from the scans

**Files:**
- Create: `lib/sessions.ts`
- Modify: `lib/search.ts` (`matchesScan`)
- Test: `__tests__/sessions.test.ts` (new), `__tests__/search.test.ts`

**Interfaces:**
- Consumes:
  - `recentScans`, `subscribeRecent`, `StoredScan` (`lib/scans.ts`);
  - `savedList`, `subscribeSaved`, `SavedSummary`, `savedSummary` (`lib/saved.ts`);
  - `scanStateOf`, `savedStateOf`, `homeBadge`, `shownLabel` (`lib/scanState.ts`);
  - `saleOf`, `certOf`, `boxValue`;
  - `Capture` (Task 3), `FailedRead` (Task 2).
- Produces:

```ts
// lib/sessions.ts
export type Member = { id: string; session: string | null; at: Date; scan: StoredScan | null; summary: SavedSummary | null };
export type Session = { key: string; id: string | null; at: Date; members: readonly Member[] };
// key: the session id, or `scan:${id}` for a scan with none; at: its first scan's time; members oldest first
export type Status = 'ready' | 'to_check' | 'retake' | 'saved' | 'exported';
export type Tally = { ready: number; toCheck: number; retake: number; saved: number; exported: number };
export type TrayItem = { key: string; at: Date; image: string | null; state: 'reading' | 'read' | 'problem' };
export function scanTimeOf(id: string, fallbackIso: string): Date; // the ms an id starts with ("1763700000000-3"), else the fallback
export function membersOf(recent: readonly StoredScan[], saved: readonly SavedSummary[]): Member[];
export function sessionsOf(members: readonly Member[]): Session[]; // newest first
export function statusOf(m: Member, state: ScanState | null): Status;
export function tallyOf(s: Session, statuses: ReadonlyMap<string, Status>): Tally;
export function sessionBadges(t: Tally): BadgeSpec[];  // at most two
export function cardLine(t: Tally, failed: number): string;
export function countLine(s: Session): string;         // "3 invoices", "1 invoice", "1 PDF", "2 PDFs"
export function rowTitle(s: Session): string;          // "9:41 AM · 3 invoices"; with no id: "Camera photo 4:10 PM"
export function sessionTitle(at: Date, today: Date): string; // "Today, 9:41 AM", "Yesterday, 4:10 PM", "Nov 20, 2:15 PM"
export function dayTitle(at: Date, today: Date): string;     // "Today", "Yesterday", "Nov 20"; another year: "Nov 20, 2025"
export function byDay(sessions: readonly Session[], today: Date): { title: string; data: Session[] }[];
export function nextToCheck(s: Session, statuses: ReadonlyMap<string, Status>, except?: string): string | null;
export function homeCounts(sessions: readonly Session[], statuses: ReadonlyMap<string, Status>): { toCheck: number; retake: number };
export function oldestWithWork(sessions: readonly Session[], statuses: ReadonlyMap<string, Status>): Session | null;
export function scanBadge(m: Member, state: ScanState | null, saved: SavedState): BadgeSpec;
export function savedSub(s: SavedSummary): string;     // Saved's row sub-line, moved from app/saved.tsx's subOf
export function trayOf(session: string, recent: readonly StoredScan[], waiting: readonly Capture[], failed: readonly FailedRead[]): TrayItem[];
export function scanFields(m: Member, lists: Lists, settings: Settings): { name: string; number: string; tin: string };
export function useSessions(): { sessions: Session[]; statuses: ReadonlyMap<string, Status>; states: ReadonlyMap<string, ScanState> };
// lib/search.ts
export function matchesScan(fields: { name: string; number: string; tin: string }, query: string): boolean; // as matchesParty: folded words, or TIN digits
```

**The rules** (spec §6.4, §6.6, §6.5's count, and calls 9 to 12):
- **`membersOf`:**
  - one member per id: a recent scan (with its summary, when it's saved), or a summary alone;
  - `session` is `scan?.session ?? summary?.session ?? null`;
  - `at` is `scan?.at ?? scanTimeOf(id, summary.savedAt)`.
- **`sessionsOf`:** scans with a session id are grouped by it. Every scan without one is a session of its own, with `id: null`: the scans from before this update, and the samples.
- **`statusOf`:**
  - a summary gives `exportedAt ? 'exported' : 'saved'`;
  - otherwise the state: `not_found` is `'retake'`; `to_check` and `blocked` are `'to_check'`; `passed` is `'ready'`.
- **`sessionBadges`:**

  | Tally | Badges |
  |---|---|
  | every scan saved, all exported | "Exported" (neutral) |
  | every scan saved | "All saved" (success) |
  | otherwise | `${ready + toCheck} to check` (warning), when above 0; `${retake} retake` (warning), when above 0 |

- **`cardLine`:**
  - the non-zero parts of `${ready} ready`, `${toCheck} to check` and `${retake + failed} to retake`, joined by " · ";
  - "All saved." when there's none and every scan is saved.
- **`countLine`:** every member from a PDF gives `PDF`/`PDFs`; otherwise `invoice`/`invoices`. A summary alone is a PDF when its label starts with "PDF".
- **`nextToCheck`:** the first member, in order, that's `ready` or `to_check` and isn't `except`.
- **`homeCounts` and `oldestWithWork`** leave samples out.
- **`scanBadge`:**
  - a saved, changed scan gives `homeBadge`'s "Changed";
  - a saved one gives "Exported" (neutral) or "Saved" (success);
  - not found, and not a sample, gives "Retake" (warning);
  - otherwise it's `homeBadge(scan, state, 'no')`.
- **`trayOf`:** that session's scans, its failed reads and its captures, by time:
  - a scan is `read`, or `problem` when its form wasn't found, with its `originalUri`;
  - a failed read is `problem`, with no image;
  - a capture is `reading`, with its photo (a PDF has none).
- **`scanFields`:**
  - **`name`:** the party shown (`sale.party.shown`, `cert.payor.shown`, `summary.partyName`), else `shownLabel`.
  - **`number`:** `final.invoice_no`, or a summary's row's 'SI/OR No.' or 'Inv No.'.
  - **`tin`:**
    - for an invoice, the box `customer_tin`, else the list party's;
    - for a 2307, `cert.payor.tin`;
    - for a summary alone, ''.
- **`useSessions`:**
  - It recomputes when the recent scans, the saved scans, the lists, the settings or annotation change.
  - The checks run through `saleOf` and `certOf` and their per-scan cache, so a new scan runs one check, not a hundred.

- [ ] **Step 1: Write the failing tests** in `__tests__/sessions.test.ts`. Use fixtures built with `parseScanResult(coreJson(…))`, `pinToday`, and the expected dates built with `monthDay`.
  - `"scans with one session id are one session, at its first scan's time, newest first"`.
  - `'a scan with no session id is a session of its own: scans from before this update, and the samples'` (Review Focus 2).
  - `"a saved scan no longer among the recent ones joins its session through its summary, at its id's time"` (Review Focus 2).
  - `'a scan both recent and saved counts once'`.
  - `'by day: Today, Yesterday, then the date; another year has its year'`.
  - `"a session's lines: 9:41 AM · 3 invoices, 1 invoice, 1 PDF; with no id, Camera photo 4:10 PM"`.
  - `"its title: Today, 9:41 AM; Yesterday, 4:10 PM; Nov 20, 2:15 PM"`.
  - `'status: checks passed is ready; a flag or a block is to check; no form is retake; saved; exported'`.
  - `'badges: at most two, from N to check, N retake, All saved and Exported'`.
  - `"the card's line: 1 ready · 1 to check · 1 to retake, failed reads among the retakes; All saved."`.
  - `'the next to check: the first unsaved scan whose form was found, past a retake and the one open'`.
  - `"Home's counts and the oldest session with something left leave the samples out"`.
  - `'a scan badge: Retake for no form, Saved or Exported once saved, Changed after a change'`.
  - `'the tray: read, retake and reading, in the order taken'`.
  - `'a new scan runs the checks for itself only'`: with 50 scans checked, `jest.spyOn(require('../lib/sale'), 'saleOf')` sees one call after `addScan`.

  `__tests__/search.test.ts`:
  - `"a scan is found by its party, its number, or its TIN's digits"`.

- [ ] **Step 2: Run** `npx jest __tests__/sessions.test.ts __tests__/search.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run** `npm test` and the gates. Expected: PASS.

- [ ] **Step 5: Commit** with the message `feat(app): sessions from the scans: by day, their counts and badges, the next to check, the tray and search`.

---

### Task 5: The bar

**Files:**
- Create: `components/TabBar.tsx`, `lib/shutter.ts`
- Modify: `components/icons.tsx` (`House`, `Files`, `Send`, `CircleUser`), `lib/theme.ts` (`radius.bar`, `bar`), `components/Screen.tsx` (`useTabBarSpace`; `useEndPadding`)
- Test: `__tests__/tabBar.test.tsx` (new), `__tests__/icons.test.tsx`, `__tests__/theme.test.ts`, `__tests__/layout.test.tsx`

**Interfaces:**
- Consumes:
  - `BottomTabBarProps`, `BottomTabBarHeightCallbackContext`, `BottomTabBarHeightContext` (`expo-router/js-tabs`);
  - `useKeyboardHeight` (Screen);
  - `setBottomClearance` (`lib/snackbar.ts`);
  - `savedList`, `subscribeSaved`, `waitingOf` (T17-3);
  - `useIsFocused`.
- Produces:

```ts
// lib/shutter.ts
export type Shutter = { take: () => void; disabled: boolean };
export function setShutter(owner: object, shutter: Shutter | null): void; // null clears only that owner's (T26-4: compare-and-clear)
export function currentShutter(): Shutter | null;
export function subscribeShutter(listener: () => void): () => void;
// components/TabBar.tsx
export type TabName = 'index' | 'sessions' | 'camera' | 'export' | 'profile';
export const TABS: readonly { name: TabName; label: string; icon: IconComponent }[];
// in order: index "Home" House, sessions "Sessions" Files, camera "Camera" Camera, export "Export" Send, profile "Profile" CircleUser
export function countText(n: number): string; // "7"; "99+" past 99
export function TabBar(props: BottomTabBarProps): ReactElement | null;
// components/Screen.tsx
export function useTabBarSpace(): number; // in a tab's screen: the bar's height from the screen's foot; 0 elsewhere, and while it hides
// lib/theme.ts
radius.bar = 20; export const bar = { circle: 60, raise: 26, ring: 4, dot: 5 } as const; // dp, spec §6.2
```

**The bar** (spec §6.2, calls 19 and 20):
- **Its root:**
  - absolutely placed at the foot, with `pointerEvents="box-none"`;
  - padded `space.m` at the sides, and `space.m + insets.bottom` under it, so it floats 12 dp above the navigation bar's inset.
- **The bar itself:**
  - `accessibilityRole="tablist"`;
  - `panel` fill, `radius.bar` and `elevation.overlay` (design B's shadow);
  - five slots in `TABS` order.
- **A side tab:**
  - a `Tap`, at least 48×48;
  - `accessibilityRole="tab"`, `accessibilityState={{ selected }}`, and its label as its name;
  - a 24 dp icon, in `ink` when selected and `chevron` otherwise;
  - when selected, a `bar.dot` `brand` dot under the icon.
- **Export's count:**
  - `waitingOf(null, savedList()).length`; new parties don't count;
  - while it's above 0: a pill on the icon's corner, `brand` fill, `ink` `countText(n)` in `type.badge`;
  - the tab's name becomes `` `Export, ${n} to send` ``.
- **The middle button:**
  - a `bar.circle` `brand` circle, raised `bar.raise` above the bar's top, in a `bar.ring` `paper` ring;
  - `accessibilityRole="tab"`, with the dot under it while it's selected;
  - **on another tab:** the name "Camera" and an `ink` `Camera` icon. A press opens the camera tab.
  - **on the camera tab:** the name "Take photo" and the shutter look, a `panel` core inside the coral ring. A press runs `currentShutter()?.take()`, and it's disabled while `currentShutter()` is null or `disabled`.
- **A press** emits `tabPress` (`emitter.emit({ type: 'tabPress', target: key, canPreventDefault: true })`), then, unless that tab is focused or the event was prevented, `navigateToTab(key)`. That's the default bar's contract.
- **Its height:**
  - On layout, the root's height plus `bar.raise` goes to `BottomTabBarHeightCallbackContext`, for `useTabBarSpace`.
  - While `useIsFocused()` is true, it also goes to `setBottomClearance(owner, h)`, so the root snackbar sits above it. It's withdrawn on blur and unmount.
- **The keyboard:** with `tabBarHideOnKeyboard` and `useKeyboardHeight() > 0`, the bar renders nothing, reports 0 and withdraws its clearance.
- **`useEndPadding(hasBottomBar)`** is `(hasBottomBar ? 0 : Math.max(insets.bottom, useTabBarSpace())) + space.xl + keyboard`. `useTabBarSpace` reads `BottomTabBarHeightContext`; it's undefined outside the tabs, and then 0.

- [ ] **Step 1 (the controller): the icons.**
  - Ask the user's OK to fetch four SVGs (about 2 KB) from `raw.githubusercontent.com/lucide-icons/lucide/1.77.0/icons/`: `house.svg`, `files.svg`, `send.svg` and `circle-user.svg`.
  - They go into a new, empty folder in the scratchpad.
  - If that's declined, the implementer copies the approved mockup's `i-house`, `i-files`, `i-send` and `i-user` symbols, and `icons.tsx`'s header says they're from an older Lucide (call 20).
  - Give the implementer the folder's path.

- [ ] **Step 2: Write the failing tests.**

  `__tests__/tabBar.test.tsx`. Its props are made up, with five routes, an `emitter` whose `emit` returns `{ defaultPrevented: false }`, and `navigateToTab: jest.fn()`. `useIsFocused` is mocked.
  - `'a tablist of five tabs in order, each a tab with its name; the open one is selected'`.
  - `'the open tab: its icon in ink, with a coral dot under it; the others in the quiet ink, at least 3:1 on white'`. Use `test-utils/contrast.ts` on `colors.chevron` against `colors.panel`.
  - `'a press tells the tab, then opens it; on the open tab, it only tells it'`.
  - `"Export's count: a coral pill with ink figures, 99+ past 99, and in its name, Export, 7 to send; none at 0"`. The saved scans come from `saved.json` in `memoryFs`, through `loadSaved`.
  - `'the middle button: elsewhere, Camera, which opens the camera; on the camera, Take photo, which takes it'`.
  - `"Take photo waits while the camera can't take one"`.
  - `'with the keyboard up it hides, and takes no space'`. Use `test-utils/keyboard.ts`'s `keyboard(300)`.
  - `'its height, the raised button too, goes to the tab screens, and to the snackbar while the tabs are on top'` (Review Focus 3).
  - `'a camera that leaves clears only its own shutter'`.

  `__tests__/layout.test.tsx`:
  - `'in a tab, the end of a scroll clears the bar; with the keyboard up, the keyboard'` (Review Focus 3). Use `BottomTabBarHeightContext.Provider value={120}`.

  `__tests__/icons.test.tsx`: `GLYPHS` gains `House`, `Files`, `Send` and `CircleUser`.

  `__tests__/theme.test.ts`: `"the bar's measures"`.

- [ ] **Step 3: Run** `npx jest __tests__/tabBar.test.tsx __tests__/layout.test.tsx __tests__/icons.test.tsx __tests__/theme.test.ts`. Expected: FAIL.

- [ ] **Step 4: Implement.** Copy the glyphs' elements exactly from the SVGs, in Lucide's 24 grid, as `icons.tsx` does, and add their names to its header.

- [ ] **Step 5: Run** `npm test` and the gates. Expected: PASS.

- [ ] **Step 6: Commit** with the message `feat(app): the bar: five icon tabs, a raised camera button that is the shutter on the camera, and Export's count`.

---

### Task 6: The tabs: routes, Back, links, and Profile

**Files:**
- Create: `app/(tabs)/_layout.tsx`, `app/(tabs)/sessions/_layout.tsx`, `app/(tabs)/export/_layout.tsx`, `app/+native-intent.tsx`, `test-utils/routes.tsx`
- Create, as stand-ins that later tasks build:
  - `app/(tabs)/sessions/index.tsx`: a `Screen` with the `Header` "Sessions" and no Back;
  - `app/(tabs)/sessions/[id].tsx`: the `Header` "Session";
  - `app/(tabs)/export/index.tsx`: the `Header` "Send to MyBizMate", with no Back, and one `ListRow` "Saved" that pushes `/saved`, so today's export stays reachable until Task 10.
- Move: `app/index.tsx`, `app/camera.tsx` and `app/settings.tsx` into `app/(tabs)/` as `index.tsx`, `camera.tsx` and `profile.tsx`.
- Modify: `app/_layout.tsx`, `lib/navigation.ts`, `lib/scanFlow.ts` (`toCamera`), and the three moved screens.
- Test: `__tests__/tabs.test.tsx` (new), `__tests__/nativeIntent.test.ts` (new)
- Test: `__tests__/rootLayout.test.tsx`, `__tests__/navigation.test.tsx`, `__tests__/snackbarClearance.test.tsx`, `__tests__/camera.test.tsx`, `__tests__/home.test.tsx`, and `__tests__/settingsScreen.test.tsx` → `__tests__/profileScreen.test.tsx`

**Interfaces:**
- Consumes: `TabBar` (Task 5), `usePushOnce`, `useGoBackOrHome`.
- Produces:

```ts
// app/(tabs)/_layout.tsx
export const unstable_settings = { anchor: 'camera' };
// <Tabs backBehavior="initialRoute" tabBar={(props) => <TabBar {...props} />}
//   screenOptions={{ headerShown: false, tabBarHideOnKeyboard: true, sceneStyle: { backgroundColor: colors.paper } }}>
//   index, sessions, camera (sceneStyle: colors.camera), export, profile
// app/(tabs)/sessions/_layout.tsx and app/(tabs)/export/_layout.tsx:
//   export const unstable_settings = { anchor: 'index' }; a Stack with headerShown false, on paper
// app/_layout.tsx
export const unstable_settings = { anchor: '(tabs)' }; // T24-1's anchor; the camera's Stack.Screen goes
// app/+native-intent.tsx
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string;
// lib/navigation.ts
export function useNavigateOnce(): (href: Href) => void; // usePushOnce's guard, with router.navigate: a tab, or a screen in one
// test-utils/routes.tsx
export type RouteFile = '_layout' | '(tabs)/_layout' | '(tabs)/index' | '(tabs)/camera' | '(tabs)/profile'
  | '(tabs)/sessions/_layout' | '(tabs)/sessions/index' | '(tabs)/sessions/[id]' | '(tabs)/export/_layout'
  | '(tabs)/export/index' | 'result' | 'saved' | 'lists' | 'licenses' | 'license' | 'speed' | 'training';
export function appRoutes(screens?: Partial<Record<RouteFile, ComponentType>>): Record<string, unknown>;
// the four layouts as they are; any screen not given, a stand-in saying its name and "on top" or "under"
```

**`redirectSystemPath`** (call 1). The algorithm isn't determined by the signature:

```ts
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string {
  if (!initial) return path;
  try {
    return routeOf(unwrapDevLaunchURL(path)) === '' ? '/camera' : path; // expo-linking's unwrap
  } catch {
    return path; // never throws: the link goes on as it came
  }
}
/** A link's route: after a web link's host, or right after a deep link's scheme://; no query, hash, Expo Go's --, or end slashes. */
function routeOf(url: string): string {
  let rest = url.replace(/[?#].*$/, '');
  const web = /^https?:[/][/][^/]*/i.exec(rest);
  rest = web ? rest.slice(web[0].length) : rest.replace(/^[a-z][a-z0-9+.-]*:[/][/]/i, '');
  return rest.replace(/^[/]+|[/]+$/g, '').replace(/^--([/]|$)/, '');
}
```

**What else changes:**

| Where | Today | Now |
|---|---|---|
| Home's Take photo | `push('/camera')` | `navigateOnce('/camera')` |
| Home's Settings icon, and "Set your export defaults" | `push('/settings')` | `navigateOnce('/profile')` |
| `scanFlow`'s `toCamera` | `router.replace('/camera')` | `router.navigate('/camera')`, once |
| The camera's reads (the shutter, the gallery, the camera app, "Choose from gallery") | `replace: true` | push: the Scan screen opens over the tabs |
| The camera's Close | `IconButton` "Close" | gone: Back leaves the app (call 8) |
| The camera's `StatusBar` | always light | `{focused && <StatusBar style="light" />}` (Review Focus 4) |
| Settings | `Header title="Settings"` | `Header title="Profile" onBack={null}`; after Export defaults' note, `SectionHeader` "Your lists" and the row below |

**Profile's new row** (spec §6.8, call 17):
- a `ListRow` titled "Customers and items", with a chevron, that pushes `/lists`;
- its sub-line is `` `${c} customers · ${s} suppliers · ${i} items` ``, `subMono` and `subCaps`, with "customer", "supplier" and "item" for 1;
- a party typed `both` counts in both.

Today's sections, fields, saves as typed, Privacy, licenses, Version and Team tools stay as they are.

- [ ] **Step 1: Write the failing tests.**

  `__tests__/nativeIntent.test.ts`:
  - `"a launch with no route opens the camera"`. It covers `mybizmatescan:///`, `mybizmatescan://`, `/`, and `exp+mybizmate-scan://expo-development-client/?url=http%3A%2F%2F10.0.2.2%3A8081`.
  - `'a link with a route keeps it'`: `mybizmatescan://camera?test=inv_0051`, `mybizmatescan://speed` and `/training` come back as they were.
  - `'a link while the app runs is never changed'`.
  - `"it never throws; what it can't read goes on as it came"`.

  `__tests__/tabs.test.tsx`. Use `renderRouter(appRoutes(), …)`, with the real bar, and the global `router` in the test only.
  - `'the camera is the first tab: with nothing under it, Back leaves the app'`. `initialUrl` is `'/camera'`, and `router.canGoBack()` is false.
  - `'Back from Home, Sessions, Export and Profile goes to the camera'`. Press each tab by role and name, then `act(() => router.back())`: the pathname is `/camera`.
  - `'a screen inside Sessions keeps the bar; Back goes to Sessions, then the camera'`.
  - `'the Scan screen, Your lists, the licenses and the team screens sit above the tabs, with no bar'`.
  - `'a cold link keeps working, with the tabs under it: /camera?test=…, /speed and /training'`.
  - `'a press that opens a tab from a screen switches to it once, with one tabs navigator'`. Use `useNavigateOnce`, pressed twice in one act. The root state has one route.
  - `'a double press on a tab opens it once: one Back goes to the camera'` (Review Focus 5).
  - `'the light status bar is the camera's only while it's on top'` (Review Focus 4).

  The suites that change:
  - `__tests__/rootLayout.test.tsx` and `__tests__/navigation.test.tsx` use `appRoutes`. The camera tab's scene is black; the others are paper.
  - `__tests__/snackbarClearance.test.tsx`: `'on a tab, the message clears the floating bar; on the Scan screen over it, that screen's bar'`.
  - `__tests__/camera.test.tsx`:
    - `'no Close: the camera is a tab'`;
    - `'a photo opens its Scan screen over the tabs'` (push, not replace).
  - `__tests__/home.test.tsx`: Take photo and the Settings icon navigate.
  - `__tests__/profileScreen.test.tsx`:
    - `'Profile: the settings as a tab, with no Back'`;
    - `'Customers and items, with its counts, opens Your lists'`;
    - every Settings test kept.

- [ ] **Step 2: Run** `npx jest __tests__/nativeIntent.test.ts __tests__/tabs.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement.** Use `git mv` for the moves and the renamed suite.

- [ ] **Step 4: Run** `npm test` and the gates. Expected: PASS.

- [ ] **Step 5: Commit** with the message `feat(app): the tabs: the camera first, Back to the camera, links that still open, and Profile as a tab`.

---

### Task 7: The camera tab: sessions, the tray, Done

**Files:**
- Modify: `app/(tabs)/camera.tsx`; `lib/scanFlow.ts` (`scanUri` goes: the camera no longer reads)
- Create: `components/SessionTray.tsx`
- Test: `__tests__/camera.test.tsx` (its capture tests rewritten), `__tests__/sessionFlow.test.tsx` (new)

**Interfaces:**
- Consumes:
  - `takeCapture`, `currentSession`, `subscribeSession`, `endSession`, `closeIdleSession` (Task 2);
  - `queuePhoto`, `queuePdf`, `captures`, `subscribeQueue`, `pendingIn`, `whenRead`, `holdReads`, `READ_WHILE_SHOOTING` (Task 3);
  - `pickPhoto`, `cameraAppPhoto`, `pickPdf` (Task 3), `useStarted` (Task 3);
  - `trayOf` (Task 4), `setShutter` (Task 5), `useTabBarSpace` (Task 5), `useNavigateOnce` and `usePushOnce`.
- Produces:

```ts
// components/SessionTray.tsx
export function SessionTray(props: {
  items: readonly TrayItem[] | null; // null: no photo in the session yet, so the hint sits in the middle
  hint: ReactNode;                   // the status pill
  done: { label: string; busy: boolean; onPress: () => Promise<void> } | null;
  onGallery: () => void;
  onPdf: () => void;
  disabled: boolean;                 // while a picker is open
}): ReactElement;
```

**The screen** (spec §6.3, calls 6 to 8):
- **The top band:** the Auto switch and the flashlight, as today. There's no Close (Task 6).
- **The picture:** the live camera, with the status pill at its foot while the tray shows thumbnails.
- **The tray** sits under the picture and over the bar's space (`paddingBottom: useTabBarSpace() + space.s`).
  - **Its ends:** `IconButton`s `ImageIcon` "Gallery" on the left and `FileText` "Import PDF" on the right, in the camera tone.
  - **Its middle:** a horizontal scroll of the open session's thumbnails (`trayOf`), each `touch.thumbW` × `touch.thumbH`, with a 16 dp mark on its corner:
    - a `brand` ring on `panel` while it's read;
    - `Check` in `panel` on `success` once it's read;
    - "!" in `panel` on `warning` for a retake.
  - **A thumbnail's name:** "Photo 1, reading", "Photo 1, read" or "Photo 1, retake".
  - **Then Done:** a secondary `Button`, "Done · N", where N counts the tray.
  - Before the first photo, the middle is the status pill instead.
- **Live while reading** (approach 1): `active = started && focused && !picking && !sayingWhy`. Reads never turn it off.
  - Under approach 2 (`!READ_WHILE_SHOOTING`), the camera runs `holdReads(true)` while it's live, and `holdReads(false)` on blur and on Done.
- **A capture:**
  - Auto, the middle button, the gallery, the camera app and a PDF all start with `const { session, replaces } = takeCapture(new Date())`.
  - Then a photo goes to `queuePhoto(uri, { session, source, testImage: testParam !== null, replaces }, now)`, and a PDF to `queuePdf`.
  - Auto's photo gets today's haptic.
  - A photo that comes in while the camera isn't on top is discarded, as today.
- **The middle button:** while the camera is on top, it runs `setShutter(owner, { take, disabled })` (`useFocusEffect`, cleared on blur and unmount). `disabled` while it's starting, taking a photo, or showing a panel.
- **Done:**
  - Its `onPress` runs `endSession(id)`, then `holdReads(false)`, then `await whenRead(id)`.
  - While it waits, its label is `` `Reading ${pendingIn(id)} more…` `` and it's busy.
  - Then, with exactly one stored scan and no failed read, it pushes `{ pathname: '/result', params: { id: scanId, session: id } }`.
  - Otherwise it runs `navigateOnce({ pathname: '/sessions/[id]', params: { id } })`.
  - It runs once: the Button's promise guard.
- **Leaving:** blur keeps the session and the queue. On focus, and when the app comes back to the foreground, `closeIdleSession(new Date())` runs.
- **Dialogs** stay only for picking: a picker that fails, "Choose a PDF file.", and the camera app's permission (`sayWhy`, as today). A read never opens one.
- **The splash:** nothing starts, and no permission is asked for, until `useStarted()` is true.

- [ ] **Step 1: Write the failing tests.**

  `__tests__/camera.test.tsx`. Use `memoryFs` and the real session store and queue, with `scanPhoto` mocked as deferred promises.
  - `'it starts, and asks for the camera, only once the splash has gone'`.
  - `"a photo joins the session's queue, and the camera stays live while it's read"`.
  - `'the first capture opens a session; the next ones join it'`.
  - `'the tray: the gallery and the PDF always; the hint in the middle until the first photo; then the thumbnails and Done · N'`.
  - `'each thumbnail says how it stands: reading, read or retake'`.
  - `'a read that fails is a thumbnail with !, never a dialog'`.
  - `'Done waits for the queue, saying Reading 2 more…, then opens the session screen'`.
  - `"a session of one photo opens that photo's Scan screen"`.
  - `'Done runs once on a double tap'` (Review Focus 5).
  - `'leaving keeps the session and the queue; coming back continues it; 30 minutes later it has closed'`.
  - `'after a Retake, the next capture replaces that scan, once'`.
  - `"the gallery, the camera app and a PDF join the session the same way; a picker that fails, or a file that isn't a PDF, says why in a dialog"`.
  - `'the middle button takes the photo while the camera is on top, and waits while it starts or takes one; on another tab it is Camera again'` (Review Focus 4).
  - `'the camera stops when another tab is on top'` (Review Focus 4).
  - Keep the tests of the permission panels, the test hook (its photos are test images), the haptic and refocus.

  `__tests__/sessionFlow.test.tsx`. Use `renderRouter(appRoutes({ '(tabs)/camera': … }))` with `memoryFs`.
  - `'Done opens the session screen in the Sessions tab, with the bar; Back goes to Sessions, then the camera'`.

- [ ] **Step 2: Run** `npx jest __tests__/camera.test.tsx __tests__/sessionFlow.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement.** Remove `scanUri` and the camera's reading card.

- [ ] **Step 4: Run** `npm test` and the gates. Expected: PASS.

- [ ] **Step 5: Commit** with the message `feat(app): the camera keeps shooting into a session: a tray of what it read, Done, and photos read while it stays live`.

---

### Task 8: Sessions

**Files:**
- Modify: `app/(tabs)/sessions/index.tsx` (its stand-in replaced), `components/ListRow.tsx` (`badges`)
- Test: `__tests__/sessionsScreen.test.tsx` (new), `__tests__/display.test.tsx`

**Interfaces:**
- Consumes:
  - `useSessions`, `byDay`, `rowTitle`, `sessionBadges`, `tallyOf`, `scanBadge`, `savedSub`, `scanFields` (Task 4);
  - `matchesScan` (Task 4);
  - `openSaved`, `getScan`;
  - `usePushOnce`; `Screen`, `Header`, `IconButton` (`Search`, `Close`), `TextField`, `SectionHeader`, `EmptyState`.
- Produces:

```ts
// components/ListRow.tsx: ListRow gains
badges?: readonly BadgeSpec[]; // several, side by side (wrapping), each part of the spoken label; `badge` stays
```

**What it shows** (spec §6.6, call 11):
- **The header:** "Sessions", with no Back. On its right, an `IconButton` `Search` "Search".
  - It shows a `TextField` under the header (label "Search", placeholder "Name, number or TIN", focused on open).
  - The button then becomes `Close` "Close search", which clears the field.
- **The list:** a `SectionList` of `byDay(sessions, new Date())`, with `SectionHeader`s.
  - **A row:**
    - the title `rowTitle(s)`;
    - `badges`: `sessionBadges(tallyOf(s, statuses))`, or for a session with no id, `[scanBadge(...)]`;
    - a chevron.
  - **A press:**
    - with an id, it pushes `{ pathname: '/sessions/[id]', params: { id } }`;
    - without one, it opens the scan. `openSaved` runs when the scan isn't among the recent ones, and "Couldn't open that scan." shows when it's gone. Then it pushes `{ pathname: '/result', params: { id, from: 'list' } }`.
- **While searching:** the matching scans (`scanFields` with `matchesScan`), newest first, each a `ListRow`:
  - title: its name;
  - sub: `savedSub`, or `` `${kind} · ${number}` ``;
  - its amount and its `scanBadge`;
  - it opens its Scan screen with `from: 'list'`.

  With none: `` EmptyState title={`No scan matches “${query}”`} ``.
- **Empty:** `EmptyState title="Nothing scanned yet" body="Take a photo with the round button. Each run of photos shows up here."`.

- [ ] **Step 1: Write the failing tests.**

  `__tests__/sessionsScreen.test.tsx`:
  - `"Sessions: rows by day, newest first, 9:41 AM · 3 invoices, with at most two badges"`.
  - `'a row opens its session; a scan from before opens its Scan screen'` (Review Focus 2).
  - `'scans from before and the samples are sessions of their own, labelled as today'` (Review Focus 2).
  - `'the search finds scans by party, number or TIN, and lists them; a result opens its Scan screen'`.
  - `'empty: Nothing scanned yet'`.
  - `'a row opens once on a double tap'` (Review Focus 5).

  `__tests__/display.test.tsx`:
  - `"ListRow's badges sit side by side, each in its spoken label"`.

- [ ] **Step 2: Run** `npx jest __tests__/sessionsScreen.test.tsx __tests__/display.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run** `npm test` and the gates. Expected: PASS.

- [ ] **Step 5: Commit** with the message `feat(app): Sessions: a row per session by day, with its badges, and search across scans`.

---

### Task 9: The session screen

**Files:**
- Modify: `app/(tabs)/sessions/[id].tsx` (its stand-in replaced), `lib/confirmDelete.ts` (`confirmDeleteScan`)
- Create: `components/Card.tsx`
- Test: `__tests__/sessionScreen.test.tsx` (new), `__tests__/display.test.tsx` (Card)

**Interfaces:**
- Consumes:
  - `useSessions`, `tallyOf`, `cardLine`, `countLine`, `sessionTitle`, `nextToCheck`, `scanBadge`, `savedSub` (Task 4);
  - `currentSession`, `retakeIn` (Task 2), `deleteScan` (Task 2), `confirmDeleteSaved`;
  - `usePushOnce`, `useNavigateOnce`, `Banner`, `ButtonRow`, `SectionHeader`, `ListRow`, `EmptyState`.
- Produces:

```ts
// components/Card.tsx
export function Card(props: {
  title: string;                       // type.headline, a header for TalkBack
  body?: string | null;                // type.body, mute
  tone?: 'plain' | 'attention';        // attention: warningTint in a warningLine border (the mockup's amber card)
  action?: ButtonProps | null;         // its one button, full width, under it
  children?: ReactNode;                // between the body and the button
}): ReactElement;                      // panel (or tint), radius.panel, padding space.l, gap space.s, marginHorizontal space.l
// lib/confirmDelete.ts
export function confirmDeleteScan(scan: StoredScan, before?: () => void): Promise<void>; // settles when the dialog closes
```

**What it shows** (spec §6.4, calls 2, 3, 9 and 10):
- **The header:** `sessionTitle(s.at, today)`, with the subtitle `` `Session · ${countLine(s)}` ``, and the default Back.
- **The card:**
  - its `tone` is `attention` while anything is left, and `plain` once it reads "All saved.";
  - its title is `cardLine(tally, failed.length)`;
  - its action, while `nextToCheck` finds one, is "Check the next one" (primary), which pushes `{ pathname: '/result', params: { id: next, from: 'session', session: id } }`.
- **The reads that failed** (only while this is `currentSession()`): a warning `Banner`.
  - Its words: "1 photo couldn't be read. Retake it.", or `` `${n} photos couldn't be read. Retake them.` ``.
  - Under them, a line per entry: `` `${formatClock(new Date(at))}: ${reason}` ``.
- **The scans:** `SectionHeader` "Invoices", with the count on its right, then a row per scan, oldest first:

  | The scan | Title | Sub | Amount | Badge |
  |---|---|---|---|---|
  | saved | `summary.partyName` or its label | `savedSub(summary)` | gross, or a 2307's tax | Saved, Exported or Changed |
  | unsaved, form found | the party shown, or its label | `Sale · SI 0000186`, `Purchase · Inv 0007`, `2307 · Q4 2026` | `amount(...)` | N to check, Can't save yet, or Checks passed |
  | unsaved, no form | `shownLabel(scan)` | `formatClock(at)` | none | Retake |

  - Every row opens its Scan screen with `from: 'session'` and `session: id`.
  - A long press runs `confirmDeleteScan`.
- **Under a no-form row:** a `ButtonRow` of "Remove" (`destructiveText`), which runs `confirmDeleteScan`, and "Retake" (`text`), which runs `retakeIn(id, scan.id, new Date())` and then `navigateOnce('/camera')`.
- **`confirmDeleteScan`:**
  - a saved scan goes through `confirmDeleteSaved`, today's words;
  - an unsaved one asks `Alert.alert('Delete this scan?', "It's removed from this phone.", [Cancel, Delete])`;
  - Delete runs `before?.()` and then `deleteScan`, and says "Couldn't delete the scan." if that fails;
  - it settles when the dialog closes, so a Button guards a double tap.
- **Empty:** `EmptyState title="Nothing left in this session" body="Its scans were deleted."`.

- [ ] **Step 1: Write the failing tests.**

  `__tests__/sessionScreen.test.tsx`:
  - `'the header: Today, 9:41 AM, and Session · 3 invoices'`.
  - `"the card: 1 ready · 1 to check · 1 to retake with Check the next one; All saved. with no button"`.
  - `'Check the next one opens the first unsaved scan whose form was found, past a retake'`.
  - `'a row: party or label, kind and number, the amount and one badge; it opens the Scan screen'`.
  - `"a scan whose form wasn't found: Retake opens the camera in this session; Remove asks, then deletes"`.
  - `"photos that couldn't be read: the count, then each one's time and words, while it's the current session"`.
  - `'a long press asks to delete: an unsaved scan as Delete this scan?, a saved one in its words'`.
  - `'Check the next one, Retake and Remove run once on a double tap'` (Review Focus 5).
  - `'a session with nothing left in it says so'`.

  `__tests__/display.test.tsx`:
  - `'Card: a header, its words, one button; attention on the warning tint'`.

- [ ] **Step 2: Run** `npx jest __tests__/sessionScreen.test.tsx __tests__/display.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run** `npm test` and the gates. Expected: PASS.

- [ ] **Step 5: Commit** with the message `feat(app): a session's screen: what's left, Check the next one, a retake or remove for a photo the camera couldn't read`.

---

### Task 10: The Export tab

**Files:**
- Create: `lib/exportSteps.ts` (moved out of `components/ExportSheet.tsx`), `app/(tabs)/export/[which].tsx`, `app/(tabs)/export/invoices.tsx`
- Modify: `app/(tabs)/export/index.tsx` (its stand-in replaced), `test-utils/routes.tsx` (the two routes added, `saved` removed)
- Modify: `components/SaveSheet.tsx:232-235`. View runs `navigateOnce({ pathname: '/export/invoices', params: { kind } })`.
- Modify: `app/(tabs)/index.tsx`, until Task 12 rewrites it. Its To export links navigate: "All saved" and "Everything is exported" to `/export`, and a kind to `{ pathname: '/export/[which]', params: { which: kind } }`.
- Delete: `components/ExportSheet.tsx`, `app/saved.tsx`, `__tests__/exportSheet.test.tsx`, `__tests__/savedScreen.test.tsx`. Their tests move into `__tests__/exportTab.test.tsx`.
- Test: `__tests__/exportTab.test.tsx` (new), `__tests__/save.test.tsx`, `__tests__/home.test.tsx`

**Interfaces:**
- Consumes:
  - `exportChoice`, `writeExport`, `writePartiesExport`, `partiesToCheck`, `newPartiesFirst`, `waitingOf`, `totalOf` (`lib/exportFile.ts`);
  - `markExported`, `markPartiesExported`, `newParties`, `confirmDeleteSaved`, `openSaved`;
  - `shareFile`; `savedSub` (Task 4); `useNavigateOnce`.
- Produces:

```ts
// lib/exportSteps.ts: unchanged from ExportSheet.tsx, now exported
export type Which = Kind | 'parties';
export const FILES: Record<Which, { row: string; title: string; subtitle: string; file: string; key: string; words: Wording; ranges: readonly { value: ExportRange; label: string }[] }>;
export function chosen(which: Which, range: ExportRange, lists: Lists): { ids: readonly string[]; count: string; warnings: readonly string[]; write: (now: Date) => Promise<string> };
export const XLSX_MIME: string; export const NOTHING: string; export const FIRST: string; export const MARK_FAILED: string; export const PARTIES_NOTE: string;
export function lastSent(saved: readonly SavedSummary[]): string | null; // the newest exportedAt
// routes: /export (step 1), /export/[which] (steps 2-3; which: 'sale' | 'purchase' | '2307' | 'parties'), /export/invoices?kind=
```

**The steps** (spec §6.7, calls 13 and 14; the export's rules are today's: T17-3, F-2, T18-x, T19-x):
- **Step 1** (`index`):
  - **The header:** "Send to MyBizMate", with no Back. While anything waits, the subtitle is `` `${n} saved, not sent yet` ``, where n is `waitingOf(null, saved).length`.
  - **The rows** are today's file rows: Sales, Purchases and 2307s for each kind with saved scans, then the parties' file.
    - A kind's sub is `` `${waiting} to export` `` or "All exported".
    - A kind with something waiting also shows `amount={peso(totalOf(waitingOf(kind, saved)))}`.
    - The parties come first, with `FIRST` under them, when they must go in first.
  - **With nothing waiting but something saved:** the rows sit under `EmptyState title="Everything is sent"`, with ``body={`Last sent ${prettyDate(localIsoDate(new Date(lastSent(saved)!)))}.`}``.
  - **With nothing saved:** `EmptyState title="Nothing saved yet" body="Save a scan and it shows up here, ready to send."`, and still the parties' row when new parties wait (T19-7).
  - A row runs `push({ pathname: '/export/[which]', params: { which } })`.
- **Step 2** (`[which]`):
  - **The header:** `FILES[which].title`, with the default Back.
  - **Its content, top to bottom:**
    - the subtitle sentence, in `type.body` `mute`;
    - the error `Banner`, first (T18-4);
    - the `SummaryBox`;
    - for a kind, a `ListRow` "See invoices", with the sub `` `${n} saved` `` and a chevron, which pushes `{ pathname: '/export/invoices', params: { kind } }`;
    - `ChoiceChips` "Which ones";
    - the warning `Banner`s, and the parties' note.
  - **Then a `ButtonRow`:** "Share the file" (primary, `Share` icon). It's disabled with nothing chosen, and its `onPress` returns the share's promise, so it runs once.
- **Step 3** (the same screen, after the share):
  - **The header:** "Did the file go where you wanted?".
  - **The body:** today's question, in curly quotes (T18-2), as a polite live region.
  - **A `ButtonRow`:** "Not yet" (text), which goes back, and `` `Mark ${n} as exported` ``, which marks with the share's time, goes back, then says "Marked 2 sales as exported.".
  - A failed mark stays, with `MARK_FAILED` in a danger `Banner`.
- **See invoices** (`invoices`):
  - **The header:** the kind's plural ("Sales", "Purchases", "2307s"), with the subtitle `` `${n} to export` `` or "All exported".
  - **The list:** a `FlatList` of that kind's saved scans, newest document date first, then newest saved.
  - **A row** is Saved's: party or label, `savedSub`, the amount, and To export (brand) or Exported (neutral).
  - A press opens the scan (`openSaved`, then `from: 'list'`); a long press runs `confirmDeleteSaved`.
  - **Empty:** `` EmptyState title={`No ${plural} saved`} ``.

- [ ] **Step 1: Write the failing tests** in `__tests__/exportTab.test.tsx`. Move every export-sheet test and Saved's list tests into it, against the screens, and add:
  - `"step 1: Sales, Purchases and 2307s, each with its count and total; the parties first when they must go first"`.
  - `'nothing waiting: Everything is sent, with the last export's date, and the kinds stay'`.
  - `'nothing saved: the empty state, and the parties when they wait'`.
  - `"a kind's file: the summary, See invoices, Which ones and today's warnings; Share the file writes once on a double tap"`.
  - `'after sharing, the question; Mark N as exported marks them, goes back and says so; Not yet marks nothing; a failed mark stays and says so'`.
  - `"See invoices: that kind's saved scans, To export or Exported, a scan from before too; a row opens its Scan screen; a long press asks to delete"` (Review Focus 2).
  - `'Back from a file goes to the files, then the camera'`. Use `renderRouter` with `appRoutes`.

  `__tests__/save.test.tsx`:
  - `"a save's View opens See invoices for its kind"`.

- [ ] **Step 2: Run** `npx jest __tests__/exportTab.test.tsx __tests__/save.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement.** Then delete the four files.

- [ ] **Step 4: Run** `npm test` and the gates. Expected: PASS.

- [ ] **Step 5: Commit** with the message `feat(app): the Export tab: today's steps as screens, what's waiting with its totals, and each kind's saved invoices`.

---

### Task 11: The Scan screen in a session

**Files:**
- Modify: `app/result.tsx`, `components/SaveSheet.tsx` (`inSession`), `lib/scanFlow.ts` (`retake`)
- Test: `__tests__/result.test.tsx`, `__tests__/save.test.tsx`, `__tests__/sessionFlow.test.tsx`

**Interfaces:**
- Consumes: `useSessions`, `nextToCheck` (Task 4), `retakeIn` (Task 2), `useNavigateOnce`.
- Produces:

```ts
// app/result.tsx: params
{ id: string; from?: 'session' | 'list'; session?: string }
// 'session': from a session's screen, Check the next one or Next invoice
// 'list': from Sessions, a search or See invoices
// none: straight from a read (Done's one photo, a sample)
// session: the session it's in (from Done's one photo too)
// components/SaveSheet.tsx and CertSaveSheet: inSession?: boolean // default false; true: the snackbar has no View
// lib/scanFlow.ts
retake(scan: StoredScan, how: { back: boolean; session: string | null }): Promise<void>;
// a sample, or back: back once, as today
// an unsaved scan in a session: retakeIn(session, scan.id, now), then router.navigate('/camera'), once
// otherwise: today's by source
```

**The rules** (spec §6.4, calls 14 to 16):
- **`back`** is `from === 'list' || (from === 'session' && scan.saved !== null)`.
- **TalkBack** starts at the strip when `from` is undefined, as today.
- **The bottom bar:**
  - **In a session, form not found:** `[{ label: 'Retake', onPress: retake }]`.
  - **In a session, `saved === 'unchanged'`:** `[Retake (secondary), primary]`.
    - The primary is "Next invoice" while `nextToCheck(group, statuses, scan.id)` finds one. It runs `router.replace({ pathname: '/result', params: { id: next, from: 'session', session } })`, once.
    - Otherwise the primary is "Back to session": `navigateOnce({ pathname: '/sessions/[id]', params: { id: session } })`.
  - **Otherwise:** today's bar. So a change after the save brings "Save changes" back.
- **The save sheets** get `inSession={session !== undefined}`. With it, the snackbar says today's words with no action. Without it, View opens See invoices (Task 10).

- [ ] **Step 1: Write the failing tests.**

  `__tests__/result.test.tsx`:
  - `'in a session, after a save, Next invoice replaces this screen with the next one'`.
  - `'the last one saved: Back to session'`.
  - `'a change after the save brings Save changes back'`.
  - `"in a session, the not-found bar is Retake alone, and Retake opens the camera in the session, once"`.
  - `'Next invoice and Back to session run once on a double tap'` (Review Focus 5).
  - Keep every existing Retake test, with `from: 'list'` in place of `'recent'` and `'saved'`.

  `__tests__/save.test.tsx`:
  - `"in a session the save's snackbar has no View"`.

  `__tests__/sessionFlow.test.tsx`:
  - `'Back to session lands on the session screen in the Sessions tab, with nothing above it'`.

- [ ] **Step 2: Run** `npx jest __tests__/result.test.tsx __tests__/save.test.tsx __tests__/sessionFlow.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run** `npm test` and the gates. Expected: PASS.

- [ ] **Step 5: Commit** with the message `feat(app): in a session, the Scan screen goes on to the next invoice, then back to the session`.

---

### Task 12: Home as cards

**Files:**
- Modify: `app/(tabs)/index.tsx` (rewrite), `lib/format.ts` (`greeting`, `longDay`)
- Delete: `components/RecentRow.tsx`, `__tests__/recentRow.test.tsx`
- Test: `__tests__/home.test.tsx` (its assertions rewritten), `__tests__/format.test.ts`

**Interfaces:**
- Consumes:
  - `Card` (Task 9); `useSessions`, `homeCounts`, `oldestWithWork`, `sessionTitle`, `countLine` (Task 4);
  - `waitingOf`, `totalOf`; `useScanFlow().fromSample`; `useNavigateOnce`, `usePushOnce`;
  - today's Get set up rows, the samples sheet and the footer.
- Produces:

```ts
// lib/format.ts
export function greeting(d: Date): 'Good morning' | 'Good afternoon' | 'Good evening'; // before 12:00, before 18:00, after that
export function longDay(d: Date): string; // "Tuesday, Nov 24" (monthDay's no-break space between month and day)
```

**What Home shows** (spec §6.5, call 18), top to bottom, with each card's single button:

| Card | When | Title and words | Button |
|---|---|---|---|
| The header | always | `Header title={greeting(now)} subtitle={longDay(now)} onBack={null}` | none |
| Get set up | until `setupDone` (today's rule) | `` `Get set up ${done} of 2` ``, then today's two rows inside | none (its rows are today's) |
| Take your first photo | no recent and no saved scan (today's first run) | the line "The round button at the bottom opens the camera.", then today's three numbered tips | "Open the camera" (primary): `navigateOnce('/camera')` |
| To check (`attention`) | `homeCounts` above 0 | the parts `` `${n} invoice(s) to check` `` and `` `${r} photo(s) to retake` ``, joined by " and " | "Check now" (primary): `oldestWithWork`'s session screen, or a scan with no id's Scan screen (`from: 'list'`) |
| Ready to send to MyBizMate | anything waiting | a line per kind with something waiting: `` `Sales · ${n}` `` (`type.value`), with `peso(total)` (`type.figure`) on the right | "Go to Export" (secondary): `navigateOnce('/export')` |
| Last session | a session with an id exists | `` `${sessionTitle(at, now)} · ${countLine(s)}` `` | "Open the session" (secondary) |
| The end | always | today's "Try a sample invoice" text button and its sheet; a sample opens its Scan screen in no session; today's footer | as today |

- [ ] **Step 1: Write the failing tests.**

  `__tests__/home.test.tsx`. Replace the capture, To export and Recent scans assertions with:
  - `'the header: the greeting for the time of day, and the date'`.
  - `'a first run: Get set up, and Take your first photo with the three tips; Open the camera opens it'`.
  - `'N invoices to check, and the photos to retake; Check now opens the oldest session with something left'`.
  - `"Ready to send to MyBizMate: each kind's count and total; Go to Export"`.
  - `'Last session: its time and count; Open the session opens it'`.
  - `'a sample opens its Scan screen, in no session'`.
  - `'nothing to do: no check card and no send card'`.
  - `"each card's button runs once on a double tap"` (Review Focus 5).

  `__tests__/format.test.ts`:
  - `'greeting'`.
  - `'longDay'`.

- [ ] **Step 2: Run** `npx jest __tests__/home.test.tsx __tests__/format.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement**, and delete `RecentRow` and its test.

- [ ] **Step 4: Run** `npm test` and the gates. Expected: PASS.

- [ ] **Step 5: Commit** with the message `feat(app): Home as cards: what to check, what's ready to send, the last session, and a first photo`.

---

### Task 13: Leftovers, and the README

**Files:**
- Modify: `README.md`; anything the search below finds.

- [ ] **Step 1: Leftovers.**
  - `rg -n "'/saved'|'/settings'|RecentRow|ExportSheet|scanUri|from: 'recent'|from: 'saved'" app components lib __tests__ test-utils`. Expected: nothing.
  - `rg -n "newest 20|last 20" lib app components README.md`. Expected: only the milestone sections the README keeps as they are.
  - Remove whatever is found, with its tests.

- [ ] **Step 2: The README.**
  - **At the top:** the spec and this plan join the design and plan lists.
  - **"What it does", milestone 2:** Home, The camera and Recent scans become:
    - **The bar:** five icons, the raised camera button that's the shutter on the camera, and Export's count.
    - **The camera tab:**
      - continuous shooting; Auto takes the next sheet once the last has left the frame for half a second;
      - the tray: gallery, the thumbnails with their state, Done · N, and PDF;
      - a read that fails is a "!", with why on the session screen.
    - **Sessions:**
      - what a session is;
      - 30 minutes, or a restart, closes one;
      - photos wait in `files/queue/` until they're read.
    - **Home's cards, and Profile.**
  - **Milestone 3:** Saved becomes the Export tab (its steps, and See invoices). The session screen has Check the next one and Next invoice.
  - **Privacy:**
    - unsaved scans keep the newest 100, about 1.2 MB each from the QA backup, so about 120 MB at 100 (spec §6.9);
    - a later round could ask before dropping unchecked scans;
    - debug builds log the camera's form checks per second (`MbsCheckRate`), figures only.
  - **"The camera's test photo":**
    - the link opens the camera tab;
    - Auto takes the photo once, then waits for the sheet to leave, which a still never does;
    - the round button takes more.
  - **"PDFs on the emulator":** the camera tab's PDF button.
  - **The dev client's Tools button note:** Home's header has no icons now.
  - **Tests:** the Kotlin tests add re-arming after a photo and the checks counter.
  - Leave every "Checked on the emulator (…)" section as it is.

- [ ] **Step 3: Run** `npm test` and the gates. Expected: PASS.

- [ ] **Step 4: Commit** with the message `docs: the README describes the tabs, the camera's sessions, the Export tab, Profile and the 100 unsaved scans`.

---

### Task 14: The rebuild, and approach 1 or 2 (the controller runs it)

**Files:**
- Modify (only if approach 2 wins): `lib/captureQueue.ts` (`READ_WHILE_SHOOTING = false`) and the README's sessions bullet
- Temporary, never committed: fixture photos in the app's `files/queue/`

- [ ] **Step 1: Get the emulator.**
  - Check that no other session holds emulator-5554.
  - Copy `android/app/build/outputs/apk/debug/app-debug.apk` into a new folder in the scratchpad. Task 1 built no APK, so this is still master's build: it gives the size before, and a QA AVD's data from before.
  - Ask the user (AskUserQuestion) which AVD to use:
    - **their Medium_Phone_API_36.1:** it has a hardware keyboard, a virtual-scene back camera, and the app's data from before this change;
    - **a new QA AVD:** made as design B's Task 26 made `UI_QA_Phone` (API 36, 1080×2400 at 420 dpi, x86_64, no hardware keyboard), with `hw.camera.back=virtualscene`, and made-up data only.
  - **For a new QA AVD,** make data from before first:
    - install the copied master APK;
    - `git switch master`, start Metro, and make made-up data: two samples' worth of scans, plus a `?test=` scan kept unsaved;
    - stop Metro, then `git switch camera-first`.

- [ ] **Step 2: Rebuild and reinstall** with README "Reinstalling without losing the app's data":
  - step 1 builds the APK;
  - run `npm run check:apk`;
  - step 2 is the backup and its three checks, to `/tmp/scan-appdata.tar`;
  - step 3 uninstalls, installs and restores;
  - step 4 is the counts.

  Keep the backup: Task 15 checks the update against it. Start Metro (`npx expo start --dev-client`) on `camera-first`, and open the app from the dev client's launcher.
  - Expected: after the splash, the camera, with the bar.
  - The permission is asked for there, not over the splash.

- [ ] **Step 3: The measurement** (spec §5).
  - Push eight fixture photos to `/data/local/tmp/`: `fixtures/core/photos/inv_0001`, `inv_0007`, `inv_0011`, `inv_0017`, `inv_0027`, `inv_0041`, `inv_0051` and `svc_0000.jpg`.
  - Force-stop the app.
  - Copy them with `run-as` into `files/queue/1764000000000-qa01/`, each named as `queuedName` names a test camera photo (Task 3), so the restart reads them. They're real reads, and never training data.
  - `adb logcat -c`, then open the app. The camera tab shows the virtual scene while the queue reads the eight.
  - Ask the user to watch the emulator's preview during the reads, and say whether it stutters.
  - When `reading=false` lines have run for 20 s, run `adb logcat -d -s MbsCheckRate:D` into the scratchpad.
  - Take the median of `form checks/s` over the `reading=true` lines and over the `reading=false` ones.
  - Also run `adb shell dumpsys gfxinfo com.mybizmate.scan` for janky frames: reset before, read after the reads, then again after 20 s idle.
  - **The call:** approach 2 when the reading median is under half the idle one, or the user saw stutter. Otherwise approach 1.
  - **For approach 2:**
    - set `READ_WHILE_SHOOTING = false`;
    - say so in the README's sessions bullet;
    - run the gates;
    - commit `fix(app): read a session's photos after Done: the camera stuttered while it read (spec §5, approach 2)`.

- [ ] **Step 4: Restore** the app's data from the backup (README steps 3–4, without the rebuild), so the measurement's scans go. Tell the user the figures, the call, and the APK's size before and after.

---

### Task 15: The checks on the emulator, and the README's record (the controller runs it)

**Files:**
- Create: `.superpowers/brainstorm/camera-first-2026-11-24/qa/*.png` and `index.md` (in the parent folder, outside git)
- Modify: `README.md` (a "Checked on the emulator (camera first)" section)

Back up first (README step 2), and restore after every check that changes data.

- [ ] **Step 1: The checks** (spec §7). Save each capture as `<check>-<screen>.png`, and note in `index.md` what each shows.
  1. **The launch:**
     - from the dev client, the camera after the splash;
     - a cold `mybizmatescan://speed` with the tabs under it: Back goes to the camera.
  2. **A 10-photo session through the `?test=` hook:**
     - open `mybizmatescan://camera?test=inv_0051`;
     - Auto takes the first, then the pill says "Taken · put in the next one";
     - the middle button takes 9 more, by `adb shell input tap` at its centre, read from a text-only dump;
     - the tray scrolls, and shows Done · 10;
     - Done says "Reading N more…", then opens the session screen, with 10 rows.
  3. **A failed read and a retake:**
     - push `fixtures/core/photos/not_an_image.jpg` and `blank_page.png` to `/sdcard/Pictures/`, and run the media scan;
     - pick each with the tray's Gallery, by its label in a text-only dump: a "!" thumbnail for each;
     - after Done, the banner says "1 photo couldn't be read. Retake it." with its words, and the blank page has Retake and Remove;
     - Retake, then a `?test=` photo, replaces the blank page.
     - Delete the pushed files and run the media scan again.
  4. **Back on every tab** (`adb shell input keyevent KEYCODE_BACK`):
     - Home, Sessions, a session screen, Export, a file step, See invoices and Profile each lead to the camera;
     - on the camera, the app leaves: `dumpsys activity activities | grep mResumedActivity` shows the launcher.
  5. **The bar at 200% text, with 3-button navigation, and at 360 dp** (design B Task 26's commands, each restored after):
     - each tab, and the camera, with nothing behind the bar: the end of Sessions, Share the file, Profile's last row, a snackbar;
     - the status bar is light on the camera and dark on the other tabs.
  6. **The keyboard:** Profile's Offset account, with the soft keyboard shown. On a hardware-keyboard AVD, `show_ime_with_hard_keyboard 1` needs the user's OK, and goes back to 0 after. The bar is gone, and the field sits above the keyboard.
  7. **TalkBack names and states, through text-only uiautomator dumps:**
     - five tabs, the selected one, "Export, N to send", and "Camera" or "Take photo";
     - the tray's thumbnails;
     - the session rows' badges in their names.
  8. **The update over data from before** (the restored backup):
     - the old scans show in Sessions as sessions of their own ("Camera photo 4:10 PM"…);
     - one opens, one shows in See invoices and exports, and one is deleted. Then restore.
  9. **The core suite, once:** `npm run test:core`. Expected: PASS. This change touched nothing it covers.

- [ ] **Step 2: Restore** the app's data and the emulator's settings, and `rm /tmp/scan-appdata.tar`.

- [ ] **Step 3: The README's record.** Add "Checked on the emulator (camera first)", in the style of the UI pass's section:
  - the AVD and the build;
  - the suites on the final tree;
  - each check above, with its result;
  - the measurement's figures and the call;
  - what couldn't be checked here: a real phone's feel and speed, the real camera on paper (re-arming as sheets are swapped), TalkBack at run time, and iOS.

  Commit with the message `docs: camera first, as checked on the emulator`.

- [ ] **Step 4: Tell the user** where the captures are, with two or three of them.

---

## Execution notes

- **Who runs what:**
  - The controller runs Task 5's Step 1 (the download OK), Task 14 and Task 15. They need the user's OKs, the shared emulator and the native build.
  - Tasks 1 to 13 go to implementer subagents in order, each reviewed before the next.
  - Task 1 compiles and tests the module's Kotlin only.
  - Give each implementer its task, the Global Constraints, the Calls its task touches, the Review Focus lines it owns, and the spec's § it cites.
  - Design B's rulings D1 and D2 found that 'sonnet' and 'haiku' resolved to an unavailable model here, so subagents ran on opus. Check before the first dispatch.
- **Order:** each task builds on the ones before it, so they run one at a time.
  - Tasks 6 to 12 all touch the routes; `test-utils/routes.tsx` grows with them.
  - Task 6's stand-ins are replaced by Tasks 8, 9 and 10.
- **Rulings:** keep the run's rulings in `docs/superpowers/plans/2026-11-24-scanner-camera-first-rulings.md`, as design B did. Where a ruling and this plan differ, the ruling and the code win.
- **The end:**
  - After Task 15, a whole-branch review, on the most capable model.
  - Then superpowers:finishing-a-development-branch.
  - Merge into master and push only at the user's word, with no pull request.
