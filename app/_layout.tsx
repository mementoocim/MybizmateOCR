import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { BrandSplash } from '../components/BrandSplash';
import { SnackbarHost } from '../components/Snackbar';
import { resumeQueue } from '../lib/captureQueue';
import { currentSnack, dismissSnack } from '../lib/snackbar';
import { resetStarted, setStarted } from '../lib/startup';
import { colors } from '../lib/theme';

// The phone's own splash stays up until the brand splash has drawn; that one stays until the scanner is ready.
SplashScreen.preventAutoHideAsync().catch(() => {});

/**
 * The tabs are always at the bottom of the Stack (ruling T24-1's anchor, moved to the tabs group by camera first,
 * spec §6.1): a link opened cold (mybizmatescan://speed, mybizmatescan://lists) has the tabs under it, on the camera,
 * the tabs' own anchor, so Back has somewhere to go. The Scan screen, Saved, Your lists, the licenses and the team
 * screens open above the tabs, with no bar. expo-router 58 calls this the anchor; its older name, initialRouteName,
 * still works but warns that it's deprecated.
 */
export const unstable_settings = { anchor: '(tabs)' };

export default function RootLayout() {
  useState(resetStarted); // before its screens render: not started until its splash has gone (ruling T3-1)
  const [ready, setReady] = useState(false);
  // Once the splash has gone, the app has started: the camera may start, and the queue reads what a closed app left in
  // files/queue (lib/captureQueue), now that the recent scans are loaded.
  const onReady = useCallback(() => {
    setReady(true);
    setStarted(true);
    void resumeQueue();
  }, []);
  // A new font size, display size or language restarts Android's activity in the same JS context, and this root mounts
  // anew (ruling T26-4), its splash up again: until it goes, the app hasn't started (reset as it rendered; this tells
  // the old root's screens too). A message from before it goes: its action (a save's View) is bound to the old root's
  // router, so it would do nothing (the final review's Minor 6).
  useEffect(() => {
    setStarted(false);
    const before = currentSnack();
    if (before) dismissSnack(before.id);
  }, []);
  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
      <StatusBar style="dark" />
      {/* Every screen draws its own Header, so no route shows the Stack's. The camera's black is its tab's scene's. */}
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.paper } }} />
      {/* The snackbar's root host, over every screen; an open sheet or the photo viewer has its own. */}
      <SnackbarHost />
      {!ready && <BrandSplash onReady={onReady} />}
    </View>
  );
}
