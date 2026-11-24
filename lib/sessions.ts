import { useMemo, useSyncExternalStore } from 'react';

import type { BadgeSpec } from './badge';
import type { Capture } from './captureQueue';
import { certOf, is2307, periodName } from './cert';
import { localIsoDate } from './checks/dates';
import { formatClock, monthDay } from './format';
import { type Lists, lists, subscribeLists } from './lists';
import { boxValue, isInvoice, saleOf } from './sale';
import { type SavedSummary, savedList, subscribeSaved } from './saved';
import { recentScans, type StoredScan, subscribeRecent } from './scans';
import { homeBadge, type SavedState, type ScanState, savedStateOf, scanStateOf, shownLabel } from './scanState';
import type { FailedRead } from './session';
import { annotationOn, type Settings, settings, subscribeSettings } from './settings';

// The sessions the scans make (spec §6.4, §6.5's count and §6.6; the plan's calls 9 to 12): the scans taken one after
// another until Done, grouped by the session id each carries. A scan with none is a session of its own: every scan kept
// or saved before camera first, and the samples (Review Focus 2). A saved scan no longer among the newest 100 joins its
// session through its summary, dated by its id (call 12). From them: Sessions' rows by day, their badges and lines, the
// session screen's card and its next scan to check, Home's counts, the camera's tray, and a scan's fields for search.

/** One scan in a session: a recent scan (with its summary, once it's saved), or a saved scan's summary alone. */
export type Member = { id: string; session: string | null; at: Date; scan: StoredScan | null; summary: SavedSummary | null };
/** Ruling P-F11's name for a member. */
export type SessionMember = Member;
/** key: the session id, or `scan:${id}` for a scan with none; at: its first scan's time; members oldest first. */
export type Session = { key: string; id: string | null; at: Date; members: readonly Member[] };
export type Status = 'ready' | 'to_check' | 'retake' | 'saved' | 'exported';
export type Tally = { ready: number; toCheck: number; retake: number; saved: number; exported: number };
/** A thumbnail in the camera's tray: a scan read, a read that failed (problem), or a capture still being read. */
export type TrayItem = { key: string; at: Date; image: string | null; state: 'reading' | 'read' | 'problem' };

const ID_TIME = /^(\d+)-/;

/** The ms a scan's id starts with ("1763700000000-3" is when it was read), else the fallback (an ISO time). */
export function scanTimeOf(id: string, fallbackIso: string): Date {
  const match = ID_TIME.exec(id);
  const fromId = match ? new Date(Number(match[1])) : null;
  if (fromId && !Number.isNaN(fromId.getTime())) return fromId;
  const fallback = new Date(fallbackIso);
  return Number.isNaN(fallback.getTime()) ? new Date(0) : fallback;
}

/**
 * A session id, or none. A scan kept with no session has the key undefined in memory but none at all once reloaded
 * (Task 2's note), so this never asks whether the key is there: undefined, a missing key and an empty id are all none.
 */
const idOf = (session: unknown): string | null => (typeof session === 'string' && session !== '' ? session : null);

/** One member per id: each recent scan, with its summary when it's saved; then each saved scan's summary alone. */
export function membersOf(recent: readonly StoredScan[], saved: readonly SavedSummary[]): Member[] {
  const summaries = new Map(saved.map((s) => [s.id, s]));
  const members = new Map<string, Member>();
  for (const scan of recent) {
    if (members.has(scan.id)) continue;
    const summary = summaries.get(scan.id) ?? null;
    members.set(scan.id, { id: scan.id, session: idOf(scan.session) ?? idOf(summary?.session), at: scan.at, scan, summary });
  }
  for (const summary of saved) {
    if (members.has(summary.id)) continue;
    const at = scanTimeOf(summary.id, summary.savedAt);
    members.set(summary.id, { id: summary.id, session: idOf(summary.session), at, scan: null, summary });
  }
  return [...members.values()];
}

const oldestFirst = (a: { at: Date }, b: { at: Date }) => a.at.getTime() - b.at.getTime();

/** The members as sessions, newest first: by their session id, and each one with none on its own. */
export function sessionsOf(members: readonly Member[]): Session[] {
  const groups = new Map<string, Member[]>();
  for (const m of members) {
    const key = m.session ?? `scan:${m.id}`;
    const group = groups.get(key);
    if (group) group.push(m);
    else groups.set(key, [m]);
  }
  const sessions: Session[] = [...groups].map(([key, group]) => {
    const sorted = [...group].sort(oldestFirst);
    return { key, id: sorted[0].session, at: sorted[0].at, members: sorted };
  });
  return sessions.sort((a, b) => oldestFirst(b, a));
}

