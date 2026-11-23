import { useIsFocused } from 'expo-router';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { setBottomClearance } from '../lib/snackbar';
import { colors, space } from '../lib/theme';
import { Button, type ButtonProps, type ButtonVariant } from './Buttons';

// Design B §5.6 and §8: the fixed bar under Scan and Saved, and the button row it holds (sheets' action rows and
// Home's capture row use the row too). The bar is a panel on a hairline, padded 12 and by the navigation bar's inset,
// with an optional line (a saved line, say) above its buttons. In the row, buttons sit side by side: primary 1,
// secondary and destructive 0.8, text buttons at their own width. A button that's the only one to grow, alone or
// beside text buttons, fills what they leave, as a primary does (the supplier sheet's Use this name, beside Add to
// your suppliers). When any label wraps (large text, a narrow phone), they stack full width in the given order, which
// puts the primary last. A row that stacked stays stacked for those labels at that width and font size: once full
// width the labels fit on one line, and flipping back would loop. While its screen is the one on top (focused), the
// bar reports its height, so the snackbar sits above it (lib/snackbar). It withdraws it when another screen goes over
// it, and reports again when its screen is back on top. So a bar that mounts on a covered screen (Saved's, when a save
// on the Scan screen over it gives it something to export) never moves the message on the screen on top (T19-5). A
// new height, as it lays out again, keeps its place in the order.

export function ButtonRow({ buttons }: { buttons: readonly ButtonProps[] }) {
  const { width, fontScale } = useWindowDimensions();
  const key = `${buttons.map((b) => b.label).join('|')}|${width}|${fontScale}`;
  const [stackedKeys, setStackedKeys] = useState<ReadonlySet<string>>(() => new Set());
  const stacked = stackedKeys.has(key);
  const lone = buttons.filter((b) => !isText(b.variant ?? 'primary')).length === 1; // text buttons don't grow

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
  const focused = useIsFocused();
  const ownerRef = useRef(null); // this bar, as the clearance knows it
  const [height, setHeight] = useState<number | null>(null); // as last laid out
  // Withdrawn only when covered or gone, so a new height keeps the bar's place in the order (ruling T25b-1).
  useEffect(() => {
    if (!focused) return;
    return () => setBottomClearance(ownerRef, null);
  }, [focused]);
  useEffect(() => {
    if (focused && height !== null) setBottomClearance(ownerRef, height);
  }, [focused, height]);
  return (
    <View
      testID="bottom-bar"
      onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
      style={[styles.bar, { paddingBottom: space.m + insets.bottom }]}>
      {children}
      <ButtonRow buttons={buttons} />
    </View>
  );
}

/** A text button keeps its own width: it never grows. */
function isText(variant: ButtonVariant): boolean {
  return variant === 'text' || variant === 'destructiveText';
}

/**
 * A button's share of the row. The only one that grows (lone), a secondary or destructive button fills what the text
 * buttons leave, as a primary does.
 */
function flexOf(variant: ButtonVariant, lone: boolean) {
  if (isText(variant)) return styles.natural;
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
