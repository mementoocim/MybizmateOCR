import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useIsFocused, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AppState, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, type ButtonProps } from '../../components/Buttons';
import { IconButton } from '../../components/IconButton';
import { Camera, Flashlight, FlashlightOff } from '../../components/icons';
import { SessionTray } from '../../components/SessionTray';
import { Tap } from '../../components/Tap';
import { TEAM_BUILD } from '../../lib/build';
import { CAMERA_ERRORS, CAMERA_TEXT, PERMISSION_TEXT, statusText } from '../../lib/cameraCopy';
import {
  captures,
  holdReads,
  pendingIn,
  queuePdf,
  queuePhoto,
  READ_WHILE_SHOOTING,
  subscribeQueue,
  whenRead,
} from '../../lib/captureQueue';
import { confirmHaptic } from '../../lib/haptics';
import { useOpenOnce } from '../../lib/navigation';
import { cameraAppPhoto, pickPdf, pickPhoto } from '../../lib/pickers';
import { useSayWhy } from '../../lib/readFailures';
import { sampleUri } from '../../lib/samples';
import { recentScans, subscribeRecent } from '../../lib/scans';
import { closeIdleSession, currentSession, endSession, subscribeSession, takeCapture } from '../../lib/session';
import { trayOf } from '../../lib/sessions';
import { CAPTURE_GRACE_MS, setShutter } from '../../lib/shutter';
import { useStarted } from '../../lib/startup';
import { colors, radius, space, touch, type } from '../../lib/theme';
import {
  type CameraErrorCode,
  type CameraStatus,
  type FormName,
  ScannerCameraView,
  type ScannerCameraRef,
} from '../../modules/scanner';

// Design B §9.3, on the test app's layout (activity_camera.xml and CameraActivity.java), and camera first (spec §6.3,
// the plan's calls 6 to 8). The live picture, its form's outline, auto-capture and the checks are the native view's.
// Over the picture's top band, with no title (the pill names the form once it's found): the Auto switch and the
// flashlight switch. No Close: the camera is a tab, and Back leaves the app. Under the picture, the session's tray
// (components/SessionTray): the gallery, the session's thumbnails and Done · N, and the PDF import; the status pill is
// in its middle until the session has a photo, then at the picture's foot. The tabs' raised middle button is the
// shutter (lib/shutter), which waits while the camera starts or takes the photo.
//
// The camera keeps shooting: every capture (Auto, the shutter, the gallery, the camera app, a PDF) joins the open
// session (lib/session's takeCapture) and goes to the queue (lib/captureQueue), which reads while the camera stays live.
// A read never opens a dialog: a failed one is a "!" in the tray. Done waits while a photo is being taken, then ends the
// session, waits for its reads, and opens the session screen, or a lone scan's Scan screen. A problem (no permission,
// no camera, a camera that won't start) shows a panel in the picture's place, and the tray stays. A photo Auto took gets
// one confirm haptic (§5.5). The status bar's icons are light. Nothing starts, and no permission is asked for, until the splash has gone (call 8).

type Permission = 'checking' | 'granted' | 'ask' | 'settings'; // ask: refused, may ask again; settings: refused for good
type Status = { status: CameraStatus | 'starting'; form: FormName | null };
type Problem = { code: Exclude<CameraErrorCode, 'capture' | 'keep'>; message: string };
type Panel = 'ask' | 'settings' | Problem['code'];

const STARTING: Status = { status: 'starting', form: null };
const ERROR_MS = 3000; // how long a capture error stays in the pill
const DOT = 8; // dp: the Auto switch's dot
const SLOP = (touch.target - touch.chip) / 2; // the Auto pill's hitSlop, above and below, to a 48 dp target
const CAMERA_APP = "Use the phone's camera app instead";
const PHOTO_ERROR = "Couldn't open that photo.";
const PDF_ERROR = "Couldn't open that PDF.";
const NO_PERMISSION = 'The camera app needs the camera permission too. Choose a photo from the gallery instead.';

const TITLE: Record<Panel, string> = {
  ask: CAMERA_TEXT.allowTitle,
  settings: CAMERA_TEXT.offTitle,
  no_camera: CAMERA_ERRORS.noCamera,
  start: CAMERA_TEXT.startTitle,
};

function toPermission(p: ImagePicker.CameraPermissionResponse): Permission {
  return p.granted ? 'granted' : p.canAskAgain ? 'ask' : 'settings';
}

/** A photo that won't be read isn't kept either. */
function discard(uri: string) {
  try {
    new File(uri).delete();
  } catch {
    // already gone
  }
}

