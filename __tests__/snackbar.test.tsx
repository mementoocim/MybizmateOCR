import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { BottomBar } from '../components/BottomBar';
import { Sheet } from '../components/Sheet';
import { SnackbarHost } from '../components/Snackbar';
import {
  bottomClearance,
  currentSnack,
  dismissSnack,
  pushHost,
  setBottomClearance,
  type SnackAction,
  topHost,
} from '../lib/snackbar';
import { colors, durations, elevation, radius, space, touch, type } from '../lib/theme';
import { toast } from '../lib/toast';
import { keyboard } from '../test-utils/keyboard';
import { typeStylesOf } from '../test-utils/typeStyles';

// Design B §5.5, §5.6 and §8, and the plan's call 4: the snackbar, in place of Android's toasts. Ink, with paper text
// and an optional action in brand; a polite live region; up for the time the phone recommends for 4 s, or for 8 s with
// an action; a new one replaces the old. It shows in the newest host (the root layout's, an open sheet's), so it's
// never dimmed behind a sheet, and it sits above the bottom bar of the screen on top, or the sheet's action row. Timers
// are jest's fake ones, and the phone recommends the very time it's asked about unless a test says otherwise. Insets
// are zero, or, where a test gives them, 34 dp at the bottom. The navigation paths are __tests__/snackbarClearance's.

const BOTTOM = 34;
const noop = () => {};

/** Whether the screen a bottom bar is on is the one on top (expo-router's useIsFocused). */
let mockFocused = true;
jest.mock('expo-router', () => ({ useIsFocused: () => mockFocused }));

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
const withInsets = (ui: ReactElement) => render(ui, { wrapper: Insets });

const raise = (message: string, action?: SnackAction) => act(async () => toast(message, action));
const wait = (ms: number) =>
  act(async () => {
    jest.advanceTimersByTime(ms);
  });
const snackbar = () => screen.getByTestId('snackbar');
const recommended = () => jest.mocked(AccessibilityInfo.getRecommendedTimeoutMillis);
/** Android reports a view's layout: its height, in dp. */
const layout = (testID: string, height: number) =>
  fireEvent(screen.getByTestId(testID), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 360, height } } });
/** Every animation holds its first frame. */
const still: Animated.CompositeAnimation = { start: noop, stop: noop, reset: noop };

/** Reduced motion's change events, which every useReducedMotion hook listening hears. */
let motionListeners: ((enabled: boolean) => void)[] = [];
const reduceMotion = (enabled: boolean) => act(async () => motionListeners.forEach((l) => l(enabled)));

beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(AccessibilityInfo, 'getRecommendedTimeoutMillis').mockImplementation(async (ms) => ms);
  motionListeners = [];
  mockFocused = true;
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation((event, listener) => {
    if (event === 'reduceMotionChanged') motionListeners.push(listener as (enabled: boolean) => void);
    return { remove: noop };
  });
  const left = currentSnack(); // one a test left up: no host is mounted now to show it
  if (left) dismissSnack(left.id);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test('toast shows its message in the host, ink with paper text, as a polite live region', async () => {
  await render(<SnackbarHost />);
  expect(screen.queryByTestId('snackbar', { includeHiddenElements: true })).toBeNull(); // nothing to say: nothing there

  await raise('Added to your items.');
  const message = screen.getByText('Added to your items.');
  expect(message).toHaveStyle({ ...type.body, color: colors.paper });
  expect(message.props.numberOfLines).toBeUndefined(); // a long message wraps
  expect(within(snackbar()).getByText('Added to your items.')).toBe(message);
  expect(snackbar()).toHaveStyle({
    position: 'absolute',
    left: space.l,
    right: space.l,
    backgroundColor: colors.ink,
    borderRadius: radius.panel,
    elevation: elevation.overlay,
  });
  expect(snackbar().props.accessibilityLiveRegion).toBe('polite');
  expect(screen.queryByRole('button')).toBeNull(); // no action, no button
});

test('a new one replaces the old', async () => {
  await render(<SnackbarHost />);
  await raise('Saved to Pictures/MyBizMate Scan');
  await wait(3000);
  await raise("Couldn't save the scan.");
  expect(screen.queryByText('Saved to Pictures/MyBizMate Scan')).toBeNull();
  expect(screen.getAllByTestId('snackbar')).toHaveLength(1);
  expect(within(snackbar()).getByText("Couldn't save the scan.")).toBeOnTheScreen();

  // It has its own time: the old one's end doesn't take it down.
  await wait(3999);
  expect(screen.getByText("Couldn't save the scan.")).toBeOnTheScreen();
  await wait(1);
  expect(screen.queryByTestId('snackbar', { includeHiddenElements: true })).toBeNull();
});

