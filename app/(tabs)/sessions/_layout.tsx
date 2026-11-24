import { Stack } from 'expo-router';

import { colors } from '../../../lib/theme';

/**
 * The Sessions tab's own Stack: the list, and a session's screen over it, both under the bar. Anchored on the list, so
 * a session opened cold has the list under it. Every screen draws its own Header, on paper.
 */
export const unstable_settings = { anchor: 'index' };

export default function SessionsLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.paper } }} />;
}
