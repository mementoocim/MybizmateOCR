import { Directory, File, Paths } from 'expo-file-system';

import { localIsoDate } from './checks/dates';
import { PURCHASE_COLUMNS, SALES_COLUMNS } from './exportRows';
import type { Lists } from './lists';
import { type SavedSummary, savedList } from './saved';
import type { Kind } from './scans';
import { workbook } from './xlsx';

// The export: which saved invoices go in a file, the names to check in MyBizMate first, and the .xlsx itself, written
// to the app's cache (cache/exports, emptied first) for the share sheet.

export type ExportRange = 'new' | 'this_month' | 'last_month' | 'all';

const monthOf = (d: Date) => localIsoDate(d).slice(0, 7);

/** That kind's saved invoices for the choice, by invoice date (then the time saved), oldest first. */
export function exportChoice(kind: Kind, range: ExportRange, today: Date): SavedSummary[] {
  const month =
    range === 'this_month'
      ? monthOf(today)
      : range === 'last_month'
        ? monthOf(new Date(today.getFullYear(), today.getMonth() - 1, 1))
        : null;
  return savedList()
    .filter((s) => s.kind === kind)
    .filter((s) => (range === 'new' ? s.exportedAt === null : month === null || s.date.slice(0, 7) === month))
    .sort((a, b) => a.date.localeCompare(b.date) || a.savedAt.localeCompare(b.savedAt));
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
  const what = kind === 'sale' ? 'Sales' : kind === 'purchase' ? 'Purchases' : 'Parties';
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

export function writeExport(kind: Kind, rows: readonly SavedSummary[], now: Date): Promise<string> {
  const columns = kind === 'sale' ? SALES_COLUMNS : PURCHASE_COLUMNS;
  return writeExportBytes(exportFileName(kind, now), workbook('Import', columns, rows.map((r) => r.row), now));
}
