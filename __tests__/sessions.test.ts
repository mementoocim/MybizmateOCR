import { act, renderHook } from '@testing-library/react-native';

import type { Capture } from '../lib/captureQueue';
import { certOf, is2307 } from '../lib/cert';
import { formatClock, monthDay } from '../lib/format';
import { clearItems, clearParties, type Lists, lists } from '../lib/lists';
import { isInvoice, saleOf } from '../lib/sale';
import { markExported, type SavedSummary, savedSummary, saveScan } from '../lib/saved';
import { addScan, forgetScan, getScan, type ScanSource, setEdit, type StoredScan, updateScan } from '../lib/scans';
import { type ScanState, scanStateOf } from '../lib/scanState';
import {
  byDay,
  cardLine,
  countLine,
  dayTitle,
  homeCounts,
  type Member,
  membersOf,
  nextToCheck,
  oldestWithWork,
  rowTitle,
  savedSub,
  scanBadge,
  scanFields,
  scanSub,
  scanTimeOf,
  type Session,
  sessionBadges,
  sessionsOf,
  sessionTitle,
  type Status,
  statusOf,
  type Tally,
  tallyOf,
  trayOf,
  useSessions,
} from '../lib/sessions';
import { settings, updateSettings } from '../lib/settings';
import type { ScanResult } from '../modules/scanner';
import { parseScanResult } from '../modules/scanner/src/parse';
import { coreJson } from '../test-utils/coreJson';
import { memoryFs } from '../test-utils/memoryFs';
import { party } from '../test-utils/packLists';
import { pinToday } from '../test-utils/today';

// Spec §6.4, §6.5's count and §6.6, and the plan's calls 9 to 12: the sessions the scans make, newest first under day
// headers; their counts, badges and lines; the next one to check; the camera's tray; and a scan's fields for search.
// Scans from before camera first (no session id), saved scans past the newest 100, and the samples still group
// (Review Focus 2). The data is made up.

jest.mock('expo-file-system', () => require('../test-utils/memoryFs').memoryFs.module);

const TODAY = new Date(2026, 10, 24, 10, 0); // Tuesday, Nov 24, 2026, 10:00 AM
const at = (day: number, h: number, m: number, year = 2026) => new Date(year, 10, day, h, m);
const DETAILS = { taxType: 'VAT', account: '4010', terms: 'account', atc: 'WC158' } as const;

/** A fixture's scan, read as of when it was taken (today, by default), in the session given, if any. */
function scanOf(
  stem: string,
  opts: {
    source?: ScanSource;
    session?: string;
    at?: Date;
    label?: string;
    edit?: (r: ScanResult) => ScanResult;
    change?: Parameters<typeof updateScan>[1];
  } = {},
): StoredScan {
  const read = parseScanResult(coreJson(stem));
  const id = addScan({
    label: opts.label ?? 'Camera photo',
    source: opts.source ?? 'camera',
    result: opts.edit ? opts.edit(read) : read,
    session: opts.session, // undefined, as a key: the scan in memory has it, the one reloaded from recent.json not
    at: opts.at,
  });
  if (opts.change) updateScan(id, opts.change);
  return getScan(id)!;
}

/** A scan as recent.json gives it back after a reload: with no session key at all. */
function reloaded(scan: StoredScan): StoredScan {
  const copy: Partial<StoredScan> = { ...scan };
  delete copy.session;
  return copy as StoredScan;
}

/** The scan as one session's member. */
const member = (scan: StoredScan, summary: SavedSummary | null = null): Member =>
  membersOf([scan], summary ? [summary] : [])[0];

const checksOf = (scan: StoredScan) =>
  isInvoice(scan) ? saleOf(scan, lists(), settings()) : is2307(scan) ? certOf(scan, lists(), settings()) : null;
const stateOf = (scan: StoredScan): ScanState => scanStateOf(scan, checksOf(scan), false);

const statuses = (pairs: [Member | StoredScan, Status][]) => new Map(pairs.map(([m, s]) => [m.id, s] as const));
const NONE: Tally = { ready: 0, toCheck: 0, retake: 0, saved: 0, exported: 0 };
const session = (key: string, when: Date, members: Member[] = []): Session => ({
  key,
  id: key.startsWith('scan:') ? null : key,
  at: when,
  members,
});

