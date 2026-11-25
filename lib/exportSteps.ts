import {
  type ExportRange,
  exportChoice,
  newPartiesFirst,
  partiesToCheck,
  totalOf,
  writeExport,
  writePartiesExport,
} from './exportFile';
import { peso } from './format';
import { type Lists, newParties } from './lists';
import type { SavedSummary } from './saved';
import type { Kind } from './scans';
import type { Wording } from './share';

// Design B §9.8, the plan's call 13 and spec §6.7: what the Export tab's steps say and do, moved out of the export
// sheet as it was, unchanged. Each file: its row in step 1, its step's title and subtitle, its summary's lines (the
// import it's in, and the key its count goes under), how what's in it is counted, and the choices of which ones. What
// a choice puts in a file, with today's warnings and how it's written. The tab's screens are app/(tabs)/export/.

/** A file the export makes: a kind's, or the customers and suppliers added from scans. */
export type Which = Kind | 'parties';

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** The kinds, in step 1's order. */
export const KINDS: readonly Kind[] = ['sale', 'purchase', '2307'];

const RANGES = [
  { value: 'new', label: 'Not exported yet' },
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'all', label: 'All' },
] as const;
const PARTY_RANGES = [
  { value: 'new', label: 'Not exported yet' },
  { value: 'all', label: 'All added from scans' },
] as const;

export const NOTHING = 'Nothing to export for this choice';
export const FIRST = 'Export these first: they go in before the other files.';
export const MARK_FAILED = "Couldn't mark them as exported. Try again.";
export const PARTIES_NOTE =
  "Before you import, fill in each one's City / Municipality, Province and ZIP, and its TIN where it's blank: MyBizMate needs them. Import this file before the sales and purchases that name them.";

/** An invoice's or a 2307's subtitle: the import its file is in. */
const toImport = (format: string) => `A file in MyBizMate's ${format} import format, to import at mybizmate.io.`;

export const FILES: Record<
  Which,
  {
    row: string;
    title: string;
    subtitle: string;
    file: string;
    key: string;
    words: Wording;
    ranges: readonly { value: ExportRange; label: string }[];
  }
> = {
  sale: {
    row: 'Sales',
    title: 'Export sales',
    subtitle: toImport('Sales'),
    file: 'Sales import',
    key: 'Sales',
    words: { one: 'sale', many: 'sales', next: 'next export' },
    ranges: RANGES,
  },
  purchase: {
    row: 'Purchases',
    title: 'Export purchases',
    subtitle: toImport('Purchases'),
    file: 'Purchases import',
    key: 'Purchases',
    words: { one: 'purchase', many: 'purchases', next: 'next export' },
    ranges: RANGES,
  },
  '2307': {
    row: '2307s',
    title: 'Export 2307s',
    subtitle: toImport('2307-CWT'),
    file: '2307-CWT import',
    key: '2307s',
    words: { one: '2307', many: '2307s', next: 'next export' },
    ranges: RANGES,
  },
  parties: {
    row: 'New customers and suppliers',
    title: 'Export new customers and suppliers',
    subtitle: "A file in MyBizMate's Parties import format, with the customers and suppliers you added from scans.",
    file: 'Parties import',
    key: 'Parties',
    words: { one: 'party', many: 'parties', next: 'next file' },
    ranges: PARTY_RANGES,
  },
};

/** Whether a route's param names a file. */
export const isWhich = (value: unknown): value is Which =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(FILES, value);

function exportedBefore(k: number): string | null {
  if (k === 0) return null;
  return k === 1
    ? '1 of them was exported before. Importing it again adds it to MyBizMate twice.'
    : `${k} of them were exported before. Importing them again adds them to MyBizMate twice.`;
}

/** What a file holds for the choice: what goes in it, its summary's count, today's warnings, and how it's written. */
export function chosen(
  which: Which,
  range: ExportRange,
  theLists: Lists,
): { ids: readonly string[]; count: string; warnings: readonly string[]; write: (now: Date) => Promise<string> } {
  if (which === 'parties') {
    const parties = newParties(theLists, range === 'all');
    return {
      ids: parties.map((p) => p.id),
      count: `${parties.length}`,
      warnings: [exportedBefore(parties.filter((p) => p.exportedAt !== null).length)].filter((w) => w !== null),
      write: (now) => writePartiesExport(parties, now),
    };
  }
  const rows = exportChoice(which, range, new Date());
  const total = peso(totalOf(rows)); // the invoices' gross; the 2307s' tax withheld
  const names = partiesToCheck(rows, theLists);
  const toCheck =
    names.length === 0
      ? null
      : `Check that these are in MyBizMate before you import: ${names.join(', ')}.` +
        (newPartiesFirst(rows, theLists) ? ' Export new customers and suppliers first: they go in before this file.' : '');
  return {
    ids: rows.map((r) => r.id),
    count: which === '2307' ? `${rows.length} · Tax withheld ${total}` : `${rows.length} · ${total}`,
    warnings: [exportedBefore(rows.filter((r) => r.exportedAt !== null).length), toCheck].filter((w) => w !== null),
    write: (now) => writeExport(which, rows, now),
  };
}

/** When the last import file went out: the newest exportedAt among the saved scans; null when none has gone. */
export function lastSent(saved: readonly SavedSummary[]): string | null {
  let newest: string | null = null;
  for (const s of saved) {
    const later = newest === null || Date.parse(s.exportedAt ?? '') > Date.parse(newest);
    if (s.exportedAt !== null && later) newest = s.exportedAt;
  }
  return newest;
}
