import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { createRef, type ReactElement, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Alert,
  type AlertButton,
  Animated,
  Dimensions,
  Easing,
  ScrollView,
  type ScrollViewInstance,
  StyleSheet,
  Text,
  type TextInputInstance,
  View,
  type ViewInstance,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { ButtonProps } from '../components/Buttons';
import { Menu } from '../components/Menu';
import { Screen } from '../components/Screen';
import { confirmDiscard, Sheet } from '../components/Sheet';
import { TextField } from '../components/TextField';
import { colors, durations, elevation, radius, space, touch, type } from '../lib/theme';
import { keyboard } from '../test-utils/keyboard';
import { standIn } from '../test-utils/scrollStandIn';

// Design B §5.5, §5.6, §7 and §8: the sheet, on an RN Modal with no animation of its own. Its scrim fades and its
// panel slides up, or both only fade with reduced motion. A title row holds Back (a step's), the title and Close; the
// action row is pinned under the scroll, above the bottom inset and the keyboard. Back, Close, the scrim and system back
// ask before typing is lost. TalkBack focus moves to the title, and back to the opener on close. The ⋮ menu opens under
// its anchor, over a light scrim. This file's insets: 24 dp at the top, 34 at the bottom. The test setup runs every
// animation to its end at once; a test that needs the frames or the end stubs Animated.timing or Animated.parallel.

const BOTTOM = 34;
const noop = () => {};
const DISCARD = 'Discard what you typed?';
type EndCallback = NonNullable<Parameters<Animated.CompositeAnimation['start']>[0]>;

function Insets({ children }: { children?: ReactNode }) {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 360, height: 800 },
        insets: { top: 24, bottom: BOTTOM, left: 0, right: 0 },
      }}>
      {children}
    </SafeAreaProvider>
  );
}
const show = (ui: ReactElement) => render(ui, { wrapper: Insets });

const button = (name: string) => screen.getByRole('button', { name });
type Instance = ReturnType<typeof screen.getByRole>;
const kids = (instance: Instance) => instance.children.filter((child): child is Instance => typeof child !== 'string');
/** The scrim, which TalkBack (and so a default query) skips. */
const scrim = () => screen.getByTestId('sheet-scrim', { includeHiddenElements: true });
/** Android's back: the Modal's onRequestClose. */
const systemBack = () => act(async () => screen.getByTestId('sheet').props.onRequestClose());

const cancelAndSave = (onSave: () => void = noop): ButtonProps[] => [
  { label: 'Cancel', variant: 'text', onPress: noop },
  { label: 'Save', onPress: onSave },
];

let alert: jest.SpyInstance;
/** Reduced motion's change events, which every useReducedMotion hook listening hears. */
let motionListeners: ((enabled: boolean) => void)[] = [];
const reduceMotion = (enabled: boolean) => act(async () => motionListeners.forEach((l) => l(enabled)));

beforeEach(() => {
  jest.clearAllMocks();
  alert = jest.spyOn(Alert, 'alert').mockImplementation(noop);
  motionListeners = [];
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation((event, listener) => {
    if (event === 'reduceMotionChanged') motionListeners.push(listener as (enabled: boolean) => void);
    return { remove: noop };
  });
});

afterEach(() => {
  jest.restoreAllMocks(); // Animated's spies, and Alert's
});

/** The prompt's buttons, from the last Alert.alert. */
const promptButtons = () => alert.mock.calls[alert.mock.calls.length - 1][2] as AlertButton[];

test('a sheet: its title is a header, Close closes it, and so does system back', async () => {
  const onClose = jest.fn();
  await show(
    <Sheet visible title="Terms" subtitle="On the paper: Cash is ticked." onClose={onClose}>
      <Text>Cash</Text>
    </Sheet>,
  );
  const title = screen.getByRole('header', { name: 'Terms' });
  expect(title).toHaveStyle({ ...type.title, color: colors.ink });
  expect(title.props.numberOfLines).toBeUndefined(); // it wraps
  expect(screen.getByText('On the paper: Cash is ticked.')).toHaveStyle({ ...type.body, color: colors.mute });
  expect(screen.queryByTestId('sheet-handle')).toBeNull(); // no fake drag handle
  // The title row: the title, then Close; no Back on a sheet that isn't a step.
  expect(kids(title.parent!)).toEqual([title, button('Close')]);
  expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();

  await fireEvent.press(button('Close'));
  expect(onClose).toHaveBeenCalledTimes(1);
  await systemBack();
  expect(onClose).toHaveBeenCalledTimes(2);

  // An RN Modal with no animation of its own, edge to edge: the sheet animates itself and pads by the insets.
  expect(screen.getByTestId('sheet').props).toMatchObject({
    transparent: true,
    animationType: 'none',
    statusBarTranslucent: true,
    navigationBarTranslucent: true,
  });
});

