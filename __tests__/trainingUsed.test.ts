import { saleOf } from '../lib/sale';
import { addScan, getScan, setEdit, type StoredScan } from '../lib/scans';
import { settings } from '../lib/settings';
import { usedValues } from '../lib/training/used';
import type { ScanResult } from '../modules/scanner';
import { parseScanResult } from '../modules/scanner/src/parse';
import { coreJson } from '../test-utils/coreJson';
import { EMPTY_LISTS } from '../test-utils/packLists';
import { pinToday } from '../test-utils/today';

jest.mock('expo-file-system', () => require('../test-utils/memoryFs').memoryFs.module);

// The value the checks used for a box, against the box's own reading. The invoices are photos of the made-up samples,
// read as the Python reads them; the 2307 is a made-up one. A scan that isn't a sample is checked as of its own day.

beforeAll(() => pinToday(new Date(2026, 10, 18, 10, 0)));
afterAll(() => jest.useRealTimers());

/** A camera scan of a fixture, its result changed first when change is given. */
function scanOf(stem: string, change?: (r: ScanResult) => void): StoredScan {
  const result = parseScanResult(coreJson(stem));
  change?.(result);
  return getScan(addScan({ label: 'Camera photo', source: 'camera', result }))!;
}

/** The box read as text, with these backup readings. */
function readAs(r: ScanResult, box: string, text: string, alts: string[] = []): void {
  const read = r.reads.find((b) => b.name === box)!;
  read.text = text;
  read.alts = alts;
}

const used = (scan: StoredScan) => usedValues(scan, EMPTY_LISTS, settings());

test("the checks' value when it differs", () => {
  // Sample 0051: the row math took two amounts from their backup readings (2 x 546 is 1,092, not the 7,092 read
  // first; 2 x 9.50 is 19, not 79)
  expect(used(scanOf('inv_0051'))).toEqual({ item1_amount: '1092', item2_amount: '19' });
  // row 2's amount read lq, with no number in it: the 19 the checks used is its backup reading
  expect(used(scanOf('inv_0051', (r) => readAs(r, 'item2_amount', 'lq', ['19'])))).toEqual({
    item1_amount: '1092',
    item2_amount: '19',
  });
  // Sample 0041: the total most boxes agree on is the total due's backup reading
  expect(used(scanOf('inv_0041'))).toEqual({ total_due: '1353.75' });
  // as in the Python's own cases: a price of 95 read P5, the math taking the P as the 9 it was; and half a kilo
  // read 12, its slash dropped
  expect(used(scanOf('inv_0007', (r) => readAs(r, 'item6_unit_price', 'P5')))).toEqual({ item6_unit_price: '95' });
  const half = (qty: string) => (r: ScanResult) => {
    readAs(r, 'item1_qty', qty);
    readAs(r, 'item1_amount', '42.50'); // at 85 a kilo
  };
  expect(used(scanOf('inv_0007', half('12')))).toEqual({ item1_qty: '0.5' });

  // a date read with its slashes dropped (the Python's own variant of Sample 0001), rebuilt
  const rebuilt = scanOf('inv_0001', (r) => readAs(r, 'date', '10222026'));
  const choice = saleOf(rebuilt, EMPTY_LISTS, settings()).final.date_choice;
  expect(choice).toMatchObject({ date: '2026-10-22', rebuilt: true });
  expect(used(rebuilt)).toEqual({ date: '2026-10-22' });

  // a 2307 (WC158 at 1%: the tax is 4,196.26), its tax withheld month by month a few centavos off: read with a 7 for
  // its 1, and right as the backup reading. And a month that adds up only as its backup reading, in the row and in
  // the total row.
  const cert = scanOf('bir2307_photo_0', (r) => {
    readAs(r, 'ewt1_tax', '4,796.29', ['4,196.29']);
    readAs(r, 'ewt_total_tax', '4,196.29');
    readAs(r, 'ewt1_m1', '1,714.00', ['1,114.00']);
    readAs(r, 'ewt_total_m2', '136,765.03', ['136,165.03']);
  });
  expect(used(cert)).toEqual({ ewt1_m1: '1114', ewt1_tax: '4196.29', ewt_total_m2: '136165.03' });

  // a box whose own reading was used gives nothing
  for (const stem of ['inv_0007', 'svc_0000', 'bir2307_photo_0']) {
    expect([stem, used(scanOf(stem))]).toEqual([stem, {}]);
  }
  expect(used(scanOf('inv_0007', half('1/2')))).toEqual({}); // a quantity read as the checks read one
  expect(used(scanOf('blank_page'))).toEqual({}); // no form: nothing was checked
});

test("an edited box: the checks' value when it differs from the box's own reading", () => {
  const cert = scanOf('bir2307_photo_0');
  setEdit(cert.id, 'ewt1_tax', '4,196.30'); // 4 centavos off the 4,196.26 read, and still the tax: the checks used it
  setEdit(cert.id, 'ewt1_m1', '1114'); // the month as read, written another way
  setEdit(cert.id, 'ewt1_m3', ''); // cleared: the checks have no third month
  expect(used(getScan(cert.id)!)).toEqual({ ewt1_tax: '4196.3' });

  const sale = scanOf('inv_0001', (r) => readAs(r, 'date', '10222026'));
  setEdit(sale.id, 'date', '10/22/2026'); // typed with its slashes
  expect(used(getScan(sale.id)!)).toEqual({ date: '2026-10-22' });
  setEdit(sale.id, 'date', ''); // cleared: the checks have no date
  expect(used(getScan(sale.id)!)).toEqual({});
});
