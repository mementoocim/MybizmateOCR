import { parseScanResult } from '../modules/scanner/src/parse';
import { coreJson } from '../test-utils/coreJson';
import { memoryFs } from '../test-utils/memoryFs';
import { pinToday } from '../test-utils/today';

let mockTeam = false;

jest.mock('expo-file-system', () => require('../test-utils/memoryFs').memoryFs.module);
jest.mock('../lib/build', () => ({
  get TEAM_BUILD() {
    return mockTeam;
  },
}));

// The made-up lists (fixtures/lists): Sample 0007's customer, Torres Construction Supply, is C012 there.
const PARTIES: string = require('fs').readFileSync('fixtures/lists/parties.csv', 'utf8');
const DETAILS = { taxType: 'VAT', account: '4010', terms: 'account', atc: 'WC158' } as const;
const SCAN_DIR = 'file:///docs/scans/123';

type Modules = {
  scans: typeof import('../lib/scans');
  saved: typeof import('../lib/saved');
  lists: typeof import('../lib/lists');
  settings: typeof import('../lib/settings');
};
const load = (): Modules => ({
  scans: require('../lib/scans'),
  saved: require('../lib/saved'),
  lists: require('../lib/lists'),
  settings: require('../lib/settings'),
});

/**
 * A camera scan of Sample 0007 whose files are in the scanner's folder, as the core writes them; taken in a session, or
 * before camera first.
 */
function cameraScan(m: Modules, dir = SCAN_DIR, session?: string): string {
  const result = parseScanResult(coreJson('inv_0007', dir));
  for (const uri of [result.pageUri, result.originalUri, ...result.reads.map((r) => r.cropUri)]) {
    memoryFs.files.set(uri!, 'image');
  }
  return m.scans.addScan({ label: 'Camera photo', source: 'camera', result, session });
}

beforeAll(() => pinToday(new Date(2026, 10, 18, 10, 0)));
afterAll(() => jest.useRealTimers());

beforeEach(() => {
  memoryFs.reset();
  jest.resetModules();
  mockTeam = false;
});

test("saving moves the scan's folder out of scans/ and rewrites its files' URIs", async () => {
  const m = load();
  await m.lists.importPartiesCsv(PARTIES, 'customer');
  const id = cameraScan(m);
  await m.saved.saveScan(id, DETAILS);
  const r = m.scans.getScan(id)!.result;
  const folder = `file:///docs/saved/${id}`;
  for (const uri of [r.scanDir, r.pageUri, r.originalUri, ...r.reads.map((b) => b.cropUri)]) {
    expect(uri!.startsWith(folder)).toBe(true);
  }
  expect(memoryFs.files.has(r.pageUri!)).toBe(true);
  expect([...memoryFs.files.keys()].some((k) => k.startsWith(`${SCAN_DIR}/`))).toBe(false);
  expect(memoryFs.files.has(`${folder}/scan.json`)).toBe(true);
  expect(m.scans.getScan(id)!.saved).toMatchObject({ details: DETAILS });
});

test("a scan whose folder isn't one of the scanner's numbered folders is saved where it is: nothing moves (ruling T2-3)", async () => {
  const m = load();
  const { Directory } = require('expo-file-system'); // the one lib/saved uses until the next reset
  const move = jest.spyOn(Directory.prototype, 'move');
  // on the phone, a "." or ".." (or "%2e%2e") in a folder's URI resolves to files/scans/ itself, or the files above it
  for (const dir of ['..', '.', '%2e%2e'].map((name) => `file:///docs/scans/${name}`)) {
    const id = cameraScan(m, dir);
    await m.saved.saveScan(id, DETAILS); // as a scan that kept no files is
    expect(m.scans.getScan(id)!.result.scanDir).toBe(dir);
    expect(m.saved.savedSummary(id)).toBeDefined();
  }
  expect(move).not.toHaveBeenCalled();
  jest.restoreAllMocks();
});

test('the summary', async () => {
  const m = load();
  await m.lists.importPartiesCsv(PARTIES, 'customer');
  const id = cameraScan(m);
  await m.saved.saveScan(id, DETAILS);
  const summary = m.saved.savedList()[0];
  expect(summary).toMatchObject({
    id,
    kind: 'sale',
    label: 'Camera photo',
    partyName: 'Torres Construction Supply',
    listed: true,
    exportedAt: null,
  });
  expect(summary.partyId).toBe(m.lists.lists().parties.find((p) => p.code === 'C012')!.id);
  if (summary.kind === '2307') throw new Error('an invoice, not a 2307');
  expect(summary.row['Customer *']).toBe('C012');
  expect(summary.date).toBe(summary.row['Date *']);
  expect(summary.gross).toBe(summary.row['Gross *']);
  expect(m.saved.savedSummary(id)).toEqual(summary);
});

