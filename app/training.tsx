import { useEffect, useState, useSyncExternalStore } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PrimaryButton } from '../components/Buttons';
import { TeamOnly } from '../components/TeamOnly';
import { markTrainingExported, savedList, subscribeSaved } from '../lib/saved';
import type { StoredScan } from '../lib/scans';
import { shareThenAsk, type Wording } from '../lib/share';
import { colors } from '../lib/theme';
import { pendingTraining, writeTrainingExport } from '../lib/training/export';

const ZIP_MIME = 'application/zip';
const WORDS: Wording = { one: 'scan', many: 'scans', next: 'next export' };

// Training data, from Settings › Team tools: the scans saved in annotation mode that haven't gone out yet, shared as one
// zip of their training boxes' crops and labels, and marked once the person says the file went where they wanted.
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
  const share = async () => {
    setBusy(true);
    await shareThenAsk(
      (now) => writeTrainingExport(pending, now),
      ZIP_MIME,
      pending.length,
      WORDS,
      (now) => markTrainingExported(pending.map((s) => s.id), now),
    );
    setBusy(false);
  };
  return (
    <View style={styles.screen}>
      <Text style={styles.line}>{countLine(pending.length)}</Text>
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
  button: { marginTop: 20 },
});
