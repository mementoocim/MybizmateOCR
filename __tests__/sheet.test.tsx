import { act, fireEvent, render, renderHook, screen, within } from '@testing-library/react-native';
import { createRef, type ReactElement, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Alert,
  type AlertButton,
  Animated,
  Dimensions,
  Easing,
  Platform,
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
import { confirmDiscard, Sheet, useLingering } from '../components/Sheet';
import { TextField } from '../components/TextField';
import { currentSnack, dismissSnack } from '../lib/snackbar';
import { colors, durations, elevation, radius, space, touch, type } from '../lib/theme';
import { toast } from '../lib/toast';
import { keyboard, sheetKeyboard } from '../test-utils/keyboard';
import { standIn } from '../test-utils/scrollStandIn';

// Design B §5.5, §5.6, §7 and §8: the sheet, on an RN Modal with no animation of its own. Its scrim fades and its
// panel slides up, or both only fade with reduced motion. A title row holds Back (a step's), the title and Close; the
// action row is pinned under the scroll, above the bottom inset and the keyboard. On Android that's the keyboard in the
// sheet's own window, as its IME view reports it (RN's keyboard events are the app window's); jest runs as iOS, where
// the sheet keeps RN's events. Back, Close, the scrim and system back ask before typing is lost. TalkBack focus moves
// to the title, and back to the opener on close. The ⋮ menu opens under its anchor, over a light scrim. This file's
// insets: 24 dp at the top, 34 at the bottom. The test setup runs every animation to its end at once; a test that needs
// the frames or the end stubs Animated.timing or Animated.parallel.

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
  // Over the keyboard too: RN 0.88 reports its height above the navigation bar (ruling T5-1). Here, as jest runs, from
  // RN's keyboard events; on Android, from the sheet's own window (the tests after this one).
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

/** On Android a sheet takes the keyboard's height from its own window: what its IME view reports (sheetKeyboard). */
const onAndroid = () => jest.replaceProperty(Platform, 'OS', 'android');
/** The sheet's IME view, which TalkBack (and so a default query) skips. */
const imeView = () => screen.getByTestId('sheet-ime', { includeHiddenElements: true });
/** The action row's bottom padding, while the sheet is up or on its way out. */
const actionsPadding = () =>
  StyleSheet.flatten(screen.getByTestId('sheet-actions', { includeHiddenElements: true }).props.style).paddingBottom;
const scrollEnd = () => StyleSheet.flatten(screen.getByTestId('sheet-scroll').props.contentContainerStyle);
/** Android lays the action row out: its height, padding and all. */
const actionsLayout = (height: number) =>
  fireEvent(screen.getByTestId('sheet-actions'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 360, height } },
  });

test('a sheet lifts its actions by the keyboard height the native view reports', async () => {
  onAndroid();
  await show(<Sheet visible title="Date" onClose={noop} actions={cancelAndSave()} />);
  // The view is in the Modal, so in the sheet's own window: invisible, taking no room or touches, hidden from TalkBack.
  const modal = screen.getByTestId('sheet', { includeHiddenElements: true });
  expect(within(modal).getByTestId('sheet-ime', { includeHiddenElements: true })).toBe(imeView());
  expect(imeView()).toHaveStyle({ position: 'absolute', width: 0, height: 0 });
  expect(imeView().props).toMatchObject({
    pointerEvents: 'none',
    importantForAccessibility: 'no-hide-descendants',
    accessibilityElementsHidden: true,
  });
  expect(actionsPadding()).toBe(space.m + BOTTOM);

  // Its height is above the navigation bar, as RN gives a screen's (ruling T5-1), so the inset still counts.
  await sheetKeyboard(300);
  expect(actionsPadding()).toBe(space.m + BOTTOM + 300);
  await sheetKeyboard(320); // taller while it stays open: the emoji panel, say
  expect(actionsPadding()).toBe(space.m + BOTTOM + 320);
  // RN's own keyboard events come from the app's window, never the sheet's: here they move nothing.
  await keyboard(280);
  expect(actionsPadding()).toBe(space.m + BOTTOM + 320);
  await keyboard(0);
  await sheetKeyboard(0);
  expect(actionsPadding()).toBe(space.m + BOTTOM);

  // With no action row, the end of the scroll clears it instead.
  await screen.rerender(
    <Sheet visible title="Columns for items" onClose={noop}>
      <Text>Name, Code, Unit</Text>
    </Sheet>,
  );
  await sheetKeyboard(300);
  expect(scrollEnd()).toMatchObject({ paddingBottom: space.xl + BOTTOM + 300 });
  await sheetKeyboard(0);
  expect(scrollEnd()).toMatchObject({ paddingBottom: space.xl + BOTTOM });
});

