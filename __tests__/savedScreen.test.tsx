import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import { AccessibilityInfo, Alert, type AlertButton, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import SavedScreen from '../app/saved';
import { type IconComponent, Share } from '../components/icons';
import { SnackbarHost } from '../components/Snackbar';
import * as exportFile from '../lib/exportFile';
import { addParty, clearParties, markPartiesExported, type Party } from '../lib/lists';
import * as savedStore from '../lib/saved';
import {
  type CertSummary,
  type InvoiceSummary,
  loadSaved,
  markExported,
  type SavedSummary,
  saveScan,
  savedSummary,
} from '../lib/saved';
import { addScan, type InvoiceKind } from '../lib/scans';
import { currentSnack, dismissSnack, type SnackAction } from '../lib/snackbar';
import { colors, space, touch, type } from '../lib/theme';
import { parseScanResult } from '../modules/scanner/src/parse';
import { coreJson } from '../test-utils/coreJson';
import { memoryFs } from '../test-utils/memoryFs';
import { focusAgain } from '../test-utils/screenFocus';
import { typeStylesOf } from '../test-utils/typeStyles';

// Design B §9.7: Saved. Its header says how many wait to export; chips filter it by kind, starting at the kind Home
// (or a save's View) opened it for; the list goes by the month of each document's date, newest first, a row per saved
// scan with its party, kind, date and number, its amount, and whether it's exported. A row opens its scan, and a long
// press asks to delete it. One Export… opens the export at the filtered kind, or at its list of files. The export
// itself is __tests__/exportSheet.test.tsx's.

let mockParams: { kind?: string } = {};
const mockPush = jest.fn();
const mockToast = jest.fn();

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useNavigation: () => ({ canGoBack: () => true, goBack: jest.fn() }), // going back (lib/navigation)
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
  // a screen's pushes run once until it's focused again (lib/navigation)
  useFocusEffect: (effect: () => void) => require('../test-utils/screenFocus').useFocusEffect(effect),
  useIsFocused: () => true,
}));
// Ruling P8: the toast's arguments go through as given, so a message without an action is checked by its words alone.
jest.mock('../lib/toast', () => ({ toast: (...args: unknown[]) => mockToast(...args) }));
jest.mock('expo-sharing', () => ({ shareAsync: async () => undefined, isAvailableAsync: async () => true }));
jest.mock('expo-file-system', () => require('../test-utils/memoryFs').memoryFs.module);

/** The real toast, which raises the snackbar: a test that looks at where a message shows lets the calls through. */
const { toast: actualToast } = jest.requireActual<{ toast: (message: string, action?: SnackAction) => void }>(
  '../lib/toast',
);

const EXPORTED = '2026-11-21T02:00:00.000Z';
/** 60 characters (Review Focus 5). */
const LONG_NAME = 'Isabela Prime Builders and General Merchandise Trading Corp.';
const DELETE_TITLE = 'Delete this saved scan?';
const DELETE_BODY = "It's removed from this phone. Files you already exported don't change.";

let saves = 0;
/** A saved sale or purchase as saved.json keeps it, saved on its own date unless it says otherwise. */
function invoice(kind: InvoiceKind, date: string, extra: Partial<InvoiceSummary> = {}): InvoiceSummary {
  return {
    id: `saved-${++saves}`,
    kind,
    label: 'Camera photo',
    partyName: 'Torres Construction Supply',
    partyId: null,
    date,
    gross: 100,
    row: { 'Date *': date, 'Gross *': 100 },
    listed: true,
    savedAt: `${date}T09:00:00.000Z`,
    exportedAt: null,
    ...extra,
  };
}

/** A saved 2307 as saved.json keeps it: its period, and its period's last day as its date. */
function cert(period: string, date: string, extra: Partial<CertSummary> = {}): CertSummary {
  return {
    id: `saved-${++saves}`,
    kind: '2307',
    label: 'PDF: bir2307.pdf',
    partyName: 'Castillo Eatery',
    partyId: null,
    date,
    period,
    tax: 1000,
    rows: [],
    listed: true,
    savedAt: `${date}T09:00:00.000Z`,
    exportedAt: null,
    ...extra,
  };
}

/** The saved scans, as if saved.json held these when the app started. */
async function savedAre(list: readonly SavedSummary[]) {
  memoryFs.files.set('file:///docs/saved.json', JSON.stringify(list));
  await act(async () => loadSaved());
}

