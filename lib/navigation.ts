import { router } from 'expo-router';

// Going back, the one way every screen does it: the header's Back, the camera's Close, a Retake that goes back (a
// sample, or a scan opened from Home or Saved), and a saved scan deleted from the Scan screen's ⋮ (Review Focus 4).

/**
 * Back to the screen under this one, or Home when there's none (ruling T24-1: the Stack is anchored on Home, so this
 * is the fallback). The router is read when it's called, so a test's expo-router mock needs a router only to go back.
 * router.back() queues one GO_BACK per call: a caller that can be tapped twice guards it to run once.
 */
export function goBackOrHome(): void {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}
