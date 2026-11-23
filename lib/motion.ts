import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * The phone's last answer or change event. A hook mounted later (a sheet or menu mounted only while it's open) starts
 * from it, so it doesn't run its full motion once before the phone answers again.
 */
let lastKnown = false;

/**
 * Whether the phone asks for less motion (design B §5.5). Then sheets, menus and the snackbar fade only, with no slide,
 * and the progress bar stops. It follows the setting while mounted; until the phone first answers, it's the last known
 * value, false (motion) at first.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(lastKnown);
  useEffect(() => {
    let stale = false; // after a change event, or unmounting, the first answer is out of date
    AccessibilityInfo.isReduceMotionEnabled().then(
      (enabled) => {
        if (stale) return;
        lastKnown = enabled;
        setReduced(enabled);
      },
      () => {}, // no answer (a missing native module): keep the last known value, motion by default
    );
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      stale = true;
      lastKnown = enabled;
      setReduced(enabled);
    });
    return () => {
      stale = true;
      subscription.remove();
    };
  }, []);
  return reduced;
}
