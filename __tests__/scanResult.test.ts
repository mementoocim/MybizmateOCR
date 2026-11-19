import { parseScanResult } from '../modules/scanner/src/parse';

// The core's JSON for a fixture: the Python's expected result plus the files and timing the core adds.
function coreJson(expected: any, dir = '/data/x'): string {
  return JSON.stringify({
    ...expected,
    reads: expected.reads.map((r: any) => ({ ...r, cropFile: `${dir}/${r.name}.png` })),
    pageFile: expected.aligned ? `${dir}/page.jpg` : null,
    timing: { alignMs: 0, cropMs: 0, readMs: 0, totalMs: 0 },
  });
}

test('parses a read scan', () => {
  const r = parseScanResult(coreJson(require('../fixtures/core/expected/inv_0007.json')));
  expect(r.aligned).toBe(true);
  expect(r.form).toBe('sales_invoice');
  expect(r.reads).toHaveLength(45);
  expect(r.reads[0].name).toBe('invoice_no');
  expect(r.reads[0].text).toBe('0007655');
  expect(r.reads[0].cropUri).toBe('file:///data/x/invoice_no.png');
  expect(r.pageUri).toBe('file:///data/x/page.jpg');
});

test('parses a scan that found no form', () => {
  const r = parseScanResult(coreJson(require('../fixtures/core/expected/blank_page.json')));
  expect(r.aligned).toBe(false);
  expect(r.form).toBeNull();
  expect(r.reads).toEqual([]);
  expect(r.pageUri).toBeNull();
});
