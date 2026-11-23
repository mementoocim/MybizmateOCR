import { boxesOf, editedIn, invoiceSections, type LedgerRowSpec, type LedgerSection } from '../components/InvoiceLedger';
import { amount, peso, qty } from '../lib/format';
import { lists } from '../lib/lists';
import { saleOf } from '../lib/sale';
import { addScan, getScan, setEdit, updateScan } from '../lib/scans';
import { settings } from '../lib/settings';
import type { ScanResult } from '../modules/scanner';
import { parseScanResult } from '../modules/scanner/src/parse';
import { coreJson } from '../test-utils/coreJson';
import { memoryFs } from '../test-utils/memoryFs';

// Design B §9.5: the invoice as a ledger. invoiceSections keeps today's sections (app/result.tsx's SaleSections) row by
// row, with each row's words, its flag and its boxes; amounts in rows lose the peso sign, and totals keep it (§6). Each
// row is keyed as the flag chips find it (lib/flagTargets).

jest.mock('expo-file-system', () => require('../test-utils/memoryFs').memoryFs.module);

// The Python's own answers for the fixture photos (fixtures/checks/finalize.json).
const FZ = require('../fixtures/checks/finalize.json');
const expectedOf = (stem: string) => FZ.cases.find((c: { name: string }) => c.name === `fixture: ${stem}`).expected;

/** A fixture's scan, a sample (so it's checked as of the samples' day), with no lists. */
function scanOf(stem: string, edit?: (r: ScanResult) => void): string {
  const result = parseScanResult(coreJson(stem));
  edit?.(result);
  return addScan({ label: 'A scan', source: 'sample', result });
}

/** The scan's sections, as the Scan screen has them now. */
function sectionsOf(id: string): LedgerSection[] {
  const scan = getScan(id)!;
  return invoiceSections(scan, saleOf(scan, lists(), settings()));
}

const keysOf = (sections: readonly LedgerSection[]) => sections.map((s) => [s.title, s.rows.map((r) => r.key)]);
const rowOf = (sections: readonly LedgerSection[], key: string): LedgerRowSpec =>
  sections.flatMap((s) => s.rows).find((r) => r.key === key)!;
/** The words a row shows; null where it shows none. */
const wordsOf = ({ label, value, sub, reason, amount: right }: LedgerRowSpec) => ({
  label: label ?? null,
  value,
  sub: sub ?? null,
  reason: reason ?? null,
  amount: right ?? null,
});

beforeEach(() => {
  memoryFs.reset();
});

