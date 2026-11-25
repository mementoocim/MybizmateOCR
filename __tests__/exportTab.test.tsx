import { router } from 'expo-router';
import { act, fireEvent, renderRouter, screen, within } from 'expo-router/testing-library';
import { File } from 'expo-file-system';
import { Alert, type AlertButton, StyleSheet } from 'react-native';

import { type IconComponent, Share } from '../components/icons';
import * as exportFile from '../lib/exportFile';
import * as listsStore from '../lib/lists';
import { addParty, clearParties, lists, type Party } from '../lib/lists';
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
import { addScan, type InvoiceKind, type Kind, updateScan } from '../lib/scans';
import { currentSnack, dismissSnack, type SnackAction } from '../lib/snackbar';
import { bar, colors, space, touch, type } from '../lib/theme';
import { parseScanResult } from '../modules/scanner/src/parse';
import { coreJson } from '../test-utils/coreJson';
import { memoryFs } from '../test-utils/memoryFs';
import { appRoutes } from '../test-utils/routes';
import { pinToday } from '../test-utils/today';
import { typeStylesOf } from '../test-utils/typeStyles';

// Spec §6.7 and the plan's calls 13 and 14: the Export tab, the export sheet's steps as screens in the tab's own
// Stack, and See invoices, where Saved's list lives now. Step 1 (/export): each kind with saved scans, how many wait and
// their total, and the parties' file, first when it must go in first; "Everything is sent" with the last export's date,
// or the empty state. A file (/export/[which]): why its last try failed, first; what the file is; what it holds; See
// invoices for a kind; Which ones; today's warnings as banners; then Share the file at its end. Then today's question,
// on the same screen. A double tap shares once and marks once (Review Focus 3), a file error stays on the screen, and
// nothing is marked unless the person says so. See invoices (/export/invoices?kind=): a kind's saved scans, those from
// before the update too (Review Focus 2), each opening its Scan screen; a long press asks to delete. The app's own
// layouts (test-utils/routes), the tab's three screens as they are; the others stand in. The data is made up. The
// global router is the test's own, as Android's back.

const mockToast = jest.fn();
const mockShare = jest.fn(async (_uri: string, _options: object) => {});
const mockAvailable = jest.fn(async () => true);

jest.mock('expo-splash-screen', () => ({ preventAutoHideAsync: jest.fn(async () => {}) }));
jest.mock('../components/BrandSplash', () => ({ BrandSplash: () => null })); // the scanner's start (splash.test)
jest.mock('../modules/scanner', () => ({ scanPhoto: jest.fn(), readPdf: jest.fn() }));
// Ruling P8: the toast's arguments go through as given, so a message without an action is checked by its words alone.
jest.mock('../lib/toast', () => ({ toast: (...args: unknown[]) => mockToast(...args) }));
jest.mock('expo-sharing', () => ({
  shareAsync: (uri: string, options: object) => mockShare(uri, options),
  isAvailableAsync: () => mockAvailable(),
}));
jest.mock('expo-file-system', () => require('../test-utils/memoryFs').memoryFs.module);

/** The real toast, which raises the snackbar: a test that looks at where a message shows lets the calls through. */
const { toast: actualToast } = jest.requireActual<{ toast: (message: string, action?: SnackAction) => void }>(
  '../lib/toast',
);

const ROUTES = appRoutes({
  '(tabs)/export/index': require('../app/(tabs)/export/index'),
  '(tabs)/export/[which]': require('../app/(tabs)/export/[which]'),
  '(tabs)/export/invoices': require('../app/(tabs)/export/invoices'),
});

