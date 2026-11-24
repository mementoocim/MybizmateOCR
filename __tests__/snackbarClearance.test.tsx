import { router } from 'expo-router';
import { act, fireEvent, renderRouter, screen, within } from 'expo-router/testing-library';

import { clearParties } from '../lib/lists';
import { loadSaved } from '../lib/saved';
import { addScan } from '../lib/scans';
import { updateSettings } from '../lib/settings';
import { currentSnack, dismissSnack } from '../lib/snackbar';
import { bar, space } from '../lib/theme';
import { toast } from '../lib/toast';
import { parseScanResult } from '../modules/scanner/src/parse';
import { coreJson } from '../test-utils/coreJson';
import { memoryFs } from '../test-utils/memoryFs';
import { appRoutes } from '../test-utils/routes';
import { pinToday } from '../test-utils/today';

// Ruling T19-5: the root host's message clears the bottom bar of the screen on top. A bar counts only while its screen
// is focused, so one that mounts on a screen under the top one doesn't move the message. Saved with nothing to export
// has no bar; it gets one when a save, or a customer added, on the Scan screen over it gives it something to export.
// On a tab, the tabs' floating bar is the bar the message clears; on the Scan screen over the tabs, that screen's. The
// app's own layouts (test-utils/routes: app/_layout, with the root host, and the tabs with their bar), Saved and the
// Scan screen as they are; the tabs' screens stand in. jest has no layout: each bar's height is given as Android would
// report it. No insets here.

jest.mock('expo-splash-screen', () => ({ preventAutoHideAsync: jest.fn(async () => {}) }));
jest.mock('../components/BrandSplash', () => ({ BrandSplash: () => null })); // the scanner's start (splash.test)
jest.mock('../modules/scanner', () => ({
  enhance: async (_uri: string, mode: string) => `file:///x/${mode}.img`,
  saveToPictures: jest.fn(),
  scanPhoto: jest.fn(),
  readPdf: jest.fn(),
  displayName: jest.fn(),
  releaseAccess: jest.fn(),
}));
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
}));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: async () => ({ localUri: 'file:///s' }) }) } }));
jest.mock('expo-file-system', () => require('../test-utils/memoryFs').memoryFs.module);
jest.mock('expo-sharing', () => ({ shareAsync: async () => undefined, isAvailableAsync: async () => true }));

const ROUTES = appRoutes({ saved: require('../app/saved'), result: require('../app/result') });

/** The Scan screen's bar's height, and Saved's; and the tabs' floating bar's, as laid out, under its raised button. */
const SCAN_BAR = 80;
const SAVED_BAR = 120;
const TAB_BAR = 72;

type Instance = ReturnType<typeof screen.getByTestId>;
const press = (el: Instance) => act(async () => fireEvent.press(el));
const snackbar = () => screen.getByTestId('snackbar');
/** Every bottom bar mounted, a covered screen's too. */
const bars = () => screen.queryAllByTestId('bottom-bar', { includeHiddenElements: true });
/** The bottom bar with this button: Saved's Export…, the Scan screen's Retake. */
function barWith(button: string): Instance {
  const found = bars().filter((bar) => within(bar).queryByText(button, { includeHiddenElements: true }) !== null);
  expect(found).toHaveLength(1);
  return found[0];
}
/** Android reports the bar's layout: its height, in dp. */
const layout = (button: string, height: number) =>
  act(async () => fireEvent(barWith(button), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 360, height } } }));

/** Saved, with nothing saved and no party from a scan, so no bar; then a camera scan's Scan screen over it. */
async function scanOverEmptySaved(): Promise<string> {
  const id = addScan({ label: 'Camera photo', source: 'camera', result: parseScanResult(coreJson('inv_0007')) });
  await renderRouter(ROUTES, { initialUrl: '/saved' });
  expect(screen.getByText('Nothing saved yet')).toBeOnTheScreen();
  expect(bars()).toEqual([]);
  await act(() => router.push({ pathname: '/result', params: { id } }));
  await layout('Retake', SCAN_BAR);
  return id;
}

