import { parseScanResult } from '../modules/scanner/src/parse';
import { coreJson } from '../test-utils/coreJson';
import { memoryFs } from '../test-utils/memoryFs';
import { pinToday } from '../test-utils/today';

jest.mock('expo-file-system', () => require('../test-utils/memoryFs').memoryFs.module);

// lib/startup's loadAppData: what the app keeps on the phone, read back at start. The splash's Try again runs the whole
// start again after one that failed partway (design B §9.1), so each store replaces what it holds with what its file
// says, and never adds to it: run again, no recent scan, saved row, party or item is there twice.

// The made-up lists (fixtures/lists).
const PARTIES: string = require('fs').readFileSync('fixtures/lists/parties.csv', 'utf8');
const ITEMS: string = require('fs').readFileSync('fixtures/lists/items.csv', 'utf8');
const DETAILS = { taxType: 'VAT', account: '4010', terms: 'account', atc: 'WC158' } as const;
const INDEX = 'file:///docs/saved.json';
const SESSION_FILE = 'file:///docs/session.json';

const flush = () => new Promise<void>((resolve) => setTimeout(() => resolve(), 0));

type Modules = {
  startup: typeof import('../lib/startup');
  jsonFile: typeof import('../lib/jsonFile');
  scans: typeof import('../lib/scans');
  saved: typeof import('../lib/saved');
  lists: typeof import('../lib/lists');
  settings: typeof import('../lib/settings');
  session: typeof import('../lib/session');
};
const load = (): Modules => ({
  startup: require('../lib/startup'),
  jsonFile: require('../lib/jsonFile'),
  scans: require('../lib/scans'),
  saved: require('../lib/saved'),
  lists: require('../lib/lists'),
  settings: require('../lib/settings'),
  session: require('../lib/session'),
});

/** A camera scan of Sample 0007 whose files are in the scanner's folder, as the core writes them. */
function cameraScan(m: Modules, dir: string, session?: string): string {
  const result = parseScanResult(coreJson('inv_0007', dir));
  for (const uri of [result.pageUri, result.originalUri, ...result.reads.map((r) => r.cropUri)]) {
    memoryFs.files.set(uri!, 'image');
  }
  return m.scans.addScan({ label: 'Camera photo', source: 'camera', result, session });
}

beforeAll(() => pinToday(new Date(2026, 10, 18, 10, 0)));
afterAll(() => jest.useRealTimers());

beforeEach(() => {
  memoryFs.reset();
  jest.resetModules();
});

test('run again after a start that failed partway, nothing is there twice', async () => {
  // What the app kept: the lists, two recent scans saved as sales (so the settings hold the account), and the second
  // save cut short by a kill before its summary was written, so the next start finds it again and writes it down.
  const before = load();
  await before.lists.importPartiesCsv(PARTIES, 'customer');
  await before.lists.importItemsCsv(ITEMS);
  const first = cameraScan(before, 'file:///docs/scans/1');
  const second = cameraScan(before, 'file:///docs/scans/2');
  await before.saved.saveScan(first, DETAILS);
  await before.saved.saveScan(second, DETAILS);
  const index = JSON.parse(memoryFs.files.get(INDEX) as string) as { id: string }[];
  memoryFs.files.set(INDEX, JSON.stringify(index.filter((s) => s.id !== second)));
  const { parties, items } = before.lists.lists();

  // The next start: the phone is full, so saved.json can't be written, and the start fails after the stores have loaded.
  jest.resetModules();
  const m = load();
  const write = m.jsonFile.writeJson;
  let full = true;
  jest.spyOn(m.jsonFile, 'writeJson').mockImplementation((path, value) =>
    full && path === 'saved.json' ? Promise.reject(new Error('No space left on the phone')) : write(path, value),
  );
  await expect(m.startup.loadAppData()).rejects.toThrow('No space left on the phone');
  expect(m.scans.recentScans()).toHaveLength(2); // read already

  const once = () => {
    expect(m.scans.recentScans().map((s) => s.id)).toEqual([second, first]);
    expect(m.saved.savedList().map((s) => s.id).sort()).toEqual([first, second].sort());
    expect(m.lists.lists().parties.map((p) => p.id)).toEqual(parties.map((p) => p.id));
    expect(m.lists.lists().items.map((i) => i.id)).toEqual(items.map((i) => i.id));
    expect(m.settings.settings()).toMatchObject({ revenueAccount: '4010', atc: 'WC158' });
  };
  // Try again: once each
  full = false;
  await m.startup.loadAppData();
  once();
  expect(JSON.parse(memoryFs.files.get(INDEX) as string)).toHaveLength(2); // the cut-short save written down

  // and again, with nothing left to find: still once each
  await m.startup.loadAppData();
  once();
});

test('a session open when the app stopped is closed at the next start; its scans keep their session', async () => {
  const before = load();
  const { session } = before.session.takeCapture(new Date());
  const id = cameraScan(before, 'file:///docs/scans/1', session);
  await flush(); // recent.json and session.json are written before the app stops
  expect(JSON.parse(memoryFs.files.get(SESSION_FILE) as string)).toMatchObject({ id: session, open: true });

  jest.resetModules(); // the next start
  const m = load();
  await m.startup.loadAppData();
  expect(m.session.currentSession()).toBeNull();
  expect(memoryFs.files.get(SESSION_FILE)).toBe('null');
  expect(m.scans.getScan(id)?.session).toBe(session);
});
