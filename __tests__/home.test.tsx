import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { Alert } from 'react-native';

import Home from '../app/index';
import { addItem, addParty, clearItems, clearParties } from '../lib/lists';
import { loadSaved } from '../lib/saved';
import { SAMPLES } from '../lib/samples';
import { addScan, forgetScan, recentScans } from '../lib/scans';
import { settings, updateSettings } from '../lib/settings';
import { colors, touch, type } from '../lib/theme';
import { parseScanResult } from '../modules/scanner/src/parse';
import { coreJson } from '../test-utils/coreJson';
import { dialogWords } from '../test-utils/dialogs';
import { memoryFs } from '../test-utils/memoryFs';
import { focusAgain } from '../test-utils/screenFocus';
import { pinToday } from '../test-utils/today';
import { typeStylesOf } from '../test-utils/typeStyles';

// Design B §9.2: Home as a workspace. The header's wordmark and two icon buttons; capture first; on a first run, the
// tips; "Get set up" until it's done, once; what's waiting to export, per kind; the recent scans with their state;
// then the samples and the footer. A capture that fails says why in a dialog (the plan's call 16).

let mockTeam = false;
const mockPush = jest.fn();
const mockScanPhoto = jest.fn();
const mockLibrary = jest.fn();
const mockPick = jest.fn();
const mockReadPdf = jest.fn();

jest.mock('expo-router', () => ({
  useNavigation: () => ({ canGoBack: () => true, goBack: jest.fn() }), // going back (lib/navigation)
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  // a screen's pushes run once until it's focused again (lib/navigation)
  useFocusEffect: (effect: () => void) => require('../test-utils/screenFocus').useFocusEffect(effect),
  useIsFocused: () => true,
}));
jest.mock('../modules/scanner', () => ({
  scanPhoto: (uri: string, options: object) => mockScanPhoto(uri, options),
  readPdf: (uri: string) => mockReadPdf(uri),
  displayName: async () => 'locked.pdf',
  releaseAccess: async () => undefined,
}));
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
jest.mock('expo-asset', () => ({
  Asset: { fromModule: () => ({ downloadAsync: async () => ({ localUri: 'file:///bundle/sample.jpg' }) }) },
}));
jest.mock('expo-file-system', () => {
  const memory = require('../test-utils/memoryFs').memoryFs.module;
  return { ...memory, File: Object.assign(memory.File, { pickFileAsync: (options: object) => mockPick(options) }) };
});

beforeAll(() => {
  pinToday(new Date(2026, 10, 20, 9, 0)); // a gallery scan is checked as of the day it's read
});

afterAll(() => {
  jest.useRealTimers();
});

let alert: jest.SpyInstance;

beforeEach(async () => {
  jest.clearAllMocks();
  mockTeam = false;
  mockLibrary.mockResolvedValue({ canceled: false, assets: [{ uri: 'content://media/1' }] });
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
async function savedAre(...summaries: ReturnType<typeof summary>[]) {
  memoryFs.files.set('file:///docs/saved.json', JSON.stringify(summaries));
  await act(async () => loadSaved());
}

/** Home's To export rows, top to bottom, by what TalkBack says. */
const exportRows = () => screen.getAllByRole('button', { name: /to export/ }).map((r) => r.props.accessibilityLabel);

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

test('the header: the wordmark, Your lists and Settings; no menu', async () => {
  for (const team of [false, true]) {
    mockTeam = team; // a team build has the speed test in Settings › Team tools, never on Home
    await render(<Home />);
    expect(header('mybizmate.io')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^More/ })).toBeNull(); // the ⋮ menu went
    expect(screen.queryByTestId('menu')).toBeNull();
    expect(screen.queryByText('Saved invoices')).toBeNull();
    expect(screen.queryByText('Speed test')).toBeNull();
    await screen.unmount();
  }

  await render(<Home />);
  const top = within(screen.getByTestId('header'));
  for (const name of ['Your lists', 'Settings']) {
    expect(top.getByRole('button', { name })).toHaveStyle({ width: touch.target, height: touch.target });
  }
  await press(top.getByRole('button', { name: 'Your lists' }));
  expect(mockPush).toHaveBeenLastCalledWith('/lists');
  await backHome();
  await press(top.getByRole('button', { name: 'Settings' }));
  expect(mockPush).toHaveBeenLastCalledWith('/settings');
});

