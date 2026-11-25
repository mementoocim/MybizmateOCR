import type { ReactElement, ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, space, type } from '../lib/theme';
import { Button, type ButtonProps } from './Buttons';

// Camera first (spec §6.4 and §6.5, the approved mockup's cards): a card on the gutter that says where things stand,
// with at most one button. A headline (a header for TalkBack), its words in mute, anything the screen puts between
// them and the button, then the one button, full width. Plain is a panel in a line border; attention, while something
// is left to do, is the mockup's amber card: the warning tint in a warningLine border.

export function Card({
  title,
  body,
  tone = 'plain',
  action,
  children,
}: {
  title: string;
  body?: string | null;
  tone?: 'plain' | 'attention';
  action?: ButtonProps | null; // its one button, full width, under it
  children?: ReactNode; // between the body and the button
}): ReactElement {
  return (
    <View testID="card" style={[styles.card, tone === 'attention' ? styles.attention : styles.plain]}>
      <Text accessibilityRole="header" style={[type.headline, styles.title]}>
        {title}
      </Text>
      {body ? <Text style={[type.body, styles.body]}>{body}</Text> : null}
      {children}
      {action ? <Button {...action} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: radius.panel,
    padding: space.l,
    gap: space.s,
    marginHorizontal: space.l,
  },
  plain: { backgroundColor: colors.panel, borderColor: colors.line },
  attention: { backgroundColor: colors.warningTint, borderColor: colors.warningLine },
  title: { color: colors.ink },
  body: { color: colors.mute },
});