beforeAll(() => pinToday(TODAY));
afterAll(() => jest.useRealTimers());

beforeEach(async () => {
  memoryFs.reset();
  await updateSettings({ annotation: false });
  await clearParties('customer');
  await clearParties('supplier');
  await clearItems();
});

test("scans with one session id are one session, at its first scan's time, newest first", () => {
  const first = scanOf('inv_0007', { session: 'S1', at: at(24, 9, 41) });
  const second = scanOf('inv_0051', { session: 'S1', at: at(24, 9, 43) });
  const older = scanOf('svc_0001', { session: 'S2', at: at(24, 8, 0) });
  const newer = scanOf('inv_0007', { session: 'S3', at: at(24, 9, 50) });
  // recent.json's order, newest first, need not be the order taken: a queued photo is kept as of when it was taken
  const sessions = sessionsOf(membersOf([older, newer, second, first], []));
  expect(sessions.map((s) => [s.key, s.id, s.at, s.members.map((m) => m.id)])).toEqual([
    ['S3', 'S3', at(24, 9, 50), [newer.id]],
    ['S1', 'S1', at(24, 9, 41), [first.id, second.id]], // oldest first
    ['S2', 'S2', at(24, 8, 0), [older.id]],
  ]);
  expect(sessions[1].members[0]).toEqual({ id: first.id, session: 'S1', at: at(24, 9, 41), scan: first, summary: null });
});

test('a scan with no session id is a session of its own: scans from before this update, and the samples', () => {
  // Review Focus 2. Kept before camera first: no session key at all, as recent.json gives it back.
  const old1 = reloaded(scanOf('inv_0007', { at: at(20, 14, 15) }));
  const old2 = reloaded(scanOf('inv_0051', { at: at(20, 14, 15) })); // the same time: still two sessions
  const sample = scanOf('inv_0051', { source: 'sample', label: 'Sample 0051', at: at(24, 9, 0) });
  // in memory, a scan with no session has the key, undefined (Task 2's note): the same as having none
  expect(Object.prototype.hasOwnProperty.call(sample, 'session')).toBe(true);
  const sessions = sessionsOf(membersOf([sample, old2, old1], []));
  expect(sessions[0]).toEqual({ key: `scan:${sample.id}`, id: null, at: at(24, 9, 0), members: [member(sample)] });
  expect(sessions.slice(1).map((s) => [s.key, s.id, s.at, s.members.map((m) => m.id)])).toEqual(
    expect.arrayContaining([
      [`scan:${old1.id}`, null, at(20, 14, 15), [old1.id]],
      [`scan:${old2.id}`, null, at(20, 14, 15), [old2.id]],
    ]),
  );
  expect(sessions).toHaveLength(3);
  expect(sessions.every((s) => s.members.every((m) => m.session === null))).toBe(true);

  // undefined and a missing key are the same: neither hides the session its summary has
  const saved = { ...summaryLike(old1), session: 'S9' };
  expect(member({ ...old1, session: undefined }, saved).session).toBe('S9');
  expect(member(reloaded(old1), saved).session).toBe('S9');
  // a session id that's no id is none
  expect(member({ ...old1, session: '' }).session).toBeNull();
});

/** A summary for a scan, as saved.json keeps one: enough of it to group by. */
function summaryLike(scan: StoredScan, change: Partial<SavedSummary> = {}): SavedSummary {
  return {
    id: scan.id,
    label: scan.label,
    partyName: 'Torres Construction Supply',
    partyId: null,
    date: '2026-09-20',
    listed: false,
    savedAt: '2026-11-24T02:00:00.000Z',
    exportedAt: null,
    trainingExportedAt: null,
    session: scan.session,
    kind: 'sale',
    gross: 100,
    row: { 'SI/OR No.': '0007655' },
    ...change,
  } as SavedSummary;
}

