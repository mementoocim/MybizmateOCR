### Task 12: Home as cards

**Files:**
- Modify: `app/(tabs)/index.tsx` (rewrite), `lib/format.ts` (`greeting`, `longDay`)
- Delete: `components/RecentRow.tsx`, `__tests__/recentRow.test.tsx`
- Test: `__tests__/home.test.tsx` (its assertions rewritten), `__tests__/format.test.ts`

**Interfaces:**
- Consumes:
  - `Card` (Task 9); `useSessions`, `homeCounts`, `oldestWithWork`, `sessionTitle`, `countLine` (Task 4);
  - `waitingOf`, `totalOf`; `useScanFlow().fromSample`; `useNavigateOnce`, `usePushOnce`;
  - today's Get set up rows, the samples sheet and the footer.
- Produces:

```ts
// lib/format.ts
export function greeting(d: Date): 'Good morning' | 'Good afternoon' | 'Good evening'; // before 12:00, before 18:00, after that
export function longDay(d: Date): string; // "Tuesday, Nov 24" (monthDay's no-break space between month and day)
```

**What Home shows** (spec §6.5, call 18), top to bottom, with each card's single button:

| Card | When | Title and words | Button |
|---|---|---|---|
| The header | always | `Header title={greeting(now)} subtitle={longDay(now)} onBack={null}` | none |
| Get set up | until `setupDone` (today's rule) | `` `Get set up ${done} of 2` ``, then today's two rows inside | none (its rows are today's) |
| Take your first photo | no recent and no saved scan (today's first run) | the line "The round button at the bottom opens the camera.", then today's three numbered tips | "Open the camera" (primary): `navigateOnce('/camera')` |
| To check (`attention`) | `homeCounts` above 0 | the parts `` `${n} invoice(s) to check` `` and `` `${r} photo(s) to retake` ``, joined by " and " | "Check now" (primary): `oldestWithWork`'s session screen, or a scan with no id's Scan screen (`from: 'list'`) |
| Ready to send to MyBizMate | anything waiting | a line per kind with something waiting: `` `Sales · ${n}` `` (`type.value`), with `peso(total)` (`type.figure`) on the right | "Go to Export" (secondary): `navigateOnce('/export')` |
| Last session | a session with an id exists | `` `${sessionTitle(at, now)} · ${countLine(s)}` `` | "Open the session" (secondary) |
| The end | always | today's "Try a sample invoice" text button and its sheet; a sample opens its Scan screen in no session; today's footer | as today |

- [ ] **Step 1: Write the failing tests.**

  `__tests__/home.test.tsx`. Replace the capture, To export and Recent scans assertions with:
  - `'the header: the greeting for the time of day, and the date'`.
  - `'a first run: Get set up, and Take your first photo with the three tips; Open the camera opens it'`.
  - `'N invoices to check, and the photos to retake; Check now opens the oldest session with something left'`.
  - `"Ready to send to MyBizMate: each kind's count and total; Go to Export"`.
  - `'Last session: its time and count; Open the session opens it'`.
  - `'a sample opens its Scan screen, in no session'`.
  - `'nothing to do: no check card and no send card'`.
  - `"each card's button runs once on a double tap"` (Review Focus 5).

  `__tests__/format.test.ts`:
  - `'greeting'`.
  - `'longDay'`.

- [ ] **Step 2: Run** `npx jest __tests__/home.test.tsx __tests__/format.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement**, and delete `RecentRow` and its test.

- [ ] **Step 4: Run** `npm test` and the gates. Expected: PASS.

- [ ] **Step 5: Commit** with the message `feat(app): Home as cards: what to check, what's ready to send, the last session, and a first photo`.

---

