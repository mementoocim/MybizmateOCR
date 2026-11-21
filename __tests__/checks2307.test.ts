import { type Cert2307, type CertRow, check2307, problems2307 } from '../lib/checks/bir2307';
import type { Pack, PhotoMeasures, Raw } from '../lib/checks/finalize';
import type { Box } from '../lib/checks/num';
import { packFor } from '../lib/lists';
import { EMPTY_LISTS, PACK_LISTS } from '../test-utils/packLists';

jest.mock('expo-file-system', () => require('../test-utils/memoryFs').memoryFs.module);

// Task 2's made-up 2307s (fixtures/core/expected2307, written by prototype/benchmark/synth_2307.py), with the values
// written on each as its boxes' readings. The folder also holds two made-up invoices, left out by their form. The
// customers are the Python's synthetic scan pack, whose names the made-up payors use.

type Written = { stem: string; form: string; values: Record<string, string> };
const FILES: string[] = require('fs').readdirSync('fixtures/core/expected2307'); // jest runs from the repo's root
const WRITTEN: Written[] = FILES.filter((file) => file.endsWith('.json'))
  .map((file) => require(`../fixtures/core/expected2307/${file}`) as Written)
  .filter((w) => w.form === 'bir_2307');
const PACK = packFor(PACK_LISTS);

/** Each value as its box's reading; a value of '' leaves its box blank. */
function rawOf(values: Record<string, string | Box>): Raw {
  const boxes: Record<string, Box> = {};
  for (const [name, v] of Object.entries(values)) {
    if (v !== '') boxes[name] = typeof v === 'string' ? { text: v } : v;
  }
  return { boxes, terms: null, photo: null };
}

const valuesOf = (stem: string) => WRITTEN.find((w) => w.stem === stem)!.values;
/** A made-up 2307's period, payee and payor, without its Part III. */
const headerOf = (stem: string) =>
  Object.fromEntries(Object.entries(valuesOf(stem)).filter(([name]) => !/^(ewt|bt)/.test(name)));

/** A made-up 2307 with some of its boxes saying something else. */
function check(stem: string, changes: Record<string, string | Box> = {}, pack: Pack = PACK): Cert2307 {
  return check2307(rawOf({ ...valuesOf(stem), ...changes }), pack);
}

/** A made-up 2307 as a photo (or a picture PDF) with these measures, rounded as rawFromScan rounds them. */
function photographed(stem: string, photo: PhotoMeasures | null, changes: Record<string, string> = {}): Cert2307 {
  return check2307({ ...rawOf({ ...valuesOf(stem), ...changes }), photo }, PACK);
}

test('a made-up 2307 has no flags', () => {
  expect(WRITTEN.map((w) => w.stem).sort()).toEqual([
    'bir2307_photo_0',
    'bir2307_photo_1',
    'bir2307_photo_2',
    'bir2307_picture_0',
    'bir2307_picture_1',
    'bir2307_text_0',
    'bir2307_text_1',
    'bir2307_text_2',
    'two_pages',
  ]);
  for (const w of WRITTEN) {
    const cert = check2307(rawOf(w.values), PACK);
    expect([w.stem, cert.flags, cert.payorMatch.status]).toEqual([w.stem, [], 'auto']);
  }
});

