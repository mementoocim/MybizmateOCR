import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';

import Home from '../app/(tabs)/index';
import { getScan } from '../lib/scans';
import { parseScanResult } from '../modules/scanner/src/parse';
import { coreJson } from '../test-utils/coreJson';
import { dialogWords } from '../test-utils/dialogs';
import { memoryFs } from '../test-utils/memoryFs';

// Import PDF, on Home: the system's file picker hands over a PDF, the scanner reads its page 1 (readPdf) and its
// result opens, labelled with the file's name. A PDF the scanner refuses is named in plain words, in a dialog: the
// reason as its title and what to do as its message, or one sentence as a title alone (the plan's call 16, rulings
// T16-1 and T16-1a).

let mockTeam = false;
const mockPush = jest.fn();
const mockReadPdf = jest.fn();
const mockDisplayName = jest.fn();
const mockScanPhoto = jest.fn();
const mockLibrary = jest.fn();
const mockPick = jest.fn();
const mockRelease = jest.fn(async (_uri: string) => undefined);

jest.mock('../lib/build', () => ({
  get TEAM_BUILD() {
    return mockTeam;
  },
}));
jest.mock('expo-router', () => ({
  useNavigation: () => ({ canGoBack: () => true, goBack: jest.fn() }), // going back (lib/navigation)
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  // a screen's pushes run once until it's focused again (lib/navigation)
  useFocusEffect: (effect: () => void) => require('../test-utils/screenFocus').useFocusEffect(effect),
  useIsFocused: () => true,
}));
jest.mock('../modules/scanner', () => ({
  readPdf: (uri: string) => mockReadPdf(uri),
  displayName: (uri: string) => mockDisplayName(uri),
  scanPhoto: (uri: string, options: object) => mockScanPhoto(uri, options),
  releaseAccess: (uri: string) => mockRelease(uri),
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

// Android's picker hands over the person's own file: a content:// link. Its Downloads gives a link without the file's
// name (…/document/msf%3A54); the device's storage gives one with its path.
const LINK = 'content://com.android.providers.downloads.documents/document/msf%3A';
const STORAGE = 'content://com.android.externalstorage.documents/document/primary%3ADownload%2F';

const names = new Map<string, string | null>(); // URI -> the name its app gives (what displayName finds)

/**
 * The picker's answer for the file at that URI, as expo-file-system gives it: its name is the link's last segment. The
 * file is kept in the memory store, so that a deletion shows; `name` is what its app calls it.
 */
function picked(uri: string, name: string | null, type = 'application/pdf') {
  memoryFs.files.set(uri, '%PDF-1.7');
  names.set(uri, name);
  const { File } = require('expo-file-system');
  const segment = decodeURIComponent(uri).split('/').pop();
  return { canceled: false, result: { uri, name: segment, type, delete: () => new File(uri).delete() } };
}

async function importPdf(answer: object) {
  mockPick.mockResolvedValueOnce(answer);
  await act(async () => fireEvent.press(screen.getByText('Import PDF')));
}

const refused = (code: string) => Object.assign(new Error(`refused: ${code}`), { code });
const labels = () => mockPush.mock.calls.map(([to]) => getScan(to.params.id)?.label);

let alert: jest.SpyInstance;

beforeEach(async () => {
  jest.clearAllMocks();
  mockTeam = false;
  memoryFs.reset();
  names.clear();
  mockReadPdf.mockResolvedValue(parseScanResult(coreJson('sales_text_0')));
  mockDisplayName.mockImplementation(async (uri: string) => names.get(uri) ?? null);
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await render(<Home />);
});

afterEach(() => alert.mockRestore());

test('a PDF is read and opened', async () => {
  const uri = `${LINK}54`;
  await importPdf(picked(uri, 'sales_text_0.pdf'));
  expect(mockPick).toHaveBeenCalledWith({ mimeTypes: ['application/pdf'] });
  expect(mockDisplayName).toHaveBeenCalledWith(uri);
  expect(mockReadPdf).toHaveBeenCalledWith(uri); // the link itself: the scanner reads it through its own copy
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/result', params: { id: expect.any(String) } });
  const scan = getScan(mockPush.mock.calls[0][0].params.id);
  expect(scan).toMatchObject({ label: 'PDF: sales_text_0.pdf', source: 'pdf' });
  expect(screen.getAllByText('sales_text_0.pdf').length).toBeGreaterThan(0); // in Recent scans, by its file name
  expect(screen.queryByText(/msf/)).toBeNull(); // never the link's own id
  expect(memoryFs.files.has(uri)).toBe(true); // the person's file is only read
  expect(alert).not.toHaveBeenCalled();
});

test('a PDF without a name is "PDF"', async () => {
  // its app gives no name or an empty one, or asking fails: the label never shows the link's own id
  await importPdf(picked(`${LINK}61`, null));
  await importPdf(picked(`${LINK}62`, ''));
  mockDisplayName.mockRejectedValueOnce(new Error('no name'));
  await importPdf(picked(`${LINK}63`, 'x.pdf'));
  expect(mockReadPdf).toHaveBeenCalledTimes(3);
  expect(labels()).toEqual(['PDF', 'PDF', 'PDF']);
  expect(screen.queryByText(/msf/)).toBeNull();
});

test('a cancelled pick does nothing', async () => {
  await importPdf({ canceled: true, result: null });
  expect(mockDisplayName).not.toHaveBeenCalled();
  expect(mockReadPdf).not.toHaveBeenCalled();
  expect(alert).not.toHaveBeenCalled();
  expect(mockPush).not.toHaveBeenCalled();
});

test('not a PDF', async () => {
  await importPdf(picked(`${STORAGE}notes.txt`, 'notes.txt', 'text/plain'));
  expect(dialogWords(alert)).toStrictEqual([['Choose a PDF file.']]); // one sentence: a title alone
  expect(mockReadPdf).not.toHaveBeenCalled();
  expect(mockPush).not.toHaveBeenCalled();

  // a PDF by its type alone (its app gives no name), or by its name alone (no type)
  await importPdf(picked(`${LINK}64`, null));
  expect(mockReadPdf).toHaveBeenLastCalledWith(`${LINK}64`);
  await importPdf(picked(`${LINK}65`, 'Invoice.PDF', ''));
  expect(mockReadPdf).toHaveBeenLastCalledWith(`${LINK}65`);
  expect(labels()).toEqual(['PDF', 'PDF: Invoice.PDF']);
  expect(alert).toHaveBeenCalledTimes(1);
});

test('a refused PDF says why in a dialog', async () => {
  let refuse: (e: unknown) => void = () => {};
  mockReadPdf.mockImplementationOnce(() => new Promise((_, reject) => (refuse = reject)));
  await importPdf(picked(`${STORAGE}locked.pdf`, 'locked.pdf'));
  // while it reads, the card says what it's reading
  expect(screen.getByText('Reading…')).toBeOnTheScreen();
  expect(screen.getByText('Reading the PDF')).toBeOnTheScreen();
  expect(screen.queryByText('Straightening the photo and reading every box')).toBeNull();

  await act(async () => refuse(refused('pdf_password')));
  expect(dialogWords(alert)).toEqual([['That PDF has a password.', 'Save a copy without one, then import it.']]);
  expect(screen.queryByText('Reading…')).toBeNull();
  expect(screen.queryByText('locked.pdf')).toBeNull(); // nothing in Recent scans
  expect(mockPush).not.toHaveBeenCalled();
});

test.each([
  ['pdf_too_big', ['That PDF is over 20 MB.', 'Choose a smaller file.']],
  ['pdf_password', ['That PDF has a password.', 'Save a copy without one, then import it.']],
  ['pdf_broken', ["Couldn't read that PDF."]], // one sentence: a title alone
  ['pdf_unreadable', ["Couldn't read that PDF."]],
  ['pdf_page_too_big', ["That PDF's page is too big to read."]],
])('refused (%s): %j', async (code, dialog) => {
  mockReadPdf.mockRejectedValueOnce(refused(code));
  await importPdf(picked(`${STORAGE}${code}.pdf`, `${code}.pdf`));
  expect(dialogWords(alert)).toStrictEqual([dialog]); // once, with exactly these words
  expect(mockPush).not.toHaveBeenCalled();
  expect(screen.queryByText(`${code}.pdf`)).toBeNull(); // nothing in Recent scans
  expect(screen.queryByText('Reading…')).toBeNull();
});

test("the scanner failing isn't put on the PDF; its own words show in team builds only (final review, Minor 3)", async () => {
  // A closed scanner, or a model that didn't load (expo's ERR_UNEXPECTED): what it was reading, then what to do, in
  // plain words. The scanner's own message is raw error text, which a client never sees (design §12 A11).
  const failure = Object.assign(new Error('The scanner was closed'), { code: 'ERR_UNEXPECTED' });
  async function failBoth() {
    alert.mockClear();
    mockLibrary.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'content://media/1' }] });
    mockScanPhoto.mockRejectedValueOnce(failure);
    await act(async () => fireEvent.press(screen.getByText('From gallery')));
    mockReadPdf.mockRejectedValueOnce(failure);
    await importPdf(picked(`${STORAGE}y.pdf`, 'y.pdf'));
  }
  await failBoth();
  expect(dialogWords(alert)).toEqual([
    ["Couldn't read that photo", 'Try again, or retake it.'],
    ["Couldn't read that PDF", 'Try importing it again.'],
  ]);
  // a team build adds the scanner's own words under them, as the splash and the camera show theirs
  mockTeam = true;
  await failBoth();
  expect(dialogWords(alert)).toEqual([
    ["Couldn't read that photo", 'Try again, or retake it.\n\nThe scanner was closed'],
    ["Couldn't read that PDF", 'Try importing it again.\n\nThe scanner was closed'],
  ]);
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

test("the picker's lasting access to the file is given up once it has been read, refused, or isn't a PDF", async () => {
  // Android's picker keeps a grant on every file it hands over; the scanner gives it up after its read too, and giving
  // up a grant that is gone already does nothing
  const uri = `${LINK}71`;
  await importPdf(picked(uri, 'sales_text_0.pdf'));
  expect(mockRelease.mock.calls).toEqual([[uri]]);
  expect(mockReadPdf.mock.invocationCallOrder[0]).toBeLessThan(mockRelease.mock.invocationCallOrder[0]);
  mockReadPdf.mockRejectedValueOnce(refused('pdf_password'));
  await importPdf(picked(`${LINK}72`, 'locked.pdf'));
  await importPdf(picked(`${STORAGE}notes.txt`, 'notes.txt', 'text/plain'));
  expect(mockRelease.mock.calls).toEqual([[uri], [`${LINK}72`], [`${STORAGE}notes.txt`]]);
  // a failure to give it up changes nothing for the person
  mockRelease.mockRejectedValueOnce(new Error('gone'));
  await importPdf(picked(`${LINK}73`, 'sales_text_0.pdf'));
  expect(mockPush).toHaveBeenCalledTimes(2);
  expect(dialogWords(alert)).toStrictEqual([
    ['That PDF has a password.', 'Save a copy without one, then import it.'],
    ['Choose a PDF file.'],
  ]);
  // a copy the picker made (a file://) holds no grant: it is deleted instead
  mockRelease.mockClear();
  await importPdf(picked('file:///tmp/Inbox/sales_text_0.pdf', 'sales_text_0.pdf'));
  expect(mockRelease).not.toHaveBeenCalled();
});

test('two quick presses open one picker', async () => {
  let answer: (value: object) => void = () => {};
  mockPick.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
  // A fast double tap: inside one act() scope, React doesn't re-render the button as busy between the two presses.
  await act(async () => {
    await fireEvent.press(screen.getByText('Import PDF'));
    await fireEvent.press(screen.getByText('Import PDF'));
  });
  expect(mockPick).toHaveBeenCalledTimes(1);
  await act(async () => answer({ canceled: true, result: null }));
});
