import { StyleSheet, Text } from 'react-native';

import { colors, radius, space, touch, type } from '../lib/theme';
import { Tap } from './Tap';

// Design B §5.6, §6 and §7: a flag chip, in the status strip. A pill with a panel fill in a warning line, holding a
// problem word as it is today ("Date", "Row 2 math", "Customer (not in your list)"); it opens the row the problem is
// about (lib/flagTargets). TalkBack says "Date, to check", as a button. It's 40 dp tall with hitSlop to a 48 dp target,
// and at large text a long word wraps inside it rather than run off the strip.

/** A 40 dp chip's hitSlop on every side, to a 48 dp target. */
export const CHIP_SLOP = (touch.target - touch.chip) / 2;

export function FlagChip({ problem, onPress }: { problem: string; onPress: () => void }) {
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={`${problem}, to check`}
      onPress={onPress}
      hitSlop={CHIP_SLOP}
      focusRadius={radius.pill}
      style={styles.chip}>
      <Text style={[type.label, styles.word]}>{problem}</Text>
    </Tap>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: touch.chip,
    maxWidth: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.m,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.warningLine,
    backgroundColor: colors.panel,
  },
  word: { color: colors.ink, textAlign: 'center' },
});
