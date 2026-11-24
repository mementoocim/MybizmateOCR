import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import {
  BottomTabBarHeightCallbackContext,
  BottomTabBarHeightContext,
  type BottomTabBarProps,
} from 'expo-router/js-tabs';
import { type ReactNode, useCallback, useState } from 'react';
import { Text } from 'react-native';

import { Camera, CircleUser, Files, House, Send } from '../components/icons';
import { useTabBarSpace } from '../components/Screen';
import { countText, TabBar, type TabName, TABS } from '../components/TabBar';
import { loadSaved } from '../lib/saved';
import { currentShutter, setShutter, subscribeShutter } from '../lib/shutter';
import { bottomClearance } from '../lib/snackbar';
import { bar, colors, elevation, radius, space, touch } from '../lib/theme';
import { contrast } from '../test-utils/contrast';
import { keyboard } from '../test-utils/keyboard';
import { memoryFs } from '../test-utils/memoryFs';
import { typeStylesOf } from '../test-utils/typeStyles';

// Spec §6.2 (calls 19 and 20): the floating bar. Five icon tabs in a white bar with 20 dp corners, 12 dp above the
// navigation bar's inset: Home, Sessions, the raised coral Camera (the shutter, on the camera), Export with its count,
// and Profile. The props are made up, as the tabs navigator gives them; jest has no layout, so the bar's height is
// given as Android would report it. This file's insets: 34 dp at the bottom.

let mockFocused = true; // the tabs are the screen on top
jest.mock('expo-router', () => ({ useIsFocused: () => mockFocused }));
jest.mock('expo-file-system', () => require('../test-utils/memoryFs').memoryFs.module);

const BOTTOM = 34;
const NAMES: readonly TabName[] = ['index', 'sessions', 'camera', 'export', 'profile'];
const keyOf = (name: TabName) => `${name}-route`;

const emit = jest.fn((_event: object) => ({ defaultPrevented: false }));
const navigateToTab = jest.fn();

/** The navigator's props with that tab open; options are every tab's (tabBarHideOnKeyboard, say). */
function propsAt(open: TabName, options: object = {}): BottomTabBarProps {
  const routes = NAMES.map((name) => ({ key: keyOf(name), name }));
  return {
    state: { index: NAMES.indexOf(open), routes },
    descriptors: Object.fromEntries(routes.map((route) => [route.key, { options }])),
    emitter: { emit },
    navigateToTab,
    insets: { top: 24, bottom: BOTTOM, left: 0, right: 0 },
  } as unknown as BottomTabBarProps;
}

/** The tabs as the navigator gives them to its screens: the bar reports its height, and the screens read it. */
function Tabs({ onHeight, children }: { onHeight: (height: number) => void; children?: ReactNode }) {
  const [height, setHeight] = useState<number | undefined>(undefined);
  const reported = useCallback(
    (h: number) => {
      onHeight(h);
      setHeight(h);
    },
    [onHeight],
  );
  return (
    <BottomTabBarHeightCallbackContext.Provider value={reported}>
      <BottomTabBarHeightContext.Provider value={height}>{children}</BottomTabBarHeightContext.Provider>
    </BottomTabBarHeightCallbackContext.Provider>
  );
}
function TabScreen() {
  return <Text>{`tab bar ${useTabBarSpace()}`}</Text>;
}

type Instance = ReturnType<typeof screen.getByRole>;
const tab = (name: string | RegExp) => screen.getByRole('tab', { name });
const press = (el: Instance) => act(async () => fireEvent.press(el));
/** The icons under a node stroked in a color. */
const iconsIn = (node: Instance, color: string) => node.queryAll((n) => n.props.stroke === color);
/** Android lays the bar's root out at this height. */
const layOut = (height: number) =>
  fireEvent(screen.getByTestId('tab-bar'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 360, height } } });

const camera = {}; // the camera tab, as the shutter knows it

