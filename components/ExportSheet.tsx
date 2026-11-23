import { type ComponentProps, type RefObject, useState, useSyncExternalStore } from 'react';
import { StyleSheet, Text, View, type ViewInstance } from 'react-native';

import {
  type ExportRange,
  exportChoice,
  newPartiesFirst,
  partiesToCheck,
  totalOf,
  waitingOf,
  writeExport,
  writePartiesExport,
} from '../lib/exportFile';
import { peso } from '../lib/format';
import { type Lists, lists, markPartiesExported, newParties, subscribeLists } from '../lib/lists';
import { markExported, type SavedSummary, savedList, subscribeSaved } from '../lib/saved';
import type { Kind } from '../lib/scans';
import { shareFile, type Wording } from '../lib/share';
import { colors, space, type } from '../lib/theme';
import { toast } from '../lib/toast';
import { Banner } from './Banner';
import { ChoiceChips } from './ChoiceChips';
import { Share } from './icons';
import { ListRow } from './ListRow';
import { Sheet } from './Sheet';
import { SummaryBox } from './SummaryBox';

// Design B §9.8 and the plan's call 13: one sheet for an export, in steps.
// - Which file ("Export"): a row per kind with saved scans, saying how many wait to export (in figures) or that all
//   have gone out (in words: a file can go again), and the parties' file once any party came from a scan. When a
//   waiting scan names a party that hasn't gone out, the parties' file comes first, with why: it goes in before the
//   files that name it.
// - The file: what it will hold, in a summary box; which ones; today's warnings as banners, and the parties' note.
//   Close, and Share the file, whose press returns the share, so it loads while the file is written and a double tap
//   shares once (Review Focus 3). Back goes to the list of files, whether or not the sheet opened at this file. A
//   file that couldn't be made or shared says why in the sheet, in a banner TalkBack reads out, first in the step,
//   so it never sits below the fold (ruling T18-4).
// - Once the share sheet has closed, sent or not (it can't tell), today's question: mark what went in the file as
//   exported, with the time it was written for, so the next file leaves it out; or not yet. Nothing is marked unless
//   the person says so, and Mark runs once on a double tap too. Marking closes the sheet, then a snackbar says so. A
//   mark that can't be written marks nothing, and says so in the step, the same way, so Mark can run again.
// Each step's title takes TalkBack focus as it shows (focusKey), and once the sheet has gone, focus goes back to
// returnFocus (Saved's Export…: design §7). The sheet starts where it's opened, at the list of files for no kind, so
// a caller mounts it anew (or gives it a new key) for each opening.

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

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

const KINDS: readonly Kind[] = ['sale', 'purchase', '2307'];
const NOTHING = 'Nothing to export for this choice';
const FIRST = 'Export these first: they go in before the other files.';
const MARK_FAILED = "Couldn't mark them as exported. Try again.";
const PARTIES_NOTE =
  "Before you import, fill in each one's City / Municipality, Province and ZIP, and its TIN where it's blank: MyBizMate needs them. Import this file before the sales and purchases that name them.";

type Which = Kind | 'parties';
type Step =
  | { step: 'files' }
  | { step: 'file'; which: Which }
  | { step: 'asked'; which: Which; at: Date; ids: readonly string[] }; // what went in the file, and when it was written

/** What a step gives the sheet. */
type Page = Pick<ComponentProps<typeof Sheet>, 'title' | 'subtitle' | 'onBack' | 'actions' | 'gutter' | 'children'>;

/** An invoice's or a 2307's subtitle: the import its file is in. */
const toImport = (format: string) => `A file in MyBizMate's ${format} import format, to import at mybizmate.io.`;

/**
 * Each file: its row in the list of files, its step's title and subtitle, its summary's lines (the import it's in, and
 * the key its count goes under), how what's in it is counted, and the choices of which ones.
 */
const FILES: Record<
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

function exportedBefore(k: number): string | null {
  if (k === 0) return null;
  return k === 1
    ? '1 of them was exported before. Importing it again adds it to MyBizMate twice.'
    : `${k} of them were exported before. Importing them again adds them to MyBizMate twice.`;
}

/** What a file holds for the choice: what goes in it, its summary's count, today's warnings, and how it's written. */
type Chosen = {
  ids: readonly string[];
  count: string;
  warnings: readonly string[];
  write: (now: Date) => Promise<string>;
};

