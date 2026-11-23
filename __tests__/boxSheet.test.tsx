import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { type ReactNode, useState, useSyncExternalStore } from 'react';
import { AccessibilityInfo, Alert, type AlertButton, Platform, StyleSheet, Text } from 'react-native';

import { BoxSheet, isHardToRead, readingLine } from '../components/BoxSheet';
import { clearItems, lists, subscribeLists } from '../lib/lists';
import { addScan, confirmBox, getScan, setEdit, subscribeRecent, updateScan } from '../lib/scans';
import { settings, subscribeSettings, updateSettings } from '../lib/settings';
import { colors, radius, space, touch, type } from '../lib/theme';
import type { ScanResult } from '../modules/scanner';
import { parseScanResult } from '../modules/scanner/src/parse';
import { coreJson } from '../test-utils/coreJson';
import { fieldsFocused } from '../test-utils/fieldFocus';
import { memoryFs } from '../test-utils/memoryFs';

// Design B §9.5 ("Fix a box"), §12 A8 and the plan's calls 15 and 19. A row with one box opens straight at its
// editor; a row with several lists them, each with its crop, and a box opens its editor in the same sheet. The editor
// shows what the camera saw, how the box was read (no percentage; "Hard to read" under 0.90), the other readings as
// chips, and the field, with Cancel and Save (and, in annotation mode, Looks right) pinned under it. Typing asks before
// it's lost, and survives the scan, the lists and the settings changing. Sample 0051's photo: its date was read
// "21 0ct 2026" (0.95), or else "27 0ct 2026" or "21 Oct 2026"; its row 1 is Plywood 1/4, its unit read "pe" (0.70).

let mockTeam = false;
jest.mock('../lib/build', () => ({
  get TEAM_BUILD() {
    return mockTeam;
  },
}));
jest.mock('expo-file-system', () => require('../test-utils/memoryFs').memoryFs.module);

const ROW1 = ['item1_qty', 'item1_unit', 'item1_description', 'item1_unit_price', 'item1_amount'];
const CUSTOMER = ['customer_name', 'customer_tin', 'customer_address'];
const HELPER = "Type exactly what's written. The checks run again.";
const DISCARD = 'Discard what you typed?';

/** A photo's scan of the fixture (sample 0051's by default), its result changed first. */
function addPhoto(edit?: (r: ScanResult) => void, stem = 'inv_0051'): string {
  const result = parseScanResult(coreJson(stem));
  edit?.(result);
  return addScan({ label: 'Camera photo', source: 'camera', result });
}

const onClose = jest.fn();
const onSaved = jest.fn();

/**
 * The Scan screen's part, as app/result.tsx plays it: the sheet gets the scan as it is now, the screen behind it
 * shows what changed (its terms, the settings' ATC, the lists' version), and the sheet goes when it asks to close.
 */
function Host({
  id,
  title,
  boxes,
  children,
}: {
  id: string;
  title: string;
  boxes: readonly string[];
  children?: ReactNode;
}) {
  const scan = useSyncExternalStore(subscribeRecent, () => getScan(id));
  const { atc } = useSyncExternalStore(subscribeSettings, settings);
  const { version } = useSyncExternalStore(subscribeLists, lists);
  const [open, setOpen] = useState(true);
  if (!scan) return null;
  return (
    <>
      <Text testID="behind">{`terms ${scan.terms ?? 'as ticked'} · ATC ${atc || 'none'} · lists ${version}`}</Text>
      <BoxSheet
        visible={open}
        title={title}
        scan={scan}
        boxes={boxes}
        onClose={() => {
          setOpen(false);
          onClose();
        }}
        onSaved={onSaved}>
        {children}
      </BoxSheet>
    </>
  );
}

const showSheet = (id: string, title: string, boxes: readonly string[], children?: ReactNode) =>
  render(
    <Host id={id} title={title} boxes={boxes}>
      {children}
    </Host>,
  );

const press = (el: Parameters<typeof fireEvent.press>[0]) => act(async () => fireEvent.press(el));
const field = () => screen.getByLabelText('What the box says');
const typeIn = (text: string) => act(async () => fireEvent.changeText(field(), text));
const header = (name: string) => screen.getByRole('header', { name });
const button = (name: string) => screen.getByRole('button', { name });
/** The sheet's pinned action row, in order. */
const actions = () =>
  within(screen.getByTestId('sheet-actions'))
    .getAllByRole('button')
    .map((b) => b.props.accessibilityLabel);
