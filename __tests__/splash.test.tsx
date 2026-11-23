import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { Animated, StyleSheet } from 'react-native';

import { BrandSplash } from '../components/BrandSplash';
import { colors, type } from '../lib/theme';
import { typeStylesOf } from '../test-utils/typeStyles';

// Design B §9.1 and §12 A11: the brand while the scanner gets ready (the model, what the phone keeps, a warm-up read),
// for at least half a second so it doesn't flash, then a 300 ms fade; nothing else moves (§5.5). The logo sits where
// the phone's own splash drew it. A start that fails says so in plain words, each a polite live region, with Try again
// outside them: it runs the start again, once per tap (Review Focus 3). The raw message shows in team builds only.
// Animations in jest end at once (test-utils/jestSetup.ts), so fake timers carry the floor and the fade.

const mockPreload = jest.fn();
const mockScan = jest.fn();
const mockLoadAppData = jest.fn(async () => {});
let mockTeam = false;

jest.mock('../modules/scanner', () => ({
  preload: () => mockPreload(),
  scanPhoto: (uri: string, options: object) => mockScan(uri, options),
}));
jest.mock('../lib/startup', () => ({ loadAppData: () => mockLoadAppData() }));
jest.mock('../lib/samples', () => ({ sampleUri: async (id: string) => `file:///s/${id}.jpg` }));
jest.mock('../lib/build', () => ({
  get TEAM_BUILD() {
    return mockTeam;
  },
}));
jest.mock('expo-splash-screen', () => ({ hideAsync: jest.fn(async () => {}) }));

const TAGLINE = 'Scan invoices. Even offline.';
const READY = 'Getting the scanner ready…';
const HEADLINE = "The scanner couldn't start";
const AGAIN = 'Try again. If it keeps happening, close the app and open it again.';
const noop = () => {};
/** Every animation holds its first frame. */
const still: Animated.CompositeAnimation = { start: noop, stop: noop, reset: noop };

type Instance = ReturnType<typeof screen.getByRole>;
const kids = (el: Instance) => el.children.filter((child): child is Instance => typeof child !== 'string');
const press = (el: Instance) => act(async () => fireEvent.press(el));
const button = (name: string) => screen.getByRole('button', { name });
const splash = () => screen.getByTestId('splash');
/** The live region a node is in: itself or the nearest view above it that is one; null when it's in none. */
const liveRegionOf = (node: Instance | null): Instance | null =>
  node === null || (node.props.accessibilityLiveRegion ?? 'none') !== 'none' ? node : liveRegionOf(node.parent);

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockTeam = false;
  // each test starts from a start that works; it changes what it needs
  mockPreload.mockReset().mockResolvedValue(undefined);
  mockLoadAppData.mockReset().mockResolvedValue(undefined);
  mockScan.mockReset().mockResolvedValue({});
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

async function settle() {
  for (let i = 0; i < 10; i++) await act(async () => {});
}

/** The clock moves on by ms, and what that lets go runs. */
async function after(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
  await settle();
}

test('ready after at least half a second, then the fade', async () => {
  const timing = jest.spyOn(Animated, 'timing'); // a spy only: jest's animation, which ends at once
  const onReady = jest.fn();
  await render(<BrandSplash onReady={onReady} />);
  // the brand: the wordmark with ".io" in brandText, today's tagline; under them the loading bar and its line
  const wordmark = screen.getByText('mybizmate.io');
  expect(wordmark).toHaveStyle({ ...type.title, color: colors.ink });
  expect(within(wordmark).getByText('.io')).toHaveStyle({ color: colors.brandText });
  expect(screen.getByText(TAGLINE)).toHaveStyle({ ...type.body, color: colors.mute });
  expect(screen.getByTestId('loading-track')).toHaveStyle({ backgroundColor: colors.sand }); // Task 16's LoadingBar
  expect(screen.getByText(READY)).toHaveStyle({ ...type.label, color: colors.mute });

  // the scanner, what the phone keeps, then a warm-up read of a sample that keeps no files
  await settle();
  expect(mockPreload).toHaveBeenCalledTimes(1);
  expect(mockLoadAppData).toHaveBeenCalledTimes(1);
  expect(mockScan).toHaveBeenCalledWith('file:///s/inv_0001.jpg', { keepFiles: false });

  // all ready at once, and still not before half a second
  await after(499);
  expect(splash()).toHaveStyle({ opacity: 1 });
  expect(onReady).not.toHaveBeenCalled();
  await after(1); // half a second: the fade, on the native driver
  expect(timing).toHaveBeenCalledWith(expect.anything(), { toValue: 0, duration: 300, useNativeDriver: true });
  expect(splash()).toHaveStyle({ opacity: 0 });
  expect(onReady).not.toHaveBeenCalled();
  await after(299);
  expect(onReady).not.toHaveBeenCalled();
  await after(1); // the fade's 300 ms
  expect(onReady).toHaveBeenCalledTimes(1);
});

