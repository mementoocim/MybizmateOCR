import { Pressable, StyleSheet, Text, View } from 'react-native';

export default function Home() {
  return (
    <View style={styles.screen}>
      <Pressable accessibilityRole="button" style={styles.button}>
        <Text style={styles.buttonText}>Choose from gallery</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 16, backgroundColor: '#FFFFFF' },
  button: { backgroundColor: '#E26331', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});
