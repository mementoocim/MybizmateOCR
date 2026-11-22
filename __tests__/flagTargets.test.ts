import { type Cert2307, problems2307 } from '../lib/checks/bir2307';
import type { Final } from '../lib/checks/finalize';
import { flagTarget } from '../lib/flagTargets';
import { problemWords } from '../lib/sale';

// Design B §6 and §9.5: a flag chip shows today's problem word, and opens the row the problem is about. The rows are
// keyed as the Scan screen keys them ('date', `item${n}`, `ewt${n}`, …), and the photo's words open the photo.

const flagged = new Set(['vat', 'total_due']);
test.each([
  ['Blurry photo (retake it)', 'photo'], ['Dark photo (retake it)', 'photo'],
  ['Date', 'date'], ['Customer (confirm the match)', 'customer'], ['Customer (not in your list)', 'customer'],
  ['Supplier (choose one)', 'supplier'], ['Terms', 'terms'],
  ['Row 2 math', 'item2'], ['Row 3 item', 'item3'], ['Row 10 price', 'item10'],
  ['Total', 'total_due'], ['Rows vs total', 'total_due'], ['VAT breakdown', 'vat'],
  ['Period', 'period'], ["Payee's TIN", 'payee'], ["Payor's TIN", 'payor'],
  ['Payor (not in your customers)', 'payor'], ['Payor (confirm the match)', 'payor'],
  ['Row 1 months', 'ewt1'], ['Row 4 tax', 'ewt4'], ['Row 2 ATC', 'ewt2'],
  ['Business tax row 1 months', 'bt1'], ['Business tax row 3 ATC', 'bt3'],
  ['Totals', 'ewt_total'], ['Business tax totals', 'bt_total'],
])('%s opens %s', (word, key) => expect(flagTarget(word, flagged)).toBe(key));

test('VAT breakdown opens the first flagged of VATable sales, VAT 12%, Total due', () => {
  expect(flagTarget('VAT breakdown', new Set(['vatable', 'vat']))).toBe('vatable');
  expect(flagTarget('VAT breakdown', new Set(['total_due']))).toBe('total_due');
  expect(flagTarget('VAT breakdown', new Set())).toBe('total_due');
});

test('an unknown word opens nothing', () => {
  expect(flagTarget('Something new', flagged)).toBeNull();
  expect(flagTarget('', flagged)).toBeNull();
  expect(flagTarget('Row two math', flagged)).toBeNull();
});

test('every word the checks can produce has a row', () => {
  // An invoice with every flag problemWords reads. A row says one word, its math first, so each of rows 1 to 3 carries
  // a different one; a purchase with no supplier says the supplier's.
  const final = {
    items: [1, 2, 3].map((row) => ({ row, item_id: null, description: '', qty: null, unit_price: null, amount: null })),
    flags: [
      'blurry',
      'dark',
      'date',
      'customer_unsure',
      'customer_new',
      'terms',
      'row1',
      'item2',
      'price3',
      'total',
      'total_rows',
      'check_vat',
    ],
  } as unknown as Final;
  // A 2307 with every flag problems2307 reads, on rows in both tables.
  const rows = [
    { table: 'ewt', row: 1 },
    { table: 'ewt', row: 2 },
    { table: 'bt', row: 1 },
    { table: 'bt', row: 3 },
  ];
  const cert = {
    rows,
    flags: [
      'blurry',
      'dark',
      'period',
      'payee_tin',
      'payor_tin',
      'payor_new',
      'payor_unsure',
      ...rows.flatMap(({ table, row }) => ['sum', 'tax', 'atc'].map((what) => `${table}${row}_${what}`)),
      'ewt_total',
      'bt_total',
    ],
  } as unknown as Cert2307;
  const words = [...problemWords(final, 'purchase', true), ...problems2307(cert)];

  const none = new Set<string>();
  expect(words.filter((word) => flagTarget(word, none) === null)).toEqual([]);
  // and the words reach every kind of row
  expect(new Set(words.map((word) => flagTarget(word, none)))).toEqual(
    new Set([
      'photo',
      'date',
      'customer',
      'supplier',
      'terms',
      'item1',
      'item2',
      'item3',
      'total_due',
      'period',
      'payee',
      'payor',
      'ewt1',
      'ewt2',
      'bt1',
      'bt3',
      'ewt_total',
      'bt_total',
    ]),
  );
});