test('saving again keeps the export date', async () => {
  const m = load();
  const id = cameraScan(m);
  await m.saved.saveScan(id, DETAILS);
  await m.saved.markExported([id], new Date(2026, 10, 19, 9, 0));
  const exportedAt = m.saved.savedSummary(id)!.exportedAt;
  expect(exportedAt).not.toBeNull();
  m.scans.updateScan(id, { kind: 'purchase', party: { various: true } });
  await m.saved.saveScan(id, { ...DETAILS, account: 'Purchases' });
  expect(m.saved.savedSummary(id)).toMatchObject({ kind: 'purchase', exportedAt });
  expect(m.saved.savedList()).toHaveLength(1);
});

test('a save cut short is found again', async () => {
  const first = load();
  const id = cameraScan(first);
  await first.saved.saveScan(id, DETAILS);
  memoryFs.files.delete('file:///docs/saved.json'); // killed before the summary was written
  jest.resetModules();
  const again = load();
  await again.saved.loadSaved();
  expect(again.saved.savedList().map((s) => s.id)).toEqual([id]);
});

test('openSaved and deleteSaved', async () => {
  const first = load();
  const id = cameraScan(first);
  await first.saved.saveScan(id, DETAILS);
  jest.resetModules();
  const again = load();
  await again.saved.loadSaved();
  expect(again.scans.getScan(id)).toBeUndefined();
  const scan = await again.saved.openSaved(id);
  expect(scan!.at).toBeInstanceOf(Date);
  expect(again.scans.getScan(id)?.saved).toMatchObject({ details: DETAILS });
  expect(await again.saved.openSaved('missing')).toBeNull();
  await again.saved.deleteSaved(id);
  expect(again.saved.savedSummary(id)).toBeUndefined();
  expect(again.scans.getScan(id)).toBeUndefined();
  expect([...memoryFs.files.keys()].some((k) => k.startsWith(`file:///docs/saved/${id}/`))).toBe(false);
});

test("a delete writes saved.json first: one that can't be written keeps the scan, here as at the next start (final review, Important 2)", async () => {
  const m = load();
  const { File } = require('expo-file-system'); // this registry's, as lib/jsonFile has it
  const id = cameraScan(m);
  await m.saved.saveScan(id, DETAILS);
  const listener = jest.fn();
  m.saved.subscribeSaved(listener);
  // a full phone: no file can be written. The caller hears it (the snackbar says so: lib/confirmDelete), and Saved
  // still lists it, as saved.json does
  const write = jest.spyOn(File.prototype, 'write').mockRejectedValue(new Error('No space left on device'));
  await expect(m.saved.deleteSaved(id)).rejects.toThrow('No space left on device');
  expect(m.saved.savedSummary(id)).toBeDefined();
  expect(m.scans.getScan(id)).toBeDefined();
  expect(listener).not.toHaveBeenCalled();
  // with room again, it goes
  write.mockRestore();
  await m.saved.deleteSaved(id);
  expect(m.saved.savedSummary(id)).toBeUndefined();
  expect(m.scans.getScan(id)).toBeUndefined();
  expect(listener).toHaveBeenCalledTimes(1);
});

test('a scan saved before PDFs opens as a photo', async () => {
  const first = load();
  const id = cameraScan(first);
  await first.saved.saveScan(id, DETAILS);
  // its scan.json as milestone 3 wrote it: no source, pageCount, picture or fromText in its result
  const file = `file:///docs/saved/${id}/scan.json`;
  const kept = JSON.parse(memoryFs.files.get(file) as string);
  delete kept.result.source;
  delete kept.result.pageCount;
  delete kept.result.picture;
  for (const b of kept.result.reads) delete b.fromText;
  memoryFs.files.set(file, JSON.stringify(kept));
  jest.resetModules();
  const again = load();
  await again.saved.loadSaved();
  const scan = await again.saved.openSaved(id);
  expect(scan!.result).toMatchObject({ source: 'photo', pageCount: null, picture: null });
  expect(scan!.result.reads).toHaveLength(45);
  expect(scan!.result.reads.every((b) => b.fromText === false)).toBe(true);
});

