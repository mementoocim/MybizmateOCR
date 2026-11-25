import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { Alert, type AlertButton } from 'react-native';

import SessionScreen from '../app/(tabs)/sessions/[id]';
import { confirmDeleteScan } from '../lib/confirmDelete';
import { certOf, taxWithheld } from '../lib/cert';
import { amount, formatClock } from '../lib/format';
import { clearItems, clearParties, lists } from '../lib/lists';
import { SCANNER_STOPPED, UNREADABLE_PHOTO } from '../lib/readFailures';
import { saleOf } from '../lib/sale';
import * as savedStore from '../lib/saved';
import { loadSaved, saveScan, savedSummary } from '../lib/saved';
import * as scansStore from '../lib/scans';
import { addScan, forgetScan, getScan, recentScans, type ScanSource, type StoredScan, updateScan } from '../lib/scans';
import { addFailedRead, clearFailedRead, currentSession, endSession, loadSession, retakeIn } from '../lib/session';
import { savedSub } from '../lib/sessions';
import { settings, updateSettings } from '../lib/settings';
import { colors, type } from '../lib/theme';
import { parseScanResult } from '../modules/scanner/src/parse';
import { coreJson } from '../test-utils/coreJson';
import { memoryFs } from '../test-utils/memoryFs';
import { focusAgain } from '../test-utils/screenFocus';
import { pinToday } from '../test-utils/today';

// Spec §6.4 and the plan's calls 2, 3, 9 and 10: a session's screen. Its header, a card that counts what's left with
// Check the next one, the reads that failed while it's the camera's session, then a row per scan, oldest first; a scan
// whose form wasn't found offers Retake and Remove, and a long press asks to delete. Every press runs once, however fast
// it's tapped (Review Focus 5, ruling T6-1). One mounted screen shows one session, then another (ruling T7-6's
// dangerouslySingular), with nothing carried over. The data is made up.

const mockPush = jest.fn();
const mockNavigate = jest.fn();
const mockToast = jest.fn();
const mockParams: { id: string } = { id: 'S1' };
let mockFocused = true;

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  // the session screen is in the Sessions tab's own Stack, so in the tabs (lib/navigation)
  useNavigation: () => ({
    canGoBack: () => true,
    goBack: jest.fn(),
    getState: () => ({ type: 'stack' }),
    getParent: () => ({ getState: () => ({ type: 'tab' }), getParent: () => undefined }),
    isFocused: () => mockFocused,
  }),
  useRouter: () => ({ push: mockPush, dismissTo: jest.fn(), navigate: mockNavigate, back: jest.fn(), replace: jest.fn() }),
  useFocusEffect: (effect: () => void) => require('../test-utils/screenFocus').useFocusEffect(effect),
  useIsFocused: () => true,
}));
jest.mock('../lib/toast', () => ({ toast: (...args: unknown[]) => mockToast(...args) }));
jest.mock('expo-file-system', () => require('../test-utils/memoryFs').memoryFs.module);

const TODAY = new Date(2026, 10, 24, 10, 0); // Tuesday, Nov 24, 2026, 10:00 AM
const at = (h: number, m: number) => new Date(2026, 10, 24, h, m);
const DETAILS = { taxType: 'VAT', account: '4010', terms: 'account', atc: 'WC158' } as const;

function scan(
  stem: string,
  opts: { session?: string; at?: Date; source?: ScanSource; label?: string; edits?: Record<string, string> } = {},
): string {
  const id = addScan({
    label: opts.label ?? 'Camera photo',
    source: opts.source ?? 'camera',
    result: parseScanResult(coreJson(stem)),
    session: opts.session ?? 'S1',
    at: opts.at,
  });
  if (opts.edits) updateScan(id, { edits: opts.edits });
  return id;
}

/** A session as the camera has it, with reads that failed: the current one, ended by Done (call 2). */
function failedReadsIn(id: string, reasons: readonly [Date, string][]) {
  retakeIn(id, 'none', reasons[0]?.[0] ?? TODAY); // the camera's session, as Done leaves it
  for (const [when, reason] of reasons) addFailedRead(id, reason, when);
  endSession(id);
}

