import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { Alert, AppState, Linking, StyleSheet } from 'react-native';

import CameraScreen from '../app/(tabs)/camera';
import { CAMERA_ERRORS, CAMERA_TEXT, PERMISSION_TEXT, statusText } from '../lib/cameraCopy';
import { captures, pendingIn } from '../lib/captureQueue';
import { saveScan } from '../lib/saved';
import { getScan, recentScans } from '../lib/scans';
import { currentSession, loadSession, retakeIn } from '../lib/session';
import { currentShutter } from '../lib/shutter';
import { setStarted } from '../lib/startup';
import { colors, radius, touch, type } from '../lib/theme';
import type { ScanResult } from '../modules/scanner';
import { parseScanResult } from '../modules/scanner/src/parse';
import { coreJson } from '../test-utils/coreJson';
import { dialogWords } from '../test-utils/dialogs';
import { memoryFs } from '../test-utils/memoryFs';
import { pinToday } from '../test-utils/today';
import { typeStylesOf } from '../test-utils/typeStyles';

// Design B §9.3 and camera first (spec §6.3, the plan's calls 6 to 8): the camera, a tab. The preview, its outline,
// auto-capture and the checks are native. Over them, with no title and no Close: the Auto switch and the flashlight
// switch. Under them, the session's tray: the gallery, the session's thumbnails and Done · N, and the PDF import; the
// status pill in its middle until the session has a photo. The tabs' middle button is the shutter (lib/shutter). Every
// capture joins the open session and goes to the queue, which reads while the camera stays live; a read never opens a
// dialog. The real session store, queue and scans, on a memory file system; the scanner's reads are deferred promises.

let mockFocused = true;
let mockParams: Record<string, string> = {};
let mockTeam = false;
const mockRouter = { push: jest.fn(), replace: jest.fn(), navigate: jest.fn(), dismissTo: jest.fn() };
/** The screen's own navigation, in the tabs (lib/navigation's useOpenOnce navigates there). */
const mockNavigation = {
  canGoBack: jest.fn(() => true),
  goBack: jest.fn(),
  getState: () => ({ type: 'tab' }),
  getParent: () => undefined,
};
type Read = { uri: string; resolve: (r: ScanResult) => void; reject: (e: unknown) => void };
const mockReads: Read[] = []; // the reads under way, oldest first
const mockScanPhoto = jest.fn();
const mockReadPdf = jest.fn();
const mockTakePhoto = jest.fn(async () => {});
const mockRearm = jest.fn(async () => {});
const mockGetPermission = jest.fn();
const mockRequestPermission = jest.fn();
const mockLibrary = jest.fn();
const mockCameraApp = jest.fn();
const mockPick = jest.fn();
const mockDisplayName = jest.fn();

