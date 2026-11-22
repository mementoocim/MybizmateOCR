import type { SaveDetails, StoredScan } from '../lib/scans';
import type { TrainingScan } from '../lib/training/record';
import { APP_VERSION, modelVersion } from '../lib/versions';
import type { ScanResult } from '../modules/scanner';
import { parseScanResult } from '../modules/scanner/src/parse';
import { coreJson } from '../test-utils/coreJson';
import { fixedCrypto } from '../test-utils/fixedCrypto';
import { memoryFs } from '../test-utils/memoryFs';
import { pinToday } from '../test-utils/today';

jest.mock('expo-file-system', () => require('../test-utils/memoryFs').memoryFs.module);
jest.mock('expo-crypto', () => require('../test-utils/fixedCrypto').fixedCrypto.module);
jest.mock('../lib/build', () => ({ TEAM_BUILD: true })); // annotation mode is the team's

// A scan's training record. The scans are each form's fixture saved in annotation mode: photos of the made-up Sales
// Invoice (Sample 0051) and Service Invoice and of a made-up 2307, and a made-up text PDF.

const DETAILS = { taxType: 'VAT', account: 'Sales Revenue', terms: 'account', atc: 'WC158' } as const;
const CERT = { account: 'Creditable Withholding Tax' };
const TAG = { client: 'c014', writer: 'w03' }; // kept upper-cased

type Modules = {
  scans: typeof import('../lib/scans');
  saved: typeof import('../lib/saved');
  settings: typeof import('../lib/settings');
  lists: typeof import('../lib/lists');
  install: typeof import('../lib/install');
  boxes: typeof import('../lib/training/boxes');
  record: typeof import('../lib/training/record');
};
const load = (): Modules => ({
  scans: require('../lib/scans'),
  saved: require('../lib/saved'),
  settings: require('../lib/settings'),
  lists: require('../lib/lists'),
  install: require('../lib/install'),
  boxes: require('../lib/training/boxes'),
  record: require('../lib/training/record'),
});

/** The app with annotation mode on; and its install ID unless said otherwise. */
async function annotationMode(withId = true): Promise<Modules> {
  const m = load();
  await m.settings.updateSettings({ annotation: true });
  if (withId) await m.install.loadInstall();
  return m;
}

const recordOf = (m: Modules, scan: StoredScan) =>
  m.record.trainingRecord(scan, m.lists.lists(), m.settings.settings());

type How = { label?: string; source?: StoredScan['source']; change?: (r: ScanResult) => void; details?: SaveDetails };
/** The made-up text PDF, its date read by the model from the page: its other boxes came from the PDF's own text. */
const PAGE_DATE: How = {
  label: 'PDF: Cruz Trading SI 888.pdf',
  source: 'pdf',
  change: (r) => {
    r.reads.find((b) => b.name === 'date')!.fromText = false;
  },
};

/**
 * A fixture's scan saved in annotation mode: the person's own checks first (check), then every box left confirmed, as
 * the save asks.
 */
async function saveAnnotated(
  m: Modules,
  stem: string,
  check?: (id: string) => void,
  how: How = {},
): Promise<StoredScan> {
  const result = parseScanResult(coreJson(stem));
  how.change?.(result);
  const id = m.scans.addScan({ label: how.label ?? 'Camera photo', source: how.source ?? 'camera', result });
  check?.(id);
  m.boxes.uncheckedBoxes(m.scans.getScan(id)!).forEach((box) => m.scans.confirmBox(id, box));
  const details = how.details ?? (m.scans.getScan(id)!.kind === '2307' ? CERT : DETAILS);
  await m.saved.saveScan(id, details, TAG);
  return m.scans.getScan(id)!;
}

/** The person's checks on Sample 0051: a box edited, one confirmed, one confirmed then corrected, and one cleared. */
const marked = (m: Modules) => (id: string) => {
  m.scans.setEdit(id, 'item1_amount', '1,092'); // read 7,092
  m.scans.confirmBox(id, 'item1_qty');
  m.scans.confirmBox(id, 'item2_amount'); // read 79: the row math took its backup reading, 19
  m.scans.confirmBox(id, 'date');
  m.scans.setEdit(id, 'date', '21 Oct 2026'); // read 21 0ct 2026: the same day
  m.scans.setEdit(id, 'vat_exempt', ''); // cleared
};