/** Saved with these saved scans, opened for a kind (Home's To export row, a save's View) or for all of them. */
async function showSaved(list: readonly SavedSummary[], kind?: string, ui: ReactElement = <SavedScreen />) {
  await savedAre(list);
  mockParams = kind === undefined ? {} : { kind };
  await render(ui);
}

/** The navigation bar's inset, in dp, where a test gives one (Insets). */
const BOTTOM = 34;
function Insets({ children }: { children?: ReactNode }) {
  return (
    <SafeAreaProvider
      initialMetrics={{ frame: { x: 0, y: 0, width: 360, height: 800 }, insets: { top: 24, bottom: BOTTOM, left: 0, right: 0 } }}>
      {children}
    </SafeAreaProvider>
  );
}

type Instance = ReturnType<typeof screen.getByText>;
const press = (el: Instance) => act(async () => fireEvent.press(el));
const longPress = (el: Instance) => act(async () => fireEvent(el, 'longPress'));
const button = (name: string | RegExp) => screen.getByRole('button', { name });
const header = (name: string) => screen.getByRole('header', { name });
const radio = (name: string) => screen.getByRole('radio', { name });
/** The header's texts: the title, and the line under it. */
const headerTexts = () =>
  within(screen.getByTestId('header'))
    .queryAllByText(/./)
    .map((t) => t.props.children);
/** The filter's chips, in order, as TalkBack says them. */
const chips = () =>
  within(screen.getByRole('radiogroup', { name: 'Show' }))
    .getAllByRole('radio')
    .map((chip) => chip.props.accessibilityLabel);
/** The list, top to bottom: each month's strip and each row, as TalkBack says them. */
const listed = () =>
  screen
    .getByTestId('saved-list')
    .queryAll((n) => n.props.accessibilityRole === 'header' || n.props.accessibilityRole === 'button')
    .map((n) => n.props.accessibilityLabel ?? n.props.children);
/** Just the rows. */
const rows = () => listed().filter((entry) => / · /.test(entry));
/** The bottom bar's buttons, in order. */
const barButtons = () =>
  within(screen.getByTestId('bottom-bar'))
    .getAllByRole('button')
    .map((b) => b.props.accessibilityLabel);
/** The export's list of files, as TalkBack says each row. */
const files = () =>
  within(screen.getByTestId('sheet-scroll'))
    .getAllByRole('button')
    .map((b) => b.props.accessibilityLabel);
const sheet = () => within(screen.getByTestId('sheet-panel'));
/** The icons under a node drawn in a color. */
const iconsIn = (node: Instance, color: string) => node.queryAll((n) => n.props.stroke === color);
/** A glyph as drawn on its own, to compare with the one a component draws. */
async function drawingOf(Icon: IconComponent, color: string) {
  await render(<Icon size={touch.iconSmall} color={color} />);
  return screen.root!.toJSON();
}
/** The space under the list's last row. */
const endPadding = () => StyleSheet.flatten(screen.getByTestId('saved-list').props.contentContainerStyle);
/** Android reports a view's layout: its height, in dp. */
const layout = (testID: string, height: number) =>
  fireEvent(screen.getByTestId(testID), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 360, height } } });
const focus = jest.mocked(AccessibilityInfo.sendAccessibilityEvent);
/** What TalkBack focus went to: the view's testID. */
const focusedTestIDs = () =>
  focus.mock.calls.map(([view, event]) => [(view as { props?: { testID?: string } }).props?.testID, event]);

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
  mockParams = {};
  await loadSaved(); // nothing saved
  await clearParties('customer');
  await clearParties('supplier');
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const left = currentSnack(); // a message a test left up, with no host now to take it down
  if (left) dismissSnack(left.id);
});

afterEach(() => {
  jest.restoreAllMocks(); // Alert, and a test's spy on the delete
  mockToast.mockReset(); // and its real toast
});

/** A customer added from a scan: not in MyBizMate yet, so the export lists the parties' file. */
const addFromScan = (name: string) =>
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
/** A customer imported from MyBizMate: it has its code there, so it never goes out in the parties' file. */
const IMPORTED_CUSTOMER = {
  code: 'C001',
  type: 'customer',
  entity: 'company',
  registeredName: 'Torres Construction Supply',
  lastName: '',
  firstName: '',
  middleName: '',
  tradeName: '',
  tin: '',
  address: '',
  vatStatus: '',
  terms: '',
  fromScan: false,
} as const;

