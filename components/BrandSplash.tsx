import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TEAM_BUILD } from '../lib/build';
import { sampleUri } from '../lib/samples';
import { loadAppData } from '../lib/startup';
import { colors, space, type } from '../lib/theme';
import { preload, scanPhoto } from '../modules/scanner';
import { Button } from './Buttons';
import { LoadingBar } from './ReadingOverlay';

// Design B §9.1 and §12 A11: the brand while the scanner gets ready. The model loads, what the app keeps on the phone
// comes back (recent scans, saved scans, lists, settings), and one sample is read once so the first real scan is quick.
// It shows for half a second at least, so it doesn't flash, then fades out and calls onReady; nothing else on it moves
// (§5.5). The logo sits where the phone's own splash drew it (104 dp, centred), so it doesn't jump, with the words
// under it. A start that fails says so in plain words, each a polite live region, with Try again outside them, so its
// spinner doesn't read them out again. Try again runs the whole start again, which is safe, as each piece reads its
// files again and replaces what it holds. The button loads until that start has finished, so a double tap runs once.
// The raw message shows in team builds only.

const MIN_MS = 500; // the splash shows at least this long
const FADE_MS = 300;
const LOGO = 104; // dp: as the phone's splash draws it (app.json's imageWidth)
const BAR = 140; // dp: the loading bar's width
const LOADING_BOTTOM = 72; // dp: the loading line's place, above the screen's bottom edge

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function BrandSplash({ onReady }: { onReady: () => void }) {
  const insets = useSafeAreaInsets();
  const [failure, setFailure] = useState<string | null>(null); // the last start's raw message, when it failed
  const [out] = useState(() => new Animated.Value(1));
  const runs = useRef(0); // a start goes on only while it's the newest one, and the splash is still there

  /** The scanner, what the phone keeps and the warm-up read, then the floor and the fade, then onReady. */
  const start = useCallback(async () => {
    runs.current += 1;
    const run = runs.current;
    const began = Date.now();
    try {
      await preload();
      await loadAppData();
      try {
        await scanPhoto(await sampleUri('inv_0001'), { keepFiles: false });
      } catch {
        // the warm-up only makes the first real scan quicker: the app opens without it
      }
    } catch (e: unknown) {
      if (runs.current === run) setFailure((e as Error)?.message ?? String(e));
      return;
    }
    const left = MIN_MS - (Date.now() - began); // a slow start waits for nothing more
    if (left > 0) await wait(left);
    if (runs.current !== run) return;
    Animated.timing(out, { toValue: 0, duration: FADE_MS, useNativeDriver: true }).start();
    await wait(FADE_MS);
    if (runs.current === run) onReady();
  }, [out, onReady]);

  useEffect(() => {
    void start();
    return () => {
      runs.current += 1; // gone: the start under way goes no further
    };
  }, [start]);

  const brand = (
    <>
      <Image testID="splash-logo" source={require('../assets/brand/logo_mark.png')} style={styles.logo} />
      <View style={styles.words}>
        <Text style={[type.title, styles.ink, styles.center]}>
          mybizmate<Text style={styles.io}>.io</Text>
        </Text>
        <Text style={[type.body, styles.mute, styles.center]}>Scan invoices. Even offline.</Text>
      </View>
    </>
  );

  return (
    <Animated.View
      testID="splash"
      style={[styles.screen, { opacity: out }]}
      onLayout={() => void SplashScreen.hideAsync().catch(() => {})}>
      {failure === null ? (
        <>
          <View testID="splash-brand" style={styles.brand}>
            {brand}
          </View>
          <View style={styles.loading}>
            <LoadingBar width={BAR} />
            <Text style={[type.label, styles.mute, styles.center]}>Getting the scanner ready…</Text>
          </View>
        </>
      ) : (
        // The brand moves up, centred in the space above the words (the mockup's layout), and it all scrolls when large
        // text makes it taller than the screen.
        <ScrollView
          style={styles.fill}
          contentContainerStyle={[
            styles.failed,
            { paddingTop: insets.top + space.xl, paddingBottom: insets.bottom + space.xxl },
          ]}>
          <View testID="splash-brand" style={styles.brandAbove}>
            {brand}
          </View>
          <View testID="splash-failure" style={styles.failure}>
            <View style={styles.why}>
              <Text
                accessibilityRole="header"
                accessibilityLiveRegion="polite"
                style={[type.headline, styles.ink, styles.center]}>
                {"The scanner couldn't start"}
              </Text>
              <Text accessibilityLiveRegion="polite" style={[type.body, styles.mute, styles.center]}>
                Try again. If it keeps happening, close the app and open it again.
              </Text>
            </View>
            <Button label="Try again" onPress={start} />
            {/* the scanner's own words, for the team: a client never sees them */}
            {TEAM_BUILD && failure !== '' ? (
              <Text accessibilityLiveRegion="polite" style={[type.figureSmall, styles.mute, styles.center]}>
                {failure}
              </Text>
            ) : null}
          </View>
        </ScrollView>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.paper },
  fill: { flex: 1 },
  // The logo's centre at the screen's centre, as the phone's splash draws it; the words hang under it.
  brand: {
    position: 'absolute',
    top: '50%',
    marginTop: -LOGO / 2,
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: space.m,
    paddingHorizontal: space.xl,
  },
  words: { alignItems: 'center', gap: space.m },
  logo: { width: LOGO, height: LOGO },
  loading: {
    position: 'absolute',
    bottom: LOADING_BOTTOM,
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: space.m,
    paddingHorizontal: space.xl,
  },
  failed: { flexGrow: 1, paddingHorizontal: space.xl, gap: space.xl },
  brandAbove: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: space.m },
  failure: { gap: space.m },
  why: { gap: space.xs },
  ink: { color: colors.ink },
  mute: { color: colors.mute },
  io: { color: colors.brandText },
  center: { textAlign: 'center' },
});
