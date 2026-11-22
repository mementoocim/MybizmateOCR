import { type ReactNode, type RefObject, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Alert,
  Animated,
  Easing,
  Modal,
  ScrollView,
  type ScrollViewInstance,
  StyleSheet,
  Text,
  type TextInstance,
  useWindowDimensions,
  View,
  type ViewInstance,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useReducedMotion } from '../lib/motion';
import { colors, durations, elevation, radius, space, touch, type } from '../lib/theme';
import { ButtonRow } from './BottomBar';
import type { ButtonProps } from './Buttons';
import { IconButton } from './IconButton';
import { ArrowLeft, Close } from './icons';
import { ScrollIntoViewScope, useKeyboardHeight } from './Screen';
import { Tap } from './Tap';

// Design B §5.5, §5.6, §7 and §8: a sheet from the bottom, on an RN Modal with no animation of its own. The scrim
// fades in as the panel slides up (easing out), and both go back the same way; with reduced motion, both only fade.
// The Modal stays up through the closing animation, which takes no touches and which TalkBack leaves. The panel is at
// most 90% of the screen: a title row (a step's Back, the title, Close; there's no drag handle), an optional subtitle,
// the scroll, then the action row pinned under it. The Modal is edge to edge, so the action row pads by the
// navigation bar's inset and by the open keyboard, whose height RN 0.88 reports above that bar (ruling T5-1); a sheet
// with no action row pads the end of its scroll instead. The scroll is its fields' scroll-into-view: they never scroll
// the Screen behind the Modal. Back, Close, the scrim and system back ask before typing is lost (dirty). TalkBack
// focus moves to the title once the sheet is up, and to returnFocus once it has gone.

/** The prompt before typed input is lost (§9.5). The box editor's own paths ask with it too. */
export function confirmDiscard(onDiscard: () => void): void {
  Alert.alert('Discard what you typed?', undefined, [
    { text: 'Keep editing', style: 'cancel' },
    { text: 'Discard', style: 'destructive', onPress: onDiscard },
  ]);
}

export function Sheet({
  visible,
  title,
  subtitle,
  onClose,
  children,
  actions,
  dirty = false,
  onBack,
  returnFocus,
  testID = 'sheet',
}: {
  visible: boolean;
  title: string;
  subtitle?: string | null;
  onClose: () => void;
  children?: ReactNode;
  actions?: readonly ButtonProps[]; // the action row, pinned above the keyboard and the bottom inset
  dirty?: boolean; // typed input would be lost: back, close and the scrim ask first
  onBack?: (() => void) | null; // a step's back: a Back button in the title row; system back calls it
  returnFocus?: RefObject<ViewInstance | null>; // TalkBack focus goes back here on close
  testID?: string; // the Modal's
}) {
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardHeight();
  const reduced = useReducedMotion();
  const { height } = useWindowDimensions();
  // Up from the moment the sheet opens until its closing animation ends.
  const [shown, setShown] = useState(visible);
  if (visible && !shown) setShown(true);
  const [scrim] = useState(() => new Animated.Value(0));
  const [panel] = useState(() => new Animated.Value(0)); // 1: up; 0: below the screen, or clear with reduced motion
  const slide = useMemo(() => panel.interpolate({ inputRange: [0, 1], outputRange: [height, 0] }), [panel, height]);
  const titleRef = useRef<TextInstance>(null);
  const scrollRef = useRef<ScrollViewInstance>(null);
  const wasShown = useRef(shown);

  useEffect(() => {
    if (!shown) return;
    const animation = Animated.parallel([
      Animated.timing(scrim, { toValue: visible ? 1 : 0, duration: durations.scrim, useNativeDriver: true }),
      Animated.timing(
        panel,
        visible
          ? { toValue: 1, duration: durations.sheetIn, easing: Easing.out(Easing.cubic), useNativeDriver: true }
          : { toValue: 0, duration: durations.sheetOut, useNativeDriver: true },
      ),
    ]);
    animation.start(({ finished }) => {
      if (!finished) return; // cut short: it opened again while closing, or closed while opening
      if (!visible) setShown(false);
      else if (titleRef.current) AccessibilityInfo.sendAccessibilityEvent(titleRef.current, 'focus');
    });
    return () => animation.stop();
  }, [visible, shown, scrim, panel]);

  // Once the Modal has gone, TalkBack focus goes back to what opened the sheet.
  useEffect(() => {
    const opener = returnFocus?.current;
    if (wasShown.current && !shown && opener) AccessibilityInfo.sendAccessibilityEvent(opener, 'focus');
    wasShown.current = shown;
  }, [shown, returnFocus]);

  const askFirst = (leave: () => void) => () => (dirty ? confirmDiscard(leave) : leave());
  const close = askFirst(onClose);
  const back = onBack ? askFirst(onBack) : null;
  const closing = !visible; // while still shown: the closing animation
  const clearance = insets.bottom + keyboard;

  return (
    <Modal
      testID={testID}
      visible={shown}
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={back ?? close}>
      <View
        style={styles.root}
        pointerEvents={closing ? 'none' : 'auto'}
        importantForAccessibility={closing ? 'no-hide-descendants' : 'auto'}
        accessibilityElementsHidden={closing}>
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: scrim }]}>
          <Tap
            testID="sheet-scrim"
            ripple="none"
            focusable={false}
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden
            onPress={close}
            style={styles.scrim}
          />
        </Animated.View>
        <Animated.View
          testID="sheet-panel"
          style={[styles.panel, reduced ? { opacity: panel } : { transform: [{ translateY: slide }] }]}>
          <View style={styles.titleRow}>
            {back && <IconButton icon={ArrowLeft} label="Back" onPress={back} />}
            <Text ref={titleRef} accessibilityRole="header" style={[type.title, styles.title, !back && styles.atStart]}>
              {title}
            </Text>
            <IconButton icon={Close} label="Close" onPress={close} />
          </View>
          {subtitle ? <Text style={[type.body, styles.subtitle]}>{subtitle}</Text> : null}
          <ScrollIntoViewScope scrollRef={scrollRef}>
            <ScrollView
              ref={scrollRef}
              testID="sheet-scroll"
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={[styles.body, !actions?.length && { paddingBottom: space.xl + clearance }]}>
              {children}
            </ScrollView>
          </ScrollIntoViewScope>
          {actions?.length ? (
            <View testID="sheet-actions" style={[styles.actions, { paddingBottom: space.m + clearance }]}>
              <ButtonRow buttons={actions} />
            </View>
          ) : null}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  scrim: { flex: 1, backgroundColor: colors.scrim },
  panel: {
    maxHeight: '90%',
    backgroundColor: colors.panel,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    elevation: elevation.overlay,
  },
  // As in the Header: the 48 dp buttons sit 4 dp in, and a title at the row's start lines up with the 16 dp gutter.
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: touch.target + space.s,
    paddingHorizontal: space.xs,
  },
  title: { flex: 1, paddingVertical: space.s, paddingHorizontal: space.xs, color: colors.ink },
  atStart: { paddingLeft: space.m },
  subtitle: { paddingHorizontal: space.l, paddingBottom: space.s, color: colors.mute },
  body: { paddingHorizontal: space.l },
  actions: { paddingHorizontal: space.l, paddingTop: space.m },
});
