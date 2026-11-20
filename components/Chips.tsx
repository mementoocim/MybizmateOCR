import { Pressable, StyleSheet, Text, View } from 'react-native';

import { bold, colors } from '../lib/theme';

/** A labelled choice of one among a few, as chips; the chosen one in coral. value null: none chosen yet. */
export function Chips<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.chips}>
        {options.map((o) => (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityLabel={o.label}
            accessibilityState={{ selected: value === o.value }}
            onPress={() => onChange(o.value)}
            style={[styles.chip, value === o.value && styles.chosen]}>
            <Text style={[styles.chipText, value === o.value && styles.chosenText]}>{o.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginTop: 16 },
  label: { fontSize: 13, color: colors.mute, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: colors.panel,
  },
  chosen: { backgroundColor: colors.coralTint, borderColor: colors.coral },
  chipText: { fontSize: 14, color: colors.ink },
  chosenText: { ...bold, color: colors.coralText },
});