test("sections and keys in today's order", () => {
  const id = scanOf('inv_0007');
  const sections = sectionsOf(id);
  expect(keysOf(sections)).toEqual([
    ['Invoice', ['number', 'date', 'customer', 'terms']],
    ['Items · 6', ['item1', 'item2', 'item3', 'item4', 'item5', 'item6']],
    ['Totals', ['vatable', 'vat', 'total_due']],
  ]);
  // The items' section names its right column; each row knows the section it sits under.
  expect(sections.map((s) => s.right)).toEqual([undefined, 'Amount', undefined]);
  for (const section of sections) for (const row of section.rows) expect(row.section).toBe(section.title);

  // Today's words, flags and boxes.
  expect(rowOf(sections, 'number')).toMatchObject({
    label: 'SI no.',
    value: '0007655',
    valueStyle: 'figure',
    flagged: false,
    edited: false,
    open: { kind: 'boxes', title: 'SI no.', boxes: ['invoice_no'] },
  });
  expect(rowOf(sections, 'date')).toMatchObject({
    label: 'Date',
    value: 'Sep 20, 2026',
    valueStyle: 'figure',
    open: { kind: 'boxes', title: 'Date', boxes: ['date'] },
  });
  expect(rowOf(sections, 'customer')).toMatchObject({
    label: 'Customer',
    value: 'TorresConstruction Supply',
    sub: 'Add your customers in Your lists to check names',
    flagged: false,
    open: { kind: 'customer' },
  });
  expect(rowOf(sections, 'terms')).toMatchObject({ label: 'Terms', value: 'On account', flagged: false, open: { kind: 'terms' } });
  expect(rowOf(sections, 'vatable')).toMatchObject({
    label: 'VATable sales',
    value: '21,765.18',
    valueStyle: 'figure',
    open: { kind: 'boxes', title: 'VATable sales', boxes: ['vatable_sales', 'net_of_vat'] },
  });
  expect(rowOf(sections, 'vat')).toMatchObject({ label: 'VAT 12%', value: '2,611.82', valueStyle: 'figure' });
  // Totals keep the peso sign.
  expect(rowOf(sections, 'total_due')).toMatchObject({
    label: 'Total due',
    value: '₱24,377.00',
    valueStyle: 'figureStrong',
    sub: 'The written totals agree',
    flagged: false,
  });
  const total = rowOf(sections, 'total_due').open;
  expect(total?.kind === 'boxes' && total.boxes).toEqual(['amount_words', 'zero_rated', 'vat_exempt', 'total_sales', 'total_due']);

  // A purchase: the supplier, who has no boxes to read, then the buyer the invoice names.
  updateScan(id, { kind: 'purchase' });
  const purchase = sectionsOf(id);
  expect(keysOf(purchase)[0]).toEqual(['Invoice', ['number', 'date', 'supplier', 'sold_to', 'terms']]);
  expect(rowOf(purchase, 'supplier')).toMatchObject({
    label: 'Supplier',
    value: 'Not chosen yet',
    open: { kind: 'supplier' },
    hint: 'Opens your suppliers', // TalkBack's: the other rows open what the camera saw (LedgerRow's default)
  });
  expect(purchase.flatMap((s) => s.rows).filter((r) => r.hint !== undefined).map((r) => r.key)).toEqual(['supplier']);
  expect(wordsOf(rowOf(purchase, 'supplier'))).toMatchObject({
    sub: null,
    reason: 'Printed at the top of the invoice: tap to choose it', // the flagged status's sub-line, as its reason
  });
  expect(rowOf(purchase, 'supplier').flagged).toBe(true);
  expect(rowOf(purchase, 'sold_to')).toMatchObject({
    label: 'Sold to',
    value: 'TorresConstruction Supply',
    sub: 'You, as the invoice names you',
    open: { kind: 'boxes', title: 'Sold to', boxes: ['customer_name', 'customer_tin', 'customer_address'] },
  });

  // The rest of the totals, when there are amounts in them: zero-rated and VAT-exempt sales.
  updateScan(id, { kind: 'sale' });
  setEdit(id, 'zero_rated', '100.00');
  setEdit(id, 'vat_exempt', '50.00');
  const totals = sectionsOf(id).at(-1)!;
  expect(totals.rows.map((r) => r.key)).toEqual(['vatable', 'vat', 'zero_rated', 'vat_exempt', 'total_due']);
  expect(rowOf([totals], 'zero_rated')).toMatchObject({
    label: 'Zero-rated sales',
    value: '100.00',
    valueStyle: 'figure',
    open: { kind: 'boxes', title: 'Zero-rated sales', boxes: ['zero_rated'] },
  });
  expect(rowOf([totals], 'vat_exempt')).toMatchObject({ label: 'VAT-exempt sales', value: '50.00', valueStyle: 'figure' });

  // Gross, VAT included, under a discount: a total, so with the peso sign. A Service Invoice has no unit column.
  const svc = sectionsOf(scanOf('svc_0002'));
  expect(keysOf(svc).at(-1)).toEqual(['Totals', ['vatable', 'vat', 'total_due', 'gross']]);
  expect(rowOf(svc, 'gross')).toMatchObject({
    label: 'Gross (VAT included)',
    value: peso(expectedOf('svc_0002').gross),
    sub: 'Before the discount and withholding tax. This goes to MyBizMate.',
    open: { kind: 'boxes', title: 'Gross (VAT included)', boxes: ['total_sales', 'discount', 'withholding'] },
  });
  expect(rowOf(svc, 'number')).toMatchObject({ label: 'Invoice no.', value: '8195852' });
  const nails = rowOf(svc, 'item1').open;
  expect(nails?.kind === 'boxes' && nails.boxes).toEqual([
    'item1_description',
    'item1_qty',
    'item1_unit_price',
    'item1_amount',
  ]);
});

