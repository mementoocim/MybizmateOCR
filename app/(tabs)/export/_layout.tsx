import { Stack } from 'expo-router';

import { colors } from '../../../lib/theme';

/**
 * The Export tab's own Stack, under the bar, anchored on its first screen. Every screen draws its own Header, on
 * paper. It holds one file's screen at a time (ruling T10-2, as Sessions' Stack holds one session's: T7-6): a file
 * opened while the tab may still show another one takes its place, so Back from it is step 1, then the camera. A link
 * into the tab from elsewhere (Home's Go to Export, a save's View) first takes it back to step 1 (lib/navigation's
 * useOpenOnce, ruling T12-1). The screen keys its content on the file, so nothing of the last one carries over.
 */
export const unstable_settings = { anchor: 'index' };

/** Every file's screen as one, for the Stack: a new one takes the old one's place. */
const oneFile = () => 'file';

export default function ExportLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.paper } }}>
      <Stack.Screen name="[which]" dangerouslySingular={oneFile} />
    </Stack>
  );
}
