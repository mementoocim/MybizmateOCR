import { act, fireEvent, render, screen } from '@testing-library/react-native';

import Home from '../app/index';
import { addScan } from '../lib/scans';
import { parseScanResult } from '../modules/scanner/src/parse';
import { coreJson } from '../test-utils/coreJson';

let mockTeam = false;
const mockPush = jest.fn();
const mockScanPhoto = jest.fn();
const mockLibrary = jest.fn();

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
jest.mock('expo-file-system', () => ({
  File: class {
    get exists() {
      return false;
    }
    async write() {}
    async text() {
      return '';
    }
  },
  Directory: class {
    get exists() {
      return true;
    }
  },
  Paths: { document: {} },
}));

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
  expect(mockScanPhoto).toHaveBeenCalledWith('content://media/1', { deletePhoto: false });
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/result', params: { id: expect.any(String) } });
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
  expect(screen.getAllByText(/^Read · 0 ms · \d{1,2}:\d{2} (AM|PM)$/).length).toBeGreaterThan(0);
});

test('a scan read on another screen shows in Recent scans at once', async () => {
  await render(<Home />);
  await act(async () => {
    addScan({ label: 'Camera photo', source: 'camera', result: parseScanResult(coreJson('inv_0007')) });
  });
  expect(screen.getAllByText('Camera photo').length).toBeGreaterThan(0);
});

test('the team menu', async () => {
  await render(<Home />);
  expect(screen.queryByTestId('menu')).toBeNull();
  mockTeam = true;
  await render(<Home />);
  await act(async () => fireEvent.press(screen.getByTestId('menu')));
  await act(async () => fireEvent.press(screen.getByText('Speed test')));
  expect(mockPush).toHaveBeenCalledWith('/speed');
});
