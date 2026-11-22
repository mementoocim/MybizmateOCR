import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

// Design B §5.5 and the plan's call 2: the app's one haptic, a confirm when auto-capture takes the photo, because the
// person's hands are busy and their eyes are on the paper. On Android it's the haptics engine's Confirm, which needs no
// VIBRATE permission (app.json blocks it); elsewhere, the success notification. There's none on taps or saves.

/** One confirm haptic. A phone that can't do it gets none: its failure is ignored, never shown. */
export function confirmHaptic(): void {
  void (async () => {
    if (Platform.OS === 'android') await Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Confirm);
    else await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  })().catch(() => {});
}
