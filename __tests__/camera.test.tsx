import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AppState, Linking } from 'react-native';

import CameraScreen from '../app/camera';
import { CAMERA_ERRORS, statusText } from '../lib/cameraCopy';
import { parseScanResult } from '../modules/scanner/src/parse';
import { coreJson } from '../test-utils/coreJson';

let mockFocused = true;
let mockParams: Record<string, string> = {};
const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
const mockScanPhoto = jest.fn();
const mockTakePhoto = jest.fn(async () => {});
const mockToast = jest.fn();
const mockGetPermission = jest.fn();
const mockRequestPermission = jest.fn();
const mockDeleted: string[] = [];

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useFocusEffect: (effect: () => void | (() => void)) => require('react').useEffect(effect, []),
  useIsFocused: () => mockFocused,
  useLocalSearchParams: () => mockParams,
}));
// The native camera stands in as a plain view carrying its props; its ref carries takePhoto.
jest.mock('../modules/scanner', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    scanPhoto: (uri: string, options: object) => mockScanPhoto(uri, options),
    ScannerCameraView: React.forwardRef(function MockCamera(props: object, ref: unknown) {
      React.useImperativeHandle(ref, () => ({ takePhoto: mockTakePhoto }));
      return React.createElement(View, { testID: 'camera', ...props });
    }),
  };
});
jest.mock('expo-image-picker', () => ({
  getCameraPermissionsAsync: () => mockGetPermission(),
  requestCameraPermissionsAsync: () => mockRequestPermission(),
  launchCameraAsync: jest.fn(async () => ({ canceled: true })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true })),
}));
jest.mock('../lib/toast', () => ({ toast: (message: string) => mockToast(message) }));
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

beforeEach(() => {
  jest.clearAllMocks();
  mockFocused = true;
  mockParams = {};
  mockDeleted.length = 0;
  mockGetPermission.mockResolvedValue(granted);
  mockRequestPermission.mockResolvedValue(granted);
  mockScanPhoto.mockResolvedValue(parseScanResult(coreJson('inv_0007')));
});

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

test('status copy', async () => {
  expect(statusText('starting', null)).toBe('Starting the camera…');
  expect(statusText('looking', null)).toBe('Looking for the form…');
  expect(statusText('holding', 'service_invoice')).toBe('Service Invoice · hold still');
  expect(statusText('blurry', 'sales_invoice')).toBe('MyBizMate Sales Invoice · blurry, hold still');
  expect(statusText('found', 'sales_invoice')).toBe('MyBizMate Sales Invoice found · tap the button');
  expect(statusText('capturing', 'service_invoice')).toBe('Taking the photo…');

  await open();
  expect(screen.getByText('Starting the camera…')).toBeTruthy();
  await send('status', { status: 'holding', form: 'service_invoice' });
  expect(screen.getByText('Service Invoice · hold still')).toBeTruthy();
});

test('errors', async () => {
  expect(CAMERA_ERRORS.start('boom')).toBe("The camera couldn't start: boom");
  expect(CAMERA_ERRORS.start()).toBe("The camera couldn't start.");
  expect(CAMERA_ERRORS.start('')).toBe("The camera couldn't start.");

  await open();
  await send('cameraError', { code: 'capture', message: 'x' });
  expect(screen.getByText("Couldn't take the photo. Try the button again.")).toBeTruthy();
  await send('cameraError', { code: 'keep', message: 'x' });
  expect(screen.getByText("Couldn't keep the photo. Try again.")).toBeTruthy();

  await send('cameraError', { code: 'no_camera', message: '' });
  expect(screen.getByText('This phone has no camera the scanner can use.')).toBeTruthy();
  expect(screen.getByText('Choose from gallery')).toBeTruthy();
  expect(screen.queryByText('Allow the camera')).toBeNull();
  expect(screen.queryByTestId('camera')).toBeNull();
});

