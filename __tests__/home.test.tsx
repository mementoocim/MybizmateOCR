import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { Alert } from 'react-native';

import Home from '../app/(tabs)/index';
import { longDay } from '../lib/format';
import { addItem, addParty, clearItems, clearParties } from '../lib/lists';
import { loadSaved } from '../lib/saved';
import { SAMPLES } from '../lib/samples';
import { addScan, forgetScan, recentScans } from '../lib/scans';
import { settings, updateSettings } from '../lib/settings';
import { colors, touch, type } from '../lib/theme';
import { parseScanResult } from '../modules/scanner/src/parse';
import { coreJson } from '../test-utils/coreJson';
import { memoryFs } from '../test-utils/memoryFs';
import { focusAgain } from '../test-utils/screenFocus';
import { pinToday } from '../test-utils/today';
import { typeStylesOf } from '../test-utils/typeStyles';

// Camera first (spec §6.5, the plan's call 18): Home as cards, each with at most one button. The header greets by the
// time of day, with the date; "Get set up" until it's done, once; before any scan, "Take your first photo"; what's left
// to check or to retake, which Check now opens; what's ready to send to MyBizMate, per kind; the last session; then the
// samples and the footer. Every press goes through the screen's one guard (ruling T6-1, Review Focus 5).

let mockTeam = false;
const mockPush = jest.fn();
const mockNavigate = jest.fn(); // another tab, or a screen in one: the camera, Profile, Export, a session
const mockScanPhoto = jest.fn();

jest.mock('expo-router', () => ({
  // Home is a tab (lib/navigation: going back, and whether it's in the tabs)
  useNavigation: () => ({
    canGoBack: () => true,
    goBack: jest.fn(),
    getState: () => ({ type: 'tab' }),
    getParent: () => undefined,
  }),
  useRouter: () => ({
    push: mockPush,
    navigate: mockNavigate,
    dismissTo: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  }),
  // a screen's pushes run once until it's focused again (lib/navigation)
  useFocusEffect: (effect: () => void) => require('../test-utils/screenFocus').useFocusEffect(effect),
  useIsFocused: () => true,
}));
jest.mock('../modules/scanner', () => ({
  scanPhoto: (uri: string, options: object) => mockScanPhoto(uri, options),
  readPdf: jest.fn(),
  displayName: async () => 'a.pdf',
  releaseAccess: async () => undefined,
}));
jest.mock('../lib/build', () => ({
  get TEAM_BUILD() {
    return mockTeam;
  },
}));
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
}));
jest.mock('expo-asset', () => ({
  Asset: { fromModule: () => ({ downloadAsync: async () => ({ localUri: 'file:///bundle/sample.jpg' }) }) },
}));
jest.mock('expo-file-system', () => require('../test-utils/memoryFs').memoryFs.module);

const NOW = new Date(2026, 10, 20, 9, 0); // a Friday morning
const at = (day: number, h: number, m = 0) => new Date(2026, 10, day, h, m);

beforeAll(() => {
  pinToday(NOW); // a scan is checked as of the day it's read
});

afterAll(() => {
  jest.useRealTimers();
});

let alert: jest.SpyInstance;

beforeEach(async () => {
  jest.clearAllMocks();
  jest.setSystemTime(NOW);
  mockTeam = false;
  mockScanPhoto.mockResolvedValue(parseScanResult(coreJson('inv_0007')));
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  // a first run: nothing scanned or saved, empty lists, no export defaults, and not set up yet
  memoryFs.reset();
  recentScans().forEach((s) => forgetScan(s.id));
  await loadSaved();
  await clearParties('customer');
  await clearParties('supplier');
  await clearItems();
  await updateSettings({ vatRegistered: null, revenueAccount: '', setupDone: false });
});

afterEach(() => alert.mockRestore());

type Instance = ReturnType<typeof screen.getByText>;
const press = (el: Instance) => act(async () => fireEvent.press(el));
const button = (name: string | RegExp) => screen.getByRole('button', { name });
const header = (name: string) => screen.getByRole('header', { name });
/** The icons under a node drawn in a color: a row's chevron, the footer's lock. */
const iconsIn = (node: Instance, color: string) => node.queryAll((n) => n.props.stroke === color);
/** Back on Home from the screen a press opened: its next press opens one again (lib/navigation's usePushOnce). */
const backHome = () => act(async () => focusAgain());
/** The cards' titles, top to bottom. */
const cardTitles = () =>
  screen.queryAllByTestId('card').map((c) => within(c).getByRole('header').props.children as string);
