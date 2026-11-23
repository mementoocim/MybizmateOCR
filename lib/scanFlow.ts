import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { useIsFocused, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';

import { displayName, readPdf, releaseAccess, scanPhoto, type ScanResult } from '../modules/scanner';
import { useGoBackOrHome } from './navigation';
import { SAMPLES, sampleUri } from './samples';
import { addScan, type ScanSource, type StoredScan } from './scans';

// testImage: a photo from the camera's test hook (development builds), kept marked so it never becomes training data
type ReadOptions = { sampleId?: string; deletePhoto?: boolean; replace?: boolean; testImage?: boolean };

const codeOf = (e: unknown) => (e as { code?: string } | null)?.code ?? '';

/** The scanner's own failure (closed, or its model didn't load), naming what it was reading, with its message. */
function scannerFailed(what: 'photo' | 'PDF', e: unknown): string {
  return `Couldn't read that ${what}: ${(e as { message?: string } | null)?.message ?? String(e)}`;
}

function photoFailed(e: unknown): string {
  return codeOf(e) === 'ERR_UNREADABLE_IMAGE'
    ? "Couldn't read that photo: This file isn't a photo the scanner can open."
    : scannerFailed('photo', e);
}

// readPdf's refusals (its pdf_* codes), in plain words.
const PDF_REFUSED: Record<string, string> = {
  pdf_too_big: 'That PDF is over 20 MB. Choose a smaller file.',
  pdf_password: 'That PDF has a password. Save a copy without one, then import it.',
  pdf_broken: "Couldn't read that PDF.",
  pdf_unreadable: "Couldn't read that PDF.",
  pdf_page_too_big: "That PDF's page is too big to read.",
};

/** A refused PDF in plain words. Any other failure is the scanner's own, so it isn't put on the PDF. */
function pdfFailed(e: unknown): string {
  const code = codeOf(e);
  return code.startsWith('pdf_') ? (PDF_REFUSED[code] ?? PDF_REFUSED.pdf_unreadable) : scannerFailed('PDF', e);
}

const PDF_TYPE = 'application/pdf';

/** A PDF by its name (as its app gives it; there may be none) or by the type the phone gives it. */
function isPdf(name: string | null, type: string | null): boolean {
  const mime = (type ?? '').split(';')[0].trim().toLowerCase();
  return (name ?? '').toLowerCase().endsWith('.pdf') || mime === PDF_TYPE;
}

/**
 * A failure's words as Alert.alert's arguments: the reason as the title, then what to do as the message (ruling
 * T16-1), since Android stops a dialog's title at two lines with an ellipsis. The words are today's, split at the
 * colon after "Couldn't read that photo" (or PDF) or at the end of the first sentence, whichever comes first. A full
 * stop, "?" or "!" ends a sentence only when a space and more words follow, so a file's name never splits. Words that
 * don't split are the title alone, exactly as one-argument Alert.alert sends them (ruling T16-1a): React Native shows
 * an empty title on Android as a blank, focusable heading.
 */
export function failureDialog(words: string): [title: string, message?: string] {
  const split = /: |[.?!] (?=\S)/.exec(words);
  if (!split) return [words];
  const reasonEnd = split[0] === ': ' ? split.index : split.index + 1; // a sentence keeps its full stop; a colon goes
  return [words.slice(0, reasonEnd), words.slice(split.index + split[0].length)];
}

/** A failure that stops a capture, said in a dialog (design B §9.2, the plan's call 16). */
function sayWhy(words: string): void {
  Alert.alert(...failureDialog(words));
}

/** The picker's own copy of a file, once it has been read. */
function deleteCopy(file: File): void {
  try {
    file.delete();
  } catch {
    // already gone
  }
}

/**
 * Getting a photo or a PDF read: from the camera, the phone's camera app, the gallery, a sample or the file picker,
 * then on to its result. One at a time: while one is being picked or read (busy), another does nothing. While one is
 * read, readingWhat says what it is (a photo, a sample's too, or a PDF), for the reading card. A failure that stops a
 * capture is said in a dialog, in today's words (sayWhy).
 */
export function useScanFlow() {
  const router = useRouter();
  const goBackOrHome = useGoBackOrHome();
  const busyRef = useRef(false);
  const leaving = useRef(false); // set at once, so a second Retake is refused before the screen has gone
  const [busy, setBusy] = useState(false);
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
      async () => {
        const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
        return picked.canceled ? null : picked.assets[0].uri;
      },
      'Photo from gallery',
      'gallery',
      { ...opts, deletePhoto: true }, // the picker's copy in the app's cache; the person's photo is never deleted
      "Couldn't open that photo.",
    );
  }

  async function fromCameraApp(opts: { replace?: boolean } = {}): Promise<void> {
    await run(
      async () => {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          sayWhy('The camera app needs the camera permission too. Choose a photo from the gallery instead.');
          return null;
        }
        const taken = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
        return taken.canceled ? null : taken.assets[0].uri;
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
   * A PDF from the system's file picker, its page 1 read, labelled with the file's name. Android's picker hands over
   * the person's own file: a content:// link, which the scanner reads through a copy of its own and never changes; the
   * picker's lasting access to it is given up afterwards (readPdf does it too, once it has read it). iOS's picker opens
   * a copy in the app's temporary folder (a file://), deleted once it has been read.
   */
  async function fromPdf(opts: { replace?: boolean } = {}): Promise<void> {
    await oneAtATime(async () => {
      const picked = await File.pickFileAsync({ mimeTypes: [PDF_TYPE] });
      if (picked.canceled) return;
      const file = picked.result;
      try {
        // the name its app gives: a link's own last segment can be an id (Android's Downloads: …/document/msf%3A54)
        const name = await displayName(file.uri).catch(() => null);
        if (!isPdf(name, file.type)) {
          sayWhy('Choose a PDF file.');
          return;
        }
        const scan = { label: name ? `PDF: ${name}` : 'PDF', source: 'pdf' } as const;
        await readAndOpen(() => readPdf(file.uri), scan, opts.replace, pdfFailed, 'pdf');
      } finally {
        // giving up the access is no part of the read: nothing waits for it, and its failure changes nothing
        if (file.uri.startsWith('file://')) deleteCopy(file);
        else void releaseAccess(file.uri).catch(() => undefined);
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
    const back = openedFromRecent || scan.source === 'sample';
    if (back || scan.source === 'camera') {
      if (leaving.current) return;
      leaving.current = true;
      if (back) goBackOrHome();
      else router.replace('/camera');
      return;
    }
    if (scan.source === 'camera_app') return fromCameraApp({ replace: true });
    if (scan.source === 'pdf') return fromPdf({ replace: true });
    return fromGallery({ replace: true });
  }

  const reading = readingWhat !== null;
  return { busy, reading, readingWhat, scanUri, fromGallery, fromCameraApp, fromSample, fromPdf, retake };
}
