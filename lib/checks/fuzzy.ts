// rapidfuzz 3.14.6's scorers, as the Python reference uses them (postprocess.py), ported function by function from
// rapidfuzz/fuzz_py.py and process_py.py. Strings are compared by code point, as Python does, and callers lower-case
// them (no processor). Score cutoffs are left out: they only skip work, and never change the answer of the calls the
// checks make. Each formula keeps rapidfuzz's arithmetic, so the scores are the same numbers to the last digit.
//
// Speed: a person's lists can hold thousands of names, scored on the phone's JavaScript thread. So the longest
// common subsequence is counted with rapidfuzz's own bit-parallel method (Hyyro's) whenever the shorter string fits
// in 30 bits, and each string's code points, tokens and bit masks are worked out once and kept.

export type Scorer = (a: string, b: string) => number;

// Python's str.split() with no argument: runs of its whitespace.
const PY_WHITESPACE = new RegExp(
  `[${String.fromCharCode(
    0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x1c, 0x1d, 0x1e, 0x1f, 0x20, 0x85, 0xa0, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003,
    0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000,
  )}]+`,
);

/** A string worked out once: its code points, its tokens, and (when short enough) its bit masks. */
type Prepared = { cps: readonly number[]; tokens?: readonly string[]; masks?: ReadonlyMap<number, number> };

const MAX_KEPT = 50000;
const kept = new Map<string, Prepared>();

function prep(s: string): Prepared {
  let p = kept.get(s);
  if (p === undefined) {
    if (kept.size >= MAX_KEPT) kept.clear();
    p = { cps: Array.from(s, (c) => c.codePointAt(0)!) };
    kept.set(s, p);
  }
  return p;
}

const cps = (s: string): readonly number[] => prep(s).cps;

function splitTokens(s: string): readonly string[] {
  const p = prep(s);
  return (p.tokens ??= s.split(PY_WHITESPACE).filter((t) => t !== ''));
}

/** Python's sorted() on strings: by code point. */
function pySorted(tokens: Iterable<string>): string[] {
  return [...tokens]
    .map((t) => ({ t, c: cps(t) }))
    .sort((x, y) => {
      const a = x.c;
      const b = y.c;
      for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i];
      return a.length - b.length;
    })
    .map((x) => x.t);
}

const BITS = 30; // a pattern this long keeps every sum below 2^31

/** For each code point of a short string, the bits of the positions where it stands. */
function masksOf(s: string): ReadonlyMap<number, number> {
  const p = prep(s);
  if (p.masks === undefined) {
    const masks = new Map<number, number>();
    p.cps.forEach((c, i) => masks.set(c, (masks.get(c) ?? 0) | (1 << i)));
    p.masks = masks;
  }
  return p.masks;
}

