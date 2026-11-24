import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { Alert, AppState, Linking, StyleSheet } from 'react-native';

import CameraScreen from '../app/(tabs)/camera';
import { CAMERA_ERRORS, CAMERA_TEXT, PERMISSION_TEXT, statusText } from '../lib/cameraCopy';
import { saveScan } from '../lib/saved';
import { getScan } from '../lib/scans';
import { colors, radius, touch, type } from '../lib/theme';
import { parseScanResult } from '../modules/scanner/src/parse';
import { coreJson } from '../test-utils/coreJson';
import { dialogWords } from '../test-utils/dialogs';
import { typeStylesOf } from '../test-utils/typeStyles';

// Design B §9.3: the camera, a tab (camera first). The preview, its outline, auto-capture and the checks are native.
// Over them, with no title and no Close: the Auto switch and the flashlight switch; the status pill; the gallery (an
// icon over its label) and the shutter, which waits while the camera starts or takes the photo. A problem shows a
// panel in the picture's place. An auto-captured photo gets one confirm haptic (§5.5), then the reading card (§9.4).

let mockFocused = true;
let mockParams: Record<string, string> = {};
let mockTeam = false;
const mockRouter = { push: jest.fn(), replace: jest.fn() };
/** The screen's own navigation: Close goes back with it (lib/navigation's useGoBackOrHome). */
const mockNavigation = { canGoBack: jest.fn(() => true), goBack: jest.fn() };
const mockScanPhoto = jest.fn();
const mockTakePhoto = jest.fn(async () => {});
const mockRearm = jest.fn(async () => {});
const mockGetPermission = jest.fn();
const mockRequestPermission = jest.fn();
const mockLibrary = jest.fn();
const mockDeleted: string[] = [];

