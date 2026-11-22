import { finalize, type Pack } from '../lib/checks/finalize';
import { clearParties, importPartiesCsv, type Lists, lists } from '../lib/lists';
import { rawFromScan, saleOf } from '../lib/sale';
import { addScan, getScan } from '../lib/scans';
import type { Settings } from '../lib/settings';
import { parseScanResult } from '../modules/scanner/src/parse';
import { coreJson } from '../test-utils/coreJson';

jest.mock('expo-file-system', () => require('../test-utils/memoryFs').memoryFs.module);

// A business's lists can be long: Home checks each of its recent scans, and every box fixed runs the checks again,
// on the phone's JavaScript thread. Made-up names. The limits are this laptop's with room to spare: one check against
// 3,000 customers and 1,000 items took 2.5 s before the matcher was made fast, and 0.1 s after (0.3 s while the other
// suites run beside it).

const WORDS = ['Santos', 'Reyes', 'Cruz', 'Garcia', 'Mendoza', 'Torres', 'Flores', 'Ramos', 'Aquino', 'Bautista'];
const KINDS = ['Hardware', 'Trading', 'Enterprises', 'General Merchandise', 'Sari-Sari Store', 'Grocery', 'Pharmacy'];
const GOODS = ['Rice 25kg', 'Sugar 1kg', 'Cement 40kg', 'Nails 2in', 'Plywood 1/4', 'Coke 1.5L', 'Bear Brand 300g'];

function bigPack(customers: number, items: number): Pack {
  return {
    customers: Array.from({ length: customers }, (_, i) => ({
      id: `c${i}`,
      name: `${WORDS[i % WORDS.length]} ${KINDS[(i * 7 + 3) % KINDS.length]} ${i}`,
      tin: String(100000000 + i * 7919).slice(0, 9),
    })),
    items: Array.from({ length: items }, (_, i) => ({
      id: `i${i}`,
      description: `${GOODS[i % GOODS.length]} v${i}`,
      unit: 'pc',
      price: 10 + i,
    })),
  };
}

const SETTINGS: Settings = {
  vatRegistered: true,
  revenueAccount: '',
  expenseAccount: '',
  atc: '',
  offsetAccount: '',
  annotation: false,
  clientCode: '',
  writerCode: '',
};
const scanOf = (stem: string) =>
  getScan(addScan({ label: stem, source: 'sample', sampleId: stem, result: parseScanResult(coreJson(stem)) }))!;

function msOf(run: () => void): number {
  run(); // warm up
  const t0 = performance.now();
  run();
  return performance.now() - t0;
}

const BIG = bigPack(3000, 1000);

test.each(['inv_0051', 'svc_0000'])('checking %s against 3,000 customers and 1,000 items takes a moment', (stem) => {
  const raw = rawFromScan(scanOf(stem));
  expect(msOf(() => finalize(raw, BIG, '2026-11-18'))).toBeLessThan(750);
});

test('the checks run once for a scan as it stands, however many screens show it', () => {
  const scan = scanOf('inv_0007');
  const l: Lists = { parties: [], items: [], version: 1 };
  expect(saleOf(scan, l, SETTINGS)).toBe(saleOf(scan, l, SETTINGS));
  // a change to the scan, the lists or the settings runs them again
  expect(saleOf({ ...scan }, l, SETTINGS)).not.toBe(saleOf(scan, l, SETTINGS));
  expect(saleOf(scan, { ...l, version: 2 }, SETTINGS)).not.toBe(saleOf(scan, l, SETTINGS));
});

test('importing 5,000 parties takes a moment, not seconds', async () => {
  await clearParties('customer');
  await clearParties('supplier');
  const rows = Array.from({ length: 5000 }, (_, i) => `C${i},Customer,${WORDS[i % 10]} Store ${i},${100000000 + i}-00000`);
  const csv = ['Code,Type,Registered name,TIN', ...rows].join('\r\n');
  const t0 = performance.now();
  await importPartiesCsv(csv, 'customer');
  const firstMs = performance.now() - t0;
  const t1 = performance.now();
  const again = await importPartiesCsv(csv, 'customer'); // every row updates its party, found by its code
  const againMs = performance.now() - t1;
  expect(again).toMatchObject({ added: 0, updated: 5000 });
  expect(lists().parties).toHaveLength(5000);
  expect([firstMs < 1000, againMs < 1000]).toEqual([true, true]);
});
