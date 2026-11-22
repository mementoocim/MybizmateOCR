import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import Result from '../app/result';
import { addParty, clearParties } from '../lib/lists';
import { addScan, setEdit, type StoredScan } from '../lib/scans';
import { settings, updateSettings } from '../lib/settings';
import type { ScanResult } from '../modules/scanner';
import { parseScanResult } from '../modules/scanner/src/parse';
import { coreJson } from '../test-utils/coreJson';
import { memoryFs } from '../test-utils/memoryFs';
import { PACK_LISTS } from '../test-utils/packLists';
import { pinToday } from '../test-utils/today';

let mockParams: { id?: string; from?: string } = {};
const mockToast = jest.fn();

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
}));
jest.mock('../lib/toast', () => ({ toast: (m: string) => mockToast(m) }));
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
}));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: async () => ({ localUri: 'file:///s' }) }) } }));
jest.mock('expo-file-system', () => require('../test-utils/memoryFs').memoryFs.module);

async function show(
  stem: string,
  opts: { source?: StoredScan['source']; edit?: (r: ScanResult) => void } = {},
): Promise<string> {
  const result = parseScanResult(coreJson(stem));
  opts.edit?.(result);
  const id = addScan({ label: 'Camera photo', source: opts.source ?? 'camera', result });
  mockParams = { id };
  await render(<Result />);
  return id;
}

const press = (el: Parameters<typeof fireEvent.press>[0]) => act(async () => fireEvent.press(el));
const type = (label: string, text: string) => act(async () => fireEvent.changeText(screen.getByLabelText(label), text));

beforeAll(() => pinToday(new Date(2026, 10, 18, 10, 0)));
afterAll(() => jest.useRealTimers());

beforeEach(async () => {
  jest.clearAllMocks();
  memoryFs.reset();
  await updateSettings({ vatRegistered: null, revenueAccount: '', expenseAccount: '', atc: '', offsetAccount: '' });
});

test('the first sale asks whether the business is VAT-registered', async () => {
  await show('inv_0007');
  await press(screen.getByTestId('save-open'));
  expect(screen.getByText('Save as a sale')).toBeTruthy();
  expect(screen.getByText('Your business is')).toBeTruthy();
  await press(screen.getByText('Not VAT-registered'));
  expect(settings().vatRegistered).toBe(false);
  expect(screen.getByRole('button', { name: 'Non-VAT', selected: true })).toBeTruthy();
  expect(screen.queryByText('Your business is')).toBeNull();
});

test('Save stays off until the account and the terms are set', async () => {
  await show('inv_0007', {
    edit: (r) => {
      r.terms = null;
    },
  });
  await press(screen.getByTestId('save-open'));
  await press(screen.getByText('VAT-registered'));
  expect(screen.getByTestId('save-confirm')).toBeDisabled();
  await type('Revenue account', '4010');
  expect(screen.getByTestId('save-confirm')).toBeDisabled();
  await press(screen.getByRole('button', { name: 'Cash' }));
  expect(screen.getByTestId('save-confirm')).toBeEnabled();
});

test('saving', async () => {
  await show('inv_0007');
  await press(screen.getByTestId('save-open'));
  await press(screen.getByText('Not VAT-registered'));
  await type('Revenue account', '4010');
  await press(screen.getByTestId('save-confirm'));
  expect(mockToast).toHaveBeenCalledWith('Saved. Export it from Saved invoices.');
  expect(screen.getByText('Saved as a sale on Nov 18, 2026. Not exported yet.')).toBeTruthy();
  expect(screen.getByTestId('save-open')).toHaveTextContent('Save changes');
  expect(settings().revenueAccount).toBe('4010');
});

test("a sample can't be saved", async () => {
  await show('inv_0007', { source: 'sample' });
  expect(screen.queryByTestId('save-open')).toBeNull();
  expect(screen.getByText("Sample invoices are made up, so they can't be saved.")).toBeTruthy();
});

test('the date is needed first', async () => {
  const id = await show('inv_0007');
  await act(async () => setEdit(id, 'date', 'hello'));
  await press(screen.getByTestId('save-open'));
  expect(mockToast).toHaveBeenCalledWith('Add the date first: tap Date.');
  expect(screen.queryByText('Save as a sale')).toBeNull();
});

test('a purchase needs its supplier first', async () => {
  await show('inv_0007');
  await press(screen.getByText('A purchase'));
  expect(screen.getByTestId('save-open')).toHaveTextContent('Save purchase');
  await press(screen.getByTestId('save-open'));
  expect(mockToast).toHaveBeenCalledWith('Choose the supplier first: tap Supplier.');
});

test('withholding asks for the ATC', async () => {
  const id = await show('svc_0002');
  await act(async () => setEdit(id, 'withholding', '50.00'));
  await press(screen.getByTestId('save-open'));
  expect(screen.getByLabelText('Withholding tax ATC')).toBeTruthy();
  expect(
    screen.getByText('The invoice shows ₱50.00 withheld. MyBizMate works out the tax from the ATC code.'),
  ).toBeTruthy();
  expect(screen.getByText(/things? (is|are) still marked to check\. You can save anyway\./)).toBeTruthy();
});

