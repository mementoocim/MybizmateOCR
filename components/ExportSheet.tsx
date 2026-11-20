import * as Sharing from 'expo-sharing';
import { useMemo, useState, useSyncExternalStore } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { type ExportRange, exportChoice, partiesToCheck, writeExport } from '../lib/exportFile';
import { peso } from '../lib/format';
import { lists, subscribeLists } from '../lib/lists';
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

/**
 * Exporting a kind's saved invoices as MyBizMate's import file: which ones, what to check first, and the share sheet.
 * The share sheet can't tell whether the file was sent, so the person says so before the invoices are marked.
 */
export function ExportSheet({ visible, kind, onClose }: { visible: boolean; kind: Kind; onClose: () => void }) {
  const all = useSyncExternalStore(subscribeSaved, savedList);
  const theLists = useSyncExternalStore(subscribeLists, lists);
  const [range, setRange] = useState<ExportRange>('new');
  const [busy, setBusy] = useState(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `all` is the store's version: a change re-chooses
  const rows = useMemo(() => exportChoice(kind, range, new Date()), [kind, range, all]);
  const isSale = kind === 'sale';
  const noun = (n: number) => (isSale ? (n === 1 ? 'sale' : 'sales') : n === 1 ? 'purchase' : 'purchases');
  const before = rows.filter((r) => r.exportedAt !== null).length;
  const names = partiesToCheck(rows, theLists);
  const total = rows.reduce((sum, r) => sum + r.gross, 0);

  async function share() {
    if (!(await Sharing.isAvailableAsync())) {
      toast("This phone can't share files.");
      return;
    }
    setBusy(true);
    try {
      const now = new Date();
      const chosen = rows;
      const uri = await writeExport(kind, chosen, now);
      await Sharing.shareAsync(uri, { mimeType: XLSX_MIME, dialogTitle: 'Send the file' });
      const n = chosen.length;
      Alert.alert(
        'Did the file go where you wanted?',
        n === 1
          ? `Mark this ${noun(1)} as exported, so the next export leaves it out.`
          : `Mark these ${n} ${noun(n)} as exported, so the next export leaves them out.`,
        [
          { text: 'Not yet', style: 'cancel' },
          {
            text: 'Mark as exported',
            onPress: () => {
              void markExported(
                chosen.map((r) => r.id),
                now,
              ).then(() => toast(`Marked ${n} ${noun(n)} as exported.`));
            },
          },
        ],
      );
    } catch {
      toast("Couldn't make the file.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      visible={visible}
      title={isSale ? 'Export sales' : 'Export purchases'}
      subtitle={`A file in MyBizMate's ${isSale ? 'Sales' : 'Purchases'} import format, to import at mybizmate.io.`}
      onClose={onClose}>
      <Chips label="Which ones" options={RANGES} value={range} onChange={setRange} />
      <Text style={styles.summary}>
        {rows.length === 0 ? 'Nothing to export for this choice.' : `${rows.length} ${noun(rows.length)} · ${peso(total)}`}
      </Text>
      {before > 0 && (
        <Text style={styles.warning}>
          {before === 1
            ? '1 of them was exported before. Importing it again adds it to MyBizMate twice.'
            : `${before} of them were exported before. Importing them again adds them to MyBizMate twice.`}
        </Text>
      )}
      {names.length > 0 && (
        <Text style={styles.warning}>{`Check that these are in MyBizMate before you import: ${names.join(', ')}.`}</Text>
      )}
      <View style={styles.buttons}>
        <PrimaryButton label="Share the file" disabled={rows.length === 0 || busy} onPress={() => void share()} />
        <TextButton label="Close" onPress={onClose} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  summary: { fontSize: 16, color: colors.ink, marginTop: 16 },
  warning: { fontSize: 14, color: colors.ember, marginTop: 10, lineHeight: 20 },
  buttons: { marginTop: 20, gap: 4 },
});
