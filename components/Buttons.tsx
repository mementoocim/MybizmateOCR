import type { ComponentType } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { bold, colors } from '../lib/theme';

// The test app's buttons (themes.xml): the main one in ember, an outlined one, and a text button.
type IconComponent = ComponentType<{ size?: number; color: string }>;
type ButtonProps = {
  label: string;
  onPress: () => void;
  icon?: IconComponent;
  disabled?: boolean;
  testID?: string;
};

export function PrimaryButton({ label, onPress, icon: Icon, disabled, testID }: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.primary, (pressed || disabled) && styles.dim]}>
      <View style={styles.row}>
        {Icon && <Icon size={20} color={colors.panel} />}
        <Text style={styles.primaryText}>{label}</Text>
      </View>
    </Pressable>
  );
}

export function OutlinedButton({ label, onPress, icon: Icon, disabled, testID }: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.outlined, (pressed || disabled) && styles.dim]}>
      <View style={styles.row}>
        {Icon && <Icon size={20} color={colors.ink} />}
        <Text style={styles.outlinedText}>{label}</Text>
      </View>
    </Pressable>
  );
}

export function TextButton({ label, onPress, icon: Icon, disabled, testID }: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      disabled={disabled}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.text, (pressed || disabled) && styles.dim]}>
      <View style={styles.row}>
        {Icon && <Icon size={18} color={colors.coralText} />}
        <Text style={styles.textText}>{label}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primary: {
    backgroundColor: colors.ember,
    minHeight: 56,
    borderRadius: 16,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  primaryText: { ...bold, fontSize: 16, color: colors.panel },
  outlined: {
    backgroundColor: colors.panel,
    minHeight: 56,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  outlinedText: { ...bold, fontSize: 16, color: colors.ink },
  text: { paddingVertical: 8, paddingHorizontal: 4 },
  textText: { ...bold, fontSize: 15, color: colors.coralText },
  dim: { opacity: 0.6 },
});
