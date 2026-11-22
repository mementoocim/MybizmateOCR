import { Directory } from 'expo-file-system';

import type { BoxRead, ScanResult } from '../modules/scanner';
import type { Terms } from './checks/finalize';
import { readJson, writeJson } from './jsonFile';
import type { TaxType } from './settings';
import { APP_VERSION, modelVersion } from './versions';

// Recent scans: the newest 6, kept on the phone so they survive closing the app, with what the person did to each:
// the boxes they fixed (kept apart from the readings) or checked, the terms they picked, sale or purchase (a BIR 2307
// is always a 2307), the customer or supplier they chose, and whether they saved it (in annotation mode, with its
// source tag). Each scan's files live in its own folder (the scanner keeps the newest 6 folders too); the list is a
// JSON file in the app's documents. A saved scan opened from Saved invoices is kept here too while the app runs.

/** How the scan came in. Not the result's own source, which is what the scanner read: a photo or a PDF. */
export type ScanSource = 'camera' | 'camera_app' | 'gallery' | 'sample' | 'pdf';
/** What an invoice is saved as: a row of MyBizMate's Sales import or of its Purchases import. */
export type InvoiceKind = 'sale' | 'purchase';
/** What a scan is saved as: an invoice's kind, or a BIR 2307 (rows of MyBizMate's 2307-CWT import). */
export type Kind = InvoiceKind | '2307';
/** The person's pick: a party from the lists, a supplier's name typed in, or the various (walk-in) suppliers. */
export type PartyChoice = { listId: string } | { name: string } | { various: true };
/** What an invoice's import row needs that isn't on the paper, as the person gave it when saving. */
export type InvoiceDetails = { taxType: TaxType; account: string; terms: Terms; atc: string };
/** What a 2307's import rows need that isn't on the paper: the offset account its withheld tax goes to. */
export type CertDetails = { account: string };
export type SaveDetails = InvoiceDetails | CertDetails;
/** Where an annotated scan's writing came from, as the team's codes for the client and the writer: never names. */
export type SourceTag = { client: string; writer: string };

export type StoredScan = {
  id: string;
  label: string; // "Camera photo", "Photo from gallery", "Sample 0051", "PDF: <file name>"
  source: ScanSource;
  sampleId?: string;
  at: Date;
  result: ScanResult;
  edits: Readonly<Record<string, string>>; // box name -> what the person says the box says
  confirmed?: readonly string[]; // the boxes the person said were read right; none if kept before milestone 4
  terms: Terms | null; // the person's pick; null: the ticks on the paper
  kind: Kind;
  party: PartyChoice | null;
  saved: { savedAt: string; details: SaveDetails } | null;
  made?: { app: string; model: string }; // the app and model versions it was read with; none if kept before milestone 4
  // none of these three on a scan kept before milestone 4:
  annotated?: boolean; // last saved in annotation mode, so every training box was checked
  tag?: SourceTag | null; // that save's client and writer codes; null when it wasn't one
  testImage?: boolean; // read from the camera's test hook: it never becomes training data
};

/**
 * A result as recent.json and the saved scans keep it. Kept results aren't parsed again (parseScanResult), so one kept
 * before PDFs (milestone 5) has none of their fields.
 */
export type KeptResult = Omit<ScanResult, 'source' | 'pageCount' | 'picture' | 'reads'> &
  Partial<Pick<ScanResult, 'source' | 'pageCount' | 'picture'>> & {
    reads: (Omit<BoxRead, 'fromText'> & { fromText?: boolean })[];
  };

/** A kept result with every field: one from before PDFs is a photo's, as parseScanResult reads an old JSON. */
export function withPdfFields(r: KeptResult): ScanResult {
  return {
    ...r,
    source: r.source ?? 'photo',
    pageCount: r.pageCount ?? null,
    picture: r.picture ?? null,
    reads: r.reads.map((b) => ({ ...b, fromText: b.fromText ?? false })),
  };
}

const KEEP = 6;
const FILE = 'recent.json';
let recent: readonly StoredScan[] = []; // replaced, never changed in place: screens subscribe to it
const opened = new Map<string, StoredScan>(); // saved scans opened from Saved invoices
let counter = 0;
const listeners = new Set<() => void>();

function changed(): void {
  listeners.forEach((listener) => listener());
}

