import type { ScanResult } from '../modules/scanner';
import { parseScanResult } from '../modules/scanner/src/parse';
import { coreJson } from '../test-utils/coreJson';
import { memoryFs } from '../test-utils/memoryFs';

jest.mock('expo-file-system', () => require('../test-utils/memoryFs').memoryFs.module);

const flush = () => new Promise<void>((resolve) => setTimeout(() => resolve(), 0));

function result(dir: string): ScanResult {
  return parseScanResult(coreJson('inv_0007', dir));
}

beforeEach(() => {
  memoryFs.reset();
  jest.resetModules();
});

test('keeps the newest 6, newest first', () => {
  const { addScan, getScan, recentScans } = require('../lib/scans');
  const ids = [1, 2, 3, 4, 5, 6, 7].map((i) => addScan({ label: `Scan ${i}`, source: 'gallery', result: result(`/s/${i}`) }));
  const recent = recentScans();
  expect(recent).toHaveLength(6);
  expect(recent[0].label).toBe('Scan 7');
  expect(recent[5].label).toBe('Scan 2');
  expect(getScan(ids[0])).toBeUndefined();
  expect(getScan(ids[6])?.label).toBe('Scan 7');
});

test('edits, terms, kind and party are kept, and come back after a restart', async () => {
  const first = require('../lib/scans');
  const listener = jest.fn();
  first.subscribeRecent(listener);
  const id = first.addScan({ label: 'Camera photo', source: 'camera', result: result('/s/a') });
  expect(first.getScan(id)).toMatchObject({ edits: {}, terms: null, kind: 'sale', party: null, saved: null });
  first.setEdit(id, 'date', ' 10/21/2026 ');
  first.updateScan(id, { terms: 'cash', kind: 'purchase', party: { name: 'Isabela Wholesale Trading' } });
  expect(listener).toHaveBeenCalledTimes(3);
  await flush();
  memoryFs.dirs.add('file:///s/a');
  jest.resetModules();
  const second = require('../lib/scans');
  await second.loadRecent();
  expect(second.getScan(id)).toMatchObject({
    edits: { date: '10/21/2026' },
    terms: 'cash',
    kind: 'purchase',
    party: { name: 'Isabela Wholesale Trading' },
    saved: null,
  });
});

test('a scan saved by milestone 2 loads with no edits, as a sale', async () => {
  const old = { id: 'old-1', label: 'Photo from gallery', source: 'gallery', at: '2026-11-20T01:00:00.000Z', result: result('/s/old') };
  memoryFs.files.set('file:///docs/recent.json', JSON.stringify([old]));
  memoryFs.dirs.add('file:///s/old');
  const { loadRecent, getScan } = require('../lib/scans');
  await loadRecent();
  expect(getScan('old-1')).toMatchObject({ edits: {}, terms: null, kind: 'sale', party: null, saved: null });
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

test('a saved scan opened from Saved invoices can be found and changed', () => {
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
