import { act, renderHook } from '@testing-library/react-native';
import { useSyncExternalStore } from 'react';

import { certOf, is2307 } from '../lib/cert';
import { blockWords, saveBlock } from '../lib/exportRows';
import { addParty, clearItems, clearParties, lists } from '../lib/lists';
import { isInvoice, saleOf } from '../lib/sale';
import { savedSummary, saveScan } from '../lib/saved';
import {
  addScan,
  confirmBox,
  getScan,
  type ScanSource,
  setEdit,
  type StoredScan,
  subscribeRecent,
  updateScan,
} from '../lib/scans';
import { homeBadge, savedStateOf, type ScanState, scanStateOf, useScanCheck } from '../lib/scanState';
import { settings, updateSettings } from '../lib/settings';
import { uncheckedBoxes } from '../lib/training/boxes';
import type { ScanResult } from '../modules/scanner';
import { parseScanResult } from '../modules/scanner/src/parse';
import { coreJson } from '../test-utils/coreJson';
import { memoryFs } from '../test-utils/memoryFs';
import { pinToday } from '../test-utils/today';

// Design B §9.5 and §9.2: a scan's one state, which the status strip and Home's badge both show: its form not found,
// things to check (first, as today's card), what it still needs before it can be saved, or checks passed. And, once
// saved, whether it has changed since: its import rows, or, in annotation mode, any box's edit or check.

let mockTeam = false;
jest.mock('expo-file-system', () => require('../test-utils/memoryFs').memoryFs.module);
jest.mock('../lib/build', () => ({
  get TEAM_BUILD() {
    return mockTeam;
  },
}));

const DETAILS = { taxType: 'VAT', account: '4010', terms: 'account', atc: 'WC158' } as const;
const TAG = { client: 'C014', writer: 'W03' };

/**
 * A fixture's scan: a sample by default, checked as of the samples' day; any other source as of today, which is
 * pinned. edit changes what the scanner read; change, what the person did since.
 */
function scanOf(
  stem: string,
  opts: { source?: ScanSource; edit?: (r: ScanResult) => ScanResult; change?: Parameters<typeof updateScan>[1] } = {},
): StoredScan {
  const read = parseScanResult(coreJson(stem));
  const id = addScan({ label: 'A scan', source: opts.source ?? 'sample', result: opts.edit ? opts.edit(read) : read });
  if (opts.change) updateScan(id, opts.change);
  return getScan(id)!;
}

/** The scan's checks as its screen runs them: an invoice's sale, a 2307's certificate, or none. */
const checksOf = (scan: StoredScan) =>
  isInvoice(scan) ? saleOf(scan, lists(), settings()) : is2307(scan) ? certOf(scan, lists(), settings()) : null;

/** Sample 0007's customer, Torres Construction Supply, isn't this one. */
const OTHER_CUSTOMER = {
  code: 'C020',
  type: 'customer',
  entity: 'company',
  registeredName: 'Santos Merchandising',
  lastName: '',
  firstName: '',
  middleName: '',
  tradeName: '',
  tin: '',
  address: '',
  vatStatus: '',
  terms: '',
  fromScan: false,
} as const;

beforeAll(() => pinToday(new Date(2026, 10, 18, 10, 0)));
afterAll(() => jest.useRealTimers());

beforeEach(async () => {
  memoryFs.reset();
  mockTeam = false;
  await updateSettings({ annotation: false });
  await clearParties('customer');
  await clearParties('supplier');
  await clearItems();
});

test('a result with no form is not_found', () => {
  const blank = scanOf('blank_page', { source: 'camera' });
  expect(checksOf(blank)).toBeNull();
  expect(scanStateOf(blank, null, false)).toEqual({ kind: 'not_found' });
  expect(scanStateOf(blank, null, true)).toEqual({ kind: 'not_found' });
  // and a form found but not checked is no state to show either
  expect(scanStateOf(scanOf('inv_0007', { source: 'camera' }), null, false)).toEqual({ kind: 'not_found' });
});

