import type { ScanResult } from '../modules/scanner';
import { parseScanResult } from '../modules/scanner/src/parse';
import { coreJson } from '../test-utils/coreJson';
import { memoryFs } from '../test-utils/memoryFs';
import { pinToday } from '../test-utils/today';

// lib/captureQueue (spec §6.3, the plan's calls 4, 5 and 21): a session's photos wait in files/queue/<session id>/,
// and its PDFs in memory, until they're read, one at a time and in the order taken, through the camera's read path.
// Each read keeps its scan in its session, as of when it was taken; a read that fails is the session's failed read, in
// plain words, with no dialog. A photo is deleted only once recent.json holds its scan, or once its read has failed,
// and what a closed app left in files/queue is read at the next start, once (Review Focus 1, rulings P-F2 and T2-2).
// The scanner's reads are deferred promises here: each test settles them in turn.

let mockTeam = false;
type Read = { uri: string; resolve: (r: ScanResult) => void; reject: (e: unknown) => void };
const reads: Read[] = []; // the reads under way, oldest first
const mockScanPhoto = jest.fn();
const mockReadPdf = jest.fn();
const mockRelease = jest.fn();

jest.mock('../lib/build', () => ({
  get TEAM_BUILD() {
    return mockTeam;
  },
}));
jest.mock('../modules/scanner', () => ({
  scanPhoto: (uri: string, options: object) => mockScanPhoto(uri, options),
  readPdf: (uri: string) => mockReadPdf(uri),
  releaseAccess: (uri: string) => mockRelease(uri),
  displayName: jest.fn(),
}));
jest.mock('expo-image-picker', () => ({})); // no picker opens here (lib/pickers: home.test, pdfFlow.test)
jest.mock('expo-file-system', () => require('../test-utils/memoryFs').memoryFs.module);

const T = new Date(2026, 10, 24, 9, 41); // the first photo, at 9:41 AM
const at = (seconds: number) => new Date(T.getTime() + seconds * 1000);
const A = '1795000000000-ab12'; // lib/session's newSessionId
const B = '1795000600000-cd34';
const QUEUE = 'file:///docs/queue';
const RECENT = 'file:///docs/recent.json';
const SESSION_FILE = 'file:///docs/session.json';
const UNREADABLE = "It isn't a photo the scanner can open.";
const STOPPED = 'The scanner stopped while reading it.';
const PASSWORD = 'That PDF has a password. Save a copy without one, then import it.';
const LINK = 'content://com.android.providers.downloads.documents/document/msf%3A'; // Android's picker: the person's file

const flush = () => new Promise<void>((resolve) => setTimeout(() => resolve(), 0));

type Modules = {
  queue: typeof import('../lib/captureQueue');
  scans: typeof import('../lib/scans');
  session: typeof import('../lib/session');
  jsonFile: typeof import('../lib/jsonFile');
  fs: typeof import('expo-file-system'); // the memory file system lib/ uses, until the next reset
};
const load = (): Modules => ({
  queue: require('../lib/captureQueue'),
  scans: require('../lib/scans'),
  session: require('../lib/session'),
  jsonFile: require('../lib/jsonFile'),
  fs: require('expo-file-system'),
});
let m: Modules;

/** A photo the camera (or a picker) handed over, in the app's cache. */
function photo(name: string): string {
  const uri = `file:///cache/camera/${name}`;
  memoryFs.files.set(uri, 'jpeg');
  return uri;
}

/** What files/queue holds, each file by its place: <session>/<name>. */
const queued = () =>
  [...memoryFs.files.keys()]
    .filter((k) => k.startsWith(`${QUEUE}/`))
    .map((k) => k.slice(QUEUE.length + 1))
    .sort();

let folders = 0;
/** The scanner's result for a fixture, its files in a numbered folder of its own under files/scans/, as the core writes them. */
function result(stem = 'inv_0007'): ScanResult {
  const r = parseScanResult(coreJson(stem, `file:///docs/scans/${1795000000000 + ++folders}`));
  for (const uri of [r.pageUri, r.originalUri, ...r.reads.map((b) => b.cropUri)]) if (uri) memoryFs.files.set(uri, 'image');
  return r;
}
const filesIn = (dir: string) => [...memoryFs.files.keys()].filter((k) => k.startsWith(`${dir}/`));

/** The oldest read under way ends with this result, or fails with this error; then everything it set off settles. */
async function read(r: ScanResult): Promise<void> {
  expect(reads.length).toBeGreaterThan(0);
  reads.shift()!.resolve(r);
  await flush();
}
async function fail(e: unknown): Promise<void> {
  expect(reads.length).toBeGreaterThan(0);
  reads.shift()!.reject(e);
  await flush();
}

const readUris = () => mockScanPhoto.mock.calls.map(([uri]) => uri);

beforeAll(() => pinToday(T));
afterAll(() => jest.useRealTimers());

