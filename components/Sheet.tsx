import { type ReactNode, type RefObject, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Alert,
  Animated,
  Easing,
  Modal,
  Platform,
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
// From its own file, not the module's index: that one loads the scanner's native module, which jest suites mock.
import { ImeInsetsView } from '../modules/scanner/src/ImeInsetsView';
import { ButtonRow } from './BottomBar';
import type { ButtonProps } from './Buttons';
import { IconButton } from './IconButton';
import { ArrowLeft, Close } from './icons';
import { ScrollIntoViewScope, useKeyboardHeight } from './Screen';
import { SnackbarHost } from './Snackbar';
import { Tap } from './Tap';

// Design B §5.5, §5.6, §7 and §8: a sheet from the bottom, on an RN Modal with no animation of its own. The scrim
// fades in as the panel slides up (easing out), and both go back the same way; with reduced motion, both only fade.
// The Modal stays up through the closing animation, which takes no touches and which TalkBack leaves. The panel is at
// most 90% of the screen: a title row (a step's Back, the title, Close; there's no drag handle), an optional subtitle,
// the scroll (its sides on the 16 dp gutter, unless a list of full-bleed rows pads its own: gutter={false}, ruling
// T13-1), then the action row pinned under it. The Modal is edge to edge, so the action row pads by the navigation
// bar's inset and by the open keyboard's height above that bar (ruling T5-1); a sheet with no action row pads the end
// of its scroll instead, and the snackbar in it follows. On Android that's the keyboard in the Modal's own window, as
// the sheet's IME view reports it (modules/scanner's ImeInsetsView): RN 0.88's keyboard events come only from the app's
// window. It's 0 again once the sheet has gone, so it opens without one. Elsewhere it's RN's events (useKeyboardHeight:
// iOS's aren't a window's). The scroll is its fields' scroll-into-view: they never scroll the Screen behind the Modal,
// and it gives them that keyboard, so a focused field scrolls into view again as the keyboard grows (ruling T5-2).
// Back, Close, the scrim and system back ask before typing is lost (dirty). TalkBack focus moves to the title once the
// sheet is up, and again when it shows a new step (focusKey), and to returnFocus once it has gone. While it's open,
// the panel is the snackbar's host (the plan's call 4), so a message shows above the action row, not dimmed behind the
// scrim; it goes back to the host under the sheet as the sheet starts to close.
// The exit motion needs the Sheet kept mounted, with `visible` driving it: useLingering keeps a caller's last content
// for it while it closes. A caller that unmounts the Sheet to close it gets no exit motion, but focus still goes back,
// once, from the unmount.

/** The prompt before typed input is lost (§9.5). The box editor's own paths ask with it too. */
export function confirmDiscard(onDiscard: () => void): void {
  Alert.alert('Discard what you typed?', undefined, [
    { text: 'Keep editing', style: 'cancel' },
    { text: 'Discard', style: 'destructive', onPress: onDiscard },
  ]);
}

/**
 * The last value it was given that wasn't null. A caller that keeps a sheet mounted through its exit, with `visible`
 * driving it, renders the sheet's content from this, so the content stays as it was while the sheet closes:
 * `const shown = useLingering(open)`, then
 * `<BoxSheet visible={open?.kind === 'boxes'} boxes={shown?.kind === 'boxes' ? shown.boxes : []} … />`.
 * Give it state, or another value that keeps its identity from render to render: a new object on every render would
 * never settle.
 */
export function useLingering<T>(value: T | null): T | null {
  const [last, setLast] = useState(value);
  if (value !== null && value !== last) setLast(value);
  return value ?? last;
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
  gutter = true,
  focusKey,
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
  gutter?: boolean; // default true: the body's 16 dp sides; false for full-bleed rows, which pad themselves
  focusKey?: string; // the step shown, in a sheet with steps: a new one while it's up moves TalkBack focus to the title
  testID?: string; // the Modal's
}) {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const { height } = useWindowDimensions();
  // Up from the moment the sheet opens until its closing animation ends.
  const [shown, setShown] = useState(visible);
  if (visible && !shown) setShown(true);
  // The open keyboard's height above the navigation bar. On Android, in the Modal's own window, as the IME view in it
  // reports it; it stays through the closing animation (the panel goes down whole), then goes back to 0 with the
  // window. Elsewhere, RN's keyboard events.
  const fromEvents = useKeyboardHeight();
  const [inWindow, setInWindow] = useState(0);
  if (!shown && inWindow !== 0) setInWindow(0);
  const keyboard = Platform.OS === 'android' ? inWindow : fromEvents;
  const [scrim] = useState(() => new Animated.Value(0));
  const [panel] = useState(() => new Animated.Value(0)); // 1: up; 0: below the screen, or clear with reduced motion
  const slide = useMemo(() => panel.interpolate({ inputRange: [0, 1], outputRange: [height, 0] }), [panel, height]);
  const [actionsHeight, setActionsHeight] = useState(0); // as laid out: its padding takes in the inset and keyboard
  const titleRef = useRef<TextInstance>(null);
  const scrollRef = useRef<ScrollViewInstance>(null);
  // While the sheet is up: the opener TalkBack focus goes back to once it has gone, closed or unmounted.
  const focusOwed = useRef<RefObject<ViewInstance | null> | null>(null);

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

  // A new step while the sheet is up (ruling T13-2): TalkBack focus moves to the title again, as when it opened. Back to
  // no step, the caller puts focus where it belongs (a box list: the row of the box that was open).
  const lastStep = useRef(focusKey);
  useEffect(() => {
    const newStep = focusKey !== undefined && focusKey !== lastStep.current;
    lastStep.current = focusKey;
    if (newStep && visible && shown && titleRef.current) {
      AccessibilityInfo.sendAccessibilityEvent(titleRef.current, 'focus');
    }
  }, [focusKey, visible, shown]);

  // Once the Modal has gone, TalkBack focus goes back to what opened the sheet.
  useEffect(() => {
    if (shown) focusOwed.current = returnFocus ?? null;
    else giveFocusBack(focusOwed);
  }, [shown, returnFocus]);
  // Unmounted while it's up (its caller renders it only while it's open): no exit motion, but focus still goes back.
  useEffect(() => () => giveFocusBack(focusOwed), []);

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
        {/* In the Modal, so in its window: the keyboard there (Android only; it takes no room) */}
        <ImeInsetsView testID="sheet-ime" onImeChange={(e) => setInWindow(e.nativeEvent.height)} />
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
          <ScrollIntoViewScope scrollRef={scrollRef} keyboard={keyboard}>
            <ScrollView
              ref={scrollRef}
              testID="sheet-scroll"
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={[
                gutter && styles.body,
                !actions?.length && { paddingBottom: space.xl + clearance },
              ]}>
              {children}
            </ScrollView>
          </ScrollIntoViewScope>
          {actions?.length ? (
            <View
              testID="sheet-actions"
              onLayout={(e) => setActionsHeight(e.nativeEvent.layout.height)}
              style={[styles.actions, { paddingBottom: space.m + clearance }]}>
              <ButtonRow buttons={actions} />
            </View>
          ) : null}
          {closing ? null : <SnackbarHost bottomOffset={(actions?.length ? actionsHeight : clearance) + space.s} />}
        </Animated.View>
      </View>
    </Modal>
  );
}

/** Sends TalkBack focus to the opener a sheet owes it to, and settles the debt, so it's sent once at most. */
function giveFocusBack(owed: RefObject<RefObject<ViewInstance | null> | null>) {
  const opener = owed.current?.current;
  owed.current = null;
  if (opener) AccessibilityInfo.sendAccessibilityEvent(opener, 'focus');
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
