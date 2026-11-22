import ATC_CODES from './atc2307.json';
import { localIsoDate } from './dates';
import { type CustomerStatus, matchCustomer, type Pack, type Raw } from './finalize';
import { type Box, candidates, close, pyRound, pySum } from './num';
import { tinLengthOk } from './tin';

// BIR Form 2307 (page 1), checked on what its boxes say: the period is one calendar quarter, each TIN has the right
// number of digits, the payor is matched like a customer, and Part III's two tables add up (each row's three months
// to its total, its tax to the total times its ATC's rate, the rows to the total row's printed columns). Values typed
// in a PDF are checked too: a typed value can be wrong. A photo, or a PDF with a box read from its page, gets the
// photo checks, as an invoice does (rawFromScan). The 2307 is new, so there is no Python version.

/** Part III's tables: income payments (expanded withholding tax) and money payments (business tax). */
type Table = 'ewt' | 'bt';
/** A row of Part III (1 to 10; the total row is 0). An amount is null when its box is blank or unreadable. */
export type CertRow = {
  table: 'ewt' | 'bt';
  row: number;
  payment: string;
  atc: string | null;
  rate: number | null;
  months: [number | null, number | null, number | null];
  total: number | null;
  tax: number | null;
};
export type Cert2307 = {
  from: string | null;
  to: string | null;
  quarter: string | null; // "2026-Q4"
  payee: { tin: string; name: string; address: string; zip: string };
  payor: { tin: string; name: string; address: string; zip: string };
  payorMatch: { id: string; status: CustomerStatus };
  rows: CertRow[];
  totals: { ewt: CertRow | null; bt: CertRow | null };
  flags: string[];
};

type Atc = { code: string; rate: number | null; description: string; table: Table };
/** The ATC table (from MyBizMate's own ATC list): a rate is a fraction, 0.01 for 1%. */
const ATC = new Map((ATC_CODES as Atc[]).map((a) => [a.code, a]));
const ROWS = 10; // per table
const AMOUNTS = ['m1', 'm2', 'm3', 'total', 'tax'] as const;
const TAX_SLACK = 0.051; // ±0.05: a tax withheld month by month was rounded each month

const textOf = (box: Box | undefined) => (box?.text ?? '').trim();
const digitsOf = (box: Box | undefined) => (box?.text ?? '').replace(/\D/g, '');
/** What a box's amount can be: each of its readings', or null alone when none is an amount. */
const amountOptions = (box: Box | undefined): (number | null)[] => {
  const all = candidates(box);
  return all.length > 0 ? all : [null];
};
/**
 * A period box's day, MM/DD/YYYY: its 8 digits run together as the form's boxes hold them ("10012026"), or typed with
 * / - . or spaces between ("10/1/2026").
 */
function periodDay(box: Box | undefined): string | null {
  const parts = textOf(box).split(/[\s/.-]+/).filter((p) => p !== '');
  const run = parts.join('');
  const mdy =
    parts.length === 3 && /^\d{1,2}$/.test(parts[0]) && /^\d{1,2}$/.test(parts[1]) && /^\d{4}$/.test(parts[2])
      ? parts
      : /^\d{8}$/.test(run)
        ? [run.slice(0, 2), run.slice(2, 4), run.slice(4)]
        : null;
  if (mdy === null) return null;
  const [m, d, y] = mdy.map(Number);
  const day = new Date(y, m - 1, d);
  return day.getFullYear() === y && day.getMonth() === m - 1 && day.getDate() === d ? localIsoDate(day) : null;
}

/** "2026-Q4" when the period runs from a quarter's first day to the same quarter's last; else null. */
function quarterOf(from: string | null, to: string | null): string | null {
  if (from === null || to === null) return null;
  const [y, m, d] = from.split('-').map(Number);
  if (d !== 1 || (m - 1) % 3 !== 0) return null;
  const last = localIsoDate(new Date(y, m + 2, 0)); // day 0 of the next quarter's first month
  return to === last ? `${y}-Q${(m + 2) / 3}` : null;
}

