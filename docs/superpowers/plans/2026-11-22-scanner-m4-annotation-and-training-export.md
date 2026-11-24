# MyBizMate Scan, milestone 4: the team's annotation mode and the training-data export Implementation Plan

> **Executed on 2026-11-22, subagent-driven, on branch `m4-annotation-training-export`.** Rulings made during the run
> changed parts of this plan, and where they differ, the rulings and the code win. The parts that changed:
> - the code rule: a letter first, 1 to 6 digits;
> - `buildTrainingExport`'s signature: each record goes with its saved scan;
> - `trainingExportedAt`: a save in annotation mode clears it;
> - the export: the oldest 50 scans each time, and a name with the time and the install ID's start;
> - the "Changed since it was saved" line in annotation mode;
> - the notebook's cells 6, 10, 22 and 28.
>
> Every ruling and deferred minor is in `2026-11-22-scanner-m4-rulings.md`, next to this file.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In team builds, an annotation mode where a scan saves only once every training box is confirmed or corrected and carries a client and writer code; and an export that turns those saved scans into one zip of crops and labels, plus the Python side that reads it into `prototype/training`'s format, split by writer.

**Architecture:**
- **Boxes.** A box's state (not checked, confirmed, corrected) is kept on the scan next to the edits M3 already keeps. Which boxes can become training data ("training boxes") is one rule, shared by the save gate and the export.
- **Saving.** The save gate and the source tag join M3/M5's save flow.
- **The export.** It builds a versioned `manifest.json` from saved, annotated scans, puts it in a stored zip with each training box's crop PNG (the core's lossless cut crop), and shares it like the import files.
- **No core or scanner-module change.** The one new native piece is expo-crypto, for the install ID.

**Tech Stack:**
- Expo SDK 58, React Native 0.88, TypeScript, expo-router, jest-expo, RNTL 14;
- expo-crypto (new), expo-constants (installed, unused until now), expo-file-system 58, expo-sharing;
- Python 3.12 in `../.venv` (`prototype/training`, outside git).

**Spec:** `docs/2026-11-19-expo-scanner-design.md`, the sections "Training data" (lines 254-286) and "Edit after scan", and milestone 4. Also "PDF import" ("boxes read from the text … never become training data") and "Decided" ("My calls").

