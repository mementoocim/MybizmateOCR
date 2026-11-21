import type { Final, Raw } from '../lib/checks/finalize';
import { pyRound } from '../lib/checks/num';
import type { Lists, Party } from '../lib/lists';
import { checkDay, isInvoice, problemWords, rawFromScan, saleOf, suggestTaxType } from '../lib/sale';
import { addScan, getScan, setEdit, type StoredScan, updateScan } from '../lib/scans';
import type { Settings } from '../lib/settings';
import { parseScanResult } from '../modules/scanner/src/parse';
import { coreJson } from '../test-utils/coreJson';

jest.mock('expo-file-system', () => require('../test-utils/memoryFs').memoryFs.module);

// The Python's own cases (fixtures/checks/finalize.json) and its synthetic scan pack.
const FZ = require('../fixtures/checks/finalize.json');
const PACK = require('../fixtures/checks/scan_pack.json');

const SETTINGS: Settings = { vatRegistered: null, revenueAccount: '', expenseAccount: '', atc: '' };
const EMPTY: Lists = { parties: [], items: [], version: 0 };

function party(fields: Partial<Party> & Pick<Party, 'id' | 'registeredName'>): Party {
  return {
    code: '',
    type: 'customer',
    entity: 'company',
    lastName: '',
    firstName: '',
    middleName: '',
    tradeName: '',
    tin: '',
    address: '',
    vatStatus: '',
    terms: '',
    fromScan: false,
    exportedAt: null,
    ...fields,
  };
}

/** The pack as the person's lists: one customer per pack customer (its code = its id), one item per pack item. */
const PACK_LISTS: Lists = {
  parties: PACK.customers.map((c: { id: string; name: string; tin: string }) =>
    party({ id: `p-${c.id}`, code: c.id, registeredName: c.name, tin: c.tin }),
  ),
  items: PACK.items.map((i: { id: string; description: string; unit: string; price: number }) => ({
    id: `i-${i.id}`,
    name: i.description,
    unit: i.unit,
    price: i.price,
  })),
  version: 1,
};

beforeAll(() => {
  jest.useFakeTimers().setSystemTime(new Date(2026, 10, 18, 10, 0)); // so a scan that isn't a sample is as of 2026-11-18
});

afterAll(() => {
  jest.useRealTimers();
});

/** A scan of a fixture photo, kept in the recent scans (as a sample unless said otherwise). */
function scanOf(stem: string, source: StoredScan['source'] = 'sample'): StoredScan {
  const id = addScan({
    label: stem,
    source,
    sampleId: source === 'sample' ? stem : undefined,
    result: parseScanResult(coreJson(stem)),
  });
  return getScan(id)!;
}

const caseOf = (name: string) => FZ.cases.find((c: { name: string }) => c.name === name);

test('builds the raw the Python was given', () => {
  for (const c of FZ.cases.filter((x: { name: string }) => x.name.startsWith('fixture: '))) {
    const { terms = null, photo = null, ...boxes } = c.raw;
    const withoutConf = Object.fromEntries(
      Object.entries(boxes).map(([k, b]) => [k, { text: (b as { text: string }).text, alts: (b as { alts: string[] }).alts }]),
    );
    expect([c.name, rawFromScan(scanOf(c.name.slice('fixture: '.length)))]).toEqual([
      c.name,
      { boxes: withoutConf, terms, photo },
    ]);
  }
});

test('an edit replaces the reading and its backups; an empty edit removes the box; a blank box can be filled', () => {
  const scan = { ...scanOf('inv_0007'), edits: { total_due: '24,377.00', date: '', withholding: '10.00' } };
  const raw = rawFromScan(scan);
  expect(raw.boxes.total_due).toEqual({ text: '24,377.00', alts: [] });
  expect(raw.boxes.date).toBeUndefined();
  expect(raw.boxes.withholding).toEqual({ text: '10.00', alts: [] });
  expect(rawFromScan({ ...scan, terms: 'cash' }).terms).toBe('cash');
});

