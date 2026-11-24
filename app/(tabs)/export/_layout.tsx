import { Stack } from 'expo-router';

import { colors } from '../../../lib/theme';

/**
 * The Export tab's own Stack, under the bar, anchored on its first screen. Every screen draws its own Header, on
 * paper.
 */
export const unstable_settings = { anchor: 'index' };

export default function ExportLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.paper } }} />;
}
