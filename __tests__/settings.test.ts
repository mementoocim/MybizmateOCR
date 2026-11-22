import { memoryFs } from '../test-utils/memoryFs';

jest.mock('expo-file-system', () => require('../test-utils/memoryFs').memoryFs.module);

const S = (): typeof import('../lib/settings') => require('../lib/settings');

beforeEach(() => {
  memoryFs.reset();
  jest.resetModules();
});

test('the defaults', () => {
  expect(S().settings()).toEqual({
    vatRegistered: null,
    revenueAccount: '',
    expenseAccount: '',
    atc: '',
    offsetAccount: '',
    annotation: false,
    clientCode: '',
    writerCode: '',
  });
});

test('settings kept before 2307s get an empty offset account', async () => {
  memoryFs.files.set('file:///docs/settings.json', JSON.stringify({ vatRegistered: true, revenueAccount: '4010', expenseAccount: '', atc: '' }));
  const s = S();
  await s.loadSettings();
  expect(s.settings()).toEqual({
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

test('settings kept before annotation mode load with it off and no codes', async () => {
  const kept = { vatRegistered: false, revenueAccount: '4010', expenseAccount: '5010', atc: 'WC158', offsetAccount: '1205' };
  memoryFs.files.set('file:///docs/settings.json', JSON.stringify(kept));
  const s = S();
  await s.loadSettings();
  expect(s.settings()).toEqual({ ...kept, annotation: false, clientCode: '', writerCode: '' });
});

test('a change is saved, and comes back after a restart', async () => {
  const listener = jest.fn();
  const first = S();
  first.subscribeSettings(listener);
  await first.updateSettings({ vatRegistered: false, revenueAccount: '4010' });
  expect(listener).toHaveBeenCalled();
  expect(first.settings()).toMatchObject({ vatRegistered: false, revenueAccount: '4010', expenseAccount: '' });
  expect(memoryFs.files.has('file:///docs/settings.json')).toBe(true);
  jest.resetModules();
  const again = S();
  await again.loadSettings();
  expect(again.settings()).toEqual({
    vatRegistered: false,
    revenueAccount: '4010',
    expenseAccount: '',
    atc: '',
    offsetAccount: '',
    annotation: false,
    clientCode: '',
    writerCode: '',
  });
});