let saves = 0;
/** A saved sale's summary as saved.json keeps it, exported or not. */
function summary(exportedAt: string | null = null) {
  saves += 1;
  return {
    id: `saved-${saves}`,
    label: 'Camera photo',
    partyName: 'Torres Construction Supply',
    partyId: null,
    date: '2026-11-18',
    listed: true,
    savedAt: '2026-11-19T01:00:00.000Z',
    exportedAt,
    kind: 'sale',
    gross: 1250,
    row: {},
  };
}
/** The saved scans, as if saved.json held these when the app started. */
async function savedAre(summaries: ReturnType<typeof summary>[]) {
  memoryFs.files.set('file:///docs/saved.json', JSON.stringify(summaries));
  await act(async () => loadSaved());
}

beforeEach(async () => {
  jest.clearAllMocks();
  mockFocused = true;
  setShutter(camera, null);
  memoryFs.reset();
  await loadSaved();
});

test('a tablist of five tabs in order, each a tab with its name; the open one is selected', async () => {
  expect(TABS.map((t) => [t.name, t.label, t.icon])).toEqual([
    ['index', 'Home', House],
    ['sessions', 'Sessions', Files],
    ['camera', 'Camera', Camera],
    ['export', 'Export', Send],
    ['profile', 'Profile', CircleUser],
  ]);
  await render(<TabBar {...propsAt('sessions')} />);
  // The bar is a tablist; it isn't an accessibility element of its own, so its tabs stay TalkBack's to reach one by one.
  const list = screen.getByTestId('tab-list');
  expect(list.props.accessibilityRole).toBe('tablist');
  const tabs = within(list).getAllByRole('tab');
  expect(tabs.map((t) => t.props.accessibilityLabel)).toEqual(['Home', 'Sessions', 'Camera', 'Export', 'Profile']);
  expect(tab('Sessions')).toBeSelected();
  for (const name of ['Home', 'Camera', 'Export', 'Profile']) expect(tab(name)).not.toBeSelected();
  // Every side tab is at least 48 dp square.
  for (const name of ['Home', 'Sessions', 'Export', 'Profile']) {
    expect(tab(name)).toHaveStyle({ minWidth: touch.target, minHeight: touch.target });
  }
  // A white bar with 20 dp corners and design B's shadow, floating 12 dp above the navigation bar's inset.
  expect(list).toHaveStyle({ backgroundColor: colors.panel, borderRadius: radius.bar, elevation: elevation.overlay });
  const root = screen.getByTestId('tab-bar');
  expect(root).toHaveStyle({ position: 'absolute', left: 0, right: 0, bottom: 0 });
  expect(root).toHaveStyle({ paddingHorizontal: space.m, paddingBottom: space.m + BOTTOM });
  expect(root.props.pointerEvents).toBe('box-none'); // what's beside the bar stays the screen's
});

test('the open tab: its icon in ink, with a coral dot under it; the others in the quiet ink, at least 3:1 on white', async () => {
  await render(<TabBar {...propsAt('export')} />);
  const open = tab('Export');
  expect(iconsIn(open, colors.ink).length).toBeGreaterThan(0);
  expect(iconsIn(open, colors.chevron)).toHaveLength(0);
  expect(within(open).getByTestId('tab-dot')).toHaveStyle({
    width: bar.dot, height: bar.dot, borderRadius: bar.dot / 2, backgroundColor: colors.brand,
  });
  for (const name of ['Home', 'Sessions', 'Profile']) {
    expect(iconsIn(tab(name), colors.chevron).length).toBeGreaterThan(0);
    expect(iconsIn(tab(name), colors.ink)).toHaveLength(0);
    expect(within(tab(name)).queryByTestId('tab-dot')).toBeNull();
  }
  // 24 dp icons
  expect(iconsIn(tab('Home'), colors.chevron)[0].props.width).toBe(touch.icon);
  // So the open tab never depends on color alone: the dot, and the quiet ink still reads on the white bar.
  expect(contrast(colors.chevron, colors.panel)).toBeGreaterThanOrEqual(3);
});

