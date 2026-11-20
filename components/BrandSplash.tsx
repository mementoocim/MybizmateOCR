import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { Animated, Image, StyleSheet, Text, View } from 'react-native';

import { sampleUri } from '../lib/samples';
import { loadAppData } from '../lib/startup';
import { bold, colors } from '../lib/theme';
import { preload, scanPhoto } from '../modules/scanner';
import { LoadingBar } from './ReadingOverlay';

const MIN_MS = 1200; // the splash shows at least this long
const FADE_MS = 300;

/**
 * The brand while the scanner gets ready (the test app's SplashActivity): the model loads, what the app keeps on the
 * phone comes back (recent scans, lists, settings), and one sample is read once so the first real scan is quick. Then
 * it fades out and calls onReady. The logo sits where the phone's own splash drew it (104 dp, centred), so it doesn't
 * jump; only the words under it fade in.
 */
export function BrandSplash({ onReady }: { onReady: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [brandIn] = useState(() => new Animated.Value(0));
  const [out] = useState(() => new Animated.Value(1));

  useEffect(() => {
    let live = true;
    const start = Date.now();
    Animated.timing(brandIn, { toValue: 1, duration: 450, useNativeDriver: true }).start();
    (async () => {
      try {
        await preload();
        await loadAppData();
        try {
          await scanPhoto(await sampleUri('inv_0001'), { keepFiles: false });
        } catch {
          // the warm-up only makes the first real scan quicker: the app opens without it
        }
        await new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, MIN_MS - (Date.now() - start))));
        if (!live) return;
        Animated.timing(out, { toValue: 0, duration: FADE_MS, useNativeDriver: true }).start();
        setTimeout(() => live && onReady(), FADE_MS);
      } catch (e: unknown) {
        if (live) setError(`The scanner couldn't start: ${(e as Error)?.message ?? String(e)}`);
      }
    })();
    return () => {
      live = false;
    };
  }, [brandIn, out, onReady]);

  const rise = brandIn.interpolate({ inputRange: [0, 1], outputRange: [12, 0] });
  return (
    <Animated.View style={[styles.screen, { opacity: out }]} onLayout={() => void SplashScreen.hideAsync().catch(() => {})}>
      <View testID="splash-brand" style={styles.brand}>
        <Image testID="splash-logo" source={require('../assets/brand/logo_mark.png')} style={styles.logo} />
        <Animated.View style={[styles.words, { opacity: brandIn, transform: [{ translateY: rise }] }]}>
          <Text style={styles.wordmark}>
            mybizmate<Text style={styles.io}>.io</Text>
          </Text>
          <Text style={styles.tagline}>Scan invoices. Even offline.</Text>
        </Animated.View>
      </View>
      <View style={styles.bottom}>
        {error ? (
          <Text style={styles.error}>{error}</Text>
        ) : (
          <>
            <LoadingBar width={140} />
            <Text style={styles.loading}>Getting the scanner ready…</Text>
          </>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The logo's centre at the screen's centre, as the phone's splash draws it.
  brand: { position: 'absolute', top: '50%', marginTop: -52, left: 0, right: 0, alignItems: 'center', gap: 12 },
  words: { alignItems: 'center', gap: 12 },
  logo: { width: 104, height: 104 },
  wordmark: { ...bold, fontSize: 32, color: colors.ink },
  io: { color: colors.coralText },
  tagline: { fontSize: 16, color: colors.mute },
  bottom: { position: 'absolute', bottom: 72, alignItems: 'center', gap: 12, paddingHorizontal: 24 },
  loading: { fontSize: 14, color: colors.mute },
  error: { fontSize: 15, color: colors.ember, textAlign: 'center' },
});
