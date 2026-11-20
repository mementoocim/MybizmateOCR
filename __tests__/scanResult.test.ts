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

test('parses a Service Invoice scan, with its files and photo checks', () => {
  const r = parseScanResult(coreJson('svc_0000'));
  expect(r.form).toBe('service_invoice');
  expect(r.darkMax).toBe(50);
  expect(r.sharpMin).toBe(0.5);
  expect(r.originalUri).toBe('file:///data/x/original.jpg');
  expect(r.scanDir).toBe('file:///data/x');
  expect(r.reads.find((b) => b.name === 'amount_words2')).toBeUndefined();
});

test('parses a scan that kept no files', () => {
  const r = parseScanResult(coreJson('inv_0007', null));
  expect(r.aligned).toBe(true);
  expect(r.pageUri).toBeNull();
  expect(r.originalUri).toBeNull();
  expect(r.scanDir).toBeNull();
  expect(r.reads[0].cropUri).toBeNull();
});

test('parses a scan that found no form', () => {
  const r = parseScanResult(coreJson('blank_page'));
  expect(r.aligned).toBe(false);
  expect(r.form).toBeNull();
  expect(r.reads).toEqual([]);
  expect(r.pageUri).toBeNull();
});
