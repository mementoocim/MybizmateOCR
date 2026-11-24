import { act, fireEvent, render, screen, within } from '@testing-library/react-native';

import SessionsScreen from '../app/(tabs)/sessions/index';
import { amount, formatClock, monthDay } from '../lib/format';
import { clearItems, clearParties, lists } from '../lib/lists';
import { saleOf } from '../lib/sale';
import { type InvoiceSummary, loadSaved, markExported, saveScan } from '../lib/saved';
import { addScan, forgetScan, getScan, recentScans, type ScanSource, updateScan } from '../lib/scans';
import { settings, updateSettings } from '../lib/settings';
import { colors, type } from '../lib/theme';
import { parseScanResult } from '../modules/scanner/src/parse';
import { coreJson } from '../test-utils/coreJson';
import { memoryFs } from '../test-utils/memoryFs';
import { focusAgain } from '../test-utils/screenFocus';
import { pinToday } from '../test-utils/today';

// Spec §6.6 and the plan's call 11: Sessions, the tab. A row per session, newest first under day headers, with at most
// two badges; a scan with no session id (one from before this update, a saved one past the newest 100, a sample) is a
// session of its own under today's label, and opens its Scan screen (Review Focus 2). The search finds scans by party,
// number or TIN. Every press opens one screen, however fast it's tapped (Review Focus 5, ruling T6-1). The data is made
// up.

const mockPush = jest.fn();
const mockToast = jest.fn();

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({}),
  // Sessions is a tab (lib/navigation: going back, and whether a screen is in the tabs)
  useNavigation: () => ({
    canGoBack: () => false,
    goBack: jest.fn(),
    getState: () => ({ type: 'tab' }),
    getParent: () => undefined,
  }),
  useRouter: () => ({ push: mockPush, dismissTo: jest.fn(), navigate: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  // a screen's pushes run once until it's focused again (lib/navigation)
  useFocusEffect: (effect: () => void) => require('../test-utils/screenFocus').useFocusEffect(effect),
  useIsFocused: () => true,
}));
jest.mock('../lib/toast', () => ({ toast: (...args: unknown[]) => mockToast(...args) }));
jest.mock('expo-file-system', () => require('../test-utils/memoryFs').memoryFs.module);

const TODAY = new Date(2026, 10, 24, 10, 0); // Tuesday, Nov 24, 2026, 10:00 AM
const at = (day: number, h: number, m: number) => new Date(2026, 10, day, h, m);
const DETAILS = { taxType: 'VAT', account: '4010', terms: 'account', atc: 'WC158' } as const;

/** A fixture's scan, kept as of when it was taken, in the session given, if any (none: one from before this update). */
function scan(
  stem: string,
  opts: { session?: string; at?: Date; source?: ScanSource; label?: string; edits?: Record<string, string> } = {},
): string {
  const id = addScan({
    label: opts.label ?? 'Camera photo',
    source: opts.source ?? 'camera',
    result: parseScanResult(coreJson(stem)),
    session: opts.session,
    at: opts.at,
  });
  if (opts.edits) updateScan(id, { edits: opts.edits });
  return id;
}

/** A saved scan no longer among the recent ones (past the newest 100): saved, then gone from recent.json. */
async function savedOnly(id: string) {
  await saveScan(id, DETAILS);
  forgetScan(id);
}

/** A saved sale as saved.json keeps it, with no session and no scan.json: one whose folder has gone. */
function summary(when: Date, extra: Partial<InvoiceSummary> = {}): InvoiceSummary {
  return {
    id: `${when.getTime()}-1`,
    kind: 'sale',
    label: 'Camera photo',
    partyName: 'Castillo Eatery',
    partyId: null,
    date: '2026-11-20',
    gross: 1234.5,
    row: { 'SI/OR No.': '0042', 'Gross *': 1234.5 },
    listed: true,
    savedAt: when.toISOString(),
    exportedAt: null,
    ...extra,
  };
}

async function savedJsonHas(list: readonly InvoiceSummary[]) {
  memoryFs.files.set('file:///docs/saved.json', JSON.stringify(list));
  await act(async () => loadSaved());
}