test('a slow start adds nothing: the fade follows at once', async () => {
  mockPreload.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 800)));
  const onReady = jest.fn();
  await render(<BrandSplash onReady={onReady} />);
  await after(800); // the scanner took longer than the floor
  expect(splash()).toHaveStyle({ opacity: 0 }); // no fixed minimum on top (§12 A11)
  await after(300);
  expect(onReady).toHaveBeenCalledTimes(1);
});

test('a warm-up read that fails still opens the app (it only makes the first scan quicker)', async () => {
  mockScan.mockRejectedValue(new Error('unreadable'));
  const onReady = jest.fn();
  await render(<BrandSplash onReady={onReady} />);
  await settle();
  await after(500); // the splash's shortest time
  await after(300); // the fade
  expect(onReady).toHaveBeenCalledTimes(1);
  expect(screen.queryByText(HEADLINE)).toBeNull();
  expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
});

test("the logo starts where the phone's splash drew it: 104 dp, centred on the screen", async () => {
  mockPreload.mockReturnValue(new Promise(() => {}));
  await render(<BrandSplash onReady={jest.fn()} />);
  expect(StyleSheet.flatten(screen.getByTestId('splash-logo').props.style)).toMatchObject({ width: 104, height: 104 });
  expect(StyleSheet.flatten(screen.getByTestId('splash-brand').props.style)).toMatchObject({ top: '50%', marginTop: -52 });
});

test('a failed start: the words and Try again; the raw message only in team builds', async () => {
  mockPreload.mockRejectedValue(new Error('boom'));
  const onReady = jest.fn();
  await render(<BrandSplash onReady={onReady} />);
  await settle();
  expect(screen.getByRole('header', { name: HEADLINE })).toHaveStyle({ ...type.headline, color: colors.ink });
  expect(screen.getByText(AGAIN)).toHaveStyle({ ...type.body, color: colors.mute });
  expect(button('Try again')).toHaveStyle({ backgroundColor: colors.brand }); // the primary button
  expect(button('Try again')).toBeEnabled();
  expect(screen.queryByText(/boom/)).toBeNull(); // a client never sees the raw message
  expect(screen.getByText(TAGLINE)).toBeOnTheScreen(); // the brand stays above it
  expect(screen.queryByText(READY)).toBeNull();
  expect(screen.queryByTestId('loading-track')).toBeNull();

  // and it goes no further
  await after(5000);
  expect(mockLoadAppData).not.toHaveBeenCalled();
  expect(mockScan).not.toHaveBeenCalled();
  expect(onReady).not.toHaveBeenCalled();
  expect(splash()).toHaveStyle({ opacity: 1 });
  await screen.unmount();

  // a team build shows the raw message under Try again, in the figures' mono
  mockTeam = true;
  await render(<BrandSplash onReady={onReady} />);
  await settle();
  const raw = screen.getByText('boom');
  expect(raw).toHaveStyle({ ...type.figureSmall, color: colors.mute });
  expect(typeStylesOf(raw)).toEqual(['figureSmall']); // jest runs as iOS, where label's size flattens alike
  expect(kids(screen.getByTestId('splash-failure')).at(-1)).toBe(raw);
  expect(screen.getByRole('header', { name: HEADLINE })).toBeOnTheScreen();
});