test('the in-sheet snackbar rides above the lifted actions', async () => {
  onAndroid();
  await show(<Sheet visible title="Date" onClose={noop} actions={cancelAndSave()} />);
  await act(async () => toast('Added to your items.'));
  try {
    const snackbar = () => within(screen.getByTestId('sheet-panel')).getByTestId('snackbar');
    const row = space.m + touch.target + space.m + BOTTOM; // the action row as laid out: buttons, padding and the inset
    await actionsLayout(row);
    expect(snackbar()).toHaveStyle({ bottom: row + space.s });

    // The keyboard opens in the sheet's window: the row's padding grows by its height, and the row lays out taller.
    await sheetKeyboard(300);
    expect(actionsPadding()).toBe(space.m + BOTTOM + 300);
    await actionsLayout(row + 300);
    expect(snackbar()).toHaveStyle({ bottom: row + 300 + space.s });

    // With no action row, the message clears the inset and the keyboard itself.
    await screen.rerender(<Sheet visible title="Date" onClose={noop} />);
    expect(snackbar()).toHaveStyle({ bottom: BOTTOM + 300 + space.s });
    await sheetKeyboard(0);
    expect(snackbar()).toHaveStyle({ bottom: BOTTOM + space.s });
  } finally {
    const left = currentSnack(); // so no other test's sheet shows it
    if (left) await act(async () => dismissSnack(left.id));
  }
});

test('the keyboard height resets when the sheet closes and opens again', async () => {
  onAndroid();
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
  const ui = (visible: boolean) => <Sheet visible={visible} title="Date" onClose={noop} actions={cancelAndSave()} />;
  await show(ui(true));
  await end();
  await sheetKeyboard(300);
  expect(actionsPadding()).toBe(space.m + BOTTOM + 300);

  // Closed with the keyboard up (Close, pressed while typing): the panel slides down whole, keyboard and all.
  await screen.rerender(ui(false));
  expect(actionsPadding()).toBe(space.m + BOTTOM + 300);
  await end(); // gone: the Modal's window, and the IME view in it
  expect(screen.queryByTestId('sheet-ime', { includeHiddenElements: true })).toBeNull();

  // Opened again: a new window, with no keyboard in it until its own view says so.
  await screen.rerender(ui(true));
  await end();
  expect(actionsPadding()).toBe(space.m + BOTTOM);
  await sheetKeyboard(280);
  expect(actionsPadding()).toBe(space.m + BOTTOM + 280);
});

test('on iOS a sheet keeps useKeyboardHeight', async () => {
  // Milestone 9: iOS's keyboard events aren't a window's, so a sheet hears them, and it has no IME view.
  jest.replaceProperty(Platform, 'OS', 'ios');
  await show(<Sheet visible title="Date" onClose={noop} actions={cancelAndSave()} />);
  expect(screen.queryByTestId('sheet-ime', { includeHiddenElements: true })).toBeNull();
  await keyboard(300);
  expect(actionsPadding()).toBe(space.m + BOTTOM + 300);
  await keyboard(0);
  expect(actionsPadding()).toBe(space.m + BOTTOM);
});