test('it stays for the recommended time: 4 s, or 8 s with an action', async () => {
  await render(<SnackbarHost />);
  await raise('Marked 4 sales as exported.');
  expect(recommended()).toHaveBeenLastCalledWith(4000);
  await wait(3999);
  expect(screen.getByText('Marked 4 sales as exported.')).toBeOnTheScreen();
  await wait(1);
  expect(screen.queryByText('Marked 4 sales as exported.', { includeHiddenElements: true })).toBeNull();

  await raise('Saved as a sale', { label: 'View', onPress: noop });
  expect(recommended()).toHaveBeenLastCalledWith(8000);
  await wait(7999);
  expect(screen.getByText('Saved as a sale')).toBeOnTheScreen();
  await wait(1);
  expect(screen.queryByText('Saved as a sale', { includeHiddenElements: true })).toBeNull();

  // The phone's answer is what counts: someone who needs longer gets longer.
  recommended().mockImplementationOnce(async () => 20000);
  await raise('Imported 21 customers.');
  await wait(19999);
  expect(screen.getByText('Imported 21 customers.')).toBeOnTheScreen();
  await wait(1);
  expect(screen.queryByText('Imported 21 customers.', { includeHiddenElements: true })).toBeNull();
});

test('its action runs once and dismisses it', async () => {
  const onPress = jest.fn();
  await render(<SnackbarHost />);
  await raise('Saved as a sale', { label: 'View', onPress });
  const view = screen.getByRole('button', { name: 'View' });
  expect(within(snackbar()).getByText('View')).toHaveStyle({ ...type.button, color: colors.brand });
  expect(typeStylesOf(within(snackbar()).getByText('View'))).toEqual(['button']); // jest runs as iOS: value alike
  expect(view).toHaveStyle({ minHeight: touch.target });
  await fireEvent.press(view);
  expect(onPress).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('Saved as a sale', { includeHiddenElements: true })).toBeNull();
  expect(currentSnack()).toBeNull();

  // A second tap while it's on its way out does nothing: it takes no touches, and TalkBack leaves it.
  jest.spyOn(Animated, 'timing').mockReturnValue(still); // the way out never ends
  await raise('Saved as a sale', { label: 'View', onPress });
  await fireEvent.press(screen.getByRole('button', { name: 'View' }));
  expect(onPress).toHaveBeenCalledTimes(2);
  const leaving = screen.getByTestId('snackbar', { includeHiddenElements: true });
  expect(leaving.props.pointerEvents).toBe('none');
  expect(screen.queryByText('Saved as a sale')).toBeNull(); // hidden from TalkBack
  await fireEvent.press(screen.getByRole('button', { name: 'View', includeHiddenElements: true }));
  expect(onPress).toHaveBeenCalledTimes(2);
});

test('with a sheet open, it shows in the sheet, never behind it', async () => {
  const ui = (open: boolean) => (
    <>
      <SnackbarHost />
      <Sheet visible={open} title="Customer" onClose={noop}>
        <Text>Matched by its TIN and name.</Text>
      </Sheet>
    </>
  );
  await render(ui(true));
  await raise('Added to your customers.');
  // Once, inside the sheet's Modal: not in the root host, dimmed behind the scrim.
  expect(screen.getAllByText('Added to your customers.', { includeHiddenElements: true })).toHaveLength(1);
  expect(within(screen.getByTestId('sheet-panel')).getByText('Added to your customers.')).toBeOnTheScreen();

  // The sheet closes: the message stays up, in the root host now, and the next one shows there.
  await screen.rerender(ui(false));
  expect(screen.queryByTestId('sheet', { includeHiddenElements: true })).toBeNull();
  expect(screen.getAllByText('Added to your customers.', { includeHiddenElements: true })).toHaveLength(1);
  await raise('Saved as a sale');
  expect(screen.getAllByTestId('snackbar', { includeHiddenElements: true })).toHaveLength(1);
  expect(within(snackbar()).getByText('Saved as a sale')).toBeOnTheScreen();

  // A sheet that opens over a message brings it up above its scrim.
  await screen.rerender(ui(true));
  expect(screen.getAllByText('Saved as a sale', { includeHiddenElements: true })).toHaveLength(1);
  expect(within(screen.getByTestId('sheet-panel')).getByText('Saved as a sale')).toBeOnTheScreen();

  // It doesn't ride the panel down as the sheet closes: it goes back to the root host as soon as the sheet starts to.
  jest.spyOn(Animated, 'parallel').mockReturnValue(still); // the sheet's own motion holds its first frame
  await screen.rerender(ui(false));
  const panel = screen.getByTestId('sheet-panel', { includeHiddenElements: true }); // still up, on its way out
  expect(within(panel).queryByTestId('snackbar', { includeHiddenElements: true })).toBeNull();
  expect(screen.getAllByText('Saved as a sale', { includeHiddenElements: true })).toHaveLength(1);
  expect(screen.getByText('Saved as a sale')).toBeOnTheScreen();
});

