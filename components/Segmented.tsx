import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, space, touch, type } from '../lib/theme';
import { Tap } from './Tap';

// Design B §5.6 and §7: a choice of a few options side by side (the kind switch, the lists' tabs, the photo viewer's
// views). TalkBack hears a radio group named by `label`, then each option as a radio button, checked or not. An
// outline border holds the options, and the chosen one is filled ink with a paper label (§5.1: selection is ink).
// Options are at least 48 dp tall, and their labels wrap at large text. Dark, on the photo viewer: the chosen one is
// a cameraText fill with an ink label, and the others are cameraText on the viewer.

const BORDER = 1;
/** How far inside the outline the selection sits. */
const INSET = 2; // optical: a hair between the outline and the chosen fill, finer than the space scale's 4 dp
/** The selection's corner, concentric with the group's inside its border and inset. */
const OPTION_RADIUS = radius.field - BORDER - INSET;

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  tone = 'light',
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string; // the radio group's spoken name
  tone?: 'light' | 'dark'; // dark: the photo viewer
}) {
  const dark = tone === 'dark';
  return (
    <View
      accessible
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={[styles.group, !dark && styles.light]}>
      {options.map((o) => {
        const checked = o.value === value;
        return (
          <Tap
            key={o.value}
            accessibilityRole="radio"
            accessibilityLabel={o.label}
            accessibilityState={{ checked }}
            onPress={() => onChange(o.value)}
            ripple={dark ? 'dark' : 'light'}
            // the options sit edge to edge inside the outline, so the ring goes on the option's own edge
            focusRing="inside"
            focusRadius={OPTION_RADIUS}
            style={[styles.option, checked && (dark ? styles.chosenDark : styles.chosen)]}>
            <Text style={[type.button, styles.text, { color: LABEL[tone][checked ? 'chosen' : 'other'] }]}>
              {o.label}
            </Text>
          </Tap>
        );
      })}
    </View>
  );
}

const LABEL = {
  light: { chosen: colors.paper, other: colors.ink },
  dark: { chosen: colors.ink, other: colors.cameraText },
} as const;

const styles = StyleSheet.create({
  group: {
    flexDirection: 'row',
    borderWidth: BORDER,
    borderColor: colors.outline,
    borderRadius: radius.field,
    padding: INSET,
  },
  light: { backgroundColor: colors.panel },
  option: {
    flex: 1,
    minHeight: touch.target,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.s,
    paddingVertical: space.xs,
    borderRadius: OPTION_RADIUS,
  },
  chosen: { backgroundColor: colors.ink },
  chosenDark: { backgroundColor: colors.cameraText },
  text: { textAlign: 'center' },
});
