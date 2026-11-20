import { crc32, zipStored } from '../lib/zip';
import { unzipStored } from '../test-utils/unzip';

const encoder = new TextEncoder();

test('crc32', () => {
  expect(crc32(encoder.encode('123456789'))).toBe(0xcbf43926);
  expect(crc32(new Uint8Array())).toBe(0);
});

test('a stored zip reads back: names, bytes and CRCs', () => {
  const files = [
    { name: 'a.txt', data: encoder.encode('hello') },
    { name: 'xl/año.xml', data: encoder.encode('<x/>') },
    { name: 'empty', data: new Uint8Array() },
  ];
  const back = unzipStored(zipStored(files, new Date(2026, 10, 20, 14, 41, 30)));
  expect(back.map((f) => f.name)).toEqual(['a.txt', 'xl/año.xml', 'empty']);
  expect(back.map((f) => new TextDecoder().decode(f.data))).toEqual(['hello', '<x/>', '']);
  expect(back.every((f) => f.crcOk)).toBe(true);
});
