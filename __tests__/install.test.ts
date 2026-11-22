import { fixedCrypto } from '../test-utils/fixedCrypto';
import { memoryFs } from '../test-utils/memoryFs';

jest.mock('expo-file-system', () => require('../test-utils/memoryFs').memoryFs.module);
jest.mock('expo-crypto', () => require('../test-utils/fixedCrypto').fixedCrypto.module);

const I = (): typeof import('../lib/install') => require('../lib/install');

beforeEach(() => {
  memoryFs.reset();
  jest.resetModules();
});

test('the install ID is made once and kept', async () => {
  const first = I();
  expect(() => first.installId()).toThrow('install_not_loaded');
  await first.loadInstall();
  expect(first.installId()).toBe(fixedCrypto.uuid);
  expect(JSON.parse(memoryFs.files.get('file:///docs/install.json') as string)).toEqual({ id: fixedCrypto.uuid });
  jest.resetModules(); // the next start
  const second = I();
  const { randomUUID } = require('expo-crypto'); // the one the restarted app uses
  await second.loadInstall();
  expect(second.installId()).toBe(fixedCrypto.uuid);
  expect(randomUUID).not.toHaveBeenCalled();
});

test('the app loads it at start', async () => {
  await require('../lib/startup').loadAppData();
  expect(I().installId()).toBe(fixedCrypto.uuid);
});
