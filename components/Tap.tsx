import { type Ref, useState } from 'react';
import {
  Pressable,
  type PressableInstance,
  type PressableProps,
  type PressableStateCallbackType,
  StyleSheet,
  View,
} from 'react-native';

import { colors, radius, ripple as ripples } from '../lib/theme';

// Design B §5.5 and §7: every pressable in the app goes through Tap. A press shows the Android ripple in place of
// today's fade (there's no opacity change), and a pressable focused from a hardware keyboard shows a 2 dp focus ring
// just outside it, or on its edge for a row. Everything else (role, label, state, style, ref, children) goes through
// to the Pressable as given.

type TapProps = PressableProps & {
  ref?: Ref<PressableInstance>;
  /** The press feedback, one of the theme's ripples; default 'light'. 'none' shows none (a sheet's scrim). */
  ripple?: keyof typeof ripples | 'none';
  /** The control's own corner radius, which the focus ring follows; default radius.button. */
  focusRadius?: number;
  /**
   * Where the focus ring sits: 3 dp outside the control (ruling F3-1), or on its edge (ruling T4-1), for full-bleed
   * rows, where the next row's fill would cover a ring outside and the scroll view would clip its sides. Default
   * 'outside'.
   */
  focusRing?: 'outside' | 'inside';
};

/** How far outside the control the focus ring sits (ruling F3-1). */
const RING_OUT = 3;

export function Tap({
  ripple = 'light',
  focusRadius = radius.button,
  focusRing = 'outside',
  onFocus,
  onBlur,
  children,
  ...rest
}: TapProps) {
  const [focused, setFocused] = useState(false);
  const outside = focusRing === 'outside';
  const ring = focused && (
    <View
      testID="focus-ring"
      pointerEvents="none"
      style={[
        styles.ring,
        outside ? styles.outside : styles.inside,
        { borderRadius: outside ? focusRadius + RING_OUT : focusRadius },
      ]}
    />
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
  // It takes no space in the layout and never takes a touch.
  ring: { position: 'absolute', borderWidth: 2, borderColor: colors.focus },
  // Outside the control, so it shows against the page whatever the control's own fill (focus on brand is only about
  // 1.4:1).
  outside: { top: -RING_OUT, left: -RING_OUT, right: -RING_OUT, bottom: -RING_OUT },
  // On the control's edge: over a row's panel fill, focus is 3.61:1; over a section strip's sand, 3.07:1.
  inside: { top: 0, left: 0, right: 0, bottom: 0 },
});
