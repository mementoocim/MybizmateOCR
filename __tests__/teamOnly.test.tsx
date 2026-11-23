import { fireEvent, render, screen } from '@testing-library/react-native';

import SpeedScreen from '../app/speed';
import TrainingScreen from '../app/training';
import { colors } from '../lib/theme';
import { typeStylesOf } from '../test-utils/typeStyles';

let mockTeam = false;
const mockBack = jest.fn();

jest.mock('../lib/build', () => ({
  get TEAM_BUILD() {
    return mockTeam;
  },
}));
jest.mock('../lib/speedTest', () => ({ runSpeedTest: jest.fn() })); // the runner needs the scanner's native module
jest.mock('expo-router', () => ({ router: { back: () => mockBack() } }));

beforeEach(() => {
  mockTeam = false;
  mockBack.mockClear();
});

// A link (mybizmatescan://speed) opens a route in any build, so a team screen checks the build itself. Either way the
// screen has its header, and its Back.
test('team screens in a client build', async () => {
  await render(<SpeedScreen />);
  expect(screen.getByRole('header', { name: 'Speed test' })).toBeOnTheScreen();
  expect(screen.getByText('This is for team builds.')).toBeTruthy();
  expect(typeStylesOf(screen.getByText('This is for team builds.'))).toEqual(['body']);
  expect(screen.getByText('This is for team builds.')).toHaveStyle({ color: colors.mute });
  expect(screen.queryByText('How fast this phone reads invoices')).toBeNull();
  expect(screen.queryByText('Run speed test')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
  expect(mockBack).toHaveBeenCalledTimes(1);
  await screen.unmount();
  await render(<TrainingScreen />);
  expect(screen.getByRole('header', { name: 'Training data' })).toBeOnTheScreen();
  expect(screen.getByText('This is for team builds.')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
  expect(mockBack).toHaveBeenCalledTimes(2);
});

test('team screens in a team build', async () => {
  mockTeam = true;
  await render(<SpeedScreen />);
  expect(screen.getByRole('header', { name: 'Speed test' })).toBeOnTheScreen();
  expect(screen.getByText('How fast this phone reads invoices')).toBeTruthy();
  expect(screen.queryByText('This is for team builds.')).toBeNull();
  await screen.unmount();
  await render(<TrainingScreen />);
  expect(screen.getByRole('header', { name: 'Training data' })).toBeOnTheScreen();
  expect(screen.queryByText('This is for team builds.')).toBeNull();
});
