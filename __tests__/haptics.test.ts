import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

import { confirmHaptic } from '../lib/haptics';

// Design B §5.5 and the plan's call 2: the one haptic, a confirm when auto-capture takes the photo.
// - On Android it's the haptics engine's, which needs no VIBRATE permission (app.json blocks it). That's Confirm from
//   Android 11 (API 30). expo-haptics refuses Confirm below that, and the app runs from Android 8 (API 26), so Android
//   8 to 10 get Long_Press (ruling T16-3).
// - Elsewhere, it's the success notification.
// - A phone that can't do it gets none, and nothing fails.

jest.mock('expo-haptics');

const android = jest.mocked(Haptics.performAndroidHapticsAsync);
const notification = jest.mocked(Haptics.notificationAsync);
/** Node reports a rejection nobody handled once the microtasks run out, and jest-circus fails the test then. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
/** An Android phone at that API level. Version is a getter, which jest.replaceProperty refuses: its spy stands in. */
function onAndroid(apiLevel: number) {
  jest.replaceProperty(Platform, 'OS', 'android');
  jest.spyOn(Platform, 'Version', 'get').mockReturnValue(apiLevel);
}

afterEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks(); // the platform
});

test("on Android 11 and later: the haptics engine's Confirm", async () => {
  for (const apiLevel of [30, 34]) {
    onAndroid(apiLevel);
    confirmHaptic();
    await settle();
  }
  expect(android.mock.calls).toEqual([[Haptics.AndroidHaptics.Confirm], [Haptics.AndroidHaptics.Confirm]]);
  expect(Haptics.AndroidHaptics.Confirm).toBe('confirm');
  expect(notification).not.toHaveBeenCalled();
});

test('on Android 8 to 10: Long_Press, as expo-haptics refuses Confirm before Android 11', async () => {
  for (const apiLevel of [26, 29]) {
    onAndroid(apiLevel);
    confirmHaptic();
    await settle();
  }
  expect(android.mock.calls).toEqual([[Haptics.AndroidHaptics.Long_Press], [Haptics.AndroidHaptics.Long_Press]]);
  expect(Haptics.AndroidHaptics.Long_Press).toBe('long-press');
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
  onAndroid(29);
  android.mockRejectedValueOnce(new Error('Haptics are not available'));
  expect(() => confirmHaptic()).not.toThrow();
  await settle();
  onAndroid(34);
  android.mockImplementationOnce(() => {
    throw new Error('ExpoHaptics is not linked');
  });
  expect(() => confirmHaptic()).not.toThrow();
  await settle();
  expect(android).toHaveBeenCalledTimes(2);
});
