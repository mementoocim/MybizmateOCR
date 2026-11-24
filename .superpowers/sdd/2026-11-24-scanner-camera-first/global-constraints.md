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

