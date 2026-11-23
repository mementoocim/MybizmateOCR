import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { BrandSplash } from '../components/BrandSplash';
import { SnackbarHost } from '../components/Snackbar';
import { bold, colors } from '../lib/theme';

// The phone's own splash stays up until the brand splash has drawn; that one stays until the scanner is ready.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const onReady = useCallback(() => setReady(true), []);
  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerTintColor: colors.coralText,
          headerTitleStyle: { ...bold, color: colors.ink },
          headerStyle: { backgroundColor: colors.panel },
          contentStyle: { backgroundColor: colors.paper },
        }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="camera" options={{ headerShown: false, contentStyle: { backgroundColor: '#000000' } }} />
        <Stack.Screen name="result" options={{ headerShown: false }} />
        <Stack.Screen name="speed" options={{ headerShown: false }} />
        <Stack.Screen name="training" options={{ headerShown: false }} />
        <Stack.Screen name="settings" options={{ headerShown: false }} />
        <Stack.Screen name="saved" options={{ headerShown: false }} />
        <Stack.Screen name="lists" options={{ headerShown: false }} />
        <Stack.Screen name="licenses" options={{ headerShown: false }} />
        <Stack.Screen name="license" options={{ headerShown: false }} />
      </Stack>
      {/* The snackbar's root host, over every screen; an open sheet or the photo viewer has its own. */}
      <SnackbarHost />
      {!ready && <BrandSplash onReady={onReady} />}
    </View>
  );
}
