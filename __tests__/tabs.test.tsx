import { router } from 'expo-router';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import { Button } from '../components/Buttons';
import { useNavigateOnce, useOpenOnce } from '../lib/navigation';
import { appRoutes, standIn } from '../test-utils/routes';

// Camera first (spec §6.1, calls 1 and 8): the app's routes. The tabs, Home, Sessions, the camera, Export and Profile,
// sit at the bottom of the root Stack, anchored on the camera; Back from any other tab goes to the camera, and from the
// camera, with nothing under it, out of the app. Sessions keeps its own screens inside its tab, under the bar. The Scan
// screen, Your lists, the licenses and the team screens open above the tabs, with no bar. A link opened cold keeps
// working, with the tabs under it. The app's own layouts and bar; the screens stand in, each saying whether it's on top,
// apart from the camera where its status bar is what's tested. The global router is the test's, never the app's.

jest.mock('expo-splash-screen', () => ({ preventAutoHideAsync: jest.fn(async () => {}) }));
// the scanner's start (splash.test): ready once the root has mounted, so the app has started and the camera may start
jest.mock('../components/BrandSplash', () => ({
  BrandSplash: ({ onReady }: { onReady: () => void }) => {
    // after the commit's effects, the root's own among them (renderRouter's timers are fake)
    require('react').useEffect(() => void Promise.resolve().then(onReady), [onReady]);
    return null;
  },
}));
// its reads (captureQueue.test): the camera's queue is the real one, with nothing left from a last run
jest.mock('../lib/captureQueue', () => ({ ...jest.requireActual('../lib/captureQueue'), resumeQueue: async () => {} }));
// expo-status-bar's StatusBar stands in as a plain view carrying its style, as in the camera's suite.
jest.mock('expo-status-bar', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    ...jest.requireActual('expo-status-bar'), // expo-router's own hooks
    StatusBar: ({ style }: { style: string }) =>
      React.createElement(View, { testID: 'status-bar', statusStyle: style }),
  };
});
// the camera, for its status bar: its native view and its permission (camera.test covers them)
jest.mock('../modules/scanner', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    scanPhoto: jest.fn(),
    readPdf: jest.fn(),
    ScannerCameraView: React.forwardRef(function MockCamera(props: object, ref: unknown) {
      React.useImperativeHandle(ref, () => ({ takePhoto: async () => {}, rearm: async () => {} }));
      return React.createElement(View, { testID: 'camera', ...props });
    }),
  };
});
jest.mock('expo-image-picker', () => {
  const granted = { granted: true, canAskAgain: true, status: 'granted' };
  return {
    getCameraPermissionsAsync: async () => granted,
    requestCameraPermissionsAsync: async () => granted,
    launchCameraAsync: jest.fn(),
    launchImageLibraryAsync: jest.fn(),
  };
});
jest.mock('expo-file-system', () => require('../test-utils/memoryFs').memoryFs.module);

type Instance = ReturnType<typeof screen.getByRole>;
const press = (el: Instance) => act(async () => fireEvent.press(el));
const tab = (name: string) => screen.getByRole('tab', { name });
/** The screen on top: the one stand-in that says so. */
const onTop = () => screen.getAllByText(/: on top$/).map((line) => line.props.children);
/** The bar, while the tabs are the screen on top; a covered screen's views are hidden. */
const bar = () => screen.queryByTestId('tab-bar');
type State = { routes: { name: string; state?: State }[] };
/** The root Stack's routes, by name: under expo-router's own __root. */
const rootStack = (view: { getRouterState(): unknown }) =>
  (view.getRouterState() as State).routes[0].state!.routes.map((route) => route.name);

test('the camera is the first tab: with nothing under it, Back leaves the app', async () => {
  await renderRouter(appRoutes(), { initialUrl: '/camera' });
  expect(screen).toHavePathname('/camera');
  expect(onTop()).toEqual(['Camera: on top']);
  expect(bar()).toBeOnTheScreen();
  expect(tab('Take photo')).toBeSelected(); // on the camera, the middle button is the shutter
  expect(router.canGoBack()).toBe(false); // Android's Back leaves the app
  await screen.unmount();

  // a launch with no route of its own, as from the launcher: the camera too (app/+native-intent)
  await renderRouter(appRoutes(), { initialUrl: '/' });
  expect(screen).toHavePathname('/camera');
  expect(onTop()).toEqual(['Camera: on top']);
  expect(router.canGoBack()).toBe(false);
});