function bitCount(v: number): number {
  v -= (v >>> 1) & 0x55555555;
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return Math.imul((v + (v >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24;
}

/** The longest common subsequence of a pattern (BITS or fewer code points) and text[from, to), bit-parallel. */
function lcsBits(masks: ReadonlyMap<number, number>, m: number, text: readonly number[], from: number, to: number): number {
  const all = (1 << m) - 1;
  let s = all;
  for (let j = from; j < to; j++) {
    const match = masks.get(text[j]);
    if (match === undefined) continue;
    const u = s & match;
    s = ((s + u) | (s - u)) & all;
  }
  return m - bitCount(s);
}

/** The longest common subsequence of a and b[from, to), by the plain dynamic programme. */
function lcsTable(a: readonly number[], b: readonly number[], from: number, to: number): number {
  const n = to - from;
  if (a.length === 0 || n === 0) return 0;
  let prev = new Int32Array(n + 1);
  let cur = new Int32Array(n + 1);
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= n; j++) {
      cur[j] = a[i - 1] === b[from + j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}

/** The length of the longest common subsequence of a and b[from, to) (all of b by default). */
function lcs(a: string, b: string, from = 0, to = cps(b).length): number {
  const ca = cps(a);
  if (ca.length === 0 || to <= from) return 0;
  if (ca.length <= BITS) return lcsBits(masksOf(a), ca.length, cps(b), from, to);
  if (from === 0 && to === cps(b).length && cps(b).length <= BITS) return lcsBits(masksOf(b), cps(b).length, ca, 0, ca.length);
  return lcsTable(ca, cps(b), from, to);
}

/** Indel.normalized_similarity of a and b[from, to), from 0 to 1. */
function indelSimilarity(a: string, b: string, from = 0, to = cps(b).length): number {
  const lensum = cps(a).length + (to - from);
  const normDist = lensum ? (lensum - 2 * lcs(a, b, from, to)) / lensum : 0;
  return 1.0 - normDist;
}

/** fuzz_py._norm_distance, without a cutoff. */
function normDistance(dist: number, lensum: number): number {
  return lensum ? 100 - (100 * dist) / lensum : 100;
}

export function ratio(a: string, b: string): number {
  return indelSimilarity(a, b) * 100;
}

/** _partial_ratio_impl: the shorter s1 against the windows of s2 that could line up with it. */
function partialImpl(s1: string, s2: string): number {
  const c1 = cps(s1);
  const c2 = cps(s2);
  const inS1 = new Set(c1);
  const len1 = c1.length;
  const len2 = c2.length;
  let best = 0;
  const tryWindow = (from: number, to: number): boolean => {
    const r = indelSimilarity(s1, s2, from, to);
    if (r > best) best = r;
    return best === 1;
  };
  for (let i = 1; i < len1; i++) {
    if (inS1.has(c2[i - 1]) && tryWindow(0, i)) return 100;
  }
  for (let i = 0; i < len2 - len1; i++) {
    if (inS1.has(c2[i + len1 - 1]) && tryWindow(i, i + len1)) return 100;
  }
  for (let i = len2 - len1; i < len2; i++) {
    if (inS1.has(c2[i]) && tryWindow(i, len2)) return 100;
  }
  return best * 100;
}

export function partialRatio(a: string, b: string): number {
  if (a === '' && b === '') return 100;
  const len1 = cps(a).length;
  const len2 = cps(b).length;
  const [shorter, longer] = len1 <= len2 ? [a, b] : [b, a];
  let score = partialImpl(shorter, longer);
  if (score !== 100 && len1 === len2) {
    const swapped = partialImpl(longer, shorter);
    if (swapped > score) score = swapped;
  }
  return score;
}

export function tokenSortRatio(a: string, b: string): number {
  return ratio(pySorted(splitTokens(a)).join(' '), pySorted(splitTokens(b)).join(' '));
}

export function tokenSetRatio(a: string, b: string): number {
  const ta = new Set(splitTokens(a));
  const tb = new Set(splitTokens(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  const intersect = [...ta].filter((t) => tb.has(t));
  const diffAB = [...ta].filter((t) => !tb.has(t));
  const diffBA = [...tb].filter((t) => !ta.has(t));
  if (intersect.length > 0 && (diffAB.length === 0 || diffBA.length === 0)) return 100;
  const abJoined = pySorted(diffAB).join(' ');
  const baJoined = pySorted(diffBA).join(' ');
  const abLen = cps(abJoined).length;
  const baLen = cps(baJoined).length;
  const sectLen = cps(intersect.join(' ')).length;
  const gap = sectLen !== 0 ? 1 : 0;
  const sectAbLen = sectLen + gap + abLen;
  const sectBaLen = sectLen + gap + baLen;
  const result = normDistance(abLen + baLen - 2 * lcs(abJoined, baJoined), sectAbLen + sectBaLen);
  if (!sectLen) return result;
  const sectAbRatio = normDistance(gap + abLen, sectLen + sectAbLen);
  const sectBaRatio = normDistance(gap + baLen, sectLen + sectBaLen);
  return Math.max(result, sectAbRatio, sectBaRatio);
}

export function tokenRatio(a: string, b: string): number {
  return Math.max(tokenSetRatio(a, b), tokenSortRatio(a, b));
}

export function partialTokenRatio(a: string, b: string): number {
  const splitA = splitTokens(a);
  const splitB = splitTokens(b);
  const ta = new Set(splitA);
  const tb = new Set(splitB);
  for (const t of ta) if (tb.has(t)) return 100;
  // No token in common, so the differences are the token sets themselves.
  const result = partialRatio(pySorted(splitA).join(' '), pySorted(splitB).join(' '));
  if (splitA.length === ta.size && splitB.length === tb.size) return result;
  return Math.max(result, partialRatio(pySorted(ta).join(' '), pySorted(tb).join(' ')));
}

export function wRatio(a: string, b: string): number {
  if (a === '' || b === '') return 0;
  const len1 = cps(a).length;
  const len2 = cps(b).length;
  const lenRatio = len1 > len2 ? len1 / len2 : len2 / len1;
  let end = ratio(a, b);
  if (lenRatio < 1.5) return Math.max(end, tokenRatio(a, b) * 0.95);
  const partialScale = lenRatio <= 8.0 ? 0.9 : 0.6;
  end = Math.max(end, partialRatio(a, b) * partialScale);
  return Math.max(end, partialTokenRatio(a, b) * 0.95 * partialScale);
}

/** process.extractOne over a list: the best choice, the first of equals, as [choice, score, index]. */
export function extractOne(query: string, choices: readonly string[], scorer: Scorer): [string, number, number] | null {
  let best: [string, number, number] | null = null;
  for (let i = 0; i < choices.length; i++) {
    const score = scorer(query, choices[i]);
    if (best === null || score > best[1]) best = [choices[i], score, i];
    if (score === 100) break;
  }
  return best;
}

/** process.extract over [key, value] pairs: the `limit` best as [value, score, key], equals in their input order. */
export function extract(
  query: string,
  choices: readonly (readonly [string, string])[],
  scorer: Scorer,
  limit: number,
): [string, number, string][] {
  return choices
    .map(([key, value], i) => ({ key, value, i, score: scorer(query, value) }))
    .sort((x, y) => y.score - x.score || x.i - y.i)
    .slice(0, limit)
    .map((c) => [c.value, c.score, c.key]);
}