test("a saved scan no longer among the recent ones joins its session through its summary, at its id's time", async () => {
  // Review Focus 2, call 12: past the newest 100, a saved scan is a summary alone, dated by its id.
  const kept = scanOf('inv_0007', { session: 'S1', at: at(24, 9, 41) });
  await saveScan(kept.id, DETAILS);
  const summary = savedSummary(kept.id)!;
  expect(summary.session).toBe('S1');
  const gone: SavedSummary = { ...summary, id: `${at(24, 9, 30).getTime()}-7`, savedAt: at(24, 9, 59).toISOString() };
  const later = scanOf('inv_0051', { session: 'S1', at: at(24, 9, 45) });
  const sessions = sessionsOf(membersOf([later], [gone]));
  expect(sessions).toHaveLength(1);
  expect(sessions[0].at).toEqual(at(24, 9, 30));
  expect(sessions[0].members.map((m) => [m.id, m.at, m.scan, m.summary])).toEqual([
    [gone.id, at(24, 9, 30), null, gone],
    [later.id, at(24, 9, 45), later, null],
  ]);

  // an id that doesn't start with its time: its saved time
  expect(scanTimeOf('1763700000000-3', '2026-11-24T02:00:00.000Z')).toEqual(new Date(1763700000000));
  expect(scanTimeOf('legacy', '2026-11-24T02:00:00.000Z')).toEqual(new Date('2026-11-24T02:00:00.000Z'));
  // a summary saved before camera first has no session: a session of its own
  const before: SavedSummary = { ...gone, id: `${at(20, 14, 15).getTime()}-2`, session: undefined };
  const own = sessionsOf(membersOf([], [before]));
  expect(own.map((s) => [s.key, s.id, s.at])).toEqual([[`scan:${before.id}`, null, at(20, 14, 15)]]);
});

test('a scan both recent and saved counts once', async () => {
  const scan = scanOf('inv_0007', { session: 'S1', at: at(24, 9, 41) });
  await saveScan(scan.id, DETAILS);
  const saved = getScan(scan.id)!;
  const members = membersOf([saved], [savedSummary(scan.id)!]);
  expect(members).toEqual([{ id: scan.id, session: 'S1', at: at(24, 9, 41), scan: saved, summary: savedSummary(scan.id) }]);
  expect(sessionsOf(members)[0].members).toHaveLength(1);
});

test('by day: Today, Yesterday, then the date; another year has its year', () => {
  const s = [
    session('a', at(24, 9, 41)),
    session('b', at(24, 8, 0)),
    session('c', at(23, 16, 10)),
    session('d', at(20, 14, 15)),
    session('e', at(20, 9, 0, 2025)),
  ];
  const days = byDay([s[3], s[0], s[4], s[2], s[1]], TODAY);
  expect(days.map((d) => [d.title, d.data.map((x) => x.key)])).toEqual([
    ['Today', ['a', 'b']],
    ['Yesterday', ['c']],
    [monthDay('2026-11-20'), ['d']],
    [`${monthDay('2025-11-20')}, 2025`, ['e']],
  ]);
  // yesterday across a year's end, by the calendar
  expect(dayTitle(new Date(2026, 11, 31, 23, 59), new Date(2027, 0, 1, 0, 1))).toBe('Yesterday');
  expect(dayTitle(new Date(2026, 11, 30, 23, 59), new Date(2027, 0, 1, 0, 1))).toBe(`${monthDay('2026-12-30')}, 2026`);
});

