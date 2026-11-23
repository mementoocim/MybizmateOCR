import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { createRef } from 'react';
import { Dimensions, type ScrollViewInstance, StyleSheet, TextInput, View } from 'react-native';

import { ChoiceChips } from '../components/ChoiceChips';
import { Search } from '../components/icons';
import { Screen } from '../components/Screen';
import { Segmented } from '../components/Segmented';
import { TextField } from '../components/TextField';
import { colors, radius, space, touch, type } from '../lib/theme';
import { clearFieldsFocused, fieldsFocused } from '../test-utils/fieldFocus';
import { keyboard } from '../test-utils/keyboard';
import { standIn } from '../test-utils/scrollStandIn';
import { typeStylesOf } from '../test-utils/typeStyles';

// Design B §5.6 and §7: the inputs. Segmented and ChoiceChips are radio groups that TalkBack names, with the chosen
// option in ink with a paper label (§5.1: selection is ink); Segmented stacks its options when the window is narrow for
// their words at its font size (ruling T26-5). A TextField has its label above, an outline border that becomes a 2 dp
// focus border, and one note under it, which is also the field's hint. Taking focus, it scrolls its whole field
// (label, box and note) into view in the Screen, and again when the keyboard opens or grows (ruling T5-2).

const noop = () => {};
type Instance = ReturnType<typeof screen.getByRole>;
const kids = (instance: Instance) => instance.children.filter((child): child is Instance => typeof child !== 'string');

const LISTS = [
  { value: 'customers', label: 'Customers 21' },
  { value: 'suppliers', label: 'Suppliers 2' },
  { value: 'items', label: 'Items 18' },
] as const;
const VIEWS = [
  { value: 'enhanced', label: 'Enhanced' },
  { value: 'bw', label: 'B&W' },
  { value: 'original', label: 'Original' },
] as const;
const KINDS = [
  { value: 'sale', label: 'Sale' },
  { value: 'purchase', label: 'Purchase' },
] as const;
const TAX_TYPES = [
  { value: 'VAT', label: 'VAT' },
  { value: 'NONVAT', label: 'Non-VAT' },
  { value: 'ZERO', label: 'Zero-rated' },
  { value: 'EXEMPT', label: 'VAT-exempt' },
  { value: 'NA', label: 'Not applicable' },
] as const;
const SUGGESTED = "Suggested from the invoice's VAT boxes";
const OFFSET_HELPER = 'Code or name, as in MyBizMate';

/** The window as jest starts it: 750 dp wide at a font scale of 2. */
const WINDOW = Dimensions.get('window');
/** A phone's window: its width in dp, and the font size Android's settings give it. */
const atWindow = (width: number, fontScale: number) =>
  act(() => {
    Dimensions.set({ window: { ...WINDOW, width, fontScale }, screen: Dimensions.get('screen') });
  });

/** For each window (its width in dp and its font scale), how a Segmented lays out its options: one row, or stacked. */
async function expectLayouts(
  group: () => Instance,
  layouts: readonly [width: number, fontScale: number, direction: 'column' | 'row'][],
) {
  for (const [width, fontScale, direction] of layouts) {
    await atWindow(width, fontScale); // it follows the window as it changes
    const shown = [width, fontScale, StyleSheet.flatten(group().props.style).flexDirection];
    expect(shown).toEqual([width, fontScale, direction]);
    // side by side each takes an equal share of the row; stacked each takes its own row, full width
    for (const option of within(group()).getAllByRole('radio')) {
      expect(option).toHaveStyle({ flex: direction === 'row' ? 1 : undefined });
    }
  }
}

/**
 * jest's views have no layout, and share their native methods: measureLayout is one jest.fn on View's and TextInput's
 * prototypes alike, and each call keeps the instance it was made on (mock.contexts).
 */
const measureLayout = (View.prototype as unknown as { measureLayout: jest.Mock }).measureLayout;
/** At 200%, how far a field's input sits under the top of the field: the label's line and the gap under it. */
const UNDER_LABEL = 44;

