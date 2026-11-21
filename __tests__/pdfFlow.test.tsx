import { act, fireEvent, render, screen } from '@testing-library/react-native';

import Home from '../app/index';
import { getScan } from '../lib/scans';
import { parseScanResult } from '../modules/scanner/src/parse';
import { coreJson } from '../test-utils/coreJson';
import { memoryFs } from '../test-utils/memoryFs';

// Import PDF, on Home: the system's file picker hands over a PDF, the scanner reads its page 1 (readPdf) and its
// result opens. A PDF the scanner refuses is named in plain words.

const mockPush = jest.fn();
const mockReadPdf = jest.fn();
const mockScanPhoto = jest.fn();
const mockLibrary = jest.fn();
const mockPick = jest.fn();
const mockToast = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useIsFocused: () => true,
}));
jest.mock('../modules/scanner', () => ({
  readPdf: (uri: string) => mockReadPdf(uri),
  scanPhoto: (uri: string, options: object) => mockScanPhoto(uri, options),
}));
jest.mock('../lib/toast', () => ({ toast: (m: string) => mockToast(m) }));
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

// Android's picker hands over the person's own file: a content:// link, with the name and type its app gives.
const DOWNLOADS = 'content://com.android.externalstorage.documents/document/primary%3ADownload%2F';

/** The picker's answer: the file at that URI, kept in the memory store so that a deletion shows. */
function picked(uri: string, name: string, type = 'application/pdf') {
  memoryFs.files.set(uri, '%PDF-1.7');
  const { File } = require('expo-file-system');
  return { canceled: false, result: { uri, name, type, delete: () => new File(uri).delete() } };
}

async function importPdf(answer: object) {
  mockPick.mockResolvedValueOnce(answer);
  await act(async () => fireEvent.press(screen.getByText('Import PDF')));
}

const refused = (code: string) => Object.assign(new Error(`refused: ${code}`), { code });

beforeEach(async () => {
  jest.clearAllMocks();
  memoryFs.reset();
  mockReadPdf.mockResolvedValue(parseScanResult(coreJson('sales_text_0')));
  await render(<Home />);
});

test('a PDF is read and opened', async () => {
  const uri = `${DOWNLOADS}sales_text_0.pdf`;
  await importPdf(picked(uri, 'sales_text_0.pdf'));
  expect(mockPick).toHaveBeenCalledWith({ mimeTypes: ['application/pdf'] });
  expect(mockReadPdf).toHaveBeenCalledWith(uri); // the link itself: the scanner reads it through its own copy
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/result', params: { id: expect.any(String) } });
  const scan = getScan(mockPush.mock.calls[0][0].params.id);
  expect(scan).toMatchObject({ label: 'PDF: sales_text_0.pdf', source: 'pdf' });
  expect(screen.getAllByText('PDF: sales_text_0.pdf').length).toBeGreaterThan(0); // in Recent scans
  expect(memoryFs.files.has(uri)).toBe(true); // the person's file is only read
  expect(mockToast).not.toHaveBeenCalled();
});

test('a cancelled pick does nothing', async () => {
  await importPdf({ canceled: true, result: null });
  expect(mockReadPdf).not.toHaveBeenCalled();
  expect(mockToast).not.toHaveBeenCalled();
  expect(mockPush).not.toHaveBeenCalled();
});

test('not a PDF', async () => {
  await importPdf(picked(`${DOWNLOADS}notes.txt`, 'notes.txt', 'text/plain'));
  expect(mockToast).toHaveBeenCalledWith('Choose a PDF file.');
  expect(mockReadPdf).not.toHaveBeenCalled();
  expect(mockPush).not.toHaveBeenCalled();

  // a PDF by its type alone (Android's Downloads can hand over a link without the file's name), or by its name alone
  const link = 'content://com.android.providers.downloads.documents/document/msf%3A1000000123';
  await importPdf(picked(link, 'msf:1000000123'));
  expect(mockReadPdf).toHaveBeenLastCalledWith(link);
  await importPdf(picked(`${DOWNLOADS}Invoice.PDF`, 'Invoice.PDF', ''));
  expect(mockReadPdf).toHaveBeenLastCalledWith(`${DOWNLOADS}Invoice.PDF`);
  expect(mockToast).toHaveBeenCalledTimes(1);
});

