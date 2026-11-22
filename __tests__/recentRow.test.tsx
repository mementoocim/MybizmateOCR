import { act, fireEvent, render, screen, within } from '@testing-library/react-native';

import { RecentRow } from '../components/RecentRow';
import { addParty, clearItems, clearParties } from '../lib/lists';
import { saveScan } from '../lib/saved';
import { addScan, getScan, type ScanSource, setEdit, type StoredScan, updateScan } from '../lib/scans';
import { colors, type } from '../lib/theme';
import type { ScanResult } from '../modules/scanner';
import { parseScanResult } from '../modules/scanner/src/parse';
import { coreJson } from '../test-utils/coreJson';
import { memoryFs } from '../test-utils/memoryFs';
import { pinToday } from '../test-utils/today';
import { typeStylesOf } from '../test-utils/typeStyles';

// Design B §9.2: one of Home's recent scans is a list row. Its title is where it came from (a PDF's file name), its
// sub-line when it was read and the form found, and its badge the scan's one state, as the Scan screen's strip has it
// (lib/scanState). The row is one stop for TalkBack, and the badge is part of its label (ruling T4-4).

jest.mock('expo-file-system', () => require('../test-utils/memoryFs').memoryFs.module);

const TODAY = new Date(2026, 10, 18, 10, 0); // a scan that isn't a sample is checked as of the day it's read
const DETAILS = { taxType: 'VAT', account: '4010', terms: 'account', atc: '' } as const;
const noop = () => {};

/** A fixture's scan: a camera photo unless said, with what the scanner read changed, and the person's changes. */
function scanOf(
  stem: string,
  opts: {
    source?: ScanSource;
    label?: string;
    edit?: (r: ScanResult) => ScanResult;
    change?: Parameters<typeof updateScan>[1];
  } = {},
): StoredScan {
  const read = parseScanResult(coreJson(stem));
  const source = opts.source ?? 'camera';
  const id = addScan({
    label: opts.label ?? 'Camera photo',
    source,
    sampleId: source === 'sample' ? stem : undefined,
    result: opts.edit ? opts.edit(read) : read,
  });
  if (opts.change) updateScan(id, opts.change);
  return getScan(id)!;
}

/** A made-up 2307 imported as a text PDF, with no income payments read: nothing to check, but it can't be saved. */
const noPayments = () =>
  scanOf('bir2307_text_0', {
    source: 'pdf',
    label: 'PDF: bir2307_text_0.pdf',
    edit: (r) => ({ ...r, reads: r.reads.filter((b) => !b.name.startsWith('ewt')) }),
  });

/** Sample 0007's customer, Torres Construction Supply, isn't this one. */
const OTHER_CUSTOMER = {
  code: 'C020',
  type: 'customer',
  entity: 'company',
  registeredName: 'Santos Merchandising',
  lastName: '',
  firstName: '',
  middleName: '',
  tradeName: '',
  tin: '',
  address: '',
  vatStatus: '',
  terms: '',
  fromScan: false,
} as const;

beforeAll(() => pinToday(TODAY));
afterAll(() => jest.useRealTimers());

beforeEach(async () => {
  memoryFs.reset();
  jest.setSystemTime(TODAY);
  await clearParties('customer');
  await clearParties('supplier');
  await clearItems();
});