const card = (title: string) => screen.getAllByTestId('card').find((c) => within(c).queryByRole('header', { name: title }))!;

/** A scan read now (or at a time), in a session or in none. */
function scan(fixture: string, opts: { session?: string; at?: Date; source?: 'camera' | 'sample' | 'pdf' } = {}) {
  const source = opts.source ?? 'camera';
  return addScan({
    label: source === 'sample' ? 'Sample 0007' : 'Camera photo',
    source,
    sampleId: source === 'sample' ? 'inv_0007' : undefined,
    result: parseScanResult(coreJson(fixture)),
    session: opts.session,
    at: opts.at,
  });
}

const EXPORTED = '2026-11-19T02:00:00.000Z';
let saves = 0;
/** A saved scan's summary as saved.json keeps it: an invoice with its gross, or a 2307 with its tax withheld. */
function summary(kind: 'sale' | 'purchase' | '2307', total: number, exportedAt: string | null = null) {
  const base = {
    id: `saved-${++saves}`,
    label: 'Camera photo',
    partyName: 'Torres Construction Supply',
    partyId: null,
    date: '2026-11-18',
    listed: true,
    savedAt: '2026-11-19T01:00:00.000Z',
    exportedAt,
  };
  return kind === '2307' ? { ...base, kind, period: 'Q4 2026', tax: total, rows: [] } : { ...base, kind, gross: total, row: {} };
}

/** The saved scans, as if saved.json held these when the app started. */
async function savedAre(...summaries: (ReturnType<typeof summary> & { session?: string })[]) {
  memoryFs.files.set('file:///docs/saved.json', JSON.stringify(summaries));
  await act(async () => loadSaved());
}

/** Ready to send's lines, top to bottom, by what TalkBack says. */
const sendLines = () => screen.queryAllByTestId(/^send-/).map((l) => l.props.accessibilityLabel);

