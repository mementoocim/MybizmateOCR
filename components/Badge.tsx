import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, space, type } from '../lib/theme';

// Design B §5.6: a badge is a short status in caps mono (the `badge` style uppercases it, so the words stay sentence
// case for TalkBack and tests), on its tone's tint, in a 1 dp line of the text color at 30%. In a row, its words are
// part of the row's spoken label (§7); the row says so, not the badge.

export type BadgeTone = 'warning' | 'success' | 'brand' | 'neutral' | 'danger';
export type BadgeSpec = { label: string; tone: BadgeTone };

/** Each tone's text on its fill, and its line: warningLine for warning, and line for the others. */
const TONES: Record<BadgeTone, { text: string; fill: string; line: string }> = {
  warning: { text: colors.warning, fill: colors.warningTint, line: colors.warningLine },
  success: { text: colors.success, fill: colors.successTint, line: colors.line },
  brand: { text: colors.brandText, fill: colors.brandTint, line: colors.line },
  neutral: { text: colors.mute, fill: colors.sand, line: colors.line },
  danger: { text: colors.danger, fill: colors.dangerTint, line: colors.line },
};

export function Badge({ label, tone }: BadgeSpec) {
  const { text, fill, line } = TONES[tone];
  return (
    <View style={[styles.badge, { backgroundColor: fill, borderColor: line }]}>
      <Text style={[type.badge, { color: text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderWidth: 1,
    borderRadius: radius.badge,
    paddingHorizontal: space.s - 2, // optical: caps sit snug in a badge, as on mybizmate.io
  },
});
