import { Directory, Paths } from 'expo-file-system';

import type { ScanResult } from '../modules/scanner';
import { certOf, type CertView, is2307, periodName, taxWithheld } from './cert';
import { certRows, type ExportRow, exportRow, saveBlock } from './exportRows';
import { readJson, writeJson } from './jsonFile';
import { lists } from './lists';
import { isInvoice, saleOf, type SaleView } from './sale';
import {
  cacheScan,
  forgetScan,
  getScan,
  type InvoiceDetails,
  type InvoiceKind,
  type KeptResult,
  type Kind,
  type SaveDetails,
  type SourceTag,
  type StoredScan,
  updateScan,
  withPdfFields,
} from './scans';
import { annotationOn, type Settings, settings, updateSettings } from './settings';
import { cleanTag } from './training/codes';

// Saved invoices: the scans the person saved as a sale, a purchase or a 2307, each as import rows (an invoice's one
// row, a 2307's one per payment). A saved scan's folder moves from the scanner's scans/ (which keeps only its newest 6)
// to saved/<id>/, with the whole scan in scan.json; saved.json holds one summary per saved scan, with its rows and when
// it was exported: in an import file, and apart from that in the team's training export.

type SummaryBase = {
  id: string;
  label: string;
  partyName: string; // an invoice's customer or supplier, a 2307's payor
  partyId: string | null; // the list party, when the party is chosen or matched
  date: string; // the invoice's date; a 2307's period's last day
  listed: boolean; // the party column is a list party's code, or a VARIOUS-* party
  savedAt: string;
  exportedAt: string | null; // when it went out in an import file
  // when it went out in a training export (team builds); a summary kept before milestone 4 has none, and loads as null
  trainingExportedAt?: string | null;
};
/** A saved sale or purchase: its row of the Sales or Purchases import. */
export type InvoiceSummary = SummaryBase & { kind: InvoiceKind; gross: number; row: ExportRow };
/** A saved 2307: its rows of the 2307-CWT import, its period ("Q4 2026") and the tax withheld on its rows. */
export type CertSummary = SummaryBase & { kind: '2307'; period: string; tax: number; rows: readonly ExportRow[] };
export type SavedSummary = InvoiceSummary | CertSummary;

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

/** A summary's import rows: an invoice's one row, a 2307's one per payment. */
export function summaryRows(s: SavedSummary): readonly ExportRow[] {
  return s.kind === '2307' ? s.rows : [s.row];
}

/** A scan's checks: a 2307's as a certificate (never an invoice's), an invoice's as a sale; null when no form was found. */
function checksOf(scan: StoredScan): SaleView | CertView | null {
  if (is2307(scan)) return certOf(scan, lists(), settings());
  return isInvoice(scan) ? saleOf(scan, lists(), settings()) : null;
}

/**
 * A saved scan's summary, with the marks of the one it replaces: when it went out in an import file, and in a training
 * export.
 */
function summaryOf(scan: StoredScan, before?: SavedSummary): SavedSummary {
  const { savedAt, details } = scan.saved!;
  const marks = { exportedAt: before?.exportedAt ?? null, trainingExportedAt: before?.trainingExportedAt ?? null };
  const base = { id: scan.id, label: scan.label, savedAt, ...marks };
  if (is2307(scan)) {
    const view = certOf(scan, lists(), settings());
    const { cert, payor } = view;
    const matched = payor.status === 'auto' ? payor.listParty : null; // an unsure match is only the closest one
    return {
      ...base,
      kind: '2307',
      partyName: payor.shown,
      partyId: matched?.id ?? null,
      date: cert.to ?? '',
      period: periodName(cert),
      tax: taxWithheld(cert),
      rows: certRows(view, details),
      listed: matched !== null && matched.code !== '',
    };
  }
  const sale = saleOf(scan, lists(), settings());
  const party = sale.party;
  const inList = (party.status === 'chosen' || party.status === 'auto') && party.listParty !== null;
  return {
    ...base,
    kind: scan.kind === 'purchase' ? 'purchase' : 'sale',
    partyName: party.shown,
    partyId: inList ? party.listParty!.id : null,
    date: sale.final.date ?? '',
    gross: sale.gross ?? 0,
    row: exportRow(scan, sale, details as InvoiceDetails), // an invoice is saved with all four (SaveSheet)
    listed: (inList && party.listParty!.code !== '') || party.status === 'blank' || party.status === 'various',
  };
}

