import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { useState } from 'react';
import { AccessibilityInfo, Alert } from 'react-native';

import { ExportSheet } from '../components/ExportSheet';
import { type IconComponent, Share } from '../components/icons';
import * as exportFile from '../lib/exportFile';
import * as listsStore from '../lib/lists';
import { addParty, clearParties, lists, type Party } from '../lib/lists';
import * as savedStore from '../lib/saved';
import { loadSaved, markExported, saveScan, savedSummary } from '../lib/saved';
import { addScan, type Kind, updateScan } from '../lib/scans';
import { colors, touch, type } from '../lib/theme';
import { parseScanResult } from '../modules/scanner/src/parse';
import { coreJson } from '../test-utils/coreJson';
import { memoryFs } from '../test-utils/memoryFs';
import { pinToday } from '../test-utils/today';
import { typeStylesOf } from '../test-utils/typeStyles';

// Design B §9.8 and the plan's call 13: one export sheet, in steps. Which file: each kind with saved scans and how
// many wait, and the parties' file, first when it must go in first. The file: what it holds, Which ones, today's
// warnings as banners, then Close and Share the file. Then today's question, as a step of the sheet. A double tap
// shares once and marks once (Review Focus 3), a file error stays in the sheet, and nothing is marked unless the
// person says so.

const mockToast = jest.fn();
const mockShare = jest.fn(async (_uri: string, _options: object) => {});
const mockAvailable = jest.fn(async () => true);

// Ruling P8: the toast's arguments go through as given, so a message without an action is checked by its words alone.
jest.mock('../lib/toast', () => ({ toast: (...args: unknown[]) => mockToast(...args) }));
jest.mock('expo-sharing', () => ({
  shareAsync: (uri: string, options: object) => mockShare(uri, options),
  isAvailableAsync: () => mockAvailable(),
}));
jest.mock('expo-file-system', () => require('../test-utils/memoryFs').memoryFs.module);