const NOW = new Date(2026, 9, 5, 10, 0); // Oct 5, 2026: inv_0007, dated Sep 20, is last month's
const LATER = new Date(2026, 9, 5, 10, 5); // when the person answers the question, a while after the share
const SHARED = { mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', dialogTitle: 'Send the file' };
const INVOICE = { taxType: 'VAT', account: '4010', terms: 'cash', atc: '' } as const;
const STEP_1 = 'Send to MyBizMate';
const QUESTION = 'Did the file go where you wanted?';
const FIRST = 'Export these first: they go in before the other files.';
const NOTE =
  "Before you import, fill in each one's City / Municipality, Province and ZIP, and its TIN where it's blank: MyBizMate needs them. Import this file before the sales and purchases that name them.";
const EXPORTED = '2026-09-21T02:00:00.000Z';
/** 60 characters (Review Focus 5). */
const LONG_NAME = 'Isabela Prime Builders and General Merchandise Trading Corp.';
const DELETE_TITLE = 'Delete this saved scan?';
const DELETE_BODY = "It's removed from this phone. Files you already exported don't change.";
const NBSP = String.fromCharCode(0xa0);
/** The tabs' floating bar, as laid out (the raised button on top of it). */
const TAB_BAR = 72;

let saves = 0;
/**
 * inv_0007 (Sep 20, 2026, ₱24,377.00, its customer TorresConstruction Supply as written) saved as a sale, with a
 * customer chosen from the lists when one is given, or as a purchase from Juan Hardware, as typed. Each is saved a
 * second after the last, so a file holds them oldest first.
 */
async function saveInvoice(opts: { purchase?: boolean; customer?: Party } = {}): Promise<string> {
  jest.setSystemTime(new Date(2026, 9, 1, 9, 0, ++saves));
  const id = addScan({ label: 'Camera photo', source: 'camera', result: parseScanResult(coreJson('inv_0007')) });
  if (opts.purchase) updateScan(id, { kind: 'purchase', party: { name: 'Juan Hardware' } });
  else if (opts.customer) updateScan(id, { party: { listId: opts.customer.id } });
  await saveScan(id, INVOICE);
  jest.setSystemTime(NOW);
  return id;
}

/** bir2307_text_1, a text PDF, saved as a 2307: Q4 2026, ₱57,400.54 withheld, its payor Castillo Eatery not a customer. */
async function save2307(): Promise<string> {
  const id = addScan({ label: 'PDF: bir2307_text_1.pdf', source: 'pdf', result: parseScanResult(coreJson('bir2307_text_1')) });
  await saveScan(id, { account: '1205' });
  return id;
}

/** A customer added from a scan: not in MyBizMate yet. */
const addFromScan = (name: string): Promise<Party> =>
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

let summaries = 0;
/**
 * A saved sale or purchase as saved.json keeps it, saved on its own date unless it says otherwise. It has no session:
 * a scan saved before the camera-first update reads the same.
 */
function invoice(kind: InvoiceKind, date: string, extra: Partial<InvoiceSummary> = {}): InvoiceSummary {
  return {
    id: `saved-${++summaries}`,
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
    id: `saved-${++summaries}`,
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

/** The app, opened at a link: the Export tab's first step, a file's, or a kind's See invoices. */
const openAt = (url: string) => renderRouter(ROUTES, { initialUrl: url });
/** See invoices for a kind, with these saved. */
async function showInvoices(kind: Kind, list: readonly SavedSummary[]) {
  await savedAre(list);
  await openAt(`/export/invoices?kind=${kind}`);
}

type Instance = ReturnType<typeof screen.getByText>;
const press = (el: Instance) => act(async () => fireEvent.press(el));
const longPress = (el: Instance) => act(async () => fireEvent(el, 'longPress'));
const button = (name: string | RegExp) => screen.getByRole('button', { name });
const header = (name: string) => screen.getByRole('header', { name });
const radio = (name: string) => screen.getByRole('radio', { name });
/** Android's back. */
const systemBack = () => act(() => router.back());
/** The stand-in on top, if one is: "Camera: on top". */
const onTop = () => screen.queryAllByText(/: on top$/).map((line) => line.props.children);
/** A summary line, as TalkBack says it: its key, then its value. */
const line = (label: string) => screen.getByLabelText(label);
/** A banner, by its words. */
const banner = (text: string) => screen.getByRole('alert', { name: text });
/** The header's texts: the title, and the line under it. */
const headerTexts = () =>
  within(screen.getByTestId('header'))
    .queryAllByText(/./)
    .map((t) => t.props.children);
/** A step's buttons, at its end: in order. */
const actions = () =>
  within(screen.getByTestId('button-row'))
    .getAllByRole('button')
    .map((b) => b.props.accessibilityLabel);
/** Step 1's rows, top to bottom: each as TalkBack says it, and the note under the parties' one. */
const listed = () =>
  screen
    .getByTestId('screen-scroll')
    .queryAll((n) => n.props.accessibilityRole === 'button' || n.props.children === FIRST)
    .map((n) => n.props.accessibilityLabel ?? n.props.children);
/** Where each node sits in the screen's scroll, top to bottom (-1: not in it). */
const positions = (...nodes: Instance[]) => {
  const all = screen.getByTestId('screen-scroll').queryAll(() => true);
  return nodes.map((node) => all.indexOf(node));
};
/** A radio group's options, in order. */
const options = (group: string) =>
  within(screen.getByRole('radiogroup', { name: group }))
    .getAllByRole('radio')
    .map((r) => r.props.accessibilityLabel);
/** See invoices' rows, top to bottom, as TalkBack says them. */
const rows = () =>
  screen
    .getByTestId('invoices-list')
    .queryAll((n) => n.props.accessibilityRole === 'button')
    .map((n) => n.props.accessibilityLabel);
/** The icons under a node drawn in a color. */
const iconsIn = (node: Instance, color: string) => node.queryAll((n) => n.props.stroke === color);
/** A glyph as drawn on its own, to compare with the one a component draws. */
async function drawingOf(Icon: IconComponent, color: string) {
  const { render } = jest.requireActual<typeof import('@testing-library/react-native')>('@testing-library/react-native');
  await render(<Icon size={touch.iconSmall} color={color} />);
  const drawn = screen.root!.toJSON();
  await screen.unmount();
  return drawn;
}
/** The tabs' floating bar lays out, as Android reports it. */
const layOutTabBar = () =>
  act(async () =>
    fireEvent(screen.getByTestId('tab-bar'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 360, height: TAB_BAR } },
    }),
  );

let alert: jest.SpyInstance;
/** Presses a button of the last Alert. */
const answer = (text: string) =>
  act(async () => {
    const buttons = alert.mock.calls.at(-1)![2] as AlertButton[];
    buttons.find((b) => b.text === text)?.onPress?.();
  });

beforeAll(() => pinToday(NOW));
afterAll(() => jest.useRealTimers());

beforeEach(async () => {
  jest.clearAllMocks();
  mockToast.mockReset();
  mockAvailable.mockReset().mockResolvedValue(true);
  mockShare.mockReset().mockResolvedValue(undefined);
  jest.setSystemTime(NOW);
  memoryFs.reset();
  await loadSaved(); // nothing saved
  await clearParties('customer');
  await clearParties('supplier');
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const left = currentSnack(); // a message a test left up, with no host now to take it down
  if (left) dismissSnack(left.id);
});

afterEach(() => jest.restoreAllMocks()); // the spies on the stores, the export and Alert

// ---- Step 1 ----

test("step 1: Sales, Purchases and 2307s, each with its count and total; the parties first when they must go first", async () => {
  const [sent] = [await saveInvoice(), await saveInvoice()];
  await markExported([sent], NOW);
  const cert1 = await save2307();
  await openAt('/export');
  // the mockup's header, with no Back (a tab): how many saved scans wait, by the export's own rule (T17-3)
  expect(header(STEP_1)).toBeOnTheScreen();
  expect(headerTexts()).toEqual([STEP_1, '2 saved, not sent yet']);
  expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  expect(screen.queryByTestId('button-row')).toBeNull(); // its rows are its actions
  // a row per kind with saved scans, in this order, each saying how many wait and their total: no purchase is saved
  expect(listed()).toEqual(['Sales, 1 to export, ₱24,377.00', '2307s, 1 to export, ₱57,400.54']);
  expect(iconsIn(button(/^Sales, /), colors.chevron)).toHaveLength(1);
  expect(typeStylesOf(screen.getByText('₱24,377.00'))).toEqual(['figure']);
  // a kind whose saved scans have all gone out stays, so it can go again; with no total
  await act(async () => markExported([cert1], NOW));
  expect(listed()).toEqual(['Sales, 1 to export, ₱24,377.00', '2307s, All exported']);
  expect(headerTexts()).toEqual([STEP_1, '1 saved, not sent yet']);
  // a count in the figure style, as Home's (§9.2; ruling T18-3); All exported is words, in the label style (T18-5)
  const count = screen.getByText('1 to export');
  expect(typeStylesOf(count)).toEqual(['figureSmall']); // mono: a label of the same size flattens alike here
  expect(count).toHaveStyle({ ...type.figureSmall, color: colors.mute });
  const words = screen.getByText('All exported');
  expect(typeStylesOf(words)).toEqual(['label']);
  expect(words).toHaveStyle({ ...type.label, color: colors.mute });
  await act(async () => {
    await saveInvoice({ purchase: true });
  });
  expect(listed()).toEqual([
    'Sales, 1 to export, ₱24,377.00',
    'Purchases, 1 to export, ₱24,377.00',
    '2307s, All exported',
  ]);

  // a party added from a scan that no waiting scan names: the parties' file, last; new parties aren't counted (§6.7)
  let party!: Party;
  await act(async () => {
    party = await addFromScan('Bagong Tindahan');
  });
  expect(listed()).toEqual([
    'Sales, 1 to export, ₱24,377.00',
    'Purchases, 1 to export, ₱24,377.00',
    '2307s, All exported',
    'New customers and suppliers, 1 to export',
  ]);
  expect(headerTexts()).toEqual([STEP_1, '2 saved, not sent yet']);
  expect(iconsIn(button(/^New customers and suppliers, /), colors.chevron)).toHaveLength(1);
  expect(typeStylesOf(within(button(/^New customers and suppliers, /)).getByText('1 to export'))).toEqual(['figureSmall']);

  // a waiting sale names it: the parties' file comes first, with why under it, in the warning color
  await act(async () => {
    await saveInvoice({ customer: party });
  });
  expect(listed()).toEqual([
    'New customers and suppliers, 1 to export',
    FIRST,
    'Sales, 2 to export, ₱48,754.00',
    'Purchases, 1 to export, ₱24,377.00',
    '2307s, All exported',
  ]);
  const note = screen.getByText(FIRST);
  expect(typeStylesOf(note)).toEqual(['label']);
  expect(note).toHaveStyle({ ...type.label, color: colors.warning });

  // once the party has gone out: All exported, and last again
  await act(async () => listsStore.markPartiesExported([party.id], NOW));
  expect(listed()).toEqual([
    'Sales, 2 to export, ₱48,754.00',
    'Purchases, 1 to export, ₱24,377.00',
    '2307s, All exported',
    'New customers and suppliers, All exported',
  ]);
  expect(typeStylesOf(within(button(/^New customers and suppliers, /)).getByText('All exported'))).toEqual(['label']);

  // a row opens its file, over step 1
  await press(button(/^Purchases, /));
  expect(screen).toHavePathname('/export/purchase');
  expect(header('Export purchases')).toBeOnTheScreen();
  expect(screen.getByText("A file in MyBizMate's Purchases import format, to import at mybizmate.io.")).toBeOnTheScreen();
  expect(line('File, Purchases import · .xlsx')).toBeOnTheScreen();
  expect(line('Purchases, 1 · ₱24,377.00')).toBeOnTheScreen();
  expect(screen.queryByRole('header', { name: STEP_1 })).toBeNull(); // under it
});

test('a row opens its file once, however fast it is tapped twice', async () => {
  await saveInvoice();
  await save2307();
  await openAt('/export');
  await act(async () => {
    await fireEvent.press(button(/^Sales, /));
    await fireEvent.press(button(/^2307s, /));
  });
  expect(header('Export sales')).toBeOnTheScreen();
  await systemBack();
  expect(header(STEP_1)).toBeOnTheScreen();
  await systemBack(); // the camera, with nothing else under step 1
  expect(onTop()).toEqual(['Camera: on top']);
});

test('nothing waiting: Everything is sent, with the last export\'s date, and the kinds stay', async () => {
  const sale = await saveInvoice();
  const form = await save2307();
  await markExported([sale], new Date(2026, 9, 3, 15, 0));
  await markExported([form], new Date(2026, 9, 4, 9, 30)); // the last one sent
  await openAt('/export');
  // no count under the title: nothing waits
  expect(headerTexts()).toEqual([STEP_1]);
  expect(screen.getByText('Everything is sent')).toHaveStyle({ ...type.title, color: colors.ink });
  expect(screen.getByText('Last sent Oct 4, 2026.')).toHaveStyle({ ...type.body, color: colors.mute });
  // the kinds stay under it, since All can still go again (design B's call 13)
  expect(listed()).toEqual(['Sales, All exported', '2307s, All exported']);
  const order = positions(screen.getByText('Everything is sent'), button(/^Sales, /));
  expect(order[0]).toBeLessThan(order[1]);
  await press(button(/^Sales, /));
  await press(radio('All'));
  expect(line('Sales, 1 · ₱24,377.00')).toBeOnTheScreen();

  // one waiting again: the count, and no Everything is sent
  await act(async () => {
    await saveInvoice();
  });
  await systemBack();
  expect(headerTexts()).toEqual([STEP_1, '1 saved, not sent yet']);
  expect(screen.queryByText('Everything is sent')).toBeNull();
  expect(listed()).toEqual(['Sales, 1 to export, ₱24,377.00', '2307s, All exported']);
});

test('nothing saved: the empty state, and the parties when they wait', async () => {
  await openAt('/export');
  expect(headerTexts()).toEqual([STEP_1]);
  expect(screen.getByText('Nothing saved yet')).toHaveStyle({ ...type.title, color: colors.ink });
  expect(screen.getByText('Save a scan and it shows up here, ready to send.')).toHaveStyle({
    ...type.body,
    color: colors.mute,
  });
  expect(listed()).toEqual([]);
  expect(screen.queryByText('Everything is sent')).toBeNull();

  // a party imported from MyBizMate (its code, not from a scan) is in MyBizMate already: nothing to send
  await act(async () => {
    await addParty({
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
    });
  });
  expect(listed()).toEqual([]);

  // a party added from a scan, with nothing saved: its file needs no saved scan (ruling T19-7); not counted (§6.7)
  let party!: Party;
  await act(async () => {
    party = await addFromScan('Bagong Tindahan');
  });
  expect(screen.getByText('Nothing saved yet')).toBeOnTheScreen();
  expect(headerTexts()).toEqual([STEP_1]);
  expect(listed()).toEqual(['New customers and suppliers, 1 to export']);
  await press(button(/^New customers and suppliers, /));
  expect(header('Export new customers and suppliers')).toBeOnTheScreen();
  expect(line('Parties, 1')).toBeOnTheScreen();
  await systemBack();

  // gone out, it can still go again: the row stays
  await act(async () => listsStore.markPartiesExported([party.id], NOW));
  expect(listed()).toEqual(['New customers and suppliers, All exported']);
  await act(async () => clearParties('customer'));
  expect(listed()).toEqual([]);
});

// ---- A file ----

test('Back from a file goes to the files, then the camera', async () => {
  await saveInvoice();
  await save2307();
  // a file opened cold (Home's row, until Task 12) has step 1 under it
  await openAt('/export/sale');
  expect(header('Export sales')).toBeOnTheScreen();
  expect(within(screen.getByTestId('header')).getByRole('button', { name: 'Back' })).toBeOnTheScreen();
  await press(button('Back'));
  expect(screen).toHavePathname('/export');
  expect(header(STEP_1)).toBeOnTheScreen();
  expect(listed()).toEqual(['Sales, 1 to export, ₱24,377.00', '2307s, 1 to export, ₱57,400.54']);

  // another file from there, and Android's back is its Back too
  await press(button(/^2307s, /));
  expect(header('Export 2307s')).toBeOnTheScreen();
  await systemBack();
  expect(header(STEP_1)).toBeOnTheScreen();
  // then the camera, where Back from any tab goes
  await systemBack();
  expect(onTop()).toEqual(['Camera: on top']);
  expect(router.canGoBack()).toBe(false);

  // the parties' file opens at its own file, with Back too
  await screen.unmount();
  await addFromScan('Bagong Tindahan');
  await openAt('/export/parties');
  expect(header('Export new customers and suppliers')).toBeOnTheScreen();
  await press(button('Back'));
  expect(listed()).toEqual([
    'Sales, 1 to export, ₱24,377.00',
    '2307s, 1 to export, ₱57,400.54',
    'New customers and suppliers, 1 to export',
  ]);

  // each file opens at its first choice, whatever the last one was left at
  await press(button(/^Sales, /));
  await press(radio('This month'));
  await press(button('Back'));
  await press(button(/^Sales, /));
  expect(screen.getByRole('radio', { name: 'Not exported yet', checked: true })).toBeOnTheScreen();
  await press(button('Back'));
  await press(button(/^New customers and suppliers, /));
  expect(screen.getByRole('radio', { name: 'Not exported yet', checked: true })).toBeOnTheScreen();
  expect(line('Parties, 1')).toBeOnTheScreen();
});

test("a kind's file: the summary, See invoices, Which ones and today's warnings; Share the file writes once on a double tap", async () => {
  const shareIcon = await drawingOf(Share, colors.ink);
  await saveInvoice();
  await saveInvoice({ purchase: true });
  await openAt('/export/sale');
  // top to bottom: the sentence, the summary, See invoices, Which ones, today's warning, then Share the file
  const sentence = screen.getByText("A file in MyBizMate's Sales import format, to import at mybizmate.io.");
  expect(typeStylesOf(sentence)).toEqual(['body']);
  expect(sentence).toHaveStyle({ color: colors.mute });
  const see = button('See invoices, 1 saved'); // the kind's saved scans: one sale; the purchase isn't one
  expect(iconsIn(see, colors.chevron)).toHaveLength(1);
  const order = positions(
    sentence,
    line('File, Sales import · .xlsx'),
    see,
    screen.getByRole('radiogroup', { name: 'Which ones' }),
    banner('Check that these are in MyBizMate before you import: TorresConstruction Supply.'),
    button('Share the file'),
  );
  expect(order[0]).toBeGreaterThanOrEqual(0);
  expect(order).toEqual([...order].sort((a, b) => a - b));
  // Share the file, the step's one button, with its icon, at its end: the header's Back replaces Close (call 13)
  expect(actions()).toEqual(['Share the file']);
  expect(iconsIn(button('Share the file'), colors.ink).map((icon) => icon.toJSON())).toEqual([shareIcon]);
  expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
  // the step's end clears the floating bar (Review Focus 3)
  await layOutTabBar();
  expect(StyleSheet.flatten(screen.getByTestId('screen-scroll').props.contentContainerStyle)).toMatchObject({
    paddingBottom: TAB_BAR + bar.raise + space.xl,
  });

  // a fast double tap: inside one act() scope, nothing re-renders between the two taps; the file is written once
  const realWrite = exportFile.writeExport;
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  const write = jest.spyOn(exportFile, 'writeExport').mockImplementation(async (...args) => {
    await held;
    return realWrite(...args);
  });
  await act(async () => {
    await fireEvent.press(button('Share the file'));
    await fireEvent.press(button('Share the file'));
  });
  expect(write).toHaveBeenCalledTimes(1);
  await act(async () => release());
  expect(mockShare).toHaveBeenCalledTimes(1);
  expect(header(QUESTION)).toBeOnTheScreen();

  // See invoices opens that kind's saved scans, over the file
  await systemBack();
  await press(button(/^Sales, /));
  await press(button('See invoices, 1 saved'));
  expect(screen).toHavePathname('/export/invoices');
  expect(screen).toHaveSearchParams({ which: 'sale', kind: 'sale' }); // the file's own param stays in the route
  expect(header('Sales')).toBeOnTheScreen();
  expect(rows()).toEqual([`TorresConstruction Supply, Sale · Sep${NBSP}20 · SI 0007655, 24,377.00, To export`]);
  await systemBack();
  expect(header('Export sales')).toBeOnTheScreen();

  // the parties' file has no See invoices: its parties aren't saved scans
  await screen.unmount();
  await addFromScan('Bagong Tindahan');
  await openAt('/export/parties');
  expect(screen.queryByRole('button', { name: /^See invoices/ })).toBeNull();
});

test("the file: its summary, Which ones, and today's warnings as banners", async () => {
  const party = await addFromScan('Bagong Tindahan');
  const named = await saveInvoice({ customer: party }); // its customer was added from a scan
  const asWritten = await saveInvoice(); // TorresConstruction Supply, as written: not in MyBizMate yet either
  await openAt('/export/sale');
  expect(header('Export sales')).toBeOnTheScreen();
  expect(screen.getByText("A file in MyBizMate's Sales import format, to import at mybizmate.io.")).toBeOnTheScreen();

  // the summary: the file, then how many go in it and their gross, in figures
  expect(line('File, Sales import · .xlsx')).toBeOnTheScreen();
  expect(typeStylesOf(screen.getByText('Sales import · .xlsx'))).toEqual(['value']);
  expect(line('Sales, 2 · ₱48,754.00')).toBeOnTheScreen();
  expect(typeStylesOf(screen.getByText('2 · ₱48,754.00'))).toEqual(['figure']);

  // Which ones: today's four, Not exported yet to start
  expect(options('Which ones')).toEqual(['Not exported yet', 'This month', 'Last month', 'All']);
  expect(screen.getByRole('radio', { name: 'Not exported yet', checked: true })).toBeOnTheScreen();

  // today's warning, as a banner: the names MyBizMate may not have yet, and the parties' file first
  const both =
    'Check that these are in MyBizMate before you import: Bagong Tindahan, TorresConstruction Supply. Export new customers and suppliers first: they go in before this file.';
  const names = banner(both);
  expect(names).toHaveStyle({ backgroundColor: colors.warningTint, borderColor: colors.warningLine });
  expect(names.props.accessibilityLiveRegion).toBeUndefined(); // there as the step opens: not read out as news
  expect(screen.getAllByRole('alert')).toHaveLength(1);

  // exported before: its warning, when the choice holds any
  await act(async () => markExported([asWritten], NOW));
  expect(line('Sales, 1 · ₱24,377.00')).toBeOnTheScreen(); // not exported yet: the other one
  expect(screen.queryByRole('alert', { name: /exported before/ })).toBeNull();
  await press(radio('All'));
  expect(line('Sales, 2 · ₱48,754.00')).toBeOnTheScreen();
  expect(banner('1 of them was exported before. Importing it again adds it to MyBizMate twice.')).toBeOnTheScreen();
  expect(banner(both)).toBeOnTheScreen();
  expect(screen.getAllByRole('alert')).toHaveLength(2);

  // once the party has gone out, it's no longer a name to check, nor a file to send first
  await act(async () => listsStore.markPartiesExported([party.id], NOW));
  expect(banner('Check that these are in MyBizMate before you import: TorresConstruction Supply.')).toBeOnTheScreen();
  await act(async () => markExported([named], NOW));
  expect(banner('2 of them were exported before. Importing them again adds them to MyBizMate twice.')).toBeOnTheScreen();

  // the header's Back leaves the file (ruling T18-1's Close, as call 13 has it): step 1
  await press(button('Back'));
  expect(header(STEP_1)).toBeOnTheScreen();
  expect(mockShare).not.toHaveBeenCalled();
});

test("the 2307s' file: the tax withheld, the payor to check, and the question for one", async () => {
  const id = await save2307();
  await openAt('/export/2307');
  expect(header('Export 2307s')).toBeOnTheScreen();
  expect(screen.getByText("A file in MyBizMate's 2307-CWT import format, to import at mybizmate.io.")).toBeOnTheScreen();
  expect(line('File, 2307-CWT import · .xlsx')).toBeOnTheScreen();
  expect(line('2307s, 1 · Tax withheld ₱57,400.54')).toBeOnTheScreen();
  expect(typeStylesOf(screen.getByText('1 · Tax withheld ₱57,400.54'))).toEqual(['figure']);
  expect(options('Which ones')).toEqual(['Not exported yet', 'This month', 'Last month', 'All']);
  expect(banner('Check that these are in MyBizMate before you import: Castillo Eatery.')).toBeOnTheScreen();

  await press(button('Share the file'));
  expect(mockShare).toHaveBeenCalledWith('file:///cache/exports/MyBizMate 2307-CWT import 2026-10-05.xlsx', SHARED);
  expect(screen.getByText('Mark this 2307 as exported, so the next export leaves it out. “All” still includes it.')).toBeOnTheScreen();
  await press(button('Mark 1 as exported'));
  expect(mockToast).toHaveBeenCalledWith('Marked 1 2307 as exported.');
  expect(savedSummary(id)!.exportedAt).toBe(NOW.toISOString());

  // marked, it leaves Not exported yet; All still holds it, and warns that it went before
  expect(header(STEP_1)).toBeOnTheScreen();
  await press(button(/^2307s, /));
  expect(line('2307s, Nothing to export for this choice')).toBeOnTheScreen();
  expect(button('Share the file')).toBeDisabled();
  await press(radio('All'));
  expect(line('2307s, 1 · Tax withheld ₱57,400.54')).toBeOnTheScreen();
  expect(banner('1 of them was exported before. Importing it again adds it to MyBizMate twice.')).toBeOnTheScreen();
});

test('nothing in the choice: Share is disabled', async () => {
  await save2307(); // a 2307 isn't in the sales' file
  const sale = await saveInvoice();
  await markExported([sale], NOW);
  await openAt('/export/sale');
  expect(line('Sales, Nothing to export for this choice')).toBeOnTheScreen();
  expect(typeStylesOf(screen.getByText('Nothing to export for this choice'))).toEqual(['value']); // words, not figures
  expect(button('Share the file')).toBeDisabled();
  await press(button('Share the file'));
  expect(mockShare).not.toHaveBeenCalled();
  expect(screen.queryByText(QUESTION)).toBeNull();

  // All: the one that went out, which can go again
  await press(radio('All'));
  expect(line('Sales, 1 · ₱24,377.00')).toBeOnTheScreen();
  expect(button('Share the file')).toBeEnabled();
  // This month is October, and the sale is dated Sep 20: last month's
  await press(radio('This month'));
  expect(line('Sales, Nothing to export for this choice')).toBeOnTheScreen();
  expect(button('Share the file')).toBeDisabled();
  await press(radio('Last month'));
  expect(line('Sales, 1 · ₱24,377.00')).toBeOnTheScreen();
  expect(button('Share the file')).toBeEnabled();
});

test('Share the file writes once on a double tap', async () => {
  // Review Focus 3: the second tap comes while the file is still being written
  const realWrite = exportFile.writeExport;
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  const write = jest.spyOn(exportFile, 'writeExport').mockImplementation(async (...args) => {
    await held;
    return realWrite(...args);
  });
  await saveInvoice();
  await openAt('/export/sale');
  // A fast double tap: inside one act() scope, nothing re-renders between the two taps.
  await act(async () => {
    await fireEvent.press(button('Share the file'));
    await fireEvent.press(button('Share the file'));
  });
  expect(write).toHaveBeenCalledTimes(1);
  // it loads while the file is written, and a tap then does nothing either
  expect(button('Share the file')).toBeBusy();
  await press(button('Share the file'));
  expect(write).toHaveBeenCalledTimes(1);

  await act(async () => release());
  expect(write).toHaveBeenCalledTimes(1);
  expect(mockShare).toHaveBeenCalledTimes(1);
  expect(header(QUESTION)).toBeOnTheScreen();
});

// ---- The question ----

test('after sharing, the question; Mark N as exported marks them, goes back and says so; Not yet marks nothing; a failed mark stays and says so', async () => {
  const mark = jest.spyOn(savedStore, 'markExported');
  const ids = [await saveInvoice(), await saveInvoice()];
  await openAt('/export/sale');
  await press(button('Share the file'));
  // the question, on the file's screen, read out as it shows; no Back: Not yet is the way out
  expect(header(QUESTION)).toBeOnTheScreen();
  expect(screen).toHavePathname('/export/sale');
  const body = screen.getByText(/^Mark these 2 sales as exported/);
  expect(body.props.accessibilityLiveRegion).toBe('polite');
  expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  expect(actions()).toEqual(['Not yet', 'Mark 2 as exported']);

  // Not yet: back to the files, nothing marked, nothing said
  await press(button('Not yet'));
  expect(header(STEP_1)).toBeOnTheScreen();
  expect(mark).not.toHaveBeenCalled();
  expect(mockToast).not.toHaveBeenCalled();

  // a mark that can't be written stays, and says so first
  await press(button(/^Sales, /));
  await press(button('Share the file'));
  const write = jest.spyOn(File.prototype, 'write').mockRejectedValue(new Error('No space left on device'));
  await press(button('Mark 2 as exported'));
  expect(header(QUESTION)).toBeOnTheScreen();
  expect(banner("Couldn't mark them as exported. Try again.")).toHaveStyle({ backgroundColor: colors.dangerTint });
  expect(mockToast).not.toHaveBeenCalled();
  write.mockRestore();

  // Mark: marked with the share's time, then back to the files, then the snackbar says so
  jest.setSystemTime(LATER);
  await press(button('Mark 2 as exported'));
  expect(mark).toHaveBeenLastCalledWith(ids, NOW);
  for (const id of ids) expect(savedSummary(id)!.exportedAt).toBe(NOW.toISOString());
  expect(header(STEP_1)).toBeOnTheScreen();
  expect(screen).toHavePathname('/export');
  expect(mockToast).toHaveBeenCalledTimes(1);
  expect(mockToast).toHaveBeenCalledWith('Marked 2 sales as exported.');
  expect(mark.mock.invocationCallOrder.at(-1)!).toBeLessThan(mockToast.mock.invocationCallOrder[0]);
});

test('after sharing: the question as a step; Mark N as exported marks them and says so', async () => {
  const mark = jest.spyOn(savedStore, 'markExported');
  const ids = [await saveInvoice(), await saveInvoice()];
  await openAt('/export/sale');
  await press(button('Share the file'));
  expect(mockShare).toHaveBeenCalledWith('file:///cache/exports/MyBizMate Sales import 2026-10-05.xlsx', SHARED);

  // today's question, as a step in place of the Alert
  expect(alert).not.toHaveBeenCalled();
  expect(header(QUESTION)).toBeOnTheScreen();
  const body = screen.getByText(
    'Mark these 2 sales as exported, so the next export leaves them out. “All” still includes them.',
  );
  expect(typeStylesOf(body)).toEqual(['body']);
  expect(body).toHaveStyle({ color: colors.ink });
  expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  expect(actions()).toEqual(['Not yet', 'Mark 2 as exported']);
  expect(mark).not.toHaveBeenCalled(); // nothing is marked until the person says so

  // marked with the share's time, not the answer's; then back; then the snackbar says so
  jest.setSystemTime(LATER);
  await press(button('Mark 2 as exported'));
  expect(mark).toHaveBeenCalledTimes(1);
  expect(mark).toHaveBeenCalledWith(ids, NOW);
  for (const id of ids) expect(savedSummary(id)!.exportedAt).toBe(NOW.toISOString());
  expect(mockToast).toHaveBeenCalledTimes(1);
  expect(mockToast).toHaveBeenCalledWith('Marked 2 sales as exported.');
  expect(header(STEP_1)).toBeOnTheScreen();

  // the next export leaves them out
  await press(button(/^Sales, /));
  expect(line('Sales, Nothing to export for this choice')).toBeOnTheScreen();
});

test('Not yet marks nothing', async () => {
  const mark = jest.spyOn(savedStore, 'markExported');
  const id = await saveInvoice();
  await openAt('/export/sale');
  await press(button('Share the file'));
  expect(screen.getByText('Mark this sale as exported, so the next export leaves it out. “All” still includes it.')).toBeOnTheScreen();
  expect(actions()).toEqual(['Not yet', 'Mark 1 as exported']);
  await press(button('Not yet'));
  expect(header(STEP_1)).toBeOnTheScreen();

  // Android's back leaves the question the same way
  await press(button(/^Sales, /));
  await press(button('Share the file'));
  expect(header(QUESTION)).toBeOnTheScreen();
  await systemBack();
  expect(header(STEP_1)).toBeOnTheScreen();
  expect(mark).not.toHaveBeenCalled();
  expect(savedSummary(id)!.exportedAt).toBeNull();
  expect(mockToast).not.toHaveBeenCalled();

  // it's still waiting, for the next export
  await press(button(/^Sales, /));
  expect(line('Sales, 1 · ₱24,377.00')).toBeOnTheScreen();
});

test('a cancelled share asks the same question', async () => {
  // The share sheet's promise settles when it closes, whether a file went or the person backed out (expo-sharing's
  // OnActivityResult): a cancel looks the same, so it lands on the question, and Not yet covers it.
  mockShare.mockImplementationOnce(async () => undefined);
  const id = await saveInvoice();
  await openAt('/export/sale');
  await press(button('Share the file'));
  expect(mockShare).toHaveBeenCalledTimes(1);
  expect(header(QUESTION)).toBeOnTheScreen();
  expect(screen.getByText('Mark this sale as exported, so the next export leaves it out. “All” still includes it.')).toBeOnTheScreen();
  expect(savedSummary(id)!.exportedAt).toBeNull();
  await press(button('Not yet'));
  expect(savedSummary(id)!.exportedAt).toBeNull();
  expect(mockToast).not.toHaveBeenCalled();
});

test('file errors stay on the screen', async () => {
  await saveInvoice();
  const write = jest.spyOn(exportFile, 'writeExport').mockRejectedValueOnce(new Error('No space left on device'));
  await openAt('/export/sale');

  // the file couldn't be written: why, on the screen, as a banner TalkBack reads out; no share sheet, no question
  await press(button('Share the file'));
  const made = banner("Couldn't make the file.");
  expect(made).toHaveStyle({ backgroundColor: colors.dangerTint, borderColor: colors.dangerLine });
  expect(made.props.accessibilityLiveRegion).toBe('polite');
  expect(header('Export sales')).toBeOnTheScreen();
  expect(mockShare).not.toHaveBeenCalled();
  expect(mockToast).not.toHaveBeenCalled();
  expect(alert).not.toHaveBeenCalled();
  // first, above the sentence and the summary box, so it can't sit below the fold (rulings T18-4, P-F14); today's
  // warning stays under the choice
  const order = positions(
    made,
    screen.getByText("A file in MyBizMate's Sales import format, to import at mybizmate.io."),
    line('File, Sales import · .xlsx'),
    screen.getByRole('radiogroup', { name: 'Which ones' }),
    banner('Check that these are in MyBizMate before you import: TorresConstruction Supply.'),
  );
  expect(order[0]).toBeGreaterThanOrEqual(0);
  expect(order).toEqual([...order].sort((a, b) => a - b));

  // a phone that can't share: its reason, in place of the last one, and no file is written
  mockAvailable.mockResolvedValueOnce(false);
  await press(button('Share the file'));
  expect(banner("This phone can't share files.").props.accessibilityLiveRegion).toBe('polite');
  expect(screen.queryByRole('alert', { name: "Couldn't make the file." })).toBeNull();
  expect(write).toHaveBeenCalledTimes(1);
  expect(mockShare).not.toHaveBeenCalled();

  // the phone failing to say whether it can share: shareFile still settles as a Shared, so it's the file's error,
  // and Share is free again (it never rejects)
  mockAvailable.mockRejectedValueOnce(new Error('Sharing is unavailable'));
  await press(button('Share the file'));
  expect(banner("Couldn't make the file.")).toBeOnTheScreen();
  expect(screen.queryByRole('alert', { name: "This phone can't share files." })).toBeNull();
  expect(button('Share the file')).toBeEnabled();
  expect(write).toHaveBeenCalledTimes(1);
  expect(mockShare).not.toHaveBeenCalled();

  // the share sheet failing to open: as the file failing, the one error in its place
  mockShare.mockRejectedValueOnce(new Error('Failed to share the file'));
  await press(button('Share the file'));
  expect(screen.getAllByRole('alert', { name: "Couldn't make the file." })).toHaveLength(1);
  expect(screen.queryByRole('alert', { name: "This phone can't share files." })).toBeNull();
  // today's warning for the sale's customer, as written, stays as it was: shown with the step, not read out
  const names = banner('Check that these are in MyBizMate before you import: TorresConstruction Supply.');
  expect(names.props.accessibilityLiveRegion).toBeUndefined();
  expect(mockToast).not.toHaveBeenCalled();

  // a try again clears the error while it runs, so the same error once more shows anew, to be read out again
  let available = (_: boolean) => {};
  mockAvailable.mockImplementationOnce(() => new Promise<boolean>((resolve) => (available = resolve)));
  mockShare.mockRejectedValueOnce(new Error('Failed to share the file'));
  await press(button('Share the file'));
  expect(screen.queryByRole('alert', { name: "Couldn't make the file." })).toBeNull();
  await act(async () => available(true));
  expect(banner("Couldn't make the file.")).toBeOnTheScreen();

  // the error is that file's last try: the file opened again from the list starts without it
  await press(button('Back'));
  await press(button(/^Sales, /));
  expect(screen.queryByRole('alert', { name: "Couldn't make the file." })).toBeNull();

  // then it goes: the question, and the error has gone
  mockShare.mockRejectedValueOnce(new Error('Failed to share the file'));
  await press(button('Share the file'));
  expect(banner("Couldn't make the file.")).toBeOnTheScreen();
  await press(button('Share the file'));
  expect(header(QUESTION)).toBeOnTheScreen();
  expect(screen.queryByRole('alert')).toBeNull();
});

test('Mark runs once on a double tap', async () => {
  // Review Focus 3: the second tap comes while the first mark is still being written
  const realMark = savedStore.markExported;
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  const mark = jest.spyOn(savedStore, 'markExported').mockImplementation(async (...args) => {
    await held;
    return realMark(...args);
  });
  const ids = [await saveInvoice(), await saveInvoice()];
  await openAt('/export/sale');
  await press(button('Share the file'));
  // A fast double tap: inside one act() scope, nothing re-renders between the two taps.
  await act(async () => {
    await fireEvent.press(button('Mark 2 as exported'));
    await fireEvent.press(button('Mark 2 as exported'));
  });
  expect(mark).toHaveBeenCalledTimes(1);
  // it loads while the marks are written, and a tap then does nothing either
  expect(button('Mark 2 as exported')).toBeBusy();
  await press(button('Mark 2 as exported'));
  expect(mark).toHaveBeenCalledTimes(1);

  await act(async () => release());
  expect(mark).toHaveBeenCalledTimes(1);
  expect(mark).toHaveBeenCalledWith(ids, NOW);
  expect(mockToast).toHaveBeenCalledTimes(1);
  expect(mockToast).toHaveBeenCalledWith('Marked 2 sales as exported.');
  expect(header(STEP_1)).toBeOnTheScreen();
  expect(onTop()).toEqual([]); // back once: step 1, not the camera
});

test("a mark that can't be written says so on the screen, marks nothing, and runs again (final review, Important 2)", async () => {
  // A full phone: no file can be written, saved.json included. Nothing shows as exported meanwhile, so nothing goes back
  // to To export at the next start with no warning, to be imported twice.
  const ids = [await saveInvoice(), await saveInvoice()];
  await openAt('/export/sale');
  await press(button('Share the file'));
  const write = jest.spyOn(File.prototype, 'write').mockRejectedValue(new Error('No space left on device'));
  await press(button('Mark 2 as exported'));
  // the question stays, with why first in it, as a banner TalkBack reads out
  expect(header(QUESTION)).toBeOnTheScreen();
  const why = banner("Couldn't mark them as exported. Try again.");
  expect(why).toHaveStyle({ backgroundColor: colors.dangerTint, borderColor: colors.dangerLine });
  expect(why.props.accessibilityLiveRegion).toBe('polite');
  const order = positions(why, screen.getByText(/^Mark these 2 sales as exported/));
  expect(order[0]).toBeGreaterThanOrEqual(0);
  expect(order[0]).toBeLessThan(order[1]);
  for (const id of ids) expect(savedSummary(id)!.exportedAt).toBeNull();
  expect(mockToast).not.toHaveBeenCalled();
  expect(button('Mark 2 as exported')).toBeEnabled();

  // with room again, Mark again: the banner goes while it runs; once written, they're marked, the screen goes back and
  // the snackbar says so
  write.mockRestore();
  const realMark = savedStore.markExported;
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  jest.spyOn(savedStore, 'markExported').mockImplementationOnce(async (...args) => {
    await held;
    return realMark(...args);
  });
  await press(button('Mark 2 as exported'));
  expect(screen.queryByRole('alert')).toBeNull();
  await act(async () => release());
  for (const id of ids) expect(savedSummary(id)!.exportedAt).toBe(NOW.toISOString());
  expect(mockToast).toHaveBeenCalledWith('Marked 2 sales as exported.');
  expect(header(STEP_1)).toBeOnTheScreen();
});

test('a mark that finishes after the person has left: no going back, no message (ruling T8-3)', async () => {
  const realMark = savedStore.markExported;
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  jest.spyOn(savedStore, 'markExported').mockImplementationOnce(async (...args) => {
    await held;
    return realMark(...args);
  });
  const id = await saveInvoice();
  await openAt('/export/sale');
  await press(button('Share the file'));
  await press(button('Mark 1 as exported'));
  // another tab while it's written
  await act(async () => fireEvent.press(screen.getByRole('tab', { name: 'Home' })));
  expect(onTop()).toEqual(['Home: on top']);
  await act(async () => release());
  expect(savedSummary(id)!.exportedAt).toBe(NOW.toISOString());
  expect(onTop()).toEqual(['Home: on top']);
  expect(mockToast).not.toHaveBeenCalled();
});

test('the parties file: All added from scans in the question', async () => {
  const mark = jest.spyOn(listsStore, 'markPartiesExported');
  const first = await addFromScan('Bagong Tindahan');
  await openAt('/export/parties');
  expect(header('Export new customers and suppliers')).toBeOnTheScreen();
  expect(
    screen.getByText("A file in MyBizMate's Parties import format, with the customers and suppliers you added from scans."),
  ).toBeOnTheScreen();
  expect(line('File, Parties import · .xlsx')).toBeOnTheScreen();
  expect(line('Parties, 1')).toBeOnTheScreen();
  expect(typeStylesOf(screen.getByText('1'))).toEqual(['figure']);
  expect(options('Which ones')).toEqual(['Not exported yet', 'All added from scans']);
  // today's note, as body text; no warning yet
  expect(typeStylesOf(screen.getByText(NOTE))).toEqual(['body']);
  expect(screen.queryAllByRole('alert')).toHaveLength(0);

  await press(button('Share the file'));
  expect(mockShare).toHaveBeenCalledWith('file:///cache/exports/MyBizMate Parties import 2026-10-05.xlsx', SHARED);
  expect(
    screen.getByText(
      'Mark this party as exported, so the next file leaves it out. “All added from scans” still includes it.',
    ),
  ).toBeOnTheScreen();
  jest.setSystemTime(LATER);
  await press(button('Mark 1 as exported'));
  expect(mark).toHaveBeenCalledWith([first.id], NOW);
  expect(lists().parties.find((p) => p.id === first.id)!.exportedAt).toBe(NOW.toISOString());
  expect(mockToast).toHaveBeenCalledWith('Marked 1 party as exported.');

  // the next file leaves it out; All added from scans still has it, with today's warning; the question counts both
  jest.setSystemTime(NOW);
  let second!: Party;
  await act(async () => {
    second = await addFromScan('Isabela Wholesale Trading');
  });
  await press(button(/^New customers and suppliers, /));
  expect(line('Parties, 1')).toBeOnTheScreen();
  await press(radio('All added from scans'));
  expect(line('Parties, 2')).toBeOnTheScreen();
  expect(banner('1 of them was exported before. Importing it again adds it to MyBizMate twice.')).toBeOnTheScreen();
  await press(button('Share the file'));
  expect(
    screen.getByText(
      'Mark these 2 parties as exported, so the next file leaves them out. “All added from scans” still includes them.',
    ),
  ).toBeOnTheScreen();
  await press(button('Mark 2 as exported'));
  expect(mark).toHaveBeenLastCalledWith([first.id, second.id], NOW);
  expect(mockToast).toHaveBeenLastCalledWith('Marked 2 parties as exported.');
});

test("the export's message sits above the floating bar", async () => {
  // Review Focus 3: the root host's message, over a tab, clears the tabs' bar
  mockToast.mockImplementation(actualToast);
  await saveInvoice();
  await openAt('/export/sale');
  await layOutTabBar();
  await press(button('Share the file'));
  await press(button('Mark 1 as exported'));
  expect(within(screen.getByTestId('snackbar')).getByText('Marked 1 sale as exported.')).toBeOnTheScreen();
  expect(screen.getByTestId('snackbar')).toHaveStyle({ bottom: TAB_BAR + bar.raise + space.s });
});

// ---- See invoices (Saved's list) ----

test("See invoices: that kind's saved scans, To export or Exported, a scan from before too; a row opens its Scan screen; a long press asks to delete", async () => {
  // Review Focus 2: summary-only scans with no session, as an earlier version saved them; only Store A's folder is
  // still on the phone, as scan.json
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
    saved: { savedAt: '2026-10-05T01:00:00.000Z', details: INVOICE },
  };
  memoryFs.files.set('file:///docs/saved/a/scan.json', JSON.stringify(scan));
  await showInvoices('sale', [
    invoice('sale', '2026-10-05', { id: 'a', partyName: 'Store A' }),
    invoice('sale', '2026-10-06', { id: 'b', partyName: 'Store B', exportedAt: EXPORTED }),
    invoice('purchase', '2026-10-07', { partyName: 'Juan Hardware' }), // not a sale: not in this list
    cert('Q4 2026', '2026-12-31'),
  ]);
  // the kind's plural, with how many of its saved scans wait, and Back
  expect(headerTexts()).toEqual(['Sales', '1 to export']);
  expect(within(screen.getByTestId('header')).getByRole('button', { name: 'Back' })).toBeOnTheScreen();
  expect(rows()).toEqual([
    `Store B, Sale · Oct${NBSP}6, 100.00, Exported`,
    `Store A, Sale · Oct${NBSP}5, 100.00, To export`,
  ]);

  // a row opens its Scan screen, once however fast it's tapped twice, read back first, from a list
  await act(async () => {
    await fireEvent.press(button(/^Store A, /));
    await fireEvent.press(button(/^Store A, /));
  });
  expect(screen).toHavePathname('/result');
  expect(screen).toHaveSearchParams({ id: 'a', from: 'list' });
  expect(onTop()).toEqual(['Scan: on top']);
  await systemBack();
  expect(header('Sales')).toBeOnTheScreen();
  // one whose folder has gone says so, and stays (a scan, as this list may hold 2307s: ruling T19-3)
  await press(button(/^Store B, /));
  expect(mockToast).toHaveBeenCalledWith("Couldn't open that scan.");
  expect(header('Sales')).toBeOnTheScreen();

  // a long press asks to delete it, in the Scan screen's ⋮ words; Delete deletes it
  expect(button(/^Store A, /).props.accessibilityHint).toBe('Long-press to delete');
  await longPress(button(/^Store A, /));
  expect(alert).toHaveBeenCalledWith(DELETE_TITLE, DELETE_BODY, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: expect.any(Function) },
  ]);
  await answer('Delete');
  expect(savedSummary('a')).toBeUndefined();
  expect(memoryFs.files.has('file:///docs/saved/a/scan.json')).toBe(false);
  expect(rows()).toEqual([`Store B, Sale · Oct${NBSP}6, 100.00, Exported`]);
  expect(headerTexts()).toEqual(['Sales', 'All exported']);

  // the list's end clears the floating bar (Review Focus 3)
  await layOutTabBar();
  expect(StyleSheet.flatten(screen.getByTestId('invoices-list').props.contentContainerStyle)).toMatchObject({
    paddingBottom: TAB_BAR + bar.raise + space.xl,
  });

  // the 2307s' and the purchases' lists, each its own
  await screen.unmount();
  await openAt('/export/invoices?kind=2307');
  expect(headerTexts()).toEqual(['2307s', '1 to export']);
  expect(rows()).toEqual(['Castillo Eatery, 2307 · Q4 2026, 1,000.00, To export']);
  await screen.unmount();
  await openAt('/export/invoices?kind=purchase');
  expect(headerTexts()).toEqual(['Purchases', '1 to export']);
  expect(rows()).toEqual([`Juan Hardware, Purchase · Oct${NBSP}7, 100.00, To export`]);
  // Back: step 1, then the camera
  await press(button('Back'));
  expect(header(STEP_1)).toBeOnTheScreen();
});

