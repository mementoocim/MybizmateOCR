import { certOf } from '../lib/cert';
import { finalize, type Pack, type Raw } from '../lib/checks/finalize';
import { pyRound } from '../lib/checks/num';
import {
  certRows,
  CWT_COLUMNS,
  exportRow,
  itemsDescription,
  PURCHASE_COLUMNS,
  SALES_COLUMNS,
  saveBlock,
} from '../lib/exportRows';
import type { Lists } from '../lib/lists';
import { saleOf } from '../lib/sale';
import { addScan, getScan, setEdit, type StoredScan, updateScan } from '../lib/scans';
import type { Settings } from '../lib/settings';
import type { ScanResult } from '../modules/scanner';
import { parseScanResult } from '../modules/scanner/src/parse';
import { coreJson } from '../test-utils/coreJson';
import { EMPTY_LISTS, PACK_LISTS, party } from '../test-utils/packLists';
import { pinToday } from '../test-utils/today';

jest.mock('expo-file-system', () => require('../test-utils/memoryFs').memoryFs.module);

const SETTINGS: Settings = {
  vatRegistered: null,
  revenueAccount: '',
  expenseAccount: '',
  atc: '',
  offsetAccount: '',
  annotation: false,
  clientCode: '',
  writerCode: '',
};
const DETAILS = { taxType: 'VAT', account: '4010', terms: 'account', atc: '' } as const;
const OFFSET = { account: '1205' } as const; // a 2307's: its offset account

beforeAll(() => pinToday(new Date(2026, 10, 18, 10, 0)));
afterAll(() => jest.useRealTimers());

function scanOf(stem: string, source: StoredScan['source'] = 'camera', edit?: (r: ScanResult) => void): StoredScan {
  const result = parseScanResult(coreJson(stem));
  edit?.(result);
  return getScan(addScan({ label: stem, source, result }))!;
}

/** A made-up 2307 (fixtures/core/expected2307) as a scan, with some of its boxes saying something else. */
function certScan(stem: string, edits: Record<string, string> = {}, source: StoredScan['source'] = 'pdf'): StoredScan {
  const { id } = scanOf(stem, source);
  for (const [box, text] of Object.entries(edits)) setEdit(id, box, text);
  return getScan(id)!;
}

/** Without Part III's rows: no income payment or business tax was read (the total rows too). */
const noPayments = (r: ScanResult) => {
  r.reads = r.reads.filter((b) => !b.name.startsWith('ewt') && !b.name.startsWith('bt'));
};

test("the headers are the templates'", () => {
  expect(SALES_COLUMNS).toEqual([
    'Date *', 'Customer *', 'Gross *', 'Type *', 'Revenue Account *', 'CWT IT', 'CWT VT', 'Terms *', 'SI/OR No.',
    'Branch', 'CTYPE', 'Cash/Bank/Advance', 'Description', 'Discount', 'Beneficiary', 'ID No.', 'Statutory',
    "Child's Name", 'Term Type', 'Credit Days', 'Due Date', 'ID Type', 'Beneficiary TIN', 'Discount Prices',
    'Cap Left', "Child's Birth Date", 'Particulars',
  ]);
  expect(SALES_COLUMNS).toHaveLength(27);
  expect(PURCHASE_COLUMNS).toEqual([
    'Date *', 'Supplier *', 'Gross *', 'Type *', 'Expense Account *', 'EWT', 'WVAT', 'Terms *', 'Inv No.', 'Branch',
    'Cash/Bank/Advance', 'Description', 'Discount', 'Term Type', 'Credit Days', 'Due Date', 'Particulars',
  ]);
  expect(PURCHASE_COLUMNS).toHaveLength(17);
});

test("a sale's row", () => {
  const scan = scanOf('inv_0007');
  const sale = saleOf(scan, PACK_LISTS, SETTINGS);
  expect(sale.party.listParty?.code).toBe('C012');
  expect(exportRow(scan, sale, DETAILS)).toEqual({
    'Date *': sale.final.date,
    'Customer *': 'C012',
    'Gross *': sale.final.total_due,
    'Type *': 'VAT',
    'Revenue Account *': '4010',
    'Terms *': 'On Account',
    'SI/OR No.': '0007655',
    Description: itemsDescription(sale.final),
  });
});

test("the Service Invoice's Gross is before the discount and withholding", () => {
  const { id } = scanOf('svc_0002');
  setEdit(id, 'withholding', '50.00');
  const scan = getScan(id)!;
  const sale = saleOf(scan, EMPTY_LISTS, SETTINGS);
  const row = exportRow(scan, sale, { ...DETAILS, atc: 'WC158' });
  expect(row['Gross *']).toBe(sale.gross);
  expect(row['Gross *']).toBe(pyRound(sale.final.total_due! + sale.final.less, 2));
  expect(sale.final.less).toBe(pyRound(77.95 + 50, 2));
  expect(row.Discount).toBe(77.95);
  expect(row['CWT IT']).toBe('WC158');
});

