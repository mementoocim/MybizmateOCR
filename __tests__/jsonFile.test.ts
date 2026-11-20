import { readJson, writeJson } from '../lib/jsonFile';
import { memoryFs } from '../test-utils/memoryFs';

jest.mock('expo-file-system', () => require('../test-utils/memoryFs').memoryFs.module);

beforeEach(() => memoryFs.reset());

test('two quick writes land in order', async () => {
  void writeJson('a.json', 1);
  await writeJson('a.json', 2);
  expect(await readJson('a.json')).toBe(2);
  expect(memoryFs.files.has('file:///docs/a.json.tmp')).toBe(false);
});

test('a write cut short leaves the last good file', async () => {
  memoryFs.files.set('file:///docs/a.json', '{"x":1}');
  memoryFs.files.set('file:///docs/a.json.tmp', '{"x"');
  expect(await readJson('a.json')).toEqual({ x: 1 });
});

test('only the temp file: it is used', async () => {
  memoryFs.files.set('file:///docs/a.json.tmp', '{"x":2}');
  expect(await readJson('a.json')).toEqual({ x: 2 });
});

test('a broken file reads as null', async () => {
  memoryFs.files.set('file:///docs/a.json', 'not json');
  expect(await readJson('a.json')).toBeNull();
  expect(await readJson('missing.json')).toBeNull();
});

test('a file in a folder: the folder is made', async () => {
  await writeJson('saved/x/scan.json', { a: 1 });
  expect(memoryFs.files.has('file:///docs/saved/x/scan.json')).toBe(true);
  expect(await readJson('saved/x/scan.json')).toEqual({ a: 1 });
});