test('it sits above the bottom bar', async () => {
  const ui = (bar: boolean) => (
    <>
      {bar && <BottomBar buttons={[{ label: 'Save sale', onPress: noop }]} />}
      <SnackbarHost />
    </>
  );
  await withInsets(ui(false));
  await raise('Saved. Send it from the Export tab.');
  expect(snackbar()).toHaveStyle({ bottom: BOTTOM + space.s }); // no bar: above the navigation bar

  await screen.rerender(ui(true));
  await layout('bottom-bar', 80); // its height takes in the inset it pads by
  expect(snackbar()).toHaveStyle({ bottom: 80 + space.s });

  await screen.rerender(ui(false)); // the bar goes, and its clearance with it
  expect(snackbar()).toHaveStyle({ bottom: BOTTOM + space.s });
});

test('a bar counts only while its screen is the one on top (ruling T19-5)', async () => {
  const ui = () => (
    <>
      <BottomBar buttons={[{ label: 'Export…', onPress: noop }]} />
      <SnackbarHost />
    </>
  );
  await withInsets(ui());
  await layout('bottom-bar', 120);
  await raise('Marked 1 sale as exported.');
  expect(snackbar()).toHaveStyle({ bottom: 120 + space.s });

  // another screen goes over it: its height goes with its focus
  mockFocused = false;
  await screen.rerender(ui());
  expect(snackbar()).toHaveStyle({ bottom: BOTTOM + space.s });
  await layout('bottom-bar', 136); // it lays out again under that screen: still nothing
  expect(snackbar()).toHaveStyle({ bottom: BOTTOM + space.s });

  // back on top: its height, as last laid out
  mockFocused = true;
  await screen.rerender(ui());
  expect(snackbar()).toHaveStyle({ bottom: 136 + space.s });

  // a bar that mounts under the screen on top waits for its own screen's focus
  await screen.unmount();
  mockFocused = false;
  await withInsets(ui());
  await layout('bottom-bar', 120);
  await raise('Added to your customers.');
  expect(snackbar()).toHaveStyle({ bottom: BOTTOM + space.s });
});

test('a bar that lays out again keeps its place in the order (ruling T25b-1)', async () => {
  // Two bars report at once (each screen focused here): the one that first reported later counts. A new height from
  // the other, as its line wraps, say, changes its height, not its place; it gives that up only when it goes.
  const ui = (scanBar: boolean) => (
    <>
      <BottomBar buttons={[{ label: 'Export…', onPress: noop }]} />
      {scanBar && <BottomBar buttons={[{ label: 'Save sale', onPress: noop }]} />}
      <SnackbarHost />
    </>
  );
  const relayout = (index: number, height: number) =>
    fireEvent(screen.getAllByTestId('bottom-bar')[index], 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 360, height } },
    });
  await withInsets(ui(true));
  await relayout(0, 120); // the first bar's, on a screen under the Scan screen
  await relayout(1, 80); // then the Scan screen's
  await raise('Saved as a sale');
  expect(snackbar()).toHaveStyle({ bottom: 80 + space.s });

  await relayout(0, 136); // the first bar lays out again: the Scan screen's bar still counts
  expect(snackbar()).toHaveStyle({ bottom: 80 + space.s });
  await relayout(1, 96); // and the Scan screen's own new height does
  expect(snackbar()).toHaveStyle({ bottom: 96 + space.s });

  await screen.rerender(ui(false)); // the Scan screen's bar goes: the first one, as last laid out
  expect(snackbar()).toHaveStyle({ bottom: 136 + space.s });
});

test('in a sheet, it sits above the action row, or above the inset and the keyboard', async () => {
  await withInsets(<Sheet visible title="Date" onClose={noop} actions={[{ label: 'Save', onPress: noop }]} />);
  await raise('Added to your items.');
  await layout('sheet-actions', 102);
  expect(within(screen.getByTestId('sheet-panel')).getByTestId('snackbar')).toHaveStyle({ bottom: 102 + space.s });

  await screen.rerender(<Sheet visible title="Date" onClose={noop} />);
  expect(snackbar()).toHaveStyle({ bottom: BOTTOM + space.s });
  await keyboard(300);
  expect(snackbar()).toHaveStyle({ bottom: BOTTOM + 300 + space.s });
  await keyboard(0);
});