function chosen(which: Which, range: ExportRange, theLists: Lists): Chosen {
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

/** Exporting saved invoices (sales or purchases) or 2307s, or the customers and suppliers added from scans. */
export function ExportSheet({
  visible,
  kind,
  onClose,
  returnFocus,
}: {
  visible: boolean;
  kind: Which | null; // the file it opens at; null: the list of files
  onClose: () => void;
  returnFocus?: RefObject<ViewInstance | null>; // what opened it, which TalkBack focus goes back to once it has gone
}) {
  const saved = useSyncExternalStore(subscribeSaved, savedList);
  const theLists = useSyncExternalStore(subscribeLists, lists);
  const [step, setStep] = useState<Step>(() => (kind === null ? { step: 'files' } : { step: 'file', which: kind }));
  const [range, setRange] = useState<ExportRange>('new');
  const [error, setError] = useState<string | null>(null); // why the step's last try didn't work: a share, or a mark

  function openFile(which: Which) {
    setRange('new');
    setError(null);
    setStep({ step: 'file', which });
  }

  let page: Page;
  if (step.step === 'files') {
    page = {
      title: 'Export',
      gutter: false, // full-bleed rows
      children: <Files saved={saved} theLists={theLists} onOpen={openFile} />,
    };
  } else if (step.step === 'file') {
    const { which } = step;
    const words = FILES[which];
    const file = chosen(which, range, theLists);
    const share = async () => {
      setError(null);
      const shared = await shareFile(file.write, XLSX_MIME);
      if (shared.ok) setStep({ step: 'asked', which, at: shared.at, ids: file.ids });
      else setError(shared.message);
    };
    page = {
      title: words.title,
      subtitle: words.subtitle,
      onBack: () => setStep({ step: 'files' }),
      actions: [
        { label: 'Close', variant: 'text', onPress: onClose },
        { label: 'Share the file', icon: Share, disabled: file.ids.length === 0, onPress: share },
      ],
      children: (
        <View style={styles.body}>
          {/* first, so it shows where the person is looking, never below the fold (ruling T18-4) */}
          {error ? <Banner tone="danger" text={error} live /> : null}
          <SummaryBox
            lines={[
              { key: 'File', value: `${words.file} · .xlsx` },
              file.ids.length > 0 ? { key: words.key, value: file.count, mono: true } : { key: words.key, value: NOTHING },
            ]}
          />
          <ChoiceChips<ExportRange> label="Which ones" options={words.ranges} value={range} onChange={setRange} />
          {file.warnings.map((warning) => (
            <Banner key={warning} tone="warning" text={warning} />
          ))}
          {which === 'parties' ? <Text style={[type.body, styles.mute]}>{PARTIES_NOTE}</Text> : null}
        </View>
      ),
    };
  } else {
    const { which, at, ids } = step;
    const n = ids.length;
    const { one, many, next } = FILES[which].words;
    const all = FILES[which].ranges.find((r) => r.value === 'all')!.label; // All, or All added from scans: in “ ”s
    const mark = async () => {
      setError(null);
      try {
        await (which === 'parties' ? markPartiesExported(ids, at) : markExported(ids, at));
      } catch {
        setError(MARK_FAILED); // nothing was marked: the question stays, to try again
        return;
      }
      onClose();
      toast(`Marked ${n} ${n === 1 ? one : many} as exported.`);
    };
    page = {
      title: 'Did the file go where you wanted?',
      actions: [
        { label: 'Not yet', variant: 'text', onPress: onClose },
        { label: `Mark ${n} as exported`, onPress: mark },
      ],
      children: (
        <View style={styles.body}>
          {/* first, as the file's step has it (ruling T18-4) */}
          {error ? <Banner tone="danger" text={error} live /> : null}
          <Text style={[type.body, styles.ink]}>
            {n === 1
              ? `Mark this ${one} as exported, so the ${next} leaves it out. “${all}” still includes it.`
              : `Mark these ${n} ${many} as exported, so the ${next} leaves them out. “${all}” still includes them.`}
          </Text>
        </View>
      ),
    };
  }

  return <Sheet visible={visible} onClose={onClose} focusKey={step.step} returnFocus={returnFocus} {...page} />;
}

/**
 * The list of files: a row per kind with saved scans, then the parties' file once any party came from a scan. When a
 * waiting scan names a party that hasn't gone out, the parties' file comes first, with why under it.
 */
function Files({
  saved,
  theLists,
  onOpen,
}: {
  saved: readonly SavedSummary[];
  theLists: Lists;
  onOpen: (which: Which) => void;
}) {
  const row = (which: Which, waiting: number) => (
    <ListRow
      key={which}
      title={FILES[which].row}
      sub={waiting > 0 ? `${waiting} to export` : 'All exported'}
      // a count in the figure style, as Home's To export rows (ruling T18-3); All exported is words, in sans (T18-5)
      subMono={waiting > 0}
      chevron
      onPress={() => onOpen(which)}
    />
  );
  const kinds = KINDS.filter((k) => saved.some((s) => s.kind === k)).map((k) => row(k, waitingOf(k, saved).length));
  const parties = newParties(theLists, true).length > 0 ? row('parties', newParties(theLists, false).length) : null;
  if (newPartiesFirst(waitingOf(null, saved), theLists)) {
    return (
      <>
        {parties}
        <Text style={[type.label, styles.first]}>{FIRST}</Text>
        {kinds}
      </>
    );
  }
  return (
    <>
      {kinds}
      {parties}
    </>
  );
}

const styles = StyleSheet.create({
  // the summary, the choice and what's said about it, spaced as the save sheets'; the actions are pinned under them
  body: { gap: space.l, paddingBottom: space.l },
  ink: { color: colors.ink },
  mute: { color: colors.mute },
  // a band of its own under the parties' row, between hairlines as the rows are: why that file goes first
  first: {
    color: colors.warning,
    paddingVertical: space.s,
    paddingHorizontal: space.l,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
});
