import { memoryFs } from '../test-utils/memoryFs';
import { pinToday } from '../test-utils/today';

jest.mock('expo-file-system', () => require('../test-utils/memoryFs').memoryFs.module);

// lib/session: the session the camera continues (spec §6.3 and §6.9, the plan's calls 2, 3, 23 and 24). The first
// capture opens it and the next ones join it, until Done ends it, another one starts, 30 minutes pass since its last
// change, or the app starts again. It keeps the reads that failed, which have no scan to show them, and a Retake's link
// to the scan its next capture replaces. session.json follows it.

const FILE = 'file:///docs/session.json';
const T = new Date(2026, 10, 24, 9, 41); // the first capture, at 9:41 AM
const MINUTE = 60 * 1000;
const at = (ms: number) => new Date(T.getTime() + ms);
const flush = () => new Promise<void>((resolve) => setTimeout(() => resolve(), 0));
const S = (): typeof import('../lib/session') => require('../lib/session');
const kept = () => JSON.parse(memoryFs.files.get(FILE) as string);

const UNREADABLE = "It isn't a photo the scanner can open.";
const STOPPED = 'The scanner stopped while reading it.';

beforeAll(() => pinToday(T));
afterAll(() => jest.useRealTimers());

beforeEach(async () => {
  await flush(); // the last test's writes land before its files go
  memoryFs.reset();
  jest.resetModules();
});

test('the first capture opens a session; the next ones join it, and session.json follows', async () => {
  const s = S();
  const listener = jest.fn();
  s.subscribeSession(listener);
  expect(s.currentSession()).toBeNull();

  const first = s.takeCapture(T);
  expect(first.session).toMatch(/^[0-9]{13}-[0-9a-z]{4}$/);
  expect(first.session.startsWith(`${T.getTime()}-`)).toBe(true); // the time it started (the plan's call 23)
  expect(first.replaces).toBeNull();
  const opened = s.currentSession();
  expect(opened).toEqual({ id: first.session, changedAt: T.toISOString(), open: true, failed: [], replaces: null, retries: null });

  expect(s.takeCapture(at(MINUTE))).toEqual({ session: first.session, replaces: null, retries: null });
  expect(s.currentSession()).not.toBe(opened); // replaced, never changed in place: screens subscribe to it
  expect(opened?.changedAt).toBe(T.toISOString());
  expect(listener).toHaveBeenCalledTimes(2);

  await flush();
  const { readJson } = require('../lib/jsonFile') as typeof import('../lib/jsonFile');
  expect(await readJson('session.json')).toEqual({
    id: first.session,
    changedAt: at(MINUTE).toISOString(),
    open: true,
    failed: [],
    replaces: null,

    retries: null,
  });
});

test("Done ends it: the next capture opens another, and the ended one's failed reads go", async () => {
  const s = S();
  const { session: a } = s.takeCapture(T);
  s.addFailedRead(a, UNREADABLE, at(MINUTE));
  s.endSession('another'); // not this one: nothing changes
  expect(s.currentSession()?.open).toBe(true);

  s.endSession(a);
  // ended, its failed read still there for the session screen Done opens (the plan's call 2)
  expect(s.currentSession()).toEqual({
    id: a,
    changedAt: at(MINUTE).toISOString(),
    open: false,
    failed: [{ at: at(MINUTE).toISOString(), reason: UNREADABLE }],
    replaces: null,

    retries: null,
  });

  const next = s.takeCapture(at(2 * MINUTE));
  expect(next.session).not.toBe(a);
  expect(next.replaces).toBeNull();
  expect(s.currentSession()).toEqual({
    id: next.session,
    changedAt: at(2 * MINUTE).toISOString(),
    open: true,
    failed: [],
    replaces: null,

    retries: null,
  });
  await flush();
  expect(kept()).toEqual(s.currentSession());
});

