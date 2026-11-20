import { finalize, type Pack, type Raw } from '../lib/checks/finalize';
import { pyRound } from '../lib/checks/num';
import { exportRow, itemsDescription, PURCHASE_COLUMNS, SALES_COLUMNS, saveBlock } from '../lib/exportRows';
import { saleOf } from '../lib/sale';
import { addScan, getScan, setEdit, type StoredScan, updateScan } from '../lib/scans';
import type { Settings } from '../lib/settings';
import { parseScanResult } from '../modules/scanner/src/parse';
import { coreJson } from '../test-utils/coreJson';
import { EMPTY_LISTS, PACK_LISTS } from '../test-utils/packLists';
import { pinToday } from '../test-utils/today';

jest.mock('expo-file-system', () => require('../test-utils/memoryFs').memoryFs.module);

const SETTINGS: Settings = { vatRegistered: null, revenueAccount: '', expenseAccount: '', atc: '' };
const DETAILS = { taxType: 'VAT', account: '4010', terms: 'account', atc: '' } as const;

beforeAll(() => pinToday(new Date(2026, 10, 18, 10, 0)));
afterAll(() => jest.useRealTimers());

function scanOf(stem: string, source: StoredScan['source'] = 'camera'): StoredScan {
  return getScan(addScan({ label: stem, source, result: parseScanResult(coreJson(stem)) }))!;
}

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

test('itemsDescription', () => {
  const FZ = require('../fixtures/checks/finalize.json');
  const PACK: Pack = require('../fixtures/checks/scan_pack.json');
  const plain = FZ.cases.find((c: { name: string }) => c.name === 'test_checks: plain invoice: nothing to check');
  const { terms = null, photo = null, ...boxes } = plain.raw;
  const raw: Raw = { boxes, terms, photo };
  expect(itemsDescription(finalize(raw, PACK, FZ.today))).toBe('10 × Detergent 1kg; 5 × Nails 2in');
});
