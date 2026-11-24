import { router } from 'expo-router';
import { act, renderRouter, screen } from 'expo-router/testing-library';
import { useEffect } from 'react';
import { type StyleProp, StyleSheet, Text, type ViewStyle } from 'react-native';

import { setStarted, useStarted } from '../lib/startup';
import { colors } from '../lib/theme';

// The root layout (app/_layout): one native Stack, anchored on Home (ruling T24-1). A link opened cold
// (mybizmatescan://camera?test=…, mybizmatescan://speed, or any other route) has Home under it, so the screen's Back,
// or the camera's Close, has somewhere to go. No screen shows the Stack's own header, since each draws its Header, and
// each sits on paper, the camera on black. The app's routes stand in as their names: their own tests cover them. Once
// its splash has gone, the app is started (the camera may start) and the queue reads what a closed app left.

const mockResume = jest.fn(async () => {});
let mockEndSplash: () => void = () => {};

jest.mock('expo-splash-screen', () => ({ preventAutoHideAsync: jest.fn(async () => {}) }));
// the scanner's start (splash.test): it ends when a test says so, calling onReady as the real one does once it's ready
jest.mock('../components/BrandSplash', () => ({
  BrandSplash: ({ onReady }: { onReady: () => void }) => {
    mockEndSplash = onReady;
    return null;
  },
}));
jest.mock('../lib/captureQueue', () => ({ resumeQueue: () => mockResume() })); // its reads (captureQueue.test)

const named = (name: string) =>
  function Route() {
    return <Text>{name}</Text>;
  };
const ROUTES = {
  _layout: require('../app/_layout'),
  index: named('Home'),
  camera: named('Camera'),
  result: named('Scan'),
  saved: named('Saved'),
  lists: named('Your lists'),
  settings: named('Settings'),
  licenses: named('Open-source licenses'),
  license: named('License'),
  speed: named('Speed test'),
  training: named('Training data'),
  later: named('A screen added later'), // one the layout doesn't name
};

type Host = { type: string; props: Record<string, unknown>; children: (Host | string)[] | null };
const hostKids = (node: Host) => (node.children ?? []).filter((kid): kid is Host => typeof kid !== 'string');
const holds = (node: Host, text: string): boolean =>
  (node.children ?? []).some((kid) => kid === text || (typeof kid !== 'string' && holds(kid, text)));

/** The native stack's screen (react-native-screens' host views) showing that route's name: its header and content. */
function stackScreen(name: string) {
  const screens: Host[] = [];
  const walk = (node: Host) => {
    if (node.type === 'RNSScreen') screens.push(node);
    hostKids(node).forEach(walk);
  };
  [screen.toJSON() as Host | Host[]].flat().forEach(walk);
  const shown = screens.filter((view) => holds(view, name));
  expect(shown).toHaveLength(1);
  const [header] = hostKids(shown[0]).filter((kid) => kid.type === 'RNSScreenStackHeaderConfig');
  const [content] = hostKids(shown[0]).filter((kid) => kid.type === 'RNSScreenContentWrapper');
  const style = StyleSheet.flatten(content.props.style as StyleProp<ViewStyle>);
  return { header: header.props, background: style?.backgroundColor };
}

test.each(['/camera', '/speed', '/saved'])('a link opened cold, %s, has Home under it', async (url) => {
  await renderRouter(ROUTES, { initialUrl: url });
  expect(screen).toHavePathname(url);
  expect(router.canGoBack()).toBe(true);

  await act(() => router.back());
  expect(screen).toHavePathname('/');
  expect(screen.getByText('Home')).toBeOnTheScreen();
  expect(router.canGoBack()).toBe(false); // Home is the bottom of the Stack
});

test('the app opens at Home, with nothing under it, and a push from Home adds no second Home', async () => {
  await renderRouter(ROUTES, { initialUrl: '/' });
  expect(screen).toHavePathname('/');
  expect(screen.getByText('Home')).toBeOnTheScreen();
  expect(router.canGoBack()).toBe(false);

  // the anchor puts Home under a cold link only: a screen pushed from Home goes back to that Home, the Stack's bottom
  await act(() => router.push('/settings'));
  expect(screen).toHavePathname('/settings');
  await act(() => router.back());
  expect(screen).toHavePathname('/');
  expect(router.canGoBack()).toBe(false);
});

test("no screen shows the Stack's own header; each sits on paper, the camera on black", async () => {
  await renderRouter(ROUTES, { initialUrl: '/camera' });
  expect(stackScreen('Home')).toMatchObject({ header: { hidden: true }, background: colors.paper });
  expect(stackScreen('Camera')).toMatchObject({ header: { hidden: true }, background: colors.camera });
  for (const [path, name] of [['/result', 'Scan'], ['/settings', 'Settings'], ['/license', 'License']]) {
    await act(() => router.push(path));
    expect(stackScreen(name)).toMatchObject({ header: { hidden: true }, background: colors.paper });
  }
  // the Stack's options hold for every route, so a screen added later needs no line in the layout
  await act(() => router.push('/later'));
  expect(stackScreen('A screen added later')).toMatchObject({ header: { hidden: true }, background: colors.paper });
});

test('once the splash has gone, the app is started and the queue resumes', async () => {
  function Started() {
    return <Text>{useStarted() ? 'Started' : 'Not started'}</Text>;
  }
  // as the root before this one left it: a new font size or display size mounts the root anew in the same JS context
  setStarted(true);
  mockResume.mockClear();
  await renderRouter({ ...ROUTES, index: Started }, { initialUrl: '/' });
  expect(screen.getByText('Not started')).toBeOnTheScreen(); // its splash is up: nothing starts behind it
  expect(mockResume).not.toHaveBeenCalled();

  await act(async () => mockEndSplash());
  expect(screen.getByText('Started')).toBeOnTheScreen();
  expect(mockResume).toHaveBeenCalledTimes(1);
});

test("a root mounted anew is not started for its screens' first effects, nor after (ruling T3-1)", async () => {
  // React runs a screen's effects before its root's: the camera under the splash must never see true, even once
  const seen: boolean[] = [];
  function Camera() {
    const started = useStarted();
    useEffect(() => {
      seen.push(started);
    }, [started]);
    return <Text>Camera</Text>;
  }
  setStarted(true); // as the root before this one left it
  await renderRouter({ ...ROUTES, index: Camera }, { initialUrl: '/' });
  expect(seen).toEqual([false]);
  await act(async () => mockEndSplash());
  expect(seen).toEqual([false, true]);
});
