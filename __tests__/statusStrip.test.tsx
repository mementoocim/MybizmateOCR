import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { type ComponentProps, createRef } from 'react';
import { AccessibilityInfo, Animated, Dimensions, StyleSheet, type ViewInstance } from 'react-native';

import { FlagChip } from '../components/FlagChip';
import { CircleCheck, type IconComponent, TriangleAlert } from '../components/icons';
import { StatusStrip } from '../components/StatusStrip';
import { colors, durations, radius, space, touch, type } from '../lib/theme';

// Design B §9.5, §5.5 and §7: the status strip, pinned under the Scan screen's header. Things to check, with a flag
// chip per problem word; what it still needs before it can be saved; or checks passed. A polite live region whose
// headline is a header. When its chips would make it take more than a third of the screen, they scroll in one row. It
// cross-fades when its state changes after a fix. Layout itself is native, so these tests read the styles, the labels
// and what a press or a layout does.

type Props = ComponentProps<typeof StatusStrip>;
type Instance = ReturnType<typeof screen.getByText>;

const noop = () => {};
const PROBLEMS = ['Date', 'Row 2 math', 'VAT breakdown'];
const TO_CHECK = { kind: 'to_check', problems: PROBLEMS } as const;
const PASSED = { kind: 'passed' } as const;
const DEFAULTS: Props = { state: TO_CHECK, fixed: 0, sample: false, saved: 'no', onChip: noop };

const showStrip = (props: Partial<Props> = {}) => render(<StatusStrip {...DEFAULTS} {...props} />);
const strip = () => screen.getByTestId('status-strip');
/** The icons under a node drawn in a color. */
const iconsIn = (node: Instance, color: string) => node.queryAll((n) => n.props.stroke === color);
/** A glyph as drawn on its own, to compare with the one the strip draws. */
async function drawingOf(Icon: IconComponent, color: string) {
  await render(<Icon size={touch.iconSmall} color={color} />);
  return screen.root!.toJSON();
}

/** Reduced motion's change events, which every useReducedMotion hook listening hears. */
let motionListeners: ((enabled: boolean) => void)[] = [];
const reduceMotion = (enabled: boolean) => act(async () => motionListeners.forEach((l) => l(enabled)));

beforeEach(() => {
  motionListeners = [];
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation((event, listener) => {
    if (event === 'reduceMotionChanged') motionListeners.push(listener as (enabled: boolean) => void);
    return { remove: noop };
  });
});

afterEach(() => jest.restoreAllMocks());

test('to check: count, sub-line and one chip per problem', async () => {
  const triangle = await drawingOf(TriangleAlert, colors.warning);
  const onChip = jest.fn();
  await showStrip({ onChip });
  expect(screen.getByRole('header', { name: '3 to check' })).toHaveStyle({ ...type.headline, color: colors.ink });
  expect(screen.getByText('Tap one to fix it')).toHaveStyle({ ...type.label, color: colors.mute });
  expect(screen.getAllByRole('button').map((chip) => chip.props.accessibilityLabel)).toEqual([
    'Date, to check',
    'Row 2 math, to check',
    'VAT breakdown, to check',
  ]);
  await fireEvent.press(screen.getByRole('button', { name: 'Row 2 math, to check' }));
  expect(onChip).toHaveBeenCalledTimes(1);
  expect(onChip).toHaveBeenCalledWith('Row 2 math');

  expect(strip()).toHaveStyle({
    backgroundColor: colors.warningTint,
    paddingHorizontal: space.l,
    paddingVertical: space.m,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  });
  expect(strip().props.accessibilityLiveRegion).toBe('polite');
  expect(iconsIn(strip(), colors.warning).map((icon) => icon.toJSON())).toEqual([triangle]);
  // the chips wrap
  const chips = screen.getByTestId('strip-chips');
  expect(chips).toHaveStyle({ flexDirection: 'row', flexWrap: 'wrap', gap: space.s });
  expect(within(chips).getAllByRole('button')).toHaveLength(3);
});

test("blocked: the reason, and Can't save yet", async () => {
  const triangle = await drawingOf(TriangleAlert, colors.warning);
  await showStrip({ state: { kind: 'blocked', reason: 'No income payments were read' } });
  expect(screen.getByRole('header', { name: 'No income payments were read' })).toHaveStyle({
    ...type.headline,
    color: colors.ink,
  });
  expect(screen.getByText("Can't save yet")).toHaveStyle({ ...type.label, color: colors.mute });
  expect(screen.queryAllByRole('button')).toHaveLength(0);
  expect(strip()).toHaveStyle({ backgroundColor: colors.warningTint });
  expect(strip().props.accessibilityLiveRegion).toBe('polite');
  expect(iconsIn(strip(), colors.warning).map((icon) => icon.toJSON())).toEqual([triangle]);
});