/** The listed boxes' spoken names, in order. */
const listed = () => screen.getAllByTestId(/^box-/).map((row) => row.props.accessibilityLabel);
/** The sheet body's sides: the gutter, or none. */
const sides = () =>
  StyleSheet.flatten(screen.getByTestId('sheet-scroll').props.contentContainerStyle).paddingHorizontal;
/** The scrim, which TalkBack (and so a default query) skips. */
const scrim = () => screen.getByTestId('sheet-scrim', { includeHiddenElements: true });
/** Android's back: the Modal's onRequestClose. */
const systemBack = () => act(async () => screen.getByTestId('sheet').props.onRequestClose());
const focus = jest.mocked(AccessibilityInfo.sendAccessibilityEvent);
type Focused = { props: { testID?: string; accessibilityRole?: string; children?: unknown } };
/** Where TalkBack focus was sent since the last clear, in order: a row by its testID, the sheet's title as its words. */
const focused = () =>
  focus.mock.calls.map(([view]) => {
    const { props } = view as unknown as Focused;
    return props.accessibilityRole === 'header' ? `title: ${String(props.children)}` : props.testID;
  });

let alert: jest.SpyInstance;
/** The prompt's buttons, from the last Alert.alert: Keep editing, then Discard. */
const promptButtons = () => alert.mock.calls.at(-1)![2] as AlertButton[];

