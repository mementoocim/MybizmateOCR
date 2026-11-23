import { useEffect } from 'react';

// expo-router's useFocusEffect, for a suite that mocks expo-router. As the real one, the effect runs as the screen
// mounts, on top, and again each time focusAgain() brings it back on top, back from a screen it opened, after its
// cleanup; nothing draws again. A screen's pushes run once until then (lib/navigation's usePushOnce).

const focuses = new Set<() => void>();

export function useFocusEffect(effect: () => void | (() => void)): void {
  useEffect(() => {
    let cleanup = effect();
    const clean = () => {
      if (typeof cleanup === 'function') cleanup();
    };
    const focused = () => {
      clean();
      cleanup = effect();
    };
    focuses.add(focused);
    return () => {
      focuses.delete(focused);
      clean();
    };
  }, [effect]);
}

/** The screen is on top again, back from the one it opened. */
export function focusAgain(): void {
  focuses.forEach((focused) => focused());
}
