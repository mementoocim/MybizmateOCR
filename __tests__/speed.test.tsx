import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';

import SpeedScreen from '../app/speed';
import type { SpeedResult } from '../lib/speedTest';
import { colors } from '../lib/theme';
import { typeStylesOf } from '../test-utils/typeStyles';

// The team's speed test, in the design's tokens and components (§9.11): what it runs and shows is as it was.

const mockRun = jest.fn();
jest.mock('../lib/speedTest', () => ({
  runSpeedTest: (onProgress: (done: number, total: number) => void) => mockRun(onProgress),
}));
// the header's Back (lib/navigation): the screen's own navigation, and the way Home
jest.mock('expo-router', () => ({
  useNavigation: () => ({ canGoBack: () => true, goBack: jest.fn() }),
  useRouter: () => ({ replace: jest.fn() }),
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
const NOTE = "Reads 8 sample invoices 3 times with this phone's processor, about 30 seconds. Nothing is sent anywhere.";

type Instance = ReturnType<typeof screen.getByText>;
const press = (el: Instance) => act(async () => fireEvent.press(el));
const button = (name: string) => screen.getByRole('button', { name });

beforeEach(() => jest.clearAllMocks());

test('a run shows its progress, then the median and the six rows', async () => {
  let finish: (r: SpeedResult) => void = () => {};
  let progress: (done: number, total: number) => void = () => {};
  mockRun.mockImplementation((onProgress: (done: number, total: number) => void) => {
    progress = onProgress;
    onProgress(1, 24);
    return new Promise((resolve) => (finish = resolve));
  });
  await render(<SpeedScreen />);
  expect(screen.getByRole('header', { name: 'Speed test' })).toBeOnTheScreen();
  const title = screen.getByText('How fast this phone reads invoices');
  expect(typeStylesOf(title)).toEqual(['headline']);
  expect(title).toHaveStyle({ color: colors.ink });
  const device = screen.getByText(`${Platform.OS} ${String(Platform.Version)}`); // jest runs as iOS
  expect(typeStylesOf(device)).toEqual(['label']);
  expect(device).toHaveStyle({ color: colors.mute });
  // the median in the totals' figure style (a dash until a run), over its words
  expect(screen.getByText('—')).toBeTruthy();
  expect(typeStylesOf(screen.getByText('—'))).toEqual(['figureStrong']);
  expect(typeStylesOf(screen.getByText('per invoice, median'))).toEqual(['label']);
  expect(typeStylesOf(screen.getByText(NOTE))).toEqual(['label']);
  expect(screen.getByText(NOTE)).toHaveStyle({ color: colors.mute });
  expect(button('Run speed test')).toHaveStyle({ backgroundColor: colors.brand }); // the primary button
  expect(screen.queryByTestId('speed-progress')).toBeNull(); // no bar until a run

  await press(button('Run speed test'));
  expect(screen.getByText('Invoice 1 of 24')).toBeTruthy();
  // a 4 dp sand track, filled in brand as far as the run has got
  expect(screen.getByTestId('speed-progress')).toHaveStyle({ height: 4, backgroundColor: colors.sand });
  expect(screen.getByTestId('speed-progress-fill')).toHaveStyle({ width: '4%', backgroundColor: colors.brand });
  await act(async () => progress(12, 24));
  expect(screen.getByText('Invoice 12 of 24')).toBeTruthy();
  expect(screen.getByTestId('speed-progress-fill')).toHaveStyle({ width: '50%' });

  await act(async () => finish(RESULT));
  expect(screen.queryByTestId('speed-progress')).toBeNull();
  expect(screen.getByText('1.4 s')).toBeTruthy();
  expect(typeStylesOf(screen.getByText('1.4 s'))).toEqual(['figureStrong']);
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
    expect(screen.getByLabelText(`${label}, ${value}`)).toBeOnTheScreen(); // a row is one stop for TalkBack
  }
  // the rows open nothing: the header's Back and the run are the only buttons
  expect(screen.getAllByRole('button').map((b) => b.props.accessibilityLabel)).toEqual(['Back', 'Run again']);
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

test('Run speed test runs once on a double tap', async () => {
  // Review Focus 3: the second tap comes while the run is still going
  let finish: (r: SpeedResult) => void = () => {};
  mockRun.mockImplementation(() => new Promise((resolve) => (finish = resolve)));
  await render(<SpeedScreen />);
  // A fast double tap: inside one act() scope, nothing re-renders between the two taps.
  await act(async () => {
    await fireEvent.press(button('Run speed test'));
    await fireEvent.press(button('Run speed test'));
  });
  expect(mockRun).toHaveBeenCalledTimes(1);
  // it loads while it runs, and a tap then does nothing either
  expect(button('Run speed test')).toBeBusy();
  await press(button('Run speed test'));
  expect(mockRun).toHaveBeenCalledTimes(1);

  await act(async () => finish(RESULT));
  expect(button('Run again')).not.toBeBusy();
  await press(button('Run again'));
  expect(mockRun).toHaveBeenCalledTimes(2);
});