beforeEach(async () => {
  jest.clearAllMocks();
  memoryFs.reset();
  mockTeam = false;
  await updateSettings({ annotation: false, atc: '' });
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks()); // Alert's spy, and Platform.OS

test('a one-box row opens straight at its editor', async () => {
  const id = addPhoto();
  await showSheet(id, 'Date', ['date']);
  expect(header('Date')).toBeOnTheScreen(); // the box's label, as the sheet's title
  expect(screen.queryByRole('button', { name: 'Back' })).toBeNull(); // no list to go back to
  // What the camera saw (caps by its style: WHAT THE CAMERA SAW), the crop full width on its own fill
  expect(screen.getByText('What the camera saw')).toHaveStyle({ ...type.overline, color: colors.mute });
  const crop = screen.getByTestId('editor-crop');
  expect(crop.props.source).toEqual({ uri: getScan(id)!.result.reads.find((b) => b.name === 'date')!.cropUri });
  expect(crop).toHaveProp('resizeMode', 'contain');
  expect(crop).toHaveStyle({ width: '100%', height: 72, backgroundColor: colors.crop, borderRadius: radius.field });
  expect(screen.getByText('Read as “21 0ct 2026”')).toHaveStyle({ ...type.body, color: colors.ink });
  // The field: what the box says, its reading until the person types, in figures; not focused on open.
  expect(field().props.value).toBe('21 0ct 2026');
  expect(field()).toHaveStyle(type.figure);
  expect(field().props.autoFocus).toBeFalsy();
  expect(field().props.accessibilityHint).toBe(HELPER);
  expect(screen.getByText(HELPER)).toHaveStyle({ color: colors.mute });
  // Cancel and Save, pinned under the scroll; the editor keeps the sheet's 16 dp gutter.
  expect(actions()).toEqual(['Cancel', 'Save']);
  expect(within(screen.getByTestId('sheet-scroll')).queryByRole('button', { name: 'Save' })).toBeNull();
  expect(sides()).toBe(space.l);
  expect(screen.queryAllByTestId(/^box-(?!save)/)).toHaveLength(0); // no list
});

test('the reading has no percentage; Hard to read below 0.90 only', async () => {
  const dateAt = (conf: number) =>
    addPhoto((r) => {
      r.reads.find((b) => b.name === 'date')!.conf = conf;
    });
  await showSheet(dateAt(0.85), 'Date', ['date']);
  expect(screen.getByText('Read as “21 0ct 2026”')).toBeOnTheScreen();
  expect(screen.queryByText(/% sure|%/)).toBeNull();
  expect(screen.getByText('Hard to read')).toHaveStyle({ ...type.badge, color: colors.warning });
  await showSheet(dateAt(0.95), 'Date', ['date']);
  expect(screen.queryByText('Hard to read')).toBeNull();
  await showSheet(dateAt(0.9), 'Date', ['date']); // today's threshold is sure enough
  expect(screen.queryByText('Hard to read')).toBeNull();
  // A PDF's own text is exact, whatever its score.
  const fromText = addPhoto((r) => {
    Object.assign(r.reads.find((b) => b.name === 'date')!, { fromText: true, conf: 0.5 });
  });
  await showSheet(fromText, 'Date', ['date']);
  expect(screen.queryByText('Hard to read')).toBeNull();
  expect(screen.queryByText(/^Read as/)).toBeNull();
  await showSheet(fromText, 'Invoice', ['date', 'invoice_no']);
  expect(listed()[0]).toBe("Date, From the PDF's text");

  // The words, as readingLine and isHardToRead give them.
  const read = getScan(dateAt(0.85))!.result.reads.find((b) => b.name === 'date')!;
  expect(readingLine(read)).toBe('Read as “21 0ct 2026”');
  expect(readingLine({ ...read, text: '' })).toBe("Couldn't make out any writing");
  expect(readingLine({ ...read, fromText: true })).toBe("From the PDF's text");
  expect(readingLine(null)).toBe('Empty box');
  expect(isHardToRead(read)).toBe(true);
  expect(isHardToRead({ ...read, conf: 0.9 })).toBe(false);
  expect(isHardToRead({ ...read, text: '' })).toBe(false); // nothing written, nothing hard to read
  expect(isHardToRead({ ...read, fromText: true })).toBe(false);
  expect(isHardToRead(null)).toBe(false);
});

test("the crop: what the camera saw, or the PDF's own text, or no picture", async () => {
  // A box from the PDF's own text says so where the crop would be (FROM THE PDF'S TEXT), with no crop and no reading
  // line to repeat it (ruling T13-3): the field holds the text.
  const pdf = addPhoto((r) => {
    r.reads.find((b) => b.name === 'date')!.fromText = true;
  });
  await showSheet(pdf, 'Date', ['date']);
  const said = screen.getAllByText("From the PDF's text");
  expect(said).toHaveLength(1);
  expect(said[0]).toHaveStyle({ ...type.overline, color: colors.mute });
  expect(screen.queryByText('What the camera saw')).toBeNull();
  expect(screen.queryByTestId('editor-crop')).toBeNull();
  expect(screen.queryByText(/^Read as/)).toBeNull();
  expect(field().props.value).toBe('21 0ct 2026');
  // listed, its reading line still says where it came from, and it has no crop there either (ruling T13-6)
  await showSheet(pdf, 'Invoice', ['invoice_no', 'date']);
  expect(listed()).toEqual(['SI no., Read as “0008869”', "Date, From the PDF's text"]);
  expect(screen.getByTestId('crop-invoice_no')).toBeOnTheScreen();
  expect(screen.queryByTestId('crop-date')).toBeNull();

  // A scan that kept no files has no picture of the box.
  const result = parseScanResult(coreJson('inv_0051', null));
  const noFiles = addScan({ label: 'Camera photo', source: 'camera', result });
  await showSheet(noFiles, 'Date', ['date']);
  expect(screen.getByText('What the camera saw')).toBeOnTheScreen();
  expect(screen.getByText('No picture of this box')).toHaveStyle({ ...type.body, color: colors.mute });
  expect(screen.queryByTestId('editor-crop')).toBeNull();

  // A box that wasn't read: empty, with no picture, and nothing in the field.
  const id = addPhoto();
  await showSheet(id, 'Zero-rated sales', ['zero_rated']);
  expect(screen.getByText('Empty box')).toBeOnTheScreen();
  expect(screen.getByText('No picture of this box')).toBeOnTheScreen();
  expect(field().props.value).toBe('');
  // listed, the same
  await showSheet(id, 'Total due', ['total_due', 'zero_rated']);
  expect(listed()).toEqual(['Total due, Read as “2,251”', 'Zero-rated sales, Empty box']);
  expect(screen.getByTestId('crop-total_due')).toBeOnTheScreen();
  expect(screen.queryByTestId('crop-zero_rated')).toBeNull();
});

test('Could also be: a chip fills the field', async () => {
  const id = addPhoto();
  await showSheet(id, 'Date', ['date']);
  expect(screen.getByText('Could also be')).toHaveStyle({ ...type.label, color: colors.mute });
  // the backup readings, in their order, as 40 dp chips with a 48 dp target, in the field's own figures (0 isn't O)
  const chips = ['27 0ct 2026', '21 Oct 2026'].map(button);
  for (const chip of chips) {
    expect(chip).toHaveStyle({ minHeight: touch.chip, borderRadius: radius.pill, borderColor: colors.line });
    expect(touch.chip + 2 * chip.props.hitSlop).toBe(touch.target);
  }
  expect(screen.getByText('21 Oct 2026')).toHaveStyle({ ...type.figure, color: colors.ink });
  expect(fieldsFocused()).toEqual([]); // not focused on open
  await press(chips[1]);
  expect(field().props.value).toBe('21 Oct 2026');
  // and typing starts, so a near-miss is one tap from fixing its last character (§9.5)
  expect(fieldsFocused()).toEqual(['What the box says']);
  await press(chips[0]);
  expect(field().props.value).toBe('27 0ct 2026');
  expect(fieldsFocused()).toEqual(['What the box says', 'What the box says']);

  // With an edit, the reading itself is one of them.
  await act(async () => setEdit(id, 'date', 'Oct 21, 2026'));
  await showSheet(id, 'Date', ['date']);
  expect(field().props.value).toBe('Oct 21, 2026');
  await press(button('21 0ct 2026'));
  expect(field().props.value).toBe('21 0ct 2026');

  // No other reading: nothing to choose from.
  await showSheet(id, 'SI no.', ['invoice_no']);
  expect(screen.queryByText('Could also be')).toBeNull();
});

test('Save keeps the edit, closes a one-box sheet and calls onSaved', async () => {
  const id = addPhoto();
  await showSheet(id, 'Date', ['date']);
  await typeIn('Oct 21, 2026');
  await press(screen.getByTestId('box-save'));
  expect(getScan(id)!.edits.date).toBe('Oct 21, 2026');
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(onSaved).toHaveBeenCalledTimes(1);
  expect(screen.queryByLabelText('What the box says')).toBeNull(); // the sheet has gone
  expect(alert).not.toHaveBeenCalled(); // nothing typed was lost
});

test('a multi-box row lists its boxes; a box opens its editor; Save goes back to the list; Done closes', async () => {
  const id = addPhoto();
  await showSheet(id, 'Plywood 1/4', ROW1);
  expect(header('Plywood 1/4')).toBeOnTheScreen();
  expect(screen.getAllByTestId(/^box-/).map((row) => row.props.testID)).toEqual(ROW1.map((box) => `box-${box}`));
  // Each box is a row the sheet's full width (no gutter), padded as rows are, that opens it to fix: one stop, which
  // says its label, its reading and its badges (ruling T4-4).
  expect(sides()).toBeUndefined();
  const unit = screen.getByTestId('box-item1_unit');
  expect(unit).toHaveProp('accessibilityRole', 'button');
  expect(unit).toHaveProp('accessibilityHint', 'Opens it to fix');
  expect(unit).toHaveStyle({ paddingHorizontal: space.l, paddingVertical: space.m, backgroundColor: colors.panel });
  expect(listed()).toEqual([
    'Row 1 · Qty, Read as “2”',
    'Row 1 · Unit, Read as “pe”, Hard to read',
    'Row 1 · Description, Read as “Plywood 1/4”',
    'Row 1 · Unit price, Read as “546”',
    'Row 1 · Amount, Read as “7,092”',
  ]);
  // its label, its crop (full width, 56 dp), its reading, and Hard to read when the reading's score is under 0.90
  expect(within(unit).getByText('Row 1 · Unit')).toHaveStyle({ ...type.label, color: colors.mute });
  const crop = within(unit).getByTestId('crop-item1_unit');
  expect(crop.props.source).toEqual({ uri: getScan(id)!.result.reads.find((b) => b.name === 'item1_unit')!.cropUri });
  expect(crop).toHaveProp('resizeMode', 'contain');
  expect(crop).toHaveStyle({ width: '100%', height: 56, backgroundColor: colors.crop, borderRadius: radius.field });
  expect(within(unit).getByText('Read as “pe”')).toHaveStyle({ ...type.body, color: colors.ink });
  expect(within(unit).getByText('Hard to read')).toHaveStyle({ color: colors.warning });
  expect(screen.queryByText(/% sure/)).toBeNull();
  expect(actions()).toEqual(['Done']);

  // A box opens its editor in the same sheet, with Back to the list.
  await press(unit);
  expect(header('Row 1 · Unit')).toBeOnTheScreen();
  expect(button('Back')).toBeOnTheScreen();
  expect(sides()).toBe(space.l);
  expect(field().props.value).toBe('pe');
  await typeIn('pcs');
  await press(screen.getByTestId('box-save'));
  expect(getScan(id)!.edits.item1_unit).toBe('pcs');
  // Save goes back to the list, which shows the new state.
  expect(header('Plywood 1/4')).toBeOnTheScreen();
  expect(screen.queryByLabelText('What the box says')).toBeNull();
  const edited = screen.getByTestId('box-item1_unit');
  expect(within(edited).getByText('You changed it to “pcs”.')).toBeOnTheScreen();
  expect(within(edited).getByText('Edited')).toHaveStyle({ color: colors.mute }); // neutral
  expect(edited).toHaveProp(
    'accessibilityLabel',
    'Row 1 · Unit, Read as “pe”, You changed it to “pcs”, Hard to read, Edited',
  );
  expect(onClose).not.toHaveBeenCalled();
  expect(onSaved).not.toHaveBeenCalled();

  // A box cleared says so.
  await press(screen.getByTestId('box-item1_qty'));
  await typeIn('');
  await press(screen.getByTestId('box-save'));
  expect(within(screen.getByTestId('box-item1_qty')).getByText('You cleared it.')).toBeOnTheScreen();
  expect(getScan(id)!.edits.item1_qty).toBe('');

  // Back goes back too, and Done closes the sheet.
  await press(screen.getByTestId('box-item1_amount'));
  await press(button('Back'));
  expect(header('Plywood 1/4')).toBeOnTheScreen();
  await press(button('Done'));
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(onSaved).not.toHaveBeenCalled();
});

test('what comes under the boxes; with it, even one box opens as a list', async () => {
  const id = addPhoto();
  await showSheet(id, 'Customer', ['customer_name'], <Text>In your customers</Text>);
  expect(screen.queryByLabelText('What the box says')).toBeNull();
  expect(listed()).toEqual(['Customer, Read as “Flores Grocery”']);
  const texts = within(screen.getByTestId('sheet-scroll')).getAllByText(/./);
  expect(texts.at(-1)).toHaveTextContent('In your customers'); // under the boxes
  expect(actions()).toEqual(['Done']);
  // nothing under it (null or false): its editor
  await showSheet(id, 'Date', ['date'], null);
  expect(field()).toBeOnTheScreen();
  await showSheet(id, 'Date', ['date'], false);
  expect(field()).toBeOnTheScreen();
});

test('typing asks before it is lost: Back, Close, the scrim and system back', async () => {
  const id = addPhoto();
  await showSheet(id, 'Plywood 1/4', ROW1);
  await press(screen.getByTestId('box-item1_unit'));
  await press(button('Back')); // nothing typed: nothing to ask
  expect(alert).not.toHaveBeenCalled();
  expect(header('Plywood 1/4')).toBeOnTheScreen();

  await press(screen.getByTestId('box-item1_unit'));
  await typeIn('pcs');
  for (const leave of [() => press(button('Back')), () => press(button('Close')), () => press(scrim()), systemBack]) {
    await leave();
    expect(alert).toHaveBeenLastCalledWith(DISCARD, undefined, [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: expect.any(Function) },
    ]);
    // Keep editing: still there, as typed
    expect(field().props.value).toBe('pcs');
  }
  expect(alert).toHaveBeenCalledTimes(4);
  expect(onClose).not.toHaveBeenCalled();
  // Discard, from Back: the list again, and nothing kept
  await press(button('Back'));
  await act(async () => promptButtons()[1].onPress!());
  expect(header('Plywood 1/4')).toBeOnTheScreen();
  expect(getScan(id)!.edits).toEqual({});
  // typed back to where it started: nothing to lose
  await press(screen.getByTestId('box-item1_unit'));
  await typeIn('pcs');
  await typeIn('pe');
  await press(button('Back'));
  expect(alert).toHaveBeenCalledTimes(5);
  expect(header('Plywood 1/4')).toBeOnTheScreen();

  // A one-box sheet asks the same way, then closes.
  await showSheet(id, 'Date', ['date']);
  await typeIn('Oct 28');
  await press(button('Close'));
  await press(scrim());
  await systemBack();
  expect(alert).toHaveBeenCalledTimes(8);
  expect(alert.mock.calls.slice(5).map((call) => call[0])).toEqual([DISCARD, DISCARD, DISCARD]);
  expect(onClose).not.toHaveBeenCalled();
  await act(async () => promptButtons()[1].onPress!());
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(onSaved).not.toHaveBeenCalled();
  expect(getScan(id)!.edits).toEqual({});
});

