import { useEffect, useState, useSyncExternalStore } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PrimaryButton } from '../components/Buttons';
import { TeamOnly } from '../components/TeamOnly';
import { markTrainingExported, savedList, subscribeSaved } from '../lib/saved';
import type { StoredScan } from '../lib/scans';
import { shareThenAsk, type Wording } from '../lib/share';
import { colors } from '../lib/theme';
import { PER_EXPORT, pendingTraining, writeTrainingExport } from '../lib/training/export';

const ZIP_MIME = 'application/zip';
const WORDS: Wording = { one: 'scan', many: 'scans', next: 'next export' };

// Training data, from Settings › Team tools: the scans saved in annotation mode that haven't gone out yet, shared the
// oldest 50 at a time as a zip of their training boxes' crops and labels, and marked once the person says the file went
// where they wanted.
export default function TrainingScreen() {
  return (
    <TeamOnly>
      <TrainingExport />
    </TeamOnly>
  );
}

function countLine(n: number): string {
  if (n === 0) return 'No annotated scans to export yet.';
  return n === 1 ? '1 annotated scan not exported yet.' : `${n} annotated scans not exported yet.`;
}

function TrainingExport() {
  const all = useSyncExternalStore(subscribeSaved, savedList);
  const [pending, setPending] = useState<readonly StoredScan[] | null>(null); // null until they're read
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let current = true;
    void pendingTraining().then((scans) => {
      if (current) setPending(scans);
    });
    return () => {
      current = false;
    };
  }, [all]); // read again when the saved ones change: marking them takes them out
  if (pending === null) return <View style={styles.screen} />;
  // the next export's scans, chosen before it's written: the zip holds them, the question counts them, the mark is theirs
  const batch = pending.slice(0, PER_EXPORT);
  const share = async () => {
    setBusy(true);
    await shareThenAsk(
      (now) => writeTrainingExport(batch, now),
      ZIP_MIME,
      batch.length,
      WORDS,
      (now) => markTrainingExported(batch.map((s) => s.id), now),
    );
    setBusy(false);
  };
  return (
    <View style={styles.screen}>
      <Text style={styles.line}>{countLine(pending.length)}</Text>
      {pending.length > PER_EXPORT && (
        <Text style={[styles.line, styles.more]}>{`Each export takes the oldest ${PER_EXPORT}.`}</Text>
      )}
      {pending.length > 0 && (
        <View style={styles.button}>
          <PrimaryButton label="Export training data" disabled={busy} onPress={() => void share()} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper, padding: 20 },
  line: { fontSize: 16, color: colors.ink, lineHeight: 22 },
  more: { marginTop: 8 },
  button: { marginTop: 20 },
});
