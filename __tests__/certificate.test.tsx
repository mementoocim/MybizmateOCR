import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import Result from '../app/result';
import { certOf } from '../lib/cert';
import { addParty, clearParties, type Lists } from '../lib/lists';
import { addScan, getScan, type ScanSource, setEdit } from '../lib/scans';
import type { Settings } from '../lib/settings';
import { colors } from '../lib/theme';
import type { ScanResult } from '../modules/scanner';
import { parseScanResult } from '../modules/scanner/src/parse';
import { coreJson } from '../test-utils/coreJson';
import { memoryFs } from '../test-utils/memoryFs';
import { PACK_LISTS } from '../test-utils/packLists';

// Task 2's made-up 2307s (fixtures/core/expected2307) as scans: a text PDF, a picture PDF or a photo, each box read as
// written. The customers, when there are any, are the Python's synthetic scan pack, whose names the made-up payors use.

let mockParams: { id?: string; from?: string } = {};

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ back: jest.fn(), replace: jest.fn(), push: jest.fn() }),
  useIsFocused: () => true,
  Stack: {
    Screen: ({ options }: { options?: { headerTitle?: (p: object) => ReactElement } }) =>
      options?.headerTitle ? options.headerTitle({}) : null,
  },
}));
jest.mock('../modules/scanner', () => ({
  enhance: async (_uri: string, mode: string) => `file:///x/${mode}.img`,
  saveToPictures: jest.fn(),
  scanPhoto: jest.fn(),
  readPdf: jest.fn(),
  displayName: jest.fn(),
}));
jest.mock('../lib/toast', () => ({ toast: jest.fn() }));
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
}));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: async () => ({ localUri: 'file:///s' }) }) } }));
jest.mock('expo-file-system', () => require('../test-utils/memoryFs').memoryFs.module);

const SETTINGS: Settings = { vatRegistered: null, revenueAccount: '', expenseAccount: '', atc: '', offsetAccount: '' };

/** A made-up 2307's scan screen, with some of its boxes saying something else (an edit of '' clears a box). */
async function show(
  stem: string,
  opts: { edits?: Record<string, string>; edit?: (r: ScanResult) => void } = {},
): Promise<string> {
  const result = parseScanResult(coreJson(stem));
  opts.edit?.(result);
  const source: ScanSource = result.source === 'pdf' ? 'pdf' : 'gallery';
  const id = addScan({ label: `PDF: ${stem}.pdf`, source, result });
  for (const [box, text] of Object.entries(opts.edits ?? {})) setEdit(id, box, text);
  mockParams = { id };
  await render(<Result />);
  return id;
}

const press = (el: Parameters<typeof fireEvent.press>[0]) => act(async () => fireEvent.press(el));

/** The boxes a row's sheet shows, in order; the sheet is closed again. */
async function boxesIn(row: string): Promise<string[]> {
  await press(screen.getByText(row));
  const boxes = screen.queryAllByTestId(/^fix-/).map((el) => String(el.props.testID).slice('fix-'.length));
  await press(screen.getByLabelText('Close'));
  return boxes;
}

const columns = (prefix: string, names: string[]) => names.map((c) => `${prefix}_${c}`);
const ROW = ['payment', 'atc', 'm1', 'm2', 'm3', 'total', 'tax'];
const TOTAL = ['m1', 'm2', 'm3', 'total', 'tax'];

/** The pack's customers in Your lists. */
async function addPackCustomers(): Promise<void> {
  for (const { id, exportedAt, ...customer } of PACK_LISTS.parties) await addParty(customer);
}

beforeEach(async () => {
  memoryFs.reset();
  await clearParties('customer');
  await clearParties('supplier');
});