test('checks passed, and its sub-lines', async () => {
  const check = await drawingOf(CircleCheck, colors.success);
  const cases: [Partial<Props>, string][] = [
    [{}, 'Look over the values, then save'],
    [{ fixed: 2 }, 'Look over the values, then save · you fixed 2 boxes'],
    [{ fixed: 1 }, 'Look over the values, then save · you fixed 1 box'],
    [{ sample: true }, "Samples can't be saved"],
    [{ sample: true, fixed: 2 }, "Samples can't be saved"], // in place of the whole line
    [{ saved: 'unchanged' }, 'Look over the values'],
    [{ saved: 'unchanged', fixed: 2 }, 'Look over the values · you fixed 2 boxes'],
    [{ saved: 'changed' }, 'Look over the values, then save the changes'],
  ];
  for (const [props, sub] of cases) {
    await showStrip({ state: PASSED, ...props });
    expect(screen.getByRole('header', { name: 'Checks passed' })).toHaveStyle({ ...type.headline, color: colors.ink });
    expect(screen.getByText(sub)).toHaveStyle({ ...type.label, color: colors.mute });
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(strip()).toHaveStyle({ backgroundColor: colors.successTint });
    expect(iconsIn(strip(), colors.success).map((icon) => icon.toJSON())).toEqual([check]);
  }
});

test('when the strip would take more than a third of the screen, its chips scroll in one row', async () => {
  const initial = Dimensions.get('window');
  const third = initial.height / 3;
  const layout = (height: number) =>
    fireEvent(strip(), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: initial.width, height } } });
  const setFontScale = (fontScale: number) =>
    act(() => {
      Dimensions.set({ window: { ...initial, fontScale }, screen: Dimensions.get('screen') });
    });
  await showStrip();
  await layout(third); // a third: the chips still wrap
  expect(screen.getByTestId('strip-chips')).toBeOnTheScreen();
  expect(screen.queryByTestId('strip-chips-scroll')).toBeNull();

  await layout(third + 1);
  const scroll = screen.getByTestId('strip-chips-scroll');
  expect(scroll.type).toBe('RCTScrollView');
  expect(scroll.props.horizontal).toBe(true);
  expect(within(scroll).getAllByRole('button')).toHaveLength(3);
  expect(screen.queryByTestId('strip-chips')).toBeNull();
  // Out to the strip's edges; and a scroll view takes no touch outside itself, so it holds the chips' 48 dp targets.
  expect(scroll).toHaveStyle({ marginHorizontal: -space.l, marginVertical: -4 });
  expect(StyleSheet.flatten(scroll.props.contentContainerStyle)).toMatchObject({
    gap: space.s,
    paddingHorizontal: space.l,
    paddingVertical: 4,
  });

  // In one row the chips no longer make the strip tall: it stays so, at this width and font size, rather than flip back.
  await layout(third / 2);
  expect(screen.getByTestId('strip-chips-scroll')).toBeOnTheScreen();
  try {
    await setFontScale(initial.fontScale / 2);
    expect(screen.getByTestId('strip-chips')).toBeOnTheScreen(); // another font size: measured again
    await setFontScale(initial.fontScale); // back: remembered, so they scroll at once
    expect(screen.getByTestId('strip-chips-scroll')).toBeOnTheScreen();
  } finally {
    await setFontScale(initial.fontScale);
  }
});

test('a flag chip is at least 40 dp with a 48 dp hit area', async () => {
  const onPress = jest.fn();
  await render(<FlagChip problem="Customer (not in your list)" onPress={onPress} />);
  const chip = screen.getByRole('button', { name: 'Customer (not in your list), to check' });
  expect(chip).toHaveStyle({
    minHeight: touch.chip,
    height: undefined,
    maxWidth: '100%', // at large text, a long word wraps inside its chip rather than run off the strip
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.warningLine,
    backgroundColor: colors.panel,
  });
  expect(chip.props.hitSlop).toBe(4);
  expect(touch.chip + 2 * chip.props.hitSlop).toBe(touch.target);
  expect(screen.getByText('Customer (not in your list)')).toHaveStyle({ ...type.label, color: colors.ink });
  await fireEvent.press(chip);
  expect(onPress).toHaveBeenCalledTimes(1);
});

