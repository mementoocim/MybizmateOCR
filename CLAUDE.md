# MyBizMate Scan: notes for Claude

Claude Code reads this file at the start of every session in this repo. It carries what earlier sessions learned, so a new machine or a new Claude account can carry on. Also read `AGENTS.md` (Expo's guidance) and `README.md`.

## The project

- **MyBizMate Scan** is the client-facing Android app (iOS is milestone 9). It reads paper and PDF invoices (the MyBizMate Sales Invoice and the office Service Invoice) and BIR Form 2307, **offline, on the phone**. It turns them into rows for MyBizMate's Sales, Purchases and 2307 imports.
- **Stack:**
  - Expo SDK 58, React Native 0.88.1 (Fabric), expo-router 58.0.32, React 19.3, TypeScript 6, jest-expo;
  - a native module `modules/scanner`, in Kotlin with CameraX;
  - a C++ OCR core with PaddleOCR models through ONNX Runtime, and pdfium.
- **The MyBizMate web app** is mybizmate.io (Masters › import/export). Its database is the Supabase project `nbgqpptfgaumoitajhbp` ("bizmate-plus"), and it's **live production**:
  - read-only without the user's explicit OK;
  - only the public anon key may ever ship in the app.
- **The design docs, plans and rulings** are in `docs/`. Plans are executed task by task with a per-task review. The execution ledger, with every ruling, is in `.superpowers/sdd/<plan>/progress.md`.

## Working agreements with the user (binding)

**Language:** reply in English (the user's word, 2026-11-24). The user may write in Taglish. Written deliverables (docs, plans, READMEs, commits) are in English too.

**Git:**
- The user is the only developer and owns the repo. Merge into `master` and push **only at the user's word**, with **no pull requests**.
- Ask before switching branches in this checkout.
- Commit subjects follow the repo's style: `feat(app): …`, `fix(app): …`, `test(app): …`, `docs: …`, `feat(scanner): …`.

**This is the real product, not a test app:**
- Team tools stay out of client builds (`TEAM_BUILD`, in `lib/build.ts`).
- Data persists across updates: scans saved by earlier versions must still open, export and delete.
- Nothing leaves the phone.
- No names, TINs, amounts or photos in logs.

**No new dependency, native or JS,** without the user's OK and a Windows build check.

**Privacy:**
- Use only samples, `?test=` images and made-up data in captures, docs and tests.
- Real receipts are private: they live outside this repo (`prototype/data/real_private` on the old laptop) and never go to GitHub.

**Never use the global `router` from expo-router:**
- It breaks after an Android activity restart (ruling T26-4), and `__tests__/layers.test.ts` bans it.
- Go back with `useGoBackOrHome()`, and open screens with `usePushOnce()`, both in `lib/navigation.ts`.
- This overrides `AGENTS.md`'s "import `router`".

## Commands and gates

**Before every commit:** `npx tsc --noEmit`, `npx expo lint`, `npx eslint lib __tests__ test-utils`, `npm test`.
- `noLiterals` and `layers` must stay green.
- Check the console with `npx jest --ci --reporters=default`: Jest 30's AgentReporter hides console output when `CLAUDECODE` is set.
- A VirtualizedList `act()` warning is a known flake after `listsScreen` or `savedScreen`. Re-run once.

**Jest quirks:**
- jest runs as iOS: use `test-utils/typeStyles.ts`'s `typeStylesOf` for font checks;
- the mock window is 750 dp wide at fontScale 2.

**Kotlin:**
- From `android/`, run `./gradlew :scanner:testDebugUnitTest`.
- Set `JAVA_HOME` (Android Studio's `jbr`) and `ANDROID_HOME` first, as README's "Reinstalling without losing the app's data" shows.
- If files are locked, run `./gradlew --stop` and retry.

**C++ core:** `npm run test:core` needs a running emulator.

**Windows:**
- Builds use `plugins/with-windows-native-paths.js` (long paths). Don't use a git worktree: deeper paths break the build.
- Set `git config core.longpaths true`.

**The tool-harness quirk:** a backslash-u-hex sequence in a tool parameter turns into the literal character. Write a no-break space as the escape, build the backslash indirectly, and check the bytes with `od -c`.

## This repo has no .gitignore (the user's choice, 2026-11-24)

Everything is tracked except the Android build outputs, which are 9.3 GB and hold every file over GitHub's 100 MB limit. Those are kept out through `.git/info/exclude`, which git never pushes.

**On a fresh clone, put these lines into `.git/info/exclude` before any build:**

```
/android/app/build/
/android/app/.cxx/
/android/build/
/android/.gradle/
/android/.kotlin/
/modules/scanner/android/build/
/modules/scanner/android/.cxx/
/modules/scanner/cpp/tests/build/
node_modules/**/android/build/
node_modules/**/android/.cxx/
node_modules/**/android/.gradle/
```

Never `git add -A` without that list.

## Where things stand (2026-11-24)

**Done and on `master`:**
- milestones M1–M5 and M4;
- the UI pass "design B" (mybizmate.io's look: Schibsted Grotesk and IBM Plex Mono, coral `#FC7C4C`, ink and paper, light only).

**In progress: "camera first", from the boss's feedback on 2026-11-23.** The goal is to make the app super usable for someone who isn't technical.
- The app opens straight to the camera.
- A floating bottom bar has icons only, by the user's choice:
  - Home (`house`);
  - Sessions (`files`);
  - a raised coral Camera in the middle, which is the shutter on the camera tab;
  - Export (`send`, with a count);
  - Profile (`circle-user`).
- A **session** is the invoices taken one after another until Done.

**Its documents:**
- the spec, approved: `docs/2026-11-24-mybizmate-scan-camera-first-design.md`;
- the mockup the user approved: `docs/mockups/nav-camera-first.html`;
- the plan, 15 tasks: `docs/superpowers/plans/2026-11-24-scanner-camera-first.md`;
- the ledger: `.superpowers/sdd/2026-11-24-scanner-camera-first/progress.md`. It holds every ruling (pre-flight P-F1 to P-F21, T1-1, T2-1 to T2-3) and the task briefs and reports;
- `preflight-rulings.md`, beside the ledger, which carries each task's rulings.

**Its status:**
- Task 1 is done and reviewed: the camera keeps shooting, `rearm()`, 100 scans, and the debug counter.
- Task 2 is done and reviewed: the session store, and the scanner-folder rule.
- Task 3 is done and reviewed: the capture queue (`lib/captureQueue.ts`), the pickers and the read-failure words.
- Task 4 is done and reviewed: sessions from the scans (`lib/sessions.ts`) and search by scan.
- Task 5 is done and reviewed: the bar (`components/TabBar.tsx`), the shutter store (`lib/shutter.ts`), the four Lucide icons and `useTabBarSpace`.
- Task 6 is done and reviewed: the tabs (`app/(tabs)/`), a launch opens the camera (`app/+native-intent.tsx`), Back goes to the camera, Profile holds Settings, one open-guard per screen (`useOpenOnce`).
- Task 7 is done and reviewed: the camera tab shoots into a session (`app/(tabs)/camera.tsx`): the bar's middle button is the shutter, the session tray (`components/SessionTray.tsx`) and Done; a not-found Retake keeps the original (T7-3).
- Task 8 is done and reviewed: Sessions (`app/(tabs)/sessions/index.tsx`): a row per session by day with its badges (`ListRow`'s `badges`), search across scans, and one open at a time while a saved scan is read back; `memberAmount` in `lib/sessions.ts` is there for Task 9.
- Task 9 is done and reviewed: the session screen (`app/(tabs)/sessions/[id].tsx`, keyed on the id so each session mounts fresh): `components/Card.tsx` with Check the next one, the failed-reads Banner, the rows, Retake and Remove, and `confirmDeleteScan` in `lib/confirmDelete.ts` (for Task 11's ⋮ Delete). `useOpenOnce` gained `navigate`'s `before` and `busy()`.
  At the user's word (2026-11-25): no "Session · 0 invoices" line, and a Retake on the failed-reads Banner retries in the same session (`retryIn`, `retries` in session.json; T9-4 to T9-6).
- Task 10 is done and reviewed: the Export tab (`app/(tabs)/export/`: step 1, `[which]` for a file's steps 2–3, one at a time, and `invoices` for See invoices; `lib/exportSteps.ts`). `components/ExportSheet.tsx` and `app/saved.tsx` are gone. `useOpenOnce().navigate` decides from the live state (`tabsOnTop`). Don't merge to `master` before Task 11: a Scan screen opened with `from: 'list'` doesn't go back yet.
- **Task 11 is next**, on the branch `camera-first`, after the user reviews Task 10. Its brief isn't extracted yet: take it from the plan's Task 11 section. Open for the user: the save sheets' "Export it from Saved." (suggested "Send it from the Export tab.").

**The user's answers for this plan:**
- execution is subagent-driven, with a fresh implementer and a reviewer per task;
- OK to download Lucide's four icons at 1.77.0 in Task 5;
- the device tasks (14–15) run on a new QA Android emulator with made-up data only. Deleting it needs the user's OK.

**Also open:**
- **Sign-in like mybizmate.io's** ("Continue with Google", username, workspace). It was explored read-only in a separate session, and the user hasn't yet said what a signed-in person should be able to do in Scan. Both Google and username sign-in need changes in Supabase or Google Cloud, so ask first.
- **Android's teal system dialogs:** a native theme change, the user's call.
- **Phone checks:** listed in README's "Still open" sections.

## Paths from the old laptop

The plan, the ledger and older docs name absolute paths from the first laptop. Read them this way:
- `C:/Users/Mico/Desktop/OCR with python model with machine learning/mybizmate-ocr/…` is this repo.
- `…/OCR with python model with machine learning/docs/…` is this repo's `docs/…`.
- `…/.superpowers/brainstorm/…` (mockups, QA captures) stayed on the old laptop. The approved mockup is copied to `docs/mockups/`.
- `…/prototype/…` (the Python OCR prototype and the training notebook) isn't in this repo. Copy it by hand if it's needed, never with the private receipts.
- `docs/mybizmate-templates/`'s four `.xlsx` import templates stayed off GitHub. Their column notes come from a real company's data (its customer, supplier and account lists). Copy them by hand if they're needed; their README is here.
