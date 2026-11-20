import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import Result from '../app/result';
import { peso, qty } from '../lib/format';
import { addScan, setEdit } from '../lib/scans';
import type { ScanSource } from '../lib/scans';
import type { ScanResult } from '../modules/scanner';
import { parseScanResult } from '../modules/scanner/src/parse';
import { coreJson } from '../test-utils/coreJson';
import { memoryFs } from '../test-utils/memoryFs';

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
  useIsFocused: () => true,
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
jest.mock('expo-file-system', () => require('../test-utils/memoryFs').memoryFs.module);

// The Python's own answers for the fixture photos (fixtures/checks/finalize.json).
const FZ = require('../fixtures/checks/finalize.json');
const expectedOf = (stem: string) => FZ.cases.find((c: { name: string }) => c.name === `fixture: ${stem}`).expected;

/** Shows a fixture's result: a sample by default, so its checks are as of the day the samples were made for. */
async function show(
  stem: string,
  opts: { source?: ScanSource; sampleId?: string; from?: string; edit?: (r: ScanResult) => void } = {},
): Promise<string> {
  const result = parseScanResult(coreJson(stem));
  opts.edit?.(result);
  const id = addScan({ label: 'A scan', source: opts.source ?? 'sample', sampleId: opts.sampleId, result });
  mockParams = { id, from: opts.from };
  await render(<Result />);
  return id;
}

const press = (el: Parameters<typeof fireEvent.press>[0]) => act(async () => fireEvent.press(el));

beforeEach(() => {
  jest.clearAllMocks();
  memoryFs.reset();
  mockTeam = false;
});

test('ready to post', async () => {
  await show('inv_0007');
  expect(screen.getByText('Ready to post')).toBeTruthy();
  expect(screen.getByText(/^Every check passed\. Read on this phone in .*, offline\.$/)).toBeTruthy();
});

test('fix a box, and the checks run again', async () => {
  await show('inv_0007');
  await press(screen.getByText('Date'));
  await press(screen.getByTestId('fix-date'));
  await act(async () => fireEvent.changeText(screen.getByLabelText('What the box says'), '13/45/2026'));
  await press(screen.getByTestId('box-save'));
  expect(screen.getByText('1 thing to check')).toBeTruthy();
  // RNTL's default matcher collapses the body's line break into a space
  expect(screen.getByText(/^Check: Date\.\sRead on this phone in /)).toBeTruthy();
  expect(screen.getByText('You changed it to “13/45/2026”.')).toBeTruthy();
  expect(screen.getByText("Couldn't make out a date")).toBeTruthy();
});

test('the box sheet', async () => {
  await show('inv_0007');
  await press(screen.getByText('SI no.'));
  expect(screen.getByText('Read as “0007655” · 100% sure')).toBeTruthy();
  expect(screen.getByText('What the camera saw in each box. If a box was read wrong, type what it says.')).toBeTruthy();
});

test('a backup reading is a quick pick', async () => {
  await show('inv_0007');
  await press(screen.getByText('Total due'));
  await press(screen.getByTestId('fix-total_due'));
  expect(screen.getByText('OTHER READINGS')).toBeTruthy();
  await press(screen.getByText('24.377'));
  expect(screen.getByLabelText('What the box says').props.value).toBe('24.377');
});

test('an empty box can be filled', async () => {
  await show('svc_0000');
  expect(screen.queryByText('Zero-rated sales')).toBeNull();
  await press(screen.getByText('Total due'));
  expect(screen.getByTestId('fix-zero_rated')).toHaveTextContent('Add what it says');
  await press(screen.getByTestId('fix-zero_rated'));
  await act(async () => fireEvent.changeText(screen.getByLabelText('What the box says'), '100.00'));
  await press(screen.getByTestId('box-save'));
  expect(screen.getByText('₱100.00')).toBeTruthy();
});

