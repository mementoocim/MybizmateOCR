import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { bold, colors } from '../lib/theme';
import { toast } from '../lib/toast';
import { enhance, saveToPictures, type ScanResult } from '../modules/scanner';
import { TextButton } from './Buttons';
import { Download } from './icons';

type ViewName = 'enhanced' | 'bw' | 'original';
const VIEWS: { name: ViewName; label: string }[] = [
  { name: 'enhanced', label: 'Enhanced' },
  { name: 'bw', label: 'B&W' },
  { name: 'original', label: 'Original' },
];

/**
 * The scan view: the page as Enhanced (the default), B&W or Original, made once each when first chosen; full screen
 * on a tap; Save copies the Enhanced or B&W image into the phone's Pictures. Without a form only the photo shows.
 */
export function ScanImage({ result }: { result: ScanResult }) {
  const page = result.aligned ? result.pageUri : null;
  const [view, setView] = useState<ViewName>(page ? 'enhanced' : 'original');
  const [made, setMade] = useState<Partial<Record<'enhanced' | 'bw', string>>>({});
  const [full, setFull] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingNow = useRef(false);

  useEffect(() => {
    if (view === 'original' || made[view] || !page) return;
    let live = true;
    enhance(page, view)
      .then((uri) => live && setMade((m) => ({ ...m, [view]: uri })))
      .catch(() => live && setView('original'));
    return () => {
      live = false;
    };
  }, [view, page, made]);

  const uri = view === 'original' ? result.originalUri : made[view];

  async function save() {
    if (savingNow.current || !uri) return;
    savingNow.current = true;
    setSaving(true);
    try {
      await saveToPictures(uri);
      toast('Saved to Pictures/MyBizMate Scan');
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code;
      toast(code === 'ERR_SAVE_NEEDS_ANDROID_10' ? 'Saving needs Android 10 or newer.' : "Couldn't save the scan.");
    } finally {
      savingNow.current = false;
      setSaving(false);
    }
  }

  return (
    <View style={styles.card}>
      {page && (
        <View style={styles.bar}>
          <View style={styles.toggle}>
            {VIEWS.map((v) => (
              <Pressable
                key={v.name}
                accessibilityRole="button"
                accessibilityState={{ selected: view === v.name }}
                onPress={() => setView(v.name)}
                style={[styles.option, view === v.name && styles.chosen]}>
                <Text style={[styles.optionText, view === v.name && styles.chosenText]}>{v.label}</Text>
              </Pressable>
            ))}
          </View>
          {view !== 'original' && <TextButton label="Save" icon={Download} onPress={save} disabled={saving || !uri} />}
        </View>
      )}
      <Pressable style={styles.frame} onPress={() => uri && setFull(true)} accessibilityLabel="Show full screen">
        {uri ? (
          <Image testID="scan-image" source={{ uri }} resizeMode="contain" style={styles.image} />
        ) : (
          <ActivityIndicator color={colors.ember} />
        )}
      </Pressable>
      <Modal visible={full} animationType="fade" onRequestClose={() => setFull(false)}>
        {full && (
          <Pressable testID="scan-full" style={styles.full} onPress={() => setFull(false)}>
            {uri && <Image source={{ uri }} resizeMode="contain" style={styles.image} />}
          </Pressable>
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.imageBg, borderRadius: 18, overflow: 'hidden', marginBottom: 24 },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 8, gap: 8 },
  toggle: { flexDirection: 'row', backgroundColor: colors.panel, borderRadius: 12, padding: 2 },
  option: { height: 40, paddingHorizontal: 12, justifyContent: 'center', borderRadius: 10 },
  chosen: { backgroundColor: colors.coralTint },
  optionText: { fontSize: 13, color: colors.mute },
  chosenText: { ...bold, color: colors.coralText },
  frame: { height: 300, alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', height: '100%' },
  full: { flex: 1, backgroundColor: colors.fullScreen },
});