jest.mock('expo-router', () => ({
  useNavigation: () => mockNavigation,
  useRouter: () => mockRouter,
  // as expo-router's: it runs while the screen is on top, and cleans up when it's left
  useFocusEffect: (effect: () => void | (() => void)) => {
    const focused = mockFocused;
    require('react').useEffect(() => (focused ? effect() : undefined), [effect, focused]);
  },
  useIsFocused: () => mockFocused,
  useLocalSearchParams: () => mockParams,
}));
// The native camera stands in as a plain view carrying its props; its ref carries takePhoto and rearm.
jest.mock('../modules/scanner', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    scanPhoto: (uri: string, options: object) => mockScanPhoto(uri, options),
    readPdf: (uri: string) => mockReadPdf(uri),
    releaseAccess: async () => undefined,
    displayName: (uri: string) => mockDisplayName(uri),
    ScannerCameraView: React.forwardRef(function MockCamera(props: object, ref: unknown) {
      React.useImperativeHandle(ref, () => ({ takePhoto: mockTakePhoto, rearm: () => mockRearm() }));
      return React.createElement(View, { testID: 'camera', ...props });
    }),
  };
});
jest.mock('expo-image-picker', () => ({
  getCameraPermissionsAsync: () => mockGetPermission(),
  requestCameraPermissionsAsync: () => mockRequestPermission(),
  launchCameraAsync: () => mockCameraApp(),
  launchImageLibraryAsync: () => mockLibrary(),
}));
jest.mock('expo-haptics');
// expo-status-bar's StatusBar stands in as a plain view carrying its props, as in the photo viewer's suite.
jest.mock('expo-status-bar', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { StatusBar: (props: object) => React.createElement(View, { testID: 'status-bar', statusBar: props }) };
});
jest.mock('../lib/build', () => ({
  get TEAM_BUILD() {
    return mockTeam;
  },
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('expo-asset', () => ({
  Asset: { fromModule: () => ({ downloadAsync: async () => ({ localUri: 'file:///bundle/sample.jpg' }) }) },
}));
jest.mock('expo-file-system', () => {
  const memory = require('../test-utils/memoryFs').memoryFs.module;
  return { ...memory, File: Object.assign(memory.File, { pickFileAsync: (options: object) => mockPick(options) }) };
});

const T = new Date(2026, 10, 24, 9, 41);
const granted = { granted: true, canAskAgain: true, status: 'granted' };
const refused = (canAskAgain: boolean) => ({ granted: false, canAskAgain, status: 'denied' });
const STOPPED = 'The scanner stopped while reading it.';

let alert: jest.SpyInstance;
const flush = () => new Promise<void>((resolve) => setTimeout(() => resolve(), 0));

let folders = 0;
/** The scanner's result for a fixture, in a folder of its own. */
const result = (stem = 'inv_0007') =>
  parseScanResult(coreJson(stem, `file:///docs/scans/${1795000000000 + ++folders}`));

beforeAll(() => pinToday(T));
afterAll(() => jest.useRealTimers());

beforeEach(async () => {
  // the last test's reads finish, so the queue is empty, and its session closes
  while (mockReads.length > 0 || captures().length > 0) {
    mockReads.splice(0).forEach((r) => r.resolve(result()));
    await flush();
  }
  await loadSession();
  await flush();
  memoryFs.reset();
  jest.clearAllMocks();
  jest.setSystemTime(T);
  setStarted(true);
  mockFocused = true;
  mockParams = {};
  mockTeam = false;
  mockNavigation.canGoBack.mockReturnValue(true);
  mockGetPermission.mockResolvedValue(granted);
  mockRequestPermission.mockResolvedValue(granted);
  mockLibrary.mockResolvedValue({ canceled: true });
  mockCameraApp.mockResolvedValue({ canceled: true });
  mockPick.mockResolvedValue({ canceled: true });
  mockDisplayName.mockResolvedValue('si_0001.pdf');
  const deferred = (uri: string) =>
    new Promise<ScanResult>((resolve, reject) => mockReads.push({ uri, resolve, reject }));
  mockScanPhoto.mockImplementation((uri: string) => deferred(uri));
  mockReadPdf.mockImplementation((uri: string) => deferred(uri));
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => alert.mockRestore());

async function settle() {
  for (let i = 0; i < 10; i++) await act(async () => {});
}

async function open() {
  const view = await render(<CameraScreen />);
  await settle();
  return view;
}

/** The camera hands over a photo, in the app's cache, a second after the last one. */
async function photo(name: string) {
  jest.setSystemTime(new Date(Date.now() + 1000));
  const uri = `file:///cache/camera/${name}`;
  memoryFs.files.set(uri, 'jpeg');
  await send('photo', { uri });
  await settle();
  return uri;
}
/** The oldest read under way ends with this result, or fails. */
async function read(r: ScanResult = result()) {
  expect(mockReads.length).toBeGreaterThan(0);
  await act(async () => {
    mockReads.shift()!.resolve(r);
    await flush();
  });
  await settle();
}
async function fail(e: unknown = new Error('boom')) {
  expect(mockReads.length).toBeGreaterThan(0);
  await act(async () => {
    mockReads.shift()!.reject(e);
    await flush();
  });
  await settle();
}

const camera = () => screen.getByTestId('camera');
const send = (event: string, nativeEvent: object) => act(async () => fireEvent(camera(), event, { nativeEvent }));
const press = (el: Parameters<typeof fireEvent.press>[0]) => act(async () => fireEvent.press(el));
const button = (name: string) => screen.getByRole('button', { name });
const header = (name: string) => screen.getByRole('header', { name });
const autoSwitch = () => screen.getByRole('switch', { name: 'Auto capture' });
/** The tabs' middle button, as the bar presses it (components/TabBar). */
const take = () => act(async () => currentShutter()!.take());
const doneButton = () => screen.getByRole('button', { name: /^(Done · \d+|Reading \d+ more…)$/ });
const thumbs = () =>
  screen.queryAllByLabelText(/^Photo \d+, /).map((t) => t.props.accessibilityLabel as string);
type Instance = ReturnType<typeof screen.getByRole>;
/** A host element's host children, in order (an icon's Svg, a Text, a View). */
const kids = (el: Instance) => el.children.filter((child): child is Instance => typeof child !== 'string');
const CAMERA_APP = "Use the phone's camera app instead";
const sessionId = () => currentSession()?.id;
/** Another screen went on top, then the camera came back: its presses open screens again (lib/navigation). */
async function refocus(view: { rerender: (el: React.ReactElement) => unknown }) {
  mockFocused = false;
  await act(async () => view.rerender(<CameraScreen />));
  mockFocused = true;
  await act(async () => view.rerender(<CameraScreen />));
}

test('status copy', async () => {
  expect(statusText('starting', null)).toBe('Starting the camera…');
  expect(statusText('looking', null)).toBe('Looking for the form…');
  expect(statusText('holding', 'service_invoice')).toBe('Service Invoice · hold still');
  expect(statusText('blurry', 'sales_invoice')).toBe('MyBizMate Sales Invoice · blurry, hold still');
  expect(statusText('found', 'sales_invoice')).toBe('MyBizMate Sales Invoice found · tap the button');
  expect(statusText('capturing', 'service_invoice')).toBe('Taking the photo…');
  expect(statusText('taken', 'sales_invoice')).toBe('Taken · put in the next one');
  expect(statusText('taken', null)).toBe('Taken · put in the next one');

  await open();
  expect(screen.getByText('Starting the camera…')).toBeTruthy();
  await send('status', { status: 'holding', form: 'service_invoice' });
  const words = screen.getByText('Service Invoice · hold still');
  // white words on the pill, which wraps rather than running off the preview
  expect(words).toHaveStyle({ ...type.body, color: colors.cameraText });
  expect(words.props.numberOfLines).toBeUndefined();
  expect(screen.getByTestId('status-pill')).toHaveStyle({
    backgroundColor: colors.pill,
    borderRadius: radius.pill,
    maxWidth: '90%',
  });
});

test('the copy: the panels, the errors; the raw start message is no longer in the words', () => {
  expect(CAMERA_TEXT).toEqual({
    allowTitle: 'Allow the camera',
    offTitle: 'Camera access is off',
    offBody: "Turn on the camera for MyBizMate Scan in the phone's settings.",
    startTitle: "The camera couldn't start",
  });
  expect(CAMERA_ERRORS).toEqual({
    capture: "Couldn't take the photo. Try the button again.",
    keep: "Couldn't keep the photo. Try again.",
    noCamera: 'This phone has no camera the scanner can use.',
  });
  expect(PERMISSION_TEXT).toBe('The scanner needs the camera to see the invoice. Nothing it sees leaves the phone.');
});

test('it starts, and asks for the camera, only once the splash has gone', async () => {
  setStarted(false);
  await open();
  expect(mockGetPermission).not.toHaveBeenCalled();
  expect(mockRequestPermission).not.toHaveBeenCalled();
  expect(screen.queryByTestId('camera')).toBeNull();
  expect(currentShutter()?.disabled).toBe(true);
  await act(async () => setStarted(true));
  await settle();
  expect(mockGetPermission).toHaveBeenCalledTimes(1);
  expect(camera().props.active).toBe(true);

  // the test hook's sample too: nothing loads behind the splash
  await act(async () => setStarted(false));
  mockParams = { test: 'inv_0051' };
  await open();
  expect(screen.queryByTestId('camera')).toBeNull();
  await act(async () => setStarted(true));
  await settle();
  expect(camera().props.testImage).toBe('file:///bundle/sample.jpg');
});

test('errors', async () => {
  await open();
  await send('cameraError', { code: 'capture', message: 'x' });
  expect(screen.getByText("Couldn't take the photo. Try the button again.")).toBeTruthy();
  await send('cameraError', { code: 'keep', message: 'x' });
  expect(screen.getByText("Couldn't keep the photo. Try again.")).toBeTruthy();

  await send('cameraError', { code: 'no_camera', message: '' });
  expect(header('This phone has no camera the scanner can use.')).toBeTruthy();
  expect(button('Choose from gallery')).toBeTruthy();
  expect(screen.queryByRole('button', { name: CAMERA_APP })).toBeNull(); // no camera app either
  expect(screen.queryByText('Allow the camera')).toBeNull();
  expect(screen.queryByTestId('camera')).toBeNull();
  expect(button('Gallery')).toBeTruthy(); // the tray stays
  expect(button('Import PDF')).toBeTruthy();
  expect(currentShutter()?.disabled).toBe(true); // a panel: the middle button waits
});

test('an error stays in the pill for 3 s, then the status shows again', async () => {
  jest.useFakeTimers();
  try {
    await open();
    await send('cameraError', { code: 'capture', message: 'x' });
    await send('status', { status: 'found', form: 'sales_invoice' }); // the view looks again right away
    expect(screen.getByText("Couldn't take the photo. Try the button again.")).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(3000);
    });
    expect(screen.getByText('MyBizMate Sales Invoice found · tap the button')).toBeTruthy();
  } finally {
    pinToday(T);
  }
});

test('no Close: the camera is a tab', async () => {
  // camera first (call 8): Back leaves the app from the camera, so nothing on it goes back
  await open();
  expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  expect(mockNavigation.goBack).not.toHaveBeenCalled();
  expect(mockRouter.replace).not.toHaveBeenCalled();
});

test('no title; the Auto switch and the flashlight switch', async () => {
  await open();
  expect(screen.queryByText('Scan an invoice')).toBeNull();
  expect(screen.queryByRole('header')).toBeNull();

  // Auto: a switch, on at first, a pill holding AUTO and a dot (brand when on, a hollow ring when off)
  expect(autoSwitch()).toBeChecked();
  expect(autoSwitch().props.accessibilityHint).toBe('Takes the photo by itself when the form holds still');
  expect(autoSwitch()).toHaveStyle({ borderRadius: radius.pill, borderWidth: 1, borderColor: colors.cameraMute });
  expect(within(autoSwitch()).getByText('Auto')).toHaveStyle({ ...type.badge, color: colors.cameraText });
  expect(screen.getByTestId('auto-dot')).toHaveStyle({ width: 8, height: 8, backgroundColor: colors.brand });
  expect(camera().props.auto).toBe(true);
  await press(autoSwitch());
  expect(autoSwitch()).not.toBeChecked();
  expect(autoSwitch().props.accessibilityHint).toBe('Take the photo with the round button');
  expect(screen.getByTestId('auto-dot')).toHaveStyle({ borderWidth: 1, borderColor: colors.cameraMute });
  expect(StyleSheet.flatten(screen.getByTestId('auto-dot').props.style).backgroundColor).toBeUndefined();
  expect(camera().props.auto).toBe(false);
  expect(screen.queryByText('Manual')).toBeNull();

  // the flashlight: a switch, once the camera says it has a torch
  expect(screen.queryByRole('switch', { name: 'Flashlight' })).toBeNull();
  await send('ready', { hasTorch: true });
  const flashlight = () => screen.getByRole('switch', { name: 'Flashlight' });
  expect(flashlight()).not.toBeChecked();
  expect(camera().props.torch).toBe(false);
  await press(flashlight());
  expect(flashlight()).toBeChecked();
  expect(camera().props.torch).toBe(true);
  await press(flashlight());
  expect(flashlight()).not.toBeChecked();
  expect(camera().props.torch).toBe(false);
});

test('the middle button takes the photo while the camera is on top, and waits while it starts or takes one; on another tab it is Camera again', async () => {
  // Review Focus 4. The old round shutter on the screen is gone: the tabs' raised middle button is the shutter
  const view = await open();
  expect(screen.queryByLabelText('Take the photo')).toBeNull();
  expect(screen.queryByTestId('shutter-disc')).toBeNull();
  expect(currentShutter()?.disabled).toBe(true); // starting
  await send('status', { status: 'looking', form: null });
  expect(currentShutter()?.disabled).toBe(false);
  await take();
  expect(mockTakePhoto).toHaveBeenCalledTimes(1);
  await send('status', { status: 'capturing', form: 'sales_invoice' });
  expect(currentShutter()?.disabled).toBe(true); // taking the photo
  await send('status', { status: 'taken', form: 'sales_invoice' });
  expect(currentShutter()?.disabled).toBe(false); // it keeps shooting: the next one any time

  // while a picker is open, it waits too
  let close: (v: unknown) => void = () => {};
  mockLibrary.mockImplementation(() => new Promise((resolve) => (close = resolve)));
  await press(button('Gallery'));
  expect(currentShutter()?.disabled).toBe(true);
  await act(async () => close({ canceled: true }));
  expect(currentShutter()?.disabled).toBe(false);

  // another tab on top: the bar's middle button is Camera again, with no shutter of the camera's
  mockFocused = false;
  await act(async () => view.rerender(<CameraScreen />));
  expect(currentShutter()).toBeNull();
  mockFocused = true;
  await act(async () => view.rerender(<CameraScreen />));
  expect(currentShutter()?.disabled).toBe(false);
  // gone: it takes its shutter with it
  await act(async () => view.unmount());
  expect(currentShutter()).toBeNull();
});

test('the camera stops when another tab is on top', async () => {
  // Review Focus 4: a tab left stays mounted, under the others
  const view = await open();
  expect(camera().props.active).toBe(true);
  mockFocused = false;
  await act(async () => view.rerender(<CameraScreen />));
  expect(camera().props.active).toBe(false);
  mockFocused = true;
  await act(async () => view.rerender(<CameraScreen />));
  expect(camera().props.active).toBe(true);
});

test("a start failure: The camera couldn't start and Try again; the raw message only in team builds", async () => {
  await open();
  await send('cameraError', { code: 'start', message: 'boom' });
  expect(header(CAMERA_TEXT.startTitle)).toHaveStyle({ ...type.headline, color: colors.cameraText });
  expect(screen.queryByText(/boom/)).toBeNull(); // a client never sees the raw message
  expect(button(CAMERA_APP)).toBeTruthy();
  expect(button('Gallery')).toBeTruthy();
  expect(screen.queryByTestId('camera')).toBeNull();
  expect(currentShutter()?.disabled).toBe(true);
  await press(button('Try again'));
  expect(camera().props.active).toBe(true);
  expect(screen.queryByRole('header', { name: CAMERA_TEXT.startTitle })).toBeNull();
  expect(currentShutter()?.disabled).toBe(true); // the new camera starts again

  // a team build shows the raw message on its own line
  mockTeam = true;
  await send('cameraError', { code: 'start', message: 'boom' });
  expect(header(CAMERA_TEXT.startTitle)).toBeTruthy();
  expect(screen.getByText('boom')).toHaveStyle({ ...type.figureSmall, color: colors.cameraMute });
  expect(typeStylesOf(screen.getByText('boom'))).toEqual(['figureSmall']); // jest runs as iOS: label flattens alike
});

test('permission: Allow the camera, then Camera access is off with Open settings', async () => {
  mockGetPermission.mockResolvedValue(refused(true));
  mockRequestPermission.mockResolvedValue(refused(true));
  await open();
  // it can still ask: a panel on cameraPanel with the camera icon on top, why, and one clear action
  const panel = screen.getByTestId('camera-panel');
  expect(panel).toHaveStyle({ backgroundColor: colors.cameraPanel, borderRadius: radius.panel });
  const [head] = kids(panel);
  expect(kids(head)[0].props).toMatchObject({ width: touch.icon, stroke: colors.cameraText }); // the icon, on top
  expect(header(CAMERA_TEXT.allowTitle)).toHaveStyle({ ...type.headline, color: colors.cameraText });
  expect(screen.getByText(PERMISSION_TEXT)).toHaveStyle({ ...type.body, color: colors.cameraMute });
  expect(button('Allow the camera')).toHaveStyle({ backgroundColor: colors.brand });
  expect(screen.getByText(CAMERA_APP)).toHaveStyle({ color: colors.brand }); // coral on the dark panel (T16-2)
  expect(button('Gallery')).toBeTruthy();
  expect(screen.queryByRole('switch', { name: 'Auto capture' })).toBeNull();
  expect(screen.queryByTestId('camera')).toBeNull();

  // refused again, for good this time: the settings are the way
  mockRequestPermission.mockResolvedValue(refused(false));
  await press(button('Allow the camera'));
  expect(header(CAMERA_TEXT.offTitle)).toBeTruthy();
  expect(screen.getByText(CAMERA_TEXT.offBody)).toHaveStyle({ ...type.body, color: colors.cameraMute });
  expect(screen.queryByRole('button', { name: 'Allow the camera' })).toBeNull();
  expect(button(CAMERA_APP)).toBeTruthy();
  const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
  await press(button('Open settings'));
  expect(openSettings).toHaveBeenCalledTimes(1);
  expect(mockRequestPermission).toHaveBeenCalledTimes(2); // on focus, and Allow the camera; never on Open settings
});

test('permission can be asked again', async () => {
  mockGetPermission.mockResolvedValue(refused(true));
  mockRequestPermission.mockResolvedValue(refused(true));
  await open();
  expect(mockRequestPermission).toHaveBeenCalledTimes(1); // asked once, on focus
  expect(screen.getByText(PERMISSION_TEXT)).toBeTruthy();
  expect(screen.queryByTestId('camera')).toBeNull();

  mockRequestPermission.mockResolvedValue(granted);
  await press(button('Allow the camera'));
  await settle();
  expect(mockRequestPermission).toHaveBeenCalledTimes(2);
  expect(camera().props.active).toBe(true);
});

test('permission refused for good', async () => {
  mockGetPermission.mockResolvedValue(refused(false));
  const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
  await open();
  expect(mockRequestPermission).not.toHaveBeenCalled();
  expect(header(CAMERA_TEXT.offTitle)).toBeTruthy();
  await press(button('Open settings'));
  expect(openSettings).toHaveBeenCalled();
  expect(mockRequestPermission).not.toHaveBeenCalled();
});

test('coming back from the settings checks the permission again', async () => {
  const listeners: ((state: string) => void)[] = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    listeners.push(listener as (state: string) => void);
    return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
  });
  mockGetPermission.mockResolvedValue(refused(false));
  await open();
  expect(screen.queryByTestId('camera')).toBeNull();
  mockGetPermission.mockResolvedValue(granted);
  await act(async () => listeners.forEach((l) => l('active')));
  await settle();
  expect(camera().props.active).toBe(true);
});

