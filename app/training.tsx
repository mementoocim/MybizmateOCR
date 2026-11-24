import { useEffect, useState, useSyncExternalStore } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '../components/Buttons';
import { Header } from '../components/Header';
import { Screen } from '../components/Screen';
import { TeamOnly } from '../components/TeamOnly';
import { markTrainingExported, savedList, subscribeSaved } from '../lib/saved';
import type { StoredScan } from '../lib/scans';
import { shareThenAsk, type Wording } from '../lib/share';
import { colors, space, type } from '../lib/theme';
import { PER_EXPORT, pendingTraining, writeTrainingExport } from '../lib/training/export';

const ZIP_MIME = 'application/zip';
const WORDS: Wording = { one: 'scan', many: 'scans', next: 'next export' };

// Training data, from Profile › Team tools: the scans saved in annotation mode that haven't gone out yet, shared the
// oldest 50 at a time as a zip of their training boxes' crops and labels, and marked once the person says the file went
// where they wanted. Design B §9.11: the design's tokens and components, with milestone 4's copy and behaviour.
export default function TrainingScreen() {
  return (
    <Screen header={<Header title="Training data" />}>
      <TeamOnly>
        <TrainingExport />
      </TeamOnly>
    </Screen>
  );
}

function countLine(n: number): string {
  if (n === 0) return 'No annotated scans to export yet.';
  return n === 1 ? '1 annotated scan not exported yet.' : `${n} annotated scans not exported yet.`;
}

function TrainingExport() {
  const all = useSyncExternalStore(subscribeSaved, savedList);
  const [pending, setPending] = useState<readonly StoredScan[] | null>(null); // null until they're read
  useEffect(() => {
    let current = true;
    void pendingTraining().then((scans) => {
      if (current) setPending(scans);
    });
    return () => {
      current = false;
    };
  }, [all]); // read again when the saved ones change: marking them takes them out
  if (pending === null) return null;
  // the next export's scans, chosen before it's written: the zip holds them, the question counts them, the mark is theirs
  const batch = pending.slice(0, PER_EXPORT);
  // The button gets this promise: it loads until the question is up, and a second tap shares nothing (Review Focus 3).
  const share = () =>
    shareThenAsk(
      (now) => writeTrainingExport(batch, now),
      ZIP_MIME,
      batch.length,
      WORDS,
      (now) => markTrainingExported(batch.map((s) => s.id), now),
    );
  return (
    <View style={styles.body}>
      <Text style={[type.body, styles.line]}>{countLine(pending.length)}</Text>
      {pending.length > PER_EXPORT && (
        <Text style={[type.body, styles.line, styles.more]}>{`Each export takes the oldest ${PER_EXPORT}.`}</Text>
      )}
      {pending.length > 0 && (
        <View style={styles.button}>
          <Button label="Export training data" onPress={share} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.l },
  line: { color: colors.ink },
  more: { marginTop: space.s },
  button: { marginTop: space.l },
});
