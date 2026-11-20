import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import Result from '../app/result';
import { addScan, setEdit, type StoredScan } from '../lib/scans';
import { settings, updateSettings } from '../lib/settings';
import type { ScanResult } from '../modules/scanner';
import { parseScanResult } from '../modules/scanner/src/parse';
import { coreJson } from '../test-utils/coreJson';
import { memoryFs } from '../test-utils/memoryFs';
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
  await updateSettings({ vatRegistered: null, revenueAccount: '', expenseAccount: '', atc: '' });
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
