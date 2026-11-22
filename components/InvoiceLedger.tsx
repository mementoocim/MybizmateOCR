import { Fragment } from 'react';
import type { ViewInstance } from 'react-native';

import { candidates } from '../lib/checks/num';
import { amount, peso, prettyDate, qty } from '../lib/format';
import { FORMS, formFields } from '../lib/forms';
import { boxValue, rawFromScan, type SaleView } from '../lib/sale';
import type { StoredScan } from '../lib/scans';
import type { BadgeSpec } from './Badge';
import { LedgerRow } from './LedgerRow';
import { SectionHeader } from './SectionHeader';

// Design B §9.5 and §6: the Scan screen's invoice as a ledger. Today's sections (the sale's: the invoice, its items and
// its totals) as row descriptors, row by row with today's words, flags and boxes. A flagged row's sub-line becomes its
// reason, which LedgerRow shows only while flagged. Amounts in rows lose the peso sign; totals (Total due, Gross) keep
// it. Rows are keyed as lib/flagTargets keys them, so a flag chip finds its row. Ledger draws sections like these, the
// invoice's here and the 2307's (Task 12): each a section strip, then its rows, each one opening what it's about.

/** What tapping a row opens: its boxes (an item row's sheet knows its row), or the customer, supplier or terms. */
export type LedgerOpen =
  | { kind: 'boxes'; title: string; boxes: string[]; row?: number }
  | { kind: 'customer' }
  | { kind: 'supplier' }
  | { kind: 'terms' };

export type LedgerRowSpec = {
  key: string; // the row keys of lib/flagTargets
  section: string; // the SectionHeader it sits under
  label?: string;
  spokenLabel?: string; // TalkBack's key for a row that shows none: a one-row section's field, which its strip names
  value: string | null;
  valueStyle?: 'value' | 'figure' | 'figureStrong';
  badge?: BadgeSpec | null;
  sub?: string | null;
  subMono?: boolean;
  reason?: string | null;
  amount?: string | null;
  amountStrong?: boolean;
  flagged: boolean;
  edited: boolean;
  open: LedgerOpen | null; // null: a row that opens nothing ("No items read")
  hint?: string; // TalkBack's hint, for a row that doesn't open what the camera saw (LedgerRow's default)
};

export type LedgerSection = { title: string; right?: string; rows: LedgerRowSpec[] };

const CUSTOMER_BOXES = ['customer_name', 'customer_tin', 'customer_address'];
const ITEM_COLUMNS = ['qty', 'unit', 'description', 'unit_price', 'amount'];
const TOTAL_BOXES = [
  'total_due',
  'total_due_2',
  'total_sales',
  'amount_figure',
  'amount_words',
  'discount',
  'withholding',
  'zero_rated',
  'vat_exempt',
];

const SUPPLIER_SUB: Record<string, string> = {
  chosen: 'From your suppliers',
  typed: 'Not in your supplier list',
  various: 'Exported as VARIOUS-SUPP',
  missing: 'Printed at the top of the invoice: tap to choose it',
};

const hasOwn = (o: object, key: string) => Object.prototype.hasOwnProperty.call(o, key);

