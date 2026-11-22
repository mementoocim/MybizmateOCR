import { certSections, payorLine } from '../components/CertificateSections';
import type { LedgerRowSpec, LedgerSection } from '../components/InvoiceLedger';
import { certOf } from '../lib/cert';
import { flagTarget } from '../lib/flagTargets';
import type { Lists } from '../lib/lists';
import { addScan, getScan, setEdit } from '../lib/scans';
import { settings } from '../lib/settings';
import type { ScanResult } from '../modules/scanner';
import { parseScanResult } from '../modules/scanner/src/parse';
import { coreJson } from '../test-utils/coreJson';
import { memoryFs } from '../test-utils/memoryFs';
import { PACK_LISTS } from '../test-utils/packLists';

// Design B §9.5 and the plan's call 14: the 2307 as a ledger. certSections keeps today's sections (the old
// CertificateSections) row by row, with each row's words, its flag and its boxes. The quarter is a badge beside the
// period; a payment row has its tax on the right, its total in the sub-line, and its flags' words as its reason; totals
// keep the peso sign (§6). Each row is keyed as the flag chips find it (lib/flagTargets), so no 2307 chip does nothing.

jest.mock('expo-file-system', () => require('../test-utils/memoryFs').memoryFs.module);

const NO_LISTS: Lists = { parties: [], items: [], version: 1 };
const STEMS = [
  'bir2307_text_0',
  'bir2307_text_1',
  'bir2307_text_2',
  'bir2307_photo_0',
  'bir2307_photo_1',
  'bir2307_photo_2',
  'bir2307_picture_0',
  'bir2307_picture_1',
];

/** A made-up 2307 (fixtures/core/expected2307) as a scan, each box read as written; edit changes the result first. */
function scanOf(stem: string, edit?: (r: ScanResult) => void): string {
  const result = parseScanResult(coreJson(stem));
  edit?.(result);
  return addScan({ label: `PDF: ${stem}.pdf`, source: result.source === 'pdf' ? 'pdf' : 'gallery', result });
}

/** The scan's sections, as the Scan screen has them now, against these lists (no customers by default). */
function sectionsOf(id: string, theLists: Lists = NO_LISTS): LedgerSection[] {
  const scan = getScan(id)!;
  return certSections(scan, certOf(scan, theLists, settings()));
}

const keysOf = (sections: readonly LedgerSection[]) => sections.map((s) => [s.title, s.rows.map((r) => r.key)]);
const rowOf = (sections: readonly LedgerSection[], key: string): LedgerRowSpec =>
  sections.flatMap((s) => s.rows).find((r) => r.key === key)!;
/** The words a row shows; null where it shows none. */
const wordsOf = ({ value, sub, reason, amount }: LedgerRowSpec) => ({
  value,
  sub: sub ?? null,
  reason: reason ?? null,
  amount: amount ?? null,
});
const columns = (prefix: string, names: string[]) => names.map((c) => `${prefix}_${c}`);
const ROW = ['payment', 'atc', 'm1', 'm2', 'm3', 'total', 'tax'];
const TOTAL = ['m1', 'm2', 'm3', 'total', 'tax'];

beforeEach(() => {
  memoryFs.reset();
});

