import type { CertView, PayorStatus } from '../lib/cert';
import type { CertRow } from '../lib/checks/bir2307';
import { amount, peso, prettyDate, qty } from '../lib/format';
import { formFields } from '../lib/forms';
import { formatTin, partyName } from '../lib/lists';
import { boxValue } from '../lib/sale';
import type { StoredScan } from '../lib/scans';
import type { LedgerOpen, LedgerRowSpec, LedgerSection } from './InvoiceLedger';

// Design B §9.5 and the plan's call 14: the Scan screen's BIR 2307 as a ledger, drawn by InvoiceLedger's Ledger as the
// invoice is. Today's sections (the period, the payee, the payor, Part III's income payments, its business-tax rows
// when it has any, and each table's totals) as row descriptors, with today's words, flags and boxes. The quarter is a
// badge beside the period. A payment row has its tax on the right, under the section's "Tax", its total in the
// sub-line, and its flags' words as its reason. Amounts in rows lose the peso sign; the total rows keep it (§6). Rows
// are keyed as lib/flagTargets keys them ('period', `ewt${n}`, 'ewt_total', …), so a flag chip finds its row. The
// one-row sections' rows (Period, Payee, Payor) show no key, as their strips name them, but say it to TalkBack, which
// can land on them from a chip or a closing sheet (ruling T12-1).

type Table = CertRow['table'];
type BoxesOpen = Extract<LedgerOpen, { kind: 'boxes' }>;

const PERIOD_BOXES = ['period_from', 'period_to'];
const partyBoxes = (who: 'payee' | 'payor') => ['tin', 'name', 'address', 'zip'].map((c) => `${who}_${c}`);
const ROW_COLUMNS = ['payment', 'atc', 'm1', 'm2', 'm3', 'total', 'tax'];
const TOTAL_COLUMNS = ['m1', 'm2', 'm3', 'total', 'tax'];

/** Each table's words: its name (its section's, and its line in the totals), a row's name, and whose ATCs it takes. */
const TABLES: Record<Table, { name: string; row: string; atcFor: string }> = {
  ewt: { name: 'Income payments', row: 'Row', atcFor: 'income payments' },
  bt: { name: 'Business tax', row: 'Business tax row', atcFor: 'business tax' },
};

const PAYOR_SUB: Record<PayorStatus, string> = {
  auto: 'Matched in your customers',
  unsure: 'Closest match in your customers', // with that customer's name (payorSub)
  new: 'Not in your customers',
  unlisted: 'Add your customers in Your lists to check names',
  none: 'Not in your customers', // no payor written: never an invoice's walk-in
};

/** How the payor stands against the customers; an unsure match names the closest one, since the payor is as written. */
const payorSub = ({ status, listParty }: CertView['payor']) =>
  status === 'unsure' && listParty ? `Closest match: ${partyName(listParty)}` : PAYOR_SUB[status];

/**
 * The payor sheet's read-only line, under its boxes (§9.5): whether the payor is in the customers, and as which.
 * There's no payor chooser, so an unsure match names only the closest customer.
 */
export function payorLine({ status, listParty }: CertView['payor']): string {
  switch (status) {
    case 'auto':
      return listParty?.tin ? `In your customers · TIN ${formatTin(listParty.tin)}` : 'In your customers';
    case 'unsure':
      return listParty ? `Closest match in your customers: ${partyName(listParty)}` : PAYOR_SUB.unsure;
    case 'new':
    case 'none':
      return 'Not in your customers';
    case 'unlisted':
      return PAYOR_SUB.unlisted;
  }
}

/** "Oct 1 – Dec 31, 2026": a quarter's first and last days, its year said once (the quarter is the row's badge). */
function quarterDays(from: string, to: string): string {
  return `${prettyDate(from)!.replace(/, \d+$/, '')} – ${prettyDate(to)}`;
}

/** A party's TIN as the BIR writes it, then its ZIP code; a box that wasn't read is a dash. */
const tinAndZip = (p: { tin: string; zip: string }) =>
  `TIN ${p.tin ? formatTin(p.tin) : '—'} · ZIP ${p.zip || '—'}`;

/** A rate as people write it: 1%, 0.5%, 15%. */
const percent = (rate: number) => `${qty(rate * 100)}%`;

/** A total row as read, unless its amounts are all zero or unreadable: a template's 0.00 or "-" line is no total. */
function realTotal(row: CertRow | null): CertRow | null {
  return row && [...row.months, row.total, row.tax].some((v) => v !== null && v !== 0) ? row : null;
}

const hasOwn = (o: object, key: string) => Object.prototype.hasOwnProperty.call(o, key);

/**
 * A BIR 2307's sections, in today's order: the period, the payee (the business), the payor (matched like a sale's
 * customer), the income payments, the business-tax rows when it has any, and the totals. Every row but "No income
 * payments read" opens what the camera saw in its boxes, each box fixable, and the checks run again.
 */
