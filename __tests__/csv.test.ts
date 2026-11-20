import { parseCsv } from '../lib/csv';

const BOM = String.fromCharCode(0xfeff);

test('parses what Excel writes', () => {
  expect(parseCsv(`${BOM}Name,Price\r\n"Rice, 25kg","1,350.00"\r\n\r\n"Say ""hi""",5\r\n`)).toEqual([
    ['Name', 'Price'],
    ['Rice, 25kg', '1,350.00'],
    ['Say "hi"', '5'],
  ]);
  expect(parseCsv('a,b\n"x\ny",z')).toEqual([
    ['a', 'b'],
    ['x\ny', 'z'],
  ]);
});

test('empty fields, CR line ends and a missing last line end', () => {
  expect(parseCsv('a,,c\rd,e,')).toEqual([
    ['a', '', 'c'],
    ['d', 'e', ''],
  ]);
  expect(parseCsv(',,\r\n')).toEqual([]);
});