test('camera app needs the permission too', async () => {
  mockGetPermission.mockResolvedValue(refused(false));
  mockRequestPermission.mockResolvedValue(refused(false));
  await open();
  await press(button(CAMERA_APP));
  await settle();
  expect(dialogWords(alert)).toEqual([
    ['The camera app needs the camera permission too.', 'Choose a photo from the gallery instead.'],
  ]);
  expect(currentSession()).toBeNull(); // nothing was taken: no session
});

test("a photo joins the session's queue, and the camera stays live while it's read", async () => {
  await open();
  const uri = await photo('capture_1.jpg');
  const id = sessionId()!;
  expect(captures().map((c) => ({ session: c.session, source: c.source, testImage: c.testImage }))).toEqual([
    { session: id, source: 'camera', testImage: false },
  ]);
  expect(memoryFs.files.has(uri)).toBe(false); // it moved into files/queue/<session>/
  expect(mockScanPhoto).toHaveBeenCalledWith(expect.stringContaining(`file:///docs/queue/${id}/`), { deletePhoto: false });
  expect(camera().props.active).toBe(true); // reads never turn it off
  expect(screen.queryByText('Reading…')).toBeNull(); // no reading card
  expect(screen.queryByLabelText('Reading')).toBeNull();
  await read();
  expect(camera().props.active).toBe(true);
  expect(recentScans()[0]).toMatchObject({ session: id, source: 'camera', label: 'Camera photo' });
  expect(mockRouter.push).not.toHaveBeenCalled(); // nothing opens: it keeps shooting
});

