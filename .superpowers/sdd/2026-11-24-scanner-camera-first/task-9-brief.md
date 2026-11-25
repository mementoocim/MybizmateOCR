### Task 9: The session screen

**Files:**
- Modify: `app/(tabs)/sessions/[id].tsx` (its stand-in replaced), `lib/confirmDelete.ts` (`confirmDeleteScan`)
- Create: `components/Card.tsx`
- Test: `__tests__/sessionScreen.test.tsx` (new), `__tests__/display.test.tsx` (Card)

**Interfaces:**
- Consumes:
  - `useSessions`, `tallyOf`, `cardLine`, `countLine`, `sessionTitle`, `nextToCheck`, `scanBadge`, `savedSub` (Task 4);
  - `currentSession`, `retakeIn` (Task 2), `deleteScan` (Task 2), `confirmDeleteSaved`;
  - `usePushOnce`, `useNavigateOnce`, `Banner`, `ButtonRow`, `SectionHeader`, `ListRow`, `EmptyState`.
- Produces:

```ts
// components/Card.tsx
export function Card(props: {
  title: string;                       // type.headline, a header for TalkBack
  body?: string | null;                // type.body, mute
  tone?: 'plain' | 'attention';        // attention: warningTint in a warningLine border (the mockup's amber card)
  action?: ButtonProps | null;         // its one button, full width, under it
  children?: ReactNode;                // between the body and the button
}): ReactElement;                      // panel (or tint), radius.panel, padding space.l, gap space.s, marginHorizontal space.l
// lib/confirmDelete.ts
export function confirmDeleteScan(scan: StoredScan, before?: () => void): Promise<void>; // settles when the dialog closes
```

**What it shows** (spec §6.4, calls 2, 3, 9 and 10):
- **The header:** `sessionTitle(s.at, today)`, with the subtitle `` `Session · ${countLine(s)}` ``, and the default Back.
- **The card:**
  - its `tone` is `attention` while anything is left, and `plain` once it reads "All saved.";
  - its title is `cardLine(tally, failed.length)`;
  - its action, while `nextToCheck` finds one, is "Check the next one" (primary), which pushes `{ pathname: '/result', params: { id: next, from: 'session', session: id } }`.
- **The reads that failed** (only while this is `currentSession()`): a warning `Banner`.
  - Its words: "1 photo couldn't be read. Retake it.", or `` `${n} photos couldn't be read. Retake them.` ``.
  - Under them, a line per entry: `` `${formatClock(new Date(at))}: ${reason}` ``.
- **The scans:** `SectionHeader` "Invoices", with the count on its right, then a row per scan, oldest first:

  | The scan | Title | Sub | Amount | Badge |
  |---|---|---|---|---|
  | saved | `summary.partyName` or its label | `savedSub(summary)` | gross, or a 2307's tax | Saved, Exported or Changed |
  | unsaved, form found | the party shown, or its label | `Sale · SI 0000186`, `Purchase · Inv 0007`, `2307 · Q4 2026` | `amount(...)` | N to check, Can't save yet, or Checks passed |
  | unsaved, no form | `shownLabel(scan)` | `formatClock(at)` | none | Retake |

  - Every row opens its Scan screen with `from: 'session'` and `session: id`.
  - A long press runs `confirmDeleteScan`.
- **Under a no-form row:** a `ButtonRow` of "Remove" (`destructiveText`), which runs `confirmDeleteScan`, and "Retake" (`text`), which runs `retakeIn(id, scan.id, new Date())` and then `navigateOnce('/camera')`.
- **`confirmDeleteScan`:**
  - a saved scan goes through `confirmDeleteSaved`, today's words;
  - an unsaved one asks `Alert.alert('Delete this scan?', "It's removed from this phone.", [Cancel, Delete])`;
  - Delete runs `before?.()` and then `deleteScan`, and says "Couldn't delete the scan." if that fails;
  - it settles when the dialog closes, so a Button guards a double tap.
- **Empty:** `EmptyState title="Nothing left in this session" body="Its scans were deleted."`.

- [ ] **Step 1: Write the failing tests.**

  `__tests__/sessionScreen.test.tsx`:
  - `'the header: Today, 9:41 AM, and Session · 3 invoices'`.
  - `"the card: 1 ready · 1 to check · 1 to retake with Check the next one; All saved. with no button"`.
  - `'Check the next one opens the first unsaved scan whose form was found, past a retake'`.
  - `'a row: party or label, kind and number, the amount and one badge; it opens the Scan screen'`.
  - `"a scan whose form wasn't found: Retake opens the camera in this session; Remove asks, then deletes"`.
  - `"photos that couldn't be read: the count, then each one's time and words, while it's the current session"`.
  - `'a long press asks to delete: an unsaved scan as Delete this scan?, a saved one in its words'`.
  - `'Check the next one, Retake and Remove run once on a double tap'` (Review Focus 5).
  - `'a session with nothing left in it says so'`.

  `__tests__/display.test.tsx`:
  - `'Card: a header, its words, one button; attention on the warning tint'`.

- [ ] **Step 2: Run** `npx jest __tests__/sessionScreen.test.tsx __tests__/display.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run** `npm test` and the gates. Expected: PASS.

- [ ] **Step 5: Commit** with the message `feat(app): a session's screen: what's left, Check the next one, a retake or remove for a photo the camera couldn't read`.

---

