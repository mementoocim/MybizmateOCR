import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Image, StyleSheet, Text, View, type ViewInstance } from 'react-native';

import { ButtonRow } from '../../components/BottomBar';
import { Button } from '../../components/Buttons';
import { Header } from '../../components/Header';
import { IconButton } from '../../components/IconButton';
import { Camera, FileText, ImageIcon, ListIcon, Lock, SettingsIcon } from '../../components/icons';
import { ListRow } from '../../components/ListRow';
import { ReadingOverlay } from '../../components/ReadingOverlay';
import { RecentRow } from '../../components/RecentRow';
import { Screen } from '../../components/Screen';
import { SectionHeader } from '../../components/SectionHeader';
import { Sheet } from '../../components/Sheet';
import { totalOf, waitingOf } from '../../lib/exportFile';
import { peso } from '../../lib/format';
import { lists, subscribeLists } from '../../lib/lists';
import { useOpenOnce } from '../../lib/navigation';
import { type SavedSummary, savedList, subscribeSaved } from '../../lib/saved';
import { SAMPLES } from '../../lib/samples';
import { useScanFlow } from '../../lib/scanFlow';
import { type Kind, recentScans, subscribeRecent } from '../../lib/scans';
import { settings, subscribeSettings, updateSettings } from '../../lib/settings';
import { colors, radius, space, touch, type } from '../../lib/theme';

// Design B §9.2: Home as a workspace. The header has the wordmark, and Your lists and Settings as icon buttons. Then,
// top to bottom: capture (Take photo; From gallery and Import PDF; what the app reads); on a first run, the tips; "Get
// set up" until both its steps are done, once; what's waiting to export, per kind; the recent scans, each with its
// state; then the samples and the footer. The reading card shows over all of it while a capture is read, and a capture
// that fails says why in a dialog (lib/scanFlow).

const TIPS = ['The whole form in the photo', 'Flat on a table, in good light', 'Phone straight above it, no shadows'];

/** The To export rows, one per kind with anything waiting, in this order. */
const EXPORTS: readonly { kind: Kind; title: string; sub: (n: number) => string }[] = [
  { kind: 'sale', title: 'Sales', sub: (n) => `${n} to export` },
  { kind: 'purchase', title: 'Purchases', sub: (n) => `${n} to export` },
  { kind: '2307', title: '2307s', sub: (n) => `${n} to export · Tax withheld` },
];

const LOCK = 16; // dp: the footer's lock, beside its overline

const handwriting = (font: string) => `${font === 'PatrickHand' ? 'Patrick Hand' : font} handwriting`;

