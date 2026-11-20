import { act, fireEvent, render, screen } from '@testing-library/react-native';

import SpeedScreen from '../app/speed';
import type { SpeedResult } from '../lib/speedTest';

const mockRun = jest.fn();
jest.mock('../lib/speedTest', () => ({
  runSpeedTest: (onProgress: (done: number, total: number) => void) => mockRun(onProgress),
}));

const RESULT: SpeedResult = {
  medianMs: 1412,
  p90Ms: 1630,
  readMedianMs: 905,
  exact: { a: 216, b: 241 },
  laptop: { a: 243, b: 243 },
  peakMb: 301,
  loadMs: 812,
};

beforeEach(() => jest.clearAllMocks());

test('a run shows its progress, then the median and the six rows', async () => {
  let finish: (r: SpeedResult) => void = () => {};
  mockRun.mockImplementation((onProgress: (done: number, total: number) => void) => {
    onProgress(1, 24);
    return new Promise((resolve) => (finish = resolve));
  });
  await render(<SpeedScreen />);
  expect(screen.getByText('How fast this phone reads invoices')).toBeTruthy();
  expect(screen.getByText('—')).toBeTruthy();
  expect(screen.getByText('per invoice, median')).toBeTruthy();
  expect(
    screen.getByText(
      "Reads 8 sample invoices 3 times with this phone's processor, about 30 seconds. Nothing is sent anywhere.",
    ),
  ).toBeTruthy();

  await act(async () => fireEvent.press(screen.getByText('Run speed test')));
  expect(screen.getByText('Invoice 1 of 24')).toBeTruthy();

  await act(async () => finish(RESULT));
  expect(screen.getByText('1.4 s')).toBeTruthy();
  expect(screen.getByText('24 invoices read on this phone')).toBeTruthy();
  for (const [label, value] of [
    ['Slowest 10%', '1.6 s or more'],
    ['Reading the boxes', '905 ms of each invoice'],
    ['Read exactly as written', '216 of 241 boxes'],
    ['Same as the laptop', '243 of 243 boxes'],
    ['Peak memory', '301 MB'],
    ['Starting the scanner', '812 ms'],
  ]) {
    expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getByText(value)).toBeTruthy();
  }
  expect(screen.getByText('Run again')).toBeTruthy();
});

test('"Getting ready…" shows until the first invoice is read', async () => {
  mockRun.mockImplementation(() => new Promise(() => {}));
  await render(<SpeedScreen />);
  await act(async () => fireEvent.press(screen.getByText('Run speed test')));
  expect(screen.getByText('Getting ready…')).toBeTruthy();
});

test('a run that stops says why, and can be started again', async () => {
  mockRun.mockRejectedValue(new Error('boom'));
  await render(<SpeedScreen />);
  await act(async () => fireEvent.press(screen.getByText('Run speed test')));
  expect(screen.getByText('The speed test stopped: boom')).toBeTruthy();
  await act(async () => fireEvent.press(screen.getByText('Run speed test')));
  expect(mockRun).toHaveBeenCalledTimes(2);
});
