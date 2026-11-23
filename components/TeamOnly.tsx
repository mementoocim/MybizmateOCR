import type { ReactNode } from 'react';
import { StyleSheet, Text } from 'react-native';

import { TEAM_BUILD } from '../lib/build';
import { colors, space, type } from '../lib/theme';

/**
 * A team screen's content, in team builds only. A link (mybizmatescan://speed) opens a route in any build, so in the
 * builds clients install the screen shows just one line. It sits inside the screen's Screen, under its Header, so
 * either way the screen keeps its title and its Back.
 */
export function TeamOnly({ children }: { children: ReactNode }) {
  if (TEAM_BUILD) return <>{children}</>;
  return <Text style={[type.body, styles.line]}>This is for team builds.</Text>;
}

const styles = StyleSheet.create({
  line: { color: colors.mute, padding: space.l },
});