test("sections in today's order, the quarter as a badge", () => {
  // bir2307_text_1, Q4 2026: 4 income payments and 1 business-tax row; no customers yet
  const id = scanOf('bir2307_text_1');
  const sections = sectionsOf(id);
  expect(keysOf(sections)).toEqual([
    ['Period', ['period']],
    ['Payee', ['payee']],
    ['Payor', ['payor']],
    ['Income payments · 4', ['ewt1', 'ewt2', 'ewt3', 'ewt4']],
    ['Business tax · 1', ['bt1']],
    ['Totals', ['ewt_total', 'bt_total']],
  ]);
  // The tables and their totals name their right column; each row knows the section it sits under. As today, no row
  // shows a key beside its value: its section strip says what it is. The one-row sections' rows say their field to
  // TalkBack, which can land on them from a chip or a closing sheet (ruling T12-1); a table's rows are their values.
  expect(sections.map((s) => s.right)).toEqual([undefined, undefined, undefined, 'Tax', 'Tax', 'Tax']);
  for (const section of sections) for (const row of section.rows) expect(row.section).toBe(section.title);
  const rows = sections.flatMap((s) => s.rows);
  expect(rows.filter((r) => r.label !== undefined)).toEqual([]);
  expect(rows.filter((r) => r.spokenLabel !== undefined).map((r) => [r.key, r.spokenLabel])).toEqual([
    ['period', 'Period'],
    ['payee', 'Payee'],
    ['payor', 'Payor'],
  ]);

  // The period: a quarter's first and last days, its year said once, in figures; the quarter is a badge beside them.
  expect(rowOf(sections, 'period')).toMatchObject({
    value: 'Oct 1 – Dec 31, 2026',
    valueStyle: 'figure',
    badge: { label: 'Q4', tone: 'neutral' },
    reason: null,
    flagged: false,
    edited: false,
    open: { kind: 'boxes', title: 'Period', boxes: ['period_from', 'period_to'] },
  });
  // The payee (the business): its name, then its TIN as the BIR writes it and its ZIP code, in mono.
  expect(rowOf(sections, 'payee')).toMatchObject({
    value: 'Peñaflor, Ma. Teresa Lim',
    sub: 'TIN 746-851-963-00000 · ZIP 3306',
    subMono: true,
    flagged: false,
    open: { kind: 'boxes', title: 'Payee', boxes: columns('payee', ['tin', 'name', 'address', 'zip']) },
  });
  // The payor as written, how it stands against the customers, then its TIN and ZIP code: words, so not in mono.
  expect(rowOf(sections, 'payor')).toMatchObject({
    value: 'Castillo Eatery',
    sub: 'Add your customers in Your lists to check names\nTIN 334-455-667-00000 · ZIP 3303',
    flagged: false,
    open: { kind: 'boxes', title: 'Payor', boxes: columns('payor', ['tin', 'name', 'address', 'zip']) },
  });
  expect(rowOf(sections, 'payor').subMono).toBeFalsy();

  // Not one calendar quarter: the boxes as read, no badge, and today's words as the reason.
  setEdit(id, 'period_to', '11302026');
  expect(rowOf(sectionsOf(id), 'period')).toMatchObject({
    value: '10012026 – 11302026',
    badge: null,
    reason: 'Not one calendar quarter',
    flagged: true,
    edited: true,
  });
  // A box that wasn't read is a dash; with neither read, the row is blank.
  setEdit(id, 'period_to', '');
  expect(rowOf(sectionsOf(id), 'period').value).toBe('10012026 – —');
  setEdit(id, 'period_from', '');
  expect(rowOf(sectionsOf(id), 'period')).toMatchObject({ value: null, badge: null, flagged: true });

  // No business-tax rows: no section for them, and no total for them.
  expect(keysOf(sectionsOf(scanOf('bir2307_text_0')))).toEqual([
    ['Period', ['period']],
    ['Payee', ['payee']],
    ['Payor', ['payor']],
    ['Income payments · 2', ['ewt1', 'ewt2']],
    ['Totals', ['ewt_total']],
  ]);
  // No income payments read: one row that opens nothing, and no totals.
  const none = sectionsOf(
    scanOf('bir2307_text_0', (r) => {
      r.reads = r.reads.filter((b) => !b.name.startsWith('ewt'));
    }),
  );
  expect(keysOf(none).slice(3)).toEqual([['Income payments · 0', ['no_payments']]]);
  expect(none[3].right).toBe('Tax');
  expect(rowOf(none, 'no_payments')).toMatchObject({
    value: 'No income payments read',
    flagged: false,
    edited: false,
    open: null,
  });
});

