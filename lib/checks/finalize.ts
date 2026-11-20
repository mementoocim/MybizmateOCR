import { dateChoice, type DateChoice } from './dates';
import { ratio, wRatio } from './fuzzy';
import { type Box, candidates, close, pyRound, pySum, qtyCandidates, wordsToNumber } from './num';

// The checks: postprocess.finalize and its matching (match_customer, match_item), ported line by line. The readings
// plus the scan pack (customers and items) plus today's date in; the sale and its flags out, the same flags in the
// same order as the Python.

export type Terms = 'cash' | 'account';
/** The photo's measures, rounded as photo_quality.quality() rounds them. */
export type PhotoMeasures = { sharpness: number; sharp_min: number; light: number; dark_max: number };
/** What finalize reads: each box's reading and backups by box name, the ticked terms, and the photo's measures. */
export type Raw = { boxes: Readonly<Record<string, Box>>; terms: Terms | null; photo: PhotoMeasures | null };
/** names: other names the party goes by (its trade name); a party is matched on the best of them. */
export type PackCustomer = { id: string; name: string; tin: string; names?: readonly string[] };
export type PackItem = { id: string; description: string; unit: string; price: number };
export type Pack = { customers: readonly PackCustomer[]; items: readonly PackItem[] };
export type CustomerStatus = 'auto' | 'unsure' | 'new' | 'blank';
export type FinalItem = {
  row: number;
  item_id: string | null;
  description: string;
  qty: number | null;
  unit_price: number | null;
  amount: number | null;
};
export type Final = {
  // postprocess.finalize's dict, key for key:
  invoice_no: string;
  date: string | null;
  customer_id: string;
  terms: Terms | null;
  items: FinalItem[];
  total_due: number | null;
  vat: number | null;
  vatable_sales: number | null;
  flags: string[];
  // and what the screens need, from the same computation:
  customer_status: CustomerStatus;
  date_choice: DateChoice;
  less: number;
  gross: number | null;
};

/** The customer's id and how sure: auto, unsure, new, or blank (nothing written: a walk-in sale). */
export function matchCustomer(name: string, tinDigits: string, pack: Pack): [string, CustomerStatus] {
  const n = (name ?? '').trim();
  const tin9 = (tinDigits ?? '').slice(0, 9);
  if (n.length < 2 && tin9.length < 5) return ['VARIOUS', 'blank'];
  const lower = n.toLowerCase();
  const score = (c: PackCustomer) => Math.max(...[c.name, ...(c.names ?? [])].map((x) => wRatio(lower, x.toLowerCase())));
  const byTin = tin9.length === 9 ? pack.customers.filter((c) => c.tin.replace(/-/g, '').slice(0, 9) === tin9) : [];
  const ranked = n
    ? pack.customers
        .map((c, i) => ({ c, i, s: score(c) }))
        .sort((x, y) => y.s - x.s || x.i - y.i)
        .slice(0, 3)
    : [];
  if (byTin.length > 0) {
    let best = byTin[0];
    if (n) {
      let bestScore = -Infinity;
      for (const c of byTin) {
        const s = score(c);
        if (s > bestScore) {
          bestScore = s;
          best = c;
        }
      }
    }
    if (!n || score(best) >= 60) return [best.id, 'auto'];
  }
  if (ranked.length > 0) {
    const top = ranked[0];
    const gap = top.s - (ranked.length > 1 ? ranked[1].s : 0);
    if (top.s >= 90 && gap >= 8) return [top.c.id, 'auto'];
    if (top.s >= 70) return [top.c.id, 'unsure'];
  }
  return ['NEW', 'new'];
}