test('the date is checked against the day of the scan', () => {
  const scan = scanOf('inv_0007', 'camera');
  expect(checkDay({ ...scan, at: new Date(2026, 10, 20, 7, 30) })).toBe('2026-11-20');
  expect(checkDay({ ...scan, source: 'sample', at: new Date(2027, 5, 1) })).toBe('2026-11-18');
});

test('only the two invoices have a sale', () => {
  expect(isInvoice(scanOf('inv_0007'))).toBe(true);
  expect(isInvoice(scanOf('svc_0000'))).toBe(true);
  expect(isInvoice(scanOf('sales_text_0', 'pdf'))).toBe(true);
  expect(isInvoice(scanOf('bir2307_text_0', 'pdf'))).toBe(false); // a 2307 has its own checks (lib/cert.ts)
  expect(isInvoice(scanOf('bir2307_photo_0', 'gallery'))).toBe(false);
  expect(isInvoice(scanOf('blank_page'))).toBe(false); // no form found
});

test('empty lists skip the list checks', () => {
  const sale = saleOf(scanOf('inv_0007'), EMPTY, SETTINGS);
  expect(sale.problems).toEqual([]);
  expect(sale.party.status).toBe('unlisted');
  expect(sale.party.column).toBe(sale.party.written);
  expect(sale.party.written).not.toBe('');
});

test("with the pack's lists, the checks are the Python's", () => {
  for (const stem of ['inv_0007', 'inv_0051', 'svc_0000_blur']) {
    expect([stem, saleOf(scanOf(stem), PACK_LISTS, SETTINGS).final.flags]).toEqual([
      stem,
      caseOf(`fixture: ${stem}`).expected.flags,
    ]);
  }
});

test("a purchase doesn't check the customer boxes", () => {
  const { id } = scanOf('inv_0007');
  updateScan(id, { kind: 'purchase' });
  const sale = saleOf(getScan(id)!, PACK_LISTS, SETTINGS);
  expect(sale.problems).toContain('Supplier (choose one)');
  expect(sale.problems.join(', ')).not.toMatch(/Customer|Row \d+ (item|price)/);
  expect(sale.party).toMatchObject({ status: 'missing', column: '' });
  updateScan(id, { party: { various: true } });
  expect(saleOf(getScan(id)!, PACK_LISTS, SETTINGS).party).toMatchObject({ status: 'various', column: 'VARIOUS-SUPP' });
});

const SANTOS: Lists = {
  parties: [
    party({ id: 'santos-1', code: 'C1', registeredName: 'Santos Trading', tin: '900-000-011-00000' }),
    party({ id: 'santos-2', code: 'C2', registeredName: 'Santos Trading', tin: '900-000-012-00000' }),
  ],
  items: [],
  version: 1,
};

test('two customers with the same name and no TIN on the paper: unsure, and the name as written goes out', () => {
  const { id } = scanOf('inv_0007');
  setEdit(id, 'customer_name', 'Santos Trading');
  setEdit(id, 'customer_tin', '');
  const sale = saleOf(getScan(id)!, SANTOS, SETTINGS);
  expect(sale.party).toMatchObject({ status: 'unsure', column: 'Santos Trading' });
  expect(sale.problems).toContain('Customer (confirm the match)');
});

test('a chosen customer clears the customer checks and exports its code', () => {
  const { id } = scanOf('inv_0007');
  setEdit(id, 'customer_name', 'Santos Trading');
  setEdit(id, 'customer_tin', '');
  updateScan(id, { party: { listId: 'santos-2' } });
  const sale = saleOf(getScan(id)!, SANTOS, SETTINGS);
  expect(sale.party).toMatchObject({ status: 'chosen', column: 'C2', shown: 'Santos Trading' });
  expect(sale.problems.join(', ')).not.toMatch(/Customer/);
});

