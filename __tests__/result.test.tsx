import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { Profiler, useEffect, useState } from 'react';
import { AccessibilityInfo, Alert, type AlertButton, ScrollView, View } from 'react-native';

import Result from '../app/result';
import { RecentRow } from '../components/RecentRow';
import { certOf } from '../lib/cert';
import { localIsoDate } from '../lib/checks/dates';
import { blockWords, saveBlock } from '../lib/exportRows';
import { amount, formatClock, monthDay, peso, qty } from '../lib/format';
import { clearItems, lists } from '../lib/lists';
import * as savedStore from '../lib/saved';
import { markExported, savedSummary, saveScan } from '../lib/saved';
import { addScan, confirmBox, getScan, loadRecent, setEdit, updateScan } from '../lib/scans';
import * as sessionStore from '../lib/session';
import { currentSession, loadSession } from '../lib/session';
import type { ScanSource } from '../lib/scans';
import { settings, updateSettings } from '../lib/settings';
import { colors, space, type } from '../lib/theme';
import { uncheckedBoxes } from '../lib/training/boxes';
import type { ScanResult } from '../modules/scanner';
import { parseScanResult } from '../modules/scanner/src/parse';
import { coreJson } from '../test-utils/coreJson';
import { dialogWords } from '../test-utils/dialogs';
import { memoryFs } from '../test-utils/memoryFs';
import { pinToday } from '../test-utils/today';

// Design B §9.5: the Scan screen. Its header names the form, with the photo behind a thumbnail (and ⋮ for a saved
// scan); the status strip is pinned under it, a flag chip per thing to check; then the saved line, the kind switch,
// the invoice as a ledger and the footnote; the bottom bar holds Retake and the save. Every row opens what the camera
// saw in its boxes, each box fixable, and the checks run again.

let mockParams: { id?: string; from?: string; session?: string } = {};
let mockTeam = false;
// dismissTo: down to a tab (the camera, or a session's screen in Sessions), this screen gone
const mockRouter = { replace: jest.fn(), push: jest.fn(), dismissTo: jest.fn(), navigate: jest.fn() };
/**
 * The screen's own navigation: going back (lib/navigation's useGoBackOrHome) is its. It's in the root Stack, above the
 * tabs (lib/navigation's tabsOnTop), so a tab opens with dismissTo.
 */
const mockNavigation = {
  canGoBack: jest.fn(() => true),
  goBack: jest.fn(),
  getState: () => ({ type: 'stack' }),
  getParent: () => undefined,
};
const mockEnhance = jest.fn(async (_uri: string, mode: string) => `file:///x/${mode}.img`);
const mockSave = jest.fn();
const mockToast = jest.fn();
const mockLibrary = jest.fn(async () => ({ canceled: true }));
const mockCameraApp = jest.fn(async () => ({ canceled: true }));
const mockPick = jest.fn();
const mockReadPdf = jest.fn();
const mockDisplayName = jest.fn();
const mockRelease = jest.fn(async (_uri: string) => undefined);

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useNavigation: () => mockNavigation,
  useRouter: () => mockRouter,
  // a screen's pushes run once until it's focused again (lib/navigation)
  useFocusEffect: (effect: () => void) => require('../test-utils/screenFocus').useFocusEffect(effect),
  useIsFocused: () => true,
}));
jest.mock('../modules/scanner', () => ({
  enhance: (uri: string, mode: string) => mockEnhance(uri, mode),
  saveToPictures: (uri: string) => mockSave(uri),
  scanPhoto: jest.fn(),
  readPdf: (uri: string) => mockReadPdf(uri),
  displayName: (uri: string) => mockDisplayName(uri),
  releaseAccess: (uri: string) => mockRelease(uri),
}));
jest.mock('../lib/toast', () => ({ toast: (m: string) => mockToast(m) }));
jest.mock('../lib/build', () => ({
  get TEAM_BUILD() {
    return mockTeam;
  },
}));
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: () => mockLibrary(),
  requestCameraPermissionsAsync: async () => ({ granted: true }),
  launchCameraAsync: () => mockCameraApp(),
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
  opts: { source?: ScanSource; sampleId?: string; from?: string; label?: string; edit?: (r: ScanResult) => void } = {},
): Promise<string> {
  const result = parseScanResult(coreJson(stem));
  opts.edit?.(result);
  // in act: the screen a test showed before re-renders with the sessions (useSessions)
  const id = await act(async () =>
    addScan({ label: opts.label ?? 'A scan', source: opts.source ?? 'sample', sampleId: opts.sampleId, result }),
  );
  mockParams = { id, from: opts.from };
  await render(<Result />);
  return id;
}

const DETAILS = { taxType: 'VAT', account: '4010', terms: 'account', atc: '' } as const;

/** A camera photo of the fixture, saved as a sale, opened again from Saved. */
async function showSaved(stem: string): Promise<string> {
  const id = addScan({ label: 'Camera photo', source: 'camera', result: parseScanResult(coreJson(stem)) });
  await saveScan(id, DETAILS);
  mockParams = { id, from: 'list' };
  await render(<Result />);
  return id;
}

/** The day it was saved, as the screen says it ("Nov 18"). */
const savedDay = (id: string) => monthDay(localIsoDate(new Date(savedSummary(id)!.savedAt)));

const press = (el: Parameters<typeof fireEvent.press>[0]) => act(async () => fireEvent.press(el));
const button = (name: string | RegExp) => screen.getByRole('button', { name });
const header = (name: string) => screen.getByRole('header', { name });
/** The bottom bar's buttons, in order. */
const barButtons = () =>
  within(screen.getByTestId('bottom-bar'))
    .getAllByRole('button')
    .map((b) => b.props.accessibilityLabel);
/** The photo: behind the header's thumbnail, or inline when the form wasn't found. */
const openPhoto = () => press(button('Photo of the form'));
const focus = jest.mocked(AccessibilityInfo.sendAccessibilityEvent);
/** What TalkBack focus went to: the view's testID. */
const focusedTestIDs = () => focus.mock.calls.map(([view, event]) => [(view as { props?: { testID?: string } }).props?.testID, event]);

// jest's views and scroll views have no layout, and share their native methods: Android's measurements stand in.
const viewMethods = View.prototype as unknown as { measureInWindow: jest.Mock; measureLayout: jest.Mock };
const scrollMethods = ScrollView.prototype as unknown as { getInnerViewRef: jest.Mock; scrollTo: jest.Mock };
/** Where Android would measure the ⋮ button: at the header's right end, under the status bar. */
const placeMenu = () => viewMethods.measureInWindow.mockImplementationOnce((onSuccess) => onSuccess(312, 24, 48, 48));

let alert: jest.SpyInstance;
const alertButtons = () => alert.mock.calls.at(-1)![2] as AlertButton[];

beforeAll(() => pinToday(new Date(2026, 10, 18, 10, 0))); // a scan that isn't a sample is checked as of the day it's read
afterAll(() => jest.useRealTimers());

