import { render, screen } from '@testing-library/react-native';

import Result from '../app/result';
import { addScan } from '../lib/scans';
import { parseScanResult } from '../modules/scanner/src/parse';
import { coreJson } from '../test-utils/coreJson';

let mockId = '';
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({ id: mockId }) }));

test('result without a form', async () => {
  mockId = addScan('Sample blank', parseScanResult(coreJson('blank_page')));
  await render(<Result />);
  expect(screen.getByText("Couldn't find the form")).toBeTruthy();
  expect(screen.getByText('Make sure the whole invoice and its 4 corner squares are in the photo.')).toBeTruthy();
});

test('result with readings', async () => {
  mockId = addScan('Sample 0007', parseScanResult(coreJson('inv_0007')));
  await render(<Result />);
  expect(screen.getByText('MyBizMate Sales Invoice')).toBeTruthy();
  expect(screen.getByText('0007655')).toBeTruthy();
  expect(screen.getByText('Sep 20, 2026')).toBeTruthy();
  expect(screen.getByText('Egqs')).toBeTruthy();
});
