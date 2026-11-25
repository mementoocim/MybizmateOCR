import { useIsFocused, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { readPdf, scanPhoto, type ScanResult } from '../modules/scanner';
import { type OpenOnce, useGoBackOrHome, useOpenOnce } from './navigation';
import { cameraAppPhoto, letGoOfPdf, pickPdf, pickPhoto } from './pickers';
import { pdfFailed, photoFailed, useSayWhy } from './readFailures';
import { SAMPLES, sampleUri } from './samples';
import { addScan, type ScanSource, type StoredScan } from './scans';
import { retakeIn } from './session';

type ReadOptions = { sampleId?: string; deletePhoto?: boolean; replace?: boolean };

/**
 * Getting a photo or a PDF read straight away: a sample, or a Retake's pick from the Scan screen (the phone's camera
 * app, the gallery or the file picker), then on to its result. The camera tab doesn't read here: its captures go to
 * the queue (lib/captureQueue). One at a time: while one is being picked or read (busy), another does nothing. While
 * one is read, readingWhat says what it is (a photo, a sample's too, or a PDF), for the reading card. A failure that
 * stops a capture is said in a dialog, in plain words (lib/readFailures' useSayWhy, with sayingWhy while it's up): the
 * scanner's own message shows in team builds only. The result opening, and a Retake that leaves the screen,
 * go through the screen's one guard when it gives it (lib/navigation's useOpenOnce: the Scan screen's, which its Next
 * invoice shares; Home's, which its cards share), else its own.
 */
export function useScanFlow(shared?: OpenOnce) {
  const router = useRouter();
  const goBackOrHome = useGoBackOrHome();
  const own = useOpenOnce();
  const open = shared ?? own; // set at once, so a second Retake is refused before the screen has gone
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const { sayWhy, sayingWhy } = useSayWhy();
  const [readingWhat, setReading] = useState<'photo' | 'pdf' | null>(null);
  // false once the screen is left: a read that ends after that is kept with the recent scans, and nothing opens.
  const focused = useIsFocused();
  const here = useRef(true);
  useEffect(() => {
    here.current = focused;
  }, [focused]);
  useEffect(
    () => () => {
      here.current = false;
    },
    [],
  );

  /** One pick and read; false when another was under way, so this one wasn't started. */
  async function oneAtATime(task: () => Promise<void>): Promise<boolean> {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    try {
      await task();
    } finally {
      setReading(null);
      setBusy(false);
      busyRef.current = false;
    }
    return true;
  }

  /** Reads it, keeps it with the recent scans and opens its result. A failure is told in its own words. */
  async function readAndOpen(
    read: () => Promise<ScanResult>,
    scan: Pick<StoredScan, 'label' | 'source' | 'sampleId'>,
    replace: boolean | undefined,
    failed: (e: unknown) => string,
    what: 'photo' | 'pdf',
  ): Promise<void> {
    setReading(what);
    try {
      const result = await read();
      const id = addScan({ ...scan, result });
      if (!here.current) return;
      const target = { pathname: '/result', params: { id } } as const;
      if (replace) open.replace(target);
      else open.push(target);
    } catch (e: unknown) {
      sayWhy(failed(e));
    }
  }

  /** False when another photo was being picked or read, so this one wasn't taken. */
  function run(getUri: () => Promise<string | null>, label: string, source: ScanSource, opts: ReadOptions,
               openError: string): Promise<boolean> {
    return oneAtATime(async () => {
      let uri: string | null;
      try {
        uri = await getUri();
      } catch {
        sayWhy(openError);
        return;
      }
      if (!uri) return;
      const photo = uri;
      await readAndOpen(
        () => scanPhoto(photo, { deletePhoto: opts.deletePhoto ?? false }),
        { label, source, sampleId: opts.sampleId },
        opts.replace,
        photoFailed,
        'photo',
      );
    });
  }

  async function fromGallery(opts: { replace?: boolean } = {}): Promise<void> {
    await run(
      pickPhoto,
      'Photo from gallery',
      'gallery',
      { ...opts, deletePhoto: true }, // the picker's copy in the app's cache; the person's photo is never deleted
      "Couldn't open that photo.",
    );
  }

  async function fromCameraApp(opts: { replace?: boolean } = {}): Promise<void> {
    await run(
      async () => {
        const taken = await cameraAppPhoto();
        if (taken === 'no_permission') {
          sayWhy('The camera app needs the camera permission too. Choose a photo from the gallery instead.');
          return null;
        }
        return taken;
      },
      'Camera photo',
      'camera_app',
      { ...opts, deletePhoto: true },
      "Couldn't open that photo.",
    );
  }

  async function fromSample(id: string): Promise<void> {
    const label = SAMPLES.find((s) => s.id === id)?.label ?? id;
    await run(() => sampleUri(id), label, 'sample', { sampleId: id }, "Couldn't open that sample.");
  }

  /**
   * A PDF from the system's file picker (lib/pickers), its page 1 read, labelled with the file's name. Once it has been
   * read, the picker's copy goes, or its access to the person's file is given up (letGoOfPdf).
   */
  async function fromPdf(opts: { replace?: boolean } = {}): Promise<void> {
    await oneAtATime(async () => {
      const picked = await pickPdf();
      if (picked === null) return;
      if (picked === 'not_pdf') {
        sayWhy('Choose a PDF file.');
        return;
      }
      try {
        const scan = { label: picked.name ? `PDF: ${picked.name}` : 'PDF', source: 'pdf' } as const;
        await readAndOpen(() => readPdf(picked.uri), scan, opts.replace, pdfFailed, 'pdf');
      } finally {
        letGoOfPdf(picked.uri);
      }
    });
  }

  /**
   * Retake (the plan's call 16): back after a sample, or when the Scan screen says so (how.back: opened from a list, or
   * a saved scan from its session's screen; the camera when there's nothing to go back to: useGoBackOrHome). An
   * unsaved scan in a session: the camera, in that session, its next photo replacing this scan once it reads (lib/
   * session's retakeIn, run only when the camera opens). Else the same source again (for a PDF, the picker again).
   * Going back, or to the camera, leaves the screen at once, and runs once (ruling T25b-2), as the header's Back does:
   * going back queues a GO_BACK per call, so a fast double tap would leave the screen under this one too. A picker can
   * run again once it's done (oneAtATime).
   */
  async function retake(scan: StoredScan, how: { back: boolean; session: string | null }): Promise<void> {
    if (how.back || scan.source === 'sample') return leaveOnce(goBackOrHome);
    const session = how.session;
    if (session !== null && scan.saved === null) {
      // the camera's session only if the camera opens: a refused tap re-links nothing (as the session screen's Retake)
      return open.navigate('/camera', undefined, () => retakeIn(session, scan.id, new Date()));
    }
    if (scan.source === 'camera') return toCamera();
    if (scan.source === 'camera_app') return fromCameraApp({ replace: true });
    if (scan.source === 'pdf') return fromPdf({ replace: true });
    return fromGallery({ replace: true });
  }

  /**
   * Back to the camera tab, once (ruling T25b-2), this screen gone: a Retake straight from the camera, and the
   * not-found layout's Retake for a gallery photo or a PDF (the final review's Minor 2). The Scan screen is above the
   * tabs, so it's dismissTo: navigate would push a second tabs over the first (lib/navigation's useNavigateOnce).
   */
  function toCamera(): void {
    leaveOnce(() => router.dismissTo('/camera'));
  }

  /** Leaves the screen, once: a second tap before it has gone does nothing. */
  function leaveOnce(leave: () => void): void {
    open.leave(leave);
  }

  const reading = readingWhat !== null;
  return {
    busy,
    sayingWhy,
    reading,
    readingWhat,
    fromGallery,
    fromCameraApp,
    fromSample,
    fromPdf,
    retake,
    toCamera,
  };
}