test('Saved: its title and how many wait to export', async () => {
  const sale = invoice('sale', '2026-11-20');
  const form = cert('Q4 2026', '2026-12-31');
  await showSaved([sale, invoice('purchase', '2026-11-18', { exportedAt: EXPORTED }), form]);
  expect(header('Saved')).toBeOnTheScreen();
  expect(within(screen.getByTestId('header')).getByRole('button', { name: 'Back' })).toBeOnTheScreen();
  // under the title, in the overline style: how many the export counts as not exported yet (ruling T17-3)
  expect(headerTexts()).toEqual(['Saved', '2 to export']);
  expect(within(screen.getByTestId('header')).getByText('2 to export')).toHaveStyle({ ...type.overline, color: colors.mute });

  // it follows the store: one exported, then the other
  await act(async () => markExported([sale.id], new Date(EXPORTED)));
  expect(headerTexts()).toEqual(['Saved', '1 to export']);
  await act(async () => markExported([form.id], new Date(EXPORTED)));
  expect(headerTexts()).toEqual(['Saved', 'All exported']);
  expect(within(screen.getByTestId('header')).getByText('All exported')).toHaveStyle(type.overline);
});

test("filters with counts; a kind with nothing is hidden; Home's kind comes preselected", async () => {
  const list = [
    invoice('sale', '2026-11-20', { partyName: 'Store A' }),
    invoice('sale', '2026-11-05', { partyName: 'Store B' }),
    cert('Q4 2026', '2026-12-31'),
  ];
  await showSaved(list);
  // one radio group, named for TalkBack only; nothing saved as a purchase, so no Purchases chip
  expect(chips()).toEqual(['All 3', 'Sales 2', '2307s 1']);
  expect(screen.queryByText('Show')).toBeNull();
  expect(screen.getByRole('radio', { name: 'All 3', checked: true })).toBeOnTheScreen();
  expect(rows()).toEqual([
    'Castillo Eatery, 2307 · Q4 2026, 1,000.00, To export',
    'Store A, Sale · Nov\u00A020, 100.00, To export',
    'Store B, Sale · Nov\u00A05, 100.00, To export',
  ]);

  // a chip shows its kind alone
  await press(radio('Sales 2'));
  expect(screen.getByRole('radio', { name: 'Sales 2', checked: true })).toBeOnTheScreen();
  expect(rows()).toEqual([
    'Store A, Sale · Nov\u00A020, 100.00, To export',
    'Store B, Sale · Nov\u00A05, 100.00, To export',
  ]);
  await press(radio('2307s 1'));
  expect(rows()).toEqual(['Castillo Eatery, 2307 · Q4 2026, 1,000.00, To export']);
  await press(radio('All 3'));
  expect(rows()).toHaveLength(3);

  // a purchase saved since: its chip, counted, in its place
  await savedAre([...list, invoice('purchase', '2026-11-18', { partyName: 'Juan Hardware' })]);
  expect(chips()).toEqual(['All 4', 'Sales 2', 'Purchases 1', '2307s 1']);

  // opened for a kind (Home's To export row, a save's View): that kind, chosen
  for (const [kind, chip, shown] of [
    ['sale', 'Sales 2', 2],
    ['purchase', 'Purchases 1', 1],
    ['2307', '2307s 1', 1],
  ] as const) {
    await screen.unmount();
    mockParams = { kind };
    await render(<SavedScreen />);
    expect(screen.getByRole('radio', { name: chip, checked: true })).toBeOnTheScreen();
    expect(rows()).toHaveLength(shown);
  }
  // any other kind: All
  await screen.unmount();
  mockParams = { kind: 'parties' };
  await render(<SavedScreen />);
  expect(screen.getByRole('radio', { name: 'All 4', checked: true })).toBeOnTheScreen();
});