test.each([
  ['pdf_too_big', 'That PDF is over 20 MB. Choose a smaller file.'],
  ['pdf_password', 'That PDF has a password. Save a copy without one, then import it.'],
  ['pdf_broken', "Couldn't read that PDF."],
  ['pdf_unreadable', "Couldn't read that PDF."],
  ['pdf_page_too_big', "That PDF's page is too big to read."],
])('refused (%s): "%s"', async (code, words) => {
  mockReadPdf.mockRejectedValueOnce(refused(code));
  await importPdf(picked(`${DOWNLOADS}${code}.pdf`, `${code}.pdf`));
  expect(mockToast).toHaveBeenCalledWith(words);
  expect(mockToast).toHaveBeenCalledTimes(1);
  expect(mockPush).not.toHaveBeenCalled();
  expect(screen.queryByText(`PDF: ${code}.pdf`)).toBeNull(); // nothing in Recent scans
  expect(screen.queryByText('Reading the invoice…')).toBeNull();
});

test("the scanner failing isn't put on the PDF", async () => {
  // a closed scanner, or a model that didn't load: expo's ERR_UNEXPECTED, worded as when it fails on a photo
  const failure = Object.assign(new Error('The scanner was closed'), { code: 'ERR_UNEXPECTED' });
  mockLibrary.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'content://media/1' }] });
  mockScanPhoto.mockRejectedValueOnce(failure);
  await act(async () => fireEvent.press(screen.getByText('Choose from gallery')));
  mockReadPdf.mockRejectedValueOnce(failure);
  await importPdf(picked(`${DOWNLOADS}y.pdf`, 'y.pdf'));
  expect(mockToast).toHaveBeenCalledTimes(2);
  const [[photo], [pdf]] = mockToast.mock.calls;
  expect(pdf).toBe(photo);
  expect(pdf).toContain('The scanner was closed');
  expect(mockPush).not.toHaveBeenCalled();
});

test('a copy the picker made is deleted once read', async () => {
  // iOS's picker opens a copy of the file in the app's temporary folder (a file://); Android's never copies
  const copy = 'file:///tmp/Inbox/sales_text_0.pdf';
  let thereWhileRead = false;
  mockReadPdf.mockImplementationOnce(async (uri: string) => {
    thereWhileRead = memoryFs.files.has(uri);
    return parseScanResult(coreJson('sales_text_0'));
  });
  await importPdf(picked(copy, 'sales_text_0.pdf'));
  expect(mockReadPdf).toHaveBeenCalledWith(copy);
  expect(thereWhileRead).toBe(true);
  expect(memoryFs.files.has(copy)).toBe(false);

  // refused, or not a PDF: the copy goes too
  mockReadPdf.mockRejectedValueOnce(refused('pdf_password'));
  await importPdf(picked(copy, 'sales_text_0.pdf'));
  expect(memoryFs.files.has(copy)).toBe(false);
  await importPdf(picked('file:///tmp/Inbox/notes.txt', 'notes.txt', 'text/plain'));
  expect(memoryFs.files.has('file:///tmp/Inbox/notes.txt')).toBe(false);
});

test('two quick presses open one picker', async () => {
  let answer: (value: object) => void = () => {};
  mockPick.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
  await act(async () => {
    fireEvent.press(screen.getByText('Import PDF'));
    fireEvent.press(screen.getByText('Import PDF'));
  });
  expect(mockPick).toHaveBeenCalledTimes(1);
  await act(async () => answer({ canceled: true, result: null }));
});
