import { formatClock, formatMs } from '../lib/format';

test('times under a second in ms, longer ones in seconds', () => {
  expect(formatMs(57)).toBe('57 ms');
  expect(formatMs(1400)).toBe('1.4 s');
  expect(formatMs(12345)).toBe('12.3 s');
});

test('a clock time', () => {
  expect(formatClock(new Date(2026, 10, 20, 14, 41))).toBe('2:41 PM');
});
