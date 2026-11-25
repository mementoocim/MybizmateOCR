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
 * - replace: a screen in this one's place (the Scan screen's Next invoice: the session's next scan to check).
 * - navigate: a tab, or a screen in one. While the tabs are on top when it runs (read then: tabsOnTop), it navigates:
 *   the tabs switch. With a screen above them (the Scan screen), it's expo-router's dismissTo: the screens over the tabs
 *   go, and the tabs switch, since navigate
 *   would push a second tabs over the first, and Back would show the screen just left (while dismissTo does nothing
 *   from inside the tabs). Its options are the router's: withAnchor puts a tab's own list under a screen opened in it
 *   (Done's session screen, with Sessions under it). Its `before` runs first, and only when the guard lets the tab
 *   open: a session screen's Retake makes that session the camera's (lib/session's retakeIn) only if the camera opens.
 * - leave: a press that leaves this screen some other way, behind the same guard (the Scan screen's Retake going back,
 *   or down to the camera), so a Retake and a Next invoice in one go leave it once.
 * - busy: whether one of them has opened, until this screen is on top again: a press that isn't an open (a delete's
 *   dialog) waits for it too.
 * On the live root's router, useRouter(), as useGoBackOrHome goes to the camera (ruling T26-4).
 */
export function useOpenOnce(): OpenOnce {
  const router = useRouter();
  const navigation = useNavigation();
  const opened = useRef(false); // set at once, so a second press is refused before the screen or tab is up
  useFocusEffect(
    useCallback(() => {
      opened.current = false;
    }, []),
  );
  /** Whether a press has opened a screen or a tab, and this screen isn't on top again yet. */
  const busy = useCallback(() => opened.current, []);
  const once = (open: () => void) => {
    if (opened.current) return;
    opened.current = true;
    open();
  };
  return {
    push: (href) => once(() => router.push(href)),
    replace: (href) => once(() => router.replace(href)),
    leave: (go) => once(go),
    busy,
    navigate: (href, options, before) =>
      once(() => {
        before?.();
        const tabs = tabsOnTop(navigation); // as things are now: a snackbar's View can outlive its screen (T10-1)
        if (!options) return tabs ? router.navigate(href) : router.dismissTo(href);
        return tabs ? router.navigate(href, options) : router.dismissTo(href, options);
      }),
  };
}

/** A screen's one guard for its presses that open a screen or a tab, or leave it (useOpenOnce). */
export type OpenOnce = {
  push: (href: Href) => void;
  replace: (href: Href) => void;
  navigate: (href: Href, options?: NavigateOptions, before?: () => void) => void;
  leave: (go: () => void) => void;
  busy: () => boolean;
};

type NavigateOptions = Parameters<ReturnType<typeof useRouter>['navigate']>[1];

/** useOpenOnce's push, for a screen that only pushes. */
export function usePushOnce(): (href: Href) => void {
  return useOpenOnce().push;
}

/** useOpenOnce's navigate, for a screen that only opens tabs. */
export function useNavigateOnce(): (href: Href) => void {
  return useOpenOnce().navigate;
}

type Nav = {
  getState(): { type?: string; index?: number; routes?: readonly { name: string }[] } | undefined;
  getParent(): Nav | undefined;
};

/**
 * Whether the tabs are what's on top now, read from the live state when it's called: the root Stack's focused route,
 * found going up from this screen's navigation (a navigator's state is its current one, even for a screen that has
 * gone, as the Scan screen has once View is pressed on its snackbar over the camera: ruling T10-1). Where no navigator
 * holds the tabs (a suite's mock), whether this screen is inside them: a tab, or a screen in a tab's own Stack.
 */
function tabsOnTop(navigation: Nav): boolean {
  let inTabs = false;
  for (let nav: Nav | undefined = navigation; nav; nav = nav.getParent()) {
    const state = nav.getState();
    if (state?.type === 'tab') inTabs = true;
    const routes = state?.routes;
    if (routes?.some((r) => r.name === '(tabs)')) return routes[state?.index ?? 0]?.name === '(tabs)';
  }
  return inTabs;
}