test('the first capture opens a session; the next ones join it', async () => {
  await open();
  expect(currentSession()).toBeNull(); // opening the camera starts none
  await photo('capture_1.jpg');
  const id = sessionId()!;
  expect(currentSession()).toMatchObject({ id, open: true });
  await photo('capture_2.jpg');
  await photo('capture_3.jpg');
  expect(sessionId()).toBe(id);
  expect(captures().map((c) => c.session)).toEqual([id, id, id]);
  expect(pendingIn(id)).toBe(3);
});

test('the tray: the gallery and the PDF always; the hint in the middle until the first photo; then the thumbnails and Done · N', async () => {
  await open();
  const tray = screen.getByTestId('session-tray');
  const [gallery, middle, pdf] = kids(tray);
  expect(gallery.props.accessibilityLabel).toBe('Gallery');
  expect(pdf.props.accessibilityLabel).toBe('Import PDF');
  for (const end of [gallery, pdf]) {
    expect(end).toHaveStyle({ width: touch.target, height: touch.target });
    expect(kids(end)[0].props).toMatchObject({ width: touch.icon, stroke: colors.cameraText }); // the camera tone
  }
  // before the first photo: the status pill in the middle, and no Done
  expect(within(middle).getByTestId('status-pill')).toBeTruthy();
  expect(within(middle).getByText('Starting the camera…')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /^Done/ })).toBeNull();
  expect(thumbs()).toEqual([]);

  await photo('capture_1.jpg');
  await photo('capture_2.jpg');
  // the thumbnails and Done · N in the middle; the pill moves to the picture's foot
  expect(within(screen.getByTestId('session-tray')).queryByTestId('status-pill')).toBeNull();
  expect(screen.getByTestId('status-pill')).toBeTruthy();
  expect(thumbs()).toEqual(['Photo 1, reading', 'Photo 2, reading']);
  expect(doneButton().props.accessibilityLabel).toBe('Done · 2');
  expect(doneButton()).toHaveStyle({ backgroundColor: colors.panel, borderColor: colors.outline }); // secondary
  const thumb = screen.getByLabelText('Photo 1, reading');
  expect(thumb).toHaveStyle({ width: touch.thumbW, height: touch.thumbH });
  // a failed read counts too: N is every photo taken
  await fail();
  await photo('capture_3.jpg');
  expect(doneButton().props.accessibilityLabel).toBe('Done · 3');
  // the tray clears the tabs' floating bar (0 outside the tabs, in this suite)
  expect(screen.getByTestId('session-tray')).toHaveStyle({ paddingBottom: 8 });
});

