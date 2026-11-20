// Reads a stored (uncompressed) zip for the tests, with its own CRC-32 (bit by bit, apart from lib/zip's table), so a
// test of the app's zip writer doesn't check it against itself.

function crcBitwise(data: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of data) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

export type ZipEntry = { name: string; data: Uint8Array; crcOk: boolean };

/** The entries, from the local headers; each one's CRC checked. Also checks the end record and central directory. */
export function unzipStored(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  const out: ZipEntry[] = [];
  let p = 0;
  while (p + 4 <= bytes.length && view.getUint32(p, true) === 0x04034b50) {
    const method = view.getUint16(p + 8, true);
    const crc = view.getUint32(p + 14, true);
    const size = view.getUint32(p + 18, true);
    const nameLength = view.getUint16(p + 26, true);
    const extraLength = view.getUint16(p + 28, true);
    const name = decoder.decode(bytes.subarray(p + 30, p + 30 + nameLength));
    const start = p + 30 + nameLength + extraLength;
    const data = bytes.slice(start, start + size);
    out.push({ name, data, crcOk: method === 0 && crcBitwise(data) === crc });
    p = start + size;
  }
  const end = bytes.length - 22;
  if (view.getUint32(end, true) !== 0x06054b50) throw new Error('no end record');
  if (view.getUint16(end + 10, true) !== out.length) throw new Error('the end record counts other entries');
  const central = view.getUint32(end + 16, true);
  if (central !== p || view.getUint32(central, true) !== 0x02014b50) throw new Error('the central directory is elsewhere');
  return out;
}