test('Cancel leaves without asking', async () => {
  const id = addPhoto();
  await showSheet(id, 'Plywood 1/4', ROW1);
  await press(screen.getByTestId('box-item1_unit'));
  await typeIn('pcs');
  await press(button('Cancel'));
  expect(alert).not.toHaveBeenCalled();
  expect(header('Plywood 1/4')).toBeOnTheScreen(); // back to the list
  expect(getScan(id)!.edits).toEqual({});
  expect(onClose).not.toHaveBeenCalled();

  // A one-box sheet: Cancel closes it.
  await showSheet(id, 'Date', ['date']);
  await typeIn('Oct 28');
  await press(button('Cancel'));
  expect(alert).not.toHaveBeenCalled();
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(onSaved).not.toHaveBeenCalled();
  expect(getScan(id)!.edits).toEqual({});
});

test("TalkBack focus follows the sheet: a listed box's editor takes it to its title, and back at the list, its row", async () => {
  // Ruling T13-2 (design §7): the row opened the editor, so leaving the editor gives focus back to it.
  const id = addPhoto();
  await showSheet(id, 'Plywood 1/4', ROW1);
  focus.mockClear();
  await press(screen.getByTestId('box-item1_unit'));
  expect(focused()).toEqual(['title: Row 1 · Unit']); // the title, now the box's label
  focus.mockClear();
  await press(screen.getByTestId('box-save'));
  expect(focused()).toEqual(['box-item1_unit']); // Save: the list again, on that box's row

  // every other way back to the list lands on the row of the box that was open, once
  const ways: [string, string, () => Promise<unknown>][] = [
    ['item1_qty', 'Row 1 · Qty', () => press(button('Cancel'))],
    ['item1_description', 'Row 1 · Description', () => press(button('Back'))],
    ['item1_unit_price', 'Row 1 · Unit price', systemBack],
  ];
  for (const [box, label, leave] of ways) {
    focus.mockClear();
    await press(screen.getByTestId(`box-${box}`));
    expect(focused()).toEqual([`title: ${label}`]);
    focus.mockClear();
    await leave();
    expect([box, focused()]).toEqual([box, [`box-${box}`]]);
  }
  // after typing, Back asks first: nothing moves until Discard
  await press(screen.getByTestId('box-item1_amount'));
  await typeIn('7,000');
  focus.mockClear();
  await press(button('Back'));
  expect(focus).not.toHaveBeenCalled();
  await act(async () => promptButtons()[1].onPress!());
  expect(focused()).toEqual(['box-item1_amount']);

  // Close from an editor closes the whole sheet: no row; the sheet gives focus back to its own opener (none here)
  await press(screen.getByTestId('box-item1_unit'));
  focus.mockClear();
  await press(button('Close'));
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(focused()).toEqual([]);

  // A one-box sheet has no list: Save closes it, with no title or row of its own to focus (the Scan screen sends
  // focus to its strip, ruling T13-1)
  await showSheet(id, 'Date', ['date']);
  focus.mockClear();
  await press(screen.getByTestId('box-save'));
  expect(onSaved).toHaveBeenCalledTimes(1);
  expect(focused()).toEqual([]);
});

