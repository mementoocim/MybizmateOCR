import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert, type AlertButton } from 'react-native';

import SavedScreen from '../app/saved';
import { addParty, clearParties, markPartiesExported, type Party } from '../lib/lists';
import { loadSaved, type SavedSummary } from '../lib/saved';
import { parseScanResult } from '../modules/scanner/src/parse';
import { coreJson } from '../test-utils/coreJson';
import { memoryFs } from '../test-utils/memoryFs';

const mockPush = jest.fn();
const mockToast = jest.fn();
const mockShare = jest.fn(async (_uri: string, _options: object) => {});
const mockAvailable = jest.fn(async () => true);

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }) }));
jest.mock('../lib/toast', () => ({ toast: (m: string) => mockToast(m) }));
jest.mock('expo-sharing', () => ({
  shareAsync: (uri: string, options: object) => mockShare(uri, options),
  isAvailableAsync: () => mockAvailable(),
}));
jest.mock('expo-file-system', () => require('../test-utils/memoryFs').memoryFs.module);

function summary(id: string, date: string, extra: Partial<SavedSummary> = {}): SavedSummary {
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

async function showSaved(list: SavedSummary[]) {
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

test('export new customers and suppliers', async () => {
  await addFromScan('Bagong Tindahan');
  await showSaved([]);
  await press(screen.getByText('Export new customers and suppliers'));
  expect(screen.getByText("A file in MyBizMate's Parties import format, with the customers and suppliers you added from scans.")).toBeTruthy();
  expect(screen.getByText('1 party')).toBeTruthy();
  expect(
    screen.getByText(
      "Before you import, fill in each one's City / Municipality, Province and ZIP, and its TIN where it's blank: MyBizMate needs them. Import this file before the sales and purchases that name them.",
    ),
  ).toBeTruthy();
  await press(screen.getByText('Share the file'));
  expect(mockShare).toHaveBeenCalledWith(expect.stringMatching(/Parties import .*\.xlsx$/), {
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    dialogTitle: 'Send the file',
  });
  expect(alertSpy).toHaveBeenCalledWith(
    'Did the file go where you wanted?',
    'Mark this party as exported, so the next file leaves it out.',
    expect.anything(),
  );
  await answer('Mark as exported');
  expect(mockToast).toHaveBeenCalledWith('Marked 1 party as exported.');
});

test('marked parties leave the next Parties file', async () => {
  await addFromScan('Bagong Tindahan');
  await showSaved([]);
  await press(screen.getByText('Export new customers and suppliers'));
  await press(screen.getByText('Share the file'));
  await answer('Mark as exported');
  expect(screen.getByText('Nothing to export for this choice.')).toBeTruthy();
  await press(screen.getByText('All added from scans'));
  expect(screen.getByText('1 party')).toBeTruthy();
  expect(screen.getByText('1 of them was exported before. Importing it again adds it to MyBizMate twice.')).toBeTruthy();
});

test('the sales sheet says to send new parties first', async () => {
  const p = await addFromScan('Bagong Tindahan');
  await showSaved([summary('a', '2026-10-05', { listed: false, partyName: 'Bagong Tindahan', partyId: p.id })]);
  await press(screen.getByText('Export sales'));
  expect(
    screen.getByText(
      'Check that these are in MyBizMate before you import: Bagong Tindahan. Export new customers and suppliers first: they go in before this file.',
    ),
  ).toBeTruthy();
});

test('a party that went out is no longer a name to check', async () => {
  const p = await addFromScan('Bagong Tindahan');
  await markPartiesExported([p.id], new Date(2026, 10, 19));
  await showSaved([summary('a', '2026-10-05', { listed: false, partyName: 'Bagong Tindahan', partyId: p.id })]);
  await press(screen.getByText('Export sales'));
  expect(screen.queryByText(/Check that these are in MyBizMate/)).toBeNull();
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

test('export sales: share, then mark', async () => {
  await showSaved([summary('a', '2026-10-05'), summary('b', '2026-10-06')]);
  await press(screen.getByText('Export sales'));
  expect(screen.getByText("A file in MyBizMate's Sales import format, to import at mybizmate.io.")).toBeTruthy();
  expect(screen.getByText('2 sales · ₱200.00')).toBeTruthy();
  await press(screen.getByText('Share the file'));
  expect(mockShare).toHaveBeenCalledWith(expect.stringMatching(/\.xlsx$/), {
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    dialogTitle: 'Send the file',
  });
  expect(alertSpy).toHaveBeenCalledWith(
    'Did the file go where you wanted?',
    'Mark these 2 sales as exported, so the next export leaves them out.',
    expect.anything(),
  );
  await answer('Mark as exported');
  expect(mockToast).toHaveBeenCalledWith('Marked 2 sales as exported.');
  expect(screen.getAllByText('Exported')).toHaveLength(2);
});

test('"Not yet" keeps them for the next export', async () => {
  await showSaved([summary('a', '2026-10-05')]);
  await press(screen.getByText('Export sales'));
  await press(screen.getByText('Share the file'));
  expect(alertSpy).toHaveBeenCalledWith(
    'Did the file go where you wanted?',
    'Mark this sale as exported, so the next export leaves it out.',
    expect.anything(),
  );
  await answer('Not yet');
  expect(screen.getByText('To export')).toBeTruthy();
  expect(screen.getByText('1 sale · ₱100.00')).toBeTruthy();
});

test('marked invoices leave the default export', async () => {
  await showSaved([summary('a', '2026-10-05')]);
  await press(screen.getByText('Export sales'));
  await press(screen.getByText('Share the file'));
  await answer('Mark as exported');
  expect(screen.getByText('Nothing to export for this choice.')).toBeTruthy();
});

test('a choice with exported invoices warns', async () => {
  await showSaved([summary('a', '2026-10-05'), summary('b', '2026-10-06', { exportedAt: '2026-10-07T00:00:00.000Z' })]);
  await press(screen.getByText('Export sales'));
  expect(screen.queryByText(/exported before/)).toBeNull();
  await press(screen.getByText('All'));
  expect(
    screen.getByText('1 of them was exported before. Importing it again adds it to MyBizMate twice.'),
  ).toBeTruthy();
});

test('names to check', async () => {
  await showSaved([summary('a', '2026-10-05', { listed: false, partyName: 'Bagong Tindahan' })]);
  await press(screen.getByText('Export sales'));
  expect(screen.getByText('Check that these are in MyBizMate before you import: Bagong Tindahan.')).toBeTruthy();
});

test('a phone that cannot share', async () => {
  mockAvailable.mockResolvedValueOnce(false);
  await showSaved([summary('a', '2026-10-05')]);
  await press(screen.getByText('Export sales'));
  await press(screen.getByText('Share the file'));
  expect(mockToast).toHaveBeenCalledWith("This phone can't share files.");
  expect(mockShare).not.toHaveBeenCalled();
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
