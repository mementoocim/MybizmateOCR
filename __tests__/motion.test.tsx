import { act, renderHook } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { useReducedMotion } from '../lib/motion';

type Listener = (enabled: boolean) => void;

// The phone's setting: what isReduceMotionEnabled() answers, and its change events, which every hook listening hears.
let listeners: Listener[] = [];
let remove = jest.fn();
beforeEach(() => {
  listeners = [];
  remove = jest.fn();
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation((event, listener) => {
    if (event === 'reduceMotionChanged') listeners.push(listener as Listener);
    return { remove };
  });
});

/** From now on, each isReduceMotionEnabled() call gets answer(). */
const phoneAnswers = (answer: () => Promise<boolean>) =>
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockImplementation(answer);
const never = () => new Promise<boolean>(() => {});
/** The person turns reduced motion on or off. */
const change = (enabled: boolean) => act(async () => listeners.forEach((l) => l(enabled)));

test('useReducedMotion follows the setting and its change', async () => {
  phoneAnswers(async () => true);
  const { result, unmount } = await renderHook(() => useReducedMotion());
  expect(result.current).toBe(true);
  expect(listeners).toHaveLength(1);

  await change(false);
  expect(result.current).toBe(false);

  await unmount();
  expect(remove).toHaveBeenCalledTimes(1);
});

test('a change before the first answer wins: the late answer is out of date', async () => {
  let answer: (enabled: boolean) => void = () => {};
  phoneAnswers(
    () =>
      new Promise((resolve) => {
        answer = resolve;
      }),
  );
  const { result } = await renderHook(() => useReducedMotion());
  await change(true); // the person turns reduced motion on while the phone is still answering
  expect(result.current).toBe(true);

  await act(async () => answer(false)); // the answer to the question asked before the change
  expect(result.current).toBe(true);

  // Nor is the late answer kept as the last known value: a hook mounted now starts from the change.
  phoneAnswers(never);
  const { result: next } = await renderHook(() => useReducedMotion());
  expect(next.current).toBe(true);
});

test('a hook mounted later starts at the last known value, so a sheet opened then never runs its full motion', async () => {
  phoneAnswers(async () => true);
  const { result: first } = await renderHook(() => useReducedMotion());
  expect(first.current).toBe(true);

  phoneAnswers(never); // this time the phone doesn't answer
  const { result: second } = await renderHook(() => useReducedMotion());
  expect(second.current).toBe(true); // from its first render, not from false

  await change(false);
  expect(first.current).toBe(false);
  expect(second.current).toBe(false);
  const { result: third } = await renderHook(() => useReducedMotion());
  expect(third.current).toBe(false);
});

test('no answer (a missing native module): no unhandled rejection, and motion stays on', async () => {
  phoneAnswers(never);
  await renderHook(() => useReducedMotion());
  await change(false); // the phone last said motion is on

  phoneAnswers(() => Promise.reject(new Error('AccessibilityInfo is not available')));
  const { result } = await renderHook(() => useReducedMotion());
  // Node reports a rejection nobody handled once the microtasks run out, and jest-circus fails the test then.
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
  expect(result.current).toBe(false);
});
