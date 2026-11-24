import { useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { Button } from '../components/Buttons';
import { Header } from '../components/Header';
import { LedgerRow } from '../components/LedgerRow';
import { Screen } from '../components/Screen';
import { TeamOnly } from '../components/TeamOnly';
import { formatMs } from '../lib/format';
import { runSpeedTest, type SpeedResult } from '../lib/speedTest';
import { colors, space, type } from '../lib/theme';

// The team's speed test (the test app's activity_speed.xml and SpeedTestActivity.java), from Settings › Team tools or
// mybizmatescan://speed, in team builds only. Design B §9.11: the design's tokens and components; what it runs, times
// and shows is as it was. The bar follows the run's real progress, so it doesn't loop like the loading bar.

const BAR = 4; // dp: the progress bar's height
const NOTE = "Reads 8 sample invoices 3 times with this phone's processor, about 30 seconds. Nothing is sent anywhere.";

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
    <Screen header={<Header title="Speed test" />}>
      <TeamOnly>
        <SpeedTest />
      </TeamOnly>
    </Screen>
  );
}

function SpeedTest() {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0); // 0–1 while it runs
  const [line, setLine] = useState('');
  const [result, setResult] = useState<SpeedResult | null>(null);

  // The button gets this promise: it loads until the run ends, and a second tap starts nothing (Review Focus 3).
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
    <>
      <View style={styles.top}>
        <Text style={[type.headline, styles.ink]}>How fast this phone reads invoices</Text>
        <Text style={[type.label, styles.mute, styles.device]}>{deviceLine()}</Text>

        <View style={styles.median}>
          <Text style={[type.figureStrong, styles.ink]}>{result ? formatMs(result.medianMs) : '—'}</Text>
          <Text style={[type.label, styles.mute]}>per invoice, median</Text>
        </View>

        {running && (
          <View testID="speed-progress" style={styles.track}>
            <View testID="speed-progress-fill" style={[styles.fill, { width: `${Math.round(progress * 100)}%` }]} />
          </View>
        )}
        {line !== '' && <Text style={[type.label, styles.mute, styles.progress]}>{line}</Text>}
      </View>

      {result && (
        <View style={styles.rows}>
          {rows(result).map(([label, value]) => (
            <LedgerRow key={label} label={label} value={value} />
          ))}
        </View>
      )}

      <View style={styles.bottom}>
        <Button label={result ? 'Run again' : 'Run speed test'} onPress={run} />
        <Text style={[type.label, styles.mute]}>{NOTE}</Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  // on the gutter; the rows under it run edge to edge
  top: { paddingTop: space.l, paddingHorizontal: space.l },
  ink: { color: colors.ink },
  mute: { color: colors.mute },
  device: { marginTop: space.xs },
  median: { marginTop: space.l },
  track: {
    height: BAR,
    borderRadius: BAR / 2,
    backgroundColor: colors.sand,
    overflow: 'hidden',
    marginTop: space.l,
  },
  fill: { height: BAR, borderRadius: BAR / 2, backgroundColor: colors.brand },
  progress: { marginTop: space.s },
  // the results as a section: white rows on hairlines, with one over the first
  rows: { marginTop: space.m, borderTopWidth: 1, borderTopColor: colors.hairline },
  bottom: { padding: space.l, gap: space.m },
});
