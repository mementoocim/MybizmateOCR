import { useIsFocused, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';

import { readPdf, scanPhoto, type ScanResult } from '../modules/scanner';
import { useGoBackOrHome } from './navigation';
import { cameraAppPhoto, letGoOfPdf, pickPdf, pickPhoto } from './pickers';
import { failureDialog, pdfFailed, photoFailed } from './readFailures';
import { SAMPLES, sampleUri } from './samples';
import { addScan, type ScanSource, type StoredScan } from './scans';

// testImage: a photo from the camera's test hook (development builds), kept marked so it never becomes training data
type ReadOptions = { sampleId?: string; deletePhoto?: boolean; replace?: boolean; testImage?: boolean };

/**
 * Getting a photo or a PDF read: from the camera, the phone's camera app, the gallery, a sample or the file picker,
 * then on to its result. One at a time: while one is being picked or read (busy), another does nothing. While one is
 * read, readingWhat says what it is (a photo, a sample's too, or a PDF), for the reading card. A failure that stops a
 * capture is said in a dialog, in plain words (sayWhy): the scanner's own message shows in team builds only. From the
 * failure until the dialog's OK, or its dismissal, sayingWhy is true: the camera stays off behind it.
 */
export function useScanFlow() {
  const router = useRouter();
  const goBackOrHome = useGoBackOrHome();
  const busyRef = useRef(false);
  const leaving = useRef(false); // set at once, so a second Retake is refused before the screen has gone
  const [busy, setBusy] = useState(false);
  const [sayingWhy, setSayingWhy] = useState(false);
  const [readingWhat, setReading] = useState<'photo' | 'pdf' | null>(null);
  // false once the screen is left: a read that ends after that is kept in Recent scans, and nothing opens.
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

  /**
   * A failure that stops a capture, said in a dialog (design B §9.2, the plan's call 16), with Android's one OK. It's
   * up until that OK, or its dismissal: the camera stays off meanwhile, as Auto would take another photo behind it (the
   * final review's Minor 5).
   */
  function sayWhy(words: string): void {
    const [title, message] = failureDialog(words);
    const closed = () => setSayingWhy(false);
    setSayingWhy(true);
    Alert.alert(title, message, [{ text: 'OK', onPress: closed }], { onDismiss: closed });
  }

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

  /** Reads it, keeps it in Recent scans and opens its result. A failure is told in its own words. */
  async function readAndOpen(
    read: () => Promise<ScanResult>,
    scan: Pick<StoredScan, 'label' | 'source' | 'sampleId' | 'testImage'>,
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
      if (replace) router.replace(target);
      else router.push(target);
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
        { label, source, sampleId: opts.sampleId, testImage: opts.testImage },
        opts.replace,
        photoFailed,
        'photo',
      );
    });
  }

  /** Reads a photo the app already has; false when another one was being picked or read, so this one wasn't. */
  function scanUri(uri: string, label: string, source: ScanSource, opts: ReadOptions = {}): Promise<boolean> {
    return run(async () => uri, label, source, opts, "Couldn't open the photo.");
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
   * Retake: the same source again (for a PDF, the picker again); back after a sample or a scan opened from Home's
   * Recent scans or Saved (Home when there's nothing to go back to: useGoBackOrHome). Going back, or to the camera,
   * leaves the screen at once, and runs once (ruling T25b-2), as the header's Back and the camera's Close do: going
   * back queues a GO_BACK per call, so a fast double tap would leave the screen under this one too. A picker can run
   * again once it's done (oneAtATime).
   */
  async function retake(scan: StoredScan, openedFromRecent: boolean): Promise<void> {
    if (openedFromRecent || scan.source === 'sample') return leaveOnce(goBackOrHome);
    if (scan.source === 'camera') return toCamera();
    if (scan.source === 'camera_app') return fromCameraApp({ replace: true });
    if (scan.source === 'pdf') return fromPdf({ replace: true });
    return fromGallery({ replace: true });
  }

  /**
   * The in-app camera in this screen's place, once (ruling T25b-2): a Retake straight from the camera, and the
   * not-found layout's Retake for a gallery photo or a PDF (the final review's Minor 2).
   */
  function toCamera(): void {
    leaveOnce(() => router.replace('/camera'));
  }

  /** Leaves the screen, once: a second tap before it has gone does nothing. */
  function leaveOnce(leave: () => void): void {
    if (leaving.current) return;
    leaving.current = true;
    leave();
  }

  const reading = readingWhat !== null;
  return {
    busy,
    sayingWhy,
    reading,
    readingWhat,
    scanUri,
    fromGallery,
    fromCameraApp,
    fromSample,
    fromPdf,
    retake,
    toCamera,
  };
}