test("a 2307's period, payee, payor, rows and totals", () => {
  const cert = check('bir2307_photo_1'); // EWT rows 1 and 3 (row 2 blank), one business-tax row
  expect(cert).toMatchObject({
    from: '2026-10-01',
    to: '2026-12-31',
    quarter: '2026-Q4',
    payee: {
      tin: '96807318500000',
      name: 'Bernardo, Rhea Joy Agustin',
      address: 'Purok 6, Brgy. Labinab, Cauayan City',
      zip: '3305',
    },
    payor: {
      tin: '34567890100000',
      name: 'Santos General Merchandise',
      address: 'Purok 3, San Mateo, Isabela',
      zip: '3318',
    },
    payorMatch: { id: 'p-C003', status: 'auto' },
  });
  expect(cert.rows).toEqual([
    {
      table: 'ewt',
      row: 1,
      payment: 'Purchase of palay',
      atc: 'WI610',
      rate: 0.01,
      months: [9470.85, 31261.46, 149465.78],
      total: 190198.09,
      tax: 1901.98,
    },
    {
      table: 'ewt',
      row: 3,
      payment: 'Consultancy fees',
      atc: 'WI050',
      rate: 0.05,
      months: [193233, 13868.21, 235002.83],
      total: 442104.04,
      tax: 22105.2,
    },
    {
      table: 'bt',
      row: 1,
      payment: 'Purchase of goods',
      atc: 'WV010',
      rate: 0.05,
      months: [18336, 3026, 128152],
      total: 149514,
      tax: 7475.7,
    },
  ]);
  const totalRow = { row: 0, payment: '', atc: null, rate: null };
  expect(cert.totals).toEqual({
    ewt: { table: 'ewt', ...totalRow, months: [202703.85, 45129.67, 384468.61], total: 632302.13, tax: 24007.18 },
    bt: { table: 'bt', ...totalRow, months: [18336, 3026, 128152], total: 149514, tax: 7475.7 },
  });
  // a month left blank is null, and adds nothing
  expect(check('bir2307_photo_2').rows[1]).toMatchObject({ row: 2, months: [null, 63700, 272187], total: 335887 });
  // the total row takes the reading its column adds up to; a total row that is missing doesn't add up
  const misread = check('bir2307_photo_1', { ewt_total_m2: { text: '45,129.87', alts: ['45,129.67'] } });
  expect([misread.totals.ewt?.months, misread.flags]).toEqual([[202703.85, 45129.67, 384468.61], []]);
  const blank = { bt_total_m1: '', bt_total_m2: '', bt_total_m3: '', bt_total_total: '', bt_total_tax: '' };
  const missing = check('bir2307_photo_1', blank);
  expect([missing.totals.bt, missing.flags]).toEqual([null, ['bt_total']]);
  const noRow = { bt1_payment: '', bt1_atc: '', bt1_m1: '', bt1_m2: '', bt1_m3: '', bt1_total: '', bt1_tax: '' };
  const alone = check('bir2307_photo_1', noRow);
  expect([alone.rows.length, alone.flags]).toEqual([2, ['bt_total']]); // a total row without its rows
});

test('the period must be one quarter', () => {
  const q4 = check('bir2307_text_1', { period_from: '10/01/2026', period_to: '12/31/2026' });
  expect([q4.from, q4.to, q4.quarter, q4.flags]).toEqual(['2026-10-01', '2026-12-31', '2026-Q4', []]);
  const short = check('bir2307_text_1', { period_from: '10/01/2026', period_to: '11/30/2026' });
  expect([short.from, short.to, short.quarter, short.flags]).toEqual(['2026-10-01', '2026-11-30', null, ['period']]);

  const period = (from: string, to: string) => {
    const cert = check('bir2307_text_1', { period_from: from, period_to: to });
    return [cert.from, cert.to, cert.quarter, cert.flags];
  };
  // as the form's boxes read: MM, DD and YYYY run together
  expect(period('01012026', '03312026')).toEqual(['2026-01-01', '2026-03-31', '2026-Q1', []]);
  expect(period('04012026', '06302026')).toEqual(['2026-04-01', '2026-06-30', '2026-Q2', []]);
  expect(period('07012026', '09302026')).toEqual(['2026-07-01', '2026-09-30', '2026-Q3', []]);
  // as a person may type it
  expect(period('10/1/2026', '12 31 2026')).toEqual(['2026-10-01', '2026-12-31', '2026-Q4', []]);
  // a day short; three months, but not a calendar quarter; a quarter and a year
  expect(period('10022026', '12312026')).toEqual(['2026-10-02', '2026-12-31', null, ['period']]);
  expect(period('11012026', '01312027')).toEqual(['2026-11-01', '2027-01-31', null, ['period']]);
  expect(period('10012026', '12312027')).toEqual(['2026-10-01', '2027-12-31', null, ['period']]);
  // can't be read: blank, no such day, a 2-digit year
  expect(period('10012026', '')).toEqual(['2026-10-01', null, null, ['period']]);
  expect(period('02302026', '03312026')).toEqual([null, '2026-03-31', null, ['period']]);
  expect(period('10/01/26', '12/31/26')).toEqual([null, null, null, ['period']]);
});

