import type { StoredScan } from '../lib/scans';
import type { TrainingScan } from '../lib/training/record';
import { APP_VERSION } from '../lib/versions';
import { parseScanResult } from '../modules/scanner/src/parse';
import { coreJson } from '../test-utils/coreJson';
import { fixedCrypto } from '../test-utils/fixedCrypto';
import { memoryFs } from '../test-utils/memoryFs';
import { pinToday } from '../test-utils/today';
import { unzipStored } from '../test-utils/unzip';

jest.mock('expo-file-system', () => require('../test-utils/memoryFs').memoryFs.module);
jest.mock('expo-crypto', () => require('../test-utils/fixedCrypto').fixedCrypto.module);
jest.mock('../lib/build', () => ({ TEAM_BUILD: true })); // annotation mode is the team's

// The training-data export: the scans saved in annotation mode and not sent yet, as one zip of their training boxes'
// crops and a manifest of their records. The scans are each form's fixture photographed (the made-up Sales Invoice
// Sample 0051 and Sample 0007, the Service Invoice, and a made-up 2307), with a crop for each box the scanner read.

const DETAILS = { taxType: 'VAT', account: 'Sales Revenue', terms: 'account', atc: 'WC158' } as const;
const CERT = { account: 'Creditable Withholding Tax' };
const TAG = { client: 'C014', writer: 'W03' };
// half past midnight: east of Greenwich, UTC is still on the day before, and the file is named by the phone's own day
// and time
const AT = new Date(2026, 10, 18, 0, 30, 5);
const INDEX = 'file:///docs/saved.json';

type Modules = {
  scans: typeof import('../lib/scans');
  saved: typeof import('../lib/saved');
  settings: typeof import('../lib/settings');
  lists: typeof import('../lib/lists');
  install: typeof import('../lib/install');
  exportFile: typeof import('../lib/exportFile');
  boxes: typeof import('../lib/training/boxes');
  record: typeof import('../lib/training/record');
  exp: typeof import('../lib/training/export');
};
const load = (): Modules => ({
  scans: require('../lib/scans'),
  saved: require('../lib/saved'),
  settings: require('../lib/settings'),
  lists: require('../lib/lists'),
  install: require('../lib/install'),
  exportFile: require('../lib/exportFile'),
  boxes: require('../lib/training/boxes'),
  record: require('../lib/training/record'),
  exp: require('../lib/training/export'),
});

/** The app with annotation mode on and its install ID loaded. */
async function annotationMode(): Promise<Modules> {
  const m = load();
  await m.settings.updateSettings({ annotation: true });
  await m.install.loadInstall();
  return m;
}

const encoder = new TextEncoder();
const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
const sorted = (ids: readonly string[]) => [...ids].sort();
const ids = (scans: readonly { id: string }[]) => scans.map((s) => s.id);

type How = { files?: boolean; testImage?: boolean };
let folders = 0;

/**
 * A fixture photographed, its folder in the scanner's scans/ as the core leaves it: the page, the photo and each box's
 * crop, each file's bytes its own. With files: false, a scan that kept none (no crops).
 */
function scanned(m: Modules, stem: string, how: How = {}): string {
  const dir = how.files === false ? null : `file:///docs/scans/${++folders}`;
  const result = parseScanResult(coreJson(stem, dir));
  if (dir !== null) {
    memoryFs.files.set(result.pageUri!, encoder.encode('the page'));
    memoryFs.files.set(result.originalUri!, encoder.encode('the photo'));
    for (const r of result.reads) memoryFs.files.set(r.cropUri!, encoder.encode(`the crop of ${stem}'s ${r.name}`));
  }
  return m.scans.addScan({ label: 'Camera photo', source: 'camera', result, testImage: how.testImage });
}

