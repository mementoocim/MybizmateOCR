import { Stack } from 'expo-router';

import { colors } from '../../../lib/theme';

/**
 * The Sessions tab's own Stack: the list, and a session's screen over it, both under the bar. Anchored on the list, so
 * a session opened cold has the list under it. Every screen draws its own Header, on paper. It holds one session's
 * screen at a time (ruling T7-6): the camera's Done opens its session here while the tab may still show another one,
 * and that one goes, so Back from it is the list, then the camera.
 */
export const unstable_settings = { anchor: 'index' };

/** Every session's screen as one, for the Stack: a new one takes the old one's place. */
const oneSession = () => 'session';

export default function SessionsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.paper } }}>
      <Stack.Screen name="[id]" dangerouslySingular={oneSession} />
    </Stack>
  );
}
