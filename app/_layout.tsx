import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { BrandSplash } from '../components/BrandSplash';
import { SnackbarHost } from '../components/Snackbar';
import { resumeQueue } from '../lib/captureQueue';
import { currentSnack, dismissSnack } from '../lib/snackbar';
import { setStarted } from '../lib/startup';
import { colors } from '../lib/theme';

// The phone's own splash stays up until the brand splash has drawn; that one stays until the scanner is ready.
SplashScreen.preventAutoHideAsync().catch(() => {});

/**
 * Home is always at the bottom of the Stack (ruling T24-1): a link opened cold (mybizmatescan://camera?test=…,
 * mybizmatescan://speed) has Home under it, so Back and Close have somewhere to go. expo-router 58 calls this the
 * anchor; its older name, initialRouteName, still works but warns that it's deprecated.
 */
export const unstable_settings = { anchor: 'index' };

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  // Once the splash has gone, the app has started: the camera may start, and the queue reads what a closed app left in
  // files/queue (lib/captureQueue), now that the recent scans are loaded.
  const onReady = useCallback(() => {
    setReady(true);
    setStarted(true);
    void resumeQueue();
  }, []);
  // A new font size, display size or language restarts Android's activity in the same JS context, and this root mounts
  // anew (ruling T26-4), its splash up again: until it goes, the app hasn't started. A message from before it goes: its
  // action (a save's View) is bound to the old root's router, so it would do nothing (the final review's Minor 6).
  useEffect(() => {
    setStarted(false);
    const before = currentSnack();
    if (before) dismissSnack(before.id);
  }, []);
  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
      <StatusBar style="dark" />
      {/* Every screen draws its own Header, so no route shows the Stack's. */}
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.paper } }}>
        <Stack.Screen name="camera" options={{ contentStyle: { backgroundColor: colors.camera } }} />
      </Stack>
      {/* The snackbar's root host, over every screen; an open sheet or the photo viewer has its own. */}
      <SnackbarHost />
      {!ready && <BrandSplash onReady={onReady} />}
    </View>
  );
}