test('a failed read is kept, with its time and words, only while its session is the current one', async () => {
  const s = S();
  const { session: a } = s.takeCapture(T);
  s.addFailedRead(a, STOPPED, at(MINUTE));
  expect(s.currentSession()).toMatchObject({
    changedAt: at(MINUTE).toISOString(), // a failed read is a change: its 30 minutes start again
    failed: [{ at: at(MINUTE).toISOString(), reason: STOPPED }],
  });

  const before = s.currentSession();
  const listener = jest.fn();
  s.subscribeSession(listener);
  s.addFailedRead('other', STOPPED, at(2 * MINUTE));
  s.touchSession('other', at(2 * MINUTE));
  expect(s.currentSession()).toBe(before);
  expect(listener).not.toHaveBeenCalled();

  // a read that ends after Done is still its session's
  s.endSession(a);
  s.addFailedRead(a, UNREADABLE, at(3 * MINUTE));
  expect(s.currentSession()?.failed).toEqual([
    { at: at(MINUTE).toISOString(), reason: STOPPED },
    { at: at(3 * MINUTE).toISOString(), reason: UNREADABLE },
  ]);

  // once another session is the current one, an old one's failed read is kept nowhere
  const { session: b } = s.takeCapture(at(4 * MINUTE));
  s.addFailedRead(a, STOPPED, at(5 * MINUTE));
  expect(s.currentSession()).toMatchObject({ id: b, failed: [] });
  await flush();
  expect(kept()).toMatchObject({ id: b, failed: [] });
});

test('30 minutes after its last change, it closes by itself', async () => {
  const s = S();
  const { session: a } = s.takeCapture(T);
  const t = at(10 * MINUTE);
  s.touchSession(a, t); // a read stored: its last change
  expect(s.currentSession()?.changedAt).toBe(t.toISOString());
  expect(s.closeIdleSession(new Date(t.getTime() + s.IDLE_MS - 1))).toBe(false);
  expect(s.currentSession()?.id).toBe(a);
  expect(s.closeIdleSession(new Date(t.getTime() + s.IDLE_MS))).toBe(true);
  expect(s.currentSession()).toBeNull();
  expect(s.closeIdleSession(new Date(t.getTime() + 2 * s.IDLE_MS))).toBe(false); // nothing left to close

  // a capture after that idle starts another
  const u = at(60 * MINUTE);
  const { session: b } = s.takeCapture(u);
  const { session: c } = s.takeCapture(new Date(u.getTime() + s.IDLE_MS));
  expect(c).not.toBe(b);
  expect(s.currentSession()).toMatchObject({ id: c, open: true });

  // an ended one closes the same way, and its failed reads go
  s.addFailedRead(c, STOPPED, new Date(u.getTime() + s.IDLE_MS));
  s.endSession(c);
  expect(s.closeIdleSession(new Date(u.getTime() + 2 * s.IDLE_MS))).toBe(true);
  expect(s.currentSession()).toBeNull();
  await flush();
  expect(memoryFs.files.get(FILE)).toBe('null');
});

test('a restart closes it', async () => {
  // a start with no session kept writes nothing
  await S().loadSession();
  expect(memoryFs.files.has(FILE)).toBe(false);

  // a font-size or display-size change runs the start again in the same JS context: it closes the one in memory, its
  // write under way or not (the plan's call 24)
  const first = S();
  first.takeCapture(T);
  const listener = jest.fn();
  first.subscribeSession(listener);
  await first.loadSession();
  expect(first.currentSession()).toBeNull();
  expect(listener).toHaveBeenCalledTimes(1);
  expect(memoryFs.files.get(FILE)).toBe('null');

  // the app stopped with one open
  const { session } = first.takeCapture(at(MINUTE));
  await flush();
  expect(kept()).toMatchObject({ id: session, open: true });
  jest.resetModules();
  const second = S();
  await second.loadSession();
  expect(second.currentSession()).toBeNull();
  expect(memoryFs.files.get(FILE)).toBe('null');
});

test("a write that fails changes nothing in memory, as recent.json's doesn't", async () => {
  const s = S();
  const { File } = require('expo-file-system'); // the one lib/jsonFile uses until the next reset
  jest.spyOn(File.prototype, 'write').mockRejectedValueOnce(new Error('No space left on device'));
  const { session } = s.takeCapture(T);
  await flush();
  expect(s.currentSession()).toMatchObject({ id: session, open: true });
  expect(memoryFs.files.has(FILE)).toBe(false);
  s.touchSession(session, at(MINUTE)); // the next change is written
  await flush();
  expect(kept()).toMatchObject({ id: session, changedAt: at(MINUTE).toISOString() });
});

