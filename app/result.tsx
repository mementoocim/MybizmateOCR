import { Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { BoxRow, TermsRow } from '../components/BoxRow';
import { OutlinedButton, PrimaryButton } from '../components/Buttons';
import { Camera } from '../components/icons';
import { ReadingOverlay } from '../components/ReadingOverlay';
import { ScanImage } from '../components/ScanImage';
import { StatusCard } from '../components/StatusCard';
import { TEAM_BUILD } from '../lib/build';
import { formatMs } from '../lib/format';
import { FORMS, fieldLabel } from '../lib/forms';
import { compareWithSample, sampleInfo } from '../lib/samples';
import { useScanFlow } from '../lib/scanFlow';
import { getScan } from '../lib/scans';
import { bold, colors, sectionLabel } from '../lib/theme';

// The result (ResultActivity.java without the checks, which come in milestone 3): the photo checks, the scan view,
// every box the camera saw, and Retake.
export default function Result() {
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const flow = useScanFlow();
  const scan = id ? getScan(id) : undefined;
  if (!scan) {
    return (
      <View style={styles.screen}>
        <Text style={styles.gone}>This scan is no longer here. Go back and read the photo again.</Text>
      </View>
    );
  }
  const r = scan.result;
  const form = r.form ? FORMS[r.form] : null;

  const total = formatMs(r.timing.totalMs);
  const boxes = `${r.reads.length} ${r.reads.length === 1 ? 'box' : 'boxes'}`;
  const footnote = !r.aligned
    ? `Checked on this phone in ${total}. Nothing left the phone.`
    : TEAM_BUILD
      ? `${boxes} read on this phone in ${total} (straighten ${formatMs(r.timing.alignMs)}, read ${formatMs(r.timing.readMs)}). Nothing left the phone.`
      : `${boxes} read on this phone in ${total}. Nothing left the phone.`;
  let sampleLine: string | null = null;
  if (scan.sampleId && r.aligned) {
    const { exact, written } = compareWithSample(r.reads, sampleInfo(scan.sampleId));
    sampleLine = `Sample invoice: ${exact} of ${written} boxes read exactly as written.`;
  }

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerTitle: () => <Title subtitle={form?.title} /> }} />
      <ScrollView contentContainerStyle={styles.content}>
        <StatusCard result={r} />
        <ScanImage result={r} />
        {r.aligned && r.form && form && (
          <>
            <Text style={sectionLabel}>WHAT THE CAMERA SAW</Text>
            <Text style={styles.caption}>Each box is cut out and read on its own.</Text>
            {r.reads.map((b) => (
              <BoxRow key={b.name} label={fieldLabel(r.form!, b.name)} read={b} />
            ))}
            {r.terms ? (
              <TermsRow value={r.terms === 'cash' ? form.cash : form.account} />
            ) : (
              <TermsRow value="Unclear" note={`Tick ${form.cash} or ${form.account} clearly`} />
            )}
          </>
        )}
        <Text style={styles.footnote}>{footnote}</Text>
        {sampleLine && <Text style={styles.footnote}>{sampleLine}</Text>}
      </ScrollView>
      <View style={styles.bottom}>
        {r.aligned ? (
          <OutlinedButton label="Retake" onPress={() => flow.retake(scan, from === 'recent')} />
        ) : (
          <PrimaryButton label="Retake" icon={Camera} onPress={() => flow.retake(scan, from === 'recent')} />
        )}
      </View>
      <ReadingOverlay visible={flow.reading} />
    </View>
  );
}

function Title({ subtitle }: { subtitle?: string }) {
  return (
    <View>
      <Text style={styles.title}>Scan</Text>
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 16, paddingBottom: 24 },
  gone: { fontSize: 15, color: colors.ink, padding: 16 },
  caption: { fontSize: 14, color: colors.mute, marginTop: 4, marginBottom: 4 },
  footnote: { fontSize: 13, color: colors.mute, marginTop: 16, lineHeight: 18 },
  bottom: { padding: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, backgroundColor: colors.panel },
  title: { ...bold, fontSize: 18, color: colors.ink },
  subtitle: { fontSize: 13, color: colors.mute },
});
