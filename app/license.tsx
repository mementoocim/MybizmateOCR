import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';

import { Header } from '../components/Header';
import { Screen, useEndPadding } from '../components/Screen';
import { LICENSES } from '../lib/licenses';
import { colors, space, type } from '../lib/theme';

// Design B §9.10: one open-source license's text, opened from the licenses list (app/licenses: `/license?i=<index>`).
// The text is a bundled .txt asset: expo-asset puts it in a file on the phone, which is read and split on blank lines.
// The paragraphs are a virtualized list, since some texts are long (ONNX Runtime's has over 1,250 paragraphs, PDFium's
// over 580). Each shows in full as written, its line breaks and indents kept, in figures. A spinner shows until the
// text is read; a text that can't be read, or a link to no entry, says so.

export default function LicenseScreen() {
  const { i } = useLocalSearchParams<{ i?: string }>();
  const entry = typeof i === 'string' && /^\d+$/.test(i) ? LICENSES[Number(i)] : undefined;
  // null while it's read, then its paragraphs; 'failed' when there's no entry to read, or it can't be read
  const [text, setText] = useState<readonly string[] | 'failed' | null>(entry ? null : 'failed');
  const end = useEndPadding(false);

  useEffect(() => {
    if (!entry) return;
    let open = true; // the screen is still there
    readLicense(entry.asset).then(
      (paragraphs) => {
        if (open) setText(paragraphs);
      },
      () => {
        if (open) setText('failed');
      },
    );
    return () => {
      open = false;
    };
  }, [entry]);

  return (
    <Screen scroll={false} header={<Header title={entry?.name} />}>
      {text === null ? (
        <View style={styles.loading}>
          <ActivityIndicator testID="license-loading" color={colors.brand} />
        </View>
      ) : text === 'failed' ? (
        <Text accessibilityLiveRegion="polite" style={[type.body, styles.failed]}>
          {"Couldn't open this license."}
        </Text>
      ) : (
        <FlatList
          testID="license-text"
          data={text}
          keyExtractor={(_, index) => `${index}`}
          renderItem={renderParagraph}
          contentContainerStyle={[styles.text, { paddingBottom: end }]}
        />
      )}
    </Screen>
  );
}

const renderParagraph = ({ item }: { item: string }) => (
  <Text style={[type.figureSmall, styles.paragraph]}>{item}</Text>
);

/** A license's paragraphs: its bundled asset, put in a file on the phone by expo-asset, then read. */
async function readLicense(asset: number): Promise<string[]> {
  const { localUri } = await Asset.fromModule(asset).downloadAsync();
  if (!localUri) throw new Error('The license has no file on the phone');
  const paragraphs = paragraphsOf(await new File(localUri).text());
  if (paragraphs.length === 0) throw new Error('The license is empty');
  return paragraphs;
}

/** The text between blank lines (or lines of spaces), each paragraph's lines as written, without trailing space. */
function paragraphsOf(text: string): string[] {
  const paragraphs: string[] = [];
  let lines: string[] = [];
  for (const line of text.split(/\r\n?|\n/)) {
    if (line.trim() !== '') {
      lines.push(line.trimEnd());
    } else if (lines.length > 0) {
      paragraphs.push(lines.join('\n'));
      lines = [];
    }
  }
  if (lines.length > 0) paragraphs.push(lines.join('\n'));
  return paragraphs;
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  failed: { color: colors.ink, padding: space.l },
  // on the gutter, m between paragraphs; the first sits l (xs and m) under the header
  text: { paddingTop: space.xs },
  paragraph: { color: colors.ink, paddingHorizontal: space.l, paddingTop: space.m },
});
