# MyBizMate Scan: UI/UX design (design B)

*2026-11-22. Status: approved by the user on 2026-11-22 ("Approve it"). The implementation plan follows once milestone 4 is merged into master (§16).*

**Builds on:**

- The [UI/UX directive](2026-11-22-mybizmate-scan-ui-ux-directive.md). It holds the stack, what must not change (§3), the skills, and the definition of done.
- The [app's design](2026-11-19-expo-scanner-design.md).

**Mockups:** both are in `.superpowers/brainstorm/ui-2026-11-22/content/`.

- `b-1-system-and-scan-v2.html` covers the design system and the Scan screen. The user approved it on 2026-11-22 ("Looks good, part 2").
- `b-2-home-camera-saved-v2.html` covers Home, the camera, saving, exporting, lists and settings. The user approved it the same day ("Looks good, write it").

**On-device audit:** the 2026-11-22 captures and their notes (`index.md`) are in `.superpowers/brainstorm/ui-2026-11-22/audit/`. Every capture holds samples or made-up data only.

**Code:** inspected on branch `m5-pdf-and-2307` at 7c86e30.

Where a mockup and this document differ, this document wins. Each difference is listed in §14.

## 1. Why

MyBizMate Scan is the app MyBizMate's clients install. It works and its copy is good, but it doesn't yet look or behave like a finished product:

- **The Scan screen hides its job.** The first value sits about 85% of the way down the first screen.
- **It suggests confidence it hasn't earned.** "97% sure" appears on readings that are often wrong.
- **Its primary buttons fail contrast:** white on ember is 3.5:1.
- **With 3-button navigation, the nav bar covers its Save button.**

This pass makes it look like mybizmate.io (the user chose the web app as the reference, since MyBizMate has no mobile design yet). It puts each screen's job first and tells the truth about what the scanner isn't sure of. It also has to hold up at 200% font size, with 3-button navigation, and on a 360 dp phone.

**Who it's for:** a small-business owner or bookkeeper in the Philippines. They scan stacks of forms on a mid-range Android phone and export at month end (directive §1).

## 2. Goals, non-goals, anti-goals

**Goals**

1. Each screen leads with its one job:
   - **Home:** capture, and see what's waiting.
   - **Scan:** fix what was flagged, then save.
   - **Saved:** export what's due.
2. Honest uncertainty:
   - The checks decide what's flagged.
   - A typed value never looks like a read one.
   - "Checks passed" never claims the values are right.
3. mybizmate.io's look: its tokens, typefaces, badges and shapes, translated to Android (directive §6a).
4. Every state of every screen is designed and reachable, including errors and first run.
5. WCAG 2.2 AA with measured figures, 48 dp targets, and TalkBack names, roles and states.
6. It works at font scale 2.0, with gesture or 3-button navigation, and from 360 dp wide.
7. It behaves like an Android app: ripple, system back, snackbars, the share sheet.

**Non-goals**

- No change to the scanner, the checks, stored data formats, export layouts or settled rules (directive §3).
- No dark theme, no tab bar, no tablets or landscape, no translation (directive §9).
- No new features beyond the ones listed in §12.
- iOS isn't checked in this pass. Designs must translate to iOS, but QA is Android-only.

**Anti-goals.** These would make the work a failure even if it ships:

- A generic or "AI-made" look: gradients, glass, emoji icons, identical rounded cards, decorative motion.
- Any screen that presents unverified values as confirmed, or hides a flag.
- Losing typed work on back, backgrounding or a failed save.
- Slowing the capture-to-result path, or breaking a jest or core test.
- A second theme beside `lib/theme.ts`, or color, size and spacing literals scattered in screens.

## 3. Constraints

- **The stack** (directive §2): Expo SDK 58, React Native 0.88.1, React 19.3, an expo-router native Stack, and `StyleSheet`. Icons are drawn with `react-native-svg`. Safe areas come from `react-native-safe-area-context` (installed).
- **Not installed:** Reanimated, Gesture Handler, a keyboard library, expo-haptics, and any font package.
- **Windows long paths.** Any native dependency must build on this laptop before it's adopted. Work happens in the `mybizmate-ocr/` checkout, not a deeper worktree.
- **One device:** the emulator Medium_Phone_API_36.1 (1080×2400, 420 dpi). It reports a hardware keyboard, so the soft keyboard doesn't show by default. There's no real phone.
- **Gates on every change:** `npx tsc --noEmit`, `npx expo lint`, `npm test`. `npm run test:core` is untouched.
- **Sequencing** (the user, 2026-11-22: "Design here, M4 there"):
  - UI code starts on a new branch from master once milestone 4 is merged.
  - M4's team screens get consistent styling only (§9.11).
- **Privacy:** nothing leaves the phone. Never screenshot the photo picker. No real documents appear in QA captures.
- **Merging:** into master and push, at the user's word only. No pull requests.

## 4. Approaches considered

| | What it is | Trade-off | |
|---|---|---|---|
| **A. Restyle only** | New tokens, type and components on today's layouts | The cheapest, but the Scan screen still hides its job and Home stays a hero page | Rejected |
| **B. Restyle, and rework Scan and Home** | The design system, plus: flags first in a pinned status strip, the invoice as a ledger, the photo in the header; Home as a workspace (capture, to export, recent scans) | Fixes the two biggest problems without changing navigation or storage | **Chosen** (the user, 2026-11-22: "B, your pick") |
| **C. Inbox** | Tabs, an inbox of every unsaved scan, a step-by-step check per flag | The most change: new navigation and new storage rules; the slowest to build and verify | Rejected |

## 5. The design system

Everything below lives in `lib/theme.ts`, extended in its own idiom; there's no second theme. Screens use tokens and components only. A one-off optical nudge stays inline with a comment.

### 5.1 Color roles

Figures were measured with the WCAG 2.2 formula. Thresholds: text 4.5:1, control boundaries and meaningful icons 3:1.

| Role | Value | Used for | Contrast |
|---|---|---|---|
| `ink` | #1A1512 | Text, icons, the selection fill | 17.37 on paper, 18.10 on panel, 15.38 on sand |
| `mute` | #5A5147 | Secondary text, helper text, placeholders, section labels | 7.45 on paper, 7.77 on panel, 6.60 on sand |
| `paper` | #FCFAF6 | Screen background (was #FAF7F0) | — |
| `panel` | #FFFFFF | Rows, fields, sheets, headers, bottom bars | — |
| `sand` | #F2ECDF | Section strips, summary boxes, the neutral badge fill | — |
| `line` | ink at 14% | Decorative borders (chips, menus) | decorative |
| `hairline` | ink at 8% | Row separators, under headers and over bottom bars | decorative |
| `outline` | #918B84 | The boundary of a control: fields, secondary buttons, segmented controls | 3.37 on panel, 3.23 on paper |
| `brand` | #FC7C4C | The primary button's fill, the progress bar, the shutter ring | label in ink: 7.01 |
| `brandPressed` | #E26331 | The primary button while pressed | label in ink: 5.23 |
| `brandText` | #B13E03 | Orange text: text buttons, links, tip numbers, ".io" | 5.66 on paper, 5.90 on panel, 5.35 on brandTint, 5.01 on sand |
| `brandTint` | #FFF1EB | "New" and "To export" badge fill | — |
| `focus` | #DE602E | A focused field's 2 dp border | 3.61 on panel |
| `success` / `successTint` | #3E7A52 / #EEF6F0 | "Checks passed" | 4.64 on tint, 5.11 on panel |
| `warning` / `warningTint` / `warningLine` | #8F5300 / #FCEFD9 / warning at 30% | To check, Check, Hard to read, Changed since saved | 5.43 on tint, 6.17 on panel |
| `flag` | #B8741A | The 3 dp bar on a flagged row | 3.78 on panel |
| `danger` / `dangerTint` | #CC2827 / #FDECEB | Delete, Clear, field errors | 5.38 on panel, 5.16 on paper, 4.71 on tint |
| `chevron` | #8A837C | Chevrons and other quiet icons | 3.74 on panel |
| `scrim` | ink at 45% | Behind sheets and menus | — |
| `wash` | paper at 86% | Behind the reading card | — |
| `crop` | #F4F1EB | Behind a box's crop | — |
| `camera`, `cameraPanel`, `cameraText`, `cameraMute` | #000000, #221C18, #FFFFFF, #D8D2CB | The camera screen and the photo viewer | white on cameraPanel 16.84; cameraMute on black 14.00; brand on cameraPanel 6.52 |
| `pill` | ink at 78% | The camera's status pill | white on it 9.04, even over a white preview |
| `viewer` | #161310 | The full-screen photo | — |

**Rules:**

- **Selection is ink with paper text** (17.37:1): segmented controls, filter chips, choice chips. Coral stays for the one primary action on a screen.
- **Coral (`brand`) is never used for text on light backgrounds.** Orange text is always `brandText`.
- **Meaning never rests on color alone.** A flag has a bar, a badge and words. A status has an icon and words.
- **Retired tokens:**
  - `ember` stops being a text or fill color.
  - `line` #E1DDD8 (1.35:1) stops being a control border.
  - `coralTint`, `pineTint`, `imageBg`, `pill` and `backdrop` are replaced by the roles above.
- **The splash and the launcher icon keep today's brand assets.**

### 5.2 Type

Two families, as on mybizmate.io, embedded in the app (needs the user's OK, §12 B):

- **Schibsted Grotesk** for words. Weights 400, 600 and 800.
- **IBM Plex Mono** for figures, dates, codes, section labels and badges. Weights 400, 500 and 600. It's fixed-width, so amounts line up without tabular settings.

| Style | Family, weight | Size / line (sp) | Used for |
|---|---|---|---|
| `title` | Grotesk 800, tracking −0.02 em | 20 / 26 | Sheet titles, empty-state titles, the launch wordmark |
| `headerTitle` | Grotesk 800 | 18 / 24 | Screen header titles |
| `headline` | Grotesk 800 | 17 / 22 | The status strip's title, "Couldn't find the form" |
| `value` | Grotesk 600 | 15 / 20 | Row values, names |
| `body` | Grotesk 400 | 15 / 22 | Sentences |
| `button` | Grotesk 600 | 15 / 20 (16 / 20 for "Take photo") | Button labels |
| `label` | Grotesk 400 | 13 / 18 | Row keys ("Date"), field labels, helper text, sub-lines |
| `figure` | Plex Mono 500 | 15 / 20 | Amounts and dates in rows |
| `figureStrong` | Plex Mono 600 | 17 / 22 | Totals ("Total due", "Tax withheld") |
| `figureSmall` | Plex Mono 400 | 13 / 18 | Sub-line figures ("2 × 110.00", TINs) |
| `overline` | Plex Mono 500, caps, tracking 0.12 em | 12 / 16 | Section strips, header subtitles, the capture caption, the footer |
| `badge` | Plex Mono 500, caps, tracking 0.04 em | 12 / 16 | Badges |

**Rules:**

- **Nothing is under 12 sp.**
- **All text follows the phone's font size.** There's no `allowFontScaling={false}` and no fixed heights around text: rows, buttons, chips, tabs and headers grow, and labels wrap.
- **Sentence case everywhere** except `overline` and `badge`.
- **Values are never truncated.** A long name wraps.

### 5.3 Space, shape, elevation, touch

- **Space** on a 4 dp scale: `xs` 4, `s` 8, `m` 12, `l` 16, `xl` 24, `xxl` 32.
  - Screen gutter: 16.
  - Rows: 12 vertical, 16 horizontal.
  - Section strips: 8 vertical, 16 horizontal.
- **Radius:** `badge` 4, `field` 6 (fields, segmented controls), `button` 10, `panel` 10 (cards that remain, the reading card, menus), `sheet` 16 (top corners), `pill` full (chips).
- **Structure without cards.**
  - Sections are white rows separated by hairlines, under a sand strip.
  - A card is used only for a distinct, tappable object, such as the reading card or a sample.
- **Elevation:**
  - Flat by default. Headers and bottom bars use a hairline.
  - Shadows (Android elevation 8) only on sheets, menus and the snackbar.
- **Touch:**
  - Every target is at least 48×48 dp.
  - Chips are 40 dp tall with `hitSlop` up to 48.
  - Icon buttons are 48 dp with a 24 dp icon.

### 5.4 Icons

- **One family: Lucide**, as on mybizmate.io, with a 2 dp stroke on a 24 grid. It replaces today's filled Material paths in `components/icons.tsx`.
- **The `Icon` API stays.** The paths are copied in, so no package is needed. Lucide's ISC notice goes in Open-source licenses (§9.10).
- **Glyphs:** arrow-left, x, list, settings, camera, image, file-text, chevron-right, lock, flashlight, flashlight-off, share, ellipsis-vertical, search, triangle-alert, circle-check, circle-alert, download, check.
- **Dropped:** Bolt, FlashOn and FlashOff.
- **Sizes:** 24 in headers and on the camera, 20 in buttons and rows.
- **Labels:** every icon-only control has an accessibility label.

### 5.5 Feedback, motion, haptics

**Press feedback.** Every pressable shows the Android ripple instead of today's 0.6 fade:

- bounded on rows and buttons;
- borderless, radius 24, on icon buttons;
- ink at 10% on light surfaces, ink at 16% on `brand`, white at 20% on the camera.

**Motion.** Only these animate, with core `Animated` and the native driver:

| What | How | Time |
|---|---|---|
| Sheet | Scrim fades in; panel slides up (eases out) | 200 ms; 250 ms in, 200 ms out |
| Menu | Fades and scales from its anchor | 150 ms |
| Snackbar | Slides up and fades | 200 ms |
| Status strip | Cross-fades when its state changes after a fix | 150 ms |
| Reading card | Fades in | 150 ms |
| Progress bar | Loops (indeterminate) | — |

Everything else is still. Screens keep the native stack's own transitions.

**Reduced motion** (`AccessibilityInfo.isReduceMotionEnabled` and its change event):

- sheets, menus and the snackbar fade only, with no slide;
- the progress bar stops and its text carries the state.

**Haptics.** One confirm haptic when auto-capture takes the photo, because the person's hands are busy and their eyes are on the paper. There's no haptic on taps or saves. It needs expo-haptics (§12 B). Without it, there's no haptic.

### 5.6 Components

Each component has these states, as they apply: default, pressed, focused (hardware keyboard), disabled, loading, selected, error. Each gets an RNTL test.

| Component | Replaces | Anatomy and behaviour |
|---|---|---|
| `Screen` | Per-screen layout and insets | A header, a scrolling body and an optional bottom bar. It applies the top inset (header), the bottom inset (bottom bar, or the end of the scroll), and the keyboard. |
| `Header` | The Stack's own header and Home's fixed 48 dp top padding | Back or close; a title (`headerTitle`); an optional subtitle (`overline`); and up to two icon buttons, or the photo thumbnail, on the right. It grows with font size. It's used by every screen, with the Stack's header hidden. |
| `Button` | `Buttons.tsx` | **Variants:** primary (brand fill, ink label), secondary (panel fill, outline border, ink label), text (`brandText` label), destructive (panel fill, danger label, danger border at 45%). **Sizes:** large 56 and default 48 (minimums; they grow). **Loading** shows a spinner, keeps the label and blocks a second tap. **Disabled** uses a sand fill and a mute label. |
| `IconButton` | The ⋮ and header icons | A 48 dp target, a 24 dp icon, and a required label |
| `BottomBar` | The fixed bars on Scan and Saved | Panel fill with a hairline on top. Padding 12, plus the bottom inset. Two buttons sit side by side (secondary 0.8, primary 1). When either label would wrap, they stack full width, with the primary at the bottom. |
| `SectionHeader` | `sectionLabel` | A sand strip with an overline on the left and an optional right side: a column name ("Amount"), a count ("0 of 2") or a text action ("All saved ›"). Role: header. |
| `LedgerRow` | `BoxRow`, `SaleRow`, `CertificateSections` rows | A key (`label`, mute) and a value (`value` or `figure`), an optional sub-line, and a trailing chevron, badge or amount. **Flagged:** a 3 dp `flag` bar on the left, a warning badge, and the reason in the sub-line in `warning`. It's one pressable that opens the box. When the key and value don't fit side by side, the key stacks above the value. |
| `ListRow` | `RecentRow`, the Saved row, the Lists row, picker rows | A title, a sub-line (`figureSmall` for codes and dates), and trailing content (amount, badge, chevron, check) |
| `Badge` | Status text in rows | Variants: warning, success, brand, neutral, danger. Its text is part of the row's spoken label. |
| `StatusStrip` | `StatusCard` | Pinned under the header (§9.5). An icon, a headline, a sub-line and optional flag chips. It's a live region. |
| `FlagChip` | — | A pill with a panel fill, a warning-line border and its problem word (§6). It opens the row the problem is about. |
| `Segmented` | `Segmented.tsx` | Outline border with an ink selection. At least 48 dp tall; labels can wrap to two lines. Role: radio group. |
| `ChoiceChips` | `Chips.tsx` | Pills that wrap to new lines, with ink selection. Single select. |
| `TextField` | `TextField.tsx` | A label above the field; an outline border at rest and a 2 dp focus border; a helper or error line below. It sets its keyboard type, autocorrect and capitalization per use. |
| `Sheet` | `Sheet.tsx` | Detailed below this table. |
| `Menu` | The custom ⋮ menu | Anchored under its button over a light scrim. Rows are 48 dp; destructive rows are danger. Back closes it. |
| `Snackbar` | `ToastAndroid` (`lib/toast.ts`) | One host in the root layout, above the bottom bar and the inset. Ink fill, paper text, and an optional action in `brand` (7.01:1). It stays up `AccessibilityInfo.getRecommendedTimeoutMillis` of 4 s, or of 8 s with an action, so it lasts longer for people who need it. A new one replaces the old. It's a polite live region. |
| `Banner` | Warning lines in sheets | Tint fill, line border, icon and text, in warning or danger |
| `EmptyState` | — | A headline, a body and an optional action |
| `ReadingOverlay` | `ReadingOverlay.tsx` | §9.4 |
| `PhotoThumb` and `PhotoViewer` | `ScanImage.tsx` | §9.5 |

**`Sheet` in detail.** It's built on RN `Modal`, transparent, with no built-in animation:

- **Layout:** the scrim fades; the panel slides. A title row holds the title and a close button (there's no fake drag handle). An optional subtitle comes next, then a scrolling body. The action row is pinned above the keyboard and the bottom inset. The sheet is at most 90% of the screen.
- **Closing:** back, the close button or the scrim. If typed input would be lost, it asks first (§9.5).
- **Focus:** it moves to the title on open, and returns to the opener on close.

## 6. Words

One set of words, used the same way everywhere. Copy stays plain English for second-language readers. There's no "OCR", "confidence" or "AI".

| Thing | The word |
|---|---|
| The screen showing what was read | **Scan** (the header shows the form's name) |
| The list of saved scans | **Saved** (it holds sales, purchases and 2307s, so not "Saved invoices") |
| Kinds | **sale**, **purchase**, **2307** |
| Making an import file | **Export**; a saved scan is **To export** or **Exported** |
| A scan's state, before saving | **N to check** (warning) · **Checks passed** (success) · **Can't save yet** with its reason (warning) · **Couldn't find the form** · **Sample** (neutral) |
| A scan's state, after saving | **Saved** (neutral) · **Changed since it was saved** (warning) |
| A box's reading | **Read as "…"**, plus a **Hard to read** badge when the reading's score is under 0.90, the threshold that colors it ember today. **Couldn't make out any writing** when nothing was read. **From the PDF's text** for text PDFs. |
| A value the person typed | **Edited** badge |
| Terms on the save sheet | **Cash** / **On account** (display only; the export still writes MyBizMate's "On Account") |

**Formats:**

| What | Format |
|---|---|
| Amounts in rows | 5,810.50 |
| Totals and summaries | ₱5,810.50 |
| Dates | Oct 29, 2026 |
| Times | 10:24 |
| Periods | Q1 2026, or Jan 1 – Mar 31, 2026 |
| TINs | As kept |

**Buttons name their outcome:** "Save sale", "Save purchase", "Save 2307", "Save changes", "Share the file", "Mark 4 as exported", "Allow the camera".

**Things to check keep today's words and count.**

- "N to check" is the number of today's problem words. It's the same number on Home, the status strip and the save sheet's banner.
- A flag chip shows its problem word as it is today: "Date", "Row 2 math", "Customer (not in your list)", "Blurry photo (retake it)".
- The chip opens the row the problem is about (§9.5). That row's reason line says what doesn't match. So "VAT breakdown" (the audit's mismatch with "VAT 12%") leads straight to the VAT row and its reason.

## 7. Accessibility

Each screen's definition of done includes directive §11. In this design, that means:

- **Contrast:** §5.1 lists every pair. A jest test computes them from `lib/theme.ts`, so a later color change can't slip below its threshold.
- **Targets:** 48 dp minimum (§5.3).
- **TalkBack:** every control has a name, a role and a state. Badges are part of their row's label, not separate stops. Section strips and the status strip's title are headers. Decorative icons and the scrim are hidden from TalkBack.

  | Control | Spoken as |
  |---|---|
  | Back, close, ⋮ | "Back", "Close", "More options" |
  | Home's header icons | "Your lists", "Settings" |
  | The photo thumbnail | "Photo of the form", with the hint "Opens it full screen" |
  | A flagged row | "Date, Oct 29, 2026. Check: could also be Oct 28, 2026", as a button with the hint "Opens what the camera saw" |
  | An edited row | Its value, then ", edited" |
  | A flag chip | "Date, to check", as a button |
  | Auto and Flashlight | Switches, with on or off |
  | Segmented options | Radio buttons, with selected |

- **Announcements:**
  - The status strip is a polite live region: after a fix, TalkBack says "2 to check" or "Checks passed".
  - The reading card announces "Reading".
  - When the read finishes, focus moves to the Scan screen's status strip.
- **Focus:**
  - A sheet puts focus on its title.
  - Closing it returns focus to the control that opened it.
- **Font size:** everything grows to 2.0 (§5.2).
  - Ledger rows stack.
  - Bottom bars stack.
  - Tabs and chips wrap.
  - The camera's pills wrap to two lines.
- **Color alone never carries meaning** (§5.1).
- **Reduced motion** is respected (§5.5).
- **Keyboard focus** (hardware keyboards): pressables are focusable in order and show a 2 dp `focus` ring. This is low priority but in scope.

## 8. Behaviour on the system bars and the keyboard

- **The whole app is edge-to-edge.**
  - Headers pad by the status-bar inset.
  - Bottom bars, sheets' action rows, the snackbar and the end of every scroll pad by the bottom inset.
  - The audit showed today's bars disappear under the 3-button bar (`p3-02b`, `p3-03`, `p3-04`).
- **System bar icons:**
  - Dark icons on light screens.
  - Light status-bar icons on the camera and the photo viewer, through expo-status-bar (installed).
  - The navigation bar keeps the system's own look. With 3-button navigation it's a light grey band under the camera (`p3-05`). Making it dark needs expo-navigation-bar, a native dependency, so this pass leaves it. The camera's controls already sit above it.
- **The keyboard:**
  - A sheet's action row and the focused field stay above it.
  - A screen with fields (Settings) scrolls the focused field into view.
  - First try: `Modal`'s own translucent status and navigation bars, `Keyboard` events and the safe-area insets.
  - If that isn't reliable on the emulator with the soft keyboard shown, the builder asks the user about `react-native-keyboard-controller` (§12 B).
- **Typing and the app's lifecycle:**
  - A fix that's been saved is kept on the phone at once, as today (`recent.json`).
  - Typing in an open sheet lives in memory. It survives backgrounding, but not Android ending the app to free memory. No new storage is added for drafts; the report says so.
  - A font-size or density change restarts the screen today, because MainActivity doesn't handle those changes. A small config plugin adds `fontScale` and `density` to its `configChanges`, if text then updates correctly in place. If it doesn't, the plugin comes out and the report says so (§12 A, §15).

## 9. Screens

Today's behaviour is kept unless a line says otherwise; each change is in §12. Copy in quotes is final unless marked "e.g.".

### 9.1 Launch (`BrandSplash`)

- **Normal:**
  - The brand screen shows while `loadAppData` and the model's warm-up run: the logo, the wordmark with ".io" in `brandText`, and today's tagline.
  - There's no fixed 1.2 s minimum. A 0.5 s floor keeps it from flashing.
- **Couldn't start** (mockup "Launch · couldn't start"):
  - "The scanner couldn't start" (`headline`), then "Try again. If it keeps happening, close the app and open it again."
  - A primary "Try again" button. It runs the start again and shows the button's loading state meanwhile.
  - The raw error message appears under it in `figureSmall` in team builds only.
  - The message is a live region.

### 9.2 Home (`app/index.tsx`)

Mockups: "Home · a normal day" and "Home · first run".

**Header**

- Today's logo and the "mybizmate.io" wordmark on the left.
- On the right, icon buttons for **Your lists** (list) and **Settings** (gear). The ⋮ menu goes away.

**Capture**

- "Take photo": primary, large, with the camera icon, full width.
- Below it, side by side: "From gallery" and "Import PDF" (secondary).
- Under those, the caption "MYBIZMATE INVOICE · SERVICE INVOICE · BIR 2307" (`overline`).

**To export** (shown when anything is waiting)

- A `SectionHeader` "To export", with "All saved ›" on the right (opens Saved).
- One row per kind that has anything waiting, each with the count (`figureSmall`), the total (`figure`, right-aligned) and a chevron:
  - "Sales": the gross total;
  - "Purchases": the gross total;
  - "2307s", with the sub-line "Tax withheld": the tax total.
- A row opens Saved filtered to its kind.
- When saved scans exist but none is waiting, the section becomes "Saved", with one row "Everything is exported ›".
- With nothing saved, the section is hidden.

**Recent scans**

- One `ListRow` per recent scan, up to 20 (§13). A caption under the list says "The last 20 scans stay here. Save a scan to keep it." Each row has:
  - **Title:** the source ("Camera photo", the PDF's file name, "Sample 0051").
  - **Sub-line:** "10:24 · SERVICE INVOICE" (`figureSmall`, caps).
  - **Trailing badge:** the scan's state (§6).
- A row opens the Scan screen.
- After the list:
  - the text button "Try a sample invoice" (opens the samples sheet, which gains a close button);
  - the footer: a lock icon and "READ ON THIS PHONE · NO INTERNET".

**First run** (no recent and no saved scans)

- Between capture and the sample link, **"Before your first scan"** shows three numbered tips (numbers in `brandText`):
  1. The whole form in the photo
  2. Flat on a table, in good light
  3. Phone straight above it, no shadows
- Under the tips, **"Get set up · 0 of 2"** has two rows:
  - "Import your customers and items", sub-line "So scans can check names, TINs and prices". It opens Your lists. It's done once any list has rows.
  - "Set your export defaults", sub-line "VAT status and accounts for MyBizMate". It opens Settings. It's done once the VAT status is chosen and the revenue account is set.
- A done row shows a check and stays until both are done. Then the section goes away for good, whether or not the person has scanned.
- The tips go away after the first scan. A sample counts.

**Reading:** §9.4. Errors that stop a capture (a refused PDF, a picker failure) show as a dialog with the reason and what to do; today's messages are kept.

### 9.3 Camera (`app/camera.tsx`)

The mockup is "Camera · form found". The layout is today's. The preview, outline, auto-capture and checks are native and unchanged.

**Top bar** (over the preview's top band)

- Close (x) on the left. There's no screen title: the status pill names the form once it's found, which fits all three forms.
- On the right, two controls:
  - **The Auto switch:** a pill reading "AUTO" with a dot (a `brand` dot when on, a hollow dot when off). It's a switch, "Auto capture", on or off. It replaces the bolt, which read as flash next to the torch.
  - **Flashlight:** an icon switch, flashlight or flashlight-off.

**Viewfinder**

- The CameraX preview, letterboxed 4:3, with the coral live outline.
- The status pill sits centred at the preview's bottom. It keeps today's words from `lib/cameraCopy.ts`, in white on `pill`, wrapping to two lines.

**Bottom band**

- "Gallery" on the left: an icon over a `cameraMute` label.
- The shutter in the centre: 72 dp, a 3 dp `brand` ring around a white disc. It's disabled while the camera starts and while capturing.

**States**

| State | What shows |
|---|---|
| Starting | Today's black preview and "Starting the camera…" pill |
| Looking, found, holding, blurry, capturing | Today's pills. On auto-capture, the haptic (§5.5), then the reading card. |
| No permission yet (can ask) | A panel on `cameraPanel`: camera icon, "Allow the camera", today's `PERMISSION_TEXT`. Then a primary "Allow the camera", and a text button "Use the phone's camera app instead" (today's fallback). The gallery stays. |
| Permission refused for good | Same panel. Title "Camera access is off", body "Turn on the camera for MyBizMate Scan in the phone's settings." The primary is "Open settings"; the same text button stays. |
| No camera | Today's `noCamera` message, with "Choose from gallery" |
| The camera couldn't start | "The camera couldn't start", with "Try again" and the gallery. The raw message shows in team builds only (today it shows to clients). |
| The capture failed | Today's message, with the shutter ready again |

### 9.4 Reading (`ReadingOverlay`)

The mockup is "Reading". It shows over the screen the capture came from.

- **Layout:** a `wash` over that screen, with a centred card (panel, radius 10, line border, shadow).
- **The card:**
  - "Reading…" (`headline`).
  - An indeterminate 4 dp `brand` bar on `sand`.
  - A sub-line by source: a photo or sample, "Straightening the photo and reading every box"; a PDF, "Reading the PDF".
- **A slow read:** after 5 s, a second line adds "Still reading. Big or blurry photos take longer."
- **Touch:** the card blocks touches.
- **TalkBack:** it announces "Reading".
- **Reduced motion:** the bar stops.
- **Why the title changed:** today's "Reading the invoice…" was wrong for 2307s.

### 9.5 Scan (`app/result.tsx`)

The mockups are B part 1, states 1 to 6.

**Header**

- Back on the left.
- **Title:** the form's name (`FORMS[form].title`: "MyBizMate Sales Invoice", "Service Invoice", "BIR Form 2307"), or "Scan" when no form was found.
- **Subtitle** (`overline`), by state:

  | State | Subtitle |
  |---|---|
  | Default | The form's number label, the number and the read time ("SI NO. 5184138 · READ IN 3.2 S"; without a number, just "READ IN 3.2 S") |
  | Saved | "SAVED AS A SALE · NOV 22" |
  | Text PDF | "FROM THE PDF'S TEXT · 0.7 S" |
  | Sample | "SAMPLE 0051 · READ IN 4.5 S" |

- **On the right:**
  - The photo thumbnail (36×48, a hairline border). It opens the photo viewer.
  - For a saved scan, a ⋮ menu with one item: **"Delete saved scan"** (danger). It shows today's confirmation, reworded: "Delete this saved scan?" / "It's removed from this phone. Files you already exported don't change." / Cancel / Delete. Long-press in Saved stays as a shortcut.

**Status strip** (pinned under the header; it doesn't scroll)

| State | Strip |
|---|---|
| N to check | Warning tint. "3 to check" (`headline`) with "Tap one to fix it"; then one `FlagChip` per problem (§6), wrapping. A chip opens the row its problem is about (below). |
| Can't save yet | Warning tint. Today's block reason as the headline (for example, a 2307 with no payments read), with its body |
| Checks passed | Success tint, check icon. "Checks passed" with "Look over the values, then save". When the person fixed boxes: "· you fixed 2 boxes". For a sample, the sub-line is "Samples can't be saved" instead. |

The order is today's (`StatusCard`): things to check come first, then can't save yet, then checks passed.

**Saved scans** add a slim line at the top of the scroll, under the strip:

- **Unchanged:** sand, "Saved as a sale · Nov 20 · Not exported yet" (or "Exported Nov 21"). Today a saved scan said "Ready to save" (`p1-16`).
- **Changed:** warning, "Changed since it was saved. The export still has the saved version. Save changes to update it."

A saved scan that still has flags shows both, so its chips stay. At font scale 2.0 the pinned strip takes at most about a third of the screen. If it would take more, its chips scroll sideways in one row.

**Chips and rows.** The rows already know their flags: today's `flagged` expressions in `app/result.tsx` and `components/CertificateSections.tsx`. A small mapping beside them, in UI code, gives each problem word the first row it flags. Nothing in `lib/checks` changes.

| Problem word | Opens |
|---|---|
| Date; Customer (…); Supplier (choose one); Terms | That row |
| Row N math, item or price | Item row N |
| Total; Rows vs total | Total due |
| VAT breakdown | The first flagged VAT row |
| Period; Payee's TIN | Period; Payee |
| Payor's TIN; Payor (…) | Payor |
| Row N months, tax or ATC (2307) | Payment row N |
| Totals (2307) | That table's printed total row |
| Blurry photo; Dark photo | The photo viewer (Retake is in the bottom bar) |

Two chips may open the same row. Home's recent badge shows one state, in this order: Changed (warning), Saved (neutral), N to check, Can't save yet, Checks passed.

**Kind switch** (invoices only)

- A `Segmented` "Sale | Purchase".
- Under it, today's sentence, which names the consequence: "You issued it. It becomes a row in MyBizMate's Sales import." or "You received it. It becomes a row in MyBizMate's Purchases import."
- Switching still drops the party (settled rule).

**The ledger** (data first; the photo is in the header)

- Sections in today's order, each a `SectionHeader` with `LedgerRow`s:
  - **Invoices:** "Invoice" (number, Date, Customer or Supplier, Terms); "Items · N", with "Amount" on the right; then "Totals" (VATable sales, VAT 12%, and the other breakdown boxes the form has; Total due, with the sub-line "The written totals agree" or its flag).
  - **2307s:** "Period" (the dates, with a neutral quarter badge); "Payee"; "Payor"; "Income payments · N" with "Tax"; "Business tax" when present; then "Totals": today's printed total rows, one per table, each flaggable and fixable. The mockup's "Tax withheld" row is the income payments' total row.
- **Item rows:** the description, then a sub-line "2 × 110.00" (`figureSmall`). The amount sits on the right.
- **A row's trailing content:**
  - an unflagged row shows a chevron;
  - a flagged row shows the bar, a "Check" badge and the reason ("Could also be Oct 28, 2026"; "5 × 9.50 doesn't make 41.50");
  - an edited row shows an "Edited" badge.
  - Hard-to-read isn't shown on rows: the checks decide what's flagged (directive §12).
- **Empty items:** with 0 items, the section shows "No items read".
- **Long values** wrap. Amounts in the millions fit. At large font sizes, rows stack.

**Footnote** (once, at the end of the scroll)

- "Read on this phone in 3.2 s. Nothing left the phone."
- Then today's extra lines where they apply: the boxes-read count, "The PDF is a picture: read like a photo.", and for samples "Sample invoice: 22 of 24 boxes read exactly as written. Samples are made up, so they can't be saved."

**Bottom bar**

| State | Bar |
|---|---|
| Default | "Retake" (secondary), then the primary: "Save sale", "Save purchase" or "Save 2307"; "Save changes" for a saved scan |
| Sample | "Retake" only, as today |
| Not found | "Choose a photo" (or "Choose a PDF" when the source was a PDF), then "Retake" (primary) |

The primary opens the save sheet. It has a loading state and can't be double-tapped.

**Couldn't find the form** (mockup state 4)

- **Header:** title "Scan", subtitle "CAMERA PHOTO · 10:31".
- The photo inline (tap opens the viewer).
- "Couldn't find the form" (`headline`).
- Today's reason line, then three numbered lines:
  1. All 4 corner squares of a MyBizMate invoice
  2. The whole table of a Service Invoice
  3. The whole page of a BIR Form 2307

**Photo viewer** (opened from the thumbnail)

- **Surface:** full screen on `viewer`, with light system bars.
- **Top:** close (x) and the title "Photo".
- **View modes:** a dark `Segmented` with Enhanced, B&W and Original, as today.
- **At the bottom:** "Save to Pictures", for Enhanced and B&W only, as today. A snackbar confirms: "Saved to Pictures › MyBizMate Scan".
- **Back** closes it.
- This replaces the image card on the screen and its "Save" button. That button sat next to the invoice's own Save (`p1-07a`), and the full-screen image had no close control (`p1-14`).

**Fix a box** (`BoxSheet`; mockup state 2)

Most rows hold several boxes: an item row has 4 or 5, Total due up to 9, a 2307 payment row 7. One field is edited at a time, as today.

- **A row with one box** (Date, the number): the sheet opens straight at that box's editor. That's mockup state 2.
- **A row with several boxes:** the sheet opens with the row's boxes listed in the form's order. Each box shows:
  - its label;
  - its crop, full width on `crop`;
  - its reading;
  - a "Hard to read" or "Edited" badge.

  Tapping a box opens its editor in the same sheet, with back to the list. A "Done" button closes the list.
- **The editor:**
  - **Title:** the box's label. A close button.
  - **The crop:** "WHAT THE CAMERA SAW" (`overline`), with the crop full width on `crop`. For a text PDF: "FROM THE PDF'S TEXT", with no crop. With no crop: "No picture of this box".
  - **The reading:** "Read as "Oct 29, 2026"", plus the "Hard to read" badge when it applies. There's no percentage.
  - **Other readings:** "Could also be", with chips that fill the field.
  - **The field:** "What the box says" (`TextField`, `figure` font), holding the edit or the reading. It isn't focused on open: tapping it, or a chip, starts typing. Helper: "Type exactly what's written. The checks run again."
  - **Actions:** "Cancel" (text) and "Save" (primary), pinned above the keyboard. Save applies the edit and runs the checks again. A one-box row's sheet then closes and focus moves to the strip, which announces the new state. A multi-box row goes back to its list, which shows the new state.
  - **Unsaved typing:** if the field differs from where it started, back, close and the scrim ask "Discard what you typed?" (Keep editing / Discard).
  - **Keyboards:** per box kind, chosen so every character that can be written stays available (§11). Autocorrect is off everywhere: an edit means "the box says this".

**Party sheet** (Customer and Supplier; `PartySheet` and `PartyPicker`)

- Today's content and behaviour, restyled:
  - "WHAT THE CAMERA SAW" with the name, TIN and address boxes, listed and edited as in a multi-box row (above).
  - A `SectionHeader` "In your customers" with the matched party and the reason ("Matched by its TIN and name.").
  - Or "Not in your customers", with a "New" badge and today's rule: it goes out as written.
- "Choose another" opens the picker, which gains a search field at the top (name, TIN or code), focused on open.
- Recent choices aren't added: that would need new storage.

**Payor (2307):** a restyled box sheet, as today, with a read-only line under the boxes: "In your customers · TIN …" or "Not in your customers". There's no payor chooser. That's a feature, still open from M5, and not part of this pass.

**Terms sheet:** today's content ("On the paper: Cash is ticked."), with the choices as 48 dp radio rows in the form's own words.

### 9.6 Save sheets (`SaveSheet`)

The mockup is "Save as a sale".

- **Title:** "Save as a sale", "Save as a purchase" or "Save 2307".
- **Subtitle:** today's, with "Saved invoices" renamed "Saved" ("It becomes a row in MyBizMate's Sales import. Export it from Saved.").
- **A summary box** (`sand`, keys in `overline`):
  - Date, Customer or Supplier (with "New" when not in the list), and Gross (`figure`, with ₱).
  - For a 2307: Payor, Period, Tax withheld.
- **Today's fields and values, restyled:**
  - Tax type: chips for all 5 of today's values, VAT, Non-VAT, Zero-rated, VAT-exempt and Not applicable (the mockup showed 4). The helper "Suggested from the invoice's VAT boxes" shows when it was suggested.
  - The VAT-status chips, when today's sheet shows them.
  - The account field: `figure` font, helper "Code or name, as in MyBizMate".
  - The ATC field, where today's sheet has it.
  - Terms: "Cash" and "On account".
  - For a 2307, the offset account.
- **A warning banner** when flags remain: "1 thing is still marked to check. You can save anyway."
- **Pinned actions:** "Cancel" (text) and the primary ("Save sale", "Save purchase" or "Save 2307"), with a loading state and no double save.
- **After a save:**
  - The sheet closes.
  - The strip shows the saved state.
  - A snackbar shows: "Saved as a sale" (or a purchase, or a 2307; "Changes saved" for a re-save). Its "View" action opens Saved, filtered to that kind.

### 9.7 Saved (`app/saved.tsx`)

The mockup is "Saved".

**Header:** title "Saved"; subtitle "5 TO EXPORT" or "ALL EXPORTED".

**Filter chips** (single select)

- "All 9", "Sales 6", "Purchases 1", "2307s 2". A kind with nothing saved is hidden.
- Opening from a Home "To export" row preselects that kind.

**List** (a virtualized `SectionList`)

- **Grouping:** sections by month of the scan's document date, newest month first. That's the invoice's date, or a 2307's period end. It's the same date the export choices "This month" and "Last month" use (`lib/exportFile.ts`), so a month's section is what that choice exports. The mockup put a Q1 2307 under November; that was wrong.
- **A row:**
  - **Title:** the party (customer, supplier or payor), else the scan's label.
  - **Sub-line:** "SALE · NOV 22 · SI 5184138", "PURCHASE · NOV 18" or "2307 · Q1 2026".
  - **On the right:** the amount (the gross; for a 2307, the tax withheld), with a "To export" (brand) or "Exported" (neutral) badge under it.
- A row opens the Scan screen. Long-press asks to delete (§9.5).

**Bottom bar:** one primary "Export…" (share icon). It replaces the three export buttons.

**Empty states**

- Nothing saved: "Nothing saved yet" / "Save a scan and it shows up here, ready to export." with "Take photo".
- A filter with nothing to show: "No purchases saved".

### 9.8 Export (`ExportSheet`)

The mockup is "Export · after sharing". One sheet, in steps.

1. **Which file** ("Export")
   - Rows for the files that have anything to export: "Sales · 4 to export", "Purchases · 1 to export", "2307s · 2 to export", and "New customers and suppliers · 3" (today's Parties file).
   - When today's `newPartiesFirst` holds, the parties row comes first, with the note "Export these first: they go in before the other files."
   - When Saved is filtered to a kind, Export… opens straight at step 2 for that kind, with back to step 1.
2. **The file** ("Export sales")
   - A summary box: "File: Sales import · .xlsx", "Sales: 4 · ₱38,240.00".
   - "Which ones" chips: Not exported yet, This month, Last month, All.
   - Today's warnings as banners: exported before ("2 of them were exported before. Importing them again adds them to MyBizMate twice."), the names MyBizMate may not have yet, and export new parties first.
   - With nothing in the choice: "Nothing to export for this choice", and Share disabled.
   - Pinned actions: "Close" (text) and "Share the file" (primary, loading while the file is written). Share opens the Android share sheet.
3. **After sharing** (the sheet stays open behind the share sheet)
   - Today's question, as a step instead of an Alert: "Did the file go where you wanted?"
   - The body: "Mark these 4 sales as exported, so the next export leaves them out. "All" still includes them."
   - Actions: "Not yet" (text) and "Mark 4 as exported" (primary).
   - Marking closes the sheet and shows the snackbar "Marked 4 sales as exported."
   - The rule doesn't change: nothing is marked unless the person says so. A cancelled share also lands here, and "Not yet" covers it.
   - The mockup's "Did the file get to MyBizMate?" isn't used: the file often goes to Drive or email first.
- **File errors** show as a danger banner in the sheet, with today's messages.

### 9.9 Your lists (`app/lists.tsx`)

The mockup is "Your lists".

- **Header:** title "Your lists".
- **Tabs:** a `Segmented` with "Customers 21 | Suppliers 2 | Items 18". At large font sizes the labels wrap; today they clip to "Custo" (`p2-08`).
- **Search:**
  - Placeholder "Search name, TIN or code" (for Items, "Search name").
  - It matches case- and accent-insensitively; a TIN matches with or without dashes.
  - A clear button shows while there's text.
  - The section strip reads "3 of 21 customers".
- **Actions:**
  - "Import CSV" (secondary, compact).
  - "How to import" (text). It opens a sheet with today's long intro for the tab and today's "Which columns?" line. Both leave the screen.
- **Rows** (not tappable, as today):
  - Name, with a sub-line "TIN 789-012-345-00000 · C008"; items show "pc · ₱45.00".
  - A party added from a scan has the sub-line "Added from a scan · not exported yet" and a "New" badge.
- **Clear:** a destructive text button at the end of the list ("Clear suppliers", where today has it). It asks: "Clear all 2 suppliers?" / "They're removed from this phone. Saved scans don't change. You can import the file again." / Cancel / Clear.
- **Empty tab:** "No customers yet" / "Import the parties file from MyBizMate as a CSV. Scans then match names and TINs against it." with "Import CSV" (primary) and "How to import".
- **Import results:**
  - Success: a snackbar, "Imported 21 customers".
  - A wrong file or missing columns: a danger banner with today's message.
- **The list** is virtualized.

### 9.10 Settings (`app/settings.tsx`)

The mockup is "Settings".

**"Your business"**

- Chips "VAT-registered" / "Not VAT-registered", with the helper "Suggests each sale's tax type".
- Neither is selected until chosen.

**"Export defaults"** (`TextField`s in `figure` font)

| Field | Helper |
|---|---|
| Revenue account for sales | "Code or name, as in MyBizMate" |
| Expense account for purchases | — |
| Withholding tax ATC | "Used when an invoice shows tax withheld" |
| Offset account for 2307s | — |

- **The ATC check:** when the value isn't two letters and three digits, the helper turns into a warning, "Like WC158: 2 letters, 3 digits". It doesn't block, and the value still saves as typed.
- **A note after the fields:** today's note, plus "Changes save as you type." Today's saving behaviour stays.

**"About"**

- **"Privacy"** opens a sheet in plain words:
  - scans are read and kept on this phone;
  - nothing is sent anywhere;
  - there's no cloud backup;
  - uninstalling removes everything.
- **"Open-source licenses"** opens a screen listing what the app ships, with each license, including:
  - the fonts' OFL 1.1 text;
  - Lucide's ISC notice;
  - React Native, Expo, OpenCV, ONNX Runtime and the models' licenses.
- **"Version"** shows "1.0.0 (12)": the version and the build number.

**"Team tools"** (team builds only)

- "Speed test", moved from Home's menu.
- M4's annotation mode and training-data export, when they exist.

### 9.11 Team screens and annotation mode

- **Covers:** the speed test and milestone 4's screens.
- **What changes:** tokens and components only, so they don't look broken next to the rest. There's no client polish, and their behaviour doesn't change.
- **Where they're reached:** only from Settings › Team tools, in team builds.
- **M4's annotation mode lives in the Scan flow** (the app's design: "The team's annotation mode"). In team builds, a scan saves only once every box is confirmed or corrected, and each scan gets a source tag.
  - Its controls are built from this design's components: a confirm on each box in the box editor, and the source tag in the save sheet. They keep M4's behaviour exactly.
  - Their exact layout is settled in the plan, which is written against M4's merged code (§16).

## 10. What the audit found, and where this design fixes it

| Finding (capture) | Where it's fixed |
|---|---|
| The Scan screen's first value is about 85% down; the image card comes first | §9.5: data first, photo in the header, flags pinned |
| "97% sure" on readings that are often wrong | §6 "Hard to read"; §9.5 fix-a-box |
| White on ember 3.5:1; ember text 3.5:1; #E1DDD8 borders 1.35:1 | §5.1 |
| With 3-button navigation, the Retake/Save bar, Export 2307s and a sheet's Cancel sit under the nav bar (`p3-02b`, `p3-03`, `p3-04`); Home's footer can't scroll clear (`p3-01`) | §8 and `Screen`/`BottomBar`/`Sheet` insets |
| At 200%: Lists' tabs clip (`p2-08`), the photo's Save clips (`p2-03`), header titles don't grow (`p2-07`–`p2-09`), the label column wraps (`p2-04`), "Save changes" wraps out of line (`p2-06a`), export buttons wrap (`p2-07`); at 360 dp the selected tab wraps (`p4-04`) | §5.2 rules; `Header`, `Segmented`, `BottomBar`, `LedgerRow` stacking |
| Cards everywhere; the Lists card's border steps out of line (`p1-20`) | §5.3: sections, not cards |
| Home as a hero page; tips forever; a ⋮ menu with no scrim (`p1-03`) | §9.2 |
| Sheets: the backdrop slides; a fake handle; no keyboard handling; dividers on the gesture handle (`p1-10`, `p1-13`); the samples sheet has no close (`p1-04`) | `Sheet` (§5.6), §8 |
| The full-screen image has no close; dark status icons on black (`p1-14`) | Photo viewer (§9.5), §8 |
| Two "Save" buttons on the Scan screen (`p1-07a`) | "Save to Pictures" moves into the viewer |
| A saved scan says "Ready to save" (`p1-16`) | The saved strip (§9.5) |
| A sample says every check passed while 22 of 24 boxes matched (`p1-09b`) | "Checks passed" + "Look over the values, then save"; the sample line stays in the footnote |
| Naming: "Saved invoices" holds 2307s; "Scan an invoice" on the camera; "VAT breakdown" vs "VAT 12%" (`p1-09a`); "Save 2307" vs "Save changes" (`p1-18`); "On Account" vs "On account" (`p3-04b`) | §6 |
| Delete only by long-press; the splash error is a dead end | §9.5 ⋮ menu; §9.1 Try again |
| The orange "Clear suppliers" looks like a link (`p1-21`) | §9.9: danger, with a confirmation |
| Settings: no grouping or explanations; the lower half empty (`p1-24`) | §9.10 |
| No ripple, toasts can't carry an action, no haptic, reduced motion ignored | §5.5, `Snackbar` |
| The camera's navigation bar is light grey under the black UI (`p3-05`) | Left as is (§8): fixing it needs a native dependency |
| Font-scale and density changes recreate the activity; a dev build then warns "configured linking in multiple places" | §8 (a config plugin) and §15 |

## 11. Left to the builder

- **Fonts:**
  - The file layout.
  - How weights map to `fontFamily` names on Android with expo-font's config plugin in SDK 58: separate family names per weight, or the plugin's font definitions. Read the v58 docs first.
- **Keyboards per box kind.**
  - The constraint: every character that can be written must stay available.
  - Android's `numeric` and `decimal-pad` filter out commas, letters and slashes, so they can't be used where a box may hold "1,140.00", "Oct 29" or "P".
  - Check on Gboard with the soft keyboard shown.
- **Sheet over the keyboard:** with core APIs first (§8); ask before adding a library.
- **Stacking thresholds:** when a `LedgerRow` or `BottomBar` stacks, measured by layout rather than a fixed font scale where possible.
- **Mapping each form's boxes to ledger sections**, keeping today's order and labels.
- **Implementation of `Menu`, the snackbar host and its queue,** and where new components live in `components/`.
- **Sources for "Get set up" completion and the version number.** Settings and lists are already in memory; for the version, `expo-constants` or the native build number.
- **The licenses list's contents**, generated or written.
- **Migration order inside each task**, keeping tests green at every commit.

## 12. Behaviour changes

### A. Approved with this document

Approving this document approves these. Each is visible in the mockups or named here.

1. **Uncertainty wording:**
   - "N% sure" goes. A **Hard to read** badge shows when the reading's score is under 0.90, today's threshold.
   - "Ready to post" and "Ready to save" become **Checks passed**, with "Look over the values, then save".
2. **Home:**
   - The ⋮ menu goes. Your lists and Settings are header icons; the Speed test moves to Settings › Team tools (team builds only).
   - A "To export" section by kind.
   - First run: tips until the first scan, and "Get set up" until lists and defaults exist.
3. **Saved:**
   - Renamed from "Saved invoices".
   - A filter by kind; groups by month of the document date.
   - One "Export…" button with a which-file step, the parties file included.
4. **Export:** the question after sharing becomes a step in the sheet. Same words, same rule.
5. **Deleting a saved scan** is visible in its ⋮ menu, with the same confirmation. Long-press stays.
6. **A snackbar replaces ToastAndroid.** After a save, its "View" opens Saved.
7. **The photo:**
   - Moves to the header and a full-screen viewer.
   - The image's "Save" becomes "Save to Pictures" there.
8. **Fix a box:**
   - A one-box row opens straight at its editor.
   - A multi-box row lists its boxes, each with its crop, and tapping one opens its editor. Today each box needs "Fix it" first.
   - Typed changes ask before they're discarded.
   - Autocorrect is off.
9. **Your lists:**
   - Search.
   - "How to import" replaces the intro and "Which columns?".
   - Clear names the count in its confirmation.
10. **Settings:**
    - Grouped, with helpers.
    - An ATC format hint that doesn't block.
    - About: Privacy, Open-source licenses, Version.
11. **Launch:**
    - Try again after a failed start.
    - The raw error appears in team builds only, as does the camera's raw start error.
    - No fixed 1.2 s minimum.
12. **Camera:**
    - Auto is a labelled switch.
    - No title.
    - The flashlight icon.
    - A "Camera access is off" panel with "Open settings" when permission was refused for good.
13. **Reading:**
    - "Reading…" for every form.
    - A slow-read line after 5 s.
14. **The look:**
    - Paper and ink change slightly.
    - The primary button is coral with an ink label.
    - Selection is ink.
    - Icons are Lucide.
    - Words are set in Schibsted Grotesk, figures in IBM Plex Mono.
15. **Font-size changes:** MainActivity handles font-size and density changes in place (a config plugin), so the screen and typing survive. It's kept only if text updates correctly (§8).
16. **Recent scans keep 20, not 6** (§13), in the app and the scanner module, and Home says so.

### B. Needing their own OK

Each is asked in the plan, after a build check on this laptop.

1. **The fonts:**
   - Downloading Schibsted Grotesk (400, 600, 800) and IBM Plex Mono (400, 500, 600) from Google Fonts. Both are OFL 1.1. They come as files or as `@expo-google-fonts` packages.
   - Embedding them with expo-font's config plugin, which needs a native rebuild.
   - If the build fails, the fallback is the system font with the same scale.
2. **expo-haptics**, for the auto-capture haptic (a native module). Without it, there's no haptic.
3. **`react-native-keyboard-controller`**: only if §8's core approach fails.

## 13. Open question for the user

**How many recent scans the phone keeps.**

- **Today:** 6. A 7th scan silently drops the oldest one, and its fixes go with it, even when it was never saved.
- **Where the cap lives:** in two places. `KEEP` in `lib/scans.ts`, and `KEEP_SCANS` in the scanner module, which deletes the oldest scan's folder.
- **Why it matters:** someone who scans a stack of 10 before saving loses the first four.
- **Options:**
  - Keep 6, and say it on Home under Recent scans: "The last 6 scans stay here. Save a scan to keep it." No native change.
  - Raise the cap to 20 in both places, with the same line. It's a one-line change in the scanner module, which is on the must-not-change list. The fonts need a native rebuild anyway. More photos stay on the phone.
  - Warn before an unsaved scan is dropped. That's a new step at capture.
- **Answer (the user, 2026-11-22): raise it to 20.**
  - `KEEP` in `lib/scans.ts` and `KEEP_SCANS` in the scanner module both become 20, in one task.
  - Home says so under Recent scans (§9.2).
  - The user's answer is the OK for this one-line change to the scanner module (directive §3).

## 14. Where this document departs from the mockups

| Mockup | This document | Why |
|---|---|---|
| "✓ Ready to post" / "Ready to save" | "Checks passed" | The sample case: every check passed while 2 boxes were wrong |
| The kind switch's caption "→ SALES IMPORT" | Today's sentence ("You issued it. It becomes a row in MyBizMate's Sales import.") | It tells the person how to choose; the directive counts it among the app's strengths |
| ⋮ menu "Share the scan" | Removed | No such feature exists; adding one is out of scope |
| "Did the file get to MyBizMate?" | Today's "Did the file go where you wanted?" | Same meaning as today; the file often goes to Drive or email first |
| A Q1 2307 under "November 2026" | Grouped by document date | It matches the export choices |
| Tax type chips: 4 | Today's 5 | The values can't change |
| Revenue helper "Kept for your next save" | "Code or name, as in MyBizMate" | The sheet doesn't keep it as a default today |
| No sample link on a normal Home | "Try a sample invoice" always at the end | Today's behaviour; useful for demos |
| Fix a box (state 2) shows one box | One-box rows open at the editor; multi-box rows list their boxes first | Most rows have several boxes |
| Chips named after their rows ("Date", "Customer", "Row 4") | Today's problem words ("Row 4 math") | The count and the words stay the same everywhere |

## 15. Verification

- **Gates on every task:** `npx tsc --noEmit`, `npx expo lint`, `npm test`.
  - New RNTL tests: each component's states and accessibility props, the snackbar's timeout, the sheet's discard prompt, the status strip's variants and live region.
  - A jest contrast test over `lib/theme.ts` (§7).
- **`npm run test:core`:** untouched. Run it once at the end to show it still passes.
- **Visual QA on the emulator.** Every screen and state in §9, in the audit's four passes:
  - defaults;
  - font scale 2.0;
  - 3-button navigation;
  - 360 dp wide (density 480).

  Captures sit before and after, next to `.superpowers/brainstorm/ui-2026-11-22/audit/`. The emulator's settings are restored afterwards.
- **Keyboard states:**
  - Need the soft keyboard: on the emulator, the "show the on-screen keyboard with a hardware keyboard" setting, turned on with the user's OK and off afterwards.
  - Otherwise a real phone, later.
- **TalkBack:** names, roles and states read from uiautomator dumps for each screen; a spot check with TalkBack on for the Scan screen's fix loop.
- **Rotation of state:** change the font scale with a scan open and text typed in a sheet.
  - With the config plugin (§8), the screen and the text must survive.
  - Without it, the report says the screen restarts. Today a dev warning appears on every change.
- **Scale:** Saved and Your lists scroll smoothly with 500 saved scans and 2,000 parties, made up by a team-only helper and removed afterwards.
- **Not verifiable here:** real-phone feel and speed, the real camera, iOS. The report says so.

## 16. Sequencing

1. **The plan and the branch:**
   - The implementation plan is written once M4 is merged, against master. M4 changes the same Scan, box-sheet and save-sheet files, so a plan written now would be out of date.
   - The branch is new, from master, in the `mybizmate-ocr` checkout itself.
2. **Task 0, build check:** fonts and expo-haptics added (after their OKs), a debug build on this laptop, `npm run check:apk`. If either fails, fall back (§12 B) and tell the user.
3. **The foundation:**
   - Tokens, type and icons in `lib/theme.ts` and `components/icons.tsx`.
   - `Screen`, `Header`, `BottomBar`, `Button`, `IconButton`, `Badge`, `SectionHeader`, `ListRow`, `LedgerRow`, `Segmented`, `ChoiceChips`, `TextField`, `Sheet`, `Menu`, `Snackbar`, `Banner`, `EmptyState`.
4. **Screens by impact:** Scan (with its sheets and the viewer) → Camera and Reading → Home → Saved and Export → Your lists and Settings (with About) → Launch → team screens.
5. **Then:** the full QA pass (§15) and a whole-branch review.
6. **Merge** into master and push at the user's word.
