/**
 * The failure dialogs lib/scanFlow raised, from a test's spy on Alert.alert: each one's title, then its message when it
 * has one (rulings T16-1 and T16-1a: a title alone has no message, never an empty one). Each also has Android's one OK,
 * which the camera waits for (the final review's Minor 5: __tests__/camera.test.tsx).
 */
export function dialogWords(alert: jest.SpyInstance): string[][] {
  return alert.mock.calls.map(([title, message]) => (message === undefined ? [title] : [title, message]));
}
