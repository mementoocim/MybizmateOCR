import { exportChoice, exportFileName, partiesToCheck, writeExport } from '../lib/exportFile';
import { CWT_COLUMNS, type ExportRow } from '../lib/exportRows';
import type { Lists } from '../lib/lists';
import { type CertSummary, type InvoiceSummary, loadSaved, type SavedSummary } from '../lib/saved';
import { columnLetter } from '../lib/xlsx';
import { memoryFs } from '../test-utils/memoryFs';
import { party } from '../test-utils/packLists';
import { unzipStored } from '../test-utils/unzip';

jest.mock('expo-file-system', () => require('../test-utils/memoryFs').memoryFs.module);

function summary(id: string, kind: 'sale' | 'purchase', date: string, extra: Partial<InvoiceSummary> = {}): InvoiceSummary {
  return {
    id,
    kind,
    label: 'Camera photo',
    partyName: `Party ${id}`,
    partyId: null,
    date,
    gross: 100,
    row: { 'Date *': date, 'Gross *': 100 },
    listed: true,
    savedAt: `${date}T01:00:00.000Z`,
    exportedAt: null,
    ...extra,
  };
}

/** A saved 2307 whose period ends on that date, with its import rows. */
function certSummary(id: string, date: string, rows: ExportRow[]): CertSummary {
  return {
    id,
    kind: '2307',
    label: 'PDF: 2307.pdf',
    partyName: 'Castillo Eatery',
    partyId: null,
    date,
    period: 'Q4 2026',
    tax: 100,
    rows,
    listed: true,
    savedAt: `${date}T01:00:00.000Z`,
    exportedAt: null,
  };
}

/** Each written cell of a sheet by its reference ("B2"): its text, or its number. */
function cellsOf(sheet: string): Record<string, string | number> {
  const cells: Record<string, string | number> = {};
  const cell = /<c r="([A-Z]+\d+)"(?: t="inlineStr")?>(?:<is><t xml:space="preserve">(.*?)<\/t><\/is>|<v>(.*?)<\/v>)<\/c>/g;
  for (const [, ref, text, number] of sheet.matchAll(cell)) cells[ref] = number !== undefined ? Number(number) : text;
  return cells;
}

const ids = (rows: readonly SavedSummary[]) => rows.map((r) => r.id);

beforeEach(async () => {
  memoryFs.reset();
  memoryFs.files.set(
    'file:///docs/saved.json',
    JSON.stringify([
      summary('a', 'sale', '2026-10-05'),
      summary('b', 'sale', '2026-11-02', { exportedAt: '2026-11-03T00:00:00.000Z' }),
      summary('c', 'sale', '2025-12-20'),
      summary('d', 'purchase', '2026-10-15'),
    ]),
  );
  await loadSaved();
});

test('exportChoice: by invoice date, oldest first; "new" is what was never exported', () => {
  expect(ids(exportChoice('sale', 'last_month', new Date(2026, 10, 1)))).toEqual(['a']);
  expect(ids(exportChoice('sale', 'this_month', new Date(2026, 10, 1)))).toEqual(['b']);
  expect(ids(exportChoice('sale', 'last_month', new Date(2026, 0, 10)))).toEqual(['c']);
  expect(ids(exportChoice('sale', 'new', new Date(2026, 10, 1)))).toEqual(['c', 'a']);
  expect(ids(exportChoice('sale', 'all', new Date(2026, 10, 1)))).toEqual(['c', 'a', 'b']);
  expect(ids(exportChoice('purchase', 'all', new Date(2026, 10, 1)))).toEqual(['d']);
});

test('partiesToCheck: unlisted names, once each; a party that went out in a Parties import file is left out', () => {
  const lists: Lists = {
    parties: [party({ id: 'sent', registeredName: 'Sent Store', exportedAt: '2026-11-01T00:00:00.000Z', fromScan: true })],
    items: [],
    version: 1,
  };
  const rows = [
    summary('x', 'sale', '2026-11-01', { listed: false, partyName: 'Bagong Tindahan' }),
    summary('y', 'sale', '2026-11-02', { listed: false, partyName: 'Bagong Tindahan' }),
    summary('z', 'sale', '2026-11-03', { listed: false, partyName: 'Sent Store', partyId: 'sent' }),
    summary('w', 'sale', '2026-11-04', { listed: true, partyName: 'Listed Co' }),
  ];
  expect(partiesToCheck(rows, lists)).toEqual(['Bagong Tindahan']);
});

