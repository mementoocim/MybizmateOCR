import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, space, touch, type } from '../lib/theme';
import { CircleAlert, type IconComponent, TriangleAlert } from './icons';

// Design B §5.6: a banner in place of the warning lines in sheets, and for a file that couldn't be read. A tint fill
// in a 1 dp line border (the tone's line color: ruling T4-3), then an icon and the words in the tone's color, so the
// meaning isn't color alone. For TalkBack it's one alert.

type Tone = 'warning' | 'danger';

const TONES: Record<Tone, { Icon: IconComponent; color: string; fill: string; border: string }> = {
  warning: { Icon: TriangleAlert, color: colors.warning, fill: colors.warningTint, border: colors.warningLine },
  danger: { Icon: CircleAlert, color: colors.danger, fill: colors.dangerTint, border: colors.dangerLine },
};

export function Banner({ tone, text }: { tone: Tone; text: string }) {
  const { Icon, color, fill, border } = TONES[tone];
  return (
    <View accessible accessibilityRole="alert" style={[styles.banner, { backgroundColor: fill, borderColor: border }]}>
      <Icon size={touch.iconSmall} color={color} />
      <Text style={[type.body, styles.text, { color }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.s,
    padding: space.m,
    borderWidth: 1,
    borderRadius: radius.panel,
  },
  text: { flex: 1 },
});
