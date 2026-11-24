import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useIsFocused, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, type ButtonProps } from '../../components/Buttons';
import { IconButton } from '../../components/IconButton';
import { Camera, Flashlight, FlashlightOff, ImageIcon } from '../../components/icons';
import { ReadingOverlay } from '../../components/ReadingOverlay';
import { useTabBarSpace } from '../../components/Screen';
import { Tap } from '../../components/Tap';
import { TEAM_BUILD } from '../../lib/build';
import { CAMERA_ERRORS, CAMERA_TEXT, PERMISSION_TEXT, statusText } from '../../lib/cameraCopy';
import { confirmHaptic } from '../../lib/haptics';
import { sampleUri } from '../../lib/samples';
import { useScanFlow } from '../../lib/scanFlow';
import { colors, radius, space, touch, type } from '../../lib/theme';
import {
  type CameraErrorCode,
  type CameraStatus,
  type FormName,
  ScannerCameraView,
  type ScannerCameraRef,
} from '../../modules/scanner';

// Design B §9.3, on the test app's layout (activity_camera.xml and CameraActivity.java). The live picture, its form's
// outline, auto-capture and the checks are the native view's. Over the picture's top band, with no title (the pill
// names the form once it's found): the Auto switch and the flashlight switch. No Close: the camera is a tab (camera
// first, call 8), and Back leaves the app. At its foot, the status pill. Under
// it, the gallery (an icon over its label) and the shutter, which waits while the camera starts or takes the photo. A
// problem (no permission, no camera, a camera that won't start) shows a panel in the picture's place, and the gallery
// stays. A photo Auto took gets one confirm haptic (§5.5), then the reading card. The status bar's icons are light,
// and dark while the reading card's light wash covers the screen (§8).

type Permission = 'checking' | 'granted' | 'ask' | 'settings'; // ask: refused, may ask again; settings: refused for good
type Status = { status: CameraStatus | 'starting'; form: FormName | null };
type Problem = { code: Exclude<CameraErrorCode, 'capture' | 'keep'>; message: string };
type Panel = 'ask' | 'settings' | Problem['code'];

const STARTING: Status = { status: 'starting', form: null };
const ERROR_MS = 3000; // how long a capture error stays in the pill
const DOT = 8; // dp: the Auto switch's dot
const RING = 3; // dp: the shutter's brand ring
const DISC = touch.shutter - 2 * (RING + space.xs); // the shutter's white disc, a little inside its ring
const SLOP = (touch.target - touch.chip) / 2; // the Auto pill's hitSlop, above and below, to a 48 dp target
const CAMERA_APP = "Use the phone's camera app instead";

const TITLE: Record<Panel, string> = {
  ask: CAMERA_TEXT.allowTitle,
  settings: CAMERA_TEXT.offTitle,
  no_camera: CAMERA_ERRORS.noCamera,
  start: CAMERA_TEXT.startTitle,
};

function toPermission(p: ImagePicker.CameraPermissionResponse): Permission {
  return p.granted ? 'granted' : p.canAskAgain ? 'ask' : 'settings';
}

