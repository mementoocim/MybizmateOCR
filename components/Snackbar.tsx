import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useReducedMotion } from '../lib/motion';
import {
  bottomClearance,
  currentSnack,
  dismissSnack,
  pushHost,
  type Snack,
  subscribeSnack,
  topHost,
} from '../lib/snackbar';
import { colors, durations, elevation, radius, space, touch, type } from '../lib/theme';
import { Tap } from './Tap';

// Design B §5.5, §5.6 and §8, and the plan's call 4: the snackbar, in place of Android's toasts. A host is where the
// message can show: the root layout has one, and so does every open sheet, inside its Modal (the photo viewer gets one
// too). Only the newest host shows it (lib/snackbar), so it's never dimmed behind a modal. It's an ink bar, 16 dp in from
// each side, with paper text and an optional action in brand. It sits above the bottom bar, or the navigation bar when
// there's none; in a sheet, above the action row. It slides up 16 dp as it fades in, and goes back the same way; with
// reduced motion it only fades. A new message takes the place of the one that's up, where it is. A message is up for
// the time the phone recommends for 4 s, or for 8 s with an action, so it lasts longer for someone who needs it, and
// its action takes it down too. It's a polite live region.

/** How far it slides up as it fades in, in dp (§5.5). */
const RISE = 16;
/** How long a message is up, in ms, as asked of the phone, which can make it longer (getRecommendedTimeoutMillis). */
const UP = 4000;
const UP_WITH_ACTION = 8000;

export function SnackbarHost({ bottomOffset }: { bottomOffset?: number }) {
  const [place] = useState(placeInStack);
  const onTop = useSyncExternalStore(place.subscribe, place.onTop);
  const current = useSyncExternalStore(subscribeSnack, currentSnack);
  const clearance = useSyncExternalStore(subscribeSnack, bottomClearance);
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const live = onTop ? current : null; // the message this host shows now
  // What's on the screen: the live message, or the last one while it goes.
  const [shown, setShown] = useState<Snack | null>(null);
  if (live !== null && live !== shown) setShown(live);
  const showing = shown !== null;
  const leaving = showing && live === null;
  const [progress] = useState(() => new Animated.Value(0)); // 1: up; 0: gone
  const rise = useMemo(() => progress.interpolate({ inputRange: [0, 1], outputRange: [RISE, 0] }), [progress]);

  // In, or out. A message that takes the place of one that's up stays where that one is.
  useEffect(() => {
    if (!showing) return;
    const animation = Animated.timing(progress, {
      toValue: leaving ? 0 : 1,
      duration: durations.snackbar,
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      // Not finished: cut short, by a message that came while it went, or by the host's unmounting.
      if (finished && leaving) setShown(null);
    });
    return () => animation.stop();
  }, [showing, leaving, progress]);

  // Up for the time the phone recommends, from when it shows here.
  useEffect(() => {
    if (live === null) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let gone = false; // replaced, taken down, or moved to another host before the phone answered
    void AccessibilityInfo.getRecommendedTimeoutMillis(live.action ? UP_WITH_ACTION : UP).then((ms) => {
      if (!gone) timer = setTimeout(() => dismissSnack(live.id), ms);
    });
    return () => {
      gone = true;
      clearTimeout(timer);
    };
  }, [live]);

  if (shown === null) return null;
  const { action } = shown;
  return (
    <Animated.View
      testID="snackbar"
      accessibilityLiveRegion="polite"
      // On its way out it takes no touches, and TalkBack leaves it.
      pointerEvents={leaving ? 'none' : 'auto'}
      importantForAccessibility={leaving ? 'no-hide-descendants' : 'auto'}
      accessibilityElementsHidden={leaving}
      style={[
        styles.bar,
        action && styles.withAction,
        { bottom: bottomOffset ?? (clearance || insets.bottom) + space.s },
        reduced ? { opacity: progress } : { opacity: progress, transform: [{ translateY: rise }] },
      ]}>
      <Text style={[type.body, styles.message]}>{shown.message}</Text>
      {action && (
        <Tap
          accessibilityRole="button"
          accessibilityLabel={action.label}
          ripple="camera" // white at 20%: it's on ink
          onPress={() => {
            if (currentSnack()?.id !== shown.id) return; // a second tap before it has gone: the action runs once
            dismissSnack(shown.id);
            action.onPress();
          }}
          style={styles.action}>
          <Text style={[type.button, styles.actionLabel]}>{action.label}</Text>
        </Tap>
      )}
    </Animated.View>
  );
}

/**
 * A host's place in the stack, for useSyncExternalStore: subscribing pushes it and unsubscribing removes it, so it's
 * in the stack just while it's mounted, and a host that mounts later (a sheet's) is on top of it until it goes.
 */
function placeInStack() {
  let id: symbol | null = null;
  return {
    subscribe(listener: () => void) {
      const host = pushHost(); // the host under this one hears it, and lets the message go
      id = host.id;
      const unsubscribe = subscribeSnack(listener);
      listener(); // and this one takes it
      return () => {
        unsubscribe();
        id = null;
        host.remove(); // the host under this one takes it back
      };
    },
    onTop: () => id !== null && topHost() === id,
  };
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: space.l,
    right: space.l,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: touch.target,
    paddingHorizontal: space.l,
    backgroundColor: colors.ink,
    borderRadius: radius.panel,
    elevation: elevation.overlay,
  },
  withAction: { paddingRight: space.s }, // the action's own padding makes up the rest
  message: { flex: 1, paddingVertical: space.m, color: colors.paper },
  action: { minHeight: touch.target, justifyContent: 'center', paddingHorizontal: space.s },
  actionLabel: { color: colors.brand },
});
