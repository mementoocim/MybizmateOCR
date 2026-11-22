import { type ReactNode, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, space } from '../lib/theme';
import { Button, type ButtonProps, type ButtonVariant } from './Buttons';

// Design B §5.6 and §8: the fixed bar under Scan and Saved, and the button row it holds (sheets' action rows and
// Home's capture row use the row too). The bar is a panel on a hairline, padded 12 and by the navigation bar's inset,
// with an optional line (a saved line, say) above its buttons. In the row, buttons sit side by side: primary 1,
// secondary and destructive 0.8, text buttons at their own width. When any label wraps (large text, a narrow phone),
// they stack full width in the given order, which puts the primary last. A row that stacked stays stacked for those
// labels at that width and font size: once full width the labels fit on one line, and flipping back would loop.

export function ButtonRow({ buttons }: { buttons: readonly ButtonProps[] }) {
  const { width, fontScale } = useWindowDimensions();
  const key = `${buttons.map((b) => b.label).join('|')}|${width}|${fontScale}`;
  const [stackedKeys, setStackedKeys] = useState<ReadonlySet<string>>(() => new Set());
  const stacked = stackedKeys.has(key);
  const lone = buttons.length === 1;

  const onLines = (lines: number) => {
    if (lines > 1) setStackedKeys((keys) => (keys.has(key) ? keys : new Set(keys).add(key)));
  };

  return (
    <View testID="button-row" style={stacked ? styles.stacked : styles.row}>
      {buttons.map((b) => (
        <View key={b.label} style={stacked ? null : flexOf(b.variant ?? 'primary', lone)}>
          <Button
            {...b}
            onLabelLines={(lines) => {
              b.onLabelLines?.(lines);
              onLines(lines);
            }}
          />
        </View>
      ))}
    </View>
  );
}

export function BottomBar({ buttons, children }: { buttons: readonly ButtonProps[]; children?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View testID="bottom-bar" style={[styles.bar, { paddingBottom: space.m + insets.bottom }]}>
      {children}
      <ButtonRow buttons={buttons} />
    </View>
  );
}

/** A button's share of the row. Alone, a secondary or destructive button fills it, as a primary does. */
function flexOf(variant: ButtonVariant, lone: boolean) {
  if (variant === 'text' || variant === 'destructiveText') return styles.natural;
  return variant === 'primary' || lone ? styles.primary : styles.secondary;
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.panel,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    paddingHorizontal: space.l,
    paddingTop: space.m,
    gap: space.m,
  },
  row: { flexDirection: 'row', gap: space.m },
  stacked: { flexDirection: 'column', gap: space.m },
  primary: { flex: 1 },
  secondary: { flex: 0.8 },
  // Its own width, but it can still shrink: a label too long for the row then wraps, and the row stacks.
  natural: { flexShrink: 1 },
});
