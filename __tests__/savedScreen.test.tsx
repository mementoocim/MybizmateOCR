import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { Alert, type AlertButton } from 'react-native';

import SavedScreen from '../app/saved';
import { addParty, clearParties, type Party } from '../lib/lists';
import { type InvoiceSummary, loadSaved, saveScan } from '../lib/saved';
import { addScan } from '../lib/scans';
import { parseScanResult } from '../modules/scanner/src/parse';
import { coreJson } from '../test-utils/coreJson';
import { memoryFs } from '../test-utils/memoryFs';

// Saved invoices' list, and its buttons, which open the export at their own file. The export itself, its question
// included, is __tests__/exportSheet.test.tsx's.

const mockPush = jest.fn();
const mockToast = jest.fn();

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }) }));
jest.mock('../lib/toast', () => ({ toast: (m: string) => mockToast(m) }));
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn(), isAvailableAsync: async () => true }));
jest.mock('expo-file-system', () => require('../test-utils/memoryFs').memoryFs.module);

function summary(id: string, date: string, extra: Partial<InvoiceSummary> = {}): InvoiceSummary {
  return {
    id,
    kind: 'sale',
    label: 'Camera photo',
    partyName: `Store ${id.toUpperCase()}`,
    partyId: null,
    date,
    gross: 100,
    row: { 'Date *': date, 'Gross *': 100 },
    listed: true,
    savedAt: `${date}T01:00:00.000Z`,
    exportedAt: null,
    ...extra,
  };
}

async function showSaved(list: InvoiceSummary[]) {
  memoryFs.files.set('file:///docs/saved.json', JSON.stringify(list));
  await loadSaved();
  await render(<SavedScreen />);
}

const press = (el: Parameters<typeof fireEvent.press>[0]) => act(async () => fireEvent.press(el));
let alertSpy: jest.SpyInstance;
/** Presses a button of the last Alert. */
const answer = (text: string) =>
  act(async () => {
    const buttons = alertSpy.mock.calls.at(-1)![2] as AlertButton[];
    buttons.find((b) => b.text === text)?.onPress?.();
  });

beforeEach(async () => {
  jest.clearAllMocks();
  memoryFs.reset();
  await clearParties('customer');
  await clearParties('supplier');
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

/** A customer added from a scan: not in MyBizMate yet. */
const addFromScan = (name: string): Promise<Party> =>
  addParty({
    code: '',
    type: 'customer',
    entity: 'company',
    registeredName: name,
    lastName: '',
    firstName: '',
    middleName: '',
    tradeName: '',
    tin: '900-000-003',
    address: '',
    vatStatus: '',
    terms: '',
    fromScan: true,
  });

test('no saved invoices', async () => {
  await showSaved([]);
  expect(
    screen.getByText(
      'No saved invoices yet. Save a scan as a sale or a purchase, and it shows here, ready to export to MyBizMate.',
    ),
  ).toBeTruthy();
});

test('rows and their tags', async () => {
  await showSaved([summary('a', '2026-10-05'), summary('b', '2026-11-02', { exportedAt: '2026-11-03T00:00:00.000Z' })]);
  expect(screen.getByText('Store A')).toBeTruthy();
  expect(screen.getByText('Sale · Oct 5, 2026 · ₱100.00')).toBeTruthy();
  expect(screen.getByText('To export')).toBeTruthy();
  expect(screen.getByText('Exported')).toBeTruthy();
});

test('each export button opens the export at its own file', async () => {
  await addFromScan('Bagong Tindahan'); // so the parties' button shows
  await showSaved([summary('a', '2026-10-05')]);
  for (const name of ['Export sales', 'Export purchases', 'Export 2307s', 'Export new customers and suppliers']) {
    await press(screen.getByRole('button', { name }));
    // the sheet's own title, at that file, with Back to the list of files
    expect(screen.getByRole('header', { name })).toBeOnTheScreen();
    expect(within(screen.getByTestId('sheet-panel')).getByRole('button', { name: 'Back' })).toBeOnTheScreen();
    await press(within(screen.getByTestId('sheet-actions')).getByRole('button', { name: 'Close' }));
    expect(screen.queryByTestId('sheet-panel')).toBeNull();
  }
});

test('open a saved invoice', async () => {
  const scan = { id: 'a', label: 'Camera photo', source: 'camera', at: '2026-10-05T01:00:00.000Z',
    result: parseScanResult(coreJson('inv_0007')), edits: {}, terms: null, kind: 'sale', party: null,
    saved: { savedAt: '2026-10-05T01:00:00.000Z', details: { taxType: 'VAT', account: '4010', terms: 'cash', atc: '' } } };
  memoryFs.files.set('file:///docs/saved/a/scan.json', JSON.stringify(scan));
  await showSaved([summary('a', '2026-10-05'), summary('b', '2026-10-06')]);
  await press(screen.getByText('Store A'));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/result', params: { id: 'a', from: 'saved' } });
  await press(screen.getByText('Store B'));
  expect(mockToast).toHaveBeenCalledWith("Couldn't open that invoice.");
});

/**
 * A 2307 saved as the app saves it, then Saved invoices: bir2307_text_1 as a text PDF (Q4 2026, tax withheld
 * ₱47,937.78 on its income payments and ₱9,462.76 on its business-tax row), its payor not in the customers (there are
 * none).
 */
async function show2307() {
  await loadSaved(); // nothing saved yet
  const id = addScan({ label: 'PDF: bir2307_text_1.pdf', source: 'pdf', result: parseScanResult(coreJson('bir2307_text_1')) });
  await saveScan(id, { account: '1205' });
  await render(<SavedScreen />);
}

test('a 2307 in Saved invoices', async () => {
  await show2307();
  expect(screen.getByText('Castillo Eatery')).toBeTruthy();
  expect(screen.getByText('2307 · Q4 2026 · Tax ₱57,400.54')).toBeTruthy();
  expect(screen.getByText('To export')).toBeTruthy();
  // beside the sales' and the purchases' exports
  for (const label of ['Export sales', 'Export purchases', 'Export 2307s']) {
    expect(screen.getByRole('button', { name: label })).toBeTruthy();
  }
});

test('delete', async () => {
  await showSaved([summary('a', '2026-10-05'), summary('b', '2026-10-06')]);
  await act(async () => fireEvent(screen.getByText('Store A'), 'longPress'));
  expect(alertSpy).toHaveBeenCalledWith(
    'Delete this saved invoice?',
    "It's removed from this phone. Files you already exported don't change.",
    expect.anything(),
  );
  await answer('Delete');
  expect(screen.queryByText('Store A')).toBeNull();
  expect(screen.getByText('Store B')).toBeTruthy();
});