test("a session's lines: 9:41 AM · 3 invoices, 1 invoice, 1 PDF; with no id, Camera photo 4:10 PM", () => {
  const three = sessionsOf(
    membersOf(
      [
        scanOf('inv_0007', { session: 'S1', at: at(24, 9, 41) }),
        scanOf('inv_0051', { session: 'S1', at: at(24, 9, 42) }),
        scanOf('sales_text_0', { session: 'S1', at: at(24, 9, 43), source: 'pdf', label: 'PDF: sales_text_0.pdf' }),
      ],
      [],
    ),
  )[0];
  expect(rowTitle(three)).toBe('9:41 AM · 3 invoices'); // a PDF among photos: invoices
  expect(countLine(three)).toBe('3 invoices');
  const one = sessionsOf(membersOf([scanOf('inv_0007', { session: 'S2', at: at(24, 9, 41) })], []))[0];
  expect(countLine(one)).toBe('1 invoice');
  const pdf = (n: number) => scanOf('sales_text_0', { session: 'P', source: 'pdf', label: 'PDF: a.pdf', at: at(24, 9, n) });
  expect(countLine(sessionsOf(membersOf([pdf(1)], []))[0])).toBe('1 PDF');
  expect(countLine(sessionsOf(membersOf([pdf(2), pdf(3)], []))[0])).toBe('2 PDFs');
  // a summary alone is a PDF by its label
  const alone = summaryLike(pdf(4), { label: 'PDF: a.pdf', session: 'Q' });
  expect(countLine(sessionsOf(membersOf([], [alone]))[0])).toBe('1 PDF');

  const old = reloaded(scanOf('inv_0007', { at: at(23, 16, 10) }));
  expect(rowTitle(sessionsOf(membersOf([old], []))[0])).toBe('Camera photo 4:10 PM');
  const oldPdf = reloaded(scanOf('sales_text_0', { source: 'pdf', label: 'PDF: sales_text_0.pdf', at: at(23, 16, 10) }));
  expect(rowTitle(sessionsOf(membersOf([oldPdf], []))[0])).toBe('sales_text_0.pdf 4:10 PM');
});

test('its title: Today, 9:41 AM; Yesterday, 4:10 PM; Nov 20, 2:15 PM', () => {
  expect(sessionTitle(at(24, 9, 41), TODAY)).toBe('Today, 9:41 AM');
  expect(sessionTitle(at(23, 16, 10), TODAY)).toBe('Yesterday, 4:10 PM');
  expect(sessionTitle(at(20, 14, 15), TODAY)).toBe(`${monthDay('2026-11-20')}, 2:15 PM`);
  expect(sessionTitle(at(20, 14, 15, 2025), TODAY)).toBe(`${monthDay('2025-11-20')}, 2025, 2:15 PM`);
});

test('status: checks passed is ready; a flag or a block is to check; no form is retake; saved; exported', async () => {
  const passed = scanOf('inv_0007');
  const flagged = scanOf('inv_0007', { change: { kind: 'purchase' } }); // no supplier chosen yet
  const blocked = scanOf('bir2307_text_0', {
    source: 'pdf',
    edit: (r) => ({ ...r, reads: r.reads.filter((b) => !b.name.startsWith('ewt')) }),
  });
  const blank = scanOf('blank_page');
  expect([passed, flagged, blocked, blank].map((s) => stateOf(s).kind)).toEqual([
    'passed',
    'to_check',
    'blocked',
    'not_found',
  ]);
  expect([passed, flagged, blocked, blank].map((s) => statusOf(member(s), stateOf(s)))).toEqual([
    'ready',
    'to_check',
    'to_check',
    'retake',
  ]);
  await saveScan(passed.id, DETAILS);
  const saved = member(getScan(passed.id)!, savedSummary(passed.id)!);
  expect(statusOf(saved, stateOf(getScan(passed.id)!))).toBe('saved');
  await markExported([passed.id], TODAY);
  expect(statusOf(member(getScan(passed.id)!, savedSummary(passed.id)!), { kind: 'passed' })).toBe('exported');
  // a summary alone has no state
  expect(statusOf(membersOf([], [savedSummary(passed.id)!])[0], null)).toBe('exported');
});