/** A saved scan's import rows as it stands now: its boxes, its party or its kind may have changed since it was saved. */
export function rowsNow(scan: StoredScan): readonly ExportRow[] {
  return summaryRows(summaryOf(scan));
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

/**
 * A saved scan as scan.json keeps it, as it was last saved: changes made since live only in the app's memory (see
 * openSaved). One saved before PDFs gets their fields (a photo's), and one saved before milestone 4 (milestones 3 and
 * 5) has no boxes checked, wasn't saved in annotation mode and isn't a test image.
 */
export async function readScan(id: string): Promise<StoredScan | null> {
  const saved = await readJson<Omit<StoredScan, 'at' | 'result'> & { at: string; result: KeptResult }>(
    `saved/${id}/scan.json`,
  );
  if (!saved) return null;
  return {
    ...saved,
    confirmed: saved.confirmed ?? [],
    annotated: saved.annotated ?? false,
    tag: saved.tag ?? null,
    testImage: saved.testImage ?? false,
    at: new Date(saved.at),
    result: withPdfFields(saved.result),
  };
}

/**
 * At start: the summaries (one kept before milestone 4 hasn't gone out in a training export), plus any saved scan whose
 * summary a kill cut short.
 */
export async function loadSaved(): Promise<void> {
  const kept = (await readJson<SavedSummary[]>(INDEX)) ?? [];
  const index = kept.map((s) => ({ ...s, trainingExportedAt: s.trainingExportedAt ?? null }));
  const known = new Set(index.map((s) => s.id));
  const found: SavedSummary[] = [];
  const root = new Directory(Paths.document, 'saved');
  if (root.exists) {
    for (const entry of root.list()) {
      if (!(entry instanceof Directory) || known.has(entry.name)) continue;
      const scan = await readScan(entry.name);
      if (scan?.saved) found.push(summaryOf(scan));
    }
  }
  summaries = newestFirst([...index, ...found]);
  if (found.length > 0) await writeJson(INDEX, summaries);
  changed();
}

/** The account a scan was saved with becomes the default for its kind; an invoice's ATC becomes the default ATC. */
function defaultsFrom(kind: Kind, details: SaveDetails): Partial<Settings> {
  if (kind === '2307') return { offsetAccount: details.account };
  const atc = 'atc' in details && details.atc ? { atc: details.atc } : {};
  return kind === 'sale' ? { revenueAccount: details.account, ...atc } : { expenseAccount: details.account, ...atc };
}

/**
 * Saves a scan as its kind's import rows (again, after changes): an invoice with its tax type, account, terms and ATC,
 * a 2307 with its offset account. In annotation mode it's saved annotated, with its source tag, whose codes become the
 * next save's; a save outside annotation mode isn't annotated, and has no tag. Throws a SaveBlock's name when it can't
 * be, and no_tag when annotation mode's two codes aren't both codes.
 */
export async function saveScan(id: string, details: SaveDetails, tag: SourceTag | null = null): Promise<void> {
  const before = getScan(id);
  if (!before) throw new Error('no_scan');
  const annotation = annotationOn();
  const block = saveBlock(before, checksOf(before), { annotation });
  if (block) throw new Error(block);
  const codes = annotation && tag ? cleanTag(tag) : null; // codes only: a name never reaches the scan or Settings
  if (annotation && codes === null) throw new Error('no_tag');
  const result = await moveToSaved(before);
  const saved = { savedAt: new Date().toISOString(), details };
  const scan = updateScan(id, { result, saved, annotated: annotation, tag: codes })!;
  await writeJson(`saved/${id}/scan.json`, { ...scan, at: scan.at.toISOString() });
  const summary = summaryOf(scan, savedSummary(id));
  summaries = newestFirst([summary, ...summaries.filter((s) => s.id !== id)]);
  changed();
  await writeJson(INDEX, summaries);
  const kept = codes ? { clientCode: codes.client, writerCode: codes.writer } : {};
  await updateSettings({ ...defaultsFrom(summary.kind, details), ...kept });
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

/** Marks saved scans as sent in a training export, so the next one leaves them out; the import files' mark stays. */
export async function markTrainingExported(ids: readonly string[], at: Date): Promise<void> {
  const when = at.toISOString();
  summaries = summaries.map((s) => (ids.includes(s.id) ? { ...s, trainingExportedAt: when } : s));
  changed();
  await writeJson(INDEX, summaries);
}
