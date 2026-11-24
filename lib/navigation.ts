import { type Href, useFocusEffect, useNavigation, useRouter } from 'expo-router';
import { useCallback, useRef } from 'react';

// Going back, the one way every screen does it: the header's Back, a Retake that goes back (a
// sample, or a scan opened from Home or Saved), and a saved scan deleted from the Scan screen's ⋮ (Review Focus 4). And
// opening a screen from a press, once.

/**
 * Back to the screen under this one, or Home when there's none (ruling T24-1: the Stack is anchored on Home, so this
 * is the fallback). The screen's own navigation goes back, and useRouter() goes Home: both reach the live root through
 * React. Never expo-router's global router, nor its shared navigation ref (ruling T26-4): a new font size, display size
 * or language restarts Android's activity in the same JS context, and the old root's late unmount unbinds that router,
 * whose every method then throws, and clears the ref that router.canGoBack() and useRouter().canGoBack() read.
 * Going back queues one GO_BACK per call: a caller that can be tapped twice guards it to run once.
 */
export function useGoBackOrHome(): () => void {
  const navigation = useNavigation();
  const router = useRouter();
  return () => {
    if (navigation.canGoBack()) navigation.goBack();
    else router.replace('/');
  };
}

/**
 * A screen's push from a press, once: a second press before the new screen is up would push it again (two cameras, one
 * over the other: the final review's Minor 4). It pushes again once the screen is focused again, back from the one it
 * opened. A screen takes one, for all its presses, so two different presses can't stack two screens either. On the
 * live root's router, useRouter(), as useGoBackOrHome goes Home (ruling T26-4).
 */
export function usePushOnce(): (href: Href) => void {
  const router = useRouter();
  const pushed = useRef(false); // set at once, so a second press is refused before the screen has gone
  useFocusEffect(
    useCallback(() => {
      pushed.current = false;
    }, []),
  );
  return (href) => {
    if (pushed.current) return;
    pushed.current = true;
    router.push(href);
  };
}

/**
 * As usePushOnce, for a tab, or a screen in one: opened from a press, once. From inside the tabs, it navigates: the
 * tabs switch. From a screen above them (the Scan screen), it's expo-router's dismissTo: the screens over the tabs go,
 * and the tabs switch, since navigate would push a second tabs over the first, and Back would show the screen just left
 * (while dismissTo does nothing from inside the tabs). On the live root's router (ruling T26-4).
 */
export function useNavigateOnce(): (href: Href) => void {
  const router = useRouter();
  const navigation = useNavigation();
  const opened = useRef(false); // set at once, so a second press is refused before the tab is up
  useFocusEffect(
    useCallback(() => {
      opened.current = false;
    }, []),
  );
  return (href) => {
    if (opened.current) return;
    opened.current = true;
    if (inTabs(navigation)) router.navigate(href);
    else router.dismissTo(href);
  };
}

/** Whether a screen is inside the tabs: a tab, or a screen in a tab's own Stack. */
type Nav = { getState(): { type?: string } | undefined; getParent(): Nav | undefined };
function inTabs(navigation: Nav): boolean {
  for (let nav: Nav | undefined = navigation; nav; nav = nav.getParent()) {
    if (nav.getState()?.type === 'tab') return true;
  }
  return false;
}
