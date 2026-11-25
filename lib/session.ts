import { readJson, writeJson } from './jsonFile';

// The session the camera continues (spec §6.3 and §6.9): the invoices taken one after another until Done. The first
// capture opens it, and every scan read in it carries its id. It keeps when it last changed (a capture, a read stored or
// a read that failed), the reads that failed, which have no scan to show them, and a Retake's link to the scan its next
// capture replaces (the plan's call 3), or to the failed read it tries again (ruling T9-5). Done ends it: no capture goes in, and its failed reads stay for the session
// screen Done opens (call 2). It closes when another one starts, 30 minutes after its last change, or when the app
// starts again (call 24); its scans keep its id. It lives in memory, and in session.json, which the next start closes.

/** A read that failed: when (an ISO time), and why in plain words (lib/readFailures), never the scanner's own. */
export type FailedRead = { at: string; reason: string };
export type SessionState = {
  id: string;
  changedAt: string; // ISO: its last capture, stored read or failed read
  open: boolean; // false once Done ended it: no capture goes in, its failed reads stay for its screen
  failed: readonly FailedRead[];
  replaces: string | null; // Retake: the scan its next capture replaces
  // Retake for a read that failed: the `at` of the failed read its next capture tries again (ruling T9-5). A session
  // kept before it has none: read as null.
  retries: string | null;
};

/** A session closes this long after its last change. */
export const IDLE_MS = 30 * 60 * 1000;
const FILE = 'session.json';
let current: SessionState | null = null; // replaced, never changed in place: screens subscribe to it
const listeners = new Set<() => void>();

/** The session from now on. session.json follows it, as a convenience like recent.json: a failed write changes nothing. */
function set(next: SessionState | null): Promise<void> {
  current = next;
  listeners.forEach((listener) => listener());
  return writeJson(FILE, next).catch(() => {});
}

const idle = (s: SessionState, now: Date) => now.getTime() - Date.parse(s.changedAt) >= IDLE_MS;

/** A new session's id: the time it starts, in ms, then 4 random base-36 characters (the plan's call 23). */
export function newSessionId(now: Date): string {
  const suffix = Math.floor(Math.random() * 36 ** 4)
    .toString(36)
    .padStart(4, '0');
  return `${now.getTime()}-${suffix}`;
}

export function currentSession(): SessionState | null {
  return current;
}

/** For useSyncExternalStore: called after each change to the session. */
export function subscribeSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * A capture (a photo, a gallery pick or a PDF): the session it goes in, the scan it replaces after a Retake, and the
 * failed read it tries again after a Retake of one (ruling T9-5). An idle session closes first. An open one is touched,
 * and both of its Retake links are spent; otherwise a new session starts in place
 * of whatever was there, and an ended one's failed reads go with it.
 */
export function takeCapture(now: Date): { session: string; replaces: string | null; retries: string | null } {
  closeIdleSession(now);
  if (current?.open) {
    const { id, replaces } = current;
    const retries = current.retries ?? null;
    void set({ ...current, changedAt: now.toISOString(), replaces: null, retries: null });
    return { session: id, replaces, retries };
  }
  const id = newSessionId(now);
  void set({ id, changedAt: now.toISOString(), open: true, failed: [], replaces: null, retries: null });
  return { session: id, replaces: null, retries: null };
}

/** A read stored in the session: its last change, while it's the current one. */
export function touchSession(id: string, now: Date): void {
  if (current?.id === id) void set({ ...current, changedAt: now.toISOString() });
}

/**
 * A read that failed in the session, with its time and plain words, kept while it's the current one: a change too. A
 * read that tried a failed one again (replacing: that one's `at`) takes its place, with the new time and words, so the
 * count stays; one that's gone by then is added as a new one.
 */
export function addFailedRead(id: string, reason: string, now: Date, replacing?: string | null): void {
  if (current?.id !== id) return;
  const at = now.toISOString();
  const i = replacing == null ? -1 : current.failed.findIndex((f) => f.at === replacing);
  const failed = i < 0 ? [...current.failed, { at, reason }] : current.failed.map((f, j) => (j === i ? { at, reason } : f));
  void set({ ...current, changedAt: at, failed });
}

/**
 * A read that tried a failed one again was stored: that failed read goes (ruling T9-5). Only while it's the current
 * session, and only when the entry is still there.
 */
export function clearFailedRead(id: string, at: string): void {
  if (current?.id !== id || !current.failed.some((f) => f.at === at)) return;
  void set({ ...current, failed: current.failed.filter((f) => f.at !== at) });
}

/** Done: no capture goes in from now on, and a Retake's link is spent. Its failed reads stay for its screen. */
export function endSession(id: string): void {
  if (current?.id === id) void set({ ...current, open: false, replaces: null, retries: null });
}

/**
 * Retake: the scan's session is the camera's again, open, and its next capture replaces the scan. It keeps its failed
 * reads when it's the current one; otherwise the session there closes, with its own.
 */
export function retakeIn(id: string, scanId: string, now: Date): void {
  const failed = current?.id === id ? current.failed : [];
  void set({ id, changedAt: now.toISOString(), open: true, failed, replaces: scanId, retries: null });
}

/**
 * Retake for a read that failed (ruling T9-5): as retakeIn, the session is the camera's again, open, with its failed
 * reads; its next capture tries that failed read (its `at`) again. Stored, the failed read goes; failed again, it takes
 * that one's place.
 */
export function retryIn(id: string, at: string, now: Date): void {
  const failed = current?.id === id ? current.failed : [];
  void set({ id, changedAt: now.toISOString(), open: true, failed, replaces: null, retries: at });
}

/** Closes the session, open or ended, once IDLE_MS have passed since its last change; true when it closed one. */
export function closeIdleSession(now: Date): boolean {
  if (current === null || !idle(current, now)) return false;
  void set(null);
  return true;
}

/**
 * At start, the restart rule: no session is open. One session.json still holds from before closes there too. A start
 * run again in the same JS context (a font-size or display-size change: the plan's call 24) closes the one in memory.
 */
export async function loadSession(): Promise<void> {
  if (current === null && (await readJson<SessionState>(FILE)) === null) return;
  await set(null);
}
