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

// The plain dynamic programme the fast, bit-parallel count must equal, on strings both shorter and longer than the
// 30 code points it handles at once, as fuzz_py computes ratio and partial_ratio with it.
function lcsPlain(a: number[], b: number[]): number {
  const t = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      t[i][j] = a[i - 1] === b[j - 1] ? t[i - 1][j - 1] + 1 : Math.max(t[i - 1][j], t[i][j - 1]);
    }
  }
  return t[a.length][b.length];
}
const codes = (s: string) => Array.from(s, (c) => c.codePointAt(0)!);
const similarity = (a: number[], b: number[]) => {
  const lensum = a.length + b.length;
  return 1.0 - (lensum ? (lensum - 2 * lcsPlain(a, b)) / lensum : 0);
};
function partialPlain(s1: number[], s2: number[]): number {
  const inS1 = new Set(s1);
  let best = 0;
  const windows: [number, number][] = [];
  for (let i = 1; i < s1.length; i++) if (inS1.has(s2[i - 1])) windows.push([0, i]);
  for (let i = 0; i < s2.length - s1.length; i++) if (inS1.has(s2[i + s1.length - 1])) windows.push([i, i + s1.length]);
  for (let i = s2.length - s1.length; i < s2.length; i++) if (inS1.has(s2[i])) windows.push([i, s2.length]);
  for (const [from, to] of windows) {
    best = Math.max(best, similarity(s1, s2.slice(from, to)));
    if (best === 1) return 100;
  }
  return best * 100;
}

test('the fast common-subsequence count gives the plain one', () => {
  let seed = 20261120;
  const random = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const word = () => Array.from({ length: Math.floor(random() * 70) }, () => 'abcdñ '[Math.floor(random() * 6)]).join('');
  for (let k = 0; k < 2000; k++) {
    const a = word();
    const b = word();
    expect([a, b, ratio(a, b)]).toEqual([a, b, similarity(codes(a), codes(b)) * 100]);
    if (a === '' && b === '') continue;
    const [s, l] = codes(a).length <= codes(b).length ? [codes(a), codes(b)] : [codes(b), codes(a)];
    let expected = partialPlain(s, l);
    if (expected !== 100 && s.length === l.length) expected = Math.max(expected, partialPlain(l, s));
    expect([a, b, partialRatio(a, b)]).toEqual([a, b, expected]);
  }
});