test('problems come first: to_check with the problem words', () => {
  // A purchase with no supplier chosen yet: a thing to check, and something it needs before it can be saved.
  const scan = scanOf('inv_0007', { source: 'camera', change: { kind: 'purchase' } });
  const sale = saleOf(scan, lists(), settings());
  expect(sale.problems).toEqual(['Supplier (choose one)']);
  expect(saveBlock(scan, sale)).toBe('no_supplier');
  expect(scanStateOf(scan, sale, false)).toEqual({ kind: 'to_check', problems: sale.problems });
  // annotation mode's boxes not checked yet come after the problems too
  expect(uncheckedBoxes(scan).length).toBeGreaterThan(0);
  expect(scanStateOf(scan, sale, true)).toEqual({ kind: 'to_check', problems: sale.problems });

  // A 2307 whose row 1 months no longer add up, nor the total row's first month.
  const cert2307 = scanOf('bir2307_text_0', { source: 'pdf', change: { edits: { ewt1_m1: '100,674.00' } } });
  const cert = certOf(cert2307, lists(), settings());
  expect(cert.problems).toHaveLength(2);
  expect(scanStateOf(cert2307, cert, false)).toEqual({ kind: 'to_check', problems: cert.problems });
});

test('a 2307 with no payments read is blocked, its reason without the full stop', () => {
  const scan = scanOf('bir2307_text_0', {
    source: 'pdf',
    edit: (r) => ({ ...r, reads: r.reads.filter((b) => !b.name.startsWith('ewt')) }),
  });
  const cert = certOf(scan, lists(), settings());
  expect(cert.problems).toEqual([]);
  expect(blockWords(saveBlock(scan, cert), scan)).toBe('No income payments were read.');
  expect(scanStateOf(scan, cert, false)).toEqual({ kind: 'blocked', reason: 'No income payments were read' });
});

test('in annotation mode, unchecked boxes block: Check every box first: N left', () => {
  const id = scanOf('inv_0007', { source: 'camera' }).id;
  const stateNow = (annotation: boolean) => scanStateOf(getScan(id)!, checksOf(getScan(id)!), annotation);
  const left = uncheckedBoxes(getScan(id)!).length;
  expect(left).toBeGreaterThan(1);
  expect(checksOf(getScan(id)!)!.problems).toEqual([]);
  expect(stateNow(true)).toEqual({ kind: 'blocked', reason: `Check every box first: ${left} left` });
  // one box checked: one fewer left
  confirmBox(id, uncheckedBoxes(getScan(id)!)[0]);
  expect(stateNow(true)).toEqual({ kind: 'blocked', reason: `Check every box first: ${left - 1} left` });
  // outside annotation mode, the same scan has passed
  expect(stateNow(false)).toEqual({ kind: 'passed' });
});

test('a sample with no problems has passed (samples are never blocked here)', () => {
  const sample = scanOf('inv_0007');
  const sale = saleOf(sample, lists(), settings());
  expect(sale.problems).toEqual([]);
  expect(saveBlock(sample, sale, { annotation: true })).toBe('sample'); // not one of its boxes is checked
  expect(scanStateOf(sample, sale, false)).toEqual({ kind: 'passed' });
  expect(scanStateOf(sample, sale, true)).toEqual({ kind: 'passed' });
});

test('savedStateOf: no, unchanged, and changed by an edit to a box in its row', async () => {
  const unsaved = scanOf('inv_0007', { source: 'camera' });
  const id = unsaved.id;
  const savedNow = () => savedStateOf(getScan(id)!, savedSummary(id), false);
  expect(savedNow()).toBe('no');

  await saveScan(id, DETAILS);
  expect(savedNow()).toBe('unchanged');
  expect(savedStateOf(unsaved, savedSummary(id), false)).toBe('no'); // the scan as it was before it was saved

  // a box outside its import row: an item's unit
  setEdit(id, 'item1_unit', 'kgs');
  expect(savedNow()).toBe('unchanged');
  // a box in its row: the invoice's number, its SI/OR No.
  const number = unsaved.result.reads.find((b) => b.name === 'invoice_no')!.text;
  setEdit(id, 'invoice_no', '0007999');
  expect(savedNow()).toBe('changed');
  setEdit(id, 'invoice_no', number); // taken back
  expect(savedNow()).toBe('unchanged');
});

test('savedStateOf: in annotation mode, a confirm after the save is a change (M4 ruling, Important 3)', async () => {
  mockTeam = true;
  await updateSettings({ annotation: true });
  const id = scanOf('inv_0007', { source: 'camera' }).id;
  setEdit(id, 'item1_unit', 'kgs'); // read "kg": corrected before the save
  uncheckedBoxes(getScan(id)!).forEach((box) => confirmBox(id, box));
  await saveScan(id, DETAILS, TAG);
  const savedNow = (annotation: boolean) => savedStateOf(getScan(id)!, savedSummary(id), annotation);
  expect(savedNow(true)).toBe('unchanged');

  // "Looks right" on the corrected unit, as it stands: a check alone, outside the import row
  confirmBox(id, 'item1_unit');
  expect(savedNow(true)).toBe('changed');
  // outside annotation mode, only the import row counts
  expect(savedNow(false)).toBe('unchanged');
});

