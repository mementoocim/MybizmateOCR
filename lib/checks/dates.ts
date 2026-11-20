import { extractOne, ratio } from './fuzzy';

// The date box, as the Python reference reads it (postprocess.py: _month, _make_date, _numeric_date, parse_date,
// _splits, date_repairs and date_choice).

/** A date box's answer: the date, whether a person should check it, and how it was found. */
export type DateChoice = { date: string | null; flagged: boolean; rebuilt: boolean; other: string | null };

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DATE_SEP = /[\s/\-.,\\]+/; // what people put between the parts of a date
const SEP_CHARS = new Set('/-.,\\ ');
const SLASH_LIKE = new Set('1lI|!i7()'); // what a handwritten slash comes back as
const LOOK_DIGIT = new Map(Object.entries({
  o: '0', O: '0', D: '0', Q: '0', I: '1', l: '1', i: '1', '|': '1', '!': '1', Z: '2', z: '2', S: '5', s: '5', G: '6',
  b: '6', T: '7', B: '8', g: '9', q: '9', A: '4',
}));

const isDigit = (c: string) => c >= '0' && c <= '9' && c.length === 1;
const isDigits = (s: string) => /^[0-9]+$/.test(s);
const lookDigits = (s: string) => Array.from(s, (c) => LOOK_DIGIT.get(c) ?? c).join('');

/** A word read as a month name ("Sept", or "0ct" for Oct): its number, else 0. */
function month(w: string): number {
  if (/^[a-z0-9]{3,9}$/.test(w) && /[a-z]/.test(w)) {
    const m = extractOne(w.slice(0, 3), MONTHS, ratio);
    if (m && m[1] >= 60) return MONTHS.indexOf(m[0]) + 1;
  }
  return 0;
}

function daysInMonth(year: number, m: number): number {
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
}