test('typing survives store updates while the editor is open', async () => {
  // Review Focus 2: the scan, the lists and the settings are replaced while the editor is open; the draft stays.
  const id = addPhoto();
  await showSheet(id, 'Date', ['date']);
  await typeIn('Oct 28');
  const before = screen.getByTestId('behind').props.children;
  await act(async () => {
    updateScan(id, { terms: 'cash' });
    await updateSettings({ atc: 'WC158' });
    await clearItems();
  });
  // the screen behind took the new scan, settings and lists, and so did the sheet
  expect(screen.getByTestId('behind').props.children).not.toBe(before);
  expect(screen.getByTestId('behind')).toHaveTextContent(/^terms cash · ATC WC158 · lists \d+$/);
  expect(field().props.value).toBe('Oct 28');
  // and it's still unsaved typing: leaving asks
  await press(button('Close'));
  expect(alert).toHaveBeenLastCalledWith(DISCARD, undefined, expect.any(Array));

  // In a list's editor too, while another box is fixed elsewhere and annotation mode comes on.
  mockTeam = true;
  await showSheet(id, 'Plywood 1/4', ROW1);
  await press(screen.getByTestId('box-item1_unit'));
  await typeIn('pcs');
  await act(async () => {
    setEdit(id, 'item1_qty', '3');
    await updateSettings({ annotation: true });
  });
  expect(header('Row 1 · Unit')).toBeOnTheScreen();
  expect(field().props.value).toBe('pcs');
  expect(screen.getByText('Not checked yet')).toBeOnTheScreen(); // it did hear the settings
});