test("grouped by the month of the document's date: a Q1 2307 sits under March 2026", async () => {
  await showSaved([
    // dated before Store B and C, but saved after them both: a month lists by the date, newest first, not by the save
    invoice('sale', '2026-11-05', { partyName: 'Store A', savedAt: '2026-11-21T10:00:00.000Z' }),
    invoice('sale', '2026-11-20', { partyName: 'Store B', savedAt: '2026-11-20T09:00:00.000Z' }),
    invoice('purchase', '2026-11-20', { partyName: 'Store C', savedAt: '2026-11-21T09:00:00.000Z' }),
    invoice('purchase', '2026-10-02', { partyName: 'Store D', savedAt: '2026-11-22T09:00:00.000Z' }),
    // saved last of all, in November, but its period ended in March: the month the export's This month counts it in
    cert('Q1 2026', '2026-03-31', { savedAt: '2026-11-23T09:00:00.000Z' }),
  ]);
  expect(listed()).toEqual([
    'November 2026',
    'Store C, Purchase · Nov\u00A020, 100.00, To export', // the same date: the one saved later comes first
    'Store B, Sale · Nov\u00A020, 100.00, To export',
    'Store A, Sale · Nov\u00A05, 100.00, To export',
    'October 2026',
    'Store D, Purchase · Oct\u00A02, 100.00, To export',
    'March 2026',
    'Castillo Eatery, 2307 · Q1 2026, 1,000.00, To export',
  ]);
  // each month is a section strip, a header for TalkBack
  expect(header('March 2026')).toHaveStyle({ ...type.overline, color: colors.mute });
  expect(header('March 2026').parent).toHaveStyle({ backgroundColor: colors.sand });

  // a filter keeps the months of what it shows
  await press(radio('Purchases 2'));
  expect(listed()).toEqual([
    'November 2026',
    'Store C, Purchase · Nov\u00A020, 100.00, To export',
    'October 2026',
    'Store D, Purchase · Oct\u00A02, 100.00, To export',
  ]);
});

test("a date that can't be read is a dash, in its month's strip and in the row", async () => {
  // A scan with no date can't be saved (saveBlock); a saved.json that holds one anyway still reads, as prettyDate's
  // '—' had it: an empty date, and one with no such month.
  await showSaved([
    invoice('sale', '2026-11-20', { partyName: 'Store A' }),
    invoice('sale', '', { partyName: 'Store B' }),
    invoice('purchase', '2026-13-05', { partyName: 'Store C' }),
  ]);
  expect(listed()).toEqual([
    '—',
    'Store C, Purchase · —, 100.00, To export',
    'November 2026',
    'Store A, Sale · Nov\u00A020, 100.00, To export',
    '—',
    'Store B, Sale · —, 100.00, To export',
  ]);
});

test("a row is To export by its scan's id, whatever object the export's rule hands back", async () => {
  // lib/exportFile's waitingOf decides what waits; here it answers with copies of the saved scans
  const rule = exportFile.waitingOf;
  jest.spyOn(exportFile, 'waitingOf').mockImplementation((kind, list) => rule(kind, list).map((s) => ({ ...s })));
  await showSaved([
    invoice('sale', '2026-11-20', { partyName: 'Store A' }),
    invoice('sale', '2026-11-18', { partyName: 'Store B', exportedAt: EXPORTED }),
  ]);
  expect(headerTexts()).toEqual(['Saved', '1 to export']);
  expect(rows()).toEqual([
    'Store A, Sale · Nov\u00A020, 100.00, To export',
    'Store B, Sale · Nov\u00A018, 100.00, Exported',
  ]);
});

test('a row: the party, kind · date · number, the amount and its badge', async () => {
  await showSaved([
    invoice('sale', '2026-11-22', {
      gross: 24377,
      row: { 'Date *': '2026-11-22', 'Gross *': 24377, 'SI/OR No.': '5184138' },
    }),
    invoice('purchase', '2026-11-18', {
      partyName: 'Juan Hardware',
      gross: 1500.5,
      row: { 'Date *': '2026-11-18', 'Gross *': 1500.5, 'Inv No.': '0007' },
      exportedAt: EXPORTED,
    }),
    invoice('sale', '2026-11-10', { partyName: '', gross: 7.5 }), // no party yet: its label; no number
    invoice('sale', '2026-11-08', { partyName: LONG_NAME, gross: 12345678.9 }),
    cert('Q4 2026', '2026-12-31', { tax: 57400.54 }),
  ]);
  // one stop for TalkBack: the party, the sub-line, the amount and the badge (ruling T4-4)
  expect(rows()).toEqual([
    'Castillo Eatery, 2307 · Q4 2026, 57,400.54, To export', // a 2307: its quarter, and the tax withheld
    'Torres Construction Supply, Sale · Nov\u00A022 · SI 5184138, 24,377.00, To export',
    'Juan Hardware, Purchase · Nov\u00A018 · Inv 0007, 1,500.50, Exported',
    'Camera photo, Sale · Nov\u00A010, 7.50, To export',
    `${LONG_NAME}, Sale · Nov\u00A08, 12,345,678.90, To export`,
  ]);

  const sale = button(/^Torres Construction Supply, /);
  expect(within(sale).getByText('Torres Construction Supply')).toHaveStyle({ ...type.value, color: colors.ink });
  expect(typeStylesOf(within(sale).getByText('Torres Construction Supply'))).toEqual(['value']); // not button
  // the sub-line in mono, in caps by the style ("SALE · NOV 22 · SI 5184138"); TalkBack hears the words
  const sub = within(sale).getByText('Sale · Nov\u00A022 · SI 5184138');
  expect(typeStylesOf(sub)).toEqual(['figureSmall']); // a label of the same size flattens alike here
  expect(sub).toHaveStyle({ ...type.figureSmall, color: colors.mute, textTransform: 'uppercase' });
  // the amount in figures, without the peso sign
  expect(typeStylesOf(within(sale).getByText('24,377.00'))).toEqual(['figure']);
  // the badge under it: To export in brand, not a stop of its own
  expect(within(sale).queryByText('To export')).toBeNull();
  const toExport = within(sale).getByText('To export', { includeHiddenElements: true });
  expect(toExport).toHaveStyle({ ...type.badge, color: colors.brandText });
  expect(toExport.parent).toHaveStyle({ backgroundColor: colors.brandTint });
  // Exported in neutral
  const exported = within(button(/^Juan Hardware, /)).getByText('Exported', { includeHiddenElements: true });
  expect(exported).toHaveStyle({ ...type.badge, color: colors.mute });
  expect(exported.parent).toHaveStyle({ backgroundColor: colors.sand });

  // Review Focus 5: a 60-character party and ₱12,345,678.90 show in full
  expect(LONG_NAME).toHaveLength(60);
  for (const text of [screen.getByText(LONG_NAME), screen.getByText('12,345,678.90')]) {
    expect(text.props.numberOfLines).toBeUndefined();
    expect(text.props.ellipsizeMode).toBeUndefined();
  }
});