/** The invoice's sections, in today's order: the invoice, its items, then its totals. */
export function invoiceSections(scan: StoredScan, sale: SaleView): LedgerSection[] {
  const form = FORMS[scan.result.form!];
  const fields = formFields(scan.result.form!);
  const final = sale.final;
  const has = (flag: string) => final.flags.includes(flag);
  const raw = rawFromScan(scan);
  const boxAmount = (box: string) => candidates(raw.boxes[box])[0] ?? 0;
  const anyRead = (names: readonly string[]) => names.some((b) => boxValue(scan, b) !== null);
  /** The form's own boxes of these, in its order. */
  const boxesOf = (title: string, names: readonly string[], row?: number): LedgerOpen => ({
    kind: 'boxes',
    title,
    boxes: fields.filter((f) => names.includes(f)),
    row,
  });
  /** Whether the person fixed any of these boxes. */
  const editedIn = (open: LedgerOpen) => open.kind === 'boxes' && open.boxes.some((box) => hasOwn(scan.edits, box));

  // The invoice: its number, date, customer (or supplier, and the buyer it names), and terms.
  const invoice = 'Invoice';
  const dc = final.date_choice;
  const dateReason = dc.rebuilt
    ? `Read as “${boxValue(scan, 'date') ?? ''}”, the slashes unclear. Check the date.`
    : has('date') && dc.other
      ? `Could also be read as ${prettyDate(dc.other)}. Check the date.`
      : has('date')
        ? final.date === null
          ? "Couldn't make out a date"
          : 'Not a date in the last 6 months'
        : null;
  const number = boxesOf(form.number, ['invoice_no']);
  const date = boxesOf('Date', ['date']);
  const invoiceRows: LedgerRowSpec[] = [
    {
      key: 'number',
      section: invoice,
      label: form.number,
      value: final.invoice_no || null,
      valueStyle: 'figure',
      flagged: false,
      edited: editedIn(number),
      open: number,
    },
    {
      key: 'date',
      section: invoice,
      label: 'Date',
      value: prettyDate(final.date) ?? boxValue(scan, 'date'),
      valueStyle: 'figure',
      reason: dateReason,
      flagged: has('date'),
      edited: editedIn(date),
      open: date,
    },
  ];

  const party = sale.party;
  if (scan.kind === 'sale') {
    const tin = party.listParty?.tin || (boxValue(scan, 'customer_tin') ?? '');
    const customerSub: Record<string, string> = {
      auto: tin ? `TIN ${tin} · matched in your customers` : 'Matched in your customers',
      chosen: 'Chosen from your customers',
      unsure: 'Closest match. Tap to compare.',
      new: 'Not in your customer list',
      unlisted: 'Add your customers in Your lists to check names',
      blank: 'No customer written',
    };
    const flagged = party.status === 'unsure' || party.status === 'new';
    const words = customerSub[party.status] ?? null;
    invoiceRows.push({
      key: 'customer',
      section: invoice,
      label: 'Customer',
      value: party.shown,
      sub: flagged ? null : words,
      reason: flagged ? words : null,
      flagged,
      edited: editedIn(boxesOf('Customer', CUSTOMER_BOXES)),
      open: { kind: 'customer' },
    });
  } else {
    // The seller is printed, not read: the person chooses it, so it has no boxes to fix.
    const flagged = party.status === 'missing';
    const words = SUPPLIER_SUB[party.status] ?? null;
    const soldTo = boxesOf('Sold to', CUSTOMER_BOXES);
    invoiceRows.push(
      {
        key: 'supplier',
        section: invoice,
        label: 'Supplier',
        value: party.shown,
        sub: flagged ? null : words,
        reason: flagged ? words : null,
        flagged,
        edited: false,
        open: { kind: 'supplier' },
        hint: 'Opens your suppliers',
      },
      {
        key: 'sold_to',
        section: invoice,
        label: 'Sold to',
        value: boxValue(scan, 'customer_name') || null,
        sub: 'You, as the invoice names you',
        flagged: false,
        edited: editedIn(soldTo),
        open: soldTo,
      },
    );
  }
  invoiceRows.push({
    key: 'terms',
    section: invoice,
    label: 'Terms',
    value: sale.terms === 'cash' ? form.cash : sale.terms === 'account' ? form.account : 'Unclear',
    sub: scan.terms !== null ? 'Chosen by you' : null,
    reason: has('terms') ? `Tick ${form.cash} or ${form.account} clearly` : null,
    flagged: has('terms'),
    edited: false,
    open: { kind: 'terms' },
  });

  // The items: what each is, quantity × unit price, and its amount on the right.
  const n = final.items.length;
  const items = `Items · ${n}`;
  const itemRows: LedgerRowSpec[] =
    n === 0
      ? [{ key: 'no_items', section: items, value: 'No items read', flagged: false, edited: false, open: null }]
      : final.items.map((it) => {
          const row = it.row;
          const title = it.description || `Item ${row}`;
          const open = boxesOf(
            title,
            ITEM_COLUMNS.map((c) => `item${row}_${c}`),
            row,
          );
          const why = [
            has(`row${row}`) ? "Doesn't add up" : null,
            has(`item${row}`) ? 'Not in your item list' : null,
            has(`price${row}`) ? `Your list price is ${peso(sale.listPrices[row] ?? null)}` : null,
          ].filter((s) => s !== null);
          return {
            key: `item${row}`,
            section: items,
            value: title,
            sub: `${qty(it.qty)} × ${amount(it.unit_price)}`,
            subMono: true,
            amount: amount(it.amount),
            reason: why.length > 0 ? why.join(' · ') : null,
            flagged: why.length > 0,
            edited: editedIn(open),
            open,
          };
        });

  // The totals: the VAT breakdown and the other amounts the invoice has, Total due, and Gross under a discount.
  const totals = 'Totals';
  const totalRows: LedgerRowSpec[] = [];
  /** A breakdown amount: flagged by any of its flags, with its reason. */
  const amountRow = (
    key: string,
    label: string,
    value: number | null,
    names: readonly string[],
    check: { flags: readonly string[]; reason: string } | null,
  ) => {
    const flagged = check !== null && check.flags.some((flag) => has(flag));
    const open = boxesOf(label, names);
    totalRows.push({
      key,
      section: totals,
      label,
      value: amount(value),
      valueStyle: 'figure',
      reason: flagged ? check.reason : null,
      flagged,
      edited: editedIn(open),
      open,
    });
  };
  const vatShown = sale.taxType === 'VAT' || final.flags.some((f) => f.startsWith('check_'));
  if (vatShown || anyRead(['vatable_sales', 'net_of_vat'])) {
    amountRow('vatable', 'VATable sales', final.vatable_sales, ['vatable_sales', 'net_of_vat'], {
      flags: ['check_vatable_sales', 'check_net_of_vat'],
      reason: "A written VATable amount doesn't match the total",
    });
  }
  if (vatShown || anyRead(['vat', 'less_vat', 'add_vat'])) {
    amountRow('vat', 'VAT 12%', final.vat, ['vat', 'less_vat', 'add_vat'], {
      flags: ['check_vat', 'check_less_vat', 'check_add_vat'],
      reason: "A written VAT doesn't match 12/112",
    });
  }
  if (boxAmount('zero_rated') > 0) amountRow('zero_rated', 'Zero-rated sales', boxAmount('zero_rated'), ['zero_rated'], null);
  if (boxAmount('vat_exempt') > 0) amountRow('vat_exempt', 'VAT-exempt sales', boxAmount('vat_exempt'), ['vat_exempt'], null);

  const rowsSum = final.items.reduce((sum, it) => sum + (it.amount ?? 0), 0);
  const totalFlagged = has('total') || has('total_rows') || has('check_total_sales');
  const totalWords = has('total')
    ? "The written totals don't agree"
    : has('total_rows')
      ? `The rows add up to ${peso(rowsSum)}. Check each row's price and amount.`
      : has('check_total_sales')
        ? "Total sales doesn't match the total due"
        : 'The written totals agree';
  const total = boxesOf('Total due', TOTAL_BOXES);
  totalRows.push({
    key: 'total_due',
    section: totals,
    label: 'Total due',
    value: peso(final.total_due),
    valueStyle: 'figureStrong',
    sub: totalFlagged ? null : totalWords,
    reason: totalFlagged ? totalWords : null,
    flagged: totalFlagged,
    edited: editedIn(total),
    open: total,
  });
  if (final.less > 0) {
    const gross = boxesOf('Gross (VAT included)', ['total_sales', 'discount', 'withholding']);
    totalRows.push({
      key: 'gross',
      section: totals,
      label: 'Gross (VAT included)',
      value: peso(sale.gross),
      valueStyle: 'figure',
      sub: 'Before the discount and withholding tax. This goes to MyBizMate.',
      flagged: false,
      edited: editedIn(gross),
      open: gross,
    });
  }

  return [
    { title: invoice, rows: invoiceRows },
    { title: items, right: 'Amount', rows: itemRows },
    { title: totals, rows: totalRows },
  ];
}