test('a press opens its screen once, until Home is on top again (final review, Minor 4)', async () => {
  // a double tap on Take photo pushed two cameras, one over the other
  await render(<Home />);
  // A fast double tap: inside one act() scope, nothing re-renders between the two taps.
  await act(async () => {
    await fireEvent.press(button('Take photo'));
    await fireEvent.press(button('Take photo'));
  });
  expect(mockPush.mock.calls).toEqual([['/camera']]);
  // the screen's other presses too, while the camera opens over it
  await press(within(screen.getByTestId('header')).getByRole('button', { name: 'Settings' }));
  expect(mockPush.mock.calls).toEqual([['/camera']]);
  // back on Home, a press opens its screen again
  await backHome();
  await press(button('Take photo'));
  expect(mockPush.mock.calls).toEqual([['/camera'], ['/camera']]);
});

test('capture: Take photo, From gallery, Import PDF, and what it reads', async () => {
  await render(<Home />);
  // Take photo: primary and large, on a line of its own
  const take = button('Take photo');
  expect(take).toHaveStyle({ minHeight: 56, backgroundColor: colors.brand });
  await press(take);
  expect(mockPush).toHaveBeenLastCalledWith('/camera');

  // under it, side by side: From gallery and Import PDF, both secondary
  const row = within(screen.getByTestId('button-row'));
  expect(row.queryByRole('button', { name: 'Take photo' })).toBeNull();
  const gallery = row.getByRole('button', { name: 'From gallery' });
  const pdf = row.getByRole('button', { name: 'Import PDF' });
  for (const b of [gallery, pdf]) expect(b).toHaveStyle({ backgroundColor: colors.panel, borderColor: colors.outline });

  // what it reads, in caps by the overline style
  const caption = screen.getByText('MyBizMate invoice · Service Invoice · BIR 2307');
  expect(caption).toHaveStyle({ ...type.overline, color: colors.mute, textAlign: 'center' });
  // the form's name stays on one line: a no-break space joins BIR and 2307 (QA pass 1 had "… · BIR" / "2307")
  expect(String(caption.props.children).toUpperCase()).toBe('MYBIZMATE INVOICE · SERVICE INVOICE · BIR\u00A02307');

  // From gallery reads the photo and opens its result. The picker hands over its own copy in the app's cache; the
  // scanner deletes only files inside the cache, never the person's photo.
  await press(gallery);
  expect(mockScanPhoto).toHaveBeenCalledWith('content://media/1', { deletePhoto: true });
  expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/result', params: { id: expect.any(String) } });

  // Import PDF opens the system's file picker, for PDFs
  mockPick.mockResolvedValue({ canceled: true, result: null });
  await press(pdf);
  expect(mockPick).toHaveBeenCalledWith({ mimeTypes: ['application/pdf'] });
});

test('two quick presses scan once; while it reads, the card is up and capture waits', async () => {
  let finish: (v: unknown) => void = () => {};
  mockScanPhoto.mockImplementation(() => new Promise((resolve) => (finish = resolve)));
  await render(<Home />);
  // A fast double tap: inside one act() scope, React doesn't re-render the button as busy between the two presses.
  await act(async () => {
    await fireEvent.press(button('From gallery'));
    await fireEvent.press(button('From gallery'));
  });
  expect(mockScanPhoto).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Reading…')).toBeTruthy();
  expect(screen.getByText('Straightening the photo and reading every box')).toBeTruthy();
  for (const name of ['Take photo', 'From gallery', 'Import PDF']) expect(button(name)).toBeDisabled();
  await act(async () => finish(parseScanResult(coreJson('inv_0007'))));
  expect(screen.queryByText('Reading…')).toBeNull();
  for (const name of ['Take photo', 'From gallery', 'Import PDF']) expect(button(name)).toBeEnabled();
});

test('a refused PDF says why in a dialog', async () => {
  const file = 'content://com.android.externalstorage.documents/document/primary%3ADownload%2Flocked.pdf';
  const result = { uri: file, name: 'locked.pdf', type: 'application/pdf' };
  mockPick.mockResolvedValueOnce({ canceled: false, result });
  mockReadPdf.mockRejectedValueOnce(Object.assign(new Error('refused'), { code: 'pdf_password' }));
  await render(<Home />);
  await act(async () => fireEvent.press(screen.getByText('Import PDF')));
  // the reason, then what to do
  expect(dialogWords(alert)).toEqual([['That PDF has a password.', 'Save a copy without one, then import it.']]);
  expect(screen.queryByText('Reading…')).toBeNull();
  expect(mockPush).not.toHaveBeenCalled();
});