test('it forwards its ref to the strip, for TalkBack focus', async () => {
  const ref = createRef<ViewInstance>();
  await render(<StatusStrip ref={ref} {...DEFAULTS} />);
  // (jest-expo renders host views as mocks; a ref holds the mock, whose props are the view's)
  expect((ref.current as unknown as { props: object }).props).toMatchObject({
    testID: 'status-strip',
    accessibilityLiveRegion: 'polite',
  });
});

test('it cross-fades when its state or its count changes after a fix; with reduced motion it changes at once', async () => {
  // Each timing is held until the test ends it, so the strip's frames can be read.
  const runs: { config: Animated.TimingAnimationConfig; end: () => void }[] = [];
  jest.spyOn(Animated, 'timing').mockImplementation((_value, config) => ({
    start: (callback) => {
      runs.push({ config, end: () => callback?.({ finished: true }) });
    },
    stop: noop,
    reset: noop,
  }));
  const configs = () => runs.map((run) => run.config);
  const end = (i: number) => act(async () => runs[i].end());
  const half = durations.strip / 2;

  await showStrip();
  expect(runs).toHaveLength(0); // it doesn't fade in when it first shows
  expect(strip()).toHaveStyle({ opacity: 1 });

  // Not its state nor its count: the words change in place.
  await screen.rerender(
    <StatusStrip {...DEFAULTS} state={{ kind: 'to_check', problems: ['Date', 'Terms', 'Total'] }} fixed={1} />,
  );
  expect(runs).toHaveLength(0);
  expect(screen.getByRole('button', { name: 'Terms, to check' })).toBeOnTheScreen();

  // A fix: 2 left. It fades out with what it showed, then in with the new count, over durations.strip in all.
  await screen.rerender(<StatusStrip {...DEFAULTS} state={{ kind: 'to_check', problems: ['Date', 'Total'] }} />);
  expect(configs()).toEqual([{ toValue: 0, duration: half, useNativeDriver: true }]);
  expect(screen.getByRole('header', { name: '3 to check' })).toBeOnTheScreen();
  await end(0);
  expect(screen.getByRole('header', { name: '2 to check' })).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Terms, to check' })).toBeNull();
  expect(configs()).toEqual([
    { toValue: 0, duration: half, useNativeDriver: true },
    { toValue: 1, duration: half, useNativeDriver: true },
  ]);
  await end(1);
  expect(runs).toHaveLength(2);

  // The last fix: checks passed.
  await screen.rerender(<StatusStrip {...DEFAULTS} state={PASSED} />);
  expect(configs().slice(2)).toEqual([{ toValue: 0, duration: half, useNativeDriver: true }]);
  await end(2);
  expect(screen.getByRole('header', { name: 'Checks passed' })).toBeOnTheScreen();
  expect(configs().slice(3)).toEqual([{ toValue: 1, duration: half, useNativeDriver: true }]);
  await end(3);

  // Reduced motion: it changes at once, and doesn't fade.
  await reduceMotion(true);
  await screen.rerender(<StatusStrip {...DEFAULTS} />);
  expect(screen.getByRole('header', { name: '3 to check' })).toBeOnTheScreen();
  expect(runs).toHaveLength(4);
  expect(StyleSheet.flatten(strip().props.style).opacity).toBeUndefined();
  await reduceMotion(false); // as the other tests expect
});

test('where animations end at once (jest, ruling T7-1), a fix shows its new state at once, at full opacity', async () => {
  // The fade in starts from an effect, not from the fade out's callback, which RN's AnimatedMock would drop.
  const warn = jest.spyOn(console, 'warn');
  await showStrip();
  await screen.rerender(<StatusStrip {...DEFAULTS} state={{ kind: 'to_check', problems: ['Date'] }} />);
  expect(screen.getByRole('header', { name: '1 to check' })).toBeOnTheScreen();
  expect(strip()).toHaveStyle({ opacity: 1 });
  await screen.rerender(<StatusStrip {...DEFAULTS} state={PASSED} fixed={1} />);
  expect(screen.getByText('Look over the values, then save · you fixed 1 box')).toBeOnTheScreen();
  expect(strip()).toHaveStyle({ opacity: 1, backgroundColor: colors.successTint });
  expect(warn).not.toHaveBeenCalled();
});