/**
 * The sections, each a section strip and then its rows. A row that opens something calls onOpen with itself and its
 * view, which the sheet it opens gives TalkBack focus back to. rowRefs holds each row's view by its key, so a flag
 * chip can scroll to its row.
 */
export function Ledger({
  sections,
  onOpen,
  rowRefs,
}: {
  sections: readonly LedgerSection[];
  onOpen: (row: LedgerRowSpec, ref: ViewInstance | null) => void;
  rowRefs: Map<string, ViewInstance | null>;
}) {
  return (
    <>
      {sections.map((section) => (
        <Fragment key={section.title}>
          <SectionHeader title={section.title} right={section.right} />
          {section.rows.map((row) => (
            <LedgerRow
              key={row.key}
              ref={(view) => {
                rowRefs.set(row.key, view);
              }}
              testID={`row-${row.key}`}
              label={row.label}
              spokenLabel={row.spokenLabel}
              value={row.value}
              valueStyle={row.valueStyle}
              badge={row.badge}
              sub={row.sub}
              subMono={row.subMono}
              reason={row.reason}
              amount={row.amount}
              amountStrong={row.amountStrong}
              flagged={row.flagged}
              edited={row.edited}
              accessibilityHint={row.hint}
              onPress={row.open ? () => onOpen(row, rowRefs.get(row.key) ?? null) : undefined}
            />
          ))}
        </Fragment>
      ))}
    </>
  );
}