export default function Home() {
  // one guard for every press (ruling T6-1): push, a screen over the tabs; navigate, another tab (the camera, Profile)
  const { push, navigate: navigateOnce } = useOpenOnce();
  const flow = useScanFlow();
  const recent = useSyncExternalStore(subscribeRecent, recentScans); // a scan read on any screen shows at once
  const saved = useSyncExternalStore(subscribeSaved, savedList);
  const theLists = useSyncExternalStore(subscribeLists, lists);
  const theSettings = useSyncExternalStore(subscribeSettings, settings);
  const [samplesOpen, setSamplesOpen] = useState(false);
  const samplesButton = useRef<ViewInstance>(null); // TalkBack focus goes back to it when the sheet closes

  // Get set up: any rows in the lists, and the export defaults (a VAT status chosen and a revenue account)
  const listsDone = theLists.parties.length + theLists.items.length > 0;
  const defaultsDone = theSettings.vatRegistered !== null && theSettings.revenueAccount.trim() !== '';
  const settingUp = !theSettings.setupDone;
  useEffect(() => {
    // Both done: the section goes for good (the plan's call 12), whether or not anything was scanned. It's set once:
    // the store's own value, so a second run before the re-render doesn't write it again.
    if (settingUp && listsDone && defaultsDone && !settings().setupDone) void updateSettings({ setupDone: true });
  }, [settingUp, listsDone, defaultsDone]);

  const firstRun = recent.length === 0 && saved.length === 0; // a sample counts as a scan
  // The Export tab: a kind's file, with the tab's first step under it; or the first step, for every kind
  const openExport = (kind?: Kind) =>
    kind
      ? navigateOnce({ pathname: '/export/[which]', params: { which: kind } }, { withAnchor: true })
      : navigateOnce('/export');

  const header = (
    <Header
      brand
      onBack={null}
      right={
        <>
          <IconButton icon={ListIcon} label="Your lists" onPress={() => push('/lists')} />
          <IconButton icon={SettingsIcon} label="Settings" onPress={() => navigateOnce('/profile')} />
        </>
      }
    />
  );

  return (
    <View style={styles.root}>
      <Screen header={header}>
        <View style={styles.capture}>
          <Button
            label="Take photo"
            size="large"
            icon={Camera}
            disabled={flow.reading}
            onPress={() => navigateOnce('/camera')}
          />
          <ButtonRow
            buttons={[
              {
                label: 'From gallery',
                variant: 'secondary',
                icon: ImageIcon,
                disabled: flow.reading,
                onPress: () => flow.fromGallery(),
              },
              {
                label: 'Import PDF',
                variant: 'secondary',
                icon: FileText,
                disabled: flow.reading,
                onPress: () => flow.fromPdf(),
              },
            ]}
          />
          {/* caps by the overline style: MYBIZMATE INVOICE · SERVICE INVOICE · BIR 2307, the form's name kept on one
              line by a no-break space */}
          <Text style={[type.overline, styles.caption]}>{'MyBizMate invoice · Service Invoice · BIR\u00A02307'}</Text>
        </View>

        {firstRun && <Tips />}

        {settingUp && (
          <>
            <SectionHeader title="Get set up" right={`${Number(listsDone) + Number(defaultsDone)} of 2`} />
            <ListRow
              title="Import your customers and items"
              sub="So scans can check names, TINs and prices"
              chevron
              checked={listsDone}
              onPress={() => push('/lists')}
            />
            <ListRow
              title="Set your export defaults"
              sub="VAT status and accounts for MyBizMate"
              chevron
              checked={defaultsDone}
              onPress={() => navigateOnce('/profile')}
            />
          </>
        )}

        {saved.length > 0 && <ToExport saved={saved} onOpen={openExport} />}

        {recent.length > 0 && (
          <>
            <SectionHeader title="Recent scans" />
            {recent.map((scan) => (
              <RecentRow
                key={scan.id}
                scan={scan}
                onPress={() => push({ pathname: '/result', params: { id: scan.id, from: 'recent' } })}
              />
            ))}
            <Text style={[type.label, styles.note]}>The last 20 scans stay here. Save a scan to keep it.</Text>
          </>
        )}

        <View style={styles.end}>
          <Button ref={samplesButton} variant="text" label="Try a sample invoice" onPress={() => setSamplesOpen(true)} />
          <View style={styles.footer}>
            <Lock size={LOCK} color={colors.mute} />
            {/* caps by the overline style: READ ON THIS PHONE · NO INTERNET */}
            <Text style={[type.overline, styles.footerText]}>Read on this phone · no internet</Text>
          </View>
        </View>
      </Screen>

      <Sheet
        visible={samplesOpen}
        title="Sample invoices"
        subtitle="Filled in with 2 handwriting styles the model never trained on, photographed like a phone would."
        onClose={() => setSamplesOpen(false)}
        returnFocus={samplesButton}
        gutter={false}>
        {SAMPLES.map((s) => (
          <ListRow
            key={s.id}
            title={s.label}
            sub={handwriting(s.font)}
            leading={<Image source={s.source} style={styles.thumb} />}
            onPress={() => {
              setSamplesOpen(false);
              void flow.fromSample(s.id);
            }}
          />
        ))}
      </Sheet>

      <ReadingOverlay visible={flow.reading} what={flow.readingWhat ?? 'photo'} />
    </View>
  );
}

/** Before the first scan: three numbered tips, each one stop for TalkBack. */
function Tips() {
  return (
    <>
      <SectionHeader title="Before your first scan" />
      <View style={styles.tips}>
        {TIPS.map((tip, i) => (
          <View key={tip} accessible style={styles.tip}>
            <Text style={[type.figure, styles.tipNumber]}>{`${i + 1}`}</Text>
            <Text style={[type.body, styles.tipText]}>{tip}</Text>
          </View>
        ))}
      </View>
    </>
  );
}

/**
 * The saved scans: a row per kind with any waiting to export (lib/exportFile's waitingOf, as Export counts them), with
 * their count (figureSmall) and total (figure), each opening its file in the Export tab; or, with none waiting, one row
 * saying everything is exported, which opens the tab, as All saved does.
 */
function ToExport({ saved, onOpen }: { saved: readonly SavedSummary[]; onOpen: (kind?: Kind) => void }) {
  if (waitingOf(null, saved).length === 0) {
    return (
      <>
        <SectionHeader title="Saved" />
        <ListRow title="Everything is exported" chevron onPress={() => onOpen()} />
      </>
    );
  }
  return (
    <>
      <SectionHeader title="To export" action={{ label: 'All saved', onPress: () => onOpen() }} />
      {EXPORTS.map(({ kind, title, sub }) => {
        const mine = waitingOf(kind, saved);
        if (mine.length === 0) return null;
        return (
          <ListRow
            key={kind}
            title={title}
            sub={sub(mine.length)}
            subMono
            amount={peso(totalOf(mine))}
            chevron
            onPress={() => onOpen(kind)}
          />
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  capture: { padding: space.l, gap: space.s },
  caption: { color: colors.mute, textAlign: 'center' },
  tips: {
    gap: space.s,
    paddingVertical: space.m,
    paddingHorizontal: space.l,
    backgroundColor: colors.panel,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  tip: { flexDirection: 'row', gap: space.m },
  tipNumber: { color: colors.brandText },
  tipText: { flex: 1, color: colors.ink },
  note: { color: colors.mute, paddingTop: space.s, paddingHorizontal: space.l },
  end: { alignItems: 'center', gap: space.s, paddingTop: space.l, paddingHorizontal: space.l },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs },
  footerText: { flexShrink: 1, color: colors.mute, textAlign: 'center' },
  // as the Scan screen's photo thumbnail
  thumb: {
    width: touch.thumbW,
    height: touch.thumbH,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.badge,
    backgroundColor: colors.crop, // until the picture has loaded
  },
});
