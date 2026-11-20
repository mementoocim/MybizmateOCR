import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { BrandSplash } from '../components/BrandSplash';
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
        <Stack.Screen name="result" options={{ title: 'Scan' }} />
        <Stack.Screen name="speed" options={{ title: 'Speed test' }} />
      </Stack>
      {!ready && <BrandSplash onReady={onReady} />}
    </View>
  );
}
