import { Platform, StyleSheet } from 'react-native';

import NativeImeInsets, { type ImeInsetsViewProps } from './ImeInsetsNativeView';

export type { ImeChangeEvent, ImeInsetsViewProps } from './ImeInsetsNativeView';

// The keyboard's height in the window this view is in (ImeInsetsView.kt), for a sheet: an RN Modal is a window of its
// own, and RN's keyboard events come only from the app's main window. On Android, onImeChange gets the keyboard's
// height above the navigation bar, in dp, whenever it changes, and as the view is attached when it isn't 0. Whatever
// the caller passes, it's invisible and takes no room: no size, no touches, hidden from TalkBack. On iOS it renders
// nothing (milestone 9): the keyboard's events there aren't a window's, so a sheet keeps useKeyboardHeight.

export function ImeInsetsView(props: ImeInsetsViewProps) {
  if (Platform.OS !== 'android') return null;
  return (
    <NativeImeInsets
      {...props}
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={styles.none}
    />
  );
}

const styles = StyleSheet.create({
  none: { position: 'absolute', width: 0, height: 0 },
});