/** A member's status: a saved one's, else its state's. No form is a retake; a flag or a block is to check. */
export function statusOf(m: Member, state: ScanState | null): Status {
  if (m.summary) return m.summary.exportedAt ? 'exported' : 'saved';
  switch (state?.kind) {
    case 'passed':
      return 'ready';
    case 'to_check':
    case 'blocked':
      return 'to_check';
    default:
      return 'retake';
  }
}

/** What's in a session, by status. A member with no status (none computed yet) counts nowhere. */
export function tallyOf(s: Session, statuses: ReadonlyMap<string, Status>): Tally {
  const t: Tally = { ready: 0, toCheck: 0, retake: 0, saved: 0, exported: 0 };
  for (const m of s.members) {
    const status = statuses.get(m.id);
    if (status === 'ready') t.ready++;
    else if (status === 'to_check') t.toCheck++;
    else if (status === 'retake') t.retake++;
    else if (status === 'saved') t.saved++;
    else if (status === 'exported') t.exported++;
  }
  return t;
}

const left = (t: Tally) => t.ready + t.toCheck + t.retake;

/**
 * A session's badges on Sessions, at most two: Exported once every scan went out; All saved once every one is saved;
 * else "N to check" (call 9: every unsaved scan whose form was found) and "N retake".
 */
export function sessionBadges(t: Tally): BadgeSpec[] {
  if (left(t) === 0) {
    if (t.exported > 0 && t.saved === 0) return [{ label: 'Exported', tone: 'neutral' }];
    return t.saved > 0 ? [{ label: 'All saved', tone: 'success' }] : [];
  }
  const badges: BadgeSpec[] = [];
  if (t.ready + t.toCheck > 0) badges.push({ label: `${t.ready + t.toCheck} to check`, tone: 'warning' });
  if (t.retake > 0) badges.push({ label: `${t.retake} retake`, tone: 'warning' });
  return badges;
}

/** The session card's title: "1 ready · 1 to check · 1 to retake", failed reads among the retakes; or "All saved." */
export function cardLine(t: Tally, failed: number): string {
  const parts = [
    [t.ready, 'ready'],
    [t.toCheck, 'to check'],
    [t.retake + failed, 'to retake'],
  ] as const;
  const line = parts
    .filter(([n]) => n > 0)
    .map(([n, what]) => `${n} ${what}`)
    .join(' · ');
  return line === '' && t.saved + t.exported > 0 ? 'All saved.' : line;
}

/** Whether a member came from a PDF: a scan by its source, a summary alone by its label ("PDF: <file name>"). */
const fromPdf = (m: Member) => (m.scan ? m.scan.source === 'pdf' : (m.summary?.label ?? '').startsWith('PDF'));

/** "3 invoices", "1 invoice"; "1 PDF", "2 PDFs" when every one came from a PDF. */
export function countLine(s: Session): string {
  const n = s.members.length;
  const pdfs = n > 0 && s.members.every(fromPdf);
  return `${n} ${pdfs ? 'PDF' : 'invoice'}${n === 1 ? '' : 's'}`;
}

/** A member's label as the screens show it (shownLabel): a PDF's is its file's name. */
const labelOf = (m: Member) => shownLabel({ label: m.scan?.label ?? m.summary?.label ?? '' });

/** A row's title on Sessions: "9:41 AM · 3 invoices"; a scan with no session, today's label: "Camera photo 4:10 PM". */
export function rowTitle(s: Session): string {
  if (s.id === null) return `${labelOf(s.members[0])} ${formatClock(s.at)}`;
  return `${formatClock(s.at)} · ${countLine(s)}`;
}

/** The calendar day before, on the phone's clock. */
const dayBefore = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);

/** A day's header: "Today", "Yesterday", "Nov 20"; in another year, "Nov 20, 2025". */
export function dayTitle(at: Date, today: Date): string {
  const day = localIsoDate(at);
  if (day === localIsoDate(today)) return 'Today';
  if (day === localIsoDate(dayBefore(today))) return 'Yesterday';
  return at.getFullYear() === today.getFullYear() ? monthDay(day) : `${monthDay(day)}, ${at.getFullYear()}`;
}

/** The session screen's title: "Today, 9:41 AM", "Yesterday, 4:10 PM", "Nov 20, 2:15 PM". */
export function sessionTitle(at: Date, today: Date): string {
  return `${dayTitle(at, today)}, ${formatClock(at)}`;
}