test('See invoices: by the document\'s date, newest first, then the time saved', async () => {
  await showInvoices('sale', [
    // dated before Store B, but saved after it: the list goes by the date, newest first, not by the save
    invoice('sale', '2026-11-05', { partyName: 'Store A', savedAt: '2026-11-21T10:00:00.000Z' }),
    invoice('sale', '2026-11-20', { partyName: 'Store B', savedAt: '2026-11-20T09:00:00.000Z' }),
    invoice('sale', '2026-11-20', { partyName: 'Store C', savedAt: '2026-11-21T09:00:00.000Z' }),
    invoice('sale', '2026-10-02', { partyName: 'Store D', savedAt: '2026-11-22T09:00:00.000Z' }),
  ]);
  expect(rows()).toEqual([
    `Store C, Sale · Nov${NBSP}20, 100.00, To export`, // the same date: the one saved later comes first
    `Store B, Sale · Nov${NBSP}20, 100.00, To export`,
    `Store A, Sale · Nov${NBSP}5, 100.00, To export`,
    `Store D, Sale · Oct${NBSP}2, 100.00, To export`,
  ]);
  // a Q1 2307, saved last of all, goes by its period's end
  await screen.unmount();
  await showInvoices('2307', [
    cert('Q1 2026', '2026-03-31', { partyName: 'Payor A', savedAt: '2026-11-23T09:00:00.000Z' }),
    cert('Q3 2026', '2026-09-30', { partyName: 'Payor B', savedAt: '2026-10-01T09:00:00.000Z' }),
  ]);
  expect(rows()).toEqual([
    'Payor B, 2307 · Q3 2026, 1,000.00, To export',
    'Payor A, 2307 · Q1 2026, 1,000.00, To export',
  ]);
});

