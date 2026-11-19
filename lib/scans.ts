import type { ScanResult } from '../modules/scanner';

// Finished scans, kept in memory for the Result screen (milestone 1 saves nothing).
export type StoredScan = { id: string; label: string; result: ScanResult };

const scans = new Map<string, StoredScan>();
let next = 0;

export function addScan(label: string, result: ScanResult): string {
  const id = String(++next);
  scans.set(id, { id, label, result });
  return id;
}

export function getScan(id: string): StoredScan | undefined {
  return scans.get(id);
}
