import { memoryFs } from '../test-utils/memoryFs';

jest.mock('expo-file-system', () => require('../test-utils/memoryFs').memoryFs.module);

// The made-up lists (fixtures/lists, written by prototype/benchmark/export_check_fixtures.py): CSV UTF-8 as Excel
// saves it, in MyBizMate's Parties import columns, with contact numbers and emails to leave out.
const fs = require('fs');
const PARTIES: string = fs.readFileSync('fixtures/lists/parties.csv', 'utf8');
const ITEMS: string = fs.readFileSync('fixtures/lists/items.csv', 'utf8');

const L = (): typeof import('../lib/lists') => require('../lib/lists');

beforeEach(() => {
  memoryFs.reset();
  jest.resetModules();
});

test("imports MyBizMate's parties columns", async () => {
  const { importPartiesCsv, lists, customersOf, partyName, exportName } = L();
  expect(await importPartiesCsv(PARTIES, 'customer')).toEqual({
    added: 22,
    updated: 0,
    skipped: 1,
    customers: 21,
    suppliers: 2,
  });
  expect(customersOf(lists())[0]).toMatchObject({
    code: 'C001',
    type: 'customer',
    entity: 'company',
    registeredName: 'Sample Company',
    tin: '123-456-789-00000',
    terms: 'cash',
    vatStatus: 'vat',
    fromScan: false,
    exportedAt: null,
  });
  const b001 = lists().parties.find((p) => p.code === 'B001')!;
  expect(b001).toMatchObject({ type: 'both', entity: 'individual', tradeName: "Maria's Store" });
  expect(partyName(b001)).toBe('Maria Santos Reyes');
  expect(exportName(b001)).toBe('Reyes, Maria Santos');
});

test('never keeps contact numbers or emails', async () => {
  const { importPartiesCsv, lists } = L();
  await importPartiesCsv(PARTIES, 'customer');
  expect(String(memoryFs.files.get('file:///docs/lists.json'))).not.toMatch(/example\.com|0917/);
  expect(JSON.stringify(lists())).not.toMatch(/example\.com|0917/);
});

test('the same code updates; the same TIN and name update; anything else is added', async () => {
  const { importPartiesCsv, lists } = L();
  await importPartiesCsv(PARTIES, 'customer');
  const before = lists().parties.length;
  const c001 = lists().parties.find((p) => p.code === 'C001')!;
  const summary = await importPartiesCsv(
    'Code,Registered name,TIN\r\n' +
      'c001,Renamed Co,123-456-789-00000\r\n' +
      ',Isabela Wholesale Trading,900-000-001-00000\r\n' +
      ',Brand New Store,900-000-009-00000\r\n',
    'customer',
  );
  expect(summary).toMatchObject({ added: 1, updated: 2, skipped: 0 });
  expect(lists().parties).toHaveLength(before + 1);
  const renamed = lists().parties.find((p) => p.id === c001.id)!;
  expect(renamed).toMatchObject({ registeredName: 'Renamed Co', code: 'C001', terms: 'cash' }); // blank keeps the party's
  expect(lists().parties.find((p) => p.code === 'S001')).toMatchObject({ type: 'supplier' }); // a blank type keeps it
});

test('a row without a name is skipped', async () => {
  const { importPartiesCsv, lists } = L();
  expect(await importPartiesCsv('Code,Type,Registered name\r\nX1,Customer,\r\n', 'customer')).toMatchObject({
    added: 0,
    skipped: 1,
  });
  expect(lists().parties).toHaveLength(0);
});

test('no name column: no_columns', async () => {
  const { importPartiesCsv, importItemsCsv } = L();
  await expect(importPartiesCsv('A,B\n1,2', 'customer')).rejects.toMatchObject({ code: 'no_columns' });
  await expect(importItemsCsv('Unit\npc')).rejects.toMatchObject({ code: 'no_columns' });
});

test('items: name, unit and price', async () => {
  const { importItemsCsv, lists } = L();
  expect(await importItemsCsv(ITEMS)).toMatchObject({ added: 18, updated: 0, skipped: 0 });
  expect(lists().items.find((i) => i.name === 'Rice 25kg')).toMatchObject({ unit: 'sack', price: 1350 });
});

test('packFor: the customers and the both parties, with their trade names', async () => {
  const { importPartiesCsv, importItemsCsv, lists, packFor } = L();
  await importPartiesCsv(PARTIES, 'customer');
  await importItemsCsv(ITEMS);
  const pack = packFor(lists());
  expect(pack.customers).toHaveLength(21);
  expect(pack.customers.find((c) => c.name === 'Maria Santos Reyes')).toMatchObject({
    tin: '900-000-002-00000',
    names: ["Maria's Store"],
  });
  expect(pack.customers[0].names).toBeUndefined();
  expect(pack.items.find((i) => i.description === 'Rice 25kg')).toMatchObject({ unit: 'sack', price: 1350 });
});

test('clearing customers keeps the suppliers, and a both party becomes a supplier', async () => {
  const { importPartiesCsv, clearParties, lists, customersOf, suppliersOf } = L();
  await importPartiesCsv(PARTIES, 'customer');
  await clearParties('customer');
  expect(customersOf(lists())).toHaveLength(0);
  expect(suppliersOf(lists()).map((p) => [p.code, p.type])).toEqual([
    ['S001', 'supplier'],
    ['B001', 'supplier'],
  ]);
});

test('formatTin', () => {
  const { formatTin } = L();
  expect(formatTin('123456789')).toBe('123-456-789');
  expect(formatTin('123456789000')).toBe('123-456-789-000');
  expect(formatTin('12345678900000')).toBe('123-456-789-00000');
  expect(formatTin('1234567890000')).toBe('123-456-789-0000'); // a 4-digit branch, as MyBizMate prints it
  expect(formatTin('12345')).toBe('12345');
  expect(formatTin('12345678900')).toBe('12345678900'); // 11 digits: no TIN's length
  expect(formatTin('123456789000000')).toBe('123456789000000'); // 15
});

test('adding a party or an item from a scan', async () => {
  const { addParty, addItem, lists } = L();
  const party = await addParty({
    code: '',
    type: 'customer',
    entity: 'company',
    registeredName: 'Bagong Tindahan',
    lastName: '',
    firstName: '',
    middleName: '',
    tradeName: '',
    tin: '900-000-003',
    address: 'Purok 2, San Mateo',
    vatStatus: '',
    terms: '',
    fromScan: true,
  });
  await addItem({ name: 'Eggs', unit: 'tray', price: 260 });
  expect(lists().parties).toEqual([{ ...party, exportedAt: null }]);
  expect(lists().items).toMatchObject([{ name: 'Eggs', unit: 'tray', price: 260 }]);
});

test('the lists survive a restart', async () => {
  await L().importItemsCsv(ITEMS);
  jest.resetModules();
  const again = L();
  expect(again.lists().items).toHaveLength(0);
  await again.loadLists();
  expect(again.lists().items).toHaveLength(18);
});
