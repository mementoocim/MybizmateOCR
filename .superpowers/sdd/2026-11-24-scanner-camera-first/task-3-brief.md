### Task 3: The capture queue

**Files:**
- Create: `lib/captureQueue.ts`, `lib/pickers.ts`, `lib/readFailures.ts`
- Modify: `lib/scanFlow.ts`. It uses the pickers, and `photoFailed`, `pdfFailed`, `failureDialog`, `PDF_REFUSED` and `scannerFailed` move into `lib/readFailures.ts`. Its behaviour doesn't change.
- Modify: `lib/startup.ts` (`setStarted`, `useStarted`) and `app/_layout.tsx`.
  - On mount, the layout runs `setStarted(false)`.
  - In `onReady`, it runs `setStarted(true)` and `void resumeQueue()`.
- Test: `__tests__/captureQueue.test.ts` (new), `__tests__/rootLayout.test.tsx`
- Test: `__tests__/scanFlow.test.ts` and `__tests__/pdfFlow.test.tsx`. They pass unchanged, apart from `failureDialog`'s import.

**Interfaces:**
- Consumes:
  - `takeCapture`, `touchSession`, `addFailedRead` (Task 2);
  - `addScan`, `scansWritten`, `deleteScan`, `getScan` (Task 2);
  - `scanPhoto`, `readPdf`, `releaseAccess` (modules/scanner).
- Produces:

```ts
// lib/readFailures.ts
export function photoFailed(e: unknown): string;   // today's dialog words, moved
export function pdfFailed(e: unknown): string;     // today's, moved
export function failureDialog(words: string): [title: string, message?: string]; // today's, moved
export function failedReadReason(kind: 'photo' | 'pdf', e: unknown): string;
// "It isn't a photo the scanner can open." (ERR_UNREADABLE_IMAGE) | a pdf_* refusal's words (PDF_REFUSED) | "The scanner stopped while reading it."
// lib/pickers.ts
export function pickPhoto(): Promise<string | null>;  // the gallery: the picker's copy in the app's cache; null if cancelled; throws if the picker fails
export function cameraAppPhoto(): Promise<string | null | 'no_permission'>;
export type PickedPdf = { uri: string; name: string | null };
export function pickPdf(): Promise<PickedPdf | 'not_pdf' | null>; // a file that isn't a PDF has its access given up already
export function letGoOfPdf(uri: string): void;    // after its read: a file:// copy deleted, a content:// access given up
// lib/captureQueue.ts
export const READ_WHILE_SHOOTING: boolean = true; // spec §5: approach 1. false is approach 2: the camera holds reads while it's live
export type Capture = {
  key: string; session: string; at: Date; kind: 'photo' | 'pdf';
  uri: string; // a photo's file in files/queue/<session>/ (or where it was, if it couldn't move); a PDF's picked uri
  source: ScanSource; testImage: boolean; name: string | null; replaces: string | null; reading: boolean;
};
export function queuePhoto(from: string, p: { session: string; source: 'camera' | 'gallery' | 'camera_app'; testImage?: boolean; replaces?: string | null }, at: Date): Promise<void>;
export function queuePdf(pdf: PickedPdf, p: { session: string; replaces?: string | null }, at: Date): void;
export function captures(): readonly Capture[];   // waiting and reading, oldest first; replaced, never changed in place
export function subscribeQueue(listener: () => void): () => void;
export function pendingIn(session: string): number;
export function whenRead(session: string): Promise<void>; // once none of that session's captures waits or reads
export function holdReads(held: boolean): void;
export function resumeQueue(): Promise<void>;     // at start: what's left in files/queue, oldest first; idempotent
export function queuedName(at: Date, seq: number, source: 'camera' | 'gallery' | 'camera_app', testImage: boolean, ext: string): string;
// `${at.getTime()}-${seq}-${source}${testImage ? '-test' : ''}.${ext}`
export function parseQueuedName(name: string): { at: Date; seq: number; source: 'camera' | 'gallery' | 'camera_app'; testImage: boolean } | null;
// lib/startup.ts
export function setStarted(started: boolean): void; // the splash has gone (true), or a new root shows it (false)
export function useStarted(): boolean;
```

