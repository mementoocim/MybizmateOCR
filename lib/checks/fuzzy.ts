// rapidfuzz 3.14.6's scorers, as the Python reference uses them (postprocess.py), ported function by function from
// rapidfuzz/fuzz_py.py and process_py.py. Strings are compared by code point, as Python does, and callers lower-case
// them (no processor). Score cutoffs are left out: they only skip work, and never change the answer of the calls the
// checks make. Each formula keeps rapidfuzz's arithmetic, so the scores are the same numbers to the last digit.

export type Scorer = (a: string, b: string) => number;

// Python's str.split() with no argument: runs of its whitespace.
const PY_WHITESPACE = new RegExp(
  `[${String.fromCharCode(
    0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x1c, 0x1d, 0x1e, 0x1f, 0x20, 0x85, 0xa0, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003,
    0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000,
  )}]+`,
);

function splitTokens(s: string): string[] {
  return s.split(PY_WHITESPACE).filter((t) => t !== '');
}

const chars = (s: string): string[] => Array.from(s);

/** Python's sorted() on strings: by code point. */
function pySorted(tokens: Iterable<string>): string[] {
  return [...tokens].sort((x, y) => {
    const a = Array.from(x, (c) => c.codePointAt(0)!);
    const b = Array.from(y, (c) => c.codePointAt(0)!);
    for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i];
    return a.length - b.length;
  });
}

/** The length of the longest common subsequence. */
function lcs(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  let prev = new Int32Array(b.length + 1);
  let cur = new Int32Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[b.length];
}

/** Indel.distance: the characters to delete and insert to turn one into the other. */
function indelDistance(a: readonly string[], b: readonly string[]): number {
  return a.length + b.length - 2 * lcs(a, b);
}

/** Indel.normalized_similarity, from 0 to 1. */
function indelSimilarity(a: readonly string[], b: readonly string[]): number {
  const lensum = a.length + b.length;
  const normDist = lensum ? indelDistance(a, b) / lensum : 0;
  return 1.0 - normDist;
}

/** fuzz_py._norm_distance, without a cutoff. */
function normDistance(dist: number, lensum: number): number {
  return lensum ? 100 - (100 * dist) / lensum : 100;
}

export function ratio(a: string, b: string): number {
  return indelSimilarity(chars(a), chars(b)) * 100;
}

/** _partial_ratio_impl: the shorter s1 against the windows of s2 that could line up with it. */
function partialImpl(s1: readonly string[], s2: readonly string[]): number {
  const inS1 = new Set(s1);
  const len1 = s1.length;
  const len2 = s2.length;
  let best = 0;
  const tryWindow = (window: readonly string[]): boolean => {
    const r = indelSimilarity(s1, window);
    if (r > best) best = r;
    return best === 1;
  };
  for (let i = 1; i < len1; i++) {
    if (inS1.has(s2[i - 1]) && tryWindow(s2.slice(0, i))) return 100;
  }
  for (let i = 0; i < len2 - len1; i++) {
    if (inS1.has(s2[i + len1 - 1]) && tryWindow(s2.slice(i, i + len1))) return 100;
  }
  for (let i = len2 - len1; i < len2; i++) {
    if (inS1.has(s2[i]) && tryWindow(s2.slice(i))) return 100;
  }
  return best * 100;
}

export function partialRatio(a: string, b: string): number {
  if (a === '' && b === '') return 100;
  const s1 = chars(a);
  const s2 = chars(b);
  const [shorter, longer] = s1.length <= s2.length ? [s1, s2] : [s2, s1];
  let score = partialImpl(shorter, longer);
  if (score !== 100 && s1.length === s2.length) {
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
  const abJoined = chars(pySorted(diffAB).join(' '));
  const baJoined = chars(pySorted(diffBA).join(' '));
  const sectLen = chars(intersect.join(' ')).length;
  const gap = sectLen !== 0 ? 1 : 0;
  const sectAbLen = sectLen + gap + abJoined.length;
  const sectBaLen = sectLen + gap + baJoined.length;
  const result = normDistance(indelDistance(abJoined, baJoined), sectAbLen + sectBaLen);
  if (!sectLen) return result;
  const sectAbRatio = normDistance(gap + abJoined.length, sectLen + sectAbLen);
  const sectBaRatio = normDistance(gap + baJoined.length, sectLen + sectBaLen);
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
  const len1 = chars(a).length;
  const len2 = chars(b).length;
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
