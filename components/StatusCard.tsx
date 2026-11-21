import { StyleSheet, Text, View } from 'react-native';

import { formatMs } from '../lib/format';
import { bold, colors } from '../lib/theme';
import type { ScanResult } from '../modules/scanner';
import { CheckCircle, ErrorCircle } from './icons';

const NOT_FOUND_PHOTO =
  'Get the whole form in the photo: all 4 black corner squares of a MyBizMate Sales Invoice, the whole table of a Service Invoice, or the whole page of a BIR Form 2307. Then retake it.';
const NOT_FOUND_PDF =
  "Page 1 of this PDF isn't a MyBizMate Sales Invoice, a Service Invoice or a BIR Form 2307. Import another PDF.";

/**
 * The result's first card (the test app's ResultActivity.showSale): no form found, the things the checks want a
 * person to look at, what it still needs before it can be saved (blocked: a 2307 with no payments read, say), or ready
 * (an invoice's "Ready to post", a 2307's "Ready to save"). problems is null when there's nothing checked (the form
 * wasn't found).
 */
export function StatusCard({
  result,
  problems,
  ready,
  blocked = null,
}: {
  result: ScanResult;
  problems: string[] | null;
  ready: string;
  blocked?: string | null;
}) {
  const read = `Read on this phone in ${formatMs(result.timing.totalMs)}, offline.`;
  if (!result.aligned || problems === null) {
    // what the scanner read (a photo or a PDF), not how the scan came in: a PDF has no photo to retake
    return (
      <Card
        warn
        title="Couldn't find the form"
        body={result.source === 'pdf' ? NOT_FOUND_PDF : NOT_FOUND_PHOTO}
      />
    );
  }
  if (problems.length > 0) {
    const title = problems.length === 1 ? '1 thing to check' : `${problems.length} things to check`;
    return <Card warn title={title} body={`Check: ${problems.join(', ')}.\n${read}`} />;
  }
  // as a title, without the sentence's full stop
  if (blocked) return <Card warn title={blocked.replace(/\.$/, '')} body={read} />;
  return <Card title={ready} body={`Every check passed. ${read}`} />;
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
