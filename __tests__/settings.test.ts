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
    setupDone: false,
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
    setupDone: false,
  });
});

test('settings kept before annotation mode load with it off and no codes', async () => {
  const kept = { vatRegistered: false, revenueAccount: '4010', expenseAccount: '5010', atc: 'WC158', offsetAccount: '1205' };
  memoryFs.files.set('file:///docs/settings.json', JSON.stringify(kept));
  const s = S();
  await s.loadSettings();
  expect(s.settings()).toEqual({ ...kept, annotation: false, clientCode: '', writerCode: '', setupDone: false });
});

test('settings kept before the UI pass load with setupDone false', async () => {
  // every field milestone 4 kept, and no setupDone: Home's "Get set up" shows until it's done here
  const kept = {
    vatRegistered: true,
    revenueAccount: '4010',
    expenseAccount: '5010',
    atc: 'WC158',
    offsetAccount: '1205',
    annotation: true,
    clientCode: 'C014',
    writerCode: 'W03',
  };
  memoryFs.files.set('file:///docs/settings.json', JSON.stringify(kept));
  const s = S();
  await s.loadSettings();
  expect(s.settings()).toEqual({ ...kept, setupDone: false });

  // once done, it's kept: after a restart it's still done
  await s.updateSettings({ setupDone: true });
  jest.resetModules();
  const again = S();
  await again.loadSettings();
  expect(again.settings()).toEqual({ ...kept, setupDone: true });
});

test("a change that changes nothing keeps the same settings and tells no screen (final review, Important 1)", async () => {
  // a save writes its account and ATC as the defaults each time: the same ones, as a rule
  const s = S();
  await s.updateSettings({ revenueAccount: '4010', atc: 'WC158' });
  const before = s.settings();
  const listener = jest.fn();
  s.subscribeSettings(listener);
  await s.updateSettings({ revenueAccount: '4010', atc: 'WC158' });
  await s.updateSettings({});
  expect(s.settings()).toBe(before);
  expect(listener).not.toHaveBeenCalled();
  // one value that differs is a change
  await s.updateSettings({ revenueAccount: '4010', atc: 'WC160' });
  expect(s.settings()).toMatchObject({ revenueAccount: '4010', atc: 'WC160' });
  expect(listener).toHaveBeenCalledTimes(1);
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
    setupDone: false,
  });
});
