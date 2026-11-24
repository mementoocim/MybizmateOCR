import { useIsFocused } from 'expo-router';
import type { MockContextConfig } from 'expo-router/testing-library';
import { type ReactElement } from 'react';
import { Text } from 'react-native';

// The app's routes for expo-router's renderRouter: the four layouts as they are (app/_layout, the tabs', and Sessions'
// and Export's stacks), and the screens a suite gives. Any screen not given stands in as its name and whether it's the
// screen on top: "Camera: on top", "Home: under". Its own suite covers the real one.

export type RouteFile =
  | '_layout'
  | '(tabs)/_layout'
  | '(tabs)/index'
  | '(tabs)/camera'
  | '(tabs)/profile'
  | '(tabs)/sessions/_layout'
  | '(tabs)/sessions/index'
  | '(tabs)/sessions/[id]'
  | '(tabs)/export/_layout'
  | '(tabs)/export/index'
  | 'result'
  | 'saved'
  | 'lists'
  | 'licenses'
  | 'license'
  | 'speed'
  | 'training';

/** renderRouter's routes, as a map of route files. */
export type Routes = Exclude<MockContextConfig, string | string[] | { appDir: string }>;
/** A route file as renderRouter takes it: a screen, or a module with its default and settings. */
type RouteStub = Routes[string];
/** A screen as renderRouter takes it. */
export type ScreenStub = () => ReactElement | null;

type Layout = '_layout' | '(tabs)/_layout' | '(tabs)/sessions/_layout' | '(tabs)/export/_layout';

/** The layouts, read when a suite asks for the routes, so its jest.mock()s are in place first. */
const LAYOUTS: Record<Layout | '+native-intent', () => RouteStub> = {
  _layout: () => require('../app/_layout'),
  '(tabs)/_layout': () => require('../app/(tabs)/_layout'),
  '(tabs)/sessions/_layout': () => require('../app/(tabs)/sessions/_layout'),
  '(tabs)/export/_layout': () => require('../app/(tabs)/export/_layout'),
  '+native-intent': () => require('../app/+native-intent'), // a launch with no route opens the camera
};

/** Each screen's name, as its stand-in says it. */
export const SCREEN_NAMES: Record<Exclude<RouteFile, Layout>, string> = {
  '(tabs)/index': 'Home',
  '(tabs)/camera': 'Camera',
  '(tabs)/profile': 'Profile',
  '(tabs)/sessions/index': 'Sessions',
  '(tabs)/sessions/[id]': 'Session',
  '(tabs)/export/index': 'Export',
  result: 'Scan',
  saved: 'Saved',
  lists: 'Your lists',
  licenses: 'Open-source licenses',
  license: 'License',
  speed: 'Speed test',
  training: 'Training data',
};

/** A screen's stand-in: its name, and whether it's the screen on top. */
export function standIn(name: string): ScreenStub {
  return function StandIn() {
    return <Text>{`${name}: ${useIsFocused() ? 'on top' : 'under'}`}</Text>;
  };
}

export function appRoutes(screens: Partial<Record<RouteFile, ScreenStub | RouteStub>> = {}): Routes {
  const routes: Routes = {};
  for (const [file, load] of Object.entries(LAYOUTS)) routes[file] = screens[file as Layout] ?? load();
  for (const [file, name] of Object.entries(SCREEN_NAMES)) {
    routes[file] = screens[file as keyof typeof SCREEN_NAMES] ?? standIn(name);
  }
  return routes;
}