type Instance = ReturnType<typeof screen.getByText>;
const press = (el: Instance) => act(async () => fireEvent.press(el));
const button = (name: string | RegExp) => screen.getByRole('button', { name });
const opened = () => mockPush.mock.calls.map(([href]) => href);
/** The scans' rows, top to bottom, as TalkBack says them. */
const rows = () => screen.queryAllByTestId(/^row-/).map((n) => n.props.accessibilityLabel);
const startingWith = (start: string) => ({
  asymmetricMatch: (label: unknown) => typeof label === 'string' && label.startsWith(start),
  toString: () => `a label starting with "${start}"`,
});

let alert: jest.SpyInstance;
/** The last dialog's title and message. */
const dialog = () => alert.mock.calls.at(-1)?.slice(0, 2);
/** Presses a button of the last dialog. */
const choose = (text: string) =>
  act(async () => {
    const buttons: AlertButton[] = alert.mock.calls.at(-1)[2];
    buttons.find((b) => b.text === text)!.onPress!();
  });

async function showSession(id = 'S1') {
  mockParams.id = id;
  await render(<SessionScreen />);
}

beforeAll(() => pinToday(TODAY));
afterAll(() => jest.useRealTimers());
afterEach(() => jest.restoreAllMocks());

beforeEach(async () => {
  jest.clearAllMocks();
  mockFocused = true;
  memoryFs.reset();
  recentScans().forEach((s) => forgetScan(s.id));
  await loadSaved();
  await loadSession(); // no current session
  await updateSettings({ annotation: false });
  await clearParties('customer');
  await clearParties('supplier');
  await clearItems();
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

test('the header: Today, 9:41 AM, and Session · 3 invoices', async () => {
  scan('inv_0007', { at: at(9, 41) });
  scan('inv_0051', { at: at(9, 42) });
  scan('blank_page', { at: at(9, 43) });
  scan('inv_0007', { session: 'S2', at: at(9, 50) }); // another session's
  await showSession();

  expect(screen.getByRole('header', { name: 'Today, 9:41 AM' })).toBeOnTheScreen();
  expect(screen.getByText('Session · 3 invoices')).toHaveStyle({ ...type.overline, color: colors.mute });
  expect(button('Back')).toBeOnTheScreen();
  expect(rows()).toHaveLength(3);
});

test("the card: 1 ready · 1 to check · 1 to retake with Check the next one; All saved. with no button", async () => {
  scan('inv_0007', { at: at(9, 41) }); // checks passed
  scan('sales_text_0', { at: at(9, 42), source: 'pdf', label: 'PDF: sales.pdf' }); // to check
  scan('blank_page', { at: at(9, 43) }); // the form wasn't found
  await showSession();

  const card = screen.getByTestId('card');
  expect(card).toHaveStyle({ backgroundColor: colors.warningTint, borderColor: colors.warningLine });
  expect(within(card).getByRole('header', { name: '1 ready · 1 to check · 1 to retake' })).toBeOnTheScreen();
  expect(within(card).getByRole('button', { name: 'Check the next one' })).toBeOnTheScreen();

  // every scan saved: plain, and nothing to press
  await act(async () => saveScan(scan('inv_0007', { session: 'S2', at: at(9, 50) }), DETAILS));
  await act(async () => saveScan(scan('inv_0007', { session: 'S2', at: at(9, 51) }), DETAILS));
  await showSession('S2');
  const allSaved = screen.getByTestId('card');
  expect(allSaved).toHaveStyle({ backgroundColor: colors.panel, borderColor: colors.line });
  expect(within(allSaved).getByRole('header', { name: 'All saved.' })).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Check the next one' })).toBeNull();
});

test('Check the next one opens the first unsaved scan whose form was found, past a retake', async () => {
  scan('blank_page', { at: at(9, 41) });
  const saved = scan('inv_0007', { at: at(9, 42) });
  await act(async () => saveScan(saved, DETAILS));
  const next = scan('sales_text_0', { at: at(9, 43), source: 'pdf', label: 'PDF: sales.pdf' });
  scan('inv_0007', { at: at(9, 44) });
  await showSession();

  await press(button('Check the next one'));
  expect(opened()).toEqual([{ pathname: '/result', params: { id: next, from: 'session', session: 'S1' } }]);
});

test('a row: party or label, kind and number, the amount and one badge; it opens the Scan screen', async () => {
  const torres = scan('inv_0007', {
    at: at(9, 41),
    edits: { customer_name: 'Torres Construction Supply', invoice_no: '0000186' },
  });
  const cert = scan('bir2307_text_0', { at: at(9, 42), source: 'pdf', label: 'PDF: bir2307.pdf' });
  const saved = scan('inv_0007', { at: at(9, 43) });
  await act(async () => saveScan(saved, DETAILS));
  const blank = scan('blank_page', { at: at(9, 44) });
  // a saved scan no longer among the recent ones (Review Focus 2), in this session through its summary
  const past = scan('inv_0007', { at: at(9, 45), edits: { customer_name: 'Bautista Pharmacy' } });
  await act(async () => saveScan(past, DETAILS));
  forgetScan(past);
  await showSession();

  const gross = amount(saleOf(getScan(torres)!, lists(), settings()).gross);
  const tax = amount(taxWithheld(certOf(getScan(cert)!, lists(), settings()).cert));
  const summaryOf = (id: string) => savedSummary(id)!;
  const savedRow = (id: string) => {
    const s = summaryOf(id) as savedStore.InvoiceSummary;
    return `${s.partyName}, ${savedSub(s)}, ${amount(s.gross)}, Saved`;
  };
  expect(screen.getByRole('header', { name: 'Invoices' })).toBeOnTheScreen();
  expect(screen.getByText('5')).toHaveStyle({ ...type.overline, color: colors.mute }); // the count, on its right
  expect(rows()).toEqual([
    startingWith(`Torres Construction Supply, Sale · SI 0000186, ${gross}, `),
    startingWith(`Reyes Sari-Sari Store, 2307 · Q1 2026, ${tax}, `),
    savedRow(saved),
    `Camera photo, ${formatClock(at(9, 44))}, Retake`,
    savedRow(past),
  ]);
  expect(summaryOf(past).partyName).toBe('Bautista Pharmacy');

  await press(button(/^Torres Construction Supply, /));
  expect(opened()).toEqual([{ pathname: '/result', params: { id: torres, from: 'session', session: 'S1' } }]);
  await act(async () => focusAgain());
  await press(button(`Camera photo, ${formatClock(at(9, 44))}, Retake`));
  expect(opened().at(-1)).toEqual({ pathname: '/result', params: { id: blank, from: 'session', session: 'S1' } });
  await act(async () => focusAgain());
  // the one past the newest 100 is read back first, so the Scan screen finds it
  await press(button(/^Bautista Pharmacy, /));
  expect(opened().at(-1)).toEqual({ pathname: '/result', params: { id: past, from: 'session', session: 'S1' } });
  expect(getScan(past)?.id).toBe(past);
});

test("a scan whose form wasn't found: Retake opens the camera in this session; Remove asks, then deletes", async () => {
  scan('inv_0007', { at: at(9, 41) });
  const blank = scan('blank_page', { at: at(9, 42) });
  const other = scan('blank_page', { at: at(9, 43) });
  await showSession();
  const under = (id: string) => screen.getByTestId(`retake-${id}`);

  // only the rows whose form wasn't found have the two
  expect(screen.getAllByRole('button', { name: /^Retake / })).toHaveLength(2);
  expect(within(under(blank)).getByText('Remove')).toHaveStyle({ color: colors.danger });
  expect(within(under(blank)).getByText('Retake')).toHaveStyle({ color: colors.brandText });
  // TalkBack says which scan each is for: the row's title and its time (the words shown stay Retake and Remove)
  const blankAt = formatClock(at(9, 42));
  expect(within(under(blank)).getByRole('button', { name: `Retake Camera photo ${blankAt}` })).toBeOnTheScreen();
  expect(within(under(blank)).getByRole('button', { name: `Remove Camera photo ${blankAt}` })).toBeOnTheScreen();
  expect(within(under(other)).getByRole('button', { name: `Retake Camera photo ${formatClock(at(9, 43))}` })).toBeOnTheScreen();

  await press(within(under(blank)).getByRole('button', { name: /^Retake / }));
  expect(currentSession()).toMatchObject({ id: 'S1', open: true, replaces: blank });
  expect(mockNavigate.mock.calls).toEqual([['/camera']]);
  await act(async () => focusAgain());

  await press(within(under(other)).getByRole('button', { name: /^Remove / }));
  expect(dialog()).toEqual(['Delete this scan?', "It's removed from this phone."]);
  await choose('Cancel');
  expect(getScan(other)).toBeDefined();
  await press(within(under(other)).getByRole('button', { name: /^Remove / }));
  await choose('Delete');
  expect(getScan(other)).toBeUndefined();
  expect(screen.queryByTestId(`retake-${other}`)).toBeNull();
  expect(rows()).toHaveLength(2);
  expect(mockToast).not.toHaveBeenCalled();

  // a delete that fails says so
  jest.spyOn(scansStore, 'deleteScan').mockImplementation(() => {
    throw new Error('locked');
  });
  await press(within(under(blank)).getByRole('button', { name: /^Remove / }));
  await choose('Delete');
  expect(mockToast).toHaveBeenCalledWith("Couldn't delete the scan.");
  expect(getScan(blank)).toBeDefined();
});

test("photos that couldn't be read: the count, then each one's time and words, while it's the current session", async () => {
  scan('inv_0007', { at: at(9, 41) });
  failedReadsIn('S1', [[at(9, 42), UNREADABLE_PHOTO]]);
  await showSession();

  expect(screen.getByRole('alert')).toHaveTextContent(
    `1 photo couldn't be read. Retake it.\n${formatClock(at(9, 42))}: ${UNREADABLE_PHOTO}`,
  );
  // counted among the retakes
  expect(screen.getByRole('header', { name: '1 ready · 1 to retake' })).toBeOnTheScreen();

  await act(async () => retakeIn('S1', 'none', at(9, 43))); // open again, so the next one counts
  await act(async () => addFailedRead('S1', SCANNER_STOPPED, at(9, 44)));
  expect(screen.getByRole('alert')).toHaveTextContent(
    [
      "2 photos couldn't be read. Retake them.",
      `${formatClock(at(9, 42))}: ${UNREADABLE_PHOTO}`,
      `${formatClock(at(9, 44))}: ${SCANNER_STOPPED}`,
    ].join('\n'),
  );
  expect(screen.getByRole('header', { name: '1 ready · 2 to retake' })).toBeOnTheScreen();

  // another session's screen doesn't show them
  await act(async () => void scan('inv_0007', { session: 'S2', at: at(9, 50) }));
  await showSession('S2');
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByRole('header', { name: '1 ready' })).toBeOnTheScreen();

  // once another session is the camera's, they've gone with it
  await act(async () => retakeIn('S2', 'none', at(9, 55)));
  await showSession('S1');
  expect(screen.queryByRole('alert')).toBeNull();
});

test('a long press asks to delete: an unsaved scan as Delete this scan?, a saved one in its words', async () => {
  const unsaved = scan('inv_0007', { at: at(9, 41), edits: { customer_name: 'Torres Construction Supply' } });
  const saved = scan('inv_0007', { at: at(9, 42), edits: { customer_name: 'Bautista Pharmacy' } });
  await act(async () => saveScan(saved, DETAILS));
  await showSession();

  await act(async () => fireEvent(button(/^Torres Construction Supply, /), 'longPress'));
  expect(dialog()).toEqual(['Delete this scan?', "It's removed from this phone."]);
  await choose('Delete');
  expect(getScan(unsaved)).toBeUndefined();

  await act(async () => fireEvent(button(/^Bautista Pharmacy, /), 'longPress'));
  expect(dialog()).toEqual([
    'Delete this saved scan?',
    "It's removed from this phone. Files you already exported don't change.",
  ]);
  // ruling P-F12: it doesn't wait for the saved scan's own dialog, so the next long press asks again
  await act(async () => fireEvent(button(/^Bautista Pharmacy, /), 'longPress'));
  expect(alert).toHaveBeenCalledTimes(3);
  await choose('Delete');
  expect(savedSummary(saved)).toBeUndefined();
  expect(screen.getByText('Nothing left in this session')).toBeOnTheScreen();
});

test('Check the next one, Retake and Remove run once on a double tap', async () => {
  // Review Focus 5: inside one act() scope, nothing re-renders between the taps
  scan('inv_0007', { at: at(9, 41) });
  const blank = scan('blank_page', { at: at(9, 42) });
  await showSession();
  const under = () => screen.getByTestId(`retake-${blank}`);
  const twice = (a: () => Instance, b: () => Instance = a) =>
    act(async () => {
      await fireEvent.press(a());
      await fireEvent.press(b());
    });

  await twice(() => button('Check the next one'));
  expect(mockPush).toHaveBeenCalledTimes(1);
  await act(async () => focusAgain());

  // Check the next one, then Retake: the first alone, and the camera's session is left as it was
  mockPush.mockClear();
  await twice(
    () => button('Check the next one'),
    () => within(under()).getByRole('button', { name: /^Retake / }),
  );
  expect(mockPush).toHaveBeenCalledTimes(1);
  expect(mockNavigate).not.toHaveBeenCalled();
  expect(currentSession()).toBeNull();
  await act(async () => focusAgain());

  await twice(() => within(under()).getByRole('button', { name: /^Retake / }));
  expect(mockNavigate).toHaveBeenCalledTimes(1);
  await act(async () => focusAgain());

  // a row, then Check the next one
  mockPush.mockClear();
  await twice(() => button(/^Camera photo, /), () => button('Check the next one'));
  expect(opened()).toEqual([{ pathname: '/result', params: { id: blank, from: 'session', session: 'S1' } }]);
  await act(async () => focusAgain());

  // one dialog at a time: Remove twice, then a long press while it's up
  await twice(() => within(under()).getByRole('button', { name: /^Remove / }));
  await act(async () => fireEvent(button(/^Camera photo, /), 'longPress'));
  expect(alert).toHaveBeenCalledTimes(1);
  await choose('Cancel');
  await act(async () => fireEvent(button(/^Camera photo, /), 'longPress'));
  await act(async () => fireEvent(button(/^Camera photo, /), 'longPress'));
  expect(alert).toHaveBeenCalledTimes(2);
});

test('one screen shows one session, then another, with nothing carried over', async () => {
  // ruling T7-6: the Stack keeps one session screen, so the camera's Done on B, with A shown, gives the same mounted
  // screen B's id
  scan('inv_0007', { at: at(9, 41), edits: { customer_name: 'Torres Construction Supply' } });
  const aBlank = scan('blank_page', { at: at(9, 42) });
  const bNext = scan('sales_text_0', { session: 'S2', at: at(9, 50), source: 'pdf', label: 'PDF: sales.pdf' });
  const bBlank = scan('blank_page', { session: 'S2', at: at(9, 51) });
  failedReadsIn('S2', [[at(9, 52), UNREADABLE_PHOTO]]);
  mockParams.id = 'S1';
  const { rerender } = await render(<SessionScreen />);
  expect(screen.getByText('Session · 2 invoices')).toBeOnTheScreen();
  // A's Remove's dialog, then its Check the next one, both still up as the screen goes to B
  await press(within(screen.getByTestId(`retake-${aBlank}`)).getByRole('button', { name: /^Remove / }));
  await press(button('Check the next one'));

  mockParams.id = 'S2';
  await act(async () => rerender(<SessionScreen />));
  expect(screen.getByRole('header', { name: 'Today, 9:50 AM' })).toBeOnTheScreen();
  expect(screen.queryByText(/Torres/)).toBeNull();
  expect(screen.getByRole('alert')).toHaveTextContent(/^1 photo couldn't be read/);
  expect(screen.getByRole('header', { name: '1 to check · 2 to retake' })).toBeOnTheScreen();

  await press(button('Check the next one'));
  expect(opened()).toEqual([
    { pathname: '/result', params: { id: expect.any(String), from: 'session', session: 'S1' } },
    { pathname: '/result', params: { id: bNext, from: 'session', session: 'S2' } },
  ]);
  await act(async () => focusAgain()); // back from B's Scan screen
  await press(within(screen.getByTestId(`retake-${bBlank}`)).getByRole('button', { name: /^Remove / }));
  expect(alert).toHaveBeenCalledTimes(2);
  await act(async () => fireEvent(button(/^Camera photo, /), 'longPress'));
  expect(alert).toHaveBeenCalledTimes(2); // B's own dialog is up
  await choose('Delete');
  expect(getScan(bBlank)).toBeUndefined();
});

test('a session with nothing left in it says so', async () => {
  await showSession('S9');
  expect(screen.getByText('Nothing left in this session')).toHaveStyle({ ...type.title, color: colors.ink });
  expect(screen.getByText('Its scans were deleted.')).toHaveStyle({ ...type.body, color: colors.mute });
  expect(screen.queryByTestId('card')).toBeNull();
  expect(button('Back')).toBeOnTheScreen();
});

/** A saved scan of this session no longer among the recent ones (past the newest 100): its summary alone. */
async function savedOnly(opts: Parameters<typeof scan>[1]): Promise<string> {
  const id = scan('inv_0007', opts);
  await act(async () => saveScan(id, DETAILS));
  forgetScan(id);
  return id;
}

/** openSaved, held until the test lets it finish: a slow read of a saved scan's scan.json (or the result given). */
function slowOpenSaved(result?: StoredScan | null): () => Promise<void> {
  jest.restoreAllMocks(); // the last one's spy: spying again would wrap it in itself
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const real = savedStore.openSaved;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  jest.spyOn(savedStore, 'openSaved').mockImplementation(async (id) => {
    await gate;
    return result === undefined ? real(id) : result;
  });
  // the read ends, and what follows it in the screen (a push, a message) runs, all in one act() scope
  return () =>
    act(async () => {
      release();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
}

test('a saved scan read back opens only while the screen is on top; one that has gone says so', async () => {
  // ruling T8-3 (T9-1 a, b): after the read, nothing opens over another screen
  const past = await savedOnly({ at: at(9, 41), edits: { customer_name: 'Bautista Pharmacy' } });
  await showSession();

  let finish = slowOpenSaved();
  await press(button(/^Bautista Pharmacy, /));
  mockFocused = false; // another tab came on top while it was read
  await finish();
  expect(mockPush).not.toHaveBeenCalled();
  expect(mockToast).not.toHaveBeenCalled();

  // its folder gone: it says so, and opens nothing
  mockFocused = true;
  await act(async () => forgetScan(past)); // read back again
  finish = slowOpenSaved(null);
  await press(button(/^Bautista Pharmacy, /));
  await finish();
  expect(mockToast.mock.calls).toEqual([["Couldn't open that scan."]]);
  expect(mockPush).not.toHaveBeenCalled();

  // and one read back while on top opens
  await act(async () => forgetScan(past));
  finish = slowOpenSaved();
  await press(button(/^Bautista Pharmacy, /));
  await finish();
  expect(opened()).toEqual([{ pathname: '/result', params: { id: past, from: 'session', session: 'S1' } }]);
});

test('while a saved scan is read back, no other row, Check the next one, Retake or delete starts', async () => {
  // T9-1 c, T9-3
  const past = await savedOnly({ at: at(9, 41), edits: { customer_name: 'Bautista Pharmacy' } });
  scan('inv_0007', { at: at(9, 42), edits: { customer_name: 'Torres Construction Supply' } });
  const blank = scan('blank_page', { at: at(9, 43) });
  await showSession();
  const under = () => screen.getByTestId(`retake-${blank}`);

  const finish = slowOpenSaved();
  await press(button(/^Bautista Pharmacy, /));
  await press(button(/^Torres Construction Supply, /));
  await press(button('Check the next one'));
  await press(within(under()).getByRole('button', { name: /^Retake / }));
  await press(within(under()).getByRole('button', { name: /^Remove / }));
  await act(async () => fireEvent(button(/^Torres Construction Supply, /), 'longPress'));
  expect(mockPush).not.toHaveBeenCalled();
  expect(mockNavigate).not.toHaveBeenCalled();
  expect(currentSession()).toBeNull();
  expect(alert).not.toHaveBeenCalled();
  await finish();
  expect(opened()).toEqual([{ pathname: '/result', params: { id: past, from: 'session', session: 'S1' } }]);
});

test("a delete doesn't start while a press is opening a screen", async () => {
  // T9-3: a row, then Remove or a long press, in one go: the row's Scan screen alone, and no dialog over it
  const blank = scan('blank_page', { at: at(9, 41) });
  await showSession();
  await act(async () => {
    await fireEvent.press(button(/^Camera photo, /));
    await fireEvent.press(within(screen.getByTestId(`retake-${blank}`)).getByRole('button', { name: /^Remove / }));
    await fireEvent(button(/^Camera photo, /), 'longPress');
  });
  expect(mockPush).toHaveBeenCalledTimes(1);
  expect(alert).not.toHaveBeenCalled();
  // back on top: it asks again
  await act(async () => focusAgain());
  await act(async () => fireEvent(button(/^Camera photo, /), 'longPress'));
  expect(dialog()).toEqual(['Delete this scan?', "It's removed from this phone."]);
});

test("a long press on a saved scan known by its summary alone asks in the saved scan's words", async () => {
  // T9-1 d: no scan to hand confirmDeleteScan, so straight to confirmDeleteSaved
  const past = await savedOnly({ at: at(9, 41), edits: { customer_name: 'Bautista Pharmacy' } });
  await showSession();
  await act(async () => fireEvent(button(/^Bautista Pharmacy, /), 'longPress'));
  expect(dialog()).toEqual([
    'Delete this saved scan?',
    "It's removed from this phone. Files you already exported don't change.",
  ]);
  await choose('Delete');
  expect(savedSummary(past)).toBeUndefined();
});

test("every scan saved, with a photo that couldn't be read: the card is still amber", async () => {
  // T9-1 e: the failed read is left to do
  await act(async () => saveScan(scan('inv_0007', { at: at(9, 41) }), DETAILS));
  failedReadsIn('S1', [[at(9, 42), UNREADABLE_PHOTO]]);
  await showSession();
  expect(screen.getByRole('header', { name: '1 to retake' })).toBeOnTheScreen();
  expect(screen.getByTestId('card')).toHaveStyle({ backgroundColor: colors.warningTint, borderColor: colors.warningLine });
});

test("confirmDeleteScan: Delete runs the caller's step, then the delete; Cancel neither; a saved scan in its own words", async () => {
  // T9-1 f: the Scan screen's ⋮ (Task 11) starts going back first, in the same press (Review Focus 4)
  const steps: string[] = [];
  const before = jest.fn(() => {
    steps.push('before');
  });
  const real = scansStore.deleteScan;
  jest.spyOn(scansStore, 'deleteScan').mockImplementation((id) => {
    steps.push('delete');
    real(id);
  });
  const unsaved = scan('blank_page', { at: at(9, 41) });

  let settled = false;
  let asked = confirmDeleteScan(getScan(unsaved)!, before).then(() => {
    settled = true;
  });
  expect(dialog()).toEqual(['Delete this scan?', "It's removed from this phone."]);
  await act(async () => {});
  expect(settled).toBe(false); // it settles when the dialog closes
  await choose('Cancel');
  await asked;
  expect(steps).toEqual([]);
  expect(getScan(unsaved)).toBeDefined();

  asked = confirmDeleteScan(getScan(unsaved)!, before);
  await choose('Delete');
  await asked;
  expect(steps).toEqual(['before', 'delete']);
  expect(getScan(unsaved)).toBeUndefined();

  // a saved scan: confirmDeleteSaved's words, and its own `before`, which runs ahead of the delete there too
  steps.length = 0;
  const saved = scan('inv_0007', { at: at(9, 42) });
  await act(async () => saveScan(saved, DETAILS));
  const deleteSaved = jest.spyOn(savedStore, 'deleteSaved').mockImplementation(async () => {
    steps.push('deleteSaved');
  });
  await confirmDeleteScan(getScan(saved)!, before); // at once (ruling P-F12)
  expect(dialog()).toEqual([
    'Delete this saved scan?',
    "It's removed from this phone. Files you already exported don't change.",
  ]);
  expect(steps).toEqual([]);
  await choose('Delete');
  expect(steps).toEqual(['before', 'deleteSaved']);
  expect(deleteSaved).toHaveBeenCalledWith(saved);
});

test('with no scans in it, the header has no count: never 0 invoices', async () => {
  // ruling T9-4: every photo of the session failed to read
  failedReadsIn('S1', [[at(9, 41), UNREADABLE_PHOTO]]);
  await showSession();
  expect(screen.getByRole('header', { name: 'Today, 9:41 AM' })).toBeOnTheScreen();
  expect(screen.queryByText(/^Session · /)).toBeNull();
  expect(screen.getByRole('header', { name: '1 to retake' })).toBeOnTheScreen();

  // a scan in it: its count is back
  await act(async () => void scan('inv_0007', { at: at(9, 42) }));
  expect(screen.getByText('Session · 1 invoice')).toBeOnTheScreen();
});

test("Retake on the photos that couldn't be read: the camera, in this session, trying the oldest again", async () => {
  // ruling T9-5
  scan('inv_0007', { at: at(9, 41) });
  failedReadsIn('S1', [
    [at(9, 42), UNREADABLE_PHOTO],
    [at(9, 43), SCANNER_STOPPED],
  ]);
  await showSession();
  const failed = currentSession()!.failed;
  const retry = () => within(screen.getByTestId('failed-reads')).getByRole('button', { name: /^Retake / });
  expect(retry().props.accessibilityLabel).toBe("Retake a photo that couldn't be read");
  expect(within(screen.getByTestId('failed-reads')).getByText('Retake')).toHaveStyle({ color: colors.brandText });

  await press(retry());
  expect(mockNavigate.mock.calls).toEqual([['/camera']]);
  expect(currentSession()).toMatchObject({ id: 'S1', open: true, failed, replaces: null, retries: failed[0].at });
  await act(async () => focusAgain());

  // its new read stored: that one goes, and the card counts one less
  await act(async () => clearFailedRead('S1', failed[0].at));
  expect(screen.getByRole('header', { name: '1 ready · 1 to retake' })).toBeOnTheScreen();
  expect(retry().props.accessibilityLabel).toBe("Retake the photo that couldn't be read");
  expect(screen.getByRole('alert')).toHaveTextContent(
    `1 photo couldn't be read. Retake it.\n${formatClock(at(9, 43))}: ${SCANNER_STOPPED}`,
  );

  // failed again: still one, with its new time and words; the oldest is retried next
  await act(async () => addFailedRead('S1', UNREADABLE_PHOTO, at(9, 50), failed[1].at));
  expect(screen.getByRole('alert')).toHaveTextContent(
    `1 photo couldn't be read. Retake it.\n${formatClock(at(9, 50))}: ${UNREADABLE_PHOTO}`,
  );
  await act(async () => addFailedRead('S1', SCANNER_STOPPED, at(9, 51)));
  await act(async () => addFailedRead('S1', SCANNER_STOPPED, at(9, 53), at(9, 50).toISOString())); // first, but 9:53 now
  mockNavigate.mockClear();
  await press(retry());
  expect(currentSession()?.retries).toBe(at(9, 51).toISOString()); // the oldest, not the first listed

  // the last one stored: the banner and its Retake go, and the card says what's left
  await act(async () => focusAgain());
  await act(async () => clearFailedRead('S1', at(9, 51).toISOString()));
  await act(async () => clearFailedRead('S1', at(9, 53).toISOString()));
  expect(screen.queryByTestId('failed-reads')).toBeNull();
  expect(screen.getByRole('header', { name: '1 ready' })).toBeOnTheScreen();
});

test("the failed reads' Retake runs once on a double tap, and waits for another press's open or read", async () => {
  // Review Focus 5
  const past = await savedOnly({ at: at(9, 41), edits: { customer_name: 'Bautista Pharmacy' } });
  failedReadsIn('S1', [[at(9, 42), UNREADABLE_PHOTO]]);
  await showSession();
  const retry = () => within(screen.getByTestId('failed-reads')).getByRole('button', { name: /^Retake / });
  const sessionBefore = currentSession();

  // while a saved scan is read back: nothing
  const finish = slowOpenSaved();
  await press(button(/^Bautista Pharmacy, /));
  await press(retry());
  expect(currentSession()).toBe(sessionBefore);
  await finish();
  expect(opened()).toEqual([{ pathname: '/result', params: { id: past, from: 'session', session: 'S1' } }]);
  expect(mockNavigate).not.toHaveBeenCalled();
  // a row opened: nothing until this screen is on top again
  await press(retry());
  expect(currentSession()).toBe(sessionBefore);
  await act(async () => focusAgain());

  await act(async () => {
    await fireEvent.press(retry());
    await fireEvent.press(retry());
  });
  expect(mockNavigate).toHaveBeenCalledTimes(1);
  expect(currentSession()?.retries).toBe(at(9, 42).toISOString());
});