test("a 2307's sections", async () => {
  // a text PDF: 4 income payments and 1 business-tax row, Q4 2026; no customers yet
  await show('bir2307_text_1');
  expect(screen.getByText('BIR Form 2307')).toBeTruthy();
  expect(screen.getByText('Ready to save')).toBeTruthy();
  expect(screen.getByText(/^Every check passed\. Read on this phone in .*, offline\.$/)).toBeTruthy();

  expect(screen.getByText('PERIOD')).toBeTruthy();
  expect(screen.getByText('Oct 1 – Dec 31, 2026 (Q4)')).toBeTruthy();

  expect(screen.getByText('PAYEE')).toBeTruthy();
  expect(screen.getByText('Peñaflor, Ma. Teresa Lim')).toBeTruthy();
  expect(screen.getByText('TIN 746-851-963-00000 · ZIP 3306')).toBeTruthy();

  expect(screen.getByText('PAYOR')).toBeTruthy();
  expect(screen.getByText('Castillo Eatery')).toBeTruthy();
  // RNTL's default matcher collapses the sub's line break into a space
  expect(screen.getByText('Add your customers in Your lists to check names TIN 334-455-667-00000 · ZIP 3303')).toBeTruthy();

  expect(screen.getByText('INCOME PAYMENTS')).toBeTruthy();
  const payments = [
    ['WI050 · Consultancy fees', '₱438,849.60', 'Tax withheld ₱21,942.48'],
    ['WI160 · Trucking services', '₱538,746.53', 'Tax withheld ₱10,774.93'],
    ['WI120 · Construction works', '₱155,025.06', 'Tax withheld ₱3,100.50'],
    ['WI515 · Sales commissions', '₱242,397.37', 'Tax withheld ₱12,119.87'],
  ];
  for (const [title, total, tax] of payments) {
    expect(screen.getByText(title)).toBeTruthy();
    expect(screen.getByText(total)).toBeTruthy();
    expect(screen.getByText(tax)).toBeTruthy();
  }

  // the second table, laid out like the first
  expect(screen.getByText('BUSINESS TAX')).toBeTruthy();
  expect(screen.getByText('WV010 · Purchase of goods')).toBeTruthy();

  // each table's total and tax withheld
  expect(screen.getByText('TOTALS')).toBeTruthy();
  expect(screen.getByText('Income payments')).toBeTruthy();
  expect(screen.getByText('₱1,375,018.56')).toBeTruthy();
  expect(screen.getByText('Tax withheld ₱47,937.78')).toBeTruthy();
  expect(screen.getByText('Business tax')).toBeTruthy();
  expect(screen.getAllByText('₱189,255.11')).toHaveLength(2); // its row, and its total
  expect(screen.getAllByText('Tax withheld ₱9,462.76')).toHaveLength(2);

  // none of an invoice's; saved as a 2307
  for (const invoice of ['THIS INVOICE IS', 'INVOICE', 'Terms', 'Total due', 'Ready to post', 'Save sale']) {
    expect([invoice, screen.queryByText(invoice)]).toEqual([invoice, null]);
  }
  expect(screen.getByTestId('save-open')).toHaveTextContent('Save 2307');

  // every row opens what was read in its boxes
  expect(await boxesIn('Oct 1 – Dec 31, 2026 (Q4)')).toEqual(['period_from', 'period_to']);
  expect(await boxesIn('Peñaflor, Ma. Teresa Lim')).toEqual(columns('payee', ['tin', 'name', 'address', 'zip']));
  expect(await boxesIn('Castillo Eatery')).toEqual(columns('payor', ['tin', 'name', 'address', 'zip']));
  expect(await boxesIn('WI050 · Consultancy fees')).toEqual(columns('ewt1', ROW));
  expect(await boxesIn('WI515 · Sales commissions')).toEqual(columns('ewt4', ROW));
  expect(await boxesIn('WV010 · Purchase of goods')).toEqual(columns('bt1', ROW));
  expect(await boxesIn('Income payments')).toEqual(columns('ewt_total', TOTAL));
  expect(await boxesIn('Business tax')).toEqual(columns('bt_total', TOTAL));

  await press(screen.getByText('WI050 · Consultancy fees'));
  expect(screen.getByText('Row 1 · ATC')).toBeTruthy();
  expect(screen.getAllByText("From the PDF's text")).toHaveLength(7);
});

test('a period that is not one calendar quarter', async () => {
  await show('bir2307_text_1', { edits: { period_to: '11302026' } });
  expect(screen.getByText('10012026 – 11302026')).toBeTruthy();
  expect(screen.getByText('Not one calendar quarter')).toHaveStyle({ color: colors.ember });
  expect(screen.getByText(/^Check: Period\./)).toBeTruthy();
  // the boxes as read, a box that wasn't read as a dash
  await show('bir2307_text_1', { edits: { period_to: '' } });
  expect(screen.getByText('10012026 – —')).toBeTruthy();
  expect(screen.getByText('Not one calendar quarter')).toBeTruthy();
});