test('keyboards: amounts and dates use visible-password on Android, words the default; autocorrect off', async () => {
  const invoice = addPhoto();
  const certificate = addPhoto(undefined, 'bir2307_photo_0');
  /** The keyboard a box's editor asks for. */
  async function keyboardOf(id: string, box: string) {
    await showSheet(id, 'A box', [box]);
    const { keyboardType, autoCapitalize, autoCorrect } = field().props;
    return [box, keyboardType, autoCapitalize, autoCorrect];
  }
  jest.replaceProperty(Platform, 'OS', 'android');
  // every character that can be written stays: a number row, letters (P, Oct), slashes and commas, no suggestions
  for (const box of ['date', 'total_due', 'item1_unit_price', 'item1_qty', 'invoice_no', 'customer_tin']) {
    expect(await keyboardOf(invoice, box)).toEqual([box, 'visible-password', 'none', false]);
  }
  expect(await keyboardOf(certificate, 'period_from')).toEqual(['period_from', 'visible-password', 'none', false]);
  expect(await keyboardOf(certificate, 'ewt1_atc')).toEqual(['ewt1_atc', 'visible-password', 'characters', false]);
  // words: the default keyboard, in sentences
  for (const box of ['customer_name', 'item1_description', 'item1_unit']) {
    expect(await keyboardOf(invoice, box)).toEqual([box, 'default', 'sentences', false]);
  }
  // iOS has no visible-password keyboard: the default one
  jest.replaceProperty(Platform, 'OS', 'ios');
  expect(await keyboardOf(invoice, 'date')).toEqual(['date', 'default', 'none', false]);
});