test('the scrim closes it and is hidden from TalkBack', async () => {
  const onClose = jest.fn();
  await show(<Sheet visible title="Terms" onClose={onClose} />);
  expect(scrim().props.importantForAccessibility).toBe('no-hide-descendants');
  expect(scrim().props.accessibilityLabel).toBeUndefined();
  expect(screen.queryByTestId('sheet-scrim')).toBeNull(); // skipped, as TalkBack skips it
  expect(scrim()).toHaveStyle({ backgroundColor: colors.scrim });
  await fireEvent.press(scrim());
  expect(onClose).toHaveBeenCalledTimes(1);
});

test('a dirty sheet asks before typing is lost', async () => {
  const onClose = jest.fn();
  await show(
    <Sheet visible dirty title="Date" onClose={onClose}>
      <Text>Oct 28</Text>
    </Sheet>,
  );
  await fireEvent.press(button('Close'));
  expect(alert).toHaveBeenCalledWith(DISCARD, undefined, [
    { text: 'Keep editing', style: 'cancel' },
    { text: 'Discard', style: 'destructive', onPress: expect.any(Function) },
  ]);
  expect(onClose).not.toHaveBeenCalled();
  const [keep, discard] = promptButtons();
  keep.onPress?.(); // Keep editing: nothing happens
  expect(onClose).not.toHaveBeenCalled();
  discard.onPress?.();
  expect(onClose).toHaveBeenCalledTimes(1);

  // The scrim and system back ask the same way.
  await fireEvent.press(scrim());
  await systemBack();
  expect(alert).toHaveBeenCalledTimes(3);
  expect(alert.mock.calls.map((call) => call[0])).toEqual([DISCARD, DISCARD, DISCARD]);
  expect(onClose).toHaveBeenCalledTimes(1);
  promptButtons()[1].onPress?.();
  expect(onClose).toHaveBeenCalledTimes(2);

  // A step's Back asks too, then goes back a step.
  const onBack = jest.fn();
  await screen.rerender(<Sheet visible dirty title="Date" onBack={onBack} onClose={onClose} />);
  await fireEvent.press(button('Back'));
  expect(alert).toHaveBeenCalledTimes(4);
  expect(onBack).not.toHaveBeenCalled();
  promptButtons()[1].onPress?.();
  expect(onBack).toHaveBeenCalledTimes(1);
  expect(onClose).toHaveBeenCalledTimes(2);

  // Nothing typed: nothing to ask.
  await screen.rerender(<Sheet visible title="Date" onClose={onClose} />);
  await fireEvent.press(button('Close'));
  expect(onClose).toHaveBeenCalledTimes(3);
  expect(alert).toHaveBeenCalledTimes(4);

  // The box editor's own paths ask with the same prompt.
  const onDiscard = jest.fn();
  confirmDiscard(onDiscard);
  expect(alert).toHaveBeenLastCalledWith(DISCARD, undefined, [
    { text: 'Keep editing', style: 'cancel' },
    { text: 'Discard', style: 'destructive', onPress: onDiscard },
  ]);
});

test('a step sheet: Back and system back go back a step', async () => {
  const onBack = jest.fn();
  const onClose = jest.fn();
  await show(<Sheet visible title="Date" onBack={onBack} onClose={onClose} />);
  // The title row, in reading order: Back, the title, then Close.
  const title = screen.getByRole('header', { name: 'Date' });
  expect(kids(title.parent!)).toEqual([button('Back'), title, button('Close')]);

  await fireEvent.press(button('Back'));
  await systemBack();
  expect(onBack).toHaveBeenCalledTimes(2);
  expect(onClose).not.toHaveBeenCalled();
  await fireEvent.press(button('Close')); // Close still closes the whole sheet
  expect(onClose).toHaveBeenCalledTimes(1);

  await screen.rerender(<Sheet visible title="Date" onBack={null} onClose={onClose} />);
  expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  await systemBack();
  expect(onClose).toHaveBeenCalledTimes(2);
  expect(onBack).toHaveBeenCalledTimes(2);
});

