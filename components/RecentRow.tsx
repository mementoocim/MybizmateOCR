import { useMemo, useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { certOf, is2307 } from '../lib/cert';
import { blockWords, saveBlock } from '../lib/exportRows';
import { formatClock, formatMs } from '../lib/format';
import { lists, subscribeLists } from '../lib/lists';
import { isInvoice, saleOf } from '../lib/sale';
import type { StoredScan } from '../lib/scans';
import { settings, subscribeSettings } from '../lib/settings';
import { bold, colors } from '../lib/theme';
import { CheckCircle, ChevronRight, ErrorCircle } from './icons';

/**
 * One of Home's recent scans: where it stands (its form not found, saved, its things to check, what it still needs
 * before it can be saved, or ready: an invoice to post, a 2307 to save), how long it took, and when (the test app's
 * HomeActivity.java:301-338). It runs the scan's own screen's checks, with the lists as they are now, so the two
 * always agree.
 */
export function RecentRow({ scan, onPress }: { scan: StoredScan; onPress: () => void }) {
  const r = scan.result;
  const theLists = useSyncExternalStore(subscribeLists, lists);
  const theSettings = useSyncExternalStore(subscribeSettings, settings);
  const certificate = is2307(scan);
  const checked = useMemo(
    () =>
      isInvoice(scan) ? saleOf(scan, theLists, theSettings) : is2307(scan) ? certOf(scan, theLists, theSettings) : null,
    [scan, theLists, theSettings],
  );
  // as the scan's card says it (a 2307 with no payments read, say), without the sentence's full stop
  const blocked = checked === null ? null : blockWords(saveBlock(scan, checked))?.replace(/\.$/, '') ?? null;
  const status =
    checked === null
      ? 'Form not found'
      : scan.saved
        ? `Saved as a ${certificate ? '2307' : scan.kind}`
        : checked.problems.length > 0
          ? `${checked.problems.length} to check`
          : (blocked ?? (certificate ? 'Ready to save' : 'Ready to post'));
  const ok = checked !== null && (scan.saved !== null || (checked.problems.length === 0 && blocked === null));
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      {ok ? <CheckCircle size={24} color={colors.pine} /> : <ErrorCircle size={24} color={colors.ember} />}
      <View style={styles.words}>
        <Text style={styles.label}>{scan.label}</Text>
        <Text style={styles.status}>{`${status} · ${formatMs(r.timing.totalMs)} · ${formatClock(scan.at)}`}</Text>
      </View>
      <ChevronRight size={20} color={colors.mute} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  pressed: { opacity: 0.6 },
  words: { flex: 1 },
  label: { ...bold, fontSize: 15, color: colors.ink },
  status: { fontSize: 13, color: colors.mute, marginTop: 2 },
});
