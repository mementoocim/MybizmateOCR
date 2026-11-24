import { useIsFocused } from 'expo-router';
import { BottomTabBarHeightCallbackContext, type BottomTabBarProps } from 'expo-router/js-tabs';
import { type ReactElement, useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { waitingOf } from '../lib/exportFile';
import { savedList, subscribeSaved } from '../lib/saved';
import { currentShutter, subscribeShutter } from '../lib/shutter';
import { setBottomClearance } from '../lib/snackbar';
import { bar, colors, elevation, radius, space, touch, type } from '../lib/theme';
import { Camera, CircleUser, Files, House, type IconComponent, Send } from './icons';
import { useKeyboardHeight } from './Screen';
import { Tap } from './Tap';

// Camera first, spec §6.2 (calls 19 and 20): the tabs' floating bar. A white bar with 20 dp corners and design B's
// shadow, 12 dp above the navigation bar's inset, with five slots: Home, Sessions, the raised coral Camera, Export
// and Profile. Icons only: the open tab's is ink with a coral dot under it, so it never rests on colour alone; the
// others are the quiet ink. On the camera tab the middle button is the shutter (lib/shutter), a white core in the
// coral ring. Export carries the count of saved scans not yet exported (ruling T17-3). A press tells the tab first,
// then opens it, as the default bar does. The bar's height, the raised button too, goes to the tab screens (Screen's
// useTabBarSpace), and to the snackbar while the tabs are on top (as BottomBar, ruling T19-5). It hides while the
// keyboard is up (tabBarHideOnKeyboard), and then takes no space.

export type TabName = 'index' | 'sessions' | 'camera' | 'export' | 'profile';

export const TABS: readonly { name: TabName; label: string; icon: IconComponent }[] = [
  { name: 'index', label: 'Home', icon: House },
  { name: 'sessions', label: 'Sessions', icon: Files },
  { name: 'camera', label: 'Camera', icon: Camera },
  { name: 'export', label: 'Export', icon: Send },
  { name: 'profile', label: 'Profile', icon: CircleUser },
];

const MOST = 99; // the count's cap

/** The Export count's figures: "7"; "99+" past 99. */
export function countText(n: number): string {
  return n > MOST ? `${MOST}+` : `${n}`;
}

export function TabBar({ state, descriptors, emitter, navigateToTab, insets }: BottomTabBarProps): ReactElement | null {
  const open = state.routes[state.index];
  const hideOnKeyboard = descriptors[open.key]?.options.tabBarHideOnKeyboard ?? false;
  const keyboard = useKeyboardHeight();
  const hidden = hideOnKeyboard && keyboard > 0;
  const onHeight = useContext(BottomTabBarHeightCallbackContext);
  const focused = useIsFocused(); // the tabs are the screen on top
  const ownerRef = useRef(null); // this bar, as the clearance knows it
  const [height, setHeight] = useState<number | null>(null); // as last laid out, the raised button too
  const saved = useSyncExternalStore(subscribeSaved, savedList);
  const shutter = useSyncExternalStore(subscribeShutter, currentShutter);
  const waiting = waitingOf(null, saved).length;

  useEffect(() => {
    if (hidden) onHeight?.(0);
    else if (height !== null) onHeight?.(height);
  }, [hidden, height, onHeight]);
  // Withdrawn only when covered, hidden or gone, so a new height keeps the bar's place in the order (ruling T25b-1).
  const showing = focused && !hidden;
  useEffect(() => {
    if (!showing) return;
    return () => setBottomClearance(ownerRef, null);
  }, [showing]);
  useEffect(() => {
    if (showing && height !== null) setBottomClearance(ownerRef, height);
  }, [showing, height]);

  if (hidden) return null;

  const press = (key: string, selected: boolean) => {
    const event = emitter.emit({ type: 'tabPress', target: key, canPreventDefault: true });
    if (!selected && !event.defaultPrevented) navigateToTab(key);
  };

  return (
    <View
      testID="tab-bar"
      pointerEvents="box-none"
      onLayout={(e) => setHeight(e.nativeEvent.layout.height + bar.raise)}
      style={[styles.root, { paddingBottom: space.m + insets.bottom }]}>
      <View testID="tab-list" accessibilityRole="tablist" style={styles.bar}>
        {TABS.map(({ name, label, icon: Icon }) => {
          const route = state.routes.find((r) => r.name === name);
          if (!route) return null;
          const selected = route.key === open.key;
          if (name === 'camera') {
            const onCamera = selected;
            const waits = onCamera && (shutter === null || shutter.disabled);
            return (
              <View key={route.key} testID="camera-slot" style={styles.cameraSlot}>
                <Tap
                  accessibilityRole="tab"
                  accessibilityLabel={onCamera ? 'Take photo' : label}
                  accessibilityState={{ selected }}
                  disabled={waits}
                  ripple="brand"
                  focusRadius={CIRCLE / 2}
                  onPress={() => (onCamera ? currentShutter()?.take() : press(route.key, selected))}
                  style={styles.circle}>
                  {onCamera ? (
                    <View testID="shutter-core" style={styles.core} />
                  ) : (
                    <Icon size={touch.icon} color={colors.ink} />
                  )}
                </Tap>
                {selected && <View testID="camera-dot" style={styles.dot} />}
              </View>
            );
          }
          const count = name === 'export' ? waiting : 0;
          return (
            <Tap
              key={route.key}
              accessibilityRole="tab"
              accessibilityLabel={count > 0 ? `${label}, ${count} to send` : label}
              accessibilityState={{ selected }}
              ripple="icon"
              focusRadius={touch.target / 2}
              onPress={() => press(route.key, selected)}
              style={styles.tab}>
              <View>
                <Icon size={touch.icon} color={selected ? colors.ink : colors.chevron} />
                {count > 0 && (
                  <View testID="export-count" style={styles.count}>
                    <Text style={[type.badge, styles.countText]}>{countText(count)}</Text>
                  </View>
                )}
              </View>
              {selected && <View testID="tab-dot" style={[styles.dot, styles.tabDot]} />}
            </Tap>
          );
        })}
      </View>
    </View>
  );
}

const CIRCLE = bar.circle + 2 * bar.ring; // the middle button, its paper ring outside the coral
const CORE = bar.circle - space.xl; // the shutter's white core, inside the coral ring

const styles = StyleSheet.create({
  root: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: space.m },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: space.s,
    backgroundColor: colors.panel,
    borderRadius: radius.bar,
    elevation: elevation.overlay,
  },
  tab: {
    minWidth: touch.target,
    minHeight: touch.target,
    marginVertical: space.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // From the bar's top, not its padding's: the circle's top is bar.raise above it.
  cameraSlot: { alignSelf: 'flex-start', marginTop: -bar.raise, alignItems: 'center', gap: space.xs },
  circle: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    borderWidth: bar.ring,
    borderColor: colors.paper,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  core: {
    width: CORE,
    height: CORE,
    borderRadius: CORE / 2,
    backgroundColor: colors.panel,
    borderWidth: 2, // optical: a hairline edge keeps the white core from melting into the paper ring, as in the mockup
    borderColor: colors.line,
  },
  dot: { width: bar.dot, height: bar.dot, borderRadius: bar.dot / 2, backgroundColor: colors.brand },
  tabDot: { position: 'absolute', bottom: space.xs },
  count: {
    position: 'absolute',
    bottom: touch.icon / 2, // on the icon's top right corner
    left: touch.icon / 2,
    minWidth: space.l + space.xs,
    paddingHorizontal: space.xs,
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: 2, // optical: a white edge parts the pill from the icon, as in the mockup
    borderColor: colors.panel,
    backgroundColor: colors.brand,
  },
  countText: { color: colors.ink },
});