afterEach(async () => {
  measureLayout.mockReset(); // as the preset made it: nothing laid out
  await atWindow(WINDOW.width, WINDOW.fontScale);
});

/**
 * A TextField, with a helper, in a Screen. jest's ScrollView and views have no layout, so this stands in the scroll's
 * content view and records its scrolls, and stands in Android's measurements: the field's own view (its label, box and
 * helper) `y` dp down that content, and its input lower, under the label.
 */
async function fieldInScreen(y: number) {
  const scrollRef = createRef<ScrollViewInstance>();
  await render(
    <Screen header={null} scrollRef={scrollRef}>
      <TextField label="Offset account for 2307s" value="" onChangeText={noop} helper={OFFSET_HELPER} />
    </Screen>,
  );
  const { content, scrollTo } = standIn(scrollRef.current);
  measureLayout.mockImplementation(function (
    this: object,
    _relativeTo: unknown,
    onSuccess: (x: number, y: number, w: number, h: number) => void,
  ) {
    onSuccess(0, this instanceof TextInput ? y + UNDER_LABEL : y, 328, touch.target);
  });
  return { input: screen.getByLabelText('Offset account for 2307s'), content, scrollTo };
}

test('Segmented is a labelled radio group with an ink selection', async () => {
  const onChange = jest.fn();
  await atWindow(411, 1); // a 411 dp phone at 100%: the options side by side in one row
  await render(<Segmented label="List" options={LISTS} value="suppliers" onChange={onChange} />);
  const group = screen.getByRole('radiogroup', { name: 'List' });
  expect(group).toHaveStyle({
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: colors.outline,
    borderRadius: radius.field,
    backgroundColor: colors.panel,
  });
  const options = within(group).getAllByRole('radio');
  expect(options).toHaveLength(3);
  // each an equal share of the row
  for (const option of options) expect(option).toHaveStyle({ flex: 1, minHeight: touch.target, height: undefined });

  const chosen = screen.getByRole('radio', { name: 'Suppliers 2' });
  expect(chosen.props.accessibilityState).toMatchObject({ checked: true });
  expect(chosen).toHaveStyle({ backgroundColor: colors.ink });
  expect(screen.getByText('Suppliers 2')).toHaveStyle({ ...type.button, color: colors.paper });
  const other = screen.getByRole('radio', { name: 'Customers 21', checked: false });
  expect(other).toHaveStyle({ backgroundColor: undefined });
  expect(screen.getByText('Customers 21')).toHaveStyle({ ...type.button, color: colors.ink });
  // jest runs as iOS, where value flattens as button does: the style itself tells them apart
  for (const label of ['Suppliers 2', 'Customers 21']) expect(typeStylesOf(screen.getByText(label))).toEqual(['button']);
  expect(screen.getByText('Customers 21').props.numberOfLines).toBeUndefined(); // labels wrap at large text

  await fireEvent.press(other);
  expect(onChange).toHaveBeenCalledWith('customers');
  // Options sit edge to edge inside the outline, so the keyboard's focus ring goes on the option's own edge.
  await fireEvent(other, 'focus');
  expect(screen.getByTestId('focus-ring')).toHaveStyle({ top: 0, left: 0, right: 0, bottom: 0 });
});