test('Back from Home, Sessions, Export and Profile goes to the camera', async () => {
  await renderRouter(appRoutes(), { initialUrl: '/camera' });
  for (const [name, path] of [
    ['Home', '/'],
    ['Sessions', '/sessions'],
    ['Export', '/export'],
    ['Profile', '/profile'],
  ]) {
    await press(tab(name));
    expect(screen).toHavePathname(path);
    expect(onTop()).toEqual([`${name}: on top`]);
    expect(tab(name)).toBeSelected();
    expect(router.canGoBack()).toBe(true);
    await act(() => router.back());
    expect(screen).toHavePathname('/camera');
    expect(onTop()).toEqual(['Camera: on top']);
    expect(router.canGoBack()).toBe(false);
  }
  // from one side tab to another, Back still goes to the camera, not the tab before
  await press(tab('Home'));
  await press(tab('Profile'));
  await act(() => router.back());
  expect(screen).toHavePathname('/camera');
});

test('a screen inside Sessions keeps the bar; Back goes to Sessions, then the camera', async () => {
  await renderRouter(appRoutes(), { initialUrl: '/camera' });
  await press(tab('Sessions'));
  await act(() => router.push('/sessions/s1'));
  expect(screen).toHavePathname('/sessions/s1');
  expect(onTop()).toEqual(['Session: on top']);
  expect(bar()).toBeOnTheScreen();
  expect(tab('Sessions')).toBeSelected();
  await act(() => router.back());
  expect(screen).toHavePathname('/sessions');
  expect(onTop()).toEqual(['Sessions: on top']);
  await act(() => router.back());
  expect(screen).toHavePathname('/camera');
  expect(router.canGoBack()).toBe(false);
});

test('the Scan screen, Your lists, the licenses and the team screens sit above the tabs, with no bar', async () => {
  await renderRouter(appRoutes(), { initialUrl: '/camera' });
  for (const [path, name] of [
    ['/result', 'Scan'],
    ['/lists', 'Your lists'],
    ['/licenses', 'Open-source licenses'],
    ['/license', 'License'],
    ['/saved', 'Saved'],
    ['/speed', 'Speed test'],
    ['/training', 'Training data'],
  ]) {
    await act(() => router.push(path));
    expect(screen).toHavePathname(path);
    expect(onTop()).toEqual([`${name}: on top`]);
    expect(bar()).toBeNull(); // the tabs are under it
    expect(screen.getByTestId('tab-bar', { includeHiddenElements: true })).toBeTruthy();
    await act(() => router.back());
    expect(onTop()).toEqual(['Camera: on top']);
    expect(bar()).toBeOnTheScreen();
  }
});

test('a cold link keeps working, with the tabs under it: /camera?test=…, /speed and /training', async () => {
  await renderRouter(appRoutes(), { initialUrl: '/camera?test=inv_0051' });
  expect(screen).toHavePathname('/camera');
  expect(screen).toHaveSearchParams({ test: 'inv_0051' });
  expect(router.canGoBack()).toBe(false);
  await screen.unmount();

  for (const [path, name] of [
    ['/speed', 'Speed test'],
    ['/training', 'Training data'],
    ['/lists', 'Your lists'],
  ]) {
    await renderRouter(appRoutes(), { initialUrl: path });
    expect(screen).toHavePathname(path);
    expect(onTop()).toEqual([`${name}: on top`]);
    expect(router.canGoBack()).toBe(true); // the tabs, on the camera, are under it
    await act(() => router.back());
    expect(screen).toHavePathname('/camera');
    expect(onTop()).toEqual(['Camera: on top']);
    expect(router.canGoBack()).toBe(false);
    await screen.unmount();
  }
});

test('a press that opens a tab from a screen switches to it once, with one tabs navigator', async () => {
  function Scan() {
    const navigateOnce = useNavigateOnce();
    const Where = standIn('Scan');
    return (
      <>
        <Where />
        <Button label="To the camera" onPress={() => navigateOnce('/camera')} />
        <Button label="To Profile" onPress={() => navigateOnce('/profile')} />
      </>
    );
  }
  const view = await renderRouter(appRoutes({ result: Scan }), { initialUrl: '/camera' });
  for (const [label, path, name] of [
    ['To the camera', '/camera', 'Camera'],
    ['To Profile', '/profile', 'Profile'],
  ]) {
    await act(() => router.push('/result'));
    expect(onTop()).toEqual(['Scan: on top']);
    // a fast double tap: inside one act() scope, nothing re-renders between the two taps
    await act(async () => {
      await fireEvent.press(screen.getByRole('button', { name: label }));
      await fireEvent.press(screen.getByRole('button', { name: label }));
    });
    expect(screen).toHavePathname(path);
    expect(onTop()).toEqual([`${name}: on top`]);
    expect(bar()).toBeOnTheScreen();
    expect(rootStack(view)).toEqual(['(tabs)']); // the Scan screen went; no second tabs
  }
  // Back from Profile: the camera, then out
  await act(() => router.back());
  expect(screen).toHavePathname('/camera');
  expect(router.canGoBack()).toBe(false);
});