test('each thumbnail says how it stands: reading, read or retake', async () => {
  await open();
  await photo('capture_1.jpg');
  await photo('capture_2.jpg');
  await photo('capture_3.jpg');
  await read(); // read
  await read(result('blank_page')); // the form not found: a retake
  expect(thumbs()).toEqual(['Photo 1, read', 'Photo 2, retake', 'Photo 3, reading']);
  // a 16 dp mark on each corner: a brand ring on panel; a panel ✓ on success; a panel ! on warning
  const [read1] = screen.getAllByTestId('mark-read');
  const [retake] = screen.getAllByTestId('mark-problem');
  const [reading] = screen.getAllByTestId('mark-reading');
  expect(reading).toHaveStyle({ width: 16, height: 16, backgroundColor: colors.panel, borderColor: colors.brand });
  expect(read1).toHaveStyle({ width: 16, height: 16, backgroundColor: colors.success });
  expect(retake).toHaveStyle({ width: 16, height: 16, backgroundColor: colors.warning });
  expect(kids(read1)[0].props).toMatchObject({ stroke: colors.panel });
  // the ! is a glyph, drawn as the ✓ is: never text in a fixed box (ruling P-F8)
  expect(kids(retake)).toHaveLength(1);
  expect(kids(retake)[0].type).toBe(kids(read1)[0].type);
  expect(kids(retake)[0].props).toMatchObject({ stroke: colors.panel, width: kids(read1)[0].props.width });
  expect(within(retake).queryByText(/!/)).toBeNull();
  expect(kids(reading)).toHaveLength(0);
});

test('a read that fails is a thumbnail with !, never a dialog', async () => {
  await open();
  await photo('capture_1.jpg');
  await fail(Object.assign(new Error('The scanner was closed'), { code: 'ERR_UNEXPECTED' }));
  expect(alert).not.toHaveBeenCalled();
  expect(thumbs()).toEqual(['Photo 1, retake']);
  expect(currentSession()?.failed.map((f) => f.reason)).toEqual([STOPPED]);
  expect(camera().props.active).toBe(true); // nothing to wait behind
  expect(screen.queryByText(/closed/)).toBeNull();
});

test('Done waits for the queue, saying Reading 2 more…, then opens the session screen', async () => {
  await open();
  await photo('capture_1.jpg');
  await photo('capture_2.jpg');
  await photo('capture_3.jpg');
  const id = sessionId()!;
  await read();
  await press(doneButton());
  expect(currentSession()).toMatchObject({ id, open: false }); // ended: no capture goes in
  expect(doneButton().props.accessibilityLabel).toBe('Reading 2 more…');
  expect(doneButton()).toHaveProp('accessibilityState', expect.objectContaining({ busy: true }));
  expect(thumbs()).toHaveLength(3); // its tray stays while it waits
  expect(mockRouter.navigate).not.toHaveBeenCalled();
  await read();
  expect(doneButton().props.accessibilityLabel).toBe('Reading 1 more…');
  await read();
  expect(mockRouter.navigate.mock.calls).toEqual([[{ pathname: '/sessions/[id]', params: { id } }, { withAnchor: true }]]);
  expect(mockRouter.push).not.toHaveBeenCalled();
  // back on the camera: no session open, the hint in the middle again
  expect(thumbs()).toEqual([]);
  expect(within(screen.getByTestId('session-tray')).getByTestId('status-pill')).toBeTruthy();
});