test('Segmented stacks its options when its share of the row is too narrow for a word (ruling T26-5)', async () => {
  // Side by side, each option has an equal share of the row: at 200% Android broke the words in a third of it ("Custo
  // / mers / 21"), and on a 360 dp phone at 130% "Customers" (about 75 dp at 100%) outgrows its third too. So the
  // options stack, one full-width option per row, while the window has under 104 dp per unit of font scale for each
  // option: under 312 for three, under 208 for two.
  const onChange = jest.fn();
  await atWindow(411, 2);
  await render(<Segmented label="List" options={LISTS} value="suppliers" onChange={onChange} />);
  const group = () => screen.getByRole('radiogroup', { name: 'List' });
  const options = () => within(group()).getAllByRole('radio');
  // The same outline, as a column. Each option has a row of its own, full width (no share of a row), at least 48 dp,
  // with nothing fixing its height: a label too long for the width still wraps between words.
  expect(group()).toHaveStyle({
    flexDirection: 'column',
    borderWidth: 1,
    borderColor: colors.outline,
    borderRadius: radius.field,
    backgroundColor: colors.panel,
  });
  expect(options().map((option) => option.props.accessibilityLabel)).toEqual(['Customers 21', 'Suppliers 2', 'Items 18']);
  for (const option of options()) {
    expect(option).toHaveStyle({ flex: undefined, minHeight: touch.target, height: undefined });
  }
  expect(screen.getByText('Customers 21').props.numberOfLines).toBeUndefined();
  // The same ink selection, roles and states: radio buttons in a radio group, the chosen one checked.
  expect(screen.getByRole('radio', { name: 'Suppliers 2', checked: true })).toHaveStyle({ backgroundColor: colors.ink });
  expect(screen.getByText('Suppliers 2')).toHaveStyle({ ...type.button, color: colors.paper });
  const other = screen.getByRole('radio', { name: 'Customers 21', checked: false });
  expect(other).toHaveStyle({ backgroundColor: undefined });
  expect(screen.getByText('Customers 21')).toHaveStyle({ ...type.button, color: colors.ink });
  await fireEvent.press(other);
  expect(onChange).toHaveBeenCalledWith('customers');

  // Three options. Stacked at 200% on any phone, and at 130% on a 360 dp one; one row at 100% on any phone, and at 130%
  // on a 411 dp one (316 dp per unit). At the edge: 623 dp at 200% (311.5 per unit) stacks; 624 (312) is one row.
  await expectLayouts(group, [
    [411, 2, 'column'],
    [360, 1.3, 'column'],
    [411, 1, 'row'],
    [360, 1, 'row'],
    [411, 1.3, 'row'],
    [623, 2, 'column'],
    [624, 2, 'row'],
  ]);

  // Two options, the Scan screen's Sale | Purchase: half the row easily holds "Purchase" at 130% on a 360 dp phone
  // (277 dp per unit), so they keep one row there, and they stack at 200% on a 360 or a 411 dp one. At the edge: 415 dp
  // at 200% (207.5 per unit) stacks; 416 (208) is one row. The same roles, states and ink selection.
  await screen.rerender(<Segmented label="Kind" options={KINDS} value="purchase" onChange={onChange} />);
  const kinds = () => screen.getByRole('radiogroup', { name: 'Kind' });
  await expectLayouts(kinds, [
    [360, 1.3, 'row'],
    [360, 2, 'column'],
    [411, 2, 'column'],
    [415, 2, 'column'],
    [416, 2, 'row'],
  ]);
  expect(screen.getByRole('radio', { name: 'Purchase', checked: true })).toHaveStyle({ backgroundColor: colors.ink });
  expect(screen.getByRole('radio', { name: 'Sale', checked: false })).toHaveStyle({ backgroundColor: undefined });
  await fireEvent.press(screen.getByRole('radio', { name: 'Sale' }));
  expect(onChange).toHaveBeenLastCalledWith('sale');

  // The photo viewer's views stack the same way, in their dark tone.
  await atWindow(411, 2);
  await screen.rerender(<Segmented tone="dark" label="View" options={VIEWS} value="enhanced" onChange={noop} />);
  expect(screen.getByRole('radiogroup', { name: 'View' })).toHaveStyle({
    flexDirection: 'column',
    backgroundColor: undefined,
  });
  expect(screen.getByRole('radio', { name: 'Enhanced', checked: true })).toHaveStyle({
    flex: undefined,
    backgroundColor: colors.cameraText,
  });
  expect(screen.getByRole('radio', { name: 'Original', checked: false })).toHaveStyle({ flex: undefined });
});

