import { Pressable, StyleSheet, Text, View } from 'react-native';

import { bold, colors } from '../lib/theme';

/** A choice of a few options side by side, the chosen one in coral (the scan view's toggle). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.toggle}>
      {options.map((o) => (
        <Pressable
          key={o.value}
          accessibilityRole="button"
          accessibilityState={{ selected: value === o.value }}
          onPress={() => onChange(o.value)}
          style={[styles.option, value === o.value && styles.chosen]}>
          <Text style={[styles.optionText, value === o.value && styles.chosenText]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  toggle: { flexDirection: 'row', backgroundColor: colors.panel, borderRadius: 12, padding: 2, borderWidth: 1, borderColor: colors.line },
  option: { flex: 1, height: 40, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  chosen: { backgroundColor: colors.coralTint },
  optionText: { fontSize: 14, color: colors.mute },
  chosenText: { ...bold, color: colors.coralText },
});