test('its actions are pinned under the scroll', async () => {
  const onSave = jest.fn();
  await show(
    <Sheet visible title="Date" onClose={noop} actions={cancelAndSave(onSave)}>
      <Text>What the box says</Text>
    </Sheet>,
  );
  const actions = screen.getByTestId('sheet-actions');
  const scroll = screen.getByTestId('sheet-scroll');
  expect(within(actions).getByTestId('button-row')).toBeOnTheScreen();
  expect(within(actions).getByRole('button', { name: 'Save' })).toBeOnTheScreen();
  expect(within(actions).getByRole('button', { name: 'Cancel' })).toBeOnTheScreen();
  expect(within(scroll).queryByRole('button', { name: 'Save' })).toBeNull();
  expect(within(scroll).getByText('What the box says')).toBeOnTheScreen();
  expect(scroll.props.keyboardShouldPersistTaps).toBe('handled');
  // The panel ends with the scroll, then the action row under it.
  expect(kids(screen.getByTestId('sheet-panel')).slice(-2)).toEqual([scroll, actions]);
  await fireEvent.press(button('Save'));
  expect(onSave).toHaveBeenCalledTimes(1);

  await screen.rerender(<Sheet visible title="Date" onClose={noop} />);
  expect(screen.queryByTestId('sheet-actions')).toBeNull();
});

test('the panel: up to 90% of the screen, 16 dp top corners, padded by the bottom inset', async () => {
  await show(<Sheet visible title="Date" onClose={noop} actions={cancelAndSave()} />);
  expect(screen.getByTestId('sheet-panel')).toHaveStyle({
    maxHeight: '90%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    backgroundColor: colors.panel,
    elevation: elevation.overlay,
  });
  const actions = () => screen.getByTestId('sheet-actions');
  expect(actions()).toHaveStyle({ paddingHorizontal: space.l, paddingBottom: space.m + BOTTOM });
  // Over the keyboard too: RN 0.88 reports its height above the navigation bar (ruling T5-1).
  await keyboard(300);
  expect(actions()).toHaveStyle({ paddingBottom: space.m + BOTTOM + 300 });
  await keyboard(0);
  expect(actions()).toHaveStyle({ paddingBottom: space.m + BOTTOM });

  // With no action row, the end of the scroll clears the inset and the keyboard instead.
  await screen.rerender(
    <Sheet visible title="Columns for items" onClose={noop}>
      <Text>Name, Code, Unit</Text>
    </Sheet>,
  );
  const end = () => StyleSheet.flatten(screen.getByTestId('sheet-scroll').props.contentContainerStyle);
  expect(end()).toMatchObject({ paddingBottom: space.xl + BOTTOM });
  await keyboard(300);
  expect(end()).toMatchObject({ paddingBottom: space.xl + BOTTOM + 300 });
  await keyboard(0);
});

test("its fields scroll the sheet's own scroll, never the Screen behind it", async () => {
  const behindRef = createRef<ScrollViewInstance>();
  const input = createRef<TextInputInstance>();
  await show(
    <Screen header={null} scrollRef={behindRef}>
      <Text>The Scan screen</Text>
      {/* A sheet, rendered from the screen's children: a Modal, which React context passes through. */}
      <Sheet visible title="Supplier" onClose={noop}>
        <TextField label="Supplier's name" value="" onChangeText={noop} inputRef={input} />
      </Sheet>
    </Screen>,
  );
  const behind = standIn(behindRef.current);
  // No ref reaches the sheet's own ScrollView, but jest's ScrollViews take their methods from the prototype.
  const scrollViews = (ScrollView as unknown as { prototype: ScrollViewInstance }).prototype;
  const own = { getInnerViewRef: scrollViews.getInnerViewRef, scrollTo: scrollViews.scrollTo };
  const sheet = standIn(scrollViews);
  try {
    const measureLayout = jest.fn((_relativeTo: unknown, onSuccess: (x: number, y: number) => void) => onSuccess(0, 140));
    Object.assign(input.current!, { measureLayout });
    await fireEvent(screen.getByLabelText("Supplier's name"), 'focus');
    expect(measureLayout).toHaveBeenCalledTimes(1);
    expect(measureLayout.mock.calls[0][0]).toBe(sheet.content); // measured in the sheet's scroll, not the Screen's
    expect(sheet.scrollTo).toHaveBeenCalledWith({ y: 140 - space.xl, animated: true });
    expect(behind.scrollTo).not.toHaveBeenCalled();
  } finally {
    Object.assign(scrollViews, own);
  }
});

