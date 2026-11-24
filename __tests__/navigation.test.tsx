import { router, useIsFocused, useRouter } from 'expo-router';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { Text } from 'react-native';

import { Button } from '../components/Buttons';
import { Header } from '../components/Header';
import { usePushOnce } from '../lib/navigation';
import { currentSnack } from '../lib/snackbar';
import { toast } from '../lib/toast';
import { appRoutes } from '../test-utils/routes';

// lib/navigation: going back, as the header's Back does it (and a Retake that goes back, and a saved scan deleted from
// ⋮): to the screen under this one, or the camera with nothing under it (rulings T24-1, T6-2). It's bound to the
// screen's own navigation, never expo-router's global router (ruling T26-4). A new font size, display size or
// language restarts Android's activity in the same JS context: the new root mounts before the old one has gone, and the
// old one's late unmount unbinds that router, whose every method then throws, and empties the navigation ref it reads.
// And opening a screen from a press, as the app's screens do it: once, until the screen is on top again.
// The app's own layouts (test-utils/routes: the root Stack, on the tabs, on the camera) and Header; the screens stand
// in, each saying whether it's the one on top. Home is a tab: a test opens it from the camera, where the app opens.

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
      <Button label="Your lists" onPress={() => push('/lists')} />
      <Button label="Licenses in Home's place" onPress={() => go.replace('/licenses')} />
    </>
  );
}
function Lists() {
  const push = usePushOnce();
  return (
    <>
      <Header title="Your lists" />
      <Where name="Your lists" />
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
const ROUTES = appRoutes({
  '(tabs)/index': Home,
  lists: Lists,
  result: standIn('Scan'),
  licenses: standIn('Open-source licenses'),
});

const press = (name: string) => act(async () => fireEvent.press(screen.getByRole('button', { name })));
/** The screen on top: the one stand-in that says so. */
const onTop = () => screen.getAllByText(/: on top$/).map((line) => line.props.children);
/** The app, opened as it opens, on the camera; then Home, its tab. */
async function openHome() {
  await renderRouter(ROUTES, { initialUrl: '/camera' });
  await openHomeTab();
}
const openHomeTab = () => act(async () => fireEvent.press(screen.getByRole('tab', { name: 'Home' })));

test("Back goes to the screen under this one, by the screen's own navigation", async () => {
  await openHome();
  await press('Your lists');
  await press('A row');
  expect(onTop()).toEqual(['Scan: on top']);
  await press('Back');
  expect(onTop()).toEqual(['Your lists: on top']);
  await press('Back');
  expect(onTop()).toEqual(['Home: on top']);
});

test('a press opens its screen once, until this screen is on top again (final review, Minor 4)', async () => {
  // a double tap pushed twice: two cameras stacked, say, so Back showed the first
  await openHome();
  // A fast double tap: inside one act() scope, nothing re-renders between the two taps.
  await act(async () => {
    await fireEvent.press(screen.getByRole('button', { name: 'Your lists' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Your lists' }));
  });
  expect(onTop()).toEqual(['Your lists: on top']);
  await press('Back');
  expect(onTop()).toEqual(['Home: on top']); // one Your lists
  // on top again, Home opens it again; and so does Your lists its row, once
  await press('Your lists');
  expect(onTop()).toEqual(['Your lists: on top']);
  await act(async () => {
    await fireEvent.press(screen.getByRole('button', { name: 'A row' }));
    await fireEvent.press(screen.getByRole('button', { name: 'A row' }));
  });
  expect(onTop()).toEqual(['Scan: on top']);
  await press('Back');
  expect(onTop()).toEqual(['Your lists: on top']);
});

test('with nothing under the screen, Back goes to the camera, where the app starts (rulings T24-1, T6-2)', async () => {
  await openHome();
  await press("Licenses in Home's place");
  expect(onTop()).toEqual(['Open-source licenses: on top']);
  expect(screen.queryByText(/: under$/)).toBeNull(); // nothing under it
  await press('Back');
  expect(screen).toHavePathname('/camera');
  expect(onTop()).toEqual(['Camera: on top']);
});

test('after Android restarts the screen, Back still goes back, to the screen under it (ruling T26-4)', async () => {
  // The restart: the new root mounts while the old one is still there, then the old one goes.
  const error = jest.spyOn(console, 'error').mockImplementation(() => {});
  const old = await renderRouter(ROUTES, { initialUrl: '/camera' });
  await renderRouter(ROUTES, { initialUrl: '/camera' });
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

  // Home › Your lists › a row › Back: Your lists, not Home, so the screen's navigation knows what's under it; then Home
  await openHomeTab();
  await press('Your lists');
  await press('A row');
  expect(onTop()).toEqual(['Scan: on top']);
  await press('Back');
  expect(onTop()).toEqual(['Your lists: on top']);
  await press('Back');
  expect(onTop()).toEqual(['Home: on top']);
});

test("after Android restarts the screen, a message from before it has gone, with its action (final review, Minor 6)", async () => {
  // A save's "Saved as a sale" holds View, bound to the old root's router: on the new root, it would open nothing.
  const error = jest.spyOn(console, 'error').mockImplementation(() => {});
  await renderRouter(ROUTES, { initialUrl: '/camera' });
  const view = jest.fn();
  await act(async () => toast('Saved as a sale', { label: 'View', onPress: view }));
  expect(screen.getByRole('button', { name: 'View' })).toBeOnTheScreen();
  await renderRouter(ROUTES, { initialUrl: '/camera' }); // the new root mounts while the old one is still there
  expect(error.mock.calls).toEqual([
    [expect.stringContaining('multiple navigation containers consuming the shared imperative routing queue')],
    [expect.stringContaining('configured linking in multiple places')],
  ]);
  error.mockRestore();
  expect(currentSnack()).toBeNull();
  expect(screen.queryByText('Saved as a sale')).toBeNull();
  expect(view).not.toHaveBeenCalled();
});