/** A fixture saved in annotation mode: each training box confirmed, as the save asks, and the source tag. */
async function saveAnnotated(m: Modules, stem: string, how: How = {}): Promise<string> {
  const id = scanned(m, stem, how);
  m.boxes.uncheckedBoxes(m.scans.getScan(id)!).forEach((box) => m.scans.confirmBox(id, box));
  await m.saved.saveScan(id, m.scans.getScan(id)!.kind === '2307' ? CERT : DETAILS, TAG);
  return id;
}

/** A fixture saved with annotation mode off: its boxes not checked. */
async function savePlain(m: Modules, stem: string): Promise<string> {
  await m.settings.updateSettings({ annotation: false });
  const id = scanned(m, stem);
  await m.saved.saveScan(id, DETAILS);
  return id;
}

/** The scans an export takes now, each with its record. */
async function pendingPairs(m: Modules): Promise<{ record: TrainingScan; scan: StoredScan }[]> {
  const scans = await m.exp.pendingTraining();
  return scans.map((scan) => ({ record: m.record.trainingRecord(scan, m.lists.lists(), m.settings.settings())!, scan }));
}

/** Changes a saved scan's scan.json, as if it had been kept so. */
function rewriteSaved(id: string, change: (kept: Record<string, unknown>) => void): void {
  const file = `file:///docs/saved/${id}/scan.json`;
  const kept = JSON.parse(memoryFs.files.get(file) as string);
  change(kept);
  memoryFs.files.set(file, JSON.stringify(kept));
}

const cropUri = (scan: StoredScan, box: string) => scan.result.reads.find((r) => r.name === box)!.cropUri!;

beforeAll(() => pinToday(new Date(2026, 10, 18, 10, 0)));
afterAll(() => jest.useRealTimers());

beforeEach(() => {
  memoryFs.reset();
  jest.resetModules();
});

test('the zip holds the manifest and each training crop', async () => {
  const m = await annotationMode();
  const sale = await saveAnnotated(m, 'inv_0051');
  const cert = await saveAnnotated(m, 'bir2307_photo_0');
  const pairs = await pendingPairs(m);
  expect(sorted(pairs.map((p) => p.scan.id))).toEqual(sorted([sale, cert]));
  const records = pairs.map((p) => p.record);
  expect(records.map((r) => r.boxes.length > 0)).toEqual([true, true]);
  const crops = records.flatMap((r) => r.boxes.map((b) => b.crop));

  const out = await m.exp.buildTrainingExport(pairs, AT);
  // the phone's date and time to the second, and the install ID's first 4 characters: so one phone's exports a minute
  // apart, or the team's phones' exports on one day, don't share a name
  expect(out.name).toBe('MyBizMate Scan training data 2026-11-18 003005 4a3f.zip');
  const late = await m.exp.buildTrainingExport(pairs, new Date(2026, 10, 18, 23, 59, 59));
  expect(late.name).toBe('MyBizMate Scan training data 2026-11-18 235959 4a3f.zip'); // a 24-hour clock
  expect(out).toMatchObject({ boxes: crops.length, missing: 0 });
  const entries = unzipStored(out.bytes);
  // the manifest, then each training box's crop at its record's path: nothing else
  expect(entries.map((e) => e.name)).toEqual(['manifest.json', ...crops]);
  expect(entries.every((e) => e.crcOk)).toBe(true);
  expect(m.exp.TRAINING_FORMAT).toEqual({ format: 'mybizmate-scan-training', version: 1 });
  expect(JSON.parse(text(entries[0].data))).toEqual({
    format: 'mybizmate-scan-training',
    version: 1,
    exportedAt: AT.toISOString(),
    installId: fixedCrypto.uuid,
    app: APP_VERSION,
    missing: 0,
    scans: records,
  });
  // each crop is its box's own file, from the saved scan's folder
  for (const { record, scan } of pairs) {
    for (const box of record.boxes) {
      const uri = cropUri(scan, box.name);
      expect(uri.startsWith(`file:///docs/saved/${scan.id}/`)).toBe(true);
      expect([box.crop, entries.find((e) => e.name === box.crop)!.data]).toEqual([box.crop, memoryFs.files.get(uri)]);
    }
  }
});

