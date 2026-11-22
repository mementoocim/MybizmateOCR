import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { PhotoThumb, PhotoViewer } from '../components/PhotoViewer';
import { SnackbarHost } from '../components/Snackbar';
import { currentSnack, dismissSnack } from '../lib/snackbar';
import { colors, radius, space, touch } from '../lib/theme';
import { toast } from '../lib/toast';
import { parseScanResult } from '../modules/scanner/src/parse';
import { coreJson } from '../test-utils/coreJson';

// Design B §5.5, §7, §8 and §9.5: the photo's thumbnail in the Scan screen's header, and the full-screen viewer it
// opens. The viewer is edge to edge on the viewer fill, with light status-bar icons and no motion of its own: Close
// and the title "Photo", a dark choice of Enhanced, B&W and Original (each made once), and Save to Pictures for
// Enhanced and B&W, confirmed by a snackbar inside the viewer, never behind it (Review Focus 1). The snackbar is the
// real one, and the phone recommends the very time it's asked about (test-utils/jestSetup). This file's insets: 24 dp
// at the top, 34 at the bottom.

const mockEnhance = jest.fn(async (_uri: string, mode: string) => `file:///x/${mode}.img`);
const mockSave = jest.fn();
jest.mock('../modules/scanner', () => ({
  enhance: (uri: string, mode: string) => mockEnhance(uri, mode),
  saveToPictures: (uri: string) => mockSave(uri),
}));
// expo-status-bar's StatusBar stands in as a plain view carrying its props.
jest.mock('expo-status-bar', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { StatusBar: (props: object) => React.createElement(View, { testID: 'status-bar', statusBar: props }) };
});

const TOP = 24;
const BOTTOM = 34;
const noop = () => {};

function Insets({ children }: { children?: ReactNode }) {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 360, height: 800 },
        insets: { top: TOP, bottom: BOTTOM, left: 0, right: 0 },
      }}>
      {children}
    </SafeAreaProvider>
  );
}
const show = (ui: ReactElement) => render(ui, { wrapper: Insets });

const FOUND = parseScanResult(coreJson('inv_0007')); // the form found: its straightened page, and the photo
const NOT_FOUND = parseScanResult(coreJson('blank_page')); // only the photo
const NO_FILES = parseScanResult(coreJson('inv_0007', null)); // a scan that kept no files
const ENHANCED = 'file:///x/enhanced.img';
const BW = 'file:///x/bw.img';
const SAVED = 'Saved to Pictures › MyBizMate Scan';

const viewer = () => screen.getByTestId('photo-viewer');
const image = () => screen.getByTestId('scan-image');
const radio = (name: string) => screen.getByRole('radio', { name });
const saveButton = () => screen.getByRole('button', { name: 'Save to Pictures' });
/** Android's back: the Modal's onRequestClose. */
const systemBack = () => act(async () => viewer().props.onRequestClose());
/** Android reports a view's layout: its height, in dp. */
const layout = (testID: string, height: number) =>
  fireEvent(screen.getByTestId(testID), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 360, height } } });

beforeEach(() => {
  mockEnhance.mockReset().mockImplementation(async (_uri, mode) => `file:///x/${mode}.img`);
  mockSave.mockReset().mockResolvedValue('scan_1.jpg');
  const left = currentSnack(); // one a test left up: no host is mounted now to show it
  if (left) dismissSnack(left.id);
});

test('the thumbnail shows the page and opens the viewer', async () => {
  const onPress = jest.fn();
  await show(<PhotoThumb result={FOUND} onPress={onPress} />);
  const thumb = screen.getByRole('button', { name: 'Photo of the form' });
  expect(thumb).toHaveProp('accessibilityHint', 'Opens it full screen');
  expect(thumb).toHaveStyle({ width: touch.target, height: touch.target }); // a 48 dp target
  const picture = () => screen.getByTestId('photo-thumb');
  expect(picture().props.source).toEqual({ uri: FOUND.pageUri }); // the straightened page
  expect(picture()).toHaveStyle({
    width: touch.thumbW,
    height: touch.thumbH,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.badge,
  });
  await fireEvent.press(thumb);
  expect(onPress).toHaveBeenCalledTimes(1);

  // The form wasn't found: the photo itself.
  await screen.rerender(<PhotoThumb result={NOT_FOUND} onPress={onPress} />);
  expect(picture().props.source).toEqual({ uri: NOT_FOUND.originalUri });
  // Neither: nothing to show.
  await screen.rerender(<PhotoThumb result={NO_FILES} onPress={onPress} />);
  expect(screen.queryByRole('button', { name: 'Photo of the form' })).toBeNull();
});

