### Task 11: The Scan screen in a session

**Files:**
- Modify: `app/result.tsx`, `components/SaveSheet.tsx` (`inSession`), `lib/scanFlow.ts` (`retake`)
- Test: `__tests__/result.test.tsx`, `__tests__/save.test.tsx`, `__tests__/sessionFlow.test.tsx`

**Interfaces:**
- Consumes: `useSessions`, `nextToCheck` (Task 4), `retakeIn` (Task 2), `useNavigateOnce`.
- Produces:

```ts
// app/result.tsx: params
{ id: string; from?: 'session' | 'list'; session?: string }
// 'session': from a session's screen, Check the next one or Next invoice
// 'list': from Sessions, a search or See invoices
// none: straight from a read (Done's one photo, a sample)
// session: the session it's in (from Done's one photo too)
// components/SaveSheet.tsx and CertSaveSheet: inSession?: boolean // default false; true: the snackbar has no View
// lib/scanFlow.ts
retake(scan: StoredScan, how: { back: boolean; session: string | null }): Promise<void>;
// a sample, or back: back once, as today
// an unsaved scan in a session: retakeIn(session, scan.id, now), then router.navigate('/camera'), once
// otherwise: today's by source
```

**The rules** (spec §6.4, calls 14 to 16):
- **`back`** is `from === 'list' || (from === 'session' && scan.saved !== null)`.
- **TalkBack** starts at the strip when `from` is undefined, as today.
- **The bottom bar:**
  - **In a session, form not found:** `[{ label: 'Retake', onPress: retake }]`.
  - **In a session, `saved === 'unchanged'`:** `[Retake (secondary), primary]`.
    - The primary is "Next invoice" while `nextToCheck(group, statuses, scan.id)` finds one. It runs `router.replace({ pathname: '/result', params: { id: next, from: 'session', session } })`, once.
    - Otherwise the primary is "Back to session": `navigateOnce({ pathname: '/sessions/[id]', params: { id: session } })`.
  - **Otherwise:** today's bar. So a change after the save brings "Save changes" back.
- **The save sheets** get `inSession={session !== undefined}`. With it, the snackbar says today's words with no action. Without it, View opens See invoices (Task 10).

- [ ] **Step 1: Write the failing tests.**

  `__tests__/result.test.tsx`:
  - `'in a session, after a save, Next invoice replaces this screen with the next one'`.
  - `'the last one saved: Back to session'`.
  - `'a change after the save brings Save changes back'`.
  - `"in a session, the not-found bar is Retake alone, and Retake opens the camera in the session, once"`.
  - `'Next invoice and Back to session run once on a double tap'` (Review Focus 5).
  - Keep every existing Retake test, with `from: 'list'` in place of `'recent'` and `'saved'`.

  `__tests__/save.test.tsx`:
  - `"in a session the save's snackbar has no View"`.

  `__tests__/sessionFlow.test.tsx`:
  - `'Back to session lands on the session screen in the Sessions tab, with nothing above it'`.

- [ ] **Step 2: Run** `npx jest __tests__/result.test.tsx __tests__/save.test.tsx __tests__/sessionFlow.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run** `npm test` and the gates. Expected: PASS.

- [ ] **Step 5: Commit** with the message `feat(app): in a session, the Scan screen goes on to the next invoice, then back to the session`.

---