test('a press tells the tab, then opens it; on the open tab, it only tells it', async () => {
  await render(<TabBar {...propsAt('sessions')} />);
  await press(tab('Home'));
  expect(emit).toHaveBeenCalledWith({ type: 'tabPress', target: keyOf('index'), canPreventDefault: true });
  expect(navigateToTab).toHaveBeenCalledWith(keyOf('index'));

  jest.clearAllMocks();
  await press(tab('Sessions')); // already open
  expect(emit).toHaveBeenCalledWith({ type: 'tabPress', target: keyOf('sessions'), canPreventDefault: true });
  expect(navigateToTab).not.toHaveBeenCalled();

  jest.clearAllMocks();
  emit.mockReturnValueOnce({ defaultPrevented: true }); // a listener kept it
  await press(tab('Profile'));
  expect(emit).toHaveBeenCalledTimes(1);
  expect(navigateToTab).not.toHaveBeenCalled();
});

test("Export's count: a coral pill with ink figures, 99+ past 99, and in its name, Export, 7 to send; none at 0", async () => {
  expect([countText(1), countText(7), countText(99), countText(100), countText(1234)]).toEqual([
    '1', '7', '99', '99+', '99+',
  ]);
  const exported = '2026-11-19T02:00:00.000Z';
  await savedAre([...Array.from({ length: 7 }, () => summary()), summary(exported)]); // the exported one doesn't count
  await render(<TabBar {...propsAt('index')} />);
  const exportTab = tab('Export, 7 to send');
  const pill = within(exportTab).getByTestId('export-count');
  expect(pill).toHaveStyle({ backgroundColor: colors.brand });
  const figures = within(pill).getByText('7');
  expect(figures).toHaveStyle({ color: colors.ink });
  expect(typeStylesOf(figures)).toContain('badge');

  // It follows the saved scans as they change.
  await savedAre(Array.from({ length: 120 }, () => summary()));
  expect(within(tab('Export, 120 to send')).getByText('99+')).toBeOnTheScreen();

  await savedAre([summary(exported)]);
  expect(tab('Export')).toBeOnTheScreen();
  expect(screen.queryByTestId('export-count')).toBeNull();
});

test('the middle button: elsewhere, Camera, which opens the camera; on the camera, Take photo, which takes it', async () => {
  await render(<TabBar {...propsAt('index')} />);
  const middle = tab('Camera');
  expect(middle).not.toBeSelected();
  expect(iconsIn(middle, colors.ink).length).toBeGreaterThan(0); // an ink camera on the coral
  expect(within(middle).queryByTestId('shutter-core')).toBeNull();
  // A 60 dp coral circle in a 4 dp paper ring, raised 26 dp above the bar.
  expect(middle).toHaveStyle({
    width: bar.circle + 2 * bar.ring,
    height: bar.circle + 2 * bar.ring,
    borderRadius: bar.circle / 2 + bar.ring,
    borderWidth: bar.ring,
    borderColor: colors.paper,
    backgroundColor: colors.brand,
  });
  expect(screen.getByTestId('camera-slot')).toHaveStyle({ marginTop: -bar.raise });
  expect(screen.queryByTestId('camera-dot')).toBeNull();
  await press(middle);
  expect(emit).toHaveBeenCalledWith({ type: 'tabPress', target: keyOf('camera'), canPreventDefault: true });
  expect(navigateToTab).toHaveBeenCalledWith(keyOf('camera'));

  jest.clearAllMocks();
  const take = jest.fn();
  await act(async () => setShutter(camera, { take, disabled: false }));
  await screen.rerender(<TabBar {...propsAt('camera')} />);
  expect(screen.queryByRole('tab', { name: 'Camera' })).toBeNull();
  const shutter = tab('Take photo');
  expect(shutter).toBeSelected();
  expect(shutter).toBeEnabled();
  // The shutter's look: a white core inside the coral ring, and the open tab's dot under it.
  expect(within(shutter).getByTestId('shutter-core')).toHaveStyle({ backgroundColor: colors.panel });
  expect(iconsIn(shutter, colors.ink)).toHaveLength(0);
  expect(screen.getByTestId('camera-dot')).toHaveStyle({ width: bar.dot, backgroundColor: colors.brand });
  await press(shutter);
  expect(take).toHaveBeenCalledTimes(1);
  expect(navigateToTab).not.toHaveBeenCalled();
});

