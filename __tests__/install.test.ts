import { fixedCrypto } from '../test-utils/fixedCrypto';
import { memoryFs } from '../test-utils/memoryFs';

jest.mock('expo-file-system', () => require('../test-utils/memoryFs').memoryFs.module);
jest.mock('expo-crypto', () => require('../test-utils/fixedCrypto').fixedCrypto.module);

const FILE = 'file:///docs/install.json';
const I = (): typeof import('../lib/install') => require('../lib/install');
const kept = () => JSON.parse(memoryFs.files.get(FILE) as string);

/** The phone's next file write fails, as when it's full. */
function failNextWrite(): void {
  const { File } = require('expo-file-system'); // the one the app's files use until the next reset
  jest.spyOn(File.prototype, 'write').mockRejectedValueOnce(new Error('No space left on device'));
}

beforeEach(() => {
  memoryFs.reset();
  jest.resetModules();
});

test('the install ID is made once and kept', async () => {
  const first = I();
  expect(() => first.installId()).toThrow('install_not_loaded');
  await first.loadInstall();
  expect(first.installId()).toBe(fixedCrypto.uuid);
  expect(kept()).toEqual({ id: fixedCrypto.uuid });
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

test('a failed write lets the start finish', async () => {
  failNextWrite();
  await expect(require('../lib/startup').loadAppData()).resolves.toBeUndefined();
  expect(() => I().installId()).toThrow('install_not_loaded');
  expect(memoryFs.files.has(FILE)).toBe(false);
});

test('a later load makes and keeps the ID', async () => {
  failNextWrite();
  const install = I();
  await install.loadInstall();
  expect(() => install.installId()).toThrow('install_not_loaded');
  await install.loadInstall(); // the next start, or the training export trying again
  expect(install.installId()).toBe(fixedCrypto.uuid);
  expect(kept()).toEqual({ id: fixedCrypto.uuid });
});

const BROKEN = ['{"id"', '{}', '{"id":""}', '{"id":42}']; // cut short, no ID, an empty one, not a string

test.each(BROKEN)('a broken install.json is replaced on the next load: %s', async (broken) => {
  memoryFs.files.set(FILE, broken);
  const install = I();
  await install.loadInstall();
  expect(install.installId()).toBe(fixedCrypto.uuid);
  expect(kept()).toEqual({ id: fixedCrypto.uuid });
});
