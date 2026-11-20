import { decodeCsv, parseCsv } from '../lib/csv';

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

/** A string's bytes as Windows-1252 writes them, for the characters it shares with Latin-1. */
const latin1 = (s: string) => Uint8Array.from(Array.from(s, (c) => c.charCodeAt(0)));

test("a file's bytes: UTF-8 as written, else Windows-1252 (Excel's plain CSV)", () => {
  const utf8 = new TextEncoder().encode('Code,Registered name\r\nC1,Parañaque Hardware\r\n');
  expect(decodeCsv(Uint8Array.from([0xef, 0xbb, 0xbf, ...utf8]))).toBe(
    String.fromCharCode(0xfeff) + 'Code,Registered name\r\nC1,Parañaque Hardware\r\n',
  );
  expect(decodeCsv(latin1('C1,Parañaque Hardware,Niño Santos\r\n'))).toBe('C1,Parañaque Hardware,Niño Santos\r\n');
  // Windows-1252's own characters in 0x80-0x9F: the euro sign, curly quotes, the dagger of MyBizMate's headers
  expect(decodeCsv(Uint8Array.from([0x80, 0x93, 0x41, 0x94, 0x86]))).toBe(
    String.fromCharCode(0x20ac, 0x201c, 0x41, 0x201d, 0x2020),
  );
  expect(decodeCsv(new TextEncoder().encode('Sub-street †,Street †'))).toBe('Sub-street †,Street †');
  expect(decodeCsv(new Uint8Array())).toBe('');
});

test('bytes that only look like UTF-8 at first are read as Windows-1252', () => {
  // 0xC3 0xB1 is ñ in UTF-8; a lone 0xC3 before a space is not UTF-8, so the whole file is Windows-1252
  expect(decodeCsv(Uint8Array.from([0x41, 0xc3, 0xb1, 0x20, 0xc3, 0x20]))).toBe('A' + String.fromCharCode(0xc3, 0xb1) + ' ' + String.fromCharCode(0xc3) + ' ');
  // an overlong encoding and a surrogate are not UTF-8 either
  expect(decodeCsv(Uint8Array.from([0xc0, 0xaf]))).toBe(String.fromCharCode(0xc0, 0xaf));
  expect(decodeCsv(Uint8Array.from([0xed, 0xa0, 0x80]))).toBe(String.fromCharCode(0xed, 0xa0, 0x20ac));
});
