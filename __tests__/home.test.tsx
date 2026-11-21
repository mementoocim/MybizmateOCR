import { act, fireEvent, render, screen, within } from '@testing-library/react-native';

import Home from '../app/index';
import { loadSaved } from '../lib/saved';
import { addScan } from '../lib/scans';
import { parseScanResult } from '../modules/scanner/src/parse';
import { coreJson } from '../test-utils/coreJson';
import { memoryFs } from '../test-utils/memoryFs';
import { pinToday } from '../test-utils/today';

let mockTeam = false;
const mockPush = jest.fn();
const mockScanPhoto = jest.fn();
const mockLibrary = jest.fn();
const mockPick = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useFocusEffect: (effect: () => void) => require('react').useEffect(effect, []),
  useIsFocused: () => true,
}));
jest.mock('../modules/scanner', () => ({
  scanPhoto: (uri: string, options: object) => mockScanPhoto(uri, options),
}));
jest.mock('../lib/build', () => ({
  get TEAM_BUILD() {
    return mockTeam;
  },
}));
jest.mock('../lib/toast', () => ({ toast: jest.fn() }));
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: () => mockLibrary(),
  requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
}));
jest.mock('expo-asset', () => ({
  Asset: { fromModule: () => ({ downloadAsync: async () => ({ localUri: 'file:///bundle/sample.jpg' }) }) },
}));
jest.mock('expo-file-system', () => {
  const memory = require('../test-utils/memoryFs').memoryFs.module;
  return { ...memory, File: Object.assign(memory.File, { pickFileAsync: (options: object) => mockPick(options) }) };
});

beforeAll(() => {
  pinToday(new Date(2026, 10, 20, 9, 0)); // a gallery scan is checked as of the day it's read
});

afterAll(() => {
  jest.useRealTimers();
});

beforeEach(() => {
  jest.clearAllMocks();
  mockTeam = false;
  mockLibrary.mockResolvedValue({ canceled: false, assets: [{ uri: 'content://media/1' }] });
  mockScanPhoto.mockResolvedValue(parseScanResult(coreJson('inv_0007')));
});

test('the title, the description and the 3 tips', async () => {
  await render(<Home />);
  expect(screen.getByText('Scan an invoice')).toBeTruthy();
  expect(
    screen.getByText(
      "Take a photo of a filled-in MyBizMate Sales Invoice or Service Invoice. It's read right here on your phone, in a second or two, even without internet.",
    ),
  ).toBeTruthy();
  expect(screen.getByText('The whole form in the photo: every corner square, or the whole table')).toBeTruthy();
  expect(screen.getByText('Flat on a table, in good light')).toBeTruthy();
  expect(screen.getByText('Phone held straight above it, no strong shadows')).toBeTruthy();
  expect(screen.getByText('Read on this phone · no internet access')).toBeTruthy();
  expect(screen.queryByText('SALES')).toBeNull();
});

test('Take photo opens the camera', async () => {
  await render(<Home />);
  await act(async () => fireEvent.press(screen.getByText('Take photo')));
  expect(mockPush).toHaveBeenCalledWith('/camera');
});

test('Choose from gallery reads the photo and opens its result', async () => {
  await render(<Home />);
  await act(async () => fireEvent.press(screen.getByText('Choose from gallery')));
  // The picker hands over its own copy in the app's cache; the scanner deletes only files inside the cache, never the
  // person's photo.
  expect(mockScanPhoto).toHaveBeenCalledWith('content://media/1', { deletePhoto: true });
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/result', params: { id: expect.any(String) } });
});

test('the Import PDF button', async () => {
  mockPick.mockResolvedValue({ canceled: true, result: null });
  await render(<Home />);
  await act(async () => fireEvent.press(screen.getByText('Import PDF')));
  expect(mockPick).toHaveBeenCalledWith({ mimeTypes: ['application/pdf'] });
});

test('two quick presses scan once', async () => {
  let finish: (v: unknown) => void = () => {};
  mockScanPhoto.mockImplementation(() => new Promise((resolve) => (finish = resolve)));
  await render(<Home />);
  await act(async () => {
    fireEvent.press(screen.getByText('Choose from gallery'));
    fireEvent.press(screen.getByText('Choose from gallery'));
  });
  expect(mockScanPhoto).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Reading the invoice…')).toBeTruthy();
  await act(async () => finish(parseScanResult(coreJson('inv_0007'))));
});