test('no personal box is exported', async () => {
  const m = await annotationMode();
  for (const stem of ['inv_0051', 'svc_0000', 'bir2307_photo_0']) await saveAnnotated(m, stem);
  const pairs = await pendingPairs(m);
  expect(sorted(pairs.map((p) => p.scan.result.form!))).toEqual(['bir_2307', 'sales_invoice', 'service_invoice']);
  const entries = unzipStored((await m.exp.buildTrainingExport(pairs, AT)).bytes);
  const manifestText = text(entries[0].data);
  const manifest = JSON.parse(manifestText) as { scans: TrainingScan[] };
  const contents = entries.map((e) => text(e.data));
  for (const { scan } of pairs) {
    const form = scan.result.form!;
    const personal = scan.result.reads.filter((r) => m.boxes.PERSONAL[form].has(r.name));
    expect([form, personal.length > 0]).toEqual([form, true]); // each with its crop on the phone
    const exported = manifest.scans.find((s) => s.id === scan.id)!;
    for (const r of personal) {
      const crop = text(memoryFs.files.get(r.cropUri!) as Uint8Array);
      expect([r.name, entries.some((e) => e.name.endsWith(`/${r.name}.png`)), contents.includes(crop)]).toEqual([
        r.name,
        false,
        false,
      ]);
      expect(exported.boxes.map((b) => b.name)).not.toContain(r.name);
      // what's written in it: the names, TINs and addresses (a ZIP's 4 digits could turn up inside any number)
      if (!r.name.endsWith('_zip')) expect(manifestText).not.toContain(r.text);
    }
  }
  // nor anything outside the boxes: not the page, not the photo
  expect(contents).not.toContain('the page');
  expect(contents).not.toContain('the photo');
});

test('only annotated saves are exported', async () => {
  const m = await annotationMode();
  const sale = await saveAnnotated(m, 'inv_0051');
  const cert = await saveAnnotated(m, 'bir2307_photo_0');
  await saveAnnotated(m, 'inv_0007', { testImage: true }); // the camera's test hook: saved, never training data
  // a sample is never saved; this one's scan.json says it is one, as if it had been
  const sample = await saveAnnotated(m, 'svc_0000');
  rewriteSaved(sample, (kept) => {
    kept.source = 'sample';
  });
  // the mode turned off: the annotated scans stay, and a later scan saved without it, unchecked, stays out
  await m.settings.updateSettings({ annotation: false });
  const plain = await savePlain(m, 'svc_0000');
  expect(m.scans.getScan(plain)).toMatchObject({ annotated: false, saved: { details: DETAILS } });
  expect(sorted(ids(await m.exp.pendingTraining()))).toEqual(sorted([sale, cert]));

  // a change made after the last save stays in the app's memory: the export has the scan as it was saved
  m.scans.setEdit(sale, 'item1_qty', '9');
  expect(m.scans.getScan(sale)!.edits).toEqual({ item1_qty: '9' });
  const kept = (await m.exp.pendingTraining()).find((s) => s.id === sale)!;
  expect([kept.edits, kept.confirmed]).toEqual([{}, m.boxes.trainingBoxes(kept).map((r) => r.name)]);

  // a scan marked exported is left out of the next export, after a restart too
  await m.saved.markTrainingExported([sale], AT);
  expect(ids(await m.exp.pendingTraining())).toEqual([cert]);
  jest.resetModules();
  const again = load();
  await again.saved.loadSaved();
  expect(ids(await again.exp.pendingTraining())).toEqual([cert]);
});

