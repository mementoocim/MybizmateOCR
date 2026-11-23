import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { SectionList, StyleSheet, View, type ViewInstance } from 'react-native';

import type { BadgeSpec } from '../components/Badge';
import { BottomBar } from '../components/BottomBar';
import { ChoiceChips } from '../components/ChoiceChips';
import { EmptyState } from '../components/EmptyState';
import { ExportSheet } from '../components/ExportSheet';
import { Header } from '../components/Header';
import { Share } from '../components/icons';
import { ListRow } from '../components/ListRow';
import { Screen, useEndPadding } from '../components/Screen';
import { SectionHeader } from '../components/SectionHeader';
import { useLingering } from '../components/Sheet';
import { confirmDeleteSaved } from '../lib/confirmDelete';
import { waitingOf } from '../lib/exportFile';
import { amount, monthDay, monthYear } from '../lib/format';
import { lists, newParties, subscribeLists } from '../lib/lists';
import { openSaved, type SavedSummary, savedList, subscribeSaved } from '../lib/saved';
import type { Kind } from '../lib/scans';
import { space } from '../lib/theme';
import { toast } from '../lib/toast';

// Design B §9.7: Saved, the scans saved as sales, purchases and 2307s. The header says how many wait to export, by the
// export's own rule (lib/exportFile's waitingOf: ruling T17-3). Chips filter the list by kind, each with its count, a
// kind with nothing saved left out unless it's the one chosen (ruling T19-4); Saved opens at the kind Home's To export
// row or a save's View asked for. The list (virtualized) goes by the month of each document's date (an invoice's date,
// a 2307's period end: the month the export's This month and Last month count it in), newest first; within a month, by
// that date, then the time saved, newest first. A row says the party, its kind, date and number, the amount (a 2307's
// tax withheld) and To export or Exported. It opens the scan, and a long press asks to delete it, in the Scan screen's
// ⋮ words (lib/confirmDelete). The bottom bar's one Export… is there whenever something can be exported: a saved scan,
// or a party added from a scan, whose file needs no saved scan (ruling T19-7). It opens the export at the filtered
// kind, or at its list of files for All or for a kind with nothing saved, whose file would hold nothing (T19-6).

type Filter = Kind | 'all';

/** Each kind's chip, in this order. */
const KINDS: readonly { kind: Kind; chip: string }[] = [
  { kind: 'sale', chip: 'Sales' },
  { kind: 'purchase', chip: 'Purchases' },
  { kind: '2307', chip: '2307s' },
];
/** A filter with nothing to show: "No purchases saved". */
const PLURALS: Record<Kind, string> = { sale: 'sales', purchase: 'purchases', '2307': '2307s' };

const TO_EXPORT: BadgeSpec = { label: 'To export', tone: 'brand' };
const EXPORTED: BadgeSpec = { label: 'Exported', tone: 'neutral' };

/** A month's section: the month ("2026-11") and its saved scans, newest first. */
type Month = { month: string; key: string; data: SavedSummary[] };

