# Pre-flight conflict scan: camera first

- **Plan:** `docs/superpowers/plans/2026-11-24-scanner-camera-first.md` (15 tasks, 1523 lines), read in full.
- **Spec (binding):** `docs/2026-11-24-mybizmate-scan-camera-first-design.md`, read in full.
- **Code:** `mybizmate-ocr`, branch `camera-first` at 3720049 (= master), clean tree. Checked only where a plan line depends on a path or name existing (list in §6).
- **Scan date:** 2026-11-24. Nothing in the repo was changed; this file is the only output.

**Counts:** 86 table rows (71 task pairs + 15 task self-checks), plus 11 spec-coverage rows and 24 call rows.
**Findings:** 21. None blocks execution; 8 should be ruled before their owning task; 13 are minor.

---

## 1. Task pairs that share a file or an interface

"Found" says "No conflict" when the producer's names, signatures, types and paths match what the consumer uses. Fn points to §5.

| # | Pair | Shared | Producer gives | Consumer uses | Found |
|---|---|---|---|---|---|
| 1 | T1–T2 | `lib/scans.ts`, `__tests__/scans.test.ts` | T1: `export const KEEP = 100`, comments, test "keeps the newest 100" | T2: `StoredScan.session`, `addScan(…'session')`, `scansWritten`, `deleteScan` in the same file and suite | No conflict: separate parts; T2's tests run on KEEP 100. |
| 2 | T1–T3 | `ScannerModule.reading()` | T1: an AtomicInteger, up in `scan()`/`readPdf()`, down in `finally`; `KEEP_SCANS` trims `files/scans/` | T3: `scanPhoto(uri, { deletePhoto: false })`, `readPdf(uri)`; photos wait in `files/queue/` | No conflict. The queue's reads are what set `reading=true`; `keepNewest` never touches `files/queue/`. |
| 3 | T1–T6 | `__tests__/camera.test.tsx` | T1: `statusText('taken', …)` added to 'status copy' (:145) | T6: Close and push/replace tests rewritten | No conflict. |
| 4 | T1–T7 | TS `CameraStatus` `'taken'`, `statusText`; `onPhoto` with the camera still bound; `camera.test.tsx` | T1: 'Taken · put in the next one' (any form); re-arm after each photo | T7: the pill/hint; each `onPhoto` → `takeCapture` → `queuePhoto`; shutter disabled while starting/capturing/panel | No conflict. 'taken' leaves the shutter enabled, as §6.3 wants ("any time"). |
| 5 | T1–T13 | README ↔ names | T1: 100 scans, re-arm, `MbsCheckRate` | T13: Privacy bullet, test-photo section, Kotlin tests line | No conflict. |
| 6 | T1–T14 | log line | `Log.d("MbsCheckRate", "form checks/s=$n reading=$r")` per closed window | `adb logcat -d -s MbsCheckRate:D`; medians over lines | **F18** (a window closes only on a check, so a stall is one line). |
| 7 | T1–T15 | Auto's TAKEN on a still | Auto takes a `?test=` still once, then TAKEN forever | Check 2: "Auto takes the first, then the pill says…", the middle button takes 9 more | No conflict. |
| 8 | T2–T3 | `lib/startup.ts`; session and scan APIs | `loadSession` in `loadAppData`; `touchSession(id, now)`, `addFailedRead(id, reason, now)`, `addScan({…, session})`, `scansWritten()`, `deleteScan(id)` | T3 adds `setStarted`/`useStarted`; the queue calls each as specified | Signatures match. T3 lists `takeCapture` as consumed but never calls it (T7 does): cosmetic, no action. **F1** (a remount re-runs `loadRecent` while the queue writes). |
| 9 | T2–T4 | types | `StoredScan.session?`, `SummaryBase.session?`, `FailedRead { at: ISO string; reason }` | `membersOf` (`scan?.session ?? summary?.session ?? null`), `trayOf(…, failed)` | No conflict. |
| 10 | T2–T7 | session API | `takeCapture(now) → { session, replaces }` (clears `replaces`), `currentSession`, `subscribeSession`, `endSession`, `closeIdleSession` | camera: every capture "starts with" `takeCapture`; Done `endSession`; focus/foreground `closeIdleSession` | Types match. **F9** (takeCapture before a pick). |
| 11 | T2–T9 | session API | `currentSession()` (ended or open), `retakeIn(id, scanId, now)`, `deleteScan` (throws `Error('saved')`) | failed-reads banner only while current; row Retake; `confirmDeleteScan` routes saved scans to `confirmDeleteSaved` | No conflict. |
| 12 | T2–T11 | `retakeIn` | as above | Scan screen Retake: `retakeIn(session, scan.id, now)` then navigate `/camera`, once | No conflict; same use as T9's row. |
| 13 | T2–T13 | README ↔ rules | 30 minutes, restart, Done | README "Sessions" bullet | No conflict. |
| 14 | T2–T14 | session id format | `<ms>-<4 base-36>` (`newSessionId`) | fixture folder `files/queue/1764000000000-qa01/` | No conflict ('qa01' is 4 base-36 characters). |
| 15 | T3–T4 | `Capture` | `{ key, session, at: Date, kind, uri, source, testImage, name, replaces, reading }` | `trayOf(session, recent, waiting: readonly Capture[], failed)`: a capture is 'reading', with its photo (a PDF none) | No conflict. |
| 16 | T3–T6 | `lib/scanFlow.ts`, `app/_layout.tsx`, `__tests__/rootLayout.test.tsx` | T3: words and pickers moved out; layout `setStarted(false)` on mount, `setStarted(true)` + `resumeQueue()` in onReady; one rootLayout test | T6: `toCamera` → `router.navigate('/camera')`; anchor `'(tabs)'`, the camera's Stack.Screen goes; rootLayout moves to `appRoutes` | No conflict. Note: `appRoutes` renders the real `_layout`, so a suite that renders T7's real camera through it needs a BrandSplash mock that calls `onReady` (else `useStarted()` stays false). |
| 17 | T3–T7 | queue, pickers, `useStarted`, `scanFlow.ts` | `queuePhoto`/`queuePdf`/`captures`/`subscribeQueue`/`pendingIn`/`whenRead`/`holdReads`/`READ_WHILE_SHOOTING`; `pickPhoto`/`cameraAppPhoto`/`pickPdf` | camera captures and Done; T7 removes `scanUri` | Types match. **F7** (where the camera's `sayWhy` comes from). |
| 18 | T3–T9 | failed-read words | `failedReadReason` → `FailedRead.reason` | banner line `` `${formatClock(new Date(at))}: ${reason}` `` | No conflict. |
| 19 | T3–T11 | `lib/scanFlow.ts` | `fromGallery/fromCameraApp/fromPdf({ replace: true })` rebuilt on pickers, behaviour unchanged | `retake(…)` "otherwise: today's by source" | No conflict. |
| 20 | T3–T12 | `useScanFlow().fromSample` | unchanged by T3 (no session) | Home's sample button | No conflict. |
| 21 | T3–T13 | README ↔ `files/queue/` | photos wait in `files/queue/<session>/` | README "photos wait in files/queue/" | No conflict. |
| 22 | T3–T14 | `READ_WHILE_SHOOTING`, `queuedName`, `resumeQueue` | `export const READ_WHILE_SHOOTING: boolean = true`; `${ms}-${seq}-${source}[-test].${ext}`; resume at start | T14 flips the switch under approach 2; names fixtures "as queuedName names a test camera photo"; relies on the resume | No conflict. |
| 23 | T3–T15 | failed-read path | `ERR_UNREADABLE_IMAGE` → "It isn't a photo the scanner can open." | check 3 picks `not_an_image.jpg` through the tray's Gallery | **F20** (the picker may refuse it first). |
| 24 | T4–T7 | `trayOf`, `TrayItem` | `state: 'reading' \| 'read' \| 'problem'`, `image` | marks and names "Photo 1, reading/read/retake" | No conflict. |
| 25 | T4–T8 | sessions API | `useSessions`, `byDay`, `rowTitle`, `sessionBadges(tallyOf)`, `scanBadge(m, state, saved)`, `savedSub`, `scanFields`, `matchesScan` | rows, no-id rows' `[scanBadge(...)]`, search rows' `scanBadge` and sub | **F4** (no `SavedState` from `useSessions`), **F11** (sub formats). |
| 26 | T4–T9 | sessions API | `tallyOf`, `cardLine(t, failed)`, `countLine`, `sessionTitle`, `nextToCheck`, `scanBadge`, `savedSub` | header, card, rows ("Saved, Exported or Changed") | **F4**. |
| 27 | T4–T10 | `savedSub` | moved from `app/saved.tsx`'s `subOf` (exists, verified) | See invoices rows | No conflict. |
| 28 | T4–T11 | `useSessions`, `nextToCheck` | `nextToCheck(s, statuses, except?)` | `nextToCheck(group, statuses, scan.id)` | No conflict. |
| 29 | T4–T12 | `homeCounts`, `oldestWithWork`, `sessionTitle`, `countLine` | samples left out | Home's To check and Last session cards | No conflict. |
| 30 | T5–T6 | `TabBar`, tab names | `TabBar(props: BottomTabBarProps)`; `TabName` 'index'\|'sessions'\|'camera'\|'export'\|'profile'; reads `tabBarHideOnKeyboard` | `<Tabs tabBar=… screenOptions={{ tabBarHideOnKeyboard: true, sceneStyle }}>` with those five routes | No conflict (the fork's props have `emitter` and `navigateToTab`: verified). |
| 31 | T5–T7 | shutter, bar space | `setShutter(owner, { take, disabled })`, `currentShutter()`; `useTabBarSpace()` | registration on focus, cleared on blur/unmount; tray `paddingBottom: useTabBarSpace() + space.s` | No conflict. |
| 32 | T5–T8 | `useEndPadding` | adds `useTabBarSpace()` inside the tabs | Sessions' SectionList end padding | No conflict (see F5 for the formula). |
| 33 | T5–T9 | Screen end padding | as above | session screen | No conflict. |
| 34 | T5–T10 | count rule; end padding | Export count `waitingOf(null, savedList()).length` | step 1 subtitle `waitingOf(null, saved).length`; step buttons at the scroll's end | No conflict: one rule (T17-3). |
| 35 | T5–T12 | end padding; the middle button | the round button | "The round button at the bottom opens the camera." | No conflict. |
| 36 | T5–T13 | README ↔ bar | five icons, raised button, Export's count | README "The bar" bullet | No conflict. |
| 37 | T5–T15 | names and states | "Home"…"Profile", "Export, N to send", "Camera"/"Take photo", `tablist` | checks 5 and 7 | No conflict. |
| 38 | T6–T7 | `app/(tabs)/camera.tsx`, `lib/scanFlow.ts`, `camera.test.tsx`, `useNavigateOnce` | T6 moves the camera, drops Close, sets the StatusBar, reads push instead of replace, adds test 'a photo opens its Scan screen over the tabs' | T7 rewrites capture: no read, queue instead; deletes that test | **F6** (StatusBar). The push test is churn T7 deletes, but T6 needs it for its own commit: no conflict. |
| 39 | T6–T8 | `app/(tabs)/sessions/index.tsx`, `test-utils/routes.tsx` | stand-in "Sessions", no Back; Stack anchored on `index` | T8 replaces the stand-in | No conflict. |
| 40 | T6–T9 | `app/(tabs)/sessions/[id].tsx`; `useNavigateOnce` | stand-in "Session" | T9 replaces it | No conflict. |
| 41 | T6–T10 | `export/index.tsx`, `test-utils/routes.tsx` (`RouteFile` has 'saved'), `app/(tabs)/index.tsx`, `home.test.tsx`, Saved-based suites | stand-in with a "Saved" row pushing `/saved`; suites moved to `appRoutes` | T10 replaces the stand-in, removes 'saved', deletes `app/saved.tsx` | **F13** (suites T10 doesn't list still need Saved). |
| 42 | T6–T11 | root Stack, `toCamera`, `useNavigateOnce`, `scanFlow.ts` | Scan screen above the tabs; `toCamera` = `router.navigate('/camera')`, once | `retake` navigates the same way; Next invoice `router.replace` | No conflict. |
| 43 | T6–T12 | `app/(tabs)/index.tsx`, `home.test.tsx` | Take photo / Settings icon / "Set your export defaults" → `navigateOnce` | T12 rewrites Home | No conflict. |
| 44 | T6–T13 | leftovers | `/profile` replaces `/settings` | rg `'/settings'` expects nothing | No conflict. |
| 45 | T6–T14 | `+native-intent` | a launch with no route → `/camera` | step 2 "after the splash, the camera, with the bar" | No conflict. |
| 46 | T6–T15 | launch, cold links, Back | anchors and `backBehavior: 'initialRoute'` | checks 1 and 4 | No conflict. |
| 47 | T7–T9 | Done → session screen; Retake → camera | `navigateOnce({ pathname: '/sessions/[id]', params: { id } })` | T9 reads `id`; its Retake makes the camera continue that session with `replaces` | No conflict. |
| 48 | T7–T11 | Done's one photo; `sessionFlow.test.tsx` | push `/result` `{ id: scanId, session: id }`, no `from` | T11: "none: straight from a read (Done's one photo…)", `session` → in a session; adds a sessionFlow test | No conflict. |
| 49 | T7–T13 | README ↔ tray | tray, Done · N, "!" | README "The camera tab" bullet | No conflict. |
| 50 | T7–T14 | approach-2 branch; splash gate | `holdReads(true)` while live, `false` on blur and Done; camera waits for `useStarted()` | T14 flips the switch; expects the permission after the splash | No conflict. |
| 51 | T7–T15 | tray, Done | "Done · 10", "Reading N more…", thumbnail names | checks 2, 3, 7 | No conflict. |
| 52 | T8–T9 | `components/ListRow.tsx`, `display.test.tsx`; route | T8 adds `badges`; a row pushes `/sessions/[id]` | T9 uses `badge`; reads `id` | No conflict in the file. **F10**, **F11**. |
| 53 | T8–T11 | `from: 'list'` | Sessions rows/search push `/result` `{ id, from: 'list' }` | `back = from === 'list' \|\| …` | No conflict. |
| 54 | T8–T12 | call 11 | a no-id session opens its Scan screen (`from: 'list'`) | Home's Check now does the same | No conflict. |
| 55 | T8–T13 | README ↔ Sessions | rows by day, search | README "Sessions" bullet | No conflict. |
| 56 | T8–T15 | rows and labels | `rowTitle` "Camera photo 4:10 PM"; badges in row names | checks 7 and 8 | No conflict. |
| 57 | T9–T10 | `confirmDeleteSaved` | T9 wraps it in `confirmDeleteScan` | See invoices' long press calls it directly | No conflict between them. **F12** is inside T9. |
| 58 | T9–T11 | `/result` params; Back to session | rows and Check the next one push `{ id, from: 'session', session: id }` | T11's params; "Back to session" → `/sessions/[id]` | No conflict. |
| 59 | T9–T12 | `Card` | `Card({ title, body, tone, action, children })` | Home's six cards | No conflict. |
| 60 | T9–T13 | README ↔ session screen | Check the next one | README milestone 3 line | No conflict. |
| 61 | T9–T15 | banner, Retake/Remove | "1 photo couldn't be read. Retake it." with each entry's words; no-form row's Retake and Remove | check 3 | No conflict. |
| 62 | T10–T11 | `components/SaveSheet.tsx`, `save.test.tsx` | T10: View → `navigateOnce({ pathname: '/export/invoices', params: { kind } })` | T11: `inSession` drops View | No conflict; order fits. |
| 63 | T10–T12 | `app/(tabs)/index.tsx`, `home.test.tsx` | T10: To export links → `/export`, `/export/[which]` | T12's rewrite: "Go to Export" → `/export` | No conflict. |
| 64 | T10–T13 | leftovers | deletes `ExportSheet`, `app/saved.tsx` | rg `'/saved'\|ExportSheet` | No conflict. |
| 65 | T10–T15 | Export tab | step 1, a file step, See invoices, Share the file | checks 4, 5, 8 | No conflict. |
| 66 | T11–T12 | `from` values | `from?: 'session' \| 'list'` | Home's recent rows push `from: 'recent'` until T12 | **F16**. |
| 67 | T11–T13 | leftovers | `'recent'`/`'saved'` gone from result | rg `from: 'recent'\|from: 'saved'` (also catches `save.test.tsx:815`) | No conflict. |
| 68 | T12–T13 | leftovers; README | `RecentRow` deleted; Home's cards | rg `RecentRow`; README bullet | No conflict. |
| 69 | T13–T14 | `README.md` | sessions bullet | T14 amends it under approach 2 | No conflict. |
| 70 | T13–T15 | `README.md` | T13's sections | T15 adds "Checked on the emulator (camera first)" | No conflict. |
| 71 | T14–T15 | `/tmp/scan-appdata.tar`; data from before | "Keep the backup: Task 15 checks the update against it"; QA AVD data: samples + an unsaved `?test=` scan | "Back up first (README step 2)"; check 8 needs one to show in See invoices, export, and be deleted | **F19**, **F20**. |

---

## 2. Each task against itself

| Task | Tests vs the code it specifies | Files it creates vs files it later touches | Interfaces vs steps | Found |
|---|---|---|---|---|
| T1 | Traced every Kotlin case against Step 4's `waiting`/`clearSince` code and `CheckRate`'s window: all hold (e.g. null at 1000/1499 LOOKING, re-arm at 1500, HOLDING at 1600, capture at 2400; 10→false, 10→true). Jest: 101 scans → 100, `[99]` 'Scan 2'; KEEP_SCANS regex. | Line refs verified (`:277`, `:293`, `:230-245`, `:338-345`, `:149`, `:241`, `:375`, `:385`, `ScannerCameraView.tsx:10`, `cameraCopy.ts:13-18`, `scans.ts:9-13,82`, tests `:32`, `:145-152`); 32 existing Kotlin tests (counted). | Consistent. Step 4 uses a `rate` field and `Log` it doesn't declare; the class doc "After a photo it waits for reset()" needs a new line. Trivial. | None. |
| T2 | 'first capture… session.json follows' matches `takeCapture` touching on join; IDLE boundary (`- 1` false, `= IDLE_MS` true) matches "IDLE_MS or more"; Retake test's "a B that Done had ended keeps its failed reads" matches `retakeIn` keeping `failed` only for the current session. | Lines verified (`saved.ts:31-42,91-124`, `startup.ts:12-15`). | Consistent. | None in itself (F1 is with T3). |
| T3 | Tests match the rules (round-trip name, one at a time, delete after `scansWritten`, failed words, PDF in memory, resume twice adds nothing). "Pass unchanged apart from `failureDialog`'s import": only `scanFlow.test.ts` imports it (verified). | Consistent. | Consumes lists `takeCapture`, which no rule calls (T7 does): cosmetic. | **F2**. |
| T4 | 'a new scan runs the checks for itself only' spies on `saleOf`, but the rule keeps every scan going through `saleOf`'s cache. | Consistent. | `scanBadge` needs a `SavedState` that `useSessions` doesn't return. | **F3**, **F4**. |
| T5 | Layout test with a static `BottomTabBarHeightContext.Provider value={120}` expects the keyboard alone to pad, but `useTabBarSpace` reads only that context. | Consistent. | `useEndPadding`'s formula calls `useTabBarSpace()` inside a ternary branch. | **F5**. |
| T6 | Tests match. Existing `camera.test.tsx:467` (dark over the reading card) isn't in T6's camera-test changes, yet T6's StatusBar row would fail it. | Moves, stand-ins and the renamed suite are consistent. | The table's "Today: always light" is wrong (today `flow.reading ? 'dark' : 'light'`). | **F6**. |
| T7 | Tests match the rules. | Consistent (removes `scanUri` and the reading card). | "(`sayWhy`, as today)": `useScanFlow` doesn't return `sayWhy`; the "!" mark is text in a fixed 16 dp box; "all start with `takeCapture`" for pickers. | **F7**, **F8**, **F9**. |
| T8 | Tests match. | Consistent. | Search row sub `${kind} · ${number}`; no delete anywhere for a no-id unsaved scan. | **F10**, **F11**. |
| T9 | 'Check the next one, Retake and Remove run once' fits (Remove awaits the dialog; Retake is guarded by `navigateOnce`, and `retakeIn` twice is idempotent). | Consistent. | `confirmDeleteScan` "settles when the dialog closes" while "going through `confirmDeleteSaved`", which returns void with no close hook. | **F12**. |
| T10 | Tests match the screens. | `test-utils/routes.tsx` drops 'saved' and `app/saved.tsx` goes, but suites outside its Files still need them. "Unchanged from ExportSheet.tsx" while adding `lastSent`: trivial. | Step 2 lists "the error Banner, first" second. | **F13**, **F14**. |
| T11 | Tests match the rules. | Consistent. | Snackbar copy vs the spec's quote; `'recent'` dropped while Home still sends it; call 16's "just-saved" vs the rule's `saved === 'unchanged'`. | **F15**, **F16**, **F17**. |
| T12 | Tests match the cards' rules (first run = today's `recent.length === 0 && saved.length === 0`). | Consistent (`RecentRow` and its test deleted, nothing else imports `RecentRow`). | Consistent. | None. |
| T13 | n/a (gates only). | rg patterns match names T6/T7/T10/T11/T12 remove; it also catches `lib/saved.ts`'s "newest 20" comment and `save.test.tsx:815`, by design. | Consistent. | None. |
| T14 | n/a. | Consistent. | Measurement by line medians; the new QA AVD's data from before has no saved scan. | **F18**, **F19**. |
| T15 | n/a. | Consistent. | "Back up first" vs T14's kept backup; picker on a non-image; captures of old data. | **F19**, **F20**. |

---

## 3. Spec coverage (§6.1–§6.10, §7)

| Spec § | Task(s) | Note |
|---|---|---|
| §6.1 Routes and getting around | T6 (Tabs, anchors, `backBehavior`, `+native-intent`, root Stack), T5, T11, and `useNavigateOnce` users T7/T9/T10/T11/T12 | `initialRouteName` → anchor + native intent (call 1); expo-router 58's `Tabs` omits `initialRouteName` (verified), and the anchor becomes the navigator's initial route. |
| §6.2 The bar | T5 (+ T6 wiring; T15 checks 5 and 7) | Covered. |
| §6.3 The camera tab and the session | T1 (re-arm), T2 (session, 30 min, restart), T3 (queue, `files/queue/`, failed reads), T7 (tray, Done, leaving), T14 (approach) | Refined by calls 2, 4, 6, 7, 8. |
| §6.4 The session screen | T9 (+ T4), T11 (Next invoice, Back to session, snackbar), T10 (View → See invoices) | Calls 10, 14, 15, 16. F15, F17. |
| §6.5 Home | T12 (+ T4 counts, T9 Card) | Covered. |
| §6.6 Sessions | T8 (+ T4) | "Kind chips move to the Export tab" is met by T10's per-kind rows and See invoices (no chips). F10 from call 11. |
| §6.7 Export | T10 (+ T5 count) | Call 13 refines `export.tsx` to a folder. |
| §6.8 Profile | T6 | Call 17 refines "on blur". |
| §6.9 Data | T2 (`session?`, `session.json`), T1 (100), T13 (README sizes) | Covered. |
| §6.10 What moves or goes | T6, T7, T8, T10, T12, T13 | Covered. |
| §7 Checks | jest across T1–T12; emulator T14–T15; phone listed as not checked (T15 step 3) | F21 (§7 vs §5 on the `?test=` hook). |

---

## 4. The plan's calls against the spec's §8

The spec's §8 calls all map to tasks: 8.1→T5/T6, 8.2→T3/T7/T14 (call 21), 8.3→T9/T11, 8.4→T7, 8.5→T2/T7, 8.6→T1, 8.7→T8/T10, 8.8→T6, 8.9→T12, 8.10→T6, 8.11→T1, 8.12→T3, 8.13→T10.

| Plan call | Spec it settles | Contradicts §8? | Says so where it refines? |
|---|---|---|---|
| 1 Opening on the camera | §6.1 (`initialRouteName`) | No (§8.1 holds) | Explains why; doesn't name §6.1's `initialRouteName` line. No finding. |
| 2 Done keeps failed reads | §6.3, §8.12 | Refines 8.12 ("only while open") | Yes. |
| 3 Retake | §6.4, §8.3 | No | n/a |
| 4 What waits where | §6.3, §8.12 | Refines: a PDF waits in memory | Yes (reason given). |
| 5 Failed read words | silent | No | n/a |
| 6 "Taken" status | §6.3, §8.11, §4 | Extends §4's two native changes | Yes. §8.6's "the one native change" was already inconsistent with §4. |
| 7 Tray before the first photo | §6.3 | Refines "tray shows only while a session has a scan" | Yes. |
| 8 Camera tab | §6.1, §6.3 | No | n/a |
| 9 "N to check" | §6.4–§6.6 | No | Yes. |
| 10 A scan's badge | §6.4 | Refines the badge list | Yes. |
| 11 No-id scan → Scan screen | §6.6 | Refines "one-scan sessions" | Yes, but see F10. |
| 12 Saved beyond 100 | §6.6, §6.9 | No | n/a |
| 13 Export tab folder | §6.7, §8.13 | Refines `export.tsx` | Yes. |
| 14 View → See invoices | §6.4 | Refines "Export tab at that kind" | Yes. |
| 15 Snackbar words | §6.4 | Contradicts §6.4's quote "Saved as a sale." | No, and GC says quoted copy is final: **F15**. |
| 16 Scan screen in a session | §6.4, §8.3 | No | Wording vs T11: **F17**. |
| 17 Profile saves as typed | §6.8 | Refines "on blur" | Yes. |
| 18 Home | §6.5, §8.9 | No | n/a |
| 19 Bar tokens | §6.2 | No | n/a |
| 20 Icons | §2 | No | n/a |
| 21 Approach 2 switch | §5, §8.2 | No | n/a |
| 22 `router.navigate` for tabs | §6.1 (F-6's `usePushOnce`) | Refines | Yes. |
| 23 Session id format | §9 | No | n/a |
| 24 Font-size change closes a session | §6.3, §8.5 | Extends "restart" | Yes; side effect F1. |

---

## 5. Findings

Severity: **blocks execution** / **should be ruled before the owning task** / **minor**. None blocks execution.

**F1. Remount re-reads `recent.json` under a running queue (minor; T2/T3).**
- Plan lines: 103 (call 24), 422 (`loadSession` in `loadAppData`), 473 (`resumeQueue` in onReady), 528.
- Conflict: a font-size change re-runs BrandSplash → `loadAppData` → `loadRecent()`, which replaces `recent` from the file (`lib/scans.ts:220-235`). `readJson` doesn't wait for the per-file write queue (`lib/jsonFile.ts`). A scan the queue just added, whose write is still in flight, drops from memory, and the next save drops it from the file. Its photo is already deleted once the earlier write resolved. Review Focus 1 and the anti-goal "losing a scan" are at risk in that window.
- Resolution: rule one of these. `loadRecent` loads once per JS context, or merges in-memory scans newer than the file. Or `holdReads(true)` from the remount's `setStarted(false)` until onReady.

**F2. "None is read twice" can't hold across a kill (minor; T3).**
- Plan lines: 196 (Review Focus 1), 528, 540.
- Conflict: a kill after `recent.json` holds the scan but before the queued photo is deleted re-reads it at the next start. `resumeQueue` skips only files already queued in memory.
- Resolution: accept the window and say so in Review Focus 1, or name it as a known gap. A real dedupe needs a stored link, which the GC's stored-format exceptions don't allow.

**F3. T4's "one check" test spies on the cached entry point (should be ruled before T4).**
- Plan lines: 679 (checks run through `saleOf`/`certOf` and their per-scan cache) vs 696 (spy on `saleOf` sees one call after `addScan`).
- Conflict: `saleOf`'s cache is a WeakMap inside `saleOf` (`lib/sale.ts:131-146`). It is still called for all 51 scans, and again through `savedStateOf` → `rowsNow` → `summaryOf`. The test fails against the rule as written, or forces a second per-scan memo in `useSessions` that duplicates the cache.
- Resolution: spy on the uncached work (`finalize` in `lib/checks/finalize`, `check2307`), which runs only on a cache miss. Or assert that `saleOf` returns the same view objects for the 50 old scans. Keep one cache.

**F4. `scanBadge` needs a `SavedState` nobody provides (should be ruled before T4).**
- Plan lines: 629 (`scanBadge(m, state, saved: SavedState)`), 633 (`useSessions` returns `sessions`, `statuses`, `states` only), consumers 1043, 1051, 1120.
- Conflict: "Changed" needs `savedStateOf(scan, summary, annotation)`. `Status` ('saved'/'exported') can't carry it. A summary-only member has no scan to pass. T8 and T9 would each subscribe to annotation and recompute per row.
- Resolution: `useSessions` also returns `saved: ReadonlyMap<string, SavedState>` (a summary-only member → 'unchanged'), computed with the statuses. Or `scanBadge` takes the member and those maps.

**F5. `useEndPadding` and `useTabBarSpace` (minor; T5).**
- Plan lines: 772, 740, 794.
- Conflict (a): `(hasBottomBar ? 0 : Math.max(insets.bottom, useTabBarSpace()))` calls a hook in a conditional branch. `react-hooks/rules-of-hooks` (via `eslint-config-expo`) fails `npx expo lint`.
- Conflict (b): the layout test pins `BottomTabBarHeightContext` at 120 and expects only the keyboard with it up. `useTabBarSpace` reads only the context, so it gives 120 + keyboard.
- Resolution: call `useTabBarSpace()` unconditionally. Define it as `keyboard > 0 ? 0 : (context ?? 0)`, matching "0 … while it hides". Or make the test have the bar report 0.

**F6. The camera's StatusBar "today" is wrong, and T6 breaks an unlisted test (should be ruled before T6).**
- Plan line: 878 ("Today: always light").
- Conflict: today it's `flow.reading ? 'dark' : 'light'` (`app/camera.tsx:213`). `__tests__/camera.test.tsx:467` asserts dark over the reading card's wash (QA pass 1 measured light icons there at 1.44:1). The reading card lives until T7. T6's `{focused && <StatusBar style="light" />}` fails that test and design B §8 for T6's commit.
- Resolution: T6 writes `{focused && <StatusBar style={flow.reading ? 'dark' : 'light'} />}`. T7, which removes the reading card, drops the condition and test 467.

**F7. Where the camera's `sayWhy` comes from (should be ruled before T7).**
- Plan lines: 982 ("`sayWhy`, as today"), 931, 1009.
- Conflict: `sayWhy` is internal to `useScanFlow`, whose return (`lib/scanFlow.ts:285-297`) has `sayingWhy` but not `sayWhy`. T7 moves the camera's captures onto `lib/pickers.ts` and the queue, and lists no change that exposes it. Copying `sayWhy`'s Alert, `onDismiss` and `sayingWhy` logic into the camera is the duplication a reviewer flags.
- Resolution: rule that `useScanFlow` returns `sayWhy` (T7's Files add it), or move a `useSayWhy()` hook into `lib/readFailures.ts`. Both scanFlow and the camera use it.

**F8. The "!" mark is text in a fixed 16 dp box (minor; T7).**
- Plan lines: 960-963 vs GC 183-186 ("text is at least 12 sp… no fixed height around text").
- Conflict: at fontScale 2, a 12 sp "!" is about 24 dp, in a 16 dp mark.
- Resolution: draw the "!" as an SVG glyph, as the ✓ is (`Check`), not as `Text`.

**F9. `takeCapture` before a pick (minor; T7).**
- Plan lines: 970 ("the gallery, the camera app and a PDF all start with `takeCapture`") vs 411 (`takeCapture` clears `replaces`).
- Conflict: if it runs before the picker opens, a cancelled pick opens an empty session and spends a Retake's link. Spec §6.3 says a session starts with a pick, not a cancelled one.
- Resolution: call `takeCapture` once a pick returns a file. For Auto and the shutter, call it after the "not on top → discard" check.

**F10. Kept unsaved scans from before the update can't be deleted (should be ruled before T8).**
- Plan lines: 76 (call 11), 1045-1047 (T8 rows: press only), 140 (GC), 202 (Review Focus 2); spec §4.
- Conflict: GC and §4 say "scans kept or saved before it open, show, export and delete". A no-id scan skips the session screen (T9's long press and Remove). The Scan screen's ⋮ deletes saved scans only. Sessions rows and search rows have no long press. Saved ones delete through See invoices, but kept (unsaved) ones can't be deleted anywhere. New-session scans can.
- Resolution: give T8's no-id rows and search rows `onLongPress` → `confirmDeleteScan` (create it in T8, or move T9's helper ahead). Or add "Delete this scan" to the Scan screen's ⋮ for unsaved scans (T11). Or rule that "delete" means saved-only for scans from before.

**F11. Three sub-line formats for one scan (minor; T8/T9).**
- Plan lines: 1050 (T8 search: `` `${kind} · ${number}` ``), 1121 (T9: `Sale · SI 0000186`), 630 (`savedSub`: `Sale · Nov 22 · SI …`).
- Conflict: T8 and T9 each build the unsaved sub, in different shapes. `kind` is the lowercase `Kind`.
- Resolution: one helper in `lib/sessions.ts` (e.g. `scanSub(m)`), used by T8 and T9.

**F12. `confirmDeleteScan` can't settle for a saved scan (minor; T9).**
- Plan lines: 1104, 1127-1131.
- Conflict: it "settles when the dialog closes" but "goes through `confirmDeleteSaved`". That returns void and has no close or dismiss hook (`lib/confirmDelete.ts:11-23`). T9's Files don't change it.
- Resolution: resolve at once for saved scans (only a long press reaches them; Remove is for unsaved no-form rows). Or give `confirmDeleteSaved` an `onClosed` callback or promise, and list it in T9's Files.

**F13. Suites outside T10's Files still need Saved (should be ruled before T10).**
- Plan lines: 1164, 1167 vs 907-908 (T6 moves rootLayout and navigation to `appRoutes`; only adds a test to snackbarClearance).
- Conflict: `__tests__/snackbarClearance.test.tsx:51` does `require('../app/saved')`, and both its tests open `/saved` (:77). `rootLayout.test.tsx:55` cold-opens `/saved`. `navigation.test.tsx:32` pushes `/saved`. Once T10 deletes `app/saved.tsx` and drops 'saved' from `appRoutes`, `npm test` fails at T10's gate.
- Resolution: T10's Files add `snackbarClearance.test.tsx`: its two "over an empty Saved" tests move onto the Export tab or See invoices. T6's rewrites of rootLayout and navigation use a route that survives (e.g. `/lists`) in place of `/saved`.

**F14. Step 2's error banner is "first" but listed second (minor; T10).**
- Plan lines: 1199-1201.
- Conflict: the subtitle sentence comes before "the error Banner, first (T18-4)".
- Resolution: the banner goes first, then the sentence. Or the sentence goes in the Header's `subtitle`.

**F15. Snackbar copy vs "copy quoted in the spec is final" (should be ruled before T11).**
- Plan lines: 87 (call 15: "with no full stop") vs 179 (GC); spec §6.4 quotes "Saved as a sale." with its full stop, as it does "All saved.", which T4 keeps.
- Conflict: call 15 overrides quoted spec copy, and the GC forbids that.
- Resolution: rule one. Either the spec's "Saved as a sale." (then "Changes saved." too, and save.test's `VIEW` assertions change), or call 15 stands as an explicit exception to the GC.

**F16. `'recent'` is dropped while Home still sends it (minor; T11/T12).**
- Plan lines: 1252-1257 and 1285 vs Home's recent rows (`app/(tabs)/index.tsx`, from `app/index.tsx:147`), rewritten only in T12 (1306).
- Conflict: for T11's commit, Retake from a Home recent row goes to the camera instead of back.
- Resolution: T11 changes that one push to `from: 'list'` (and `home.test.tsx:396`). Or T11 keeps reading `'recent'` as `'list'` until T12.

**F17. "Just-saved" vs any saved scan (minor; T11).**
- Plan lines: 91 (call 16: "A just-saved scan's primary is Next invoice…") vs 1271 (rule: any `saved === 'unchanged'` scan in a session).
- Conflict: a scan saved earlier, opened from the session screen, also gets Next invoice.
- Resolution: rule which. T11's rule is simpler and matches §6.4's intent; then reword call 16.

**F18. The measurement's medians hide stalls (minor; T1/T14).**
- Plan lines: 332-335, 341-342 vs 1439.
- Conflict: `CheckRate` closes a window only when a check arrives. A 5 s stall is one line, and a median over lines under-weights it.
- Resolution: log the window's length too (`form checks/s` = n × 1000 / elapsed). Or have T14 compare total checks over total time per `reading` state. gfxinfo and the user's eyes still back the call.

**F19. Data from before, and the backup, between T14 and T15 (should be ruled before T14).**
- Plan lines: 1418 (new QA AVD: "two samples' worth of scans, plus a `?test=` scan kept unsaved") and 1428 ("Keep the backup") vs 1458 ("Back up first") and 1489 (check 8: "one shows in See invoices and exports, and one is deleted").
- Conflict: samples can't be saved, so that data has no saved scan for See invoices, export or (given F10) delete. T15's first step also rewrites the same `/tmp/scan-appdata.tar` T14 kept. It's equivalent only if nothing opened the app since T14's restore.
- Resolution: T14 also saves one or two `?test=` scans (a sale and a purchase) on master. T15 reuses T14's backup rather than taking a new one, or backs up under another name.

**F20. Two T15 checks rest on assumptions (minor; T15).**
- Plan lines: 1471-1472 and 1487-1489, with 1414 and GC 169.
- Conflict (a): check 3 assumes the gallery picker hands over `not_an_image.jpg`. If the media scan or picker refuses it, call 5 makes it a picker dialog, not a "!" thumbnail.
- Conflict (b): on the user's Medium_Phone AVD, check 8 captures "data from before", which may hold real scans. GC: QA captures hold samples or made-up data only.
- Resolution: (a) fall back to queueing the file with `run-as` into `files/queue/` as T14 does. (b) On the user's AVD, confirm the old scans are made-up before capturing, or skip check 8's captures.

**F21. Spec §7 vs §5 on the `?test=` hook, settled without a call (minor; spec/T14/T15).**
- Plan lines: 1432-1441 (T14 measures on the virtual camera), 1464-1469 (T15's 10-photo `?test=` session has no smoothness test).
- Conflict: §7 asks the 10-photo `?test=` session to show "the preview stays smooth". §5 says `?test=` "shows no live preview". The plan follows §5, correctly, but no numbered call records it.
- Resolution: add a call (or a ruling) saying §5 decides, and that §7's smoothness check is T14's virtual-camera measurement.

---

## 6. Code facts checked (so they needn't be checked again)

- Branch `camera-first` at 3720049, clean; `.superpowers/` is git-excluded (`.git/info/exclude:7`).
- Kotlin: `AutoCapture` has `taken`, `anchor`, `form`, `steady`, `since`; `onFrame(d, frameWidth, nowMs, auto)`; `CameraStatus { LOOKING, HOLDING, BLURRY, FOUND, CAPTURE }`. `setStatus` lowercases names except CAPTURE→"capturing", so TAKEN→"taken" needs no mapping. `debuggable`, `scannerModule()` and `SystemClock` exist; `Log` isn't imported. `ScannerModule.scan`/`readPdf`/`keepNewest`/`KEEP_SCANS = 20` are at the cited lines. `ERR_UNREADABLE_IMAGE` and the `pdf_*` codes exist. 32 `@Test`s across 7 files. The README's Tests section runs `:scanner:testDebugUnitTest`.
- expo-router 58.0.32: `expo-router/js-tabs` exports `BottomTabBarProps` (with `emitter`, `navigateToTab`), `BottomTabBarHeightContext` and `BottomTabBarHeightCallbackContext`. `Tabs` props omit `initialRouteName`; `unstable_settings.anchor` becomes the navigator's `initialRouteName`, and expo-router warns unless a non-stack navigator has `backBehavior: 'initialRoute'`. `sceneStyle` and `tabBarHideOnKeyboard` are options. `+native-intent`'s `redirectSystemPath({ path, initial })` gets the root URL at a plain launch. `expo-linking` 58.0.17 exports `unwrapDevLaunchURL`, and expo-linking is a dependency.
- App code: `usePushOnce` and `useGoBackOrHome` exist. `useScanFlow` returns no `sayWhy`. `PDF_REFUSED.pdf_password` is the words T3's test expects. `confirmDeleteSaved` returns void. `homeBadge`'s Saved is neutral today. `saleOf`/`certOf` cache in WeakMaps but are still called per scan. `ExportSheet.tsx` holds `FILES`, `chosen`, `XLSX_MIME`, `NOTHING`, `FIRST`, `MARK_FAILED`, `PARTIES_NOTE` and `Which` (not exported). `app/saved.tsx` has `subOf`. `writeJson` serialises per file but `readJson` doesn't wait. BrandSplash calls `onReady` after `preload()` and `loadAppData()`.
- Components and tokens the plan names exist: `ListRow` (`badge`, `onLongPress`, `subMono`, `subCaps`), `Button` (`loading`, promise guard), `EmptyState` (`title`, `body`, `actions`), `Header` (`subtitle`, `onBack: null`), `Banner` (`warning`/`danger`, `text`, `live`), `SectionHeader` (`right`, `action`), `IconButton` `tone="camera"`, icons `Camera`, `Check`, `Close`, `FileText`, `ImageIcon`, `Search`. Theme: `colors.chevron` is 3.74:1 on white, plus `warningTint`, `warningLine`, `camera`, `touch.thumbW/H` (36×48) and `elevation.overlay`.
- Test utilities exist: `memoryFs`, `pinToday`, `coreJson`, `contrast`, `keyboard(height)`, `typeStylesOf`; `parseScanResult` is in `modules/scanner/src/parse`.
- Fixtures T14/T15 name exist, `not_an_image.jpg` and `blank_page.png` included. The mockup has `i-house`, `i-files`, `i-send`, `i-user`. Scripts `check:apk` and `test:core` exist.
