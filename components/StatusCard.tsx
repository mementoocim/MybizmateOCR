import { StyleSheet, Text, View } from 'react-native';

import { formatMs } from '../lib/format';
import { bold, colors } from '../lib/theme';
import type { ScanResult } from '../modules/scanner';
import { CheckCircle, ErrorCircle } from './icons';

/**
 * The result's first card (the test app's ResultActivity.showSale): no form found, the things the checks want a
 * person to look at, or "Ready to post". problems is null when there's no sale (the form wasn't found).
 */
export function StatusCard({ result, problems }: { result: ScanResult; problems: string[] | null }) {
  const read = `Read on this phone in ${formatMs(result.timing.totalMs)}, offline.`;
  if (!result.aligned || problems === null) {
    return (
      <Card
        warn
        title="Couldn't find the form"
        body="Get the whole form in the photo: all 4 black corner squares of a MyBizMate Sales Invoice, or the whole table of a Service Invoice. Then retake it."
      />
    );
  }
  if (problems.length > 0) {
    const title = problems.length === 1 ? '1 thing to check' : `${problems.length} things to check`;
    return <Card warn title={title} body={`Check: ${problems.join(', ')}.\n${read}`} />;
  }
  return <Card title="Ready to post" body={`Every check passed. ${read}`} />;
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