beforeEach(async () => {
  await flush(); // the last test's writes land before its files go
  memoryFs.reset();
  jest.resetModules();
  jest.clearAllMocks();
  jest.setSystemTime(T);
  reads.length = 0;
  mockTeam = false;
  const deferred = (uri: string) => new Promise<ScanResult>((resolve, reject) => reads.push({ uri, resolve, reject }));
  mockScanPhoto.mockImplementation((uri: string) => deferred(uri));
  mockReadPdf.mockImplementation((uri: string) => deferred(uri));
  mockRelease.mockImplementation(async () => undefined);
  m = load();
});

afterEach(() => jest.restoreAllMocks());

test("a photo moves into files/queue/<session>/ before it's read, named by its time, its place and its source", async () => {
  const { queue } = m;
  const name = queue.queuedName(T, 3, 'gallery', true, 'png');
  expect(name).toBe(`${T.getTime()}-3-gallery-test.png`);
  expect(queue.parseQueuedName(name)).toEqual({ at: T, seq: 3, source: 'gallery', testImage: true });
  expect(queue.parseQueuedName(queue.queuedName(at(1), 12, 'camera_app', false, 'jpg'))).toEqual({
    at: at(1),
    seq: 12,
    source: 'camera_app',
    testImage: false,
  });
  expect(queue.parseQueuedName(`${T.getTime()}-1-camera.jpeg`)).toEqual({ at: T, seq: 1, source: 'camera', testImage: false });
  // a name the queue didn't give
  for (const other of [
    'IMG_0001.jpg',
    `${T.getTime()}-1-scanner.jpg`, // not a source a photo comes from
    `${T.getTime()}-x-camera.jpg`,
    `${T.getTime()}-1-camera`, // no extension
    `${T.getTime()}-1-camera-test-test.jpg`,
    `9${'9'.repeat(20)}-1-camera.jpg`, // no time a Date can hold
  ]) {
    expect(queue.parseQueuedName(other)).toBeNull();
  }

  // the gallery picker's copy, in the app's cache, keeps its extension
  const from = photo('picked.png');
  let there = false;
  mockScanPhoto.mockImplementationOnce((uri: string) => {
    there = memoryFs.files.has(uri) && !memoryFs.files.has(from); // moved before the read starts
    return new Promise(() => {});
  });
  await m.queue.queuePhoto(from, { session: A, source: 'gallery', testImage: true }, T);
  await flush();
  const uri = `${QUEUE}/${A}/${T.getTime()}-1-gallery-test.png`;
  expect(queued()).toEqual([`${A}/${T.getTime()}-1-gallery-test.png`]);
  expect(memoryFs.files.has(from)).toBe(false);
  expect(mockScanPhoto.mock.calls).toEqual([[uri, { deletePhoto: false }]]);
  expect(there).toBe(true);
  expect(queue.captures()).toEqual([
    {
      key: expect.any(String),
      session: A,
      at: T,
      kind: 'photo',
      uri,
      source: 'gallery',
      testImage: true,
      name: null,
      replaces: null,
      reading: true,
    },
  ]);
});

test("one at a time, in the order taken, through the camera's read path", async () => {
  const { queue, fs } = m;
  // The first photo's move is slow, and the second one's isn't. Both were taken in the same ms: the first one is still
  // read first, since its place in the order was taken at once.
  const move = fs.File.prototype.move;
  let landFirst = () => {};
  jest.spyOn(fs.File.prototype, 'move').mockImplementationOnce(function (
    this: InstanceType<typeof fs.File>,
    ...args: Parameters<typeof move>
  ) {
    return new Promise<void>((resolve, reject) => {
      landFirst = () => void move.apply(this, args).then(resolve, reject);
    });
  });
  const listener = jest.fn();
  queue.subscribeQueue(listener);
  void queue.queuePhoto(photo('capture_1.jpg'), { session: A, source: 'camera' }, T);
  void queue.queuePhoto(photo('capture_2.jpg'), { session: A, source: 'camera' }, T);
  // both are waiting at once, in the order taken
  expect(queue.captures().map((c) => c.uri)).toEqual(['file:///cache/camera/capture_1.jpg', 'file:///cache/camera/capture_2.jpg']);
  expect(listener).toHaveBeenCalled();
  const before = queue.captures();
  await flush();
  expect(queue.captures()).not.toBe(before); // replaced, never changed in place: the tray subscribes to it
  expect(mockScanPhoto).not.toHaveBeenCalled(); // the first one isn't in files/queue yet

  landFirst();
  await flush();
  const first = `${QUEUE}/${A}/${T.getTime()}-1-camera.jpg`;
  const second = `${QUEUE}/${A}/${T.getTime()}-2-camera.jpg`;
  expect(mockScanPhoto.mock.calls).toEqual([[first, { deletePhoto: false }]]);
  expect(queue.captures().map((c) => [c.uri, c.reading])).toEqual([
    [first, true],
    [second, false],
  ]);
  await flush();
  expect(mockScanPhoto).toHaveBeenCalledTimes(1); // the next waits until this one settles

  await read(result());
  expect(mockScanPhoto.mock.calls).toEqual([
    [first, { deletePhoto: false }],
    [second, { deletePhoto: false }],
  ]);
  await read(result());
  expect(queue.captures()).toEqual([]);
  expect(m.scans.recentScans().map((s) => s.at)).toEqual([T, T]);
});