test('Segmented dark: for the photo viewer', async () => {
  await render(<Segmented tone="dark" label="View" options={VIEWS} value="enhanced" onChange={noop} />);
  // no fill of its own on the viewer
  expect(screen.getByRole('radiogroup', { name: 'View' })).toHaveStyle({ backgroundColor: undefined });
  expect(screen.getByRole('radio', { name: 'Enhanced', checked: true })).toHaveStyle({
    backgroundColor: colors.cameraText,
  });
  expect(screen.getByText('Enhanced')).toHaveStyle({ color: colors.ink });
  for (const name of ['B&W', 'Original']) {
    expect(screen.getByRole('radio', { name, checked: false })).toHaveStyle({ backgroundColor: undefined });
    expect(screen.getByText(name)).toHaveStyle({ color: colors.cameraText });
  }
});

test('ChoiceChips: pills that wrap, ink when chosen, a helper under them', async () => {
  const onChange = jest.fn();
  await render(<ChoiceChips label="Tax type" options={TAX_TYPES} value="VAT" onChange={onChange} helper={SUGGESTED} />);
  const group = screen.getByRole('radiogroup', { name: 'Tax type' });
  expect(within(group).getByText('Tax type')).toHaveStyle({ ...type.label, color: colors.mute }); // above the pills
  expect(within(group).getAllByRole('radio')).toHaveLength(5);

  const zero = screen.getByRole('radio', { name: 'Zero-rated', checked: false });
  expect(zero).toHaveStyle({
    minHeight: touch.chip,
    height: undefined,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
  });
  expect(zero.props.hitSlop).toBeGreaterThanOrEqual(4); // 40 dp tall, a 48 dp target
  expect(screen.getByText('Zero-rated')).toHaveStyle({ ...type.label, color: colors.ink });
  expect(zero.parent).toHaveStyle({ flexDirection: 'row', flexWrap: 'wrap', gap: space.s });
  await fireEvent.press(zero);
  expect(onChange).toHaveBeenCalledWith('ZERO');

  expect(screen.getByRole('radio', { name: 'VAT', checked: true })).toHaveStyle({ backgroundColor: colors.ink });
  expect(screen.getByText('VAT')).toHaveStyle({ color: colors.paper });

  // The helper is under the group, not in it, so TalkBack reads it after the pills.
  expect(screen.getByText(SUGGESTED)).toHaveStyle({ ...type.label, color: colors.mute });
  expect(within(group).queryByText(SUGGESTED)).toBeNull();
  expect(kids(group.parent!)).toEqual([group, screen.getByText(SUGGESTED)]);

  // Saved's filter: the label isn't shown, but it still names the group. Nothing chosen yet: no pill is checked.
  await screen.rerender(<ChoiceChips label="Show" showLabel={false} options={TAX_TYPES} value={null} onChange={noop} />);
  expect(screen.queryByText('Show')).toBeNull();
  expect(screen.getByRole('radiogroup', { name: 'Show' })).toBeOnTheScreen();
  expect(screen.queryByRole('radio', { checked: true })).toBeNull();
  expect(screen.queryByText(SUGGESTED)).toBeNull();
});