type Instance = ReturnType<typeof screen.getByText>;
const press = (el: Instance) => act(async () => fireEvent.press(el));
const button = (name: string | RegExp) => screen.getByRole('button', { name });
/** The list, top to bottom: each day's header and each row, as TalkBack says them. */
const listed = (testID = 'sessions-list') =>
  screen
    .getByTestId(testID)
    .queryAll((n) => n.props.accessibilityRole === 'header' || n.props.accessibilityRole === 'button')
    .map((n) => n.props.accessibilityLabel ?? n.props.children);
const results = () => listed('sessions-results');
/** A row's spoken label that starts so: its badge is its scan's state, which lib/sessions' own tests cover. */
const startingWith = (start: string) => ({
  asymmetricMatch: (label: unknown) => typeof label === 'string' && label.startsWith(start),
  toString: () => `a label starting with "${start}"`,
});
const opened = () => mockPush.mock.calls.map(([href]) => href);
/** The search field: its label, Search, is spoken (TalkBack's name for it), not shown. */
const searchField = () => {
  const field = screen.getByTestId('sessions-search');
  expect(field.props.accessibilityLabel).toBe('Search');
  return field;
};

async function showSessions() {
  await render(<SessionsScreen />);
}

beforeAll(() => pinToday(TODAY));
afterAll(() => jest.useRealTimers());

beforeEach(async () => {
  jest.clearAllMocks();
  memoryFs.reset();
  recentScans().forEach((s) => forgetScan(s.id));
  await loadSaved(); // nothing saved
  await updateSettings({ annotation: false });
  await clearParties('customer');
  await clearParties('supplier');
  await clearItems();
});

test("Sessions: rows by day, newest first, 9:41 AM · 3 invoices, with at most two badges", async () => {
  // today, 9:41: two checked and unsaved, one whose form wasn't found, one saved: two badges, the saved one in none
  scan('inv_0007', { session: 'S1', at: at(24, 9, 41) });
  scan('inv_0051', { session: 'S1', at: at(24, 9, 42) });
  scan('blank_page', { session: 'S1', at: at(24, 9, 43) });
  const savedInS1 = scan('inv_0007', { session: 'S1', at: at(24, 9, 44) });
  await act(async () => saveScan(savedInS1, DETAILS));
  // today, 9:50: every scan saved
  await act(async () => saveScan(scan('inv_0007', { session: 'S2', at: at(24, 9, 50) }), DETAILS));
  // yesterday: a PDF
  scan('sales_text_0', { session: 'S3', at: at(23, 16, 10), source: 'pdf', label: 'PDF: sales.pdf' });
  // Nov 20: every scan exported
  const out = scan('inv_0007', { session: 'S4', at: at(20, 14, 15) });
  await act(async () => saveScan(out, DETAILS));
  await act(async () => markExported([out], TODAY));
  await showSessions();

  expect(screen.getByRole('header', { name: 'Sessions' })).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Back' })).toBeNull(); // a tab
  expect(button('Search')).toBeOnTheScreen();
  expect(listed()).toEqual([
    'Today',
    `${formatClock(at(24, 9, 50))} · 1 invoice, All saved`,
    `${formatClock(at(24, 9, 41))} · 4 invoices, 2 to check, 1 retake`,
    'Yesterday',
    `${formatClock(at(23, 16, 10))} · 1 PDF, 1 to check`,
    monthDay('2026-11-20'),
    `${formatClock(at(20, 14, 15))} · 1 invoice, Exported`,
  ]);
  expect(formatClock(at(24, 9, 41))).toBe('9:41 AM');
  // the badges sit side by side in the row, in their tones; the row has its chevron
  const row = button(/^9:41 AM · 4 invoices/);
  expect(within(row).getByText('2 to check', { includeHiddenElements: true })).toHaveStyle({ color: colors.warning });
  expect(within(row).getByText('1 retake', { includeHiddenElements: true })).toHaveStyle({ color: colors.warning });
  expect(row.queryAll((n) => n.props.stroke === colors.chevron)).toHaveLength(1);
  expect(within(button(/^9:50 AM/)).getByText('All saved', { includeHiddenElements: true })).toHaveStyle({
    color: colors.success,
  });
  expect(screen.getByText('Today')).toHaveStyle({ ...type.overline, color: colors.mute });
});

