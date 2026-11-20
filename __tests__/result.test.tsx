import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import Result from '../app/result';
import { addScan } from '../lib/scans';
import type { ScanSource } from '../lib/scans';
import type { ScanResult } from '../modules/scanner';
import { parseScanResult } from '../modules/scanner/src/parse';
import { coreJson } from '../test-utils/coreJson';

let mockParams: { id?: string; from?: string } = {};
let mockTeam = false;
const mockRouter = { back: jest.fn(), replace: jest.fn(), push: jest.fn() };
const mockEnhance = jest.fn(async (_uri: string, mode: string) => `file:///x/${mode}.img`);
const mockSave = jest.fn();
const mockToast = jest.fn();
const mockLibrary = jest.fn(async () => ({ canceled: true }));

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => mockRouter,
  Stack: {
    Screen: ({ options }: { options?: { headerTitle?: (p: object) => ReactElement } }) =>
      options?.headerTitle ? options.headerTitle({}) : null,
  },
}));
jest.mock('../modules/scanner', () => ({
  enhance: (uri: string, mode: string) => mockEnhance(uri, mode),
  saveToPictures: (uri: string) => mockSave(uri),
  scanPhoto: jest.fn(),
}));
jest.mock('../lib/toast', () => ({ toast: (m: string) => mockToast(m) }));
jest.mock('../lib/build', () => ({
  get TEAM_BUILD() {
    return mockTeam;
  },
}));
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: () => mockLibrary(),
  requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
}));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: async () => ({ localUri: 'file:///s' }) }) } }));
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

function show(
  stem: string,
  opts: { source?: ScanSource; sampleId?: string; from?: string; edit?: (r: ScanResult) => void } = {},
) {
  const result = parseScanResult(coreJson(stem));
  opts.edit?.(result);
  const id = addScan({ label: 'A scan', source: opts.source ?? 'gallery', sampleId: opts.sampleId, result });
  mockParams = { id, from: opts.from };
  return render(<Result />);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockTeam = false;
});

test('no form', async () => {
  await show('blank_page');
  expect(screen.getByText("Couldn't find the form")).toBeTruthy();
  expect(
    screen.getByText(
      'Get the whole form in the photo: all 4 black corner squares of a MyBizMate Sales Invoice, or the whole table of a Service Invoice. Then retake it.',
    ),
  ).toBeTruthy();
  expect(screen.getByText('Retake')).toBeTruthy();
  expect(screen.queryByText('Enhanced')).toBeNull();
  expect(screen.queryByText('Save')).toBeNull();
});

test('a blurry photo', async () => {
  await show('inv_0051_blur');
  expect(screen.getByText('1 thing to check')).toBeTruthy();
  // RNTL's default matcher collapses the body's line break into a space
  expect(screen.getByText(/^Check: Blurry photo \(retake it\)\.\sRead on this phone in /)).toBeTruthy();
});

test('a good photo', async () => {
  await show('inv_0007');
  expect(screen.getByText('Photo looks good')).toBeTruthy();
  expect(screen.getByText(/^Read on this phone in .*, offline\.$/)).toBeTruthy();
});

test('a Service Invoice', async () => {
  await show('svc_0000');
  expect(screen.getByText('Service Invoice')).toBeTruthy();
  expect(screen.getByText('Terms')).toBeTruthy();
  expect(screen.getByText('Cash sales')).toBeTruthy();
  expect(screen.getByText('Invoice no.')).toBeTruthy();
});

test('rows', async () => {
  await show('inv_0007', {
    edit: (r) => {
      r.reads[1].conf = 0.85;
    },
  });
  const first = parseScanResult(coreJson('inv_0007')).reads[0];
  expect(screen.getByText(`Read as “0007655” · ${Math.round(first.conf * 100)}% sure`)).toBeTruthy();
  expect(screen.getByText(/^Read as “.*” · 85% sure$/)).toHaveStyle({ color: '#E26331' });
  expect(screen.getByText('SI no.')).toBeTruthy();
});

