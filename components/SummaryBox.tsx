import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, space, type } from '../lib/theme';
import { Badge, type BadgeSpec } from './Badge';

// Design B §9.6, and §9.8 for an export's file: what a save or an export will hold, in a sand box with the panel's
// corners. Each line is a key in caps mono (the overline style, mute) and its value: in figures (mono) for amounts and
// dates, else in the value style, with an optional badge beside it ("New"). As in a ledger row (§11), the key keeps its
// own width, at least a column's so that the values after short keys line up, and the value block's basis is half the
// line, so the value moves under its key when the key takes more than half of it. A line is one stop for TalkBack,
// which says its key, its value and its badge (§7; ruling T4-4).

export type SummaryLine = { key: string; value: string; mono?: boolean; badge?: BadgeSpec | null };

/** The keys' column, as a share of the line: the values after DATE, CUSTOMER or TAX WITHHELD line up. */
const KEY_COLUMN = '35%';

export function SummaryBox({ lines }: { lines: readonly SummaryLine[] }) {
  return (
    <View style={styles.box}>
      {lines.map(({ key, value, mono = false, badge }) => (
        <View
          key={key}
          accessible
          accessibilityLabel={[key, value, badge?.label].filter(Boolean).join(', ')}
          style={styles.line}>
          <Text style={[type.overline, styles.key]}>{key}</Text>
          {/* the badge sits in a row with the value, so it keeps its own width */}
          <View style={styles.valueLine}>
            <Text style={[mono ? type.figure : type.value, styles.value]}>{value}</Text>
            {badge ? <Badge {...badge} /> : null}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: colors.sand, borderRadius: radius.panel, padding: space.m, gap: space.s },
  line: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', columnGap: space.m, rowGap: space.xs },
  key: { minWidth: KEY_COLUMN, color: colors.mute, paddingTop: 2 }, // optical: its 16 sp line level with the value's 20
  valueLine: {
    flexGrow: 1,
    flexBasis: '50%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: space.s,
    rowGap: space.xs,
  },
  value: { color: colors.ink },
});
