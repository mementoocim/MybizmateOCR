import { candidates, parseAmount, pyRound, pySum, qtyValues, wordsToNumber } from '../lib/checks/num';

// What the Python reference answers (fixtures/checks/numbers.json, from prototype/benchmark/export_check_fixtures.py).
const N = require('../fixtures/checks/numbers.json');

test('pyRound is Python round', () => {
  for (const [x, n, want] of N.round) expect([x, n, pyRound(x, n)]).toEqual([x, n, want]);
  expect([0.125, 0.375, 0.005, 1.005, -0.125].map((x) => pyRound(x, 2))).toEqual([0.12, 0.38, 0.01, 1, -0.12]);
});

test("pySum is Python 3.12's sum", () => {
  for (const [xs, want] of N.fsum) expect([xs, pySum(xs)]).toEqual([xs, want]);
  expect(pySum(Array(10).fill(0.1))).toBe(1);
});

test('amounts, quantities and words like the Python', () => {
  for (const [s, v] of N.parse_amount) expect([s, parseAmount(s)]).toEqual([s, v]);
  for (const [box, vs] of N.candidates) expect([box, candidates(box)]).toEqual([box, vs]);
  for (const [s, vs] of N.qty_values) expect([s, qtyValues(s)]).toEqual([s, vs]);
  for (const [s, v] of N.words_to_number) expect([s, wordsToNumber(s)]).toEqual([s, v]);
});