test("a training export's mark is its own", async () => {
  const m = await annotationMode();
  const sale = await saveAnnotated(m, 'inv_0051');
  const cert = await saveAnnotated(m, 'bir2307_photo_0');
  const SALES_DAY = new Date(2026, 10, 19, 9, 0);
  await m.saved.markTrainingExported([sale], AT);
  expect(m.saved.savedSummary(sale)).toMatchObject({ trainingExportedAt: AT.toISOString(), exportedAt: null });
  expect(m.saved.savedSummary(cert)).toMatchObject({ trainingExportedAt: null, exportedAt: null });
  // the import files take no notice of it: the sale is still to export to MyBizMate
  expect(ids(m.exportFile.exportChoice('sale', 'new', AT))).toEqual([sale]);
  await m.saved.markExported([sale, cert], SALES_DAY);
  expect(m.saved.savedSummary(sale)).toMatchObject({
    trainingExportedAt: AT.toISOString(),
    exportedAt: SALES_DAY.toISOString(),
  });
  // and they don't take a scan out of the training export
  expect(ids(await m.exp.pendingTraining())).toEqual([cert]);
  // saved again with the mode off, it keeps both marks; it's no longer annotated, so it isn't training data either way
  await m.settings.updateSettings({ annotation: false });
  m.scans.setEdit(sale, 'item1_qty', '3');
  await m.saved.saveScan(sale, DETAILS);
  expect(m.scans.getScan(sale)).toMatchObject({ annotated: false, tag: null });
  expect(m.saved.savedSummary(sale)).toMatchObject({
    trainingExportedAt: AT.toISOString(),
    exportedAt: SALES_DAY.toISOString(),
  });
  expect(ids(await m.exp.pendingTraining())).toEqual([cert]);

  // a summary kept before milestone 4 has no training mark: it loads as not sent
  await m.saved.markTrainingExported([cert], AT);
  expect(await m.exp.pendingTraining()).toEqual([]);
  const index = JSON.parse(memoryFs.files.get(INDEX) as string);
  for (const s of index) delete s.trainingExportedAt;
  memoryFs.files.set(INDEX, JSON.stringify(index));
  jest.resetModules();
  const again = load();
  await again.saved.loadSaved();
  for (const id of [sale, cert]) {
    expect(again.saved.savedSummary(id)).toMatchObject({ trainingExportedAt: null, exportedAt: SALES_DAY.toISOString() });
  }
  expect(ids(await again.exp.pendingTraining())).toEqual([cert]);
});

test('a save in annotation mode sends the scan again, with its labels as now checked', async () => {
  const first = await annotationMode();
  const sale = await saveAnnotated(first, 'inv_0051');
  const cert = await saveAnnotated(first, 'bir2307_photo_0');
  const SALES_DAY = new Date(2026, 10, 19, 9, 0);
  await first.saved.markTrainingExported([sale, cert], AT);
  await first.saved.markExported([sale], SALES_DAY);
  expect(await first.exp.pendingTraining()).toEqual([]);

  // later: the sale opened again, a box corrected, and saved again in annotation mode
  jest.resetModules();
  const m = load();
  await m.settings.loadSettings();
  await m.install.loadInstall();
  await m.saved.loadSaved();
  expect([m.settings.annotationOn(), m.scans.getScan(sale)]).toEqual([true, undefined]);
  await m.saved.openSaved(sale);
  m.scans.setEdit(sale, 'item1_qty', '3'); // read 2
  await m.saved.saveScan(sale, DETAILS, TAG);
  // its training mark goes, so the next export sends it again; the import file's mark stays
  expect(m.saved.savedSummary(sale)).toMatchObject({ trainingExportedAt: null, exportedAt: SALES_DAY.toISOString() });
  const pairs = await pendingPairs(m);
  expect(pairs.map((p) => p.scan.id)).toEqual([sale]);
  expect(pairs[0].record.boxes.find((b) => b.name === 'item1_qty')).toMatchObject({
    reading: '2',
    label: '3',
    edited: true,
    confirmed: true,
  });
  // the other scan stays sent
  expect(m.saved.savedSummary(cert)).toMatchObject({ trainingExportedAt: AT.toISOString() });
});

