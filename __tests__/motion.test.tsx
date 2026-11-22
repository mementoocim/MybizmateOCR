import { act, renderHook } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { useReducedMotion } from '../lib/motion';

test('useReducedMotion follows the setting and its change', async () => {
  const listeners: ((enabled: boolean) => void)[] = [];
  const remove = jest.fn();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation((event, listener) => {
    if (event === 'reduceMotionChanged') listeners.push(listener as (enabled: boolean) => void);
    return { remove };
  });

  const { result, unmount } = await renderHook(() => useReducedMotion());
  expect(result.current).toBe(true);
  expect(listeners).toHaveLength(1);

  await act(async () => listeners.forEach((l) => l(false)));
  expect(result.current).toBe(false);

  await unmount();
  expect(remove).toHaveBeenCalledTimes(1);
});
