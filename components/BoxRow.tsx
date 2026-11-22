import { Image, StyleSheet, Text, View } from 'react-native';

import { colors } from '../lib/theme';
import type { BoxRead } from '../modules/scanner';

/** How a box was read: from a PDF's own text, or the model's reading and how sure it was. */
export function readingText(read: BoxRead): string {
  if (read.fromText) return "From the PDF's text";
  return read.text === '' ? "Couldn't make out any writing" : `Read as “${read.text}” · ${Math.round(read.conf * 100)}% sure`;
}

/** One box as the camera saw it: its name, its cut-out, and how it was read. */
export function BoxRow({ label, read }: { label: string; read: BoxRead | null }) {
  if (!read) {
    return (
      <View style={styles.row}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.empty}>Empty box</Text>
      </View>
    );
  }
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      {read.cropUri && <Image source={{ uri: read.cropUri }} style={styles.crop} resizeMode="contain" />}
      <Text style={[styles.reading, read.conf < 0.9 && styles.unsure]}>{readingText(read)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingTop: 12, gap: 6 },
  label: { fontSize: 13, color: colors.mute },
  crop: { width: '100%', height: 48, backgroundColor: colors.cropBg, borderRadius: 12 },
  reading: { fontSize: 15, color: colors.ink },
  unsure: { color: colors.ember },
  empty: { fontSize: 15, color: colors.mute },
});
