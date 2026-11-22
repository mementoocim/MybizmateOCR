import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { AccessibilityInfo, ScrollView, View } from 'react-native';

import Result from '../app/result';
import { certOf } from '../lib/cert';
import { addParty, clearParties, type Lists } from '../lib/lists';
import { addScan, getScan, type ScanSource, setEdit } from '../lib/scans';
import type { Settings } from '../lib/settings';
import { colors, space, type } from '../lib/theme';
import type { ScanResult } from '../modules/scanner';
import { parseScanResult } from '../modules/scanner/src/parse';
import { coreJson } from '../test-utils/coreJson';
import { memoryFs } from '../test-utils/memoryFs';
import { PACK_LISTS } from '../test-utils/packLists';

// Task 2's made-up 2307s (fixtures/core/expected2307) as scans: a text PDF, a picture PDF or a photo, each box read as
// written. The customers, when there are any, are the Python's synthetic scan pack, whose names the made-up payors use.
// Design B §9.5: the 2307 is a ledger, as the invoice is. Section strips (Period, Payee, Payor, Income payments · N,
// Business tax · N, Totals), each row one button that TalkBack reads whole, flagged rows with a bar, a Check badge and
// their reason, and a flag chip that scrolls to its row and opens it.

let mockParams: { id?: string; from?: string } = {};

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ back: jest.fn(), replace: jest.fn(), push: jest.fn() }),
  useIsFocused: () => true,
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
const button = (name: string) => screen.getByRole('button', { name });
const header = (name: string) => screen.getByRole('header', { name });

/** The boxes the open sheet lists, in order. */
const boxesShown = () => screen.queryAllByTestId(/^fix-/).map((el) => String(el.props.testID).slice('fix-'.length));

/** The boxes a row's sheet shows, in order; the sheet is closed again. */
async function boxesIn(row: string): Promise<string[]> {
  await press(screen.getByText(row));
  const boxes = boxesShown();
  await press(screen.getByLabelText('Close'));
  return boxes;
}

const columns = (prefix: string, names: string[]) => names.map((c) => `${prefix}_${c}`);
const ROW = ['payment', 'atc', 'm1', 'm2', 'm3', 'total', 'tax'];
const TOTAL = ['m1', 'm2', 'm3', 'total', 'tax'];

/** The open sheet. */
const sheet = () => within(screen.getByTestId('sheet-panel'));

