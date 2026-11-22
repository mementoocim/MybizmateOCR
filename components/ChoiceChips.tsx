import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, space, touch, type } from '../lib/theme';
import { Tap } from './Tap';

// Design B §5.6 and §7: a labelled choice of one among a few, as pills that wrap to new lines (the tax type, the
// terms, Export's ranges, Saved's filter). TalkBack hears a radio group named by `label`, then each pill as a radio
// button, checked or not. A pill is 40 dp tall with hitSlop to a 48 dp target; chosen, it's filled ink with a paper
// label (§5.1: selection is ink). The label shows above the pills unless showLabel is false (Saved's filter, which
// only speaks it). A helper line can follow, under the group, so TalkBack reads it after the pills. value null: none
// chosen yet.

/** A 40 dp pill's hitSlop on every side, to a 48 dp target. */
const SLOP = (touch.target - touch.chip) / 2;

export function ChoiceChips<T extends string>({
  label,
  options,
  value,
  onChange,
  helper,
  showLabel = true,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
  helper?: string | null;
  showLabel?: boolean; // default true; false: Saved's filter (spoken only)
}) {
  return (
    <View style={styles.field}>
      {/* The label is inside the group, which speaks it, so TalkBack doesn't read it twice. */}
      <View accessible accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.field}>
        {showLabel ? <Text style={[type.label, styles.mute]}>{label}</Text> : null}
        <View style={styles.chips}>
          {options.map((o) => {
            const checked = o.value === value;
            return (
              <Tap
                key={o.value}
                accessibilityRole="radio"
                accessibilityLabel={o.label}
                accessibilityState={{ checked }}
                onPress={() => onChange(o.value)}
                hitSlop={SLOP}
                focusRadius={radius.pill}
                style={[styles.chip, checked && styles.chosen]}>
                <Text style={[type.label, styles.text, { color: checked ? colors.paper : colors.ink }]}>{o.label}</Text>
              </Tap>
            );
          })}
        </View>
      </View>
      {helper ? <Text style={[type.label, styles.mute]}>{helper}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: space.s },
  mute: { color: colors.mute },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s },
  chip: {
    minHeight: touch.chip,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.m,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
  },
  chosen: { backgroundColor: colors.ink, borderColor: colors.ink },
  text: { textAlign: 'center' },
});