test('badges: at most two, from N to check, N retake, All saved and Exported', () => {
  const warn = (label: string) => ({ label, tone: 'warning' });
  const table: [Partial<Tally>, { label: string; tone: string }[]][] = [
    [{ ready: 1, toCheck: 2, retake: 1, saved: 3 }, [warn('3 to check'), warn('1 retake')]],
    [{ retake: 2, saved: 1 }, [warn('2 retake')]],
    [{ ready: 1, saved: 2, exported: 1 }, [warn('1 to check')]],
    [{ saved: 2, exported: 1 }, [{ label: 'All saved', tone: 'success' }]],
    [{ exported: 3 }, [{ label: 'Exported', tone: 'neutral' }]],
    [{}, []],
  ];
  for (const [t, badges] of table) expect([t, sessionBadges({ ...NONE, ...t })]).toEqual([t, badges]);

  const a = scanOf('inv_0007', { session: 'T', at: at(24, 9, 1) });
  const b = scanOf('inv_0007', { session: 'T', at: at(24, 9, 2) });
  const c = scanOf('blank_page', { session: 'T', at: at(24, 9, 3) });
  const s = sessionsOf(membersOf([a, b, c], []))[0];
  expect(
    tallyOf(
      s,
      statuses([
        [a, 'ready'],
        [b, 'exported'],
        [c, 'retake'],
      ]),
    ),
  ).toEqual({ ...NONE, ready: 1, retake: 1, exported: 1 });

  // samples count nowhere (call 9, ruling T4-1): a sample's session has no badges and no card line
  const passing = scanOf('inv_0007', { source: 'sample', label: 'Sample 0007', at: at(24, 9, 4) });
  const blankSample = scanOf('blank_page', { source: 'sample', label: 'Sample 0000', at: at(24, 9, 5) });
  const sampleStatuses = statuses([
    [passing, 'ready'],
    [blankSample, 'retake'],
  ]);
  for (const sample of [passing, blankSample]) {
    const own = sessionsOf(membersOf([sample], []))[0];
    expect(tallyOf(own, sampleStatuses)).toEqual(NONE);
    expect(sessionBadges(tallyOf(own, sampleStatuses))).toEqual([]);
    expect(cardLine(tallyOf(own, sampleStatuses), 0)).toBe('');
  }
});

test("the card's line: 1 ready · 1 to check · 1 to retake, failed reads among the retakes; All saved.", () => {
  expect(cardLine({ ...NONE, ready: 1, toCheck: 1, saved: 2 }, 1)).toBe('1 ready · 1 to check · 1 to retake');
  expect(cardLine({ ...NONE, retake: 1, saved: 1 }, 2)).toBe('3 to retake');
  expect(cardLine({ ...NONE, ready: 2, exported: 1 }, 0)).toBe('2 ready');
  expect(cardLine({ ...NONE, saved: 2 }, 0)).toBe('All saved.');
  expect(cardLine({ ...NONE, saved: 1, exported: 1 }, 0)).toBe('All saved.');
  expect(cardLine({ ...NONE, saved: 1 }, 1)).toBe('1 to retake'); // a failed read is left too
  expect(cardLine(NONE, 0)).toBe(''); // nothing at all: no line
});

test('the next to check: the first unsaved scan whose form was found, past a retake and the one open', () => {
  const [r, s, a, b] = [1, 2, 3, 4].map((n) => scanOf('inv_0007', { session: 'N', at: at(24, 9, n) }));
  const session1 = sessionsOf(membersOf([b, a, s, r], []))[0];
  const st = statuses([
    [r, 'retake'],
    [s, 'saved'],
    [a, 'ready'],
    [b, 'to_check'],
  ]);
  expect(nextToCheck(session1, st)).toBe(a.id);
  expect(nextToCheck(session1, st, a.id)).toBe(b.id);
  expect(nextToCheck(session1, st, b.id)).toBe(a.id);
  const done = statuses([
    [r, 'retake'],
    [s, 'saved'],
    [a, 'exported'],
    [b, 'saved'],
  ]);
  expect(nextToCheck(session1, done)).toBeNull();
});

test("Home's counts and the oldest session with something left leave the samples out", () => {
  const sample = scanOf('inv_0007', { source: 'sample', label: 'Sample 0007', at: at(20, 9, 0) });
  const savedOld = scanOf('inv_0007', { session: 'OLD', at: at(21, 9, 0) });
  const left1 = scanOf('inv_0007', { session: 'S1', at: at(22, 9, 0) });
  const left2 = scanOf('blank_page', { session: 'S1', at: at(22, 9, 1) });
  const newest = scanOf('inv_0051', { session: 'S3', at: at(24, 9, 0) });
  const sessions = sessionsOf(membersOf([newest, left2, left1, savedOld, sample], []));
  const st = statuses([
    [sample, 'ready'],
    [savedOld, 'saved'],
    [left1, 'to_check'],
    [left2, 'retake'],
    [newest, 'ready'],
  ]);
  expect(homeCounts(sessions, st)).toEqual({ toCheck: 2, retake: 1 });
  expect(oldestWithWork(sessions, st)?.key).toBe('S1');
  // only retakes left is still something left
  const retakeOnly = new Map<string, Status>([...st, [left1.id, 'saved'], [newest.id, 'exported']]);
  expect(oldestWithWork(sessions, retakeOnly)?.key).toBe('S1');
  // samples alone: nothing
  const samples = sessionsOf(membersOf([sample], []));
  expect(homeCounts(samples, st)).toEqual({ toCheck: 0, retake: 0 });
  expect(oldestWithWork(samples, st)).toBeNull();
});

