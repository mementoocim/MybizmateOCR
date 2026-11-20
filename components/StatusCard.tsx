import { StyleSheet, Text, View } from 'react-native';

import { formatMs } from '../lib/format';
import { FLAG_TEXT, photoFlags } from '../lib/photoChecks';
import { bold, colors } from '../lib/theme';
import type { ScanResult } from '../modules/scanner';
import { CheckCircle, ErrorCircle } from './icons';

/** The result's first card: no form found, the photo checks that failed, or a photo that looks good. */
export function StatusCard({ result }: { result: ScanResult }) {
  const read = `Read on this phone in ${formatMs(result.timing.totalMs)}, offline.`;
  if (!result.aligned) {
    return (
      <Card
        warn
        title="Couldn't find the form"
        body="Get the whole form in the photo: all 4 black corner squares of a MyBizMate Sales Invoice, or the whole table of a Service Invoice. Then retake it."
      />
    );
  }
  const flags = photoFlags(result);
  if (flags.length > 0) {
    const title = flags.length === 1 ? '1 thing to check' : `${flags.length} things to check`;
    return <Card warn title={title} body={`Check: ${flags.map((f) => FLAG_TEXT[f]).join(', ')}.\n${read}`} />;
  }
  return <Card title="Photo looks good" body={read} />;
}

function Card({ warn, title, body }: { warn?: boolean; title: string; body: string }) {
  return (
    <View style={[styles.card, warn ? styles.warn : styles.good]}>
      {warn ? <ErrorCircle size={24} color={colors.ember} /> : <CheckCircle size={24} color={colors.pine} />}
      <View style={styles.words}>
        <Text style={[styles.title, { color: warn ? colors.amber : colors.pine }]}>{title}</Text>
        <Text style={styles.body}>{body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', gap: 12, borderRadius: 18, padding: 16, marginBottom: 16 },
  warn: { backgroundColor: colors.amberTint },
  good: { backgroundColor: colors.pineTint },
  words: { flex: 1 },
  title: { ...bold, fontSize: 17, marginBottom: 4 },
  body: { fontSize: 14, color: colors.ink, lineHeight: 20 },
});