test('a row opens its session; a scan from before opens its Scan screen', async () => {
  // Review Focus 2: a scan kept before camera first, a saved one past the newest 100, and one whose folder has gone
  scan('inv_0007', { session: 'S1', at: at(24, 9, 41) });
  const old = scan('inv_0051', { at: at(20, 14, 15) });
  const past = scan('inv_0007', { at: at(19, 8, 0) });
  await act(async () => savedOnly(past));
  expect(getScan(past)).toBeUndefined();
  const gone = summary(at(18, 11, 30), { partyName: 'Gone Store' });
  const kept = JSON.parse(memoryFs.files.get('file:///docs/saved.json') as string);
  await savedJsonHas([...kept, gone]);
  await showSessions();

  await press(button(/^9:41 AM · 1 invoice/));
  expect(opened()).toEqual([{ pathname: '/sessions/[id]', params: { id: 'S1' } }]);
  await act(async () => focusAgain()); // back on Sessions

  await press(button(/^Camera photo 2:15 PM/));
  expect(opened().at(-1)).toEqual({ pathname: '/result', params: { id: old, from: 'list' } });
  await act(async () => focusAgain());

  // a saved scan past the newest 100: read back from its scan.json first, so the Scan screen finds it
  await press(button(`Camera photo ${formatClock(TODAY)}, Saved`));
  expect(opened().at(-1)).toEqual({ pathname: '/result', params: { id: past, from: 'list' } });
  expect(getScan(past)?.id).toBe(past);
  await act(async () => focusAgain());

  // its folder gone: it says so, and opens nothing
  await press(button(/^Camera photo 11:30 AM/));
  expect(mockToast).toHaveBeenCalledWith("Couldn't open that scan.");
  expect(mockPush).toHaveBeenCalledTimes(3);
});

test('scans from before and the samples are sessions of their own, labelled as today', async () => {
  // Review Focus 2: no session id, as recent.json gives one back from before this update; two at the same time
  scan('inv_0007', { at: at(20, 14, 15) });
  scan('blank_page', { at: at(20, 14, 15) });
  scan('sales_text_0', { at: at(20, 9, 5), source: 'pdf', label: 'PDF: sales.pdf' });
  scan('inv_0051', { at: at(24, 9, 0), source: 'sample', label: 'Sample 0051' });
  // a saved scan past the newest 100, with no session: at its id's time
  await savedJsonHas([summary(at(21, 16, 10))]);
  await showSessions();

  expect(listed()).toEqual([
    'Today',
    'Sample 0051 9:00 AM, Sample', // a sample counts nowhere, but still shows and opens
    monthDay('2026-11-21'),
    'Camera photo 4:10 PM, Saved',
    monthDay('2026-11-20'),
    'Camera photo 2:15 PM, Retake', // a form not found reads Retake
    'Camera photo 2:15 PM, Checks passed',
    'sales.pdf 9:05 AM, 2 to check',
  ]);
});

test('the search finds scans by party, number or TIN, and lists them; a result opens its Scan screen', async () => {
  const torres = scan('inv_0007', {
    session: 'S1',
    at: at(24, 9, 41),
    edits: { customer_name: 'Torres Construction Supply', invoice_no: '0000186', customer_tin: '900-000-003' },
  });
  const bautista = scan('inv_0007', {
    session: 'S1',
    at: at(24, 9, 45),
    edits: { customer_name: 'Bautista Pharmacy', invoice_no: '0000201', customer_tin: '900-000-004' },
  });
  await savedJsonHas([summary(at(20, 14, 15))]); // a saved scan alone: its party and number, no TIN
  await showSessions();
  const gross = (id: string) => amount(saleOf(getScan(id)!, lists(), settings()).gross);

  await press(button('Search'));
  expect(searchField().props.autoFocus).toBe(true);
  expect(searchField().props.placeholder).toBe('Name, number or TIN');
  expect(screen.queryByRole('button', { name: 'Search' })).toBeNull();
  expect(button('Close search')).toBeOnTheScreen();
  // nothing typed yet: the sessions stay
  expect(listed()).toEqual([
    'Today',
    '9:41 AM · 2 invoices, 2 to check',
    monthDay('2026-11-20'),
    'Camera photo 2:15 PM, Saved',
  ]);

  // by party, folded
  await act(async () => fireEvent.changeText(searchField(), 'torres'));
  expect(results()).toEqual([startingWith(`Torres Construction Supply, Sale · SI 0000186, ${gross(torres)}, `)]);
  // by number
  await act(async () => fireEvent.changeText(searchField(), '0000201'));
  expect(results()).toEqual([startingWith(`Bautista Pharmacy, Sale · SI 0000201, ${gross(bautista)}, `)]);
  // by TIN, without its dashes; two found, newest first
  await act(async () => fireEvent.changeText(searchField(), '900000'));
  expect(results().map((r: string) => r.split(',')[0])).toEqual(['Bautista Pharmacy', 'Torres Construction Supply']);
  // a saved scan alone: Saved's sub-line, its amount and its badge
  await act(async () => fireEvent.changeText(searchField(), 'castillo'));
  expect(results()).toEqual([`Castillo Eatery, Sale · ${monthDay('2026-11-20')} · SI 0042, 1,234.50, Saved`]);
  await act(async () => fireEvent.changeText(searchField(), '0042'));
  expect(results()).toHaveLength(1);

  // a result opens its Scan screen
  await act(async () => fireEvent.changeText(searchField(), 'torres'));
  await press(button(/^Torres Construction Supply, /));
  expect(opened()).toEqual([{ pathname: '/result', params: { id: torres, from: 'list' } }]);

  // none found
  await act(async () => fireEvent.changeText(searchField(), 'nothing here'));
  expect(screen.getByText('No scan matches “nothing here”')).toBeOnTheScreen();

  // Close search: the field goes, and with it what was typed
  await press(button('Close search'));
  expect(screen.queryByTestId('sessions-search')).toBeNull();
  expect(button('Search')).toBeOnTheScreen();
  expect(listed()).toHaveLength(4);
  await press(button('Search'));
  expect(searchField().props.value).toBe('');
});

