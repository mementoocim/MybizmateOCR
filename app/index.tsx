import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { SAMPLES, sampleUri } from '../lib/samples';
import { addScan } from '../lib/scans';
import { coreInfo, scanPhoto } from '../modules/scanner';

export default function Home() {
  const router = useRouter();
  const [reading, setReading] = useState(false);
  const libs = coreInfo();

  // One scan at a time: the buttons wait while a photo is read.
  async function read(label: string, photoUri: () => Promise<string | null>) {
    if (reading) return;
    setReading(true);
    try {
      const uri = await photoUri();
      if (!uri) return;
      const id = addScan({ label, source: 'gallery', result: await scanPhoto(uri) });
      router.push(`/result?id=${id}`);
    } catch (e: any) {
      if (e?.code === 'ERR_UNREADABLE_IMAGE') {
        Alert.alert("Can't open this photo", "This file isn't a photo the scanner can open.");
      } else {
        Alert.alert('The scan failed', String(e?.message ?? e));
      }
    } finally {
      setReading(false);
    }
  }

  const fromGallery = () =>
    read('Photo from the gallery', async () => {
      const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
      return picked.canceled ? null : picked.assets[0].uri;
    });

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Choose from gallery"
          disabled={reading}
          onPress={fromGallery}
          style={[styles.button, reading && styles.disabled]}>
          <Text style={styles.buttonText}>Choose from gallery</Text>
        </Pressable>
        {reading && (
          <View style={styles.reading}>
            <ActivityIndicator color="#E26331" />
            <Text style={styles.readingText}>Reading…</Text>
          </View>
        )}
        <Text style={styles.section}>Sample invoices</Text>
        {SAMPLES.map((s) => (
          <Pressable
            key={s.id}
            accessibilityRole="button"
            disabled={reading}
            onPress={() => read(s.label, () => sampleUri(s.id))}
            style={styles.row}>
            <Text style={styles.rowText}>{s.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <Text style={styles.footer}>{`OpenCV ${libs.opencv} · ONNX Runtime ${libs.onnxruntime}`}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' },
  content: { padding: 16 },
  button: { backgroundColor: '#E26331', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  disabled: { opacity: 0.5 },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  reading: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  readingText: { color: '#333333' },
  section: { marginTop: 24, marginBottom: 8, fontSize: 14, fontWeight: '600', color: '#6B6B6B' },
  row: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#DDDDDD' },
  rowText: { fontSize: 16, color: '#B13E03' },
  footer: { textAlign: 'center', color: '#6B6B6B', fontSize: 12, paddingVertical: 8 },
});