/** A row as its boxes say, and its flags; null when it has no ATC code and no amount other than zero. */
function checkRow(raw: Raw, table: Table, row: number): { row: CertRow; flags: string[] } | null {
  const box = (column: string) => raw.boxes[`${table}${row}_${column}`];
  const code = textOf(box('atc')).toUpperCase().replace(/[^A-Z0-9]/g, '') || null;
  // Words alone don't make a row, nor a dash for nil, a speck, or the zeros a template's formula cells print.
  if (code === null && !AMOUNTS.some((column) => candidates(box(column)).some((v) => v !== 0))) return null;
  const flags: string[] = [];
  // The months and the total: the first readings that add up, as an invoice row's amount, quantity and price.
  const [m1s, m2s, m3s, totals] = (['m1', 'm2', 'm3', 'total'] as const).map((c) => amountOptions(box(c)));
  let found: [number | null, number | null, number | null, number | null] | null = null;
  search: for (const t of totals) {
    if (t === null) break; // no total to add up to
    for (const a of m1s) {
      for (const b of m2s) {
        for (const c of m3s) {
          if (close(pyRound(pySum([a ?? 0, b ?? 0, c ?? 0]), 2), t)) {
            found = [a, b, c, t];
            break search;
          }
        }
      }
    }
  }
  if (found === null) {
    found = [m1s[0], m2s[0], m3s[0], totals[0]];
    flags.push(`${table}${row}_sum`);
  }
  const [m1, m2, m3, total] = found;
  // The tax: the total times the ATC's rate, to the centavo give or take 5. A code without a rate isn't checked.
  const atc = code === null ? undefined : ATC.get(code);
  const known = atc !== undefined && atc.table === table; // a business tax's code doesn't go on an income payment
  const rate = known ? atc.rate : null;
  const taxes = amountOptions(box('tax'));
  let tax = taxes[0];
  if (rate !== null) {
    const want = total === null ? null : pyRound(total * rate, 2);
    const hit = want === null ? undefined : taxes.find((x) => Math.abs((x ?? 0) - want) < TAX_SLACK); // blank: none
    if (hit === undefined) flags.push(`${table}${row}_tax`);
    else tax = hit;
  }
  if (!known) flags.push(`${table}${row}_atc`);
  return {
    row: { table, row, payment: textOf(box('payment')), atc: code, rate, months: [m1, m2, m3], total, tax },
    flags,
  };
}

const amountsOf = (r: CertRow) => [r.months[0], r.months[1], r.months[2], r.total, r.tax];

/**
 * The total row as its boxes say (null when blank), and whether the rows add up to it: each column the total row prints
 * is its rows' sum. A blank cell isn't checked, since a 2307 may print only some of them (MyBizMate's prints only the
 * Total and the Tax); a cell written with no amount in it ("-") counts as 0. A total row with nothing printed adds up
 * only when its rows add up to nothing.
 */
function checkTotals(raw: Raw, table: Table, rows: readonly CertRow[]): { row: CertRow | null; ok: boolean } {
  const box = (column: string) => raw.boxes[`${table}_total_${column}`];
  const sums = AMOUNTS.map((_, i) => pyRound(pySum(rows.map((r) => amountsOf(r)[i] ?? 0)), 2));
  // Each amount: the first reading that is its column's sum, else the first reading.
  const [m1, m2, m3, total, tax] = AMOUNTS.map((column, i) => {
    const all = candidates(box(column));
    return all.find((v) => close(v, sums[i])) ?? all[0] ?? null;
  });
  const printed = AMOUNTS.map((column) => textOf(box(column)) !== '');
  const written = printed.some((p) => p);
  const ok = written
    ? [m1, m2, m3, total, tax].every((v, i) => !printed[i] || close(v ?? 0, sums[i]))
    : sums.every((s) => close(s, 0));
  const row: CertRow | null = written
    ? { table, row: 0, payment: '', atc: null, rate: null, months: [m1, m2, m3], total, tax }
    : null;
  return { row, ok };
}

