import { router } from 'expo-router';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import { saveScan } from '../lib/saved';
import { recentScans } from '../lib/scans';
import { currentSession, loadSession } from '../lib/session';
import { CAPTURE_GRACE_MS, currentShutter } from '../lib/shutter';
import type { ScanResult } from '../modules/scanner';
import { parseScanResult } from '../modules/scanner/src/parse';
import { coreJson } from '../test-utils/coreJson';
import { memoryFs } from '../test-utils/memoryFs';
import { appRoutes } from '../test-utils/routes';

// Camera first (spec §6.3 and §6.4): the camera tab, in the app's own layouts and bar, keeps shooting into a session,
// and Done opens that session's screen in the Sessions tab, with the bar. The bar's middle button is the camera's
// shutter while it's on top, and Camera on another tab. The real session store and queue, on a memory file system;
// the scanner's reads are deferred promises; the other screens stand in. The global router is the test's, never the
// app's.

jest.setTimeout(15000); // the whole app's router, with its reads: slow under a full run's load (ruling T7-5)

type Read = { resolve: (r: ScanResult) => void };
const mockReads: Read[] = [];
const mockTakePhoto = jest.fn(async () => {});

jest.mock('expo-splash-screen', () => ({ preventAutoHideAsync: jest.fn(async () => {}) }));
// the scanner's start (splash.test): ready after the root's first effects, so the app has started
jest.mock('../components/BrandSplash', () => ({
  BrandSplash: ({ onReady }: { onReady: () => void }) => {
    require('react').useEffect(() => void Promise.resolve().then(onReady), [onReady]);
    return null;
  },
}));
// the queue is the real one; what a last run left is captureQueue.test's
jest.mock('../lib/captureQueue', () => ({ ...jest.requireActual('../lib/captureQueue'), resumeQueue: async () => {} }));
jest.mock('expo-status-bar', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    ...jest.requireActual('expo-status-bar'), // expo-router's own hooks
    StatusBar: ({ style }: { style: string }) => React.createElement(View, { testID: 'status-bar', statusStyle: style }),
  };
});
jest.mock('../modules/scanner', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    scanPhoto: () => new Promise((resolve) => mockReads.push({ resolve })),
    readPdf: jest.fn(),
    releaseAccess: async () => undefined,
    displayName: async () => null,
    ScannerCameraView: React.forwardRef(function MockCamera(props: object, ref: unknown) {
      React.useImperativeHandle(ref, () => ({ takePhoto: mockTakePhoto, rearm: async () => {} }));
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

const settle = async () => {
  for (let i = 0; i < 10; i++) await act(async () => {});
};
const tab = (name: string) => screen.getByRole('tab', { name });
const onTop = () => screen.getAllByText(/: on top$/).map((line) => line.props.children);
const camera = () => screen.getByTestId('camera', { includeHiddenElements: true });
const send = (event: string, nativeEvent: object) => act(async () => fireEvent(camera(), event, { nativeEvent }));

let photos = 0;
/** The bar's middle button takes a photo, and the camera hands it over. */
async function shoot() {
  await act(async () => fireEvent.press(tab('Take photo')));
  expect(mockTakePhoto).toHaveBeenCalledTimes(++photos);
  const uri = `file:///cache/camera/capture_${photos}.jpg`;
  memoryFs.files.set(uri, 'jpeg');
  await send('photo', { uri });
  await settle();
}
/** Done's grace for a photo on its way (lib/shutter) passes, on renderRouter's fake timers. */
async function grace() {
  await act(async () => jest.advanceTimersByTime(CAPTURE_GRACE_MS));
  await settle();
}
async function read() {
  await act(async () => mockReads.shift()!.resolve(parseScanResult(coreJson('inv_0007', `file:///docs/scans/${photos}`))));
  await settle();
}

test('Done opens the session screen in the Sessions tab, with the bar; Back goes to Sessions, then the camera', async () => {
  memoryFs.reset();
  await renderRouter(appRoutes({ '(tabs)/camera': require('../app/(tabs)/camera').default }), {
    initialUrl: '/camera',
  });
  await settle();
  await send('status', { status: 'looking', form: null });
  // the bar's middle button is the shutter; the camera's own round shutter is gone
  expect(tab('Take photo')).toBeEnabled();
  expect(screen.queryByLabelText('Take the photo')).toBeNull();
  await shoot();
  await shoot();
  const id = currentSession()!.id;
  expect(screen.getAllByLabelText(/^Photo \d, reading$/)).toHaveLength(2);

  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Done · 2' })));
  expect(screen.getByRole('button', { name: 'Reading 2 more…' })).toBeTruthy();
  await read();
  await read();
  await grace();
  expect(screen).toHavePathname(`/sessions/${id}`);
  expect(onTop()).toEqual(['Session: on top']);
  expect(screen.getByTestId('tab-bar')).toBeOnTheScreen();
  expect(tab('Sessions')).toBeSelected();
  // on another tab, the middle button is Camera again, and the camera's shutter has gone
  expect(tab('Camera')).toBeEnabled();
  expect(currentShutter()).toBeNull();
  expect(camera().props.active).toBe(false);

  await act(() => router.back());
  expect(screen).toHavePathname('/sessions');
  expect(onTop()).toEqual(['Sessions: on top']);
  await act(() => router.back());
  expect(screen).toHavePathname('/camera');
  expect(router.canGoBack()).toBe(false);
  // back on the camera: the session has ended, so the tray holds the hint again, and the next photo starts another
  await settle();
  expect(screen.queryAllByLabelText(/^Photo \d/)).toHaveLength(0);
  expect(tab('Take photo')).toBeEnabled();
  await shoot();
  expect(currentSession()!.id).not.toBe(id);
});

test("Done on a second session, with the first one's screen left in Sessions, shows the second; Back goes to Sessions, then the camera", async () => {
  // ruling T7-6: the Sessions tab keeps its own Stack, which still holds session A's screen
  await act(async () => mockReads.splice(0).forEach((r) => r.resolve(parseScanResult(coreJson('inv_0007', null)))));
  await act(() => loadSession()); // the last test's session closes, as a new start closes it
  memoryFs.reset();
  photos = 0;
  mockTakePhoto.mockClear();
  await renderRouter(appRoutes({ '(tabs)/camera': require('../app/(tabs)/camera').default }), {
    initialUrl: '/camera',
  });
  await settle();
  await send('status', { status: 'looking', form: null });
  await shoot();
  await shoot();
  const a = currentSession()!.id;
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Done · 2' })));
  await read();
  await read();
  await grace();
  expect(screen).toHavePathname(`/sessions/${a}`);

  // back to the camera by its tab, session A's screen still in the Sessions tab
  await act(async () => fireEvent.press(tab('Camera')));
  await settle();
  expect(screen).toHavePathname('/camera');
  await send('status', { status: 'looking', form: null });
  await shoot();
  await shoot();
  const b = currentSession()!.id;
  expect(b).not.toBe(a);
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Done · 2' })));
  await read();
  await read();
  await grace();
  expect(screen).toHavePathname(`/sessions/${b}`);
  expect(onTop()).toEqual(['Session: on top']);
  expect(tab('Sessions')).toBeSelected();

  await act(() => router.back());
  expect(screen).toHavePathname('/sessions');
  expect(onTop()).toEqual(['Sessions: on top']);
  await act(() => router.back());
  expect(screen).toHavePathname('/camera');
  expect(router.canGoBack()).toBe(false);
});

test('Back to session lands on the session screen in the Sessions tab, with nothing above it', async () => {
  // Done's one photo opens its Scan screen, in the session (the plan's call 16); once it's saved, the last one left,
  // Back to session goes down to that session's screen, with Sessions under it, and the Scan screen gone
  await act(async () => mockReads.splice(0).forEach((r) => r.resolve(parseScanResult(coreJson('inv_0007', null)))));
  await act(() => loadSession());
  memoryFs.reset();
  photos = 0;
  mockTakePhoto.mockClear();
  await renderRouter(
    appRoutes({ '(tabs)/camera': require('../app/(tabs)/camera').default, result: require('../app/result').default }),
    { initialUrl: '/camera' },
  );
  await settle();
  await send('status', { status: 'looking', form: null });
  await shoot();
  const id = currentSession()!.id;
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Done · 1' })));
  await read();
  await grace();
  expect(screen).toHavePathname('/result');
  const scan = recentScans().find((s) => s.session === id)!;
  expect(screen).toHaveSearchParams({ id: scan.id, session: id });

  await act(async () => saveScan(scan.id, { taxType: 'VAT', account: '4010', terms: 'account', atc: '' }));
  await settle();
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Back to session' })));
  await settle();
  expect(screen).toHavePathname(`/sessions/${id}`);
  expect(onTop()).toEqual(['Session: on top']);
  expect(tab('Sessions')).toBeSelected();
  expect(screen.queryByRole('button', { name: 'Back to session' })).toBeNull(); // the Scan screen has gone

  await act(() => router.back());
  expect(screen).toHavePathname('/sessions');
  expect(onTop()).toEqual(['Sessions: on top']);
  await act(() => router.back());
  expect(screen).toHavePathname('/camera');
  expect(router.canGoBack()).toBe(false);
});
