import type { ScanResult } from '../modules/scanner';
import { parseScanResult } from '../modules/scanner/src/parse';
import { coreJson } from '../test-utils/coreJson';
import { memoryFs } from '../test-utils/memoryFs';

jest.mock('expo-file-system', () => require('../test-utils/memoryFs').memoryFs.module);

const flush = () => new Promise<void>((resolve) => setTimeout(() => resolve(), 0));
const RECENT = 'file:///docs/recent.json';
const SESSION = '1795000000000-ab12'; // lib/session's newSessionId
/** The ids recent.json holds, newest first; none before its first write. */
const recentIds = (): string[] =>
  (JSON.parse((memoryFs.files.get(RECENT) as string | undefined) ?? '[]') as { id: string }[]).map((s) => s.id);
/** A scan as it starts, before the person does anything to it. */
const UNTOUCHED = {
  edits: {},
  confirmed: [],
  terms: null,
  kind: 'sale',
  party: null,
  saved: null,
  annotated: false,
  tag: null,
  testImage: false,
  savedMarks: '',
};

function result(dir: string): ScanResult {
  return parseScanResult(coreJson('inv_0007', dir));
}

beforeEach(() => {
  memoryFs.reset();
  jest.resetModules();
});

test('keeps the newest 100, newest first', async () => {
  const { addScan, getScan, recentScans } = require('../lib/scans');
  const ids = Array.from({ length: 101 }, (_, i) =>
    addScan({ label: `Scan ${i + 1}`, source: 'gallery', result: result(`/s/${i + 1}`) }),
  );
  await flush(); // the 101 queued saves of recent.json land now, not in the next test's files
  const recent = recentScans();
  expect(recent).toHaveLength(100);
  expect(recent[0].label).toBe('Scan 101');
  expect(recent[99].label).toBe('Scan 2');
  expect(getScan(ids[0])).toBeUndefined();
  expect(getScan(ids[100])?.label).toBe('Scan 101');
});

test('the scanner keeps as many scan folders as the app keeps scans', () => {
  const { KEEP } = require('../lib/scans');
  // jest runs from the repo's root
  const kotlin: string = require('fs').readFileSync(
    'modules/scanner/android/src/main/java/expo/modules/scanner/ScannerModule.kt',
    'utf8',
  );
  const m = kotlin.match(/const val KEEP_SCANS = ([0-9]+)/);
  expect(Number(m?.[1])).toBe(KEEP);
});

test('edits, checked boxes, terms, kind and party are kept, and come back after a restart', async () => {
  const first = require('../lib/scans');
  const listener = jest.fn();
  first.subscribeRecent(listener);
  const id = first.addScan({ label: 'Camera photo', source: 'camera', result: result('/s/a') });
  expect(first.getScan(id)).toMatchObject(UNTOUCHED);
  first.setEdit(id, 'date', ' 10/21/2026 ');
  first.confirmBox(id, 'invoice_no');
  first.confirmBox(id, 'invoice_no'); // already checked: no change
  first.updateScan(id, { terms: 'cash', kind: 'purchase', party: { name: 'Isabela Wholesale Trading' } });
  expect(listener).toHaveBeenCalledTimes(4);
  await flush();
  memoryFs.dirs.add('file:///s/a');
  jest.resetModules();
  const second = require('../lib/scans');
  await second.loadRecent();
  expect(second.getScan(id)).toMatchObject({
    edits: { date: '10/21/2026' },
    confirmed: ['invoice_no'],
    terms: 'cash',
    kind: 'purchase',
    party: { name: 'Isabela Wholesale Trading' },
    saved: null,
  });
});

test("a scan just read starts as a purchase when it's made out to the business itself (lib/ownBusiness)", async () => {
  const { updateSettings } = require('../lib/settings');
  const { addScan, getScan } = require('../lib/scans');
  expect(getScan(addScan({ label: 'Camera photo', source: 'camera', result: result('/s/a') })).kind).toBe('sale');
  await updateSettings({ ownTin: '223-344-556-000' }); // inv_0007's made-up customer
  expect(getScan(addScan({ label: 'Camera photo', source: 'camera', result: result('/s/b') })).kind).toBe('purchase');
  // a 2307 is a 2307, whoever it names
  const cert = parseScanResult(coreJson('bir2307_text_0', '/s/c'));
  expect(getScan(addScan({ label: 'PDF: bir2307_text_0.pdf', source: 'pdf', result: cert })).kind).toBe('2307');
  await flush();
});