test('terms', async () => {
  await show('inv_0007', {
    edit: (r) => {
      r.terms = null;
    },
  });
  expect(screen.getByText('Unclear')).toBeTruthy();
  expect(screen.getByText('Tick Cash or On account clearly')).toBeTruthy();
  expect(screen.getByText(/^Check: Terms\./)).toBeTruthy();
  await press(screen.getByText('Terms'));
  expect(screen.getByText('On the paper, neither box is clearly ticked.')).toBeTruthy();
  await press(screen.getByText('Cash'));
  expect(screen.getByText('Cash')).toBeTruthy();
  expect(screen.getByText('Chosen by you')).toBeTruthy();
  expect(screen.getByText('Ready to post')).toBeTruthy();
});

test('a purchase', async () => {
  await show('inv_0007');
  await press(screen.getByText('A purchase'));
  expect(screen.getByText('Supplier')).toBeTruthy();
  expect(screen.getByText('Not chosen yet')).toBeTruthy();
  expect(screen.getByText('Sold to')).toBeTruthy();
  expect(screen.getByText(/Supplier \(choose one\)/)).toBeTruthy();
  expect(
    screen.getByText("Another business issued it to you. It becomes a row in MyBizMate's Purchases import."),
  ).toBeTruthy();
});

test("the Service Invoice's gross", async () => {
  await show('svc_0002');
  expect(screen.getByText('Gross (VAT included)')).toBeTruthy();
  expect(screen.getByText(peso(expectedOf('svc_0002').gross))).toBeTruthy();
});

test('an item row', async () => {
  const id = await show('inv_0007');
  const first = expectedOf('inv_0007').items[0];
  expect(screen.getByText(`${qty(first.qty)} × ${peso(first.unit_price)}`)).toBeTruthy();
  expect(screen.getAllByText(peso(first.amount)).length).toBeGreaterThan(0);
  await act(async () => {
    setEdit(id, 'item1_unit_price', 'xyz'); // with the price unreadable, the row's math can't be repaired
    setEdit(id, 'item1_amount', '1.00');
  });
  expect(screen.getByText(/ · doesn't add up$/)).toBeTruthy();
});

test('a blurry photo', async () => {
  await show('inv_0051_blur');
  expect(screen.getByText(/^Check: Blurry photo \(retake it\)/)).toBeTruthy();
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
  expect(screen.queryByText('INVOICE')).toBeNull();
});

test('a Service Invoice', async () => {
  await show('svc_0000');
  expect(screen.getByText('Service Invoice')).toBeTruthy();
  expect(screen.getByText('Terms')).toBeTruthy();
  expect(screen.getByText('Cash sales')).toBeTruthy();
  expect(screen.getByText('Invoice no.')).toBeTruthy();
});

test('footnote', async () => {
  const timing = (r: ScanResult) => {
    r.timing = { alignMs: 57, cropMs: 10, readMs: 1200, totalMs: 1400 };
  };
  await show('inv_0007', { source: 'gallery', edit: timing });
  expect(screen.getByText('45 boxes read on this phone in 1.4 s. Nothing left the phone.')).toBeTruthy();
  mockTeam = true;
  await show('inv_0007', { source: 'gallery', edit: timing });
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
  await press(screen.getByText('B&W'));
  await waitFor(() => expect(mockEnhance).toHaveBeenCalledWith(r.pageUri, 'bw'));
  await press(screen.getByText('Original'));
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
  await press(screen.getByText('Save'));
  expect(mockToast).toHaveBeenCalledWith('Saving needs Android 10 or newer.');
});

test('full screen', async () => {
  await show('inv_0007');
  await press(screen.getByTestId('scan-image'));
  expect(screen.getByTestId('scan-full')).toBeTruthy();
  await press(screen.getByTestId('scan-full'));
  expect(screen.queryByTestId('scan-full')).toBeNull();
});

test('retake', async () => {
  await show('inv_0007', { source: 'sample', sampleId: 'inv_0007' });
  await press(screen.getByText('Retake'));
  expect(mockRouter.back).toHaveBeenCalled();

  await show('inv_0007', { source: 'gallery' });
  await press(screen.getByText('Retake'));
  expect(mockLibrary).toHaveBeenCalled();

  await show('inv_0007', { source: 'camera' });
  await press(screen.getByText('Retake'));
  expect(mockRouter.replace).toHaveBeenCalledWith('/camera');
});