test('TalkBack focus moves to the title once it has opened, and back to the opener once it has closed', async () => {
  // Hold each animation where it is until the test ends it.
  let finish: EndCallback = noop;
  jest.spyOn(Animated, 'parallel').mockImplementation(() => ({
    start: (callback?: EndCallback) => {
      finish = callback ?? noop;
    },
    stop: noop,
    reset: noop,
  }));
  const end = () => act(async () => finish({ finished: true }));
  const focus = jest.mocked(AccessibilityInfo.sendAccessibilityEvent);
  const opener = createRef<ViewInstance>();
  const ui = (visible: boolean) => (
    <>
      <View ref={opener} />
      <Sheet visible={visible} title="Customer" onClose={noop} returnFocus={opener}>
        <Text>Matched by its TIN and name.</Text>
      </Sheet>
    </>
  );
  await show(ui(false));
  expect(screen.queryByTestId('sheet', { includeHiddenElements: true })).toBeNull();

  await screen.rerender(ui(true));
  expect(focus).not.toHaveBeenCalled(); // not while it slides up
  await end();
  expect(focus).toHaveBeenCalledTimes(1);
  const [target, event] = focus.mock.calls[0];
  expect(event).toBe('focus');
  expect(target).toMatchObject({ props: { accessibilityRole: 'header', children: 'Customer' } });

  // Closing: the Modal stays up through the animation, but takes no touches and TalkBack leaves it.
  await screen.rerender(ui(false));
  expect(screen.getByTestId('sheet', { includeHiddenElements: true })).toBeTruthy();
  expect(screen.queryByText('Matched by its TIN and name.')).toBeNull();
  expect(screen.getByText('Matched by its TIN and name.', { includeHiddenElements: true })).toBeOnTheScreen();
  expect(kids(screen.getByTestId('sheet', { includeHiddenElements: true }))[0].props.pointerEvents).toBe('none');
  expect(focus).toHaveBeenCalledTimes(1);

  await end();
  expect(screen.queryByTestId('sheet', { includeHiddenElements: true })).toBeNull();
  expect(focus).toHaveBeenCalledTimes(2);
  expect(focus).toHaveBeenLastCalledWith(opener.current, 'focus');
});

test('motion: the scrim fades and the panel slides up, easing out; with reduced motion both only fade', async () => {
  // Every animation holds its first frame.
  const still: Animated.CompositeAnimation = { start: noop, stop: noop, reset: noop };
  const timing = jest.spyOn(Animated, 'timing').mockReturnValue(still);
  const { height } = Dimensions.get('window');
  const ui = (visible: boolean) => <Sheet visible={visible} title="Terms" onClose={noop} />;
  const panel = () => screen.getByTestId('sheet-panel', { includeHiddenElements: true });
  const fill = () => scrim().parent!; // what fades: the scrim's fill
  await show(ui(true));
  expect(fill()).toHaveStyle({ opacity: 0 });
  expect(panel()).toHaveStyle({ transform: [{ translateY: height }] }); // below the screen
  expect(panel()).not.toHaveStyle({ opacity: 0 });
  // Two animations, one each for the scrim and the panel: the panel's is the one that takes sheetIn.
  const opening = timing.mock.calls.map(([value, config]) => ({ value, config }));
  expect(opening).toHaveLength(2);
  const slideUp = opening.find(({ config }) => config.duration === durations.sheetIn)!;
  const fadeIn = opening.find(({ value }) => value !== slideUp.value)!;
  expect(fadeIn.config).toEqual({ toValue: 1, duration: durations.scrim, useNativeDriver: true });
  expect(slideUp.config).toMatchObject({ toValue: 1, useNativeDriver: true });
  expect(slideUp.config.easing!(0.5)).toBeCloseTo(Easing.out(Easing.cubic)(0.5));

  timing.mockClear();
  await screen.rerender(ui(false));
  const closing = (value: unknown) => timing.mock.calls.find(([v]) => v === value)![1];
  expect(closing(fadeIn.value)).toEqual({ toValue: 0, duration: durations.scrim, useNativeDriver: true });
  expect(closing(slideUp.value)).toMatchObject({ toValue: 0, duration: durations.sheetOut, useNativeDriver: true });

  // Reduced motion, turned on while the sheet is up: from then on the panel fades in place, with no slide.
  await screen.unmount();
  await show(ui(true));
  await reduceMotion(true);
  expect(panel()).toHaveStyle({ opacity: 0 });
  expect(StyleSheet.flatten(panel().props.style).transform).toBeUndefined();
  expect(fill()).toHaveStyle({ opacity: 0 });
  await reduceMotion(false); // as the other tests expect
});

