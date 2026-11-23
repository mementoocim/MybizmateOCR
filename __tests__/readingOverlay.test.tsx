import { act, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Animated, StyleSheet } from 'react-native';

import { ReadingOverlay } from '../components/ReadingOverlay';
import { colors, durations, elevation, radius, space, type } from '../lib/theme';

// Design B §9.4 and §5.5: the reading card, over the screen the capture came from. A wash over the whole screen, which
// takes the touches; a card that fades in, with "Reading…", the loading bar (brand on sand) and a line for what it's
// reading; after 5 s, a second line says why it's slow. TalkBack hears "Reading". With reduced motion the bar stands
// still and the words carry the state. Animations in jest end at once (test-utils/jestSetup.ts).

const PHOTO = 'Straightening the photo and reading every box';
const PDF = 'Reading the PDF';
const SLOW = 'Still reading. Big or blurry photos take longer.';
const noop = () => {};
/** Every animation holds its first frame. */
const still: Animated.CompositeAnimation = { start: noop, stop: noop, reset: noop };

/** Reduced motion's change events, which every useReducedMotion hook listening hears. */
let motionListeners: ((enabled: boolean) => void)[] = [];
const reduceMotion = (enabled: boolean) => act(async () => motionListeners.forEach((l) => l(enabled)));

beforeEach(() => {
  motionListeners = [];
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation((event, listener) => {
    const heard = listener as (enabled: boolean) => void;
    if (event === 'reduceMotionChanged') motionListeners.push(heard);
    return { remove: () => (motionListeners = motionListeners.filter((l) => l !== heard)) };
  });
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const track = () => screen.getByTestId('loading-track');
const piece = () => screen.getByTestId('loading-piece');

test('Reading… for a photo, announced as Reading', async () => {
  await render(<ReadingOverlay visible what="photo" />);
  const card = screen.getByLabelText('Reading');
  expect(card.props.accessibilityLiveRegion).toBe('polite');
  expect(card).toHaveStyle({
    backgroundColor: colors.panel,
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: colors.line,
    elevation: elevation.overlay,
    padding: space.xl,
    gap: space.m,
  });
  expect(screen.getByText('Reading…')).toHaveStyle({ ...type.headline, color: colors.ink });
  expect(screen.getByText(PHOTO)).toHaveStyle({ ...type.label, color: colors.mute });
  expect(screen.queryByText(PDF)).toBeNull();
  expect(screen.queryByText(SLOW)).toBeNull();

  // the wash covers the whole screen, so nothing under it takes a touch; the card fades in to full
  expect(screen.getByTestId('reading')).toHaveStyle({
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.wash,
    opacity: 1,
  });
  // the loading bar: 4 dp, brand on sand
  expect(track()).toHaveStyle({ height: 4, backgroundColor: colors.sand, overflow: 'hidden' });
  expect(piece()).toHaveStyle({ height: 4, backgroundColor: colors.brand });

  // nothing being read: nothing shows
  await render(<ReadingOverlay visible={false} />);
  expect(screen.queryByText('Reading…')).toBeNull();
  expect(screen.queryByLabelText('Reading')).toBeNull();
});

test('a PDF says Reading the PDF', async () => {
  await render(<ReadingOverlay visible what="pdf" />);
  expect(screen.getByText('Reading…')).toBeOnTheScreen(); // the same title for every form (§9.4)
  expect(screen.getByText(PDF)).toHaveStyle({ ...type.label, color: colors.mute });
  expect(screen.queryByText(PHOTO)).toBeNull();
  expect(screen.getByLabelText('Reading')).toBeOnTheScreen();

  // with no source given, a photo's (a sample's too)
  await render(<ReadingOverlay visible />);
  expect(screen.getByText(PHOTO)).toBeOnTheScreen();
});

test('after 5 s it says why it is slow', async () => {
  jest.useFakeTimers();
  await render(<ReadingOverlay visible what="photo" />);
  await act(async () => {
    jest.advanceTimersByTime(4999);
  });
  expect(screen.queryByText(SLOW)).toBeNull();
  await act(async () => {
    jest.advanceTimersByTime(1);
  });
  expect(screen.getByText(SLOW)).toHaveStyle({ ...type.label, color: colors.mute });
  expect(screen.getByText(PHOTO)).toBeOnTheScreen(); // a second line: the first stays

  // the next read waits its own 5 s
  await act(async () => screen.rerender(<ReadingOverlay visible={false} />));
  await act(async () => screen.rerender(<ReadingOverlay visible what="pdf" />));
  expect(screen.queryByText(SLOW)).toBeNull();
  await act(async () => {
    jest.advanceTimersByTime(5000);
  });
  expect(screen.getByText(SLOW)).toBeOnTheScreen();
});

test('the card fades in over 150 ms, on the native driver', async () => {
  const timing = jest.spyOn(Animated, 'timing').mockReturnValue(still);
  await render(<ReadingOverlay visible />);
  expect(screen.getByTestId('reading')).toHaveStyle({ opacity: 0 }); // its first frame
  const configs = timing.mock.calls.map(([, config]) => config);
  expect(configs).toContainEqual({ toValue: 1, duration: durations.card, useNativeDriver: true });
  expect(configs.every((config) => config.useNativeDriver)).toBe(true); // the bar's loop too
});

test('reduced motion: the bar stands still', async () => {
  const stop = jest.fn();
  const loop = jest.spyOn(Animated, 'loop').mockReturnValue({ ...still, stop });
  await render(<ReadingOverlay visible />);
  expect(loop).toHaveBeenCalledTimes(1); // with motion, its piece moves across

  // The person turns reduced motion on while it reads: the bar stops, 35% of it filled from its start.
  await reduceMotion(true);
  expect(stop).toHaveBeenCalledTimes(1);
  const width = StyleSheet.flatten(track().props.style).width as number;
  expect(piece()).toHaveStyle({ width: width * 0.35, transform: [{ translateX: 0 }] });
  expect(screen.getByText('Reading…')).toBeOnTheScreen(); // the words carry the state
  await screen.unmount();

  // A card shown while it's on never starts the loop.
  jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValueOnce(true); // the phone's answer agrees
  loop.mockClear();
  await render(<ReadingOverlay visible />);
  expect(loop).not.toHaveBeenCalled();
  expect(piece()).toHaveStyle({ transform: [{ translateX: 0 }] });
  await reduceMotion(false); // as the other tests expect
});