test('a change after saving says the export still has the saved version', async () => {
  const id = await show('inv_0007');
  await press(screen.getByTestId('save-open'));
  await press(screen.getByText('Not VAT-registered'));
  await type('Revenue account', '4010');
  await press(screen.getByTestId('save-confirm'));
  expect(screen.getByText('Saved as a sale on Nov 18, 2026. Not exported yet.')).toBeTruthy();
  await act(async () => setEdit(id, 'invoice_no', '0007999'));
  expect(
    screen.getByText("Changed since it was saved. The export still has the saved version: tap Save changes."),
  ).toBeTruthy();
  await press(screen.getByTestId('save-open'));
  await press(screen.getByTestId('save-confirm'));
  expect(screen.getByText('Saved as a sale on Nov 18, 2026. Not exported yet.')).toBeTruthy();
  // a switch to a purchase changes what would go out too
  await press(screen.getByText('A purchase'));
  expect(
    screen.getByText("Changed since it was saved. The export still has the saved version: tap Save changes."),
  ).toBeTruthy();
});

// A made-up 2307 (fixtures/core/expected2307) imported as a text PDF. bir2307_text_1, Q4 2026: four income payments
// and one business-tax row, tax withheld ₱47,937.78 + ₱9,462.76; its payor, Castillo Eatery, with no customers yet.

test('saving a 2307: the first save asks for the offset account', async () => {
  const id = await show('bir2307_text_1', { source: 'pdf' });
  expect(screen.getByTestId('save-open')).toHaveTextContent('Save 2307');
  await press(screen.getByTestId('save-open'));
  expect(
    screen.getByText("Each payment becomes a row in MyBizMate's 2307-CWT import. Export it from Saved invoices."),
  ).toBeTruthy();
  expect(screen.getByText('Castillo Eatery (not in your list)')).toBeTruthy();
  expect(screen.getByText('Q4 2026')).toBeTruthy();
  expect(screen.getByText('₱57,400.54')).toBeTruthy(); // the rows' tax withheld, both tables
  expect(screen.getByLabelText('Offset account').props.value).toBe('');
  expect(screen.getByTestId('save-confirm')).toHaveTextContent('Save 2307');
  expect(screen.getByTestId('save-confirm')).toBeDisabled();
  await type('Offset account', ' 1205 CWT Receivable ');
  expect(screen.getByTestId('save-confirm')).toBeEnabled();
  await press(screen.getByTestId('save-confirm'));
  expect(mockToast).toHaveBeenCalledWith('Saved. Export it from Saved invoices.');
  expect(screen.getByText('Saved as a 2307 on Nov 18, 2026. Not exported yet.')).toBeTruthy();
  expect(screen.getByTestId('save-open')).toHaveTextContent('Save changes');
  expect(settings().offsetAccount).toBe('1205 CWT Receivable');

  // a change after saving: the export still has the saved rows until Save changes
  await act(async () => setEdit(id, 'ewt1_tax', '21,942.00'));
  expect(
    screen.getByText("Changed since it was saved. The export still has the saved version: tap Save changes."),
  ).toBeTruthy();
  await press(screen.getByTestId('save-open'));
  expect(screen.getByLabelText('Offset account').props.value).toBe('1205 CWT Receivable'); // as it was saved
  expect(screen.getByText('₱57,400.06')).toBeTruthy(); // the rows' tax, not the total rows'
  await press(screen.getByTestId('save-confirm'));
  expect(screen.getByText('Saved as a 2307 on Nov 18, 2026. Not exported yet.')).toBeTruthy();

  // the next 2307 has the account already
  await show('bir2307_text_0', { source: 'pdf' });
  await press(screen.getByTestId('save-open'));
  expect(screen.getByLabelText('Offset account').props.value).toBe('1205 CWT Receivable');
  expect(screen.getByTestId('save-confirm')).toBeEnabled();
});

test("an unsure payor: the save sheet names the payor as written, the name that goes out", async () => {
  // the pack's customers: Santos Merchandise (C004) is only the closest match for "Santos Merchandising"
  for (const { id, exportedAt, ...customer } of PACK_LISTS.parties) await addParty(customer);
  try {
    const id = await show('bir2307_text_0', { source: 'pdf' });
    await act(async () => {
      setEdit(id, 'payor_name', 'Santos Merchandising');
      setEdit(id, 'payor_tin', '99988877700000');
    });
    await press(screen.getByTestId('save-open'));
    expect(screen.getByText('Santos Merchandising (match not confirmed)')).toBeTruthy();
  } finally {
    await clearParties('customer');
  }
});

test('a 2307 needs its period first', async () => {
  const id = await show('bir2307_text_1', { source: 'pdf' });
  await act(async () => setEdit(id, 'period_to', ''));
  await press(screen.getByTestId('save-open'));
  expect(mockToast).toHaveBeenCalledWith('Add the period first: tap Period.');
  expect(screen.queryByLabelText('Offset account')).toBeNull();
});

test('a 2307 needs its payor first, and its card says so', async () => {
  // no name, and a TIN that matches no customer (there are none yet): nothing to check, but no payor to export
  const id = await show('bir2307_text_1', { source: 'pdf' });
  await act(async () => setEdit(id, 'payor_name', ''));
  expect(screen.getByText('Add the payor first: tap Payor')).toBeTruthy();
  expect(screen.queryByText('Ready to save')).toBeNull();
  await press(screen.getByTestId('save-open'));
  expect(mockToast).toHaveBeenCalledWith('Add the payor first: tap Payor.');
  expect(screen.queryByLabelText('Offset account')).toBeNull();
});

test('a 2307 needs its payments first, and its card says so', async () => {
  await show('bir2307_text_0', {
    source: 'pdf',
    edit: (r) => {
      r.reads = r.reads.filter((b) => !b.name.startsWith('ewt')); // it has no business-tax rows either
    },
  });
  expect(screen.getByText('No income payments were read')).toBeTruthy();
  expect(screen.queryByText('Ready to save')).toBeNull();
  await press(screen.getByTestId('save-open'));
  expect(mockToast).toHaveBeenCalledWith('No income payments were read.');
  expect(screen.queryByLabelText('Offset account')).toBeNull();
});