export function certSections(scan: StoredScan, view: CertView): LedgerSection[] {
  const { cert, payor } = view;
  const has = (flag: string) => cert.flags.includes(flag);
  const fields = formFields('bir_2307');
  /** The form's own boxes of these, in its order. */
  const boxesOf = (title: string, names: readonly string[]): BoxesOpen => ({
    kind: 'boxes',
    title,
    boxes: fields.filter((f) => names.includes(f)),
  });
  /** Whether the person fixed any of these boxes. */
  const editedIn = (open: BoxesOpen) => open.boxes.some((box) => hasOwn(scan.edits, box));
  const rowsOf = (table: Table) => cert.rows.filter((r) => r.table === table);

  // The period: a quarter's days, with the quarter as a badge; else the boxes as read, a box that wasn't read a dash.
  const quarter =
    cert.quarter !== null && cert.from !== null && cert.to !== null
      ? { days: quarterDays(cert.from, cert.to), badge: cert.quarter.split('-')[1] }
      : null;
  const read = [boxValue(scan, 'period_from'), boxValue(scan, 'period_to')];
  const period = boxesOf('Period', PERIOD_BOXES);
  const periodRow: LedgerRowSpec = {
    key: 'period',
    section: 'Period',
    spokenLabel: 'Period',
    value: quarter ? quarter.days : read.some((v) => v) ? read.map((v) => v || '—').join(' – ') : null,
    valueStyle: 'figure', // dates (§5.2)
    badge: quarter ? { label: quarter.badge, tone: 'neutral' } : null,
    reason: has('period') ? 'Not one calendar quarter' : null,
    flagged: has('period'),
    edited: editedIn(period),
    open: period,
  };

  const payee = boxesOf('Payee', partyBoxes('payee'));
  const payeeRow: LedgerRowSpec = {
    key: 'payee',
    section: 'Payee',
    spokenLabel: 'Payee',
    value: cert.payee.name || null,
    sub: tinAndZip(cert.payee),
    subMono: true,
    flagged: has('payee_tin'),
    edited: editedIn(payee),
    open: payee,
  };

  const payorBoxes = boxesOf('Payor', partyBoxes('payor'));
  const payorRow: LedgerRowSpec = {
    key: 'payor',
    section: 'Payor',
    spokenLabel: 'Payor',
    value: payor.shown || null,
    sub: `${payorSub(payor)}\n${tinAndZip(cert.payor)}`,
    flagged: has('payor_tin') || has('payor_new') || has('payor_unsure'),
    edited: editedIn(payorBoxes),
    open: payorBoxes,
  };

  /** A payment row: its ATC and payment, its total under them, its tax on the right, and its flags' words. */
  const paymentRow = (row: CertRow, section: string): LedgerRowSpec => {
    const name = `${row.table}${row.row}`; // its key, and its boxes' and flags' prefix: ewt1_total, ewt1_sum
    const words = TABLES[row.table];
    const title = [row.atc, row.payment].filter((s) => s).join(' · ') || `${words.row} ${row.row}`;
    const why = [
      has(`${name}_sum`) ? "The months don't add up to the total" : null,
      has(`${name}_tax`) && row.rate !== null ? `Not ${percent(row.rate)} of the total` : null,
      has(`${name}_atc`) ? (row.atc === null ? 'No ATC' : `Not an ATC for ${words.atcFor}`) : null,
    ].filter((s) => s !== null);
    const open = boxesOf(title, ROW_COLUMNS.map((c) => `${name}_${c}`));
    return {
      key: name,
      section,
      value: title,
      sub: `Total ${amount(row.total)}`,
      subMono: true,
      amount: amount(row.tax),
      reason: why.length > 0 ? why.join(' · ') : null,
      flagged: has(`${name}_sum`) || has(`${name}_tax`) || has(`${name}_atc`),
      edited: editedIn(open),
      open,
    };
  };

  const income = rowsOf('ewt');
  const business = rowsOf('bt');
  const incomeTitle = `${TABLES.ewt.name} · ${income.length}`;
  const noPayments: LedgerRowSpec = {
    key: 'no_payments',
    section: incomeTitle,
    value: 'No income payments read',
    flagged: false,
    edited: false,
    open: null,
  };
  const sections: LedgerSection[] = [
    { title: 'Period', rows: [periodRow] },
    { title: 'Payee', rows: [payeeRow] },
    { title: 'Payor', rows: [payorRow] },
    {
      title: incomeTitle,
      right: 'Tax',
      rows: income.length === 0 ? [noPayments] : income.map((row) => paymentRow(row, incomeTitle)),
    },
  ];
  if (business.length > 0) {
    const businessTitle = `${TABLES.bt.name} · ${business.length}`;
    sections.push({ title: businessTitle, right: 'Tax', rows: business.map((row) => paymentRow(row, businessTitle)) });
  }

  // a table's total, when it has rows or its total row doesn't add up (so it can be fixed)
  const totals = (['ewt', 'bt'] as const).filter((t) => rowsOf(t).length > 0 || has(`${t}_total`));
  if (totals.length > 0) {
    sections.push({
      title: 'Totals',
      right: 'Tax',
      rows: totals.map((table): LedgerRowSpec => {
        const total = realTotal(cert.totals[table]);
        const { name } = TABLES[table];
        const flagged = has(`${table}_total`);
        const open = boxesOf(name, TOTAL_COLUMNS.map((c) => `${table}_total_${c}`));
        return {
          key: `${table}_total`,
          section: 'Totals',
          value: name,
          sub: `Total ${peso(total?.total ?? null)}`,
          subMono: true, // a figure, as a payment row's total (§5.2, ruling T12-2)
          amount: peso(total?.tax ?? null),
          amountStrong: true,
          reason: flagged ? "The rows don't add up to the total row" : null,
          flagged,
          edited: editedIn(open),
          open,
        };
      }),
    });
  }
  return sections;
}