test("a row's months and its tax", () => {
  // bir2307_photo_0's only row: WC158 (1%), 1,114.00 + 136,165.03 + 282,347.00 = 419,626.03, tax 4,196.26
  const stem = 'bir2307_photo_0';
  // the total row's 1st month no longer adds up either
  expect(check(stem, { ewt1_m1: '1,124.00' }).flags).toEqual(['ewt1_sum', 'ewt_total']);
  // at 2%, in the row and in the total row
  expect(check(stem, { ewt1_tax: '8,392.52', ewt_total_tax: '8,392.52' }).flags).toEqual(['ewt1_tax']);
  // a tax withheld month by month can be a few centavos off: 5 is fine, 6 isn't
  expect(check(stem, { ewt1_tax: '4,196.31', ewt_total_tax: '4,196.31' }).flags).toEqual([]);
  expect(check(stem, { ewt1_tax: '4,196.32', ewt_total_tax: '4,196.32' }).flags).toEqual(['ewt1_tax']);
  // not in the table, so there's no rate to check the tax with
  expect(check(stem, { ewt1_atc: 'WZ999' }).flags).toEqual(['ewt1_atc']);
  expect(check(stem, { ewt1_atc: '158' }).flags).toEqual(['ewt1_atc']); // "wc158" typed in a fillable PDF reads "158"
  expect(check(stem, { ewt1_atc: '' }).flags).toEqual(['ewt1_atc']);
  expect(check(stem, { ewt1_atc: 'WV010' }).flags).toEqual(['ewt1_atc']); // a business tax's code
  // in the table without a rate: the tax isn't checked
  expect(check(stem, { ewt1_atc: 'WI661' }).flags).toEqual([]);
  // at 0%, nothing is withheld: a blank tax is right
  expect(check('bir2307_photo_1', { bt1_atc: 'WB102', bt1_tax: '', bt_total_tax: '' }).flags).toEqual([]);
  // a code as a person may type it
  expect(check(stem, { ewt1_atc: 'wc 158' }).rows[0]).toMatchObject({ atc: 'WC158', rate: 0.01 });
  // the first reading that makes the row add up is taken, as on an invoice's rows
  const misread = check(stem, { ewt1_m2: { text: '136,165.08', alts: ['136,165.03'] } });
  expect([misread.rows[0].months, misread.flags]).toEqual([[1114, 136165.03, 282347], []]);
  // no reading adds up: the first is kept, and flagged
  const wrong = check(stem, { ewt1_m2: { text: '136,165.08', alts: ['136,165.09'] } });
  expect([wrong.rows[0].months, wrong.flags]).toEqual([[1114, 136165.08, 282347], ['ewt1_sum', 'ewt_total']]);
  // the business-tax table has the same checks
  const bt = check('bir2307_photo_1', { bt1_m3: '128,162.00', bt1_atc: 'WC158' });
  expect(bt.flags).toEqual(['bt1_sum', 'bt1_atc', 'bt_total']);
});

test('blank rows are skipped and commas parse', () => {
  const cert = check2307(
    rawOf({
      ...headerOf('bir2307_text_2'),
      ewt1_payment: 'Office supplies',
      ewt1_atc: 'WC158',
      ewt1_m1: '1,000.00',
      ewt1_total: '1,000.00',
      ewt1_tax: '10.00',
      ewt4_payment: 'Office supplies',
      ewt4_atc: 'WC158',
      ewt4_m3: '500.00',
      ewt4_total: '500.00',
      ewt4_tax: '5.00',
      ewt_total_m1: '1,000.00',
      ewt_total_m3: '500.00',
      ewt_total_total: '1,500.00',
      ewt_total_tax: '15.00',
    }),
    PACK,
  );
  expect(cert.rows.map((r) => [r.table, r.row, r.total])).toEqual([
    ['ewt', 1, 1000],
    ['ewt', 4, 500],
  ]);
  expect(cert.totals.ewt).toMatchObject({ months: [1000, null, 500], total: 1500, tax: 15 });
  expect(cert.totals.bt).toBeNull();
  expect(cert.flags).toEqual([]);
  // an income payment's words alone don't make a row (its amounts and ATC are what count)
  const words = check('bir2307_text_2', { ewt3_payment: 'for the month of August' });
  expect(words.rows.map((r) => r.row)).toEqual([1, 2]);
});

