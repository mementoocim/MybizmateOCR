# Pre-flight rulings, by task

The controller's rulings on the pre-flight scan's findings (`preflight-scan.md`, §5). Each ruling binds the task it names, on top of that task's brief. Where a ruling and the brief differ, the ruling wins.

## Task 1
- **P-F18:** `CheckRate` logs each window's length with its count, as in `MbsCheckRate checks=<n> ms=<elapsed> reading=<bool>`, with figures only. Task 14 compares total checks over total time for each `reading` state. A stall is then never one short line.

## Task 3
- **P-F1:** `loadRecent()` reads `recent.json` only once per JS context: a module flag records that it has loaded. A later call, as on a remount after a font-size or display-size restart, keeps memory as the truth, because memory can be ahead of the file while the queue is writing. Pin it: with a scan added and its write still pending, a second `loadRecent()` keeps the scan.
- **P-F2:**
  - A queued photo's scan takes its capture time from the file name's `<ms>` as its `at`.
  - `resumeQueue` skips, and then deletes, a queued photo when a kept scan in its session already has that `at`. So a kill between the scan's write and the photo's delete never reads it twice.
  - Pin it: a queued file whose scan is already in `recent.json` isn't read again, and the file is deleted.
  - Review Focus 1 then holds as written.

## Task 4
- **P-F3:** the "one check" test spies on the uncached work, `finalize` in `lib/checks/finalize` and `check2307`, which runs only on a cache miss. It doesn't spy on `saleOf`. There's still one cache: `saleOf`'s own, keyed by F-1's rule.
- **P-F4:** `useSessions` also returns `saved: ReadonlyMap<string, SavedState>`, computed with the statuses. A summary-only member is `'unchanged'`. `scanBadge(m, status, saved)` reads it, so Tasks 8 and 9 don't recompute it per row.
- **P-F11:** add one helper, `scanSub(m: SessionMember): string`, in `lib/sessions.ts`, for a scan's sub-line, as in "Sale · SI 0000186" (kind in title case · number), or the label's time when there's no number. Tasks 8 and 9 use it and never build their own.

## Task 5
- **P-F5:** `useEndPadding` calls `useTabBarSpace()` unconditionally (rules-of-hooks). `useTabBarSpace()` returns 0 while the keyboard is up (`keyboard > 0 ? 0 : (context ?? 0)`), so with the keyboard up the layout test's expectation, the keyboard alone, holds.

## Task 6
- **P-F6:** the camera's status bar is `{focused && <StatusBar style={flow.reading ? 'dark' : 'light'} />}` in Task 6. Today it's dark over the reading card (`app/camera.tsx:213`, `__tests__/camera.test.tsx:467`). Task 7, which removes the reading card, drops the condition and that test.
- **P-F13 (Task 6's part):** where Task 6 rewrites `rootLayout.test` and `navigation.test`, it uses a route that survives, `/lists`, in place of `/saved`.

## Task 7
- **P-F7:** move `sayWhy` and `sayingWhy` out of `useScanFlow` into a `useSayWhy()` hook in `lib/readFailures.ts`, which both `useScanFlow` and the camera use. Don't copy the Alert logic.
- **P-F8:** the thumbnail's "!" is an SVG glyph, drawn like the ✓ (`Check`), never `Text` in a fixed box.
- **P-F9:**
  - `takeCapture` runs only once a pick returns a file. A cancelled pick opens no session and spends no Retake link.
  - For Auto and the shutter, it runs after the "not on top → discard" check.
  - Pin it: a cancelled gallery pick leaves no open session, and keeps a Retake's link.

## Task 9
- **P-F12:** `confirmDeleteScan` resolves at once for a saved scan, which goes through `confirmDeleteSaved` and its own flow. It settles when the dialog closes only for an unsaved scan.

## Task 10
- **P-F13:**
  - Task 10's Files add `__tests__/snackbarClearance.test.tsx`. Its two "over an empty Saved" tests move to the Export tab, or to See invoices.
  - No suite may still open `/saved` or require `app/saved` after Task 10.
- **P-F14:** in step 2, the error Banner comes first, then the sentence.

## Task 11
- **P-F10:** the Scan screen's ⋮ gains "Delete this scan" for an unsaved scan, through Task 9's `confirmDeleteScan`. Every scan, old or new, can then be deleted from its Scan screen. That includes kept, unsaved scans from before the update, which open straight to their Scan screen (call 11). Pin it with a no-id unsaved scan.
- **P-F15:** today's snackbar words stay, with no full stop: "Saved as a sale", "Changes saved". The spec's "Saved as a sale." only illustrated the message, so this is a recorded exception to the Global Constraints' quoted-copy rule.
- **P-F16:** Task 11 changes Home's recent-row push to `from: 'list'`, with `home.test.tsx:396`, so a Retake from Home keeps going back until Task 12 rewrites Home.
- **P-F17:** Task 11's rule stands: any saved, unchanged scan opened from a session gets Next invoice or Back to session. Read call 16's "just-saved" that way.

## Task 14
- **P-F19:**
  - Before the backup on master's build, Task 14 saves one `?test=` sale and one `?test=` purchase, as well as the plan's unsaved scans. So "data from before" has saved scans for See invoices, the export and delete.
  - Task 15 reuses Task 14's backup. If it backs up again, it uses another name: `/tmp/scan-appdata-cf15.tar`.
- **P-F21:** §5 decides how smoothness is judged. It's Task 14's measurement on the virtual camera. Task 15's 10-photo `?test=` session checks the queue and the tray, not smoothness.

## Task 15
- **P-F20:**
  - (a) If the picker refuses `not_an_image.jpg`, queue the file with `run-as` into `files/queue/`, as Task 14 does.
  - (b) The device tasks run on the new QA AVD, the user's choice on 2026-11-24, so all data is made up.