/** The 2307's tax, read with a 7 for its 1, corrected to its backup reading. */
const WRONG_TAX: How = {
  change: (r) => {
    const tax = r.reads.find((b) => b.name === 'ewt1_tax')!;
    tax.text = '4,796.29';
    tax.alts = ['4,196.29'];
  },
};
const fixTax = (m: Modules) => (id: string) => m.scans.setEdit(id, 'ewt1_tax', '4,196.29');

beforeAll(() => pinToday(new Date(2026, 10, 18, 10, 0)));
afterAll(() => jest.useRealTimers());

beforeEach(() => {
  memoryFs.reset();
  jest.resetModules();
});

test('a record holds only training boxes', async () => {
  const m = await annotationMode();
  const sale = await saveAnnotated(m, 'inv_0051', marked(m));
  const service = await saveAnnotated(m, 'svc_0000');
  const cert = await saveAnnotated(m, 'bir2307_photo_0', fixTax(m), WRONG_TAX);
  const pdf = await saveAnnotated(m, 'sales_text_0', undefined, PAGE_DATE);
  const names = (scan: StoredScan) => recordOf(m, scan)!.boxes.map((b) => b.name);
  const without = (scan: StoredScan, out: readonly string[]) =>
    scan.result.reads.map((r) => r.name).filter((n) => !out.includes(n));

  const customer = ['customer_name', 'customer_tin', 'customer_address'];
  expect(names(sale)).toEqual(without(sale, customer));
  expect(names(service)).toEqual(without(service, [...customer, 'amount_words'])); // its address is multi-line too
  expect(names(cert)).toEqual(without(cert, [...m.boxes.PERSONAL.bir_2307]));
  expect(names(pdf)).toEqual(['date']);
  for (const scan of [sale, service, cert, pdf]) {
    const form = scan.result.form!;
    const fromText = scan.result.reads.filter((r) => r.fromText).map((r) => r.name);
    const out = (n: string) => m.boxes.PERSONAL[form].has(n) || fromText.includes(n) || m.boxes.isMultiLine(form, n);
    expect([scan.label, names(scan).filter(out)]).toEqual([scan.label, []]);
    expect(names(scan)).toEqual(m.boxes.trainingBoxes(scan).map((r) => r.name));
  }

  const box = (scan: StoredScan, name: string) => recordOf(m, scan)!.boxes.find((b) => b.name === name);
  expect(box(sale, 'item1_amount')).toMatchObject({
    reading: '7,092',
    alts: ['1,092'],
    label: '1,092',
    edited: true,
    confirmed: true,
    used: '1092',
  });
  expect(box(sale, 'item1_qty')).toMatchObject({
    reading: '2',
    label: '2',
    edited: false,
    confirmed: true,
    used: null,
  });
  expect(box(sale, 'item2_amount')).toMatchObject({
    reading: '79',
    label: '79',
    edited: false,
    confirmed: true,
    used: '19', // the backup reading the row math took
  });
  expect(box(sale, 'date')).toMatchObject({
    reading: '21 0ct 2026',
    label: '21 Oct 2026',
    edited: true,
    confirmed: true,
    used: null, // the day the reading says too
  });
  expect(box(sale, 'vat_exempt')).toMatchObject({
    reading: '0.00',
    label: '',
    edited: true,
    confirmed: true,
    used: null,
  });
  expect(box(cert, 'ewt1_tax')).toMatchObject({
    reading: '4,796.29',
    label: '4,196.29',
    edited: true,
    confirmed: true,
    used: '4196.29',
  });
  // an edit taken back after the save leaves its box unchecked: never confirmed
  m.scans.setEdit(sale.id, 'item1_amount', '7,092');
  expect(box(m.scans.getScan(sale.id)!, 'item1_amount')).toMatchObject({
    label: '7,092',
    edited: false,
    confirmed: false,
    used: '1092',
  });
});

