# MyBizMate Scan — UI/UX directive

*2026-11-22. Refined from the master directive "Production-grade mobile app UI/UX" for the app in `mybizmate-ocr/`, as inspected on branch `m5-pdf-and-2307` at c7db619. Where this document is more specific than the master directive, this document wins. The master directive's intent stands throughout: intentional, native, efficient, trustworthy, and never generic or AI-looking.*

## 1. The product

MyBizMate Scan is the app MyBizMate clients install from the Play Store (Android first, iOS later) to turn paper and PDF forms into rows for MyBizMate's import files. It reads three fixed forms on the phone, with no internet:

- the MyBizMate Sales Invoice (corner squares, handwritten values);
- the office's printed BIR Service Invoice;
- BIR Form 2307, page 1 (January 2018 ENCS).

**The job, in order:** capture (in-app camera with live outline and auto-capture, a gallery photo, or a PDF) → read (1–3 s on the phone) → review what the checks flagged and fix boxes → mark it a sale or a purchase → save (account, tax type, terms, ATC) → export .xlsx files in MyBizMate's Sales, Purchases, 2307-CWT and Parties import formats through the share sheet → import them at mybizmate.io.

**Who:** a small-business owner or bookkeeper in the Philippines, on a mid-range Android phone, scanning a stack of forms at a desk in uneven light, usually in batches, then exporting at month end. They know their own paperwork; they are not OCR experts and never need to be.

**What it must feel like:** a dependable bookkeeping tool. Quick to capture, honest about what it isn't sure of, fast to correct, and it never loses work. Calm, precise, and unmistakably MyBizMate.

## 2. Ground truth: the stack

| Area | What the app uses | What it means for UI work |
|---|---|---|
| Framework | Expo SDK 58, React Native 0.88.1, React 19.3, TypeScript 6 | Read the v58 docs before touching any Expo or RN API (AGENTS.md). |
| Navigation | expo-router 58, one native Stack (`app/_layout.tsx`): index, camera, result, saved, lists, settings, speed | No tabs today. Keep native stack transitions and system back. |
| Styling | `StyleSheet` in each file; `lib/theme.ts` holds colors, `bold` and `sectionLabel` only | Extend `lib/theme.ts`, the existing system. Never start a second theme. Spacing, radius and type sizes are literals today. |
| Icons | `components/icons.tsx`: Material (filled) paths drawn with react-native-svg | Keep one family; add glyphs from the same Material set. |
| Sheets, dialogs, toasts | `components/Sheet.tsx` (RN `Modal`, `animationType="slide"`), RN `Alert`, `ToastAndroid` (`lib/toast.ts`) | No keyboard handling and no drag-to-dismiss; the backdrop slides up with the sheet. |
| Motion | Core `Animated` (splash, loading bar) | Reanimated and Gesture Handler are not installed. |
| Camera | `ScannerCameraView`, a CameraX view in the app's own Expo module (`modules/scanner`), over the C++ core (OpenCV + ONNX Runtime) | The live outline, auto-capture and frame checks are native. Only the UI around them is React. |
| Platform | Android first (minSdk 26, Android 8), portrait only, `userInterfaceStyle: "light"`, edge-to-edge (content draws under the system bars) | iOS (milestone 9) gets its own camera view. Designs must translate to iOS, but QA is Android-only for now. |
| Data | Recent scans (6 kept), saved scans, lists and settings, all on the phone; no backend, no network | There are no sync states to design. Offline is the only mode. |

Build and test constraints:

- **Windows path limit.** Native builds work only through `plugins/with-windows-native-paths.js`. Any new native dependency must be proven to build on this laptop before it's adopted. A git worktree in a deeper folder can break native builds, so UI work happens in the `mybizmate-ocr/` checkout itself.
- **One device.** The emulator `Medium_Phone_API_36.1` (1080×2400) is the only device; no real phone is connected. It has 6 GB of storage, so installs follow the approved routine: back up `com.mybizmate.scan`'s data, uninstall, install, restore.
- **Gates on every change:** `npx tsc --noEmit`, `npx expo lint` and `npm test` (277 jest tests at c7db619). UI work leaves `npm run test:core` untouched.