test("the rows' flags", async () => {
  // bir2307_text_2's row 2: WC158 (1%) on 208,043.00, tax 2,080.43; the total row's tax is changed to match
  await show('bir2307_text_2', { edits: { ewt2_tax: '4,160.86', ewt_total_tax: '24,779.42' } });
  expect(screen.getByText('Tax withheld ₱4,160.86 · not 1% of the total')).toHaveStyle({ color: colors.ember });
  expect(screen.getByText(/^Check: Row 2 tax\./)).toBeTruthy();
  // a rate like 0.5%, as people write it
  await show('bir2307_text_2', { edits: { ewt2_atc: 'WC156' } });
  expect(screen.getByText('Tax withheld ₱2,080.43 · not 0.5% of the total')).toBeTruthy();
  // an income payment's ATC must be one for income payments
  await show('bir2307_text_2', { edits: { ewt2_atc: 'WV010' } });
  expect(screen.getByText('WV010 · Office supplies')).toBeTruthy();
  expect(screen.getByText('Tax withheld ₱2,080.43 · not an ATC for income payments')).toBeTruthy();
  await show('bir2307_text_2', { edits: { ewt2_atc: '' } });
  expect(screen.getByText('Office supplies')).toBeTruthy();
  expect(screen.getByText('Tax withheld ₱2,080.43 · no ATC')).toBeTruthy();
  // a business-tax row's own words
  await show('bir2307_photo_1', { edits: { bt1_atc: 'WC158' } });
  expect(screen.getByText('Tax withheld ₱7,475.70 · not an ATC for business tax')).toBeTruthy();
  expect(screen.getByText(/^Check: Business tax row 1 ATC\./)).toBeTruthy();
});

test('fixing a month re-runs the checks', async () => {
  const id = await show('bir2307_text_0');
  expect(screen.getByText('Ready to save')).toBeTruthy();
  await press(screen.getByText('WC610 · Purchase of corn'));
  await press(screen.getByTestId('fix-ewt1_m1'));
  await act(async () => fireEvent.changeText(screen.getByLabelText('What the box says'), '100,674.00'));
  await press(screen.getByTestId('box-save'));
  expect(screen.getByText('You changed it to “100,674.00”.')).toBeTruthy();
  // the row's months, and the total row's 1st month, no longer add up
  expect(screen.getByText('2 things to check')).toBeTruthy();
  expect(screen.getByText(/^Check: Row 1 months, Totals\.\sRead on this phone in /)).toBeTruthy();
  await press(screen.getByLabelText('Close'));
  expect(screen.getByText("Tax withheld ₱1,144.03 · the months don't add up to the total")).toBeTruthy();
  expect(screen.getByText("Tax withheld ₱10,039.79 · the rows don't add up to the total row")).toBeTruthy();
  // back as written: every check passes again
  await act(async () => setEdit(id, 'ewt1_m1', '100,664.00'));
  expect(screen.getByText('Ready to save')).toBeTruthy();
  expect(screen.getByText('Tax withheld ₱1,144.03')).toBeTruthy();
});