test("Take photo waits while the camera can't take one", async () => {
  await render(<TabBar {...propsAt('camera')} />);
  expect(tab('Take photo')).toBeDisabled(); // no camera yet
  const take = jest.fn();
  await act(async () => setShutter(camera, { take, disabled: true })); // it's starting, or taking one
  expect(tab('Take photo')).toBeDisabled();
  await press(tab('Take photo'));
  expect(take).not.toHaveBeenCalled();

  await act(async () => setShutter(camera, { take, disabled: false }));
  expect(tab('Take photo')).toBeEnabled();
  await press(tab('Take photo'));
  expect(take).toHaveBeenCalledTimes(1);

  await act(async () => setShutter(camera, null)); // it left
  expect(tab('Take photo')).toBeDisabled();
});

test('with the keyboard up it hides, and takes no space', async () => {
  const onHeight = jest.fn();
  await render(
    <Tabs onHeight={onHeight}>
      <TabBar {...propsAt('profile', { tabBarHideOnKeyboard: true })} />
      <TabScreen />
    </Tabs>,
  );
  await layOut(80);
  expect(onHeight).toHaveBeenLastCalledWith(80 + bar.raise);
  expect(bottomClearance()).toBe(80 + bar.raise);

  await keyboard(300);
  expect(screen.queryByTestId('tab-list')).toBeNull();
  expect(screen.queryByTestId('tab-bar')).toBeNull();
  expect(onHeight).toHaveBeenLastCalledWith(0);
  expect(bottomClearance()).toBe(0);
  expect(screen.getByText('tab bar 0')).toBeOnTheScreen();

  await keyboard(0);
  expect(screen.getByTestId('tab-list')).toBeOnTheScreen();
  await layOut(80);
  expect(onHeight).toHaveBeenLastCalledWith(80 + bar.raise);
  expect(bottomClearance()).toBe(80 + bar.raise);
  expect(screen.getByText(`tab bar ${80 + bar.raise}`)).toBeOnTheScreen();
});

test('its height, the raised button too, goes to the tab screens, and to the snackbar while the tabs are on top', async () => {
  const onHeight = jest.fn();
  const tabs = () => (
    <Tabs onHeight={onHeight}>
      <TabBar {...propsAt('index')} />
      <TabScreen />
    </Tabs>
  );
  await render(tabs());
  expect(screen.getByText('tab bar 0')).toBeOnTheScreen(); // not laid out yet
  await layOut(80);
  expect(screen.getByText(`tab bar ${80 + bar.raise}`)).toBeOnTheScreen();
  expect(bottomClearance()).toBe(80 + bar.raise);

  // A screen over the tabs (the Scan screen): its own bar counts, not this one; the tab screens keep their space.
  mockFocused = false;
  await screen.rerender(tabs());
  expect(bottomClearance()).toBe(0);
  expect(screen.getByText(`tab bar ${80 + bar.raise}`)).toBeOnTheScreen();

  mockFocused = true; // back on top
  await screen.rerender(tabs());
  expect(bottomClearance()).toBe(80 + bar.raise);
  await layOut(90); // laid out again (a larger font): the new height
  expect(bottomClearance()).toBe(90 + bar.raise);
  expect(screen.getByText(`tab bar ${90 + bar.raise}`)).toBeOnTheScreen();

  await screen.unmount();
  expect(bottomClearance()).toBe(0);
});

test('a camera that leaves clears only its own shutter', async () => {
  const listener = jest.fn();
  const unsubscribe = subscribeShutter(listener);
  const old = {}; // the camera's old root, whose late unmount comes after the new one's mount (T26-4)
  const first = { take: jest.fn(), disabled: false };
  const second = { take: jest.fn(), disabled: false };
  setShutter(old, first);
  setShutter(camera, second);
  expect(currentShutter()).toBe(second);
  expect(listener).toHaveBeenCalledTimes(2);
  setShutter(old, null); // not its own any more: nothing changes
  expect(currentShutter()).toBe(second);

  await render(<TabBar {...propsAt('camera')} />);
  await press(tab('Take photo'));
  expect(second.take).toHaveBeenCalledTimes(1);
  expect(first.take).not.toHaveBeenCalled();

  await act(async () => setShutter(camera, null));
  expect(currentShutter()).toBeNull();
  expect(tab('Take photo')).toBeDisabled();
  unsubscribe();
  listener.mockClear();
  await act(async () => setShutter(camera, second));
  expect(listener).not.toHaveBeenCalled();
});
