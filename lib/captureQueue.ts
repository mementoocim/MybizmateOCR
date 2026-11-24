import { Directory, File, Paths } from 'expo-file-system';

import { readPdf, scanPhoto, type ScanResult } from '../modules/scanner';
import { letGoOfPdf, type PickedPdf } from './pickers';
import { failedReadReason, SCANNER_STOPPED } from './readFailures';
import { addScan, deleteScan, recentScans, type ScanSource, scansWritten } from './scans';
import { addFailedRead, touchSession } from './session';

// The capture queue (spec §6.3, the plan's calls 4, 5 and 21): what the camera tab took, waiting to be read. A photo
// (the camera's, the camera app's or a gallery pick) moves out of the app's cache, which the scanner clears at every
// start, into files/queue/<session id>/, named by when it was taken, its place in the order and its source
// (queuedName), so a closed app loses none: the next start reads them (resumeQueue). A PDF is the person's own file:
// it waits in memory, and nothing of it is copied here.
//
// Reads go one at a time, in the order taken, through the camera's read path (scanPhoto, readPdf). Each is kept as a
// scan in its session, as of when it was taken (ruling P-F2); a Retake's new scan replaces the unsaved one it was taken
// for once its form was found (ruling T7-3). A read that throws is the session's failed read, in plain words only (lib/readFailures), with no dialog and
// nothing logged. A photo is deleted once recent.json holds its scan, or once its read has failed; when recent.json
// can't be written, it stays for the next start (ruling T2-2), and a scan recent.json already holds is never read twice
// (ruling P-F2). Review Focus 1.

/**
 * Approach 1 (spec §5): the queue reads while the camera shoots. false is approach 2: the camera holds the reads
 * (holdReads) while it's live. Task 14 sets it from the measurement.
 */
export const READ_WHILE_SHOOTING: boolean = true;

type PhotoSource = 'camera' | 'gallery' | 'camera_app';

export type Capture = {
  key: string;
  session: string;
  at: Date; // when it was taken
  kind: 'photo' | 'pdf';
  uri: string; // a photo's file in files/queue/<session>/ (or where it was, if it couldn't move); a PDF's picked uri
  source: ScanSource;
  testImage: boolean;
  name: string | null; // a PDF's file name, as its app gives it
  replaces: string | null; // Retake: the unsaved scan its scan replaces
  reading: boolean;
};

/**
 * A capture, with its place in the reading order, whether its photo has landed where it's read from, and where in
 * files/queue it's moving to: a move is async, so the file can be there before the move resolves (ruling T3-2).
 */
type Entry = { capture: Capture; order: readonly [at: number, seq: number]; ready: boolean; target: string | null };

let entries: Entry[] = []; // in the reading order
let list: readonly Capture[] = []; // replaced, never changed in place: the tray subscribes to it
let seq = 0; // the order captures were queued in
let keys = 0;
let held = false;
let busy = false; // a read is under way
const listeners = new Set<() => void>();
const waiters: { session: string; resolve: () => void }[] = [];
const settling = new Set<string>(); // photos read, waiting for recent.json to hold their scans
const keptBack = new Set<string>(); // photos whose scans recent.json couldn't hold: the next start has them (T2-2)
const unkept = new Set<string>(); // photos read whose scans couldn't be kept: only the next start reads them (T3-3)

const QUEUE = 'queue';
const SOURCES: readonly PhotoSource[] = ['camera', 'gallery', 'camera_app'];
/** A session id as a folder's name (lib/session's newSessionId): nothing that could reach another folder. */
const FOLDER_NAME = /^[A-Za-z0-9_-]+$/;
const NAME = /^(\d+)-(\d+)-(camera|gallery|camera_app)(-test)?\.([A-Za-z0-9]+)$/;

/** A queued photo's name: `<ms>-<seq>-<source>[-test].<ext>`, so a start knows each one's time, place and kind. */
export function queuedName(at: Date, n: number, source: PhotoSource, testImage: boolean, ext: string): string {
  return `${at.getTime()}-${n}-${source}${testImage ? '-test' : ''}.${ext}`;
}

/** What a queued photo's name says; null for a name the queue didn't give. */
export function parseQueuedName(
  name: string,
): { at: Date; seq: number; source: PhotoSource; testImage: boolean } | null {
  const match = NAME.exec(name);
  if (!match) return null;
  const at = new Date(Number(match[1]));
  if (Number.isNaN(at.getTime())) return null;
  const source = SOURCES.find((s) => s === match[3]);
  if (!source) return null;
  return { at, seq: Number(match[2]), source, testImage: match[4] !== undefined };
}

function changed(): void {
  list = entries.map((e) => e.capture);
  listeners.forEach((listener) => listener());
  for (const waiter of [...waiters]) {
    if (pendingIn(waiter.session) > 0) continue;
    waiters.splice(waiters.indexOf(waiter), 1);
    waiter.resolve();
  }
}