test("a date that can't be read is a dash in the row", async () => {
  // A scan with no date can't be saved (saveBlock); a saved.json that holds one anyway still reads, as prettyDate's
  // '—' had it: an empty date, and one with no such month.
  await showInvoices('sale', [
    invoice('sale', '2026-11-20', { partyName: 'Store A' }),
    invoice('sale', '', { partyName: 'Store B' }),
    invoice('sale', '2026-13-05', { partyName: 'Store C' }),
  ]);
  expect(rows()).toEqual([
    'Store C, Sale · —, 100.00, To export',
    `Store A, Sale · Nov${NBSP}20, 100.00, To export`,
    'Store B, Sale · —, 100.00, To export',
  ]);
});

test("a row is To export by its scan's id, whatever object the export's rule hands back", async () => {
  // lib/exportFile's waitingOf decides what waits; here it answers with copies of the saved scans
  const rule = exportFile.waitingOf;
  jest.spyOn(exportFile, 'waitingOf').mockImplementation((kind, list) => rule(kind, list).map((s) => ({ ...s })));
  await showInvoices('sale', [
    invoice('sale', '2026-11-20', { partyName: 'Store A' }),
    invoice('sale', '2026-11-18', { partyName: 'Store B', exportedAt: EXPORTED }),
  ]);
  expect(headerTexts()).toEqual(['Sales', '1 to export']);
  expect(rows()).toEqual([
    `Store A, Sale · Nov${NBSP}20, 100.00, To export`,
    `Store B, Sale · Nov${NBSP}18, 100.00, Exported`,
  ]);
});

