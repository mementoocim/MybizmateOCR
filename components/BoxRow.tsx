import { Image, StyleSheet, Text, View } from 'react-native';

import { colors } from '../lib/theme';
import type { BoxRead } from '../modules/scanner';

/** One box as the camera saw it: its name, its cut-out, and its reading with how sure the model was. */
export function BoxRow({ label, read }: { label: string; read: BoxRead }) {
  const sure = Math.round(read.conf * 100);
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      {read.cropUri && <Image source={{ uri: read.cropUri }} style={styles.crop} resizeMode="contain" />}
      <Text style={[styles.reading, read.conf < 0.9 && styles.unsure]}>
        {read.text === '' ? "Couldn't make out any writing" : `Read as “${read.text}” · ${sure}% sure`}
      </Text>
    </View>
  );
}

/** The terms the ticks show, in the form's own words. */
export function TermsRow({ value, note }: { value: string; note?: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>Terms</Text>
      <Text style={styles.value}>{value}</Text>
      {note && <Text style={[styles.reading, styles.unsure]}>{note}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, gap: 6 },
  label: { fontSize: 13, color: colors.mute },
  crop: { width: '100%', height: 48, backgroundColor: colors.cropBg, borderRadius: 12 },
  reading: { fontSize: 15, color: colors.ink },
  unsure: { color: colors.ember },
  value: { fontSize: 16, color: colors.ink },
});