test('a read keeps its scan in its session, then deletes the photo once recent.json has it', async () => {
  const { queue, scans, jsonFile } = m;
  // recent.json's write is held until the test lets it land
  const write = jsonFile.writeJson;
  let land = () => {};
  jest.spyOn(jsonFile, 'writeJson').mockImplementation((path, value) =>
    path === 'recent.json'
      ? new Promise<void>((resolve, reject) => {
          land = () => void write(path, value).then(resolve, reject);
        })
      : write(path, value),
  );
  await queue.queuePhoto(photo('capture_1.jpg'), { session: 'S', source: 'camera', testImage: true }, T);
  const file = `S/${T.getTime()}-1-camera-test.jpg`;
  jest.setSystemTime(at(4)); // read 4 s after it was taken

  await read(result());
  expect(scans.recentScans()).toHaveLength(1);
  expect(scans.recentScans()[0]).toMatchObject({ session: 'S', label: 'Camera photo', source: 'camera', testImage: true });
  expect(scans.recentScans()[0].at).toEqual(T); // as of when it was taken (ruling P-F2)
  expect(queue.captures()).toEqual([]);
  expect(queued()).toEqual([file]); // recent.json doesn't hold the scan yet

  land();
  await flush();
  const kept = JSON.parse(memoryFs.files.get(RECENT) as string);
  expect(kept).toMatchObject([{ session: 'S', at: T.toISOString(), testImage: true }]);
  expect(queued()).toEqual([]);
});

test('a form not found is a scan like any other', async () => {
  const { queue, scans, session } = m;
  const { session: id } = session.takeCapture(T);
  await queue.queuePhoto(photo('capture_1.jpg'), { session: id, source: 'camera' }, T);
  await read(result('blank_page'));
  expect(scans.recentScans()).toHaveLength(1);
  expect(scans.recentScans()[0]).toMatchObject({ session: id, label: 'Camera photo', result: { aligned: false } });
  expect(session.currentSession()?.failed).toEqual([]); // not a failed read: it has a scan, with its Retake
  expect(queued()).toEqual([]);
});

test("a read that fails is the session's failed read, in plain words, and the photo goes", async () => {
  const { queue, scans, session } = m;
  const alert = jest.spyOn(require('react-native').Alert, 'alert'); // react-native as lib/ would load it now
  const { session: id } = session.takeCapture(T);
  await queue.queuePhoto(photo('capture_1.jpg'), { session: id, source: 'camera' }, T);
  await queue.queuePhoto(photo('capture_2.jpg'), { session: id, source: 'camera' }, at(1));
  await queue.queuePhoto(photo('capture_3.jpg'), { session: id, source: 'camera' }, at(2));
  const names = [1, 2, 3].map((n) => `${id}/${at(n - 1).getTime()}-${n}-camera.jpg`);
  expect(queued()).toEqual(names);

  jest.setSystemTime(at(5));
  await fail(Object.assign(new Error('decode failed: not an image'), { code: 'ERR_UNREADABLE_IMAGE' }));
  expect(session.currentSession()?.failed).toEqual([{ at: at(5).toISOString(), reason: UNREADABLE }]);
  expect(queued()).toEqual(names.slice(1)); // it went; the next ones go on

  // the scanner's own failure: its words are never kept
  jest.setSystemTime(at(9));
  await fail(new Error('boom'));
  expect(session.currentSession()?.failed).toEqual([
    { at: at(5).toISOString(), reason: UNREADABLE },
    { at: at(9).toISOString(), reason: STOPPED },
  ]);
  expect(queued()).toEqual(names.slice(2));

  await read(result());
  expect(scans.recentScans().map((s) => s.session)).toEqual([id]); // a failed read keeps no scan
  await flush();
  expect(queued()).toEqual([]);
  expect(memoryFs.files.get(SESSION_FILE)).not.toMatch(/boom|decode/);
  expect(JSON.parse(memoryFs.files.get(SESSION_FILE) as string).failed).toHaveLength(2);
  expect(alert).not.toHaveBeenCalled();
});