test('a change to its edit takes a box out of the checked ones', () => {
  const { addScan, confirmBox, getScan, setEdit } = require('../lib/scans');
  const id = addScan({ label: 'Camera photo', source: 'camera', result: result('/s/a') });
  const checked = () => getScan(id).confirmed;
  confirmBox(id, 'date');
  confirmBox(id, 'invoice_no');
  setEdit(id, 'date', 'Sep 20, 2026'); // its own reading saved untouched: no edit before or after
  expect(checked()).toEqual(['date', 'invoice_no']);
  setEdit(id, 'date', '10/21/2026'); // an edit stored
  expect(checked()).toEqual(['invoice_no']);
  confirmBox(id, 'date');
  setEdit(id, 'date', ' 10/21/2026 '); // the same edit again: nothing changed
  expect(checked()).toEqual(['invoice_no', 'date']);
  setEdit(id, 'date', '10/22/2026'); // the edit changed
  expect(checked()).toEqual(['invoice_no']);
  confirmBox(id, 'date');
  setEdit(id, 'date', 'Sep 20, 2026'); // the edit taken back
  expect(getScan(id)).toMatchObject({ edits: {}, confirmed: ['invoice_no'] });
});

test('a scan saved by milestone 2 loads with no edits or checked boxes, as a sale', async () => {
  const old = { id: 'old-1', label: 'Photo from gallery', source: 'gallery', at: '2026-11-20T01:00:00.000Z', result: result('/s/old') };
  memoryFs.files.set('file:///docs/recent.json', JSON.stringify([old]));
  memoryFs.dirs.add('file:///s/old');
  const { loadRecent, getScan } = require('../lib/scans');
  await loadRecent();
  expect(getScan('old-1')).toMatchObject(UNTOUCHED);
});

test('a scan kept before PDFs loads as a photo', async () => {
  // recent.json as milestone 3 wrote it: its results have no source, pageCount, picture or fromText
  const kept = JSON.parse(JSON.stringify(result('/s/old')));
  delete kept.source;
  delete kept.pageCount;
  delete kept.picture;
  for (const b of kept.reads) delete b.fromText;
  const old = { id: 'old-2', label: 'Camera photo', source: 'camera', at: '2026-11-20T01:00:00.000Z', result: kept };
  memoryFs.files.set('file:///docs/recent.json', JSON.stringify([old]));
  memoryFs.dirs.add('file:///s/old');
  const { loadRecent, getScan } = require('../lib/scans');
  await loadRecent();
  const r: ScanResult = getScan('old-2').result;
  expect(r).toMatchObject({ source: 'photo', pageCount: null, picture: null });
  expect(r.reads).toHaveLength(45);
  expect(r.reads.every((b) => b.fromText === false)).toBe(true);
});

test('a PDF scan comes back after a restart as it was read', async () => {
  const first = require('../lib/scans');
  const id = first.addScan({ label: 'PDF: two_pages.pdf', source: 'pdf', result: parseScanResult(coreJson('two_pages', '/s/p')) });
  await flush();
  memoryFs.dirs.add('file:///s/p');
  jest.resetModules();
  const second = require('../lib/scans');
  await second.loadRecent();
  const scan = second.getScan(id);
  expect(scan).toMatchObject({ label: 'PDF: two_pages.pdf', source: 'pdf' });
  expect(scan.result).toMatchObject({ source: 'pdf', pageCount: 2, picture: false });
  expect(scan.result.reads.every((b: { fromText: boolean }) => b.fromText)).toBe(true);
});

test('a 2307 comes in as a 2307; one kept as a sale before 2307s could be saved loads as one', async () => {
  const first = require('../lib/scans');
  const id = first.addScan({ label: 'PDF: bir2307_text_0.pdf', source: 'pdf', result: parseScanResult(coreJson('bir2307_text_0', '/s/q')) });
  expect(first.getScan(id).kind).toBe('2307');
  const invoice = first.addScan({ label: 'PDF: sales_text_0.pdf', source: 'pdf', result: parseScanResult(coreJson('sales_text_0', '/s/i')) });
  expect(first.getScan(invoice).kind).toBe('sale');
  // recent.json as milestone 5 wrote it before a 2307 could be saved: its 2307 kept as a sale
  await flush();
  const kept = JSON.parse(memoryFs.files.get('file:///docs/recent.json') as string);
  memoryFs.files.set('file:///docs/recent.json', JSON.stringify(kept.map((s: object) => ({ ...s, kind: 'sale' }))));
  memoryFs.dirs.add('file:///s/q');
  memoryFs.dirs.add('file:///s/i');
  jest.resetModules();
  const second = require('../lib/scans');
  await second.loadRecent();
  expect(second.getScan(id).kind).toBe('2307');
  expect(second.getScan(invoice).kind).toBe('sale');
});

