import { percentile, runSpeedTest } from '../lib/speedTest';
import { parseScanResult } from '../modules/scanner/src/parse';
import { coreJson } from '../test-utils/coreJson';

const mockScanPhoto = jest.fn();
const mockStats = jest.fn();

jest.mock('../modules/scanner', () => ({
  scanPhoto: (uri: string, options: object) => mockScanPhoto(uri, options),
  stats: () => mockStats(),
}));
jest.mock('../lib/samples', () => ({
  ...jest.requireActual('../lib/samples'),
  sampleUri: async (id: string) => `file:///samples/${id}.jpg`,
}));

test("percentile is numpy's default (linear between the two nearest)", () => {
  expect(percentile([1, 2, 3, 4], 90)).toBe(3.7);
  expect(percentile([3, 1, 2], 50)).toBe(2);
});

test('24 timed scans of the 8 samples; the first round is checked against what was written and the laptop', async () => {
  let call = 0;
  mockScanPhoto.mockImplementation(async (uri: string) => {
    call++;
    const id = /(inv_\d{4})\.jpg$/.exec(uri)?.[1] ?? '';
    const r = parseScanResult(coreJson(id, null));
    // the first scan of rounds 1 and 2 misreads one box; only round 1 counts
    const reads = call === 1 || call === 9 ? r.reads.map((b) => (b.name === 'invoice_no' ? { ...b, text: 'X' } : b)) : r.reads;
    return { ...r, reads, timing: { ...r.timing, totalMs: call * 10, readMs: call } };
  });
  mockStats.mockResolvedValue({ loadMs: 812, peakKb: 300 * 1024 + 400 });
  const progress: [number, number][] = [];

  const result = await runSpeedTest((done, total) => progress.push([done, total]));

  expect(mockScanPhoto).toHaveBeenCalledTimes(24);
  for (const [, options] of mockScanPhoto.mock.calls) expect(options).toEqual({ keepFiles: false });
  expect(mockScanPhoto.mock.calls[0][0]).toBe('file:///samples/inv_0001.jpg');
  expect(mockScanPhoto.mock.calls[7][0]).toBe('file:///samples/inv_0091.jpg');
  expect(mockScanPhoto.mock.calls[8][0]).toBe('file:///samples/inv_0001.jpg'); // round 2 starts over
  expect(progress).toEqual(Array.from({ length: 24 }, (_, i) => [i + 1, 24]));
  expect(result.medianMs).toBe(125); // totals 10, 20 … 240
  expect(result.p90Ms).toBeCloseTo(217);
  expect(result.readMedianMs).toBe(12.5);
  // The samples' fixtures read 217 of the 241 written boxes exactly, and all 243 the way the laptop did; the
  // misread in round 1 costs one of each.
  expect(result.exact).toEqual({ a: 216, b: 241 });
  expect(result.laptop).toEqual({ a: 242, b: 243 });
  expect(result.peakMb).toBe(300);
  expect(result.loadMs).toBe(812);
});
