import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import Result from '../app/result';
import { clearItems, clearParties, importPartiesCsv, lists } from '../lib/lists';
import { addScan, setEdit } from '../lib/scans';
import { parseScanResult } from '../modules/scanner/src/parse';
import { coreJson } from '../test-utils/coreJson';
import { memoryFs } from '../test-utils/memoryFs';

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

// The made-up lists (fixtures/lists): the synthetic pack's customers, a supplier, and a customer who is also a supplier.
const PARTIES: string = require('fs').readFileSync('fixtures/lists/parties.csv', 'utf8');

/** Sample 0007 (its customer: Torres Construction Supply, in the made-up lists; its first item: Sugar). */
async function showSample(): Promise<string> {
  const id = addScan({ label: 'Sample 0007', source: 'sample', result: parseScanResult(coreJson('inv_0007')) });
  mockParams = { id };
  await render(<Result />);
  return id;
}

const press = (el: Parameters<typeof fireEvent.press>[0]) => act(async () => fireEvent.press(el));
const type = (label: string, text: string) => act(async () => fireEvent.changeText(screen.getByLabelText(label), text));

beforeEach(async () => {
  jest.clearAllMocks();
  memoryFs.reset();
  await clearParties('customer');
  await clearParties('supplier');
  await clearItems();
});

test('a matched customer', async () => {
  await importPartiesCsv(PARTIES, 'customer');
  await showSample();
  await press(screen.getByText('Customer'));
  expect(screen.getByText('Torres Construction Supply · TIN 223-344-556-00000')).toBeTruthy();
  expect(screen.getByText('Matched by its TIN and name.')).toBeTruthy();
});

test('choose another', async () => {
  await importPartiesCsv(PARTIES, 'customer');
  await showSample();
  await press(screen.getByText('Customer'));
  await press(screen.getByText('Choose another'));
  await type('Search your customers', 'santos');
  await press(screen.getByText('Santos General Merchandise'));
  expect(screen.getByText('Santos General Merchandise')).toBeTruthy();
  expect(screen.getByText('Chosen from your customers')).toBeTruthy();
  expect(screen.getByText('You chose this customer.')).toBeTruthy();
});

test('add a new customer', async () => {
  await importPartiesCsv(PARTIES, 'customer');
  const id = await showSample();
  await act(async () => {
    setEdit(id, 'customer_name', 'Bagong Tindahan');
    setEdit(id, 'customer_tin', '900-000-003');
  });
  expect(screen.getByText(/Customer \(not in your list\)/)).toBeTruthy();
  await press(screen.getByText('Customer'));
  expect(screen.getByText('Not in your customer list.')).toBeTruthy();
  await press(screen.getByText('Add “Bagong Tindahan” to your customers'));
  expect(mockToast).toHaveBeenCalledWith('Added to your customers.');
  expect(lists().parties.find((p) => p.registeredName === 'Bagong Tindahan')).toMatchObject({
    type: 'customer',
    tin: '900-000-003',
    fromScan: true,
    code: '',
  });
  expect(screen.getByText('Chosen from your customers')).toBeTruthy();
  expect(screen.queryByText(/Customer \(/)).toBeNull();
});

test('an empty customer list', async () => {
  await showSample();
  await press(screen.getByText('Customer'));
  expect(screen.getByText('Your customer list is empty. Import it in Your lists, or add this customer now.')).toBeTruthy();
  expect(screen.getByText('Add “TorresConstruction Supply” to your customers')).toBeTruthy();
});

test('a supplier from the list', async () => {
  await importPartiesCsv(PARTIES, 'customer');
  await showSample();
  await press(screen.getByText('A purchase'));
  await press(screen.getByText('Supplier'));
  await type('Search your suppliers', 'wholesale');
  await press(screen.getByText('Isabela Wholesale Trading'));
  expect(screen.getByText('Isabela Wholesale Trading')).toBeTruthy();
  expect(screen.getByText('From your suppliers')).toBeTruthy();
  expect(screen.queryByText(/Supplier \(choose one\)/)).toBeNull();
});

test('a typed supplier', async () => {
  await showSample();
  await press(screen.getByText('A purchase'));
  await press(screen.getByText('Supplier'));
  await type("Supplier's name", 'Juan Hardware');
  await press(screen.getByText('Use this name'));
  expect(screen.getByText('Juan Hardware')).toBeTruthy();
  expect(screen.getByText('Not in your supplier list')).toBeTruthy();
});

test('various suppliers', async () => {
  await showSample();
  await press(screen.getByText('A purchase'));
  await press(screen.getByText('Supplier'));
  await press(screen.getByText('Various suppliers'));
  expect(screen.getByText('Various suppliers')).toBeTruthy();
  expect(screen.getByText('Exported as VARIOUS-SUPP')).toBeTruthy();
});

test('add a typed supplier to the list', async () => {
  await showSample();
  await press(screen.getByText('A purchase'));
  await press(screen.getByText('Supplier'));
  await type("Supplier's name", 'Juan Hardware');
  await press(screen.getByText('Add to your suppliers'));
  expect(mockToast).toHaveBeenCalledWith('Added to your suppliers.');
  expect(lists().parties.find((p) => p.registeredName === 'Juan Hardware')).toMatchObject({ type: 'supplier', fromScan: true });
  expect(screen.getByText('From your suppliers')).toBeTruthy();
});

test('search by TIN', async () => {
  await importPartiesCsv(PARTIES, 'customer');
  await showSample();
  await press(screen.getByText('A purchase'));
  await press(screen.getByText('Supplier'));
  await type('Search your suppliers', '900000002');
  expect(screen.getByText('Maria Santos Reyes')).toBeTruthy();
  expect(screen.queryByText('Isabela Wholesale Trading')).toBeNull();
});

test('add an item from a scan', async () => {
  await showSample();
  await press(screen.getByText('Sugar'));
  await press(screen.getByText('Add “Sugar” to your items'));
  expect(mockToast).toHaveBeenCalledWith('Added to your items.');
  expect(lists().items).toMatchObject([{ name: 'Sugar', unit: 'kg', price: 85 }]);
  expect(screen.queryByText('Add “Sugar” to your items')).toBeNull();
});