describe('annotation mode', () => {
  beforeEach(async () => {
    mockTeam = true;
    await act(async () => updateSettings({ annotation: true }));
  });

  test('Looks right only on a training box whose field holds its value; it confirms and goes back', async () => {
    const id = addPhoto();
    const looksRight = () => screen.queryByTestId('box-confirm');
    await showSheet(id, 'Plywood 1/4', ROW1);
    await press(screen.getByTestId('box-item1_amount'));
    expect(looksRight()).toBeOnTheScreen(); // its reading, “7,092”
    // another reading picked, or other words typed, is a correction: only Save keeps it
    await press(button('1,092'));
    expect(looksRight()).toBeNull();
    await typeIn('7,000');
    expect(looksRight()).toBeNull();
    await typeIn(' 7,092 '); // its value again, spaces aside, as Save keeps it
    expect(looksRight()).toBeOnTheScreen();
    focus.mockClear();
    await press(looksRight()!);
    expect(getScan(id)!.confirmed).toEqual(['item1_amount']);
    expect(getScan(id)!.edits).toEqual({});
    // back to the list, which says so, with TalkBack on the box's row (ruling T13-2)
    expect(header('Plywood 1/4')).toBeOnTheScreen();
    expect(within(screen.getByTestId('box-item1_amount')).getByText('Checked')).toBeOnTheScreen();
    expect(focused()).toEqual(['box-item1_amount']);

    // A corrected box: its correction as it stands can be confirmed, but not the reading it replaced.
    await act(async () => setEdit(id, 'item1_unit', 'pcs'));
    await press(screen.getByTestId('box-item1_unit'));
    expect(looksRight()).toBeOnTheScreen();
    await press(button('pe'));
    expect(looksRight()).toBeNull();
    await press(button('Cancel'));

    // The customer's boxes never become training data: nothing to confirm.
    await showSheet(id, 'Customer', CUSTOMER);
    await press(screen.getByTestId('box-customer_name'));
    expect(looksRight()).toBeNull();

    // A one-box sheet confirms and closes, as Save does.
    await showSheet(id, 'Date', ['date']);
    await press(looksRight()!);
    expect(getScan(id)!.confirmed).toEqual(['item1_amount', 'date']);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledTimes(1);

    // Annotation mode off, or a client build: no Looks right.
    await act(async () => updateSettings({ annotation: false }));
    await showSheet(id, 'SI no.', ['invoice_no']);
    expect(looksRight()).toBeNull();
    mockTeam = false;
    await act(async () => updateSettings({ annotation: true }));
    await showSheet(id, 'SI no.', ['invoice_no']);
    expect(looksRight()).toBeNull();
  });

  test('state badges replace Edited on training boxes', async () => {
    const id = addPhoto();
    await act(async () => {
      confirmBox(id, 'item1_qty');
      setEdit(id, 'item1_unit', 'pcs');
      setEdit(id, 'customer_name', 'Flores Grocery Store');
    });
    await showSheet(id, 'Plywood 1/4', ROW1);
    expect(listed()).toEqual([
      'Row 1 · Qty, Read as “2”, Checked',
      'Row 1 · Unit, Read as “pe”, You changed it to “pcs”, Hard to read, Corrected',
      'Row 1 · Description, Read as “Plywood 1/4”, Not checked yet',
      'Row 1 · Unit price, Read as “546”, Not checked yet',
      'Row 1 · Amount, Read as “7,092”, Not checked yet',
    ]);
    expect(screen.queryByText('Edited')).toBeNull();
    expect(screen.getByText('Checked')).toHaveStyle({ color: colors.success });
    expect(screen.getByText('Corrected')).toHaveStyle({ color: colors.success });
    expect(screen.getAllByText('Not checked yet')[0]).toHaveStyle({ color: colors.warning });
    // A one-box row has no list: its editor says the box's state.
    await showSheet(id, 'Date', ['date']);
    expect(screen.getByText('Not checked yet')).toHaveStyle({ ...type.badge, color: colors.warning });

    // A box that never becomes training data keeps Edited.
    await showSheet(id, 'Customer', CUSTOMER);
    expect(listed()[0]).toBe('Customer, Read as “Flores Grocery”, You changed it to “Flores Grocery Store”, Edited');
    expect(screen.queryByText(/^(Checked|Corrected|Not checked yet)$/)).toBeNull();

    // With the mode off, every edited box is Edited, and no box has a state.
    await act(async () => updateSettings({ annotation: false }));
    await showSheet(id, 'Plywood 1/4', ROW1);
    expect(listed().slice(0, 2)).toEqual([
      'Row 1 · Qty, Read as “2”',
      'Row 1 · Unit, Read as “pe”, You changed it to “pcs”, Hard to read, Edited',
    ]);
  });

  test("the editor's actions: Cancel · Looks right · Save", async () => {
    const id = addPhoto();
    await showSheet(id, 'Date', ['date']);
    expect(actions()).toEqual(['Cancel', 'Looks right', 'Save']);
    // a text button, the secondary and the primary
    expect(screen.getByText('Cancel')).toHaveStyle({ color: colors.brandText });
    expect(screen.getByTestId('box-confirm')).toHaveStyle({
      backgroundColor: colors.panel,
      borderColor: colors.outline,
    });
    expect(screen.getByTestId('box-save')).toHaveStyle({ backgroundColor: colors.brand });
    // once the field differs, Looks right goes
    await typeIn('Oct 28');
    expect(actions()).toEqual(['Cancel', 'Save']);
  });
});
