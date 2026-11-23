import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { colors, radius, space, touch, type } from '../lib/theme';
import { Tap } from './Tap';

// Design B §5.6 and §7: a choice of a few options side by side (the kind switch, the lists' tabs, the photo viewer's
// views). TalkBack hears a radio group named by `label`, then each option as a radio button, checked or not. An
// outline border holds the options, and the chosen one is filled ink with a paper label (§5.1: selection is ink).
// Options are at least 48 dp tall, and their labels wrap. Side by side each has an equal share of the row, which is too
// narrow for a word at a large font size, or at a smaller one on a narrow phone ("Custo / mers"): then the options
// stack, one full-width option per row, in the same outline and with the same selection. The more options, the smaller
// each share, so the sooner they stack (ruling T26-5). Dark, on the photo viewer: the chosen one is a cameraText fill
// with an ink label, and the others are cameraText on the viewer.

const BORDER = 1;
/** How far inside the outline the selection sits. */
const INSET = 2; // optical: a hair between the outline and the chosen fill, finer than the space scale's 4 dp
/** The selection's corner, concentric with the group's inside its border and inset. */
const OPTION_RADIUS = radius.field - BORDER - INSET;
/**
 * Under this many dp of window width per unit of font scale, for each option, the options stack (ruling T26-5): under
 * 312 for three, under 208 for two. In a W dp window, with the 16 dp page padding of Lists, the Scan screen and the
 * photo viewer, the 1 dp border, the 2 dp inset and 8 dp of padding a side, each of n options has (W − 38 − 16n) / n dp
 * for its label: (W − 86) / 3 for three.
 * "Customers", about 75 dp at 100%, outgrows that third from about 285 dp per unit on a 411 dp phone (at 144%), 296 on
 * a 360 dp one (at 122%) and 308 on a 320 dp one (at 104%): 312 leaves a margin. Two options have (W − 70) / 2 each, so
 * Sale | Purchase keeps one row at 130% on a 360 dp phone, where three options stack.
 */
const STACK_UNDER_PER_OPTION = 104;

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
  const { width, fontScale } = useWindowDimensions();
  const stacked = width / fontScale < STACK_UNDER_PER_OPTION * options.length;
  return (
    <View
      accessible
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={[styles.group, stacked && styles.stacked, !dark && styles.light]}>
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
            style={[styles.option, !stacked && styles.share, checked && (dark ? styles.chosenDark : styles.chosen)]}>
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
  // one option per row, each the full width (a column stretches its children)
  stacked: { flexDirection: 'column' },
  light: { backgroundColor: colors.panel },
  option: {
    minHeight: touch.target,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.s,
    paddingVertical: space.xs,
    borderRadius: OPTION_RADIUS,
  },
  share: { flex: 1 }, // side by side: an equal share of the row
  chosen: { backgroundColor: colors.ink },
  chosenDark: { backgroundColor: colors.cameraText },
  text: { textAlign: 'center' },
});
