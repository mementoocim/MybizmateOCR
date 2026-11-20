import { extractOne, ratio } from './fuzzy';

// Amounts, quantities and amounts in words, as the Python reference reads them (postprocess.py: parse_amount,
// candidates, qty_values, qty_candidates, words_to_number and close), with Python's own rounding and summing.

/** A box as the checks see it: its reading, then its backup readings. */
export type Box = { text: string; alts?: readonly string[] };

/**
 * Python's round(x, digits). Python rounds the exact binary value of x; toFixed does the same, except on an exact
 * tie, where Python goes to the even neighbour.
 */
export function pyRound(x: number, digits: number): number {
  const scale = 10 ** digits;
  const n = x * 2 * scale; // on an exact tie, n is an odd multiple of 5^digits and x is exactly n / (2 * scale)
  if (Number.isInteger(n) && n % 2 !== 0 && n % 5 ** digits === 0 && n / (2 * scale) === x) {
    const down = (n - 1) / 2;
    return (down % 2 === 0 ? down : down + 1) / scale;
  }
  return Number(x.toFixed(digits));
}

/** CPython 3.12's builtin sum() over floats: Neumaier's compensated sum. */
export function pySum(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  let sum = xs[0];
  let c = 0;
  for (let i = 1; i < xs.length; i++) {
    const t = sum + xs[i];
    c += Math.abs(sum) >= Math.abs(xs[i]) ? sum - t + xs[i] : xs[i] - t + sum;
    sum = t;
  }
  return c !== 0 && Number.isFinite(c) ? sum + c : sum;
}

export function close(a: number | null | undefined, b: number | null | undefined): boolean {
  return a != null && b != null && Math.abs(a - b) < 0.011;
}

export function parseAmount(s: string | null | undefined): number | null {
  if (!s) return null;
  let t = s.replace(/[^0-9.,]/g, '');
  if (!/[0-9]/.test(t)) return null;
  if (t.includes(',') && t.includes('.')) {
    t = t.replace(/,/g, '');
  } else if (t.includes(',')) {
    const k = t.lastIndexOf(',');
    const tail = t.slice(k + 1);
    t = t.slice(0, k).replace(/,/g, '') + (tail.length === 2 ? '.' : '') + tail;
  }
  if (t.split('.').length - 1 > 1) {
    const k = t.lastIndexOf('.');
    t = `${t.slice(0, k).replace(/\./g, '')}.${t.slice(k + 1)}`;
  }
  return pyRound(Number(t), 2);
}

/**
 * The amounts a box can stand for: its reading and each backup, without repeats. A P is the peso sign people write
 * before an amount, so it is dropped; since a P can also be a misread 9, that reading is tried too, after.
 */
export function candidates(box: Box | null | undefined): number[] {
  if (!box) return [];
  const out: number[] = [];
  for (const txt of [box.text ?? '', ...(box.alts ?? [])]) {
    for (const t of txt.includes('P') ? [txt, txt.replace(/P/g, '9')] : [txt]) {
      const v = parseAmount(t);
      if (v !== null && !out.includes(v)) out.push(v);
    }
  }
  return out;
}

const FRACTION_DENOMINATORS = '2348'; // the fractions written in a quantity box: 1/2, 1/3, 3/4, 1/8 ...

/**
 * A quantity as written: a number, a fraction ("1/2"), a whole number and a fraction ("1 1/2", or "11/2" with the
 * space lost). A fraction whose slash was dropped ("12") or read as a 1 or 7 ("112") is tried last, as 1/2.
 */
export function qtyValues(s: string | null | undefined): number[] {
  const t = (s ?? '').trim();
  const out: number[] = [];
  let m = /^(\d{1,6})\s+(\d{1,6})\s*\/\s*(\d{1,6})$/.exec(t);
  if (m && Number(m[3])) out.push(Number(m[1]) + Number(m[2]) / Number(m[3]));
  m = /^(\d{1,6})\s*\/\s*(\d{1,6})$/.exec(t);
  if (m && Number(m[2])) {
    const [a, b] = [m[1], Number(m[2])];
    out.push(Number(a) / b);
    if (a.length >= 2) out.push(Number(a.slice(0, -1)) + Number(a.slice(-1)) / b); // "11/2": 1 1/2, space lost
  }
  if (!t.includes('/')) {
    const v = parseAmount(t);
    if (v !== null) out.push(v);
    const d = t.replace(/\D/g, '');
    if (d.length >= 2 && d.length <= 4) {
      for (let i = 1; i < d.length; i++) {
        // "12" -> 1/2; "112" -> 1/2 (the slash read as a 1)
        const a = d.slice(0, i);
        const rest = d.slice(i);
        const bs = rest.length > 1 && '17'.includes(rest[0]) ? [rest, rest.slice(1)] : [rest];
        for (const b of bs) {
          if (b.length === 1 && FRACTION_DENOMINATORS.includes(b) && Number(a) > 0 && Number(a) < Number(b)) {
            out.push(Number(a) / Number(b));
          }
        }
      }
    }
  }
  return out.map((v) => pyRound(v, 6));
}

/** The quantities a box can stand for: its reading and each backup, in that order, without repeats. */
export function qtyCandidates(box: Box | null | undefined): number[] {
  if (!box) return [];
  const out: number[] = [];
  for (const txt of [box.text ?? '', ...(box.alts ?? [])]) {
    for (const v of qtyValues(txt)) if (!out.includes(v)) out.push(v);
  }
  return out;
}

const UNIT_WORDS = (
  'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen ' +
  'seventeen eighteen nineteen'
).split(' ');
const TENS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};
const SCALES: Record<string, number> = { hundred: 100, thousand: 1000, million: 1_000_000 };
const VOCAB = [...UNIT_WORDS, ...Object.keys(TENS), ...Object.keys(SCALES)];
const SKIPPED = new Set(['pesos', 'peso', 'only', 'and']);

/** "Seven hundred fifty pesos only" -> 750; each word taken as the nearest number word (75% or closer). */
export function wordsToNumber(s: string | null | undefined): number | null {
  if (!s) return null;
  let t = s.toLowerCase().replace(/-/g, ' ');
  let cents = 0;
  const m = /(\d{1,2})\s*\/\s*100/.exec(t);
  if (m) {
    cents = Number(m[1]);
    t = t.slice(0, m.index);
  }
  let total = 0;
  let current = 0;
  let found = false;
  for (const word of t.match(/[a-z]+/g) ?? []) {
    if (SKIPPED.has(word)) continue;
    const hit = extractOne(word, VOCAB, ratio);
    if (!hit || hit[1] < 75) continue;
    const w = hit[0];
    found = true;
    const unit = UNIT_WORDS.indexOf(w);
    if (unit >= 0) current += unit;
    else if (w in TENS) current += TENS[w];
    else if (w === 'hundred') current *= 100;
    else {
      total += current * SCALES[w];
      current = 0;
    }
  }
  return found ? pyRound(total + current + cents / 100, 2) : null;
}