test('as the app saves them: a sale with its SI number, and a 2307 with its payor and tax withheld', async () => {
  // inv_0007 (Sep 20, 2026, ₱24,377.00, SI 0007655, its customer as written) and bir2307_text_1 (Q4 2026, ₱57,400.54
  // withheld, its payor not in the customers), saved as the Scan screen saves them
  const sale = addScan({ label: 'Camera photo', source: 'camera', result: parseScanResult(coreJson('inv_0007')) });
  await saveScan(sale, { taxType: 'VAT', account: '4010', terms: 'cash', atc: '' });
  const form = addScan({ label: 'PDF: bir2307_text_1.pdf', source: 'pdf', result: parseScanResult(coreJson('bir2307_text_1')) });
  await saveScan(form, { account: '1205' });
  await render(<SavedScreen />);
  expect(listed()).toEqual([
    'December 2026',
    'Castillo Eatery, 2307 · Q4 2026, 57,400.54, To export',
    'September 2026',
    'TorresConstruction Supply, Sale · Sep\u00A020 · SI 0007655, 24,377.00, To export',
  ]);
});

test('a row opens its scan, once however fast it is tapped twice; one that has gone says so', async () => {
  const scan = {
    id: 'a',
    label: 'Camera photo',
    source: 'camera',
    at: '2026-10-05T01:00:00.000Z',
    result: parseScanResult(coreJson('inv_0007')),
    edits: {},
    terms: null,
    kind: 'sale',
    party: null,
    saved: { savedAt: '2026-10-05T01:00:00.000Z', details: { taxType: 'VAT', account: '4010', terms: 'cash', atc: '' } },
  };
  memoryFs.files.set('file:///docs/saved/a/scan.json', JSON.stringify(scan));
  await showSaved([
    invoice('sale', '2026-10-05', { id: 'a', partyName: 'Store A' }),
    invoice('sale', '2026-10-06', { id: 'b', partyName: 'Store B' }),
  ]);
  // A fast double tap: inside one act() scope, nothing re-renders between the two taps (final review, Minor 4).
  await act(async () => {
    await fireEvent.press(button(/^Store A, /));
    await fireEvent.press(button(/^Store A, /));
  });
  expect(mockPush.mock.calls).toEqual([[{ pathname: '/result', params: { id: 'a', from: 'saved' } }]]);
  await act(async () => focusAgain()); // back on Saved
  await press(button(/^Store B, /));
  expect(mockPush).toHaveBeenCalledTimes(1);
  // a scan, as Saved holds 2307s too (ruling T19-3)
  expect(mockToast).toHaveBeenCalledWith("Couldn't open that scan.");
});