test('a camera that fails to start can be tried again', async () => {
  await open();
  await send('cameraError', { code: 'start', message: 'boom' });
  expect(screen.getByText("The camera couldn't start: boom")).toBeTruthy();
  expect(screen.getByText("Use the phone's camera app instead")).toBeTruthy();
  expect(screen.queryByTestId('camera')).toBeNull();
  await act(async () => fireEvent.press(screen.getByText('Try again')));
  expect(camera().props.active).toBe(true);
  expect(screen.queryByText("The camera couldn't start: boom")).toBeNull();
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

test('permission can be asked again', async () => {
  mockGetPermission.mockResolvedValue(refused(true));
  mockRequestPermission.mockResolvedValue(refused(true));
  await open();
  expect(mockRequestPermission).toHaveBeenCalledTimes(1); // asked once, on focus
  expect(
    screen.getByText('The scanner needs the camera to see the invoice. Nothing it sees leaves the phone.'),
  ).toBeTruthy();
  expect(screen.queryByTestId('camera')).toBeNull();
  expect(screen.queryByLabelText('Take the photo')).toBeNull();

  mockRequestPermission.mockResolvedValue(granted);
  await act(async () => fireEvent.press(screen.getByText('Allow the camera')));
  await settle();
  expect(mockRequestPermission).toHaveBeenCalledTimes(2);
  expect(camera().props.active).toBe(true);
});

test('permission refused for good', async () => {
  mockGetPermission.mockResolvedValue(refused(false));
  const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
  await open();
  expect(mockRequestPermission).not.toHaveBeenCalled();
  await act(async () => fireEvent.press(screen.getByText('Allow the camera')));
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
  await act(async () => fireEvent.press(screen.getByText("Use the phone's camera app instead")));
  await settle();
  expect(mockToast).toHaveBeenCalledWith(
    'The camera app needs the camera permission too. Choose a photo from the gallery instead.',
  );
});

test('torch', async () => {
  await open();
  expect(screen.queryByLabelText('Turn the flashlight on')).toBeNull();
  await send('ready', { hasTorch: true });
  expect(camera().props.torch).toBe(false);
  await act(async () => fireEvent.press(screen.getByLabelText('Turn the flashlight on')));
  expect(camera().props.torch).toBe(true);
  expect(screen.getByLabelText('Turn the flashlight off')).toBeTruthy();
});

test('auto and manual', async () => {
  await open();
  expect(camera().props.auto).toBe(true);
  await act(async () => fireEvent.press(screen.getByText('Auto')));
  expect(screen.getByText('Manual')).toBeTruthy();
  expect(camera().props.auto).toBe(false);
});

test('shutter', async () => {
  await open();
  await act(async () => fireEvent.press(screen.getByLabelText('Take the photo')));
  expect(mockTakePhoto).toHaveBeenCalled();
});

test('a photo is read', async () => {
  let finish: (v: unknown) => void = () => {};
  mockScanPhoto.mockImplementation(() => new Promise((resolve) => (finish = resolve)));
  await open();
  expect(camera().props.active).toBe(true);
  await send('photo', { uri: 'file:///cache/camera/capture_1.jpg' });
  expect(mockScanPhoto).toHaveBeenCalledWith('file:///cache/camera/capture_1.jpg', { deletePhoto: true });
  expect(camera().props.active).toBe(false);
  expect(screen.getByText('Reading the invoice…')).toBeTruthy();
  await act(async () => finish(parseScanResult(coreJson('inv_0007'))));
  expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/result', params: { id: expect.any(String) } });
});

test('a photo that arrives after leaving is not scanned, and is deleted', async () => {
  const view = await open();
  mockFocused = false;
  await act(async () => view.rerender(<CameraScreen />));
  expect(camera().props.active).toBe(false);
  await send('photo', { uri: 'file:///cache/camera/late.jpg' });
  expect(mockScanPhoto).not.toHaveBeenCalled();
  expect(mockDeleted).toEqual(['file:///cache/camera/late.jpg']);
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
