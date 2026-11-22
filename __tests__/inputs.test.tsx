import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { createRef } from 'react';
import { type ScrollViewInstance, StyleSheet, TextInput, type TextInputInstance } from 'react-native';

import { ChoiceChips } from '../components/ChoiceChips';
import { Search } from '../components/icons';
import { Screen } from '../components/Screen';
import { Segmented } from '../components/Segmented';
import { TextField } from '../components/TextField';
import { colors, radius, space, touch, type } from '../lib/theme';
import { keyboard } from '../test-utils/keyboard';
import { standIn } from '../test-utils/scrollStandIn';

// Design B §5.6 and §7: the inputs. Segmented and ChoiceChips are radio groups that TalkBack names, with the chosen
// option in ink with a paper label (§5.1: selection is ink). A TextField has its label above, an outline border that
// becomes a 2 dp focus border, and one note under it, which is also the field's hint. Taking focus, it scrolls itself
// into view in the Screen, and again when the keyboard opens or grows (ruling T5-2).

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
const TAX_TYPES = [
  { value: 'VAT', label: 'VAT' },
  { value: 'NONVAT', label: 'Non-VAT' },
  { value: 'ZERO', label: 'Zero-rated' },
  { value: 'EXEMPT', label: 'VAT-exempt' },
  { value: 'NA', label: 'Not applicable' },
] as const;
const SUGGESTED = "Suggested from the invoice's VAT boxes";

/**
 * A TextField in a Screen. jest's ScrollView and TextInput have no layout, so this stands in the scroll's content
 * view and records its scrolls, and puts the field `y` dp down that content.
 */
async function fieldInScreen(y: number) {
  const scrollRef = createRef<ScrollViewInstance>();
  const inputRef = createRef<TextInputInstance>();
  await render(
    <Screen header={null} scrollRef={scrollRef}>
      <TextField label="Offset account for 2307s" value="" onChangeText={noop} inputRef={inputRef} />
    </Screen>,
  );
  const { content, scrollTo } = standIn(scrollRef.current);
  const measureLayout = jest.fn(
    (_relativeTo: unknown, onSuccess: (x: number, y: number, w: number, h: number) => void) =>
      onSuccess(0, y, 328, touch.target),
  );
  Object.assign(inputRef.current!, { measureLayout }); // the TextField's own input: the caller's ref gets the same one
  return { input: screen.getByLabelText('Offset account for 2307s'), content, scrollTo, measureLayout };
}

test('Segmented is a labelled radio group with an ink selection', async () => {
  const onChange = jest.fn();
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
  for (const option of options) expect(option).toHaveStyle({ minHeight: touch.target, height: undefined });

  const chosen = screen.getByRole('radio', { name: 'Suppliers 2' });
  expect(chosen.props.accessibilityState).toMatchObject({ checked: true });
  expect(chosen).toHaveStyle({ backgroundColor: colors.ink });
  expect(screen.getByText('Suppliers 2')).toHaveStyle({ ...type.button, color: colors.paper });
  const other = screen.getByRole('radio', { name: 'Customers 21', checked: false });
  expect(other).toHaveStyle({ backgroundColor: undefined });
  expect(screen.getByText('Customers 21')).toHaveStyle({ ...type.button, color: colors.ink });
  expect(screen.getByText('Customers 21').props.numberOfLines).toBeUndefined(); // labels wrap at large text

  await fireEvent.press(other);
  expect(onChange).toHaveBeenCalledWith('customers');
  // Options sit edge to edge inside the outline, so the keyboard's focus ring goes on the option's own edge.
  await fireEvent(other, 'focus');
  expect(screen.getByTestId('focus-ring')).toHaveStyle({ top: 0, left: 0, right: 0, bottom: 0 });
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
  // jest's inputs share their native methods' mocks: the fields focus() was called on, by their spoken names
  const focus = (TextInput as unknown as { prototype: { focus: jest.Mock } }).prototype.focus;
  const focused = () =>
    focus.mock.contexts.map((field: { props: { accessibilityLabel?: string } }) => field.props.accessibilityLabel);
  focus.mockClear();
  await fireEvent.press(screen.getByRole('button', { name: 'Clear the search' }));
  expect(onChangeText).toHaveBeenCalledWith('');
  // The button goes with the text, and it may have had the focus (a keyboard's, say): the field takes it, so typing
  // goes on there.
  expect(focused()).toEqual(['Search your customers']);

  await screen.rerender(search(''));
  expect(screen.queryByRole('button', { name: 'Clear the search' })).toBeNull();
});

test('TextField scrolls itself into view when focused inside a Screen', async () => {
  const { input, content, scrollTo, measureLayout } = await fieldInScreen(420);
  expect(scrollTo).not.toHaveBeenCalled();

  await fireEvent(input, 'focus');
  // the Screen's scroll-into-view: the field measured against the scroll's content, then 24 dp under the top
  expect(measureLayout).toHaveBeenCalledWith(content, expect.any(Function));
  expect(scrollTo).toHaveBeenCalledTimes(1);
  expect(scrollTo).toHaveBeenLastCalledWith({ y: 420 - space.xl, animated: true });
  expect(input.parent).toHaveStyle({ borderWidth: 2, borderColor: colors.focus });
});

test('TextField scrolls into view again when the keyboard opens or grows while it has focus (ruling T5-2)', async () => {
  const { input, scrollTo } = await fieldInScreen(420);
  await fireEvent(input, 'focus');
  expect(scrollTo).toHaveBeenCalledTimes(1);

  // The keyboard opens after the focus, and the end of the scroll grows with it: the field scrolls again.
  await keyboard(300);
  expect(scrollTo).toHaveBeenCalledTimes(2);
  expect(scrollTo).toHaveBeenLastCalledWith({ y: 420 - space.xl, animated: true });
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