test('the samples sheet', async () => {
  await render(<Home />);
  await act(async () => fireEvent.press(screen.getByText('No form handy? Try a sample invoice')));
  expect(screen.getByText('Sample invoices')).toBeTruthy();
  expect(
    screen.getByText('Filled in with 2 handwriting styles the model never trained on, photographed like a phone would.'),
  ).toBeTruthy();
  for (const n of ['0001', '0007', '0011', '0017', '0027', '0041', '0051', '0091']) {
    expect(screen.getByText(`Sample ${n}`)).toBeTruthy();
  }
  expect(screen.getAllByText('Caveat handwriting')).toHaveLength(5);
  expect(screen.getAllByText('Patrick Hand handwriting')).toHaveLength(3);
});

test('recent scans', async () => {
  await render(<Home />);
  await act(async () => fireEvent.press(screen.getByText('Choose from gallery')));
  expect(screen.getByText('RECENT SCANS')).toBeTruthy();
  expect(screen.getAllByText('Photo from gallery').length).toBeGreaterThan(0);
  // earlier tests' scans are in the list too (the store lives for the whole file)
  expect(screen.getAllByText(/^Ready to post · 0 ms · \d{1,2}:\d{2} (AM|PM)$/).length).toBeGreaterThan(0);
});

test('a scan read on another screen shows in Recent scans at once', async () => {
  await render(<Home />);
  await act(async () => {
    addScan({ label: 'Camera photo', source: 'camera', result: parseScanResult(coreJson('inv_0007')) });
  });
  expect(screen.getAllByText('Camera photo').length).toBeGreaterThan(0);
});

const press = (el: Parameters<typeof fireEvent.press>[0]) => act(async () => fireEvent.press(el));

/** Opens the ⋮ menu and presses one of its items. */
async function fromMenu(label: string) {
  await press(screen.getByTestId('menu'));
  await press(within(screen.getByTestId('menu-items')).getByText(label));
}

test('the menu in a client build', async () => {
  await render(<Home />);
  await press(screen.getByTestId('menu'));
  const items = within(screen.getByTestId('menu-items'));
  expect(items.getByText('Saved invoices')).toBeTruthy();
  expect(items.getByText('Your lists')).toBeTruthy();
  expect(items.getByText('Settings')).toBeTruthy();
  expect(items.queryByText('Speed test')).toBeNull();
  await press(items.getByText('Saved invoices'));
  expect(mockPush).toHaveBeenLastCalledWith('/saved');
  await fromMenu('Your lists');
  expect(mockPush).toHaveBeenLastCalledWith('/lists');
  await fromMenu('Settings');
  expect(mockPush).toHaveBeenLastCalledWith('/settings');
});

test('the menu in a team build', async () => {
  mockTeam = true;
  await render(<Home />);
  await fromMenu('Speed test');
  expect(mockPush).toHaveBeenLastCalledWith('/speed');
});

test('the saved invoices row', async () => {
  await render(<Home />);
  expect(screen.queryByText('1 to export')).toBeNull(); // nothing saved yet: no row
  const saved = (id: string, exportedAt: string | null) => ({
    id,
    kind: 'sale',
    label: 'Camera photo',
    partyName: 'Store',
    partyId: null,
    date: '2026-11-18',
    gross: 100,
    row: {},
    listed: true,
    savedAt: '2026-11-19T01:00:00.000Z',
    exportedAt,
  });
  memoryFs.files.set('file:///docs/saved.json', JSON.stringify([saved('a', null), saved('b', '2026-11-19T02:00:00.000Z')]));
  await act(async () => loadSaved());
  expect(screen.getByText('Saved invoices')).toBeTruthy();
  await press(screen.getByText('1 to export'));
  expect(mockPush).toHaveBeenLastCalledWith('/saved');

  memoryFs.files.set('file:///docs/saved.json', JSON.stringify([saved('b', '2026-11-19T02:00:00.000Z')]));
  await act(async () => loadSaved());
  expect(screen.getByText('All exported')).toBeTruthy();
});
