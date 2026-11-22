import { type Href, useRouter } from 'expo-router';
import { useState, useSyncExternalStore } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { OutlinedButton, PrimaryButton, TextButton } from '../components/Buttons';
import { Camera, ChevronRight, DocumentIcon, ImageIcon, Lock, More } from '../components/icons';
import { ReadingOverlay } from '../components/ReadingOverlay';
import { RecentRow } from '../components/RecentRow';
import { ScanIllustration } from '../components/ScanIllustration';
import { Sheet } from '../components/Sheet';
import { savedList, subscribeSaved } from '../lib/saved';
import { SAMPLES } from '../lib/samples';
import { useScanFlow } from '../lib/scanFlow';
import { recentScans, subscribeRecent } from '../lib/scans';
import { bold, colors, sectionLabel } from '../lib/theme';

const TIPS = [
  'The whole form in the photo: every corner square, or the whole table',
  'Flat on a table, in good light',
  'Phone held straight above it, no strong shadows',
];

const handwriting = (font: string) => `${font === 'PatrickHand' ? 'Patrick Hand' : font} handwriting`;

// Home (the test app's activity_home.xml and HomeActivity.java), with the menu to the saved invoices, the lists and
// Settings, and a row for the saved invoices still to export.
export default function Home() {
  const router = useRouter();
  const flow = useScanFlow();
  const recent = useSyncExternalStore(subscribeRecent, recentScans); // a scan read on any screen shows at once
  const saved = useSyncExternalStore(subscribeSaved, savedList);
  const toExport = saved.filter((s) => s.exportedAt === null).length;
  const menu: { label: string; to: Href }[] = [
    { label: 'Saved invoices', to: '/saved' },
    { label: 'Your lists', to: '/lists' },
    { label: 'Settings', to: '/settings' }, // a team build's own tools are in Settings › Team tools
  ];
  const [samplesOpen, setSamplesOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <View style={styles.screen}>
      <View style={styles.toolbar}>
        <Image source={require('../assets/brand/logo_mark.png')} style={styles.logo} />
        <Text style={styles.wordmark}>
          mybizmate<Text style={styles.io}>.io</Text>
        </Text>
        <View style={styles.spacer} />
        <Pressable testID="menu" accessibilityLabel="More" hitSlop={8} onPress={() => setMenuOpen(true)}>
          <More color={colors.ink} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Scan an invoice</Text>
        <Text style={styles.description}>
          {"Take a photo of a filled-in MyBizMate Sales Invoice or Service Invoice. It's read right here on your " +
            'phone, in a second or two, even without internet.'}
        </Text>

        <View style={styles.card}>
          <View style={styles.illustration}>
            <ScanIllustration />
          </View>
          <PrimaryButton label="Take photo" icon={Camera} disabled={flow.reading} onPress={() => router.push('/camera')} />
          <OutlinedButton
            label="Choose from gallery"
            icon={ImageIcon}
            disabled={flow.reading}
            onPress={() => flow.fromGallery()}
          />
          <OutlinedButton
            label="Import PDF"
            icon={DocumentIcon}
            disabled={flow.reading}
            onPress={() => flow.fromPdf()}
          />
        </View>

        {saved.length > 0 && (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/saved')}
            style={({ pressed }) => [styles.savedRow, pressed && styles.pressed]}>
            <View style={styles.savedWords}>
              <Text style={styles.savedTitle}>Saved invoices</Text>
              <Text style={styles.savedStatus}>{toExport > 0 ? `${toExport} to export` : 'All exported'}</Text>
            </View>
            <ChevronRight size={20} color={colors.mute} />
          </Pressable>
        )}

        <Text style={[sectionLabel, styles.section]}>FOR THE BEST SCAN</Text>
        {TIPS.map((tip, i) => (
          <View key={tip} style={styles.tip}>
            <View style={styles.tipNumber}>
              <Text style={styles.tipNumberText}>{i + 1}</Text>
            </View>
            <Text style={styles.tipText}>{tip}</Text>
          </View>
        ))}

        {recent.length > 0 && (
          <>
            <Text style={[sectionLabel, styles.section]}>RECENT SCANS</Text>
            <View style={styles.list}>
              {recent.map((scan) => (
                <RecentRow
                  key={scan.id}
                  scan={scan}
                  onPress={() => router.push({ pathname: '/result', params: { id: scan.id, from: 'recent' } })}
                />
              ))}
            </View>
          </>
        )}

        <View style={styles.samples}>
          <TextButton label="No form handy? Try a sample invoice" onPress={() => setSamplesOpen(true)} />
        </View>

        <View style={styles.footer}>
          <Lock size={14} color={colors.mute} />
          <Text style={styles.footerText}>Read on this phone · no internet access</Text>
        </View>
      </ScrollView>

      <Sheet
        visible={samplesOpen}
        title="Sample invoices"
        subtitle="Filled in with 2 handwriting styles the model never trained on, photographed like a phone would."
        onClose={() => setSamplesOpen(false)}>
        {SAMPLES.map((s) => (
          <Pressable
            key={s.id}
            accessibilityRole="button"
            style={({ pressed }) => [styles.sample, pressed && styles.pressed]}
            onPress={() => {
              setSamplesOpen(false);
              void flow.fromSample(s.id);
            }}>
            <Image source={s.source} style={styles.thumb} />
            <View>
              <Text style={styles.sampleLabel}>{s.label}</Text>
              <Text style={styles.sampleFont}>{handwriting(s.font)}</Text>
            </View>
          </Pressable>
        ))}
      </Sheet>

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.menuBackdrop} onPress={() => setMenuOpen(false)}>
          <View style={styles.menu} testID="menu-items">
            {menu.map((item) => (
              <Pressable
                key={item.label}
                accessibilityRole="button"
                style={styles.menuItem}
                onPress={() => {
                  setMenuOpen(false);
                  router.push(item.to);
                }}>
                <Text style={styles.menuText}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      <ReadingOverlay visible={flow.reading} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 12,
    backgroundColor: colors.paper,
  },
  logo: { width: 30, height: 30 },
  wordmark: { ...bold, fontSize: 20, color: colors.ink },
  io: { color: colors.coralText },
  spacer: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  title: { ...bold, fontSize: 30, color: colors.ink, marginTop: 4 },
  description: { fontSize: 15, color: colors.mute, lineHeight: 22, marginTop: 8, marginBottom: 20 },
  card: {
    backgroundColor: colors.panel,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
    gap: 12,
  },
  illustration: { alignItems: 'center', paddingVertical: 4 },
  savedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
    backgroundColor: colors.panel,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  savedWords: { flex: 1 },
  savedTitle: { ...bold, fontSize: 15, color: colors.ink },
  savedStatus: { fontSize: 13, color: colors.mute, marginTop: 2 },
  section: { marginTop: 28, marginBottom: 8 },
  tip: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  tipNumber: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.coralTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipNumberText: { ...bold, fontSize: 13, color: colors.coralText },
  tipText: { flex: 1, fontSize: 15, color: colors.ink, lineHeight: 21 },
  list: {
    backgroundColor: colors.panel,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 16,
  },
  samples: { alignItems: 'center', marginTop: 20 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 20 },
  footerText: { fontSize: 13, color: colors.mute },
  sample: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10 },
  pressed: { opacity: 0.6 },
  thumb: { width: 52, height: 64, borderRadius: 6, backgroundColor: colors.imageBg },
  sampleLabel: { ...bold, fontSize: 15, color: colors.ink },
  sampleFont: { fontSize: 13, color: colors.mute, marginTop: 2 },
  menuBackdrop: { flex: 1 },
  menu: {
    position: 'absolute',
    top: 88,
    right: 16,
    backgroundColor: colors.panel,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 4,
    elevation: 4,
  },
  menuItem: { paddingVertical: 12, paddingHorizontal: 20 },
  menuText: { fontSize: 15, color: colors.ink },
});
