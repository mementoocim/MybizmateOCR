import { Alert, Platform, ToastAndroid } from 'react-native';

/** A short message at the bottom of the screen (the test app's snackbars). */
export function toast(message: string): void {
  if (Platform.OS === 'android') ToastAndroid.show(message, ToastAndroid.LONG);
  else Alert.alert(message);
}