test('a row: the party, kind · date · number, the amount and its badge', async () => {
  await showInvoices('sale', [
    invoice('sale', '2026-11-22', {
      gross: 24377,
      row: { 'Date *': '2026-11-22', 'Gross *': 24377, 'SI/OR No.': '5184138' },
    }),
    invoice('sale', '2026-11-18', {
      partyName: 'Juan Hardware',
      gross: 1500.5,
      row: { 'Date *': '2026-11-18', 'Gross *': 1500.5, 'SI/OR No.': '0007' },
      exportedAt: EXPORTED,
    }),
    invoice('sale', '2026-11-10', { partyName: '', gross: 7.5 }), // no party yet: its label; no number
    invoice('sale', '2026-11-08', { partyName: LONG_NAME, gross: 12345678.9 }),
  ]);
  // one stop for TalkBack: the party, the sub-line, the amount and the badge (ruling T4-4)
  expect(rows()).toEqual([
    `Torres Construction Supply, Sale · Nov${NBSP}22 · SI 5184138, 24,377.00, To export`,
    `Juan Hardware, Sale · Nov${NBSP}18 · SI 0007, 1,500.50, Exported`,
    `Camera photo, Sale · Nov${NBSP}10, 7.50, To export`,
    `${LONG_NAME}, Sale · Nov${NBSP}8, 12,345,678.90, To export`,
  ]);

  const sale = button(/^Torres Construction Supply, /);
  expect(within(sale).getByText('Torres Construction Supply')).toHaveStyle({ ...type.value, color: colors.ink });
  expect(typeStylesOf(within(sale).getByText('Torres Construction Supply'))).toEqual(['value']); // not button
  // the sub-line in mono, in caps by the style ("SALE · NOV 22 · SI 5184138"); TalkBack hears the words
  const sub = within(sale).getByText(`Sale · Nov${NBSP}22 · SI 5184138`);
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

  // a purchase's number is its Inv No.; a 2307's sub is its quarter, and its amount the tax withheld
  await screen.unmount();
  await showInvoices('purchase', [
    invoice('purchase', '2026-11-18', {
      partyName: 'Juan Hardware',
      gross: 1500.5,
      row: { 'Date *': '2026-11-18', 'Gross *': 1500.5, 'Inv No.': '0007' },
    }),
  ]);
  expect(rows()).toEqual([`Juan Hardware, Purchase · Nov${NBSP}18 · Inv 0007, 1,500.50, To export`]);
  await screen.unmount();
  await showInvoices('2307', [cert('Q4 2026', '2026-12-31', { tax: 57400.54 })]);
  expect(rows()).toEqual(['Castillo Eatery, 2307 · Q4 2026, 57,400.54, To export']);
});

