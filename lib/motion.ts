import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Whether the phone asks for less motion (design B §5.5). Then sheets, menus and the snackbar fade only, with no slide,
 * and the progress bar stops. It follows the setting while mounted; false (motion) until the phone answers.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let stale = false; // after a change event, or unmounting, the first answer is out of date
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (!stale) setReduced(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      stale = true;
      setReduced(enabled);
    });
    return () => {
      stale = true;
      subscription.remove();
    };
  }, []);
  return reduced;
}