test('first run: the tips until the first scan, and a sample counts', async () => {
  await render(<Home />);
  expect(header('Before your first scan')).toBeOnTheScreen();
  const tips = ['The whole form in the photo', 'Flat on a table, in good light', 'Phone straight above it, no shadows'];
  tips.forEach((tip, i) => {
    expect(screen.getByText(tip)).toHaveStyle({ ...type.body, color: colors.ink });
    expect(screen.getByText(`${i + 1}`)).toHaveStyle({ ...type.figure, color: colors.brandText });
  });

  // a sample is a first scan too
  await press(button('Try a sample invoice'));
  await press(button('Sample 0007, Patrick Hand handwriting'));
  expect(recentScans()).toHaveLength(1);
  expect(screen.queryByText('Before your first scan')).toBeNull();
  for (const tip of tips) expect(screen.queryByText(tip)).toBeNull();

  // with no recent scan left, a saved one is enough
  await savedAre(summary('sale', 100));
  await act(async () => recentScans().forEach((s) => forgetScan(s.id)));
  expect(screen.queryByText('Before your first scan')).toBeNull();
});

test('Get set up: two rows, each checked when done, then gone for good', async () => {
  await render(<Home />);
  expect(header('Get set up')).toBeOnTheScreen();
  expect(screen.getByText('0 of 2')).toBeOnTheScreen();
  const listsRow = () => button('Import your customers and items, So scans can check names, TINs and prices');
  const defaultsRow = () => button('Set your export defaults, VAT status and accounts for MyBizMate');
  const done = (row: Instance) => row.props.accessibilityState?.checked;
  expect([done(listsRow()), done(defaultsRow())]).toEqual([false, false]);
  expect(iconsIn(listsRow(), colors.chevron)).toHaveLength(1);
  await press(listsRow());
  expect(mockPush).toHaveBeenLastCalledWith('/lists');
  await backHome();
  await press(defaultsRow());
  expect(mockPush).toHaveBeenLastCalledWith('/settings');

  // the lists: any row in them, an item as much as a party
  await act(async () => {
    await addItem({ name: 'Cement 40kg', unit: 'bag', price: 250 });
  });
  expect(done(listsRow())).toBe(true);
  expect(iconsIn(listsRow(), colors.success)).toHaveLength(1); // a check in the chevron's place
  expect(screen.getByText('1 of 2')).toBeOnTheScreen();
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

  // both done: the section goes, for good, with nothing scanned yet
  expect(screen.queryByText('Get set up')).toBeNull();
  expect(screen.queryByText('Import your customers and items')).toBeNull();
  expect(settings().setupDone).toBe(true);
  expect(header('Before your first scan')).toBeOnTheScreen();
  await act(async () => clearParties('customer'));
  await act(async () => updateSettings({ vatRegistered: null, revenueAccount: '' }));
  expect(screen.queryByText('Get set up')).toBeNull();
  await screen.unmount();
  await render(<Home />);
  expect(screen.queryByText('Get set up')).toBeNull();
  expect(settings().setupDone).toBe(true);
});

test('To export: a row per kind with its count and total; a row opens Saved for its kind', async () => {
  await render(<Home />);
  expect(screen.queryByText('To export')).toBeNull(); // nothing saved: no section
  expect(screen.queryByText('Saved')).toBeNull();

  await savedAre(
    summary('sale', 1200.5),
    summary('sale', 38240),
    summary('sale', 999, EXPORTED), // gone out already: not waiting
    summary('purchase', 5000, EXPORTED),
    summary('2307', 4160.86),
  );
  expect(header('To export')).toBeOnTheScreen();
  // every purchase went out, so there's no Purchases row
  expect(exportRows()).toEqual(['Sales, 2 to export, ₱39,440.50', '2307s, 1 to export · Tax withheld, ₱4,160.86']);
  expect(screen.getByText('₱39,440.50')).toHaveStyle({ ...type.figure, textAlign: 'right' });
  // the counts in the figure style too (design §9.2): figureSmall, in mute
  for (const count of ['2 to export', '1 to export · Tax withheld']) {
    const sub = screen.getByText(count);
    expect(typeStylesOf(sub)).toEqual(['figureSmall']); // mono: a label of the same size flattens alike here
    expect(sub).toHaveStyle({ ...type.figureSmall, color: colors.mute });
  }
  expect(iconsIn(button(/^Sales, /), colors.chevron)).toHaveLength(1);
  await press(button(/^Sales, /));
  expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/saved', params: { kind: 'sale' } });
  await backHome();
  await press(button(/^2307s, /));
  expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/saved', params: { kind: '2307' } });
  // All saved: every kind
  await backHome();
  await press(button('All saved'));
  expect(mockPush).toHaveBeenLastCalledWith('/saved');

  // purchases waiting too, between the two; a total in the millions in full
  await savedAre(summary('2307', 10039.79), summary('purchase', 12345000), summary('purchase', 678.9), summary('sale', 100));
  expect(exportRows()).toEqual([
    'Sales, 1 to export, ₱100.00',
    'Purchases, 2 to export, ₱12,345,678.90',
    '2307s, 1 to export · Tax withheld, ₱10,039.79',
  ]);
  expect(screen.getByText('₱12,345,678.90').props.numberOfLines).toBeUndefined();
  await backHome();
  await press(button(/^Purchases, /));
  expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/saved', params: { kind: 'purchase' } });
});