test('a missing crop is left out and counted', async () => {
  const m = await annotationMode();
  const sale = await saveAnnotated(m, 'inv_0051');
  const service = await saveAnnotated(m, 'svc_0000', { files: false }); // it kept no files: no crop at all
  const pairs = await pendingPairs(m);
  const pairOf = (id: string) => pairs.find((p) => p.scan.id === id)!;
  const saleBoxes = pairOf(sale).record.boxes;
  const serviceRecord = pairOf(service).record;
  expect(serviceRecord.boxes.length).toBeGreaterThan(0);
  // one crop's file is gone (a folder deleted or moved)
  const gone = saleBoxes[1];
  memoryFs.files.delete(cropUri(pairOf(sale).scan, gone.name));
  const before = JSON.stringify(pairs.map((p) => p.record));

  const out = await m.exp.buildTrainingExport(pairs, AT);
  const missing = 1 + serviceRecord.boxes.length;
  expect(out).toMatchObject({ boxes: saleBoxes.length - 1, missing });
  const entries = unzipStored(out.bytes);
  const manifest = JSON.parse(text(entries[0].data)) as { missing: number; scans: TrainingScan[] };
  expect(manifest.missing).toBe(missing);
  const kept = saleBoxes.filter((b) => b.name !== gone.name);
  expect(manifest.scans.find((s) => s.id === sale)!.boxes).toEqual(kept);
  expect(entries.map((e) => e.name)).toEqual(['manifest.json', ...kept.map((b) => b.crop)]);
  // a scan whose crops are all gone stays, with no boxes, so it's marked with the others
  expect(manifest.scans.find((s) => s.id === service)).toEqual({ ...serviceRecord, boxes: [] });
  // the records given are left as they were
  expect(JSON.stringify(pairs.map((p) => p.record))).toBe(before);
});

test('the export refuses more than the zip can hold', async () => {
  const m = await annotationMode();
  await saveAnnotated(m, 'inv_0051');
  const [{ record, scan }] = await pendingPairs(m);
  const per = record.boxes.length;
  // n boxes in all: this scan's boxes again and again, as that many scans, each crop at its own path in the zip and read
  // from the scan's own file, so no 65,535 files are written
  const times = (n: number) =>
    Array.from({ length: Math.ceil(n / per) }, (_, i) => {
      const id = `${record.id}-${i}`;
      const boxes = record.boxes.slice(0, Math.min(per, n - i * per));
      return { record: { ...record, id, boxes: boxes.map((b) => ({ ...b, crop: `crops/${id}/${b.name}.png` })) }, scan };
    });
  // with the manifest, as many entries as a zip without ZIP64 can count
  const fits = await m.exp.buildTrainingExport(times(65534), AT);
  expect(fits).toMatchObject({ boxes: 65534, missing: 0 });
  const end = new DataView(fits.bytes.buffer, fits.bytes.byteOffset + fits.bytes.length - 22);
  expect([end.getUint32(0, true), end.getUint16(10, true)]).toEqual([0x06054b50, 65535]);
  // one more is refused, counted from the records before any crop is read
  const read = jest.spyOn(require('expo-file-system').File.prototype, 'bytes');
  await expect(m.exp.buildTrainingExport(times(65535), AT)).rejects.toThrow('too_big');
  expect(read).not.toHaveBeenCalled();
  read.mockRestore();
});

test('a scan that is not training data stops the write, and nothing is written', async () => {
  const m = await annotationMode();
  const sale = await saveAnnotated(m, 'inv_0051');
  const plain = await savePlain(m, 'inv_0007'); // saved with the mode off: it has no training record
  const scans = await Promise.all([sale, plain].map((id) => m.saved.readScan(id)));
  await expect(m.exp.writeTrainingExport(scans.map((s) => s!), AT)).rejects.toThrow('not_training');
  expect([...memoryFs.files.keys()].filter((k) => k.startsWith('file:///cache/'))).toEqual([]);
});