/** Sessions' sections: one per day, newest first, each day's sessions newest first. */
export function byDay(sessions: readonly Session[], today: Date): { title: string; data: Session[] }[] {
  const days: { day: string; title: string; data: Session[] }[] = [];
  for (const s of [...sessions].sort((a, b) => oldestFirst(b, a))) {
    const day = localIsoDate(s.at);
    const last = days.at(-1);
    if (last?.day === day) last.data.push(s);
    else days.push({ day, title: dayTitle(s.at, today), data: [s] });
  }
  return days.map(({ title, data }) => ({ title, data }));
}

const toCheck = (status: Status | undefined) => status === 'ready' || status === 'to_check';

/** The session's next scan to check: the first, oldest first, that isn't saved and whose form was found; not except. */
export function nextToCheck(s: Session, statuses: ReadonlyMap<string, Status>, except?: string): string | null {
  return s.members.find((m) => m.id !== except && toCheck(statuses.get(m.id)))?.id ?? null;
}

/** Samples are made up: they count nowhere (call 9). */
const isSample = (m: Member) => m.scan?.source === 'sample';

/** Home's counts (§6.5, call 9): the unsaved scans whose form was found, and the ones to retake; no samples. */
export function homeCounts(
  sessions: readonly Session[],
  statuses: ReadonlyMap<string, Status>,
): { toCheck: number; retake: number } {
  const counts = { toCheck: 0, retake: 0 };
  for (const m of sessions.flatMap((s) => s.members)) {
    if (isSample(m)) continue;
    const status = statuses.get(m.id);
    if (toCheck(status)) counts.toCheck++;
    else if (status === 'retake') counts.retake++;
  }
  return counts;
}

/** Home's Check now (§6.5): the oldest session with a scan left to check or to retake; samples aren't one. */
export function oldestWithWork(sessions: readonly Session[], statuses: ReadonlyMap<string, Status>): Session | null {
  const work = (m: Member) => !isSample(m) && (toCheck(statuses.get(m.id)) || statuses.get(m.id) === 'retake');
  return [...sessions].sort(oldestFirst).find((s) => s.members.some(work)) ?? null;
}

/**
 * A scan's badge (call 10): design B's homeBadge, except that a form not found reads Retake, and a saved scan reads
 * Saved (success) or Exported (neutral). Changed, after a change since the save, stays. saved: useSessions' saved
 * state (ruling P-F4).
 */
export function scanBadge(m: Member, state: ScanState | null, saved: SavedState): BadgeSpec {
  if (m.summary && saved === 'changed') return { label: 'Changed', tone: 'warning' };
  if (m.summary) return m.summary.exportedAt ? { label: 'Exported', tone: 'neutral' } : { label: 'Saved', tone: 'success' };
  const theState: ScanState = state ?? { kind: 'not_found' };
  if (!m.scan) return { label: 'Retake', tone: 'warning' }; // no scan and no summary: never made by membersOf
  if (theState.kind === 'not_found' && m.scan.source !== 'sample') return { label: 'Retake', tone: 'warning' };
  return homeBadge(m.scan, theState, 'no');
}

/**
 * Saved's row sub-line, in caps by its style: an invoice's kind, date and number ("Sale · Nov 22 · SI 5184138",
 * "Purchase · Nov 18 · Inv 0007", or without the number when it has none); a 2307's quarter ("2307 · Q1 2026").
 */
export function savedSub(s: SavedSummary): string {
  if (s.kind === '2307') return `2307 · ${s.period}`;
  const sale = s.kind === 'sale';
  const no = s.row[sale ? 'SI/OR No.' : 'Inv No.'];
  return `${sale ? 'Sale' : 'Purchase'} · ${monthDay(s.date)}${no ? ` · ${sale ? 'SI' : 'Inv'} ${no}` : ''}`;
}

/**
 * A scan's sub-line on Sessions and the session screen (ruling P-F11): a saved scan's is Saved's (savedSub); an
 * unsaved one's, its kind and number ("Sale · SI 0000186", "Purchase · Inv 0007", "2307 · Q4 2026"), with its time in
 * place of a number it hasn't; a scan whose form wasn't found, its time alone.
 */
export function scanSub(m: SessionMember): string {
  if (m.summary) return savedSub(m.summary);
  const scan = m.scan;
  const time = formatClock(m.at);
  if (scan && is2307(scan)) return `2307 · ${periodName(certOf(scan, lists(), settings()).cert) || time}`;
  if (!scan || !isInvoice(scan)) return time;
  const no = saleOf(scan, lists(), settings()).final.invoice_no;
  const sale = scan.kind !== 'purchase';
  return `${sale ? 'Sale' : 'Purchase'} · ${no ? `${sale ? 'SI' : 'Inv'} ${no}` : time}`;
}

