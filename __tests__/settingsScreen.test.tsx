import { act, fireEvent, render, screen } from '@testing-library/react-native';

import SettingsScreen from '../app/settings';
import * as store from '../lib/settings';
import { loadSettings, settings, updateSettings } from '../lib/settings';
import { memoryFs } from '../test-utils/memoryFs';

let mockTeam = false;
const mockPush = jest.fn();

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }) }));
jest.mock('../lib/build', () => ({
  get TEAM_BUILD() {
    return mockTeam;
  },
}));
jest.mock('expo-file-system', () => require('../test-utils/memoryFs').memoryFs.module);

beforeEach(async () => {
  mockTeam = false;
  mockPush.mockClear();
  memoryFs.reset();
  await updateSettings({
    vatRegistered: true,
    revenueAccount: '4010',
    expenseAccount: '',
    atc: '',
    offsetAccount: '',
    annotation: false,
    clientCode: '',
    writerCode: '',
  });
});

test('the settings show what the phone keeps', async () => {
  await render(<SettingsScreen />);
  expect(screen.getByText('EXPORTS TO MYBIZMATE')).toBeTruthy();
  expect(screen.getByLabelText('Revenue account for sales').props.value).toBe('4010');
  expect(screen.getByRole('radio', { name: 'VAT-registered', checked: true })).toBeTruthy();
  expect(
    screen.getByText(
      "These fill in what MyBizMate's import needs that isn't on the paper. You can change them on each invoice when you save it.",
    ),
  ).toBeTruthy();
});

test('a field is saved as it is typed, and the VAT answer at once', async () => {
  await render(<SettingsScreen />);
  await act(async () => fireEvent.changeText(screen.getByLabelText('Expense account for purchases'), ' 5010 '));
  expect(settings().expenseAccount).toBe('5010');
  await act(async () => fireEvent.changeText(screen.getByLabelText('Withholding tax ATC'), 'wc158'));
  expect(screen.getByLabelText('Withholding tax ATC').props.value).toBe('WC158');
  expect(settings().atc).toBe('WC158');
  await act(async () => fireEvent.press(screen.getByText('Not VAT-registered')));
  expect(settings().vatRegistered).toBe(false);
});

test('the offset account is kept as typed', async () => {
  await render(<SettingsScreen />);
  expect(screen.getByLabelText('Offset account for 2307s').props.value).toBe('');
  await act(async () => fireEvent.changeText(screen.getByLabelText('Offset account for 2307s'), ' 1205 CWT Receivable '));
  expect(settings().offsetAccount).toBe('1205 CWT Receivable');
  await screen.unmount(); // left while the field still has the cursor
  expect(settings().offsetAccount).toBe('1205 CWT Receivable');
  // and shown when the screen opens again
  await render(<SettingsScreen />);
  expect(screen.getByLabelText('Offset account for 2307s').props.value).toBe('1205 CWT Receivable');
});

test('what was typed is kept when the screen is left from the field', async () => {
  await render(<SettingsScreen />);
  await act(async () => fireEvent.changeText(screen.getByLabelText('Revenue account for sales'), '4000 Sales Revenue'));
  await screen.unmount(); // going back while the field still has the cursor: React Native doesn't blur it
  expect(settings().revenueAccount).toBe('4000 Sales Revenue');
});

const NOTE = 'Every box must be checked before a scan saves, and each scan gets a client and writer code.';

test('team tools show only in team builds', async () => {
  await render(<SettingsScreen />);
  expect(screen.queryByText('TEAM TOOLS')).toBeNull();
  expect(screen.queryByRole('switch', { name: 'Annotation mode' })).toBeNull();
  expect(screen.queryByText(NOTE)).toBeNull();
  expect(screen.queryByText('Training data')).toBeNull();
  expect(screen.queryByText('Speed test')).toBeNull();
  await screen.unmount();

  mockTeam = true;
  await render(<SettingsScreen />);
  expect(screen.getByText('TEAM TOOLS')).toBeTruthy();
  expect(screen.getByRole('switch', { name: 'Annotation mode', checked: false })).toBeTruthy();
  expect(screen.getByText(NOTE)).toBeTruthy();
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Training data' })));
  expect(mockPush).toHaveBeenLastCalledWith('/training');
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Speed test' })));
  expect(mockPush).toHaveBeenLastCalledWith('/speed');
});

test('the annotation switch is kept', async () => {
  mockTeam = true;
  const update = jest.spyOn(store, 'updateSettings'); // it still saves
  await render(<SettingsScreen />);
  await act(async () => fireEvent(screen.getByRole('switch', { name: 'Annotation mode' }), 'valueChange', true));
  expect(update).toHaveBeenCalledWith({ annotation: true });
  expect(screen.getByRole('switch', { name: 'Annotation mode', checked: true })).toBeTruthy();
  await update.mock.results[0].value; // its write to the phone
  update.mockRestore();
  await screen.unmount();
  await act(async () => loadSettings()); // read again from the phone, as at the next start
  expect(settings().annotation).toBe(true);
  await render(<SettingsScreen />);
  expect(screen.getByRole('switch', { name: 'Annotation mode', checked: true })).toBeTruthy();
});