test("an old saved scan loads and isn't training data", async () => {
  const first = load();
  const ids = [cameraScan(first), cameraScan(first, 'file:///docs/scans/124')];
  for (const id of ids) await first.saved.saveScan(id, DETAILS);
  // their scan.json as milestones 3 and 5 wrote them: no checked boxes, annotation, source tag, test image, versions
  // or saved marks, and milestone 3's result had no PDF fields either
  ids.forEach((id, i) => {
    const file = `file:///docs/saved/${id}/scan.json`;
    const kept = JSON.parse(memoryFs.files.get(file) as string);
    for (const field of ['confirmed', 'annotated', 'tag', 'testImage', 'made', 'savedMarks']) delete kept[field];
    if (i === 0) {
      delete kept.result.source;
      delete kept.result.pageCount;
      delete kept.result.picture;
      for (const b of kept.result.reads) delete b.fromText;
    }
    memoryFs.files.set(file, JSON.stringify(kept));
  });
  jest.resetModules();
  const again = load();
  const { trainingRecord } = require('../lib/training/record') as typeof import('../lib/training/record');
  await again.saved.loadSaved();
  expect(again.saved.savedList().map((s) => s.id).sort()).toEqual([...ids].sort());
  for (const id of ids) {
    const scan = await again.saved.openSaved(id);
    expect(scan).toMatchObject({ confirmed: [], annotated: false, tag: null, testImage: false, savedMarks: '' });
    expect(scan!.result.reads.every((b) => b.fromText === false)).toBe(true);
    expect(trainingRecord(scan!, again.lists.lists(), again.settings.settings())).toBeNull(); // it exports nothing
  }
});

test('in annotation mode a scan saves once its boxes are checked, with its codes and only codes', async () => {
  mockTeam = true;
  const m = load();
  const { uncheckedBoxes } = require('../lib/training/boxes') as typeof import('../lib/training/boxes');
  await m.settings.updateSettings({ annotation: true });
  const id = cameraScan(m);
  const tag = { client: 'c014', writer: 'w03' };
  await expect(m.saved.saveScan(id, DETAILS, tag)).rejects.toThrow('unchecked');
  uncheckedBoxes(m.scans.getScan(id)!).forEach((box) => m.scans.confirmBox(id, box));
  // a source tag is two codes: none, or a name, and nothing is saved
  await expect(m.saved.saveScan(id, DETAILS)).rejects.toThrow('no_tag');
  await expect(m.saved.saveScan(id, DETAILS, { client: 'Juan Cruz', writer: 'W03' })).rejects.toThrow('no_tag');
  expect(m.saved.savedList()).toHaveLength(0);
  expect(m.scans.getScan(id)!.saved).toBeNull();
  await m.saved.saveScan(id, DETAILS, tag);
  const kept = { annotated: true, tag: { client: 'C014', writer: 'W03' } };
  expect(m.scans.getScan(id)).toMatchObject(kept);
  expect(m.settings.settings()).toMatchObject({ clientCode: 'C014', writerCode: 'W03', revenueAccount: '4010' });
  // kept in scan.json: after a restart it opens annotated, with its tag
  jest.resetModules();
  const again = load();
  await again.settings.loadSettings();
  await again.saved.loadSaved();
  expect(await again.saved.openSaved(id)).toMatchObject({ ...kept, testImage: false });

  // saved again with the mode off: no longer annotated, and its tag goes
  await again.settings.updateSettings({ annotation: false });
  await again.saved.saveScan(id, DETAILS, { client: 'C020', writer: 'W09' });
  expect(again.scans.getScan(id)).toMatchObject({ annotated: false, tag: null });
  expect(again.settings.settings()).toMatchObject({ clientCode: 'C014', writerCode: 'W03' });
});

test('the account used becomes the default', async () => {
  const m = load();
  const id = cameraScan(m);
  await m.saved.saveScan(id, DETAILS);
  expect(m.settings.settings()).toMatchObject({ revenueAccount: '4010', atc: 'WC158' });
});