const CUSTOMER = {
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

test('the header: the greeting for the time of day, and the date', async () => {
  const nbsp = String.fromCharCode(0xa0);
  for (const [when, words, date] of [
    [at(24, 9, 41), 'Good morning', `Tuesday, Nov${nbsp}24`],
    [at(24, 11, 59), 'Good morning', `Tuesday, Nov${nbsp}24`],
    [at(24, 12, 0), 'Good afternoon', `Tuesday, Nov${nbsp}24`],
    [at(25, 17, 59), 'Good afternoon', `Wednesday, Nov${nbsp}25`],
    [at(25, 18, 0), 'Good evening', `Wednesday, Nov${nbsp}25`],
  ] as const) {
    jest.setSystemTime(when);
    await render(<Home />);
    const top = within(screen.getByTestId('header'));
    expect(top.getByRole('header').props.children).toBe(words);
    const sub = top.getByText(date);
    expect(sub.props.children).toBe(longDay(when));
    expect(sub).toHaveStyle({ ...type.overline, color: colors.mute });
    await screen.unmount();
  }

  // no Back, no wordmark, no icon buttons: the tabs' bar has Profile, and Get set up has the lists
  for (const team of [false, true]) {
    mockTeam = team; // a team build has the speed test in Settings › Team tools, never on Home
    await render(<Home />);
    const top = within(screen.getByTestId('header'));
    expect(top.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryByTestId('header-logo')).toBeNull();
    expect(screen.queryByText('Speed test')).toBeNull();
    await screen.unmount();
  }
});

test('the greeting, the date and the last session are as of when Home is looked at, back on top (T12-3)', async () => {
  // the tabs keep Home mounted under the others: it was drawn at 11:55, and shown again at 12:05
  jest.setSystemTime(at(24, 11, 55));
  await render(<Home />);
  await act(async () => {
    scan('inv_0007', { session: 'S1', at: at(24, 11, 50) });
  });
  const title = () => within(screen.getByTestId('header')).getByRole('header').props.children;
  expect(title()).toBe('Good morning');
  expect(within(card('Last session')).getByText('Today, 11:50 AM · 1 invoice')).toBeOnTheScreen();
  jest.setSystemTime(at(24, 12, 5));
  await backHome();
  expect(title()).toBe('Good afternoon');
  // past midnight: another day, and the session was yesterday's
  jest.setSystemTime(at(25, 0, 5));
  await backHome();
  expect(title()).toBe('Good morning');
  expect(within(screen.getByTestId('header')).getByText(longDay(at(25, 0, 5)))).toBeOnTheScreen();
  expect(within(card('Last session')).getByText('Yesterday, 11:50 AM · 1 invoice')).toBeOnTheScreen();
});

test('a first run: Get set up, and Take your first photo with the three tips; Open the camera opens it', async () => {
  await render(<Home />);
  expect(cardTitles()).toEqual(['Get set up 0 of 2', 'Take your first photo']);
  const first = within(card('Take your first photo'));
  expect(first.getByText('The round button at the bottom opens the camera.')).toHaveStyle({ color: colors.mute });
  const tips = ['The whole form in the photo', 'Flat on a table, in good light', 'Phone straight above it, no shadows'];
  tips.forEach((tip, i) => {
    expect(first.getByText(tip)).toHaveStyle({ ...type.body, color: colors.ink });
    expect(first.getByText(`${i + 1}`)).toHaveStyle({ ...type.figure, color: colors.brandText });
  });
  const openCamera = first.getByRole('button', { name: 'Open the camera' });
  expect(openCamera).toHaveStyle({ backgroundColor: colors.brand }); // primary
  await press(openCamera);
  expect(mockNavigate.mock.calls).toEqual([['/camera']]); // the camera tab
  // nothing to check, send or open yet
  expect(screen.queryByText('Check now')).toBeNull();
  expect(screen.queryByText('Ready to send to MyBizMate')).toBeNull();
  expect(screen.queryByText('Last session')).toBeNull();

  // the first scan: the card goes; with no recent scan left, a saved one is enough
  await act(async () => {
    scan('inv_0007', { session: 'S1' });
  });
  expect(screen.queryByText('Take your first photo')).toBeNull();
  await savedAre(summary('sale', 100, EXPORTED));
  await act(async () => recentScans().forEach((s) => forgetScan(s.id)));
  expect(screen.queryByText('Take your first photo')).toBeNull();
  for (const tip of tips) expect(screen.queryByText(tip)).toBeNull();
});

test('Get set up: two rows, each checked when done, then gone for good', async () => {
  await render(<Home />);
  expect(header('Get set up 0 of 2')).toBeOnTheScreen();
  const listsRow = () => button('Import your customers and items, So scans can check names, TINs and prices');
  const defaultsRow = () => button('Set your export defaults, VAT status and accounts for MyBizMate');
  const done = (row: Instance) => row.props.accessibilityState?.checked;
  expect([done(listsRow()), done(defaultsRow())]).toEqual([false, false]);
  expect(iconsIn(listsRow(), colors.chevron)).toHaveLength(1);
  await press(listsRow());
  expect(mockPush).toHaveBeenLastCalledWith('/lists');
  await backHome();
  await press(defaultsRow());
  expect(mockNavigate).toHaveBeenLastCalledWith('/profile'); // the Profile tab

  // the lists: any row in them, an item as much as a party
  await act(async () => {
    await addItem({ name: 'Cement 40kg', unit: 'bag', price: 250 });
  });
  expect(done(listsRow())).toBe(true);
  expect(iconsIn(listsRow(), colors.success)).toHaveLength(1); // a check in the chevron's place
  expect(header('Get set up 1 of 2')).toBeOnTheScreen();
  await act(async () => clearItems());
  expect(done(listsRow())).toBe(false);
  await act(async () => {
    await addParty(CUSTOMER);
  });
  expect(done(listsRow())).toBe(true);

  // the export defaults: a VAT status chosen (not VAT-registered is one) and a revenue account
  await act(async () => updateSettings({ vatRegistered: false }));
  expect(done(defaultsRow())).toBe(false);
  await act(async () => updateSettings({ revenueAccount: '   ' }));
  expect(done(defaultsRow())).toBe(false);
  expect(settings().setupDone).toBe(false);
  await act(async () => updateSettings({ revenueAccount: '4010' }));

  // both done: the card goes, for good, with nothing scanned yet
  expect(screen.queryByText(/^Get set up/)).toBeNull();
  expect(screen.queryByText('Import your customers and items')).toBeNull();
  expect(settings().setupDone).toBe(true);
  expect(cardTitles()).toEqual(['Take your first photo']);
  await act(async () => clearParties('customer'));
  await act(async () => updateSettings({ vatRegistered: null, revenueAccount: '' }));
  expect(screen.queryByText(/^Get set up/)).toBeNull();
  await screen.unmount();
  await render(<Home />);
  expect(screen.queryByText(/^Get set up/)).toBeNull();
  expect(settings().setupDone).toBe(true);
});

test('N invoices to check, and the photos to retake; Check now opens the oldest session with something left', async () => {
  await updateSettings({ setupDone: true });
  await render(<Home />);
  // one to check: in the singular, and no retake part
  await act(async () => {
    scan('inv_0007', { session: 'S2', at: at(20, 8, 30) });
  });
  expect(cardTitles()[0]).toBe('1 invoice to check');
  const attention = card('1 invoice to check');
  expect(attention).toHaveStyle({ backgroundColor: colors.warningTint, borderColor: colors.warningLine });
  // a retake only: that part alone
  await act(async () => recentScans().forEach((s) => forgetScan(s.id)));
  await act(async () => {
    scan('blank_page', { session: 'S2', at: at(20, 8, 30) });
  });
  expect(cardTitles()[0]).toBe('1 photo to retake');

  // both, in the plural, joined by "and"; an older session with work, and a newer one; a sample counts nowhere
  await act(async () => {
    scan('blank_page', { session: 'S1', at: at(19, 16, 10) });
    scan('inv_0007', { session: 'S3', at: at(20, 8, 45) });
    scan('inv_0007', { session: 'S3', at: at(20, 8, 46) });
    scan('inv_0007', { source: 'sample', at: at(18, 9, 0) });
  });
  expect(cardTitles()[0]).toBe('2 invoices to check and 2 photos to retake');
  const checkNow = button('Check now');
  expect(checkNow).toHaveStyle({ backgroundColor: colors.brand }); // primary
  await press(checkNow);
  // the oldest session with a scan left, in the Sessions tab, its list under it
  expect(mockNavigate.mock.calls).toEqual([[{ pathname: '/sessions/[id]', params: { id: 'S1' } }, { withAnchor: true }]]);

  // a scan with no session id, older still, with something left: its Scan screen, from a list
  await backHome();
  let older = '';
  await act(async () => {
    older = scan('blank_page', { at: at(17, 10, 0) });
  });
  expect(cardTitles()[0]).toBe('2 invoices to check and 3 photos to retake');
  await press(button('Check now'));
  expect(mockPush.mock.calls).toEqual([[{ pathname: '/result', params: { id: older, from: 'list' } }]]);
});

test("Ready to send to MyBizMate: each kind's count and total; Go to Export", async () => {
  await updateSettings({ setupDone: true });
  await render(<Home />);
  await savedAre(
    summary('sale', 1200.5),
    summary('sale', 38240),
    summary('sale', 999, EXPORTED), // gone out already: not waiting
    summary('purchase', 5000, EXPORTED),
    summary('2307', 4160.86),
  );
  expect(header('Ready to send to MyBizMate')).toBeOnTheScreen();
  // every purchase went out, so there's no Purchases line
  expect(sendLines()).toEqual(['Sales · 2, ₱39,440.50', '2307s · 1, ₱4,160.86']);
  expect(typeStylesOf(screen.getByText('Sales · 2'))).toEqual(['value']);
  const total = screen.getByText('₱39,440.50');
  expect(typeStylesOf(total)).toEqual(['figure']);
  expect(total).toHaveStyle({ textAlign: 'right' });
  const go = within(card('Ready to send to MyBizMate')).getByRole('button', { name: 'Go to Export' });
  expect(go).toHaveStyle({ backgroundColor: colors.panel, borderColor: colors.outline }); // secondary
  await press(go);
  expect(mockNavigate.mock.calls).toEqual([['/export']]); // the Export tab

  // purchases waiting too, between the two; a total in the millions in full
  await savedAre(summary('2307', 10039.79), summary('purchase', 12345000), summary('purchase', 678.9), summary('sale', 100));
  expect(sendLines()).toEqual(['Sales · 1, ₱100.00', 'Purchases · 2, ₱12,345,678.90', '2307s · 1, ₱10,039.79']);
  expect(screen.getByText('₱12,345,678.90').props.numberOfLines).toBeUndefined();

  // everything exported: no card
  await savedAre(summary('sale', 100, EXPORTED), summary('2307', 50, EXPORTED));
  expect(screen.queryByText('Ready to send to MyBizMate')).toBeNull();
  expect(screen.queryByText('Go to Export')).toBeNull();
});

test('Last session: its time and count; Open the session opens it', async () => {
  await updateSettings({ setupDone: true });
  await render(<Home />);
  await act(async () => {
    scan('inv_0007', { session: 'S1', at: at(19, 16, 10) });
    scan('inv_0007', { session: 'S2', at: at(20, 8, 30) });
    scan('blank_page', { session: 'S2', at: at(20, 8, 31) });
    scan('inv_0007', { session: 'S2', at: at(20, 8, 32) });
    scan('inv_0007', { at: at(20, 8, 50) }); // newer, but with no session id: not a session to open
    scan('inv_0007', { source: 'sample', at: at(20, 8, 55) });
  });
  const last = within(card('Last session'));
  expect(last.getByText('Today, 8:30 AM · 3 invoices')).toHaveStyle({ color: colors.mute });
  const openIt = last.getByRole('button', { name: 'Open the session' });
  expect(openIt).toHaveStyle({ backgroundColor: colors.panel, borderColor: colors.outline }); // secondary
  await press(openIt);
  expect(mockNavigate.mock.calls).toEqual([[{ pathname: '/sessions/[id]', params: { id: 'S2' } }, { withAnchor: true }]]);
  // the cards in their order
  expect(cardTitles()).toEqual(['4 invoices to check and 1 photo to retake', 'Last session']);

  // yesterday's, with one invoice
  await act(async () => recentScans().forEach((s) => forgetScan(s.id)));
  await act(async () => {
    scan('inv_0007', { session: 'S1', at: at(19, 16, 10) });
  });
  expect(within(card('Last session')).getByText('Yesterday, 4:10 PM · 1 invoice')).toBeOnTheScreen();
});

test('a sample opens its Scan screen, in no session', async () => {
  await render(<Home />);
  await press(button('Try a sample invoice'));
  await press(button('Sample 0051, Caveat handwriting'));
  expect(screen.queryByText('Sample invoices')).toBeNull();
  expect(mockScanPhoto).toHaveBeenCalledWith('file:///bundle/sample.jpg', { deletePhoto: false });
  const [read] = recentScans();
  expect(read).toMatchObject({ label: 'Sample 0051', source: 'sample', sampleId: 'inv_0051' });
  expect(read.session).toBeUndefined();
  expect(mockPush.mock.calls).toEqual([[{ pathname: '/result', params: { id: read.id } }]]);
  // a first scan, so the first photo's card goes; and a sample is nothing to check, nor a session
  expect(screen.queryByText('Take your first photo')).toBeNull();
  expect(screen.queryByText('Check now')).toBeNull();
  expect(screen.queryByText('Last session')).toBeNull();
});

test('nothing to do: no check card and no send card', async () => {
  await updateSettings({ setupDone: true });
  await render(<Home />);
  // every scan saved and exported, in a session
  await savedAre({ ...summary('sale', 100, EXPORTED), session: 'S1' });
  expect(cardTitles()).toEqual(['Last session']);
  expect(screen.queryByText(/to check|to retake/)).toBeNull();
  expect(screen.queryByText('Ready to send to MyBizMate')).toBeNull();
  // the end stays
  expect(button('Try a sample invoice')).toBeOnTheScreen();
  expect(screen.getByText('Read on this phone · no internet')).toBeOnTheScreen();
});

test("each card's button runs once on a double tap", async () => {
  await render(<Home />);
  await savedAre(summary('sale', 100));
  await act(async () => {
    scan('inv_0007', { session: 'S1', at: at(20, 8, 30) });
  });
  // a fast double tap: inside one act() scope, nothing re-renders between the two taps
  const twice = (name: string) =>
    act(async () => {
      await fireEvent.press(button(name));
      await fireEvent.press(button(name));
    });
  const toSession = [{ pathname: '/sessions/[id]', params: { id: 'S1' } }, { withAnchor: true }];
  for (const [name, call] of [
    ['Check now', toSession],
    ['Go to Export', ['/export']],
    ['Open the session', toSession],
  ] as const) {
    mockNavigate.mockClear();
    await twice(name);
    expect([name, mockNavigate.mock.calls]).toEqual([name, [call]]);
    await backHome();
  }
  await twice('Import your customers and items, So scans can check names, TINs and prices');
  expect(mockPush.mock.calls).toEqual([['/lists']]);
  await backHome();

  // two cards at once share the one guard (ruling T6-1): only the first opens
  mockNavigate.mockClear();
  mockPush.mockClear();
  await act(async () => {
    await fireEvent.press(button('Check now'));
    await fireEvent.press(button('Go to Export'));
    await fireEvent.press(button('Import your customers and items, So scans can check names, TINs and prices'));
  });
  expect(mockNavigate.mock.calls).toEqual([toSession]);
  expect(mockPush).not.toHaveBeenCalled();
  // and a sample waits too, until Home is on top again
  await press(button('Try a sample invoice'));
  await press(button('Sample 0007, Patrick Hand handwriting'));
  expect(mockScanPhoto).not.toHaveBeenCalled();
  await backHome();
  await press(button('Sample 0007, Patrick Hand handwriting'));
  expect(mockScanPhoto).toHaveBeenCalledTimes(1);
  expect(mockPush).toHaveBeenCalledTimes(1);
  // its Scan screen opened behind the same guard: a card waits until Home is on top again
  mockNavigate.mockClear();
  await press(button('Go to Export'));
  expect(mockNavigate).not.toHaveBeenCalled();

  // the first photo's Open the camera, on a first run
  await screen.unmount();
  recentScans().forEach((s) => forgetScan(s.id));
  await savedAre();
  mockNavigate.mockClear();
  await render(<Home />);
  await twice('Open the camera');
  expect(mockNavigate.mock.calls).toEqual([['/camera']]);
});

test('two quick presses on a sample read it once; while it reads, the card is up', async () => {
  let finish: (v: unknown) => void = () => {};
  mockScanPhoto.mockImplementation(() => new Promise((resolve) => (finish = resolve)));
  await render(<Home />);
  await press(button('Try a sample invoice'));
  const sample = button('Sample 0007, Patrick Hand handwriting');
  await act(async () => {
    await fireEvent.press(sample);
    await fireEvent.press(sample);
  });
  expect(mockScanPhoto).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Reading…')).toBeTruthy();
  await act(async () => finish(parseScanResult(coreJson('inv_0007'))));
  expect(screen.queryByText('Reading…')).toBeNull();
  expect(mockPush).toHaveBeenCalledTimes(1);
});

test('Try a sample invoice opens the samples sheet, which closes', async () => {
  await render(<Home />);
  const open = button('Try a sample invoice');
  expect(open).toHaveStyle({ minHeight: touch.target }); // a text button, at the end
  await press(open);
  expect(header('Sample invoices')).toBeOnTheScreen();
  expect(
    screen.getByText('Filled in with 2 handwriting styles the model never trained on, photographed like a phone would.'),
  ).toBeOnTheScreen();
  // a row per sample: its thumbnail first, then its name and its handwriting
  for (const s of SAMPLES) {
    const font = s.font === 'PatrickHand' ? 'Patrick Hand' : s.font;
    const row = button(`${s.label}, ${font} handwriting`);
    expect(row.children[0]).toHaveProp('source', s.source);
  }
  expect(SAMPLES.map((s) => s.label)).toEqual(['0001', '0007', '0011', '0017', '0027', '0041', '0051', '0091'].map((n) => `Sample ${n}`));
  expect(screen.getAllByText('Caveat handwriting')).toHaveLength(5);
  expect(screen.getAllByText('Patrick Hand handwriting')).toHaveLength(3);

  // Close closes it
  await press(button('Close'));
  expect(screen.queryByText('Sample invoices')).toBeNull();
  expect(mockScanPhoto).not.toHaveBeenCalled();
});

test('the footer', async () => {
  await render(<Home />);
  const words = screen.getByText('Read on this phone · no internet');
  expect(words).toHaveStyle({ ...type.overline, color: colors.mute });
  expect(String(words.props.children).toUpperCase()).toBe('READ ON THIS PHONE · NO INTERNET');
  // a lock before the words, 16 dp, in mute
  const footer = words.parent!;
  const [lock, ...others] = iconsIn(footer, colors.mute);
  expect(others).toHaveLength(0);
  expect(lock.props).toMatchObject({ width: 16, height: 16 });
  expect(footer.children.indexOf(lock)).toBeLessThan(footer.children.indexOf(words));
});
