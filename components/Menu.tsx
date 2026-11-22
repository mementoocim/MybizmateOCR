import { type RefObject, useEffect, useMemo, useState } from 'react';
import { Animated, Modal, StyleSheet, Text, useWindowDimensions, type ViewInstance } from 'react-native';

import { useReducedMotion } from '../lib/motion';
import { colors, durations, elevation, radius, space, touch, type } from '../lib/theme';
import { ScrollIntoViewScope } from './Screen';
import { Tap } from './Tap';

// Design B §5.5 and §5.6: the ⋮ menu, on a transparent Modal over a light scrim that closes it. The Modal is edge to
// edge, as the screens are, so the anchor's place in the window is its place in the menu: the panel sits under the
// anchor, right-aligned to it. It fades in as it grows from 95% from that corner; with reduced motion it only fades.
// Each item is a row at least 48 dp tall, a destructive one in danger. Pressing one closes the menu, then runs the
// item, so a confirmation it shows comes up over the screen. Back closes it.

type MenuItem = { label: string; onPress: () => void; destructive?: boolean };

/** How big the panel is as it starts to grow (§5.5). */
const FROM_SCALE = 0.95;

export function Menu({
  visible,
  anchor,
  items,
  onClose,
}: {
  visible: boolean;
  anchor: RefObject<ViewInstance | null>;
  items: readonly MenuItem[];
  onClose: () => void;
}) {
  return (
    <Modal
      testID="menu"
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}>
      {/* Nothing in a menu scrolls, and its own scope keeps it from the Screen behind the Modal. */}
      <ScrollIntoViewScope scrollRef={null}>
        <Tap
          testID="menu-scrim"
          ripple="none"
          focusable={false}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
          onPress={onClose}
          style={[StyleSheet.absoluteFill, styles.scrim]}
        />
        {visible ? <Panel anchor={anchor} items={items} onClose={onClose} /> : null}
      </ScrollIntoViewScope>
    </Modal>
  );
}

/** Mounted each time the menu opens, so it measures its anchor again. */
function Panel({
  anchor,
  items,
  onClose,
}: {
  anchor: RefObject<ViewInstance | null>;
  items: readonly MenuItem[];
  onClose: () => void;
}) {
  const reduced = useReducedMotion();
  const { width } = useWindowDimensions();
  const [place, setPlace] = useState<{ top: number; right: number } | null>(null);
  const [shown] = useState(() => new Animated.Value(0));
  const grow = useMemo(() => shown.interpolate({ inputRange: [0, 1], outputRange: [FROM_SCALE, 1] }), [shown]);

  useEffect(() => {
    anchor.current?.measureInWindow((x, y, w, h) => setPlace({ top: y + h, right: width - (x + w) }));
  }, [anchor, width]);

  useEffect(() => {
    if (place === null) return;
    const animation = Animated.timing(shown, { toValue: 1, duration: durations.menu, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [place, shown]);

  if (place === null) return null; // until the anchor is measured, a frame later
  return (
    <Animated.View
      testID="menu-panel"
      style={[
        styles.panel,
        // It wraps rather than run past the screen's left gutter.
        { top: place.top, right: place.right, maxWidth: width - place.right - space.l },
        reduced ? { opacity: shown } : { opacity: shown, transform: [{ scale: grow }] },
      ]}>
      {items.map((item) => (
        <Tap
          key={item.label}
          accessibilityRole="menuitem"
          accessibilityLabel={item.label}
          focusRing="inside"
          focusRadius={0}
          onPress={() => {
            onClose();
            item.onPress();
          }}
          style={styles.item}>
          <Text style={[type.body, { color: item.destructive ? colors.danger : colors.ink }]}>{item.label}</Text>
        </Tap>
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: colors.hairline },
  panel: {
    position: 'absolute',
    paddingVertical: space.xs,
    backgroundColor: colors.panel,
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: colors.line,
    elevation: elevation.overlay,
    transformOrigin: 'top right', // it grows from its anchor
  },
  item: { minHeight: touch.target, justifyContent: 'center', paddingHorizontal: space.l, paddingVertical: space.s },
});