test('a long press asks to delete, in the new words', async () => {
  const [a, b] = [invoice('sale', '2026-11-20', { partyName: 'Store A' }), cert('Q4 2026', '2026-12-31')];
  await showSaved([a, b, invoice('sale', '2026-11-05', { partyName: 'Store C' })]);
  expect(button(/^Store A, /).props.accessibilityHint).toBe('Long-press to delete');

  // §9.5's confirmation, the one the Scan screen's ⋮ asks with
  await longPress(button(/^Store A, /));
  expect(alertSpy).toHaveBeenCalledWith(DELETE_TITLE, DELETE_BODY, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: expect.any(Function) },
  ]);
  await answer('Cancel');
  expect(savedSummary(a.id)).toBeDefined();
  expect(rows()).toHaveLength(3);

  await longPress(button(/^Store A, /));
  await answer('Delete');
  expect(savedSummary(a.id)).toBeUndefined();
  expect(screen.queryByText('Store A')).toBeNull();
  expect(chips()).toEqual(['All 2', 'Sales 1', '2307s 1']);
  expect(headerTexts()).toEqual(['Saved', '2 to export']);
  expect(mockToast).not.toHaveBeenCalled();

  // a delete that fails says so, and the row stays (ruling T19-2)
  jest.spyOn(savedStore, 'deleteSaved').mockRejectedValueOnce(new Error('EACCES: permission denied'));
  await longPress(button(/^Castillo Eatery, /));
  await answer('Delete');
  expect(mockToast).toHaveBeenCalledTimes(1);
  expect(mockToast).toHaveBeenCalledWith("Couldn't delete the scan.");
  expect(button(/^Castillo Eatery, /)).toBeOnTheScreen();
  expect(savedSummary(b.id)).toBeDefined();
});

test('Export… opens the export at the filtered kind, or at the list of files', async () => {
  const shareIcon = await drawingOf(Share, colors.ink);
  await addFromScan('Bagong Tindahan'); // its file is in the list of files too
  await showSaved([invoice('sale', '2026-11-20'), cert('Q4 2026', '2026-12-31')]);
  // one primary in the bottom bar, with the share icon, in place of today's export buttons
  expect(barButtons()).toEqual(['Export…']);
  expect(iconsIn(button('Export…'), colors.ink).map((icon) => icon.toJSON())).toEqual([shareIcon]);
  for (const gone of ['Export sales', 'Export purchases', 'Export 2307s', 'Export new customers and suppliers']) {
    expect(screen.queryByRole('button', { name: gone })).toBeNull();
  }

  // All: the list of files, the parties' among them
  await press(button('Export…'));
  expect(header('Export')).toBeOnTheScreen();
  expect(sheet().queryByRole('button', { name: 'Back' })).toBeNull();
  expect(files()).toEqual(['Sales, 1 to export', '2307s, 1 to export', 'New customers and suppliers, 1 to export']);
  // closing it gives TalkBack focus back to Export… (design §7)
  focus.mockClear();
  await press(sheet().getByRole('button', { name: 'Close' }));
  expect(screen.queryByTestId('sheet-panel')).toBeNull();
  expect(focusedTestIDs()).toEqual([['export-open', 'focus']]);

  // filtered to a kind: straight at its file, with Back to the list of files
  await press(radio('2307s 1'));
  await press(button('Export…'));
  expect(header('Export 2307s')).toBeOnTheScreen();
  await press(sheet().getByRole('button', { name: 'Back' }));
  expect(header('Export')).toBeOnTheScreen();
  await press(sheet().getByRole('button', { name: 'Close' }));
  await press(radio('Sales 1'));
  await press(button('Export…'));
  expect(header('Export sales')).toBeOnTheScreen();
  expect(sheet().getByLabelText('Sales, 1 · ₱100.00')).toBeOnTheScreen();
  focus.mockClear();
  await press(within(screen.getByTestId('sheet-actions')).getByRole('button', { name: 'Close' }));
  expect(focusedTestIDs()).toEqual([['export-open', 'focus']]);

  // each opening starts afresh: All again opens at the list of files
  await press(radio('All 2'));
  await press(button('Export…'));
  expect(header('Export')).toBeOnTheScreen();
});

