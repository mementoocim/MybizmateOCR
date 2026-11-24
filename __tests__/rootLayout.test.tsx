import { router } from 'expo-router';
import { act, renderRouter, screen } from 'expo-router/testing-library';
import { useEffect } from 'react';
import { type StyleProp, StyleSheet, Text, type ViewStyle } from 'react-native';

import { setStarted, useStarted } from '../lib/startup';
import { colors } from '../lib/theme';
import { appRoutes, standIn } from '../test-utils/routes';

// The root layout (app/_layout): one native Stack, anchored on the tabs (ruling T24-1's anchor, moved by camera first),
// which are anchored on the camera. A link opened cold to a screen above the tabs (mybizmatescan://speed, or any other
// route) has the tabs under it, on the camera, so the screen's Back has somewhere to go. No screen shows the Stack's
// own header, since each draws its Header, and each sits on paper; the camera's tab scene is black. The app's routes
// stand in (test-utils/routes): their own tests cover them. Once its splash has gone, the app is started (the camera
// may start) and the queue reads what a closed app left.

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

const ROUTES = {
  ...appRoutes(),
  later: standIn('A screen added later'), // one the layout doesn't name
};

type Host = { type: string; props: Record<string, unknown>; children: (Host | string)[] | null };
const hostKids = (node: Host) => (node.children ?? []).filter((kid): kid is Host => typeof kid !== 'string');
const holds = (node: Host, text: string): boolean =>
  (node.children ?? []).some((kid) => kid === text || (typeof kid !== 'string' && holds(kid, text)));

/** The native stack's screen (react-native-screens' host views) showing that line: its header and content. */
function stackScreen(name: string) {
  const screens: Host[] = [];
  const walk = (node: Host) => {
    // a stack's screen has its header's config; a tab's scene, a screen too, has none
    if (node.type === 'RNSScreen' && hostKids(node).some((kid) => kid.type === 'RNSScreenStackHeaderConfig')) {
      screens.push(node);
    }
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

/** A tab's scene background: the nearest view around that line with a background of its own. */
function sceneBackground(line: string): unknown {
  for (let node = screen.getByText(line, { includeHiddenElements: true }).parent; node; node = node.parent) {
    const background = StyleSheet.flatten(node.props.style as StyleProp<ViewStyle>)?.backgroundColor;
    if (background !== undefined) return background;
  }
  return undefined;
}

test.each(['/speed', '/lists', '/result'])(
  'a link opened cold, %s, has the tabs under it, on the camera',
  async (url) => {
    await renderRouter(ROUTES, { initialUrl: url });
    expect(screen).toHavePathname(url);
    expect(router.canGoBack()).toBe(true);

    await act(() => router.back());
    expect(screen).toHavePathname('/camera');
    expect(screen.getByText('Camera: on top')).toBeOnTheScreen();
    expect(router.canGoBack()).toBe(false); // the tabs are the bottom of the Stack, and the camera the tabs' anchor
  },
);

test('the app opens at the camera, with nothing under it, and a push from a tab adds no second tabs', async () => {
  for (const url of ['/', '/camera']) {
    await renderRouter(ROUTES, { initialUrl: url }); // '/': a launch with no route (app/+native-intent)
    expect(screen).toHavePathname('/camera');
    expect(screen.getByText('Camera: on top')).toBeOnTheScreen();
    expect(router.canGoBack()).toBe(false);

    // the anchor puts the tabs under a cold link only: a screen pushed from a tab goes back to those tabs
    await act(() => router.push('/lists'));
    expect(screen).toHavePathname('/lists');
    await act(() => router.back());
    expect(screen).toHavePathname('/camera');
    expect(router.canGoBack()).toBe(false);
    await screen.unmount();
  }
});

test("no screen shows the Stack's own header; each sits on paper, the camera's tab on black", async () => {
  await renderRouter(ROUTES, { initialUrl: '/camera' });
  expect(stackScreen('Camera: on top')).toMatchObject({ header: { hidden: true }, background: colors.paper });
  expect(sceneBackground('Camera: on top')).toBe(colors.camera);
  // the other tabs' scenes, on paper
  for (const [path, line] of [
    ['/', 'Home: on top'],
    ['/sessions', 'Sessions: on top'],
    ['/export', 'Export: on top'],
    ['/profile', 'Profile: on top'],
  ]) {
    await act(() => router.navigate(path));
    expect(sceneBackground(line)).toBe(colors.paper);
  }
  for (const [path, name] of [
    ['/result', 'Scan: on top'],
    ['/lists', 'Your lists: on top'],
    ['/license', 'License: on top'],
  ]) {
    await act(() => router.push(path));
    expect(stackScreen(name)).toMatchObject({ header: { hidden: true }, background: colors.paper });
  }
  // the Stack's options hold for every route, so a screen added later needs no line in the layout
  await act(() => router.push('/later'));
  expect(stackScreen('A screen added later: on top')).toMatchObject({
    header: { hidden: true },
    background: colors.paper,
  });
});

test('once the splash has gone, the app is started and the queue resumes', async () => {
  function Started() {
    return <Text>{useStarted() ? 'Started' : 'Not started'}</Text>;
  }
  // as the root before this one left it: a new font size or display size mounts the root anew in the same JS context
  setStarted(true);
  mockResume.mockClear();
  await renderRouter({ ...ROUTES, '(tabs)/camera': Started }, { initialUrl: '/camera' });
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
  await renderRouter({ ...ROUTES, '(tabs)/camera': Camera }, { initialUrl: '/camera' });
  expect(seen).toEqual([false]);
  await act(async () => mockEndSplash());
  expect(seen).toEqual([false, true]);
});
