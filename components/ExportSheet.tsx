import * as Sharing from 'expo-sharing';
import { useMemo, useState, useSyncExternalStore } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import {
  type ExportRange,
  exportChoice,
  newPartiesFirst,
  partiesToCheck,
  writeExport,
  writePartiesExport,
} from '../lib/exportFile';
import { peso } from '../lib/format';
import { lists, markPartiesExported, newParties, subscribeLists } from '../lib/lists';
import { markExported, savedList, subscribeSaved } from '../lib/saved';
import type { Kind } from '../lib/scans';
import { colors } from '../lib/theme';
import { toast } from '../lib/toast';
import { PrimaryButton, TextButton } from './Buttons';
import { Chips } from './Chips';
import { Sheet } from './Sheet';

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

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

type Wording = { one: string; many: string; next: string };

/**
 * Writes the file and opens the share sheet. The share sheet can't tell whether the file was sent, so the person says
 * so before what went in it is marked as exported.
 */
async function shareThenAsk(write: (now: Date) => Promise<string>, n: number, words: Wording, mark: (now: Date) => Promise<void>) {
  if (!(await Sharing.isAvailableAsync())) {
    toast("This phone can't share files.");
    return;
  }
  try {
    const now = new Date();
    const uri = await write(now);
    await Sharing.shareAsync(uri, { mimeType: XLSX_MIME, dialogTitle: 'Send the file' });
    Alert.alert(
      'Did the file go where you wanted?',
      n === 1
        ? `Mark this ${words.one} as exported, so the ${words.next} leaves it out.`
        : `Mark these ${n} ${words.many} as exported, so the ${words.next} leaves them out.`,
      [
        { text: 'Not yet', style: 'cancel' },
        {
          text: 'Mark as exported',
          onPress: () => {
            void mark(now).then(() => toast(`Marked ${n} ${n === 1 ? words.one : words.many} as exported.`));
          },
        },
      ],
    );
  } catch {
    toast("Couldn't make the file.");
  }
}

function exportedBefore(k: number): string {
  return k === 1
    ? '1 of them was exported before. Importing it again adds it to MyBizMate twice.'
    : `${k} of them were exported before. Importing them again adds them to MyBizMate twice.`;
}

/** Exporting saved invoices (sales or purchases), or the customers and suppliers added from scans. */
export function ExportSheet({ visible, kind, onClose }: { visible: boolean; kind: Kind | 'parties'; onClose: () => void }) {
  return kind === 'parties' ? (
    <PartiesExport visible={visible} onClose={onClose} />
  ) : (
    <InvoicesExport visible={visible} kind={kind} onClose={onClose} />
  );
}

function InvoicesExport({ visible, kind, onClose }: { visible: boolean; kind: Kind; onClose: () => void }) {
  const all = useSyncExternalStore(subscribeSaved, savedList);
  const theLists = useSyncExternalStore(subscribeLists, lists);
  const [range, setRange] = useState<ExportRange>('new');
  const [busy, setBusy] = useState(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `all` is the store's version: a change re-chooses
  const rows = useMemo(() => exportChoice(kind, range, new Date()), [kind, range, all]);
  const isSale = kind === 'sale';
  const words: Wording = isSale
    ? { one: 'sale', many: 'sales', next: 'next export' }
    : { one: 'purchase', many: 'purchases', next: 'next export' };
  const before = rows.filter((r) => r.exportedAt !== null).length;
  const names = partiesToCheck(rows, theLists);
  const total = rows.reduce((sum, r) => sum + r.gross, 0);
  const share = async () => {
    setBusy(true);
    await shareThenAsk(
      (now) => writeExport(kind, rows, now),
      rows.length,
      words,
      (now) => markExported(rows.map((r) => r.id), now),
    );
    setBusy(false);
  };
  return (
    <Sheet
      visible={visible}
      title={isSale ? 'Export sales' : 'Export purchases'}
      subtitle={`A file in MyBizMate's ${isSale ? 'Sales' : 'Purchases'} import format, to import at mybizmate.io.`}
      onClose={onClose}>
      <Chips label="Which ones" options={RANGES} value={range} onChange={setRange} />
      <Text style={styles.summary}>
        {rows.length === 0
          ? 'Nothing to export for this choice.'
          : `${rows.length} ${rows.length === 1 ? words.one : words.many} · ${peso(total)}`}
      </Text>
      {before > 0 && <Text style={styles.warning}>{exportedBefore(before)}</Text>}
      {names.length > 0 && (
        <Text style={styles.warning}>
          {`Check that these are in MyBizMate before you import: ${names.join(', ')}.` +
            (newPartiesFirst(rows, theLists) ? ' Export new customers and suppliers first: they go in before this file.' : '')}
        </Text>
      )}
      <View style={styles.buttons}>
        <PrimaryButton label="Share the file" disabled={rows.length === 0 || busy} onPress={() => void share()} />
        <TextButton label="Close" onPress={onClose} />
      </View>
    </Sheet>
  );
}

function PartiesExport({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const theLists = useSyncExternalStore(subscribeLists, lists);
  const [range, setRange] = useState<'new' | 'all'>('new');
  const [busy, setBusy] = useState(false);
  const parties = newParties(theLists, range === 'all');
  const before = parties.filter((p) => p.exportedAt !== null).length;
  const share = async () => {
    setBusy(true);
    await shareThenAsk(
      (now) => writePartiesExport(parties, now),
      parties.length,
      { one: 'party', many: 'parties', next: 'next file' },
      (now) => markPartiesExported(parties.map((p) => p.id), now),
    );
    setBusy(false);
  };
  return (
    <Sheet
      visible={visible}
      title="Export new customers and suppliers"
      subtitle="A file in MyBizMate's Parties import format, with the customers and suppliers you added from scans."
      onClose={onClose}>
      <Chips label="Which ones" options={PARTY_RANGES} value={range} onChange={setRange} />
      <Text style={styles.summary}>
        {parties.length === 0
          ? 'Nothing to export for this choice.'
          : parties.length === 1
            ? '1 party'
            : `${parties.length} parties`}
      </Text>
      <Text style={styles.note}>
        {"Before you import, fill in each one's City / Municipality, Province and ZIP, and its TIN where it's blank: MyBizMate needs them. Import this file before the sales and purchases that name them."}
      </Text>
      {before > 0 && <Text style={styles.warning}>{exportedBefore(before)}</Text>}
      <View style={styles.buttons}>
        <PrimaryButton label="Share the file" disabled={parties.length === 0 || busy} onPress={() => void share()} />
        <TextButton label="Close" onPress={onClose} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  summary: { fontSize: 16, color: colors.ink, marginTop: 16 },
  note: { fontSize: 14, color: colors.mute, marginTop: 10, lineHeight: 20 },
  warning: { fontSize: 14, color: colors.ember, marginTop: 10, lineHeight: 20 },
  buttons: { marginTop: 20, gap: 4 },
});