/** For useSyncExternalStore: called after each change to a scan or the list. */
export function subscribeRecent(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

async function save(): Promise<void> {
  try {
    await writeJson(FILE, recent.map((s) => ({ ...s, at: s.at.toISOString() })));
  } catch {
    // the list is a convenience: a scan still shows when it can't be saved
  }
}

const FRESH = {
  edits: {},
  confirmed: [],
  terms: null,
  kind: 'sale',
  party: null,
  saved: null,
  annotated: false,
  tag: null,
  testImage: false,
} as const;

/** A BIR Form 2307 (its form found) is a 2307; any other scan keeps its kind, a sale until the person says otherwise. */
const kindOf = (r: ScanResult, kept: Kind = 'sale'): Kind => (r.aligned && r.form === 'bir_2307' ? '2307' : kept);

export function addScan(s: Pick<StoredScan, 'label' | 'source' | 'sampleId' | 'result' | 'testImage'>): string {
  const scan: StoredScan = {
    ...FRESH,
    ...s,
    testImage: s.testImage ?? false,
    kind: kindOf(s.result),
    made: { app: APP_VERSION, model: modelVersion() },
    id: `${Date.now()}-${++counter}`,
    at: new Date(),
  };
  recent = [scan, ...recent].slice(0, KEEP);
  changed();
  void save();
  return scan.id;
}

export function getScan(id: string): StoredScan | undefined {
  return recent.find((s) => s.id === id) ?? opened.get(id);
}

export function updateScan(
  id: string,
  change: Partial<
    Pick<StoredScan, 'edits' | 'confirmed' | 'terms' | 'kind' | 'party' | 'saved' | 'result' | 'annotated' | 'tag'>
  >,
): StoredScan | undefined {
  const old = getScan(id);
  if (!old) return undefined;
  const scan: StoredScan = { ...old, ...change };
  if (recent.some((s) => s.id === id)) {
    recent = recent.map((s) => (s.id === id ? scan : s));
    void save();
  }
  if (opened.has(id)) opened.set(id, scan);
  changed();
  return scan;
}

/** A box's edit; null when it has none ('' is an edit: the person cleared the box). */
const editOf = (edits: Readonly<Record<string, string>>, box: string): string | null =>
  Object.prototype.hasOwnProperty.call(edits, box) ? edits[box] : null;

/**
 * "The box says this". The box's own reading (or nothing typed, on a box that wasn't read) removes the edit. An edit
 * stored, changed or taken back also drops the box's confirm, so the last change decides whether it's checked. The
 * reading saved untouched, where there was no edit, changes nothing: a confirm stays.
 */
export function setEdit(id: string, box: string, text: string): void {
  const scan = getScan(id);
  if (!scan) return;
  const said = text.trim();
  const read = scan.result.reads.find((r) => r.name === box);
  const edits = { ...scan.edits };
  if (read ? said === read.text : said === '') delete edits[box];
  else edits[box] = said;
  const unchanged = editOf(scan.edits, box) === editOf(edits, box);
  updateScan(id, unchanged ? { edits } : { edits, confirmed: (scan.confirmed ?? []).filter((b) => b !== box) });
}

/** "The box was read right" ("Looks right" in annotation mode). An edit made later takes it back. */
export function confirmBox(id: string, box: string): void {
  const scan = getScan(id);
  if (!scan) return;
  const confirmed = scan.confirmed ?? [];
  if (!confirmed.includes(box)) updateScan(id, { confirmed: [...confirmed, box] });
}

/** Keeps a saved scan opened from Saved invoices, so its screen can find and change it. */
export function cacheScan(scan: StoredScan): void {
  opened.set(scan.id, scan);
  changed();
}

/** Forgets a scan (a saved invoice the person deleted): from the recent scans and the opened ones. */
export function forgetScan(id: string): void {
  if (recent.some((s) => s.id === id)) {
    recent = recent.filter((s) => s.id !== id);
    void save();
  }
  opened.delete(id);
  changed();
}

/** Newest first, 6 at most; the same list until it changes. */
export function recentScans(): readonly StoredScan[] {
  return recent;
}

/**
 * At start: the saved list, without scans whose folder is gone. Older entries get the new fields' starting values,
 * and a 2307 kept as a sale (before a 2307 could be saved) is a 2307.
 */
export async function loadRecent(): Promise<void> {
  try {
    const saved = await readJson<(Omit<StoredScan, 'at' | 'result'> & { at: string; result: KeptResult })[]>(FILE);
    if (!saved) return;
    recent = saved
      .filter((s) => s.result.scanDir && new Directory(s.result.scanDir).exists)
      .map((s) => {
        const result = withPdfFields(s.result);
        return { ...FRESH, ...s, kind: kindOf(result, s.kind), at: new Date(s.at), result };
      })
      .slice(0, KEEP);
  } catch {
    recent = [];
  }
  changed();
}