/** A ⋮ menu, anchored to its 48 dp button at the right end of the header, under the status bar. */
function headerMenu(onClose: () => void, onDelete: () => void) {
  const anchor = createRef<ViewInstance>();
  const ui = (visible: boolean) => (
    <>
      <View ref={anchor} />
      <Menu
        visible={visible}
        anchor={anchor}
        onClose={onClose}
        items={[
          { label: 'Another item', onPress: noop },
          { label: 'Delete saved scan', onPress: onDelete, destructive: true },
        ]}
      />
    </>
  );
  /** jest's views have no layout: where Android would measure the anchor, in the window. */
  const place = () => {
    const { width } = Dimensions.get('window');
    Object.assign(anchor.current!, {
      measureInWindow: (onSuccess: (x: number, y: number, w: number, h: number) => void) =>
        onSuccess(width - touch.target, 24, touch.target, touch.target),
    });
  };
  return { ui, place };
}

test('Menu: anchored items, destructive in danger, back closes', async () => {
  const calls: string[] = [];
  const onClose = jest.fn(() => calls.push('close'));
  const onDelete = jest.fn(() => calls.push('delete'));
  const { ui, place } = headerMenu(onClose, onDelete);
  await show(ui(false));
  expect(screen.queryByRole('menuitem')).toBeNull();
  place();
  await screen.rerender(ui(true));

  const remove = screen.getByRole('menuitem', { name: 'Delete saved scan' });
  expect(screen.getByText('Delete saved scan')).toHaveStyle({ ...type.body, color: colors.danger });
  expect(screen.getByText('Another item')).toHaveStyle({ ...type.body, color: colors.ink });
  expect(remove).toHaveStyle({ minHeight: touch.target, height: undefined });
  expect(screen.getAllByRole('menuitem')).toHaveLength(2);
  // Under its anchor, right-aligned to it: the anchor's bottom is 24 + 48, its right edge the screen's.
  expect(screen.getByTestId('menu-panel')).toHaveStyle({
    position: 'absolute',
    top: 24 + touch.target,
    right: 0,
    backgroundColor: colors.panel,
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: colors.line,
    elevation: 8,
  });
  // Over a light scrim, which TalkBack skips.
  const menuScrim = screen.getByTestId('menu-scrim', { includeHiddenElements: true });
  expect(menuScrim).toHaveStyle({ backgroundColor: colors.hairline });
  expect(menuScrim.props.importantForAccessibility).toBe('no-hide-descendants');

  await fireEvent.press(remove);
  expect(calls).toEqual(['close', 'delete']); // the menu goes first, then the item's own step (its confirmation)
  await act(async () => screen.getByTestId('menu').props.onRequestClose()); // back closes it
  expect(onClose).toHaveBeenCalledTimes(2);
  await fireEvent.press(menuScrim);
  expect(onClose).toHaveBeenCalledTimes(3);
  expect(onDelete).toHaveBeenCalledTimes(1);
});

test('Menu motion: it fades and grows from 95% over 150 ms; with reduced motion it only fades', async () => {
  const still: Animated.CompositeAnimation = { start: noop, stop: noop, reset: noop };
  const timing = jest.spyOn(Animated, 'timing').mockReturnValue(still); // each animation holds its first frame
  const { ui, place } = headerMenu(noop, noop);
  await show(ui(false));
  place();
  await screen.rerender(ui(true));
  const panel = () => screen.getByTestId('menu-panel');
  expect(panel()).toHaveStyle({ opacity: 0, transform: [{ scale: 0.95 }], transformOrigin: 'top right' });
  expect(timing.mock.calls.map(([, config]) => config)).toEqual([
    { toValue: 1, duration: durations.menu, useNativeDriver: true },
  ]);

  await reduceMotion(true);
  expect(panel()).toHaveStyle({ opacity: 0 });
  expect(StyleSheet.flatten(panel().props.style).transform).toBeUndefined();
  await reduceMotion(false);
});
