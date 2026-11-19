import { Stack } from 'expo-router';
import { useEffect } from 'react';

import { preload } from '../modules/scanner';

export default function RootLayout() {
  useEffect(() => {
    const start = Date.now();
    preload()
      .then(() => console.log(`scanner ready in ${Date.now() - start} ms`))
      .catch((e) => console.warn('scanner failed to load', e));
  }, []);

  return (
    <Stack screenOptions={{ headerTintColor: '#B13E03' }}>
      <Stack.Screen name="index" options={{ title: 'MyBizMate Scan' }} />
      <Stack.Screen name="result" options={{ title: 'Scan' }} />
    </Stack>
  );
}
