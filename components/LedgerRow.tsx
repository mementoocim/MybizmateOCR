import { forwardRef } from 'react';
import { StyleSheet, Text, View, type ViewInstance } from 'react-native';

import { colors, space, touch, type } from '../lib/theme';
import { Badge, type BadgeSpec } from './Badge';
import { ChevronRight } from './icons';
import { Tap } from './Tap';

// Design B §5.6 and §9.5: a row of the Scan screen's ledger. A key ("Date"; none on item rows) and its value, a
// badge beside the value (a 2307's quarter), a sub-line, and, when flagged, the reason in warning. On the right, the
// amount, then a Check badge (flagged), an Edited badge (edited), or a chevron (pressable). A flagged row also has a
// 3 dp flag bar on its left: a flag is never color alone. It's one pressable that opens the row's boxes, and one stop
// for TalkBack (§7): "Date, Oct 29, 2026. Check: could also be read as Oct 28, 2026. Check the date."
//
// The key keeps its natural width and the value block has a basis of half the row, in a wrapping line, so the value
// moves under the key exactly when the key takes more than half the row: §11's stacking, measured by layout.

type LedgerRowProps = {
  label?: string; // the key ("Date"); none on item rows
  value: string | null;
  valueStyle?: 'value' | 'figure' | 'figureStrong'; // default 'value'
  badge?: BadgeSpec | null; // beside the value: the 2307 quarter
  sub?: string | null; // "2 × 110.00"
  subMono?: boolean;
  reason?: string | null; // shown only when flagged, in warning
  amount?: string | null; // the right column
  amountStrong?: boolean;
  flagged?: boolean;
  edited?: boolean;
  onPress?: () => void;
  accessibilityHint?: string; // default "Opens what the camera saw"
  testID?: string;
};

/** The flag bar's width, in dp (§5.1). */
const FLAG_BAR = 3;

/**
 * The ref is the row's own view (the pressable, when it has a press): a flag chip scrolls to it, and a sheet returns
 * focus to it.
 */
export const LedgerRow = forwardRef<ViewInstance, LedgerRowProps>(function LedgerRow(
  {
    label,
    value,
    valueStyle = 'value',
    badge,
    sub,
    subMono = false,
    reason,
    amount,
    amountStrong = false,
    flagged = false,
    edited = false,
    onPress,
    accessibilityHint,
    testID,
  },
  ref,
) {
  const pressable = onPress !== undefined;
  const end = flagged ? (
    <Badge label="Check" tone="warning" />
  ) : edited ? (
    <Badge label="Edited" tone="neutral" />
  ) : pressable ? (
    <ChevronRight size={touch.iconSmall} color={colors.chevron} />
  ) : null;
  const content = (
    <>
      {flagged ? <View testID="flag-bar" style={styles.bar} /> : null}
      <View style={styles.line}>
        <View style={styles.keyAndValue}>
          {label ? <Text style={[type.label, styles.key]}>{label}</Text> : null}
          <View style={styles.valueBlock}>
            <View style={styles.valueLine}>
              <Text style={[type[valueStyle], styles.value]}>{value ?? '—'}</Text>
              {badge ? <Badge {...badge} /> : null}
            </View>
            {sub ? <Text style={[subMono ? type.figureSmall : type.label, styles.sub]}>{sub}</Text> : null}
            {flagged && reason ? <Text style={[type.label, styles.reason]}>{reason}</Text> : null}
          </View>
        </View>
        {amount || end ? (
          <View style={styles.right}>
            {amount ? (
              <Text style={[amountStrong ? type.figureStrong : type.figure, styles.amount]}>{amount}</Text>
            ) : null}
            {end}
          </View>
        ) : null}
      </View>
    </>
  );
  const a11y = {
    accessibilityLabel: spokenLabel({ label, value, sub, amount, reason, flagged, edited }),
    testID,
    style: styles.row,
  };

  if (!pressable) {
    return (
      <View ref={ref} accessible {...a11y}>
        {content}
      </View>
    );
  }
  return (
    <Tap
      ref={ref}
      accessibilityRole="button"
      accessibilityHint={accessibilityHint ?? 'Opens what the camera saw'}
      {...a11y}
      onPress={onPress}
      focusRing="inside" // rows stack edge to edge (ruling T4-1)
      focusRadius={0}>
      {content}
    </Tap>
  );
});

/**
 * What TalkBack says (§7): the key, the value ("blank" when empty), the sub-line and the amount; then the flag and its
 * reason, or that the value was edited.
 */
function spokenLabel({
  label,
  value,
  sub,
  amount,
  reason,
  flagged,
  edited,
}: Pick<LedgerRowProps, 'label' | 'value' | 'sub' | 'amount' | 'reason' | 'flagged' | 'edited'>): string {
  const said = [label, value ?? 'blank', sub, amount].filter(Boolean).join(', ');
  if (flagged) return reason ? `${said}. Check: ${lowerFirst(reason)}` : `${said}. Check`;
  return edited ? `${said}, edited` : said;
}

/** "Could also be read as …" → "could also be read as …", to follow "Check:". */
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

const styles = StyleSheet.create({
  // A one-line row is centred in 48 dp; a taller one is as tall as its lines.
  row: {
    minHeight: touch.target,
    justifyContent: 'center',
    paddingVertical: space.m,
    paddingHorizontal: space.l,
    backgroundColor: colors.panel,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  bar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: FLAG_BAR, backgroundColor: colors.flag },
  // The right column sits on the value's first line, as in a ledger.
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: space.m },
  keyAndValue: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', columnGap: space.m, rowGap: space.xs },
  key: { color: colors.mute, paddingTop: 1 }, // optical: the key's 18 sp line sits level with the value's 20
  valueBlock: { flexGrow: 1, flexBasis: '50%' },
  valueLine: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: space.s, rowGap: space.xs },
  value: { color: colors.ink },
  sub: { color: colors.mute },
  reason: { color: colors.warning },
  // Its own width up to half the row; the amount over the badge or chevron, so amounts line up down a section.
  right: { alignItems: 'flex-end', gap: space.xs, flexShrink: 1, maxWidth: '50%' },
  amount: { color: colors.ink, textAlign: 'right' },
});