test('on a screen, it sits above an open keyboard, which covers the bottom bar', async () => {
  const ui = (bar: boolean) => (
    <>
      {bar && <BottomBar buttons={[{ label: 'Import CSV', onPress: noop }]} />}
      <SnackbarHost />
    </>
  );
  await withInsets(ui(true));
  await layout('bottom-bar', 80);
  await raise('Imported 21 customers.');
  expect(snackbar()).toHaveStyle({ bottom: 80 + space.s });
  // A field has focus. Android doesn't resize the window, so the keyboard covers the bar: the message sits over it.
  await keyboard(300);
  expect(snackbar()).toHaveStyle({ bottom: BOTTOM + 300 + space.s });
  await keyboard(40); // one that stops below the bar's top leaves it above the bar
  expect(snackbar()).toHaveStyle({ bottom: 80 + space.s });
  await keyboard(0); // closed: back at the bar's clearance
  expect(snackbar()).toHaveStyle({ bottom: 80 + space.s });

  await screen.rerender(ui(false)); // with no bar, the same over the navigation bar
  await keyboard(300);
  expect(snackbar()).toHaveStyle({ bottom: BOTTOM + 300 + space.s });
  await keyboard(0);
  expect(snackbar()).toHaveStyle({ bottom: BOTTOM + space.s });
});

test('motion: it slides up 16 dp as it fades in, and back out, over 200 ms; with reduced motion it only fades', async () => {
  let timing = jest.spyOn(Animated, 'timing').mockReturnValue(still);
  const configs = () => timing.mock.calls.map(([, config]) => config);
  await render(<SnackbarHost />);
  await raise('Added to your items.');
  expect(snackbar()).toHaveStyle({ opacity: 0, transform: [{ translateY: 16 }] }); // its first frame
  expect(configs()).toEqual([{ toValue: 1, duration: durations.snackbar, useNativeDriver: true }]);

  timing.mockClear();
  await act(async () => dismissSnack(currentSnack()!.id));
  expect(configs()).toEqual([{ toValue: 0, duration: durations.snackbar, useNativeDriver: true }]);

  // A new one takes the place of one that's up: it doesn't fade or slide in again.
  timing.mockRestore(); // animations end at once again
  await raise('Saved to Pictures/MyBizMate Scan');
  expect(snackbar()).toHaveStyle({ opacity: 1, transform: [{ translateY: 0 }] });
  timing = jest.spyOn(Animated, 'timing').mockReturnValue(still);
  await raise("Couldn't save the scan.");
  expect(snackbar()).toHaveStyle({ opacity: 1, transform: [{ translateY: 0 }] });
  await act(async () => dismissSnack(currentSnack()!.id));
  await screen.unmount();

  // Reduced motion: it fades in where it is, with no slide.
  await render(<SnackbarHost />);
  await reduceMotion(true);
  timing.mockClear();
  await raise('Added to your items.');
  expect(snackbar()).toHaveStyle({ opacity: 0 });
  expect(StyleSheet.flatten(snackbar().props.style).transform).toBeUndefined();
  expect(configs()).toEqual([{ toValue: 1, duration: durations.snackbar, useNativeDriver: true }]);
  await reduceMotion(false); // as the other tests expect
});

test('the host stack: the newest host shows the message; the newest bar sets the clearance', () => {
  // Hosts in the order they mount: the root's, a sheet's, the photo viewer's. Each leaves when it unmounts.
  expect(topHost()).toBeNull();
  const root = pushHost();
  const sheet = pushHost();
  const viewer = pushHost();
  expect(topHost()).toBe(viewer.id);
  sheet.remove(); // one under the top goes: the top stays
  expect(topHost()).toBe(viewer.id);
  viewer.remove();
  expect(topHost()).toBe(root.id);
  root.remove();
  expect(topHost()).toBeNull();

  // Bars in the order they first report: a lower screen's (with a line over its buttons), then the Scan screen's over it.
  const saved = {};
  const scan = {};
  expect(bottomClearance()).toBe(0);
  setBottomClearance(saved, 120);
  setBottomClearance(scan, 80);
  expect(bottomClearance()).toBe(80); // the newest, not the tallest
  setBottomClearance(saved, 136); // the bar underneath lays out again: the newest still wins
  expect(bottomClearance()).toBe(80);
  setBottomClearance(scan, null); // the Scan screen goes back
  expect(bottomClearance()).toBe(136);
  setBottomClearance(saved, null);
  expect(bottomClearance()).toBe(0);
});
