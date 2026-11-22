import { StyleSheet, Text, View } from 'react-native';

import { colors, space, type } from '../lib/theme';
import { Button, type ButtonVariant } from './Buttons';

// Design B §5.6: what a screen or a tab shows with nothing in it. A title, a sentence on what to do, and the actions
// that do it, centred. The first action is the primary one unless it says otherwise; any others are secondary.

export function EmptyState({
  title,
  body,
  actions = [],
}: {
  title: string;
  body?: string;
  actions?: readonly { label: string; onPress: () => void; variant?: ButtonVariant }[];
}) {
  return (
    <View style={styles.empty}>
      <Text style={[type.title, styles.title]}>{title}</Text>
      {body ? <Text style={[type.body, styles.body]}>{body}</Text> : null}
      {actions.map(({ label, onPress, variant }, i) => (
        <Button key={label} label={label} onPress={onPress} variant={variant ?? (i === 0 ? 'primary' : 'secondary')} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', gap: space.m, padding: space.xl },
  title: { color: colors.ink, textAlign: 'center' },
  body: { color: colors.mute, textAlign: 'center' },
});