test('Try again starts again, once per tap', async () => {
  // Review Focus 3: the second tap comes while the start it began is still running
  mockPreload.mockRejectedValueOnce(new Error('boom')); // then it works
  const onReady = jest.fn();
  await render(<BrandSplash onReady={onReady} />);
  await settle();
  expect(mockPreload).toHaveBeenCalledTimes(1);

  // A fast double tap: inside one act() scope, nothing re-renders between the two taps.
  await act(async () => {
    await fireEvent.press(button('Try again'));
    await fireEvent.press(button('Try again'));
  });
  expect(mockPreload).toHaveBeenCalledTimes(2); // one start more, not two
  // it loads while the start runs, and a tap then does nothing either
  expect(button('Try again')).toBeBusy();
  await press(button('Try again'));
  await settle();
  expect(mockPreload).toHaveBeenCalledTimes(2);
  expect(mockLoadAppData).toHaveBeenCalledTimes(1);
  expect(mockScan).toHaveBeenCalledTimes(1);

  // then the floor and the fade, and the app
  await after(500);
  expect(onReady).not.toHaveBeenCalled();
  await after(300);
  expect(onReady).toHaveBeenCalledTimes(1);
  expect(mockPreload).toHaveBeenCalledTimes(2);
});

test('a Try again that fails too says so, and Try again is ready for the next tap', async () => {
  mockTeam = true;
  mockPreload.mockRejectedValueOnce(new Error('boom')).mockRejectedValueOnce(new Error('still boom'));
  mockLoadAppData.mockRejectedValueOnce(new Error('No space left on the phone'));
  const onReady = jest.fn();
  await render(<BrandSplash onReady={onReady} />);
  await settle();
  await press(button('Try again'));
  await settle();
  expect(screen.getByText('still boom')).toBeOnTheScreen(); // this start's own reason
  expect(screen.queryByText('boom')).toBeNull();
  expect(button('Try again')).toBeEnabled();

  // what the phone keeps couldn't be read: the same words, the same way back
  await press(button('Try again'));
  await settle();
  expect(screen.getByRole('header', { name: HEADLINE })).toBeOnTheScreen();
  expect(screen.getByText('No space left on the phone')).toBeOnTheScreen();
  expect(button('Try again')).toBeEnabled();
  expect(mockScan).not.toHaveBeenCalled();

  await press(button('Try again'));
  await after(500);
  await after(300);
  expect(onReady).toHaveBeenCalledTimes(1);
  expect(mockPreload).toHaveBeenCalledTimes(4);
});

test('the failure is announced', async () => {
  mockTeam = true;
  mockPreload.mockRejectedValue(new Error('boom'));
  await render(<BrandSplash onReady={jest.fn()} />);
  await settle();
  // Its words are polite live regions, so TalkBack reads them out as they show (whether it does for one that mounts
  // already holding its words is Task 26's device check: ruling T8-2).
  for (const words of [screen.getByRole('header', { name: HEADLINE }), screen.getByText(AGAIN), screen.getByText('boom')]) {
    expect(liveRegionOf(words)).toHaveProp('accessibilityLiveRegion', 'polite');
  }
});

test("Try again isn't in the live region, so its spinner doesn't read the failure out again", async () => {
  mockPreload.mockRejectedValueOnce(new Error('boom')).mockReturnValue(new Promise(() => {})); // the retry runs on
  await render(<BrandSplash onReady={jest.fn()} />);
  await settle();
  expect(liveRegionOf(button('Try again'))).toBeNull();
  await press(button('Try again'));
  expect(button('Try again')).toBeBusy(); // its spinner shows
  expect(liveRegionOf(button('Try again'))).toBeNull();
  expect(liveRegionOf(screen.getByRole('header', { name: HEADLINE }))).toHaveProp('accessibilityLiveRegion', 'polite');
});

test('the words under the logo show at once: nothing moves in (design §5.5)', async () => {
  jest.spyOn(Animated, 'timing').mockReturnValue(still); // every animation holds its first frame
  mockPreload.mockReturnValue(new Promise(() => {}));
  await render(<BrandSplash onReady={jest.fn()} />);
  await settle();
  expect(screen.getByText('mybizmate.io')).toBeVisible();
  expect(screen.getByText(TAGLINE)).toBeVisible();
});

