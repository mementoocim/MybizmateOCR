import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { TEAM_BUILD } from '../lib/build';
import { colors } from '../lib/theme';

/**
 * A team screen's content, in team builds only. A link (mybizmatescan://speed) opens a route in any build, so in the
 * builds clients install the screen shows just one line.
 */
export function TeamOnly({ children }: { children: ReactNode }) {
  if (TEAM_BUILD) return <>{children}</>;
  return (
    <View style={styles.screen}>
      <Text style={styles.line}>This is for team builds.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper, padding: 20 },
  line: { fontSize: 15, color: colors.mute, lineHeight: 22 },
});