test('a scan badge: Retake for no form, Saved or Exported once saved, Changed after a change', async () => {
  const blank = scanOf('blank_page');
  const blankSample = scanOf('blank_page', { source: 'sample', label: 'Sample 0000' });
  const NOT_FOUND: ScanState = { kind: 'not_found' };
  expect(scanBadge(member(blank), NOT_FOUND, 'no')).toEqual({ label: 'Retake', tone: 'warning' });
  expect(scanBadge(member(blankSample), NOT_FOUND, 'no')).toEqual({ label: 'Sample', tone: 'neutral' });
  const scan = scanOf('inv_0007');
  expect(scanBadge(member(scan), { kind: 'to_check', problems: ['Date', 'Terms'] }, 'no')).toEqual({
    label: '2 to check',
    tone: 'warning',
  });
  expect(scanBadge(member(scan), { kind: 'blocked', reason: 'x' }, 'no')).toEqual({ label: "Can't save yet", tone: 'warning' });
  expect(scanBadge(member(scan), { kind: 'passed' }, 'no')).toEqual({ label: 'Checks passed', tone: 'success' });

  await saveScan(scan.id, DETAILS);
  const saved = () => member(getScan(scan.id)!, savedSummary(scan.id)!);
  expect(scanBadge(saved(), { kind: 'passed' }, 'unchanged')).toEqual({ label: 'Saved', tone: 'success' });
  expect(scanBadge(saved(), { kind: 'passed' }, 'changed')).toEqual({ label: 'Changed', tone: 'warning' });
  await markExported([scan.id], TODAY);
  expect(scanBadge(saved(), { kind: 'passed' }, 'unchanged')).toEqual({ label: 'Exported', tone: 'neutral' });
  expect(scanBadge(saved(), { kind: 'passed' }, 'changed')).toEqual({ label: 'Changed', tone: 'warning' });
  // a summary alone
  expect(scanBadge(membersOf([], [savedSummary(scan.id)!])[0], null, 'unchanged')).toEqual({
    label: 'Exported',
    tone: 'neutral',
  });
});

test('the tray: read, retake and reading, in the order taken', () => {
  const read = scanOf('inv_0007', { session: 'S1', at: at(24, 9, 41) });
  const retake = scanOf('blank_page', { session: 'S1', at: at(24, 9, 42) });
  const elsewhere = scanOf('inv_0051', { session: 'S2', at: at(24, 9, 40) });
  const capture = (key: string, s: string, when: Date, kind: 'photo' | 'pdf'): Capture => ({
    key,
    session: s,
    at: when,
    kind,
    uri: kind === 'photo' ? `file:///q/${key}.jpg` : 'content://picked/a.pdf',
    source: kind === 'photo' ? 'camera' : 'pdf',
    testImage: false,
    name: kind === 'pdf' ? 'a.pdf' : null,
    replaces: null,
    reading: false,
  });
  const waiting = [
    capture('c1', 'S1', at(24, 9, 44), 'photo'),
    capture('c2', 'S1', at(24, 9, 45), 'pdf'),
    capture('c3', 'S2', at(24, 9, 46), 'photo'),
  ];
  const failed = [{ at: at(24, 9, 43).toISOString(), reason: "It isn't a photo the scanner can open." }];
  const tray = trayOf('S1', [retake, elsewhere, read], waiting, failed);
  expect(tray.map((t) => [t.at, t.image, t.state])).toEqual([
    [at(24, 9, 41), read.result.originalUri, 'read'],
    [at(24, 9, 42), retake.result.originalUri, 'problem'],
    [at(24, 9, 43), null, 'problem'],
    [at(24, 9, 44), 'file:///q/c1.jpg', 'reading'],
    [at(24, 9, 45), null, 'reading'],
  ]);
  expect(read.result.originalUri).not.toBeNull();
  expect(new Set(tray.map((t) => t.key)).size).toBe(tray.length); // keys for a list
  expect(tray[0].key).toBe(read.id);
  expect(tray[3].key).toBe('c1');
});

