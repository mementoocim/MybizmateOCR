import { parseScanResult } from '../modules/scanner/src/parse';
import { coreJson } from '../test-utils/coreJson';
import { memoryFs } from '../test-utils/memoryFs';
import { pinToday } from '../test-utils/today';

jest.mock('expo-file-system', () => require('../test-utils/memoryFs').memoryFs.module);

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

/** A camera scan of Sample 0007 whose files are in the scanner's folder, as the core writes them. */
function cameraScan(m: Modules): string {
  const result = parseScanResult(coreJson('inv_0007', SCAN_DIR));
  for (const uri of [result.pageUri, result.originalUri, ...result.reads.map((r) => r.cropUri)]) {
    memoryFs.files.set(uri!, 'image');
  }
  return m.scans.addScan({ label: 'Camera photo', source: 'camera', result });
}

beforeAll(() => pinToday(new Date(2026, 10, 18, 10, 0)));
afterAll(() => jest.useRealTimers());

beforeEach(() => {
  memoryFs.reset();
  jest.resetModules();
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

test('the account used becomes the default', async () => {
  const m = load();
  const id = cameraScan(m);
  await m.saved.saveScan(id, DETAILS);
  expect(m.settings.settings()).toMatchObject({ revenueAccount: '4010', atc: 'WC158' });
});

test('a sample is never saved', async () => {
  const m = load();
  const id = m.scans.addScan({ label: 'Sample 0007', source: 'sample', result: parseScanResult(coreJson('inv_0007')) });
  await expect(m.saved.saveScan(id, DETAILS)).rejects.toThrow('sample');
  expect(m.saved.savedList()).toHaveLength(0);
});
