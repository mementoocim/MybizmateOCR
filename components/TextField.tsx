import { StyleSheet, Text, TextInput, type TextInputProps, View } from 'react-native';

import { colors } from '../lib/theme';

/** A labelled text field; the label is also what a screen reader says for it. */
export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  onBlur,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  onBlur?: () => void;
  autoCapitalize?: TextInputProps['autoCapitalize'];
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholder={placeholder}
        placeholderTextColor={colors.mute}
        value={value}
        onChangeText={onChangeText}
        onBlur={onBlur}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginTop: 16 },
  label: { fontSize: 13, color: colors.mute, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.panel,
  },
});
