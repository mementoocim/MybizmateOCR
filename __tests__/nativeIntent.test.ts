import { redirectSystemPath } from '../app/+native-intent';

// Camera first (spec §6.1, call 1): a launch with no route of its own, from the launcher or a development build's
// launch link, opens the camera, the tabs' anchor, not Home. A link with a route keeps it (mybizmatescan://camera?test=…,
// the team's /speed and /training). A link that comes while the app runs goes on as it came, and so does anything it
// can't read: the function never throws.

const cold = (path: string) => redirectSystemPath({ path, initial: true });

test('a launch with no route opens the camera', () => {
  for (const path of [
    'mybizmatescan:///',
    'mybizmatescan://',
    '/',
    '',
    'mybizmatescan:///?__expo_disable_fab=1',
    // a development build's launch link: the target is the bundler, with no route of its own
    'exp+mybizmate-scan://expo-development-client/?url=http%3A%2F%2F10.0.2.2%3A8081',
    'exp+mybizmate-scan://expo-development-client/?url=http%3A%2F%2F10.0.2.2%3A8081%2F--%2F',
  ]) {
    expect([path, cold(path)]).toEqual([path, '/camera']);
  }
});

test('a link with a route keeps it', () => {
  for (const path of [
    'mybizmatescan://camera?test=inv_0051',
    'mybizmatescan:///camera?test=inv_0051',
    'mybizmatescan://speed',
    '/training',
    '/lists',
    'mybizmatescan://result?id=abc',
  ]) {
    expect(cold(path)).toBe(path);
  }
  // a development build's launch link to a route: it goes on as it came, and expo-router opens its route
  const devLink = 'exp+mybizmate-scan://expo-development-client/?url=http%3A%2F%2F10.0.2.2%3A8081%2F--%2Fspeed';
  expect(cold(devLink)).toBe(devLink);
});

test('a link while the app runs is never changed', () => {
  for (const path of ['mybizmatescan:///', '/', 'mybizmatescan://camera?test=inv_0051', '/speed']) {
    expect(redirectSystemPath({ path, initial: false })).toBe(path);
  }
});

test("it never throws; what it can't read goes on as it came", () => {
  for (const path of ['::not a url::', 'http://[bad', 'mybizmatescan://%E0%A4%A']) {
    expect(() => cold(path)).not.toThrow();
  }
  expect(cold('http://[bad/camera')).toBe('http://[bad/camera');
  // even a path that isn't a string, as a broken caller might send it
  expect(cold(undefined as unknown as string)).toBe(undefined);
});
