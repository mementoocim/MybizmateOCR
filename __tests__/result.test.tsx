import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import Result from '../app/result';
import { peso, qty } from '../lib/format';
import { addScan, getScan, loadRecent, setEdit } from '../lib/scans';
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
const mockPick = jest.fn();
const mockReadPdf = jest.fn();
const mockDisplayName = jest.fn();

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
  readPdf: (uri: string) => mockReadPdf(uri),
  displayName: (uri: string) => mockDisplayName(uri),
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
jest.mock('expo-file-system', () => {
  const memory = require('../test-utils/memoryFs').memoryFs.module;
  return { ...memory, File: Object.assign(memory.File, { pickFileAsync: (options: object) => mockPick(options) }) };
});

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
      'Get the whole form in the photo: all 4 black corner squares of a MyBizMate Sales Invoice, the whole table of a Service Invoice, or the whole page of a BIR Form 2307. Then retake it.',
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

test("a PDF's footnote and its page count", async () => {
  // a text PDF: every box from its own text
  await show('sales_text_0', { source: 'pdf' });
  expect(screen.getByText('8 boxes read on this phone in 0 ms. Nothing left the phone.')).toBeTruthy();
  expect(screen.getByText('Read from the PDF: 8 boxes from its text, 0 read from the page.')).toBeTruthy();

  // a box with no text in it is read from the rendered page; a PDF with more pages
  await show('sales_text_0', {
    source: 'pdf',
    edit: (r) => {
      r.reads[0].fromText = false;
      r.pageCount = 3;
    },
  });
  expect(
    screen.getByText('Read from the PDF: 7 boxes from its text, 1 read from the page. Only page 1 of 3 was read.'),
  ).toBeTruthy();
  await show('sales_text_0', {
    source: 'pdf',
    edit: (r) => {
      r.reads.forEach((b, i) => (b.fromText = i === 0));
    },
  });
  expect(screen.getByText('Read from the PDF: 1 box from its text, 7 read from the page.')).toBeTruthy();

  // the form not found on page 1: only the pages are told
  await show('blank_page', {
    source: 'pdf',
    edit: (r) => {
      Object.assign(r, { source: 'pdf', pageCount: 2, picture: false });
    },
  });
  expect(screen.getByText('Only page 1 of 2 was read.')).toBeTruthy();
  expect(screen.queryByText(/^Read from the PDF/)).toBeNull();
});

test("a picture PDF's footnote", async () => {
  await show('sales_picture_0', { source: 'pdf' });
  expect(screen.getByText('The PDF is a picture: read like a photo.')).toBeTruthy();
  expect(screen.queryByText(/^Read from the PDF/)).toBeNull();
  await show('sales_picture_0', {
    source: 'pdf',
    edit: (r) => {
      r.pageCount = 2;
    },
  });
  expect(screen.getByText('The PDF is a picture: read like a photo. Only page 1 of 2 was read.')).toBeTruthy();
});

test('a text box says where it came from', async () => {
  await show('sales_text_0', {
    source: 'pdf',
    edit: (r) => {
      r.reads.find((b) => b.name === 'date')!.fromText = false; // read from the rendered page
    },
  });
  await press(screen.getByText('SI no.'));
  expect(screen.getByText("From the PDF's text")).toBeTruthy();
  expect(screen.queryByText(/^Read as /)).toBeNull();
  await press(screen.getByTestId('fix-invoice_no'));
  expect(screen.getByText("From the PDF's text")).toBeTruthy();
  expect(screen.getByLabelText('What the box says').props.value).toBe('0000888');
  await press(screen.getByText('Cancel'));
  await press(screen.getByLabelText('Close'));

  await press(screen.getByText('Date'));
  expect(screen.getByText('Read as “27 Sep 2026” · 100% sure')).toBeTruthy();
  expect(screen.queryByText("From the PDF's text")).toBeNull();
});

test('a scan kept before PDFs shows as a photo', async () => {
  // recent.json as milestone 3 wrote it: no source, pageCount, picture or fromText in its result
  const result = JSON.parse(JSON.stringify(parseScanResult(coreJson('inv_0007'))));
  delete result.source;
  delete result.pageCount;
  delete result.picture;
  for (const b of result.reads) delete b.fromText;
  const kept = { id: 'old-1', label: 'Photo from gallery', source: 'gallery', at: '2026-11-18T01:00:00.000Z', result,
    edits: {}, terms: null, kind: 'sale', party: null, saved: null };
  memoryFs.files.set('file:///docs/recent.json', JSON.stringify([kept]));
  memoryFs.dirs.add('file:///data/x');
  await act(async () => loadRecent());
  mockParams = { id: 'old-1' };
  await render(<Result />);
  expect(screen.getByText('45 boxes read on this phone in 0 ms. Nothing left the phone.')).toBeTruthy();
  expect(screen.queryByText(/PDF/)).toBeNull();
  await press(screen.getByText('SI no.'));
  expect(screen.getByText('Read as “0007655” · 100% sure')).toBeTruthy();
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

  // a PDF: the picker again, and the new read takes this screen's place
  await show('sales_text_0', { source: 'pdf' });
  const uri = 'content://com.android.providers.downloads.documents/document/msf%3A71';
  mockPick.mockResolvedValueOnce({ canceled: false, result: { uri, name: 'msf:71', type: 'application/pdf' } });
  mockDisplayName.mockResolvedValueOnce('sales_text_1.pdf');
  mockReadPdf.mockResolvedValueOnce(parseScanResult(coreJson('sales_text_0')));
  await press(screen.getByText('Retake'));
  expect(mockPick).toHaveBeenCalledWith({ mimeTypes: ['application/pdf'] });
  expect(mockReadPdf).toHaveBeenCalledWith(uri);
  expect(mockRouter.replace).toHaveBeenLastCalledWith({ pathname: '/result', params: { id: expect.any(String) } });
  expect(getScan(mockRouter.replace.mock.calls.at(-1)![0].params.id)?.label).toBe('PDF: sales_text_1.pdf');
});
