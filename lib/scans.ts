import { Directory, File, Paths } from 'expo-file-system';

import type { ScanResult } from '../modules/scanner';

// Recent scans: the newest 6, kept on the phone so they survive closing the app. Each scan's files live in its own
// folder (the scanner keeps the newest 6 folders too); the list is a JSON file in the app's documents.

export type ScanSource = 'camera' | 'camera_app' | 'gallery' | 'sample';

export type StoredScan = {
  id: string;
  label: string; // "Camera photo", "Photo from gallery", "Sample 0051"
  source: ScanSource;
  sampleId?: string;
  at: Date;
  result: ScanResult;
};

const KEEP = 6;
let recent: readonly StoredScan[] = []; // replaced, never changed in place: screens subscribe to it
let counter = 0;
const listeners = new Set<() => void>();

function changed(): void {
  listeners.forEach((listener) => listener());
}

/** For useSyncExternalStore: called after each change to the list. */
export function subscribeRecent(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const listFile = () => new File(Paths.document, 'recent.json');

async function save(): Promise<void> {
  try {
    await listFile().write(JSON.stringify(recent.map((s) => ({ ...s, at: s.at.toISOString() }))));
  } catch {
    // the list is a convenience: a scan still shows when it can't be saved
  }
}

export function addScan(s: Omit<StoredScan, 'id' | 'at'>): string {
  const scan: StoredScan = { ...s, id: `${Date.now()}-${++counter}`, at: new Date() };
  recent = [scan, ...recent].slice(0, KEEP);
  changed();
  void save();
  return scan.id;
}

export function getScan(id: string): StoredScan | undefined {
  return recent.find((s) => s.id === id);
}

/** Newest first, 6 at most; the same list until it changes. */
export function recentScans(): readonly StoredScan[] {
  return recent;
}

/** At start: the saved list, without scans whose folder is gone. */
export async function loadRecent(): Promise<void> {
  try {
    const file = listFile();
    if (!file.exists) return;
    const saved: (Omit<StoredScan, 'at'> & { at: string })[] = JSON.parse(await file.text());
    recent = saved
      .filter((s) => s.result.scanDir && new Directory(s.result.scanDir).exists)
      .map((s) => ({ ...s, at: new Date(s.at) }))
      .slice(0, KEEP);
  } catch {
    recent = [];
  }
  changed();
}
