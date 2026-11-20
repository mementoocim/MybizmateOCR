/**
 * Pins the phone's clock (Date only: timers stay real, so the screens' tests still settle) — so a scan that isn't a
 * sample is checked as of a fixed day.
 */
export function pinToday(when: Date): void {
  jest.useFakeTimers({
    doNotFake: [
      'hrtime',
      'nextTick',
      'performance',
      'queueMicrotask',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'requestIdleCallback',
      'cancelIdleCallback',
      'setImmediate',
      'clearImmediate',
      'setInterval',
      'clearInterval',
      'setTimeout',
      'clearTimeout',
    ],
  });
  jest.setSystemTime(when);
}
