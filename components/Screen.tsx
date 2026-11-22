import {
  createContext,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  Keyboard,
  ScrollView,
  type ScrollViewInstance,
  StyleSheet,
  type TextInputInstance,
  View,
  type ViewInstance,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, space } from '../lib/theme';

// Design B §5.6 and §8: the frame every screen is built from. On paper: the header (it takes the status bar's inset),
// what's pinned under it outside the scroll (the Scan screen's status strip), the scroll, then the bottom bar (it takes
// the navigation bar's inset). The app is edge-to-edge and Android no longer resizes the window for the keyboard, so
// the end of the scroll clears the navigation bar when there's no bottom bar, and the open keyboard. A field that
// takes focus asks the nearest ScrollIntoViewScope to scroll it into view: the Screen's own, or a sheet's.

type ScrollTarget = ViewInstance | TextInputInstance;
type ScrollRef = RefObject<ScrollViewInstance | null>;

/**
 * The nearest ScrollIntoViewScope's scroll-into-view; outside every scope, a no-op. React context passes through a
 * Modal, and a screen renders its sheets inside the Screen, so a sheet, menu or photo viewer opens a scope of its own
 * (its own scroll, or none). Otherwise its fields would scroll the Screen behind it, by an offset measured across the
 * modal.
 */
const ScrollIntoView = createContext<(target: ScrollTarget | null) => void>(() => {});

/**
 * Scroll-into-view for the fields inside it, in one ScrollView: a target is measured against the scroll's content and
 * scrolled to 24 dp under its top, never past the top. With scrollRef null it gives a no-op, so a modal that doesn't
 * scroll still cuts its fields off from the Screen behind it.
 */
export function ScrollIntoViewScope({ scrollRef, children }: { scrollRef: ScrollRef | null; children?: ReactNode }) {
  const scrollIntoView = useCallback((target: ScrollTarget | null) => scrollIntoViewOf(scrollRef, target), [scrollRef]);
  return <ScrollIntoView value={scrollIntoView}>{children}</ScrollIntoView>;
}

/**
 * Scrolls a target into view in that scroll, 24 dp under its top, never past the top: a focused field (through its
 * scope), or the row a flag chip opens (the Scan screen). A no-op without the scroll or its content.
 */
export function scrollIntoViewOf(scrollRef: ScrollRef | null, target: ScrollTarget | null) {
  const scrollView = scrollRef?.current;
  const content = scrollView?.getInnerViewRef(); // where y is measured from: the top of the scroll's content
  if (target == null || scrollView == null || content == null) return;
  target.measureLayout(content, (_x, y) => scrollView.scrollTo({ y: Math.max(0, y - space.xl), animated: true }));
}

export function Screen({
  header,
  pinned,
  bottom,
  children,
  scroll = true,
  scrollRef,
  testID,
}: {
  header: ReactNode;
  pinned?: ReactNode; // under the header, outside the scroll (the Scan screen's strip)
  bottom?: ReactNode; // a BottomBar
  children?: ReactNode;
  scroll?: boolean; // default true; false: the screen brings its own FlatList/SectionList (and useEndPadding)
  scrollRef?: RefObject<ScrollViewInstance | null>;
  testID?: string;
}) {
  const scrollViewRef = useRef<ScrollViewInstance>(null);
  // The caller's ref gets the same ScrollView (null while there's none: scroll={false}).
  useImperativeHandle<ScrollViewInstance | null, ScrollViewInstance | null>(scrollRef, () => scrollViewRef.current);
  const end = useEndPadding(Boolean(bottom));

  return (
    <ScrollIntoViewScope scrollRef={scroll ? scrollViewRef : null}>
      <View testID={testID} style={styles.screen}>
        {header}
        {pinned}
        {scroll ? (
          <ScrollView
            ref={scrollViewRef}
            testID="screen-scroll"
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: end }}>
            {children}
          </ScrollView>
        ) : (
          children
        )}
        {bottom}
      </View>
    </ScrollIntoViewScope>
  );
}

/**
 * The open keyboard's height in dp, 0 while it's hidden. On Android this is its height above the navigation bar
 * (keyboardDidShow's endCoordinates.height); it's sent again when the height changes while it stays open.
 */
export function useKeyboardHeight(): number {
  // Mounted while the keyboard is open (a sheet opened from a field, say), it starts from the keyboard's last report.
  const [height, setHeight] = useState(() => Keyboard.metrics()?.height ?? 0);
  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', (e) => setHeight(e.endCoordinates.height));
    const hidden = Keyboard.addListener('keyboardDidHide', () => setHeight(0));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);
  return height;
}

/**
 * Scrolls a focused field into view, 24 dp under the top of the nearest scope's scroll (the Screen's, or a sheet's).
 * A no-op outside every scope, or in one with no scroll.
 */
export function useScrollIntoView(): (target: ViewInstance | TextInputInstance | null) => void {
  return useContext(ScrollIntoView);
}

/**
 * The space under a scroll's last row: space.xl, plus the navigation bar's inset when no bottom bar takes it, plus the
 * open keyboard, which covers the bar too. Screen uses it; a screen with its own list gives it to the list.
 */
export function useEndPadding(hasBottomBar: boolean): number {
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardHeight();
  return (hasBottomBar ? 0 : insets.bottom) + space.xl + keyboard;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
});