test('footnote', async () => {
  const timing = (r: ScanResult) => {
    r.timing = { alignMs: 57, cropMs: 10, readMs: 1200, totalMs: 1400 };
  };
  await show('inv_0007', { edit: timing });
  expect(screen.getByText('45 boxes read on this phone in 1.4 s. Nothing left the phone.')).toBeTruthy();
  mockTeam = true;
  await show('inv_0007', { edit: timing });
  expect(
    screen.getByText('45 boxes read on this phone in 1.4 s (straighten 57 ms, read 1.2 s). Nothing left the phone.'),
  ).toBeTruthy();
});

test('sample footnote', async () => {
  await show('inv_0007', { source: 'sample', sampleId: 'inv_0007' });
  const truth: Record<string, string> = require('../assets/samples/inv_0007.json').truth;
  const reads = parseScanResult(coreJson('inv_0007')).reads;
  const written = Object.values(truth).filter((t) => t !== '').length;
  const exact = reads.filter((r) => truth[r.name] !== undefined && truth[r.name] !== '' && truth[r.name] === r.text).length;
  expect(screen.getByText(`Sample invoice: ${exact} of ${written} boxes read exactly as written.`)).toBeTruthy();
});

test('views', async () => {
  const r = parseScanResult(coreJson('inv_0007'));
  await show('inv_0007');
  await waitFor(() => expect(mockEnhance).toHaveBeenCalledWith(r.pageUri, 'enhanced'));
  await waitFor(() => expect(screen.getByTestId('scan-image').props.source).toEqual({ uri: 'file:///x/enhanced.img' }));
  await act(async () => fireEvent.press(screen.getByText('B&W')));
  await waitFor(() => expect(mockEnhance).toHaveBeenCalledWith(r.pageUri, 'bw'));
  await act(async () => fireEvent.press(screen.getByText('Original')));
  expect(screen.getByTestId('scan-image').props.source).toEqual({ uri: r.originalUri });
  expect(screen.queryByText('Save')).toBeNull();
});

test('save once', async () => {
  let finish: (name: string) => void = () => {};
  mockSave.mockImplementation(() => new Promise((resolve) => (finish = resolve)));
  await show('inv_0007');
  await waitFor(() => expect(screen.getByTestId('scan-image').props.source).toEqual({ uri: 'file:///x/enhanced.img' }));
  await act(async () => {
    fireEvent.press(screen.getByText('Save'));
    fireEvent.press(screen.getByText('Save'));
  });
  expect(mockSave).toHaveBeenCalledTimes(1);
  await act(async () => finish('scan_1.jpg'));
  expect(mockToast).toHaveBeenCalledWith('Saved to Pictures/MyBizMate Scan');
});

test('save on Android 9', async () => {
  mockSave.mockRejectedValue(Object.assign(new Error('old'), { code: 'ERR_SAVE_NEEDS_ANDROID_10' }));
  await show('inv_0007');
  await waitFor(() => expect(screen.getByTestId('scan-image').props.source).toEqual({ uri: 'file:///x/enhanced.img' }));
  await act(async () => fireEvent.press(screen.getByText('Save')));
  expect(mockToast).toHaveBeenCalledWith('Saving needs Android 10 or newer.');
});

test('full screen', async () => {
  await show('inv_0007');
  await act(async () => fireEvent.press(screen.getByTestId('scan-image')));
  expect(screen.getByTestId('scan-full')).toBeTruthy();
  await act(async () => fireEvent.press(screen.getByTestId('scan-full')));
  expect(screen.queryByTestId('scan-full')).toBeNull();
});

test('retake', async () => {
  await show('inv_0007', { source: 'sample', sampleId: 'inv_0007' });
  await act(async () => fireEvent.press(screen.getByText('Retake')));
  expect(mockRouter.back).toHaveBeenCalled();

  await show('inv_0007', { source: 'gallery' });
  await act(async () => fireEvent.press(screen.getByText('Retake')));
  expect(mockLibrary).toHaveBeenCalled();

  await show('inv_0007', { source: 'camera' });
  await act(async () => fireEvent.press(screen.getByText('Retake')));
  expect(mockRouter.replace).toHaveBeenCalledWith('/camera');
});