test("homeBadge: Changed, Saved, Sample, Couldn't find the form, N to check, Can't save yet, Checks passed", () => {
  const camera = scanOf('inv_0007', { source: 'camera' });
  const sample = scanOf('inv_0007');
  const NOT_FOUND: ScanState = { kind: 'not_found' };
  const TO_CHECK: ScanState = { kind: 'to_check', problems: ['Date', 'Terms', 'Row 2 math'] };
  const BLOCKED: ScanState = { kind: 'blocked', reason: 'Add the date first: tap Date' };
  const PASSED: ScanState = { kind: 'passed' };
  // Each row's badge is the first of these that applies, in this order.
  const table = [
    [camera, TO_CHECK, 'changed', 'Changed', 'warning'],
    [camera, PASSED, 'changed', 'Changed', 'warning'],
    [camera, TO_CHECK, 'unchanged', 'Saved', 'neutral'],
    [camera, BLOCKED, 'unchanged', 'Saved', 'neutral'],
    [camera, PASSED, 'unchanged', 'Saved', 'neutral'],
    [sample, PASSED, 'no', 'Sample', 'neutral'],
    [sample, TO_CHECK, 'no', 'Sample', 'neutral'],
    [sample, NOT_FOUND, 'no', 'Sample', 'neutral'],
    [camera, NOT_FOUND, 'no', "Couldn't find the form", 'warning'],
    [camera, TO_CHECK, 'no', '3 to check', 'warning'],
    [camera, BLOCKED, 'no', "Can't save yet", 'warning'],
    [camera, PASSED, 'no', 'Checks passed', 'success'],
  ] as const;
  for (const [scan, state, saved, label, tone] of table) {
    expect({ source: scan.source, state, saved, badge: homeBadge(scan, state, saved) }).toEqual({
      source: scan.source,
      state,
      saved,
      badge: { label, tone },
    });
  }
  expect(homeBadge(camera, { kind: 'to_check', problems: ['Date'] }, 'no')).toEqual({ label: '1 to check', tone: 'warning' });
});

test('useScanCheck: the checks, the state and the saved state, as the stores change', async () => {
  mockTeam = true;
  const id = scanOf('inv_0007', { source: 'camera' }).id;
  const { result } = await renderHook(() => useScanCheck(useSyncExternalStore(subscribeRecent, () => getScan(id))));
  expect(result.current).toMatchObject({
    cert: null,
    state: { kind: 'passed' },
    saved: 'no',
    summary: undefined,
    annotation: false,
  });
  expect(result.current.sale).toBe(saleOf(getScan(id)!, lists(), settings())); // the one run of the checks

  // annotation mode: its boxes aren't checked yet
  await act(async () => updateSettings({ annotation: true }));
  const left = uncheckedBoxes(getScan(id)!).length;
  expect(result.current).toMatchObject({ annotation: true, state: { kind: 'blocked', reason: `Check every box first: ${left} left` } });
  await act(async () => updateSettings({ annotation: false }));

  // the lists: a customer list, which the invoice's customer isn't in
  await act(async () => {
    await addParty(OTHER_CUSTOMER);
  });
  expect(result.current.state).toEqual({ kind: 'to_check', problems: ['Customer (not in your list)'] });
  await act(async () => clearParties('customer'));
  expect(result.current.state).toEqual({ kind: 'passed' });

  // saved, then changed in its import row
  await act(async () => saveScan(id, DETAILS));
  expect(result.current).toMatchObject({ saved: 'unchanged', summary: savedSummary(id) });
  await act(async () => setEdit(id, 'invoice_no', '0007999'));
  expect(result.current.saved).toBe('changed');

  // a 2307's checks are a certificate's
  const pdf = scanOf('bir2307_text_0', { source: 'pdf' });
  const { result: certificate } = await renderHook(() => useScanCheck(pdf));
  expect(certificate.current).toMatchObject({ sale: null, state: { kind: 'passed' }, saved: 'no' });
  expect(certificate.current.cert).toBe(certOf(pdf, lists(), settings()));

  // no scan: nothing to show
  const { result: none } = await renderHook(() => useScanCheck(undefined));
  expect(none.current).toEqual({ sale: null, cert: null, state: null, saved: 'no', summary: undefined, annotation: false });
});
