import { parseScanResult } from '../modules/scanner/src/parse';
import { coreJson } from '../test-utils/coreJson';

test('parses a read scan', () => {
  const r = parseScanResult(coreJson('inv_0007'));
  expect(r.aligned).toBe(true);
  expect(r.form).toBe('sales_invoice');
  expect(r.reads).toHaveLength(45);
  expect(r.reads[0].name).toBe('invoice_no');
  expect(r.reads[0].text).toBe('0007655');
  expect(r.reads[0].cropUri).toBe('file:///data/x/invoice_no.png');
  expect(r.pageUri).toBe('file:///data/x/page.jpg');
});

test('parses a scan that found no form', () => {
  const r = parseScanResult(coreJson('blank_page'));
  expect(r.aligned).toBe(false);
  expect(r.form).toBeNull();
  expect(r.reads).toEqual([]);
  expect(r.pageUri).toBeNull();
});
