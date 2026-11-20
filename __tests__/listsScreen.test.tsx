import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert, type AlertButton } from 'react-native';

import ListsScreen from '../app/lists';
import { addParty, clearItems, clearParties, markPartiesExported } from '../lib/lists';
import { memoryFs } from '../test-utils/memoryFs';

// The made-up lists (fixtures/lists): 20 customers, a supplier, one that is both, and a row with no name.
const fs = require('fs');
const PARTIES: string = fs.readFileSync('fixtures/lists/parties.csv', 'utf8');
const ITEMS: string = fs.readFileSync('fixtures/lists/items.csv', 'utf8');

const mockToast = jest.fn();
const mockPick = jest.fn();

jest.mock('../lib/toast', () => ({ toast: (m: string) => mockToast(m) }));
jest.mock('expo-file-system', () => {
  const memory = require('../test-utils/memoryFs').memoryFs.module;
  return { ...memory, File: Object.assign(memory.File, { pickFileAsync: (options: object) => mockPick(options) }) };
});

/** What the file picker gives: a file with that name, type and text (its bytes UTF-8, as Google Sheets writes). */
const picked = (name: string, text: string | Error, type = 'text/csv') => ({
  canceled: false,
  result: {
    name,
    type,
    text: async () => (text instanceof Error ? Promise.reject(text) : text),
    bytes: async () => (text instanceof Error ? Promise.reject(text) : new TextEncoder().encode(text)),
  },
});

const press = (el: Parameters<typeof fireEvent.press>[0]) => act(async () => fireEvent.press(el));
let alertSpy: jest.SpyInstance;
/** Presses a button of the last Alert. */
const answer = (text: string) =>
  act(async () => {
    const buttons = alertSpy.mock.calls.at(-1)![2] as AlertButton[];
    buttons.find((b) => b.text === text)?.onPress?.();
  });

async function importFile(name: string, text: string | Error, type?: string) {
  mockPick.mockResolvedValueOnce(picked(name, text, type));
  await press(screen.getByText('Import CSV'));
}