/** Waiting and reading, oldest first. */
export function captures(): readonly Capture[] {
  return list;
}

/** For useSyncExternalStore: called after each change to the captures. */
export function subscribeQueue(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** How many of the session's captures wait or are being read. */
export function pendingIn(session: string): number {
  return entries.filter((e) => e.capture.session === session).length;
}

/** Resolves once none of the session's captures waits or is being read (Done waits for it). */
export function whenRead(session: string): Promise<void> {
  if (pendingIn(session) === 0) return Promise.resolve();
  return new Promise((resolve) => waiters.push({ session, resolve }));
}

/** Held, no new read starts; one under way finishes (approach 2). Let go, the next one starts. */
export function holdReads(hold: boolean): void {
  held = hold;
  if (!hold) next();
}

const before = (a: Entry['order'], b: Entry['order']) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);

/** Puts a capture in its place in the reading order: after every one taken before it, or at the same time. */
function add(capture: Omit<Capture, 'key' | 'reading'>, order: Entry['order'], ready: boolean): Entry {
  const entry: Entry = { capture: { ...capture, key: `c${++keys}`, reading: false }, order, ready, target: null };
  const at = entries.findIndex((e) => !e.capture.reading && before(order, e.order));
  entries = at < 0 ? [...entries, entry] : [...entries.slice(0, at), entry, ...entries.slice(at)];
  return entry;
}

function update(entry: Entry, change: Partial<Capture>): void {
  entry.capture = { ...entry.capture, ...change };
  changed();
}

function remove(entry: Entry): void {
  entries = entries.filter((e) => e !== entry);
  changed();
}

function deleteFile(uri: string): void {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // already gone, or the next start has it
  }
}