test("a screen's presses share one guard: a push and a tab in one act open one of them, with one tabs (ruling T6-1)", async () => {
  // Home's Your lists (a push over the tabs) then Take photo (the camera tab), before anything re-renders: with a guard
  // each, the tab's href resolved once Your lists was on top, and pushed a second tabs, a second camera in it
  function Home() {
    const open = useOpenOnce();
    const Where = standIn('Home');
    return (
      <>
        <Where />
        <Button label="Your lists" onPress={() => open.push('/lists')} />
        <Button label="Take photo" onPress={() => open.navigate('/camera')} />
      </>
    );
  }
  const both = (first: string, second: string) =>
    act(async () => {
      await fireEvent.press(screen.getByRole('button', { name: first }));
      await fireEvent.press(screen.getByRole('button', { name: second }));
    });

  const view = await renderRouter(appRoutes({ '(tabs)/index': Home }), { initialUrl: '/camera' });
  await press(tab('Home'));
  await both('Your lists', 'Take photo');
  expect(rootStack(view)).toEqual(['(tabs)', 'lists']); // the first press only
  expect(onTop()).toEqual(['Your lists: on top']);
  await act(() => router.back());
  expect(onTop()).toEqual(['Home: on top']);

  // the other way round: the camera tab, and no Your lists over it
  await both('Take photo', 'Your lists');
  expect(rootStack(view)).toEqual(['(tabs)']);
  expect(screen).toHavePathname('/camera');
  expect(onTop()).toEqual(['Camera: on top']);
});

test('a press that opens a tab from another tab switches to it, and Back goes to the camera', async () => {
  function Home() {
    const navigateOnce = useNavigateOnce();
    const Where = standIn('Home');
    return (
      <>
        <Where />
        <Button label="Settings" onPress={() => navigateOnce('/profile')} />
      </>
    );
  }
  const view = await renderRouter(appRoutes({ '(tabs)/index': Home }), { initialUrl: '/camera' });
  await press(tab('Home'));
  await act(async () => {
    await fireEvent.press(screen.getByRole('button', { name: 'Settings' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Settings' }));
  });
  expect(screen).toHavePathname('/profile');
  expect(tab('Profile')).toBeSelected();
  expect(rootStack(view)).toEqual(['(tabs)']);
  await act(() => router.back());
  expect(screen).toHavePathname('/camera');
  expect(router.canGoBack()).toBe(false);
  // on top again, Home opens it again
  await press(tab('Home'));
  await press(screen.getByRole('button', { name: 'Settings' }));
  expect(screen).toHavePathname('/profile');
});

test('a double press on a tab opens it once: one Back goes to the camera', async () => {
  await renderRouter(appRoutes(), { initialUrl: '/camera' });
  await act(async () => {
    await fireEvent.press(tab('Export'));
    await fireEvent.press(tab('Export'));
  });
  expect(screen).toHavePathname('/export');
  await act(() => router.back());
  expect(screen).toHavePathname('/camera');
  expect(router.canGoBack()).toBe(false);
});

test("the light status bar is the camera's only while it's on top", async () => {
  // The root's is dark, for the paper screens; the camera's light one is mounted only while it's on top, since a tab
  // left stays mounted under the others, and the last one mounted would win.
  const styles = () =>
    screen.queryAllByTestId('status-bar', { includeHiddenElements: true }).map((s) => s.props.statusStyle);
  await renderRouter(appRoutes({ '(tabs)/camera': require('../app/(tabs)/camera').default }), {
    initialUrl: '/camera',
  });
  for (let i = 0; i < 10; i++) await act(async () => {}); // its permission
  expect(screen.getByTestId('camera')).toBeOnTheScreen();
  expect(styles()).toEqual(['dark', 'light']);

  await press(tab('Home'));
  expect(styles()).toEqual(['dark']); // the camera is still mounted, under Home
  expect(screen.getByTestId('camera', { includeHiddenElements: true }).props.active).toBe(false);
  await act(() => router.back());
  expect(styles()).toEqual(['dark', 'light']);

  // the Scan screen over the tabs: the camera is under it
  await act(() => router.push('/result'));
  expect(styles()).toEqual(['dark']);
  await act(() => router.back());
  expect(styles()).toEqual(['dark', 'light']);
});