test('TextField: label, outline, focus border, and one note under it', async () => {
  const onFocus = jest.fn();
  const onBlur = jest.fn();
  await render(
    <TextField
      label="Revenue account"
      value="4010"
      onChangeText={noop}
      helper="Code or name, as in MyBizMate"
      onFocus={onFocus}
      onBlur={onBlur}
    />,
  );
  const input = () => screen.getByLabelText('Revenue account');
  const box = () => input().parent!;
  expect(screen.getByText('Revenue account')).toHaveStyle({ ...type.label, color: colors.mute });
  expect(box()).toHaveStyle({
    minHeight: touch.target,
    height: undefined,
    borderRadius: radius.field,
    backgroundColor: colors.panel,
    paddingHorizontal: space.m,
    borderWidth: 1,
    borderColor: colors.outline,
  });
  expect(input()).toHaveStyle({ ...type.body, color: colors.ink });
  expect(input().props.placeholderTextColor).toBe(colors.mute);
  expect(input().props.autoCorrect).toBe(false);
  expect(input().props.underlineColorAndroid).toBe('transparent'); // the box is the field: no EditText underline
  /** How far the text sits from the box's outer edge: the border, then the padding. */
  const inset = () => {
    const outer = StyleSheet.flatten(box().props.style);
    const own = StyleSheet.flatten(input().props.style);
    return { x: outer.borderWidth + outer.paddingHorizontal, y: outer.borderWidth + own.paddingVertical };
  };
  const atRest = inset();

  await fireEvent(input(), 'focus');
  expect(box()).toHaveStyle({ borderWidth: 2, borderColor: colors.focus });
  expect(inset()).toEqual(atRest); // the padding gives back the thicker border's 1 dp, so nothing inside moves
  expect(onFocus).toHaveBeenCalledTimes(1);
  await fireEvent(input(), 'blur');
  expect(box()).toHaveStyle({ borderWidth: 1, borderColor: colors.outline });
  expect(onBlur).toHaveBeenCalledTimes(1);

  // The helper, in mute, is also the field's hint.
  expect(screen.getByText('Code or name, as in MyBizMate')).toHaveStyle({ ...type.label, color: colors.mute });
  expect(input().props.accessibilityHint).toBe('Code or name, as in MyBizMate');

  // An error beats a warning, which beats the helper: only one note shows.
  const atc = (notes: { error?: string; warning?: string }) => (
    <TextField
      label="Withholding tax ATC"
      value="WC1"
      onChangeText={noop}
      helper="Used when an invoice shows tax withheld"
      {...notes}
    />
  );
  await screen.rerender(atc({ error: 'Type the code', warning: 'Like WC158: 2 letters, 3 digits' }));
  const error = screen.getByText('Type the code');
  expect(error).toHaveStyle({ ...type.label, color: colors.danger });
  expect(screen.queryByText('Like WC158: 2 letters, 3 digits')).toBeNull();
  expect(screen.queryByText('Used when an invoice shows tax withheld')).toBeNull();
  expect(kids(error.parent!)[0].props).toMatchObject({ width: 16, stroke: colors.danger }); // CircleAlert, 16 dp
  expect(screen.getByLabelText('Withholding tax ATC').props.accessibilityHint).toBe('Type the code');

  await screen.rerender(atc({ warning: 'Like WC158: 2 letters, 3 digits' }));
  const warning = screen.getByText('Like WC158: 2 letters, 3 digits');
  expect(warning).toHaveStyle({ color: colors.warning });
  expect(kids(warning.parent!)[0].props).toMatchObject({ width: 16, stroke: colors.warning }); // TriangleAlert
  expect(screen.queryByText('Used when an invoice shows tax withheld')).toBeNull();
  expect(screen.getByLabelText('Withholding tax ATC').props.accessibilityHint).toBe('Like WC158: 2 letters, 3 digits');

  await screen.rerender(atc({}));
  expect(screen.getByText('Used when an invoice shows tax withheld')).toHaveStyle({ color: colors.mute });

  // mono: figures, codes and dates, in the figure style (on Android, IBM Plex Mono).
  await screen.rerender(<TextField label="What the box says" value="Oct 29, 2026" onChangeText={noop} mono />);
  expect(screen.getByLabelText('What the box says')).toHaveStyle({
    ...type.figure,
    fontFamily: type.figure.fontFamily,
    color: colors.ink,
  });
  expect(screen.getByLabelText('What the box says').props.accessibilityHint).toBeUndefined(); // no note, no hint
});