test("a flagged date carries today's reason; an item's sub has no peso sign", () => {
  // Another plausible date among the readings: the date is flagged, and its reason is today's sub-line.
  const id = scanOf('inv_0007', (r) => {
    r.reads.find((b) => b.name === 'date')!.alts = ['Sep 21, 2026'];
  });
  const sections = sectionsOf(id);
  expect(rowOf(sections, 'date')).toMatchObject({ value: 'Sep 20, 2026', flagged: true });
  expect(wordsOf(rowOf(sections, 'date'))).toMatchObject({
    sub: null,
    reason: 'Could also be read as Sep 21, 2026. Check the date.',
  });
  // A date that can't be made out.
  setEdit(id, 'date', '13/45/2026');
  expect(rowOf(sectionsOf(id), 'date')).toMatchObject({ value: '13/45/2026', reason: "Couldn't make out a date" });

  // An item: its description, then quantity × unit price in mono, and the amount on the right, none with ₱.
  const first = expectedOf('inv_0007').items[0];
  expect(wordsOf(rowOf(sections, 'item1'))).toEqual({
    label: null, // items have no key
    value: 'Sugar',
    sub: `${qty(first.qty)} × ${amount(first.unit_price)}`,
    reason: null,
    amount: amount(first.amount),
  });
  expect(rowOf(sections, 'item1')).toMatchObject({
    subMono: true,
    flagged: false,
    open: {
      kind: 'boxes',
      title: 'Sugar',
      boxes: ['item1_qty', 'item1_unit', 'item1_description', 'item1_unit_price', 'item1_amount'],
      row: 1,
    },
  });
  expect(rowOf(sections, 'item1').sub).toBe('24 × 85.00');
  expect(rowOf(sections, 'item1').amount).toBe('2,040.00');

  // Its flags join as one reason: with the unit price unreadable, the row's math can't be repaired.
  setEdit(id, 'item1_unit_price', 'xyz');
  setEdit(id, 'item1_amount', '1.00');
  expect(rowOf(sectionsOf(id), 'item1')).toMatchObject({ flagged: true, reason: "Doesn't add up" });
  // An item without a description is named by its row.
  setEdit(id, 'item2_description', '');
  expect(rowOf(sectionsOf(id), 'item2')).toMatchObject({ value: 'Item 2', open: { title: 'Item 2', row: 2 } });

  // Written totals that don't agree: today's sub-line moves to the reason.
  setEdit(id, 'total_due', '24,000');
  setEdit(id, 'total_sales', '20,000');
  setEdit(id, 'amount_words', 'Ten pesos only');
  const total = rowOf(sectionsOf(id), 'total_due');
  expect(total.flagged).toBe(true);
  expect(wordsOf(total)).toMatchObject({ sub: null, reason: "The written totals don't agree" });
});

test("edited follows the row's boxes", () => {
  const id = scanOf('inv_0007');
  const edited = () =>
    sectionsOf(id)
      .flatMap((s) => s.rows)
      .filter((r) => r.edited)
      .map((r) => r.key);
  expect(edited()).toEqual([]);
  setEdit(id, 'invoice_no', '0007999');
  expect(edited()).toEqual(['number']);
  // The customer row: its three boxes.
  setEdit(id, 'customer_tin', '223-344-556-00000');
  expect(edited()).toEqual(['number', 'customer']);
  // An item row: any of its five.
  setEdit(id, 'item2_unit', 'pcs');
  expect(edited()).toEqual(['number', 'customer', 'item2']);
  // A box back as it was read is no edit.
  setEdit(id, 'invoice_no', '0007655');
  expect(edited()).toEqual(['customer', 'item2']);
  // The sold-to row has the customer's boxes too.
  updateScan(id, { kind: 'purchase' });
  expect(edited()).toEqual(['sold_to', 'item2']);
});

test("both ledgers' rows: boxesOf lists a row's boxes in its form's order; editedIn says whether one was fixed", () => {
  // the form's order, whatever order a row names them in; a box the form doesn't have (a 2307's) isn't listed
  expect(boxesOf('sales_invoice', 'Customer', ['customer_address', 'customer_tin', 'customer_name'])).toEqual({
    kind: 'boxes',
    title: 'Customer',
    boxes: ['customer_name', 'customer_tin', 'customer_address'],
  });
  expect(boxesOf('sales_invoice', 'Sugar', ['item1_amount', 'item1_qty', 'ewt1_tax'], 1)).toEqual({
    kind: 'boxes',
    title: 'Sugar',
    boxes: ['item1_qty', 'item1_amount'],
    row: 1, // an item row's sheet knows its row
  });
  expect(boxesOf('bir_2307', 'Period', ['period_to', 'period_from'])).toEqual({
    kind: 'boxes',
    title: 'Period',
    boxes: ['period_from', 'period_to'],
  });

  const id = scanOf('inv_0007');
  const scan = () => getScan(id)!;
  expect(editedIn(scan(), ['invoice_no', 'date'])).toBe(false);
  setEdit(id, 'date', '10/29/2026');
  expect(editedIn(scan(), ['invoice_no', 'date'])).toBe(true);
  expect(editedIn(scan(), ['invoice_no'])).toBe(false);
  setEdit(id, 'invoice_no', ''); // cleared: the person's edit too
  expect(editedIn(scan(), ['invoice_no'])).toBe(true);
});

test('no items: one row, No items read', () => {
  const id = scanOf('inv_0007', (r) => {
    r.reads = r.reads.filter((b) => !b.name.startsWith('item'));
  });
  const items = sectionsOf(id)[1];
  expect(items.title).toBe('Items · 0');
  expect(items.rows).toHaveLength(1);
  expect(items.rows[0]).toMatchObject({ value: 'No items read', flagged: false, edited: false, open: null });
});
