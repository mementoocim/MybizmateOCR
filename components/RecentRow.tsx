import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatClock, formatMs } from '../lib/format';
import { photoFlags } from '../lib/photoChecks';
import type { StoredScan } from '../lib/scans';
import { bold, colors } from '../lib/theme';
import { CheckCircle, ChevronRight, ErrorCircle } from './icons';

/** One of Home's recent scans: how it went, how long it took, and when (the test app's HomeActivity.java:301-338). */
export function RecentRow({ scan, onPress }: { scan: StoredScan; onPress: () => void }) {
  const r = scan.result;
  const flags = photoFlags(r);
  const status = !r.aligned ? 'Form not found' : flags.length > 0 ? `${flags.length} to check` : 'Read';
  const ok = r.aligned && flags.length === 0;
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