test("a purchase's row", () => {
  const { id } = scanOf('inv_0007');
  updateScan(id, { kind: 'purchase', party: { various: true } });
  setEdit(id, 'withholding', '20.00');
  const scan = getScan(id)!;
  const row = exportRow(scan, saleOf(scan, PACK_LISTS, SETTINGS), { ...DETAILS, account: 'Purchases', atc: 'WC158' });
  expect(row).toMatchObject({
    'Supplier *': 'VARIOUS-SUPP',
    'Expense Account *': 'Purchases',
    EWT: 'WC158',
    'Inv No.': '0007655',
  });
  expect(row['Customer *']).toBeUndefined();
  expect(row['Revenue Account *']).toBeUndefined();
  expect(row['CWT IT']).toBeUndefined();
});

test('saveBlock', () => {
  const sample = scanOf('inv_0007', 'sample');
  expect(saveBlock(sample, saleOf(sample, EMPTY_LISTS, SETTINGS))).toBe('sample');
  expect(saveBlock(scanOf('blank_page'), null)).toBe('no_form');
  const { id } = scanOf('inv_0007');
  expect(saveBlock(getScan(id)!, saleOf(getScan(id)!, EMPTY_LISTS, SETTINGS))).toBeNull();
  setEdit(id, 'date', 'hello');
  expect(saveBlock(getScan(id)!, saleOf(getScan(id)!, EMPTY_LISTS, SETTINGS))).toBe('no_date');
  const other = scanOf('inv_0007');
  updateScan(other.id, { kind: 'purchase' });
  expect(saveBlock(getScan(other.id)!, saleOf(getScan(other.id)!, EMPTY_LISTS, SETTINGS))).toBe('no_supplier');
});

test("CWT_COLUMNS is the 2307-CWT template's header row", () => {
  // MyBizMate's 2307-CWT (received) import template, sheet "Import", row 1, word for word as copied on 2026-11-20. The
  // template itself stays outside the repo: it carries the test company's lists.
  expect(CWT_COLUMNS).toEqual([
    'Date *', 'Customer *', 'Tax Base (Net)', 'CWT IT', 'IT Amt', 'CWT VT', 'VT Amt', 'Offset Account *', 'Cert No.',
    'Branch', 'Particulars',
  ]);
});

test("a 2307's rows", () => {
  // bir2307_photo_1, Q4 2026: income payments in rows 1 and 3 (row 2 is blank) and one business-tax row; its payor,
  // Santos General Merchandise, is the pack's C003 by TIN and name
  const scan = certScan('bir2307_photo_1', {}, 'gallery');
  const every = {
    'Date *': '2026-12-31', // the period's last day
    'Customer *': 'C003',
    'Offset Account *': '1205',
    Particulars: 'BIR 2307 for Oct–Dec 2026',
  };
  // each row's total is its tax base; an income payment's ATC and tax are CWT IT and IT Amt, a business tax's CWT VT
  // and VT Amt; Cert No. and Branch stay blank (the paper has no certificate number; the branch is the business's own)
  expect(certRows(certOf(scan, PACK_LISTS, SETTINGS), OFFSET)).toStrictEqual([
    { ...every, 'Tax Base (Net)': 190198.09, 'CWT IT': 'WI610', 'IT Amt': 1901.98 },
    { ...every, 'Tax Base (Net)': 442104.04, 'CWT IT': 'WI050', 'IT Amt': 22105.2 },
    { ...every, 'Tax Base (Net)': 149514, 'CWT VT': 'WV010', 'VT Amt': 7475.7 },
  ]);
});

