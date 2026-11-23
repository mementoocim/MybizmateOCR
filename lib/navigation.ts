import { useNavigation, useRouter } from 'expo-router';

// Going back, the one way every screen does it: the header's Back, the camera's Close, a Retake that goes back (a
// sample, or a scan opened from Home or Saved), and a saved scan deleted from the Scan screen's ⋮ (Review Focus 4).

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
