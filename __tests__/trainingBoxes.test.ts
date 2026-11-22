import { boxValue } from '../lib/sale';
import { addScan, confirmBox, getScan, setEdit, type StoredScan } from '../lib/scans';
import { boxState, isMultiLine, PERSONAL, trainingBoxes, uncheckedBoxes } from '../lib/training/boxes';
import type { BoxRead, FormName, ScanResult } from '../modules/scanner';
import { parseScanResult } from '../modules/scanner/src/parse';
import { coreJson } from '../test-utils/coreJson';

jest.mock('expo-file-system', () => require('../test-utils/memoryFs').memoryFs.module);

// Each form's template, as the scanner reads it.
const TEMPLATES: Record<FormName, { fields: { name: string }[] }> = {
  sales_invoice: require('../modules/scanner/assets/scanner/field_map.json'),
  service_invoice: require('../modules/scanner/assets/scanner/service_invoice.json'),
  bir_2307: require('../modules/scanner/assets/scanner/bir_2307.json'),
};
const FORMS = Object.keys(TEMPLATES) as FormName[];
const CUSTOMER = ['customer_name', 'customer_tin', 'customer_address'];

/** A fixture's scan as the app keeps it, its result changed first when edit is given. */
function scanOf(stem: string, edit?: (r: ScanResult) => void): StoredScan {
  const result = parseScanResult(coreJson(stem));
  edit?.(result);
  return getScan(addScan({ label: 'A scan', source: 'gallery', result }))!;
}

const names = (reads: readonly BoxRead[]) => reads.map((r) => r.name);

test("the personal boxes are the templates' own", () => {
  expect(PERSONAL).toEqual({
    sales_invoice: new Set(CUSTOMER),
    service_invoice: new Set(CUSTOMER),
    bir_2307: new Set([
      'payee_tin',
      'payee_name',
      'payee_address',
      'payee_zip',
      'payor_tin',
      'payor_name',
      'payor_address',
      'payor_zip',
    ]),
  });
  for (const form of FORMS) {
    const fields = TEMPLATES[form].fields.map((f) => f.name);
    // a renamed field would leave its personal box out of the list
    expect(fields).toEqual(expect.arrayContaining([...PERSONAL[form]]));
    // and every name, TIN, address or ZIP box of the form is in it
    expect(fields.filter((n) => /_(name|tin|address|zip)$/.test(n) && !PERSONAL[form].has(n))).toEqual([]);
  }
});

test('multi-line boxes are left out', () => {
  const multiLine = (form: FormName) => TEMPLATES[form].fields.map((f) => f.name).filter((n) => isMultiLine(form, n));
  expect(multiLine('sales_invoice')).toEqual([]);
  // the address read as up to 2 lines, and the amount in words read with its second line (amount_words2)
  expect(multiLine('service_invoice')).toEqual(['customer_address', 'amount_words']);
  expect(multiLine('bir_2307')).toEqual([]);
  expect(isMultiLine('sales_invoice', 'amount_words')).toBe(false);

  const service = scanOf('svc_0000');
  expect(names(service.result.reads)).toContain('amount_words');
  expect(names(trainingBoxes(service))).not.toContain('amount_words');
  expect(names(trainingBoxes(scanOf('inv_0007')))).toContain('amount_words');
});

test('training boxes leave out personal, PDF-text and multi-line boxes', () => {
  const without = (scan: StoredScan, out: string[]) => names(scan.result.reads).filter((n) => !out.includes(n));

  const sale = scanOf('inv_0007');
  expect(names(trainingBoxes(sale))).toEqual(without(sale, CUSTOMER));
  const service = scanOf('svc_0000');
  expect(names(trainingBoxes(service))).toEqual(without(service, [...CUSTOMER, 'amount_words']));
  expect(names(trainingBoxes(scanOf('bir2307_photo_0')))).toEqual([
    'period_from',
    'period_to',
    'ewt1_payment',
    'ewt1_atc',
    'ewt1_m1',
    'ewt1_m2',
    'ewt1_m3',
    'ewt1_total',
    'ewt1_tax',
    'ewt_total_m1',
    'ewt_total_m2',
    'ewt_total_m3',
    'ewt_total_total',
    'ewt_total_tax',
  ]);

  // a box from a PDF's own text wasn't read by the model: only the one read from the rendered page is left
  expect(trainingBoxes(scanOf('sales_text_0'))).toEqual([]);
  const fromPage = scanOf('sales_text_0', (r) => {
    r.reads.find((b) => b.name === 'date')!.fromText = false;
  });
  expect(names(trainingBoxes(fromPage))).toEqual(['date']);
  expect(trainingBoxes(scanOf('bir2307_text_0'))).toEqual([]);

  expect(trainingBoxes(scanOf('blank_page'))).toEqual([]); // no form
});

test("a box's state follows the last change", () => {
  const fresh = () =>
    addScan({ label: 'Camera photo', source: 'camera', result: parseScanResult(coreJson('inv_0007')) });
  const state = (id: string) => boxState(getScan(id)!, 'date');
  const reading = 'Sep 20, 2026'; // the date box's own reading

  let id = fresh();
  expect(state(id)).toBe('unchecked');
  confirmBox(id, 'date');
  expect(state(id)).toBe('confirmed');

  id = fresh();
  confirmBox(id, 'date');
  setEdit(id, 'date', '9/20/2026');
  expect(state(id)).toBe('corrected');

  id = fresh();
  setEdit(id, 'date', '9/20/2026');
  setEdit(id, 'date', reading); // the edit taken back
  expect(state(id)).toBe('unchecked');

  id = fresh();
  setEdit(id, 'date', ''); // cleared: the box says nothing
  expect(state(id)).toBe('corrected');
  expect(boxValue(getScan(id)!, 'date')).toBe('');

  id = fresh();
  confirmBox(id, 'date');
  setEdit(id, 'date', '9/20/2026');
  setEdit(id, 'date', reading);
  expect(state(id)).toBe('unchecked');

  id = fresh();
  confirmBox(id, 'date');
  setEdit(id, 'date', reading); // its own reading saved untouched: no edit before or after, so nothing changed
  expect(state(id)).toBe('confirmed');

  // what's left to check: the training boxes neither confirmed nor corrected
  id = fresh();
  const all = names(trainingBoxes(getScan(id)!));
  expect(uncheckedBoxes(getScan(id)!)).toEqual(all);
  confirmBox(id, 'date');
  setEdit(id, 'total_due', '24,877');
  setEdit(id, 'customer_name', 'Torres Construction Supply'); // a personal box: never one to check
  expect(uncheckedBoxes(getScan(id)!)).toEqual(all.filter((n) => n !== 'date' && n !== 'total_due'));
});
