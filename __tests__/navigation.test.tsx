import { router, useIsFocused, useRouter } from 'expo-router';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { Text } from 'react-native';

import { Button } from '../components/Buttons';
import { Header } from '../components/Header';
import { usePushOnce } from '../lib/navigation';
import { currentSnack } from '../lib/snackbar';
import { toast } from '../lib/toast';

// lib/navigation: going back, as the header's Back does it (and the camera's Close, a Retake that goes back, and a
// saved scan deleted from ⋮): to the screen under this one, or Home with nothing under it (ruling T24-1). It's bound to
// the screen's own navigation, never expo-router's global router (ruling T26-4). A new font size, display size or
// language restarts Android's activity in the same JS context: the new root mounts before the old one has gone, and the
// old one's late unmount unbinds that router, whose every method then throws, and empties the navigation ref it reads.
// And opening a screen from a press, as the app's screens do it: once, until the screen is on top again.
// The app's own Stack (app/_layout) and Header; the screens stand in, each saying whether it's the one on top.

jest.mock('expo-splash-screen', () => ({ preventAutoHideAsync: jest.fn(async () => {}) }));
jest.mock('../components/BrandSplash', () => ({ BrandSplash: () => null })); // the scanner's start (splash.test)
jest.mock('../lib/captureQueue', () => ({ resumeQueue: async () => {} })); // its reads (captureQueue.test)

function Where({ name }: { name: string }) {
  return <Text>{`${name}: ${useIsFocused() ? 'on top' : 'under'}`}</Text>;
}
function Home() {
  const go = useRouter();
  const push = usePushOnce();
  return (
    <>
      <Header brand onBack={null} />
      <Where name="Home" />
      <Button label="Saved" onPress={() => push('/saved')} />
      <Button label="Settings in Home's place" onPress={() => go.replace('/settings')} />
    </>
  );
}
function Saved() {
  const push = usePushOnce();
  return (
    <>
      <Header title="Saved" />
      <Where name="Saved" />
      <Button label="A row" onPress={() => push('/result')} />
    </>
  );
}
const standIn = (name: string) =>
  function Route() {
    return (
      <>
        <Header title={name} />
        <Where name={name} />
      </>
    );
  };
const ROUTES = {
  _layout: require('../app/_layout'),
  index: Home,
  saved: Saved,
  result: standIn('Scan'),
  settings: standIn('Settings'),
  camera: standIn('Camera'), // the layout names it
};

const press = (name: string) => act(async () => fireEvent.press(screen.getByRole('button', { name })));
/** The screen on top: the one stand-in that says so. */
const onTop = () => screen.getAllByText(/: on top$/).map((line) => line.props.children);

test("Back goes to the screen under this one, by the screen's own navigation", async () => {
  await renderRouter(ROUTES, { initialUrl: '/' });
  await press('Saved');
  await press('A row');
  expect(onTop()).toEqual(['Scan: on top']);
  await press('Back');
  expect(onTop()).toEqual(['Saved: on top']);
  await press('Back');
  expect(onTop()).toEqual(['Home: on top']);
});

test('a press opens its screen once, until this screen is on top again (final review, Minor 4)', async () => {
  // a double tap pushed twice: two cameras stacked, say, so Back showed the first
  await renderRouter(ROUTES, { initialUrl: '/' });
  // A fast double tap: inside one act() scope, nothing re-renders between the two taps.
  await act(async () => {
    await fireEvent.press(screen.getByRole('button', { name: 'Saved' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Saved' }));
  });
  expect(onTop()).toEqual(['Saved: on top']);
  await press('Back');
  expect(onTop()).toEqual(['Home: on top']); // one Saved
  // on top again, Home opens it again; and so does Saved its row, once
  await press('Saved');
  expect(onTop()).toEqual(['Saved: on top']);
  await act(async () => {
    await fireEvent.press(screen.getByRole('button', { name: 'A row' }));
    await fireEvent.press(screen.getByRole('button', { name: 'A row' }));
  });
  expect(onTop()).toEqual(['Scan: on top']);
  await press('Back');
  expect(onTop()).toEqual(['Saved: on top']);
});

test('with nothing under the screen, Back goes Home (ruling T24-1)', async () => {
  await renderRouter(ROUTES, { initialUrl: '/' });
  await press("Settings in Home's place");
  expect(onTop()).toEqual(['Settings: on top']);
  expect(screen.queryByText('Home: under')).toBeNull(); // nothing under it
  await press('Back');
  expect(onTop()).toEqual(['Home: on top']);
});

test('after Android restarts the screen, Back still goes back, to the screen under it (ruling T26-4)', async () => {
  // The restart: the new root mounts while the old one is still there, then the old one goes.
  const error = jest.spyOn(console, 'error').mockImplementation(() => {});
  const old = await renderRouter(ROUTES, { initialUrl: '/' });
  await renderRouter(ROUTES, { initialUrl: '/' });
  await old.unmount();
  // expo-router's own warnings, as the emulator showed them after a restart, and nothing else
  expect(error.mock.calls).toEqual([
    [expect.stringContaining('multiple navigation containers consuming the shared imperative routing queue')],
    [expect.stringContaining('configured linking in multiple places')],
  ]);
  error.mockRestore();
  // as logcat showed it on the emulator: the old root took expo-router's global router with it
  expect(() => router.canGoBack()).toThrow(
    'The imperative router is unavailable before the first render has finished.',
  );

  // Saved › a row › Back: Saved, not Home, so the screen's navigation knows what's under it; then Home
  await press('Saved');
  await press('A row');
  expect(onTop()).toEqual(['Scan: on top']);
  await press('Back');
  expect(onTop()).toEqual(['Saved: on top']);
  await press('Back');
  expect(onTop()).toEqual(['Home: on top']);
});

test("after Android restarts the screen, a message from before it has gone, with its action (final review, Minor 6)", async () => {
  // A save's "Saved as a sale" holds View, bound to the old root's router: on the new root, it would open nothing.
  const error = jest.spyOn(console, 'error').mockImplementation(() => {});
  await renderRouter(ROUTES, { initialUrl: '/' });
  const view = jest.fn();
  await act(async () => toast('Saved as a sale', { label: 'View', onPress: view }));
  expect(screen.getByRole('button', { name: 'View' })).toBeOnTheScreen();
  await renderRouter(ROUTES, { initialUrl: '/' }); // the new root mounts while the old one is still there
  expect(error.mock.calls).toEqual([
    [expect.stringContaining('multiple navigation containers consuming the shared imperative routing queue')],
    [expect.stringContaining('configured linking in multiple places')],
  ]);
  error.mockRestore();
  expect(currentSnack()).toBeNull();
  expect(screen.queryByText('Saved as a sale')).toBeNull();
  expect(view).not.toHaveBeenCalled();
});
