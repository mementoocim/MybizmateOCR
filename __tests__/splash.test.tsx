import { act, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { BrandSplash } from '../components/BrandSplash';

const mockPreload = jest.fn();
const mockScan = jest.fn();
const mockLoadAppData = jest.fn(async () => {});

jest.mock('../modules/scanner', () => ({
  preload: () => mockPreload(),
  scanPhoto: (uri: string, options: object) => mockScan(uri, options),
}));
jest.mock('../lib/startup', () => ({ loadAppData: () => mockLoadAppData() }));
jest.mock('../lib/samples', () => ({ sampleUri: async (id: string) => `file:///s/${id}.jpg` }));
jest.mock('expo-splash-screen', () => ({ hideAsync: jest.fn(async () => {}) }));

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
});

afterEach(() => {
  jest.useRealTimers();
});

async function settle() {
  for (let i = 0; i < 10; i++) await act(async () => {});
}

test('ready after the scanner and a warm-up scan, and not before 1200 ms', async () => {
  mockPreload.mockResolvedValue(undefined);
  mockScan.mockResolvedValue({});
  const onReady = jest.fn();
  await render(<BrandSplash onReady={onReady} />);
  expect(screen.getByText('Scan invoices. Even offline.')).toBeTruthy();
  expect(screen.getByText('Getting the scanner ready…')).toBeTruthy();
  await settle();
  expect(mockPreload).toHaveBeenCalled();
  expect(mockLoadAppData).toHaveBeenCalled();
  expect(mockScan).toHaveBeenCalledWith('file:///s/inv_0001.jpg', { keepFiles: false });
  expect(onReady).not.toHaveBeenCalled();
  await act(async () => {
    jest.advanceTimersByTime(1100);
  });
  expect(onReady).not.toHaveBeenCalled();
  await act(async () => {
    jest.advanceTimersByTime(1000); // past 1200 ms: the fade starts
  });
  await settle();
  expect(onReady).not.toHaveBeenCalled();
  await act(async () => {
    jest.advanceTimersByTime(300); // the fade
  });
  await settle();
  expect(onReady).toHaveBeenCalledTimes(1);
});

test('a warm-up read that fails still opens the app (it only makes the first scan quicker)', async () => {
  mockPreload.mockResolvedValue(undefined);
  mockScan.mockRejectedValue(new Error('unreadable'));
  const onReady = jest.fn();
  await render(<BrandSplash onReady={onReady} />);
  await settle();
  await act(async () => {
    jest.advanceTimersByTime(1200); // the splash's shortest time
  });
  await settle();
  await act(async () => {
    jest.advanceTimersByTime(300); // the fade
  });
  await settle();
  expect(onReady).toHaveBeenCalledTimes(1);
  expect(screen.queryByText(/couldn't start/)).toBeNull();
});

test("the logo starts where the phone's splash drew it: 104 dp, centred on the screen", async () => {
  mockPreload.mockReturnValue(new Promise(() => {}));
  await render(<BrandSplash onReady={jest.fn()} />);
  expect(StyleSheet.flatten(screen.getByTestId('splash-logo').props.style)).toMatchObject({ width: 104, height: 104 });
  expect(StyleSheet.flatten(screen.getByTestId('splash-brand').props.style)).toMatchObject({ top: '50%', marginTop: -52 });
});

test('a scanner that fails to start says so and goes no further', async () => {
  mockPreload.mockRejectedValue(new Error('boom'));
  const onReady = jest.fn();
  await render(<BrandSplash onReady={onReady} />);
  await settle();
  await act(async () => {
    jest.advanceTimersByTime(5000);
  });
  expect(screen.getByText("The scanner couldn't start: boom")).toBeTruthy();
  expect(onReady).not.toHaveBeenCalled();
});