beforeEach(async () => {
  jest.clearAllMocks();
  memoryFs.reset();
  await clearParties('customer');
  await clearParties('supplier');
  await clearItems();
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

test('the tabs: their counts, intros and empty lists', async () => {
  await render(<ListsScreen />);
  expect(screen.getByText('Customers (0)')).toBeTruthy();
  expect(
    screen.getByText(
      "Your scans' customers are matched against these names and TINs. In MyBizMate, export your parties, open the file in Excel or Google Sheets, save it as CSV, then import it here.",
    ),
  ).toBeTruthy();
  expect(screen.getByText('No customers yet.')).toBeTruthy();
  expect(screen.queryByText('Clear customers')).toBeNull();

  await press(screen.getByText('Suppliers (0)'));
  expect(
    screen.getByText('The suppliers you choose from when you save a purchase. Import them the same way as customers.'),
  ).toBeTruthy();
  expect(screen.getByText('No suppliers yet.')).toBeTruthy();

  await press(screen.getByText('Items (0)'));
  expect(
    screen.getByText('Your items and their list prices. A row whose price is far from its list price is marked to check.'),
  ).toBeTruthy();
  expect(screen.getByText('No items yet.')).toBeTruthy();
});

test('import customers', async () => {
  await render(<ListsScreen />);
  await importFile('parties.csv', PARTIES);
  expect(mockPick).toHaveBeenCalledWith({ mimeTypes: ['*/*'] });
  expect(mockToast).toHaveBeenCalledWith('Imported 21 customers and 2 suppliers. 1 row skipped: no name.');
  expect(screen.getByText('Customers (21)')).toBeTruthy();
  expect(screen.getByText('Suppliers (2)')).toBeTruthy();
  expect(screen.getByText('Sample Company')).toBeTruthy();
  expect(screen.getByText('TIN 123-456-789-00000 · C001')).toBeTruthy();
});

test("the toast's singulars", async () => {
  await render(<ListsScreen />);
  await importFile('one.csv', 'Code,Registered name\r\nC9,One Customer\r\n');
  expect(mockToast).toHaveBeenLastCalledWith('Imported 1 customer and 0 suppliers.');
  await press(screen.getByText('Suppliers (0)'));
  await importFile('one.csv', 'Code,Registered name\r\nS9,One Supplier\r\nX9,\r\n');
  expect(mockToast).toHaveBeenLastCalledWith('Imported 0 customers and 1 supplier. 1 row skipped: no name.');
  expect(screen.getByText('One Supplier')).toBeTruthy();
  expect(screen.getByText('S9')).toBeTruthy();
});

test('a cancelled pick does nothing', async () => {
  await render(<ListsScreen />);
  mockPick.mockResolvedValueOnce({ canceled: true, result: null });
  await press(screen.getByText('Import CSV'));
  expect(mockToast).not.toHaveBeenCalled();
  expect(screen.getByText('No customers yet.')).toBeTruthy();
});

test('not a CSV', async () => {
  await render(<ListsScreen />);
  await importFile('parties.xlsx', PARTIES, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  expect(mockToast).toHaveBeenCalledWith('Choose a .csv file. In Excel or Google Sheets, save or download the sheet as CSV.');
  expect(screen.getByText('No customers yet.')).toBeTruthy();
  // the name's .csv in any case is enough, whatever type the phone gives it
  await importFile('PARTIES.CSV', PARTIES, 'application/octet-stream');
  expect(screen.getByText('Customers (21)')).toBeTruthy();
});

test("a CSV picked from Downloads, whose link doesn't carry its name, still imports", async () => {
  await render(<ListsScreen />);
  await importFile('msf:1000000123', PARTIES, 'text/comma-separated-values');
  expect(mockToast).toHaveBeenCalledWith('Imported 21 customers and 2 suppliers. 1 row skipped: no name.');
});

test('no columns', async () => {
  await render(<ListsScreen />);
  await importFile('other.csv', 'Foo,Bar\r\n1,2\r\n');
  expect(mockToast).toHaveBeenLastCalledWith(
    "That file has no Registered name, Last name or First name column. Use the columns of MyBizMate's Parties import.",
  );
  await press(screen.getByText('Items (0)'));
  await importFile('other.csv', 'Foo,Bar\r\n1,2\r\n');
  expect(mockToast).toHaveBeenLastCalledWith('That file has no Name column.');
});

test("a file that can't be read", async () => {
  await render(<ListsScreen />);
  await importFile('parties.csv', new Error('gone'));
  expect(mockToast).toHaveBeenCalledWith("Couldn't read that file.");
});

test('two quick presses open the picker once', async () => {
  await render(<ListsScreen />);
  let finish: (v: unknown) => void = () => {};
  mockPick.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
  await act(async () => {
    fireEvent.press(screen.getByText('Import CSV'));
    fireEvent.press(screen.getByText('Import CSV'));
  });
  expect(mockPick).toHaveBeenCalledTimes(1);
  await act(async () => finish({ canceled: true, result: null }));
});

test('items', async () => {
  await render(<ListsScreen />);
  await press(screen.getByText('Items (0)'));
  await importFile('items.csv', ITEMS);
  expect(mockToast).toHaveBeenCalledWith('Imported 18 items.');
  expect(screen.getByText('Items (18)')).toBeTruthy();
  expect(screen.getByText('Rice 25kg')).toBeTruthy();
  expect(screen.getByText('sack · ₱1,350.00')).toBeTruthy();
  expect(screen.getByText('Customers (0)')).toBeTruthy();
});

test('a party added from a scan', async () => {
  const p = await addParty({
    code: '',
    type: 'customer',
    entity: 'company',
    registeredName: 'Bagong Tindahan',
    lastName: '',
    firstName: '',
    middleName: '',
    tradeName: '',
    tin: '900000003',
    address: '',
    vatStatus: '',
    terms: '',
    fromScan: true,
  });
  await render(<ListsScreen />);
  expect(screen.getByText('Bagong Tindahan')).toBeTruthy();
  expect(screen.getByText('TIN 900-000-003 · added from a scan')).toBeTruthy();
  await act(async () => markPartiesExported([p.id], new Date(2026, 10, 20)));
  expect(screen.getByText('TIN 900-000-003 · sent in a Parties file')).toBeTruthy();
});

test('clear', async () => {
  await render(<ListsScreen />);
  await importFile('parties.csv', PARTIES);
  await press(screen.getByText('Clear customers'));
  expect(alertSpy).toHaveBeenCalledWith('Clear all customers?', "They're removed from this phone only.", [
    expect.objectContaining({ text: 'Cancel' }),
    expect.objectContaining({ text: 'Clear' }),
  ]);
  await answer('Cancel');
  expect(screen.getByText('Customers (21)')).toBeTruthy();
  await press(screen.getByText('Clear customers'));
  await answer('Clear');
  expect(screen.getByText('No customers yet.')).toBeTruthy();
  expect(screen.getByText('Customers (0)')).toBeTruthy();
  expect(screen.getByText('Suppliers (2)')).toBeTruthy();

  await press(screen.getByText('Items (0)'));
  await importFile('items.csv', ITEMS);
  await press(screen.getByText('Clear items'));
  expect(alertSpy).toHaveBeenLastCalledWith('Clear all items?', "They're removed from this phone only.", expect.any(Array));
  await answer('Clear');
  expect(screen.getByText('No items yet.')).toBeTruthy();
});

test('which columns', async () => {
  await render(<ListsScreen />);
  await press(screen.getByText('Which columns?'));
  expect(screen.getByText('Columns for customers and suppliers')).toBeTruthy();
  expect(
    screen.getByText(
      "The first row names the columns, as in MyBizMate's Parties import: Code, Type, Entity type, Registered name, Last name, First name, Middle name, Trade name, TIN, Sub-street, Street, Barangay, City / Municipality, Province, ZIP, VAT status and Payment terms. Other columns are skipped. Contact numbers and emails are never kept.",
    ),
  ).toBeTruthy();
  await press(screen.getByText('Close'));
  expect(screen.queryByText('Columns for customers and suppliers')).toBeNull();

  await press(screen.getByText('Items (0)'));
  await press(screen.getByText('Which columns?'));
  expect(screen.getByText('Columns for items')).toBeTruthy();
  expect(screen.getByText('The first row names the columns: Name, Unit and Price.')).toBeTruthy();
});

test("a CSV saved by Excel's plain CSV keeps its ñ", async () => {
  // Excel's "CSV (Comma delimited)" writes Windows-1252; read as UTF-8 (File.text() on Android), its ñ would be lost
  const bytes = Uint8Array.from(Array.from('Code,Registered name\r\nC1,Parañaque Hardware\r\n', (c) => c.charCodeAt(0)));
  mockPick.mockResolvedValueOnce({
    canceled: false,
    result: { name: 'parties.csv', type: 'text/csv', text: async () => new TextDecoder().decode(bytes), bytes: async () => bytes },
  });
  await render(<ListsScreen />);
  await press(screen.getByText('Import CSV'));
  expect(screen.getByText('Parañaque Hardware')).toBeTruthy();
});
