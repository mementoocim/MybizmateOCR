import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, space, touch, type } from '../lib/theme';
import { Badge, type BadgeSpec } from './Badge';
import { Check, ChevronRight } from './icons';
import { Tap } from './Tap';

// Design B §5.6: a row of a list (Home's recent scans and exports, Saved, Your lists, the pickers, Settings). What
// leads (a sample's thumbnail), a title and a sub-line, then on the right an amount with a badge under it, then a
// chevron, or a check when the row's step is done. A white row on a hairline. Pressable or not, it's one stop for
// TalkBack: its label says the title, the sub-line, the amount and the badge (§7).

export function ListRow({
  title,
  sub,
  subMono = false,
  subCaps = false,
  leading,
  amount,
  badge,
  chevron = false,
  checked,
  onPress,
  onLongPress,
  accessibilityHint,
  testID,
}: {
  title: string;
  sub?: string | null;
  subMono?: boolean; // times, codes, dates and TINs
  subCaps?: boolean;
  leading?: ReactNode; // a sample's thumbnail, a check
  amount?: string | null;
  badge?: BadgeSpec | null; // under the amount
  chevron?: boolean;
  checked?: boolean; // a step: done shows a check in place of the chevron
  onPress?: () => void;
  onLongPress?: () => void; // with onPress: a row without onPress has no press at all
  accessibilityHint?: string;
  testID?: string;
}) {
  const label = [title, sub, amount, badge?.label].filter(Boolean).join(', ');
  const a11y = {
    accessibilityLabel: label,
    accessibilityHint,
    accessibilityState: checked === undefined ? undefined : { checked },
    testID,
    style: styles.row,
  };
  const content = (
    <>
      {leading}
      <View style={styles.words}>
        <Text style={[type.value, styles.title]}>{title}</Text>
        {sub ? (
          <Text style={[subMono ? type.figureSmall : type.label, styles.sub, subCaps && styles.caps]}>{sub}</Text>
        ) : null}
      </View>
      {amount || badge ? (
        <View style={styles.trailing}>
          {amount ? <Text style={[type.figure, styles.amount]}>{amount}</Text> : null}
          {badge ? (
            // in the row's label, so not a stop of its own
            <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
              <Badge {...badge} />
            </View>
          ) : null}
        </View>
      ) : null}
      {checked ? (
        <Check size={touch.iconSmall} color={colors.success} />
      ) : chevron ? (
        <ChevronRight size={touch.iconSmall} color={colors.chevron} />
      ) : null}
    </>
  );

  if (onPress === undefined) {
    return (
      <View accessible {...a11y}>
        {content}
      </View>
    );
  }
  return (
    <Tap
      accessibilityRole="button"
      {...a11y}
      onPress={onPress}
      onLongPress={onLongPress}
      focusRing="inside" // rows stack edge to edge (ruling T4-1)
      focusRadius={0}>
      {content}
    </Tap>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    minHeight: touch.target,
    paddingVertical: space.m,
    paddingHorizontal: space.l,
    backgroundColor: colors.panel,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  words: { flex: 1 },
  title: { color: colors.ink },
  sub: { color: colors.mute },
  caps: { textTransform: 'uppercase' },
  // Its own width up to half the row, so a long title keeps room; past that, the amount and the badge wrap.
  trailing: { alignItems: 'flex-end', gap: space.xs, flexShrink: 1, maxWidth: '50%' },
  amount: { color: colors.ink, textAlign: 'right' },
});