test("on a tab, the message clears the floating bar; on the Scan screen over it, that screen's bar", async () => {
  const id = addScan({ label: 'Camera photo', source: 'camera', result: parseScanResult(coreJson('inv_0007')) });
  await renderRouter(ROUTES, { initialUrl: '/camera' });
  // the tabs' bar reports its height, the raised button too
  const tabBar = { nativeEvent: { layout: { x: 0, y: 0, width: 360, height: TAB_BAR } } };
  await act(async () => fireEvent(screen.getByTestId('tab-bar'), 'layout', tabBar));
  await act(async () => toast('Changes saved'));
  expect(snackbar()).toHaveStyle({ bottom: TAB_BAR + bar.raise + space.s });

  // another tab: the same bar
  await act(async () => fireEvent.press(screen.getByRole('tab', { name: 'Home' })));
  expect(snackbar()).toHaveStyle({ bottom: TAB_BAR + bar.raise + space.s });

  // the Scan screen over the tabs: the floating bar is under it, so it no longer counts; the Scan screen's does
  await act(() => router.push({ pathname: '/result', params: { id } }));
  expect(snackbar()).toHaveStyle({ bottom: space.s }); // no bar on top has laid out yet
  await layout('Retake', SCAN_BAR);
  expect(snackbar()).toHaveStyle({ bottom: SCAN_BAR + space.s });

  // back on the tabs, the floating bar again
  await act(() => router.back());
  expect(snackbar()).toHaveStyle({ bottom: TAB_BAR + bar.raise + space.s });
});

beforeAll(() => pinToday(new Date(2026, 10, 18, 10, 0))); // a scan that isn't a sample is checked as of the day it's read
afterAll(() => jest.useRealTimers());

beforeEach(async () => {
  memoryFs.reset();
  await loadSaved(); // nothing saved
  await clearParties('customer');
  await clearParties('supplier');
  await updateSettings({ vatRegistered: null, revenueAccount: '', annotation: false });
  const left = currentSnack(); // a message a test left up, with no host now to take it down
  if (left) dismissSnack(left.id);
});

test("a save on the Scan screen over an empty Saved: the message clears the Scan screen's bar, not Saved's", async () => {
  const id = await scanOverEmptySaved();
  await press(screen.getByTestId('save-open'));
  await press(screen.getByText('Not VAT-registered'));
  await act(async () => fireEvent.changeText(screen.getByLabelText('Revenue account'), '4010'));
  await press(screen.getByTestId('save-confirm'));

  // Saved, under it, has a scan to export now: its bar mounts there, and lays out
  expect(bars()).toHaveLength(2);
  await layout('Export…', SAVED_BAR);
  expect(within(snackbar()).getByText('Saved as a sale')).toBeOnTheScreen();
  expect(snackbar()).toHaveStyle({ bottom: SCAN_BAR + space.s });

  // back on Saved, its bar is the one on top
  await act(() => router.back());
  expect(bars()).toHaveLength(1);
  expect(snackbar()).toHaveStyle({ bottom: SAVED_BAR + space.s });

  // the scan opened again over it: Saved's bar no longer counts, and the Scan screen's does once it has laid out
  await act(() => router.push({ pathname: '/result', params: { id, from: 'saved' } }));
  expect(snackbar()).toHaveStyle({ bottom: space.s }); // no bar on top has laid out yet
  await layout('Retake', SCAN_BAR);
  expect(snackbar()).toHaveStyle({ bottom: SCAN_BAR + space.s });
});

test('a customer added on the Scan screen over an empty Saved: the same', async () => {
  await scanOverEmptySaved();
  await press(screen.getByText('Customer'));
  await press(screen.getByRole('button', { name: /^Add “.+” to your customers$/ }));

  // Saved, under it, can export the new customer now: its bar mounts there, and lays out
  expect(bars()).toHaveLength(2);
  await layout('Export…', SAVED_BAR);
  // the message shows in the sheet (Review Focus 1); once the sheet has gone, in the root host, over the Scan screen
  expect(within(screen.getByTestId('sheet-panel')).getByText('Added to your customers.')).toBeOnTheScreen();
  await press(screen.getByLabelText('Close'));
  expect(screen.queryByTestId('sheet-panel')).toBeNull();
  expect(within(snackbar()).getByText('Added to your customers.')).toBeOnTheScreen();
  expect(snackbar()).toHaveStyle({ bottom: SCAN_BAR + space.s });
});