**Settled with the user:**
- **Milestone 4 comes right after milestone 5** ("Yes, M4 next", 2026-11-22). The team annotates while later milestones are built.
- **The UI/UX design** (`docs/2026-11-22-mybizmate-scan-ui-ux-design.md`, "Team tools" and §9.11) places M4's controls:
  - a Settings › "Team tools" section, in team builds only, holding the Speed test (moved from Home's menu), the annotation mode and the training-data export;
  - a confirm on each box in the box editor;
  - the source tag in the save sheet.

  M4 sets their first layout with today's components; the UI pass restyles them after M4 merges.

**Calls in this plan (for your review before building):**
1. **Training boxes.** These are the boxes the scanner read from the picture, except:
   - **personal boxes:** the customer's name, TIN and address on invoices; the payee's and payor's TIN, name, address and ZIP on a 2307;
   - **PDF-text boxes** (`fromText`);
   - **multi-line boxes**, whose crop stacks several model inputs (a template field with `multiline: true`, and the Service Invoice's `amount_words`, which the core merges with `amount_words2`).

   Only training boxes need checking in annotation mode, and only they are exported.
2. **A box's state.**
   - "Looks right" in the box editor confirms the reading as it is.
   - An edit makes the box corrected and drops its confirm.
   - Taking an edit back, or clearing it, leaves the box not checked.
   - Blank boxes (no ink, no crop) aren't training boxes.
3. **The source tag.**
   - Two codes, "Client code" and "Writer code", asked in the save sheet in annotation mode and remembered for the next save.
   - Each code is 1–12 characters of A–Z, 0–9 and "-", with at least one digit (so "C014" and "W03" pass, and a bare name doesn't). It is upper-cased.
   - The writer key for splitting is client/writer.
4. **Which scans are exported in M4:** saved scans that were saved in annotation mode, never samples, test images or scans with no form.
   - People's own scans wait for consent (milestone 6). Turning the mode off later doesn't drop scans already annotated.
5. **Install ID.** `Crypto.randomUUID()` (expo-crypto), made once and kept in `install.json`. It is exported with each scan and never shown in client screens.
   - A new native module means one development-build reinstall, by the procedure the user approved in M5.
6. **Versions.**
   - The app version comes from expo-constants.
   - The model version comes from a small `model.json` next to the model (name, SHA-256, bytes), pinned by a test against `inference_latin.onnx`.
   - Both are kept on the scan when it's made, so an update between scanning and exporting doesn't relabel it.
7. **The crop.** The PNG the core already writes per box (lossless, the cut crop at the page's own pixels). The model's own resize (height 48) is reproducible in `prototype/benchmark/ocr_engine.py`, and `make_rec_dataset.py` trains on cut crops too.
8. **"The value the checks used"** is kept only when it differs from the box's own reading, as text:
   - numbers as plain decimals ("1280", "12.5");
   - dates as ISO ("2026-11-18");
   - for invoice item rows (qty, unit price, amount), the date and the total due;
   - for a 2307's row months, total and tax, and its total rows.
9. **Marking.** A training export marks its scans with their own date (`trainingExportedAt`), apart from the import files' `exportedAt`, and asks the same "Did the file go where you wanted?" question. The next export leaves marked scans out.
10. **Storage (M3 left it to M4).** Saved scans keep their images in M4, since the export needs the crops. Clearing them is decided with people's queue in milestone 6.
11. **The camera's test hook** (`/camera?test=`, development builds) marks its scans `testImage`. They can still be saved, but never become training data.
12. **Team screens in client builds.** The `/speed` and `/training` routes show "This is for team builds." outside team builds; today `/speed` opens through a link in any build.
13. **The Python side** (Task 7) is in this milestone, so the export's format is proven end to end before the team annotates many scans. Drop it if you'd rather wait for milestone 7.

## Global Constraints

- **This is the actual app, not a test app.**
  - Team tools appear only in team builds (`lib/build.ts` `TEAM_BUILD`).
  - People's data persists across launches and updates. Every new `StoredScan` field is optional and defaulted in both `FRESH` and `readScan`; every new `Settings` field gets its default in `DEFAULTS`.
  - No invoice or certificate content is ever logged.
- **Privacy:**
  - Personal boxes and anything outside the boxes (signatures, the full photo, the page) never go into the training export.
  - Source tags are codes, never names.
  - Real client receipts in `../prototype/data/real_private/` and the main dev's BIR 2307 sample are never read by code, copied, committed or screenshotted. The MyBizMate-printed test 2307 stays in `prototype/`, and `prototype/` is never pushed.
  - Contact numbers and emails are never kept on the phone.
- **Training data in M4 comes only from scans saved in annotation mode,** in team builds. People's scans need consent (milestone 6).
- **Boxes read from a PDF's text never become training data** (design, "PDF import").
- **TDD for every step** that changes behaviour. Before a task is done, run `npx jest`, `npx tsc --noEmit` and `npm run lint`. For Task 7, run its Python tests. For Task 8, run the core and Kotlin tests too, unchanged.
- **Written deliverables are in English.** Copy follows the app's voice: short, plain sentences. The copy in this plan is exact.
- **The repo's only developer.** No pull requests. Work is merged into `master` and pushed only when the user says so.
- **The emulator is shared** with the UI/UX session ("Production-grade mobile app UI/UX"). Tell it before any install.
- **Tool gotchas:**
  - The Write tool turns `\u` escapes into characters, so write code with `String.fromCharCode` or literal characters.
  - Files keep their own line endings (most are CRLF).
  - Git Bash needs `MSYS_NO_PATHCONV=1` for device paths.
  - Bash heredocs mangle `\\`.

## Review Focus

1. **A personal box reaching the export,** through a renamed template field, a new form, or a box reached from the party sheets. The export of each form's fixture holds none of the personal boxes, and a test pins the personal-box list against the templates' field names. Tests: Task 3, `the personal boxes are the templates' own`; Task 6, `no personal box is exported`.
2. **A box changed more than once.** Confirmed then corrected, corrected then taken back, cleared. The label is the box's final text, and `edited`/`confirmed` say what happened. Test: Task 3, `a box's state follows the last change`.
3. **Annotation mode turned off or on between scans.** Only scans saved in annotation mode are exported, and turning the mode off neither drops them nor lets a later, unchecked scan in. Test: Task 6, `only annotated saves are exported`.
4. **Saved scans from milestones 3 and 5,** which lack every new field. They load, show and export nothing, with no crash. Test: Task 4, `an old saved scan loads and isn't training data`.
5. **A crop that's gone** (a deleted or moved folder) or a very large export. A missing crop drops that box with a count in the manifest, never the whole export. The zip stays under the stored-zip limits (no ZIP64: at most 65,535 entries). Tests: Task 6, `a missing crop is left out and counted`, and `the export refuses more than the zip can hold`.

---

### Task 1: The install ID, and the app and model versions

**Files:**
- Create: `lib/install.ts`, `lib/versions.ts`, `modules/scanner/assets/scanner/model.json`, `__tests__/install.test.ts`, `__tests__/versions.test.ts`
- Modify:
  - `package.json` (`npx expo install expo-crypto`);
  - `lib/startup.ts` (`loadInstall()` in `loadAppData`);
  - `lib/scans.ts` (`StoredScan.made?: { app: string; model: string }`, set in `addScan`);
  - `test-utils` (an expo-crypto mock with a fixed UUID).

**Interfaces:**
- **Produces:**
  - `installId(): string` (throws if not loaded);
  - `loadInstall(): Promise<void>` (reads `install.json`, or makes `{ id: Crypto.randomUUID() }` and writes it once);
  - `APP_VERSION: string` (`Constants.expoConfig?.version ?? 'unknown'`);
  - `MODEL: { name: string; sha256: string; bytes: number }`, read from `model.json`, and `modelVersion(): string` (`` `${name} ${sha256.slice(0, 12)}` ``).
- **`model.json`:** `{ "name": "PP-OCRv6 small, Latin cut, pretrained", "sha256": "<hex>", "bytes": 12152128 }`, computed from `modules/scanner/assets/scanner/inference_latin.onnx`.

- [ ] **Step 1: Write the failing tests:**
  - `the install ID is made once and kept`: a first `loadInstall` writes `install.json` with the mocked UUID; a second load (after `jest.resetModules`) reads the same ID and makes none.
  - `model.json is the shipped model`: Node's `crypto` SHA-256 of `inference_latin.onnx` equals `MODEL.sha256`, and its size equals `MODEL.bytes`.
  - `a new scan keeps the versions it was made with`: `addScan` sets `made` to `{ app: APP_VERSION, model: modelVersion() }`; a scan kept without `made` loads with none.
- [ ] **Step 2: Run** `npx jest __tests__/install.test.ts __tests__/versions.test.ts __tests__/scans.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Check expo-crypto's and expo-constants' SDK 58 docs first, as `AGENTS.md` asks. `install.json` is written with `writeJson` (`lib/jsonFile.ts`).
- [ ] **Step 4: Run** `npx jest`, `npx tsc --noEmit` and `npm run lint`. Expected: PASS.
- [ ] **Step 5: Commit:** `git add package.json package-lock.json lib modules/scanner/assets/scanner/model.json test-utils __tests__` and `git commit -m "feat: an install ID, and the app and model versions each scan was made with"`

### Task 2: Team tools in Settings, and the annotation mode setting

**Files:**
- Modify:
  - `lib/settings.ts` (`annotation: boolean`, `clientCode: string`, `writerCode: string`, defaults `false`, `''`, `''`);
  - `app/settings.tsx` (a "TEAM TOOLS" section, team builds only);
  - `app/index.tsx` (Speed test leaves Home's menu);
  - `app/speed.tsx`;
  - `app/_layout.tsx` (a `training` screen, titled "Training data");
  - `__tests__/settings.test.ts` and `__tests__/settingsScreen.test.tsx` (their exact-object assertions gain the three fields);
  - `__tests__/home.test.tsx`.
- Create: `components/TeamOnly.tsx`, `app/training.tsx` (a stub that Task 6 fills).

**Interfaces:**
- **Produces:**
  - `TeamOnly({ children })`: renders its children in team builds, and otherwise the line "This is for team builds." It wraps `app/speed.tsx` and `app/training.tsx`.
  - **The section,** in team builds only:
    - a "TEAM TOOLS" heading;
    - a switch "Annotation mode", with the note "Every box must be checked before a scan saves, and each scan gets a client and writer code.";
    - a row "Training data" (to `/training`);
    - a row "Speed test" (to `/speed`).

- [ ] **Step 1: Write the failing tests:**
  - `team tools show only in team builds`: with the `TEAM_BUILD` getter mock, the section and its three controls are there or absent.
  - `the annotation switch is kept`: turning it on calls `updateSettings({ annotation: true })`, and it reads back after a reload.
  - `the speed test left Home's menu`: Home's menu no longer has "Speed test" in any build.
  - `team screens in a client build`: `/speed` and `/training` render "This is for team builds." with the getter false.
  - The settings tests' exact objects gain `annotation: false, clientCode: '', writerCode: ''`, and an old `settings.json` without them loads with those defaults.
- [ ] **Step 2: Run** `npx jest`. Expected: FAIL.
- [ ] **Step 3: Implement.** Use the existing components in `app/settings.tsx` (the section's look follows the current section headings). React Native's `Switch` is acceptable here; the UI pass restyles it.
- [ ] **Step 4: Run** `npx jest`, `npx tsc --noEmit` and `npm run lint`. Expected: PASS.
- [ ] **Step 5: Commit:** `git commit -m "feat(app): Team tools in Settings: annotation mode, training data and the speed test"`

### Task 3: Training boxes and each box's state

**Files:**
- Create:
  - `lib/training/boxes.ts`;
  - `__tests__/trainingBoxes.test.ts`.
- Modify:
  - `lib/scans.ts`:
    - `StoredScan.confirmed?: readonly string[]`, defaulted to `[]` in `FRESH` and `readScan`;
    - `confirmBox(id: string, box: string): void`;
    - `setEdit` drops the box from `confirmed`;
    - `updateScan` accepts `confirmed`.
  - `lib/saved.ts` (`readScan` defaults).
  - `components/BoxSheet.tsx`:
    - in annotation mode, the editor gains "Looks right";
    - each row gets a state line;
    - a new prop `boxes?: readonly string[]` lists given boxes.
  - `__tests__/scans.test.ts`, `__tests__/result.test.tsx`.

**Interfaces:**
- **Produces, in `lib/training/boxes.ts`:**
  - `PERSONAL: Readonly<Record<FormName, ReadonlySet<string>>>`:
    - `sales_invoice` and `service_invoice`: `customer_name`, `customer_tin`, `customer_address`;
    - `bir_2307`: `payee_tin`, `payee_name`, `payee_address`, `payee_zip`, `payor_tin`, `payor_name`, `payor_address`, `payor_zip`.
  - `isMultiLine(form: FormName, box: string): boolean`: a template field with `multiline: true`, or `service_invoice`'s `amount_words`.
  - `trainingBoxes(scan: StoredScan): BoxRead[]`: the scan's reads minus personal, `fromText` and multi-line boxes, in field order. `[]` when there is no form.
  - `BoxState = 'unchecked' | 'confirmed' | 'corrected'`, and `boxState(scan: StoredScan, box: string): BoxState`. Corrected wins when an edit exists.
  - `uncheckedBoxes(scan: StoredScan): string[]`: the training boxes that are unchecked.
- **The editor in annotation mode:**
  - "Looks right" (testID `box-confirm`, shown for a read box) calls `confirmBox` and closes the editor.
  - Each row's state line is "Checked", "Corrected" or "Not checked yet". These words show only in annotation mode, and only on training boxes.

- [ ] **Step 1: Write the failing tests:**
  - `the personal boxes are the templates' own`: every name in `PERSONAL` is a field in its form's template JSON, and each form has its name, TIN and address boxes.
  - `multi-line boxes are left out`: `customer_address` (Service) and Service's `amount_words` are multi-line; Sales' `amount_words` isn't.
  - `training boxes leave out personal, PDF-text and multi-line boxes`: on `coreJson` fixtures of each form, plus one with a `fromText` read.
  - `a box's state follows the last change`, covering each sequence:
    - confirm, giving confirmed;
    - confirm then edit, giving corrected;
    - edit then take the edit back, giving unchecked;
    - edit to '' (cleared), giving corrected with label '';
    - confirm, edit, take the edit back, giving unchecked.
  - `the editor confirms a box in annotation mode`: "Looks right" shows only with `annotation` on; tapping it marks the row "Checked".
- [ ] **Step 2: Run** `npx jest`. Expected: FAIL.
- [ ] **Step 3: Implement.** The template fields come from the same JSON `lib/forms.ts` already reads.
- [ ] **Step 4: Run** `npx jest`, `npx tsc --noEmit` and `npm run lint`. Expected: PASS.
- [ ] **Step 5: Commit:** `git commit -m "feat(app): which boxes are training data, and each box checked or corrected"`

### Task 4: The save gate, the source tag, and the camera's test images

**Files:**
- Modify:
  - `lib/exportRows.ts`:
    - `saveBlock(scan, checked, opts?: { annotation?: boolean })` adds `'unchecked'` after the existing blocks;
    - `blockWords` gives "Check every box first: N left." for it.
  - `lib/saved.ts`:
    - `saveScan` passes the setting through;
    - a saved scan in annotation mode keeps `annotated: true` and `tag`;
    - `readScan` defaults `annotated`, `tag` and `testImage`.
  - `lib/scans.ts`:
    - `StoredScan.annotated?: boolean`;
    - `tag?: { client: string; writer: string } | null`;
    - `testImage?: boolean`.
  - `components/SaveSheet.tsx`:
    - in annotation mode, "Client code" and "Writer code" fields, prefilled from Settings;
    - the note "Codes only, like C014 and W03. Never a name.";
    - `save-confirm` waits for both to be valid.
  - `app/result.tsx`: a Save blocked by `'unchecked'` opens the BoxSheet with `boxes={uncheckedBoxes(scan)}`, so boxes the sections don't show can be reached.
  - `components/StatusCard.tsx`, `components/RecentRow.tsx`: the block's words, as for the other blocks.
  - `app/camera.tsx`: a scan from `?test=` gets `testImage: true`.
  - Tests: `__tests__/save.test.tsx`, `__tests__/saved.test.ts`, `__tests__/result.test.tsx`, `__tests__/camera.test.tsx`.
- Create: `lib/training/codes.ts`.

**Interfaces:**
- **Produces:**
  - `cleanCode(text: string): string | null`: trimmed and upper-cased; null unless it matches `/^[A-Z0-9-]{1,12}$/` and holds a digit.
  - On save in annotation mode, `updateSettings({ clientCode, writerCode })` keeps them for the next save.
  - The words: "Check every box first: 1 left." / "… N left.". Under the code fields, "Use letters, digits and -, with at least one digit."

- [ ] **Step 1: Write the failing tests:**
  - `codes are codes`: `cleanCode` keeps "c014" as "C014" and "W-03" as "W-03"; it refuses "Juan", "", "C 014", 13 characters and "ñ1".
  - `annotation mode blocks an unchecked save`: the block, its words with the count, the card and the Recent row; tapping Save opens the box list of exactly the unchecked training boxes.
  - `the save sheet asks for the codes`: it's prefilled from Settings; `save-confirm` is disabled until both codes are valid; the saved scan has `annotated: true` and the tag; Settings keeps the codes.
  - `without annotation mode nothing changes`: no codes are asked, there's no `'unchecked'` block, and the saved scan has `annotated: false`.
  - `an old saved scan loads and isn't training data`: a milestone 3 `scan.json` and a milestone 5 one load with `confirmed: []`, `annotated: false`, `tag: null` and `testImage: false`.
  - `a camera test image is marked`: `/camera?test=…` gives `testImage: true` and can still be saved.
- [ ] **Step 2: Run** `npx jest`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx jest`, `npx tsc --noEmit` and `npm run lint`. Expected: PASS.
- [ ] **Step 5: Commit:** `git commit -m "feat(app): in annotation mode a scan saves once every training box is checked, with its client and writer codes"`

### Task 5: The value the checks used, and one scan's training record

**Files:**
- Create:
  - `lib/training/used.ts`;
  - `lib/training/record.ts`;
  - `__tests__/trainingUsed.test.ts`, `__tests__/trainingRecord.test.ts`.

**Interfaces:**
- **Consumes:**
  - `saleOf` / `SaleView.final` (`items`, `date`, `date_choice`, `total_due`), `certOf` / `CertView.cert` (`rows`, `totals`);
  - Task 3's `trainingBoxes` and `boxState`;
  - Task 1's `installId`; Task 4's fields.
- **Produces:**
  - **`usedValues(scan: StoredScan, lists: Lists, settings: Settings): Record<string, string>`:** box name → what the checks used, only where it differs from the box's own reading, parsed the same way.
    - **Invoices:** `item{r}_qty`, `item{r}_unit_price`, `item{r}_amount` (from `final.items` by `row`), `date` (ISO, when `date_choice.rebuilt` or it differs) and `total_due`.
    - **The 2307:** `{ewt|bt}{r}_{m1,m2,m3,total,tax}` and `{ewt|bt}_total_{…}` (from `cert.rows` and `cert.totals`).
    - **Numbers** are written as `String(n)`.
  - **`TrainingBox`:**
    ```ts
    { name: string; type: FieldType; crop: string /* path in the zip */; size: [number, number];
      reading: string; conf: number; alts: string[]; used: string | null; label: string;
      edited: boolean; confirmed: boolean }
    ```
  - **`TrainingScan`:**
    ```ts
    { id: string; form: FormName; source: 'photo' | 'pdf'; annotated: boolean;
      tag: { client: string; writer: string } | null; installId: string; app: string | null; model: string | null;
      photo: { sharpness: number | null; sharpMin: number | null; light: number | null; darkMax: number | null;
               turned: boolean };
      flags: string[]; boxes: TrainingBox[] }
    ```
  - **`trainingRecord(scan: StoredScan, lists: Lists, settings: Settings): TrainingScan | null`.** Null unless the scan is saved, `annotated`, not a sample, not `testImage`, with a form and at least one training box. `label` is the edit if edited, else the reading. `crop` is `crops/<scan id>/<box name>.png`.

- [ ] **Step 1: Write the failing tests:**
  - **`the checks' value when it differs`:**
    - a row whose amount the math took from its alts gives that amount;
    - a rebuilt date gives its ISO;
    - a 2307 tax within ±0.05 taken from an alt gives that value;
    - a box whose own reading was used gives nothing.
  - **`a record holds only training boxes`:** on each form's fixture as a saved, annotated scan, none of `PERSONAL`, no `fromText` and no multi-line box is present. The labels, marks and `used` are right for an edited, a confirmed and a corrected box.
  - **`not training data`:** a sample, a test image, an unsaved scan, a scan saved without annotation, and one with no form each give null.
  - **`the record has no names`:** its JSON holds no party name, label, file name or TIN string from the fixture.
- [ ] **Step 2: Run** `npx jest`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx jest`, `npx tsc --noEmit` and `npm run lint`. Expected: PASS.
- [ ] **Step 5: Commit:** `git commit -m "feat: a saved, annotated scan as a training record: its training boxes, labels, marks and the checks' values"`

### Task 6: The training-data export

**Files:**
- Create:
  - `lib/training/export.ts`;
  - `lib/share.ts` (`shareThenAsk`, moved out of `components/ExportSheet.tsx` and taking a MIME type);
  - `__tests__/trainingExport.test.ts`, `__tests__/trainingScreen.test.tsx`.
- Modify:
  - `app/training.tsx` (Task 2's stub);
  - `lib/saved.ts` (`SavedSummary.trainingExportedAt: string | null`, kept across saves; `markTrainingExported(ids: string[], at: Date): Promise<void>`);
  - `components/ExportSheet.tsx` (uses `lib/share.ts`);
  - `__tests__/savedScreen.test.tsx` (still passes unchanged).

**Interfaces:**
- **`TRAINING_FORMAT = { format: 'mybizmate-scan-training', version: 1 }`.**
- **`buildTrainingExport(scans: TrainingScan[], at: Date): Promise<{ name: string; bytes: Uint8Array; boxes: number; missing: number }>`:**
  - It writes `manifest.json` (`{ ...TRAINING_FORMAT, exportedAt, installId, app, scans }`, with each box's crop path) and each crop at its path, read with `new File(cropUri).bytes()`.
  - A crop that can't be read drops its box and counts in `missing`. The manifest says `missing` too.
  - It throws `'too_big'` past 65,535 entries.
  - The name is "MyBizMate Scan training data <yyyy-mm-dd>.zip".
- **`/training`, in team builds:**
  - "<N> annotated scans not exported yet." (or "1 annotated scan…");
  - the button "Export training data";
  - when there are none: "No annotated scans to export yet."
- **After sharing:**
  - Share with MIME `application/zip`, then ask "Did the file go where you wanted?" with "Mark these N scans as exported, so the next export leaves them out." and the buttons Not yet / Mark as exported.
  - The toast is "Marked N scans as exported."
  - If the file can't be written: "Couldn't make the file."

- [ ] **Step 1: Write the failing tests** (with `test-utils/unzip.ts` and `memoryFs`):
  - `the zip holds the manifest and each training crop`: the entries' names, CRCs, the manifest's format and version, and the bytes of each crop.
  - `no personal box is exported`: on each form's annotated fixture, the zip holds no entry and no manifest text from `PERSONAL`.
  - `only annotated saves are exported`:
    - a scan saved without annotation, a sample and a test image are left out;
    - turning annotation mode off keeps the annotated ones;
    - a scan marked exported is left out next time.
  - `a missing crop is left out and counted`.
  - `the export refuses more than the zip can hold` (a faked count past 65,535).
  - `the training screen exports and marks`: the count, the share's MIME type, the question, and the marking.
  - The import exports' sheet tests still pass with the shared `shareThenAsk`.
- [ ] **Step 2: Run** `npx jest`. Expected: FAIL.
- [ ] **Step 3: Implement.** Use `zipStored` (`lib/zip.ts`) and `writeExportBytes` (`lib/exportFile.ts`).
- [ ] **Step 4: Run** `npx jest`, `npx tsc --noEmit` and `npm run lint`. Expected: PASS.
- [ ] **Step 5: Commit:** `git commit -m "feat(app): export the annotated scans as training data: a zip of crops and labels, marked once sent"`

### Task 7: Reading exports into `prototype/training`'s format (Python, outside git)

**Files:**
- Create: `../prototype/training/read_scan_exports.py`, `../prototype/training/test_read_scan_exports.py`.
- Modify: `../prototype/training/finetune_ppocrv6_rec.ipynb`: cell 22's `CHARSETS` gains `digits` (0–9) and `code` (A–Z, 0–9).

**Interfaces:**
- **The command:** `python read_scan_exports.py OUT_DIR EXPORT.zip [EXPORT.zip …] [--val-writers W1,W2,…] [--val-count 5] [--seed 0]`.
- **It writes `make_rec_dataset.py`'s format:**
  - `train/` and `val/` images named `<5-digit index>_<box name>.png`;
  - `train_list.txt` and `val_list.txt` with `<path>\t<label>` (UTF-8, LF);
  - `dataset_info.json` with `seed`, `max_text_length` 25, `val_writers`, `stats`, `field_types`, and `train`/`val` each with `{crops, writers, types}`;
  - the folder zipped like `rec_dataset.zip`.
- **A writer** is `client/writer` from the tag, or `install:<id>` without one. A writer's every crop goes to one side.
  - `--val-count` picks writers with the seed.
  - With fewer than 20 writers, or fewer than 5 held out, it prints a warning.
- **It skips:**
  - empty labels;
  - labels over 25 characters;
  - boxes whose label has a character outside the app's 98 plus space.

  The counts go in `stats`.
- **It refuses** an export whose `format`/`version` it doesn't know.

- [ ] **Step 1: Write the failing tests** (unittest, with small exports made in the test: a manifest plus PNGs from OpenCV):
  - `writers never straddle the split`;
  - `the files are make_rec_dataset's`: the names, lists, info keys and zip prefix;
  - `skips are counted`: an empty label, 26 characters and "€";
  - `an unknown format is refused`;
  - `two exports merge`.
- [ ] **Step 2: Run** `"…\.venv\Scripts\python.exe" -I test_read_scan_exports.py` from `prototype/training`. Expected: FAIL.
- [ ] **Step 3: Implement,** reusing `make_rec_dataset.py`'s list, info and zip writing where it fits.
- [ ] **Step 4: Run** the tests. Expected: PASS. Then run one pass on Task 8's real export.
- [ ] **Step 5:** Nothing to commit (outside git). Record the files and the run in the task report.

### Task 8: On the emulator, and the README

**Files:**
- Modify: `README.md`.

- [ ] **Step 1: Run every suite on the final tree:**
  - `npx jest`, `npx tsc --noEmit` and `npm run lint`;
  - `npm run test:core` and `./gradlew :scanner:testDebugUnitTest` (both unchanged);
  - Task 7's Python tests.
- [ ] **Step 2: Reinstall** (expo-crypto is native), with the M5 procedure from the README: back up, uninstall, install, restore. Tell the UI/UX session first.
- [ ] **Step 3: Check on the emulator** (debug build; never screenshot a picker):
  1. Settings shows Team tools. Turn on Annotation mode.
  2. Push a synthetic invoice photo (from `fixtures/core/photos/`) and a synthetic 2307 photo (`fixtures/core/bir2307/`) to the gallery. Scan each.
  3. Save is blocked until every training box is checked: confirm some boxes and correct one. The codes are asked (try a name: it's refused), then the scan saves.
  4. In Training data, export. Copy the zip out with `adb exec-out run-as …`.
  5. Unzip it on the laptop. Check the manifest: no personal box, the labels, the marks, and the install ID.
  6. Run Task 7 on it.
  7. Turn Annotation mode off. A new scan saves as before and isn't counted.
- [ ] **Step 4: Update the README:**
  - annotation mode, the source tag and the training export (its format, with an example manifest entry);
  - the Python reader;
  - what was checked;
  - what's still open (consent and people's queue in milestone 6; clearing saved images; multi-line boxes' per-line crops).
- [ ] **Step 5: Commit:** `git add README.md` and `git commit -m "docs: milestone 4: annotation mode, the training-data export, and what was checked"`

After this task: a whole-branch review on the most capable model. Then the user decides when to merge into `master` and push.