test('a payment row: tax on the right, total in the sub-line, flags as the reason', () => {
  // bir2307_text_2's row 2: WC158 (1%) on 208,043.00, tax 2,080.43
  const id = scanOf('bir2307_text_2');
  const row2 = () => rowOf(sectionsOf(id), 'ewt2');
  expect(wordsOf(row2())).toEqual({
    value: 'WC158 · Office supplies', // its ATC and its payment, as today
    sub: 'Total 208,043.00',
    reason: null,
    amount: '2,080.43', // under the section's Tax, without the peso sign
  });
  expect(row2()).toMatchObject({
    section: 'Income payments · 2',
    subMono: true,
    flagged: false,
    edited: false,
    open: { kind: 'boxes', title: 'WC158 · Office supplies', boxes: columns('ewt2', ROW) },
  });
  expect(row2().amountStrong).toBeFalsy();
  expect(row2().valueStyle).toBeUndefined();

  // Each flag's words, today's, as the reason, capitalised: a tax that isn't the ATC's rate of the total,
  setEdit(id, 'ewt2_tax', '4,160.86');
  expect(row2()).toMatchObject({ amount: '4,160.86', reason: 'Not 1% of the total', flagged: true, edited: true });
  // and no tax at all;
  setEdit(id, 'ewt2_tax', '');
  expect(row2()).toMatchObject({ amount: '—', reason: 'Not 1% of the total', flagged: true });
  setEdit(id, 'ewt2_tax', '2,080.43'); // as read: no edit
  expect(row2()).toMatchObject({ reason: null, flagged: false, edited: false });
  // a rate as people write it;
  setEdit(id, 'ewt2_atc', 'WC156');
  expect(row2()).toMatchObject({ value: 'WC156 · Office supplies', reason: 'Not 0.5% of the total' });
  // an income payment's ATC must be one for income payments;
  setEdit(id, 'ewt2_atc', 'WV010');
  expect(row2()).toMatchObject({ value: 'WV010 · Office supplies', reason: 'Not an ATC for income payments' });
  // no ATC: the row is its payment,
  setEdit(id, 'ewt2_atc', '');
  expect(row2()).toMatchObject({ value: 'Office supplies', reason: 'No ATC', flagged: true });
  // and with no payment either, its number.
  setEdit(id, 'ewt2_payment', '');
  expect(row2()).toMatchObject({ value: 'Row 2', open: { title: 'Row 2' } });

  // Two flags, joined: months that don't add up to the total, and a tax that isn't the rate.
  setEdit(id, 'ewt2_atc', 'WC158');
  setEdit(id, 'ewt2_payment', 'Office supplies');
  setEdit(id, 'ewt2_m1', '1.00');
  setEdit(id, 'ewt2_tax', '4,160.86');
  expect(wordsOf(row2())).toEqual({
    value: 'WC158 · Office supplies',
    sub: 'Total 208,043.00',
    reason: "The months don't add up to the total · Not 1% of the total",
    amount: '4,160.86',
  });

  // A business-tax row: the same, keyed and worded for its own table.
  const bt = scanOf('bir2307_photo_1', (r) => {
    r.reads.find((b) => b.name === 'bt1_atc')!.text = 'WC158';
  });
  expect(rowOf(sectionsOf(bt), 'bt1')).toMatchObject({
    section: 'Business tax · 1',
    value: 'WC158 · Purchase of goods',
    sub: 'Total 149,514.00',
    subMono: true,
    amount: '7,475.70',
    reason: 'Not an ATC for business tax',
    flagged: true,
    edited: false, // read so: no edit
    open: { kind: 'boxes', title: 'WC158 · Purchase of goods', boxes: columns('bt1', ROW) },
  });
  setEdit(bt, 'bt1_atc', '');
  setEdit(bt, 'bt1_payment', '');
  expect(rowOf(sectionsOf(bt), 'bt1')).toMatchObject({ value: 'Business tax row 1', reason: 'No ATC' });
});

test('totals keep the peso sign', () => {
  const id = scanOf('bir2307_text_1');
  const sections = sectionsOf(id);
  // One row per table: its total in the sub-line, in mono as the payment rows' (ruling T12-2), and its tax on the
  // right, both with the peso sign.
  expect(wordsOf(rowOf(sections, 'ewt_total'))).toEqual({
    value: 'Income payments',
    sub: 'Total ₱1,375,018.56',
    reason: null,
    amount: '₱47,937.78',
  });
  expect(rowOf(sections, 'ewt_total')).toMatchObject({
    section: 'Totals',
    subMono: true,
    amountStrong: true,
    flagged: false,
    edited: false,
    open: { kind: 'boxes', title: 'Income payments', boxes: columns('ewt_total', TOTAL) },
  });
  expect(wordsOf(rowOf(sections, 'bt_total'))).toEqual({
    value: 'Business tax',
    sub: 'Total ₱189,255.11',
    reason: null,
    amount: '₱9,462.76',
  });
  expect(rowOf(sections, 'bt_total')).toMatchObject({
    subMono: true,
    amountStrong: true,
    open: { kind: 'boxes', title: 'Business tax', boxes: columns('bt_total', TOTAL) },
  });
  // its one row: the same amounts, without the sign
  expect(rowOf(sections, 'bt1')).toMatchObject({ sub: 'Total 189,255.11', amount: '9,462.76' });

  // A total row the rows don't add up to: today's words as the reason.
  setEdit(id, 'ewt_total_tax', '47,000.00');
  expect(rowOf(sectionsOf(id), 'ewt_total')).toMatchObject({
    amount: '₱47,000.00',
    reason: "The rows don't add up to the total row",
    flagged: true,
    edited: true,
  });

  // A template's 0.00 line under real rows is no total: dashes, and the rows don't add up to it.
  const zeros = scanOf('bir2307_text_0');
  for (const box of columns('ewt_total', TOTAL)) setEdit(zeros, box, '0.00');
  expect(wordsOf(rowOf(sectionsOf(zeros), 'ewt_total'))).toEqual({
    value: 'Income payments',
    sub: 'Total —',
    reason: "The rows don't add up to the total row",
    amount: '—',
  });
  // With no rows, a 0.00 total line isn't one either: no row for it.
  for (const box of columns('bt_total', TOTAL)) setEdit(zeros, box, '0.00');
  expect(keysOf(sectionsOf(zeros)).at(-1)).toEqual(['Totals', ['ewt_total']]);
});

