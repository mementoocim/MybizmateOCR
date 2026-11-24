### Task 7: The camera tab: sessions, the tray, Done

**Files:**
- Modify: `app/(tabs)/camera.tsx`; `lib/scanFlow.ts` (`scanUri` goes: the camera no longer reads)
- Create: `components/SessionTray.tsx`
- Test: `__tests__/camera.test.tsx` (its capture tests rewritten), `__tests__/sessionFlow.test.tsx` (new)

**Interfaces:**
- Consumes:
  - `takeCapture`, `currentSession`, `subscribeSession`, `endSession`, `closeIdleSession` (Task 2);
  - `queuePhoto`, `queuePdf`, `captures`, `subscribeQueue`, `pendingIn`, `whenRead`, `holdReads`, `READ_WHILE_SHOOTING` (Task 3);
  - `pickPhoto`, `cameraAppPhoto`, `pickPdf` (Task 3), `useStarted` (Task 3);
  - `trayOf` (Task 4), `setShutter` (Task 5), `useTabBarSpace` (Task 5), `useNavigateOnce` and `usePushOnce`.
- Produces:

```ts
// components/SessionTray.tsx
export function SessionTray(props: {
  items: readonly TrayItem[] | null; // null: no photo in the session yet, so the hint sits in the middle
  hint: ReactNode;                   // the status pill
  done: { label: string; busy: boolean; onPress: () => Promise<void> } | null;
  onGallery: () => void;
  onPdf: () => void;
  disabled: boolean;                 // while a picker is open
}): ReactElement;
```

**The screen** (spec §6.3, calls 6 to 8):
- **The top band:** the Auto switch and the flashlight, as today. There's no Close (Task 6).
- **The picture:** the live camera, with the status pill at its foot while the tray shows thumbnails.
- **The tray** sits under the picture and over the bar's space (`paddingBottom: useTabBarSpace() + space.s`).
  - **Its ends:** `IconButton`s `ImageIcon` "Gallery" on the left and `FileText` "Import PDF" on the right, in the camera tone.
  - **Its middle:** a horizontal scroll of the open session's thumbnails (`trayOf`), each `touch.thumbW` × `touch.thumbH`, with a 16 dp mark on its corner:
    - a `brand` ring on `panel` while it's read;
    - `Check` in `panel` on `success` once it's read;
    - "!" in `panel` on `warning` for a retake.
  - **A thumbnail's name:** "Photo 1, reading", "Photo 1, read" or "Photo 1, retake".
  - **Then Done:** a secondary `Button`, "Done · N", where N counts the tray.
  - Before the first photo, the middle is the status pill instead.
- **Live while reading** (approach 1): `active = started && focused && !picking && !sayingWhy`. Reads never turn it off.
  - Under approach 2 (`!READ_WHILE_SHOOTING`), the camera runs `holdReads(true)` while it's live, and `holdReads(false)` on blur and on Done.
- **A capture:**
  - Auto, the middle button, the gallery, the camera app and a PDF all start with `const { session, replaces } = takeCapture(new Date())`.
  - Then a photo goes to `queuePhoto(uri, { session, source, testImage: testParam !== null, replaces }, now)`, and a PDF to `queuePdf`.
  - Auto's photo gets today's haptic.
  - A photo that comes in while the camera isn't on top is discarded, as today.
- **The middle button:** while the camera is on top, it runs `setShutter(owner, { take, disabled })` (`useFocusEffect`, cleared on blur and unmount). `disabled` while it's starting, taking a photo, or showing a panel.
- **Done:**
  - Its `onPress` runs `endSession(id)`, then `holdReads(false)`, then `await whenRead(id)`.
  - While it waits, its label is `` `Reading ${pendingIn(id)} more…` `` and it's busy.
  - Then, with exactly one stored scan and no failed read, it pushes `{ pathname: '/result', params: { id: scanId, session: id } }`.
  - Otherwise it runs `navigateOnce({ pathname: '/sessions/[id]', params: { id } })`.
  - It runs once: the Button's promise guard.
- **Leaving:** blur keeps the session and the queue. On focus, and when the app comes back to the foreground, `closeIdleSession(new Date())` runs.
- **Dialogs** stay only for picking: a picker that fails, "Choose a PDF file.", and the camera app's permission (`sayWhy`, as today). A read never opens one.
- **The splash:** nothing starts, and no permission is asked for, until `useStarted()` is true.

- [ ] **Step 1: Write the failing tests.**

  `__tests__/camera.test.tsx`. Use `memoryFs` and the real session store and queue, with `scanPhoto` mocked as deferred promises.
  - `'it starts, and asks for the camera, only once the splash has gone'`.
  - `"a photo joins the session's queue, and the camera stays live while it's read"`.
  - `'the first capture opens a session; the next ones join it'`.
  - `'the tray: the gallery and the PDF always; the hint in the middle until the first photo; then the thumbnails and Done · N'`.
  - `'each thumbnail says how it stands: reading, read or retake'`.
  - `'a read that fails is a thumbnail with !, never a dialog'`.
  - `'Done waits for the queue, saying Reading 2 more…, then opens the session screen'`.
  - `"a session of one photo opens that photo's Scan screen"`.
  - `'Done runs once on a double tap'` (Review Focus 5).
  - `'leaving keeps the session and the queue; coming back continues it; 30 minutes later it has closed'`.
  - `'after a Retake, the next capture replaces that scan, once'`.
  - `"the gallery, the camera app and a PDF join the session the same way; a picker that fails, or a file that isn't a PDF, says why in a dialog"`.
  - `'the middle button takes the photo while the camera is on top, and waits while it starts or takes one; on another tab it is Camera again'` (Review Focus 4).
  - `'the camera stops when another tab is on top'` (Review Focus 4).
  - Keep the tests of the permission panels, the test hook (its photos are test images), the haptic and refocus.

  `__tests__/sessionFlow.test.tsx`. Use `renderRouter(appRoutes({ '(tabs)/camera': … }))` with `memoryFs`.
  - `'Done opens the session screen in the Sessions tab, with the bar; Back goes to Sessions, then the camera'`.

- [ ] **Step 2: Run** `npx jest __tests__/camera.test.tsx __tests__/sessionFlow.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement.** Remove `scanUri` and the camera's reading card.

- [ ] **Step 4: Run** `npm test` and the gates. Expected: PASS.

- [ ] **Step 5: Commit** with the message `feat(app): the camera keeps shooting into a session: a tray of what it read, Done, and photos read while it stays live`.

---

