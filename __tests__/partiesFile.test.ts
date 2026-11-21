import { writePartiesExport } from '../lib/exportFile';
import { PARTIES_COLUMNS, partiesTin, partyRow } from '../lib/exportRows';
import { addParty, clearParties, importPartiesCsv, lists, markPartiesExported, newParties } from '../lib/lists';
import { memoryFs } from '../test-utils/memoryFs';
import { party } from '../test-utils/packLists';
import { unzipStored } from '../test-utils/unzip';

jest.mock('expo-file-system', () => require('../test-utils/memoryFs').memoryFs.module);

const FROM_SCAN = {
  code: '',
  type: 'customer',
  entity: 'company',
  lastName: '',
  firstName: '',
  middleName: '',
  tradeName: '',
  address: '',
  vatStatus: '',
  terms: '',
  fromScan: true,
} as const;

beforeEach(async () => {
  memoryFs.reset();
  await clearParties('customer');
  await clearParties('supplier');
});

test("the headers are the template's", () => {
  expect(PARTIES_COLUMNS).toEqual([
    'Code', 'Type *', 'Entity type', 'Registered name', 'Last name', 'First name', 'Middle name', 'Trade name', 'TIN *',
    'RDO', 'Sub-street †', 'Street †', 'Barangay †', 'City / Municipality *', 'Province *', 'ZIP *', 'Contact number',
    'Email', 'VAT status', 'Payment terms', 'Authorized representative', 'Representative title', 'Representative TIN',
    'Trade type', 'Default branch',
  ]);
  expect(PARTIES_COLUMNS).toHaveLength(25);
});

test('partiesTin', () => {
  expect(partiesTin('123456789')).toBe('123-456-789-00000');
  expect(partiesTin('123-456-789-000')).toBe('123-456-789-00000');
  expect(partiesTin('12345678900001')).toBe('123-456-789-00001');
  expect(partiesTin('1234567890001')).toBe('123-456-789-00001'); // a 4-digit branch, as MyBizMate prints it
  expect(partiesTin('123-456-789-0000')).toBe('123-456-789-00000');
  expect(partiesTin('1234')).toBe('');
  expect(partiesTin('12345678900')).toBe(''); // 11 digits: no TIN's length
  expect(partiesTin('123456789000000')).toBe(''); // 15
  expect(partiesTin('')).toBe('');
});

test('a company added from a scan', () => {
  expect(
    partyRow(
      party({ id: 'x', registeredName: 'Bagong Tindahan', tin: '900-000-003', address: 'Purok 2, San Mateo', fromScan: true }),
    ),
  ).toEqual({
    'Type *': 'Customer',
    'Entity type': 'Company',
    'Registered name': 'Bagong Tindahan',
    'TIN *': '900-000-003-00000',
    'Street †': 'Purok 2, San Mateo',
  });
});

test('an individual who is both', () => {
  expect(
    partyRow(
      party({
        id: 'y',
        registeredName: '',
        type: 'both',
        entity: 'individual',
        lastName: 'Reyes',
        firstName: 'Maria',
        middleName: 'Santos',
        tradeName: "Maria's Store",
        vatStatus: 'nonvat',
        terms: 'account',
      }),
    ),
  ).toEqual({
    'Type *': 'Customer and Supplier',
    'Entity type': 'Individual',
    'Last name': 'Reyes',
    'First name': 'Maria',
    'Middle name': 'Santos',
    'Trade name': "Maria's Store",
    'VAT status': 'Not VAT-registered',
    'Payment terms': 'On Account',
  });
});

test('newParties: added from scans, with no code; those already sent only when asked', async () => {
  const a = await addParty({ ...FROM_SCAN, registeredName: 'Store A', tin: '' });
  const b = await addParty({ ...FROM_SCAN, registeredName: 'Store B', tin: '' });
  await addParty({ ...FROM_SCAN, registeredName: 'Has A Code', code: 'C77', tin: '' });
  await importPartiesCsv('Registered name,TIN\r\nFrom A File,900-000-008-00000\r\n', 'customer');
  await markPartiesExported([b.id], new Date(2026, 10, 19));
  expect(newParties(lists(), false).map((p) => p.id)).toEqual([a.id]);
  expect(newParties(lists(), true).map((p) => p.id)).toEqual([a.id, b.id]);
  expect(lists().parties.find((p) => p.id === b.id)!.exportedAt).not.toBeNull();
});

test('writePartiesExport', async () => {
  const p = await addParty({ ...FROM_SCAN, registeredName: 'Bagong Tindahan', tin: '900-000-003' });
  const uri = await writePartiesExport([p], new Date(2026, 10, 20, 9));
  expect(uri).toBe('file:///cache/exports/MyBizMate Parties import 2026-11-20.xlsx');
  const sheet = new TextDecoder().decode(
    unzipStored(memoryFs.files.get(uri) as Uint8Array).find((f) => f.name === 'xl/worksheets/sheet1.xml')!.data,
  );
  const row1 = /<row r="1">(.*?)<\/row>/.exec(sheet)![1];
  expect([...row1.matchAll(/<t xml:space="preserve">(.*?)<\/t>/g)].map((m) => m[1])).toEqual(PARTIES_COLUMNS);
  expect(sheet).toContain('<t xml:space="preserve">Bagong Tindahan</t>');
  expect(sheet).toContain('<t xml:space="preserve">900-000-003-00000</t>');
});

test("MyBizMate's own list brings the code", async () => {
  const p = await addParty({ ...FROM_SCAN, registeredName: 'Bagong Tindahan', tin: '900-000-003-00000' });
  await importPartiesCsv('Code,Type,Registered name,TIN\r\nC900,Customer,Bagong Tindahan,900-000-003-00000\r\n', 'customer');
  expect(lists().parties.find((x) => x.id === p.id)).toMatchObject({ code: 'C900', fromScan: false });
  expect(newParties(lists(), true)).toEqual([]);
});
