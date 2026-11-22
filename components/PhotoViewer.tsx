import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, space, touch } from '../lib/theme';
import { toast } from '../lib/toast';
import { enhance, saveToPictures, type ScanResult } from '../modules/scanner';
import { Button } from './Buttons';
import { Header } from './Header';
import { Download } from './icons';
import { ScrollIntoViewScope } from './Screen';
import { Segmented } from './Segmented';
import { SnackbarHost } from './Snackbar';
import { Tap } from './Tap';

// Design B §5.5, §7, §8 and §9.5: the photo, in place of the Scan screen's image card. The thumbnail sits in the
// Scan screen's header: 36×48 in a hairline border, the straightened page when the form was found, else the photo, in
// a 48 dp target. It opens the viewer: an RN Modal, full screen on the viewer fill and edge to edge, with light
// status-bar icons and no motion (§5.5 doesn't animate it). Under Close (x) and the title "Photo": when the form was
// found, a dark choice of Enhanced (the default), B&W and Original; the image; and for Enhanced and B&W, "Save to
// Pictures", which copies it into the phone's Pictures/MyBizMate Scan and runs once on a double tap. Enhanced and B&W
// are each made from the page once: Enhanced as soon as the viewer mounts, so it's ready when it opens, and B&W when
// it's first chosen. One that can't be made falls back to Original. While it's open the viewer is the snackbar's host
// (the plan's call 4), so the save's message shows above the Save bar, not behind the viewer. Nothing in it scrolls,
// so its scroll-into-view scope is a no-op. Back closes it.

type ViewName = 'enhanced' | 'bw' | 'original';
const VIEWS: readonly { value: ViewName; label: string }[] = [
  { value: 'enhanced', label: 'Enhanced' },
  { value: 'bw', label: 'B&W' },
  { value: 'original', label: 'Original' },
];

/** The straightened page, when the form was found. */
const pageOf = (result: ScanResult): string | null => (result.aligned ? result.pageUri : null);

export function PhotoThumb({ result, onPress }: { result: ScanResult; onPress: () => void }) {
  const uri = pageOf(result) ?? result.originalUri;
  if (uri === null) return null;
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel="Photo of the form"
      accessibilityHint="Opens it full screen"
      onPress={onPress}
      ripple="icon" // in the header's place for icon buttons, with their ripple
      style={styles.thumbTarget}>
      <Image testID="photo-thumb" source={{ uri }} resizeMode="cover" style={styles.thumb} />
    </Tap>
  );
}

export function PhotoViewer({ visible, result, onClose }: { visible: boolean; result: ScanResult; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const page = pageOf(result);
  const [view, setView] = useState<ViewName>(page ? 'enhanced' : 'original');
  const [made, setMade] = useState<Partial<Record<'enhanced' | 'bw', string>>>({});
  const [actionsHeight, setActionsHeight] = useState(0); // as laid out: its padding takes in the bottom inset

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
  const saveable = view !== 'original';

  return (
    <Modal
      testID="photo-viewer"
      visible={visible}
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      backdropColor={colors.viewer}
      onRequestClose={onClose}>
      <StatusBar style="light" />
      <ScrollIntoViewScope scrollRef={null}>
        <Header tone="dark" title="Photo" backIcon="close" onBack={onClose} />
        {page && (
          <View style={styles.views}>
            <Segmented tone="dark" label="View" options={VIEWS} value={view} onChange={setView} />
          </View>
        )}
        {/* With no Save bar under it, the image stays clear of the navigation bar itself. */}
        <View style={[styles.frame, !saveable && { marginBottom: insets.bottom }]}>
          {uri ? (
            <Image testID="scan-image" source={{ uri }} resizeMode="contain" style={styles.image} />
          ) : (
            <ActivityIndicator testID="scan-image-spinner" color={colors.brand} />
          )}
        </View>
        {saveable && (
          <View
            testID="photo-viewer-actions"
            onLayout={(e) => setActionsHeight(e.nativeEvent.layout.height)}
            style={[styles.actions, { paddingBottom: space.m + insets.bottom }]}>
            <Button
              label="Save to Pictures"
              icon={Download}
              disabled={!uri}
              onPress={() => (uri ? saveImage(uri) : undefined)}
            />
          </View>
        )}
        <SnackbarHost bottomOffset={(saveable ? actionsHeight : insets.bottom) + space.s} />
      </ScrollIntoViewScope>
    </Modal>
  );
}

/** Copies the image into the phone's Pictures/MyBizMate Scan, and says how it went. */
async function saveImage(uri: string): Promise<void> {
  try {
    await saveToPictures(uri);
    toast('Saved to Pictures › MyBizMate Scan');
  } catch (e: unknown) {
    const code = (e as { code?: string } | null)?.code;
    toast(code === 'ERR_SAVE_NEEDS_ANDROID_10' ? 'Saving needs Android 10 or newer.' : "Couldn't save the scan.");
  }
}

const styles = StyleSheet.create({
  thumbTarget: { width: touch.target, height: touch.target, alignItems: 'center', justifyContent: 'center' },
  thumb: {
    width: touch.thumbW,
    height: touch.thumbH,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.badge,
    backgroundColor: colors.crop, // until the picture has loaded
  },
  views: { paddingHorizontal: space.l, paddingBottom: space.m },
  frame: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  image: { flex: 1, alignSelf: 'stretch' },
  actions: { paddingHorizontal: space.l, paddingTop: space.m },
});