test("a 2307's customer: a matched customer's code, else the payor as written", () => {
  const customer = (edits: Record<string, string>, lists: Lists) =>
    certRows(certOf(certScan('bir2307_photo_1', edits), lists, SETTINGS), OFFSET)[0]['Customer *'];
  expect(customer({}, PACK_LISTS)).toBe('C003');
  // matched, but with no code yet (added from a scan): its name as MyBizMate has it
  const noCode: Lists = {
    parties: [
      party({ id: 'p-1', entity: 'individual', registeredName: '', lastName: 'Santos', firstName: 'Maria', middleName: 'Reyes',
        tin: '345-678-901-00000' }),
    ],
    items: [],
    version: 1,
  };
  expect(customer({ payor_name: 'MARIA REYES SANTOS' }, noCode)).toBe('Santos, Maria Reyes');
  // an unsure match is only the closest one (here C004, Santos Merchandise): the name as written, which is also the
  // name shown
  expect(customer({ payor_name: 'Santos Merchandise', payor_tin: '99988877700000' }, PACK_LISTS)).toBe('Santos Merchandise');
  const unsure = certOf(
    certScan('bir2307_photo_1', { payor_name: 'Santos Merchandising', payor_tin: '99988877700000' }),
    PACK_LISTS,
    SETTINGS,
  );
  expect(certRows(unsure, OFFSET)[0]['Customer *']).toBe('Santos Merchandising');
  expect(unsure.payor).toMatchObject({ status: 'unsure', shown: 'Santos Merchandising', column: 'Santos Merchandising' });
  expect(unsure.payor.listParty).toMatchObject({ code: 'C004', registeredName: 'Santos Merchandise' });
  // not in the customers, or no customers yet: as written
  expect(customer({ payor_name: 'Magsaysay Hardware', payor_tin: '99988877700000' }, PACK_LISTS)).toBe('Magsaysay Hardware');
  expect(customer({}, EMPTY_LISTS)).toBe('Santos General Merchandise');
  // no payor written: nothing, never an invoice's walk-in (VARIOUS)
  expect(customer({ payor_name: '', payor_tin: '' }, PACK_LISTS)).toBe('');
});

test('a total row never makes an entry', () => {
  // bir2307_text_0: two income payments, no business tax; its template prints 0.00 in the business-tax total row
  const zeros = Object.fromEntries(['m1', 'm2', 'm3', 'total', 'tax'].map((c) => [`bt_total_${c}`, '0.00']));
  const rows = certRows(certOf(certScan('bir2307_text_0', zeros), EMPTY_LISTS, SETTINGS), OFFSET);
  expect(rows.map((r) => [r['CWT IT'], r['Tax Base (Net)'], r['IT Amt']])).toEqual([
    ['WC610', 114402.88, 1144.03],
    ['WC160', 444788.1, 8895.76],
  ]);
  expect(rows.some((r) => r['CWT VT'] !== undefined || r['VT Amt'] !== undefined)).toBe(false);
  // a total row of dashes: no entry either; and with no rows read, no entries at all
  const dashes = certScan('bir2307_text_0', { bt_total_total: '-', bt_total_tax: '-' });
  expect(certRows(certOf(dashes, EMPTY_LISTS, SETTINGS), OFFSET)).toHaveLength(2);
  expect(certRows(certOf(scanOf('bir2307_text_0', 'pdf', noPayments), EMPTY_LISTS, SETTINGS), OFFSET)).toEqual([]);
});

test('saveBlock for a 2307', () => {
  const block = (scan: StoredScan, lists: Lists = EMPTY_LISTS) => saveBlock(scan, certOf(scan, lists, SETTINGS));
  // a 2307 has no date, terms or total due: never an invoice's blocks
  expect(block(certScan('bir2307_text_1'))).toBeNull();
  expect(block(certScan('bir2307_text_1', {}, 'sample'))).toBe('sample');
  // the period: both its days are needed; read, but not one quarter, it can be saved (it's marked to check)
  expect(block(certScan('bir2307_text_1', { period_to: '' }))).toBe('no_period');
  expect(block(certScan('bir2307_text_1', { period_from: 'hello' }))).toBe('no_period');
  expect(block(certScan('bir2307_text_1', { period_to: '11302026' }))).toBeNull();
  // the payor: no name and no list match
  expect(block(certScan('bir2307_text_1', { payor_name: '', payor_tin: '' }))).toBe('no_payor');
  expect(block(certScan('bir2307_text_1', { payor_name: 'A', payor_tin: '' }))).toBe('no_payor'); // a letter is no name
  expect(block(certScan('bir2307_text_1', { payor_name: '' }))).toBe('no_payor'); // a TIN alone, no customers yet
  expect(block(certScan('bir2307_text_0', { payor_name: '' }), PACK_LISTS)).toBeNull(); // its TIN is the pack's C005
  // no income payment (or business-tax row) read
  expect(block(scanOf('bir2307_text_0', 'pdf', noPayments))).toBe('no_rows');
});

test('itemsDescription', () => {
  const FZ = require('../fixtures/checks/finalize.json');
  const PACK: Pack = require('../fixtures/checks/scan_pack.json');
  const plain = FZ.cases.find((c: { name: string }) => c.name === 'test_checks: plain invoice: nothing to check');
  const { terms = null, photo = null, ...boxes } = plain.raw;
  const raw: Raw = { boxes, terms, photo };
  expect(itemsDescription(finalize(raw, PACK, FZ.today))).toBe('10 × Detergent 1kg; 5 × Nails 2in');
});
