import { useLocalSearchParams } from 'expo-router';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';

import { getScan } from '../lib/scans';

export default function Result() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const scan = id ? getScan(id) : undefined;
  if (!scan) {
    return (
      <View style={styles.screen}>
        <Text style={styles.hint}>This scan is no longer here. Go back and read the photo again.</Text>
      </View>
    );
  }
  const r = scan.result;
  if (!r.aligned) {
    return (
      <View style={styles.screen}>
        <Text style={styles.heading}>Couldn't find the form</Text>
        <Text style={styles.hint}>Make sure the whole invoice and its 4 corner squares are in the photo.</Text>
      </View>
    );
  }
  // All rows render (45 at most): a ScrollView, not a list that renders only what's on screen.
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {r.pageUri && <Image source={{ uri: r.pageUri }} style={styles.page} resizeMode="contain" />}
      <Text style={styles.heading}>MyBizMate Sales Invoice</Text>
      {r.turned && <Text style={styles.note}>Turned the right way up</Text>}
      <Text style={styles.note}>{`Read in ${Math.round(r.timing.totalMs)} ms`}</Text>
      {r.reads.map((b) => (
        <View key={b.name} style={styles.row}>
          <Image source={{ uri: b.cropUri }} style={styles.crop} resizeMode="contain" />
          <Text style={styles.name}>{b.name}</Text>
          <View style={styles.reading}>
            <Text style={styles.text}>{b.text}</Text>
            <Text style={styles.conf}>{`${Math.round(b.conf * 100)}%`}</Text>
          </View>
          {b.alts.length > 0 && <Text style={styles.alts}>{`Backup: ${b.alts.join(', ')}`}</Text>}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' },
  content: { padding: 16 },
  page: { width: '100%', aspectRatio: 1200 / 1553, marginBottom: 12, backgroundColor: '#F4F4F4' },
  heading: { fontSize: 18, fontWeight: '600', color: '#222222', marginBottom: 4 },
  hint: { fontSize: 15, color: '#444444', padding: 16 },
  note: { fontSize: 13, color: '#6B6B6B', marginBottom: 4 },
  row: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#DDDDDD' },
  crop: { width: '100%', height: 48, marginBottom: 4 }, // contain: a wide crop shrinks to fit, never overflows
  name: { fontSize: 12, color: '#6B6B6B' },
  reading: { flexDirection: 'row', justifyContent: 'space-between' },
  text: { fontSize: 16, color: '#222222', flexShrink: 1 },
  conf: { fontSize: 13, color: '#6B6B6B', marginLeft: 8 },
  alts: { fontSize: 12, color: '#B13E03' },
});
