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

