import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { bold, colors } from '../lib/theme';

/** A thin bar with a coral piece moving across it, while something loads. */
export function LoadingBar({ width }: { width: number }) {
  const [t] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(t, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [t]);
  const piece = width * 0.35;
  const x = t.interpolate({ inputRange: [0, 1], outputRange: [-piece, width] });
  return (
    <View style={[styles.track, { width }]}>
      <Animated.View style={[styles.piece, { width: piece, transform: [{ translateX: x }] }]} />
    </View>
  );
}

/** Over the screen while a photo is read (the test app's reading card). */
export function ReadingOverlay({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <View style={styles.scrim} accessibilityLiveRegion="polite">
      <View style={styles.card}>
        <Text style={styles.title}>Reading the invoice…</Text>
        <LoadingBar width={212} />
        <Text style={styles.note}>Straightening the photo and reading every box</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: {
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
    width: 260,
    backgroundColor: colors.panel,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 24,
    gap: 14,
    alignItems: 'center',
  },
  title: { ...bold, fontSize: 17, color: colors.ink },
  note: { fontSize: 14, color: colors.mute, textAlign: 'center' },
  track: { height: 4, borderRadius: 2, backgroundColor: colors.coralTint, overflow: 'hidden' },
  piece: { height: 4, borderRadius: 2, backgroundColor: colors.coral },
});
