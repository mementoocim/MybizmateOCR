import { Pressable, StyleSheet, Text, View } from 'react-native';

import { bold, colors } from '../lib/theme';
import { ChevronRight } from './icons';

/**
 * A row of the sale (the test app's Ui.row): a label column (left out for items), the value with a line under it
 * (ember when flagged), an amount on the right for items, an amber dot when a person should look, and a chevron when
 * it opens what the camera saw.
 */
export function SaleRow({
  label,
  value,
  sub,
  flagged,
  amount,
  onPress,
}: {
  label?: string;
  value: string | null;
  sub?: string | null;
  flagged?: boolean;
  amount?: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      {label !== undefined && <Text style={styles.label}>{label}</Text>}
      <View style={styles.words}>
        <Text style={styles.value}>{value ?? '—'}</Text>
        {sub ? <Text style={[styles.sub, flagged && styles.flagged]}>{sub}</Text> : null}
      </View>
      {amount !== undefined && <Text style={styles.amount}>{amount}</Text>}
      {flagged && <View style={styles.dot} />}
      {onPress && <ChevronRight size={22} color={colors.line} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingVertical: 13,
    paddingLeft: 16,
    paddingRight: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  pressed: { opacity: 0.6 },
  label: { width: 104, fontSize: 14, color: colors.mute },
  words: { flex: 1 },
  value: { ...bold, fontSize: 15, color: colors.ink },
  sub: { fontSize: 12, color: colors.mute, marginTop: 2 },
  flagged: { color: colors.ember },
  amount: { ...bold, fontSize: 15, color: colors.ink, marginLeft: 10 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.amber, marginLeft: 8 },
});