test('TextField: a search field with a clear button', async () => {
  const onChangeText = jest.fn();
  const search = (value: string) => (
    <TextField
      hideLabel
      label="Search your customers"
      placeholder="Search your customers"
      leading={Search}
      clearLabel="Clear the search"
      value={value}
      onChangeText={onChangeText}
    />
  );
  await render(search(''));
  expect(screen.queryByText('Search your customers')).toBeNull(); // the label is spoken, not shown
  const input = screen.getByLabelText('Search your customers');
  expect(input.props.placeholder).toBe('Search your customers');
  const [glyph] = kids(input.parent!); // the Search icon leads, 20 dp, as a quiet icon
  expect(glyph.props).toMatchObject({ width: touch.iconSmall, stroke: colors.chevron });
  expect(screen.queryByRole('button', { name: 'Clear the search' })).toBeNull();

  await screen.rerender(search('Santos'));
  clearFieldsFocused();
  await fireEvent.press(screen.getByRole('button', { name: 'Clear the search' }));
  expect(onChangeText).toHaveBeenCalledWith('');
  // The button goes with the text, and it may have had the focus (a keyboard's, say): the field takes it, so typing
  // goes on there.
  expect(fieldsFocused()).toEqual(['Search your customers']);

  await screen.rerender(search(''));
  expect(screen.queryByRole('button', { name: 'Clear the search' })).toBeNull();
});

test('TextField scrolls itself into view when focused inside a Screen', async () => {
  const { input, content, scrollTo } = await fieldInScreen(420);
  expect(scrollTo).not.toHaveBeenCalled();

  await fireEvent(input, 'focus');
  // the Screen's scroll-into-view: the field measured against the scroll's content, then 24 dp under the top
  expect(measureLayout).toHaveBeenCalledWith(content, expect.any(Function));
  expect(scrollTo).toHaveBeenCalledTimes(1);
  expect(scrollTo).toHaveBeenLastCalledWith({ y: 420 - space.xl, animated: true });
  expect(input.parent).toHaveStyle({ borderWidth: 2, borderColor: colors.focus });
});

test('TextField brings its whole field into view: the label above its box and the helper under it', async () => {
  // QA pass 2, at 200% with the keyboard up: Settings scrolled the ATC field's input 24 dp under the top, and its label,
  // over the input, sat half under the header. What's measured is the field's own view, from its label to its helper.
  const { input, scrollTo } = await fieldInScreen(420);
  await fireEvent(input, 'focus');
  const field = screen.getByText('Offset account for 2307s').parent!; // the label's parent: the field's own view
  expect(within(field).getByLabelText('Offset account for 2307s')).toBe(input);
  expect(within(field).getByText(OFFSET_HELPER)).toBeOnTheScreen();
  const measured = measureLayout.mock.contexts as { props: { children?: unknown } }[];
  expect(measured).toHaveLength(1);
  expect(measured[0]).toBeInstanceOf(View);
  expect(measured[0]).not.toBeInstanceOf(TextInput);
  // jest's View draws its host view with the children it was given: the view measured is that field's own
  expect(measured[0].props.children).toBe(field.props.children);
  // So the field's top, its label's, goes 24 dp under the scroll's top: the input's own place, lower, isn't used.
  expect(scrollTo).toHaveBeenCalledTimes(1);
  expect(scrollTo).toHaveBeenLastCalledWith({ y: 420 - space.xl, animated: true });
});

test('TextField scrolls into view again when the keyboard opens or grows while it has focus (ruling T5-2)', async () => {
  const { input, scrollTo } = await fieldInScreen(420);
  await fireEvent(input, 'focus');
  expect(scrollTo).toHaveBeenCalledTimes(1);

  // The keyboard opens after the focus, and the end of the scroll grows with it: the field scrolls again, whole.
  await keyboard(300);
  expect(scrollTo).toHaveBeenCalledTimes(2);
  expect(scrollTo).toHaveBeenLastCalledWith({ y: 420 - space.xl, animated: true });
  expect(measureLayout.mock.contexts[1]).toBe(measureLayout.mock.contexts[0]); // the same view: the field's own
  await keyboard(320); // the emoji panel: taller
  expect(scrollTo).toHaveBeenCalledTimes(3);
  await keyboard(300); // shorter again: the field is still in view
  expect(scrollTo).toHaveBeenCalledTimes(3);

  // Without focus, the keyboard moves nothing.
  await fireEvent(input, 'blur');
  await keyboard(0);
  await keyboard(300);
  expect(scrollTo).toHaveBeenCalledTimes(3);
  await keyboard(0);
});