test("a dash, a speck or a template's zeros don't make a row", () => {
  // bir2307_photo_0 has one EWT row and no business-tax rows. A row counts when its ATC has a code, or one of its
  // amounts isn't zero: Excel's accounting format shows 0 as "-", and a template's formula cells print 0.00.
  const rowsOf = (cert: Cert2307) => cert.rows.map((r) => `${r.table}${r.row}`);
  const nothings: Record<string, string>[] = [
    { ewt2_total: '-', ewt2_tax: '-' },
    { ewt2_total: '0.00', ewt2_tax: '0.00' },
    { bt1_total: '-', bt1_tax: '-' },
    { bt1_total: '0.00', bt1_tax: '0.00' },
    { ewt3_m1: '.', ewt3_atc: '|' }, // a speck, a rule line
  ];
  for (const nothing of nothings) {
    const cert = check('bir2307_photo_0', nothing);
    expect([nothing, rowsOf(cert), cert.flags]).toEqual([nothing, ['ewt1'], []]);
  }
  // a code makes a row, even with nothing withheld
  const zero = check('bir2307_photo_0', { ewt2_atc: 'WC158', ewt2_total: '0.00', ewt2_tax: '0.00' });
  expect([rowsOf(zero), zero.flags]).toEqual([['ewt1', 'ewt2'], []]);
  const bt = check('bir2307_photo_0', { bt1_atc: 'WV010', bt1_total: '0.00', bt1_tax: '0.00' });
  expect([rowsOf(bt), bt.flags]).toEqual([['ewt1', 'bt1'], []]);
});

test('the payor against the customers', () => {
  // bir2307_text_0's payor is the pack's Reyes Sari-Sari Store, TIN 456-789-012-00000
  expect(check('bir2307_text_0').payorMatch).toEqual({ id: 'p-C005', status: 'auto' });
  const capitals = check('bir2307_text_0', { payor_name: 'REYES SARI SARI STORE' });
  expect(capitals.payorMatch).toEqual({ id: 'p-C005', status: 'auto' });
  const byName = check('bir2307_text_0', { payor_name: 'Reyes Sari Sari Store', payor_tin: '99988877700000' });
  expect([byName.payorMatch, byName.flags]).toEqual([{ id: 'p-C005', status: 'auto' }, []]);
  const stranger = { payor_name: 'Magsaysay Hardware', payor_tin: '99988877700000' };
  expect(check('bir2307_text_0', stranger).flags).toEqual(['payor_new']);
  // Santos Merchandise and Santos General Merchandise are both customers
  const alike = check('bir2307_text_0', { payor_name: 'Santos Merchandise', payor_tin: '99988877700000' });
  expect([alike.payorMatch, alike.flags]).toEqual([{ id: 'p-C004', status: 'unsure' }, ['payor_unsure']]);
  // no customers yet: nothing to match against, so no payor flag
  const none = check('bir2307_text_0', stranger, packFor(EMPTY_LISTS));
  expect([none.payorMatch, none.flags]).toEqual([{ id: 'NEW', status: 'new' }, []]);
});

test("the TINs' digits", () => {
  const tins = (payee: string, payor: string) => check('bir2307_text_0', { payee_tin: payee, payor_tin: payor }).flags;
  expect(tins('211305418', '456789012000')).toEqual([]); // 9 digits; 12 with a 3-digit branch
  expect(tins('211-305-418-00000', '45678901200000')).toEqual([]); // dashes typed
  expect(tins('2113054180', '4567890120000')).toEqual(['payee_tin', 'payor_tin']);
  expect(tins('', '')).toEqual(['payee_tin', 'payor_tin']); // not read (the payor is still found by its name)
});