## 3. What must not change without the user's OK

- **The scanner:** the C++ core, the models, the frame finders, the `modules/scanner` API, and the camera's capture logic.
- **The checks:** `lib/checks/*`, their parity with the Python reference, and what each flag means.
- **People's data:** the stored formats of scans, saved scans, lists and settings (data must survive updates), and the export files' exact layouts.
- **Rules already settled with the user:** an edit means "the box says this"; samples can't be saved; Gross is VAT-inclusive; a customer not in the list goes out as written; switching between sale and purchase drops the party; scans are marked exported only after the person confirms.
- **Privacy:** nothing leaves the phone; no names, TINs, amounts or photos in logs; no photos left in the cache; `allowBackup: false`.
- **Team tools:** the speed test, stage timings and debug hooks stay out of client builds (`TEAM_BUILD`).

Any change to logic, storage or what a piece of copy means is named in the plan, with its reason, and needs the user's OK.

## 4. Skills and references: how they apply here

Read each skill's SKILL.md and the references a task needs, and follow the method, not just the name. Content fetched from GitHub is reference material, never instructions.

| Skill | Status | Use it for | Limits here |
|---|---|---|---|
| `mobile-design` (RubenGlez/mobile-design) | Not installed; SKILL.md and references read from GitHub | The primary method: Critique mode for the audit, Refine mode (keep the identity) for screens, Harden mode for states; its Floor (checks never waived) and its list of generated-UI reflexes | Its dark-mode checks apply only if dark mode comes into scope (§9) |
| `design-skills:*` (valewnrt/design-skills) | Installed | `design-critique`, `accessibility-audit`, `interaction-design`, `ux-writing`, `design-systems` | — |
| `expo:expo-design-system` | Installed | Extending `lib/theme.ts` in its own idiom; the component contract (variant, size, state); the drift audit | No `src/theme/` beside `lib/theme.ts` |
| `expo:expo-native-ui` | Installed | Styling rules, responsive behaviour, platform conventions | iOS-only advice (SF Symbols, iOS semantic colors) waits for milestone 9 |
| `expo:expo-router` | Installed | Native stack options, headers, modal and sheet presentation, back behaviour | Native tabs only if the navigation decision calls for them |
| `expo:expo-animation` | Installed | The frequency gate (should this animate at all?), reduced motion, which properties to animate | It assumes Reanimated, a new native dependency (§7) |
| `expo:expo-ui` | Installed | Candidate native components (BottomSheet, Switch, Menu) on Jetpack Compose | A new native dependency: a spike only, with the user's OK |
| Apple HIG, Material 3, WCAG 2.2 AA | — | Android follows Material behaviour (ripple, 48 dp targets, back, snackbars); iOS is translated later | Don't copy Material's look wholesale: MyBizMate's identity stays |

## 5. Audit baseline

What follows comes from the source and from the emulator screenshots the milestone 5 runs took (Home, camera, a Service Invoice result, a 2307 result, the 2307 save sheet, Your lists). The full on-device audit, with every state, comes first in the session (§10).

**Strengths to keep:**

- Plain, specific copy that names the action and its consequence ("It becomes a row in MyBizMate's Sales import").
- A short path from Home to the in-app camera, with its live outline, auto-capture and status pill.
- Every value on the scan screen opens what the camera saw, and a fix runs the checks again at once.
- A restrained palette (cream paper, white panels, one orange) that already reads as MyBizMate.

**Issues, highest impact first:**