test('Retake: the new scan replaces the unsaved one once it reads; a failed read keeps it; a saved one is never replaced', async () => {
  const { queue, scans, session, fs } = m;
  /** A Retake of that scan from its Scan screen, then the camera's next photo. */
  async function retake(scanId: string, seconds: number, name: string) {
    session.retakeIn(A, scanId, at(seconds));
    const { session: id, replaces } = session.takeCapture(at(seconds));
    expect({ id, replaces }).toEqual({ id: A, replaces: scanId });
    await queue.queuePhoto(photo(name), { session: id, source: 'camera', replaces }, at(seconds));
    expect(queue.captures()[0].replaces).toBe(scanId);
  }

  const first = scans.addScan({ label: 'Camera photo', source: 'camera', result: result('blank_page'), session: A });
  const firstDir = scans.getScan(first)!.result.scanDir!;
  await retake(first, 1, 'capture_1.jpg');
  expect(scans.getScan(first)).toBeDefined(); // kept while the new one is read
  await read(result());
  expect(scans.getScan(first)).toBeUndefined();
  expect(filesIn(firstDir)).toEqual([]);
  const second = scans.recentScans()[0].id;
  expect(scans.recentScans().map((s) => s.id)).toEqual([second]);

  // a read that fails keeps it
  await retake(second, 2, 'capture_2.jpg');
  await fail(new Error('boom'));
  expect(scans.recentScans().map((s) => s.id)).toEqual([second]);

  // a saved one is never replaced
  scans.updateScan(second, { saved: { savedAt: at(3).toISOString(), details: { account: '1205' } } });
  await retake(second, 3, 'capture_3.jpg');
  await read(result());
  const third = scans.recentScans()[0].id;
  expect(scans.recentScans().map((s) => s.id)).toEqual([third, second]);
  expect(scans.getScan(second)?.saved).not.toBeNull();

  // one whose folder can't be deleted stays; the new scan is kept, and the queue goes on
  jest.spyOn(fs.Directory.prototype, 'delete').mockImplementationOnce(() => {
    throw new Error('busy');
  });
  await retake(third, 4, 'capture_4.jpg');
  await queue.queuePhoto(photo('capture_5.jpg'), { session: A, source: 'camera' }, at(5));
  await read(result());
  const fourth = scans.recentScans()[0].id;
  expect(scans.recentScans().map((s) => s.id)).toEqual([fourth, third, second]);
  await read(result());
  expect(scans.recentScans()).toHaveLength(4);
  await flush();
  expect(queued()).toEqual([]);
});

test("a PDF waits in memory, is read through readPdf, then the picker's access is given up", async () => {
  const { queue, scans, session } = m;
  const { session: id } = session.takeCapture(T);
  queue.queuePdf({ uri: `${LINK}54`, name: 'a.pdf' }, { session: id }, T);
  expect(queue.captures()).toEqual([
    {
      key: expect.any(String),
      session: id,
      at: T,
      kind: 'pdf',
      uri: `${LINK}54`,
      source: 'pdf',
      testImage: false,
      name: 'a.pdf',
      replaces: null,
      reading: true,
    },
  ]);
  expect(queued()).toEqual([]); // the person's own file: nothing of it is copied into files/queue
  expect(mockReadPdf.mock.calls).toEqual([[`${LINK}54`]]);
  expect(mockRelease).not.toHaveBeenCalled(); // not before its read
  await read(result('sales_text_0'));
  expect(scans.recentScans()[0]).toMatchObject({ label: 'PDF: a.pdf', source: 'pdf', session: id });
  expect(scans.recentScans()[0].at).toEqual(T);
  expect(mockRelease.mock.calls).toEqual([[`${LINK}54`]]);

  // refused: the session's failed read, in the PDF's own words, and its access is given up all the same
  queue.queuePdf({ uri: `${LINK}55`, name: 'locked.pdf' }, { session: id }, at(1));
  await fail(Object.assign(new Error('refused: pdf_password'), { code: 'pdf_password' }));
  expect(session.currentSession()?.failed).toEqual([{ at: T.toISOString(), reason: PASSWORD }]);
  expect(mockRelease.mock.calls).toEqual([[`${LINK}54`], [`${LINK}55`]]);

  // iOS's picker gives a copy in the app's temporary folder (a file://): it's deleted instead. With no name, "PDF".
  const copy = 'file:///tmp/Inbox/b.pdf';
  memoryFs.files.set(copy, '%PDF-1.7');
  queue.queuePdf({ uri: copy, name: null }, { session: id }, at(2));
  expect(memoryFs.files.has(copy)).toBe(true);
  await read(result('sales_text_0'));
  expect(memoryFs.files.has(copy)).toBe(false);
  expect(scans.recentScans()[0].label).toBe('PDF');
  expect(mockRelease).toHaveBeenCalledTimes(2);
});

test("at start, what's left in files/queue is read into its sessions, oldest first; a second resume adds nothing", async () => {
  // What a closed app left in two sessions' folders: photos taken but not read, one in the camera's test hook.
  const left = [
    `${A}/${at(2).getTime()}-2-camera.jpg`,
    `${B}/${at(1).getTime()}-1-gallery-test.png`,
    `${A}/${at(3).getTime()}-3-camera_app.jpg`,
  ];
  for (const file of left) memoryFs.files.set(`${QUEUE}/${file}`, 'jpeg');
  const { queue, scans } = m; // a new start
  await scans.loadRecent();
  await queue.resumeQueue();
  await queue.resumeQueue();
  expect(queue.captures().map((c) => [c.session, c.source, c.testImage, c.at])).toEqual([
    [B, 'gallery', true, at(1)],
    [A, 'camera', false, at(2)],
    [A, 'camera_app', false, at(3)],
  ]);
  expect(mockScanPhoto).toHaveBeenCalledTimes(1);

  await read(result());
  await queue.resumeQueue(); // while they're read, too
  await read(result());
  await read(result());
  expect(readUris()).toEqual([`${QUEUE}/${left[1]}`, `${QUEUE}/${left[0]}`, `${QUEUE}/${left[2]}`]);
  expect(scans.recentScans().map((s) => [s.session, s.label, s.testImage, s.at])).toEqual([
    [A, 'Camera photo', false, at(3)],
    [A, 'Camera photo', false, at(2)],
    [B, 'Photo from gallery', true, at(1)],
  ]);
  await flush();
  expect(queued()).toEqual([]);
  await queue.resumeQueue(); // nothing left
  expect(mockScanPhoto).toHaveBeenCalledTimes(3);
});

