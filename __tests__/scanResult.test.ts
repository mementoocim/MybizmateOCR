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

test('a PDF result parses', () => {
  // a text PDF: every box from the PDF's own text
  const text = parseScanResult(coreJson('bir2307_text_0'));
  expect(text).toMatchObject({ aligned: true, form: 'bir_2307', source: 'pdf', pageCount: 1, picture: false });
  expect(text.reads).toHaveLength(28);
  expect(text.reads.every((b) => b.fromText && b.conf === 1 && b.alts.length === 0)).toBe(true);
  expect(text.reads.find((b) => b.name === 'period_from')).toMatchObject({ type: 'digits', text: '01012026' });
  expect(text.reads.find((b) => b.name === 'ewt1_atc')).toMatchObject({
    type: 'code',
    text: 'WC610',
    cropUri: 'file:///data/x/ewt1_atc.png',
  });
  expect(parseScanResult(coreJson('two_pages')).pageCount).toBe(2);

  // a picture PDF (a scan): read like a photo
  const picture = parseScanResult(coreJson('bir2307_picture_1'));
  expect(picture).toMatchObject({ form: 'bir_2307', source: 'pdf', pageCount: 1, picture: true });
  expect(picture.reads.some((b) => b.fromText)).toBe(false);

  // photos: a 2307's, and an invoice's as the core gives it now and as a JSON from before PDFs (no source, pageCount,
  // picture or fromText)
  const photo2307 = parseScanResult(coreJson('bir2307_photo_0'));
  expect(photo2307).toMatchObject({ form: 'bir_2307', source: 'photo', pageCount: null, picture: null });
  expect(photo2307.reads.some((b) => b.fromText)).toBe(false);
  const photo = JSON.parse(coreJson('inv_0007'));
  expect(parseScanResult(JSON.stringify(photo))).toMatchObject({ source: 'photo', pageCount: null, picture: null });
  delete photo.source;
  delete photo.pageCount;
  delete photo.picture;
  for (const b of photo.reads) delete b.fromText;
  const old = parseScanResult(JSON.stringify(photo));
  expect(old).toMatchObject({ form: 'sales_invoice', source: 'photo', pageCount: null, picture: null });
  expect(old.reads).toHaveLength(45);
  expect(old.reads.every((b) => b.fromText === false)).toBe(true);
});