test("a session of one photo opens that photo's Scan screen", async () => {
  const view = await open();
  await photo('capture_1.jpg');
  const id = sessionId()!;
  await read();
  await press(doneButton());
  await settle();
  const scan = recentScans().find((s) => s.session === id)!;
  expect(mockRouter.push.mock.calls).toEqual([[{ pathname: '/result', params: { id: scan.id, session: id } }]]);
  expect(mockRouter.navigate).not.toHaveBeenCalled();

  // one photo whose read failed has no scan to open: the session screen says why
  await refocus(view); // back from the Scan screen
  await photo('capture_2.jpg');
  const second = sessionId()!;
  expect(second).not.toBe(id); // Done ended the first
  await fail();
  await press(doneButton());
  await settle();
  expect(mockRouter.navigate.mock.calls).toEqual([[{ pathname: '/sessions/[id]', params: { id: second } }, { withAnchor: true }]]);
});

test('Done runs once on a double tap', async () => {
  // Review Focus 5
  const view = await open();
  await photo('capture_1.jpg');
  await photo('capture_2.jpg');
  const id = sessionId()!;
  await act(async () => {
    await fireEvent.press(doneButton());
    await fireEvent.press(doneButton());
  });
  await read();
  await read();
  expect(mockRouter.navigate.mock.calls).toEqual([[{ pathname: '/sessions/[id]', params: { id } }, { withAnchor: true }]]);
  // and with nothing left to read, a double tap still opens one screen
  await refocus(view); // back from the session screen
  await photo('capture_3.jpg');
  await read();
  await photo('capture_4.jpg');
  await read();
  const second = sessionId()!;
  await act(async () => {
    await fireEvent.press(doneButton());
    await fireEvent.press(doneButton());
  });
  await settle();
  expect(mockRouter.navigate.mock.calls).toEqual([
    [{ pathname: '/sessions/[id]', params: { id } }, { withAnchor: true }],
    [{ pathname: '/sessions/[id]', params: { id: second } }, { withAnchor: true }],
  ]);
});

test('leaving keeps the session and the queue; coming back continues it; 30 minutes later it has closed', async () => {
  const view = await open();
  await photo('capture_1.jpg');
  await photo('capture_2.jpg');
  const id = sessionId()!;
  mockFocused = false;
  await act(async () => view.rerender(<CameraScreen />));
  await read(); // the queue keeps reading behind another tab
  expect(currentSession()).toMatchObject({ id, open: true });
  expect(pendingIn(id)).toBe(1);
  jest.setSystemTime(new Date(T.getTime() + 10 * 60 * 1000));
  mockFocused = true;
  await act(async () => view.rerender(<CameraScreen />));
  await photo('capture_3.jpg');
  expect(sessionId()).toBe(id); // it continues
  expect(thumbs()).toEqual(['Photo 1, read', 'Photo 2, reading', 'Photo 3, reading']);
  await read();
  await read();

  // left for 30 minutes: on focus, it has closed; its scans keep its id
  mockFocused = false;
  await act(async () => view.rerender(<CameraScreen />));
  jest.setSystemTime(new Date(T.getTime() + 41 * 60 * 1000));
  mockFocused = true;
  await act(async () => view.rerender(<CameraScreen />));
  expect(currentSession()).toBeNull();
  expect(thumbs()).toEqual([]);
  expect(recentScans().filter((s) => s.session === id)).toHaveLength(3);
  await photo('capture_4.jpg');
  expect(sessionId()).not.toBe(id);

  // and when the app comes back to the foreground, the same
  const listeners: ((state: string) => void)[] = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    listeners.push(listener as (state: string) => void);
    return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
  });
  await act(async () => view.unmount());
  await open();
  await read();
  expect(currentSession()?.open).toBe(true);
  jest.setSystemTime(new Date(T.getTime() + 75 * 60 * 1000));
  await act(async () => listeners.forEach((l) => l('active')));
  expect(currentSession()).toBeNull();
});

test('after a Retake, the next capture replaces that scan, once', async () => {
  await open();
  await photo('capture_1.jpg');
  const id = sessionId()!;
  await read(result('blank_page'));
  const old = recentScans()[0].id;
  // the Scan screen's Retake makes the session the camera's again, with its link (lib/session's retakeIn)
  await act(async () => retakeIn(id, old, new Date()));
  await settle();
  expect(mockRearm).toHaveBeenCalledTimes(1); // Auto takes the sheet in view (ruling T1-1)
  await photo('capture_2.jpg');
  expect(captures().map((c) => c.replaces)).toEqual([old]);
  expect(currentSession()?.replaces).toBeNull(); // spent
  await photo('capture_3.jpg');
  expect(captures().map((c) => c.replaces)).toEqual([old, null]); // once
  await read();
  expect(getScan(old)).toBeUndefined(); // replaced once its new scan was kept
  await read();
  expect(recentScans().filter((s) => s.session === id)).toHaveLength(2);
  expect(mockRearm).toHaveBeenCalledTimes(1); // once per Retake
});

test("a Retake whose capture fails to read keeps the original scan, and shows the failure as !", async () => {
  // The user's check, with the real queue on the memory file system
  await open();
  await photo('capture_1.jpg');
  const id = sessionId()!;
  await read(result('blank_page'));
  const old = recentScans()[0].id;
  await act(async () => retakeIn(id, old, new Date()));
  await photo('capture_2.jpg');
  await fail();
  expect(getScan(old)).toBeDefined();
  expect(recentScans().map((s) => s.id)).toContain(old);
  expect(thumbs()).toEqual(['Photo 1, retake', 'Photo 2, retake']); // the old scan, and the failed read's !
  expect(currentSession()?.failed.map((f) => f.reason)).toEqual([STOPPED]);
  expect(alert).not.toHaveBeenCalled();
});