jest.mock('expo-router', () => ({
  useNavigation: () => mockNavigation,
  useRouter: () => mockRouter,
  useFocusEffect: (effect: () => void | (() => void)) => require('react').useEffect(effect, []),
  useIsFocused: () => mockFocused,
  useLocalSearchParams: () => mockParams,
}));
// The native camera stands in as a plain view carrying its props; its ref carries takePhoto and rearm.
jest.mock('../modules/scanner', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    scanPhoto: (uri: string, options: object) => mockScanPhoto(uri, options),
    ScannerCameraView: React.forwardRef(function MockCamera(props: object, ref: unknown) {
      React.useImperativeHandle(ref, () => ({ takePhoto: mockTakePhoto, rearm: mockRearm }));
      return React.createElement(View, { testID: 'camera', ...props });
    }),
  };
});
jest.mock('expo-image-picker', () => ({
  getCameraPermissionsAsync: () => mockGetPermission(),
  requestCameraPermissionsAsync: () => mockRequestPermission(),
  launchCameraAsync: jest.fn(async () => ({ canceled: true })),
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
jest.mock('expo-file-system', () => ({
  File: class {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = parts.map(String).join('/');
    }
    get exists() {
      return false;
    }
    async write() {}
    async move() {}
    async text() {
      return '';
    }
    delete() {
      mockDeleted.push(this.uri);
    }
  },
  Directory: class {
    get exists() {
      return true;
    }
  },
  Paths: { document: {} },
}));

const granted = { granted: true, canAskAgain: true, status: 'granted' };
const refused = (canAskAgain: boolean) => ({ granted: false, canAskAgain, status: 'denied' });

let alert: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  mockFocused = true;
  mockParams = {};
  mockTeam = false;
  mockNavigation.canGoBack.mockReturnValue(true); // a screen under this one, as when Home opened it
  mockDeleted.length = 0;
  mockGetPermission.mockResolvedValue(granted);
  mockRequestPermission.mockResolvedValue(granted);
  mockLibrary.mockResolvedValue({ canceled: true });
  mockScanPhoto.mockResolvedValue(parseScanResult(coreJson('inv_0007')));
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

const camera = () => screen.getByTestId('camera');
const send = (event: string, nativeEvent: object) => act(async () => fireEvent(camera(), event, { nativeEvent }));
const press = (el: Parameters<typeof fireEvent.press>[0]) => act(async () => fireEvent.press(el));
const button = (name: string) => screen.getByRole('button', { name });
const header = (name: string) => screen.getByRole('header', { name });
const autoSwitch = () => screen.getByRole('switch', { name: 'Auto capture' });
const shutter = () => button('Take the photo');
type Instance = ReturnType<typeof screen.getByRole>;
/** A host element's host children, in order (an icon's Svg, a Text, a View). */
const kids = (el: Instance) => el.children.filter((child): child is Instance => typeof child !== 'string');
const CAMERA_APP = "Use the phone's camera app instead";

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
  expect(button('Gallery')).toBeTruthy(); // the bottom band's gallery stays
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
    jest.useRealTimers();
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

test('the shutter is disabled while the camera starts', async () => {
  await open();
  expect(shutter()).toBeDisabled(); // starting
  await press(shutter());
  expect(mockTakePhoto).not.toHaveBeenCalled();
  // 72 dp: a 3 dp brand ring around a white disc
  expect(shutter()).toHaveStyle({
    width: touch.shutter,
    height: touch.shutter,
    borderRadius: touch.shutter / 2,
    borderWidth: 3,
    borderColor: colors.brand,
  });
  expect(screen.getByTestId('shutter-disc')).toHaveStyle({ backgroundColor: colors.cameraText });

  await send('status', { status: 'looking', form: null });
  expect(shutter()).toBeEnabled();
  await send('status', { status: 'capturing', form: 'sales_invoice' });
  expect(shutter()).toBeDisabled(); // taking the photo
  await send('status', { status: 'found', form: 'sales_invoice' });
  expect(shutter()).toBeEnabled();

  // and while the gallery is open
  mockLibrary.mockImplementation(() => new Promise(() => {}));
  await press(button('Gallery'));
  expect(shutter()).toBeDisabled();
});

test("a start failure: The camera couldn't start and Try again; the raw message only in team builds", async () => {
  await open();
  await send('cameraError', { code: 'start', message: 'boom' });
  expect(header(CAMERA_TEXT.startTitle)).toHaveStyle({ ...type.headline, color: colors.cameraText });
  expect(screen.queryByText(/boom/)).toBeNull(); // a client never sees the raw message
  expect(button(CAMERA_APP)).toBeTruthy();
  expect(button('Gallery')).toBeTruthy();
  expect(screen.queryByTestId('camera')).toBeNull();
  expect(screen.queryByLabelText('Take the photo')).toBeNull();
  await press(button('Try again'));
  expect(camera().props.active).toBe(true);
  expect(screen.queryByRole('header', { name: CAMERA_TEXT.startTitle })).toBeNull();
  expect(shutter()).toBeDisabled(); // the new camera starts again

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
  expect(screen.queryByLabelText('Take the photo')).toBeNull();
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
  expect(screen.queryByLabelText('Take the photo')).toBeNull();

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
});

test('shutter', async () => {
  await open();
  await send('status', { status: 'looking', form: null });
  await press(shutter());
  expect(mockTakePhoto).toHaveBeenCalled();
});

test('the gallery: an icon over its label', async () => {
  await open();
  const gallery = button('Gallery');
  const [icon, label] = kids(gallery);
  expect(icon.props).toMatchObject({ width: touch.icon, stroke: colors.cameraText });
  expect(label).toBe(within(gallery).getByText('Gallery'));
  expect(label).toHaveStyle({ ...type.label, color: colors.cameraMute });
  expect(StyleSheet.flatten(gallery.props.style).flexDirection ?? 'column').toBe('column');
  expect(gallery).toHaveStyle({ minWidth: touch.target, minHeight: touch.target });
});

test("a photo that can't be read: the camera stays off behind the dialog until its OK (final review, Minor 5)", async () => {
  // Live behind it, Auto would take another photo, and stack another dialog on it
  const failure = Object.assign(new Error('The scanner was closed'), { code: 'ERR_UNEXPECTED' });
  mockScanPhoto.mockRejectedValueOnce(failure);
  await open();
  await send('photo', { uri: 'file:///cache/camera/capture_4.jpg' });
  expect(alert).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('Reading…')).toBeNull(); // the read is over
  expect(camera().props.active).toBe(false);
  // one OK, as Android's own dialog has, which the camera waits for, or the dialog's dismissal
  const [, , buttons, options] = alert.mock.calls[0] as Parameters<typeof Alert.alert>;
  expect(buttons).toEqual([{ text: 'OK', onPress: expect.any(Function) }]);
  expect(options).toEqual({ onDismiss: expect.any(Function) });
  await act(async () => buttons![0].onPress!());
  expect(camera().props.active).toBe(true);

  // dismissed, where the dialog allows it: the same
  mockScanPhoto.mockRejectedValueOnce(failure);
  await send('photo', { uri: 'file:///cache/camera/capture_5.jpg' });
  expect(camera().props.active).toBe(false);
  await act(async () => (alert.mock.calls[1] as Parameters<typeof Alert.alert>)[3]!.onDismiss!());
  expect(camera().props.active).toBe(true);
});

test('a photo is read', async () => {
  let finish: (v: unknown) => void = () => {};
  mockScanPhoto.mockImplementation(() => new Promise((resolve) => (finish = resolve)));
  await open();
  expect(camera().props.active).toBe(true);
  await send('photo', { uri: 'file:///cache/camera/capture_1.jpg' });
  expect(mockScanPhoto).toHaveBeenCalledWith('file:///cache/camera/capture_1.jpg', { deletePhoto: true });
  expect(camera().props.active).toBe(false);
  expect(screen.getByText('Reading…')).toBeTruthy();
  expect(screen.getByText('Straightening the photo and reading every box')).toBeTruthy();
  await act(async () => finish(parseScanResult(coreJson('inv_0007'))));
  expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/result', params: { id: expect.any(String) } });
});

test('a photo opens its Scan screen over the tabs', async () => {
  // pushed, not in the camera's place: the camera is a tab under it, and Back from the Scan screen comes back to it
  await open();
  await send('photo', { uri: 'file:///cache/camera/capture_6.jpg' });
  expect(mockRouter.push.mock.calls).toEqual([[{ pathname: '/result', params: { id: expect.any(String) } }]]);
  // and so does a photo from the gallery
  mockLibrary.mockResolvedValue({ canceled: false, assets: [{ uri: 'content://media/1' }] });
  await press(button('Gallery'));
  expect(mockRouter.push).toHaveBeenCalledTimes(2);
  expect(mockRouter.replace).not.toHaveBeenCalled();
});

test("light status icons on the camera, dark over the reading card's light wash, then light again", async () => {
  // design §8: dark icons on light screens. The camera's are light, but the reading card's wash is paper at 86%, where
  // white icons measured 1.44:1 (QA pass 1); once the card goes, the camera's light icons come back.
  let finish: (v: unknown) => void = () => {};
  mockScanPhoto.mockImplementation(() => new Promise((resolve) => (finish = resolve)));
  const statusBar = () => screen.getByTestId('status-bar').props.statusBar;
  await open();
  expect(statusBar()).toEqual({ style: 'light' });
  await send('photo', { uri: 'file:///cache/camera/capture_3.jpg' });
  expect(screen.getByLabelText('Reading')).toBeTruthy();
  expect(statusBar()).toEqual({ style: 'dark' });
  await act(async () => finish(parseScanResult(coreJson('inv_0007'))));
  expect(screen.queryByLabelText('Reading')).toBeNull();
  expect(statusBar()).toEqual({ style: 'light' });
});

test("the status bar is the camera's only while it's on top", async () => {
  // a tab left stays mounted under the others: its light icons would win over the root's dark ones (Review Focus 4)
  const view = await open();
  expect(screen.getByTestId('status-bar').props.statusBar).toEqual({ style: 'light' });
  mockFocused = false;
  await act(async () => view.rerender(<CameraScreen />));
  expect(screen.queryByTestId('status-bar')).toBeNull();
  mockFocused = true;
  await act(async () => view.rerender(<CameraScreen />));
  expect(screen.getByTestId('status-bar').props.statusBar).toEqual({ style: 'light' });
});

test('auto-capture confirms with one haptic; a shutter photo has none', async () => {
  // jest runs as iOS, so the haptic is the success notification; on Android it's the engine's Confirm from Android 11,
  // and Long_Press below it (haptics.test)
  const haptic = jest.mocked(Haptics.notificationAsync);
  let cardUp: boolean | null = null; // whether the reading card showed as the haptic came
  haptic.mockImplementationOnce(async () => {
    cardUp = screen.queryByText('Reading…') !== null;
  });
  await open();
  await send('status', { status: 'found', form: 'sales_invoice' });
  await send('photo', { uri: 'file:///cache/camera/auto_1.jpg' }); // Auto took it: no shutter press
  expect(haptic.mock.calls).toEqual([[Haptics.NotificationFeedbackType.Success]]);
  // the haptic, then the reading card: it comes before the read starts
  expect(cardUp).toBe(false);
  expect(haptic.mock.invocationCallOrder[0]).toBeLessThan(mockScanPhoto.mock.invocationCallOrder[0]);

  // the shutter took it, with Auto on: none
  await press(shutter());
  await send('photo', { uri: 'file:///cache/camera/shutter_1.jpg' });
  expect(mockScanPhoto).toHaveBeenCalledTimes(2);
  expect(haptic).toHaveBeenCalledTimes(1);
  // the press counted for its own photo only: the next one Auto takes confirms again
  await send('photo', { uri: 'file:///cache/camera/auto_2.jpg' });
  expect(haptic).toHaveBeenCalledTimes(2);

  // a capture that failed leaves no press behind either
  await press(shutter());
  await send('cameraError', { code: 'capture', message: 'x' });
  await send('photo', { uri: 'file:///cache/camera/auto_3.jpg' });
  expect(haptic).toHaveBeenCalledTimes(3);

  // Manual: the shutter's photos only, so none
  await press(autoSwitch());
  await press(shutter());
  await send('photo', { uri: 'file:///cache/camera/shutter_2.jpg' });
  expect(mockScanPhoto).toHaveBeenCalledTimes(5);
  expect(haptic).toHaveBeenCalledTimes(3);
  expect(Haptics.performAndroidHapticsAsync).not.toHaveBeenCalled();
});

test('a photo that arrives after leaving is not scanned, and is deleted', async () => {
  const view = await open();
  mockFocused = false;
  await act(async () => view.rerender(<CameraScreen />));
  expect(camera().props.active).toBe(false);
  await send('photo', { uri: 'file:///cache/camera/late.jpg' });
  expect(mockScanPhoto).not.toHaveBeenCalled();
  expect(mockDeleted).toEqual(['file:///cache/camera/late.jpg']);
  expect(Haptics.notificationAsync).not.toHaveBeenCalled(); // nothing to confirm: it's thrown away
});

test("leaving while a photo is read keeps the scan but doesn't open its result", async () => {
  let finish: (v: unknown) => void = () => {};
  mockScanPhoto.mockImplementation(() => new Promise((resolve) => (finish = resolve)));
  const view = await open();
  await send('photo', { uri: 'file:///cache/camera/capture_2.jpg' });
  await act(async () => view.unmount()); // back, while it reads
  await act(async () => finish(parseScanResult(coreJson('inv_0007'))));
  expect(mockRouter.replace).not.toHaveBeenCalled();
  expect(mockRouter.push).not.toHaveBeenCalled();
});

test('the camera stops while the gallery is open, and looks again when it closes', async () => {
  let close: (v: unknown) => void = () => {};
  mockLibrary.mockImplementation(() => new Promise((resolve) => (close = resolve)));
  await open();
  await press(button('Gallery'));
  expect(camera().props.active).toBe(false);
  await act(async () => close({ canceled: true }));
  expect(camera().props.active).toBe(true);
});

test('a photo that arrives while the gallery is open is deleted, not read', async () => {
  mockLibrary.mockImplementation(() => new Promise(() => {}));
  await open();
  await press(button('Gallery'));
  await send('photo', { uri: 'file:///cache/camera/racing.jpg' });
  expect(mockScanPhoto).not.toHaveBeenCalled();
  expect(mockDeleted).toEqual(['file:///cache/camera/racing.jpg']);
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
  const opened = () => getScan(mockRouter.push.mock.calls.at(-1)![0].params.id)!;
  // a photo the camera took is no test image
  await open();
  await send('photo', { uri: 'file:///cache/camera/capture_3.jpg' });
  expect(opened()).toMatchObject({ source: 'camera', testImage: false });

  // one from the test hook is: it can still be saved, but never becomes training data
  mockParams = { test: 'inv_0007' };
  await open();
  await send('photo', { uri: 'file:///cache/camera/capture_4.jpg' });
  const scan = opened();
  expect(scan).toMatchObject({ source: 'camera', testImage: true });
  const details = { taxType: 'VAT', account: '4010', terms: 'account', atc: '' } as const;
  await act(async () => saveScan(scan.id, details));
  expect(getScan(scan.id)).toMatchObject({ testImage: true, saved: { details } });
});