test('everything exported: Saved, Everything is exported', async () => {
  await render(<Home />);
  await savedAre(summary('sale', 100, EXPORTED), summary('2307', 50, EXPORTED));
  expect(header('Saved')).toBeOnTheScreen();
  expect(screen.queryByText('To export')).toBeNull();
  expect(screen.queryByRole('button', { name: 'All saved' })).toBeNull();
  const row = button('Everything is exported');
  expect(iconsIn(row, colors.chevron)).toHaveLength(1);
  await press(row);
  expect(mockPush).toHaveBeenLastCalledWith('/saved');

  // one waiting again: To export
  await savedAre(summary('sale', 100, EXPORTED), summary('sale', 200));
  expect(header('To export')).toBeOnTheScreen();
  expect(screen.queryByText('Everything is exported')).toBeNull();
  expect(exportRows()).toEqual(['Sales, 1 to export, ₱200.00']);
});

test('recent scans: title, time and form, and the badge; the caption says 20', async () => {
  await render(<Home />);
  expect(screen.queryByText('Recent scans')).toBeNull(); // none yet
  expect(screen.queryByText('The last 20 scans stay here. Save a scan to keep it.')).toBeNull();

  await press(button('From gallery'));
  expect(header('Recent scans')).toBeOnTheScreen();
  // the time on a 12-hour clock and the form's name, then the scan's state
  const row = button('Photo from gallery, 9:00 AM · MyBizMate Sales Invoice, Checks passed');
  // the badge: spoken with its row, not a stop of its own (ruling T4-4)
  expect(within(row).getByText('Checks passed', { includeHiddenElements: true })).toHaveStyle({ color: colors.success });
  await press(row);
  expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/result', params: { id: recentScans()[0].id, from: 'recent' } });
  expect(screen.getByText('The last 20 scans stay here. Save a scan to keep it.')).toHaveStyle({
    ...type.label,
    color: colors.mute,
  });

  // newest first; a PDF by its file name, in full; no form found: the time alone
  const name = 'Isabela Prime Builders and General Merchandise Trading 2026-11.pdf';
  await act(async () => {
    addScan({ label: `PDF: ${name}`, source: 'pdf', result: parseScanResult(coreJson('sales_text_0')) });
    addScan({ label: 'Camera photo', source: 'camera', result: parseScanResult(coreJson('blank_page')) });
  });
  const rows = screen.getAllByRole('button', { name: /, 9:00 AM/ }).map((r) => r.props.accessibilityLabel);
  expect(rows).toHaveLength(3);
  expect(rows[0]).toBe("Camera photo, 9:00 AM, Couldn't find the form");
  expect(rows[1]).toMatch(/^Isabela Prime Builders and General Merchandise Trading 2026-11\.pdf, 9:00 AM · MyBizMate Sales Invoice, /);
  expect(rows[2]).toBe('Photo from gallery, 9:00 AM · MyBizMate Sales Invoice, Checks passed');
  expect(screen.getByText(name).props.numberOfLines).toBeUndefined();
  expect(screen.queryByText(`PDF: ${name}`)).toBeNull();
});

test('a scan read on another screen shows in Recent scans at once', async () => {
  await render(<Home />);
  await act(async () => {
    addScan({ label: 'Camera photo', source: 'camera', result: parseScanResult(coreJson('inv_0007')) });
  });
  expect(button(/^Camera photo, 9:00 AM · MyBizMate Sales Invoice, /)).toBeOnTheScreen();
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

  // a sample: the sheet closes and the sample is read
  await press(button('Try a sample invoice'));
  await press(button('Sample 0051, Caveat handwriting'));
  expect(screen.queryByText('Sample invoices')).toBeNull();
  expect(mockScanPhoto).toHaveBeenCalledWith('file:///bundle/sample.jpg', { deletePhoto: false });
  expect(recentScans()[0]).toMatchObject({ label: 'Sample 0051', source: 'sample', sampleId: 'inv_0051' });
  expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/result', params: { id: recentScans()[0].id } });
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
