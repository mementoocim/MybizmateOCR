import { type Href, useFocusEffect, useNavigation, useRouter } from 'expo-router';
import { useCallback, useRef } from 'react';

// Going back, the one way every screen does it: the header's Back, a Retake that goes back (a sample, or a scan opened
// from Home or Saved), and a saved scan deleted from the Scan screen's ⋮ (Review Focus 4). And opening a screen or a
// tab from a press, once.

/**
 * Back to the screen under this one, or the camera when there's none (rulings T24-1 and T6-2: the root Stack is
 * anchored on the tabs, and the tabs on the camera, where the app starts, so this is the fallback). The screen's own
 * navigation goes back, and useRouter() goes to the camera: both reach the live root through React. Never
 * expo-router's global router, nor its shared navigation ref (ruling T26-4): a new font size, display size or language
 * restarts Android's activity in the same JS context, and the old root's late unmount unbinds that router, whose every
 * method then throws, and clears the ref that router.canGoBack() and useRouter().canGoBack() read.
 * Going back queues one GO_BACK per call: a caller that can be tapped twice guards it to run once.
 */
export function useGoBackOrHome(): () => void {
  const navigation = useNavigation();
  const router = useRouter();
  return () => {
    if (navigation.canGoBack()) navigation.goBack();
    else router.replace('/camera');
  };
}

/**
 * A screen's presses that open another screen or a tab, once, behind one guard: a second press before the new screen
 * is up would open it again (two cameras, one over the other: the final review's Minor 4). The screen opens again once
 * it's focused again, back from the one it opened. A screen takes one, for all its presses, pushes and tabs alike, so
 * two different presses can't open two screens either (ruling T6-1: with a guard each, Home's Your lists then Take
 * photo, in one go, pushed Your lists, and the camera's href, resolved over it, a second tabs).
 * - push: a screen over this one.
 * - navigate: a tab, or a screen in one. From inside the tabs, it navigates: the tabs switch. From a screen above them
 *   (the Scan screen), it's expo-router's dismissTo: the screens over the tabs go, and the tabs switch, since navigate
 *   would push a second tabs over the first, and Back would show the screen just left (while dismissTo does nothing
 *   from inside the tabs). Its options are the router's: withAnchor puts a tab's own list under a screen opened in it
 *   (Done's session screen, with Sessions under it).
 * On the live root's router, useRouter(), as useGoBackOrHome goes to the camera (ruling T26-4).
 */
export function useOpenOnce(): {
  push: (href: Href) => void;
  navigate: (href: Href, options?: NavigateOptions) => void;
} {
  const router = useRouter();
  const navigation = useNavigation();
  const opened = useRef(false); // set at once, so a second press is refused before the screen or tab is up
  useFocusEffect(
    useCallback(() => {
      opened.current = false;
    }, []),
  );
  const once = (open: () => void) => {
    if (opened.current) return;
    opened.current = true;
    open();
  };
  return {
    push: (href) => once(() => router.push(href)),
    navigate: (href, options) =>
      once(() => {
        const tabs = inTabs(navigation);
        if (!options) return tabs ? router.navigate(href) : router.dismissTo(href);
        return tabs ? router.navigate(href, options) : router.dismissTo(href, options);
      }),
  };
}

type NavigateOptions = Parameters<ReturnType<typeof useRouter>['navigate']>[1];

/** useOpenOnce's push, for a screen that only pushes. */
export function usePushOnce(): (href: Href) => void {
  return useOpenOnce().push;
}

/** useOpenOnce's navigate, for a screen that only opens tabs. */
export function useNavigateOnce(): (href: Href) => void {
  return useOpenOnce().navigate;
}

/** Whether a screen is inside the tabs: a tab, or a screen in a tab's own Stack. */
type Nav = { getState(): { type?: string } | undefined; getParent(): Nav | undefined };
function inTabs(navigation: Nav): boolean {
  for (let nav: Nav | undefined = navigation; nav; nav = nav.getParent()) {
    if (nav.getState()?.type === 'tab') return true;
  }
  return false;
}