test('the viewer: Close, the title Photo, a dark view choice, light status icons', async () => {
  const onClose = jest.fn();
  await show(<PhotoViewer visible result={FOUND} onClose={onClose} />);
  // Full screen on the viewer fill, edge to edge, with no motion of its own (§5.5 doesn't animate it).
  expect(viewer().props).toMatchObject({
    animationType: 'none',
    statusBarTranslucent: true,
    navigationBarTranslucent: true,
    backdropColor: colors.viewer,
  });
  expect(within(viewer()).getByTestId('status-bar').props.statusBar).toEqual({ style: 'light' });

  // The dark header, padded by the status bar's inset: the title is a header, and Close closes.
  expect(screen.getByTestId('header')).toHaveStyle({ backgroundColor: colors.viewer, paddingTop: TOP });
  expect(screen.getByRole('header', { name: 'Photo' })).toHaveStyle({ color: colors.cameraText });
  await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
  expect(onClose).toHaveBeenCalledTimes(1);

  // The views: a radio group, in the dark tone, with Enhanced chosen.
  const views = screen.getByRole('radiogroup', { name: 'View' });
  expect(within(views).getAllByRole('radio').map((option) => option.props.accessibilityLabel)).toEqual([
    'Enhanced',
    'B&W',
    'Original',
  ]);
  expect(radio('Enhanced')).toBeChecked();
  expect(radio('Enhanced')).toHaveStyle({ backgroundColor: colors.cameraText });
  expect(screen.getByText('B&W')).toHaveStyle({ color: colors.cameraText });
});

test('Enhanced by default, each made once', async () => {
  // A spinner in brand while Enhanced is made, and nothing to save yet.
  let made: (uri: string) => void = noop;
  mockEnhance.mockImplementationOnce(() => new Promise<string>((resolve) => (made = resolve)));
  await show(<PhotoViewer visible result={FOUND} onClose={noop} />);
  expect(mockEnhance.mock.calls).toEqual([[FOUND.pageUri, 'enhanced']]);
  expect(screen.getByTestId('scan-image-spinner')).toHaveProp('color', colors.brand);
  expect(screen.queryByTestId('scan-image')).toBeNull();
  expect(saveButton()).toBeDisabled();
  await act(async () => made(ENHANCED));
  expect(screen.queryByTestId('scan-image-spinner')).toBeNull();
  expect(image().props.source).toEqual({ uri: ENHANCED });
  expect(image()).toHaveProp('resizeMode', 'contain');
  expect(image()).toHaveStyle({ flex: 1 });

  await fireEvent.press(radio('B&W'));
  expect(radio('B&W')).toBeChecked();
  await waitFor(() => expect(image().props.source).toEqual({ uri: BW }));
  expect(mockEnhance).toHaveBeenLastCalledWith(FOUND.pageUri, 'bw');

  // Back to Enhanced: it was made already.
  await fireEvent.press(radio('Enhanced'));
  expect(image().props.source).toEqual({ uri: ENHANCED });
  expect(mockEnhance).toHaveBeenCalledTimes(2);

  // Original is the photo itself.
  await fireEvent.press(radio('Original'));
  expect(image().props.source).toEqual({ uri: FOUND.originalUri });
  expect(mockEnhance).toHaveBeenCalledTimes(2);
});

test("a view that can't be made falls back to Original", async () => {
  mockEnhance.mockRejectedValueOnce(new Error('out of memory'));
  await show(<PhotoViewer visible result={FOUND} onClose={noop} />);
  await waitFor(() => expect(radio('Original')).toBeChecked());
  expect(image().props.source).toEqual({ uri: FOUND.originalUri });
  expect(screen.queryByRole('button', { name: 'Save to Pictures' })).toBeNull();
});