test("a name the queue didn't give is a camera photo, read after the others; an empty folder goes", async () => {
  memoryFs.files.set(`${QUEUE}/${A}/IMG_0001.jpg`, 'jpeg');
  memoryFs.files.set(`${QUEUE}/${A}/${at(30).getTime()}-4-gallery.jpg`, 'jpeg'); // taken after "now", by the phone's clock
  memoryFs.dirs.add(`${QUEUE}/${B}`); // a session's folder with nothing left in it
  const { queue, scans } = m;
  await scans.loadRecent();
  await queue.resumeQueue();
  expect(memoryFs.dirs.has(`${QUEUE}/${B}`)).toBe(false);
  expect(queue.captures().map((c) => [c.session, c.source, c.testImage])).toEqual([
    [A, 'gallery', false],
    [A, 'camera', false],
  ]);
  await read(result());
  await read(result());
  expect(readUris()).toEqual([`${QUEUE}/${A}/${at(30).getTime()}-4-gallery.jpg`, `${QUEUE}/${A}/IMG_0001.jpg`]);
  expect(scans.recentScans().map((s) => [s.session, s.label, s.source])).toEqual([
    [A, 'Camera photo', 'camera'],
    [A, 'Photo from gallery', 'gallery'],
  ]);
  await flush();
  expect(queued()).toEqual([]);
});

test("a queued photo whose scan recent.json holds already isn't read again, and goes (ruling P-F2)", async () => {
  // The app was killed after recent.json held the scan and before its photo was deleted. Another photo of that session
  // wasn't read yet, and one in another session was taken in the same ms.
  const id = m.scans.addScan({ label: 'Camera photo', source: 'camera', result: result(), session: A, at: at(1) });
  await flush();
  const done = `${A}/${at(1).getTime()}-1-camera.jpg`;
  const waiting = `${A}/${at(2).getTime()}-2-camera.jpg`;
  const elsewhere = `${B}/${at(1).getTime()}-1-camera.jpg`;
  for (const file of [done, waiting, elsewhere]) memoryFs.files.set(`${QUEUE}/${file}`, 'jpeg');

  jest.resetModules(); // the next start
  jest.setSystemTime(at(60));
  const next = load();
  await next.scans.loadRecent();
  await next.queue.resumeQueue();
  expect(queued()).toEqual([waiting, elsewhere].sort());
  expect(next.queue.captures().map((c) => c.uri)).toEqual([`${QUEUE}/${elsewhere}`, `${QUEUE}/${waiting}`]);
  await read(result());
  await read(result());
  expect(readUris()).toEqual([`${QUEUE}/${elsewhere}`, `${QUEUE}/${waiting}`]);
  expect(next.scans.recentScans().map((s) => [s.session, s.at])).toEqual([
    [A, at(2)],
    [B, at(1)],
    [A, at(1)],
  ]);
  expect(next.scans.recentScans()[2].id).toBe(id);
  await flush();
  expect(queued()).toEqual([]);
});

test('a photo whose scan recent.json failed to hold stays queued, and the next start reads it (ruling T2-2)', async () => {
  const write = m.jsonFile.writeJson;
  jest.spyOn(m.jsonFile, 'writeJson').mockImplementation((path, value) =>
    path === 'recent.json' ? Promise.reject(new Error('No space left on device')) : write(path, value),
  );
  await m.queue.queuePhoto(photo('capture_1.jpg'), { session: A, source: 'camera' }, T);
  await read(result());
  expect(m.scans.recentScans()).toHaveLength(1); // the scan shows all the same
  expect(await m.scans.scansWritten()).toBe(false);
  const file = `${A}/${T.getTime()}-1-camera.jpg`;
  expect(queued()).toEqual([file]);

  // the start run again in the same JS context (a font-size change) neither reads it again nor deletes it
  await m.queue.resumeQueue();
  expect(mockScanPhoto).toHaveBeenCalledTimes(1);
  expect(queued()).toEqual([file]);

  // the next start: none is lost
  jest.restoreAllMocks();
  jest.resetModules();
  jest.setSystemTime(at(60));
  const next = load();
  await next.scans.loadRecent();
  expect(next.scans.recentScans()).toEqual([]);
  await next.queue.resumeQueue();
  await read(result());
  expect(next.scans.recentScans().map((s) => [s.session, s.at])).toEqual([[A, T]]);
  await flush();
  expect(queued()).toEqual([]);
});