test('a new scan keeps the versions it was made with', async () => {
  const { APP_VERSION, modelVersion } = require('../lib/versions');
  const first = require('../lib/scans');
  const id = first.addScan({ label: 'Camera photo', source: 'camera', result: result('/s/a') });
  const made = { app: APP_VERSION, model: modelVersion() };
  expect(first.getScan(id).made).toEqual(made);
  // recent.json with a scan kept before scans kept their versions (milestones 2, 3 and 5)
  await flush();
  const old = { id: 'old-3', label: 'Photo from gallery', source: 'gallery', at: '2026-11-20T01:00:00.000Z', result: result('/s/old') };
  const kept = JSON.parse(memoryFs.files.get('file:///docs/recent.json') as string);
  memoryFs.files.set('file:///docs/recent.json', JSON.stringify([...kept, old]));
  memoryFs.dirs.add('file:///s/a');
  memoryFs.dirs.add('file:///s/old');
  jest.resetModules();
  const second = require('../lib/scans');
  await second.loadRecent();
  expect(second.getScan(id).made).toEqual(made);
  expect(second.getScan('old-3').made).toBeUndefined();
});

test('the reading itself removes the edit', () => {
  const { addScan, setEdit, getScan } = require('../lib/scans');
  const id = addScan({ label: 'Sample 0007', source: 'sample', sampleId: 'inv_0007', result: result('/s/c') });
  setEdit(id, 'invoice_no', '1234567');
  expect(getScan(id).edits).toEqual({ invoice_no: '1234567' });
  setEdit(id, 'invoice_no', ' 0007655 ');
  expect(getScan(id).edits).toEqual({});
  setEdit(id, 'withholding', ''); // a box that wasn't read: nothing typed is no edit
  expect(getScan(id).edits).toEqual({});
});

test('a saved scan opened again can be found and changed', () => {
  const { cacheScan, getScan, updateScan } = require('../lib/scans');
  cacheScan({ id: 'saved-1', label: 'Camera photo', source: 'camera', at: new Date(), result: result('/s/d'), edits: {},
    terms: null, kind: 'sale', party: null, saved: null });
  expect(getScan('saved-1')?.label).toBe('Camera photo');
  updateScan('saved-1', { kind: 'purchase' });
  expect(getScan('saved-1')?.kind).toBe('purchase');
});

test('saves the list and loads it back, without scans whose folder is gone', async () => {
  const first = require('../lib/scans');
  first.addScan({ label: 'Photo from gallery', source: 'gallery', result: result('/s/a') });
  first.addScan({ label: 'Sample 0007', source: 'sample', sampleId: 'inv_0007', result: result('/s/b') });
  await flush();
  expect(memoryFs.files.has('file:///docs/recent.json')).toBe(true);
  memoryFs.dirs.add('file:///s/b'); // the system kept only b's folder
  jest.resetModules();
  const second = require('../lib/scans');
  expect(second.recentScans()).toEqual([]);
  await second.loadRecent();
  const loaded = second.recentScans();
  expect(loaded).toHaveLength(1);
  expect(loaded[0].label).toBe('Sample 0007');
  expect(loaded[0].sampleId).toBe('inv_0007');
  expect(loaded[0].at).toBeInstanceOf(Date);
  expect(loaded[0].result.reads[0].text).toBe('0007655');
});

test('a scan keeps its session, in recent.json too; one kept before camera first has none', async () => {
  // recent.json as design B wrote it: a scan from before camera first
  const old = { id: 'old-4', label: 'Camera photo', source: 'camera', at: '2026-11-20T01:00:00.000Z', result: result('/s/old') };
  memoryFs.files.set(RECENT, JSON.stringify([old]));
  memoryFs.dirs.add('file:///s/old');
  const first = require('../lib/scans');
  await first.loadRecent();
  const id = first.addScan({ label: 'Camera photo', source: 'camera', result: result('/s/a'), session: SESSION });
  const sample = first.addScan({ label: 'Sample 0007', source: 'sample', sampleId: 'inv_0007', result: result('/s/c') });
  expect(first.getScan(id).session).toBe(SESSION);
  expect(first.getScan(sample).session).toBeUndefined(); // a sample is never part of a session
  await flush();
  const kept: { id: string; session?: string }[] = JSON.parse(memoryFs.files.get(RECENT) as string);
  expect(kept.map((s) => s.id)).toEqual([sample, id, 'old-4']);
  expect(kept[1].session).toBe(SESSION);
  expect(kept[0]).not.toHaveProperty('session');
  expect(kept[2]).not.toHaveProperty('session');

  memoryFs.dirs.add('file:///s/a');
  memoryFs.dirs.add('file:///s/c');
  jest.resetModules();
  const second = require('../lib/scans');
  await second.loadRecent();
  expect(second.getScan(id).session).toBe(SESSION);
  expect(second.getScan('old-4')).toMatchObject(UNTOUCHED);
  expect(second.getScan('old-4').session).toBeUndefined();
});

