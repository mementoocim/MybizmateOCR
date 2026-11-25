import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { FlatList } from 'react-native';

import type { BadgeSpec } from '../../../components/Badge';
import { EmptyState } from '../../../components/EmptyState';
import { Header } from '../../../components/Header';
import { ListRow } from '../../../components/ListRow';
import { Screen, useEndPadding } from '../../../components/Screen';
import { confirmDeleteSaved } from '../../../lib/confirmDelete';
import { waitingOf } from '../../../lib/exportFile';
import { FILES, KINDS } from '../../../lib/exportSteps';
import { amount } from '../../../lib/format';
import { useOpenOnce } from '../../../lib/navigation';
import { openSaved, type SavedSummary, savedList, subscribeSaved } from '../../../lib/saved';
import type { Kind } from '../../../lib/scans';
import { savedSub } from '../../../lib/sessions';
import { toast } from '../../../lib/toast';

// Spec §6.7 and the plan's call 13: See invoices, where Saved's list lives now, in the Export tab's own Stack: one
// kind's saved scans, those from before the camera-first update too (summary-only, with no session: Review Focus 2).
// The header is the kind's plural, with how many wait to export by the export's own rule (lib/exportFile's waitingOf:
// ruling T17-3), or that all have gone out. The list (virtualized) goes by each document's date (an invoice's date, a
// 2307's period end), newest first, then by the time saved, newest first. A row is Saved's: the party, its kind, date
// and number, the amount (a 2307's tax withheld) and To export or Exported. It opens the scan (read back first, as a
// saved one may no longer be among the recent ones), and a long press asks to delete it, in the Scan screen's ⋮ words
// (lib/confirmDelete). One guard for every press (ruling T6-1); a read in flight blocks the others, and the scan opens
// only while this screen is still here and on top (ruling T8-3).

const TO_EXPORT: BadgeSpec = { label: 'To export', tone: 'brand' };
const EXPORTED: BadgeSpec = { label: 'Exported', tone: 'neutral' };
/** A kind with nothing saved: "No purchases saved". */
const PLURALS: Record<Kind, string> = { sale: 'sales', purchase: 'purchases', '2307': '2307s' };

const isKind = (value: unknown): value is Kind => KINDS.includes(value as Kind);

export default function InvoicesScreen() {
  const { kind } = useLocalSearchParams<{ kind: string }>();
  if (!isKind(kind)) {
    return (
      <Screen header={<Header />}>
        <EmptyState title="Nothing saved yet" />
      </Screen>
    );
  }
  return <InvoicesOf key={kind} kind={kind} />;
}

function InvoicesOf({ kind }: { kind: Kind }) {
  const { push, busy } = useOpenOnce();
  const navigation = useNavigation();
  const all = useSyncExternalStore(subscribeSaved, savedList);
  const end = useEndPadding(false);
  const reading = useRef(false); // a saved scan is being read back to open it: other presses wait
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const mine = useMemo(
    () =>
      all
        .filter((s) => s.kind === kind)
        .sort((a, b) => b.date.localeCompare(a.date) || b.savedAt.localeCompare(a.savedAt)),
    [all, kind],
  );
  const waiting = useMemo(() => new Set(waitingOf(kind, all).map((s) => s.id)), [all, kind]); // by id, not by object
  const subtitle = mine.length === 0 ? null : waiting.size > 0 ? `${waiting.size} to export` : 'All exported';

  async function open(id: string) {
    if (reading.current || busy()) return;
    reading.current = true;
    let scan;
    try {
      scan = await openSaved(id);
    } finally {
      reading.current = false;
    }
    if (!mounted.current || !navigation.isFocused()) return; // left while it was read (T26-4)
    if (!scan) {
      toast("Couldn't open that scan."); // a scan, as this list may hold 2307s (ruling T19-3)
      return;
    }
    push({ pathname: '/result', params: { id, from: 'list' } });
  }

  function askDelete(id: string) {
    if (reading.current || busy()) return;
    confirmDeleteSaved(id);
  }

  const renderItem = ({ item }: { item: SavedSummary }) => (
    <ListRow
      title={item.partyName || item.label}
      sub={savedSub(item)}
      subMono
      subCaps
      amount={amount(item.kind === '2307' ? item.tax : item.gross)}
      badge={waiting.has(item.id) ? TO_EXPORT : EXPORTED}
      onPress={() => void open(item.id)}
      onLongPress={() => askDelete(item.id)}
      accessibilityHint="Long-press to delete"
    />
  );

  return (
    <Screen scroll={false} header={<Header title={FILES[kind].row} subtitle={subtitle} />}>
      <FlatList
        testID="invoices-list"
        data={mine}
        keyExtractor={(s) => s.id}
        renderItem={renderItem}
        ListEmptyComponent={<EmptyState title={`No ${PLURALS[kind]} saved`} />}
        contentContainerStyle={{ paddingBottom: end }}
      />
    </Screen>
  );
}