export default function CameraScreen() {
  const started = useStarted();
  const startedRef = useRef(started);
  const { sayWhy, sayingWhy } = useSayWhy();
  const open = useOpenOnce();
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const focusedRef = useRef(focused);
  useEffect(() => {
    focusedRef.current = focused;
    startedRef.current = started;
  }, [focused, started]);

  const session = useSyncExternalStore(subscribeSession, currentSession);
  const waiting = useSyncExternalStore(subscribeQueue, captures);
  const recent = useSyncExternalStore(subscribeRecent, recentScans);

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
  const [shooting, setShooting] = useState(false); // the middle button was pressed, and its photo isn't back yet
  const [captureOver, setCaptureOver] = useState(true); // the last 'capturing' ended: its photo, an error or a stop
  const capturingRef = useRef(false); // a photo on its way, for Done (below)
  const landed = useRef<(() => void)[]>([]); // Done, waiting for that photo
  const alive = useRef(true); // false once unmounted: an old root's camera (ruling T26-4) opens nothing (ruling T7-9)
  const pickingRef = useRef(false); // set at once, so a second picker is refused before the re-render
  const [picking, setPicking] = useState(false);
  const [finishing, setFinishing] = useState<string | null>(null); // Done: the session it waits for
  const finishingRef = useRef<string | null>(null);

  // The permission: checked each time the screen is shown and when the app comes back (from the settings, say),
  // and asked for once; never behind the splash.
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

  // On focus: a session left for 30 minutes has closed, and the permission is checked again.
  useFocusEffect(
    useCallback(() => {
      if (!started) return;
      closeIdleSession(new Date());
      void checkPermission();
    }, [checkPermission, started]),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || !focusedRef.current || !startedRef.current) return;
      closeIdleSession(new Date());
      void checkPermission();
    });
    return () => subscription.remove();
  }, [checkPermission]);

  useEffect(() => {
    if (!testParam || !started) return;
    let live = true;
    (testParam.startsWith('file://') ? Promise.resolve(testParam) : sampleUri(testParam))
      .then((uri) => live && setTestImage(uri))
      .catch(() => live && setProblem({ code: 'start', message: '' }));
    return () => {
      live = false;
    };
  }, [testParam, started]);

  useEffect(() => () => clearTimeout(errorTimer.current), []);

  async function allow() {
    setPermission(toPermission(await ImagePicker.requestCameraPermissionsAsync()));
  }

  function tryAgain() {
    setShooting(false); // the camera that went took its photo with it (ruling T7-7)
    setCaptureOver(true);
    setProblem(null);
    setStatus(STARTING);
    setHasTorch(false);
    setMount((m) => m + 1);
  }

  function takePhoto() {
    shutterPressed.current = true;
    setShooting(true);
    setCaptureOver(false);
    void camera.current?.takePhoto();
  }

  function showError(text: string) {
    clearTimeout(errorTimer.current);
    setPillError(text);
    errorTimer.current = setTimeout(() => setPillError(null), ERROR_MS);
  }

  function onCameraError(code: CameraErrorCode, message: string) {
    if (code === 'capture' || code === 'keep') {
      shutterPressed.current = false; // no photo comes for that press
      setShooting(false);
      setCaptureOver(true);
    }
    if (code === 'capture') showError(CAMERA_ERRORS.capture);
    else if (code === 'keep') showError(CAMERA_ERRORS.keep);
    else setProblem({ code, message });
  }

  const testImages = testParam !== null;

  /**
   * A photo the camera took: into the open session's queue, unless the camera wasn't on top (ruling P-F9). One that
   * lands while Done waits was being taken as Done was tapped (its 'capturing' still on its way): it joins the session
   * Done is finishing, and Done waits for it too (ruling T7-2).
   */
  function onPhoto(uri: string) {
    const byAuto = auto && !shutterPressed.current; // the person's eyes are on the paper, not the screen
    shutterPressed.current = false;
    setShooting(false);
    setCaptureOver(true);
    // taken as the screen was left, or as a picker opened: no session takes it
    if (!focusedRef.current || pickingRef.current) {
      discard(uri);
      return;
    }
    if (byAuto) confirmHaptic();
    const now = new Date();
    // finishing (Done waits for this photo): it joins that session, with no Retake link to spend
    const { session: id, replaces, retries } =
      finishingRef.current !== null
        ? { session: finishingRef.current, replaces: null, retries: null }
        : takeCapture(now);
    void queuePhoto(uri, { session: id, source: 'camera', testImage: testImages, replaces, retries }, now).catch(
      () => {},
    );
  }

  /** A picker, one at a time, with the camera off while it's open. A cancel opens no session (ruling P-F9). */
  async function whilePicking(pick: () => Promise<void>): Promise<void> {
    if (pickingRef.current || finishingRef.current !== null) return;
    pickingRef.current = true;
    setPicking(true);
    try {
      await pick();
    } finally {
      pickingRef.current = false;
      setPicking(false);
    }
  }

  /** A picked photo joins the session the way the camera's do: takeCapture only once there's a photo. */
  function queuePicked(uri: string, source: 'gallery' | 'camera_app') {
    const now = new Date();
    const { session: id, replaces, retries } = takeCapture(now);
    void queuePhoto(uri, { session: id, source, testImage: testImages, replaces, retries }, now).catch(() => {});
  }

  const fromGallery = () =>
    whilePicking(async () => {
      let uri: string | null;
      try {
        uri = await pickPhoto();
      } catch {
        sayWhy(PHOTO_ERROR);
        return;
      }
      if (uri !== null) queuePicked(uri, 'gallery');
    });

  const fromCameraApp = () =>
    whilePicking(async () => {
      let taken: string | null | 'no_permission';
      try {
        taken = await cameraAppPhoto();
      } catch {
        sayWhy(PHOTO_ERROR);
        return;
      }
      if (taken === 'no_permission') sayWhy(NO_PERMISSION);
      else if (taken !== null) queuePicked(taken, 'camera_app');
    });

  const fromPdf = () =>
    whilePicking(async () => {
      let picked: Awaited<ReturnType<typeof pickPdf>>;
      try {
        picked = await pickPdf();
      } catch {
        sayWhy(PDF_ERROR);
        return;
      }
      if (picked === 'not_pdf') sayWhy('Choose a PDF file.');
      else if (picked !== null) {
        const now = new Date();
        const { session: id, replaces, retries } = takeCapture(now);
        queuePdf(picked, { session: id, replaces, retries }, now);
      }
    });

  // The tray: the open session's, or the one Done waits for. Its failed reads are that session's own.
  const trayId = finishing ?? (session?.open ? session.id : null);
  const failed = session !== null && session.id === trayId ? session.failed : [];
  const tray = trayId === null ? [] : trayOf(trayId, recent, waiting, failed);
  const items = tray.length > 0 ? tray : null;

  /**
   * Done: the session ends, its reads go on (and are let go, under approach 2), and once they're all read it opens the
   * session screen, or the Scan screen when it kept one scan and no read failed. Its Button runs it once.
   */
  async function done(id: string): Promise<void> {
    finishingRef.current = id;
    setFinishing(id);
    try {
      endSession(id);
      holdReads(false);
      // a 'capturing' still on its way arrives, then its photo lands in this session, or the capture ends (T7-8)
      await new Promise<void>((resolve) => setTimeout(resolve, CAPTURE_GRACE_MS));
      if (capturingRef.current) await new Promise<void>((resolve) => landed.current.push(resolve));
      await whenRead(id);
      // left while it read, or gone (an old root's): the session waits in Sessions
      if (!alive.current || !focusedRef.current) return;
      const kept = recentScans().filter((s) => s.session === id);
      const ended = currentSession();
      const theFailed = ended?.id === id ? ended.failed : [];
      if (kept.length === 1 && theFailed.length === 0) {
        open.push({ pathname: '/result', params: { id: kept[0].id, session: id } });
      } else {
        // Sessions under it; the Sessions Stack keeps one session screen (its layout, ruling T7-6)
        open.navigate({ pathname: '/sessions/[id]', params: { id } }, { withAnchor: true });
      }
    } finally {
      finishingRef.current = null;
      setFinishing(null);
    }
  }

  const panel: Panel | null =
    !testParam && (permission === 'ask' || permission === 'settings') ? permission : (problem?.code ?? null);
  const ready = started && (testParam ? testImage !== null : permission === 'granted');
  const viewUp = !panel && ready;
  // Live while it reads (approach 1): off behind the splash, on another tab, and while a picker or a dialog is up. While
  // Done waits it stays on, with Auto off and the middle button waiting: stopping it would drop a photo still being
  // saved (ScannerCameraView.kt deletes one that lands once it has stopped), and none new is taken (ruling T7-2).
  const live = started && focused && !picking && !sayingWhy;
  const cameraOn = live && viewUp; // a view, running: one that stops or goes drops a photo on its way
  // a photo on its way: Done waits for it
  const capturing = cameraOn && ((status.status === 'capturing' && !captureOver) || shooting);
  const shutterOff = !viewUp || !live || finishing !== null || status.status === 'starting' || capturing;

  // A camera that stops, or whose view goes for a panel, drops a photo on its way: nothing is coming back for the middle
  // button's press, nor for a 'capturing' (ruling T7-7).
  const [wasOn, setWasOn] = useState(cameraOn);
  if (cameraOn !== wasOn) {
    setWasOn(cameraOn);
    if (!cameraOn) {
      setShooting(false);
      setCaptureOver(true);
    }
  }
  // Done, waiting for a photo on its way, goes on once there's none (its photo landed, or the capture ended), and when
  // the camera goes.
  useEffect(() => {
    capturingRef.current = capturing;
    if (capturing) return;
    landed.current.splice(0).forEach((resolve) => resolve());
  }, [capturing]);
  useEffect(() => {
    alive.current = true; // mounted (again, under StrictMode's second run)
    const waiting = landed.current;
    return () => {
      alive.current = false;
      capturingRef.current = false;
      waiting.splice(0).forEach((resolve) => resolve());
    };
  }, []);

  // The tabs' middle button is the shutter while the camera is on top; on another tab it's Camera again.
  const owner = useRef(null); // this camera, as lib/shutter knows it: a stable object
  const takeRef = useRef(takePhoto);
  useEffect(() => {
    takeRef.current = takePhoto;
  });
  useFocusEffect(
    useCallback(() => {
      setShutter(owner, { take: () => takeRef.current(), disabled: shutterOff });
      return () => setShutter(owner, null);
    }, [owner, shutterOff]),
  );
  useEffect(() => () => setShutter(owner, null), [owner]);

  // Approach 2 (spec §5): no read starts while the camera is live.
  useEffect(() => {
    if (READ_WHILE_SHOOTING) return;
    holdReads(live);
    return () => holdReads(false); // left, or gone: the reads go on
  }, [live]);

  // A Retake: the camera opens with the session's link, so Auto stops waiting for the last sheet to leave, and takes
  // the one in view (ruling T1-1). Once per link: a scan's, or a failed read's (ruling T9-5). A build without rearm
  // never crashes the camera for it.
  const retryLink = session?.retries ? `retry:${session.retries}` : null;
  const link = session?.open ? (session.replaces ?? retryLink) : null;
  const rearmed = useRef<string | null>(null);
  useEffect(() => {
    if (link === null) {
      rearmed.current = null;
      return;
    }
    if (!focused || !viewUp || rearmed.current === link) return;
    rearmed.current = link;
    try {
      void camera.current?.rearm().catch(() => {});
    } catch {
      // a build from before rearm: the camera goes on as it was
    }
  }, [link, focused, viewUp]);

  const action: Record<Panel, Pick<ButtonProps, 'label' | 'onPress'>> = {
    ask: { label: 'Allow the camera', onPress: allow },
    settings: { label: 'Open settings', onPress: () => Linking.openSettings() },
    no_camera: { label: 'Choose from gallery', onPress: fromGallery },
    start: { label: 'Try again', onPress: tryAgain },
  };

  const pill = panel ? null : (
    <View testID="status-pill" style={styles.pill}>
      <Text style={[type.body, styles.pillText]}>{pillError ?? statusText(status.status, status.form)}</Text>
    </View>
  );
  const pending = trayId === null ? 0 : pendingIn(trayId);

  return (
    <View style={styles.screen}>
      {/* light icons on the camera, only while it's on top: a tab left stays mounted, and the last status bar mounted
          wins over the root's */}
      {focused && <StatusBar style="light" />}
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
        {viewUp && (
          <ScannerCameraView
            key={mount}
            ref={camera}
            style={styles.fill}
            active={live}
            auto={auto && finishing === null}
            torch={torch}
            testImage={testImage}
            onReady={(e) => setHasTorch(e.nativeEvent.hasTorch)}
            onStatus={(e) => {
              setStatus(e.nativeEvent);
              if (e.nativeEvent.status === 'capturing') setCaptureOver(false);
            }}
            onPhoto={(e) => onPhoto(e.nativeEvent.uri)}
            onCameraError={(e) => onCameraError(e.nativeEvent.code, e.nativeEvent.message)}
          />
        )}
        {pill && items !== null && <View style={styles.pillRow}>{pill}</View>}
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
                  <Button label={CAMERA_APP} variant="text" tone="camera" onPress={fromCameraApp} />
                )}
              </View>
            </View>
          </ScrollView>
        )}
      </View>

      <SessionTray
        items={items}
        hint={pill}
        done={
          trayId === null
            ? null
            : {
                label: finishing !== null && pending > 0 ? `Reading ${pending} more…` : `Done · ${tray.length}`,
                busy: finishing !== null,
                disabled: finishing === null && capturing,
                onPress: () => done(trayId),
              }
        }
        onGallery={() => void fromGallery()}
        onPdf={() => void fromPdf()}
        disabled={picking || finishing !== null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.camera },
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.xs, paddingBottom: space.xs },
  grow: { flex: 1, minHeight: touch.target }, // the band keeps a target's height, with or without the switches
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
});
