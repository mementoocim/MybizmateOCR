import { render, screen } from '@testing-library/react-native';

import SpeedScreen from '../app/speed';
import TrainingScreen from '../app/training';

let mockTeam = false;

jest.mock('../lib/build', () => ({
  get TEAM_BUILD() {
    return mockTeam;
  },
}));
jest.mock('../lib/speedTest', () => ({ runSpeedTest: jest.fn() })); // the runner needs the scanner's native module

beforeEach(() => {
  mockTeam = false;
});

// A link (mybizmatescan://speed) opens a route in any build, so a team screen checks the build itself.
test('team screens in a client build', async () => {
  await render(<SpeedScreen />);
  expect(screen.getByText('This is for team builds.')).toBeTruthy();
  expect(screen.queryByText('How fast this phone reads invoices')).toBeNull();
  expect(screen.queryByText('Run speed test')).toBeNull();
  await screen.unmount();
  await render(<TrainingScreen />);
  expect(screen.getByText('This is for team builds.')).toBeTruthy();
});

test('team screens in a team build', async () => {
  mockTeam = true;
  await render(<SpeedScreen />);
  expect(screen.getByText('How fast this phone reads invoices')).toBeTruthy();
  expect(screen.queryByText('This is for team builds.')).toBeNull();
  await screen.unmount();
  await render(<TrainingScreen />);
  expect(screen.queryByText('This is for team builds.')).toBeNull();
});