test("a record holds the scan's form, tag, install ID, versions, photo and flags", async () => {
  const m = await annotationMode();
  const pdf = await saveAnnotated(m, 'sales_text_0', undefined, PAGE_DATE);
  const date = pdf.result.reads.find((r) => r.name === 'date')!;
  const record: TrainingScan = {
    id: pdf.id,
    form: 'sales_invoice',
    source: 'pdf',
    annotated: true,
    tag: { client: 'C014', writer: 'W03' },
    installId: fixedCrypto.uuid,
    app: APP_VERSION,
    model: modelVersion(),
    photo: { sharpness: 2, sharpMin: 1, light: 255, darkMax: 50, turned: false },
    flags: ['terms', 'total'], // no terms ticked; a total from the rows alone
    boxes: [
      {
        name: 'date',
        type: 'date',
        crop: `crops/${pdf.id}/date.png`,
        size: date.cropSize,
        reading: '27 Sep 2026',
        conf: 1,
        alts: [],
        used: null,
        label: '27 Sep 2026',
        edited: false,
        confirmed: true,
      },
    ],
  };
  expect(recordOf(m, pdf)).toEqual(record);
  // the versions it was read with, as kept on it; none on a scan kept before milestone 4
  const older = { app: '0.9.0', model: 'An older model 0123456789ab' };
  expect(recordOf(m, { ...pdf, made: older })).toMatchObject(older);
  expect(recordOf(m, { ...pdf, made: undefined })).toMatchObject({ app: null, model: null });

  // a 2307's flags are its own checks': the corrected tax no longer adds up to the total row's
  const cert = await saveAnnotated(m, 'bir2307_photo_0', fixTax(m), WRONG_TAX);
  expect(recordOf(m, cert)).toMatchObject({
    form: 'bir_2307',
    source: 'photo',
    photo: { sharpness: 2, sharpMin: 0.5, light: 255, darkMax: 50, turned: false },
    flags: ['ewt_total'],
  });
});

test('not training data', async () => {
  const m = await annotationMode(false);
  const ok = await saveAnnotated(m, 'inv_0051');
  // nothing to check, so it saved in annotation mode, but each of its boxes came from the PDF's own text
  const textOnly = await saveAnnotated(m, 'sales_text_0', undefined, { ...PAGE_DATE, change: undefined });
  // each differs from a training scan in one way
  const none: [string, StoredScan][] = [
    ['a sample', { ...ok, source: 'sample' }],
    ['a test image', { ...ok, testImage: true }],
    ['an unsaved scan', { ...ok, saved: null }],
    ['a scan saved without annotation mode', { ...ok, annotated: false, tag: null }],
    ['a scan with no form', { ...ok, result: parseScanResult(coreJson('blank_page')) }],
    ['a scan whose form was not found, its reads kept', { ...ok, result: { ...ok.result, aligned: false } }],
    ['a scan with no training box', textOnly],
  ];
  // none needs the install ID, not loaded yet; training data waits for it
  for (const [what, scan] of none) expect([what, recordOf(m, scan)]).toEqual([what, null]);
  expect(() => recordOf(m, ok)).toThrow('install_not_loaded');
  await m.install.loadInstall();
  expect(recordOf(m, ok)).toMatchObject({ id: ok.id, installId: fixedCrypto.uuid });
  for (const [what, scan] of none) expect([what, recordOf(m, scan)]).toEqual([what, null]);
});

test('the record has no names', async () => {
  const m = await annotationMode();
  const scans = [
    await saveAnnotated(m, 'inv_0051', marked(m)),
    // a purchase from a supplier typed in
    await saveAnnotated(
      m,
      'svc_0000',
      (id) => m.scans.updateScan(id, { kind: 'purchase', party: { name: 'Reyes Hardware' } }),
      { details: { ...DETAILS, account: 'Office Supplies' } },
    ),
    await saveAnnotated(m, 'bir2307_photo_0', fixTax(m), WRONG_TAX),
    await saveAnnotated(m, 'sales_text_0', undefined, PAGE_DATE),
  ];
  for (const scan of scans) {
    const record = recordOf(m, scan);
    expect(record?.boxes.length).toBeGreaterThan(0);
    const json = JSON.stringify(record);
    const form = scan.result.form!;
    // the names, TINs and addresses written on it (a ZIP's 4 digits could turn up inside any number)
    const written = scan.result.reads
      .filter((r) => m.boxes.PERSONAL[form].has(r.name) && !r.name.endsWith('_zip'))
      .map((r) => r.text);
    expect(written.length).toBeGreaterThan(0);
    const saved = [scan.label, 'Reyes Hardware', DETAILS.account, 'Office Supplies', CERT.account];
    for (const text of [...written, ...saved, 'file://']) expect(json).not.toContain(text);
  }
});