/** y, m, d as written (strings of digits) -> ISO date, or null. A 2-digit year is 20xx (69 and up 19xx). */
function makeDate(y: string, m: string, d: string): string | null {
  if (!(m.length >= 1 && m.length <= 2 && d.length >= 1 && d.length <= 2 && (y.length === 2 || y.length === 4))) {
    return null;
  }
  const year = Number(y) + (y.length === 2 ? (Number(y) <= 68 ? 2000 : 1900) : 0);
  const mon = Number(m);
  const day = Number(d);
  if (year < 1 || year > 9999 || mon < 1 || mon > 12 || day < 1 || day > daysInMonth(year, mon)) return null;
  return `${String(year).padStart(4, '0')}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Three groups of digits: month/day/year, day first when the first can't be a month, year first with 4 digits. */
function numericDate(a: string, b: string, c: string): string | null {
  if (a.length === 4) return makeDate(a, b, c);
  if (a.length <= 2 && isDigits(a) && Number(a) > 12) return makeDate(c, b, a);
  return makeDate(c, a, b);
}

/** A date as written: three parts with / - . , or spaces between them, the month as a number or a name. */
export function parseDate(s: string | null | undefined): string | null {
  if (!s) return null;
  const parts = s.trim().toLowerCase().split(DATE_SEP).filter((p) => p !== '');
  if (parts.length !== 3) return null;
  for (const [mi, di] of [[0, 1], [1, 0]]) {
    const m = month(parts[mi]);
    if (m && isDigits(parts[di]) && isDigits(parts[2])) return makeDate(parts[2], String(m), parts[di]);
  }
  if (parts.every(isDigits)) return numericDate(parts[0], parts[1], parts[2]);
  return null;
}

/** Every way to cut digit groups into `need` groups by adding cuts inside them (each cut is one change). */
function* splits(groups: readonly string[], need: number): Generator<[string[], number]> {
  if (need === groups.length) {
    yield [[...groups], 0];
    return;
  }
  if (need < groups.length) return;
  for (let k = 0; k < groups.length; k++) {
    const g = groups[k];
    for (let j = 1; j < g.length; j++) {
      for (const [rest, cost] of splits([g.slice(j), ...groups.slice(k + 1)], need - k - 1)) {
        yield [[...groups.slice(0, k), g.slice(0, j), ...rest], cost + 1];
      }
    }
  }
}

/** itertools.product: every pick of one option per position, the last position changing fastest. */
function* product<T>(options: readonly (readonly T[])[]): Generator<T[]> {
  const idx = options.map(() => 0);
  if (options.some((o) => o.length === 0)) return;
  while (true) {
    yield idx.map((k, i) => options[i][k]);
    let p = options.length - 1;
    while (p >= 0 && ++idx[p] === options[p].length) idx[p--] = 0;
    if (p < 0) return;
  }
}

/**
 * Dates a reading can stand for when it isn't one as written: a slash that was dropped ("9102026") or read as 1, l or
 * 7 ("1010512026"), a letter read for a digit (O for 0). ISO date -> fewest changes needed.
 */
export function dateRepairs(s: string | null | undefined): Map<string, number> {
  const out = new Map<string, number>();
  const keep = (iso: string, cost: number) => out.set(iso, Math.min(out.get(iso) ?? 99, cost));
  const text = (s ?? '').trim();
  if (!text) return out;
  // A month name: only the numbers around it can be off ("Sep 10 2O26", "Sep10 2026").
  const t = text.replace(/^([A-Za-z]{3,9})(?=\d)/, '$1 ');
  const parts = t.split(DATE_SEP).filter((p) => p !== '');
  if (parts.length === 3) {
    for (const [mi, di] of [[0, 1], [1, 0]]) {
      const m = month(parts[mi].toLowerCase());
      if (!m) continue;
      const d = parts[di];
      const y = parts[2];
      const both = Array.from(d + y);
      if (both.every((c) => isDigit(c) || LOOK_DIGIT.has(c))) {
        const iso = makeDate(lookDigits(y), String(m), lookDigits(d));
        if (iso) keep(iso, both.filter((c) => !isDigit(c)).length + (t !== text ? 1 : 0));
      }
    }
  }
  // A numeric date: each character is a digit, a separator, or (for a price) the other one it looks like.
  const options: [string, number][][] = [];
  for (const c of text) {
    const opts: [string, number][] = [];
    if (isDigit(c)) opts.push([c, 0]);
    if (SEP_CHARS.has(c)) opts.push(['/', 0]);
    else if (SLASH_LIKE.has(c)) opts.push(['/', 1]);
    if (!isDigit(c) && LOOK_DIGIT.has(c)) opts.push([LOOK_DIGIT.get(c)!, 1]);
    if (opts.length === 0) return out;
    options.push(opts);
  }
  if (options.filter((o) => o.length > 1).length > 10) return out; // too many ways to read it to be a date
  for (const pick of product(options)) {
    const cost = pick.reduce((sum, [, c]) => sum + c, 0);
    const groups = pick.map(([ch]) => ch).join('').replace(/\/+/g, '/').split('/');
    if (groups.includes('') || groups.length > 3) continue;
    for (const [g3, cuts] of splits(groups, 3)) {
      const iso = numericDate(g3[0], g3[1], g3[2]);
      if (iso) keep(iso, cost + cuts);
    }
  }
  return out;
}

/** Days since 1970-01-01 for a proleptic Gregorian ISO date (any year 1–9999). */
function dayNumber(iso: string): number {
  const [y0, m, d] = iso.split('-').map(Number);
  const y = m <= 2 ? y0 - 1 : y0;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  return era * 146097 + yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy - 719468;
}

/**
 * The date for a box from its reading and backups. A reading that is a date as written and plausible (not in the
 * future, not older than maxAgeDays) wins, first reading first; another plausible date among them flags it. Else the
 * plausible date that needs the fewest changes to a reading, the most recent on a tie, filled in but flagged. Else
 * the first reading's date as written, flagged.
 */
export function dateChoice(readings: readonly string[], today: string, maxAgeDays = 180): DateChoice {
  const t = dayNumber(today);
  const age = (iso: string) => t - dayNumber(iso);
  const plausible = (iso: string) => age(iso) >= 0 && age(iso) <= maxAgeDays;
  const written = readings.map(parseDate);
  const ok = written.filter((iso): iso is string => iso !== null && plausible(iso));
  if (ok.length > 0) {
    const other = ok.find((iso) => iso !== ok[0]) ?? null;
    return { date: ok[0], flagged: other !== null, rebuilt: false, other };
  }
  let best: [number, number, number, string] | null = null;
  readings.forEach((s, i) => {
    if (written[i]) return;
    for (const [iso, cost] of dateRepairs(s)) {
      if (!plausible(iso)) continue;
      const cand: [number, number, number, string] = [cost, i, age(iso), iso];
      if (best === null || lessThan(cand, best)) best = cand;
    }
  });
  if (best !== null) return { date: (best as [number, number, number, string])[3], flagged: true, rebuilt: true, other: null };
  return { date: written.length > 0 ? written[0] : null, flagged: true, rebuilt: false, other: null };
}

/** Python's tuple comparison for (cost, reading, age, iso). */
function lessThan(a: readonly [number, number, number, string], b: readonly [number, number, number, string]): boolean {
  for (let k = 0; k < 4; k++) if (a[k] !== b[k]) return a[k] < b[k];
  return false;
}

/** The phone's own day, YYYY-MM-DD (toISOString would give the UTC day, a day behind before 8 a.m. in Manila). */
export function localIsoDate(d: Date): string {
  return `${String(d.getFullYear()).padStart(4, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