beforeEach(async () => {
  jest.clearAllMocks();
  mockNavigation.canGoBack.mockReturnValue(true); // a screen under this one, as when Home or Saved opened it
  memoryFs.reset();
  mockTeam = false;
  await updateSettings({ annotation: false });
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => alert.mockRestore());

test('the header names the form; its subtitle has the number and the read time', async () => {
  const id = await show('inv_0007', {
    source: 'gallery',
    edit: (r) => {
      r.timing = { ...r.timing, totalMs: 3200 };
    },
  });
  expect(header('MyBizMate Sales Invoice')).toBeOnTheScreen();
  const no = getScan(id)!.result.reads.find((b) => b.name === 'invoice_no')!.text;
  expect(screen.getByText(`SI no. ${no} · Read in 3.2\u00A0s`)).toHaveStyle({ ...type.overline, color: colors.mute });
  // RNTL's text match counts a no-break space as a space, so the line's own text pins it: the read time keeps its unit
  // on its line (QA pass 2, a Service Invoice at 100%: "· READ IN 3.7" / "S")
  expect(screen.getByText(/ · Read in /).props.children).toBe(`SI no. ${no} · Read in 3.2\u00A0s`);
  // On its right, the photo's thumbnail, and ⋮, which deletes it, saved or not (ruling P-F10)
  expect(within(screen.getByTestId('header')).getByRole('button', { name: 'Photo of the form' })).toBeOnTheScreen();
  expect(within(screen.getByTestId('header')).getByRole('button', { name: 'More options' })).toBeOnTheScreen();

  // A Service Invoice names its own number; a 2307 has none; a text PDF says where its boxes came from.
  await show('svc_0000', { source: 'gallery' });
  expect(header('Service Invoice')).toBeOnTheScreen();
  expect(screen.getByText(`Invoice no. ${expectedOf('svc_0000').invoice_no} · Read in 0.0\u00A0s`)).toBeOnTheScreen();
  expect(screen.getByText(/ · Read in /).props.children).toBe(
    `Invoice no. ${expectedOf('svc_0000').invoice_no} · Read in 0.0\u00A0s`,
  );
  await show('bir2307_photo_0', { source: 'camera' });
  expect(header('BIR Form 2307')).toBeOnTheScreen();
  expect(screen.getByText('Read in 0.0\u00A0s')).toBeOnTheScreen();
  // a read under a second is in seconds too, as the design's "· 0.7 S" (§9.5), and so is the footnote's time
  await show('sales_text_0', {
    source: 'pdf',
    label: 'PDF: sales_text_0.pdf',
    edit: (r) => {
      r.timing = { ...r.timing, totalMs: 214 };
    },
  });
  expect(screen.getByText("From the PDF's text · 0.2\u00A0s")).toBeOnTheScreen();
  expect(screen.getByText('Read on this phone in 0.2\u00A0s. Nothing left the phone.')).toBeOnTheScreen();
  expect(screen.getByText(/^From the PDF's text · /).props.children).toBe("From the PDF's text · 0.2\u00A0s");
});

test('a sample says so in its subtitle and has Retake only', async () => {
  await show('inv_0007', { source: 'sample', sampleId: 'inv_0007', label: 'Sample 0007' });
  expect(screen.getByText('Sample 0007 · Read in 0.0\u00A0s')).toBeOnTheScreen();
  expect(barButtons()).toEqual(['Retake']);
  expect(screen.queryByTestId('save-open')).toBeNull();
  expect(header('Checks passed')).toBeOnTheScreen();
  expect(screen.getByText("Samples can't be saved")).toBeOnTheScreen();
});

test('to check: a chip per problem word, and a chip opens its row', async () => {
  const id = await show('inv_0007', {
    edit: (r) => {
      r.terms = null;
    },
  });
  await act(async () => setEdit(id, 'date', '13/45/2026'));
  // Pinned under the header, outside the scroll.
  const strip = screen.getByTestId('status-strip');
  expect(within(screen.getByTestId('screen-scroll')).queryByTestId('status-strip')).toBeNull();
  expect(strip).toHaveStyle({ backgroundColor: colors.warningTint });
  expect(header('2 to check')).toBeOnTheScreen();
  expect(screen.getByText('Tap one to fix it')).toBeOnTheScreen();
  expect(
    within(strip)
      .getAllByRole('button')
      .map((chip) => chip.props.accessibilityLabel),
  ).toEqual(['Date, to check', 'Terms, to check']);

  // A chip scrolls its row into view, 24 dp under the scroll's top, then opens it, as tapping the row does.
  const content = {};
  scrollMethods.getInnerViewRef.mockReturnValueOnce(content);
  viewMethods.measureLayout.mockImplementationOnce((relativeTo, onSuccess) => relativeTo === content && onSuccess(0, 600, 360, 72));
  await press(button('Date, to check'));
  expect(viewMethods.measureLayout.mock.contexts.map((row: { props: { testID: string } }) => row.props.testID)).toEqual([
    'row-date',
  ]);
  expect(scrollMethods.scrollTo).toHaveBeenCalledWith({ y: 600 - space.xl, animated: true });
  expect(header('Date')).toBeOnTheScreen(); // the open sheet's title
  expect(screen.getByLabelText('What the box says')).toBeOnTheScreen(); // one box: straight to its editor
  await press(button('Close'));
  await press(button('Terms, to check'));
  expect(header('Terms')).toBeOnTheScreen();
  expect(screen.getByText('On the paper, neither box is clearly ticked.')).toBeOnTheScreen();
});

test('checks passed: the strip and Save sale', async () => {
  const id = await show('inv_0007', { source: 'gallery' });
  expect(header('Checks passed')).toBeOnTheScreen();
  expect(screen.getByText('Look over the values, then save')).toBeOnTheScreen();
  expect(screen.getByTestId('status-strip')).toHaveStyle({ backgroundColor: colors.successTint });
  expect(barButtons()).toEqual(['Retake', 'Save sale']);
  // a box fixed: the strip counts it
  await act(async () => setEdit(id, 'item1_unit', 'kgs'));
  expect(screen.getByText('Look over the values, then save · you fixed 1 box')).toBeOnTheScreen();
});

test('a 2307 with no payments read: the blocked strip', async () => {
  await show('bir2307_text_0', {
    source: 'pdf',
    edit: (r) => {
      r.reads = r.reads.filter((b) => !b.name.startsWith('ewt'));
    },
  });
  expect(header('No income payments were read')).toBeOnTheScreen();
  expect(screen.getByText("Can't save yet")).toBeOnTheScreen();
  expect(screen.getByTestId('status-strip')).toHaveStyle({ backgroundColor: colors.warningTint });
  expect(barButtons()).toEqual(['Retake', 'Save 2307']);
});

test('fix a box, and the checks run again', async () => {
  const id = await show('inv_0007');
  await press(screen.getByText('Date')); // a one-box row: straight to its editor
  await act(async () => fireEvent.changeText(screen.getByLabelText('What the box says'), '13/45/2026'));
  await press(screen.getByTestId('box-save'));
  expect(screen.queryByLabelText('What the box says')).toBeNull(); // the sheet closed
  expect(getScan(id)!.edits.date).toBe('13/45/2026');
  expect(header('1 to check')).toBeOnTheScreen();
  expect(button('Date, to check')).toBeOnTheScreen();
  expect(screen.getByText("Couldn't make out a date")).toBeTruthy(); // the row's reason
});

test('a one-box row opens at its editor, whose reading has no percentage', async () => {
  await show('inv_0007');
  await press(screen.getByText('SI no.'));
  expect(header('SI no.')).toBeOnTheScreen();
  expect(screen.getByText('What the camera saw')).toHaveStyle(type.overline);
  expect(screen.getByText('Read as “0007655”')).toBeTruthy();
  expect(screen.queryByText(/% sure/)).toBeNull();
  expect(screen.getByLabelText('What the box says').props.value).toBe('0007655');
});

test('a backup reading is a quick pick', async () => {
  await show('inv_0007');
  await press(screen.getByText('Total due'));
  await press(screen.getByTestId('box-total_due'));
  expect(screen.getByText('Could also be')).toBeTruthy();
  await press(screen.getByText('24.377'));
  expect(screen.getByLabelText('What the box says').props.value).toBe('24.377');
});

test('an empty box can be filled', async () => {
  await show('svc_0000');
  expect(screen.queryByText('Zero-rated sales')).toBeNull();
  await press(screen.getByText('Total due'));
  expect(within(screen.getByTestId('box-zero_rated')).getByText('Empty box')).toBeOnTheScreen();
  await press(screen.getByTestId('box-zero_rated'));
  expect(screen.getByText('No picture of this box')).toBeOnTheScreen();
  await act(async () => fireEvent.changeText(screen.getByLabelText('What the box says'), '100.00'));
  await press(screen.getByTestId('box-save'));
  // back at the list, which says what changed; the row's amount shows, without the peso sign
  expect(within(screen.getByTestId('box-zero_rated')).getByText('You changed it to “100.00”.')).toBeOnTheScreen();
  expect(screen.getByText('100.00')).toBeTruthy();
});

test('the editor confirms a box in annotation mode', async () => {
  const STATES = /^(Checked|Corrected|Not checked yet)$/;
  // annotation mode is the setting in a team build: a client build never shows it, though the setting is kept
  for (const [team, annotation] of [
    [true, false],
    [false, true],
  ] as const) {
    mockTeam = team;
    await act(async () => updateSettings({ annotation }));
    await show('inv_0007');
    await press(screen.getByText('Date')); // a one-box row: straight to its editor
    expect(screen.getByLabelText('What the box says')).toBeTruthy();
    expect(screen.queryByText(STATES)).toBeNull();
    expect(screen.queryByTestId('box-confirm')).toBeNull();
  }

  mockTeam = true;
  await act(async () => updateSettings({ annotation: true }));
  const id = await show('inv_0007');
  // A one-box row has no list: its editor says the box's state, and Looks right closes it, as Save does.
  await press(screen.getByText('Date'));
  expect(screen.getByText('Not checked yet')).toBeTruthy();
  await press(screen.getByTestId('box-confirm'));
  expect(screen.queryByLabelText('What the box says')).toBeNull(); // the sheet closed
  expect(getScan(id)!.confirmed).toEqual(['date']);
  await press(screen.getByText('Date'));
  expect(screen.getByText('Checked')).toBeTruthy();
  // saving the box's own reading untouched changes nothing, so it stays checked
  expect(screen.getByLabelText('What the box says').props.value).toBe('Sep 20, 2026');
  await press(screen.getByTestId('box-save'));
  expect(getScan(id)!.confirmed).toEqual(['date']);
  await press(screen.getByText('Date'));
  expect(screen.getByText('Checked')).toBeTruthy();
  // a correction takes the check's place
  await act(async () => fireEvent.changeText(screen.getByLabelText('What the box says'), '9/20/2026'));
  await press(screen.getByTestId('box-save'));
  expect(getScan(id)!.edits.date).toBe('9/20/2026');
  expect(getScan(id)!.confirmed).toEqual([]);
  await press(screen.getByText('Date'));
  expect(screen.getByText('Corrected')).toBeTruthy();
  await press(screen.getByLabelText('Close'));

  // A row with several boxes: Looks right goes back to its list, where each box says its state.
  await press(screen.getByText('VAT 12%'));
  expect(screen.getAllByText('Not checked yet')).toHaveLength(3);
  await press(screen.getByTestId('box-vat'));
  await press(screen.getByTestId('box-confirm'));
  expect(screen.queryByLabelText('What the box says')).toBeNull(); // back to the box list
  expect(within(screen.getByTestId('box-vat')).getByText('Checked')).toBeTruthy();
  expect(screen.getAllByText('Not checked yet')).toHaveLength(2);
  await press(screen.getByLabelText('Close'));

  // the customer's boxes never become training data: no state, and nothing to confirm
  await press(screen.getByText('Customer'));
  expect(screen.getByText('TIN')).toBeTruthy();
  expect(screen.queryByText(STATES)).toBeNull();
  await press(screen.getByTestId('box-customer_name'));
  expect(screen.getByLabelText('What the box says')).toBeTruthy();
  expect(screen.queryByTestId('box-confirm')).toBeNull();
  await press(screen.getByText('Cancel'));
  await press(screen.getByLabelText('Close'));

  // a multi-line box (the Service Invoice's amount in words) has nothing to confirm either, nor has an empty box
  await show('svc_0000');
  await press(screen.getByText('Total due'));
  await press(screen.getByTestId('box-amount_words'));
  expect(screen.queryByTestId('box-confirm')).toBeNull();
  await press(screen.getByText('Cancel'));
  await press(screen.getByTestId('box-zero_rated'));
  expect(screen.queryByTestId('box-confirm')).toBeNull();
});

test("Looks right is only for the box's value as it stands", async () => {
  mockTeam = true;
  await act(async () => updateSettings({ annotation: true }));
  await show('inv_0007');
  const confirmButton = () => screen.queryByTestId('box-confirm');
  const typeIn = (text: string) => act(async () => fireEvent.changeText(screen.getByLabelText('What the box says'), text));
  await press(screen.getByText('Total due'));
  await press(screen.getByTestId('box-total_due'));
  expect(confirmButton()).toBeTruthy(); // its reading, “24,377”
  // a backup reading picked, or other words typed, is a correction: only Save keeps it
  await press(screen.getByText('24.377'));
  expect(confirmButton()).toBeNull();
  await typeIn('24,000');
  expect(confirmButton()).toBeNull();
  await typeIn(' 24,377 '); // back to the reading, spaces aside as Save keeps it
  expect(confirmButton()).toBeTruthy();
  await typeIn('24,000');
  await press(screen.getByTestId('box-save'));
  expect(screen.getByText('Corrected')).toBeTruthy();
  // on a corrected box, the correction as it stands can be confirmed, but not the reading it replaced
  await press(screen.getByTestId('box-total_due'));
  expect(confirmButton()).toBeTruthy();
  await press(screen.getByText('24,377'));
  expect(confirmButton()).toBeNull();
});

test('annotation mode blocks an unchecked save', async () => {
  mockTeam = true;
  await act(async () => updateSettings({ annotation: true }));
  // A 2307 photo, with words alone in row 2's payment box: words alone don't make a payment row, so no section shows
  // that box. Its 14 boxes that can become training data, and this one.
  const id = await show('bir2307_photo_0', {
    source: 'camera',
    edit: (r) => {
      const at = r.reads.findIndex((b) => b.name === 'ewt1_tax') + 1;
      const next = r.reads[at - 1];
      const cropUri = next.cropUri!.replace('ewt1_tax', 'ewt2_payment');
      r.reads.splice(at, 0, { ...next, name: 'ewt2_payment', text: 'Rent', alts: [], cropUri });
    },
  });
  const scan = () => getScan(id)!;
  const blockNow = (annotation?: boolean) =>
    saveBlock(scan(), certOf(scan(), lists(), settings()), annotation === undefined ? undefined : { annotation });
  expect(uncheckedBoxes(scan())).toHaveLength(15);
  expect(blockNow(true)).toBe('unchecked');
  expect(blockNow(false)).toBeNull();
  expect(blockNow()).toBeNull();
  expect(blockWords('unchecked', scan())).toBe('Check every box first: 15 left.');
  expect(header('Check every box first: 15 left')).toBeTruthy(); // the strip's headline, without the full stop
  expect(screen.queryByText('Checks passed')).toBeNull();
  // what the paper itself needs comes first
  await act(async () => setEdit(id, 'period_to', ''));
  expect(blockNow(true)).toBe('no_period');
  await act(async () => setEdit(id, 'period_to', '12312025')); // the reading again: no edit, and not checked
  expect(blockNow(true)).toBe('unchecked');

  // every box checked or corrected but three
  const left = ['period_from', 'ewt1_tax', 'ewt2_payment'];
  await act(async () => {
    setEdit(id, 'ewt1_payment', 'Office supplies and paper');
    uncheckedBoxes(scan())
      .filter((box) => !left.includes(box))
      .forEach((box) => confirmBox(id, box));
  });
  expect(header('Check every box first: 3 left')).toBeTruthy();

  // Save opens the list of exactly the boxes not checked yet, the one no section shows too
  await press(screen.getByTestId('save-open'));
  expect(mockToast).not.toHaveBeenCalled();
  expect(screen.queryByTestId('save-confirm')).toBeNull();
  expect(screen.getByText('Check every box first')).toBeTruthy();
  expect(screen.getAllByTestId(/^box-/).map((b) => b.props.testID)).toEqual(left.map((box) => `box-${box}`));
  expect(screen.getAllByText('Not checked yet')).toHaveLength(3);
  for (const box of ['ewt2_payment', 'ewt1_tax']) {
    await press(screen.getByTestId(`box-${box}`));
    await press(screen.getByTestId('box-confirm'));
  }
  expect(screen.getAllByText('Checked')).toHaveLength(2);
  expect(screen.getAllByTestId(/^box-/)).toHaveLength(3); // the list stays as it opened
  expect(header('Check every box first: 1 left')).toBeTruthy();
  expect(blockWords('unchecked', scan())).toBe('Check every box first: 1 left.');
  await press(screen.getByLabelText('Close'));

  // Home's recent row agrees with the strip: it can't be saved yet (design B §9.2: the badge, without the reason)
  await render(<RecentRow scan={scan()} onPress={() => {}} />);
  expect(screen.getByRole('button', { name: /, Can't save yet$/ })).toBeTruthy();

  // once every box is checked, Save opens the save sheet
  await act(async () => confirmBox(id, 'period_from'));
  expect(blockNow(true)).toBeNull();
  mockParams = { id };
  await render(<Result />);
  expect(header('Checks passed')).toBeTruthy();
  await press(screen.getByTestId('save-open'));
  expect(screen.getByTestId('save-confirm')).toBeTruthy();
  expect(screen.getByLabelText('Client code')).toBeTruthy();
});

test('Check every box first lists the unchecked boxes with their states', async () => {
  // Ruling P7: through the Scan screen's Save, in annotation mode, with every box of sample 0007 checked but three
  mockTeam = true;
  await act(async () => updateSettings({ annotation: true }));
  const id = await show('inv_0007', { source: 'gallery' });
  const left = ['total_due', 'item3_unit', 'item3_amount'];
  await act(async () => {
    uncheckedBoxes(getScan(id)!)
      .filter((box) => !left.includes(box))
      .forEach((box) => confirmBox(id, box));
  });
  await press(screen.getByTestId('save-open'));
  expect(header('Check every box first')).toBeOnTheScreen(); // the box sheet's title
  // each box with its state, in place of Edited (the plan's call 19), and Hard to read where the score is under 0.90
  const listed = () => screen.getAllByTestId(/^box-/).map((row) => row.props.accessibilityLabel);
  expect(listed()).toEqual([
    'Total due, Read as “24,377”, Not checked yet',
    'Row 3 · Unit, Read as “can”, Hard to read, Not checked yet',
    'Row 3 · Amount, Read as “72”, Hard to read, Not checked yet',
  ]);
  for (const badge of screen.getAllByText('Not checked yet')) expect(badge).toHaveStyle({ color: colors.warning });

  // one looks right, one is corrected: the list stays as it opened, with their new states
  await press(screen.getByTestId('box-item3_unit'));
  await press(screen.getByTestId('box-confirm'));
  await press(screen.getByTestId('box-total_due'));
  await act(async () => fireEvent.changeText(screen.getByLabelText('What the box says'), '24,377.00'));
  await press(screen.getByTestId('box-save'));
  expect(header('Check every box first')).toBeOnTheScreen();
  expect(listed()).toEqual([
    'Total due, Read as “24,377”, You changed it to “24,377.00”, Corrected',
    'Row 3 · Unit, Read as “can”, Hard to read, Checked',
    'Row 3 · Amount, Read as “72”, Hard to read, Not checked yet',
  ]);
  expect(screen.getByText('Corrected')).toHaveStyle({ color: colors.success });
  expect(screen.getByText('Checked')).toHaveStyle({ color: colors.success });
  expect(within(screen.getByTestId('sheet-panel')).queryByText('Edited')).toBeNull();
  expect(header('Check every box first: 1 left')).toBeOnTheScreen();
});

test('Check every box first keeps its list with one box left, and gives focus back to Save', async () => {
  // Ruling T13-5: milestone 4 opened the list here; the one-box shortcut is for rows
  mockTeam = true;
  await act(async () => updateSettings({ annotation: true }));
  const id = await show('inv_0007', { source: 'gallery', from: 'list' });
  await act(async () => {
    uncheckedBoxes(getScan(id)!)
      .filter((box) => box !== 'item3_unit')
      .forEach((box) => confirmBox(id, box));
  });
  expect(header('Check every box first: 1 left')).toBeOnTheScreen();
  await press(screen.getByTestId('save-open'));
  expect(header('Check every box first')).toBeOnTheScreen(); // the list, not the box's editor
  const listed = () => screen.getAllByTestId(/^box-/).map((row) => row.props.accessibilityLabel);
  expect(listed()).toEqual(['Row 3 · Unit, Read as “can”, Hard to read, Not checked yet']);
  expect(screen.queryByLabelText('What the box says')).toBeNull();

  // Looks right in its editor goes back to the list, on the box's row (ruling T13-2)
  await press(screen.getByTestId('box-item3_unit'));
  expect(header('Row 3 · Unit')).toBeOnTheScreen();
  focus.mockClear();
  await press(screen.getByTestId('box-confirm'));
  expect(header('Check every box first')).toBeOnTheScreen();
  expect(listed()).toEqual(['Row 3 · Unit, Read as “can”, Hard to read, Checked']);
  expect(focusedTestIDs()).toEqual([['box-item3_unit', 'focus']]);
  expect(header('Checks passed')).toBeOnTheScreen(); // every box checked now
  // and so does Save
  await press(screen.getByTestId('box-item3_unit'));
  await act(async () => fireEvent.changeText(screen.getByLabelText('What the box says'), 'cans'));
  focus.mockClear();
  await press(screen.getByTestId('box-save'));
  expect(getScan(id)!.edits.item3_unit).toBe('cans');
  expect(header('Check every box first')).toBeOnTheScreen();
  expect(listed()).toEqual(['Row 3 · Unit, Read as “can”, You changed it to “cans”, Hard to read, Corrected']);
  expect(focusedTestIDs()).toEqual([['box-item3_unit', 'focus']]);

  // Closing it gives focus back to Save, which opened it: no strip focus (that's for a row's one-box sheet)
  focus.mockClear();
  await press(button('Close'));
  expect(focusedTestIDs()).toEqual([['save-open', 'focus']]);
});

test('terms', async () => {
  await show('inv_0007', {
    edit: (r) => {
      r.terms = null;
    },
  });
  expect(screen.getByText('Unclear')).toBeTruthy();
  expect(screen.getByText('Tick Cash or On account clearly')).toBeTruthy(); // the row's reason
  expect(button('Terms, to check')).toBeOnTheScreen();
  await press(screen.getByTestId('row-terms'));
  expect(screen.getByText('On the paper, neither box is clearly ticked.')).toBeTruthy();
  await press(screen.getByText('Cash'));
  expect(screen.getByText('Cash')).toBeTruthy();
  expect(screen.getByText('Chosen by you')).toBeTruthy();
  expect(header('Checks passed')).toBeTruthy();
});

test('a purchase', async () => {
  await show('inv_0007');
  await press(screen.getByText('Purchase'));
  expect(screen.getByText('Supplier')).toBeTruthy();
  expect(screen.getByText('Not chosen yet')).toBeTruthy();
  expect(screen.getByText('Sold to')).toBeTruthy();
  expect(button('Supplier (choose one), to check')).toBeOnTheScreen();
  expect(
    screen.getByText("Another business issued it to you. It becomes a row in MyBizMate's Purchases import."),
  ).toBeTruthy();
  // The scanner doesn't read the supplier: its row opens your suppliers, not what the camera saw.
  expect(screen.getByTestId('row-supplier')).toHaveProp('accessibilityHint', 'Opens your suppliers');
  expect(screen.getByTestId('row-sold_to')).toHaveProp('accessibilityHint', 'Opens what the camera saw');
});

test('the kind switch: a radio group, Sale | Purchase, with today\'s sentence', async () => {
  await show('inv_0007');
  const kinds = screen.getByRole('radiogroup', { name: 'This invoice is' });
  expect(
    within(kinds)
      .getAllByRole('radio')
      .map((option) => option.props.accessibilityLabel),
  ).toEqual(['Sale', 'Purchase']);
  expect(screen.getByRole('radio', { name: 'Sale' })).toBeChecked();
  expect(screen.getByText("You issued it. It becomes a row in MyBizMate's Sales import.")).toHaveStyle({
    ...type.label,
    color: colors.mute,
  });
  await press(screen.getByRole('radio', { name: 'Purchase' }));
  expect(screen.getByRole('radio', { name: 'Purchase' })).toBeChecked();
  expect(
    screen.getByText("Another business issued it to you. It becomes a row in MyBizMate's Purchases import."),
  ).toBeOnTheScreen();
  // a 2307 is always a 2307
  await show('bir2307_text_1', { source: 'pdf' });
  expect(screen.queryByRole('radiogroup', { name: 'This invoice is' })).toBeNull();
});

test("the Service Invoice's gross", async () => {
  await show('svc_0002');
  expect(screen.getByText('Gross (VAT included)')).toBeTruthy();
  expect(screen.getByText(peso(expectedOf('svc_0002').gross))).toBeTruthy();
});

test('an item row', async () => {
  const id = await show('inv_0007');
  const first = expectedOf('inv_0007').items[0];
  expect(screen.getByText(`${qty(first.qty)} × ${amount(first.unit_price)}`)).toBeTruthy();
  expect(screen.getAllByText(amount(first.amount)).length).toBeGreaterThan(0);
  expect(screen.getByText('Items · 6')).toBeTruthy();
  expect(screen.getByText('Amount')).toBeTruthy(); // the section's right column
  // which TalkBack says with the amount, as focus can land on the row away from the strip (ruling T12-4)
  const spoken = `${first.description}, ${qty(first.qty)} × ${amount(first.unit_price)}, Amount ${amount(first.amount)}`;
  expect(button(spoken)).toBeOnTheScreen();
  expect(screen.getAllByText('Amount')).toHaveLength(1); // only the strip shows it
  await act(async () => {
    setEdit(id, 'item1_unit_price', 'xyz'); // with the price unreadable, the row's math can't be repaired
    setEdit(id, 'item1_amount', '1.00');
  });
  expect(screen.getByText("Doesn't add up")).toBeTruthy();
});

test('a blurry photo', async () => {
  await show('inv_0051_blur');
  // its chip opens the photo
  await press(button('Blurry photo (retake it), to check'));
  expect(header('Photo')).toBeOnTheScreen();
});

test('not found: the photo, the reason, three numbered lines, Choose a photo and Retake', async () => {
  const id = await show('blank_page', { source: 'gallery', label: 'Photo from gallery' });
  expect(header('Scan')).toBeOnTheScreen();
  expect(screen.getByText(`Photo from gallery · ${formatClock(getScan(id)!.at)}`)).toBeOnTheScreen();
  // no strip, no thumbnail, no ledger, no kind switch
  expect(screen.queryByTestId('status-strip')).toBeNull();
  expect(within(screen.getByTestId('header')).queryByRole('button', { name: 'Photo of the form' })).toBeNull();
  expect(screen.queryByRole('header', { name: 'Invoice' })).toBeNull();
  expect(screen.queryByRole('radiogroup')).toBeNull();

  // the photo itself, which opens the viewer
  const photo = screen.getByTestId('not-found-photo');
  expect(photo.props.source).toEqual({ uri: getScan(id)!.result.originalUri });
  expect(photo).toHaveProp('resizeMode', 'contain');
  expect(photo).toHaveStyle({ height: 240, backgroundColor: colors.crop });
  expect(header("Couldn't find the form")).toHaveStyle({ ...type.headline, color: colors.ink });
  expect(screen.getByText('Get the whole form in the photo, then retake it:')).toBeOnTheScreen();
  const lines = [
    'All 4 corner squares of a MyBizMate invoice',
    'The whole table of a Service Invoice',
    'The whole page of a BIR Form 2307',
  ];
  lines.forEach((line, i) => {
    expect(screen.getByText(line)).toBeOnTheScreen();
    expect(screen.getByText(String(i + 1))).toHaveStyle({ ...type.figure, color: colors.brandText });
  });
  expect(screen.getByText('Checked on this phone in 0.0\u00A0s. Nothing left the phone.')).toBeOnTheScreen();
  await openPhoto();
  expect(header('Photo')).toBeOnTheScreen();
  expect(screen.queryByText('Enhanced')).toBeNull(); // no page was found: only the photo
  await press(button('Close'));

  expect(barButtons()).toEqual(['Choose a photo', 'Retake']);
  await press(button('Choose a photo'));
  expect(mockLibrary).toHaveBeenCalledTimes(1);
  await press(button('Retake')); // a gallery photo: the in-app camera
  expect(mockRouter.dismissTo).toHaveBeenCalledWith('/camera');
  expect(screen.queryByText('Save')).toBeNull();
});

test('not found: a PDF chooses a PDF; Retake opens the camera, the camera app again, or goes back', async () => {
  // what the scanner read decides the words (the result's source); how the scan came in decides the picker
  await show('blank_page', {
    source: 'pdf',
    edit: (r) => Object.assign(r, { source: 'pdf', pageCount: 1, picture: false }),
  });
  expect(
    screen.getByText(
      "Page 1 of this PDF isn't a MyBizMate Sales Invoice, a Service Invoice or a BIR Form 2307. Import another PDF.",
    ),
  ).toBeTruthy();
  expect(screen.queryByText(/in the photo|retake it/i)).toBeNull();
  expect(barButtons()).toEqual(['Choose a PDF', 'Retake']);
  mockPick.mockResolvedValueOnce({ canceled: true, result: null });
  await press(button('Choose a PDF'));
  expect(mockPick).toHaveBeenCalledWith({ mimeTypes: ['application/pdf'] });
  await press(button('Retake'));
  expect(mockRouter.dismissTo).toHaveBeenLastCalledWith('/camera');

  // a photo keeps its words, whatever brought it in
  await show('blank_page', { source: 'pdf' });
  expect(screen.getByText('Get the whole form in the photo, then retake it:')).toBeTruthy();

  await show('blank_page', { source: 'camera_app' });
  await press(button('Retake'));
  expect(mockCameraApp).toHaveBeenCalledTimes(1);
  await show('blank_page', { source: 'gallery', from: 'list' });
  await press(button('Retake'));
  expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);

  // with nothing under it, the camera (ruling T6-2: the tabs are the Stack's anchor, so a fallback)
  mockNavigation.canGoBack.mockReturnValue(false);
  await show('blank_page', { source: 'gallery', from: 'list' });
  await press(button('Retake'));
  expect(mockRouter.replace).toHaveBeenLastCalledWith('/camera');
  expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
});

test('a saved scan: its subtitle, the saved line, Save changes, and ⋮ More options', async () => {
  const id = await showSaved('inv_0007');
  const day = savedDay(id);
  expect(screen.getByText(`Saved as a sale · ${day}`)).toHaveStyle(type.overline); // the header's subtitle
  // The date keeps its day on its line (QA pass 4, at 360 dp: "SAVED AS A 2307 · NOV" / "23"). RNTL's text match
  // counts a no-break space as a space, so the subtitle's own text pins it.
  expect(within(screen.getByTestId('header')).getByText(/^Saved as a sale · /).props.children).toBe(
    'Saved as a sale · Nov\u00A018',
  );
  const line = screen.getByText(`Saved as a sale · ${day} · Not exported yet`);
  expect(line).toHaveStyle({ ...type.label, color: colors.ink });
  expect(screen.getByTestId('saved-line')).toHaveStyle({ backgroundColor: colors.sand });
  expect(within(screen.getByTestId('screen-scroll')).getByTestId('saved-line')).toBeOnTheScreen();
  expect(screen.getByText('Look over the values')).toBeOnTheScreen(); // the strip, for a saved scan
  expect(barButtons()).toEqual(['Retake', 'Save changes']);
  expect(within(screen.getByTestId('header')).getByRole('button', { name: 'More options' })).toBeOnTheScreen();

  // exported since: the line says when
  await act(async () => markExported([id], new Date(2026, 10, 20, 9, 0)));
  expect(screen.getByText(`Saved as a sale · ${day} · Exported Nov\u00A020`)).toBeOnTheScreen();
});

test('a saved scan that changed says so and how to update the export', async () => {
  const id = await showSaved('inv_0007');
  await act(async () => setEdit(id, 'invoice_no', '0007999'));
  const line = screen.getByText(
    'Changed since it was saved. The export still has the saved version. Save changes to update it.',
  );
  expect(line).toHaveStyle({ ...type.label, color: colors.warning });
  expect(screen.getByTestId('saved-line')).toHaveStyle({ backgroundColor: colors.warningTint });
  expect(screen.getByText(`Saved as a sale · ${savedDay(id)}`)).toBeOnTheScreen(); // as it was saved
  expect(screen.getByText('Look over the values, then save the changes · you fixed 1 box')).toBeOnTheScreen();
  expect(screen.getByTestId('save-open')).toHaveTextContent('Save changes');
});

test('deleting from ⋮ goes back without flashing that the scan is gone', async () => {
  const id = addScan({ label: 'Camera photo', source: 'camera', result: parseScanResult(coreJson('inv_0007')) });
  await saveScan(id, DETAILS);
  mockParams = { id, from: 'list' };
  // Each commit, as React makes it: does the screen say the scan is gone, even for a frame?
  let watching = false;
  let flashes = 0;
  const onCommit = () => {
    if (watching && screen.queryByText(/no longer here/)) flashes += 1;
  };
  await render(
    <Profiler id="scan" onRender={onCommit}>
      <Result />
    </Profiler>,
  );
  watching = true;
  const day = savedDay(id);

  placeMenu();
  await press(button('More options'));
  await press(screen.getByRole('menuitem', { name: 'Delete saved scan' }));
  expect(alert).toHaveBeenCalledWith(
    'Delete this saved scan?',
    "It's removed from this phone. Files you already exported don't change.",
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: expect.any(Function) },
    ],
  );
  expect(savedSummary(id)).toBeDefined(); // nothing yet: Cancel keeps it

  await act(async () => alertButtons()[1].onPress!());
  expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
  expect(screen.queryByText(/no longer here/)).toBeNull();
  expect(flashes).toBe(0);
  // It's gone from the phone, and the screen shows only its header, as it was, while it goes.
  expect(savedSummary(id)).toBeUndefined();
  expect(getScan(id)).toBeUndefined();
  expect(header('MyBizMate Sales Invoice')).toBeOnTheScreen();
  expect(screen.getByText(`Saved as a sale · ${day}`)).toBeOnTheScreen();
  expect(screen.queryByTestId('status-strip')).toBeNull();
  expect(screen.queryByTestId('bottom-bar')).toBeNull();
});

test('deleting from ⋮ when the navigator lets go of the screen at once: still deleted, never shown gone', async () => {
  // react-native-screens animates a popped screen's native views out, so React may let go of it in the same render
  const id = addScan({ label: 'Camera photo', source: 'camera', result: parseScanResult(coreJson('inv_0007')) });
  await saveScan(id, DETAILS);
  mockParams = { id, from: 'list' };
  const navigator = { letGo: () => {} };
  function Stack() {
    const [shown, setShown] = useState(true);
    useEffect(() => {
      navigator.letGo = () => setShown(false);
    }, []);
    return shown ? <Result /> : null;
  }
  mockNavigation.goBack.mockImplementationOnce(() => navigator.letGo());
  let watching = false;
  let flashes = 0;
  await render(
    <Profiler id="stack" onRender={() => watching && screen.queryByText(/no longer here/) && (flashes += 1)}>
      <Stack />
    </Profiler>,
  );
  watching = true;
  placeMenu();
  await press(button('More options'));
  await press(screen.getByRole('menuitem', { name: 'Delete saved scan' }));
  await act(async () => alertButtons()[1].onPress!());
  expect(screen.queryByRole('header', { name: 'MyBizMate Sales Invoice' })).toBeNull(); // the screen has gone
  expect(flashes).toBe(0);
  expect(savedSummary(id)).toBeUndefined();
  expect(getScan(id)).toBeUndefined();
});

test('deleting from ⋮: a delete that fails says so, once the screen has gone back', async () => {
  // Saved's long press asks the same and says the same (ruling T19-2)
  const remove = jest.spyOn(savedStore, 'deleteSaved').mockRejectedValueOnce(new Error('EACCES: permission denied'));
  const id = await showSaved('inv_0007');
  placeMenu();
  await press(button('More options'));
  await press(screen.getByRole('menuitem', { name: 'Delete saved scan' }));
  await act(async () => alertButtons()[1].onPress!());
  // Review Focus 4's order: back, then the delete, in the same press
  expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
  expect(remove).toHaveBeenCalledTimes(1);
  expect(remove).toHaveBeenCalledWith(id);
  expect(mockNavigation.goBack.mock.invocationCallOrder[0]).toBeLessThan(remove.mock.invocationCallOrder[0]);
  expect(mockToast).toHaveBeenCalledTimes(1);
  expect(mockToast).toHaveBeenCalledWith("Couldn't delete the scan.");
  expect(savedSummary(id)).toBeDefined(); // still saved, so still in Saved
  remove.mockRestore();
});

test('deleting from ⋮ with nothing under the screen goes Home, in the same order (ruling T24-1)', async () => {
  // The Stack is anchored on the tabs (app/_layout), so the camera is the fallback, as for the header's Back
  mockNavigation.canGoBack.mockReturnValue(false);
  const remove = jest.spyOn(savedStore, 'deleteSaved');
  const id = await showSaved('inv_0007');
  placeMenu();
  await press(button('More options'));
  await press(screen.getByRole('menuitem', { name: 'Delete saved scan' }));
  await act(async () => alertButtons()[1].onPress!());
  expect(mockRouter.replace.mock.calls).toEqual([['/camera']]);
  expect(mockNavigation.goBack).not.toHaveBeenCalled();
  // Review Focus 4's order: it leaves, then deletes, in the same press
  expect(mockRouter.replace.mock.invocationCallOrder[0]).toBeLessThan(remove.mock.invocationCallOrder[0]);
  expect(savedSummary(id)).toBeUndefined();
  expect(screen.queryByText(/no longer here/)).toBeNull();
  remove.mockRestore();
});

test('a scan that is gone says so', async () => {
  mockParams = { id: 'gone-1' };
  await render(<Result />);
  expect(header('Scan')).toBeOnTheScreen();
  expect(screen.getByText('This scan is no longer here. Go back and read the photo again.')).toBeOnTheScreen();
});

test('from a read, TalkBack starts at the strip; opened from a list or a session, it stays put', async () => {
  await show('inv_0007');
  expect(focusedTestIDs()).toEqual([['status-strip', 'focus']]);
  focus.mockClear();
  await show('inv_0007', { from: 'list' });
  await show('inv_0007', { from: 'session' });
  await show('blank_page', { source: 'gallery' }); // no form, no strip
  expect(focus).not.toHaveBeenCalled();
});

test('a sheet gives TalkBack focus back to the row that opened it; a chip, to its row', async () => {
  const id = await show('inv_0007', { from: 'list' });
  await press(screen.getByTestId('row-terms'));
  expect(header('Terms')).toBeOnTheScreen();
  focus.mockClear();
  await press(button('Close'));
  expect(focusedTestIDs()).toEqual([['row-terms', 'focus']]);

  await act(async () => setEdit(id, 'date', '13/45/2026'));
  await press(button('Date, to check'));
  focus.mockClear();
  await press(button('Close'));
  expect(focusedTestIDs()).toEqual([['row-date', 'focus']]);
});

test('Save in a one-box sheet sends TalkBack focus to the strip, which says the new state', async () => {
  // Ruling T13-1: the sheet's own focus return, once it has gone, lands on the strip, not the row
  const id = await show('inv_0007', { from: 'list' });
  await press(screen.getByTestId('row-date'));
  focus.mockClear();
  await act(async () => fireEvent.changeText(screen.getByLabelText('What the box says'), '13/45/2026'));
  await press(screen.getByTestId('box-save'));
  expect(getScan(id)!.edits.date).toBe('13/45/2026');
  expect(header('1 to check')).toBeOnTheScreen();
  expect(focusedTestIDs().at(-1)).toEqual(['status-strip', 'focus']);
  expect(focusedTestIDs()).not.toContainEqual(['row-date', 'focus']);

  // Cancel saves nothing: focus goes back to the row
  await press(screen.getByTestId('row-date'));
  focus.mockClear();
  await press(button('Cancel'));
  expect(focusedTestIDs()).toEqual([['row-date', 'focus']]);

  // a row with several boxes: Save goes back to its list, on the box's row (ruling T13-2); closing the sheet gives
  // focus back to the ledger row that opened it
  await press(screen.getByTestId('row-total_due'));
  await press(screen.getByTestId('box-total_due'));
  focus.mockClear();
  await press(screen.getByTestId('box-save'));
  expect(focusedTestIDs()).toEqual([['box-total_due', 'focus']]);
  focus.mockClear();
  await press(button('Close'));
  expect(focusedTestIDs()).toEqual([['row-total_due', 'focus']]);
});

test('typing in a box survives the scan, the lists and the settings changing', async () => {
  // Review Focus 2, on the Scan screen itself, which re-renders the open sheet with each change
  const id = await show('inv_0007', { source: 'gallery' });
  await press(screen.getByTestId('row-date'));
  await act(async () => fireEvent.changeText(screen.getByLabelText('What the box says'), 'Oct 28'));
  await act(async () => {
    updateScan(id, { terms: 'cash' });
    await updateSettings({ atc: 'WC158' });
    await clearItems();
  });
  expect(screen.getByLabelText('What the box says').props.value).toBe('Oct 28');
  expect(header('Date')).toBeOnTheScreen();
  await press(button('Close')); // still unsaved: leaving asks
  expect(alert).toHaveBeenLastCalledWith('Discard what you typed?', undefined, expect.any(Array));
});

test('closing a save sheet gives TalkBack focus back to Save', async () => {
  /** The last view TalkBack focus went to, as its pressable's props. */
  const lastFocus = () => focus.mock.calls.at(-1);
  // an invoice's save sheet
  await show('inv_0007', { source: 'gallery', from: 'list' });
  await press(screen.getByTestId('save-open'));
  expect(header('Save as a sale')).toBeOnTheScreen();
  focus.mockClear();
  await press(button('Cancel'));
  expect(focus).toHaveBeenCalledTimes(1);
  expect(lastFocus()).toEqual([
    expect.objectContaining({ props: expect.objectContaining({ testID: 'save-open', accessibilityLabel: 'Save sale' }) }),
    'focus',
  ]);

  // a 2307's
  await show('bir2307_text_1', { source: 'pdf', from: 'list' });
  await press(screen.getByTestId('save-open'));
  expect(header('Save 2307')).toBeOnTheScreen();
  focus.mockClear();
  await press(button('Cancel'));
  expect(focus).toHaveBeenCalledTimes(1);
  expect(lastFocus()).toEqual([
    expect.objectContaining({ props: expect.objectContaining({ testID: 'save-open', accessibilityLabel: 'Save 2307' }) }),
    'focus',
  ]);

  // what Save opens first in annotation mode: the boxes not checked yet
  mockTeam = true;
  await act(async () => updateSettings({ annotation: true }));
  await show('inv_0007', { source: 'gallery', from: 'list' });
  await press(screen.getByTestId('save-open'));
  expect(header('Check every box first')).toBeOnTheScreen();
  focus.mockClear();
  await press(button('Close'));
  expect(focusedTestIDs()).toEqual([['save-open', 'focus']]);
});

test('Save opens its sheet once: a tap while it is open changes nothing', async () => {
  await show('inv_0007', { source: 'gallery' });
  await press(screen.getByTestId('save-open'));
  await act(async () => fireEvent.changeText(screen.getByLabelText('Revenue account'), '4020'));
  await press(screen.getByTestId('save-open'));
  expect(screen.getByLabelText('Revenue account').props.value).toBe('4020'); // the sheet wasn't opened again
});

test('a Service Invoice', async () => {
  await show('svc_0000');
  expect(header('Service Invoice')).toBeTruthy();
  expect(screen.getByText('Terms')).toBeTruthy();
  expect(screen.getByText('Cash sales')).toBeTruthy();
  expect(screen.getByText('Invoice no.')).toBeTruthy();
});

test('the footnote: the time, the box count, and the sample line', async () => {
  const timing = (r: ScanResult) => {
    r.timing = { alignMs: 57, cropMs: 10, readMs: 1200, totalMs: 1400 };
  };
  const footnote = () =>
    within(screen.getByTestId('footnote'))
      .getAllByText(/./)
      .map((line) => line.props.children);
  await show('inv_0007', { source: 'gallery', edit: timing });
  expect(footnote()).toEqual(['Read on this phone in 1.4\u00A0s. Nothing left the phone.', '45 boxes read.']);
  expect(screen.getByText('45 boxes read.')).toHaveStyle({ ...type.label, color: colors.mute });
  // team builds: the stages too
  mockTeam = true;
  await show('inv_0007', { source: 'gallery', edit: timing });
  expect(footnote()).toEqual([
    'Read on this phone in 1.4\u00A0s. Nothing left the phone.',
    'Straighten 57 ms, read 1.2 s.',
    '45 boxes read.',
  ]);

  // a sample: how it read against what's written on it
  mockTeam = false;
  await show('inv_0007', { source: 'sample', sampleId: 'inv_0007' });
  const truth: Record<string, string> = require('../assets/samples/inv_0007.json').truth;
  const reads = parseScanResult(coreJson('inv_0007')).reads;
  const written = Object.values(truth).filter((t) => t !== '').length;
  const exact = reads.filter((r) => truth[r.name] !== undefined && truth[r.name] !== '' && truth[r.name] === r.text).length;
  expect(footnote()).toEqual([
    'Read on this phone in 0.0\u00A0s. Nothing left the phone.',
    '45 boxes read.',
    `Sample invoice: ${exact} of ${written} boxes read exactly as written. Samples are made up, so they can't be saved.`,
  ]);
});

test("a PDF's footnote and its page count", async () => {
  // a text PDF: every box from its own text
  await show('sales_text_0', { source: 'pdf' });
  expect(screen.getByText('Read on this phone in 0.0\u00A0s. Nothing left the phone.')).toBeTruthy();
  expect(screen.getByText('8 boxes read.')).toBeTruthy();
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
  await press(screen.getByText('SI no.')); // a one-box row: its editor
  // where the crop would be: the PDF's own text, with no crop, and no reading line to say it again (ruling T13-3)
  const said = screen.getAllByText("From the PDF's text");
  expect(said).toHaveLength(1);
  expect(said[0]).toHaveStyle(type.overline);
  expect(screen.queryByText('What the camera saw')).toBeNull();
  expect(screen.queryByText(/^Read as /)).toBeNull();
  expect(screen.getByLabelText('What the box says').props.value).toBe('0000888');
  await press(screen.getByText('Cancel')); // a one-box sheet: Cancel closes it

  await press(screen.getByText('Date'));
  expect(screen.getByText('What the camera saw')).toBeTruthy();
  expect(screen.getByText('Read as “27 Sep 2026”')).toBeTruthy();
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
  expect(screen.getByText('Read on this phone in 0.0\u00A0s. Nothing left the phone.')).toBeTruthy();
  expect(screen.getByText('45 boxes read.')).toBeTruthy();
  expect(screen.queryByText(/PDF/)).toBeNull();
  await press(screen.getByText('SI no.'));
  expect(screen.getByText('Read as “0007655”')).toBeTruthy();
});

test('views', async () => {
  const r = parseScanResult(coreJson('inv_0007'));
  await show('inv_0007');
  expect(mockEnhance).not.toHaveBeenCalled(); // the viewer waits, mounted, until the photo is first opened
  await openPhoto();
  await waitFor(() => expect(mockEnhance).toHaveBeenCalledWith(r.pageUri, 'enhanced'));
  await waitFor(() => expect(screen.getByTestId('scan-image').props.source).toEqual({ uri: 'file:///x/enhanced.img' }));
  await press(screen.getByText('B&W'));
  await waitFor(() => expect(mockEnhance).toHaveBeenCalledWith(r.pageUri, 'bw'));
  await press(screen.getByText('Original'));
  expect(screen.getByTestId('scan-image').props.source).toEqual({ uri: r.originalUri });
  expect(screen.queryByText('Save to Pictures')).toBeNull();
});

test('save once', async () => {
  let finish: (name: string) => void = () => {};
  mockSave.mockImplementation(() => new Promise((resolve) => (finish = resolve)));
  await show('inv_0007');
  await openPhoto();
  await waitFor(() => expect(screen.getByTestId('scan-image').props.source).toEqual({ uri: 'file:///x/enhanced.img' }));
  // a fast double tap: inside one act() scope, React doesn't re-render the button as busy between the two presses
  await act(async () => {
    await fireEvent.press(screen.getByText('Save to Pictures'));
    await fireEvent.press(screen.getByText('Save to Pictures'));
  });
  expect(mockSave).toHaveBeenCalledTimes(1);
  await act(async () => finish('scan_1.jpg'));
  expect(mockToast).toHaveBeenCalledWith('Saved to Pictures › MyBizMate Scan');
});

test('save on Android 9', async () => {
  mockSave.mockRejectedValue(Object.assign(new Error('old'), { code: 'ERR_SAVE_NEEDS_ANDROID_10' }));
  await show('inv_0007');
  await openPhoto();
  await waitFor(() => expect(screen.getByTestId('scan-image').props.source).toEqual({ uri: 'file:///x/enhanced.img' }));
  await press(screen.getByText('Save to Pictures'));
  expect(mockToast).toHaveBeenCalledWith('Saving needs Android 10 or newer.');
});

test('full screen', async () => {
  await show('inv_0007');
  expect(screen.queryByTestId('photo-viewer')).toBeNull();
  await openPhoto();
  expect(screen.getByTestId('photo-viewer')).toBeTruthy();
  await press(button('Close'));
  expect(screen.queryByTestId('photo-viewer')).toBeNull();
});

test('retake', async () => {
  await show('inv_0007', { source: 'sample', sampleId: 'inv_0007' });
  await press(screen.getByText('Retake'));
  expect(mockNavigation.goBack).toHaveBeenCalled();

  await show('inv_0007', { source: 'gallery' });
  await press(screen.getByText('Retake'));
  expect(mockLibrary).toHaveBeenCalled();

  await show('inv_0007', { source: 'camera' });
  await press(screen.getByText('Retake'));
  expect(mockRouter.dismissTo).toHaveBeenCalledWith('/camera');

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
  expect(mockRelease).toHaveBeenCalledWith(uri); // the picker's lasting access to it, given up once read
});

test('Retake runs once, however fast it is tapped twice (ruling T25b-2)', async () => {
  // Going back queues a GO_BACK per call: a second would leave the screen under this one too, as the header's Back
  // and the camera's Close would without their guard. A fast double tap: inside one act() scope, nothing re-renders
  // between the two taps.
  const doubleTap = () =>
    act(async () => {
      await fireEvent.press(button('Retake'));
      await fireEvent.press(button('Retake'));
    });
  await show('inv_0007', { source: 'camera', from: 'list' }); // opened from a list: back
  await doubleTap();
  expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);

  await show('inv_0007', { source: 'sample', sampleId: 'inv_0007' }); // a sample: back too
  await doubleTap();
  expect(mockNavigation.goBack).toHaveBeenCalledTimes(2);

  mockNavigation.canGoBack.mockReturnValue(false); // with nothing under it: the camera, once
  await show('inv_0007', { source: 'gallery', from: 'list' });
  await doubleTap();
  expect(mockRouter.replace.mock.calls).toEqual([['/camera']]);

  // straight from the camera: down to the camera tab again, this screen gone, once
  mockRouter.replace.mockClear();
  await show('inv_0007', { source: 'camera' });
  await doubleTap();
  expect(mockRouter.dismissTo.mock.calls).toEqual([['/camera']]);
  expect(mockRouter.replace).not.toHaveBeenCalled();
  expect(mockNavigation.goBack).toHaveBeenCalledTimes(2);

  // the form not found in a gallery photo or a PDF: down to the camera tab, this screen gone, once too ([802]/[810])
  for (const source of ['gallery', 'pdf'] as const) {
    mockRouter.dismissTo.mockClear();
    await show('blank_page', { source });
    await doubleTap();
    expect(mockRouter.dismissTo.mock.calls).toEqual([['/camera']]);
  }
});

test('a retake shows the reading card for what it reads, and a read that fails says why in a dialog', async () => {
  // a PDF: the card says Reading the PDF while it reads; a refusal leaves this scan where it is
  await show('sales_text_0', { source: 'pdf' });
  const uri = 'content://com.android.providers.downloads.documents/document/msf%3A72';
  let refuse: (e: unknown) => void = () => {};
  mockPick.mockResolvedValueOnce({ canceled: false, result: { uri, name: 'msf:72', type: 'application/pdf' } });
  mockDisplayName.mockResolvedValueOnce('locked.pdf');
  mockReadPdf.mockImplementationOnce(() => new Promise((_, reject) => (refuse = reject)));
  await press(button('Retake'));
  expect(screen.getByText('Reading…')).toBeOnTheScreen();
  expect(screen.getByText('Reading the PDF')).toBeOnTheScreen();
  await act(async () => refuse(Object.assign(new Error('refused'), { code: 'pdf_password' })));
  expect(dialogWords(alert)).toEqual([['That PDF has a password.', 'Save a copy without one, then import it.']]);
  expect(screen.queryByText('Reading…')).toBeNull();
  expect(mockRouter.replace).not.toHaveBeenCalled();
  expect(mockToast).not.toHaveBeenCalled(); // a dialog, not the snackbar

  // a photo that can't be opened: today's words, in a dialog too
  alert.mockClear();
  await show('inv_0007', { source: 'gallery' });
  mockLibrary.mockRejectedValueOnce(new Error('the picker failed'));
  await press(button('Retake'));
  expect(dialogWords(alert)).toStrictEqual([["Couldn't open that photo."]]); // one sentence: a title alone
  expect(mockToast).not.toHaveBeenCalled();
});

// Spec §6.4 (the plan's calls 15 and 16): the Scan screen in a session, opened from its screen (from: 'session'), or
// from Done's one photo (no from). Each test takes its own session, so the scans other tests left don't join it.

let sessions = 0;
/** A new session's id, and a camera photo of a fixture in it, taken `minute` minutes past 9 on the pinned day. */
function newSession() {
  const id = `S${++sessions}`;
  const take = (stem: string, minute: number) =>
    addScan({
      label: 'Camera photo',
      source: 'camera',
      session: id,
      at: new Date(2026, 10, 18, 9, minute),
      result: parseScanResult(coreJson(stem)),
    });
  return { id, take };
}
/** Opens a scan's Scan screen in its session: from its screen, by default, or from Done's one photo ('done': no from). */
async function openIn(session: string, id: string, by: 'session' | 'done' = 'session') {
  mockParams = { id, from: by === 'done' ? undefined : by, session };
  await render(<Result />);
}
const doubleTap = (name: string, second = name) =>
  act(async () => {
    await fireEvent.press(button(name));
    await fireEvent.press(button(second));
  });

test('in a session, after a save, Next invoice replaces this screen with the next one', async () => {
  const s = newSession();
  const a = s.take('inv_0007', 0);
  s.take('blank_page', 1); // not found: Next invoice skips it
  const c = s.take('inv_0007', 2);
  await openIn(s.id, a);
  expect(barButtons()).toEqual(['Retake', 'Save sale']); // not saved yet: today's bar
  await act(async () => saveScan(a, DETAILS));
  expect(barButtons()).toEqual(['Retake', 'Next invoice']);
  await press(button('Next invoice'));
  expect(mockRouter.replace.mock.calls).toEqual([[{ pathname: '/result', params: { id: c, from: 'session', session: s.id } }]]);
  expect(mockRouter.push).not.toHaveBeenCalled();
  expect(mockRouter.dismissTo).not.toHaveBeenCalled();

  // any saved, unchanged scan in a session (ruling P-F17): from Done's one photo too
  mockRouter.replace.mockClear();
  await openIn(s.id, a, 'done');
  expect(barButtons()).toEqual(['Retake', 'Next invoice']);
  await press(button('Next invoice'));
  expect(mockRouter.replace.mock.calls).toEqual([[{ pathname: '/result', params: { id: c, from: 'session', session: s.id } }]]);

  // opened from a list, it's in no session: today's bar
  mockParams = { id: a, from: 'list' };
  await render(<Result />);
  expect(barButtons()).toEqual(['Retake', 'Save changes']);
});

test('the last one saved: Back to session', async () => {
  const s = newSession();
  const a = s.take('inv_0007', 0);
  const b = s.take('inv_0007', 1);
  await saveScan(a, DETAILS);
  await openIn(s.id, b);
  await act(async () => saveScan(b, DETAILS));
  expect(barButtons()).toEqual(['Retake', 'Back to session']);
  await press(button('Back to session'));
  // the session's screen in the Sessions tab, Sessions under it, this screen gone
  expect(mockRouter.dismissTo.mock.calls).toEqual([
    [{ pathname: '/sessions/[id]', params: { id: s.id } }, { withAnchor: true }],
  ]);
  expect(mockRouter.replace).not.toHaveBeenCalled();
  expect(mockRouter.navigate).not.toHaveBeenCalled();

  // saved, from its session's screen: Retake goes back to it
  await openIn(s.id, b);
  await press(button('Retake'));
  expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
});

test('a change after the save brings Save changes back', async () => {
  const s = newSession();
  const a = s.take('inv_0007', 0);
  s.take('inv_0007', 1);
  await openIn(s.id, a);
  await act(async () => saveScan(a, DETAILS));
  expect(barButtons()).toEqual(['Retake', 'Next invoice']);
  await act(async () => setEdit(a, 'invoice_no', '0007999'));
  expect(barButtons()).toEqual(['Retake', 'Save changes']);
  expect(screen.getByTestId('save-open')).toHaveTextContent('Save changes');
});

test('in a session, the not-found bar is Retake alone, and Retake opens the camera in the session, once', async () => {
  await loadSession(); // no camera session yet
  const relink = jest.spyOn(sessionStore, 'retakeIn');
  const s = newSession();
  const blank = s.take('blank_page', 0);
  await openIn(s.id, blank);
  expect(barButtons()).toEqual(['Retake']); // the gallery and the PDF are in the camera's tray
  await doubleTap('Retake');
  expect(mockRouter.dismissTo.mock.calls).toEqual([['/camera']]);
  expect(relink).toHaveBeenCalledTimes(1); // a refused tap re-links nothing
  expect(currentSession()).toMatchObject({ id: s.id, open: true, replaces: blank });
  expect(mockNavigation.goBack).not.toHaveBeenCalled();
  expect(mockLibrary).not.toHaveBeenCalled();

  // a PDF's too, and from Done's one photo
  mockRouter.dismissTo.mockClear();
  const pdf = await act(async () =>
    addScan({ label: 'PDF', source: 'pdf', session: s.id, result: parseScanResult(coreJson('blank_page')) }),
  );
  await openIn(s.id, pdf, 'done');
  expect(barButtons()).toEqual(['Retake']);
  await press(button('Retake'));
  expect(mockRouter.dismissTo.mock.calls).toEqual([['/camera']]);
  expect(currentSession()).toMatchObject({ id: s.id, replaces: pdf });
  expect(mockPick).not.toHaveBeenCalled();

  // an unsaved scan whose form was found, from a gallery photo: the camera in the session too, not the gallery
  mockRouter.dismissTo.mockClear();
  const found = await act(async () =>
    addScan({ label: 'Photo', source: 'gallery', session: s.id, result: parseScanResult(coreJson('inv_0007')) }),
  );
  await openIn(s.id, found);
  expect(barButtons()).toEqual(['Retake', 'Save sale']);
  await press(button('Retake'));
  expect(mockRouter.dismissTo.mock.calls).toEqual([['/camera']]);
  expect(currentSession()).toMatchObject({ id: s.id, replaces: found });
  expect(mockLibrary).not.toHaveBeenCalled();
  relink.mockRestore();
});

test('Next invoice and Back to session run once on a double tap', async () => {
  // Review Focus 5: inside one act() scope, nothing re-renders between the two taps
  const s = newSession();
  const a = s.take('inv_0007', 0);
  s.take('inv_0007', 1);
  await saveScan(a, DETAILS);
  await openIn(s.id, a);
  await doubleTap('Next invoice');
  expect(mockRouter.replace).toHaveBeenCalledTimes(1);

  const t = newSession();
  const only = await act(async () => t.take('inv_0007', 0));
  await act(async () => saveScan(only, DETAILS));
  await openIn(t.id, only, 'done');
  await doubleTap('Back to session');
  expect(mockRouter.dismissTo).toHaveBeenCalledTimes(1);

  // one guard for the screen (ruling T6-1): a Retake, then Next invoice, in one go, leaves it once
  mockRouter.replace.mockClear();
  await openIn(s.id, a);
  await doubleTap('Retake', 'Next invoice');
  expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
  expect(mockRouter.replace).not.toHaveBeenCalled();
});

test('⋮ deletes an unsaved scan from before the update, with no session (ruling P-F10)', async () => {
  // kept before camera first: no session id, so it opens straight to its Scan screen, and only ⋮ can delete it
  const id = addScan({ label: 'Photo from gallery', source: 'gallery', result: parseScanResult(coreJson('inv_0007')) });
  expect(getScan(id)!.session).toBeUndefined();
  mockParams = { id, from: 'list' };
  await render(<Result />);
  placeMenu();
  await press(button('More options'));
  expect(screen.queryByRole('menuitem', { name: 'Delete saved scan' })).toBeNull();
  await press(screen.getByRole('menuitem', { name: 'Delete this scan' }));
  expect(alert).toHaveBeenCalledWith('Delete this scan?', "It's removed from this phone.", [
    { text: 'Cancel', style: 'cancel', onPress: expect.any(Function) },
    { text: 'Delete', style: 'destructive', onPress: expect.any(Function) },
  ]);
  expect(getScan(id)).toBeDefined(); // nothing yet: Cancel keeps it
  await act(async () => alertButtons()[1].onPress!());
  expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
  expect(getScan(id)).toBeUndefined();
  // it goes back showing its header as it was, never that the scan is gone
  expect(header('MyBizMate Sales Invoice')).toBeOnTheScreen();
  expect(screen.queryByText(/no longer here/)).toBeNull();

  // a scan whose form wasn't found has ⋮ too
  await show('blank_page', { source: 'gallery' });
  expect(within(screen.getByTestId('header')).getByRole('button', { name: 'More options' })).toBeOnTheScreen();
});

test('in a session, after a save, TalkBack goes back to Next invoice, or Back to session for the last one', async () => {
  // the sheet gives focus back to what took Save's place in the bar (the review's T11-1)
  await act(async () => updateSettings({ vatRegistered: false, revenueAccount: '4010' }));
  const lastFocus = () => focus.mock.calls.at(-1);
  const saveInSheet = async () => {
    await press(screen.getByTestId('save-open'));
    focus.mockClear();
    await press(screen.getByTestId('save-confirm'));
    expect(screen.queryByTestId('sheet-panel')).toBeNull();
  };
  const s = newSession();
  const a = s.take('inv_0007', 0);
  const b = s.take('inv_0007', 1);
  await openIn(s.id, a);
  await saveInSheet();
  expect(barButtons()).toEqual(['Retake', 'Next invoice']);
  expect(lastFocus()).toEqual([
    expect.objectContaining({ props: expect.objectContaining({ accessibilityLabel: 'Next invoice' }) }),
    'focus',
  ]);

  await openIn(s.id, b);
  await saveInSheet();
  expect(barButtons()).toEqual(['Retake', 'Back to session']);
  expect(lastFocus()).toEqual([
    expect.objectContaining({ props: expect.objectContaining({ accessibilityLabel: 'Back to session' }) }),
    'focus',
  ]);
  await act(async () => updateSettings({ vatRegistered: null, revenueAccount: '' }));
});

test("a saved scan in a session, from Done's one photo: Retake follows its source, and links no camera", async () => {
  // only an unsaved scan's Retake opens the camera in its session (lib/scanFlow); a saved one keeps today's by source
  await loadSession();
  const relink = jest.spyOn(sessionStore, 'retakeIn');
  const s = newSession();
  const photo = s.take('inv_0007', 0); // from the in-app camera
  await saveScan(photo, DETAILS);
  await openIn(s.id, photo, 'done');
  expect(barButtons()).toEqual(['Retake', 'Back to session']);
  await press(button('Retake'));
  expect(mockRouter.dismissTo.mock.calls).toEqual([['/camera']]);
  expect(mockNavigation.goBack).not.toHaveBeenCalled();

  const picked = await act(async () =>
    addScan({ label: 'Photo', source: 'gallery', session: s.id, result: parseScanResult(coreJson('inv_0007')) }),
  );
  await act(async () => saveScan(picked, DETAILS));
  await openIn(s.id, picked, 'done');
  await press(button('Retake'));
  expect(mockLibrary).toHaveBeenCalledTimes(1); // the gallery again, not the camera
  expect(mockRouter.dismissTo).toHaveBeenCalledTimes(1);

  expect(relink).not.toHaveBeenCalled();
  expect(currentSession()).toBeNull();
  relink.mockRestore();
});

test('⋮ Delete waits for a press that is opening another screen, as every open on the screen does', async () => {
  // one guard for the screen (ruling T6-1; the review's T11-3): Next invoice has gone, so a delete asks nothing
  const s = newSession();
  const a = s.take('inv_0007', 0);
  s.take('inv_0007', 1);
  await saveScan(a, DETAILS);
  await openIn(s.id, a);
  await press(button('Next invoice')); // the navigator hasn't let go of this screen yet
  expect(mockRouter.replace).toHaveBeenCalledTimes(1);
  placeMenu();
  await press(button('More options'));
  await press(screen.getByRole('menuitem', { name: 'Delete saved scan' }));
  expect(alert).not.toHaveBeenCalled();
  expect(savedSummary(a)).toBeDefined();

  // with nothing opening, it asks, and Delete goes back once
  await openIn(s.id, a);
  placeMenu();
  await press(button('More options'));
  await press(screen.getByRole('menuitem', { name: 'Delete saved scan' }));
  expect(alert).toHaveBeenCalledTimes(1);
  await act(async () => alertButtons()[1].onPress!());
  expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
  expect(savedSummary(a)).toBeUndefined();
});