test('a photo kept back goes once a later write holds its scan; a resume meanwhile neither reads nor deletes one', async () => {
  // recent.json can't be written for the first scan (a full phone), then the second one's write is held
  const write = m.jsonFile.writeJson;
  let full = true;
  let land = () => {};
  jest.spyOn(m.jsonFile, 'writeJson').mockImplementation((path, value) => {
    if (path !== 'recent.json') return write(path, value);
    if (full) return Promise.reject(new Error('No space left on device'));
    return new Promise<void>((resolve, reject) => {
      land = () => void write(path, value).then(resolve, reject);
    });
  });
  await m.queue.queuePhoto(photo('capture_1.jpg'), { session: A, source: 'camera' }, T);
  await read(result());
  const first = `${A}/${T.getTime()}-1-camera.jpg`;
  expect(queued()).toEqual([first]);

  full = false;
  await m.queue.queuePhoto(photo('capture_2.jpg'), { session: A, source: 'camera' }, at(1));
  await read(result());
  const second = `${A}/${at(1).getTime()}-2-camera.jpg`;
  expect(queued()).toEqual([first, second]); // recent.json doesn't hold the second scan yet
  // the start run again in the same JS context: the scans are in memory, but recent.json doesn't hold them yet
  await m.queue.resumeQueue();
  expect(mockScanPhoto).toHaveBeenCalledTimes(2);
  expect(queued()).toEqual([first, second]);

  land(); // it holds every scan so far, the first one's too
  await flush();
  expect(JSON.parse(memoryFs.files.get(RECENT) as string).map((s: { at: string }) => s.at)).toEqual([
    at(1).toISOString(),
    T.toISOString(),
  ]);
  expect(queued()).toEqual([]);
});

test('a resume while a photo is still moving neither queues it twice nor takes its folder (ruling T3-2)', async () => {
  const { queue, fs } = m;
  // expo-file-system's move is async: the file can be in files/queue before its promise resolves, or not there yet
  const move = fs.File.prototype.move;
  const landings: (() => void)[] = [];
  jest.spyOn(fs.File.prototype, 'move').mockImplementation(function (
    this: InstanceType<typeof fs.File>,
    ...args: Parameters<typeof move>
  ) {
    const [to] = args;
    if (!to.uri.startsWith(QUEUE + '/')) return move.apply(this, args); // recent.json's own writes
    if (to.uri.endsWith('-1-camera.jpg')) {
      // there at once, its promise later
      return move.apply(this, args).then(() => new Promise<void>((resolve) => landings.push(resolve)));
    }
    return new Promise<void>((resolve, reject) => landings.push(() => void move.apply(this, args).then(resolve, reject)));
  });
  void queue.queuePhoto(photo('capture_1.jpg'), { session: A, source: 'camera' }, T);
  void queue.queuePhoto(photo('capture_2.jpg'), { session: B, source: 'camera' }, at(1));
  await flush();
  expect(queued()).toEqual([`${A}/${T.getTime()}-1-camera.jpg`]); // B's folder is made, its photo not there yet
  expect(memoryFs.dirs.has(`${QUEUE}/${B}`)).toBe(true);

  await queue.resumeQueue(); // a start run again meanwhile
  expect(queue.captures()).toHaveLength(2);
  expect(memoryFs.dirs.has(`${QUEUE}/${B}`)).toBe(true); // a folder a photo is moving into stays
  landings.forEach((land) => land());
  await flush();
  expect(queued()).toEqual([`${A}/${T.getTime()}-1-camera.jpg`, `${B}/${at(1).getTime()}-2-camera.jpg`]);
  await read(result());
  await read(result());
  expect(mockScanPhoto).toHaveBeenCalledTimes(2);
  expect(m.scans.recentScans().map((s) => s.session)).toEqual([B, A]);
  await flush();
  expect(queued()).toEqual([]);
});

test("a scan that can't be kept leaves the queue, and its photo stays for the next start (ruling T3-3)", async () => {
  const { queue, scans } = m;
  jest.spyOn(scans, 'addScan').mockImplementationOnce(() => {
    throw new Error('out of memory');
  });
  await queue.queuePhoto(photo('capture_1.jpg'), { session: A, source: 'camera' }, T);
  await queue.queuePhoto(photo('capture_2.jpg'), { session: A, source: 'camera' }, at(1));
  await read(result());
  expect(queue.captures().map((c) => c.at)).toEqual([at(1)]); // it left; the next one is read
  expect(mockScanPhoto).toHaveBeenCalledTimes(2);
  await read(result());
  await flush();
  expect(mockScanPhoto).toHaveBeenCalledTimes(2); // never read again in a loop
  expect(scans.recentScans().map((s) => s.at)).toEqual([at(1)]);
  // the second scan's write landed: it doesn't hold the first one's, so that photo stays
  const first = `${A}/${T.getTime()}-1-camera.jpg`;
  expect(queued()).toEqual([first]);
  await queue.resumeQueue(); // nor is it read again in this JS context
  expect(mockScanPhoto).toHaveBeenCalledTimes(2);

  jest.restoreAllMocks();
  jest.resetModules(); // the next start reads it
  const next = load();
  await next.scans.loadRecent();
  await next.queue.resumeQueue();
  await read(result());
  expect(next.scans.recentScans().map((s) => s.at)).toEqual([T, at(1)]);
  await flush();
  expect(queued()).toEqual([]);
});

