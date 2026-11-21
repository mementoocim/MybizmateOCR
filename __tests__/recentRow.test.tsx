import { act, render, screen } from '@testing-library/react-native';

import { RecentRow } from '../components/RecentRow';
import { addParty, clearParties } from '../lib/lists';
import { addScan, getScan, type StoredScan, updateScan } from '../lib/scans';
import { parseScanResult } from '../modules/scanner/src/parse';
import { coreJson } from '../test-utils/coreJson';
import { memoryFs } from '../test-utils/memoryFs';

jest.mock('expo-file-system', () => require('../test-utils/memoryFs').memoryFs.module);

/** A sample's scan (checked as of the samples' day), with the person's changes. */
function scanOf(stem: string, change: Parameters<typeof updateScan>[1] = {}): StoredScan {
  const id = addScan({ label: `Sample ${stem}`, source: 'sample', sampleId: stem, result: parseScanResult(coreJson(stem)) });
  updateScan(id, change);
  return getScan(id)!;
}

/** A made-up 2307 (fixtures/core/expected2307) imported as a PDF, with the person's changes. */
function pdfOf(stem: string, change: Parameters<typeof updateScan>[1] = {}): StoredScan {
  const id = addScan({ label: `PDF: ${stem}.pdf`, source: 'pdf', result: parseScanResult(coreJson(stem)) });
  updateScan(id, change);
  return getScan(id)!;
}

const showRow = (scan: StoredScan) => render(<RecentRow scan={scan} onPress={() => {}} />);
const SAVED = { savedAt: '2026-11-20T01:00:00.000Z', details: { taxType: 'VAT', account: 'Sales', terms: 'cash', atc: '' } } as const;

beforeEach(async () => {
  memoryFs.reset();
  await clearParties('customer');
  await clearParties('supplier');
});

test('the form not found', async () => {
  await showRow(scanOf('blank_page'));
  expect(screen.getByText(/^Form not found · 0 ms · \d{1,2}:\d{2} (AM|PM)$/)).toBeTruthy();
});

test('saved as a sale or a purchase', async () => {
  await showRow(scanOf('inv_0007', { saved: SAVED }));
  expect(screen.getByText(/^Saved as a sale · 0 ms · /)).toBeTruthy();
  await showRow(scanOf('inv_0007', { kind: 'purchase', party: { various: true }, saved: SAVED }));
  expect(screen.getByText(/^Saved as a purchase · 0 ms · /)).toBeTruthy();
});

test('the things to check', async () => {
  await showRow(scanOf('inv_0007', { kind: 'purchase' })); // no supplier chosen yet
  expect(screen.getByText(/^1 to check · 0 ms · /)).toBeTruthy();
  await showRow(scanOf('inv_0051')); // Date, VAT breakdown
  expect(screen.getByText(/^2 to check · 0 ms · /)).toBeTruthy();
});

test('ready to post', async () => {
  await showRow(scanOf('inv_0007'));
  expect(screen.getByText(/^Ready to post · 0 ms · /)).toBeTruthy();
});

test("a 2307's status", async () => {
  // checked as a 2307, never as an invoice (it has no date, terms or total due)
  await showRow(pdfOf('bir2307_text_0'));
  expect(screen.getByText(/^Ready to save · 0 ms · \d{1,2}:\d{2} (AM|PM)$/)).toBeTruthy();
  // row 1's months, and the total row's 1st month, no longer add up
  await showRow(pdfOf('bir2307_text_0', { edits: { ewt1_m1: '100,674.00' } }));
  expect(screen.getByText(/^2 to check · 0 ms · /)).toBeTruthy();
  await showRow(pdfOf('bir2307_text_0', { saved: SAVED }));
  expect(screen.getByText(/^Saved as a 2307 · 0 ms · /)).toBeTruthy();
});

test('the status follows the lists', async () => {
  await showRow(scanOf('inv_0007'));
  expect(screen.getByText(/^Ready to post · /)).toBeTruthy();
  // a customer list without this invoice's customer: "Customer (not in your list)"
  await act(async () => {
    await addParty({
      code: 'C900',
      type: 'customer',
      entity: 'company',
      registeredName: 'Zamora Trucking Services',
      lastName: '',
      firstName: '',
      middleName: '',
      tradeName: '',
      tin: '999-888-777-00000',
      address: '',
      vatStatus: '',
      terms: '',
      fromScan: false,
    });
  });
  expect(screen.getByText(/^1 to check · /)).toBeTruthy();
});
