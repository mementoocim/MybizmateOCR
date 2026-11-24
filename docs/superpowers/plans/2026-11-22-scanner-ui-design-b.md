# MyBizMate Scan UI/UX pass (design B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make MyBizMate Scan look and behave like mybizmate.io's own product on Android, as the approved design B says. That means one design system in `lib/theme.ts` with shared components, a reworked Scan screen (flags first, the invoice as a ledger, the photo in the header), and Home as a workspace. Every other screen is restyled with all of its states, and the app holds up at 200% font size, with 3-button navigation, and on a 360 dp phone.

**Architecture:** Tokens, type, space and motion live in `lib/theme.ts` and `lib/motion.ts`, extended in place.
- **Components:** a small set in `components/`. Where one exists today it is rewritten in place: `Buttons`, `Segmented`, `Chips` (which becomes `ChoiceChips`), `TextField`, `Sheet`, `ReadingOverlay`. The old exports stay as adapters until the cleanup task. Everything else is new.
- **Screens:** they move over one task at a time. Each one hides the native Stack header for its route and builds from `Screen` and `Header`.
- **Shared logic:** what more than one screen needs (a scan's state, which row a flag opens, formats, search) goes in small pure modules with jest tests.
- **Untouched:** nothing in `lib/checks`, the scanner, or the stored formats changes, apart from the exceptions named under Global Constraints.

**Tech Stack:**
- Expo SDK 58, React Native 0.88.1, React 19.3, TypeScript 6.
- expo-router 58 (one native Stack), `StyleSheet`, core `Animated`.
- react-native-svg 15.16 and react-native-safe-area-context 5.11.
- expo-font 58.0.12's config plugin (fonts embedded as Android XML font families).
- expo-haptics ~58.0.8, after the user's OK.
- jest-expo 58 and @testing-library/react-native 14.

**Spec:** `docs/2026-11-22-mybizmate-scan-ui-ux-design.md` (approved 2026-11-22), called "the design" below, with §-references to it. Read it with this plan. Also read:
- the directive `docs/2026-11-22-mybizmate-scan-ui-ux-directive.md`: §3 (must not change) and §11 (definition of done);
- milestone 4's rulings `docs/superpowers/plans/2026-11-22-scanner-m4-rulings.md`: annotation mode's behaviour, which this pass keeps exactly.

All paths in tasks are relative to `mybizmate-ocr/` unless they start with `docs/` or `.superpowers/`, which are in the parent folder (outside git).

## Calls this plan makes

The design leaves these to the builder (§11), or is silent or self-contradictory on them. The plan settles each one as follows, and the user can overrule any of them while reviewing.

1. **Fonts.**
   - Six static TTFs (Schibsted Grotesk 400/600/800, IBM Plex Mono 400/500/600) come from the `@expo-google-fonts/*` npm packages and are committed to `assets/fonts/`. The packages themselves are not dependencies.
   - expo-font's `android.fonts` turns them into two XML font families, `SchibstedGrotesk` and `IBMPlexMono`, so `fontWeight` picks the face.
   - iOS keeps the system font until milestone 9. One function, `face()` in `lib/theme.ts`, holds all of this.
2. **Haptics.** expo-haptics adds the VIBRATE permission. `performAndroidHapticsAsync` doesn't need it, so `app.json` blocks it.
3. **Splash.** The native splash background moves to the new paper, #FCFAF6, so the jump to the JS splash doesn't show. The logo asset stays.
4. **Snackbar hosts.** There's a host in the root layout, another inside every open sheet, and one inside the photo viewer. A message shows in the topmost one, so it's never hidden behind a modal (Review Focus 1).
5. **Times** keep today's 12-hour clock: "10:24 AM". The design's "10:24" examples are all morning times, and they'd be ambiguous for the afternoon.
6. **The kind switch's caption** keeps today's purchase sentence: "Another business issued it to you. It becomes a row in MyBizMate's Purchases import." §9.5 says "today's sentence" but quotes a paraphrase.
7. **Row reasons** keep today's words, as their own capitalised line ("Could also be read as Oct 28, 2026. Check the date.").
   - Amounts in rows drop the ₱ (§6 formats).
   - The ₱ stays on totals (Total due, Gross, a 2307's total rows) and in summaries.
8. **The not-found bar.**
   - "Choose a photo" (or "Choose a PDF") opens that picker again.
   - "Retake" opens the in-app camera.
   - A camera-app scan's Retake opens the camera app again. A scan opened from Home or Saved goes back, as today.
9. **Status strip sub-lines the design doesn't give:**
   - a saved, unchanged scan: "Look over the values";
   - a saved scan that changed: "Look over the values, then save the changes";
   - blocked: the headline is the reason, and the sub-line is "Can't save yet".
10. **A flag chip** scrolls its row into view, then opens it (what tapping the row does). The photo chips open the photo viewer.
11. **Home's badge** for a sample is "Sample" (neutral). For a scan whose form wasn't found it's "Couldn't find the form" (warning).
12. **"Get set up" goes away for good.** It keeps that in a new optional setting, `setupDone` (false by default; older settings files load with it). This is the one stored-format addition. It's optional and defaulted, like milestone 4's.
13. **Export's first step** lists every kind that has saved scans, with "N to export" or "All exported", plus the parties file when any party came from a scan. An all-exported kind can then still be exported again, as it can today.
14. **2307 rows show the tax on the right**, under the section's "Tax" column, with the row's total in the sub-line.
15. **Keyboards.**
    - Every non-text box (amounts, dates, quantities, TINs, digits, codes, numbers) uses Android's `visible-password` keyboard. It keeps every character available and adds a number row, with no suggestions.
    - Text boxes use the default keyboard.
    - Autocorrect is off everywhere.
16. **Capture failures** (a refused PDF, a picker failure, a failed read) become dialogs with today's messages (§9.2), not toasts.
17. **Licenses.**
    - Their texts ship as `.txt` assets that `scripts/collect-licenses.mjs` gathers.
    - Metro gets `txt` as an asset extension.
    - A test fails when a production dependency has no entry.
18. **New copy where the design gives none:**
    - the empty-tab bodies for suppliers and items;
    - the footnote's box count line ("24 boxes read.");
    - the payor sheet's line for an unsure or unlisted payor;
    - the Export summary line for 2307s.

    Each is quoted in its task.
19. **Annotation mode's layout** (§9.11).
    - The box editor's action row is Cancel · Looks right · Save. It stacks when it doesn't fit.
    - A training box shows its state badge (Not checked yet, Checked, Corrected) in place of "Edited".
    - The source-tag fields keep M4's two notes, under the Writer code field.
    - Behaviour is milestone 4's, exactly.

## Global Constraints

Every task's requirements include these.

**Where and how the work goes in**
- Work in `C:\Users\Mico\Desktop\OCR with python model with machine learning\mybizmate-ocr` itself, on branch `ui-design-b`, cut from master at 2413f54. No worktree: deeper paths break the Windows native build.
- Gates on every task: `npx tsc --noEmit`, `npx expo lint` and `npm test` all pass before its commit. `npm run test:core` isn't touched: it runs once, in Task 26.
- Merging into master and pushing happen only at the user's word, with no pull request. Commit subjects follow the repo's style (`feat(app): …`, `fix(app): …`, `test(app): …`, `docs: …`), and every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

**What must not change**
- The scanner: the C++ core, the models, the frame finders, the `modules/scanner` API and the capture logic. The one exception is `KEEP_SCANS` (6 → 20, Task 0).
- `lib/checks/*`.
- The stored formats of scans, saved scans, lists and settings. The one exception is the optional, defaulted `setupDone` setting (Task 17).
- The export files' layouts.
- The settled rules:
  - an edit means "the box says this";
  - samples can't be saved;
  - Gross is VAT-inclusive;
  - a customer not in the list goes out as written;
  - switching between sale and purchase drops the party;
  - scans are marked exported only after the person confirms.
- Annotation mode's behaviour (milestone 4's rulings).

**Dependencies and downloads**
- No new native dependency except these two:
  - expo-font's plugin config (expo-font is already in the build through `expo`);
  - expo-haptics, only after the user's OK in Task 0.
- `react-native-keyboard-controller` comes in only if Task 7's core approach fails on the emulator and the user OKs it.
- Every download happens in Task 0, after the user's OK:
  - the fonts and their OFL texts;
  - Lucide's icons and license;
  - the OpenCV, ONNX Runtime and PaddleOCR license texts.
- Downloaded files go into a new, empty folder in the session's scratchpad first.

**Product rules**
- Light theme only; no tab bar; English UI; portrait phones only.
- Privacy:
  - nothing leaves the phone;
  - no names, TINs, amounts or photos in logs;
  - never screenshot the photo picker;
  - QA captures hold samples or made-up data only;
  - a uiautomator dump is never of a screen showing a real scan.
- Team tools (the speed test, the training export, annotation mode, raw error messages, stage timings) stay behind `TEAM_BUILD`.

**Design rules**
- **Tokens only.** After Task 25, no hex color, `fontSize`, `fontFamily`, `fontWeight`, `lineHeight` or margin/padding number appears outside `lib/theme.ts`. A one-off optical nudge stays inline, on a line with an `// optical:` comment. Task 25's test enforces this.
- **Copy:**
  - the words in design §6;
  - copy in quotes in the design is final;
  - sentence case, except the `overline` and `badge` styles (which uppercase by style, so tests still find the sentence-case text);
  - no "OCR", "confidence", "AI" or "% sure".
- **Formats** (`lib/format.ts`):
  - amounts in rows: `amount()` → "5,810.50";
  - totals and summaries: `peso()` → "₱5,810.50";
  - dates: `prettyDate()` → "Oct 29, 2026";
  - short dates: `monthDay()` → "Nov 22";
  - times: `formatClock()` → "10:24 AM";
  - periods: `periodName()` → "Q1 2026".
- **Motion:** only the six in design §5.5, with core `Animated` and `useNativeDriver: true`. Reduced motion is respected (`useReducedMotion()`).
- **Touch and text:**
  - every target is at least 48×48 dp;
  - text is at least 12 sp;
  - there's no `allowFontScaling={false}`, no fixed height around text, and no `numberOfLines` on a value.

**The shared emulator.** emulator-5554 (Medium_Phone_API_36.1) is shared with other sessions. Before using it, check that no other session is using it: ask the user when unsure. Installs follow README "Reinstalling without losing the app's data".

## Review Focus

These are the failure modes the design implies but no feature test would catch on its own, most likely first. Each has its test in the task that owns the code.

1. **A message raised while a sheet or the photo viewer is open shows above it.** "Added to your customers." raised from the party sheet must not sit dimmed behind the sheet. (Task 8: the host stack. Task 10: the viewer's host.)
2. **Typing in the box editor survives store updates.** The scan, the lists or the settings may be replaced while the editor is open; the draft stays until Save, Cancel or Discard. (Task 13.)
3. **A double tap runs once.** This covers Save in the save sheets, Share the file, Mark as exported, Import CSV, and Try again on the splash. (Tasks 15, 18, 20 and 23.)
4. **Deleting from the ⋮ menu goes back cleanly.** A saved scan deleted from its ⋮ menu goes back to the screen it came from, without flashing "This scan is no longer here" and without crashing. (Task 11.)
5. **Long values and long lists show in full.** A 60-character party name, ₱12,345,678.90, 10 items and 8 payment rows render with no truncation. (Task 4 for the rows. Task 25's test bans `numberOfLines` in `app/` and `components/`.)

## File structure

**New**

| File | Responsibility |
|---|---|
| `lib/motion.ts` | `useReducedMotion()` |
| `lib/scanState.ts` | A scan's state, before and after saving: the status strip, Home's badge and the save banner all read it |
| `lib/flagTargets.ts` | Which row a flag chip's problem word opens |
| `lib/snackbar.ts` | The snackbar store, the host stack and the bottom clearance |
| `lib/search.ts` | Case- and accent-insensitive matching; TIN digits |
| `lib/haptics.ts` | `confirmHaptic()` (only if expo-haptics is OK'd) |
| `lib/licenses.ts` | The open-source entries and their text assets |
| `components/Tap.tsx` | The one pressable: ripple, focus ring, no fade |
| `components/IconButton.tsx` | |
| `components/Badge.tsx` | |
| `components/SectionHeader.tsx` | |
| `components/ListRow.tsx` | |
| `components/LedgerRow.tsx` | |
| `components/Banner.tsx` | |
| `components/EmptyState.tsx` | |
| `components/Screen.tsx` | |
| `components/Header.tsx` | |
| `components/BottomBar.tsx` | Also exports `ButtonPair` |
| `components/Menu.tsx` | |
| `components/Snackbar.tsx` | |
| `components/StatusStrip.tsx` | |
| `components/FlagChip.tsx` | |
| `components/PhotoViewer.tsx` | Also exports `PhotoThumb` |
| `components/InvoiceLedger.tsx` | The invoice's rows, moved out of `app/result.tsx` |
| `app/licenses.tsx` | |
| `plugins/with-config-changes.js` | |
| `scripts/collect-licenses.mjs` | |
| `metro.config.js` | |
| `test-utils/jestSetup.ts` | |
| `test-utils/contrast.ts` | |
| `assets/fonts/*` | The six TTFs and two OFL texts |
| `assets/licenses/*.txt` | |

**Rewritten in place:**
- in `lib/`: `theme.ts`, `toast.ts`, `share.ts` (split), `format.ts` (additions), `forms.ts` (`fieldType`), `scans.ts` (`KEEP`), `settings.ts` (`setupDone`), `versions.ts` (`BUILD_NUMBER`), `cameraCopy.ts`, `scanFlow.ts` (the reading source; failures become dialogs);
- in `components/`: `icons.tsx`, `Buttons.tsx`, `Segmented.tsx`, `Chips.tsx` (renamed `ChoiceChips.tsx`), `TextField.tsx`, `Sheet.tsx`, `ReadingOverlay.tsx`, `BoxSheet.tsx`, `RecentRow.tsx`, `CertificateSections.tsx`, `PartySheet.tsx`, `SupplierSheet.tsx`, `PartyPicker.tsx`, `TermsSheet.tsx`, `SaveSheet.tsx`, `ExportSheet.tsx`, `BrandSplash.tsx`, `TeamOnly.tsx`;
- every file in `app/`;
- the config and docs: `app.json`, `package.json`, `README.md`;
- `modules/scanner/android/src/main/java/expo/modules/scanner/ScannerModule.kt:378` (only `KEEP_SCANS`).

**Deleted** by their last task: `components/SaleRow.tsx`, `BoxRow.tsx`, `StatusCard.tsx`, `ScanImage.tsx` and `ScanIllustration.tsx`. Home's design has no illustration.

---

### Task 0: Native groundwork and the build check (the controller runs it; it needs the user's OKs)

This task changes the native build once, so every later task works on JS alone.

**Files:**
- Create: `assets/fonts/SchibstedGrotesk-Regular.ttf`, `assets/fonts/SchibstedGrotesk-SemiBold.ttf`, `assets/fonts/SchibstedGrotesk-ExtraBold.ttf`, `assets/fonts/IBMPlexMono-Regular.ttf`, `assets/fonts/IBMPlexMono-Medium.ttf`, `assets/fonts/IBMPlexMono-SemiBold.ttf`
- Create: `assets/fonts/OFL-SchibstedGrotesk.txt`, `assets/fonts/OFL-IBMPlexMono.txt`
- Create: `assets/licenses/lucide-ISC.txt`, `assets/licenses/opencv-Apache-2.0.txt`, `assets/licenses/onnxruntime-MIT.txt`, `assets/licenses/onnxruntime-ThirdPartyNotices.txt`, `assets/licenses/paddleocr-Apache-2.0.txt`
- Create: `plugins/with-config-changes.js`
- Modify: `app.json`, `package.json`, `package-lock.json`, `lib/scans.ts:9-13,74,203`, `modules/scanner/android/src/main/java/expo/modules/scanner/ScannerModule.kt:378` (and the comments there that say 6)
- Test: `__tests__/scans.test.ts:32-38`

**Interfaces:**
- Produces:
  - the font families `SchibstedGrotesk` (weights 400, 600, 800) and `IBMPlexMono` (400, 500, 600) on Android;
  - `expo-haptics` importable, if OK'd;
  - recent scans keep 20;
  - Lucide's 19 SVGs, saved in `<scratchpad>/ui-downloads/lucide/`, which Task 2 reads.
- Records the outcome for later tasks: `EMBEDDED_FONTS` (true or false) for Task 1, and `HAPTICS` (true or false) for Task 16.

- [ ] **Step 1: Branch.** Run `git -C mybizmate-ocr status --short` (expected: empty), then `git -C mybizmate-ocr switch -c ui-design-b`. Expected: `Switched to a new branch 'ui-design-b'` at 2413f54.

- [ ] **Step 2: Ask the user for three OKs** (one AskUserQuestion with three questions). Say that each download goes into a new, empty scratch folder first:
  1. **The fonts.**
     - `npm pack @expo-google-fonts/schibsted-grotesk` and `npm pack @expo-google-fonts/ibm-plex-mono`, from the npm registry. Only six `.ttf` files are copied into `assets/fonts/`, and nothing is added to `package.json`.
     - Each family's `OFL.txt` from github.com/google/fonts (`ofl/schibstedgrotesk/OFL.txt`, `ofl/ibmplexmono/OFL.txt`).
     - About 0.6 MB in all. Both fonts are OFL 1.1. Embedding them needs a native rebuild.
  2. **expo-haptics ~58.0.8** (a native module) for the one auto-capture haptic. Its VIBRATE permission is blocked in `app.json`.
  3. **The reference files the approved design needs:**
     - Lucide's 19 icon SVGs and its `LICENSE` (ISC), from github.com/lucide-icons/lucide at its latest release tag;
     - the license texts for OpenCV 5.1.0 (`LICENSE`), ONNX Runtime v1.32.0 (`LICENSE`, `ThirdPartyNotices.txt`) and PaddleOCR (`LICENSE`), each from its GitHub repo at that tag.

  **If the fonts are declined, or fail to build:** set `EMBEDDED_FONTS = false` for Task 1 and skip Steps 3 and 5's font parts. The app uses the system font at the same scale (§12 B1).

  **If haptics is declined or fails:** set `HAPTICS = false` and skip its parts. Task 16 then adds no haptic.

  **If the reference files are declined:** Task 2 can't swap the icons and Task 22 ships no third-party texts. Stop and tell the user, since the design needs both.

- [ ] **Step 3: Put the files in place.** Unpack each tarball in its own new folder under `<scratchpad>/ui-downloads/`, and copy:
  - `SchibstedGrotesk_400Regular.ttf`, `_600SemiBold.ttf` and `_800ExtraBold.ttf` → `assets/fonts/SchibstedGrotesk-{Regular,SemiBold,ExtraBold}.ttf`;
  - `IBMPlexMono_400Regular.ttf`, `_500Medium.ttf` and `_600SemiBold.ttf` → `assets/fonts/IBMPlexMono-{Regular,Medium,SemiBold}.ttf`;
  - the two `OFL.txt` → `assets/fonts/OFL-<Family>.txt`;
  - the license texts → the `assets/licenses/` names above;
  - the 19 SVGs (§5.4's list) → `<scratchpad>/ui-downloads/lucide/`, recording the tag in `<scratchpad>/ui-downloads/lucide/TAG`.

  Check: `ls assets/fonts` lists 8 files, and `ls assets/licenses` lists 5.

- [ ] **Step 4: Install.** Run `npx expo install expo-font`. It is already in the build through `expo`, and this makes its config plugin resolvable. Then, if OK'd, run `npx expo install expo-haptics`. Expected: `package.json` gains `"expo-font": "~58.0.12"` and `"expo-haptics": "~58.0.8"`.

- [ ] **Step 5: Configure `app.json` and add the config-changes plugin.**
  - In `expo.plugins`, add `["expo-font", { "android": { "fonts": [ … ] } }]` with two font objects:
    - `{ "fontFamily": "SchibstedGrotesk", "fontDefinitions": [ … ] }` with `{ "path": "./assets/fonts/SchibstedGrotesk-Regular.ttf", "weight": 400 }` and the same for SemiBold (600) and ExtraBold (800);
    - `{ "fontFamily": "IBMPlexMono", "fontDefinitions": [ … ] }` with Regular (400), Medium (500) and SemiBold (600).
  - `"./plugins/with-config-changes"` after `"./plugins/with-windows-native-paths"`.
  - `expo.android.blockedPermissions: ["android.permission.VIBRATE"]` (with haptics).
  - expo-splash-screen's `backgroundColor`: `"#FCFAF6"`.
  - `plugins/with-config-changes.js` (in the style of `plugins/with-windows-native-paths.js`, with a header comment on why):
    - use `withAndroidManifest` and `AndroidConfig.Manifest.getMainActivityOrThrow`;
    - append `fontScale` and `density` to MainActivity's `android:configChanges` when they're missing;
    - running it twice changes nothing.

- [ ] **Step 6: Recent scans keep 20.**
  - Write the failing test. In `__tests__/scans.test.ts`, the test `'keeps the newest 6, newest first'` becomes `'keeps the newest 20, newest first'`. Add 21 scans (`Scan 1` … `Scan 21`) and expect:

    ```ts
    expect(recent).toHaveLength(20);
    expect(recent[0].label).toBe('Scan 21');
    expect(recent[19].label).toBe('Scan 2');
    ```

  - Run `npx jest __tests__/scans.test.ts -t "newest 20"`. Expected: FAIL (length 6).
  - Set `KEEP = 20` in `lib/scans.ts` and `const val KEEP_SCANS = 20` in `ScannerModule.kt`, and change every comment there that says 6 to say 20.
  - Run `npx jest __tests__/scans.test.ts`. Expected: PASS.

- [ ] **Step 7: Build and check the APK.** Use README "Reinstalling without losing the app's data", step 1 (`./gradlew assembleDebug -PreactNativeArchitectures=x86_64` with JAVA_HOME and ANDROID_HOME). Expected: BUILD SUCCESSFUL. Then check:
  - `npm run check:apk`: exit 0;
  - `"$SYSTEMROOT/System32/tar.exe" -tf android/app/build/outputs/apk/debug/app-debug.apk | grep -i "res/font"` lists the six font files;
  - the merged manifest's MainActivity `configChanges` includes `fontScale` and `density`: `aapt2 dump xmltree --file AndroidManifest.xml <apk>` (aapt2 from the newest build-tools, as `scripts/check-apk.mjs` finds it);
  - with haptics, the permissions `check:apk` lists don't include VIBRATE (`aapt2 dump permissions <apk>`).

  If the fonts break the build, take them out (Step 2's fallback) and build again.

- [ ] **Step 8: Device check** (once the emulator is free). Do the README reinstall's steps 2 to 4 (back up, uninstall, install, restore), then start Metro (`npx expo start --dev-client`) and open the app.
  - (a) Home opens and the 5 saved scans are there.
  - (b) **Font-size changes.** Open "Sample 0051" (Try a sample) → tap Date → "Fix it". Tap the field and run `adb shell input text TEST`. Then run `adb shell settings put system font_scale 1.3` and take a screenshot to the scratchpad.
    - **Pass:** the sheet is still open with "TEST", and its text is larger.
    - **Activity restarted** (the sheet is gone): the plugin didn't take. Check the manifest.
    - **Sheet kept, text not larger:** remove the plugin from `app.json`, delete the file, rebuild, and record "font-size changes restart the screen" for the report (§8).

    Restore the setting with `adb shell settings put system font_scale 1.0`.

- [ ] **Step 9: Gates and commit.** Run `npx tsc --noEmit && npx expo lint && npm test`. Expected: all pass. Then:

  ```bash
  git add app.json package.json package-lock.json plugins/with-config-changes.js assets/fonts assets/licenses lib/scans.ts __tests__/scans.test.ts modules/scanner/android/src/main/java/expo/modules/scanner/ScannerModule.kt
  git commit -m "feat(app): embedded fonts, the capture haptic, font-size changes in place, and 20 recent scans"
  ```

- [ ] **Step 10: Report to the user.** Tell them what was OK'd and what was built, and the font-size result. Also tell them the APK size change (`ls -l` of the APK before and after).

---

### Task 1: Theme: color roles, type, space, shape, ripple and motion

**Files:**
- Modify: `lib/theme.ts` (rewrite; keep `bold` and `sectionLabel` as they are, marked `/** @deprecated design B: removed in Task 25 */`)
- Create: `lib/motion.ts`, `test-utils/contrast.ts`
- Test: `__tests__/theme.test.ts` (rewrite), `__tests__/motion.test.tsx`

**Interfaces:**
- Produces:

```ts
// lib/theme.ts
export const colors: {
  ink: '#1A1512'; mute: '#5A5147'; paper: '#FCFAF6'; panel: '#FFFFFF'; sand: '#F2ECDF';
  line: '#1A151224'; hairline: '#1A151214'; outline: '#918B84';
  brand: '#FC7C4C'; brandPressed: '#E26331'; brandText: '#B13E03'; brandTint: '#FFF1EB'; focus: '#DE602E';
  success: '#3E7A52'; successTint: '#EEF6F0';
  warning: '#8F5300'; warningTint: '#FCEFD9'; warningLine: '#8F53004D'; flag: '#B8741A';
  danger: '#CC2827'; dangerTint: '#FDECEB'; dangerLine: '#CC282773';
  chevron: '#8A837C'; scrim: '#1A151273'; wash: '#FCFAF6DB'; crop: '#F4F1EB';
  camera: '#000000'; cameraPanel: '#221C18'; cameraText: '#FFFFFF'; cameraMute: '#D8D2CB';
  pill: '#1A1512C7'; viewer: '#161310';
  // retired, kept until Task 25 so unmigrated screens still build:
  coral; ember; coralText; coralTint; pine; pineTint; amber; amberTint; imageBg; cropBg; fullScreen; backdrop;
};
export const space: { xs: 4; s: 8; m: 12; l: 16; xl: 24; xxl: 32 };
export const radius: { badge: 4; field: 6; button: 10; panel: 10; sheet: 16; pill: 999 };
export const touch: { target: 48; chip: 40; icon: 24; iconSmall: 20; shutter: 72; thumbW: 36; thumbH: 48 };
export const EMBEDDED_FONTS: boolean; // Task 0's outcome
export function face(family: 'grotesk' | 'mono', weight: 400 | 500 | 600 | 800): TextStyle;
export const type: Record<
  'title' | 'headerTitle' | 'headline' | 'value' | 'body' | 'button' | 'buttonLarge' | 'label'
  | 'figure' | 'figureStrong' | 'figureSmall' | 'overline' | 'badge',
  TextStyle
>;
export const ripple: Record<'light' | 'brand' | 'camera' | 'icon' | 'iconCamera', PressableAndroidRippleConfig>;
export const elevation: { overlay: 8 };
export const durations: { sheetIn: 250; sheetOut: 200; scrim: 200; menu: 150; snackbar: 200; strip: 150; card: 150 };
// lib/motion.ts
export function useReducedMotion(): boolean;
// test-utils/contrast.ts
export function contrast(fg: string, bg: string): number; // WCAG 2.2; an 8-digit fg is composited over bg first
```

- [ ] **Step 1: Write the failing tests** in `__tests__/theme.test.ts`:
  - `'every color role has its design value'`: `expect(colors).toMatchObject({...})` with the values above.
  - `'the documented pairs meet their thresholds'`: a table test over these pairs, each with `expect(contrast(fg, bg)).toBeCloseTo(figure, 1)` and `toBeGreaterThanOrEqual(threshold)`:

    ```ts
    const PAIRS: [string, string, string, number, number][] = [
      // [fg, bg, name, design figure, threshold]
      ['ink', 'paper', 'text', 17.37, 4.5], ['ink', 'panel', 'text', 18.1, 4.5], ['ink', 'sand', 'text', 15.38, 4.5],
      ['mute', 'paper', 'text', 7.45, 4.5], ['mute', 'panel', 'text', 7.77, 4.5], ['mute', 'sand', 'text', 6.6, 4.5],
      ['outline', 'panel', 'boundary', 3.37, 3], ['outline', 'paper', 'boundary', 3.23, 3],
      ['ink', 'brand', 'label', 7.01, 4.5], ['ink', 'brandPressed', 'label', 5.23, 4.5],
      ['brandText', 'paper', 'text', 5.66, 4.5], ['brandText', 'panel', 'text', 5.9, 4.5],
      ['brandText', 'brandTint', 'text', 5.35, 4.5], ['brandText', 'sand', 'text', 5.01, 4.5],
      ['focus', 'panel', 'boundary', 3.61, 3],
      ['success', 'successTint', 'text', 4.64, 4.5], ['success', 'panel', 'text', 5.11, 4.5],
      ['warning', 'warningTint', 'text', 5.43, 4.5], ['warning', 'panel', 'text', 6.17, 4.5],
      ['flag', 'panel', 'boundary', 3.78, 3], ['chevron', 'panel', 'icon', 3.74, 3],
      ['danger', 'panel', 'text', 5.38, 4.5], ['danger', 'paper', 'text', 5.16, 4.5], ['danger', 'dangerTint', 'text', 4.71, 4.5],
      ['cameraText', 'cameraPanel', 'text', 16.84, 4.5], ['cameraMute', 'camera', 'text', 14.0, 4.5],
      ['brand', 'cameraPanel', 'ring', 6.52, 3], ['paper', 'ink', 'selection', 17.37, 4.5],
    ];
    ```

    `cameraText` on `pill`, composited over white, is `toBeCloseTo(9.04, 1)` (§5.1: "even over a white preview").
  - `'type follows the scale'`. Each style's `fontSize`/`lineHeight`:

    | Style | fontSize / lineHeight |
    |---|---|
    | title | 20/26 |
    | headerTitle | 18/24 |
    | headline | 17/22 |
    | value | 15/20 |
    | body | 15/22 |
    | button | 15/20 |
    | buttonLarge | 16/20 |
    | label | 13/18 |
    | figure | 15/20 |
    | figureStrong | 17/22 |
    | figureSmall | 13/18 |
    | overline | 12/16 |
    | badge | 12/16 |

    Every `fontSize` ≥ 12. `overline` and `badge` have `textTransform: 'uppercase'`. Letter spacing: `title` −0.4, `overline` 1.44, `badge` 0.48.
  - `'face picks the families'`. With `EMBEDDED_FONTS` true on Android, `face('grotesk', 800)` equals `{ fontFamily: 'SchibstedGrotesk', fontWeight: '800' }` and `face('mono', 500)` equals `{ fontFamily: 'IBMPlexMono', fontWeight: '500' }`.

  In `__tests__/motion.test.tsx`, `'useReducedMotion follows the setting and its change'`:
  - mock `AccessibilityInfo.isReduceMotionEnabled` to resolve `true`, and capture the `reduceMotionChanged` listener;
  - the hook returns `true`, then `false` after the listener is called with `false`.

- [ ] **Step 2: Run them to see them fail.** Run `npx jest __tests__/theme.test.ts __tests__/motion.test.tsx`. Expected: FAIL. `test-utils/contrast` and `lib/motion` don't exist yet.

- [ ] **Step 3: Implement.**
  - **`test-utils/contrast.ts`:** relative luminance per WCAG 2.2, with sRGB channels linearised at 0.04045. An 8-digit color is alpha-composited over the background before measuring.
  - **`lib/theme.ts`:**
    - the values above;
    - `face()` follows `EMBEDDED_FONTS`. On Android with the fonts embedded: `{ fontFamily: family === 'grotesk' ? 'SchibstedGrotesk' : 'IBMPlexMono', fontWeight: String(weight) }`. Otherwise (iOS, or the fonts declined): `{ fontFamily: family === 'mono' ? 'monospace' : undefined, fontWeight: String(weight) }` on Android, and `{ fontWeight: String(weight) }` elsewhere;
    - `type` built from `face()`, with no color in it;
    - `ripple`:

      | Key | Color | Bounds |
      |---|---|---|
      | `light` | `#1A15121A` (ink 10%) | |
      | `brand` | `#1A151229` (ink 16%) | |
      | `camera` | `#FFFFFF33` (white 20%) | |
      | `icon` | ink 10% | `borderless: true, radius: 24` |
      | `iconCamera` | white 20% | `borderless: true, radius: 24` |

    - the header comment names design B §5 as the source. The old `// The test app's colors.xml` comment goes.
  - **`lib/motion.ts`:** `useReducedMotion()` uses `AccessibilityInfo.isReduceMotionEnabled()` and the `reduceMotionChanged` event, and removes its subscription on unmount.

- [ ] **Step 4: Run the tests.** Run `npx jest __tests__/theme.test.ts __tests__/motion.test.tsx`. Expected: PASS. Then run the gates; they pass, since no screen uses a removed key.

- [ ] **Step 5: Commit.** `git add lib/theme.ts lib/motion.ts test-utils/contrast.ts __tests__/theme.test.ts __tests__/motion.test.tsx`, with the message `feat(app): design B's color roles, type scale, space, ripple and reduced motion`.

---

### Task 2: Lucide icons

**Files:**
- Modify: `components/icons.tsx` (rewrite), and every importer of a renamed icon: `app/index.tsx`, `app/camera.tsx`, `app/result.tsx`, `app/settings.tsx`, `components/StatusCard.tsx`, `components/RecentRow.tsx`, `components/TermsSheet.tsx`, `components/ScanImage.tsx`, `components/SaleRow.tsx`
- Test: `__tests__/icons.test.tsx`

**Interfaces:**
- Consumes: the SVGs in `<scratchpad>/ui-downloads/lucide/` and its `TAG` (Task 0).
- Produces:

```ts
export type IconProps = { size?: number; color: string; strokeWidth?: number }; // size 24, strokeWidth 2
export type IconComponent = ComponentType<IconProps>;
export const ArrowLeft, Close /* x */, ListIcon /* list */, SettingsIcon /* settings */, Camera, ImageIcon /* image */,
  FileText, ChevronRight, Lock, Flashlight, FlashlightOff, Share, More /* ellipsis-vertical */, Search,
  TriangleAlert, CircleCheck, CircleAlert, Download, Check: IconComponent;
export const Bolt: IconComponent; // today's Material path, kept only until Task 16 replaces the Auto control
```

- [ ] **Step 1: Write the failing test** `__tests__/icons.test.tsx`:
  - `'every glyph is a Lucide stroke icon'`. For each of the 19 exports, render it with `color="#123456"`. Use `UNSAFE_getByType(Svg)`:
    - `props.fill` is `'none'`, `props.stroke` is `'#123456'`, `props.strokeWidth` is `2`;
    - `props.width` is 24;
    - `props.importantForAccessibility` is `'no-hide-descendants'`.
  - `'the dropped glyphs are gone'`: `expect(icons).not.toHaveProperty('FlashOn')`, the same for `'FlashOff'`, `'ArrowBack'`, `'DocumentIcon'`, `'CheckCircle'` and `'ErrorCircle'`.

- [ ] **Step 2: Run** `npx jest __tests__/icons.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement.**
  - One `lucide(...children: ReactElement[])` factory renders `<Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>`.
  - Each glyph's `path`, `circle`, `rect`, `line` and `polyline` elements are copied exactly from Lucide's SVG at the recorded tag.
  - A header comment names Lucide, its tag and ISC. The notice itself ships in Task 22.
  - Rename the importers: `ArrowBack` → `ArrowLeft`, `DocumentIcon` → `FileText`, `CheckCircle` → `CircleCheck`, `ErrorCircle` → `CircleAlert`, and the camera's `FlashOn` → `Flashlight` and `FlashOff` → `FlashlightOff`.

- [ ] **Step 4: Run** `npx jest __tests__/icons.test.tsx`, then the gates. Expected: PASS.

- [ ] **Step 5: Commit** with the message `feat(app): Lucide icons, as on mybizmate.io`.

---

### Task 3: Tap, Button and IconButton

**Files:**
- Create: `components/Tap.tsx`, `components/IconButton.tsx`
- Modify: `components/Buttons.tsx` (rewrite: `Button` plus adapters)
- Test: `__tests__/buttons.test.tsx`

**Interfaces:**
- Consumes: `colors`, `type`, `space`, `radius`, `touch`, `ripple` (Task 1); `IconComponent` (Task 2).
- Produces:

```ts
// components/Tap.tsx: every pressable in the app goes through this
export function Tap(props: PressableProps & {
  ripple?: keyof typeof ripple | 'none';  // default 'light'
  focusRadius?: number;                   // the focus ring's corner radius; default radius.button
}): JSX.Element;
// components/Buttons.tsx
export type ButtonVariant = 'primary' | 'secondary' | 'text' | 'destructive' | 'destructiveText';
export type ButtonProps = {
  label: string;
  onPress: () => void | Promise<unknown>;
  variant?: ButtonVariant;                // default 'primary'
  size?: 'large' | 'default';             // min height 56 / 48; both grow with the label
  icon?: IconComponent;
  disabled?: boolean;
  loading?: boolean;
  testID?: string;
  accessibilityHint?: string;
};
export function Button(props: ButtonProps): JSX.Element;
/** @deprecated adapters, removed in Task 25 */
export function PrimaryButton(p: Omit<ButtonProps, 'variant'>): JSX.Element;   // variant 'primary'
export function OutlinedButton(p: Omit<ButtonProps, 'variant'>): JSX.Element;  // variant 'secondary'
export function TextButton(p: Omit<ButtonProps, 'variant'> & { color?: string }): JSX.Element; // 'text'; color === colors.ember → 'destructiveText'
// components/IconButton.tsx
export function IconButton(props: {
  icon: IconComponent; label: string; onPress: () => void;
  tone?: 'light' | 'camera';               // ink icon with the icon ripple / cameraText icon with iconCamera
  accessibilityRole?: 'button' | 'switch'; checked?: boolean; // a switch's state
  disabled?: boolean; testID?: string; accessibilityHint?: string;
}): JSX.Element;
```

- [ ] **Step 1: Write the failing tests** `__tests__/buttons.test.tsx`:
  - **`'a primary button: brand fill, ink label, role button'`:** the button has `toHaveStyle({ backgroundColor: colors.brand })`, and its label text `toHaveStyle({ color: colors.ink })`.
  - **`'secondary, text, destructive and destructiveText look as the design says'`:**

    | Variant | Fill | Border | Label |
    |---|---|---|---|
    | secondary | `panel` | 1 dp `outline` | `ink` |
    | text | none | none | `brandText` |
    | destructive | `panel` | `dangerLine` | `danger` |
    | destructiveText | none | none | `danger` |

  - **`'disabled: sand fill, mute label, no press'`:** `accessibilityState.disabled` is true, and `onPress` isn't called.
  - **`'loading keeps the label, shows a spinner and blocks presses'`:** `getByTestId('save-spinner')` (`${testID}-spinner`); the label is still shown; `accessibilityState` is `{ busy: true, disabled: true }`; a press doesn't call `onPress`.
  - **`'a press that returns a promise runs once until it settles'`:**
    - `onPress = jest.fn(() => new Promise((r) => (resolve = r)))`;
    - two presses → called once, and the spinner shows;
    - after `resolve()`, a third press calls it again.
  - **`'large is at least 56 dp, default 48, and neither has a fixed height'`:** `minHeight` 56 or 48, and `height` is undefined.
  - **`'IconButton is a labelled 48 dp target, and a switch carries its state'`:**
    - `getByRole('button', { name: 'Settings' })` with `width`/`height` 48;
    - with `accessibilityRole="switch" checked`, `getByRole('switch', { name: 'Flashlight' })` has `accessibilityState.checked` true.
  - **`'Tap shows a 2 dp focus ring while focused'`:** `fireEvent(tap, 'focus')` → `getByTestId('focus-ring')` has `toHaveStyle({ borderWidth: 2, borderColor: colors.focus })`; `fireEvent(tap, 'blur')` removes it.
  - **`'the adapters map to variants'`:** `TextButton` with `color={colors.ember}` renders the destructiveText label color.

- [ ] **Step 2: Run** `npx jest __tests__/buttons.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement.**
  - **`Tap`:** a `Pressable` with `android_ripple={ripple[key]}`, `focusable`, and `onFocus`/`onBlur` driving an absolute-fill `View` (`testID="focus-ring"`, `pointerEvents="none"`). It has no opacity change. It passes `accessibilityRole` and the other props through.
  - **`Button`:**
    - It uses `Tap`, with the brand ripple on primary.
    - The pressed fill is `brandPressed` on primary, so iOS shows something too.
    - The label uses `type.button` (`buttonLarge` at size large). An icon is 20 dp, in the label's color.
    - It's a horizontal row with `gap: space.s`, `paddingHorizontal: space.l`, `borderRadius: radius.button`, and a `minHeight`.
    - `text` and `destructiveText` have `minHeight: touch.target`, and their hit area is at least 48.
    - The internal `pending` state is set while a returned promise is unsettled. `loading || pending` shows an `ActivityIndicator` (the label's color) before the label.
  - **`IconButton`:** a 48×48 `Tap` with the `icon` or `iconCamera` ripple and a 24 dp icon. `accessibilityState={{ checked }}` is set when it's a switch.
  - **Adapters:** as in Interfaces. The existing screens keep working through them, now restyled.

- [ ] **Step 4: Run** `npx jest __tests__/buttons.test.tsx`, then the gates. Existing screen tests find buttons by role and name, which don't change. Expected: PASS.

- [ ] **Step 5: Commit** with the message `feat(app): one pressable with ripple and focus ring, design B's buttons and icon buttons`.

---

### Task 4: Display components: Badge, SectionHeader, ListRow, LedgerRow, Banner, EmptyState

**Files:**
- Create: `components/Badge.tsx`, `components/SectionHeader.tsx`, `components/ListRow.tsx`, `components/LedgerRow.tsx`, `components/Banner.tsx`, `components/EmptyState.tsx`
- Modify: `lib/format.ts` (add `amount`, `monthDay`)
- Test: `__tests__/display.test.tsx`, `__tests__/format.test.ts`

**Interfaces:**
- Consumes: the theme (Task 1), icons (Task 2), `Tap` and `Button` (Task 3).
- Produces:

```ts
// lib/format.ts
export function amount(v: number | null): string;  // "5,810.50"; "—" for null; "-12.30"
export function monthDay(isoDate: string): string; // "2026-11-22" → "Nov 22"
// components
export type BadgeTone = 'warning' | 'success' | 'brand' | 'neutral' | 'danger';
export type BadgeSpec = { label: string; tone: BadgeTone };
export function Badge(props: BadgeSpec): JSX.Element;
export function SectionHeader(props: {
  title: string;
  right?: string | null;                                // "Amount", "0 of 2"
  action?: { label: string; onPress: () => void } | null; // "All saved ›"
}): JSX.Element;
export function ListRow(props: {
  title: string; sub?: string | null; subMono?: boolean; subCaps?: boolean;
  leading?: ReactNode;                                  // a sample's thumbnail, a check
  amount?: string | null; badge?: BadgeSpec | null;     // trailing, the badge under the amount
  chevron?: boolean; checked?: boolean;
  onPress?: () => void; onLongPress?: () => void;
  accessibilityHint?: string; testID?: string;
}): JSX.Element;
export const LedgerRow: ForwardRefExoticComponent<{
  label?: string;                                       // the key ("Date"); none on item rows
  value: string | null;
  valueStyle?: 'value' | 'figure' | 'figureStrong';     // default 'value'
  badge?: BadgeSpec | null;                             // beside the value: the 2307 quarter
  sub?: string | null; subMono?: boolean;               // "2 × 110.00"
  reason?: string | null;                               // shown only when flagged, in warning
  amount?: string | null; amountStrong?: boolean;       // the right column
  flagged?: boolean; edited?: boolean;
  onPress?: () => void; accessibilityHint?: string;     // default hint "Opens what the camera saw"
  testID?: string;
} & RefAttributes<ViewInstance>>;
export function Banner(props: { tone: 'warning' | 'danger'; text: string }): JSX.Element;
export function EmptyState(props: {
  title: string; body?: string;
  actions?: readonly { label: string; onPress: () => void; variant?: ButtonVariant }[];
}): JSX.Element;
```

- [ ] **Step 1: Write the failing tests.**

  In `__tests__/format.test.ts`:
  - `'amount: rows without the peso sign'`. Expect:

    | Call | Result |
    |---|---|
    | `amount(5810.5)` | `'5,810.50'` |
    | `amount(12345678.9)` | `'12,345,678.90'` |
    | `amount(-12.3)` | `'-12.30'` |
    | `amount(null)` | `'—'` |

  - `'monthDay'`: `monthDay('2026-11-22')` is `'Nov 22'`, and `monthDay('2026-01-05')` is `'Jan 5'`.

  In `__tests__/display.test.tsx`:
  - **Badge.** `'Badge: caps mono text on its tone'`: `getByText('To export')` with `toHaveStyle({ color: colors.brandText, textTransform: 'uppercase' })`, on a `brandTint` view.

    The tone colors (text on fill):

    | Tone | Text | Fill |
    |---|---|---|
    | warning | `warning` | `warningTint` |
    | success | `success` | `successTint` |
    | brand | `brandText` | `brandTint` |
    | neutral | `mute` | `sand` |
    | danger | `danger` | `dangerTint` |

  - **SectionHeader.** `'SectionHeader: a header with its right side or action'`:
    - `getByRole('header', { name: 'Items · 3' })`;
    - `getByText('Amount')`;
    - with an action, `getByRole('button', { name: 'All saved' })` calls `onPress`.
  - **ListRow.** `'ListRow speaks its badge as part of the row'`:
    - with title `'Camera photo'`, sub `'10:24 AM · Service invoice'` and badge `{ label: '2 to check', tone: 'warning' }`, `getByRole('button', { name: 'Camera photo, 10:24 AM · Service invoice, 2 to check' })`;
    - the badge view has `importantForAccessibility="no-hide-descendants"`;
    - without `onPress`, the row has no button role.
  - **LedgerRow, flagged.** `'a flagged LedgerRow: bar, Check badge, reason, and its spoken label'`:
    - with `{ label: 'Date', value: 'Oct 29, 2026', reason: 'Could also be read as Oct 28, 2026. Check the date.', flagged: true, onPress }`, there's `getByTestId('flag-bar')` with `toHaveStyle({ width: 3, backgroundColor: colors.flag })`;
    - `getByText('Check')`;
    - the reason in `colors.warning`;
    - `getByRole('button', { name: 'Date, Oct 29, 2026. Check: could also be read as Oct 28, 2026. Check the date.' })`;
    - the hint is `'Opens what the camera saw'`.
  - **LedgerRow, edited.** `'an edited LedgerRow says so'`: `getByText('Edited')`, and the name ends with `', edited'`.
  - **LedgerRow, unflagged.** `'an unflagged LedgerRow with a press shows a chevron; a reason shows only when flagged'`.
  - **LedgerRow, empty value.** `'an empty value reads as a dash, and blank to TalkBack'`.
  - **Long values (Review Focus 5).** `'long values are never cut'`: a 60-character value and `amount(12345678.9)` render in full. `getByText(longValue).props.numberOfLines` is `undefined`, and so is the amount's.
  - **Banner.** `'Banner: role alert, tone fill and border'`: danger uses `dangerTint`/`danger`; warning uses `warningTint`/`warningLine`.
  - **EmptyState.** `'EmptyState: a title, its body, and its actions'`.

- [ ] **Step 2: Run** `npx jest __tests__/display.test.tsx __tests__/format.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement.**
  - **Badge:**
    - `type.badge`, `radius.badge`;
    - `paddingHorizontal: space.s - 2` with `// optical:`;
    - a 1 dp border of the text color at 30% (a new token `badgeLine(tone)` isn't needed: use `warningLine` for warning and `line` for the others).
  - **SectionHeader:**
    - a `sand` strip, `paddingVertical: space.s`, `paddingHorizontal: space.l`;
    - the title in `type.overline` `mute`, with `accessibilityRole="header"`;
    - the right side in `type.overline` `mute`;
    - the action: a `Tap` with `type.overline` `brandText`, the text `${label} ›`, and `accessibilityLabel={label}`.
  - **ListRow:**
    - a `panel` row (a `Tap` when pressable), `paddingVertical: space.m`, `paddingHorizontal: space.l`, a hairline bottom;
    - the title in `type.value` `ink`;
    - the sub in `type.label` `mute`, or `type.figureSmall` when `subMono` (uppercase when `subCaps`);
    - trailing: the amount in `type.figure`, with the badge under it, then a 20 dp `chevron`, or `Check` in `success` when `checked`;
    - spoken label: `[title, sub, amount, badge?.label].filter(Boolean).join(', ')`; `accessibilityState={{ checked }}` when `checked` is given.
  - **LedgerRow:**
    - `flexDirection: 'row'`, `flexWrap: 'wrap'`;
    - the key in `type.label` `mute` at its natural width;
    - the value block with `flexGrow: 1, flexBasis: '50%'`. The value moves under the key exactly when the key takes more than half the row: §11's "measured by layout";
    - the value in `valueStyle`, with the badge after it;
    - under the value: the sub, then the reason (only when flagged), in `type.label` `warning`;
    - the right column: the amount (`type.figure`, or `figureStrong` when `amountStrong`), then the Check or Edited badge, or a chevron when pressable;
    - flagged: an absolute 3 dp `flag` bar on the left (`testID="flag-bar"`);
    - spoken label: `[label, value ?? 'blank', badge?.label, sub, amount].filter(Boolean).join(', ')`, then:
      - when flagged: `. Check: ${lowerFirst(reason)}`, or just `. Check` with no reason;
      - when edited and not flagged: `, edited`;
    - forward the ref to the outer `View`, for the chips' scroll and the sheet's focus return.
  - **Banner:** a row with `TriangleAlert` (warning) or `CircleAlert` (danger) at 20 dp, then `type.body` in the tone color. `radius.panel`, 1 dp border, `accessibilityRole="alert"`.
  - **EmptyState:** centered. `type.title` `ink`, `type.body` `mute`, `gap: space.m`. The actions are `Button`s (the first defaults to primary).

- [ ] **Step 4: Run** `npx jest __tests__/display.test.tsx __tests__/format.test.ts`, then the gates. Expected: PASS.

- [ ] **Step 5: Commit** with the message `feat(app): badges, section strips, list and ledger rows, banners and empty states`.

---

### Task 5: Screen, Header and BottomBar (system bars, insets and the keyboard)

**Files:**
- Create: `components/Screen.tsx`, `components/Header.tsx`, `components/BottomBar.tsx`, `test-utils/jestSetup.ts`
- Modify: `package.json` (`jest.setupFiles`), `components/Buttons.tsx` (`onLabelLines`)
- Test: `__tests__/layout.test.tsx`

**Interfaces:**
- Consumes: `Button`, `ButtonProps`, `IconButton` (Task 3); icons (Task 2).
- Produces:

```ts
// components/Header.tsx
export function Header(props: {
  title?: string; subtitle?: string | null;
  brand?: boolean;                       // Home: the logo and "mybizmate.io" in place of a title
  onBack?: (() => void) | null;          // default router.back() (import { router } from 'expo-router'); null: no back button
  backIcon?: 'back' | 'close';           // spoken "Back" or "Close"
  right?: ReactNode;                     // up to two IconButtons, or the photo thumbnail
  tone?: 'light' | 'dark';               // dark: the photo viewer (viewer fill, cameraText)
}): JSX.Element;
// components/Screen.tsx
export function Screen(props: {
  header: ReactNode;
  pinned?: ReactNode;                    // under the header, outside the scroll (the Scan screen's strip)
  bottom?: ReactNode;                    // a BottomBar
  children?: ReactNode;
  scroll?: boolean;                      // default true; false: the screen brings its own FlatList/SectionList
  scrollRef?: RefObject<ScrollView | null>;
  testID?: string;
}): JSX.Element;
export function useKeyboardHeight(): number;            // 0 while hidden (Keyboard didShow/didHide)
export function useScrollIntoView(): (target: ViewInstance | TextInputInstance | null) => void; // the nearest ScrollIntoViewScope's (a Screen opens one)
export function ScrollIntoViewScope(props: { scrollRef: RefObject<ScrollViewInstance | null> | null; children?: ReactNode }): JSX.Element; // a sheet, menu or viewer opens its own (null: no scroll), since context passes through a Modal
export function useEndPadding(hasBottomBar: boolean): number; // for screens with their own list
// components/BottomBar.tsx
export function ButtonRow(props: { buttons: readonly ButtonProps[] }): JSX.Element;
export function BottomBar(props: { buttons: readonly ButtonProps[]; children?: ReactNode }): JSX.Element;
// components/Buttons.tsx: ButtonProps gains
onLabelLines?: (lines: number) => void; // from the label's onTextLayout
```

- [ ] **Step 1: Set up the safe-area mock for every test.**
  - Create `test-utils/jestSetup.ts` with `jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);`.
  - In `package.json`, set `"jest": { "preset": "jest-expo", "setupFiles": ["<rootDir>/test-utils/jestSetup.ts"] }`.
  - Run `npm test`. Expected: PASS, with nothing else changed. `__tests__/camera.test.tsx`'s own mock still overrides it.

- [ ] **Step 2: Write the failing tests** `__tests__/layout.test.tsx`. Its own `jest.mock` of `react-native-safe-area-context` gives `useSafeAreaInsets: () => ({ top: 24, bottom: 34, left: 0, right: 0 })` and passes `SafeAreaProvider` through.
  - **`'Header: the title is a header, the subtitle an overline, back goes back'`:**
    - `getByRole('header', { name: 'Saved' })` and `getByText('5 to export')`;
    - `getByRole('button', { name: 'Back' })` calls `onBack`;
    - `backIcon="close"` gives `'Close'`;
    - `onBack={null}` gives no back button;
    - the header view has `paddingTop` 24.
  - **`'Header brand: logo and wordmark'`:** `getByText('mybizmate')` and `getByText('.io')`, in `colors.brandText`.
  - **`'Screen pads the end of its scroll by the bottom inset when it has no bottom bar'`:** the ScrollView's `contentContainerStyle` has `paddingBottom` of 34 + 24 (`space.xl`).
  - **`'BottomBar pads by the inset and sits on a hairline'`:** `paddingBottom` 12 + 34, and a `borderTopColor` of `colors.hairline`.
  - **`'ButtonRow puts two buttons side by side, and stacks them, primary last, when a label wraps'`:**
    - two buttons give `flexDirection: 'row'`;
    - `fireEvent(getByText('Save purchase'), 'textLayout', { nativeEvent: { lines: [{}, {}] } })` gives `flexDirection: 'column'`, with the primary as the last child;
    - rerendering with other labels gives `row` again.

- [ ] **Step 3: Run** `npx jest __tests__/layout.test.tsx`. Expected: FAIL.

- [ ] **Step 4: Implement.**
  - **Header:**
    - `panel` fill (`viewer` when dark), with `paddingTop: insets.top`;
    - a row at `minHeight: touch.target + space.s`, `paddingHorizontal: space.xs`, with a hairline bottom (light only);
    - the title in `type.headerTitle`, wrapping, with `accessibilityRole="header"`; the subtitle in `type.overline` `mute`;
    - brand: `require('../assets/brand/logo_mark.png')` at 30 dp, then "mybizmate" and ".io" in `type.headerTitle`.
  - **Screen:**
    - a `paper` root; the header, then the pinned content, then the ScrollView (`keyboardShouldPersistTaps="handled"`), then `bottom`;
    - with no bottom bar, the end padding is `insets.bottom + space.xl + keyboardHeight`;
    - `useScrollIntoView` comes from a context Screen provides. It measures the target relative to the scroll content (`measureLayout`) and scrolls it to `y - space.xl`;
    - `useKeyboardHeight` listens to `keyboardDidShow`/`keyboardDidHide` (`endCoordinates.height`) and removes its listeners on unmount.
  - **ButtonRow:**
    - side by side, with `gap: space.m`; flex is 1 for primary, 0.8 for secondary and destructive, and the text buttons' natural width;
    - `stacked` becomes true when any `onLabelLines` reports more than 1 line;
    - it's remembered per `${labels.join('|')}|${width}|${fontScale}` (`useWindowDimensions`), so a stacked row doesn't flip back and forth;
    - when stacked, the buttons are full width in the given order, which puts the primary last.
  - **BottomBar:** a `panel` fill with a hairline top, `paddingHorizontal: space.l`, `paddingTop: space.m` and `paddingBottom: space.m + insets.bottom`. `children` (a saved line, say) sits above the ButtonRow.
  - **Button:** pass `onTextLayout={(e) => onLabelLines?.(e.nativeEvent.lines.length)}` to its label.

- [ ] **Step 5: Run** `npx jest __tests__/layout.test.tsx`, then the gates. Expected: PASS.

- [ ] **Step 6: Commit.** `git add components/Screen.tsx components/Header.tsx components/BottomBar.tsx components/Buttons.tsx test-utils/jestSetup.ts package.json __tests__/layout.test.tsx`, with the message `feat(app): screens own their header, insets and keyboard; bottom bars that stack at large text`.

---

### Task 6: Inputs: Segmented, ChoiceChips and TextField

**Files:**
- Modify: `components/Segmented.tsx` (rewrite), `components/TextField.tsx` (rewrite)
- Rename: `components/Chips.tsx` → `components/ChoiceChips.tsx` (export `ChoiceChips`), updating its importers `components/SaveSheet.tsx`, `components/ExportSheet.tsx` and `app/settings.tsx`
- Modify: the two `Segmented` call sites, to give a `label`: `app/result.tsx:283` (`label="This invoice is"`) and `app/lists.tsx:152` (`label="List"`)
- Test: `__tests__/inputs.test.tsx`. Update the tests that find these controls by role `button`: `__tests__/result.test.tsx`, `__tests__/certificate.test.tsx`, `__tests__/parties.test.tsx`, `__tests__/listsScreen.test.tsx`, `__tests__/save.test.tsx`, `__tests__/settingsScreen.test.tsx`, `__tests__/savedScreen.test.tsx` → role `radio`, with `checked` in place of `selected`.

**Interfaces:**
- Consumes: `Tap`, the theme, `useScrollIntoView` (Task 5), icons.
- Produces:

```ts
export function Segmented<T extends string>(props: {
  options: readonly { value: T; label: string }[]; value: T; onChange: (v: T) => void;
  label: string;                         // the radio group's spoken name
  tone?: 'light' | 'dark';               // dark: the photo viewer
}): JSX.Element;
export function ChoiceChips<T extends string>(props: {
  label: string; options: readonly { value: T; label: string }[]; value: T | null; onChange: (v: T) => void;
  helper?: string | null; showLabel?: boolean; // default true; false: Saved's filter (spoken only)
}): JSX.Element;
export function TextField(props: {
  label: string; value: string; onChangeText: (t: string) => void;
  placeholder?: string; helper?: string | null; warning?: string | null; error?: string | null;
  mono?: boolean; keyboardType?: KeyboardTypeOptions; autoCapitalize?: TextInputProps['autoCapitalize'];
  onFocus?: () => void; onBlur?: () => void; autoFocus?: boolean;
  leading?: IconComponent;               // Search
  clearLabel?: string;                   // an x IconButton with this name while there's text
  hideLabel?: boolean;                   // search fields: the label is spoken, not shown
  testID?: string; inputRef?: Ref<TextInput>;
}): JSX.Element;
```

- [ ] **Step 1: Write the failing tests** `__tests__/inputs.test.tsx`:
  - **`'Segmented is a labelled radio group with an ink selection'`:**
    - `getByRole('radiogroup', { name: 'List' })`;
    - `getByRole('radio', { name: 'Suppliers 2' })` with `accessibilityState.checked` true when chosen;
    - the chosen option has `backgroundColor: colors.ink` and its label `color: colors.paper`;
    - the group has a 1 dp `colors.outline` border, `radius.field`, and options with `minHeight` 48 and no `height`.
  - **`'Segmented dark: for the photo viewer'`:** the chosen fill is `colors.cameraText` with an ink label; the others are `cameraText` on none.
  - **`'ChoiceChips: pills that wrap, ink when chosen, a helper under them'`:**
    - `getByRole('radio', { name: 'Zero-rated' })`;
    - pressing it calls `onChange('ZERO')`;
    - the chip has `minHeight` 40 and `hitSlop` at least 4;
    - `getByText('Suggested from the invoice\'s VAT boxes')`;
    - with `showLabel={false}`, the label isn't shown but names the group.
  - **`'TextField: label, outline, focus border, and one note under it'`:**
    - at rest: `borderWidth` 1, `outline`;
    - after `fireEvent(input, 'focus')`: `borderWidth` 2, `focus`;
    - error beats warning beats helper: only the error text shows, in `danger`;
    - the input's `accessibilityHint` is the note shown;
    - `autoCorrect` is false;
    - `mono` uses `type.figure`'s `fontFamily`.
  - **`'TextField: a search field with a clear button'`:**
    - `leading={Search}` and `clearLabel="Clear the search"` show `getByRole('button', { name: 'Clear the search' })` only while `value` isn't empty;
    - pressing it calls `onChangeText('')`.
  - **`'TextField scrolls itself into view when focused inside a Screen'`:** render it in `<Screen header={null}>` with the ScrollView's `scrollTo` mocked. `fireEvent(input, 'focus')` calls the Screen's scroll-into-view, which the test spies through the context.

- [ ] **Step 2: Run** `npx jest __tests__/inputs.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement.**
  - **Segmented:**
    - a View with `accessibilityRole="radiogroup"` and `accessibilityLabel={label}`;
    - each option is a `Tap` with `accessibilityRole="radio"` and `accessibilityState={{ checked }}`, `minHeight: touch.target`, and `type.button`; labels wrap;
    - outline border, `radius.field`, `padding: 2`.
  - **ChoiceChips:**
    - the same radio semantics;
    - pills: `radius.pill`, 1 dp `line` border, `panel` fill, `type.label` `ink`, `minHeight: touch.chip`, `hitSlop` 4;
    - chosen: `ink` fill, `paper` label;
    - they wrap with `gap: space.s`;
    - the label is `type.label` `mute` above; the helper is `type.label` `mute` below.
  - **TextField:**
    - the label is `type.label` `mute` above; the field has `minHeight: touch.target`, `radius.field`, `panel` fill, `paddingHorizontal: space.m`;
    - text is `type.body` (or `type.figure`) `ink`; the placeholder is `mute`;
    - one note below: `error` (`danger`, with `CircleAlert` 16), else `warning` (`warning`, with `TriangleAlert` 16), else `helper` (`mute`);
    - `autoCorrect={false}` always;
    - on focus: the focus border, then `useScrollIntoView()(ref)`.
  - Rename and fix the importers. Update the tests listed under Files to the radio role.

- [ ] **Step 4: Run** `npm test`. Expected: PASS. Then run the other gates.

- [ ] **Step 5: Commit** with the message `feat(app): radio-group toggles and chips with ink selection, fields with a focus border and notes`.

---

### Task 7: Sheet and Menu

**Files:**
- Modify: `components/Sheet.tsx` (rewrite)
- Create: `components/Menu.tsx`
- Test: `__tests__/sheet.test.tsx`

**Interfaces:**
- Consumes: `ButtonRow`, `ButtonProps`, `useKeyboardHeight` (Task 5); `IconButton`; `useReducedMotion`; the theme.
- Produces:

```ts
export function Sheet(props: {
  visible: boolean; title: string; subtitle?: string | null; onClose: () => void;
  children?: ReactNode;
  actions?: readonly ButtonProps[];      // the action row, pinned above the keyboard and the bottom inset
  dirty?: boolean;                       // typed input would be lost: back, close and the scrim ask first
  onBack?: (() => void) | null;          // a step's back: a Back button in the title row; system back calls it
  returnFocus?: RefObject<ViewInstance | null>;  // TalkBack focus goes back here on close
  testID?: string;
}): JSX.Element;
export function confirmDiscard(onDiscard: () => void): void; // the prompt, shared with the box editor's Cancel paths
export function Menu(props: {
  visible: boolean; anchor: RefObject<ViewInstance | null>;
  items: readonly { label: string; onPress: () => void; destructive?: boolean }[];
  onClose: () => void;
}): JSX.Element;
```

- [ ] **Step 1: Write the failing tests** `__tests__/sheet.test.tsx`:
  - **`'a sheet: its title is a header, Close closes it, and so does system back'`:**
    - `getByRole('header', { name: 'Terms' })`;
    - `getByRole('button', { name: 'Close' })` calls `onClose`;
    - `UNSAFE_getByType(Modal).props.onRequestClose()` calls `onClose`;
    - there's no drag handle (`queryByTestId('sheet-handle')` is null).
  - **`'the scrim closes it and is hidden from TalkBack'`:** `getByTestId('sheet-scrim')` has `importantForAccessibility="no-hide-descendants"`, and pressing it calls `onClose`.
  - **`'a dirty sheet asks before typing is lost'`:**
    - `jest.spyOn(Alert, 'alert')`;
    - Close → `Alert.alert('Discard what you typed?', undefined, [ { text: 'Keep editing', style: 'cancel' }, { text: 'Discard', style: 'destructive', onPress: expect.any(Function) } ])`;
    - pressing Discard's `onPress` calls `onClose`; Keep editing calls nothing;
    - the scrim and system back ask the same way.
  - **`'a step sheet: Back and system back go back a step'`:** with `onBack`, `getByRole('button', { name: 'Back' })` and `onRequestClose` call `onBack`, not `onClose`.
  - **`'its actions are pinned under the scroll'`:** the `actions` buttons render outside the ScrollView (`getByTestId('sheet-actions')`).
  - **`'the panel: up to 90% of the screen, 16 dp top corners, padded by the bottom inset'`:**
    - the panel style has `maxHeight` `'90%'`, `borderTopLeftRadius` 16;
    - the actions view has `paddingBottom` of `space.m` plus the mock's bottom inset.
  - **`'Menu: anchored items, destructive in danger, back closes'`:**
    - `getByRole('menuitem', { name: 'Delete saved scan' })` in `colors.danger`;
    - pressing it calls `onClose`, then `onPress`;
    - `onRequestClose` calls `onClose`.

- [ ] **Step 2: Run** `npx jest __tests__/sheet.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement.**
  - **Sheet, the Modal:**
    - an RN `Modal` with `transparent`, `animationType="none"`, `statusBarTranslucent` and `navigationBarTranslucent`;
    - an internal `shown` state keeps the Modal up through the closing animation.
  - **Sheet, motion:**
    - the scrim (`colors.scrim`) fades over `durations.scrim`;
    - the panel slides from below over `durations.sheetIn` (in, `Easing.out(Easing.cubic)`) and `durations.sheetOut` (out);
    - with reduced motion, both only fade.
  - **Sheet, layout:**
    - the panel: `panel` fill, `borderTopLeftRadius`/`borderTopRightRadius` `radius.sheet`, `maxHeight: '90%'`, `elevation: elevation.overlay`;
    - the title row: Back (when `onBack`), then the title (`type.title`, `accessibilityRole="header"`, wraps), then Close;
    - the subtitle: `type.body` `mute`;
    - the body: a ScrollView with `keyboardShouldPersistTaps="handled"`, wrapped in `ScrollIntoViewScope` with that ScrollView's ref, so its fields scroll the sheet, never the Screen behind it (Task 5's fix);
    - the actions: a `ButtonRow` in a view with `paddingHorizontal: space.l` and `paddingBottom: space.m + insets.bottom + keyboardHeight` (RN 0.88 reports the keyboard height above the navigation bar; ruling T5-1).
  - **Sheet, focus:**
    - after the open animation: `AccessibilityInfo.sendAccessibilityEvent(titleRef.current, 'focus')`;
    - after closing: the same to `returnFocus.current` when given.
  - **Sheet, closing:**
    - system back runs `onBack` when given, else the close path;
    - the close path, Close and the scrim go through `confirmDiscard` when `dirty`.
  - **Menu:**
    - a transparent `Modal`, with a full-screen `Tap` scrim of `colors.hairline` (`ripple="none"`), its content wrapped in `ScrollIntoViewScope scrollRef={null}`;
    - `anchor.current.measureInWindow` places the panel under the anchor, right-aligned to it;
    - the panel: `radius.panel`, a `line` border, elevation 8;
    - it fades and scales from 0.95 over `durations.menu` (with reduced motion, it only fades);
    - rows: `Tap`, `minHeight: touch.target`, `type.body`, `accessibilityRole="menuitem"`; destructive rows in `danger`.

- [ ] **Step 4: Run** `npx jest __tests__/sheet.test.tsx`, then `npm test`. Every current sheet still works through the same props. Expected: PASS. Then run the gates.

- [ ] **Step 5: Commit** with the message `feat(app): sheets that fade and slide, pin their actions over the keyboard and ask before typing is lost; an anchored menu`.

- [ ] **Step 6: Keyboard check on the emulator** (§8, §15). Ask the user for the OK to run `adb shell settings put secure show_ime_with_hard_keyboard 1` for the check, and to turn it back to `0` after.
  - With the current app on Metro: open a sample → a row → a box → "Fix it" (today's editor in the new Sheet). Tap the field so Gboard shows, and take a screenshot.
  - **Pass:** the action row and the field sit above the keyboard. Record it in the QA notes.
  - **Fail:** ask the user about `react-native-keyboard-controller` (§12 B3) before going on. Don't add it without their OK.

---

### Task 8: Snackbar (replaces ToastAndroid)

**Files:**
- Create: `lib/snackbar.ts`, `components/Snackbar.tsx`
- Modify: `lib/toast.ts`, `app/_layout.tsx` (the root host), `components/Sheet.tsx` (a host inside the Modal), `components/BottomBar.tsx` (reports its height)
- Test: `__tests__/snackbar.test.tsx`

**Interfaces:**
- Consumes: the theme, `useReducedMotion`, `Tap`.
- Produces:

```ts
// lib/snackbar.ts
export type SnackAction = { label: string; onPress: () => void };
export type Snack = { id: number; message: string; action: SnackAction | null };
export function showSnack(message: string, action?: SnackAction): void; // replaces the one showing
export function dismissSnack(id: number): void;
export function currentSnack(): Snack | null;
export function subscribeSnack(listener: () => void): () => void;
export function pushHost(): { id: symbol; remove: () => void };   // the newest host shows the snack
export function topHost(): symbol | null;
export function setBottomClearance(owner: object, height: number | null): void; // the last bar to report wins
export function bottomClearance(): number;
// lib/toast.ts (the same name and call shape as today, so every caller and test mock keeps working)
export function toast(message: string, action?: SnackAction): void;
// components/Snackbar.tsx
export function SnackbarHost(props: { bottomOffset?: number }): JSX.Element | null; // bottomOffset: inside a sheet or the viewer
```

- [ ] **Step 1: Write the failing tests** `__tests__/snackbar.test.tsx`. Use `jest.useFakeTimers()` and `jest.spyOn(AccessibilityInfo, 'getRecommendedTimeoutMillis').mockImplementation(async (ms) => ms)`.
  - **`'toast shows its message in the host, ink with paper text, as a polite live region'`:**
    - render `<SnackbarHost />`, then call `toast('Added to your items.')` in `act`;
    - `getByText('Added to your items.')` has `color: colors.paper`;
    - its container has `backgroundColor: colors.ink` and `accessibilityLiveRegion="polite"`.
  - **`'a new one replaces the old'`.**
  - **`'it stays for the recommended time: 4 s, or 8 s with an action'`:**
    - after 3999 ms it's still there, and at 4000 it's gone;
    - with an action, `getRecommendedTimeoutMillis` is called with 8000.
  - **`'its action runs once and dismisses it'`:** `toast('Saved as a sale', { label: 'View', onPress })`; pressing `getByRole('button', { name: 'View' })` calls `onPress` once and removes the text.
  - **Review Focus 1.** `'with a sheet open, it shows in the sheet, never behind it'`:
    - render the root host plus a `<Sheet visible title="Customer">` (its own host);
    - `toast('Added to your customers.')` shows exactly once, inside the sheet's modal (`within(getByTestId('sheet-panel'))`);
    - after the sheet closes, the next toast shows in the root host.
  - **`'it sits above the bottom bar'`:**
    - render a `BottomBar` and fire its `layout` with height 80;
    - the snackbar's style has `bottom` 80 + `space.s` (plus the mock's bottom inset when there's no bar).

- [ ] **Step 2: Run** `npx jest __tests__/snackbar.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement.**
  - **The store:** module state with listeners, like `lib/scans.ts`. The host stack is an array of symbols. The clearance is a `Map<object, number>`, read in insertion order.
  - **SnackbarHost:**
    - `useSyncExternalStore` on the snack and the host stack; it renders only when its symbol is `topHost()`;
    - `position: 'absolute'`, `left`/`right: space.l`, `bottom: bottomOffset ?? (bottomClearance() || insets.bottom) + space.s`;
    - `ink` fill, `radius.panel`, `elevation: elevation.overlay`;
    - the message in `type.body` `paper`; the action is a `Tap` with `type.button` `brand`;
    - it slides up 16 and fades over `durations.snackbar` (with reduced motion, it only fades);
    - the timer starts from `getRecommendedTimeoutMillis(action ? 8000 : 4000)`.
  - **`lib/toast.ts`:** `showSnack`. `ToastAndroid` and the iOS `Alert` fallback go.
  - **The hosts:** `app/_layout.tsx` renders `<SnackbarHost />` after the Stack. `Sheet` renders `<SnackbarHost bottomOffset={actionsHeight + space.s} />` inside its panel. `BottomBar` reports its `onLayout` height through `setBottomClearance(ownerRef, h)`, and `null` on unmount.

- [ ] **Step 4: Run** `npm test`. Expected: PASS. The test files that mock `../lib/toast` keep working unchanged. Then run the other gates.

- [ ] **Step 5: Commit** with the message `feat(app): a snackbar with an action in place of Android toasts, shown above any open sheet`.

---

### Task 9: A scan's state, flag targets, the status strip and flag chips

**Files:**
- Create: `lib/scanState.ts`, `lib/flagTargets.ts`, `components/StatusStrip.tsx`, `components/FlagChip.tsx`
- Test: `__tests__/scanState.test.ts`, `__tests__/flagTargets.test.ts`, `__tests__/statusStrip.test.tsx`

**Interfaces:**
- Consumes:
  - `saleOf` and `SaleView` (`lib/sale.ts`); `certOf` and `CertView` (`lib/cert.ts`);
  - `saveBlock`, `blockWords` and `sameRows` (`lib/exportRows.ts`);
  - `savedSummary`, `rowsNow`, `summaryRows`, `marksOf`, `subscribeSaved` and `SavedSummary` (`lib/saved.ts`);
  - `annotationOn`, `settings` and `subscribeSettings`; `lists` and `subscribeLists`;
  - `Badge` and `BadgeSpec` (Task 4).
- Produces:

```ts
// lib/scanState.ts
export type ScanState =
  | { kind: 'not_found' }
  | { kind: 'to_check'; problems: readonly string[] }
  | { kind: 'blocked'; reason: string }  // blockWords(...) without its full stop
  | { kind: 'passed' };
export type SavedState = 'no' | 'unchanged' | 'changed';
export function scanStateOf(scan: StoredScan, checked: SaleView | CertView | null, annotation: boolean): ScanState;
export function savedStateOf(scan: StoredScan, summary: SavedSummary | undefined, annotation: boolean): SavedState;
export function homeBadge(scan: StoredScan, state: ScanState, saved: SavedState): BadgeSpec;
export function useScanCheck(scan: StoredScan | undefined): {
  sale: SaleView | null; cert: CertView | null; state: ScanState | null; // null when there's no scan
  saved: SavedState; summary: SavedSummary | undefined; annotation: boolean;
};
// lib/flagTargets.ts
export function flagTarget(problem: string, flagged: ReadonlySet<string>): string | null;
// components
export function StatusStrip(props: {
  state: Exclude<ScanState, { kind: 'not_found' }>;
  fixed: number; sample: boolean; saved: SavedState;
  onChip: (problem: string) => void;
}): JSX.Element; // forwards its ref to the strip, for TalkBack focus
export function FlagChip(props: { problem: string; onPress: () => void }): JSX.Element;
```

**Row keys:** `'number'`, `'date'`, `'customer'`, `'supplier'`, `'sold_to'`, `'terms'`, `` `item${n}` ``, `'vatable'`, `'vat'`, `'zero_rated'`, `'vat_exempt'`, `'total_due'`, `'gross'`, `'period'`, `'payee'`, `'payor'`, `` `ewt${n}` ``, `` `bt${n}` ``, `'ewt_total'`, `'bt_total'`, and `'photo'`. Tasks 11 and 12 key their rows by these.

- [ ] **Step 1: Write the failing tests.**

  `__tests__/flagTargets.test.ts`:

  ```ts
  const flagged = new Set(['vat', 'total_due']);
  test.each([
    ['Blurry photo (retake it)', 'photo'], ['Dark photo (retake it)', 'photo'],
    ['Date', 'date'], ['Customer (confirm the match)', 'customer'], ['Customer (not in your list)', 'customer'],
    ['Supplier (choose one)', 'supplier'], ['Terms', 'terms'],
    ['Row 2 math', 'item2'], ['Row 3 item', 'item3'], ['Row 10 price', 'item10'],
    ['Total', 'total_due'], ['Rows vs total', 'total_due'], ['VAT breakdown', 'vat'],
    ['Period', 'period'], ["Payee's TIN", 'payee'], ["Payor's TIN", 'payor'],
    ['Payor (not in your customers)', 'payor'], ['Payor (confirm the match)', 'payor'],
    ['Row 1 months', 'ewt1'], ['Row 4 tax', 'ewt4'], ['Row 2 ATC', 'ewt2'],
    ['Business tax row 1 months', 'bt1'], ['Business tax row 3 ATC', 'bt3'],
    ['Totals', 'ewt_total'], ['Business tax totals', 'bt_total'],
  ])('%s opens %s', (word, key) => expect(flagTarget(word, flagged)).toBe(key));
  ```

  It also has these tests:
  - `'VAT breakdown opens the first flagged of VATable sales, VAT 12%, Total due'`:
    - `Set(['vatable', 'vat'])` → `'vatable'`;
    - `Set(['total_due'])` → `'total_due'`;
    - `Set()` → `'total_due'`.
  - `'an unknown word opens nothing'`: the result is `null`.
  - `'every word the checks can produce has a row'`:
    - build a `Final` (cast) whose `flags` hold every flag `problemWords` reads, for rows 1 to 3, and a `Cert2307` (cast) with every flag `problems2307` reads and rows in both tables;
    - every word from `problemWords(final, 'purchase', true)` and `problems2307(cert)` gets a non-null target.

  `__tests__/scanState.test.ts`. Use the fixtures and helpers `__tests__/result.test.tsx` already uses: `parseScanResult(coreJson(stem))`, `addScan`, `memoryFs`, and `pinToday` for real scans.
  - `'a result with no form is not_found'`.
  - `'problems come first: to_check with the problem words'`: use a fixture `__tests__/result.test.tsx` shows with things to check. `problems` equals `saleOf(...).problems`.
  - `'a 2307 with no payments read is blocked, its reason without the full stop'`: `{ kind: 'blocked', reason: 'No income payments were read' }`.
  - `'in annotation mode, unchecked boxes block: Check every box first: N left'`.
  - `'a sample with no problems has passed (samples are never blocked here)'`.
  - `'savedStateOf: no, unchanged, and changed by an edit to a box in its row'`.
  - `'savedStateOf: in annotation mode, a confirm after the save is a change (M4 ruling, Important 3)'`.
  - `'homeBadge: Changed, Saved, Sample, Couldn\'t find the form, N to check, Can\'t save yet, Checks passed'`. A table over the combinations. The labels and tones are:

    | Badge | Tone |
    |---|---|
    | `Changed` | warning |
    | `Saved` | neutral |
    | `Sample` | neutral |
    | `Couldn't find the form` | warning |
    | `3 to check` | warning |
    | `Can't save yet` | warning |
    | `Checks passed` | success |

  `__tests__/statusStrip.test.tsx`:
  - **To check.** `'to check: count, sub-line and one chip per problem'`:
    - `getByRole('header', { name: '3 to check' })` and `getByText('Tap one to fix it')`;
    - `getByRole('button', { name: 'Row 2 math, to check' })`;
    - pressing it calls `onChip('Row 2 math')`;
    - the strip has `backgroundColor: colors.warningTint` and `accessibilityLiveRegion="polite"`.
  - **Blocked.** `'blocked: the reason, and Can\'t save yet'`.
  - **Checks passed.** `'checks passed, and its sub-lines'`, on a `successTint` strip. The sub-lines are:

    | Case | Sub-line |
    |---|---|
    | default | `Look over the values, then save` |
    | `fixed: 2` | `Look over the values, then save · you fixed 2 boxes` |
    | `fixed: 1` | `… you fixed 1 box` |
    | `sample` | `Samples can't be saved` |
    | saved, unchanged | `Look over the values` |
    | saved, changed | `Look over the values, then save the changes` |

  - **Too tall.** `'when the strip would take more than a third of the screen, its chips scroll in one row'`: fire `layout` on the strip with a height above `Dimensions.get('window').height / 3`; `getByTestId('strip-chips-scroll')` is a horizontal ScrollView.
  - **Chip size.** `'a flag chip is at least 40 dp with a 48 dp hit area'`.

- [ ] **Step 2: Run** `npx jest __tests__/flagTargets.test.ts __tests__/scanState.test.ts __tests__/statusStrip.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement.**
  - **`flagTarget`:** these rules, in order.

    | Pattern | Target |
    |---|---|
    | `/^(Blurry\|Dark) photo/` | `photo` |
    | `Date` | `date` |
    | `/^Customer /` | `customer` |
    | `/^Supplier /` | `supplier` |
    | `Terms` | `terms` |
    | `/^Row (\d+) (math\|item\|price)$/` | `item$1` |
    | `/^Row (\d+) (months\|tax\|ATC)$/` | `ewt$1` |
    | `/^Business tax row (\d+) /` | `bt$1` |
    | `Total`, `Rows vs total` | `total_due` |
    | `VAT breakdown` | the first of `vatable`, `vat`, `total_due` in `flagged`, else `total_due` |
    | `Period` | `period` |
    | `Payee's TIN` | `payee` |
    | `Payor's TIN`, `/^Payor /` | `payor` |
    | `Totals` | `ewt_total` |
    | `Business tax totals` | `bt_total` |
    | anything else | `null` |

  - **`scanStateOf`:**
    - not aligned, or no `checked` → `not_found`;
    - `checked.problems.length > 0` → `to_check`;
    - `blockWords(saveBlock(scan, checked, { annotation }), scan)`: when not null → `blocked`, with its full stop removed;
    - else `passed`.
  - **`savedStateOf`:** the `changed` logic moves here from `app/result.tsx:131-136`.
    - `summary === undefined || scan.saved === null` → `'no'`;
    - `(annotation && !!scan.savedMarks && marksOf(scan) !== scan.savedMarks) || !sameRows(rowsNow(scan), summaryRows(summary))` → `'changed'`;
    - else `'unchanged'`.
  - **`homeBadge`:** in the order of the test's table, with `scan.source === 'sample'` checked after the two saved states.
  - **`useScanCheck`:** `useSyncExternalStore` over the lists, the settings, `annotationOn` and `savedSummary(scan.id)`. Memoise `saleOf`/`certOf` on (scan, lists, settings), as `RecentRow` does today.
  - **StatusStrip:**
    - layout: `paddingHorizontal: space.l`, `paddingVertical: space.m`, a hairline bottom;
    - the icon: `TriangleAlert` `warning`, or `CircleCheck` `success`;
    - the headline: `type.headline` `ink`, `accessibilityRole="header"`; the sub-line: `type.label` `mute`;
    - chips wrap with `gap: space.s`;
    - when the strip's height exceeds a third of the window, the chips switch to a horizontal ScrollView. This is remembered per `fontScale|width`;
    - it cross-fades its opacity over `durations.strip` when `state.kind` or the problem count changes (none with reduced motion);
    - `accessibilityLiveRegion="polite"`.
  - **FlagChip:** a `Tap`: `radius.pill`, a 1 dp `warningLine` border, `panel` fill, `type.label` `ink`, `minHeight: touch.chip`, `hitSlop` 4; spoken `${problem}, to check`.

- [ ] **Step 4: Run** `npx jest __tests__/flagTargets.test.ts __tests__/scanState.test.ts __tests__/statusStrip.test.tsx`, then the gates. Expected: PASS.

- [ ] **Step 5: Commit** with the message `feat(app): one scan state for the strip and Home, flag chips that open their rows, the pinned status strip`.

---

### Task 10: The photo thumbnail and the photo viewer

**Files:**
- Create: `components/PhotoViewer.tsx` (exports `PhotoThumb` and `PhotoViewer`; the enhance and save logic moves here from `components/ScanImage.tsx`, which Task 11 deletes)
- Test: `__tests__/photoViewer.test.tsx`

**Interfaces:**
- Consumes:
  - `enhance`, `saveToPictures` and `ScanResult` (`modules/scanner`);
  - `Header` (dark), `Segmented` (dark), `Button`, `SnackbarHost`, `toast`.
- Produces:

```ts
export function PhotoThumb(props: { result: ScanResult; onPress: () => void }): JSX.Element | null;
// 36×48, a hairline border, radius.badge; the straightened page when the form was found, else the photo; null with neither
export function PhotoViewer(props: { visible: boolean; result: ScanResult; onClose: () => void }): JSX.Element;
```

- [ ] **Step 1: Write the failing tests** `__tests__/photoViewer.test.tsx`. Mock `../modules/scanner` with `enhance` and `saveToPictures`, as `__tests__/result.test.tsx` does.
  - **`'the thumbnail shows the page and opens the viewer'`:**
    - `getByRole('button', { name: 'Photo of the form' })` with the hint `'Opens it full screen'`;
    - its `Image` source is `result.pageUri`, or `originalUri` when the form wasn't found.
  - **`'the viewer: Close, the title Photo, a dark view choice, light status icons'`:**
    - `getByRole('header', { name: 'Photo' })` and `getByRole('button', { name: 'Close' })`;
    - `getByRole('radiogroup', { name: 'View' })` with Enhanced, B&W and Original;
    - an expo-status-bar `StatusBar` with `style="light"`.
  - **`'Enhanced by default, each made once'`:**
    - `mockEnhance` is called with `(pageUri, 'enhanced')`;
    - choosing B&W calls it with `'bw'`;
    - going back to Enhanced doesn't call it again;
    - Original shows `originalUri` (`getByTestId('scan-image')`).
  - **`'Save to Pictures, for Enhanced and B&W only, confirmed in the viewer'` (Review Focus 1):**
    - the button is absent on Original;
    - pressing it calls `mockSave` once, even on a double tap;
    - `within(getByTestId('photo-viewer')).getByText('Saved to Pictures › MyBizMate Scan')`.
  - **`'its save errors are today\'s'`:** `ERR_SAVE_NEEDS_ANDROID_10` gives `'Saving needs Android 10 or newer.'`; anything else gives `"Couldn't save the scan."`.
  - **`'with no form, only the photo: no view choice, no save'`.**
  - **`'system back closes it'`:** `onRequestClose` calls `onClose`.

- [ ] **Step 2: Run** `npx jest __tests__/photoViewer.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement.**
  - **PhotoThumb:** a `Tap` (48×48 hit area, 36×48 image).
  - **PhotoViewer, the Modal:**
    - `animationType="none"` (§5.5 doesn't animate the viewer), with `statusBarTranslucent` and `navigationBarTranslucent`;
    - a `viewer` fill;
    - `<StatusBar style="light" />` inside it.
  - **PhotoViewer, the layout, top to bottom:**
    - `Header tone="dark" title="Photo" backIcon="close" onBack={onClose}`;
    - the dark `Segmented` `label="View"`, shown when the form was found;
    - the image (`resizeMode="contain"`, `testID="scan-image"`, flex 1), with an `ActivityIndicator` in `brand` while it's made;
    - for Enhanced and B&W: a primary `Button` "Save to Pictures" with the `Download` icon. Its `onPress` returns the save's promise, so a double tap runs once;
    - `<SnackbarHost bottomOffset={…} />` inside the Modal, and the Modal's content wrapped in `ScrollIntoViewScope scrollRef={null}` (Task 5's fix).
  - **The enhance cache:** keep `ScanImage`'s logic (`made` per view; a failed enhance falls back to Original).

- [ ] **Step 4: Run** `npx jest __tests__/photoViewer.test.tsx`, then the gates. Expected: PASS.

- [ ] **Step 5: Commit** with the message `feat(app): the photo in a thumbnail and a full-screen viewer with Save to Pictures`.

---

### Task 11: The Scan screen: header, status strip, invoice ledger, bottom bar and footnote

**Files:**
- Modify: `app/result.tsx` (rewrite), `app/_layout.tsx` (`result`: `headerShown: false`)
- Create: `components/InvoiceLedger.tsx` (today's `SaleSections` as row descriptors plus their rendering)
- Delete: `components/ScanImage.tsx`, `components/StatusCard.tsx`
- Test:
  - `__tests__/result.test.tsx` (update its assertions);
  - `__tests__/save.test.tsx`, `__tests__/parties.test.tsx` and `__tests__/pdfFlow.test.tsx` (the strings that change);
  - `__tests__/invoiceLedger.test.ts` (new).

**Interfaces:**
- Consumes:
  - `useScanCheck`, `ScanState`, `SavedState`, `flagTarget`, `StatusStrip` (Task 9);
  - `PhotoThumb`, `PhotoViewer` (Task 10);
  - `Screen`, `Header`, `BottomBar` (Task 5); `Menu`, `Sheet` (Task 7); `LedgerRow`, `SectionHeader` (Task 4); `Segmented` (Task 6);
  - `deleteSaved` (`lib/saved.ts`); `useScanFlow`;
  - `useRouter()` as today, so the tests' `mockRouter` sees `back` and `replace`;
  - `amount`, `peso`, `qty`, `prettyDate`, `monthDay`, `formatMs`, `formatClock` (`lib/format.ts`).
- Produces:

```ts
// components/InvoiceLedger.tsx
export type LedgerOpen =
  | { kind: 'boxes'; title: string; boxes: string[]; row?: number }
  | { kind: 'customer' } | { kind: 'supplier' } | { kind: 'terms' };
export type LedgerRowSpec = {
  key: string;                         // the row keys of Task 9
  section: string;                     // the SectionHeader it sits under
  label?: string; value: string | null; valueStyle?: 'value' | 'figure' | 'figureStrong';
  badge?: BadgeSpec | null; sub?: string | null; subMono?: boolean; reason?: string | null;
  amount?: string | null; amountStrong?: boolean;
  flagged: boolean; edited: boolean; open: LedgerOpen | null;
};
export type LedgerSection = { title: string; right?: string; rows: LedgerRowSpec[] };
export function invoiceSections(scan: StoredScan, sale: SaleView): LedgerSection[];
export function Ledger(props: {
  sections: readonly LedgerSection[];
  onOpen: (row: LedgerRowSpec, ref: ViewInstance | null) => void;
  rowRefs: Map<string, ViewInstance | null>;
}): JSX.Element;                       // shared with the 2307 (Task 12)
```

**What the screen shows.** Design §9.5, as follows.

- **The header.**
  - **Title:** `FORMS[form].title`, or "Scan" when the form wasn't found.
  - **Subtitle** (`type.overline`), the first that applies:

    | Case | Subtitle |
    |---|---|
    | Not found | `` `${shownLabel} · ${formatClock(scan.at)}` `` |
    | Saved | `` `Saved as a ${kindWord} · ${monthDay(local savedAt)}` `` |
    | Sample | `` `${scan.label} · Read in ${t}` `` |
    | A text PDF (`r.source === 'pdf' && r.picture === false`) | `` `From the PDF's text · ${t}` `` |
    | Otherwise | `` `${form.number} ${final.invoice_no} · Read in ${t}` ``, or `` `Read in ${t}` `` with no number (every 2307) |

    Here `shownLabel(scan)` is `scan.label` without a leading `PDF: `. It's a new export in `lib/scanState.ts`, since Task 17's recent rows use it too. `kindWord` is "sale", "purchase" or "2307".
  - **Right side:** `PhotoThumb`, when the form was found. For a saved scan, an `IconButton` `More` labelled "More options".
- **Pinned:** the `StatusStrip`, when the form was found, with `fixed = Object.keys(scan.edits).length`.
- **The scroll, top to bottom:**
  1. The slim saved line, for a saved scan:
     - unchanged: `sand`, `type.label` `ink`: `` `Saved as a ${kindWord} · ${monthDay} · ${exportedAt ? `Exported ${monthDay}` : 'Not exported yet'}` ``;
     - changed: `warningTint`, `warning`: "Changed since it was saved. The export still has the saved version. Save changes to update it."
  2. The kind switch, for invoices: `Segmented` `label="This invoice is"` with "Sale" and "Purchase". Today's caption sits under it (call 6).
  3. The ledger.
  4. The footnote, in `type.label` `mute`, one paragraph per line:
     - "Read on this phone in 3.2 s. Nothing left the phone.", or today's not-found "Checked on this phone in …";
     - in team builds, "Straighten 0.4 s, read 2.8 s.";
     - "24 boxes read.";
     - today's `pdfFootnote`;
     - for a sample, "Sample invoice: 22 of 24 boxes read exactly as written. Samples are made up, so they can't be saved."
- **Not found**, in place of the strip and the ledger:
  - the photo (`originalUri`, 240 dp tall, `contain`, `crop` fill), which opens the viewer when tapped;
  - "Couldn't find the form" (`type.headline`).
  - For a photo:
    - "Get the whole form in the photo, then retake it:";
    - the numbered lines "All 4 corner squares of a MyBizMate invoice", "The whole table of a Service Invoice" and "The whole page of a BIR Form 2307", each number in `brandText` `type.figure`.
  - For a PDF: today's `NOT_FOUND_PDF` sentence.
- **The bottom bar:**

  | State | Buttons |
  |---|---|
  | Found, not a sample | secondary "Retake" (`flow.retake(scan, back)`), then the primary: "Save sale", "Save purchase", "Save 2307", or "Save changes" when saved. It runs today's `openSave` and ignores a second tap while a sheet is open. |
  | Sample | secondary "Retake" only |
  | Not found | secondary "Choose a photo" (`flow.fromGallery({ replace: true })`), or "Choose a PDF" (`flow.fromPdf({ replace: true })`) when `scan.source === 'pdf'`; then primary "Retake". Retake runs `flow.retake(scan, back)` for camera and camera-app scans and when `back`; otherwise `router.replace('/camera')` (call 8). |

- **⋮ › Delete saved scan** (a `Menu` item, destructive):
  - `Alert.alert('Delete this saved scan?', "It's removed from this phone. Files you already exported don't change.", [Cancel, Delete (destructive)])`.
  - Delete sets `leaving` (the screen renders only its header), calls `router.back()`, then `void deleteSaved(id)`.
- **Chips:**
  - `onChip(problem)` → `key = flagTarget(problem, flaggedKeys)`;
  - for `'photo'`, open the viewer;
  - otherwise scroll `rowRefs.get(key)` into view (`measureLayout` against the scroll content, then `scrollTo({ y: y - space.xl })`), then `onOpen(row)`.
- **Focus:** when opened straight from a read (`from` undefined), send TalkBack focus to the strip on mount.
- **Sheets:** today's set (boxes, terms, customer, supplier, save), each given `returnFocus` (the tapped row's ref). `ReadingOverlay` stays.
- **No scan:** a Screen with `Header title="Scan"`, and today's "This scan is no longer here. Go back and read the photo again."

**The invoice's rows.** `invoiceSections` reads today's `SaleSections` (`app/result.tsx:224-419`). Row by row, it keeps each row's words, its `flagged` expression and its boxes. Under §6's format rules, amounts in rows lose the ₱, and totals keep it.

- **Section "Invoice":**
  - `number` (`form.number`, figure);
  - `date` (figure; reason = today's `dateSub` when flagged);
  - `customer` or `supplier`. The sub-line is today's status sub. The flagged statuses (`unsure`, `new`; `missing`) move it to the reason;
  - `sold_to` (purchase);
  - `terms`: when flagged, the reason is `` `Tick ${form.cash} or ${form.account} clearly` ``; "Chosen by you" is the sub.
- **Section `` `Items · ${n}` ``**, with "Amount" on the right:
  - one `item${row}` per item: the value is the description (or `` `Item ${row}` ``), the sub is `` `${qty} × ${amount(unit_price)}` `` (mono), and the amount is `amount(it.amount)`;
  - the reason joins "Doesn't add up", "Not in your item list" and `` `Your list price is ${peso(price)}` `` with " · ";
  - with no items: one row, "No items read".
- **Section "Totals":**
  - `vatable`, `vat`, `zero_rated`, `vat_exempt` (figure; today's conditions and reasons);
  - `total_due`: `peso`, `figureStrong`. Its sub is "The written totals agree", or today's `totalSub` as the reason when flagged;
  - `gross`: `peso`, with today's sub.
- **`edited`:** any of the row's boxes is in `scan.edits` (for the customer row, the three customer boxes).

- [ ] **Step 1: Write the failing tests.**

  `__tests__/invoiceLedger.test.ts`, from fixtures as in `result.test.tsx`:
  - `'sections and keys in today\'s order'`;
  - `'a flagged date carries today\'s reason; an item\'s sub has no peso sign'`;
  - `'edited follows the row\'s boxes'`;
  - `'no items: one row, No items read'`.

  `__tests__/result.test.tsx`: rewrite the assertions on the strings this task removes:
  - "1 thing to check" and "N things to check";
  - "Ready to post", "Ready to save" and "Every check passed";
  - "THIS INVOICE IS";
  - the `scan-image` and `scan-full` cards. The photo is now behind the thumbnail: press `'Photo of the form'` first.

  Then add:
  - `'the header names the form; its subtitle has the number and the read time'`: `getByRole('header', { name: 'MyBizMate Sales Invoice' })`, and `getByText(\`SI no. ${no} · Read in ${formatMs(t)}\`)` with the fixture's number and time;
  - `'a sample says so in its subtitle and has Retake only'`;
  - `'to check: a chip per problem word, and a chip opens its row'`: press the chip `'Date, to check'`; `getByRole('header', { name: 'Date' })` is the open sheet's title;
  - `'checks passed: the strip and Save sale'`;
  - `'a 2307 with no payments read: the blocked strip'` (`'No income payments were read'`, `"Can't save yet"`);
  - `'not found: the photo, the reason, three numbered lines, Choose a photo and Retake'`;
  - `'a saved scan: its subtitle, the saved line, Save changes, and ⋮ More options'`;
  - `'a saved scan that changed says so and how to update the export'`;
  - **Review Focus 4.** `'deleting from ⋮ goes back without flashing that the scan is gone'`:
    1. save a scan through `saveScan` (memoryFs), then render with `from: 'saved'`;
    2. press `'More options'` → `'Delete saved scan'` → the Alert's Delete;
    3. expect `mockRouter.back` to have been called and `queryByText(/no longer here/)` to be null.
  - `'the footnote: the time, the box count, and the sample line'`;
  - `'the kind switch: a radio group, Sale | Purchase, with today\'s sentence'`.

  In `__tests__/save.test.tsx`, `__tests__/parties.test.tsx` and `__tests__/pdfFlow.test.tsx`, change "A sale"/"A purchase" to "Sale"/"Purchase", and update the saved line's new text.

- [ ] **Step 2: Run** `npx jest __tests__/invoiceLedger.test.ts __tests__/result.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement** `components/InvoiceLedger.tsx` and the new `app/result.tsx` as described, and hide the `result` Stack header. Delete `components/ScanImage.tsx` and `components/StatusCard.tsx`. `components/CertificateSections.tsx` keeps rendering its cards until Task 12: wrap it in a `View` with `paddingHorizontal: space.l` for now.

- [ ] **Step 4: Run** `npm test`. Expected: PASS. Then run `npx tsc --noEmit && npx expo lint`.

- [ ] **Step 5: Device look** (if the emulator is free; JS only, through Metro). Capture "Sample 0051" at the defaults to `.superpowers/brainstorm/ui-2026-11-22/qa/t11-scan-sample.png`, and compare it with the audit's `p1-07a`.

- [ ] **Step 6: Commit** with the message `feat(app): the Scan screen leads with its flags: pinned status strip, the invoice as a ledger, the photo in the header`.

---

### Task 12: The Scan screen's 2307 ledger

**Files:**
- Modify: `components/CertificateSections.tsx` (rewrite as `certSections` plus `Ledger`), `app/result.tsx` (use `certSections`)
- Delete: `components/SaleRow.tsx` (its last user goes)
- Test: `__tests__/certificate.test.tsx` (update), `__tests__/certLedger.test.ts` (new)

**Interfaces:**
- Consumes: `Ledger`, `LedgerSection`, `LedgerRowSpec` (Task 11); `CertView`, `periodName` (`lib/cert.ts`); `formatTin`, `partyName`.
- Produces:

```ts
export function certSections(scan: StoredScan, view: CertView): LedgerSection[];
export function payorLine(payor: CertView['payor']): string; // the payor sheet's read-only line (Task 14)
```

**Sections** (§9.5, call 14). Keep today's words, flags and boxes from `components/CertificateSections.tsx`.

| Section | Rows |
|---|---|
| "Period" | `period`: value `` `Oct 1 – Dec 31, 2026` ``, today's `quarterText` without " (Q4)"; badge `{ label: 'Q4', tone: 'neutral' }`; reason "Not one calendar quarter" |
| "Payee" | `payee`: the name; sub `tinAndZip` (mono) |
| "Payor" | `payor`: `payor.shown`; sub `` `${payorSub(payor)}\n${tinAndZip(cert.payor)}` `` |
| `` `Income payments · ${n}` ``, right "Tax" | one `ewt${row}` per row: value today's title (ATC · payment, or "Row N"); sub `` `Total ${amount(row.total)}` `` (mono); amount `amount(row.tax)`; reason: today's flag words, capitalised and joined with " · ". With no rows: "No income payments read". |
| `` `Business tax · ${n}` `` (when present), right "Tax" | `bt${row}`, the same way |
| "Totals", right "Tax" | one row per table, as today (`ewt_total`, `bt_total`): value "Income payments" or "Business tax"; sub `` `Total ${peso(total)}` ``; amount `peso(tax)`, `amountStrong`; reason "The rows don't add up to the total row" |

`payorLine`:

| Payor | Line |
|---|---|
| `auto` | `` `In your customers · TIN ${formatTin(tin)}` ``, or "In your customers" with no TIN |
| `unsure` | `` `Closest match in your customers: ${partyName(listParty)}` `` |
| `new`, `none` | "Not in your customers" |
| `unlisted` | "Add your customers in Your lists to check names" |

- [ ] **Step 1: Write the failing tests.**
  - `__tests__/certLedger.test.ts`: `'sections in today\'s order, the quarter as a badge'`; `'a payment row: tax on the right, total in the sub-line, flags as the reason'`; `'totals keep the peso sign'`; `'payorLine for each status'`.
  - In `__tests__/certificate.test.tsx`, replace the card assertions (`SaleRow` texts, "PERIOD", "PAYEE") with headers and rows, and keep every check of a flag and a fix.

- [ ] **Step 2: Run** `npx jest __tests__/certLedger.test.ts __tests__/certificate.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run** `npm test` and the gates. Expected: PASS.

- [ ] **Step 5: Commit** with the message `feat(app): the 2307 as a ledger: the quarter as a badge, tax on the right, flags in each row`.

---

### Task 13: Fix a box (BoxSheet), with annotation mode's controls

**Files:**
- Modify: `components/BoxSheet.tsx` (rewrite), `lib/forms.ts` (`fieldType`), `app/result.tsx` (`onSaved` moves focus to the strip)
- Delete: `components/BoxRow.tsx` (`readingText` becomes `readingLine` in `BoxSheet.tsx`)
- Test: `__tests__/boxSheet.test.tsx` (new). In `__tests__/result.test.tsx` and `__tests__/certificate.test.tsx`, update the fix flows: one-box rows open the editor directly, and list boxes are `box-${name}`.

**Interfaces:**
- Consumes:
  - `Sheet`, `confirmDiscard` (Task 7); `TextField` (Task 6); `Badge`; `Button`;
  - `setEdit`, `confirmBox`, `annotationOn`, `boxState`, `trainingBoxes`, `boxValue`, `fieldLabel`.
- Produces:

```ts
export function BoxSheet(props: {
  visible: boolean; title: string; scan: StoredScan; boxes: readonly string[]; onClose: () => void;
  onSaved?: () => void;                 // a one-box sheet: after Save closes it
  returnFocus?: RefObject<ViewInstance | null>;
  children?: ReactNode;                 // under the list: the party section, the payor line, a new item
}): JSX.Element;
export function readingLine(read: BoxRead | null): string;
// "Read as “Oct 29, 2026”" | "Couldn't make out any writing" | "From the PDF's text" | "Empty box"
export function isHardToRead(read: BoxRead | null): boolean; // !fromText && text !== '' && conf < 0.9
// lib/forms.ts
export function fieldType(form: FormName, name: string): FieldType; // the template's type; 'text' when unknown
```

**What it does** (§9.5, §12 A8, call 19):

- **Opening:**
  - one box and no `children` → the editor, straight away;
  - otherwise → the list.
- **The list:**
  - Each box is a `Tap` row (`testID={\`box-${name}\`}`, role button, hint "Opens it to fix"), holding:
    - its label (`type.label` `mute`);
    - its crop, full width, 56 dp tall, `contain`, on `crop`, `radius.field`;
    - `readingLine` (`type.body`);
    - today's edit line ("You changed it to “X”." / "You cleared it.");
    - its badges.
  - **Badges:**
    - "Hard to read" (warning) when `isHardToRead`;
    - "Edited" (neutral) when edited;
    - in annotation mode, on a training box: the state badge in place of "Edited": "Not checked yet" (warning), "Checked" (success), "Corrected" (success).
  - `children` come under the boxes.
  - The action is "Done" (primary), which closes the sheet.
- **The editor:**
  - **Sheet title:** the box's label. When it was opened from the list, `onBack` returns to the list.
  - **The crop:**
    - "WHAT THE CAMERA SAW" (`overline`), then the crop full width, 72 dp tall;
    - a PDF text box: "FROM THE PDF'S TEXT", with no crop;
    - no crop: "No picture of this box".
  - **The reading:** `readingLine`, plus the Hard to read badge.
  - **Other readings:** today's `others` (the alternatives, plus the reading when there's an edit) under "Could also be" (`type.label` `mute`), as 40 dp chips that set the draft.
  - **The field:** `TextField label="What the box says" mono`, with the helper "Type exactly what's written. The checks run again.":
    - `keyboardType`: `text` → `'default'` with `autoCapitalize="sentences"`; any other type → `'visible-password'` on Android (`'default'` elsewhere), with `autoCapitalize` `'characters'` for `code` and `'none'` for the rest;
    - not focused on open.
  - **Actions:**
    - Cancel (text) returns to the list, or closes the sheet, without asking;
    - Looks right (secondary, `testID="box-confirm"`), only when today's `canConfirm` holds;
    - Save (primary, `testID="box-save"`): `setEdit`. A one-box sheet then closes and calls `onSaved`; otherwise it goes back to the list.
  - **Dirty:** `draft !== startDraft` sets `Sheet dirty`.
  - **The draft:** held in state keyed by the box being edited. It's set only when an editor opens or a chip is pressed, so scan, list and settings updates never reset it.

- [ ] **Step 1: Write the failing tests** `__tests__/boxSheet.test.tsx`. Use a fixture scan from `coreJson('inv_0051')` and `addScan`, with `Alert` spied.
  - `'a one-box row opens straight at its editor'`: header `'Date'`, `getByText('WHAT THE CAMERA SAW')`, and the field `'What the box says'` holding the reading.
  - `'the reading has no percentage; Hard to read below 0.90 only'`: there's no `/% sure/`; set `conf` to 0.85 and 0.95, and a `fromText` box.
  - `'Could also be: a chip fills the field'`.
  - `'Save keeps the edit, closes a one-box sheet and calls onSaved'`: `getScan(id).edits.date` is the typed text.
  - `'a multi-box row lists its boxes; a box opens its editor; Save goes back to the list; Done closes'`.
  - `'typing asks before it is lost: Back, Close, the scrim and system back'` (`'Discard what you typed?'`).
  - `'Cancel leaves without asking'`.
  - **Review Focus 2.** `'typing survives store updates while the editor is open'`: type `'Oct 28'`; in `act`, run `updateScan(id, { terms: 'cash' })` and `updateSettings({ atc: 'WC158' })`; the field still holds `'Oct 28'`.
  - `'keyboards: amounts and dates use visible-password on Android, words the default; autocorrect off'`, with `jest.replaceProperty(Platform, 'OS', 'android')`.
  - Annotation mode (`mockTeam = true`, `updateSettings({ annotation: true })`):
    - `'Looks right only on a training box whose field holds its value; it confirms and goes back'`;
    - `'state badges replace Edited on training boxes'`;
    - `'the editor\'s actions: Cancel · Looks right · Save'`;
    - `'Check every box first lists the unchecked boxes with their states'`. Through `app/result.tsx`'s `openSave`, the box sheet's title is `'Check every box first'`.

- [ ] **Step 2: Run** `npx jest __tests__/boxSheet.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement** as described, and add `fieldType` to `lib/forms.ts`. It reads the templates' `type`, which the module already loads; keep a `Record<FormName, Record<string, FieldType>>` built once. Delete `components/BoxRow.tsx`. In `app/result.tsx`, a one-box `BoxSheet`'s `onSaved` sends TalkBack focus to the strip.

- [ ] **Step 4: Run** `npm test` and the gates. Expected: PASS.

- [ ] **Step 5: Commit** with the message `feat(app): fix a box: one-box rows open at the editor, crops in the list, Hard to read, ask before discarding; annotation controls kept`.

---

### Task 14: Party, supplier, payor and terms sheets, and search

**Files:**
- Create: `lib/search.ts`
- Modify: `components/PartySheet.tsx`, `components/SupplierSheet.tsx`, `components/PartyPicker.tsx`, `components/TermsSheet.tsx`, `app/result.tsx` (the payor `BoxSheet` gets `payorLine` as its children)
- Test: `__tests__/search.test.ts` (new); `__tests__/parties.test.tsx` and `__tests__/certificate.test.tsx` (update)

**Interfaces:**
- Consumes: `BoxSheet` (Task 13); `ListRow`, `SectionHeader`, `Badge`; `TextField` with `leading={Search}`; `payorLine` (Task 12).
- Produces:

```ts
// lib/search.ts
export function fold(s: string): string;                     // lowercase, accents removed (NFD), trimmed
export function matchesParty(p: Party, query: string): boolean; // name, trade name, code by folded contains; TIN by digits
export function matchesItem(i: ListItem, query: string): boolean;
```

**What changes** (§9.5 party sheet; call 18):

- **PartySheet:** `BoxSheet` with the three customer boxes (list mode). Its children:
  - for `auto`, `chosen`, `unsure` and `blank`: a `SectionHeader` "In your customers", with the party as a `ListRow` (the name; sub `TIN …`) and today's note and buttons;
  - for `new` and `unlisted`: "Not in your customers", with the written name as a `ListRow` carrying a "New" badge (brand), the line "It goes out as written.", then today's buttons and notes. The buttons are text `Button`s.
- **"Choose another"** opens `PartyPicker` inside the sheet, as today.
- **PartyPicker:**
  - a `TextField` with `hideLabel`, `label`/`placeholder` "Search your customers" (or suppliers), `leading={Search}`, `clearLabel="Clear the search"` and `autoFocus`;
  - rows are `ListRow`s (the name; sub `partyLine`, mono), filtered by `matchesParty`;
  - today's "No match." and "Showing the first 50. Type to find the others."
- **SupplierSheet:**
  - today's title and subtitle;
  - the picker;
  - "Various suppliers" as a `ListRow` (sub "Exported as VARIOUS-SUPP");
  - a `SectionHeader` "Not in your list?";
  - `TextField label="Supplier's name"`;
  - "Use this name" (secondary) and "Add to your suppliers" (text), or the samples note.
- **Payor:** the 2307 `payor` row's `BoxSheet` gets `<Text style={type.label}>{payorLine(view.payor)}</Text>` under the boxes. There's no chooser (§9.5).
- **TermsSheet:**
  - today's subtitle;
  - each choice is a 48 dp `Tap` row with `accessibilityRole="radio"` and `accessibilityState={{ checked }}`, its words in the form's own (`form.cash`/`form.account`), and `Check` on the chosen one;
  - "Use the tick on the paper" (text).

- [ ] **Step 1: Write the failing tests.**
  - `__tests__/search.test.ts`:
    - `'fold removes case and accents'`: `fold(' Peña ')` is `'pena'`;
    - `'a party matches by name, trade name or code, folded'`;
    - `'a TIN matches with or without dashes'`: `'123456789'` and `'123-456-789'` both find `tin: '123-456-789-00000'`;
    - `'items match by name'`.
  - In `__tests__/parties.test.tsx`, add:
    - `'In your customers, with the match and its reason'`;
    - `'Not in your customers: the New badge and It goes out as written.'`;
    - `'the picker\'s search is focused and finds Peña by pena'`;
    - `'terms are radio rows in the form\'s words'`.
  - In `__tests__/certificate.test.tsx`, add `'the payor sheet shows its read-only line'`.

- [ ] **Step 2: Run** `npx jest __tests__/search.test.ts __tests__/parties.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run** `npm test` and the gates. Expected: PASS.

- [ ] **Step 5: Commit** with the message `feat(app): party, supplier, payor and terms sheets in the new look, with search that ignores case, accents and dashes`.

---

### Task 15: The save sheets

**Files:**
- Modify: `components/SaveSheet.tsx`
- Create: `components/SummaryBox.tsx`
- Test: `__tests__/save.test.tsx` (update), `__tests__/summaryBox.test.tsx`

**Interfaces:**
- Consumes: `Sheet` with `actions`; `ChoiceChips`; `TextField`; `Banner`; `toast` with an action; `useRouter()` (`expo-router`).
- Produces:

```ts
export function SummaryBox(props: { lines: readonly { key: string; value: string; mono?: boolean; badge?: BadgeSpec | null }[] }): JSX.Element;
// sand, radius.panel; keys in type.overline mute, values in type.value / type.figure; Task 19 reuses it
```

**What changes** (§9.6):

- **Titles:** today's: "Save as a sale", "Save as a purchase", "Save 2307".
- **Subtitles:** today's, with "Saved invoices" renamed "Saved":
  - "It becomes a row in MyBizMate's Sales import. Export it from Saved." (or Purchases);
  - "Each payment becomes a row in MyBizMate's 2307-CWT import. Export it from Saved."
- **The summary:**
  - invoices: Date; Customer or Supplier, with a "New" badge (brand) when the status is `new`, `unlisted` or `typed`, and today's " (match not confirmed)" kept for `unsure`; "Gross (VAT included)" with `peso` (mono); Discount when present;
  - 2307s: Payor (with "New" for `new`/`unlisted`), Period, and "Tax withheld" with `peso`.
- **The VAT status:** today's chips, `ChoiceChips label="Your business is"`, when today's sheet asks.
- **Tax type:** `ChoiceChips label="Tax type"` with today's five values. The helper "Suggested from the invoice's VAT boxes" shows while `chosenType === null`.
- **The account:** `TextField label={today's} mono helper="Code or name, as in MyBizMate"`. The placeholder goes.
- **Terms:** chips "Cash" and "On account". The display label only changes: the export still writes "On Account".
- **ATC:** the field and today's note, as today, with `mono`.
- **The offset account (2307):** `mono`, with the same helper.
- **Annotation mode's source tag:** `TextField`s "Client code" and "Writer code" (`mono`, `autoCapitalize="characters"`), then M4's two notes as `type.label` `mute` lines.
- **Still to check:** a `Banner tone="warning"` with today's `StillToCheck` words.
- **Actions:**
  - Cancel (text);
  - the primary, with today's label and `testID="save-confirm"`, disabled while not `ready`. Its `onPress` returns the save's promise, so a double tap saves once.
- **After a save:**
  - `onClose()`;
  - `toast(wasSaved ? 'Changes saved' : \`Saved as a ${what}\`, { label: 'View', onPress: () => router.push({ pathname: '/saved', params: { kind } }) })`, where `what` is "sale", "purchase" or "2307", and `wasSaved = scan.saved !== null` before the save.
- **Errors:** today's toasts ("Couldn't save the invoice." / "Couldn't save the 2307.").

- [ ] **Step 1: Write the failing tests.**
  - `__tests__/summaryBox.test.tsx`: `'keys in caps mono, values, and a badge'`.
  - Update `__tests__/save.test.tsx`: drop "Export it from Saved invoices", and add:
    - `'the sale sheet: title, subtitle, the summary with New, five tax types, Cash / On account'`;
    - `'the tax type helper shows while it is the suggestion'`;
    - `'the banner counts what is still marked to check'`;
    - **Review Focus 3.** `'a double tap saves once'`: two presses of `'save-confirm'` call `saveScan` (spy) once;
    - `'after a save, a snackbar with View opens Saved for that kind'`: `mockToast` is called with `'Saved as a sale'` and `{ label: 'View', onPress }`; `onPress()` calls `push` with `{ pathname: '/saved', params: { kind: 'sale' } }`;
    - `'a re-save says Changes saved'`;
    - `'the 2307 sheet: Payor, Period, Tax withheld, the offset account'`;
    - `'annotation mode: the codes with M4\'s notes; Save waits for valid codes'`, keeping M4's existing assertions.

- [ ] **Step 2: Run** `npx jest __tests__/save.test.tsx __tests__/summaryBox.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run** `npm test` and the gates. Expected: PASS.

- [ ] **Step 5: Commit** with the message `feat(app): save sheets with a summary, pinned actions, one save per tap, and a snackbar that opens Saved`.

---

### Task 16: The camera and the reading card

**Files:**
- Modify: `app/camera.tsx`, `components/ReadingOverlay.tsx` (rewrite), `lib/cameraCopy.ts`, `components/icons.tsx` (remove `Bolt`)
- Modify: `lib/scanFlow.ts`. It reports what's being read, and a capture's failure becomes a dialog (call 16).
- Create (only if Task 0's `HAPTICS`): `lib/haptics.ts`
- Test: `__tests__/camera.test.tsx` (update), `__tests__/readingOverlay.test.tsx` (new)
- Test: `__tests__/home.test.tsx`, `__tests__/pdfFlow.test.tsx` and `__tests__/result.test.tsx`. In each: "Reading the invoice…" becomes "Reading…", and the failures they check move from `mockToast` to an `Alert.alert` spy.

**Interfaces:**
- Consumes: `IconButton` (camera tone), `Button`, `Tap`, the icons `Close`, `Flashlight`, `FlashlightOff`, `ImageIcon` and `Camera`, `useReducedMotion`, `TEAM_BUILD`.
- Produces:

```ts
// lib/scanFlow.ts: useScanFlow() now also returns
readingWhat: 'photo' | 'pdf' | null;   // reading stays a boolean (readingWhat !== null)
// components/ReadingOverlay.tsx
export function ReadingOverlay(props: { visible: boolean; what?: 'photo' | 'pdf' }): JSX.Element | null;
export function LoadingBar(props: { width: number }): JSX.Element; // brand on sand; still under reduced motion
// lib/cameraCopy.ts
export const CAMERA_TEXT: {
  allowTitle: 'Allow the camera'; offTitle: 'Camera access is off';
  offBody: "Turn on the camera for MyBizMate Scan in the phone's settings.";
  startTitle: "The camera couldn't start";
};
// CAMERA_ERRORS.start(message) goes: the raw message shows on its own line, in team builds only
// lib/haptics.ts
export function confirmHaptic(): void;
// Android: Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Confirm); else notificationAsync(Success); errors ignored
```

**The camera** (§9.3). The preview, the outline, auto-capture and the checks are native and unchanged.

- **The top bar** (its height isn't fixed):
  - Close: `IconButton` `Close`, camera tone, labelled "Close". It calls `router.back()`.
  - There's no title.
  - On the right:
    - **The Auto switch:** a `Tap` with `accessibilityRole="switch"`, `accessibilityLabel="Auto capture"` and `accessibilityState={{ checked: auto }}`. It's a pill (`radius.pill`, 1 dp `cameraMute` border) holding "AUTO" (`type.badge` `cameraText`) and a 8 dp dot: `brand` filled when on, a hollow `cameraMute` ring when off. Keep today's `accessibilityHint` texts.
    - **The flashlight switch:** `IconButton` with `accessibilityRole="switch"`, labelled "Flashlight", `checked={torch}`, showing `Flashlight` or `FlashlightOff`. It shows when `hasTorch`.
- **The pill:** today's words in `type.body` `cameraText` on `colors.pill`, `radius.pill`. It wraps, with a `maxWidth` of 90%.
- **The bottom band** (its height isn't fixed):
  - **Gallery** on the left: a `Tap` holding the `ImageIcon` over "Gallery" (`type.label` `cameraMute`), labelled "Gallery".
  - **The shutter** in the centre: 72 dp (`touch.shutter`), a 3 dp `brand` ring around a white disc. It's labelled "Take the photo" and is disabled while `status.status` is `'starting'` or `'capturing'`, or `flow.busy`.
- **The panels**, on `cameraPanel`, `radius.panel`, each with the `Camera` icon on top:

  | Panel | Title | Body | Buttons |
  |---|---|---|---|
  | Can ask | `allowTitle` | `PERMISSION_TEXT` | primary "Allow the camera"; text "Use the phone's camera app instead" |
  | Refused for good | `offTitle` | `offBody` | primary "Open settings" (`Linking.openSettings`); the same text button |
  | No camera | `CAMERA_ERRORS.noCamera` | | primary "Choose from gallery" |
  | Couldn't start | `startTitle` | in team builds, the raw message (`type.figureSmall` `cameraMute`) | primary "Try again"; the text button |

  The bottom band's Gallery stays with every panel.
- **The haptic** (only if `HAPTICS`):
  - `shutterPressed = useRef(false)` is set by the shutter's press;
  - in `onPhoto`, call `confirmHaptic()` once when `auto && !shutterPressed.current`, then reset the ref;
  - the haptic comes before the reading card.

**The reading card** (§9.4):
- a `wash` over the whole screen, which blocks touches;
- the card: `panel`, `radius.panel`, a `line` border, `elevation.overlay`, `padding: space.xl`, `gap: space.m`;
- "Reading…" (`type.headline`);
- `LoadingBar` (4 dp, `brand` on `sand`; under reduced motion it stands still at 35%);
- the line for a photo or sample: "Straightening the photo and reading every box"; for a PDF: "Reading the PDF";
- after 5 s, a second line: "Still reading. Big or blurry photos take longer.";
- the card fades in over `durations.card`;
- `accessibilityLiveRegion="polite"` and `accessibilityLabel="Reading"`.

Every screen that shows it passes `what={flow.readingWhat ?? 'photo'}`.

- [ ] **Step 1: Write the failing tests.**

  `__tests__/readingOverlay.test.tsx`:
  - `'Reading… for a photo, announced as Reading'`;
  - `'a PDF says Reading the PDF'`;
  - `'after 5 s it says why it is slow'` (fake timers);
  - `'reduced motion: the bar stands still'` (`jest.spyOn(Animated, 'loop')` isn't called).

  `__tests__/camera.test.tsx`, updated and added:
  - `'no title; Close, the Auto switch and the flashlight switch'`:
    - `queryByText('Scan an invoice')` is null;
    - `getByRole('switch', { name: 'Auto capture' })` starts checked, and a press unchecks it;
    - the flashlight switch shows after `onReady` with `hasTorch`.
  - `'the shutter is disabled while the camera starts'`.
  - `'permission: Allow the camera, then Camera access is off with Open settings'`: `Linking.openSettings` is called.
  - `'a start failure: The camera couldn't start and Try again; the raw message only in team builds'`.
  - `'the gallery: an icon over its label'`.
  - If `HAPTICS`: `'auto-capture confirms with one haptic; a shutter photo has none'`, with `jest.mock('expo-haptics')`.
  - Keep every existing test of the pill's words, the test hook, discarding photos and refocus.

  `__tests__/pdfFlow.test.tsx` and `__tests__/home.test.tsx`:
  - `'a refused PDF says why in a dialog'`: `Alert.alert` is called with `'That PDF has a password. Save a copy without one, then import it.'`.

- [ ] **Step 2: Run** `npx jest __tests__/readingOverlay.test.tsx __tests__/camera.test.tsx __tests__/pdfFlow.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement.**
  - **In `lib/scanFlow.ts`:**
    - `toast(...)` for `openError`, `failed(e)`, the camera-app permission and "Choose a PDF file." becomes `Alert.alert(message)`;
    - `setReading` takes `'photo' | 'pdf' | null`: `run` passes `'photo'` and `fromPdf` passes `'pdf'`.
  - Remove `Bolt` from `icons.tsx`, and `start(message)` from `CAMERA_ERRORS`. Update its uses.

- [ ] **Step 4: Run** `npm test` and the gates. Expected: PASS.

- [ ] **Step 5: Commit** with the message `feat(app): the camera without a title, a labelled Auto switch and flashlight, clear permission panels, one haptic on auto-capture; Reading… for every form`.

---

### Task 17: Home as a workspace

**Files:**
- Modify: `app/index.tsx` (rewrite), `components/RecentRow.tsx` (rewrite), `lib/settings.ts` (`setupDone`)
- Delete: `components/ScanIllustration.tsx`
- Test: `__tests__/home.test.tsx` (rewrite its assertions), `__tests__/recentRow.test.tsx`, `__tests__/settings.test.ts`
- Test: the four files with a full `Settings` literal: `__tests__/certificate.test.tsx`, `__tests__/checksSpeed.test.ts`, `__tests__/exportRows.test.ts` and `__tests__/sale.test.ts`. Each gains `setupDone: false`.

**Interfaces:**
- Consumes:
  - `homeBadge`, `useScanCheck`, `shownLabel` (Tasks 9 and 11);
  - `Screen` and `Header` (`brand`); `Button`; `ButtonRow`; `ListRow`; `SectionHeader`; `Sheet`; `IconButton`;
  - `savedList`, `lists`, `settings` and `updateSettings`.
- Produces:

```ts
// lib/settings.ts: Settings gains
setupDone: boolean; // "Get set up" was finished once; DEFAULTS: false (older files load with it)
// components/RecentRow.tsx
export function RecentRow(props: { scan: StoredScan; onPress: () => void }): JSX.Element; // a ListRow with homeBadge
```

**What Home shows** (§9.2, top to bottom):

1. **The header:** `Header brand onBack={null}`, with `IconButton`s for `ListIcon` "Your lists" (`router.push('/lists')`) and `SettingsIcon` "Settings" (`router.push('/settings')`). There's no ⋮ menu.
2. **Capture:**
   - "Take photo": primary, large, `Camera` icon, full width → `router.push('/camera')`;
   - a `ButtonRow` with "From gallery" (secondary, `ImageIcon`) → `flow.fromGallery()`, and "Import PDF" (secondary, `FileText`) → `flow.fromPdf()`;
   - all three are disabled while `flow.reading`;
   - the caption "MYBIZMATE INVOICE · SERVICE INVOICE · BIR 2307" (`type.overline` `mute`, centered).
3. **First run** (no recent and no saved scans):
   - `SectionHeader` "Before your first scan";
   - three numbered lines, each number in `type.figure` `brandText`: "The whole form in the photo", "Flat on a table, in good light", "Phone straight above it, no shadows".
4. **Get set up** (while `!settings().setupDone`):
   - `SectionHeader` "Get set up", right `` `${done} of 2` ``;
   - `ListRow` "Import your customers and items", sub "So scans can check names, TINs and prices", → `/lists`. It's `checked` when `lists().parties.length + lists().items.length > 0`;
   - `ListRow` "Set your export defaults", sub "VAT status and accounts for MyBizMate", → `/settings`. It's `checked` when `vatRegistered !== null && revenueAccount.trim() !== ''`;
   - when both are done, an effect calls `updateSettings({ setupDone: true })`, and the section is gone for good.
5. **To export** (when anything saved is waiting):
   - `SectionHeader` "To export", with action "All saved" → `/saved`;
   - one `ListRow` per kind with something waiting, each → `router.push({ pathname: '/saved', params: { kind } })`, with a chevron:

     | Title | Sub | Amount |
     |---|---|---|
     | "Sales" | `` `${n} to export` `` | `peso(Σ gross)` |
     | "Purchases" | `` `${n} to export` `` | `peso(Σ gross)` |
     | "2307s" | `` `${n} to export · Tax withheld` `` | `peso(Σ tax)` |

   - When scans are saved but none waits: `SectionHeader` "Saved", with one `ListRow` "Everything is exported" (chevron) → `/saved`.
   - With nothing saved, the section is hidden.
6. **Recent scans** (when there are any):
   - `SectionHeader` "Recent scans";
   - one `RecentRow` per scan:
     - **title:** `shownLabel(scan)`;
     - **sub-line:** `` `${formatClock(scan.at)} · ${FORMS[form].title}` `` (`subMono`, `subCaps`), or just the time with no form;
     - **badge:** `homeBadge(...)`;
     - it opens `/result` with `from: 'recent'`;
   - the caption (`type.label` `mute`): "The last 20 scans stay here. Save a scan to keep it."
7. **The end:**
   - a text `Button` "Try a sample invoice" opens the samples `Sheet`. It keeps today's title and subtitle, and its rows are `ListRow`s with the thumbnail as `leading` and today's handwriting sub-line;
   - the footer: `Lock` 16 dp `mute`, then "READ ON THIS PHONE · NO INTERNET" (`type.overline` `mute`).
8. **The reading card:** `ReadingOverlay`, as today.

- [ ] **Step 1: Write the failing tests.**

  `__tests__/home.test.tsx` (its own `expo-router` mock gives `push`). Replace the hero, the ⋮ menu and the tips assertions:
  - `'the header: the wordmark, Your lists and Settings; no menu'`;
  - `'capture: Take photo, From gallery, Import PDF, and what it reads'`;
  - `'first run: the tips until the first scan, and a sample counts'`;
  - `'Get set up: two rows, each checked when done, then gone for good'`. After both are done, `settings().setupDone` is true, and clearing the lists (`clearParties`) doesn't bring it back;
  - `'To export: a row per kind with its count and total; a row opens Saved for its kind'`;
  - `'everything exported: Saved, Everything is exported'`;
  - `'recent scans: title, time and form, and the badge; the caption says 20'`;
  - `'Try a sample invoice opens the samples sheet, which closes'`;
  - `'the footer'`.

  `__tests__/recentRow.test.tsx`: a badge per state, in `homeBadge`'s order. `__tests__/settings.test.ts`: `'settings kept before the UI pass load with setupDone false'`.

- [ ] **Step 2: Run** `npx jest __tests__/home.test.tsx __tests__/recentRow.test.tsx __tests__/settings.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement**, and delete `components/ScanIllustration.tsx`.

- [ ] **Step 4: Run** `npm test` and the gates. Expected: PASS.

- [ ] **Step 5: Commit** with the message `feat(app): Home as a workspace: capture first, what's waiting to export, recent scans with their state, first-run tips and setup`.

---

### Task 18: The export sheet in steps

**Files:**
- Modify: `components/ExportSheet.tsx` (rewrite), `lib/share.ts` (split), `app/saved.tsx` (its three buttons pass their kind until Task 19)
- Test: `__tests__/exportSheet.test.tsx` (new). Move the export-question tests here from `__tests__/savedScreen.test.tsx`, which keeps only its list tests. `__tests__/trainingScreen.test.tsx` doesn't change: the training export keeps its Alert.

**Interfaces:**
- Consumes:
  - `exportChoice`, `writeExport`, `writePartiesExport`, `partiesToCheck`, `newPartiesFirst` (`lib/exportFile.ts`);
  - `markExported`, `markPartiesExported`, `newParties`;
  - `Sheet` (`onBack`, `actions`), `SummaryBox` (Task 15), `ChoiceChips`, `Banner`, `ListRow`, `toast`.
- Produces:

```ts
// lib/share.ts
export type Shared = { ok: true; at: Date } | { ok: false; message: string };
export function shareFile(write: (now: Date) => Promise<string>, mimeType: string): Promise<Shared>;
// messages: "This phone can't share files." | "Couldn't make the file."
export function shareThenAsk(...): Promise<void>; // same signature and Alert as today, now built on shareFile
// components/ExportSheet.tsx
export function ExportSheet(props: { visible: boolean; kind: Kind | 'parties' | null; onClose: () => void }): JSX.Element;
```

**The steps** (§9.8, call 13). The sheet holds `step: 'files' | 'file' | 'asked'`, `which: Kind | 'parties'`, and `at: Date`.

1. **`'files'`** (when opened with `kind: null`), title "Export":
   - one `ListRow` per kind with saved scans: "Sales", "Purchases" and "2307s", with the sub `` `${n} to export` `` or "All exported", and a chevron;
   - "New customers and suppliers", when `newParties(lists, true).length > 0`, with the sub `` `${n} to export` `` or "All exported";
   - when `newPartiesFirst` holds for any kind's waiting rows, the parties row comes first, with a `type.label` `warning` line under it: "Export these first: they go in before the other files."
2. **`'file'`:**
   - today's title ("Export sales", …, "Export new customers and suppliers") and subtitle;
   - `onBack` → `'files'`;
   - a `SummaryBox`:
     - `File`: `Sales import · .xlsx` (Purchases import, 2307-CWT import, Parties import);
     - then, for an invoice kind, `` { key: 'Sales', value: `${n} · ${peso(total)}` } ``; for 2307s, `` `${n} · Tax withheld ${peso(tax)}` ``; for parties, `` { key: 'Parties', value: `${n}` } ``;
   - `ChoiceChips label="Which ones"` with today's ranges;
   - today's warnings, as `Banner tone="warning"`;
   - today's parties note, as body text;
   - with nothing in the choice: "Nothing to export for this choice", and Share disabled;
   - a file error: `Banner tone="danger"` with `Shared.message`;
   - actions: "Close" (text) and "Share the file" (primary, `Share` icon). Its `onPress` returns the share's promise, so it loads and runs once.
3. **`'asked'`** (after `shareFile` returns ok, even when the share was cancelled):
   - title "Did the file go where you wanted?";
   - the body: for one, `` `Mark this ${one} as exported, so the ${next} leaves it out. "${all}" still includes it.` ``; otherwise `` `Mark these ${n} ${many} as exported, so the ${next} leaves them out. "${all}" still includes them.` ``. `all` is "All", or "All added from scans" for parties, and the words are today's `EXPORTS[kind]` and the parties' `{ one: 'party', many: 'parties', next: 'next file' }`;
   - actions: "Not yet" (text) closes; `` `Mark ${n} as exported` `` (primary) marks with `at`, then closes, then shows `` toast(`Marked ${n} ${n === 1 ? one : many} as exported.`) ``.

`app/saved.tsx` (until Task 19): its three buttons open `ExportSheet` with their kind, and its parties button with `'parties'`.

- [ ] **Step 1: Write the failing tests** `__tests__/exportSheet.test.tsx`. Use `expo-sharing` mocked with `isAvailableAsync` and `shareAsync`, and the saved store filled through `saveScan` on fixtures, as `savedScreen.test.tsx` does today.
  - `'the files: each kind with what it has to export, and the parties first when they must go in first'`;
  - `'opened for a kind, it starts at that file, and Back goes to the files'`;
  - `'the file: its summary, Which ones, and today\'s warnings as banners'`;
  - `'nothing in the choice: Share is disabled'`;
  - **Review Focus 3.** `'Share the file writes once on a double tap'` (spy on `writeExport`);
  - `'after sharing: the question as a step; Mark N as exported marks them and says so'`: `markExported` is called with the rows' ids and the share's time, and `mockToast` gets `'Marked 2 sales as exported.'`;
  - `'Not yet marks nothing'`;
  - `'a cancelled share asks the same question'`;
  - `'file errors stay in the sheet'`: the write throws → "Couldn't make the file."; `isAvailableAsync` false → "This phone can't share files.";
  - `'Mark runs once on a double tap'`;
  - `'the parties file: All added from scans in the question'`.

- [ ] **Step 2: Run** `npx jest __tests__/exportSheet.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement** `shareFile`. Then `shareThenAsk` (built on `shareFile`, with the same Alert and words) and the steps.

- [ ] **Step 4: Run** `npm test` (`trainingScreen.test.tsx` still passes) and the gates. Expected: PASS.

- [ ] **Step 5: Commit** with the message `feat(app): one export sheet in steps: which file, the file, then the same question inside the sheet`.

---

### Task 19: Saved

**Files:**
- Modify: `app/saved.tsx` (rewrite), `app/_layout.tsx` (`saved`: `headerShown: false`), `lib/format.ts` (`monthYear`)
- Test: `__tests__/savedScreen.test.tsx` (update), `__tests__/format.test.ts`

**Interfaces:**
- Consumes: `ExportSheet` (`kind: … | null`), `ChoiceChips` (`showLabel={false}`), `ListRow`, `SectionHeader`, `EmptyState`, `BottomBar`, `deleteSaved`, `openSaved`.
- Produces: `monthYear(ym: string): string` ("2026-11" → "November 2026").

**What it shows** (§9.7):

- **The header:** "Saved". The subtitle is `` `${n} to export` ``, or "All exported" (none when nothing is saved).
- **The filter:** `ChoiceChips showLabel={false} label="Show"` with `` `All ${total}` ``, `` `Sales ${n}` ``, `` `Purchases ${n}` `` and `` `2307s ${n}` ``. A kind with nothing saved is hidden. It starts at the route param `kind` (`useLocalSearchParams<{ kind?: Kind }>`), else All.
- **The list:** a `SectionList`, with sections by `s.date.slice(0, 7)` (the invoice's date; a 2307's period end, as `exportChoice` uses), newest first.
  - Section headers: `SectionHeader title={monthYear(ym)}`.
  - Inside a section: `date` descending, then `savedAt` descending.
- **A row:** a `ListRow`:
  - **title:** `s.partyName || s.label`;
  - **sub** (`subMono subCaps`):
    - for an invoice: `` `${kindWord} · ${monthDay(s.date)}` ``, then `` ` · SI ${no}` `` for a sale or `` ` · Inv ${no}` `` for a purchase when `s.row['SI/OR No.']` or `s.row['Inv No.']` is set;
    - for a 2307: `` `2307 · ${s.period}` ``;
  - **amount:** `amount(s.kind === '2307' ? s.tax : s.gross)`;
  - **badge:** "To export" (brand), or "Exported" (neutral).

  Pressing a row runs today's `open(id)`. A long press asks: `Alert.alert('Delete this saved scan?', "It's removed from this phone. Files you already exported don't change.", [Cancel, Delete])`.
- **The bottom bar** (when anything is saved): one primary, "Export…" (`Share` icon) → `ExportSheet kind={filter === 'all' ? null : filter}`. Today's three buttons and the parties text button go.
- **Empty:**
  - nothing saved: `EmptyState title="Nothing saved yet" body="Save a scan and it shows up here, ready to export." actions={[{ label: 'Take photo', onPress: () => router.push('/camera') }]}`;
  - a filter with nothing: `` EmptyState title={`No ${plural} saved`} ``.

- [ ] **Step 1: Write the failing tests.**
  - `__tests__/format.test.ts`: `'monthYear'`.
  - `__tests__/savedScreen.test.tsx`:
    - `'Saved: its title and how many wait to export'`;
    - `'filters with counts; a kind with nothing is hidden; Home\'s kind comes preselected'`;
    - `'grouped by the month of the document\'s date: a Q1 2307 sits under March 2026'`;
    - `'a row: the party, kind · date · number, the amount and its badge'`;
    - `'a long press asks to delete, in the new words'`;
    - `'Export… opens the export at the filtered kind, or at the list of files'`;
    - `'nothing saved: the empty state with Take photo'`;
    - `'a filter with nothing: No purchases saved'`.

- [ ] **Step 2: Run** `npx jest __tests__/savedScreen.test.tsx __tests__/format.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run** `npm test` and the gates. Expected: PASS.

- [ ] **Step 5: Commit** with the message `feat(app): Saved: filtered by kind, grouped by the documents' months, one Export…`.

---

### Task 20: Your lists

**Files:**
- Modify: `app/lists.tsx` (rewrite), `app/_layout.tsx` (`lists`: `headerShown: false`)
- Test: `__tests__/listsScreen.test.tsx` (update)

**Interfaces:**
- Consumes: `matchesParty`, `matchesItem` (Task 14); `Segmented`; `TextField` (search); `Button`; `ListRow`; `SectionHeader`; `EmptyState`; `Banner`; `Sheet`; `toast`.

**What it shows** (§9.9; call 18 for the new copy):

- **The header:** "Your lists".
- **The tabs:** `Segmented label="List"` with `` `Customers ${n}` ``, `` `Suppliers ${n}` `` and `` `Items ${n}` ``, with no parentheses.
- **Search** (cleared when the tab changes):
  - a `TextField hideLabel leading={Search} clearLabel="Clear the search"`;
  - its label and placeholder: "Search name, TIN or code", or "Search name" for Items;
  - it filters with `matchesParty` or `matchesItem`.
- **The strip:** `SectionHeader` reading `` `${shown} of ${total} ${noun}` `` while searching, else `` `${total} ${noun}` ``. `noun` agrees in number: "1 customer".
- **The actions:**
  - "Import CSV" (secondary). Its `onPress` returns the import's promise, so a double tap opens one picker; keep today's `picking` ref;
  - "How to import" (text) opens a `Sheet`:
    - title `` `How to import ${tab}` ``;
    - body: today's `INTRO[tab]`, then today's `PARTY_COLUMNS` or `ITEM_COLUMNS`;
    - action: "Close".
- **The rows:** non-pressable `ListRow`s, in a `FlatList`, with the controls in `ListHeaderComponent`:
  - **A party:** title `partyName`; sub (`subMono`) the TIN (`` `TIN ${formatTin(tin)}` ``) and the code, joined with " · ".
  - **A party from a scan with no code:** sub `` `Added from a scan · ${exportedAt ? 'sent in a Parties file' : 'not exported yet'}` ``, after the TIN when there is one. It gets a "New" badge (brand) when `!exportedAt`.
  - **An item:** title the name; sub `[unit, price === null ? '' : peso(price)]` joined with " · ".
- **Clear:**
  - a `destructiveText` button at the end, `` `Clear ${tab}` ``;
  - it asks `` Alert.alert(n === 1 ? `Clear 1 ${singular}?` : `Clear all ${n} ${tab}?`, "They're removed from this phone. Saved scans don't change. You can import the file again.", [Cancel, Clear (destructive)]) ``.
- **An empty tab:** `EmptyState`, with the actions "Import CSV" (primary) and "How to import" (text). The words:

  | Tab | Title | Body |
  |---|---|---|
  | Customers | "No customers yet" | "Import the parties file from MyBizMate as a CSV. Scans then match names and TINs against it." |
  | Suppliers | "No suppliers yet" | "Import the parties file from MyBizMate as a CSV. You choose from these when you save a purchase." |
  | Items | "No items yet" | "Import your items as a CSV, with Name, Unit and Price. Scans then check each row's price." |

- **Import results:**
  - success: `toast` with today's full message ("Imported 21 customers and 2 suppliers.", plus the skipped rows);
  - a wrong file, missing columns, or an unreadable file: a `Banner tone="danger"` with today's message, under the actions. It clears on the next import or a tab change.

- [ ] **Step 1: Write the failing tests** in `__tests__/listsScreen.test.tsx`. Replace the intro, "Which columns?", "Customers (21)" and toast-error assertions:
  - `'the tabs are a radio group with plain counts'`;
  - `'search finds by name with or without accents, by TIN with or without dashes, and by code; the strip says 3 of 21 customers'`;
  - `'a party from a scan says so, with New until it is exported'`;
  - **Review Focus 3.** `'Import CSV opens one picker on a double tap'`: `File.pickFileAsync` is called once;
  - `'a wrong file shows today\'s words in a danger banner'`;
  - `'an import confirms in a snackbar'`;
  - `'Clear names the count and asks first'`;
  - `'an empty tab: its words, Import CSV and How to import'`;
  - `'How to import shows the intro and the columns'`.

- [ ] **Step 2: Run** `npx jest __tests__/listsScreen.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run** `npm test` and the gates. Expected: PASS.

- [ ] **Step 5: Commit** with the message `feat(app): Your lists with search, plain counts, How to import, and a clear that names what it clears`.

---

### Task 21: Open-source licenses

**Files:**
- Create: `scripts/collect-licenses.mjs`, `lib/licenses.ts`, `app/licenses.tsx`, `app/license.tsx`, `metro.config.js`, `test-utils/assetStub.js`, and the `assets/licenses/*.txt` the script writes
- Modify: `package.json` (`"licenses": "node scripts/collect-licenses.mjs"`; `jest.moduleNameMapper` `{ "\\.txt$": "<rootDir>/test-utils/assetStub.js" }`), `app/_layout.tsx` (both routes: `headerShown: false`)
- Test: `__tests__/licenses.test.ts`, `__tests__/licensesScreen.test.tsx`

**Interfaces:**
- Produces:

```ts
// lib/licenses.ts
export type LicenseEntry = {
  name: string; version: string; license: string; // "MIT", "Apache-2.0", "BSD-3-Clause and others", "OFL-1.1", "ISC"
  covers: readonly string[];                       // package names it covers; "expo-*" covers every expo-* module
  asset: number;                                   // require('../assets/licenses/<file>.txt')
};
export const LICENSES: readonly LicenseEntry[];
export function coveredBy(dependency: string): LicenseEntry | undefined;
```

**Which entries**, in this order. Versions come from `package.json`, `modules/scanner/android/build.gradle` and `model.json`.

| Entry | License | Its text comes from |
|---|---|---|
| React Native | MIT | `node_modules/react-native/LICENSE` |
| React (covers react, react-dom) | MIT | `node_modules/react/LICENSE` |
| Expo (covers expo and `expo-*`) | MIT | `node_modules/expo/LICENSE` |
| react-native-svg | MIT | its `LICENSE` |
| react-native-screens | MIT | its `LICENSE` |
| react-native-safe-area-context | MIT | its `LICENSE` |
| OpenCV 5.1.0 | Apache-2.0 | the Task 0 file |
| ONNX Runtime 1.32.0 | MIT | the Task 0 `LICENSE`, with `ThirdPartyNotices.txt` after it |
| PDFium chromium/8125 | BSD-3-Clause and others | the pdfium cache's `LICENSE`, with every `licenses/*`. The README says where the cache is; any ABI's copy will do. |
| PP-OCRv6 small, Latin (PaddleOCR) | Apache-2.0 | the Task 0 file |
| Lucide | ISC | the Task 0 file |
| Schibsted Grotesk | OFL-1.1 | `assets/fonts/OFL-SchibstedGrotesk.txt` |
| IBM Plex Mono | OFL-1.1 | `assets/fonts/OFL-IBMPlexMono.txt` |

The script copies each text to `assets/licenses/<slug>.txt`. It exits 1 naming any source it can't find.

**The screens:**
- `app/licenses.tsx`:
  - `Header title="Open-source licenses"`;
  - a `FlatList` of `ListRow`s (the name; sub `` `${license} · ${version}` ``, mono; chevron);
  - a row pushes `/license?i=<index>`.
- `app/license.tsx`:
  - `Header title={entry.name}`;
  - the text loads from `Asset.fromModule(entry.asset).downloadAsync()` and `new File(localUri).text()`;
  - it's split on blank lines and shown as a `FlatList` of paragraphs (`type.figureSmall` `ink`), since ONNX Runtime's notices are long;
  - while loading: an `ActivityIndicator`. On failure: "Couldn't open this license."

- [ ] **Step 1: Write the failing tests.**
  - `__tests__/licenses.test.ts`:
    - `'every production dependency is covered'`: each key of `package.json`'s `dependencies` has `coveredBy(dep)`;
    - `'the design\'s required notices are there'`: names include Schibsted Grotesk, IBM Plex Mono, Lucide, OpenCV, ONNX Runtime and PDFium;
    - `'every entry\'s text file exists and isn\'t empty'`: read `assets/licenses/*.txt` with `fs`.
  - `__tests__/licensesScreen.test.tsx`:
    - `'the list names each component with its license'`;
    - `'a license opens its text'`, with `expo-asset` and `expo-file-system` mocked.

- [ ] **Step 2: Run** `npx jest __tests__/licenses.test.ts __tests__/licensesScreen.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement.**
  - Run `npm run licenses`. Expected: it writes 13 files, and `git status` shows them.
  - `metro.config.js`: `getDefaultConfig(__dirname)` from `expo/metro-config`, then push `'txt'` onto `resolver.assetExts`.
  - Check that Metro still bundles: `npx expo export --platform android --output-dir <scratchpad>/export-check`. Expected: it exits 0. Delete the folder afterwards.

- [ ] **Step 4: Run** `npm test` and the gates. Expected: PASS.

- [ ] **Step 5: Commit** with the message `feat(app): open-source licenses on the phone: the fonts, Lucide, OpenCV, ONNX Runtime, PDFium, the model, and the app's libraries`.

---

### Task 22: Settings, with About

**Files:**
- Modify: `app/settings.tsx` (rewrite), `lib/versions.ts` (`BUILD_NUMBER`, `versionLine`), `app/_layout.tsx` (`settings`: `headerShown: false`)
- Test: `__tests__/settingsScreen.test.tsx` (update), `__tests__/versions.test.ts`

**Interfaces:**
- Consumes: `ChoiceChips`, `TextField` (`mono`, `warning`), `ListRow`, `SectionHeader`, `Sheet`, `Tap`, and the `/licenses` route (Task 21).
- Produces:

```ts
// lib/versions.ts
export const BUILD_NUMBER: string | null; // Constants.expoConfig?.android?.versionCode as a string, else null
export function versionLine(): string;    // "1.0.0 (12)", or "1.0.0" with no build number
```

**What it shows** (§9.10):

- **"Your business":** `ChoiceChips label="Your business is"` with today's values. The helper is "Suggests each sale's tax type". Neither is selected until one is chosen.
- **"Export defaults":** `TextField`s with `mono`, each saving as it's typed, as today:

  | Field | Helper |
  |---|---|
  | "Revenue account for sales" | "Code or name, as in MyBizMate" |
  | "Expense account for purchases" | |
  | "Withholding tax ATC" | "Used when an invoice shows tax withheld" |
  | "Offset account for 2307s" | |

  - The ATC: `warning="Like WC158: 2 letters, 3 digits"` when its value isn't empty and doesn't match `/^[A-Z]{2}\d{3}$/`. It doesn't block, and the value still saves as typed.
  - The note after the fields: "These fill in what MyBizMate's import needs that isn't on the paper. You can change them on each invoice when you save it. Changes save as you type."
- **"About":**
  - `ListRow` "Privacy" (chevron) opens a `Sheet` titled "Privacy", holding four `type.body` lines: "Scans are read and kept on this phone.", "Nothing is sent anywhere.", "There's no cloud backup.", "Uninstalling the app removes everything it kept.";
  - `ListRow` "Open-source licenses" (chevron) → `router.push('/licenses')`;
  - `ListRow` "Version", with `amount={versionLine()}` and no press.
- **"Team tools"** (`TEAM_BUILD`):
  - one switch row: a `Tap` with `accessibilityRole="switch"`, `accessibilityLabel="Annotation mode"` and `accessibilityState={{ checked }}`. Tapping anywhere on it toggles. Its RN `Switch` is hidden from TalkBack and toggles the same setting. The track is `{ false: colors.outline, true: colors.brand }` and the thumb `panel`. This fixes M4's deferred minors (`app/settings.tsx:81-89`, `:87-88`).
  - today's note under it;
  - `ListRow`s "Training data" → `/training` and "Speed test" → `/speed`.
- Fields scroll into view above the keyboard through `Screen` (Task 5).

- [ ] **Step 1: Write the failing tests.**
  - `__tests__/versions.test.ts`: `'versionLine shows the build number only when there is one'`.
  - `__tests__/settingsScreen.test.tsx`:
    - `'three groups, each field with its helper'`;
    - `'the ATC hint warns without blocking, and the value saves as typed'`;
    - `'Privacy opens a sheet in plain words'`;
    - `'Open-source licenses opens its screen'`;
    - `'Version shows the version'`;
    - `'Team tools: annotation mode is one switch row that toggles from its label'`;
    - `'client builds show no team tools'`.

- [ ] **Step 2: Run** `npx jest __tests__/settingsScreen.test.tsx __tests__/versions.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run** `npm test` and the gates. Expected: PASS.

- [ ] **Step 5: Commit** with the message `feat(app): Settings grouped with helpers, a gentle ATC check, About with privacy, licenses and version`.

---

### Task 23: Launch

**Files:**
- Modify: `components/BrandSplash.tsx`
- Test: `__tests__/splash.test.tsx` (update)

**Interfaces:**
- Consumes: `Button`, `LoadingBar` (Task 16), `type`, `TEAM_BUILD`.

**What it does** (§9.1, §12 A11):

- **The floor:** `MIN_MS = 500`, in place of 1200. `FADE_MS` stays 300.
- **Normal:**
  - the logo where the phone's splash drew it, as today;
  - "mybizmate" with ".io" in `brandText` (`type.title`);
  - today's tagline ("Scan invoices. Even offline.", `type.body` `mute`);
  - under them, `LoadingBar` and "Getting the scanner ready…" (`type.label` `mute`).
- **The start:** a `start()` runs today's sequence: `preload()`, `loadAppData()`, the warm-up read (its failure is ignored), the floor, the fade, then `onReady`. Each piece reads its files again and replaces its state, so running the sequence a second time is safe.
- **Couldn't start:**
  - "The scanner couldn't start" (`type.headline`);
  - "Try again. If it keeps happening, close the app and open it again." (`type.body`);
  - a primary "Try again". Its `onPress` returns `start()`'s promise, so it shows loading and runs once;
  - in team builds, the raw message in `type.figureSmall` `mute`;
  - the block is a polite live region.

- [ ] **Step 1: Write the failing tests** in `__tests__/splash.test.tsx`:
  - `'ready after at least half a second, then the fade'`;
  - `'a failed start: the words and Try again; the raw message only in team builds'`;
  - **Review Focus 3.** `'Try again starts again, once per tap'`: `preload` is mocked to fail once, then succeed. Two presses start one run, and `onReady` follows.
  - `'the failure is announced'`.

- [ ] **Step 2: Run** `npx jest __tests__/splash.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run** `npm test` and the gates. Expected: PASS.

- [ ] **Step 5: Commit** with the message `feat(app): the splash shows for half a second at least, and a failed start offers Try again`.

---

### Task 24: Team screens: consistent styling only

**Files:**
- Modify: `app/speed.tsx`, `app/training.tsx`, `components/TeamOnly.tsx`, `app/_layout.tsx` (`speed` and `training`: `headerShown: false`)
- Test: `__tests__/speed.test.tsx`, `__tests__/trainingScreen.test.tsx`, `__tests__/teamOnly.test.tsx`. Only update where a title or role moved; behaviour doesn't change (§9.11).

**What changes:**
- Both screens become `Screen` with `Header` ("Speed test" / "Training data"). `TeamOnly` renders inside the `Screen`, so a client build still has the header and its Back.
- **Speed test:**
  - the title line in `type.headline`;
  - the device line in `type.label` `mute`;
  - the median in `type.figureStrong`, with "per invoice, median" in `type.label`;
  - progress: a 4 dp `sand` track with a `brand` fill;
  - the results as `LedgerRow`s (label and value, not pressable);
  - "Run speed test" / "Run again" as a primary `Button` that returns the run's promise;
  - the note in `type.label` `mute`.
- **Training data:** today's lines in `type.body`, then "Export training data" as a primary `Button`. M4's copy and behaviour are unchanged.

- [ ] **Step 1: Update the tests' title and role queries.** Run `npx jest __tests__/speed.test.tsx __tests__/trainingScreen.test.tsx __tests__/teamOnly.test.tsx`. Expected: FAIL only where the header moved.

- [ ] **Step 2: Implement.**

- [ ] **Step 3: Run** `npm test` and the gates. Expected: PASS.

- [ ] **Step 4: Commit** with the message `feat(app): the team's screens in the design's tokens and components`.

---

### Task 25: Cleanup: retired tokens, adapters and literals; the README

**Files:**
- Modify:
  - `lib/theme.ts`: remove `coral`, `ember`, `coralText`, `coralTint`, `pine`, `pineTint`, `amber`, `amberTint`, `imageBg`, `cropBg`, `fullScreen`, `backdrop`, `bold` and `sectionLabel`;
  - `components/Buttons.tsx`: remove `PrimaryButton`, `OutlinedButton` and `TextButton`;
  - every remaining user of those (find them with `npx tsc --noEmit` after the removal);
  - `app/_layout.tsx`: every route hides the Stack header, so `screenOptions` becomes `{ headerShown: false, contentStyle: { backgroundColor: colors.paper } }` and the per-route header options go;
  - `README.md`.
- Test: `__tests__/noLiterals.test.ts` (new), `__tests__/theme.test.ts` (the retired keys are gone)

- [ ] **Step 1: Write the failing test** `__tests__/noLiterals.test.ts`:
  - read every `.tsx` under `app/` and `components/` with `fs`;
  - drop lines that contain `// optical:`;
  - for each remaining line, expect no match of:

    ```ts
    const BANNED: [RegExp, string][] = [
      [/#[0-9A-Fa-f]{3,8}\b/, 'a hex color'],
      [/\bfont(Size|Family|Weight)\s*:/, 'a type literal'],
      [/\blineHeight\s*:/, 'a line height literal'],
      [/\b(margin|padding)(Top|Bottom|Left|Right|Horizontal|Vertical|Start|End)?\s*:\s*-?\d/, 'a spacing literal'],
      [/\bgap\s*:\s*\d/, 'a spacing literal'],
      [/\bborder(Top|Bottom)?(Left|Right)?Radius\s*:\s*\d/, 'a radius literal'],
      [/allowFontScaling=\{false\}/, 'fixed text size'],
      [/numberOfLines=/, 'cut text'],
      [/opacity:\s*0\.6\b/, "the old press fade"],
    ];
    ```

  - the failure message lists `file:line: what`.

  Add to `__tests__/theme.test.ts`: `'the retired colors are gone'` (`expect(colors).not.toHaveProperty('ember')`, and so on).

- [ ] **Step 2: Run** `npx jest __tests__/noLiterals.test.ts __tests__/theme.test.ts`. Expected: FAIL, listing the offenders.

- [ ] **Step 3: Fix.**
  - Replace each offender with its token, or with a component that owns it. A truly one-off optical value stays, with `// optical: <why>`.
  - Remove the retired names and the adapters, and change their call sites to `Button` with a `variant`.
  - Delete any file now unused: `git ls-files components | xargs grep -L` against imports. Expected: none left after Tasks 11–17.

- [ ] **Step 4: Update the README.**
  - In "What it does" (README lines 18–320) and "Run it on the Android emulator", change what this pass changed:
    - "Saved invoices" becomes "Saved";
    - Home's ⋮ menu becomes the header's Your lists and Settings;
    - the Speed test is in Settings › Team tools;
    - "N% sure" becomes "Hard to read" (below 0.90);
    - the photo viewer and Save to Pictures;
    - the export question is a step in the export sheet;
    - the snackbar;
    - recent scans keep 20;
    - first-run tips and Get set up;
    - Open-source licenses (`npm run licenses` refreshes their texts).
  - Under "Release checklist › Open-source notices", say the app now shows them in Settings › About.
  - The dev client's Tools button note says "over Home's ⋮ menu": it now sits over the header's icons.
  - Leave every "Checked on the emulator (milestone N)" section as it is.

- [ ] **Step 5: Run** `npm test` and the gates. Expected: PASS.

- [ ] **Step 6: Commit** with the message `refactor(app): retire the old colors, button adapters and literals; the README describes the new screens`.

---

### Task 26: QA on the emulator, and the report (the controller runs it)

**Files:**
- Create: `.superpowers/brainstorm/ui-2026-11-22/qa/*.png` and `.superpowers/brainstorm/ui-2026-11-22/qa/index.md` (in the parent folder, outside git)
- Modify: `README.md` (a "Checked on the emulator (UI pass)" section)
- Temporary, never committed: `app/qa-fill.tsx`

- [ ] **Step 1: Get the emulator.** Check that no other session is using it, and ask the user when unsure.
  - If the installed build isn't Task 0's, rebuild and reinstall with the README routine. Another session may have reinstalled since: compare `adb shell dumpsys package com.mybizmate.scan | grep lastUpdateTime` with Task 0's install.
  - Start Metro from this checkout on `ui-design-b`.

- [ ] **Step 2: Back up the app's data** with README step 2, to `/tmp/scan-appdata-qa.tar`. Every check below that changes data ends by restoring it (README steps 3–4).

- [ ] **Step 3: Four passes** (§15), each over every screen and state of design §9:
  1. **Defaults.**
  2. **Font scale 2.0:** `adb shell settings put system font_scale 2.0`.
  3. **3-button navigation:** `adb shell cmd overlay enable com.android.internal.systemui.navbar.threebutton`.
  4. **360 dp wide:** `adb shell wm density 480`.

  After each pass, restore: `font_scale 1.0`; `cmd overlay enable com.android.internal.systemui.navbar.gestural`; `wm density reset`.

  The states:
  - **Launch:** normal. Couldn't start is checked in jest unless it can be forced.
  - **Home:**
    - a normal day;
    - first run: `adb shell pm clear com.mybizmate.scan`, then restore the backup afterwards.
  - **Camera:**
    - starting, found, holding;
    - can ask: `adb shell pm revoke com.mybizmate.scan android.permission.CAMERA`;
    - refused for good: also `adb shell pm set-permission-flags com.mybizmate.scan android.permission.CAMERA user-fixed`;
    - no camera and couldn't start: jest only;
    - grant the permission back afterwards.
  - **Reading:** a photo and a PDF.
  - **Scan:**
    - to check, with chips;
    - a chip opening its row;
    - checks passed;
    - a fixed box;
    - blocked (a 2307 with no payments, if a fixture gives one);
    - not found;
    - saved, and changed since saved;
    - a sample;
    - a 2307;
    - a text PDF.
  - **The photo viewer:** Enhanced, B&W, Original, and the Save to Pictures snackbar.
  - **Fix a box:** a one-box editor, a multi-box list, discard.
  - **The other sheets:** party, supplier, terms, payor, and the save sheets.
  - **Saved:** filters, a month group, empty.
  - **Export:** steps 1–3.
  - **Your lists:** the tabs, search, empty, How to import, the Clear prompt.
  - **Settings:** with Privacy, Licenses and one license text.
  - **Team screens.**

  Never open the photo picker for a capture: pick gallery photos by their labels in a text-only dump. Use samples and made-up data only.

  Save each capture as `<pass>-<screen>-<state>.png`. In `index.md`, write for each one what it shows, what was checked (insets, wrapping, stacking, contrast as rendered), and the audit capture it answers (for example, `p3-02b` → the bottom bar clears the 3-button bar).

- [ ] **Step 4: Keyboard states.**
  - With the user's OK, run `adb shell settings put secure show_ime_with_hard_keyboard 1`.
  - Capture the box editor (an amount and a name, to show `visible-password` and the default keyboard), the save sheet's account field, a Settings field near the bottom, and Lists' search.
  - Each field and its action row must sit above the keyboard.
  - Set the setting back to `0`.

- [ ] **Step 5: TalkBack.**
  - Take uiautomator dumps of each screen: text only, kept in the scratchpad, never of a real scan, deleted after. Check that every control has a name, a role (class, clickable, checkable) and a state, that badges are part of their row, and that headers are marked.
  - Spot-check the Scan screen's fix loop with TalkBack on. If the image has no TalkBack, record that.

- [ ] **Step 6: Behaviour checks.**
  - **(a) Font size in place:** with a scan open and text typed in a sheet, change the font scale. It survives with the config plugin; without it, record that the screen restarts.
  - **(b) Recent scans:** 21 sample scans → Home lists 20, and the scanner keeps 20 scan folders. Count the scans folder `ScannerModule.kt` writes, through `run-as`.
  - **(c) Scale:**
    - Add an uncommitted, `TEAM_BUILD`-only `app/qa-fill.tsx` that writes 500 made-up saved scans and 2,000 made-up parties through the app's own store functions.
    - Run `adb shell dumpsys gfxinfo com.mybizmate.scan reset`, then 10 `adb shell input swipe` flings on Saved and on Your lists, then read `dumpsys gfxinfo` (the janky-frame percentage).
    - Restore the backup and delete `app/qa-fill.tsx`. Then `git status` must show it gone.

- [ ] **Step 7: The core suite, once.** Run `npm run test:core`. Expected: PASS. This pass touched nothing it covers.

- [ ] **Step 8: Restore and report.**
  - Restore: the app data from the backup (README steps 3–4), the emulator's settings (Step 3's restores, the keyboard setting, the camera permission), and `rm /tmp/scan-appdata-qa.tar`.
  - Add "Checked on the emulator (UI pass)" to the README, in the style of the milestone sections:
    - what was checked, pass by pass;
    - the scale figures;
    - the keyboard and TalkBack results;
    - the font-size result;
    - what couldn't be checked here: a real phone's feel and speed, the real camera, and iOS.
  - Commit with the message `docs: the UI pass, as checked on the emulator`.
  - Tell the user where the captures are, with two or three before-and-after pairs.

---

## Execution notes

- **Who runs what:**
  - The controller runs Task 0 and Task 26 itself: they need the user's OKs, the shared emulator and native builds.
  - Tasks 1–25 go to implementer subagents in order, each reviewed before the next. They're JS-only, except Task 0's native work.
  - Give each implementer its task, the Global Constraints, the Calls, the Review Focus line its task owns, and the design § its task cites.
- **Device steps** (Task 7 step 6, Task 11 step 5, Task 26): check first that no other session holds the emulator. Ask the user when unsure.
- **Order:** the tasks depend in order on the components before them. Any two later screen tasks touch different files, apart from `app/_layout.tsx`'s per-route header lines, but they still run one at a time, as subagent-driven development does.
- **The end:** after Task 26, a whole-branch review on the most capable model. Then superpowers:finishing-a-development-branch. Merge into master and push only at the user's word, with no pull request.

