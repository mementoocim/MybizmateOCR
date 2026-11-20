import { act, fireEvent, render, screen } from '@testing-library/react-native';

import SettingsScreen from '../app/settings';
import { settings, updateSettings } from '../lib/settings';
import { memoryFs } from '../test-utils/memoryFs';

jest.mock('expo-file-system', () => require('../test-utils/memoryFs').memoryFs.module);

beforeEach(async () => {
  memoryFs.reset();
  await updateSettings({ vatRegistered: true, revenueAccount: '4010', expenseAccount: '', atc: '' });
});

test('the settings show what the phone keeps', async () => {
  await render(<SettingsScreen />);
  expect(screen.getByText('EXPORTS TO MYBIZMATE')).toBeTruthy();
  expect(screen.getByLabelText('Revenue account for sales').props.value).toBe('4010');
  expect(screen.getByRole('button', { name: 'VAT-registered', selected: true })).toBeTruthy();
  expect(
    screen.getByText(
      "These fill in what MyBizMate's import needs that isn't on the paper. You can change them on each invoice when you save it.",
    ),
  ).toBeTruthy();
});

test('a field is saved when it is left, and the VAT answer at once', async () => {
  await render(<SettingsScreen />);
  const expense = screen.getByLabelText('Expense account for purchases');
  await act(async () => fireEvent.changeText(expense, '5010'));
  expect(settings().expenseAccount).toBe('');
  await act(async () => fireEvent(expense, 'blur'));
  expect(settings().expenseAccount).toBe('5010');
  await act(async () => fireEvent.changeText(screen.getByLabelText('Withholding tax ATC'), 'wc158'));
  await act(async () => fireEvent(screen.getByLabelText('Withholding tax ATC'), 'blur'));
  expect(settings().atc).toBe('WC158');
  await act(async () => fireEvent.press(screen.getByText('Not VAT-registered')));
  expect(settings().vatRegistered).toBe(false);
});
