import { SALES_COLUMNS } from '../lib/exportRows';
import { columnLetter, workbook } from '../lib/xlsx';
import { unzipStored } from '../test-utils/unzip';

const part = (zip: Uint8Array, name: string) => new TextDecoder().decode(unzipStored(zip).find((f) => f.name === name)!.data);

test('columnLetter', () => {
  expect([0, 1, 25, 26, 27, 51, 52].map(columnLetter)).toEqual(['A', 'B', 'Z', 'AA', 'AB', 'AZ', 'BA']);
});

test("the workbook: the template's header row, then the rows", () => {
  const bell = String.fromCharCode(7);
  const zip = workbook(
    'Import',
    SALES_COLUMNS,
    [{ 'Date *': '2026-10-21', 'Customer *': "Tom & Jerry's <Store>", 'Gross *': 1575, Description: `a${bell}b` }],
    new Date(2026, 10, 20),
  );
  expect(unzipStored(zip).map((f) => f.name)).toEqual([
    '[Content_Types].xml',
    '_rels/.rels',
    'xl/workbook.xml',
    'xl/_rels/workbook.xml.rels',
    'xl/worksheets/sheet1.xml',
  ]);
  expect(part(zip, 'xl/workbook.xml')).toContain('<sheet name="Import" sheetId="1" r:id="rId1"/>');
  const sheet = part(zip, 'xl/worksheets/sheet1.xml');
  const row1 = /<row r="1">(.*?)<\/row>/.exec(sheet)![1];
  const headers = [...row1.matchAll(/<c r="([A-Z]+)1" t="inlineStr"><is><t xml:space="preserve">(.*?)<\/t><\/is><\/c>/g)];
  expect(headers).toHaveLength(27);
  expect(headers.map((m) => m[1])).toEqual(SALES_COLUMNS.map((_, i) => columnLetter(i)));
  expect(headers[26][1]).toBe('AA');
  expect(headers.map((m) => m[2].replace(/&apos;/g, "'"))).toEqual(SALES_COLUMNS);
  expect(sheet).toContain('<c r="A2" t="inlineStr"><is><t xml:space="preserve">2026-10-21</t></is></c>');
  expect(sheet).toContain('<c r="C2"><v>1575</v></c>');
  expect(sheet).toContain('<t xml:space="preserve">Tom &amp; Jerry&apos;s &lt;Store&gt;</t>');
  expect(sheet).toContain('<t xml:space="preserve">ab</t>');
  expect(sheet).not.toContain('r="D2"'); // a blank cell isn't written
});