/** The 2307's period, payee, payor and Part III, as its boxes say, and its flags. */
export function check2307(raw: Raw, pack: Pack): Cert2307 {
  const flags: string[] = [];
  const party = (who: 'payee' | 'payor') => ({
    tin: digitsOf(raw.boxes[`${who}_tin`]),
    name: textOf(raw.boxes[`${who}_name`]),
    address: textOf(raw.boxes[`${who}_address`]),
    zip: digitsOf(raw.boxes[`${who}_zip`]),
  });
  const from = periodDay(raw.boxes.period_from);
  const to = periodDay(raw.boxes.period_to);
  const quarter = quarterOf(from, to);
  if (quarter === null) flags.push('period');
  const payee = party('payee');
  const payor = party('payor');
  if (!tinLengthOk(payee.tin)) flags.push('payee_tin');
  if (!tinLengthOk(payor.tin)) flags.push('payor_tin');
  // The payor is the customer who withheld the tax. No customers yet: nothing to match against, so no flag.
  const [id, status] = matchCustomer(payor.name, payor.tin, pack);
  if (pack.customers.length > 0 && (status === 'new' || status === 'unsure')) flags.push(`payor_${status}`);

  const rows: CertRow[] = [];
  const totals: Cert2307['totals'] = { ewt: null, bt: null };
  for (const table of ['ewt', 'bt'] as const) {
    const tableRows: CertRow[] = [];
    for (let r = 1; r <= ROWS; r++) {
      const checked = checkRow(raw, table, r);
      if (checked === null) continue;
      tableRows.push(checked.row);
      flags.push(...checked.flags);
    }
    const { row, ok } = checkTotals(raw, table, tableRows);
    if (!ok) flags.push(`${table}_total`);
    rows.push(...tableRows);
    totals[table] = row;
  }
  // The photo itself: too blurry or too dark to trust what was read, so a person retakes it (finalize's photo checks).
  if (raw.photo) {
    if (raw.photo.sharpness < raw.photo.sharp_min) flags.push('blurry');
    if (raw.photo.light < raw.photo.dark_max) flags.push('dark');
  }
  return { from, to, quarter, payee, payor, payorMatch: { id, status }, rows, totals, flags };
}

const ROW_WORDS: Record<Table, { row: string; totals: string }> = {
  ewt: { row: 'Row', totals: 'Totals' },
  bt: { row: 'Business tax row', totals: 'Business tax totals' },
};

/** Things a person should look at, in plain words: the photo, the period, the TINs, the payor, then each table. */
export function problems2307(c: Cert2307): string[] {
  const has = (f: string) => c.flags.includes(f);
  const out: string[] = [];
  if (has('blurry')) out.push('Blurry photo (retake it)'); // first: retaking fixes the rest too
  if (has('dark')) out.push('Dark photo (retake it)');
  if (has('period')) out.push('Period');
  if (has('payee_tin')) out.push("Payee's TIN");
  if (has('payor_tin')) out.push("Payor's TIN");
  if (has('payor_new')) out.push('Payor (not in your customers)');
  if (has('payor_unsure')) out.push('Payor (confirm the match)');
  for (const table of ['ewt', 'bt'] as const) {
    const words = ROW_WORDS[table];
    for (const { row } of c.rows.filter((r) => r.table === table)) {
      if (has(`${table}${row}_sum`)) out.push(`${words.row} ${row} months`);
      if (has(`${table}${row}_tax`)) out.push(`${words.row} ${row} tax`);
      if (has(`${table}${row}_atc`)) out.push(`${words.row} ${row} ATC`);
    }
    if (has(`${table}_total`)) out.push(words.totals);
  }
  return out;
}