export default function SavedScreen() {
  const router = useRouter();
  const { kind } = useLocalSearchParams<{ kind?: Kind }>();
  const all = useSyncExternalStore(subscribeSaved, savedList);
  const theLists = useSyncExternalStore(subscribeLists, lists);
  // Home's To export row and a save's View ask for a kind; anything else, or none, is All
  const [filter, setFilter] = useState<Filter>(() => KINDS.find((k) => k.kind === kind)?.kind ?? 'all');
  // The export: the kind it opens at, and a key per opening, so each starts afresh; kept while it slides away.
  const [exportOpen, setExportOpen] = useState<{ n: number; kind: Kind | null } | null>(null);
  const exporting = useLingering(exportOpen);
  const openings = useRef(0);
  const exportButton = useRef<ViewInstance>(null); // Export…: TalkBack focus goes back to it once the sheet has gone
  const anySaved = all.length > 0;
  // Export…: a saved scan, or a party added from a scan, as the export's list of files has its parties row (T19-7)
  const canExport = anySaved || newParties(theLists, true).length > 0;
  const end = useEndPadding(canExport);

  const waiting = useMemo(() => new Set(waitingOf(null, all)), [all]);
  const sections = useMemo(() => byMonth(filter === 'all' ? all : all.filter((s) => s.kind === filter)), [all, filter]);
  const countOf = (k: Kind) => all.filter((s) => s.kind === k).length;
  // A kind with nothing saved has no chip, unless it's the filter: then it stays, checked, at 0, beside its "No … saved"
  // (ruling T19-4), and goes once another chip is picked.
  const options: { value: Filter; label: string }[] = [
    { value: 'all', label: `All ${all.length}` },
    ...KINDS.flatMap(({ kind: k, chip }) => {
      const n = countOf(k);
      return n > 0 || k === filter ? [{ value: k, label: `${chip} ${n}` }] : [];
    }),
  ];
  const subtitle = !anySaved ? null : waiting.size > 0 ? `${waiting.size} to export` : 'All exported';

  async function open(id: string) {
    const scan = await openSaved(id);
    if (!scan) {
      toast("Couldn't open that scan."); // a scan, as Saved holds 2307s too (ruling T19-3)
      return;
    }
    router.push({ pathname: '/result', params: { id, from: 'saved' } });
  }

  function openExport() {
    openings.current += 1;
    // the filtered kind's file; the list of files for All, or for a kind with nothing saved, a dead end (T19-6)
    setExportOpen({ n: openings.current, kind: filter !== 'all' && countOf(filter) > 0 ? filter : null });
  }

  return (
    <View style={styles.root}>
      <Screen
        scroll={false}
        header={<Header title="Saved" subtitle={subtitle} />}
        bottom={
          canExport ? (
            <BottomBar
              buttons={[{ label: 'Export…', icon: Share, onPress: openExport, ref: exportButton, testID: 'export-open' }]}
            />
          ) : undefined
        }>
        <SectionList
          testID="saved-list"
          sections={sections}
          keyExtractor={(s) => s.id}
          stickySectionHeadersEnabled={false} // as Android has it
          ListHeaderComponent={
            anySaved ? (
              <View style={styles.filter}>
                <ChoiceChips<Filter> label="Show" showLabel={false} options={options} value={filter} onChange={setFilter} />
              </View>
            ) : undefined
          }
          ListEmptyComponent={
            !anySaved ? (
              <EmptyState
                title="Nothing saved yet"
                body="Save a scan and it shows up here, ready to export."
                actions={[{ label: 'Take photo', onPress: () => router.push('/camera') }]}
              />
            ) : filter === 'all' ? undefined : (
              <EmptyState title={`No ${PLURALS[filter]} saved`} />
            )
          }
          renderSectionHeader={({ section }) => <SectionHeader title={monthYear(section.month)} />}
          renderItem={({ item }) => (
            <ListRow
              title={item.partyName || item.label}
              sub={subOf(item)}
              subMono
              subCaps
              amount={amount(item.kind === '2307' ? item.tax : item.gross)}
              badge={waiting.has(item) ? TO_EXPORT : EXPORTED}
              onPress={() => void open(item.id)}
              onLongPress={() => confirmDeleteSaved(item.id)}
              accessibilityHint="Long-press to delete"
            />
          )}
          contentContainerStyle={{ paddingBottom: end }}
        />
      </Screen>
      {exporting ? (
        <ExportSheet
          key={exporting.n}
          visible={exportOpen !== null}
          kind={exporting.kind}
          onClose={() => setExportOpen(null)}
          returnFocus={exportButton}
        />
      ) : null}
    </View>
  );
}

/**
 * The saved scans by the month of their document's date, newest first; within a month by that date, then by the time
 * each was saved, newest first.
 */
function byMonth(list: readonly SavedSummary[]): Month[] {
  const newest = [...list].sort((a, b) => b.date.localeCompare(a.date) || b.savedAt.localeCompare(a.savedAt));
  const months: Month[] = [];
  for (const s of newest) {
    const month = s.date.slice(0, 7);
    const last = months.at(-1);
    if (last?.month === month) last.data.push(s);
    else months.push({ month, key: month, data: [s] });
  }
  return months;
}

/**
 * A row's sub-line, in caps by its style: an invoice's kind, date and number ("Sale · Nov 22 · SI 5184138",
 * "Purchase · Nov 18 · Inv 0007", or without the number when it has none); a 2307's quarter ("2307 · Q1 2026").
 */
function subOf(s: SavedSummary): string {
  if (s.kind === '2307') return `2307 · ${s.period}`;
  const sale = s.kind === 'sale';
  const no = s.row[sale ? 'SI/OR No.' : 'Inv No.'];
  return `${sale ? 'Sale' : 'Purchase'} · ${monthDay(s.date)}${no ? ` · ${sale ? 'SI' : 'Inv'} ${no}` : ''}`;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  // the chips on the gutter, over the first month's strip (ChoiceChips has no margin of its own)
  filter: { paddingHorizontal: space.l, paddingVertical: space.m },
});