test("Retake: that session is the camera's again, and its next capture replaces the scan, once", async () => {
  const s = S();
  const b = s.newSessionId(at(-60 * MINUTE)); // a session from an hour ago, closed since
  const { session: a } = s.takeCapture(T);
  s.addFailedRead(a, STOPPED, T);

  // with A open, a Retake in B closes A, with its failed read
  s.retakeIn(b, 'scan-1', at(MINUTE));
  expect(s.currentSession()).toEqual({
    id: b,
    changedAt: at(MINUTE).toISOString(),
    open: true,
    failed: [],
    replaces: 'scan-1',

    retries: null,
  });
  expect(s.takeCapture(at(2 * MINUTE))).toEqual({ session: b, replaces: 'scan-1', retries: null });
  expect(s.takeCapture(at(3 * MINUTE))).toEqual({ session: b, replaces: null, retries: null });

  // a B that Done had ended keeps its failed reads
  s.addFailedRead(b, UNREADABLE, at(4 * MINUTE));
  s.endSession(b);
  s.retakeIn(b, 'scan-2', at(5 * MINUTE));
  expect(s.currentSession()).toEqual({
    id: b,
    changedAt: at(5 * MINUTE).toISOString(),
    open: true,
    failed: [{ at: at(4 * MINUTE).toISOString(), reason: UNREADABLE }],
    replaces: 'scan-2',

    retries: null,
  });

  // Done before that capture spends the link
  s.endSession(b);
  expect(s.currentSession()).toMatchObject({ open: false, replaces: null });
  const after = s.takeCapture(at(6 * MINUTE));
  expect(after.session).not.toBe(b);
  expect(after.replaces).toBeNull();
  await flush();
  expect(kept()).toEqual(s.currentSession());
});

test("Retake of a read that failed: the camera's session again, with its failed reads; the next capture tries it, once", async () => {
  // ruling T9-5
  const s = S();
  const { session: a } = s.takeCapture(T);
  s.addFailedRead(a, STOPPED, at(MINUTE));
  s.addFailedRead(a, UNREADABLE, at(2 * MINUTE));
  s.endSession(a); // Done: its screen shows them
  const failed = s.currentSession()!.failed;

  s.retryIn(a, failed[0].at, at(3 * MINUTE));
  expect(s.currentSession()).toEqual({
    id: a,
    changedAt: at(3 * MINUTE).toISOString(),
    open: true,
    failed,
    replaces: null,
    retries: failed[0].at,
  });
  expect(s.takeCapture(at(4 * MINUTE))).toEqual({ session: a, replaces: null, retries: failed[0].at });
  expect(s.takeCapture(at(5 * MINUTE))).toEqual({ session: a, replaces: null, retries: null }); // spent

  // failed again: in its place, with its new time and words
  s.addFailedRead(a, UNREADABLE, at(6 * MINUTE), failed[0].at);
  expect(s.currentSession()?.failed).toEqual([{ at: at(6 * MINUTE).toISOString(), reason: UNREADABLE }, failed[1]]);
  // one gone by then is a new one
  s.addFailedRead(a, STOPPED, at(7 * MINUTE), 'gone');
  expect(s.currentSession()?.failed).toHaveLength(3);
  // stored: it goes; one that isn't there, or another session's, changes nothing
  s.clearFailedRead(a, failed[1].at);
  expect(s.currentSession()?.failed.map((f) => f.at)).toEqual([at(6 * MINUTE).toISOString(), at(7 * MINUTE).toISOString()]);
  const before = s.currentSession();
  s.clearFailedRead(a, 'gone');
  s.clearFailedRead('other', at(6 * MINUTE).toISOString());
  expect(s.currentSession()).toBe(before);

  // Done spends it, and so does a Retake of a scan; a new session starts with none
  s.retryIn(a, at(6 * MINUTE).toISOString(), at(8 * MINUTE));
  s.endSession(a);
  expect(s.currentSession()).toMatchObject({ open: false, retries: null });
  s.retryIn(a, at(6 * MINUTE).toISOString(), at(9 * MINUTE));
  s.retakeIn(a, 'scan-1', at(9 * MINUTE));
  expect(s.currentSession()).toMatchObject({ replaces: 'scan-1', retries: null });
  s.endSession(a);
  expect(s.takeCapture(at(10 * MINUTE))).toMatchObject({ replaces: null, retries: null });
  expect(s.currentSession()).toMatchObject({ failed: [], retries: null });
  await flush();
  expect(kept()).toEqual(s.currentSession());
});

test('a session.json from before retries loads: closed, as every start closes it', async () => {
  // data persists across updates: one kept by the last version has no `retries`
  memoryFs.files.set(
    FILE,
    JSON.stringify({
      id: '1795484460000-u5t9',
      changedAt: T.toISOString(),
      open: true,
      failed: [{ at: T.toISOString(), reason: STOPPED }],
      replaces: 'scan-1',
    }),
  );
  const s = S();
  await s.loadSession();
  expect(s.currentSession()).toBeNull();
  expect(memoryFs.files.get(FILE)).toBe('null');
  const next = s.takeCapture(at(MINUTE));
  expect(next).toMatchObject({ replaces: null, retries: null });
});
