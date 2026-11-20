import { Directory } from 'expo-file-system';

import type { ScanResult } from '../modules/scanner';
import type { Terms } from './checks/finalize';
import { readJson, writeJson } from './jsonFile';
import type { TaxType } from './settings';

// Recent scans: the newest 6, kept on the phone so they survive closing the app, with what the person did to each:
// the boxes they fixed (kept apart from the readings), the terms they picked, sale or purchase, the customer or
// supplier they chose, and whether they saved it. Each scan's files live in its own folder (the scanner keeps the
// newest 6 folders too); the list is a JSON file in the app's documents. A saved scan opened from Saved invoices is
// kept here too while the app runs.

export type ScanSource = 'camera' | 'camera_app' | 'gallery' | 'sample';
export type Kind = 'sale' | 'purchase';
/** The person's pick: a party from the lists, a supplier's name typed in, or the various (walk-in) suppliers. */
export type PartyChoice = { listId: string } | { name: string } | { various: true };
export type SaveDetails = { taxType: TaxType; account: string; terms: Terms; atc: string };

export type StoredScan = {
  id: string;
  label: string; // "Camera photo", "Photo from gallery", "Sample 0051"
  source: ScanSource;
  sampleId?: string;
  at: Date;
  result: ScanResult;
  edits: Readonly<Record<string, string>>; // box name -> what the person says the box says
  terms: Terms | null; // the person's pick; null: the ticks on the paper
  kind: Kind;
  party: PartyChoice | null;
  saved: { savedAt: string; details: SaveDetails } | null;
};

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

const FRESH = { edits: {}, terms: null, kind: 'sale', party: null, saved: null } as const;

export function addScan(s: Pick<StoredScan, 'label' | 'source' | 'sampleId' | 'result'>): string {
  const scan: StoredScan = { ...FRESH, ...s, id: `${Date.now()}-${++counter}`, at: new Date() };
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
  change: Partial<Pick<StoredScan, 'edits' | 'terms' | 'kind' | 'party' | 'saved' | 'result'>>,
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

/** "The box says this". The box's own reading (or nothing typed, on a box that wasn't read) removes the edit. */
export function setEdit(id: string, box: string, text: string): void {
  const scan = getScan(id);
  if (!scan) return;
  const said = text.trim();
  const read = scan.result.reads.find((r) => r.name === box);
  const edits = { ...scan.edits };
  if (read ? said === read.text : said === '') delete edits[box];
  else edits[box] = said;
  updateScan(id, { edits });
}

/** Keeps a saved scan opened from Saved invoices, so its screen can find and change it. */
export function cacheScan(scan: StoredScan): void {
  opened.set(scan.id, scan);
  changed();
}

/** Newest first, 6 at most; the same list until it changes. */
export function recentScans(): readonly StoredScan[] {
  return recent;
}

/** At start: the saved list, without scans whose folder is gone. Older entries get the new fields' starting values. */
export async function loadRecent(): Promise<void> {
  try {
    const saved = await readJson<(Omit<StoredScan, 'at'> & { at: string })[]>(FILE);
    if (!saved) return;
    recent = saved
      .filter((s) => s.result.scanDir && new Directory(s.result.scanDir).exists)
      .map((s) => ({ ...FRESH, ...s, at: new Date(s.at) }))
      .slice(0, KEEP);
  } catch {
    recent = [];
  }
  changed();
}
