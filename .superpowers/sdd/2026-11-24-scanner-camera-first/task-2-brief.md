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