test('empty: Nothing scanned yet', async () => {
  await showSessions();
  expect(screen.getByText('Nothing scanned yet')).toHaveStyle({ ...type.title, color: colors.ink });
  expect(screen.getByText('Take a photo with the round button. Each run of photos shows up here.')).toHaveStyle({
    ...type.body,
    color: colors.mute,
  });
  expect(listed()).toEqual([]);
});

test('a row opens once on a double tap', async () => {
  // Review Focus 5, ruling T6-1: one guard for every press, so two taps, or two rows tapped at once, open one screen
  scan('inv_0007', { session: 'S1', at: at(24, 9, 41) });
  const old = scan('inv_0051', { at: at(20, 14, 15), edits: { customer_name: 'Torres Construction Supply' } });
  const past = scan('inv_0007', { at: at(19, 8, 0) });
  await act(async () => savedOnly(past));
  await showSessions();
  const session = () => button(/^9:41 AM · 1 invoice/);
  const before = () => button(/^Camera photo 2:15 PM/);
  const pastRow = () => button(`Camera photo ${formatClock(TODAY)}, Saved`);

  // inside one act() scope, nothing re-renders between the taps
  await act(async () => {
    await fireEvent.press(session());
    await fireEvent.press(session());
  });
  expect(opened()).toEqual([{ pathname: '/sessions/[id]', params: { id: 'S1' } }]);
  await act(async () => focusAgain());

  // a session, then a scan from before
  mockPush.mockClear();
  await act(async () => {
    await fireEvent.press(session());
    await fireEvent.press(before());
  });
  expect(opened()).toEqual([{ pathname: '/sessions/[id]', params: { id: 'S1' } }]);
  await act(async () => focusAgain());

  // a scan from before, then a session
  mockPush.mockClear();
  await act(async () => {
    await fireEvent.press(before());
    await fireEvent.press(session());
  });
  expect(opened()).toEqual([{ pathname: '/result', params: { id: old, from: 'list' } }]);
  await act(async () => focusAgain());

  // a saved scan read back first: twice, once
  mockPush.mockClear();
  await act(async () => {
    await fireEvent.press(pastRow());
    await fireEvent.press(pastRow());
  });
  expect(opened()).toEqual([{ pathname: '/result', params: { id: past, from: 'list' } }]);
  await act(async () => focusAgain());

  // a search result too
  mockPush.mockClear();
  await press(button('Search'));
  await act(async () => fireEvent.changeText(searchField(), 'torres'));
  await act(async () => {
    await fireEvent.press(button(/^Torres Construction Supply, /));
    await fireEvent.press(button(/^Torres Construction Supply, /));
  });
  expect(opened()).toEqual([{ pathname: '/result', params: { id: old, from: 'list' } }]);
});