test('a blurry or dark photo raises its flags, and their words come first', () => {
  // the 2307's minimum sharpness is 0.5 (photo_quality.h), and a photo under 50 of light is dark
  const blurry = { sharpness: 0.4, sharp_min: 0.5, light: 200, dark_max: 50 };
  const dark = { sharpness: 2, sharp_min: 0.5, light: 30, dark_max: 50 };
  const both = { sharpness: 0.4, sharp_min: 0.5, light: 30, dark_max: 50 };
  expect(photographed('bir2307_photo_0', blurry).flags).toEqual(['blurry']);
  expect(photographed('bir2307_photo_0', dark).flags).toEqual(['dark']);
  // after the form's own flags, as on an invoice; in words, first: retaking fixes the rest too
  const atTwoPercent = { ewt1_tax: '8,392.52', ewt_total_tax: '8,392.52' };
  const cert = photographed('bir2307_photo_0', both, atTwoPercent);
  expect(cert.flags).toEqual(['ewt1_tax', 'blurry', 'dark']);
  expect(problems2307(cert)).toEqual(['Blurry photo (retake it)', 'Dark photo (retake it)', 'Row 1 tax']);
});

test('without photo measures there is no photo flag', () => {
  expect(photographed('bir2307_photo_0', null).flags).toEqual([]);
  // sharp and well lit, as the made-up pages are (test-utils/coreJson.ts)
  expect(photographed('bir2307_photo_0', { sharpness: 2, sharp_min: 0.5, light: 255, dark_max: 50 }).flags).toEqual([]);
  // at the minimums is still fine: both checks are strict
  expect(photographed('bir2307_photo_0', { sharpness: 0.5, sharp_min: 0.5, light: 50, dark_max: 50 }).flags).toEqual([]);
});

test('the problem words', () => {
  const row = (table: 'ewt' | 'bt', n: number): CertRow => ({
    table,
    row: n,
    payment: '',
    atc: null,
    rate: null,
    months: [null, null, null],
    total: null,
    tax: null,
  });
  const nobody = { tin: '', name: '', address: '', zip: '' };
  const cert: Cert2307 = {
    from: null,
    to: null,
    quarter: null,
    payee: nobody,
    payor: nobody,
    payorMatch: { id: 'NEW', status: 'new' },
    rows: [row('ewt', 1), row('ewt', 2), row('bt', 1)],
    totals: { ewt: null, bt: null },
    // every flag, last first: the words keep the table's order
    flags: [
      'bt_total',
      'bt1_atc',
      'bt1_tax',
      'bt1_sum',
      'ewt_total',
      'ewt2_atc',
      'ewt2_sum',
      'ewt1_atc',
      'ewt1_tax',
      'ewt1_sum',
      'payor_unsure',
      'payor_new',
      'payor_tin',
      'payee_tin',
      'period',
      'dark',
      'blurry',
    ],
  };
  expect(problems2307(cert)).toEqual([
    'Blurry photo (retake it)',
    'Dark photo (retake it)',
    'Period',
    "Payee's TIN",
    "Payor's TIN",
    'Payor (not in your customers)',
    'Payor (confirm the match)',
    'Row 1 months',
    'Row 1 tax',
    'Row 1 ATC',
    'Row 2 months',
    'Row 2 ATC',
    'Totals',
    'Business tax row 1 months',
    'Business tax row 1 tax',
    'Business tax row 1 ATC',
    'Business tax totals',
  ]);
  expect(problems2307(check('bir2307_text_1'))).toEqual([]);
  const atTwoPercent = check('bir2307_photo_0', { ewt1_tax: '8,392.52', ewt_total_tax: '8,392.52' });
  expect(problems2307(atTwoPercent)).toEqual(['Row 1 tax']);
});