test('Export… for a kind with nothing saved opens the list of files, not its empty file', async () => {
  // ruling T19-6: the chosen kind's chip stays at 0 (T19-4), but its file would hold nothing, a dead end
  await showSaved([invoice('sale', '2026-11-20', { partyName: 'Store A' }), cert('Q4 2026', '2026-12-31')], 'purchase');
  expect(screen.getByRole('radio', { name: 'Purchases 0', checked: true })).toBeOnTheScreen();
  await press(button('Export…'));
  expect(header('Export')).toBeOnTheScreen();
  expect(sheet().queryByRole('button', { name: 'Back' })).toBeNull();
  expect(files()).toEqual(['Sales, 1 to export', '2307s, 1 to export']);
  await press(sheet().getByRole('button', { name: 'Close' }));

  // a kind with one opens at its file; once its last is deleted while it's chosen, at the list of files
  await press(radio('2307s 1'));
  await press(button('Export…'));
  expect(header('Export 2307s')).toBeOnTheScreen();
  await press(within(screen.getByTestId('sheet-actions')).getByRole('button', { name: 'Close' }));
  await longPress(button(/^Castillo Eatery, /));
  await answer('Delete');
  expect(screen.getByRole('radio', { name: '2307s 0', checked: true })).toBeOnTheScreen();
  await press(button('Export…'));
  expect(header('Export')).toBeOnTheScreen();
  expect(files()).toEqual(['Sales, 1 to export']);
});

test('Export… shows when anything is saved, or when parties added from scans can go out', async () => {
  // nothing saved, and no party from a scan: nothing to export, so no bar, and the list's end clears the inset itself
  await savedAre([]);
  await render(<SavedScreen />, { wrapper: Insets });
  expect(screen.queryByTestId('bottom-bar')).toBeNull();
  expect(endPadding()).toMatchObject({ paddingBottom: BOTTOM + space.xl });

  // a party imported from MyBizMate (its code, not from a scan) is in MyBizMate already: still nothing to export
  await act(async () => {
    await addParty(IMPORTED_CUSTOMER);
  });
  expect(screen.queryByTestId('bottom-bar')).toBeNull();
  expect(screen.getByText('Nothing saved yet')).toBeOnTheScreen();

  // a party added from a scan, with nothing saved: its file needs no saved scan (ruling T19-7; Saved's parties button
  // had it so at 398a886). The empty state stays, and Export… opens the list of files, with the parties' file in it.
  let party!: Party;
  await act(async () => {
    party = await addFromScan('Bagong Tindahan');
  });
  expect(screen.getByText('Nothing saved yet')).toBeOnTheScreen();
  expect(headerTexts()).toEqual(['Saved']); // no scan waits
  expect(barButtons()).toEqual(['Export…']);
  // ruling T19-8: the empty state's Take photo stays the screen's one primary (§5.1); Export… is the side path
  expect(button('Take photo')).toHaveStyle({ backgroundColor: colors.brand });
  expect(button('Export…')).toHaveStyle({ backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.outline });
  expect(endPadding()).toMatchObject({ paddingBottom: space.xl }); // the bar takes the inset now
  await press(button('Export…'));
  expect(header('Export')).toBeOnTheScreen();
  expect(files()).toEqual(['New customers and suppliers, 1 to export']);
  await press(button(/^New customers and suppliers, /));
  expect(header('Export new customers and suppliers')).toBeOnTheScreen();
  await press(within(screen.getByTestId('sheet-actions')).getByRole('button', { name: 'Close' }));

  // gone out, it can still go again, as the list of files keeps it (the parties row's own condition): the bar stays
  await act(async () => markPartiesExported([party.id], new Date(EXPORTED)));
  expect(barButtons()).toEqual(['Export…']);
  await press(button('Export…'));
  expect(files()).toEqual(['New customers and suppliers, All exported']);
  await press(sheet().getByRole('button', { name: 'Close' }));

  // opened for a kind with nothing saved at all: the list of files too (ruling T19-6)
  await screen.unmount();
  mockParams = { kind: 'sale' };
  await render(<SavedScreen />);
  await press(button('Export…'));
  expect(header('Export')).toBeOnTheScreen();
  expect(files()).toEqual(['New customers and suppliers, All exported']);
  await press(sheet().getByRole('button', { name: 'Close' }));

  // no party from a scan left: no bar again, until a scan is saved
  await act(async () => clearParties('customer'));
  expect(screen.queryByTestId('bottom-bar')).toBeNull();
  await savedAre([invoice('sale', '2026-11-20')]);
  expect(barButtons()).toEqual(['Export…']);
  expect(button('Export…')).toHaveStyle({ backgroundColor: colors.brand }); // with a scan saved, the one primary
});

