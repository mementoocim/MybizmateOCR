import { StyleSheet, Text, View } from 'react-native';

import { colors, space, touch, type } from '../lib/theme';
import { Tap } from './Tap';

// Design B §5.6: a section strip, the web's table header. A sand strip with its title on the left, as a header for
// TalkBack, and on the right a column's name ("Amount"), a count ("0 of 2") or a text action (none uses one since
// Home became cards). All in the overline style. The action fills the strip's height and reaches its right edge, so
// it's a 48 dp target; the strip grows to hold it.

export function SectionHeader({
  title,
  right,
  action,
}: {
  title: string;
  right?: string | null; // "Amount", "0 of 2"
  action?: { label: string; onPress: () => void } | null; // a text action, "Label ›"
}) {
  return (
    <View style={styles.strip}>
      <Text accessibilityRole="header" style={[type.overline, styles.title]}>
        {title}
      </Text>
      {right ? <Text style={[type.overline, styles.right]}>{right}</Text> : null}
      {action ? (
        <Tap
          accessibilityRole="button"
          accessibilityLabel={action.label}
          onPress={action.onPress}
          focusRing="inside" // the strip is full-bleed, like a row (ruling T4-1)
          style={styles.action}>
          <Text style={[type.overline, styles.actionLabel]}>{`${action.label} ›`}</Text>
        </Tap>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    paddingVertical: space.s,
    paddingHorizontal: space.l,
    backgroundColor: colors.sand,
  },
  title: { flex: 1, color: colors.mute },
  right: { color: colors.mute },
  // Out over the strip's padding: the strip's full height, to its right edge, with the label where the padding puts it.
  action: {
    minHeight: touch.target,
    minWidth: touch.target,
    justifyContent: 'center',
    alignItems: 'flex-end',
    marginVertical: -space.s,
    marginRight: -space.l,
    paddingLeft: space.s,
    paddingRight: space.l,
  },
  actionLabel: { color: colors.brandText },
});