**The rules** (spec §6.3, calls 4 and 5):
- **`queuePhoto`:**
  - It takes the next `seq` at once, so the reading order is the call order.
  - Then it moves `from` (a `file://` in the app's cache: the camera's capture, or a picker's copy) to `files/queue/<session>/<queuedName(…)>`, keeping `from`'s extension. A move that fails reads the photo where it is.
- **Reading** goes one capture at a time, in `(at, seq)` order, unless held:
  - A photo goes through `scanPhoto(uri, { deletePhoto: false })`, and a PDF through `readPdf(uri)`.
  - Then `addScan({ label, source, result, testImage, session })`. In the same tick, the capture leaves `captures()`.
  - Then `touchSession`, and a `replaces` scan that's still unsaved is deleted (`deleteScan`).
  - The photo's file is deleted once `scansWritten()` resolves. A PDF runs `letGoOfPdf(uri)` in a `finally`.
  - A form not found is a scan like any other.
- **Labels** are today's:
  - camera and camera app: "Camera photo";
  - gallery: "Photo from gallery";
  - a PDF: `PDF: ${name}`, or "PDF".
- **A read that throws:**
  - `addFailedRead(session, failedReadReason(kind, e), new Date())`;
  - the photo is deleted;
  - the next capture goes on;
  - no dialog, and nothing is logged.
- **`resumeQueue`:**
  - It lists `files/queue/<session>/`, and skips a file that's already queued (by uri).
  - It parses each name. A name it can't read is a camera photo, read after the others.
  - It removes empty folders.
- **`holdReads(true)`:** no new read starts; one under way finishes.

- [ ] **Step 1: Write the failing tests.**

  `__tests__/captureQueue.test.ts`. Use `memoryFs` and `pinToday`, with modules/scanner mocked: each read is a deferred promise.
  - `"a photo moves into files/queue/<session>/ before it's read, named by its time, its place and its source"`: `parseQueuedName(queuedName(at, 3, 'gallery', true, 'png'))` round-trips.
  - `"one at a time, in the order taken, through the camera's read path"`:
    - with two queued, `scanPhoto` is called once until the first settles;
    - its call is `(<the queued uri>, { deletePhoto: false })`.
  - `'a read keeps its scan in its session, then deletes the photo once recent.json has it'` (Review Focus 1):
    - `recentScans()[0]` has `session` 'S', label 'Camera photo' and `testImage` true;
    - the queued file still exists until `scansWritten()` resolves, and then it's gone;
    - `captures()` is empty.
  - `'a form not found is a scan like any other'`.
  - `"a read that fails is the session's failed read, in plain words, and the photo goes"`:
    - `{ code: 'ERR_UNREADABLE_IMAGE' }` gives the reason "It isn't a photo the scanner can open.";
    - an `Error('boom')` gives "The scanner stopped while reading it.", with no 'boom' anywhere in `session.json`;
    - `Alert.alert` isn't called.
  - `'Retake: the new scan replaces the unsaved one once it reads; a failed read keeps it; a saved one is never replaced'`.
  - `"a PDF waits in memory, is read through readPdf, then the picker's access is given up"`:
    - its scan has the label 'PDF: a.pdf' and source 'pdf';
    - `releaseAccess` is called for a `content://` uri;
    - a `pdf_password` refusal gives the reason 'That PDF has a password. Save a copy without one, then import it.'.
  - `"at start, what's left in files/queue is read into its sessions, oldest first; a second resume adds nothing"` (Review Focus 1):
    - two folders and three files; `resumeQueue()` runs twice;
    - `scanPhoto` is called three times, in time order;
    - the scans carry their folders' session ids, and `testImage` comes from the name.
  - `"a photo that can't be moved is read where it is"`.
  - `'whenRead waits for its own session only'`.
  - `'held, no new read starts until it lets go (approach 2)'`.
  - `"failedReadReason never holds the scanner's own message, in a team build too"`.

  `__tests__/rootLayout.test.tsx`:
  - `'once the splash has gone, the app is started and the queue resumes'`. The BrandSplash mock calls `onReady`, and `resumeQueue` is mocked: it's called once, and `useStarted()` is true.

- [ ] **Step 2: Run** `npx jest __tests__/captureQueue.test.ts __tests__/rootLayout.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement.**
  - Move the failure words into `lib/readFailures.ts`, and the pickers out of `useScanFlow` into `lib/pickers.ts`. `useScanFlow` uses both, with its behaviour as it is.
  - Then build the queue.

- [ ] **Step 4: Run** `npm test` and the gates. `scanFlow.test.ts`, `pdfFlow.test.tsx`, `home.test.tsx` and `result.test.tsx` pass unchanged, apart from `failureDialog`'s import. Expected: PASS.

- [ ] **Step 5: Commit** with the message `feat(app): photos wait in files/queue and are read one at a time into their session; the pickers apart from reading`.

---

