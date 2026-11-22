import { useState } from 'react';
import { Pressable, type PressableProps, type PressableStateCallbackType, StyleSheet, View } from 'react-native';

import { colors, radius, ripple as ripples } from '../lib/theme';

// Design B §5.5 and §7: every pressable in the app goes through Tap. A press shows the Android ripple in place of
// today's fade (there's no opacity change), and a pressable focused from a hardware keyboard shows a 2 dp focus ring
// just outside it. Everything else (role, label, state, style, children) goes through to the Pressable as given.

type TapProps = PressableProps & {
  /** The press feedback, one of the theme's ripples; default 'light'. 'none' shows none (a sheet's scrim). */
  ripple?: keyof typeof ripples | 'none';
  /** The corner radius the focus ring follows, 3 dp out (the control's own); default radius.button. */
  focusRadius?: number;
};

/** How far outside the control the focus ring sits (ruling F3-1). */
const RING_OUT = 3;

export function Tap({ ripple = 'light', focusRadius = radius.button, onFocus, onBlur, children, ...rest }: TapProps) {
  const [focused, setFocused] = useState(false);
  const ring = focused && (
    <View testID="focus-ring" pointerEvents="none" style={[styles.ring, { borderRadius: focusRadius + RING_OUT }]} />
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
  // Outside the control, so it shows against the page whatever the control's own fill (focus on brand is only about
  // 1.4:1). It takes no space in the layout and never takes a touch.
  ring: {
    position: 'absolute',
    top: -RING_OUT,
    left: -RING_OUT,
    right: -RING_OUT,
    bottom: -RING_OUT,
    borderWidth: 2,
    borderColor: colors.focus,
  },
});