test("a field focused in the sheet scrolls into view again as the sheet's keyboard grows", async () => {
  onAndroid();
  const input = createRef<TextInputInstance>();
  await show(
    <Sheet visible title="Supplier" onClose={noop} actions={cancelAndSave()}>
      <TextField label="Supplier's name" value="" onChangeText={noop} inputRef={input} />
    </Sheet>,
  );
  // No ref reaches the sheet's own ScrollView, but jest's ScrollViews take their methods from the prototype.
  const scrollViews = (ScrollView as unknown as { prototype: ScrollViewInstance }).prototype;
  const own = { getInnerViewRef: scrollViews.getInnerViewRef, scrollTo: scrollViews.scrollTo };
  const sheet = standIn(scrollViews);
  try {
    const measureLayout = jest.fn((_relativeTo: unknown, onSuccess: (x: number, y: number) => void) => onSuccess(0, 140));
    Object.assign(input.current!, { measureLayout });
    await fireEvent(screen.getByLabelText("Supplier's name"), 'focus');
    expect(sheet.scrollTo).toHaveBeenCalledTimes(1);

    // The keyboard opens after the focus, in the sheet's window, and the action row rises over the end of the scroll:
    // the field asks the sheet's scroll again (ruling T5-2), so it isn't left under the row.
    await sheetKeyboard(300);
    expect(sheet.scrollTo).toHaveBeenCalledTimes(2);
    expect(measureLayout.mock.calls[1][0]).toBe(sheet.content);
    expect(sheet.scrollTo).toHaveBeenLastCalledWith({ y: 140 - space.xl, animated: true });
    await sheetKeyboard(320); // taller
    expect(sheet.scrollTo).toHaveBeenCalledTimes(3);
    await sheetKeyboard(300); // shorter: the field is still in view
    expect(sheet.scrollTo).toHaveBeenCalledTimes(3);
    // The app window's keyboard events aren't the sheet's: they scroll nothing here.
    await keyboard(400);
    expect(sheet.scrollTo).toHaveBeenCalledTimes(3);
    await keyboard(0);
  } finally {
    Object.assign(scrollViews, own);
  }
});