test("a queued photo's scan keeps the time the photo was taken, not the time it was read (ruling P-F2)", async () => {
  const { addScan, getScan } = require('../lib/scans');
  const taken = new Date(2026, 10, 24, 9, 41, 7);
  const id = addScan({ label: 'Camera photo', source: 'camera', result: result('/s/a'), session: SESSION, at: taken });
  expect(getScan(id).at).toEqual(taken);
  await flush();
  expect(JSON.parse(memoryFs.files.get(RECENT) as string)[0].at).toBe(taken.toISOString());
});

test('scansWritten waits until recent.json holds the scan just added', async () => {
  const { addScan, scansWritten, updateScan } = require('../lib/scans');
  await expect(scansWritten()).resolves.toBe(true); // nothing to write yet
  const a = addScan({ label: 'Camera photo', source: 'camera', result: result('/s/a'), session: SESSION });
  const b = addScan({ label: 'Camera photo', source: 'camera', result: result('/s/b'), session: SESSION });
  expect(recentIds()).toEqual([]); // still being written
  await expect(scansWritten()).resolves.toBe(true);
  expect(recentIds()).toEqual([b, a]);

  // a write that fails: it says so (ruling T2-2), so the queue keeps the photo; the next change is written
  const { File } = require('expo-file-system'); // the one lib/jsonFile uses until the next reset
  jest.spyOn(File.prototype, 'write').mockRejectedValueOnce(new Error('No space left on device'));
  const c = addScan({ label: 'Camera photo', source: 'camera', result: result('/s/c'), session: SESSION });
  await expect(scansWritten()).resolves.toBe(false);
  expect(recentIds()).toEqual([b, a]);
  updateScan(c, { kind: 'purchase' });
  await expect(scansWritten()).resolves.toBe(true); // the latest write holds every change so far, c's too
  expect(recentIds()).toEqual([c, b, a]);
});

test('a scan given a time that is no time is kept as of now; recent.json is still written (ruling T2-1)', async () => {
  const { addScan, getScan, scansWritten, updateScan } = require('../lib/scans');
  const before = Date.now();
  const bad = addScan({ label: 'Camera photo', source: 'camera', result: result('/s/a'), session: SESSION, at: new Date(NaN) });
  const { at } = getScan(bad);
  expect(at.getTime()).toBeGreaterThanOrEqual(before);
  expect(at.getTime()).toBeLessThanOrEqual(Date.now());
  await expect(scansWritten()).resolves.toBe(true);
  // and every later change is written too
  const next = addScan({ label: 'Camera photo', source: 'camera', result: result('/s/b'), session: SESSION });
  updateScan(bad, { kind: 'purchase' });
  await expect(scansWritten()).resolves.toBe(true);
  expect(recentIds()).toEqual([next, bad]);
  expect(JSON.parse(memoryFs.files.get(RECENT) as string)[1].at).toBe(at.toISOString());
});

test('recent.json is read once: a start run again keeps the scans in memory, which can be ahead of it (ruling P-F1)', async () => {
  // recent.json as the last run left it
  const old = { id: 'old-5', label: 'Camera photo', source: 'camera', at: '2026-11-20T01:00:00.000Z', result: result('/s/old') };
  memoryFs.files.set(RECENT, JSON.stringify([old]));
  memoryFs.dirs.add('file:///s/old');
  const s = require('../lib/scans');
  await s.loadRecent(); // the start
  const id = s.addScan({ label: 'Camera photo', source: 'camera', result: result('/s/a'), session: SESSION }); // the queue's
  expect(recentIds()).toEqual(['old-5']); // its write is still under way
  // a font-size or display-size change runs the start again, in the same JS context (the plan's call 24)
  await s.loadRecent();
  expect(s.recentScans().map((scan: { id: string }) => scan.id)).toEqual([id, 'old-5']);
  await expect(s.scansWritten()).resolves.toBe(true);
  expect(recentIds()).toEqual([id, 'old-5']);

  // the next start reads it
  memoryFs.dirs.add('file:///s/a');
  jest.resetModules();
  const next = require('../lib/scans');
  await next.loadRecent();
  expect(next.recentScans().map((scan: { id: string }) => scan.id)).toEqual([id, 'old-5']);
});

