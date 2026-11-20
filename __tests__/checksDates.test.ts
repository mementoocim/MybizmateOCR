import { dateChoice, dateRepairs, localIsoDate, parseDate } from '../lib/checks/dates';

// What the Python reference answers (fixtures/checks/dates.json, from prototype/benchmark/export_check_fixtures.py).
const D = require('../fixtures/checks/dates.json');

test('every date case like the Python', () => {
  for (const c of D.cases) {
    expect([c.readings, c.readings.map(parseDate)]).toEqual([c.readings, c.parse]);
    expect([c.readings, c.readings.map((r: string) => Object.fromEntries(dateRepairs(r)))]).toEqual([c.readings, c.repairs]);
    expect([c.readings, dateChoice(c.readings, c.today)]).toEqual([c.readings, c.choice]);
  }
});

test("localIsoDate uses the phone's own day", () => {
  expect(localIsoDate(new Date(2026, 10, 20, 7, 30))).toBe('2026-11-20');
  expect(localIsoDate(new Date(2026, 0, 5, 0, 1))).toBe('2026-01-05');
});