test('payorLine for each status', () => {
  // bir2307_text_0's payor, as the checks match it against the pack's customers (or none)
  const payorOf = (edits: Record<string, string>, theLists: Lists = PACK_LISTS) => {
    const id = scanOf('bir2307_text_0');
    for (const [box, text] of Object.entries(edits)) setEdit(id, box, text);
    return certOf(getScan(id)!, theLists, settings()).payor;
  };
  const line = (payor: ReturnType<typeof payorOf>) => [payor.status, payorLine(payor)];

  const reyes = payorOf({ payor_name: 'REYES SARI SARI STORE' });
  expect(line(reyes)).toEqual(['auto', 'In your customers · TIN 456-789-012-00000']);
  // a customer kept without a TIN
  expect(payorLine({ ...reyes, listParty: { ...reyes.listParty!, tin: '' } })).toBe('In your customers');
  // Santos Merchandise is only the closest match for "Santos Merchandising"
  expect(line(payorOf({ payor_name: 'Santos Merchandising', payor_tin: '99988877700000' }))).toEqual([
    'unsure',
    'Closest match in your customers: Santos Merchandise',
  ]);
  expect(line(payorOf({ payor_name: 'Magsaysay Hardware', payor_tin: '99988877700000' }))).toEqual([
    'new',
    'Not in your customers',
  ]);
  expect(line(payorOf({ payor_name: '', payor_tin: '' }))).toEqual(['none', 'Not in your customers']);
  expect(line(payorOf({}, NO_LISTS))).toEqual(['unlisted', 'Add your customers in Your lists to check names']);
});

test("every 2307 chip opens a flagged row of the ledger, or the photo", () => {
  // Each made-up 2307, broken in the ways that between them make every word problems2307 says: the period, both TINs,
  // the payor's match, a row's months, tax and ATC in both tables, both total rows, and the photo.
  const breaks: { edits?: Record<string, string>; lists?: Lists; photo?: (r: ScanResult) => void }[] = [
    { edits: { period_to: '11302026' } },
    { edits: { payee_tin: '123', payor_tin: '' } },
    { edits: { payor_name: 'Magsaysay Hardware', payor_tin: '99988877700000' }, lists: PACK_LISTS },
    { edits: { payor_name: 'Santos Merchandising', payor_tin: '99988877700000' }, lists: PACK_LISTS },
    { edits: { ewt1_m1: '1.00', ewt1_tax: '1.00' } },
    { edits: { ewt1_atc: 'WV010' } },
    { edits: { bt1_atc: 'WV010', bt1_m1: '1.00', bt1_total: '100.00', bt1_tax: '1.00' } },
    { edits: { bt1_atc: 'WC158' } },
    {
      photo: (r) => {
        r.sharpness = 0.1;
        r.light = 10;
      },
    },
  ];
  const said = new Set<string>();
  for (const stem of STEMS) {
    for (const { edits = {}, lists: theLists = NO_LISTS, photo } of breaks) {
      const id = scanOf(stem, photo);
      for (const [box, text] of Object.entries(edits)) setEdit(id, box, text);
      const scan = getScan(id)!;
      const view = certOf(scan, theLists, settings());
      const rows = certSections(scan, view).flatMap((s) => s.rows);
      const flagged = new Set(rows.filter((row) => row.flagged).map((row) => row.key)); // as the screen gives it
      for (const word of view.problems) {
        said.add(word.replace(/\d+/, 'N'));
        const key = flagTarget(word, flagged);
        if (key === 'photo') continue; // the photo viewer
        const row = rows.find((r) => r.key === key);
        // the chip's row is there, flagged, and opens its boxes
        expect({ stem, word, key, flagged: row?.flagged, opens: row?.open?.kind }).toEqual({
          stem,
          word,
          key,
          flagged: true,
          opens: 'boxes',
        });
      }
    }
  }
  // and the breaks made every word
  expect(said).toEqual(
    new Set([
      'Blurry photo (retake it)',
      'Dark photo (retake it)',
      'Period',
      "Payee's TIN",
      "Payor's TIN",
      'Payor (not in your customers)',
      'Payor (confirm the match)',
      'Row N months',
      'Row N tax',
      'Row N ATC',
      'Totals',
      'Business tax row N months',
      'Business tax row N tax',
      'Business tax row N ATC',
      'Business tax totals',
    ]),
  );
});
