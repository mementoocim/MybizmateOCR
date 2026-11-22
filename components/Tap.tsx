import { useState } from 'react';
import { Pressable, type PressableProps, type PressableStateCallbackType, StyleSheet, View } from 'react-native';

import { colors, radius, ripple as ripples } from '../lib/theme';

// Design B §5.5 and §7: every pressable in the app goes through Tap. A press shows the Android ripple in place of
// today's fade (there's no opacity change), and a pressable focused from a hardware keyboard shows a 2 dp focus ring.
// Everything else (role, label, state, style, children) goes through to the Pressable as given.

type TapProps = PressableProps & {
  /** The press feedback, one of the theme's ripples; default 'light'. 'none' shows none (a sheet's scrim). */
  ripple?: keyof typeof ripples | 'none';
  /** The focus ring's corner radius; default radius.button. */
  focusRadius?: number;
};

export function Tap({ ripple = 'light', focusRadius = radius.button, onFocus, onBlur, children, ...rest }: TapProps) {
  const [focused, setFocused] = useState(false);
  const ring = focused && (
    <View testID="focus-ring" pointerEvents="none" style={[styles.ring, { borderRadius: focusRadius }]} />
  );
  return (
    <Pressable
      focusable
      {...rest}
      android_ripple={ripple === 'none' ? undefined : ripples[ripple]}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}>
      {typeof children === 'function' ? (
        (state: PressableStateCallbackType) => (
          <>
            {children(state)}
            {ring}
          </>
        )
      ) : (
        <>
          {children}
          {ring}
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Drawn over the content, inside the pressable's border; it never takes a touch.
  ring: { ...StyleSheet.absoluteFill, borderWidth: 2, borderColor: colors.focus },
});
