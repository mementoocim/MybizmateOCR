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