test('a Retake opens the camera rearmed; a build without rearm never crashes it', async () => {
  // a build from before 54258f9: the forwarder throws at once (native.current.rearm is undefined)
  mockRearm.mockImplementationOnce(() => {
    throw new TypeError('undefined is not a function');
  });
  await open();
  await photo('capture_1.jpg');
  const id = sessionId()!;
  await read();
  await act(async () => retakeIn(id, recentScans()[0].id, new Date()));
  await settle();
  expect(mockRearm).toHaveBeenCalledTimes(1);
  expect(camera().props.active).toBe(true);
  // a rejected one neither
  mockRearm.mockRejectedValueOnce(new Error('no view'));
  await photo('capture_2.jpg');
  await read();
  await act(async () => retakeIn(id, recentScans()[0].id, new Date()));
  await settle();
  expect(mockRearm).toHaveBeenCalledTimes(2);
  expect(camera().props.active).toBe(true);
});

test('a Retake left on another tab rearms only once the camera is on top again', async () => {
  const view = await open();
  await photo('capture_1.jpg');
  const id = sessionId()!;
  await read();
  mockFocused = false;
  await act(async () => view.rerender(<CameraScreen />));
  await act(async () => retakeIn(id, recentScans()[0].id, new Date()));
  expect(mockRearm).not.toHaveBeenCalled();
  mockFocused = true;
  await act(async () => view.rerender(<CameraScreen />));
  expect(mockRearm).toHaveBeenCalledTimes(1);
});

test("the gallery, the camera app and a PDF join the session the same way; a picker that fails, or a file that isn't a PDF, says why in a dialog", async () => {
  mockGetPermission.mockResolvedValue(refused(true));
  mockRequestPermission.mockResolvedValueOnce(refused(true)).mockResolvedValue(granted);
  await open(); // the permission panel, with the camera app's button
  memoryFs.files.set('file:///cache/ImagePicker/g1.jpg', 'jpeg');
  mockLibrary.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///cache/ImagePicker/g1.jpg' }] });
  await press(button('Gallery'));
  await settle();
  const id = sessionId()!;
  memoryFs.files.set('file:///cache/ImagePicker/c1.jpg', 'jpeg');
  mockCameraApp.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///cache/ImagePicker/c1.jpg' }] });
  await press(button(CAMERA_APP));
  await settle();
  mockPick.mockResolvedValueOnce({ canceled: false, result: { uri: 'content://docs/msf%3A54', type: 'application/pdf' } });
  await press(button('Import PDF'));
  await settle();
  expect(captures().map((c) => [c.session, c.kind, c.source])).toEqual([
    [id, 'photo', 'gallery'],
    [id, 'photo', 'camera_app'],
    [id, 'pdf', 'pdf'],
  ]);
  expect(mockRouter.push).not.toHaveBeenCalled();
  await read();
  await read();
  await read();
  expect(recentScans().slice(0, 3).map((s) => s.label)).toEqual(['PDF: si_0001.pdf', 'Camera photo', 'Photo from gallery']);
  expect(alert).not.toHaveBeenCalled();

  // the dialogs stay for picking
  mockLibrary.mockRejectedValueOnce(new Error('picker'));
  await press(button('Gallery'));
  await settle();
  mockCameraApp.mockRejectedValueOnce(new Error('camera app'));
  await press(button(CAMERA_APP));
  await settle();
  mockPick.mockResolvedValueOnce({ canceled: false, result: { uri: 'content://docs/msf%3A55', type: 'image/png' } });
  mockDisplayName.mockResolvedValueOnce('photo.png');
  await press(button('Import PDF'));
  await settle();
  mockPick.mockRejectedValueOnce(new Error('picker'));
  await press(button('Import PDF'));
  await settle();
  expect(dialogWords(alert)).toEqual([
    ["Couldn't open that photo."],
    ["Couldn't open that photo."],
    ['Choose a PDF file.'],
    ["Couldn't open that PDF."],
  ]);
  expect(captures()).toEqual([]); // none of them took anything
});

test('cancelling a picker keeps the open session, its tray and count; with none open, it opens none (ruling P-F9)', async () => {
  await open();
  // with no session open: a cancelled gallery, camera app or PDF opens none
  await press(button('Gallery'));
  await press(button('Import PDF'));
  await settle();
  expect(currentSession()).toBeNull();
  expect(thumbs()).toEqual([]);

  // in an open session: its tray and its count stay as they were
  await photo('capture_1.jpg');
  await photo('capture_2.jpg');
  await read();
  const before = currentSession();
  for (const picker of ['Gallery', 'Import PDF']) {
    await press(button(picker));
    await settle();
  }
  expect(currentSession()).toBe(before); // not even touched
  expect(thumbs()).toEqual(['Photo 1, read', 'Photo 2, reading']);
  expect(doneButton().props.accessibilityLabel).toBe('Done · 2');
  expect(alert).not.toHaveBeenCalled();
});

test("a cancelled pick keeps a Retake's link: the camera app too", async () => {
  mockGetPermission.mockResolvedValue(refused(true));
  mockRequestPermission.mockResolvedValueOnce(refused(true)).mockResolvedValue(granted);
  await open();
  memoryFs.files.set('file:///cache/ImagePicker/g1.jpg', 'jpeg');
  mockLibrary.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///cache/ImagePicker/g1.jpg' }] });
  await press(button('Gallery'));
  await settle();
  const id = sessionId()!;
  await read(result('blank_page'));
  const old = recentScans()[0].id;
  await act(async () => retakeIn(id, old, new Date()));
  for (const cancel of [() => press(button('Gallery')), () => press(button(CAMERA_APP)), () => press(button('Import PDF'))]) {
    await cancel();
    await settle();
    expect(currentSession()).toMatchObject({ id, open: true, replaces: old });
  }
  // the next pick that returns a file spends it
  memoryFs.files.set('file:///cache/ImagePicker/g2.jpg', 'jpeg');
  mockLibrary.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///cache/ImagePicker/g2.jpg' }] });
  await press(button('Gallery'));
  await settle();
  expect(captures().map((c) => c.replaces)).toEqual([old]);
  expect(currentSession()?.replaces).toBeNull();
});