test("a scan's fields for search: its party, its number and its TIN", async () => {
  const sale = scanOf('inv_0007');
  expect(scanFields(member(sale), lists(), settings())).toEqual({
    name: saleOf(sale, lists(), settings()).party.shown,
    number: '0007655',
    tin: '223-344-556',
  });
  // the box's TIN cleared: the list party's
  const theLists: Lists = { ...lists(), parties: [party({ id: 'p1', registeredName: 'Torres Construction', tin: '111222333' })] };
  const chosen = scanOf('inv_0007', { change: { edits: { customer_tin: '' }, party: { listId: 'p1' } } });
  expect(scanFields(member(chosen), theLists, settings())).toEqual({
    name: 'Torres Construction',
    number: '0007655',
    tin: '111222333',
  });
  // a purchase: its customer_tin box is the buyer's, the person's own business, so only the chosen supplier's TIN
  // counts (ruling T4-2); with none chosen, its name is its label, not "Not chosen yet"
  const supplierLists: Lists = {
    ...lists(),
    parties: [party({ id: 's1', type: 'supplier', registeredName: 'Some Supplier', tin: '999888777' })],
  };
  const bought = scanOf('inv_0007', { change: { kind: 'purchase', party: { listId: 's1' } } });
  expect(scanFields(member(bought), supplierLists, settings())).toEqual({
    name: 'Some Supplier',
    number: '0007655',
    tin: '999888777',
  });
  const unchosen = scanOf('inv_0007', { change: { kind: 'purchase' } });
  expect(saleOf(unchosen, lists(), settings()).party.shown).toBe('Not chosen yet');
  expect(scanFields(member(unchosen), lists(), settings())).toEqual({ name: 'Camera photo', number: '0007655', tin: '' });
  const cert = scanOf('bir2307_text_0', { source: 'pdf', label: 'PDF: bir2307_text_0.pdf' });
  expect(scanFields(member(cert), lists(), settings())).toEqual({
    name: 'Reyes Sari-Sari Store',
    number: '',
    tin: '45678901200000',
  });
  const blank = scanOf('blank_page');
  expect(scanFields(member(blank), lists(), settings())).toEqual({ name: 'Camera photo', number: '', tin: '' });
  // a summary alone: its party and its row's number; no TIN
  await saveScan(sale.id, DETAILS);
  const alone = membersOf([], [savedSummary(sale.id)!])[0];
  expect(scanFields(alone, lists(), settings())).toEqual({ name: savedSummary(sale.id)!.partyName, number: '0007655', tin: '' });
  const purchase = summaryLike(sale, { kind: 'purchase', partyName: 'Some Supplier', row: { 'Inv No.': '0042' } });
  expect(scanFields(membersOf([], [purchase])[0], lists(), settings())).toEqual({
    name: 'Some Supplier',
    number: '0042',
    tin: '',
  });
});

test("a scan's sub-line: Sale · SI 0007655, Purchase · Inv 0007655, 2307 · Q1 2026; the time with no number", async () => {
  // Ruling P-F11: the one helper Sessions and the session screen use for a scan's sub-line
  const sale = scanOf('inv_0007', { at: at(24, 9, 41) });
  expect(scanSub(member(sale))).toBe('Sale · SI 0007655');
  expect(scanSub(member(scanOf('inv_0007', { change: { kind: 'purchase' } })))).toBe('Purchase · Inv 0007655');
  expect(scanSub(member(scanOf('bir2307_text_0', { source: 'pdf' })))).toBe('2307 · Q1 2026');
  expect(scanSub(member(scanOf('inv_0007', { at: at(24, 9, 41), change: { edits: { invoice_no: '' } } })))).toBe(
    'Sale · 9:41 AM',
  );
  expect(scanSub(member(scanOf('blank_page', { at: at(24, 16, 10) })))).toBe(formatClock(at(24, 16, 10)));
  // saved: Saved's sub-line
  await saveScan(sale.id, DETAILS);
  expect(scanSub(member(getScan(sale.id)!, savedSummary(sale.id)!))).toBe(savedSub(savedSummary(sale.id)!));
});