test("a 2307's summary: checked as a 2307, one import row per payment", async () => {
  const m = load();
  await m.lists.importPartiesCsv(PARTIES, 'customer'); // Castillo Eatery is C013 there
  const id = m.scans.addScan({ label: 'PDF: bir2307_text_1.pdf', source: 'pdf', result: parseScanResult(coreJson('bir2307_text_1')) });
  // a 2307 has no date, terms or total due: an invoice's checks would refuse it
  await m.saved.saveScan(id, { account: '1205' });
  expect(m.scans.getScan(id)).toMatchObject({ kind: '2307', saved: { details: { account: '1205' } } });
  const summary = m.saved.savedList()[0];
  expect(summary).toMatchObject({
    id,
    kind: '2307',
    label: 'PDF: bir2307_text_1.pdf',
    partyName: 'Castillo Eatery',
    listed: true,
    date: '2026-12-31',
    period: 'Q4 2026',
    tax: 57400.54, // the rows' tax withheld: ₱47,937.78 on income payments, ₱9,462.76 on business tax
    exportedAt: null,
  });
  expect(summary.partyId).toBe(m.lists.lists().parties.find((p) => p.code === 'C013')!.id);
  if (summary.kind !== '2307') throw new Error('not a 2307');
  expect(summary.rows.map((r) => [r['Customer *'], r['CWT IT'] ?? r['CWT VT'], r['Offset Account *']])).toEqual([
    ['C013', 'WI050', '1205'],
    ['C013', 'WI160', '1205'],
    ['C013', 'WI120', '1205'],
    ['C013', 'WI515', '1205'],
    ['C013', 'WV010', '1205'],
  ]);
  // the offset account becomes the next 2307's; an invoice's accounts and ATC stay as they were
  expect(m.settings.settings()).toMatchObject({ offsetAccount: '1205', revenueAccount: '', expenseAccount: '', atc: '' });
  // an unsure match is only the closest customer: no list party, and the name as written goes out; Saved shows that
  // name, and the export's sheet asks to check it in MyBizMate first
  const unsure = m.scans.addScan({ label: 'PDF: 2307.pdf', source: 'pdf', result: parseScanResult(coreJson('bir2307_text_0')) });
  m.scans.setEdit(unsure, 'payor_name', 'Santos Merchandising');
  m.scans.setEdit(unsure, 'payor_tin', '99988877700000');
  const { certOf } = require('../lib/cert') as typeof import('../lib/cert');
  expect(certOf(m.scans.getScan(unsure)!, m.lists.lists(), m.settings.settings()).payor.status).toBe('unsure');
  await m.saved.saveScan(unsure, { account: '1205' });
  const closest = m.saved.savedSummary(unsure)!;
  expect(closest).toMatchObject({ partyName: 'Santos Merchandising', partyId: null, listed: false });
  expect(m.saved.summaryRows(closest).map((r) => r['Customer *'])).toEqual(['Santos Merchandising', 'Santos Merchandising']);
  const { partiesToCheck } = require('../lib/exportFile') as typeof import('../lib/exportFile');
  expect(partiesToCheck([closest], m.lists.lists())).toEqual(['Santos Merchandising']);
  await m.saved.deleteSaved(unsure);
  // a save cut short is summarised again as a 2307
  memoryFs.files.delete('file:///docs/saved.json');
  jest.resetModules();
  const again = load();
  await again.lists.loadLists();
  await again.saved.loadSaved();
  expect(again.saved.savedList()).toEqual([summary]);
});

test("a save keeps the scan's session in saved.json and scan.json; a summary from before has none, and loads", async () => {
  const first = load();
  const session = '1795000000000-ab12'; // lib/session's newSessionId
  const id = cameraScan(first, SCAN_DIR, session);
  const old = cameraScan(first, 'file:///docs/scans/124'); // as before camera first: no session
  await first.saved.saveScan(id, DETAILS);
  await first.saved.saveScan(old, DETAILS);
  expect(first.saved.savedSummary(id)?.session).toBe(session);
  expect(first.saved.savedSummary(old)?.session).toBeUndefined();
  const index: { id: string; session?: string }[] = JSON.parse(memoryFs.files.get('file:///docs/saved.json') as string);
  expect(index.find((s) => s.id === id)?.session).toBe(session);
  expect(index.find((s) => s.id === old)).not.toHaveProperty('session'); // saved.json as design B wrote it
  const scanJson = (scanId: string) => JSON.parse(memoryFs.files.get(`file:///docs/saved/${scanId}/scan.json`) as string);
  expect(scanJson(id).session).toBe(session);
  expect(scanJson(old)).not.toHaveProperty('session');

  jest.resetModules();
  const again = load();
  await again.saved.loadSaved();
  expect(again.saved.savedList().map((s) => s.id).sort()).toEqual([id, old].sort());
  expect(again.saved.savedSummary(id)?.session).toBe(session);
  expect(again.saved.savedSummary(old)?.session).toBeUndefined();
  expect((await again.saved.openSaved(id))?.session).toBe(session);
  expect(await again.saved.openSaved(old)).toMatchObject({ id: old, saved: { details: DETAILS } });
  expect(again.scans.getScan(old)?.session).toBeUndefined();
});

test('a sample is never saved', async () => {
  const m = load();
  const id = m.scans.addScan({ label: 'Sample 0007', source: 'sample', result: parseScanResult(coreJson('inv_0007')) });
  await expect(m.saved.saveScan(id, DETAILS)).rejects.toThrow('sample');
  expect(m.saved.savedList()).toHaveLength(0);
});
