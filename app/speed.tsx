import { Fragment, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PrimaryButton } from '../components/Buttons';
import { TeamOnly } from '../components/TeamOnly';
import { formatMs } from '../lib/format';
import { runSpeedTest, type SpeedResult } from '../lib/speedTest';
import { bold, colors } from '../lib/theme';

// The team's speed test (the test app's activity_speed.xml and SpeedTestActivity.java), from Settings › Team tools or
// mybizmatescan://speed, in team builds only.

function deviceLine(): string {
  if (Platform.OS !== 'android') return `${Platform.OS} ${String(Platform.Version)}`;
  const { Brand, Model, Release } = Platform.constants;
  const brand = Brand ? Brand.charAt(0).toUpperCase() + Brand.slice(1) : '';
  return `${[brand, Model].filter(Boolean).join(' ')} · Android ${Release}`;
}

function rows(r: SpeedResult): [string, string][] {
  return [
    ['Slowest 10%', `${formatMs(r.p90Ms)} or more`],
    ['Reading the boxes', `${formatMs(r.readMedianMs)} of each invoice`],
    ['Read exactly as written', `${r.exact.a} of ${r.exact.b} boxes`],
    ['Same as the laptop', `${r.laptop.a} of ${r.laptop.b} boxes`],
    ['Peak memory', `${r.peakMb} MB`],
    ['Starting the scanner', r.loadMs === null ? '—' : formatMs(r.loadMs)],
  ];
}

export default function SpeedScreen() {
  return (
    <TeamOnly>
      <SpeedTest />
    </TeamOnly>
  );
}

function SpeedTest() {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0); // 0–1 while it runs
  const [line, setLine] = useState('');
  const [result, setResult] = useState<SpeedResult | null>(null);

  async function run() {
    setRunning(true);
    setProgress(0);
    setLine('Getting ready…');
    let total = 0;
    try {
      const r = await runSpeedTest((done, all) => {
        total = all;
        setProgress(done / all);
        setLine(`Invoice ${done} of ${all}`);
      });
      setResult(r);
      setLine(`${total} invoices read on this phone`);
    } catch (e: unknown) {
      setLine(`The speed test stopped: ${(e as Error)?.message ?? String(e)}`);
    } finally {
      setRunning(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>How fast this phone reads invoices</Text>
      <Text style={styles.device}>{deviceLine()}</Text>

      <View style={styles.big}>
        <Text style={styles.bigNumber}>{result ? formatMs(result.medianMs) : '—'}</Text>
        <Text style={styles.bigLabel}>per invoice, median</Text>
      </View>

      {running && (
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.round(progress * 100)}%` }]} />
        </View>
      )}
      {line !== '' && <Text style={styles.progressText}>{line}</Text>}

      {result && (
        <View style={styles.card}>
          {rows(result).map(([label, value], i) => (
            <Fragment key={label}>
              {i > 0 && <View style={styles.divider} />}
              <View style={styles.row}>
                <Text style={styles.rowLabel}>{label}</Text>
                <Text style={styles.rowValue}>{value}</Text>
              </View>
            </Fragment>
          ))}
        </View>
      )}

      <View style={styles.button}>
        <PrimaryButton label={result ? 'Run again' : 'Run speed test'} disabled={running} onPress={() => void run()} />
      </View>
      <Text style={styles.note}>
        {"Reads 8 sample invoices 3 times with this phone's processor, about 30 seconds. Nothing is sent anywhere."}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 20, paddingBottom: 32 },
  title: { ...bold, fontSize: 24, color: colors.ink },
  device: { fontSize: 13, color: colors.mute, marginTop: 6 },
  big: { marginTop: 18 },
  bigNumber: { ...bold, fontSize: 56, color: colors.coralText },
  bigLabel: { fontSize: 14, color: colors.mute },
  track: { height: 4, borderRadius: 2, backgroundColor: colors.coralTint, marginTop: 18, overflow: 'hidden' },
  fill: { height: 4, backgroundColor: colors.coral },
  progressText: { fontSize: 13, color: colors.mute, marginTop: 8 },
  card: {
    marginTop: 12,
    backgroundColor: colors.panel,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.line,
  },
  divider: { height: 1, backgroundColor: colors.line, marginHorizontal: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingStart: 16,
    paddingEnd: 12,
    paddingVertical: 13,
  },
  rowLabel: { width: 104, fontSize: 14, color: colors.mute },
  rowValue: { ...bold, flex: 1, fontSize: 15, color: colors.ink },
  button: { marginTop: 18 },
  note: { fontSize: 12, color: colors.mute, marginTop: 12 },
});
