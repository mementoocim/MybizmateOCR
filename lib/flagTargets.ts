// Design B §6 and §9.5: which row of the Scan screen a flag chip opens. A chip shows today's problem word (problemWords
// in lib/sale.ts, problems2307 in lib/checks/bir2307.ts), and opens the row the problem is about, whose reason line
// says what doesn't match. Rows are keyed as the Scan screen keys them: 'date', `item${n}`, 'total_due', 'period',
// `ewt${n}`, `bt${n}`, … and 'photo' for the photo viewer (a blurry or dark photo).

/** The rows a VAT breakdown can be about, in the screen's order. */
const VAT_ROWS = ['vatable', 'vat', 'total_due'] as const;
/** A 2307's payor row: the 2307's ledger keys it so, and the Scan screen gives its sheet the payor's line. */
export const PAYOR_ROW = 'payor';

type Rule = readonly [word: RegExp, row: (match: RegExpMatchArray, flagged: ReadonlySet<string>) => string];

/** In this order: the first rule whose words match gives the row. */
const RULES: readonly Rule[] = [
  [/^(Blurry|Dark) photo/, () => 'photo'],
  [/^Date$/, () => 'date'],
  [/^Customer /, () => 'customer'],
  [/^Supplier /, () => 'supplier'],
  [/^Terms$/, () => 'terms'],
  [/^Row (\d+) (math|item|price)$/, (m) => `item${m[1]}`],
  [/^Row (\d+) (months|tax|ATC)$/, (m) => `ewt${m[1]}`],
  [/^Business tax row (\d+) /, (m) => `bt${m[1]}`],
  [/^(Total|Rows vs total)$/, () => 'total_due'],
  [/^VAT breakdown$/, (_, flagged) => VAT_ROWS.find((row) => flagged.has(row)) ?? 'total_due'],
  [/^Period$/, () => 'period'],
  [/^Payee's TIN$/, () => 'payee'],
  [/^(Payor's TIN$|Payor )/, () => PAYOR_ROW],
  [/^Totals$/, () => 'ewt_total'],
  [/^Business tax totals$/, () => 'bt_total'],
];

/**
 * The key of the row a problem word opens, or null for a word no row is about. flagged: the keys of the rows that are
 * flagged now, so a VAT breakdown opens the first flagged of VATable sales, VAT 12% and Total due (else Total due).
 */
export function flagTarget(problem: string, flagged: ReadonlySet<string>): string | null {
  for (const [word, row] of RULES) {
    const match = problem.match(word);
    if (match) return row(match, flagged);
  }
  return null;
}