test("the body's sides: the 16 dp gutter, or none for full-bleed rows (ruling T13-1)", async () => {
  const sides = () => StyleSheet.flatten(screen.getByTestId('sheet-scroll').props.contentContainerStyle);
  await show(
    <Sheet visible title="Total due" onClose={noop} actions={cancelAndSave()}>
      <Text>Total due</Text>
    </Sheet>,
  );
  expect(sides()).toMatchObject({ paddingHorizontal: space.l });
  // A list of full-bleed rows pads its own rows, so a row's ripple spans the sheet.
  await screen.rerender(
    <Sheet visible gutter={false} title="Total due" onClose={noop} actions={cancelAndSave()}>
      <Text>Total due</Text>
    </Sheet>,
  );
  expect(sides()?.paddingHorizontal).toBeUndefined();
  // The end of a scroll with no action row still clears the inset.
  await screen.rerender(
    <Sheet visible gutter={false} title="Total due" onClose={noop}>
      <Text>Total due</Text>
    </Sheet>,
  );
  expect(sides()).toEqual({ paddingBottom: space.xl + BOTTOM });
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

test('a new step (focusKey) moves TalkBack focus to the title again; back to no step, the caller places it', async () => {
  // Ruling T13-2: a box sheet's list opens a box's editor in the same sheet, with the box's label as the title.
  const focus = jest.mocked(AccessibilityInfo.sendAccessibilityEvent);
  const ui = (title: string, focusKey?: string, visible = true) => (
    <Sheet visible={visible} title={title} focusKey={focusKey} onClose={noop} />
  );
  /** The titles TalkBack focus was sent to since the last clear (each read before the title changes again). */
  const titles = () =>
    focus.mock.calls.map(([view, event]) => [(view as unknown as { props: { children: string } }).props.children, event]);
  await show(ui('Plywood 1/4'));
  expect(titles()).toEqual([['Plywood 1/4', 'focus']]); // once it has opened, as before
  focus.mockClear();
  await screen.rerender(ui('Row 1 · Unit', 'item1_unit'));
  expect(titles()).toEqual([['Row 1 · Unit', 'focus']]);
  focus.mockClear();
  await screen.rerender(ui('Row 1 · Unit', 'item1_unit')); // the same step: nothing more
  expect(focus).not.toHaveBeenCalled();
  await screen.rerender(ui('Row 1 · Qty', 'item1_qty')); // another step
  expect(titles()).toEqual([['Row 1 · Qty', 'focus']]);
  focus.mockClear();
  // Back to no step: the caller gives focus to what opened the step (a list's row); the sheet sends none.
  await screen.rerender(ui('Plywood 1/4'));
  expect(focus).not.toHaveBeenCalled();
  // With no focusKey, a new title alone moves nothing, as before.
  await screen.rerender(ui('Customer'));
  expect(focus).not.toHaveBeenCalled();
  // A closing sheet takes no focus, whatever its step.
  await screen.rerender(ui('Row 1 · Amount', 'item1_amount', false));
  expect(focus).not.toHaveBeenCalled();
});

/** The opener, and a sheet that's up, closed, or gone (its caller rendered it only while it was open). */
function openerAndSheet() {
  const opener = createRef<ViewInstance>();
  const ui = (sheet: 'up' | 'closed' | 'gone') => (
    <>
      <View ref={opener} />
      {sheet !== 'gone' && <Sheet visible={sheet === 'up'} title="Customer" onClose={noop} returnFocus={opener} />}
    </>
  );
  return { opener, ui };
}

test('a sheet unmounted while it is up, or while it closes, still gives TalkBack focus back, once', async () => {
  const focus = jest.mocked(AccessibilityInfo.sendAccessibilityEvent);
  const { opener, ui } = openerAndSheet();
  await show(ui('closed'));
  await screen.rerender(ui('gone'));
  expect(focus).not.toHaveBeenCalled(); // never up: nothing to give back

  await screen.rerender(ui('up'));
  expect(focus).toHaveBeenCalledTimes(1); // the title (the test setup ends the open animation at once)
  await screen.rerender(ui('gone')); // closed by unmounting it: no exit motion, but focus goes back
  expect(screen.queryByTestId('sheet', { includeHiddenElements: true })).toBeNull();
  expect(focus).toHaveBeenCalledTimes(2);
  expect(focus).toHaveBeenLastCalledWith(opener.current, 'focus');

  // Unmounted halfway through its closing animation: focus goes back once, and the stopped animation adds none.
  let finish: EndCallback = noop;
  jest.spyOn(Animated, 'parallel').mockImplementation(() => ({
    start: (callback?: EndCallback) => {
      finish = callback ?? noop;
    },
    stop: noop,
    reset: noop,
  }));
  await screen.rerender(ui('up'));
  await act(async () => finish({ finished: true }));
  focus.mockClear();
  await screen.rerender(ui('closed'));
  await screen.rerender(ui('gone'));
  expect(focus).toHaveBeenCalledTimes(1);
  expect(focus).toHaveBeenLastCalledWith(opener.current, 'focus');
  await act(async () => finish({ finished: true }));
  expect(focus).toHaveBeenCalledTimes(1);
});

test('once a sheet has closed and given focus back, unmounting it sends nothing more', async () => {
  const focus = jest.mocked(AccessibilityInfo.sendAccessibilityEvent);
  const { opener, ui } = openerAndSheet();
  await show(ui('up'));
  await screen.rerender(ui('closed')); // the exit motion, kept mounted (the test setup ends it at once)
  expect(focus).toHaveBeenCalledTimes(2); // the title, then the opener
  expect(focus).toHaveBeenLastCalledWith(opener.current, 'focus');
  await screen.rerender(ui('gone'));
  expect(focus).toHaveBeenCalledTimes(2);
});

test('useLingering keeps the last value it was given, follows a new one, and holds it through a null', async () => {
  type Open = { kind: 'boxes'; boxes: string[] } | { kind: 'terms' };
  const { result, rerender } = await renderHook(({ value }: { value: Open | null }) => useLingering(value), {
    initialProps: { value: null as Open | null },
  });
  expect(result.current).toBeNull();

  const boxes: Open = { kind: 'boxes', boxes: ['date'] };
  await rerender({ value: boxes });
  expect(result.current).toBe(boxes);
  await rerender({ value: null }); // the sheet closes: its content stays as it was
  expect(result.current).toBe(boxes);

  const terms: Open = { kind: 'terms' };
  await rerender({ value: terms });
  expect(result.current).toBe(terms);
  await rerender({ value: null });
  expect(result.current).toBe(terms);
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