// jest's views and scroll views have no layout, and share their native methods: Android's measurements stand in.
const viewMethods = View.prototype as unknown as { measureLayout: jest.Mock };
const scrollMethods = ScrollView.prototype as unknown as { getInnerViewRef: jest.Mock; scrollTo: jest.Mock };
const focus = jest.mocked(AccessibilityInfo.sendAccessibilityEvent);
type Said = { props?: { accessibilityLabel?: string } };
/** Where TalkBack focus was sent, as what each view says. */
const focusedNames = () => focus.mock.calls.map(([view, event]) => [(view as Said).props?.accessibilityLabel, event]);

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
  expect(screen.getByRole('header', { name: 'BIR Form 2307' })).toBeTruthy();
  expect(screen.getByRole('header', { name: 'Checks passed' })).toBeTruthy();
  expect(screen.getByText('Look over the values, then save')).toBeTruthy();

  // a strip per section, in today's order; the tables and their totals name their right column, the tax
  for (const section of ['Period', 'Payee', 'Payor', 'Income payments · 4', 'Business tax · 1', 'Totals']) {
    expect(header(section)).toBeTruthy();
  }
  expect(screen.getAllByText('Tax')).toHaveLength(3);

  // the period in figures, its quarter a badge beside it, which TalkBack says with the dates (ruling T4-4)
  expect(screen.getByText('Oct 1 – Dec 31, 2026')).toHaveStyle(type.figure);
  expect(screen.getByText('Q4')).toHaveStyle(type.badge);

  expect(screen.getByText('Peñaflor, Ma. Teresa Lim')).toBeTruthy();
  expect(screen.getByText('TIN 746-851-963-00000 · ZIP 3306')).toHaveStyle(type.figureSmall);

  expect(screen.getByText('Castillo Eatery')).toBeTruthy();
  // RNTL's default matcher collapses the sub's line break into a space
  expect(screen.getByText('Add your customers in Your lists to check names TIN 334-455-667-00000 · ZIP 3303')).toBeTruthy();

  // Ruling T12-1: a one-row section's row says its field first, since TalkBack can land on it from a chip or a closing
  // sheet; only the strip shows the field's name
  expect(button('Period, Oct 1 – Dec 31, 2026, Q4')).toBeTruthy();
  expect(button('Payee, Peñaflor, Ma. Teresa Lim, TIN 746-851-963-00000 · ZIP 3306')).toBeTruthy();
  expect(
    button('Payor, Castillo Eatery, Add your customers in Your lists to check names TIN 334-455-667-00000 · ZIP 3303'),
  ).toBeTruthy();
  for (const field of ['Period', 'Payee', 'Payor']) expect(screen.getAllByText(field)).toHaveLength(1);

  // each payment: its ATC and payment, its total under them, and its tax on the right, in a row without the peso sign
  const payments = [
    ['WI050 · Consultancy fees', 'Total 438,849.60', '21,942.48'],
    ['WI160 · Trucking services', 'Total 538,746.53', '10,774.93'],
    ['WI120 · Construction works', 'Total 155,025.06', '3,100.50'],
    ['WI515 · Sales commissions', 'Total 242,397.37', '12,119.87'],
  ];
  for (const [title, total, tax] of payments) {
    expect(button(`${title}, ${total}, ${tax}`)).toBeTruthy();
    expect(screen.getByText(total)).toHaveStyle(type.figureSmall);
    expect(screen.getByText(tax)).toHaveStyle(type.figure);
  }

  // the second table, laid out like the first
  expect(button('WV010 · Purchase of goods, Total 189,255.11, 9,462.76')).toBeTruthy();

  // each table's total row: its total, in mono as a payment's (ruling T12-2), and its tax, with the peso sign
  expect(button('Income payments, Total ₱1,375,018.56, ₱47,937.78')).toBeTruthy();
  expect(screen.getByText('Total ₱1,375,018.56')).toHaveStyle(type.figureSmall);
  expect(screen.getByText('₱47,937.78')).toHaveStyle(type.figureStrong);
  expect(button('Business tax, Total ₱189,255.11, ₱9,462.76')).toBeTruthy();
  expect(screen.getByText('Total ₱189,255.11')).toHaveStyle(type.figureSmall);
  expect(screen.getByText('₱9,462.76')).toHaveStyle(type.figureStrong);

  // none of an invoice's; saved as a 2307
  expect(screen.queryByRole('radiogroup', { name: 'This invoice is' })).toBeNull();
  for (const invoice of ['Invoice', 'Terms', 'Total due', 'Save sale']) {
    expect([invoice, screen.queryByText(invoice)]).toEqual([invoice, null]);
  }
  expect(screen.getByTestId('save-open')).toHaveTextContent('Save 2307');

  // every row opens what was read in its boxes
  expect(await boxesIn('Oct 1 – Dec 31, 2026')).toEqual(['period_from', 'period_to']);
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
  expect(screen.getByText('Not one calendar quarter')).toHaveStyle({ color: colors.warning });
  expect(screen.queryByText('Q4')).toBeNull(); // no quarter, no badge
  expect(within(screen.getByTestId('row-period')).getByTestId('flag-bar')).toBeTruthy();
  expect(button('Period, 10012026 – 11302026. Check: not one calendar quarter')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Period, to check' })).toBeTruthy();
  // the boxes as read, a box that wasn't read as a dash
  await show('bir2307_text_1', { edits: { period_to: '' } });
  expect(screen.getByText('10012026 – —')).toBeTruthy();
  expect(screen.getByText('Not one calendar quarter')).toBeTruthy();
});

