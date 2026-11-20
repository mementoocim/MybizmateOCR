import {
  extract,
  extractOne,
  partialRatio,
  partialTokenRatio,
  ratio,
  tokenRatio,
  tokenSetRatio,
  tokenSortRatio,
  wRatio,
} from '../lib/checks/fuzzy';

// rapidfuzz 3.14.6's scores, as the Python reference computes them (fixtures/checks/fuzzy.json, written by
// prototype/benchmark/export_check_fixtures.py).
const F = require('../fixtures/checks/fuzzy.json');

const SCORERS: Record<string, (a: string, b: string) => number> = {
  ratio,
  partial_ratio: partialRatio,
  token_sort_ratio: tokenSortRatio,
  token_set_ratio: tokenSetRatio,
  token_ratio: tokenRatio,
  partial_token_ratio: partialTokenRatio,
  WRatio: wRatio,
};

test('every pair scores like rapidfuzz', () => {
  for (const p of F.pairs)
    for (const [key, fn] of Object.entries(SCORERS)) expect([p.a, p.b, key, fn(p.a, p.b)]).toEqual([p.a, p.b, key, p[key]]);
});

test('extractOne picks like rapidfuzz: the first of equals', () => {
  for (const c of F.extract_one) expect([c.query, extractOne(c.query, c.choices, ratio)]).toEqual([c.query, c.result]);
});

test('extract ranks like rapidfuzz: equals keep their order', () => {
  for (const c of F.extract) expect([c.query, extract(c.query, c.choices, wRatio, c.limit)]).toEqual([c.query, c.result]);
});

test("ratio keeps rapidfuzz's arithmetic", () => {
  expect(ratio('abc', 'abd')).toBe(100 * (1 - 2 / 6));
});