test('a message on Saved sits above its bottom bar', async () => {
  // The Task 8 clearance: Saved's bar is the newest one, so the root host's message clears it, not the inset alone.
  mockToast.mockImplementation(actualToast);
  const sale = invoice('sale', '2026-11-20', { partyName: 'Store A' });
  await savedAre([sale]);
  await render(
    <>
      <SavedScreen />
      <SnackbarHost />
    </>,
    { wrapper: Insets },
  );
  await layout('bottom-bar', 80); // its height takes in the 34 dp inset it pads by

  // the export's message, said once its sheet has gone: over Saved, above Export…
  await press(button('Export…'));
  await press(button(/^Sales, /));
  await press(button('Share the file'));
  await press(button('Mark 1 as exported'));
  expect(savedSummary(sale.id)!.exportedAt).not.toBeNull();
  expect(screen.queryByTestId('sheet-panel')).toBeNull();
  expect(within(screen.getByTestId('snackbar')).getByText('Marked 1 sale as exported.')).toBeOnTheScreen();
  expect(screen.getByTestId('snackbar')).toHaveStyle({ bottom: 80 + space.s });

  // and one Saved says itself: a scan that has gone
  await press(button(/^Store A, /));
  expect(within(screen.getByTestId('snackbar')).getByText("Couldn't open that scan.")).toBeOnTheScreen();
  expect(screen.getByTestId('snackbar')).toHaveStyle({ bottom: 80 + space.s });
});

test('nothing saved: the empty state with Take photo', async () => {
  await showSaved([]);
  // the title alone: nothing to export
  expect(headerTexts()).toEqual(['Saved']);
  expect(screen.getByText('Nothing saved yet')).toHaveStyle({ ...type.title, color: colors.ink });
  expect(screen.getByText('Save a scan and it shows up here, ready to export.')).toHaveStyle({
    ...type.body,
    color: colors.mute,
  });
  // nothing to filter, list or export
  expect(screen.queryByRole('radiogroup')).toBeNull();
  expect(screen.queryByTestId('bottom-bar')).toBeNull();
  await press(button('Take photo'));
  expect(mockPush).toHaveBeenCalledWith('/camera');

  // the last one deleted: the same
  await screen.unmount();
  await showSaved([invoice('sale', '2026-11-20', { partyName: 'Store A' })]);
  await longPress(button(/^Store A, /));
  await answer('Delete');
  expect(screen.getByText('Nothing saved yet')).toBeOnTheScreen();
  expect(headerTexts()).toEqual(['Saved']);
  expect(screen.queryByTestId('bottom-bar')).toBeNull();

  // opened for a kind with nothing saved at all: the same, with no chips (a chosen kind's chip is the filter's)
  await screen.unmount();
  await showSaved([], 'purchase');
  expect(screen.getByText('Nothing saved yet')).toBeOnTheScreen();
  expect(screen.queryByText('No purchases saved')).toBeNull();
  expect(screen.queryByRole('radiogroup')).toBeNull();
});

test('a filter with nothing: No purchases saved', async () => {
  // opened for purchases with none saved: the chosen kind keeps its chip, checked, at 0 (ruling T19-4), so the group
  // always has a chip chosen beside "No purchases saved"
  await showSaved([invoice('sale', '2026-11-20', { partyName: 'Store A' }), cert('Q4 2026', '2026-12-31')], 'purchase');
  expect(screen.getByText('No purchases saved')).toHaveStyle({ ...type.title, color: colors.ink });
  expect(screen.queryByText('Nothing saved yet')).toBeNull();
  expect(chips()).toEqual(['All 2', 'Sales 1', 'Purchases 0', '2307s 1']);
  expect(screen.getAllByRole('radio', { checked: true }).map((chip) => chip.props.accessibilityLabel)).toEqual([
    'Purchases 0',
  ]);
  expect(rows()).toEqual([]);
  expect(barButtons()).toEqual(['Export…']); // the others can still go
  // another chip chosen: the empty kind's chip goes, as any kind with nothing saved does
  await press(radio('All 2'));
  expect(screen.queryByText('No purchases saved')).toBeNull();
  expect(chips()).toEqual(['All 2', 'Sales 1', '2307s 1']);
  expect(rows()).toHaveLength(2);

  // the last of the chosen kind deleted: its own words, and its chip stays, checked, at 0, until another is picked
  await press(radio('2307s 1'));
  await longPress(button(/^Castillo Eatery, /));
  await answer('Delete');
  expect(screen.getByText('No 2307s saved')).toBeOnTheScreen();
  expect(chips()).toEqual(['All 1', 'Sales 1', '2307s 0']);
  expect(screen.getAllByRole('radio', { checked: true }).map((chip) => chip.props.accessibilityLabel)).toEqual([
    '2307s 0',
  ]);
  await press(radio('Sales 1'));
  expect(chips()).toEqual(['All 1', 'Sales 1']);
  expect(rows()).toEqual(['Store A, Sale · Nov\u00A020, 100.00, To export']);
});
