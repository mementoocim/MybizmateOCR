### Task 8: Sessions

**Files:**
- Modify: `app/(tabs)/sessions/index.tsx` (its stand-in replaced), `components/ListRow.tsx` (`badges`)
- Test: `__tests__/sessionsScreen.test.tsx` (new), `__tests__/display.test.tsx`

**Interfaces:**
- Consumes:
  - `useSessions`, `byDay`, `rowTitle`, `sessionBadges`, `tallyOf`, `scanBadge`, `savedSub`, `scanFields` (Task 4);
  - `matchesScan` (Task 4);
  - `openSaved`, `getScan`;
  - `usePushOnce`; `Screen`, `Header`, `IconButton` (`Search`, `Close`), `TextField`, `SectionHeader`, `EmptyState`.
- Produces:

```ts
// components/ListRow.tsx: ListRow gains
badges?: readonly BadgeSpec[]; // several, side by side (wrapping), each part of the spoken label; `badge` stays
```

**What it shows** (spec §6.6, call 11):
- **The header:** "Sessions", with no Back. On its right, an `IconButton` `Search` "Search".
  - It shows a `TextField` under the header (label "Search", placeholder "Name, number or TIN", focused on open).
  - The button then becomes `Close` "Close search", which clears the field.
- **The list:** a `SectionList` of `byDay(sessions, new Date())`, with `SectionHeader`s.
  - **A row:**
    - the title `rowTitle(s)`;
    - `badges`: `sessionBadges(tallyOf(s, statuses))`, or for a session with no id, `[scanBadge(...)]`;
    - a chevron.
  - **A press:**
    - with an id, it pushes `{ pathname: '/sessions/[id]', params: { id } }`;
    - without one, it opens the scan. `openSaved` runs when the scan isn't among the recent ones, and "Couldn't open that scan." shows when it's gone. Then it pushes `{ pathname: '/result', params: { id, from: 'list' } }`.
- **While searching:** the matching scans (`scanFields` with `matchesScan`), newest first, each a `ListRow`:
  - title: its name;
  - sub: `savedSub`, or `` `${kind} · ${number}` ``;
  - its amount and its `scanBadge`;
  - it opens its Scan screen with `from: 'list'`.

  With none: `` EmptyState title={`No scan matches “${query}”`} ``.
- **Empty:** `EmptyState title="Nothing scanned yet" body="Take a photo with the round button. Each run of photos shows up here."`.

- [ ] **Step 1: Write the failing tests.**

  `__tests__/sessionsScreen.test.tsx`:
  - `"Sessions: rows by day, newest first, 9:41 AM · 3 invoices, with at most two badges"`.
  - `'a row opens its session; a scan from before opens its Scan screen'` (Review Focus 2).
  - `'scans from before and the samples are sessions of their own, labelled as today'` (Review Focus 2).
  - `'the search finds scans by party, number or TIN, and lists them; a result opens its Scan screen'`.
  - `'empty: Nothing scanned yet'`.
  - `'a row opens once on a double tap'` (Review Focus 5).

  `__tests__/display.test.tsx`:
  - `"ListRow's badges sit side by side, each in its spoken label"`.

- [ ] **Step 2: Run** `npx jest __tests__/sessionsScreen.test.tsx __tests__/display.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run** `npm test` and the gates. Expected: PASS.

- [ ] **Step 5: Commit** with the message `feat(app): Sessions: a row per session by day, with its badges, and search across scans`.

---