test('exportFileName', () => {
  expect(exportFileName('sale', new Date(2026, 10, 20, 9))).toBe('MyBizMate Sales import 2026-11-20.xlsx');
  expect(exportFileName('purchase', new Date(2026, 10, 20, 9))).toBe('MyBizMate Purchases import 2026-11-20.xlsx');
  expect(exportFileName('parties', new Date(2026, 10, 20, 9))).toBe('MyBizMate Parties import 2026-11-20.xlsx');
  expect(exportFileName('2307', new Date(2026, 10, 20, 9))).toBe('MyBizMate 2307-CWT import 2026-11-20.xlsx');
});

test('the 2307 file: its name, and its rows under the 2307-CWT headers', async () => {
  const every = { 'Customer *': 'C013', 'Offset Account *': '1205' };
  const q3 = { ...every, 'Date *': '2026-09-30', Particulars: 'BIR 2307 for Jul–Sep 2026' };
  const q4 = { ...every, 'Date *': '2026-12-31', Particulars: 'BIR 2307 for Oct–Dec 2026' };
  memoryFs.files.set(
    'file:///docs/saved.json',
    JSON.stringify([
      summary('a', 'sale', '2026-10-05'),
      certSummary('e', '2026-12-31', [
        { ...q4, 'Tax Base (Net)': 2000, 'CWT IT': 'WC158', 'IT Amt': 20 },
        { ...q4, 'Tax Base (Net)': 1000, 'CWT VT': 'WV010', 'VT Amt': 50 },
      ]),
      certSummary('f', '2026-09-30', [{ ...q3, 'Tax Base (Net)': 500, 'CWT IT': 'WI010', 'IT Amt': 25 }]),
    ]),
  );
  await loadSaved();
  const rows = exportChoice('2307', 'all', new Date(2026, 10, 20));
  expect(ids(rows)).toEqual(['f', 'e']); // the 2307s only, by their period's last day
  const uri = await writeExport('2307', rows, new Date(2026, 10, 20, 9));
  expect(uri).toBe('file:///cache/exports/MyBizMate 2307-CWT import 2026-11-20.xlsx');
  const zip = unzipStored(memoryFs.files.get(uri) as Uint8Array);
  expect(zip.every((f) => f.crcOk)).toBe(true);
  const cells = cellsOf(new TextDecoder().decode(zip.find((f) => f.name === 'xl/worksheets/sheet1.xml')!.data));
  // row 1: the template's header row; then each 2307's rows, each value under its column, blanks left out
  expect(CWT_COLUMNS.map((_, i) => cells[`${columnLetter(i)}1`])).toEqual(CWT_COLUMNS);
  expect(Object.fromEntries(Object.entries(cells).filter(([ref]) => !/^[A-Z]+1$/.test(ref)))).toEqual({
    A2: '2026-09-30', B2: 'C013', C2: 500, D2: 'WI010', E2: 25, H2: '1205', K2: 'BIR 2307 for Jul–Sep 2026',
    A3: '2026-12-31', B3: 'C013', C3: 2000, D3: 'WC158', E3: 20, H3: '1205', K3: 'BIR 2307 for Oct–Dec 2026',
    A4: '2026-12-31', B4: 'C013', C4: 1000, F4: 'WV010', G4: 50, H4: '1205', K4: 'BIR 2307 for Oct–Dec 2026',
  });
});

test("writeExport: one file in cache/exports, the older ones gone", async () => {
  memoryFs.files.set('file:///cache/exports/old.xlsx', 'old');
  const uri = await writeExport('sale', exportChoice('sale', 'all', new Date(2026, 10, 20)), new Date(2026, 10, 20, 9));
  expect(uri).toBe('file:///cache/exports/MyBizMate Sales import 2026-11-20.xlsx');
  expect(memoryFs.files.has('file:///cache/exports/old.xlsx')).toBe(false);
  const sheet = unzipStored(memoryFs.files.get(uri) as Uint8Array).find((f) => f.name === 'xl/worksheets/sheet1.xml')!;
  expect(new TextDecoder().decode(sheet.data)).toContain('<row r="4">');
});
