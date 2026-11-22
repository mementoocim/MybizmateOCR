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
// takes focus asks the Screen around it to scroll it into view.

type ScrollTarget = ViewInstance | TextInputInstance;

/** Outside a Screen (a sheet's own scroll, say) there's nothing to scroll: a no-op. */
const ScrollIntoView = createContext<(target: ScrollTarget | null) => void>(() => {});

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

  const scrollIntoView = useCallback((target: ScrollTarget | null) => {
    const scrollView = scrollViewRef.current;
    const content = scrollView?.getInnerViewRef(); // where y is measured from: the top of the scroll's content
    if (target == null || scrollView == null || content == null) return;
    target.measureLayout(content, (_x, y) => scrollView.scrollTo({ y: Math.max(0, y - space.xl), animated: true }));
  }, []);

  return (
    <ScrollIntoView value={scrollIntoView}>
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
    </ScrollIntoView>
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

/** Scrolls a focused field into view, 24 dp under the top of the Screen's scroll. A no-op outside a Screen. */
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
