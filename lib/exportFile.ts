import { Directory, File, Paths } from 'expo-file-system';

import { localIsoDate } from './checks/dates';
import { CWT_COLUMNS, PARTIES_COLUMNS, partyRow, PURCHASE_COLUMNS, SALES_COLUMNS } from './exportRows';
import { type Lists, newParties, type Party } from './lists';
import { type SavedSummary, savedList, summaryRows } from './saved';
import type { Kind } from './scans';
import { workbook } from './xlsx';

// The export: which saved invoices (or 2307s) wait to go out and what they add up to, which go in a file, the names to
// check in MyBizMate first, and the .xlsx itself, written to the app's cache (cache/exports, emptied first) for the
// share sheet.

/** Each kind's import: the words in its file's name, and its template's header row. */
const IMPORTS: Record<Kind, { name: string; columns: readonly string[] }> = {
  sale: { name: 'Sales', columns: SALES_COLUMNS },
  purchase: { name: 'Purchases', columns: PURCHASE_COLUMNS },
  '2307': { name: '2307-CWT', columns: CWT_COLUMNS },
};

export type ExportRange = 'new' | 'this_month' | 'last_month' | 'all';

const monthOf = (d: Date) => localIsoDate(d).slice(0, 7);
const oldestFirst = (list: SavedSummary[]) =>
  list.sort((a, b) => a.date.localeCompare(b.date) || a.savedAt.localeCompare(b.savedAt));

/**
 * The saved ones waiting to export, of one kind or of every kind (null): those never in an import file. Home's To
 * export and Export's list of files count these, and the export's "Not exported yet" is them (ruling T17-3).
 */
export function waitingOf(kind: Kind | null, saved: readonly SavedSummary[]): SavedSummary[] {
  return saved.filter((s) => (kind === null || s.kind === kind) && s.exportedAt === null);
}

/** What saved ones add up to, as a summary shows it: the invoices' gross, the 2307s' tax withheld. */
export function totalOf(saved: readonly SavedSummary[]): number {
  return saved.reduce((sum, s) => sum + (s.kind === '2307' ? s.tax : s.gross), 0);
}

/** That kind's saved invoices (or 2307s) for the choice, by their date (then the time saved), oldest first. */
export function exportChoice(kind: Kind, range: ExportRange, today: Date): SavedSummary[] {
  if (range === 'new') return oldestFirst(waitingOf(kind, savedList()));
  const month =
    range === 'this_month'
      ? monthOf(today)
      : range === 'last_month'
        ? monthOf(new Date(today.getFullYear(), today.getMonth() - 1, 1))
        : null;
  return oldestFirst(savedList().filter((s) => s.kind === kind && (month === null || s.date.slice(0, 7) === month)));
}

/** The names in the rows MyBizMate may not have yet: not a list party with a code, and not sent in a Parties file. */
export function partiesToCheck(rows: readonly SavedSummary[], l: Lists): string[] {
  const sent = new Set(l.parties.filter((p) => p.exportedAt !== null).map((p) => p.id));
  const names: string[] = [];
  for (const r of rows) {
    if (r.listed || (r.partyId !== null && sent.has(r.partyId)) || names.includes(r.partyName)) continue;
    names.push(r.partyName);
  }
  return names;
}

export function exportFileName(kind: Kind | 'parties', today: Date): string {
  const what = kind === 'parties' ? 'Parties' : IMPORTS[kind].name;
  return `MyBizMate ${what} import ${localIsoDate(today)}.xlsx`;
}

/** Writes the bytes as the only file in cache/exports; its file:// URI. */
export async function writeExportBytes(name: string, bytes: Uint8Array): Promise<string> {
  const folder = new Directory(Paths.cache, 'exports');
  if (folder.exists) folder.delete();
  folder.create({ intermediates: true });
  const file = new File(folder, name);
  await file.write(bytes);
  return file.uri;
}

/** True when a row names a party added from a scan that hasn't gone out in a Parties import file yet. */
export function newPartiesFirst(rows: readonly SavedSummary[], l: Lists): boolean {
  const waiting = new Set(newParties(l, false).map((p) => p.id));
  return rows.some((r) => r.partyId !== null && waiting.has(r.partyId));
}

export function writePartiesExport(parties: readonly Party[], now: Date): Promise<string> {
  return writeExportBytes(exportFileName('parties', now), workbook('Import', PARTIES_COLUMNS, parties.map(partyRow), now));
}

/** The kind's import file with the saved ones' rows: an invoice's one row, a 2307's one per payment. */
export function writeExport(kind: Kind, saved: readonly SavedSummary[], now: Date): Promise<string> {
  const rows = saved.flatMap((s) => summaryRows(s));
  return writeExportBytes(exportFileName(kind, now), workbook('Import', IMPORTS[kind].columns, rows, now));
}
