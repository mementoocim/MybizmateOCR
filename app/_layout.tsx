import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerTintColor: '#B13E03' }}>
      <Stack.Screen name="index" options={{ title: 'MyBizMate Scan' }} />
    </Stack>
  );
}