const extensionOf = (uri: string): string => /\.([A-Za-z0-9]+)$/.exec(uri.replace(/[?#].*$/, ''))?.[1] ?? 'jpg';

/**
 * Moves a photo into files/queue/<session>/ under the name given, its destination on the entry before the move starts;
 * its new uri, or null when it couldn't move.
 */
async function moveIn(entry: Entry, from: string, session: string, name: string): Promise<string | null> {
  try {
    if (!FOLDER_NAME.test(session)) return null;
    const folder = new Directory(Paths.document, QUEUE, session);
    const to = new File(folder, name);
    entry.target = to.uri;
    if (!folder.exists) folder.create({ intermediates: true });
    await new File(from).move(to);
    return to.uri;
  } catch {
    entry.target = null;
    return null; // it's read where it is
  }
}

/**
 * A photo taken (the camera's capture, or a picker's copy, in the app's cache): it waits in the session's queue, in the
 * order of the calls. It resolves once the photo has moved into files/queue, or couldn't, and is read where it is.
 */
export async function queuePhoto(
  from: string,
  p: { session: string; source: PhotoSource; testImage?: boolean; replaces?: string | null },
  at: Date,
): Promise<void> {
  const n = ++seq; // its place, at once: the reading order is the call order
  const testImage = p.testImage ?? false;
  const replaces = p.replaces ?? null;
  const entry = add(
    { session: p.session, at, kind: 'photo', uri: from, source: p.source, testImage, name: null, replaces },
    [at.getTime(), n],
    false,
  );
  changed();
  const moved = await moveIn(entry, from, p.session, queuedName(at, n, p.source, testImage, extensionOf(from)));
  entry.ready = true;
  if (moved !== null) update(entry, { uri: moved });
  next();
}

/** A PDF picked: it waits in memory, as the person's own file, and its access is given up once it has been read. */
export function queuePdf(pdf: PickedPdf, p: { session: string; replaces?: string | null }, at: Date): void {
  const replaces = p.replaces ?? null;
  add(
    { session: p.session, at, kind: 'pdf', uri: pdf.uri, source: 'pdf', testImage: false, name: pdf.name, replaces },
    [at.getTime(), ++seq],
    true,
  );
  changed();
  next();
}

/** Today's labels. */
function labelOf(c: Capture): string {
  if (c.kind === 'pdf') return c.name ? `PDF: ${c.name}` : 'PDF';
  return c.source === 'gallery' ? 'Photo from gallery' : 'Camera photo';
}

/** The next read, unless one is under way or reads are held. The oldest waits until its photo has landed. */
function next(): void {
  if (busy || held) return;
  const entry = entries[0];
  if (!entry || !entry.ready) return;
  busy = true;
  update(entry, { reading: true });
  void read(entry).catch(() => {}); // it never throws: each step that can is caught where it is
}

async function read(entry: Entry): Promise<void> {
  const c = entry.capture;
  try {
    let result: ScanResult;
    try {
      result = c.kind === 'photo' ? await scanPhoto(c.uri, { deletePhoto: false }) : await readPdf(c.uri);
    } catch (e: unknown) {
      remove(entry);
      addFailedRead(c.session, failedReadReason(c.kind, e), new Date());
      if (c.kind === 'photo') deleteFile(c.uri); // a failed read keeps no scan, and a Retake's old one stays
      return;
    } finally {
      if (c.kind === 'pdf') letGoOfPdf(c.uri);
    }
    // a form not found is a scan like any other: it has its Retake
    try {
      addScan({ label: labelOf(c), source: c.source, result, testImage: c.testImage, session: c.session, at: c.at });
    } catch {
      // it couldn't be kept: it leaves the queue, and its photo stays for the next start to read (ruling T3-3). The
      // session shows it as a failed read, so it's never just gone from the tray (ruling T7-1); a Retake's old scan
      // stays, as after any failed read.
      remove(entry);
      addFailedRead(c.session, SCANNER_STOPPED, new Date());
      if (c.kind === 'photo') unkept.add(c.uri);
      return;
    }
    remove(entry); // in the same tick: the tray never shows it twice
    touchSession(c.session, new Date());
    // a Retake replaces its scan only with one whose form was found: a new one that wasn't is a retake beside it, and
    // never costs the person a scan they could use (ruling T7-3)
    if (c.replaces !== null && result.aligned) {
      try {
        deleteScan(c.replaces);
      } catch {
        // saved (it's never replaced), or its folder couldn't go: it stays, and so does the new one
      }
    }
    if (c.kind === 'photo') void letGo(c.uri);
  } finally {
    busy = false;
    next();
  }
}

/**
 * A read photo goes once recent.json holds its scan. When it can't be written, the photo stays for the next start,
 * which reads it again (ruling T2-2); a later write that lands holds that scan too, so the photo goes then.
 */
async function letGo(uri: string): Promise<void> {
  settling.add(uri);
  const written = await scansWritten();
  settling.delete(uri);
  if (!written) {
    keptBack.add(uri);
    return;
  }
  deleteFile(uri);
  for (const kept of [...keptBack]) {
    keptBack.delete(kept);
    deleteFile(kept);
  }
}

/** A photo of this session whose scan is kept already: the app was killed before the photo went (ruling P-F2). */
const alreadyRead = (session: string, at: Date) =>
  recentScans().some((s) => s.session === session && s.source !== 'pdf' && s.at.getTime() === at.getTime());

/**
 * At start, once the recent scans are loaded: what's left in files/queue, read into its sessions, oldest first. A name
 * the queue didn't give is a camera photo, read after the others. A photo already queued, or read and waiting to go, is
 * skipped, so it's idempotent, as is one still moving in (ruling T3-2); one whose scan is kept already goes (ruling
 * P-F2). An empty folder goes, unless a photo is moving into it.
 */
export async function resumeQueue(): Promise<void> {
  const moving = entries.flatMap((e) => (e.target !== null ? [e.target] : []));
  const known = new Set([...entries.map((e) => e.capture.uri), ...moving, ...settling, ...keptBack, ...unkept]);
  const found: { session: string; uri: string; name: string; parsed: ReturnType<typeof parseQueuedName> }[] = [];
  try {
    const root = new Directory(Paths.document, QUEUE);
    if (!root.exists) return;
    for (const folder of root.list()) {
      if (!(folder instanceof Directory)) continue;
      const files = folder.list();
      if (files.length === 0) {
        const base = folder.uri.endsWith('/') ? folder.uri : `${folder.uri}/`;
        if (!moving.some((target) => target.startsWith(base))) folder.delete(); // not one a photo is moving into
        continue;
      }
      for (const file of files) {
        if (!(file instanceof File) || known.has(file.uri)) continue;
        const parsed = parseQueuedName(file.name);
        if (parsed && alreadyRead(folder.name, parsed.at)) deleteFile(file.uri);
        else found.push({ session: folder.name, uri: file.uri, name: file.name, parsed });
      }
    }
  } catch {
    // what it found so far is read; the rest waits for the next start
  }
  if (found.length === 0) return;
  const orderOf = (f: (typeof found)[number]) => (f.parsed ? f.parsed.at.getTime() : Infinity);
  const seqOf = (f: (typeof found)[number]) => f.parsed?.seq ?? 0;
  found.sort((a, b) => orderOf(a) - orderOf(b) || seqOf(a) - seqOf(b) || (a.name < b.name ? -1 : 1));
  const now = new Date();
  found.forEach((f, i) => {
    if (f.parsed) seq = Math.max(seq, f.parsed.seq); // a photo taken now never takes a name that's there
    add(
      {
        session: f.session,
        at: f.parsed?.at ?? now,
        kind: 'photo',
        uri: f.uri,
        source: f.parsed?.source ?? 'camera',
        testImage: f.parsed?.testImage ?? false,
        name: null,
        replaces: null,
      },
      f.parsed ? [f.parsed.at.getTime(), f.parsed.seq] : [Infinity, i],
      true,
    );
  });
  changed();
  next();
}