test('auto-capture confirms with one haptic; a shutter photo has none', async () => {
  // jest runs as iOS, so the haptic is the success notification; on Android it's the engine's Confirm from Android 11,
  // and Long_Press below it (haptics.test)
  const haptic = jest.mocked(Haptics.notificationAsync);
  await open();
  await send('status', { status: 'found', form: 'sales_invoice' });
  await photo('auto_1.jpg'); // Auto took it: no shutter press
  expect(haptic.mock.calls).toEqual([[Haptics.NotificationFeedbackType.Success]]);
  // the haptic before the photo joins the queue
  expect(captures()).toHaveLength(1);

  // the shutter took it, with Auto on: none
  await take();
  await photo('shutter_1.jpg');
  expect(captures()).toHaveLength(2);
  expect(haptic).toHaveBeenCalledTimes(1);
  // the press counted for its own photo only: the next one Auto takes confirms again
  await photo('auto_2.jpg');
  expect(haptic).toHaveBeenCalledTimes(2);

  // a capture that failed leaves no press behind either
  await take();
  await send('cameraError', { code: 'capture', message: 'x' });
  await photo('auto_3.jpg');
  expect(haptic).toHaveBeenCalledTimes(3);

  // Manual: the shutter's photos only, so none
  await press(autoSwitch());
  await take();
  await photo('shutter_2.jpg');
  expect(captures()).toHaveLength(5);
  expect(haptic).toHaveBeenCalledTimes(3);
  expect(Haptics.performAndroidHapticsAsync).not.toHaveBeenCalled();
});

test("the status bar is the camera's, light, only while it's on top", async () => {
  // a tab left stays mounted under the others: its light icons would win over the root's dark ones (Review Focus 4).
  // No reading card any more, so no dark icons over it (ruling P-F6)
  const view = await open();
  expect(screen.getByTestId('status-bar').props.statusBar).toEqual({ style: 'light' });
  await photo('capture_1.jpg');
  expect(screen.getByTestId('status-bar').props.statusBar).toEqual({ style: 'light' });
  mockFocused = false;
  await act(async () => view.rerender(<CameraScreen />));
  expect(screen.queryByTestId('status-bar')).toBeNull();
  mockFocused = true;
  await act(async () => view.rerender(<CameraScreen />));
  expect(screen.getByTestId('status-bar').props.statusBar).toEqual({ style: 'light' });
});

test('a photo that arrives after leaving is not queued, and is deleted', async () => {
  const view = await open();
  mockFocused = false;
  await act(async () => view.rerender(<CameraScreen />));
  expect(camera().props.active).toBe(false);
  const uri = await photo('late.jpg');
  expect(memoryFs.files.has(uri)).toBe(false);
  expect(captures()).toEqual([]);
  expect(currentSession()).toBeNull(); // it opened no session (ruling P-F9)
  expect(Haptics.notificationAsync).not.toHaveBeenCalled(); // nothing to confirm: it's thrown away
});

test('the camera stops while the gallery is open, and looks again when it closes', async () => {
  let close: (v: unknown) => void = () => {};
  mockLibrary.mockImplementation(() => new Promise((resolve) => (close = resolve)));
  await open();
  await press(button('Gallery'));
  expect(camera().props.active).toBe(false);
  expect(button('Gallery')).toBeDisabled(); // one picker at a time
  expect(button('Import PDF')).toBeDisabled();
  await act(async () => close({ canceled: true }));
  expect(camera().props.active).toBe(true);
});

test('a photo that arrives while the gallery is open is deleted, not queued', async () => {
  mockLibrary.mockImplementation(() => new Promise(() => {}));
  await open();
  await press(button('Gallery'));
  const uri = await photo('racing.jpg');
  expect(memoryFs.files.has(uri)).toBe(false);
  expect(captures()).toEqual([]);
});

test('the camera stays off behind a dialog until its OK', async () => {
  // a picker's dialog: live behind it, Auto would take another photo (final review, Minor 5)
  await open();
  mockLibrary.mockRejectedValueOnce(new Error('picker'));
  await press(button('Gallery'));
  await settle();
  expect(alert).toHaveBeenCalledTimes(1);
  expect(camera().props.active).toBe(false);
  const [, , buttons, options] = alert.mock.calls[0] as Parameters<typeof Alert.alert>;
  expect(buttons).toEqual([{ text: 'OK', onPress: expect.any(Function) }]);
  expect(options).toEqual({ onDismiss: expect.any(Function) });
  await act(async () => buttons![0].onPress!());
  expect(camera().props.active).toBe(true);
});

test('the development test hook: a sample stands in for the camera, with no permission asked', async () => {
  mockParams = { test: 'inv_0051' };
  mockGetPermission.mockResolvedValue(refused(true));
  await open();
  expect(camera().props.testImage).toBe('file:///bundle/sample.jpg');
  expect(mockRequestPermission).not.toHaveBeenCalled();
  mockParams = { test: 'file:///data/user/0/x/files/svc.jpg' };
  await open();
  expect(camera().props.testImage).toBe('file:///data/user/0/x/files/svc.jpg');
});

test('a camera test image is marked', async () => {
  // a photo the camera took is no test image
  const view = await open();
  await photo('capture_3.jpg');
  await read();
  expect(recentScans()[0]).toMatchObject({ source: 'camera', testImage: false });
  await act(async () => view.unmount());

  // one from the test hook is: it can still be saved, but never becomes training data
  mockParams = { test: 'inv_0007' };
  await open();
  await photo('capture_4.jpg');
  await read();
  const scan = recentScans()[0];
  expect(scan).toMatchObject({ source: 'camera', testImage: true });
  const details = { taxType: 'VAT', account: '4010', terms: 'account', atc: '' } as const;
  await act(async () => saveScan(scan.id, details));
  expect(getScan(scan.id)).toMatchObject({ testImage: true, saved: { details } });
});
