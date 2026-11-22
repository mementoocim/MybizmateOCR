import { act } from '@testing-library/react-native';
import { DeviceEventEmitter, Keyboard } from 'react-native';

/** What Android sends when the keyboard opens (its height above the navigation bar, in dp), or 0: it closed. */
export async function keyboard(height: number): Promise<void> {
  Keyboard.isVisible(); // loads RN's Keyboard module first, so its own record of the keyboard hears this too
  await act(() => {
    DeviceEventEmitter.emit(height > 0 ? 'keyboardDidShow' : 'keyboardDidHide', {
      duration: 0,
      easing: 'keyboard',
      endCoordinates: { screenX: 0, screenY: 0, width: 360, height },
    });
  });
}
