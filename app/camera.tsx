import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useIsFocused, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton } from '../components/Buttons';
import { Bolt, Close, FlashOff, FlashOn, ImageIcon } from '../components/icons';
import { ReadingOverlay } from '../components/ReadingOverlay';
import { CAMERA_ERRORS, PERMISSION_TEXT, statusText } from '../lib/cameraCopy';
import { sampleUri } from '../lib/samples';
import { useScanFlow } from '../lib/scanFlow';
import { bold, colors } from '../lib/theme';
import {
  type CameraErrorCode,
  type CameraStatus,
  type FormName,
  ScannerCameraView,
  type ScannerCameraRef,
} from '../modules/scanner';

// The scanner camera (the test app's activity_camera.xml and CameraActivity.java): the live picture with the form's
// outline, a status pill, Auto/Manual, the torch, the gallery and the shutter. A problem (no permission, no camera,
// a camera that won't start) shows in a panel in place of the picture.

type Permission = 'checking' | 'granted' | 'ask' | 'settings'; // ask: refused, may ask again; settings: refused for good
type Status = { status: CameraStatus | 'starting'; form: FormName | null };
type Problem = { code: Exclude<CameraErrorCode, 'capture' | 'keep'>; message: string };

const STARTING: Status = { status: 'starting', form: null };
const ERROR_MS = 3000; // how long a capture error stays in the pill
const WHITE = '#FFFFFF';

function toPermission(p: ImagePicker.CameraPermissionResponse): Permission {
  return p.granted ? 'granted' : p.canAskAgain ? 'ask' : 'settings';
}

export default function CameraScreen() {
  const router = useRouter();
  const flow = useScanFlow();
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const focusedRef = useRef(focused);
  useEffect(() => {
    focusedRef.current = focused;
  }, [focused]);

  // Development builds: /camera?test=<sample id or file:// URI> shows that photo in place of the camera.
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
    if (permission === 'settings') {
      await Linking.openSettings();
      return;
    }
    setPermission(toPermission(await ImagePicker.requestCameraPermissionsAsync()));
  }

  function tryAgain() {
    setProblem(null);
    setStatus(STARTING);
    setHasTorch(false);
    setMount((m) => m + 1);
  }

  function showError(text: string) {
    clearTimeout(errorTimer.current);
    setPillError(text);
    errorTimer.current = setTimeout(() => setPillError(null), ERROR_MS);
  }

  function onCameraError(code: CameraErrorCode, message: string) {
    if (code === 'capture') showError(CAMERA_ERRORS.capture);
    else if (code === 'keep') showError(CAMERA_ERRORS.keep);
    else setProblem({ code, message });
  }

  function onPhoto(uri: string) {
    if (!focusedRef.current) {
      // taken as the screen was left: not read, and not kept
      try {
        new File(uri).delete();
      } catch {
        // already gone
      }
      return;
    }
    void flow.scanUri(uri, 'Camera photo', 'camera', { deletePhoto: true, replace: true });
  }

  const panel: 'permission' | Problem['code'] | null =
    !testParam && (permission === 'ask' || permission === 'settings') ? 'permission' : (problem?.code ?? null);
  const ready = testParam ? testImage !== null : permission === 'granted';
  const panelText =
    panel === 'permission'
      ? PERMISSION_TEXT
      : panel === 'no_camera'
        ? CAMERA_ERRORS.noCamera
        : CAMERA_ERRORS.start(problem?.message);

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <View style={[styles.top, { marginTop: insets.top }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close the camera"
          style={styles.iconButton}
          onPress={() => router.back()}>
          <Close color={WHITE} />
        </Pressable>
        <Text style={styles.title}>Scan an invoice</Text>
        {!panel && (
          <Pressable
            accessibilityRole="button"
            accessibilityHint={
              auto ? 'Takes the photo by itself when the form holds still' : 'Take the photo with the round button'
            }
            style={styles.auto}
            onPress={() => setAuto((a) => !a)}>
            <Bolt size={18} color={colors.coral} />
            <Text style={styles.autoText}>{auto ? 'Auto' : 'Manual'}</Text>
          </Pressable>
        )}
        {!panel && hasTorch && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={torch ? 'Turn the flashlight off' : 'Turn the flashlight on'}
            style={styles.iconButton}
            onPress={() => setTorch((t) => !t)}>
            {torch ? <FlashOn color={WHITE} /> : <FlashOff color={WHITE} />}
          </Pressable>
        )}
      </View>

      <View style={styles.picture}>
        {!panel && ready && (
          <ScannerCameraView
            key={mount}
            ref={camera}
            style={styles.fill}
            active={focused && !flow.reading}
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
            <View style={styles.pill}>
              <Text style={styles.pillText}>{pillError ?? statusText(status.status, status.form)}</Text>
            </View>
          </View>
        )}
        {panel && (
          <View style={styles.panelArea}>
            <View style={styles.panel}>
              <Text style={styles.panelText}>{panelText}</Text>
              {panel === 'permission' && <PrimaryButton label="Allow the camera" onPress={() => void allow()} />}
              {panel === 'start' && <PrimaryButton label="Try again" onPress={tryAgain} />}
              {panel === 'no_camera' && (
                <PrimaryButton label="Choose from gallery" onPress={() => void flow.fromGallery({ replace: true })} />
              )}
              {panel !== 'no_camera' && (
                <Pressable
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.link, pressed && styles.pressed]}
                  onPress={() => void flow.fromCameraApp({ replace: true })}>
                  <Text style={styles.linkText}>{"Use the phone's camera app instead"}</Text>
                </Pressable>
              )}
            </View>
          </View>
        )}
      </View>

      <View style={[styles.bottom, { marginBottom: insets.bottom }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Choose a photo from the gallery instead"
          style={styles.gallery}
          onPress={() => void flow.fromGallery({ replace: true })}>
          <ImageIcon color={WHITE} />
        </Pressable>
        {!panel && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Take the photo"
            style={({ pressed }) => [styles.shutter, pressed && styles.pressed]}
            onPress={() => void camera.current?.takePhoto()}>
            <View style={styles.shutterDisc} />
          </Pressable>
        )}
      </View>

      <ReadingOverlay visible={flow.reading} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000000' },
  top: { height: 56, flexDirection: 'row', alignItems: 'center', paddingStart: 4, paddingEnd: 8 },
  iconButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  title: { ...bold, flex: 1, marginStart: 8, fontSize: 18, color: WHITE },
  auto: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 10 },
  autoText: { ...bold, fontSize: 15, color: colors.coral },
  picture: { flex: 1 },
  fill: { flex: 1 },
  pillRow: { position: 'absolute', left: 0, right: 0, bottom: 16, alignItems: 'center', pointerEvents: 'none' },
  pill: { backgroundColor: colors.pill, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8 },
  pillText: { fontSize: 15, color: WHITE },
  panelArea: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, justifyContent: 'center', padding: 24 },
  panel: { backgroundColor: colors.pill, borderRadius: 20, padding: 20, gap: 16 },
  panelText: { fontSize: 16, lineHeight: 22, color: WHITE, textAlign: 'center' },
  link: { alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 12, marginTop: -12 },
  linkText: { ...bold, fontSize: 15, color: colors.coral },
  bottom: { height: 128, alignItems: 'center', justifyContent: 'center' },
  gallery: {
    position: 'absolute',
    left: 40,
    top: 36,
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    borderColor: colors.coral,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterDisc: { width: 62, height: 62, borderRadius: 31, backgroundColor: WHITE },
  pressed: { opacity: 0.6 },
});