/** The item list's match. A weak name match counts only when the unit and the list price also agree. */
export function matchItem(desc: string, pack: Pack, unit?: string | null, price?: number | null): [string | null, number] {
  if (!desc) return [null, 0];
  let best: [string | null, number, number] = [null, -1, 0];
  for (const it of pack.items) {
    const s = wRatio(desc.toLowerCase(), it.description.toLowerCase());
    const unitOk = !!unit && ratio(unit.toLowerCase(), it.unit.toLowerCase()) >= 67;
    const priceOk = price != null && Math.abs(price - it.price) < 0.011;
    const total = s + (unitOk ? 15 : 0) + (priceOk ? 20 : 0);
    if (total > best[1]) best = [it.id, total, s >= 70 || (s >= 40 && unitOk && priceOk) ? s : -1];
  }
  return best[2] >= 0 ? [best[0], best[2]] : [null, best[2]];
}

type Row = { qty: number | null; unit_price: number | null; amount: number | null };

export function finalize(raw: Raw, pack: Pack, today: string, maxAgeDays = 180): Final {
  let flags: string[] = [];
  const box = (name: string): Box | undefined => raw.boxes[name];
  const text = (name: string): string => raw.boxes[name]?.text ?? '';
  const listPrice = new Map(pack.items.map((it) => [it.id, it.price]));

  const invoiceNo = text('invoice_no').replace(/\D/g, '');
  // Date: the first plausible date as written, flagged if another reading is a different plausible date; else one
  // rebuilt from a reading whose slashes were dropped or misread, filled in but flagged.
  const df = box('date');
  const choice = dateChoice([df?.text ?? '', ...(df?.alts ?? [])], today, maxAgeDays);
  if (choice.flagged) flags.push('date');
  const tin = text('customer_tin').replace(/\D/g, '');
  const [customerId, status] = matchCustomer(text('customer_name'), tin, pack);
  if (status === 'unsure' || status === 'new') flags.push(`customer_${status}`);
  const terms = raw.terms;
  if (terms !== 'cash' && terms !== 'account') flags.push('terms');

  const rows: FinalItem[] = [];
  for (let r = 1; r <= 10; r++) {
    const f = {
      qty: box(`item${r}_qty`),
      unit: box(`item${r}_unit`),
      description: box(`item${r}_description`),
      unit_price: box(`item${r}_unit_price`),
      amount: box(`item${r}_amount`),
    };
    if (!Object.values(f).some((v) => v && v.text)) continue;
    const qtys = qtyCandidates(f.qty);
    const prices = candidates(f.unit_price);
    const amounts = candidates(f.amount);
    let best: [number | null, number | null, number | null] | null = null;
    search: for (const a of amounts.length ? amounts : [null]) {
      for (const q of qtys.length ? qtys : [null]) {
        for (const p of prices.length ? prices : [null]) {
          if (q !== null && p !== null && close(pyRound(q * p, 2), a)) {
            best = [q, p, a];
            break search;
          }
        }
      }
    }
    if (best === null) {
      best = [qtys[0] ?? null, prices[0] ?? null, amounts[0] ?? null];
      flags.push(`row${r}`);
    }
    const [itemId] = matchItem(f.description?.text ?? '', pack, f.unit?.text ?? '', best[1]);
    if (itemId === null) {
      flags.push(`item${r}`); // not in the item list: a misread or a new item, so a person checks it
    } else if (best[1] !== null && listPrice.get(itemId)) {
      const ratioToList = best[1] / listPrice.get(itemId)!;
      if (!(1 / 3 <= ratioToList && ratioToList <= 3)) flags.push(`price${r}`); // a digit too many or too few
    }
    rows.push({ row: r, item_id: itemId, description: f.description?.text ?? '', qty: best[0], unit_price: best[1], amount: best[2] });
  }
  let items = rows;

  // Total: the value the most independent sources agree on. Forms with a discount or withholding tax box (the
  // Service Invoice) take those off total sales and the rows.
  const less = pyRound(
    pySum([candidates(box('discount')), candidates(box('withholding'))].filter((c) => c.length > 0).map((c) => c[0])),
    2,
  );
  const sources = new Map<string, number[]>();
  sources.set('total_due', candidates(box('total_due')));
  sources.set('total_sales', candidates(box('total_sales')).map((v) => pyRound(v - less, 2)));
  for (const extra of ['total_due_2', 'amount_figure']) if (box(extra)) sources.set(extra, candidates(box(extra)));
  if (rows.length > 0 && flags.every((f) => !f.startsWith('row')) && rows.every((r) => r.amount !== null)) {
    sources.set('rows_sum', [pyRound(pySum(rows.map((r) => r.amount!)) - less, 2)]);
  }
  const words = wordsToNumber(text('amount_words'));
  if (words !== null) sources.set('words', [words]);
  const votes = new Map<number, Set<string>>();
  for (const [name, vals] of sources) {
    for (const v of vals) {
      if (!votes.has(v)) votes.set(v, new Set());
      votes.get(v)!.add(name);
    }
  }
  let total: number | null = null;
  let support = 0;
  let withDue = false;
  for (const [v, names] of votes) {
    const n = names.size;
    const hasDue = names.has('total_due');
    if (total === null || n > support || (n === support && hasDue && !withDue)) {
      total = v;
      support = n;
      withDue = hasDue;
    }
  }
  if (total === null || support < 2) flags.push('total');

  // Row repair: if a row's math failed but amount = qty x price makes the rows add up to the agreed total, take the
  // repaired amounts and clear those row flags.
  const bad = flags.filter((f) => f.startsWith('row'));
  if (total !== null && bad.length > 0 && rows.length > 0) {
    const fixed: FinalItem[] = rows.map((r) => ({ ...r }));
    const repaired: string[] = [];
    for (const r of fixed) {
      if (!bad.includes(`row${r.row}`)) continue;
      const { qty: q, unit_price: p, amount: a }: Row = r;
      if (q !== null && p !== null) {
        r.amount = pyRound(q * p, 2);
        repaired.push(`row${r.row}`);
      } else if (q === null && p && a !== null && Math.abs(a / p - pyRound(a / p, 0)) < 1e-6) {
        r.qty = pyRound(a / p, 0); // a missing quantity can be derived, but stays flagged
      } else if (p === null && q && a !== null) {
        r.unit_price = pyRound(a / q, 2);
      }
    }
    if (fixed.every((r) => r.amount !== null) && close(pyRound(pySum(fixed.map((r) => r.amount!)), 2), pyRound(total + less, 2))) {
      items = fixed;
      flags = flags.filter((f) => !repaired.includes(f));
    }
  }

  // The rows' sum is only one vote for the total: when every row's math works but the rows don't add up to the
  // agreed total, a row lost or gained a digit in both its price and amount.
  if (
    total !== null &&
    items.length > 0 &&
    !flags.includes('total') &&
    !flags.some((f) => f.startsWith('row')) &&
    items.every((r) => r.amount !== null) &&
    !close(pyRound(pySum(items.map((r) => r.amount!)) - less, 2), total)
  ) {
    flags.push('total_rows');
  }
  let vat: number | null = null;
  let vatable: number | null = null;
  let gross: number | null = null;
  if (total !== null) {
    gross = pyRound(total + less, 2); // VAT is on total sales, before any discount or withholding tax
    vat = pyRound((gross * 12) / 112, 2);
    vatable = pyRound(gross - vat, 2);
    const expected: [string, number][] = [
      ['vat', vat],
      ['less_vat', vat],
      ['add_vat', vat],
      ['vatable_sales', vatable],
      ['net_of_vat', vatable],
      ['total_sales', gross],
    ];
    for (const [key, want] of expected) {
      const read = candidates(box(key));
      if (read.length > 0 && !read.some((v) => close(v, want))) flags.push(`check_${key}`);
    }
  }
  // The photo itself: too blurry or too dark to trust what was read, so a person retakes or checks.
  if (raw.photo) {
    if (raw.photo.sharpness < raw.photo.sharp_min) flags.push('blurry');
    if (raw.photo.light < raw.photo.dark_max) flags.push('dark');
  }
  return {
    invoice_no: invoiceNo,
    date: choice.date,
    customer_id: customerId,
    terms,
    items,
    total_due: total,
    vat,
    vatable_sales: vatable,
    flags,
    customer_status: status,
    date_choice: choice,
    less,
    gross,
  };
}
