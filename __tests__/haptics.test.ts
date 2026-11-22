import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

import { confirmHaptic } from '../lib/haptics';

// Design B §5.5 and the plan's call 2: the one haptic, a confirm when auto-capture takes the photo. On Android it's the
// haptics engine's Confirm, which needs no VIBRATE permission (app.json blocks it); elsewhere, the success
// notification. A phone that can't do it gets none, and nothing fails.

jest.mock('expo-haptics');

const android = jest.mocked(Haptics.performAndroidHapticsAsync);
const notification = jest.mocked(Haptics.notificationAsync);
/** Node reports a rejection nobody handled once the microtasks run out, and jest-circus fails the test then. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks(); // the platform
});

test("on Android: the haptics engine's Confirm", async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  confirmHaptic();
  await settle();
  expect(android.mock.calls).toEqual([[Haptics.AndroidHaptics.Confirm]]);
  expect(Haptics.AndroidHaptics.Confirm).toBe('confirm');
  expect(notification).not.toHaveBeenCalled();
});

test('elsewhere: the success notification', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  confirmHaptic();
  await settle();
  expect(notification.mock.calls).toEqual([[Haptics.NotificationFeedbackType.Success]]);
  expect(android).not.toHaveBeenCalled();
});

test("a phone that can't do it: nothing happens and nothing fails", async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  android.mockRejectedValueOnce(new Error('Haptics are not available'));
  expect(() => confirmHaptic()).not.toThrow();
  await settle();
  android.mockImplementationOnce(() => {
    throw new Error('ExpoHaptics is not linked');
  });
  expect(() => confirmHaptic()).not.toThrow();
  await settle();
  expect(android).toHaveBeenCalledTimes(2);
});
