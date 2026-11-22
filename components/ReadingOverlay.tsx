import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { useReducedMotion } from '../lib/motion';
import { colors, durations, elevation, radius, space, type } from '../lib/theme';

// Design B §9.4 and §5.5: the reading card, over the screen the capture came from. A wash over the whole screen takes
// its touches; on it, a card that fades in with "Reading…" (the same for every form), the loading bar and a line for
// what's being read: a photo (a sample's too) or a PDF. After 5 s a second line says why it's slow. TalkBack hears
// "Reading" as it appears. With reduced motion the bar stands still, and the words carry the state.

const CARD = 280; // dp: the card's width; its words wrap inside it
const BAR = 4; // dp: the loading bar's height
const PIECE = 0.35; // the bar's moving piece, as a share of the bar; with reduced motion it stands at the start
const LOOP_MS = 1100; // one pass of the piece across the bar
const SLOW_MS = 5000; // a read that takes longer says why

/** A thin sand bar with a brand piece moving across it while something loads; it stands still with reduced motion. */
export function LoadingBar({ width }: { width: number }) {
  const reduced = useReducedMotion();
  const [t] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(
      Animated.timing(t, { toValue: 1, duration: LOOP_MS, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, t]);
  const piece = width * PIECE;
  const x = reduced ? 0 : t.interpolate({ inputRange: [0, 1], outputRange: [-piece, width] });
  return (
    <View testID="loading-track" style={[styles.track, { width }]}>
      <Animated.View testID="loading-piece" style={[styles.piece, { width: piece, transform: [{ translateX: x }] }]} />
    </View>
  );
}

/** Over the screen while a photo or a PDF is read. With nothing being read, nothing shows. */
export function ReadingOverlay({ visible, what = 'photo' }: { visible: boolean; what?: 'photo' | 'pdf' }) {
  if (!visible) return null;
  return <ReadingCard what={what} />; // mounted for each read: each fades in, and waits its own 5 s
}

function ReadingCard({ what }: { what: 'photo' | 'pdf' }) {
  const [shown] = useState(() => new Animated.Value(0));
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const fade = Animated.timing(shown, { toValue: 1, duration: durations.card, useNativeDriver: true });
    fade.start();
    const timer = setTimeout(() => setSlow(true), SLOW_MS);
    return () => {
      fade.stop();
      clearTimeout(timer);
    };
  }, [shown]);
  return (
    <Animated.View testID="reading" style={[styles.wash, { opacity: shown }]}>
      <View accessible accessibilityLabel="Reading" accessibilityLiveRegion="polite" style={styles.card}>
        <Text style={[type.headline, styles.title]}>Reading…</Text>
        <LoadingBar width={CARD - 2 * space.xl} />
        <Text style={[type.label, styles.line]}>
          {what === 'pdf' ? 'Reading the PDF' : 'Straightening the photo and reading every box'}
        </Text>
        {slow && <Text style={[type.label, styles.line]}>Still reading. Big or blurry photos take longer.</Text>}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wash: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.wash,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: CARD,
    backgroundColor: colors.panel,
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: colors.line,
    elevation: elevation.overlay,
    padding: space.xl,
    gap: space.m,
    alignItems: 'center',
  },
  title: { color: colors.ink, textAlign: 'center' },
  line: { color: colors.mute, textAlign: 'center' },
  track: { height: BAR, borderRadius: BAR / 2, backgroundColor: colors.sand, overflow: 'hidden' },
  piece: { height: BAR, borderRadius: BAR / 2, backgroundColor: colors.brand },
});