test("Saved's sub-line: kind, date and number; a 2307's quarter", () => {
  const scan = scanOf('inv_0007');
  const day = monthDay('2026-09-20');
  expect(savedSub(summaryLike(scan))).toBe(`Sale · ${day} · SI 0007655`);
  expect(savedSub(summaryLike(scan, { kind: 'purchase', row: { 'Inv No.': '0007' } }))).toBe(`Purchase · ${day} · Inv 0007`);
  expect(savedSub(summaryLike(scan, { row: { 'SI/OR No.': '' } }))).toBe(`Sale · ${day}`);
  expect(savedSub(summaryLike(scan, { kind: '2307', period: 'Q1 2026', tax: 1, rows: [] }))).toBe('2307 · Q1 2026');
});

test('useSessions: the sessions, statuses, states and saved states, as the stores change', async () => {
  const id = scanOf('inv_0007', { session: 'U1', at: at(24, 9, 41) }).id;
  const { result } = await renderHook(() => useSessions());
  const find = () => result.current.sessions.find((s) => s.key === 'U1');
  expect(find()?.members.map((m) => m.id)).toEqual([id]);
  expect(result.current.statuses.get(id)).toBe('ready');
  expect(result.current.states.get(id)).toEqual({ kind: 'passed' });
  expect(result.current.saved.get(id)).toBe('no');

  // the settings: annotation mode blocks it, so it's to check
  await act(async () => updateSettings({ annotation: true }));
  expect(result.current.states.get(id)?.kind).toBe('blocked');
  expect(result.current.statuses.get(id)).toBe('to_check');
  await act(async () => updateSettings({ annotation: false }));

  await act(async () => saveScan(id, DETAILS));
  expect(result.current.statuses.get(id)).toBe('saved');
  expect(result.current.saved.get(id)).toBe('unchanged');
  await act(async () => setEdit(id, 'invoice_no', '0007999'));
  expect(result.current.saved.get(id)).toBe('changed');
  await act(async () => setEdit(id, 'invoice_no', '0007655'));

  // past the newest 100: its summary alone, saved as it was (ruling P-F4)
  await act(async () => forgetScan(id));
  expect(find()?.members.map((m) => [m.id, m.scan, m.summary?.id])).toEqual([[id, null, id]]);
  expect(result.current.statuses.get(id)).toBe('saved');
  expect(result.current.saved.get(id)).toBe('unchanged');
  expect(result.current.states.has(id)).toBe(false);
});

test('a new scan runs the checks for itself only', async () => {
  // Ruling P-F3: the spies are on the uncached work, which runs only when saleOf's or certOf's cache misses
  for (let n = 0; n < 50; n++) scanOf(n % 2 ? 'inv_0007' : 'bir2307_text_0', { session: 'C', at: at(24, 8, n) });
  const { result } = await renderHook(() => useSessions());
  expect(result.current.sessions.find((s) => s.key === 'C')?.members).toHaveLength(50);
  const finalize = jest.spyOn(require('../lib/checks/finalize'), 'finalize');
  const check2307 = jest.spyOn(require('../lib/checks/bir2307'), 'check2307');
  try {
    let id = '';
    await act(async () => {
      id = scanOf('inv_0051', { session: 'C', at: at(24, 9, 0) }).id;
    });
    expect(result.current.statuses.get(id)).toBeDefined();
    expect(finalize).toHaveBeenCalledTimes(1);
    expect(check2307).not.toHaveBeenCalled();
    // and a 2307 runs its own once
    finalize.mockClear();
    await act(async () => {
      scanOf('bir2307_text_0', { session: 'C', at: at(24, 9, 1) });
    });
    expect(finalize).not.toHaveBeenCalled();
    expect(check2307).toHaveBeenCalledTimes(1);
  } finally {
    finalize.mockRestore();
    check2307.mockRestore();
  }
});
