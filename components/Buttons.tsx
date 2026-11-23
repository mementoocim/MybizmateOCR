import { type Ref, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, type ViewInstance } from 'react-native';

import { colors, radius, space, touch, type } from '../lib/theme';
import type { IconComponent } from './icons';
import { Tap } from './Tap';

// Design B's buttons (§5.6). Primary is the brand fill with an ink label; secondary a panel fill in an outline border,
// with an ink label; text a brandText label; destructive a panel fill in a dangerLine border, with a danger label;
// destructiveText a danger label. On the camera's dark panels (tone camera), a text button has a coral (brand) label,
// 6.52:1 on cameraPanel where brandText would be 2.85:1, and the dark surfaces' white ripple (ruling T16-2); the filled
// variants look the same on either. Large is at least 56 dp tall and default 48; both grow with the label. Disabled is
// a sand fill with a mute label, on every variant. Loading keeps the label, shows a spinner before it and blocks
// presses, and so does a press whose promise hasn't settled: a double tap runs once. A button can report how many lines
// its label took, so a row of them (ButtonRow) can stack when one wraps. Its ref is its pressable's view: a sheet it
// opens gives TalkBack focus back to it.

export type ButtonVariant = 'primary' | 'secondary' | 'text' | 'destructive' | 'destructiveText';
export type ButtonProps = {
  label: string;
  onPress: () => void | Promise<unknown>;
  variant?: ButtonVariant; // default 'primary'
  size?: 'large' | 'default'; // min height 56 / 48; both grow with the label
  tone?: 'light' | 'camera'; // default 'light'; camera: a text button on the camera's dark panels
  icon?: IconComponent;
  disabled?: boolean;
  loading?: boolean;
  testID?: string;
  accessibilityHint?: string;
  onLabelLines?: (lines: number) => void; // from the label's onTextLayout
  ref?: Ref<ViewInstance>; // its pressable (a sheet's returnFocus)
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'default',
  tone = 'light',
  icon: Icon,
  disabled = false,
  loading = false,
  testID,
  accessibilityHint,
  onLabelLines,
  ref,
}: ButtonProps) {
  const [pending, setPending] = useState(false);
  const running = useRef(false); // set at once, so a second tap is refused even before the re-render disables it
  const busy = loading || pending;
  const fill = FILL[variant];
  const onCamera = tone === 'camera' && variant === 'text';
  const color = disabled ? colors.mute : onCamera ? colors.brand : LABEL[variant];

  const press = () => {
    if (running.current) return;
    const result = onPress();
    if (!isThenable(result)) return;
    running.current = true;
    setPending(true);
    // finally, not then: a rejection still reaches the caller's handlers, or shows as unhandled, as before.
    void Promise.resolve(result).finally(() => {
      running.current = false;
      setPending(false);
    });
  };

  return (
    <Tap
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ busy }}
      testID={testID}
      disabled={disabled || busy}
      onPress={press}
      ripple={variant === 'primary' ? 'brand' : onCamera ? 'dark' : 'light'}
      style={({ pressed }) => [
        styles.button,
        size === 'large' ? styles.large : styles.default,
        fill,
        disabled && styles.disabled,
        pressed && variant === 'primary' && styles.primaryPressed, // iOS has no ripple
      ]}>
      {busy ? (
        <ActivityIndicator testID={testID === undefined ? undefined : `${testID}-spinner`} color={color} />
      ) : (
        Icon && <Icon size={touch.iconSmall} color={color} />
      )}
      <Text
        // Only when asked: with onTextLayout set, Android measures the label's lines on every layout.
        onTextLayout={onLabelLines && ((e) => onLabelLines(e.nativeEvent.lines.length))}
        style={[size === 'large' ? type.buttonLarge : type.button, styles.label, { color }]}>
        {label}
      </Text>
    </Tap>
  );
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return typeof (value as PromiseLike<unknown> | undefined)?.then === 'function';
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.s,
    paddingHorizontal: space.l,
    borderRadius: radius.button,
  },
  large: { minHeight: touch.buttonLarge },
  default: { minHeight: touch.target },
  primary: { backgroundColor: colors.brand },
  primaryPressed: { backgroundColor: colors.brandPressed },
  secondary: { backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.outline },
  destructive: { backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.dangerLine },
  disabled: { backgroundColor: colors.sand, borderColor: colors.sand }, // the border stays, so the size doesn't jump
  label: { flexShrink: 1, textAlign: 'center' }, // wraps beside the icon or spinner instead of overflowing
});

/** The box behind the label while enabled: none for the text variants. */
const FILL: Record<ButtonVariant, (typeof styles)[keyof typeof styles] | null> = {
  primary: styles.primary,
  secondary: styles.secondary,
  text: null,
  destructive: styles.destructive,
  destructiveText: null,
};

const LABEL: Record<ButtonVariant, string> = {
  primary: colors.ink,
  secondary: colors.ink,
  text: colors.brandText,
  destructive: colors.danger,
  destructiveText: colors.danger,
};