test("a scan that can't be kept is the session's failed read too: the scanner stopped (ruling T7-1)", async () => {
  const { queue, scans, session } = m;
  const { session: id } = session.takeCapture(T);
  jest.spyOn(scans, 'addScan').mockImplementation(() => {
    throw new Error('out of memory');
  });
  await queue.queuePhoto(photo('capture_1.jpg'), { session: id, source: 'camera' }, T);
  jest.setSystemTime(at(4));
  await read(result());
  expect(session.currentSession()?.failed).toEqual([{ at: at(4).toISOString(), reason: STOPPED }]);
  expect(queued()).toEqual([`${id}/${T.getTime()}-1-camera.jpg`]); // the photo still stays for the next start

  // a PDF the same: it's no longer silently gone
  queue.queuePdf({ uri: `${LINK}54`, name: 'si.pdf' }, { session: id }, at(5));
  jest.setSystemTime(at(6));
  await read(result());
  expect(session.currentSession()?.failed.map((f) => f.reason)).toEqual([STOPPED, STOPPED]);
  expect(memoryFs.files.get(SESSION_FILE)).not.toMatch(/out of memory/);
});

test('a failed Retake never deletes the scan it was for: a read that throws, or a scan that can\'t be kept', async () => {
  // The user's check: the old scan (replaces) goes only once its new scan is kept; the session shows the failure as a
  // failed read (the tray's "!"), and the Retake's link is spent
  const { queue, scans, session } = m;
  const old = scans.addScan({ label: 'Camera photo', source: 'camera', result: result('blank_page'), session: A });
  const oldDir = scans.getScan(old)!.result.scanDir!;
  const retake = async (seconds: number, name: string) => {
    session.retakeIn(A, old, at(seconds));
    const { session: id, replaces } = session.takeCapture(at(seconds));
    await queue.queuePhoto(photo(name), { session: id, source: 'camera', replaces }, at(seconds));
  };

  await retake(1, 'capture_1.jpg');
  await fail(new Error('boom'));
  expect(scans.getScan(old)).toBeDefined();
  expect(filesIn(oldDir)).not.toEqual([]);
  expect(session.currentSession()).toMatchObject({ id: A, replaces: null });
  expect(session.currentSession()?.failed.map((f) => f.reason)).toEqual([STOPPED]);

  await retake(2, 'capture_2.jpg');
  jest.spyOn(scans, 'addScan').mockImplementationOnce(() => {
    throw new Error('out of memory');
  });
  await read(result());
  expect(scans.getScan(old)).toBeDefined();
  expect(filesIn(oldDir)).not.toEqual([]);
  expect(session.currentSession()?.failed.map((f) => f.reason)).toEqual([STOPPED, STOPPED]);
  expect(scans.recentScans().map((s) => s.id)).toEqual([old]);
});

test('a Retake whose read finds no form keeps the original too; an aligned one still replaces it (ruling T7-3)', async () => {
  const { queue, scans, session } = m;
  const old = scans.addScan({ label: 'Camera photo', source: 'camera', result: result(), session: A });
  const oldDir = scans.getScan(old)!.result.scanDir!;
  const retake = async (seconds: number, name: string) => {
    session.retakeIn(A, old, at(seconds));
    const { session: id, replaces } = session.takeCapture(at(seconds));
    await queue.queuePhoto(photo(name), { session: id, source: 'camera', replaces }, at(seconds));
  };

  await retake(1, 'capture_1.jpg');
  await read(result('blank_page')); // the form not found: no better than what it was for
  const notFound = scans.recentScans()[0];
  expect(notFound.result.aligned).toBe(false);
  expect(scans.getScan(old)).toBeDefined();
  expect(filesIn(oldDir)).not.toEqual([]);
  expect(scans.recentScans().map((s) => [s.id, s.session])).toEqual([
    [notFound.id, A],
    [old, A],
  ]);

  await retake(2, 'capture_2.jpg');
  await read(result()); // found: it replaces the original, as before
  expect(scans.getScan(old)).toBeUndefined();
  expect(filesIn(oldDir)).toEqual([]);
  expect(scans.recentScans()).toHaveLength(2);
});

test("a photo that can't be moved is read where it is", async () => {
  const { queue, scans, fs } = m;
  jest.spyOn(fs.File.prototype, 'move').mockRejectedValueOnce(new Error('No space left on device'));
  const from = photo('capture_1.jpg');
  await queue.queuePhoto(from, { session: A, source: 'camera' }, T);
  await flush();
  expect(mockScanPhoto.mock.calls).toEqual([[from, { deletePhoto: false }]]);
  expect(queue.captures().map((c) => c.uri)).toEqual([from]);
  await read(result());
  expect(scans.recentScans()[0]).toMatchObject({ session: A, label: 'Camera photo' });
  expect(memoryFs.files.has(from)).toBe(false); // deleted once recent.json holds its scan, as a queued one is
  expect(queued()).toEqual([]);
});

