import { amount, formatClock, formatMs, monthDay, monthSpan, peso, prettyDate, qty } from '../lib/format';

test('amount: rows without the peso sign', () => {
  expect(amount(5810.5)).toBe('5,810.50');
  expect(amount(12345678.9)).toBe('12,345,678.90');
  expect(amount(-12.3)).toBe('-12.30');
  expect(amount(null)).toBe('—');
});

test('monthDay', () => {
  expect(monthDay('2026-11-22')).toBe('Nov 22');
  expect(monthDay('2026-01-05')).toBe('Jan 5');
});

test('pesos, quantities and dates as the test app writes them', () => {
  expect(peso(1575)).toBe('₱1,575.00');
  expect(peso(1234567.5)).toBe('₱1,234,567.50');
  expect(peso(0.5)).toBe('₱0.50');
  expect(peso(null)).toBe('—');
  expect(peso(-12.3)).toBe('-₱12.30');
  expect(qty(0.5)).toBe('0.5');
  expect(qty(1500)).toBe('1,500');
  expect(qty(1 / 3)).toBe('0.33');
  expect(qty(10)).toBe('10');
  expect(qty(null)).toBe('?');
  expect(prettyDate('2026-10-21')).toBe('Oct 21, 2026');
  expect(prettyDate('2026-01-05')).toBe('Jan 5, 2026');
  expect(prettyDate(null)).toBeNull();
});

test('the months a period spans', () => {
  expect(monthSpan('2026-10-01', '2026-12-31')).toBe('Oct–Dec 2026');
  expect(monthSpan('2026-10-01', '2026-10-31')).toBe('Oct 2026');
  expect(monthSpan('2025-12-01', '2026-02-28')).toBe('Dec 2025–Feb 2026');
});

test('times under a second in ms, longer ones in seconds', () => {
  expect(formatMs(57)).toBe('57 ms');
  expect(formatMs(1400)).toBe('1.4 s');
  expect(formatMs(12345)).toBe('12.3 s');
});

test('a clock time', () => {
  expect(formatClock(new Date(2026, 10, 20, 14, 41))).toBe('2:41 PM');
});
