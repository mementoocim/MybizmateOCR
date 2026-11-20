import type { ScanResult } from '../modules/scanner';
import { parseScanResult } from '../modules/scanner/src/parse';
import { coreJson } from '../test-utils/coreJson';

// expo-file-system, in memory: files by URI, and the folders that exist
const mockFiles = new Map<string, string>();
const mockDirs = new Set<string>();
jest.mock('expo-file-system', () => {
  const join = (parts: unknown[]) => parts.map((p) => (typeof p === 'string' ? p : (p as { uri: string }).uri)).join('/');
  class Directory {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = join(parts);
    }
    get exists() {
      return mockDirs.has(this.uri);
    }
  }
  class File {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = join(parts);
    }
    get exists() {
      return mockFiles.has(this.uri);
    }
    async text() {
      return mockFiles.get(this.uri) ?? '';
    }
    async write(content: string) {
      mockFiles.set(this.uri, content);
    }
  }
  return { File, Directory, Paths: { document: new Directory('file:///docs') } };
});

const flush = () => new Promise<void>((resolve) => setTimeout(() => resolve(), 0));

function result(dir: string): ScanResult {
  return parseScanResult(coreJson('inv_0007', dir));
}

beforeEach(() => {
  mockFiles.clear();
  mockDirs.clear();
  jest.resetModules();
});

test('keeps the newest 6, newest first', () => {
  const { addScan, getScan, recentScans } = require('../lib/scans');
  const ids = [1, 2, 3, 4, 5, 6, 7].map((i) => addScan({ label: `Scan ${i}`, source: 'gallery', result: result(`/s/${i}`) }));
  const recent = recentScans();
  expect(recent).toHaveLength(6);
  expect(recent[0].label).toBe('Scan 7');
  expect(recent[5].label).toBe('Scan 2');
  expect(getScan(ids[0])).toBeUndefined();
  expect(getScan(ids[6])?.label).toBe('Scan 7');
});

test('saves the list and loads it back, without scans whose folder is gone', async () => {
  const first = require('../lib/scans');
  first.addScan({ label: 'Photo from gallery', source: 'gallery', result: result('/s/a') });
  first.addScan({ label: 'Sample 0007', source: 'sample', sampleId: 'inv_0007', result: result('/s/b') });
  await flush();
  expect(mockFiles.has('file:///docs/recent.json')).toBe(true);
  mockDirs.add('file:///s/b'); // the system kept only b's folder
  jest.resetModules();
  const second = require('../lib/scans');
  expect(second.recentScans()).toEqual([]);
  await second.loadRecent();
  const loaded = second.recentScans();
  expect(loaded).toHaveLength(1);
  expect(loaded[0].label).toBe('Sample 0007');
  expect(loaded[0].sampleId).toBe('inv_0007');
  expect(loaded[0].at).toBeInstanceOf(Date);
  expect(loaded[0].result.reads[0].text).toBe('0007655');
});