/**
 * The camera's tray for a session, in the order taken: its scans (read, or a problem when the form wasn't found, with
 * the photo), its failed reads (a problem, with no photo) and its captures still waiting or being read (a PDF has no
 * photo). failed: that session's own failed reads (lib/session).
 */
export function trayOf(
  session: string,
  recent: readonly StoredScan[],
  waiting: readonly Capture[],
  failed: readonly FailedRead[],
): TrayItem[] {
  const items: TrayItem[] = [
    ...recent
      .filter((s) => idOf(s.session) === session)
      .map((s): TrayItem => ({ key: s.id, at: s.at, image: s.result.originalUri, state: s.result.aligned ? 'read' : 'problem' })),
    ...failed.map((f, i): TrayItem => ({ key: `failed:${f.at}:${i}`, at: new Date(f.at), image: null, state: 'problem' })),
    ...waiting
      .filter((c) => c.session === session)
      .map((c): TrayItem => ({ key: c.key, at: c.at, image: c.kind === 'photo' ? c.uri : null, state: 'reading' })),
  ];
  return items.sort(oldestFirst); // stable: at the same time, a scan, then a failed read, then a capture
}

/**
 * What Sessions' search looks in (matchesScan): the party shown, else the label; the invoice's number; and the TIN, an
 * invoice's box, else its list party's, or a 2307's payor's. A summary alone has its party and its row's number, and
 * no TIN: the stored formats don't keep one (call 12).
 */
export function scanFields(m: Member, theLists: Lists, theSettings: Settings): { name: string; number: string; tin: string } {
  const scan = m.scan;
  if (scan && isInvoice(scan)) {
    const sale = saleOf(scan, theLists, theSettings);
    const named = sale.party.status !== 'missing' && sale.party.shown !== '';
    return {
      name: named ? sale.party.shown : labelOf(m),
      number: sale.final.invoice_no,
      tin: (boxValue(scan, 'customer_tin') ?? '').trim() || (sale.party.listParty?.tin ?? ''),
    };
  }
  if (scan && is2307(scan)) {
    const cert = certOf(scan, theLists, theSettings);
    return { name: cert.payor.shown || labelOf(m), number: '', tin: cert.cert.payor.tin };
  }
  const s = m.summary;
  if (!scan && s) {
    const number = s.kind === '2307' ? '' : String(s.row[s.kind === 'sale' ? 'SI/OR No.' : 'Inv No.'] ?? '');
    return { name: s.partyName || labelOf(m), number, tin: '' };
  }
  return { name: labelOf(m), number: '', tin: '' };
}

/**
 * The sessions, with each member's status, state (a scan's only) and saved state (ruling P-F4: a summary alone is
 * 'unchanged'), kept up to date with the recent scans, the saved scans, the lists, the settings and annotation mode.
 * The checks go through saleOf and certOf, whose cache keeps each scan's run: a new scan runs its own checks, not every
 * scan's (ruling P-F3).
 */
export function useSessions(): {
  sessions: Session[];
  statuses: ReadonlyMap<string, Status>;
  states: ReadonlyMap<string, ScanState>;
  saved: ReadonlyMap<string, SavedState>;
} {
  const recent = useSyncExternalStore(subscribeRecent, recentScans);
  const summaries = useSyncExternalStore(subscribeSaved, savedList);
  const theLists = useSyncExternalStore(subscribeLists, lists);
  const theSettings = useSyncExternalStore(subscribeSettings, settings);
  const annotation = useSyncExternalStore(subscribeSettings, annotationOn);
  return useMemo(() => {
    const members = membersOf(recent, summaries);
    const statuses = new Map<string, Status>();
    const states = new Map<string, ScanState>();
    const saved = new Map<string, SavedState>();
    for (const m of members) {
      if (!m.scan) {
        statuses.set(m.id, statusOf(m, null));
        saved.set(m.id, 'unchanged');
        continue;
      }
      const scan = m.scan;
      const checked = isInvoice(scan)
        ? saleOf(scan, theLists, theSettings)
        : is2307(scan)
          ? certOf(scan, theLists, theSettings)
          : null;
      const state = scanStateOf(scan, checked, annotation);
      states.set(m.id, state);
      statuses.set(m.id, statusOf(m, state));
      saved.set(m.id, savedStateOf(scan, m.summary ?? undefined, annotation));
    }
    return { sessions: sessionsOf(members), statuses, states, saved };
  }, [recent, summaries, theLists, theSettings, annotation]);
}