test("the rows' flags", async () => {
  // bir2307_text_2's row 2: WC158 (1%) on 208,043.00, tax 2,080.43; the total row's tax is changed to match
  await show('bir2307_text_2', { edits: { ewt2_tax: '4,160.86', ewt_total_tax: '24,779.42' } });
  expect(screen.getByText('Not 1% of the total')).toHaveStyle({ color: colors.warning });
  expect(within(screen.getByTestId('row-ewt2')).getByText('Check')).toBeTruthy();
  expect(button('WC158 · Office supplies, Total 208,043.00, 4,160.86. Check: not 1% of the total')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Row 2 tax, to check' })).toBeTruthy();
  // a rate like 0.5%, as people write it
  await show('bir2307_text_2', { edits: { ewt2_atc: 'WC156' } });
  expect(button('WC156 · Office supplies, Total 208,043.00, 2,080.43. Check: not 0.5% of the total')).toBeTruthy();
  // an income payment's ATC must be one for income payments
  await show('bir2307_text_2', { edits: { ewt2_atc: 'WV010' } });
  expect(screen.getByText('WV010 · Office supplies')).toBeTruthy();
  expect(screen.getByText('Not an ATC for income payments')).toBeTruthy();
  expect(screen.getByText('2,080.43')).toBeTruthy();
  await show('bir2307_text_2', { edits: { ewt2_atc: '' } });
  expect(button('Office supplies, Total 208,043.00, 2,080.43. Check: no ATC')).toBeTruthy();
  // a business-tax row's own words
  await show('bir2307_photo_1', { edits: { bt1_atc: 'WC158' } });
  expect(
    button('WC158 · Purchase of goods, Total 149,514.00, 7,475.70. Check: not an ATC for business tax'),
  ).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Business tax row 1 ATC, to check' })).toBeTruthy();
});

test("a 2307's flag chip scrolls its row into view, then opens it", async () => {
  // the plan's call 10, as an invoice's chips: bir2307_text_2's row 2 tax doubled, the total row's tax to match
  await show('bir2307_text_2', { edits: { ewt2_tax: '4,160.86', ewt_total_tax: '24,779.42' } });
  expect(header('1 to check')).toBeTruthy();
  const content = {};
  scrollMethods.getInnerViewRef.mockReturnValueOnce(content);
  scrollMethods.scrollTo.mockClear();
  viewMethods.measureLayout.mockClear();
  viewMethods.measureLayout.mockImplementationOnce(
    (relativeTo, onSuccess) => relativeTo === content && onSuccess(0, 900, 360, 72),
  );
  await press(button('Row 2 tax, to check'));
  // measured against the scroll's content, and scrolled 24 dp under its top
  const measured = viewMethods.measureLayout.mock.contexts as { props: { testID: string } }[];
  expect(measured.map((row) => row.props.testID)).toEqual(['row-ewt2']);
  expect(scrollMethods.scrollTo).toHaveBeenCalledWith({ y: 900 - space.xl, animated: true });
  // then its sheet, as tapping the row opens it
  expect(sheet().getByRole('header', { name: 'WC158 · Office supplies' })).toBeTruthy();
  expect(boxesShown()).toEqual(columns('ewt2', ROW));
  await press(screen.getByLabelText('Close'));

  // the Period's chip opens the period's boxes; the strip's Period and the sheet's are both headers
  await show('bir2307_text_1', { edits: { period_to: '11302026' } });
  await press(button('Period, to check'));
  expect(sheet().getByRole('header', { name: 'Period' })).toBeTruthy();
  expect(boxesShown()).toEqual(['period_from', 'period_to']);
  // closing it gives TalkBack focus back to the row, which says its field (ruling T12-1)
  focus.mockClear();
  await press(screen.getByLabelText('Close'));
  expect(focusedNames()).toEqual([['Period, 10012026 – 11302026. Check: not one calendar quarter', 'focus']]);
  // and the totals' chip, its table's total row
  await show('bir2307_text_0', { edits: { ewt_total_tax: '10,000.00' } });
  await press(button('Totals, to check'));
  expect(sheet().getByRole('header', { name: 'Income payments' })).toBeTruthy();
  expect(boxesShown()).toEqual(columns('ewt_total', TOTAL));
});

test('fixing a month re-runs the checks', async () => {
  const id = await show('bir2307_text_0');
  expect(screen.getByRole('header', { name: 'Checks passed' })).toBeTruthy();
  await press(screen.getByText('WC610 · Purchase of corn'));
  await press(screen.getByTestId('fix-ewt1_m1'));
  await act(async () => fireEvent.changeText(screen.getByLabelText('What the box says'), '100,674.00'));
  await press(screen.getByTestId('box-save'));
  expect(screen.getByText('You changed it to “100,674.00”.')).toBeTruthy();
  // the row's months, and the total row's 1st month, no longer add up
  expect(screen.getByRole('header', { name: '2 to check' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Row 1 months, to check' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Totals, to check' })).toBeTruthy();
  await press(screen.getByLabelText('Close'));
  expect(
    button("WC610 · Purchase of corn, Total 114,402.88, 1,144.03. Check: the months don't add up to the total"),
  ).toBeTruthy();
  expect(
    button("Income payments, Total ₱559,190.98, ₱10,039.79. Check: the rows don't add up to the total row"),
  ).toBeTruthy();
  // back as written: every check passes again
  await act(async () => setEdit(id, 'ewt1_m1', '100,664.00'));
  expect(screen.getByRole('header', { name: 'Checks passed' })).toBeTruthy();
  expect(button('WC610 · Purchase of corn, Total 114,402.88, 1,144.03')).toBeTruthy();
  expect(screen.queryByText("The months don't add up to the total")).toBeNull();
});

test("the payor's match", async () => {
  await addPackCustomers();
  // bir2307_text_0's payor is the pack's Reyes Sari-Sari Store, TIN 456-789-012-00000: matched like a sale's customer,
  // and shown as the list has it
  await show('bir2307_text_0', { edits: { payor_name: 'REYES SARI SARI STORE' } });
  expect(screen.getByText('Reyes Sari-Sari Store')).toBeTruthy();
  expect(screen.getByText('Matched in your customers TIN 456-789-012-00000 · ZIP 3306')).toBeTruthy();
  expect(screen.getByRole('header', { name: 'Checks passed' })).toBeTruthy();

  const stranger = { payor_name: 'Magsaysay Hardware', payor_tin: '99988877700000' };
  await show('bir2307_text_0', { edits: stranger });
  expect(screen.getByText('Magsaysay Hardware')).toBeTruthy();
  // flagged: the bar and Check; the sub-line says why
  expect(within(screen.getByTestId('row-payor')).getByTestId('flag-bar')).toBeTruthy();
  expect(
    button('Payor, Magsaysay Hardware, Not in your customers TIN 999-888-777-00000 · ZIP 3306. Check'),
  ).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Payor (not in your customers), to check' })).toBeTruthy();

  // Santos Merchandise and Santos General Merchandise are both customers: an unsure match is shown as written, the
  // name that goes out, with the closest customer under it (a 2307's payor can't be chosen yet)
  await show('bir2307_text_0', { edits: { payor_name: 'Santos Merchandising', payor_tin: '99988877700000' } });
  expect(screen.getByText('Santos Merchandising')).toBeTruthy();
  expect(
    button('Payor, Santos Merchandising, Closest match: Santos Merchandise TIN 999-888-777-00000 · ZIP 3306. Check'),
  ).toBeTruthy();
  expect(screen.queryByText(/Tap to compare/)).toBeNull();
  expect(screen.getByRole('button', { name: 'Payor (confirm the match), to check' })).toBeTruthy();

  // no payor written: never an invoice's walk-in
  await show('bir2307_text_0', { edits: { payor_name: '', payor_tin: '' } });
  expect(button('Payor, blank, Not in your customers TIN — · ZIP 3306. Check')).toBeTruthy();
  expect(screen.queryByText(/VARIOUS|Walk-in/)).toBeNull();
  expect(screen.getByRole('button', { name: "Payor's TIN, to check" })).toBeTruthy();

  // the payee isn't matched: the business is the payee
  await show('bir2307_text_0');
  expect(screen.getByText('TIN 211-305-418-00000 · ZIP 3305')).toBeTruthy();
});

test('the photo checks: a photo or a PDF read from its page, never a page read from its text', async () => {
  const blurry = (r: ScanResult) => {
    r.sharpness = 0.1; // the 2307's minimum is 0.5
  };
  await show('bir2307_photo_0', { edit: blurry });
  expect(screen.getByRole('button', { name: 'Blurry photo (retake it), to check' })).toBeTruthy();
  await show('bir2307_picture_0', { edit: blurry });
  expect(screen.getByRole('button', { name: 'Blurry photo (retake it), to check' })).toBeTruthy();
  await show('bir2307_text_0', {
    edit: (r) => {
      r.sharpness = 0.1;
      r.light = 10;
    },
  });
  expect(screen.getByRole('header', { name: 'Checks passed' })).toBeTruthy();
  // a page with visible text that isn't a picture, one box of it read by the model from the page
  await show('bir2307_text_0', {
    edit: (r) => {
      blurry(r);
      r.reads[0] = { ...r.reads[0], fromText: false };
    },
  });
  expect(screen.getByRole('button', { name: 'Blurry photo (retake it), to check' })).toBeTruthy();
});

test("the business-tax table, and a total row that isn't a total", async () => {
  // bir2307_text_0 has no business-tax rows: no section, and no business-tax total
  await show('bir2307_text_0');
  expect(screen.queryByRole('header', { name: /^Business tax/ })).toBeNull();
  expect(screen.queryByText('Business tax')).toBeNull();
  expect(button('Income payments, Total ₱559,190.98, ₱10,039.79')).toBeTruthy();

  // a template's total line printing 0.00 or a dash, with no rows, isn't a total
  const zeros = (prefix: string) => Object.fromEntries(columns(prefix, TOTAL).map((box) => [box, '0.00']));
  await show('bir2307_text_0', { edits: zeros('bt_total') });
  expect(screen.getByRole('header', { name: 'Checks passed' })).toBeTruthy();
  expect(screen.queryByText('Business tax')).toBeNull();
  await show('bir2307_text_0', { edits: { bt_total_total: '-', bt_total_tax: '-' } });
  expect(screen.queryByText('Business tax')).toBeNull();

  // zeros in the total row under real rows aren't shown as a total, and the rows don't add up to them
  await show('bir2307_text_0', { edits: zeros('ewt_total') });
  expect(screen.getByRole('button', { name: 'Totals, to check' })).toBeTruthy();
  expect(screen.queryByText('₱0.00')).toBeNull();
  expect(button("Income payments, Total —, —. Check: the rows don't add up to the total row")).toBeTruthy();
  expect(await boxesIn('Income payments')).toEqual(columns('ewt_total', TOTAL));
  // a total row that wasn't read: the same
  const blank = Object.fromEntries(columns('ewt_total', TOTAL).map((box) => [box, '']));
  await show('bir2307_text_0', { edits: blank });
  expect(button("Income payments, Total —, —. Check: the rows don't add up to the total row")).toBeTruthy();
});

test('no income payments read', async () => {
  await show('bir2307_text_0', {
    edit: (r) => {
      r.reads = r.reads.filter((b) => !b.name.startsWith('ewt'));
    },
  });
  expect(header('Income payments · 0')).toBeTruthy();
  expect(screen.getByText('No income payments read')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'No income payments read' })).toBeNull(); // it opens nothing
  expect(screen.queryByRole('header', { name: 'Totals' })).toBeNull();
});

test('eight payment rows and long values show in full', async () => {
  // Review Focus 5: bir2307_text_0 with rows 3 to 8 as copies of row 1, a 61-character payee and a tax in the millions
  const name = 'Cagayan Valley Integrated Rice and Corn Producers Cooperative';
  await show('bir2307_text_0', {
    edits: { payee_name: name, ewt_total_tax: '12,345,678.90' },
    edit: (r) => {
      const row1 = r.reads.filter((b) => b.name.startsWith('ewt1_'));
      for (let n = 3; n <= 8; n++) {
        r.reads.push(...row1.map((b) => ({ ...b, name: b.name.replace('ewt1_', `ewt${n}_`) })));
      }
    },
  });
  expect(header('Income payments · 8')).toBeTruthy();
  expect(screen.getAllByTestId(/^row-ewt\d+$/).map((row) => row.props.testID)).toEqual(
    [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `row-ewt${n}`),
  );
  expect(screen.getAllByText('WC610 · Purchase of corn')).toHaveLength(7); // row 1 and its 6 copies
  for (const text of [name, '₱12,345,678.90']) expect(screen.getByText(text).props.numberOfLines).toBeUndefined();
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
