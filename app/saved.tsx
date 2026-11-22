import { useRouter } from 'expo-router';
import { useState, useSyncExternalStore } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { OutlinedButton, TextButton } from '../components/Buttons';
import { ExportSheet } from '../components/ExportSheet';
import { peso, prettyDate } from '../lib/format';
import { lists, newParties, subscribeLists } from '../lib/lists';
import { deleteSaved, openSaved, type SavedSummary, savedList, subscribeSaved } from '../lib/saved';
import type { Kind } from '../lib/scans';
import { bold, colors } from '../lib/theme';
import { toast } from '../lib/toast';

// Saved invoices: the scans saved as sales, purchases or 2307s, newest first, each ready to export to MyBizMate.
export default function SavedScreen() {
  const router = useRouter();
  const all = useSyncExternalStore(subscribeSaved, savedList);
  const theLists = useSyncExternalStore(subscribeLists, lists);
  const [exporting, setExporting] = useState<Kind | 'parties' | null>(null);
  const fromScans = newParties(theLists, true).length > 0;

  async function open(id: string) {
    const scan = await openSaved(id);
    if (!scan) {
      toast("Couldn't open that invoice.");
      return;
    }
    router.push({ pathname: '/result', params: { id, from: 'saved' } });
  }

  function remove(id: string) {
    Alert.alert('Delete this saved invoice?', "It's removed from this phone. Files you already exported don't change.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void deleteSaved(id) },
    ]);
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        {all.length === 0 ? (
          <Text style={styles.empty}>
            No saved invoices yet. Save a scan as a sale or a purchase, and it shows here, ready to export to MyBizMate.
          </Text>
        ) : (
          <View style={styles.list}>
            {all.map((s) => (
              <Pressable
                key={s.id}
                accessibilityRole="button"
                accessibilityHint="Long-press to delete"
                onPress={() => void open(s.id)}
                onLongPress={() => remove(s.id)}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
                <View style={styles.words}>
                  <Text style={styles.name}>{s.partyName}</Text>
                  <Text style={styles.line}>{lineOf(s)}</Text>
                </View>
                <Text style={s.exportedAt ? styles.done : styles.todo}>{s.exportedAt ? 'Exported' : 'To export'}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
      {fromScans && (
        <View style={styles.parties}>
          <TextButton label="Export new customers and suppliers" onPress={() => setExporting('parties')} />
        </View>
      )}
      {all.length > 0 && (
        <View style={styles.bottom}>
          <View style={styles.pair}>
            <View style={styles.button}>
              <OutlinedButton label="Export sales" onPress={() => setExporting('sale')} />
            </View>
            <View style={styles.button}>
              <OutlinedButton label="Export purchases" onPress={() => setExporting('purchase')} />
            </View>
          </View>
          <OutlinedButton label="Export 2307s" onPress={() => setExporting('2307')} />
        </View>
      )}
      {exporting && <ExportSheet visible kind={exporting} onClose={() => setExporting(null)} />}
    </View>
  );
}

/** A saved one's line under its party: a sale's or a purchase's date and gross; a 2307's period and tax withheld. */
function lineOf(s: SavedSummary): string {
  if (s.kind === '2307') return `2307 · ${s.period} · Tax ${peso(s.tax)}`;
  return `${s.kind === 'sale' ? 'Sale' : 'Purchase'} · ${prettyDate(s.date) ?? '—'} · ${peso(s.gross)}`;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 16, paddingBottom: 24 },
  empty: { fontSize: 15, color: colors.mute, lineHeight: 22 },
  list: { backgroundColor: colors.panel, borderRadius: 18, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  pressed: { opacity: 0.6 },
  words: { flex: 1 },
  name: { ...bold, fontSize: 15, color: colors.ink },
  line: { fontSize: 13, color: colors.mute, marginTop: 2 },
  todo: { ...bold, fontSize: 13, color: colors.coralText },
  done: { fontSize: 13, color: colors.mute },
  bottom: {
    gap: 12,
    padding: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    backgroundColor: colors.panel,
  },
  // the invoices' two exports side by side, the 2307s' under them: three across don't fit a phone with one-line words
  pair: { flexDirection: 'row', gap: 12 },
  button: { flex: 1 },
  parties: { alignItems: 'center', paddingVertical: 4, backgroundColor: colors.panel },
});
