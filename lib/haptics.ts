import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

// Design B §5.5 and the plan's call 2: the app's one haptic, a confirm when auto-capture takes the photo, because the
// person's hands are busy and their eyes are on the paper. There's none on taps or saves.
// - On Android it's the haptics engine's, which needs no VIBRATE permission (app.json blocks it). That's Confirm from
//   Android 11. expo-haptics refuses Confirm below that, and the app runs from Android 8, so Android 8 to 10 get
//   Long_Press (ruling T16-3).
// - Elsewhere, it's the success notification.

const CONFIRM_API = 30; // Android 11 (R): the haptics engine has Confirm from here

/** One confirm haptic. A phone that can't do it gets none: its failure is ignored, never shown. */
export function confirmHaptic(): void {
  void (async () => {
    if (Platform.OS === 'android') {
      const { Confirm, Long_Press } = Haptics.AndroidHaptics;
      await Haptics.performAndroidHapticsAsync(Platform.Version < CONFIRM_API ? Long_Press : Confirm);
    } else {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  })().catch(() => {});
}