test('whenRead waits for its own session only', async () => {
  const { queue } = m;
  await expect(queue.whenRead(A)).resolves.toBeUndefined(); // nothing waits
  await queue.queuePhoto(photo('capture_1.jpg'), { session: A, source: 'camera' }, T);
  await queue.queuePhoto(photo('capture_2.jpg'), { session: B, source: 'camera' }, at(1));
  queue.queuePdf({ uri: `${LINK}56`, name: 'c.pdf' }, { session: A }, at(2));
  expect([queue.pendingIn(A), queue.pendingIn(B), queue.pendingIn('other')]).toEqual([2, 1, 0]);
  const done: string[] = [];
  void queue.whenRead(A).then(() => done.push(A));
  void queue.whenRead(B).then(() => done.push(B));

  await read(result()); // A's photo
  expect(done).toEqual([]);
  expect(queue.pendingIn(A)).toBe(1);
  await read(result()); // B's
  expect(done).toEqual([B]);
  await fail(new Error('boom')); // A's PDF: a read that fails is done too
  expect(done).toEqual([B, A]);
  expect(queue.pendingIn(A)).toBe(0);
});

test('held, no new read starts until it lets go (approach 2)', async () => {
  const { queue, scans } = m;
  expect(queue.READ_WHILE_SHOOTING).toBe(true); // approach 1, until Task 14's measurement says otherwise
  queue.holdReads(true);
  await queue.queuePhoto(photo('capture_1.jpg'), { session: A, source: 'camera' }, T);
  await queue.queuePhoto(photo('capture_2.jpg'), { session: A, source: 'camera' }, at(1));
  queue.queuePdf({ uri: `${LINK}57`, name: 'd.pdf' }, { session: A }, at(2));
  await flush();
  expect(mockScanPhoto).not.toHaveBeenCalled();
  expect(mockReadPdf).not.toHaveBeenCalled();
  expect(queue.pendingIn(A)).toBe(3);

  queue.holdReads(false);
  await flush();
  expect(mockScanPhoto).toHaveBeenCalledTimes(1);
  // held while one is read: it finishes, and the next waits
  queue.holdReads(true);
  await read(result());
  expect(scans.recentScans()).toHaveLength(1);
  await flush();
  expect(mockScanPhoto).toHaveBeenCalledTimes(1);
  expect(queue.captures().map((c) => c.reading)).toEqual([false, false]);

  queue.holdReads(false);
  await flush();
  expect(mockScanPhoto).toHaveBeenCalledTimes(2);
  await read(result());
  expect(mockReadPdf).toHaveBeenCalledTimes(1);
  await read(result('sales_text_0'));
  expect(scans.recentScans()).toHaveLength(3);
});

test("failedReadReason never holds the scanner's own message, in a team build too", async () => {
  const { failedReadReason, photoFailed, pdfFailed } = require('../lib/readFailures') as typeof import('../lib/readFailures');
  const own = 'open failed: ENOENT (No such file or directory)';
  const failure = (code?: string) => Object.assign(new Error(own), code ? { code } : {});
  for (const team of [false, true]) {
    mockTeam = team;
    expect(failedReadReason('photo', failure('ERR_UNREADABLE_IMAGE'))).toBe(UNREADABLE);
    expect(failedReadReason('photo', failure('ERR_UNEXPECTED'))).toBe(STOPPED);
    expect(failedReadReason('photo', failure())).toBe(STOPPED);
    expect(failedReadReason('photo', null)).toBe(STOPPED);
    expect(failedReadReason('pdf', failure('pdf_password'))).toBe(PASSWORD);
    expect(failedReadReason('pdf', failure('pdf_too_big'))).toBe('That PDF is over 20 MB. Choose a smaller file.');
    expect(failedReadReason('pdf', failure('pdf_new_refusal'))).toBe("Couldn't read that PDF.");
    expect(failedReadReason('pdf', failure('ERR_UNEXPECTED'))).toBe(STOPPED);
    expect(failedReadReason('pdf', 'closed')).toBe(STOPPED);
  }
  // a dialog's words do carry it in a team build (today's, for the pickers' reads); a failed read's never do
  expect(photoFailed(failure())).toContain(own);
  expect(pdfFailed(failure('ERR_UNEXPECTED'))).toContain(own);

  // through the queue, in a team build
  const { session: id } = m.session.takeCapture(T);
  await m.queue.queuePhoto(photo('capture_1.jpg'), { session: id, source: 'camera' }, T);
  await fail(failure('ERR_UNEXPECTED'));
  expect(m.session.currentSession()?.failed).toEqual([{ at: T.toISOString(), reason: STOPPED }]);
  await flush();
  expect(memoryFs.files.get(SESSION_FILE)).not.toContain('ENOENT');
});