test('Save to Pictures, for Enhanced and B&W only, confirmed in the viewer', async () => {
  let saved: (name: string) => void = noop;
  mockSave.mockImplementationOnce(() => new Promise((resolve) => (saved = resolve)));
  // The root layout's host is under the viewer, as in the app.
  await show(
    <>
      <SnackbarHost />
      <PhotoViewer visible result={FOUND} onClose={noop} />
    </>,
  );
  await waitFor(() => expect(image().props.source).toEqual({ uri: ENHANCED }));
  // Pinned at the bottom, above the navigation bar.
  expect(screen.getByTestId('photo-viewer-actions')).toHaveStyle({ paddingBottom: space.m + BOTTOM });

  // A fast double tap: inside one act() scope, React doesn't re-render the button as busy between the two presses.
  await act(async () => {
    await fireEvent.press(saveButton());
    await fireEvent.press(saveButton());
  });
  expect(mockSave.mock.calls).toEqual([[ENHANCED]]);
  await act(async () => saved('scan_1.jpg'));

  // The message shows once, inside the viewer and above its Save bar: not in the root host, behind the viewer.
  expect(within(viewer()).getByText(SAVED)).toBeOnTheScreen();
  expect(screen.getAllByText(SAVED, { includeHiddenElements: true })).toHaveLength(1);
  await layout('photo-viewer-actions', 104);
  expect(within(viewer()).getByTestId('snackbar')).toHaveStyle({ bottom: 104 + space.s });

  // B&W saves its own image, with a message of its own.
  await act(async () => dismissSnack(currentSnack()!.id));
  await fireEvent.press(radio('B&W'));
  await waitFor(() => expect(image().props.source).toEqual({ uri: BW }));
  await fireEvent.press(saveButton());
  expect(mockSave).toHaveBeenLastCalledWith(BW);
  expect(await within(viewer()).findByText(SAVED)).toBeOnTheScreen();

  // Original is the photo: nothing to save, and the message sits above the navigation bar.
  await fireEvent.press(radio('Original'));
  expect(screen.queryByRole('button', { name: 'Save to Pictures' })).toBeNull();
  expect(screen.queryByTestId('photo-viewer-actions')).toBeNull();
  expect(within(viewer()).getByTestId('snackbar')).toHaveStyle({ bottom: BOTTOM + space.s });
  expect(mockSave).toHaveBeenCalledTimes(2);
});

test("its save errors are today's", async () => {
  await show(<PhotoViewer visible result={FOUND} onClose={noop} />);
  await waitFor(() => expect(saveButton()).toBeEnabled());

  mockSave.mockRejectedValueOnce(Object.assign(new Error('old'), { code: 'ERR_SAVE_NEEDS_ANDROID_10' }));
  await fireEvent.press(saveButton());
  expect(await within(viewer()).findByText('Saving needs Android 10 or newer.')).toBeOnTheScreen();

  for (const failure of [Object.assign(new Error('failed'), { code: 'ERR_SAVE_FAILED' }), new Error('no code')]) {
    await act(async () => dismissSnack(currentSnack()!.id));
    await waitFor(() => expect(saveButton()).toBeEnabled());
    mockSave.mockRejectedValueOnce(failure);
    await fireEvent.press(saveButton());
    expect(await within(viewer()).findByText("Couldn't save the scan.")).toBeOnTheScreen();
  }
});

test('with no form, only the photo: no view choice, no save', async () => {
  await show(<PhotoViewer visible result={NOT_FOUND} onClose={noop} />);
  expect(screen.getByRole('header', { name: 'Photo' })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Close' })).toBeOnTheScreen();
  expect(image().props.source).toEqual({ uri: NOT_FOUND.originalUri });
  expect(image().parent).toHaveStyle({ flex: 1, marginBottom: BOTTOM }); // clear of the navigation bar
  expect(screen.queryByRole('radiogroup')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Save to Pictures' })).toBeNull();
  expect(mockEnhance).not.toHaveBeenCalled();
});

test('system back closes it', async () => {
  const onClose = jest.fn();
  const ui = (visible: boolean) => (
    <>
      <SnackbarHost />
      <PhotoViewer visible={visible} result={FOUND} onClose={onClose} />
    </>
  );
  await show(ui(true));
  await systemBack();
  expect(onClose).toHaveBeenCalledTimes(1);

  // Closed, it's gone, and its host with it: a message shows on the screen behind.
  await screen.rerender(ui(false));
  expect(screen.queryByTestId('photo-viewer', { includeHiddenElements: true })).toBeNull();
  await act(async () => toast('Added to your items.'));
  expect(screen.getByText('Added to your items.')).toBeOnTheScreen();
});