const NOW = new Date(2026, 9, 5, 10, 0); // Oct 5, 2026: inv_0007, dated Sep 20, is last month's
const LATER = new Date(2026, 9, 5, 10, 5); // when the person answers the question, a while after the share
const SHARED = { mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', dialogTitle: 'Send the file' };
const INVOICE = { taxType: 'VAT', account: '4010', terms: 'cash', atc: '' } as const;
const QUESTION = 'Did the file go where you wanted?';
const FIRST = 'Export these first: they go in before the other files.';
const NOTE =
  "Before you import, fill in each one's City / Municipality, Province and ZIP, and its TIN where it's blank: MyBizMate needs them. Import this file before the sales and purchases that name them.";

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

const onClose = jest.fn();
/** The sheet as a screen holds it: up until it closes itself, then kept for its exit. */
function Opened({ kind }: { kind: Kind | 'parties' | null }) {
  const [open, setOpen] = useState(true);
  return (
    <ExportSheet
      visible={open}
      kind={kind}
      onClose={() => {
        onClose();
        setOpen(false);
      }}
    />
  );
}
const openAt = (kind: Kind | 'parties' | null) => render(<Opened kind={kind} />);

type Instance = ReturnType<typeof screen.getByText>;
const press = (el: Instance) => act(async () => fireEvent.press(el));
const button = (name: string | RegExp) => screen.getByRole('button', { name });
const header = (name: string) => screen.getByRole('header', { name });
const radio = (name: string) => screen.getByRole('radio', { name });
/** A summary line, as TalkBack says it: its key, then its value. */
const line = (label: string) => screen.getByLabelText(label);
/** A banner, by its words. */
const banner = (text: string) => screen.getByRole('alert', { name: text });
/** The sheet's pinned action row: its buttons, in order. */
const actions = () =>
  within(screen.getByTestId('sheet-actions'))
    .getAllByRole('button')
    .map((b) => b.props.accessibilityLabel);
/** The list of files, top to bottom: each row as TalkBack says it, and the note under the parties' one. */
const listed = () =>
  screen
    .getByTestId('sheet-scroll')
    .queryAll((n) => n.props.accessibilityRole === 'button' || n.props.children === FIRST)
    .map((n) => n.props.accessibilityLabel ?? n.props.children);
/** A radio group's options, in order. */
const options = (group: string) =>
  within(screen.getByRole('radiogroup', { name: group }))
    .getAllByRole('radio')
    .map((r) => r.props.accessibilityLabel);
/** Android's back: the Modal's onRequestClose. */
const systemBack = () => act(async () => screen.getByTestId('sheet').props.onRequestClose());
/** The icons under a node drawn in a color. */
const iconsIn = (node: Instance, color: string) => node.queryAll((n) => n.props.stroke === color);
/** A glyph as drawn on its own, to compare with the one a component draws. */
async function drawingOf(Icon: IconComponent, color: string) {
  await render(<Icon size={touch.iconSmall} color={color} />);
  return screen.root!.toJSON();
}
const focus = jest.mocked(AccessibilityInfo.sendAccessibilityEvent);
/** The titles TalkBack focus was sent to since the last clear, in order. */
const focused = () =>
  focus.mock.calls.map(([view]) => String((view as unknown as { props: { children: unknown } }).props.children));

let alert: jest.SpyInstance;

beforeAll(() => pinToday(NOW));
afterAll(() => jest.useRealTimers());

beforeEach(async () => {
  jest.clearAllMocks();
  mockAvailable.mockReset().mockResolvedValue(true);
  mockShare.mockReset().mockResolvedValue(undefined);
  jest.setSystemTime(NOW);
  memoryFs.reset();
  await loadSaved(); // nothing saved
  await clearParties('customer');
  await clearParties('supplier');
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks()); // the spies on the stores, the export and Alert

test('the files: each kind with what it has to export, and the parties first when they must go in first', async () => {
  const [sent] = [await saveInvoice(), await saveInvoice()];
  await markExported([sent], NOW);
  const cert = await save2307();
  await openAt(null);
  expect(header('Export')).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Back' })).toBeNull(); // the first step
  expect(screen.queryByTestId('sheet-actions')).toBeNull(); // its rows are its actions
  // a row per kind with saved scans, in this order, each saying how many wait: no purchase is saved yet
  expect(listed()).toEqual(['Sales, 1 to export', '2307s, 1 to export']);
  expect(iconsIn(button(/^Sales, /), colors.chevron)).toHaveLength(1);
  // a kind whose saved scans have all gone out stays, so it can go again
  await act(async () => markExported([cert], NOW));
  expect(listed()).toEqual(['Sales, 1 to export', '2307s, All exported']);
  // the counts in the figure style, as Home's (§9.2; ruling T18-3), and All exported, in the same slot, alike
  for (const sub of [screen.getByText('1 to export'), screen.getByText('All exported')]) {
    expect(typeStylesOf(sub)).toEqual(['figureSmall']); // mono: a label of the same size flattens alike here
    expect(sub).toHaveStyle({ ...type.figureSmall, color: colors.mute });
  }
  await act(async () => {
    await saveInvoice({ purchase: true });
  });
  expect(listed()).toEqual(['Sales, 1 to export', 'Purchases, 1 to export', '2307s, All exported']);

  // a party added from a scan that no waiting scan names: the parties' file, last
  let party!: Party;
  await act(async () => {
    party = await addFromScan('Bagong Tindahan');
  });
  expect(listed()).toEqual([
    'Sales, 1 to export',
    'Purchases, 1 to export',
    '2307s, All exported',
    'New customers and suppliers, 1 to export',
  ]);
  expect(iconsIn(button(/^New customers and suppliers, /), colors.chevron)).toHaveLength(1);
  expect(typeStylesOf(within(button(/^New customers and suppliers, /)).getByText('1 to export'))).toEqual(['figureSmall']);

  // a waiting sale names it: the parties' file comes first, with why under it, in the warning color
  await act(async () => {
    await saveInvoice({ customer: party });
  });
  expect(listed()).toEqual([
    'New customers and suppliers, 1 to export',
    FIRST,
    'Sales, 2 to export',
    'Purchases, 1 to export',
    '2307s, All exported',
  ]);
  const note = screen.getByText(FIRST);
  expect(typeStylesOf(note)).toEqual(['label']);
  expect(note).toHaveStyle({ ...type.label, color: colors.warning });

  // once the party has gone out: All exported, and last again
  await act(async () => listsStore.markPartiesExported([party.id], NOW));
  expect(listed()).toEqual([
    'Sales, 2 to export',
    'Purchases, 1 to export',
    '2307s, All exported',
    'New customers and suppliers, All exported',
  ]);
  expect(typeStylesOf(within(button(/^New customers and suppliers, /)).getByText('All exported'))).toEqual(['figureSmall']);

  // a row opens its file
  await press(button(/^Purchases, /));
  expect(header('Export purchases')).toBeOnTheScreen();
  expect(screen.getByText("A file in MyBizMate's Purchases import format, to import at mybizmate.io.")).toBeOnTheScreen();
  expect(line('File, Purchases import · .xlsx')).toBeOnTheScreen();
  expect(line('Purchases, 1 · ₱24,377.00')).toBeOnTheScreen();
});

test('opened for a kind, it starts at that file, and Back goes to the files', async () => {
  await saveInvoice();
  await save2307();
  await openAt('sale');
  // straight at the sales' file, whose title takes TalkBack focus once the sheet is up
  expect(header('Export sales')).toBeOnTheScreen();
  expect(focused()).toEqual(['Export sales']);

  // Back: the list of files, whose title takes the focus in turn (a new step: focusKey)
  focus.mockClear();
  await press(button('Back'));
  expect(header('Export')).toBeOnTheScreen();
  expect(listed()).toEqual(['Sales, 1 to export', '2307s, 1 to export']);
  expect(focused()).toEqual(['Export']);

  // another file from there, and Android's back is its Back too
  focus.mockClear();
  await press(button(/^2307s, /));
  expect(header('Export 2307s')).toBeOnTheScreen();
  expect(focused()).toEqual(['Export 2307s']);
  await systemBack();
  expect(header('Export')).toBeOnTheScreen();
  expect(onClose).not.toHaveBeenCalled();

  // the parties' file opens at its own file, with Back too
  await screen.unmount();
  await addFromScan('Bagong Tindahan');
  await openAt('parties');
  expect(header('Export new customers and suppliers')).toBeOnTheScreen();
  await press(button('Back'));
  expect(listed()).toEqual(['Sales, 1 to export', '2307s, 1 to export', 'New customers and suppliers, 1 to export']);

  // each file opens at its first choice, whatever the last one was left at
  await press(button(/^Sales, /));
  await press(radio('This month'));
  await press(button('Back'));
  await press(button(/^New customers and suppliers, /));
  expect(screen.getByRole('radio', { name: 'Not exported yet', checked: true })).toBeOnTheScreen();
  expect(line('Parties, 1')).toBeOnTheScreen();
});

test("the file: its summary, Which ones, and today's warnings as banners", async () => {
  const shareIcon = await drawingOf(Share, colors.ink);
  const party = await addFromScan('Bagong Tindahan');
  const named = await saveInvoice({ customer: party }); // its customer was added from a scan
  const asWritten = await saveInvoice(); // TorresConstruction Supply, as written: not in MyBizMate yet either
  await openAt('sale');
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

  // Close, and Share the file with its icon, pinned under the scroll
  expect(actions()).toEqual(['Close', 'Share the file']);
  expect(iconsIn(button('Share the file'), colors.ink).map((icon) => icon.toJSON())).toEqual([shareIcon]);

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

  // Close twice over (ruling T18-1): the title row's in every sheet, and the text one beside Share; both close
  expect(screen.getAllByRole('button', { name: 'Close' })).toHaveLength(2);
  await press(within(screen.getByTestId('sheet-actions')).getByRole('button', { name: 'Close' }));
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(screen.queryByTestId('sheet-panel')).toBeNull();
});

test("the 2307s' file: the tax withheld, the payor to check, and the question for one", async () => {
  await save2307();
  await openAt('2307');
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
});

test('nothing in the choice: Share is disabled', async () => {
  await save2307(); // a 2307 isn't in the sales' file
  const sale = await saveInvoice();
  await markExported([sale], NOW);
  await openAt('sale');
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
  await openAt('sale');
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

test('after sharing: the question as a step; Mark N as exported marks them and says so', async () => {
  const mark = jest.spyOn(savedStore, 'markExported');
  const ids = [await saveInvoice(), await saveInvoice()];
  await openAt('sale');
  focus.mockClear();
  await press(button('Share the file'));
  expect(mockShare).toHaveBeenCalledWith('file:///cache/exports/MyBizMate Sales import 2026-10-05.xlsx', SHARED);

  // today's question, as a step of the sheet in place of the Alert, its title taking TalkBack focus
  expect(alert).not.toHaveBeenCalled();
  expect(header(QUESTION)).toBeOnTheScreen();
  expect(focused()).toEqual([QUESTION]);
  const body = screen.getByText(
    'Mark these 2 sales as exported, so the next export leaves them out. “All” still includes them.',
  );
  expect(typeStylesOf(body)).toEqual(['body']);
  expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  expect(actions()).toEqual(['Not yet', 'Mark 2 as exported']);
  expect(mark).not.toHaveBeenCalled(); // nothing is marked until the person says so

  // marked with the share's time, not the answer's; then the sheet closes; then the snackbar says so
  jest.setSystemTime(LATER);
  await press(button('Mark 2 as exported'));
  expect(mark).toHaveBeenCalledTimes(1);
  expect(mark).toHaveBeenCalledWith(ids, NOW);
  for (const id of ids) expect(savedSummary(id)!.exportedAt).toBe(NOW.toISOString());
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(mockToast).toHaveBeenCalledTimes(1);
  expect(mockToast).toHaveBeenCalledWith('Marked 2 sales as exported.');
  const [marked, closed, said] = [mark, onClose, mockToast].map((fn) => fn.mock.invocationCallOrder[0]);
  expect(marked).toBeLessThan(closed);
  expect(closed).toBeLessThan(said);
  expect(screen.queryByTestId('sheet-panel')).toBeNull();

  // the next export leaves them out
  await screen.unmount();
  await openAt('sale');
  expect(line('Sales, Nothing to export for this choice')).toBeOnTheScreen();
});

test('Not yet marks nothing', async () => {
  const mark = jest.spyOn(savedStore, 'markExported');
  const id = await saveInvoice();
  await openAt('sale');
  await press(button('Share the file'));
  expect(screen.getByText('Mark this sale as exported, so the next export leaves it out. “All” still includes it.')).toBeOnTheScreen();
  expect(actions()).toEqual(['Not yet', 'Mark 1 as exported']);
  await press(button('Not yet'));
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(screen.queryByTestId('sheet-panel')).toBeNull();

  // the title row's Close and Android's back leave the question the same way
  for (const leave of [() => press(button('Close')), systemBack]) {
    await screen.unmount();
    await openAt('sale');
    await press(button('Share the file'));
    expect(header(QUESTION)).toBeOnTheScreen();
    await leave();
    expect(screen.queryByTestId('sheet-panel')).toBeNull();
  }
  expect(onClose).toHaveBeenCalledTimes(3);
  expect(mark).not.toHaveBeenCalled();
  expect(savedSummary(id)!.exportedAt).toBeNull();
  expect(mockToast).not.toHaveBeenCalled();

  // it's still waiting, for the next export
  await screen.unmount();
  await openAt('sale');
  expect(line('Sales, 1 · ₱24,377.00')).toBeOnTheScreen();
});

test('a cancelled share asks the same question', async () => {
  // The share sheet's promise settles when it closes, whether a file went or the person backed out (expo-sharing's
  // OnActivityResult): a cancel looks the same, so it lands on the question, and Not yet covers it.
  mockShare.mockImplementationOnce(async () => undefined);
  const id = await saveInvoice();
  await openAt('sale');
  await press(button('Share the file'));
  expect(mockShare).toHaveBeenCalledTimes(1);
  expect(header(QUESTION)).toBeOnTheScreen();
  expect(screen.getByText('Mark this sale as exported, so the next export leaves it out. “All” still includes it.')).toBeOnTheScreen();
  expect(savedSummary(id)!.exportedAt).toBeNull();
  await press(button('Not yet'));
  expect(savedSummary(id)!.exportedAt).toBeNull();
  expect(mockToast).not.toHaveBeenCalled();
});

test('file errors stay in the sheet', async () => {
  await saveInvoice();
  const write = jest.spyOn(exportFile, 'writeExport').mockRejectedValueOnce(new Error('No space left on device'));
  await openAt('sale');

  // the file couldn't be written: why, in the sheet, as a banner TalkBack reads out; no share sheet, no question
  await press(button('Share the file'));
  const made = within(screen.getByTestId('sheet-panel')).getByRole('alert', { name: "Couldn't make the file." });
  expect(made).toHaveStyle({ backgroundColor: colors.dangerTint, borderColor: colors.dangerLine });
  expect(made.props.accessibilityLiveRegion).toBe('polite');
  expect(header('Export sales')).toBeOnTheScreen();
  expect(mockShare).not.toHaveBeenCalled();
  expect(mockToast).not.toHaveBeenCalled();
  expect(alert).not.toHaveBeenCalled();

  // a phone that can't share: its reason, in place of the last one, and no file is written
  mockAvailable.mockResolvedValueOnce(false);
  await press(button('Share the file'));
  expect(banner("This phone can't share files.").props.accessibilityLiveRegion).toBe('polite');
  expect(screen.queryByRole('alert', { name: "Couldn't make the file." })).toBeNull();
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
  await openAt('sale');
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
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(mockToast).toHaveBeenCalledTimes(1);
  expect(mockToast).toHaveBeenCalledWith('Marked 2 sales as exported.');
  expect(screen.queryByTestId('sheet-panel')).toBeNull();
});

test('the parties file: All added from scans in the question', async () => {
  const mark = jest.spyOn(listsStore, 'markPartiesExported');
  const first = await addFromScan('Bagong Tindahan');
  await openAt('parties');
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
  await screen.unmount();
  const second = await addFromScan('Isabela Wholesale Trading');
  await openAt('parties');
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