test('matched by TIN and name', () => {
  const { id } = scanOf('inv_0007');
  setEdit(id, 'customer_name', 'Santos Trading');
  setEdit(id, 'customer_tin', '900-000-011-00000');
  expect(saleOf(getScan(id)!, SANTOS, SETTINGS).party).toMatchObject({ status: 'auto', column: 'C1' });
});

test('no name or TIN: the walk-in customer', () => {
  expect(saleOf(scanOf('inv_0041'), PACK_LISTS, SETTINGS).party).toMatchObject({
    status: 'blank',
    column: 'VARIOUS-CUST',
    shown: 'Walk-in (VARIOUS)',
  });
});

test("the Service Invoice's gross is before the discount", () => {
  const scan = scanOf('svc_0002');
  const sale = saleOf(scan, EMPTY, SETTINGS);
  expect(sale.final.less).toBe(77.95);
  expect(sale.gross).toBe(pyRound(sale.final.total_due! + 77.95, 2));
  expect(sale.discount).toBe(77.95);
  expect(sale.withholding).toBeNull();
  setEdit(scan.id, 'withholding', '50.00');
  expect(saleOf(getScan(scan.id)!, EMPTY, SETTINGS).withholding).toBe(50);
});

const raw = (boxes: Record<string, string>): Raw => ({
  boxes: Object.fromEntries(Object.entries(boxes).map(([k, text]) => [k, { text }])),
  terms: null,
  photo: null,
});

test('suggestTaxType', () => {
  expect(suggestTaxType('sale', raw({ vat: '120.00', vatable_sales: '1,000.00' }), false)).toBe('NONVAT');
  expect(suggestTaxType('sale', raw({ zero_rated: '500.00' }), true)).toBe('ZERO');
  expect(suggestTaxType('sale', raw({ vat_exempt: '500.00' }), true)).toBe('EXEMPT');
  expect(suggestTaxType('sale', raw({ vat: '120.00', zero_rated: '500.00' }), true)).toBe('VAT');
  expect(suggestTaxType('sale', raw({}), true)).toBe('VAT');
  expect(suggestTaxType('purchase', raw({}), true)).toBe('NONVAT');
  expect(suggestTaxType('purchase', raw({ add_vat: '12.00' }), false)).toBe('VAT');
  expect(suggestTaxType('purchase', raw({ vat_exempt: '100.00' }), false)).toBe('EXEMPT');
  expect(suggestTaxType('sale', raw({}), null)).toBe('NONVAT');
  expect(suggestTaxType('sale', raw({ vat: '1.00' }), null)).toBe('VAT');
});

test("problemWords keeps the test app's order", () => {
  const final = {
    items: [{ row: 2, item_id: null, description: '', qty: null, unit_price: null, amount: null }],
    flags: ['total', 'row2', 'check_vat', 'terms', 'date', 'blurry', 'check_add_vat'],
  } as unknown as Final;
  expect(problemWords(final, 'sale', false)).toEqual([
    'Blurry photo (retake it)',
    'Date',
    'Terms',
    'Row 2 math',
    'Total',
    'VAT breakdown',
  ]);
});

test('an amount edited to letters still checks', () => {
  const { id } = scanOf('inv_0007');
  const before = saleOf(getScan(id)!, EMPTY, SETTINGS).final.items[0];
  setEdit(id, 'item1_amount', 'abc');
  // As the Python does: the rows still add up to the total with qty x price, so the row's amount is repaired.
  const repaired = saleOf(getScan(id)!, EMPTY, SETTINGS);
  expect(repaired.problems).toEqual([]);
  expect(repaired.final.items[0].amount).toBe(before.amount);
  // With its price unreadable too, nothing can repair it: the row is marked.
  setEdit(id, 'item1_unit_price', 'xyz');
  expect(saleOf(getScan(id)!, EMPTY, SETTINGS).problems).toContain('Row 1 math');
});
