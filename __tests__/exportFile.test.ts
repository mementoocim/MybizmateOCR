import { exportChoice, exportFileName, partiesToCheck, writeExport } from '../lib/exportFile';
import type { Lists } from '../lib/lists';
import { loadSaved, type SavedSummary } from '../lib/saved';
import { memoryFs } from '../test-utils/memoryFs';
import { party } from '../test-utils/packLists';
import { unzipStored } from '../test-utils/unzip';

jest.mock('expo-file-system', () => require('../test-utils/memoryFs').memoryFs.module);

function summary(id: string, kind: 'sale' | 'purchase', date: string, extra: Partial<SavedSummary> = {}): SavedSummary {
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
});

test("writeExport: one file in cache/exports, the older ones gone", async () => {
  memoryFs.files.set('file:///cache/exports/old.xlsx', 'old');
  const uri = await writeExport('sale', exportChoice('sale', 'all', new Date(2026, 10, 20)), new Date(2026, 10, 20, 9));
  expect(uri).toBe('file:///cache/exports/MyBizMate Sales import 2026-11-20.xlsx');
  expect(memoryFs.files.has('file:///cache/exports/old.xlsx')).toBe(false);
  const sheet = unzipStored(memoryFs.files.get(uri) as Uint8Array).find((f) => f.name === 'xl/worksheets/sheet1.xml')!;
  expect(new TextDecoder().decode(sheet.data)).toContain('<row r="4">');
});