test("the payor's match", async () => {
  await addPackCustomers();
  // bir2307_text_0's payor is the pack's Reyes Sari-Sari Store, TIN 456-789-012-00000: matched like a sale's customer,
  // and shown as the list has it
  await show('bir2307_text_0', { edits: { payor_name: 'REYES SARI SARI STORE' } });
  expect(screen.getByText('Reyes Sari-Sari Store')).toBeTruthy();
  expect(screen.getByText('Matched in your customers TIN 456-789-012-00000 · ZIP 3306')).toBeTruthy();
  expect(screen.getByText('Ready to save')).toBeTruthy();

  const stranger = { payor_name: 'Magsaysay Hardware', payor_tin: '99988877700000' };
  await show('bir2307_text_0', { edits: stranger });
  expect(screen.getByText('Magsaysay Hardware')).toBeTruthy();
  expect(screen.getByText('Not in your customers TIN 999-888-777-00000 · ZIP 3306')).toHaveStyle({ color: colors.ember });
  expect(screen.getByText(/^Check: Payor \(not in your customers\)\./)).toBeTruthy();

  // Santos Merchandise and Santos General Merchandise are both customers
  await show('bir2307_text_0', { edits: { payor_name: 'Santos Merchandise', payor_tin: '99988877700000' } });
  expect(screen.getByText('Santos Merchandise')).toBeTruthy();
  expect(screen.getByText('Closest match. Tap to compare. TIN 999-888-777-00000 · ZIP 3306')).toBeTruthy();
  expect(screen.getByText(/^Check: Payor \(confirm the match\)\./)).toBeTruthy();

  // no payor written: never an invoice's walk-in
  await show('bir2307_text_0', { edits: { payor_name: '', payor_tin: '' } });
  expect(screen.getByText('Not in your customers TIN — · ZIP 3306')).toBeTruthy();
  expect(screen.queryByText(/VARIOUS|Walk-in/)).toBeNull();
  expect(screen.getByText(/^Check: Payor's TIN\./)).toBeTruthy();

  // the payee isn't matched: the business is the payee
  await show('bir2307_text_0');
  expect(screen.getByText('TIN 211-305-418-00000 · ZIP 3305')).toBeTruthy();
});

test('the photo checks: a photo or a picture PDF, never a typed page', async () => {
  const blurry = (r: ScanResult) => {
    r.sharpness = 0.1; // the 2307's minimum is 0.5
  };
  await show('bir2307_photo_0', { edit: blurry });
  expect(screen.getByText(/^Check: Blurry photo \(retake it\)\./)).toBeTruthy();
  await show('bir2307_picture_0', { edit: blurry });
  expect(screen.getByText(/^Check: Blurry photo \(retake it\)\./)).toBeTruthy();
  await show('bir2307_text_0', {
    edit: (r) => {
      r.sharpness = 0.1;
      r.light = 10;
    },
  });
  expect(screen.getByText('Ready to save')).toBeTruthy();
});

test("the business-tax table, and a total row that isn't a total", async () => {
  // bir2307_text_0 has no business-tax rows: no section, and no business-tax total
  await show('bir2307_text_0');
  expect(screen.queryByText('BUSINESS TAX')).toBeNull();
  expect(screen.queryByText('Business tax')).toBeNull();
  expect(screen.getByText('₱559,190.98')).toBeTruthy();
  expect(screen.getByText('Tax withheld ₱10,039.79')).toBeTruthy();

  // a template's total line printing 0.00 or a dash, with no rows, isn't a total
  const zeros = (prefix: string) => Object.fromEntries(columns(prefix, TOTAL).map((box) => [box, '0.00']));
  await show('bir2307_text_0', { edits: zeros('bt_total') });
  expect(screen.getByText('Ready to save')).toBeTruthy();
  expect(screen.queryByText('Business tax')).toBeNull();
  await show('bir2307_text_0', { edits: { bt_total_total: '-', bt_total_tax: '-' } });
  expect(screen.queryByText('Business tax')).toBeNull();

  // zeros in the total row under real rows aren't shown as a total, and the rows don't add up to them
  await show('bir2307_text_0', { edits: zeros('ewt_total') });
  expect(screen.getByText(/^Check: Totals\./)).toBeTruthy();
  expect(screen.queryByText('₱0.00')).toBeNull();
  expect(screen.getByText("Tax withheld — · the rows don't add up to the total row")).toBeTruthy();
  expect(await boxesIn('Income payments')).toEqual(columns('ewt_total', TOTAL));
  // a total row that wasn't read: the same
  const blank = Object.fromEntries(columns('ewt_total', TOTAL).map((box) => [box, '']));
  await show('bir2307_text_0', { edits: blank });
  expect(screen.getByText("Tax withheld — · the rows don't add up to the total row")).toBeTruthy();
});

test('no income payments read', async () => {
  await show('bir2307_text_0', {
    edit: (r) => {
      r.reads = r.reads.filter((b) => !b.name.startsWith('ewt'));
    },
  });
  expect(screen.getByText('INCOME PAYMENTS')).toBeTruthy();
  expect(screen.getByText('No income payments read')).toBeTruthy();
  expect(screen.queryByText('TOTALS')).toBeNull();
});

test('the checks run once for a scan as it stands', () => {
  const scan = getScan(addScan({ label: 'A 2307', source: 'pdf', result: parseScanResult(coreJson('bir2307_text_0')) }))!;
  const l: Lists = { parties: [], items: [], version: 1 };
  expect(certOf(scan, l, SETTINGS)).toBe(certOf(scan, l, SETTINGS));
  // a change to the scan, the lists or the settings runs them again
  expect(certOf({ ...scan }, l, SETTINGS)).not.toBe(certOf(scan, l, SETTINGS));
  expect(certOf(scan, { ...l, version: 2 }, SETTINGS)).not.toBe(certOf(scan, l, SETTINGS));
  expect(certOf(scan, l, { ...SETTINGS })).not.toBe(certOf(scan, l, SETTINGS));
});