test('deleting an unsaved scan forgets it and its folder; a saved one is refused', async () => {
  const { addScan, deleteScan, getScan, recentScans, scansWritten, subscribeRecent, updateScan } = require('../lib/scans');
  /** A scan whose files are in the folder given, as the core writes them. */
  const scanned = (dir: string): ScanResult => {
    const r = result(dir);
    for (const uri of [r.pageUri, r.originalUri, ...r.reads.map((b) => b.cropUri)]) memoryFs.files.set(uri!, 'image');
    return r;
  };
  const filesIn = (dir: string) => [...memoryFs.files.keys()].filter((k) => k.startsWith(`${dir}/`));
  // two scans in the scanner's own folders, files/scans/<ms>/ (Paths.document is file:///docs/ here)
  const GONE = 'file:///docs/scans/1795000000001';
  const KEPT = 'file:///docs/scans/1795000000002';
  const gone = addScan({ label: 'Camera photo', source: 'camera', result: scanned(GONE), session: SESSION });
  const kept = addScan({ label: 'Camera photo', source: 'camera', result: scanned(KEPT), session: SESSION });
  const keptFiles = filesIn(KEPT);
  expect(keptFiles.length).toBeGreaterThan(0);
  const listener = jest.fn();
  subscribeRecent(listener);

  deleteScan(gone);
  expect(getScan(gone)).toBeUndefined();
  expect(recentScans().map((s: { id: string }) => s.id)).toEqual([kept]);
  expect(listener).toHaveBeenCalled();
  expect(filesIn(GONE)).toEqual([]);
  expect(filesIn(KEPT)).toEqual(keptFiles); // only its own folder
  await scansWritten();
  expect(recentIds()).toEqual([kept]);

  // a scan that kept no files: forgotten, and nothing on disk goes; a folder that isn't one of the scanner's is never
  // deleted
  const none = addScan({ label: 'Camera photo', source: 'camera', result: parseScanResult(coreJson('inv_0007', null)) });
  deleteScan(none);
  expect(getScan(none)).toBeUndefined();
  const ELSEWHERE = 'file:///s/e';
  const elsewhere = addScan({ label: 'Camera photo', source: 'camera', result: scanned(ELSEWHERE) });
  const elsewhereFiles = filesIn(ELSEWHERE);
  deleteScan(elsewhere);
  expect(getScan(elsewhere)).toBeUndefined();
  expect(filesIn(ELSEWHERE)).toEqual(elsewhereFiles);
  expect(filesIn(KEPT)).toEqual(keptFiles);

  // a saved one is refused: its folder is under saved/ now, and deleteSaved is its way out
  updateScan(kept, { saved: { savedAt: '2026-11-24T01:41:00.000Z', details: { account: '1205' } } });
  expect(() => deleteScan(kept)).toThrow('saved');
  expect(getScan(kept)).toBeDefined();
  expect(filesIn(KEPT)).toEqual(keptFiles);

  deleteScan('missing'); // no such scan: nothing to do
  await scansWritten();
  expect(recentIds()).toEqual([kept]);
});

test("only the scanner's own numbered folder is ever deleted, never one a dot segment resolves above it (ruling T2-3)", async () => {
  const { addScan, deleteScan, getScan, scansWritten } = require('../lib/scans');
  const { Directory } = require('expo-file-system'); // the one lib/scans uses until the next reset
  // On the phone, expo-file-system resolves ".", ".." and "%2e%2e" in a folder's URI: files/scans/ itself, or the
  // app's whole files folder, which exist. This file system doesn't, so each folder exists here.
  jest.spyOn(Directory.prototype, 'exists', 'get').mockReturnValue(true);
  const del = jest.spyOn(Directory.prototype, 'delete');
  const dirs = [
    ...['..', '.', '%2e%2e', '%2E.', '1/2'].map((name) => `file:///docs/scans/${name}`),
    'file:///s/scans/1795000000004', // numbered, but not in the app's files/scans/
  ];
  for (const dir of dirs) {
    const id = addScan({ label: 'Camera photo', source: 'camera', result: result(dir) });
    deleteScan(id);
    expect(getScan(id)).toBeUndefined(); // forgotten all the same
  }
  expect(del).not.toHaveBeenCalled();

  // the scanner's own folder, named by its time in ms, is
  const id = addScan({ label: 'Camera photo', source: 'camera', result: result('file:///docs/scans/1795000000003') });
  deleteScan(id);
  expect(del).toHaveBeenCalledTimes(1);
  expect(del.mock.contexts[0]).toMatchObject({ uri: 'file:///docs/scans/1795000000003/' });
  await scansWritten();
  jest.restoreAllMocks();
});
