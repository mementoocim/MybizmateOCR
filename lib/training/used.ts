import { certOf, is2307 } from '../cert';
import { parseDate } from '../checks/dates';
import { type Box, candidates, qtyCandidates } from '../checks/num';
import type { Lists } from '../lists';
import { isInvoice, saleOf } from '../sale';
import type { StoredScan } from '../scans';
import type { Settings } from '../settings';

// The value the checks used for a box, where it isn't the box's own reading: the row math can take a backup reading
// or work an amount out, the total is the one most boxes agree on, a date can be rebuilt, a 2307's tax can be a
// backup reading a few centavos off, and the person can have typed another value. The training export keeps it beside
// the box's label.

const COLUMNS = ['m1', 'm2', 'm3', 'total', 'tax'] as const; // a 2307 row's amounts

/**
 * Box name -> what the checks used (over the person's edits), only where it differs from the box's own reading (the
 * model's first one) parsed the way the checks parse that box: an invoice's rows, date and total due; a 2307's rows
 * and total rows. Numbers as plain decimals ("1092", "4196.3"), a date as ISO. Nothing where the checks used nothing
 * (a cleared box), and nothing for a scan with no form.
 */
export function usedValues(scan: StoredScan, lists: Lists, settings: Settings): Record<string, string> {
  const used: Record<string, string> = {};
  /** The box's own reading as the checks take a box, without its backup readings. */
  const own = (box: string): Box | undefined => {
    const read = scan.result.reads.find((r) => r.name === box);
    return read && { text: read.text };
  };
  /** Keeps a number the checks used when the reading, parsed as the checks parse it, isn't that number. */
  const keep = (box: string, value: number | null, parse: (b: Box | undefined) => number[] = candidates) => {
    if (value !== null && value !== (parse(own(box))[0] ?? null)) used[box] = String(value);
  };

  if (isInvoice(scan)) {
    const { items, date, total_due } = saleOf(scan, lists, settings).final;
    for (const it of items) {
      keep(`item${it.row}_qty`, it.qty, qtyCandidates);
      keep(`item${it.row}_unit_price`, it.unit_price);
      keep(`item${it.row}_amount`, it.amount);
    }
    // a rebuilt date always differs: the reading wasn't a date as written, or not a plausible one
    if (date !== null && date !== parseDate(own('date')?.text)) used.date = date;
    keep('total_due', total_due);
  } else if (is2307(scan)) {
    const { rows, totals } = certOf(scan, lists, settings).cert;
    for (const r of [...rows, totals.ewt, totals.bt]) {
      if (r === null) continue; // a table without a total row
      const prefix = r.row === 0 ? `${r.table}_total` : `${r.table}${r.row}`; // row 0 is the total row
      [...r.months, r.total, r.tax].forEach((value, i) => keep(`${prefix}_${COLUMNS[i]}`, value));
    }
  }
  return used;
}