test("a badge per state, in homeBadge's order: Changed, Saved, Sample, Couldn't find the form, N to check, Can't save yet, Checks passed", async () => {
  // saved, then changed in its import row (its invoice number)
  const changed = scanOf('inv_0007');
  await saveScan(changed.id, DETAILS);
  setEdit(changed.id, 'invoice_no', '0007999');
  // saved, and as it was saved
  const saved = scanOf('inv_0007');
  await saveScan(saved.id, DETAILS);
  const rows: [StoredScan, string, string][] = [
    [getScan(changed.id)!, 'Camera photo, 10:00 AM · MyBizMate Sales Invoice, Changed', colors.warning],
    [getScan(saved.id)!, 'Camera photo, 10:00 AM · MyBizMate Sales Invoice, Saved', colors.mute],
    // a sample says so, though it has things to check (its date and its VAT breakdown)
    [
      scanOf('inv_0051', { source: 'sample', label: 'Sample 0051' }),
      'Sample 0051, 10:00 AM · MyBizMate Sales Invoice, Sample',
      colors.mute,
    ],
    [scanOf('blank_page'), "Camera photo, 10:00 AM, Couldn't find the form", colors.warning],
    // a purchase with no supplier chosen yet
    [
      scanOf('inv_0007', { change: { kind: 'purchase' } }),
      'Camera photo, 10:00 AM · MyBizMate Sales Invoice, 1 to check',
      colors.warning,
    ],
    [noPayments(), "bir2307_text_0.pdf, 10:00 AM · BIR Form 2307, Can't save yet", colors.warning],
    [scanOf('inv_0007'), 'Camera photo, 10:00 AM · MyBizMate Sales Invoice, Checks passed', colors.success],
  ];
  for (const [scan, name, color] of rows) {
    await render(<RecentRow scan={scan} onPress={noop} />);
    const row = screen.getByRole('button', { name }); // the badge is part of the row's label
    const badge = name.slice(name.lastIndexOf(', ') + 2);
    expect(within(row).queryByText(badge)).toBeNull(); // so it's not a stop of its own
    expect(within(row).getByText(badge, { includeHiddenElements: true })).toHaveStyle({ ...type.badge, color });
    await screen.unmount();
  }
});

test("title, time and form: a PDF by its file name, the form's name, a 12-hour clock; the time alone when no form was found", async () => {
  const onPress = jest.fn();
  await render(<RecentRow scan={scanOf('sales_text_0', { source: 'pdf', label: 'PDF: sales_text_0.pdf' })} onPress={onPress} />);
  expect(screen.getByText('sales_text_0.pdf')).toHaveStyle({ ...type.value, color: colors.ink });
  expect(screen.queryByText(/^PDF: /)).toBeNull();
  // mono, in caps by the style; the words stay as the form's name for TalkBack
  const sub = screen.getByText('10:00 AM · MyBizMate Sales Invoice');
  expect(typeStylesOf(sub)).toEqual(['figureSmall']); // a label of the same size flattens alike here
  expect(sub).toHaveStyle({ ...type.figureSmall, color: colors.mute, textTransform: 'uppercase' });
  await fireEvent.press(screen.getByRole('button', { name: /^sales_text_0\.pdf, / }));
  expect(onPress).toHaveBeenCalledTimes(1);

  // an afternoon scan of the office's Service Invoice
  jest.setSystemTime(new Date(2026, 10, 18, 14, 41));
  await render(<RecentRow scan={scanOf('svc_0000', { source: 'gallery', label: 'Photo from gallery' })} onPress={noop} />);
  expect(screen.getByText('2:41 PM · Service Invoice')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: /^Photo from gallery, 2:41 PM · Service Invoice, / })).toBeOnTheScreen();

  // no form found: just the time
  await render(<RecentRow scan={scanOf('blank_page')} onPress={noop} />);
  expect(screen.getByText('2:41 PM')).toBeOnTheScreen();
});

test('the badge follows the lists', async () => {
  await render(<RecentRow scan={scanOf('inv_0007')} onPress={noop} />);
  expect(screen.getByRole('button', { name: /, Checks passed$/ })).toBeOnTheScreen();
  // a customer list without this invoice's customer: "Customer (not in your list)"
  await act(async () => {
    await addParty(OTHER_CUSTOMER);
  });
  expect(screen.getByRole('button', { name: /, 1 to check$/ })).toBeOnTheScreen();
  expect(screen.getByText('1 to check', { includeHiddenElements: true })).toHaveStyle({ color: colors.warning });
});
