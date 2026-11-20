import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';

import Home from '../app/index';
import { parseScanResult } from '../modules/scanner/src/parse';
import { coreJson } from '../test-utils/coreJson';

const mockPush = jest.fn();
const mockScanPhoto = jest.fn();

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('../modules/scanner', () => ({
  coreInfo: () => ({ opencv: '5.1.0', onnxruntime: '1.32.0' }),
  scanPhoto: (uri: string) => mockScanPhoto(uri),
}));
jest.mock('expo-asset', () => ({
  Asset: {
    fromModule: (m: { testUri?: string } | number) => ({
      downloadAsync: async () => ({ localUri: `file:///bundle/${typeof m === 'object' ? m.testUri : m}` }),
    }),
  },
}));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn(async () => ({ canceled: true })) }));

beforeEach(() => {
  mockPush.mockReset();
  mockScanPhoto.mockReset();
});

test('home offers the gallery', async () => {
  await render(<Home />);
  expect(screen.getByText('Choose from gallery')).toBeTruthy();
});

test("home shows the core's libraries", async () => {
  await render(<Home />);
  expect(screen.getByText('OpenCV 5.1.0 · ONNX Runtime 1.32.0')).toBeTruthy();
});

test('home lists the 8 samples', async () => {
  await render(<Home />);
  for (const n of ['0001', '0007', '0011', '0017', '0027', '0041', '0051', '0091']) {
    expect(screen.getByText(`Sample ${n}`)).toBeTruthy();
  }
});

test('a sample is read and shown', async () => {
  mockScanPhoto.mockResolvedValue(parseScanResult(coreJson('inv_0007')));
  await render(<Home />);
  await act(async () => {
    fireEvent.press(screen.getByText('Sample 0007'));
  });
  expect(mockScanPhoto).toHaveBeenCalledWith(expect.stringContaining('inv_0007.jpg'));
  expect(mockPush).toHaveBeenCalledWith(expect.stringMatching(/^\/result\?id=.+/));
});

test('buttons wait while reading', async () => {
  mockScanPhoto.mockReturnValue(new Promise(() => {}));  // never finishes
  await render(<Home />);
  await act(async () => {
    fireEvent.press(screen.getByText('Sample 0007'));
  });
  expect(screen.getByText('Reading…')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Choose from gallery' })).toBeDisabled();
});

test('an unreadable photo says so', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockScanPhoto.mockRejectedValue(Object.assign(new Error('unreadable'), { code: 'ERR_UNREADABLE_IMAGE' }));
  await render(<Home />);
  await act(async () => {
    fireEvent.press(screen.getByText('Sample 0007'));
  });
  expect(alert).toHaveBeenCalledWith("Can't open this photo", "This file isn't a photo the scanner can open.");
  expect(mockPush).not.toHaveBeenCalled();
  alert.mockRestore();
});
