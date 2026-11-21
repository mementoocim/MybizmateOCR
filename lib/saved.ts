import { Directory, Paths } from 'expo-file-system';

import type { ScanResult } from '../modules/scanner';
import { type ExportRow, exportRow, saveBlock } from './exportRows';
import { readJson, writeJson } from './jsonFile';
import { lists } from './lists';
import { saleOf } from './sale';
import {
  cacheScan,
  forgetScan,
  getScan,
  type KeptResult,
  type Kind,
  type SaveDetails,
  type StoredScan,
  updateScan,
  withPdfFields,
} from './scans';
import { settings, updateSettings } from './settings';

// Saved invoices: the scans the person saved as a sale or a purchase, each one an import row. A saved scan's folder
// moves from the scanner's scans/ (which keeps only its newest 6) to saved/<id>/, with the whole scan in scan.json;
// saved.json holds one summary per saved scan, with its row and when it was exported.

export type SavedSummary = {
  id: string;
  kind: Kind;
  label: string;
  partyName: string;
  partyId: string | null; // the list party, when the party is chosen or matched
  date: string;
  gross: number;
  row: ExportRow;
  listed: boolean; // the party column is a list party's code, or a VARIOUS-* party
  savedAt: string;
  exportedAt: string | null;
};

const INDEX = 'saved.json';
let summaries: readonly SavedSummary[] = []; // replaced, never changed in place: screens subscribe to it
const listeners = new Set<() => void>();

function changed(): void {
  listeners.forEach((listener) => listener());
}

const newestFirst = (list: SavedSummary[]) => list.sort((a, b) => (a.savedAt < b.savedAt ? 1 : a.savedAt > b.savedAt ? -1 : 0));
const trimSlash = (uri: string) => uri.replace(/\/+$/, '');
const folderOf = (id: string) => new Directory(Paths.document, 'saved', id);

export function savedList(): readonly SavedSummary[] {
  return summaries;
}

export function subscribeSaved(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function savedSummary(id: string): SavedSummary | undefined {
  return summaries.find((s) => s.id === id);
}

function summaryOf(scan: StoredScan, exportedAt: string | null): SavedSummary {
  const sale = saleOf(scan, lists(), settings());
  const party = sale.party;
  const inList = (party.status === 'chosen' || party.status === 'auto') && party.listParty !== null;
  return {
    id: scan.id,
    kind: scan.kind,
    label: scan.label,
    partyName: party.shown,
    partyId: inList ? party.listParty!.id : null,
    date: sale.final.date ?? '',
    gross: sale.gross ?? 0,
    row: exportRow(scan, sale, scan.saved!.details),
    listed: (inList && party.listParty!.code !== '') || party.status === 'blank' || party.status === 'various',
    savedAt: scan.saved!.savedAt,
    exportedAt,
  };
}

/** Moves a scan's folder out of the scanner's scans/ to saved/<id>/, and points every file of its result there. */
async function moveToSaved(scan: StoredScan): Promise<ScanResult> {
  const r = scan.result;
  if (!r.scanDir) return r;
  const from = trimSlash(r.scanDir);
  if (!/\/scans\/[^/]+$/.test(from)) return r; // already saved (or not a folder the scanner cleans up)
  const root = new Directory(Paths.document, 'saved');
  if (!root.exists) root.create({ intermediates: true });
  const folder = new Directory(from);
  await folder.move(folderOf(scan.id));
  const to = trimSlash(folder.uri);
  const moved = (uri: string | null) => (uri !== null && uri.startsWith(`${from}/`) ? to + uri.slice(from.length) : uri);
  return {
    ...r,
    scanDir: to,
    pageUri: moved(r.pageUri),
    originalUri: moved(r.originalUri),
    reads: r.reads.map((b) => ({ ...b, cropUri: moved(b.cropUri) })),
  };
}

/** A saved scan as scan.json keeps it; one saved before PDFs gets their fields (a photo's). */
async function readScan(id: string): Promise<StoredScan | null> {
  const saved = await readJson<Omit<StoredScan, 'at' | 'result'> & { at: string; result: KeptResult }>(
    `saved/${id}/scan.json`,
  );
  return saved ? { ...saved, at: new Date(saved.at), result: withPdfFields(saved.result) } : null;
}

/** At start: the summaries, plus any saved scan whose summary a kill cut short. */
export async function loadSaved(): Promise<void> {
  const index = (await readJson<SavedSummary[]>(INDEX)) ?? [];
  const known = new Set(index.map((s) => s.id));
  const found: SavedSummary[] = [];
  const root = new Directory(Paths.document, 'saved');
  if (root.exists) {
    for (const entry of root.list()) {
      if (!(entry instanceof Directory) || known.has(entry.name)) continue;
      const scan = await readScan(entry.name);
      if (scan?.saved) found.push(summaryOf(scan, null));
    }
  }
  summaries = newestFirst([...index, ...found]);
  if (found.length > 0) await writeJson(INDEX, summaries);
  changed();
}

/** Saves a scan as its kind's import row (again, after changes). Throws a SaveBlock's name when it can't be. */
export async function saveScan(id: string, details: SaveDetails): Promise<void> {
  const before = getScan(id);
  if (!before) throw new Error('no_scan');
  const block = saveBlock(before, before.result.aligned ? saleOf(before, lists(), settings()) : null);
  if (block) throw new Error(block);
  const result = await moveToSaved(before);
  const scan = updateScan(id, { result, saved: { savedAt: new Date().toISOString(), details } })!;
  await writeJson(`saved/${id}/scan.json`, { ...scan, at: scan.at.toISOString() });
  const summary = summaryOf(scan, savedSummary(id)?.exportedAt ?? null);
  summaries = newestFirst([summary, ...summaries.filter((s) => s.id !== id)]);
  changed();
  await writeJson(INDEX, summaries);
  const atc = details.atc ? { atc: details.atc } : {};
  await updateSettings(scan.kind === 'sale' ? { revenueAccount: details.account, ...atc } : { expenseAccount: details.account, ...atc });
}

/** A saved scan, read back so its screen can show it; null when it's gone. */
export async function openSaved(id: string): Promise<StoredScan | null> {
  const scan = getScan(id) ?? (await readScan(id));
  if (scan) cacheScan(scan);
  return scan;
}

export async function deleteSaved(id: string): Promise<void> {
  const folder = folderOf(id);
  if (folder.exists) folder.delete();
  summaries = summaries.filter((s) => s.id !== id);
  forgetScan(id);
  changed();
  await writeJson(INDEX, summaries);
}

export async function markExported(ids: readonly string[], at: Date): Promise<void> {
  const when = at.toISOString();
  summaries = summaries.map((s) => (ids.includes(s.id) ? { ...s, exportedAt: when } : s));
  changed();
  await writeJson(INDEX, summaries);
}