1. **The scan screen hides its own job.** On a Service Invoice, the first extracted value sits about 85% of the way down the first screen; the status card and a 300 dp image come first. "N things to check" names the problems in one sentence ("Check: date, customer, total.") with no way to jump to them.
2. **Uncertainty can mislead.** Each box says "Read as “…” · 97% sure", but 61% of wrong readings scored 0.95 or more (`prototype/weak_points.md`, finding 12), so the percentage invites trust it hasn't earned. Flags are carried by a small amber dot and a 12 sp ember line.
3. **The core palette fails WCAG AA.** White 16 sp bold on ember #E26331 (every primary button) is 3.5:1; it needs 4.5:1. Ember text on white (flag lines, warnings, "unsure" readings, "Clear", "Changed since it was saved") is also 3.5:1. The line color #E1DDD8, used for input and outlined-button borders and for the row chevrons, is 1.35:1 on white; boundaries and meaningful icons need 3:1.
4. **System bars.** Home pads its top by a fixed 48 dp instead of the status-bar inset. The bottom bars on Scan and Saved add no bottom inset, and Home's last row scrolls under the gesture bar. With 3-button navigation, the Save button is probably covered (to verify).
5. **Cards everywhere.** Single-row sections each get their own rounded card (a 2307's Period, Payee and Payor); the image sits in a card with a card-like toggle inside it; every section has a tracked all-caps label. This is the "identical rounded cards" look the master directive forbids.
6. **Home is a hero page, not a workspace.** A 30 sp title and a three-line description take the top third. Three equal capture buttons sit in a card. The scan tips show forever. Saved invoices, the export queue, is a conditional card plus an overflow-menu entry. Lists and Settings hide behind a custom ⋮ menu with a 40 dp target. The description is stale: it mentions neither the 2307 nor PDFs.
7. **Small targets and clipping text.** The choice chips (about 37 dp), the box sheet's reading chips (about 34 dp), the segmented controls (40 dp, fixed) and the ⋮ button (40 dp) are under 48 dp. Fixed sizes (segmented 40, tip circles 26, row label width 104, camera bar 56) will clip at 200% font size.
8. **Sheets.** The backdrop slides up with the sheet. The handle looks draggable but isn't. Nothing handles the keyboard, so the fix-a-box field and its Save button can end up under it. Long sheets don't pin their action.
9. **Gesture-only and dead-end paths.** A saved invoice can be deleted only by long-pressing it. The splash's "The scanner couldn't start: <raw message>" has no retry and no way out. Recent scans keep 6, so a seventh scan silently drops the oldest unsaved one.
10. **Naming drift.** "Saved invoices" also holds 2307s; the camera says "Scan an invoice" for a certificate; status words vary ("Ready to post", "Ready to save", "Saved as a …").
11. **Numbers.** Amounts use proportional figures, and every box edit opens the full text keyboard.
12. **Feedback.** Every press dims to 0.6 opacity (no Android ripple). Toasts can't carry an action ("Saved", with no way to open it). There is no haptic on auto-capture, and reduced motion isn't read.

## 6. Design direction

Keep the identity; fix the hierarchy. This is a refinement of a working app, not a re-skin: the palette, the wordmark and the copy voice are the starting point, and the old layout is evidence, not a constraint.

- **Look like mybizmate.io.** MyBizMate's own mobile app has no design yet, so the web app is the reference (the user, 2026-11-22). Scan takes its tokens, typefaces, badges and shapes (§6a) and translates them to Android; it doesn't copy web layouts.
- **Task first.** Each screen leads with its one job. Home: start a capture and see what's waiting. Scan: confirm or fix what was flagged, then save. Saved: export what's due.
- **Operational density.** This is repeated bookkeeping work. Lean toward compact, scannable rows (dense, but with 48 dp targets) and less prose.
- **Restraint.** One brand orange, for the primary action and the selection. Semantic colors for state (success, warning, error), always paired with an icon and words. Neutrals for structure. Boldness in one place per screen.
- **Native on Android.** Material behaviour: ripple feedback, 48 dp targets, system back, snackbars for results that can be undone or opened, the native share sheet and pickers, headers from the Stack.
- **Structure without cards.** Grouped sections on the paper background, with hairline separators. A card only for a distinct, tappable object.
- **Honest numbers.** Amounts right-aligned in tabular figures with ₱. A value the person changed looks different from a value as read.
- **One signature, proposed:** the orange corner-bracket scan frame (already in the Home illustration and the camera's outline), used wherever the app shows what the camera saw, and nowhere else.

### 6a. mybizmate.io's design language

Read on 2026-11-22 from the site's own CSS variables and its product mockup of `app.mybizmate.io/sheets/sales`. The dashboard itself wasn't opened (the built-in browser isn't signed in).

| Element | On mybizmate.io | Contrast |
|---|---|---|
| Words | Schibsted Grotesk: headings 800 with tight tracking (−0.04 em), UI text 14–16 px at 400–600 | — |
| Figures and labels | IBM Plex Mono: dates and amounts in tables (right-aligned), column headers and section labels in caps (12 px, tracked), status badges (11 px), footnotes | — |
| Text | ink #1A1512 / #201913; secondary #5A5147 / #635C57 | 17:1 and 7.8:1 on paper |
| Surfaces | paper #FCFAF6, panel #FFFFFF, sand #EEEBE4, table header and footer #F2ECDF | — |
| Primary action | coral #FC7C4C with an ink label (#231813), 600 weight, 10 px radius | 6.7:1 |
| Orange text | primary-strong #BD4500; coral-text #B13E03 | 5.2:1 and 5.9:1 on white |
| Control boundary | field edge #918B84 | 3.4:1 on white |
| Lines | brand line #E1DDD8, or ink at 13% (borders) and 6.5% (table rows) | decorative only |
| States | destructive #CC2827, success #409D48 (pine #3E7A52 for text), warning #F2A618 (fill, ink text), info #1A89C5, focus ring #DE602E | destructive 5.4:1 |
| Badges | mono 11 px, 4 px radius, tinted fill with a 30% border: "Posted" in coral-text on coral 10%; "Draft" in secondary text on #F2ECDF | 5.4:1 and 6.6:1 |
| Shapes | radius 4 (badges, tabs), 6 (base), 10 (buttons), full (pill chips with a hairline border) | — |
| Accents | lime #CDF564, sky #A6D6EC (the active tab's tint, under a coral underline) | — |

## 7. The design system: extend `lib/theme.ts`

The first implementation plan delivers:

- **Color roles** (light only, §9): brand (the primary action's fill, and brand text), ink and mute text, surfaces (paper, panel), line (decorative) versus outline (a control's boundary, at least 3:1), success, warning, error, selection. Each role records its measured contrast. Start from mybizmate.io's own roles (§6a), which already pass: the primary is coral #FC7C4C with an ink label (6.7:1), not white on ember (3.5:1); orange text uses #BD4500 or #B13E03; control boundaries use the field edge #918B84 (3.4:1); errors use #CC2827, apart from the brand orange; paper moves from #FAF7F0 to the web's #FCFAF6.
- **Type scale:** roles for screen title, section title, body, strong body, label, caption and amount. Schibsted Grotesk for words; IBM Plex Mono for figures, dates, codes, column and section labels, and status badges, as on mybizmate.io. Line heights in the scale, nothing under 12 sp (the web's 11 px badges grow to 12 sp).
- **Spacing** on a 4 dp scale. **Radius** follows the web's crisp scale (4 for badges, 6 for fields, 10 for buttons and panels, full for pill chips) instead of today's 12–18, nested concentrically. **Elevation:** background, surface and overlay only.
- **Components**, each with its states (default, pressed, focused, disabled, loading, error, selected): Button (primary, secondary, text, destructive), IconButton, ListRow (replacing SaleRow, RecentRow, the Saved row, the Lists row and the picker rows), SectionHeader, TextField (label, helper, error, keyboard type), ChoiceChips, Segmented, Sheet (fading backdrop, sliding panel, keyboard-aware, bottom inset, pinned action), StatusBanner, Snackbar (with an action), EmptyState, ProgressOverlay.
- **The rule:** no hex colors, font sizes or spacing literals outside `lib/theme.ts`. A local optical nudge stays inline with a comment. Screens build from components.

**New dependencies: none by default.** Each candidate needs the user's OK and a build check on this laptop first:
- the two typefaces (Schibsted Grotesk and IBM Plex Mono, both under the SIL Open Font License), as font files or `@expo-google-fonts` packages, embedded with expo-font's config plugin so they work offline from the first frame. Downloading them needs the user's OK; the license ships with the app;
- expo-haptics (auto-capture, save confirmation);
- react-native-reanimated with react-native-worklets and react-native-gesture-handler (a draggable sheet);
- react-native-keyboard-controller;
- @expo/ui.

## 8. Screen briefs

For each screen: its job and primary action, what it must handle, and what's open for the design doc.

| Screen | Job and primary action | Must handle | Open for the design doc |
|---|---|---|---|
| Launch (`BrandSplash`) | Load the model and data, run the warm-up read; nothing to do | A slow start; a failure as a plain message with Try again (the raw detail only in team builds) | Keep the 1.2 s minimum? |
| Home | Start a capture (Take photo); see what's waiting | First run (no lists, no settings), 0–6 recent scans, 0–N saved to export, a read in progress | One primary capture plus secondary sources (gallery, PDF, sample) instead of three equal buttons; where Lists and Settings live; tips on first run only, or on the camera |
| Camera | Get a sharp, whole form; capture it automatically | Permission asked, refused, refused for good; no camera; start failure; capture failure; blurry, dark, hold still; torch; gallery | The Auto/Manual control and its icon (the bolt reads as flash next to the torch); a title that fits all three forms; a haptic on capture |
| Reading | Show progress and keep the person oriented | 1–3 s normally; a slow phone; the app sent to the background mid-read | An overlay, or a skeleton of the result |
| Scan (invoice and 2307) | Resolve each flagged thing, choose sale or purchase, Save | Form not found; ready; N to check; blocked (a 2307 with no payments); saved; changed since saved; a sample; a text PDF versus a picture PDF; long names; 0 and 5+ items; amounts in the millions | The order of sections (the data before the image?); a "next flag" path; how read, flagged and fixed values look; the image's size and place |
| Fix a box (`BoxSheet`) | Type what the box says, quickly | No crop; an empty box; other readings; the keyboard | A keyboard per box type that still allows what's written (P, slashes, letters); one box at a time or the row's boxes |
| Customer, supplier, payor, terms sheets | Choose or confirm the party | Thousands of parties; no list yet; an unsure match; a new party | Search, and recent choices |
| Save sheets | Fill in what the import needs that isn't on the paper; Save | The first save (account, VAT status); the withholding ATC; the still-to-check count; a double tap | Prefills; the keyboard over the fields |
| Saved | See what's due; export by kind | Empty; hundreds of saved scans (needs a virtualized list); exported or not; delete (a visible control and a confirmation); new parties exported first | Grouping by kind and month; a filter; the name ("Saved" or "To export") |
| Export sheets | Pick a range, share the file, mark it exported | Nothing to export; exported before (the double-import warning); parties to check first; share cancelled; no app to share to | An in-sheet confirmation instead of the Alert after sharing |
| Your lists | Import a CSV; see what scans are matched against | Thousands of rows (search); a wrong file; missing columns; Clear (destructive) | Search; each tab's empty state with its import action |
| Settings | Set the export defaults | Values not set yet; VAT status unknown | Grouping and one line of explanation per field; checking the ATC's format |
| Speed test | Team builds only | — | Kept out of the client polish; consistent styling only |

## 9. Decisions this directive takes (the user can overrule any)

- **Light theme only, for now.** The app sets `userInterfaceStyle: "light"` and the camera is already dark. Tokens are named by role, so a dark theme can follow without rework. Dark mode now would double the visual QA.
- **mybizmate.io's typefaces.** The user chose the web app as the reference, so Scan uses Schibsted Grotesk and IBM Plex Mono, embedded in the app. Both still follow the person's font-size setting. (Changed on 2026-11-22: the first draft chose the system font.)
- **No tab bar.** Saved, Lists and Settings are used at very different rates; three tabs for them would be forced. Home surfaces Saved directly, and Lists and Settings move to the header. The design doc can still change this.
- **English UI,** as today, written in plain English for people who read it as a second language.
- **Portrait phones only.** Tablets and landscape are out of scope for this pass.

## 10. How this session works

1. **Milestone 5 first.** Its Task 11 is running in another session, in the same `mybizmate-ocr` checkout and on the same emulator. UI work starts on a new branch from master once M5 is merged. Until then, this session only reads. Milestone 4 (training-data export and the team's annotation mode) was planned right after M5; the order between M4 and this pass is the user's call.
2. **Audit on the device** (mobile-design Critique and Harden, accessibility-audit): every screen and state in §8 at font scale 1.0 and 2.0, with gesture and 3-button navigation, TalkBack names from uiautomator dumps, and screenshots saved per state. Never screenshot the photo picker (real receipts may be on the emulator); drive gallery flows by their labels.
3. **Design doc** (superpowers brainstorming), next to the app's design doc in `docs/`: the direction, tokens with their contrast figures, components, and each screen's structure and states, with mockups where the look is the user's call. The user approves it before any code.
4. **Plan** (superpowers writing-plans): small, reviewable tasks. The design-system foundation first, then screens by impact: Scan → Camera and Reading → Home → Saved and Export → Lists and Settings → Launch.
5. **Build** each task: tests first where behaviour changes (RNTL for components), then the change; tsc, lint and jest green; emulator screenshots before and after.
6. **Review:** a fresh reviewer per task, then a whole-branch review; fix and verify again.
7. **Report:** before-and-after screenshots, what was verified and what wasn't (no real phone, no iOS build, emulator speed isn't phone speed).
8. **Merge** into master and push only at the user's word. No pull requests.

## 11. Definition of done, per screen

- Its job is obvious and takes the fewest steps; every state in §8 is designed and reachable.
- It's built from theme tokens and shared components only, with no hardcoded colors, sizes or spacing.
- WCAG 2.2 AA holds, with the figures recorded: text 4.5:1; large text, meaningful icons and control boundaries 3:1. Targets are at least 48 dp. TalkBack reads a name, role and state for every control. Meaning never rests on color alone.
- It works at 200% font size and on a 360 dp-wide screen. Nothing sits under the status bar, the gesture or 3-button bar, or the keyboard.
- Back (button and gesture) behaves. Nothing typed is lost on back, backgrounding or a failed save. A double tap can't submit twice.
- Motion appears only where it explains a change, and reduced motion is respected.
- tsc, lint and jest pass; the scanner's core suite is untouched; behaviour changes are listed and approved.
- It's verified on the emulator with screenshots, and anything that couldn't be verified is stated.
- It reads as MyBizMate's bookkeeping tool, not a template: no generic AI patterns remain.

## 12. What changed from the master directive

| Master directive | This directive |
|---|---|
| Inspect the stack; don't assume Expo | The stack is recorded (§2): Expo 58, RN 0.88, an expo-router Stack, the app's own camera module. Each skill's fit is stated (§4). |
| Network failures, sync status | Dropped: the app has no network or backend. Replaced by PDF refusals, scanner start failure, and storage and share failures. |
| General OCR guidance | Fitted to three fixed forms with automatic detection. The checks, not the model's confidence, decide what's flagged. |
| "Use the brand: orange, black, white" | mybizmate.io's own tokens, typefaces and badges (§6a), which also fix the measured contrast failures (§5, issue 3; §7). |
| Build a design system | Extend `lib/theme.ts`; never a second theme. |
| Test on real devices | Only the emulator is available. Limits are reported; real-phone checks stay open. |
| Mandatory skills | `mobile-design` is read from GitHub (not installed). The Expo skills' Reanimated and @expo/ui advice is gated by the dependency rule. |
| — | Added: what must not change (§3), the order with milestone 5 (§10), the Windows build and emulator constraints, and the privacy rules. |