export default function CameraScreen() {
  const flow = useScanFlow();
  const insets = useSafeAreaInsets();
  const tabBar = useTabBarSpace(); // the tabs' floating bar, over the foot of the screen
  const focused = useIsFocused();
  const focusedRef = useRef(focused);
  useEffect(() => {
    focusedRef.current = focused;
  }, [focused]);

  // Development builds: /camera?test=<sample id or file:// URI> shows that photo in place of the camera. Its scans are
  // test images: they can be saved, but never become training data.
  const { test } = useLocalSearchParams<{ test?: string }>();
  const testParam = __DEV__ && typeof test === 'string' && test.length > 0 ? test : null;
  const [testImage, setTestImage] = useState<string | null>(null);

  const [permission, setPermission] = useState<Permission>('checking');
  const asked = useRef(false);
  const checking = useRef(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [mount, setMount] = useState(0); // a new value starts a new camera view (Try again)
  const [status, setStatus] = useState<Status>(STARTING);
  const [pillError, setPillError] = useState<string | null>(null);
  const errorTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [auto, setAuto] = useState(true);
  const [hasTorch, setHasTorch] = useState(false);
  const [torch, setTorch] = useState(false);
  const camera = useRef<ScannerCameraRef>(null);
  const shutterPressed = useRef(false); // the photo on its way is the shutter's, not one Auto took

  // The permission: checked each time the screen is shown and when the app comes back (from the settings, say),
  // and asked for once.
  const checkPermission = useCallback(async () => {
    if (testParam || checking.current) return;
    checking.current = true;
    try {
      let p = await ImagePicker.getCameraPermissionsAsync();
      if (!p.granted && p.canAskAgain && !asked.current) {
        asked.current = true;
        p = await ImagePicker.requestCameraPermissionsAsync();
      }
      setPermission(toPermission(p));
    } catch {
      setPermission('ask');
    } finally {
      checking.current = false;
    }
  }, [testParam]);

  useFocusEffect(
    useCallback(() => {
      void checkPermission();
    }, [checkPermission]),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && focusedRef.current) void checkPermission();
    });
    return () => subscription.remove();
  }, [checkPermission]);

  useEffect(() => {
    if (!testParam) return;
    let live = true;
    (testParam.startsWith('file://') ? Promise.resolve(testParam) : sampleUri(testParam))
      .then((uri) => live && setTestImage(uri))
      .catch(() => live && setProblem({ code: 'start', message: '' }));
    return () => {
      live = false;
    };
  }, [testParam]);

  useEffect(() => () => clearTimeout(errorTimer.current), []);

  async function allow() {
    setPermission(toPermission(await ImagePicker.requestCameraPermissionsAsync()));
  }

  function tryAgain() {
    setProblem(null);
    setStatus(STARTING);
    setHasTorch(false);
    setMount((m) => m + 1);
  }

  function takePhoto() {
    shutterPressed.current = true;
    void camera.current?.takePhoto();
  }

  function showError(text: string) {
    clearTimeout(errorTimer.current);
    setPillError(text);
    errorTimer.current = setTimeout(() => setPillError(null), ERROR_MS);
  }

  function onCameraError(code: CameraErrorCode, message: string) {
    if (code === 'capture' || code === 'keep') shutterPressed.current = false; // no photo comes for that press
    if (code === 'capture') showError(CAMERA_ERRORS.capture);
    else if (code === 'keep') showError(CAMERA_ERRORS.keep);
    else setProblem({ code, message });
  }

  /** A photo that won't be read isn't kept either. */
  function discard(uri: string) {
    try {
      new File(uri).delete();
    } catch {
      // already gone
    }
  }

  function onPhoto(uri: string) {
    const byAuto = auto && !shutterPressed.current; // the person's eyes are on the paper, not the screen
    shutterPressed.current = false;
    if (!focusedRef.current) {
      discard(uri); // taken as the screen was left
      return;
    }
    if (byAuto) confirmHaptic(); // before the reading card
    // taken just as the gallery opened: the scan flow is busy and doesn't take it
    void flow
      .scanUri(uri, 'Camera photo', 'camera', { deletePhoto: true, testImage: testParam !== null })
      .then((taken) => taken || discard(uri));
  }

  const panel: Panel | null =
    !testParam && (permission === 'ask' || permission === 'settings') ? permission : (problem?.code ?? null);
  const ready = testParam ? testImage !== null : permission === 'granted';
  const shutterOff = status.status === 'starting' || status.status === 'capturing' || flow.busy;
  const action: Record<Panel, Pick<ButtonProps, 'label' | 'onPress'>> = {
    ask: { label: 'Allow the camera', onPress: allow },
    settings: { label: 'Open settings', onPress: () => Linking.openSettings() },
    no_camera: { label: 'Choose from gallery', onPress: () => flow.fromGallery() },
    start: { label: 'Try again', onPress: tryAgain },
  };

  return (
    <View style={styles.screen}>
      {/* light icons on the camera; dark over the reading card's light wash while it shows (§8: dark on light). Only
          while the camera is on top: a tab left stays mounted, and the last status bar mounted wins over the root's. */}
      {focused && <StatusBar style={flow.reading ? 'dark' : 'light'} />}
      <View style={[styles.top, { paddingTop: insets.top + space.xs }]}>
        <View style={styles.grow} />
        {!panel && (
          <Tap
            accessibilityRole="switch"
            accessibilityLabel="Auto capture"
            accessibilityState={{ checked: auto }}
            accessibilityHint={
              auto ? 'Takes the photo by itself when the form holds still' : 'Take the photo with the round button'
            }
            ripple="dark"
            focusRadius={radius.pill}
            hitSlop={{ top: SLOP, bottom: SLOP }}
            onPress={() => setAuto((a) => !a)}
            style={styles.auto}>
            <View testID="auto-dot" style={[styles.dot, auto ? styles.dotOn : styles.dotOff]} />
            <Text style={[type.badge, styles.autoText]}>Auto</Text>
          </Tap>
        )}
        {!panel && hasTorch && (
          <IconButton
            icon={torch ? Flashlight : FlashlightOff}
            label="Flashlight"
            tone="camera"
            accessibilityRole="switch"
            checked={torch}
            onPress={() => setTorch((t) => !t)}
          />
        )}
      </View>

      <View style={styles.picture}>
        {!panel && ready && (
          <ScannerCameraView
            key={mount}
            ref={camera}
            style={styles.fill}
            // off while a photo is picked or read, and behind its failure's dialog, where Auto would take another
            active={focused && !flow.busy && !flow.sayingWhy}
            auto={auto}
            torch={torch}
            testImage={testImage}
            onReady={(e) => setHasTorch(e.nativeEvent.hasTorch)}
            onStatus={(e) => setStatus(e.nativeEvent)}
            onPhoto={(e) => onPhoto(e.nativeEvent.uri)}
            onCameraError={(e) => onCameraError(e.nativeEvent.code, e.nativeEvent.message)}
          />
        )}
        {!panel && (
          <View style={styles.pillRow}>
            <View testID="status-pill" style={styles.pill}>
              <Text style={[type.body, styles.pillText]}>{pillError ?? statusText(status.status, status.form)}</Text>
            </View>
          </View>
        )}
        {panel && (
          // It scrolls when large text makes it taller than the picture.
          <ScrollView style={StyleSheet.absoluteFill} contentContainerStyle={styles.panelArea}>
            <View testID="camera-panel" style={styles.panel}>
              <View style={styles.panelHead}>
                <Camera size={touch.icon} color={colors.cameraText} />
                <Text accessibilityRole="header" style={[type.headline, styles.panelTitle]}>
                  {TITLE[panel]}
                </Text>
                {panel === 'ask' && <Text style={[type.body, styles.panelBody]}>{PERMISSION_TEXT}</Text>}
                {panel === 'settings' && <Text style={[type.body, styles.panelBody]}>{CAMERA_TEXT.offBody}</Text>}
                {/* the camera's own words, for the team: a client never sees them */}
                {panel === 'start' && TEAM_BUILD && problem?.message ? (
                  <Text style={[type.figureSmall, styles.panelBody]}>{problem.message}</Text>
                ) : null}
              </View>
              <View style={styles.panelActions}>
                <Button {...action[panel]} />
                {panel !== 'no_camera' && (
                  <Button
                    label={CAMERA_APP}
                    variant="text"
                    tone="camera"
                    onPress={() => flow.fromCameraApp()}
                  />
                )}
              </View>
            </View>
          </ScrollView>
        )}
      </View>

      <View style={[styles.bottom, { paddingBottom: space.xl + Math.max(insets.bottom, tabBar) }]}>
        <View style={styles.side}>
          <Tap
            accessibilityRole="button"
            accessibilityLabel="Gallery"
            ripple="dark"
            onPress={() => void flow.fromGallery()}
            style={styles.gallery}>
            <ImageIcon size={touch.icon} color={colors.cameraText} />
            <Text style={[type.label, styles.galleryText]}>Gallery</Text>
          </Tap>
        </View>
        <View style={styles.shutterSlot}>
          {!panel && (
            <Tap
              accessibilityRole="button"
              accessibilityLabel="Take the photo"
              disabled={shutterOff}
              ripple="dark"
              focusRadius={touch.shutter / 2}
              onPress={takePhoto}
              style={styles.shutter}>
              <View testID="shutter-disc" style={styles.disc} />
            </Tap>
          )}
        </View>
        <View style={styles.side} />
      </View>

      <ReadingOverlay visible={flow.reading} what={flow.readingWhat ?? 'photo'} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.camera },
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.xs, paddingBottom: space.xs },
  grow: { flex: 1, minHeight: touch.target }, // the band keeps Close's height, with or without the switches
  auto: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s,
    minHeight: touch.chip,
    paddingHorizontal: space.m,
    marginHorizontal: space.m,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.cameraMute,
  },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2 },
  dotOn: { backgroundColor: colors.brand },
  dotOff: { borderWidth: 1, borderColor: colors.cameraMute },
  autoText: { color: colors.cameraText },
  picture: { flex: 1 },
  fill: { flex: 1 },
  pillRow: { position: 'absolute', left: 0, right: 0, bottom: space.l, alignItems: 'center', pointerEvents: 'none' },
  pill: {
    maxWidth: '90%',
    backgroundColor: colors.pill,
    borderRadius: radius.pill,
    paddingHorizontal: space.l,
    paddingVertical: space.s,
  },
  pillText: { color: colors.cameraText, textAlign: 'center' },
  panelArea: { flexGrow: 1, justifyContent: 'center', padding: space.xl },
  panel: { backgroundColor: colors.cameraPanel, borderRadius: radius.panel, padding: space.xl, gap: space.l },
  panelHead: { alignItems: 'center', gap: space.s },
  panelTitle: { color: colors.cameraText, textAlign: 'center' },
  panelBody: { color: colors.cameraMute, textAlign: 'center' },
  panelActions: { gap: space.xs },
  bottom: { flexDirection: 'row', alignItems: 'center', paddingTop: space.xl, paddingHorizontal: space.xl },
  side: { flex: 1, alignItems: 'flex-start' },
  gallery: {
    minWidth: touch.target,
    minHeight: touch.target,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    borderRadius: radius.button,
  },
  galleryText: { color: colors.cameraMute },
  shutterSlot: { width: touch.shutter, height: touch.shutter },
  shutter: {
    width: touch.shutter,
    height: touch.shutter,
    borderRadius: touch.shutter / 2,
    borderWidth: RING,
    borderColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disc: { width: DISC, height: DISC, borderRadius: DISC / 2, backgroundColor: colors.cameraText },
});