test('as the app saves them: a sale with its SI number, and a 2307 with its payor and tax withheld', async () => {
  // inv_0007 (Sep 20, 2026, ₱24,377.00, SI 0007655, its customer as written) and bir2307_text_1 (Q4 2026, ₱57,400.54
  // withheld, its payor not in the customers), saved as the Scan screen saves them
  await saveInvoice();
  await save2307();
  await openAt('/export/invoices?kind=sale');
  expect(rows()).toEqual([`TorresConstruction Supply, Sale · Sep${NBSP}20 · SI 0007655, 24,377.00, To export`]);
  await screen.unmount();
  await openAt('/export/invoices?kind=2307');
  expect(rows()).toEqual(['Castillo Eatery, 2307 · Q4 2026, 57,400.54, To export']);
});

test('a long press asks to delete, in the new words; a delete that fails says so', async () => {
  const a = invoice('sale', '2026-11-20', { partyName: 'Store A' });
  const b = invoice('sale', '2026-11-05', { partyName: 'Store C' });
  await showInvoices('sale', [a, b, cert('Q4 2026', '2026-12-31')]);
  await longPress(button(/^Store A, /));
  await answer('Cancel');
  expect(savedSummary(a.id)).toBeDefined();
  expect(rows()).toHaveLength(2);

  await longPress(button(/^Store A, /));
  await answer('Delete');
  expect(savedSummary(a.id)).toBeUndefined();
  expect(screen.queryByText('Store A')).toBeNull();
  expect(headerTexts()).toEqual(['Sales', '1 to export']);
  expect(mockToast).not.toHaveBeenCalled();

  // a delete that fails says so, and the row stays (ruling T19-2)
  jest.spyOn(savedStore, 'deleteSaved').mockRejectedValueOnce(new Error('EACCES: permission denied'));
  await longPress(button(/^Store C, /));
  await answer('Delete');
  expect(mockToast).toHaveBeenCalledTimes(1);
  expect(mockToast).toHaveBeenCalledWith("Couldn't delete the scan.");
  expect(button(/^Store C, /)).toBeOnTheScreen();
  expect(savedSummary(b.id)).toBeDefined();
});

test('a kind with nothing: No purchases saved', async () => {
  await showInvoices('purchase', [invoice('sale', '2026-11-20', { partyName: 'Store A' }), cert('Q4 2026', '2026-12-31')]);
  expect(screen.getByText('No purchases saved')).toHaveStyle({ ...type.title, color: colors.ink });
  expect(headerTexts()).toEqual(['Purchases']); // nothing of its own to count
  expect(rows()).toEqual([]);

  // the last of a kind deleted: its own words
  await screen.unmount();
  await openAt('/export/invoices?kind=2307');
  await longPress(button(/^Castillo Eatery, /));
  await answer('Delete');
  expect(screen.getByText('No 2307s saved')).toBeOnTheScreen();
  expect(headerTexts()).toEqual(['2307s']);
  // with nothing saved at all, sales say the same
  await screen.unmount();
  await showInvoices('sale', []);
  expect(screen.getByText('No sales saved')).toBeOnTheScreen();
});
