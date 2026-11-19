import { Pressable, StyleSheet, Text, View } from 'react-native';

import { coreInfo } from '../modules/scanner';

export default function Home() {
  const libs = coreInfo();
  return (
    <View style={styles.screen}>
      <Pressable accessibilityRole="button" style={styles.button}>
        <Text style={styles.buttonText}>Choose from gallery</Text>
      </Pressable>
      <Text style={styles.footer}>{`OpenCV ${libs.opencv} · ONNX Runtime ${libs.onnxruntime}`}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 16, backgroundColor: '#FFFFFF' },
  button: { backgroundColor: '#E26331', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  footer: { marginTop: 'auto', textAlign: 'center', color: '#6B6B6B', fontSize: 12 },
});
