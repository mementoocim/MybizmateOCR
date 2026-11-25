import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Image, StyleSheet, Text, View, type ViewInstance } from 'react-native';

import { Button } from '../../components/Buttons';
import { Card } from '../../components/Card';
import { Header } from '../../components/Header';
import { Lock, Send } from '../../components/icons';
import { ListRow } from '../../components/ListRow';
import { ReadingOverlay } from '../../components/ReadingOverlay';
import { Screen } from '../../components/Screen';
import { Sheet } from '../../components/Sheet';
import { totalOf, waitingOf } from '../../lib/exportFile';
import { greeting, longDay, peso } from '../../lib/format';
import { lists, subscribeLists } from '../../lib/lists';
import { useOpenOnce } from '../../lib/navigation';
import { type SavedSummary, savedList, subscribeSaved } from '../../lib/saved';
import { SAMPLES } from '../../lib/samples';
import { useScanFlow } from '../../lib/scanFlow';
import { type Kind, recentScans, subscribeRecent } from '../../lib/scans';
import { countLine, homeCounts, oldestWithWork, type Session, sessionTitle, useSessions } from '../../lib/sessions';
import { settings, subscribeSettings, updateSettings } from '../../lib/settings';
import { colors, radius, space, touch, type } from '../../lib/theme';

// Camera first (spec §6.5, the plan's call 18, the approved mockup): Home as cards, top to bottom, each with at most
// one button. The header greets by the time of day, with the date under it. Then: "Get set up" until both its steps are
// done, once; before any scan, "Take your first photo", pointing at the bar's round button; what's left to check or to
// retake, which Check now opens; what's ready to send to MyBizMate, per kind; the last session; then the samples and the
// footer. Every press goes through the screen's one guard (ruling T6-1), the sample's read too. The reading card shows
// over it all while a sample is read.

const TIPS = ['The whole form in the photo', 'Flat on a table, in good light', 'Phone straight above it, no shadows'];

/** Ready to send's lines, one per kind with anything waiting, in this order. */
const KINDS: readonly { kind: Kind; title: string }[] = [
  { kind: 'sale', title: 'Sales' },
  { kind: 'purchase', title: 'Purchases' },
  { kind: '2307', title: '2307s' },
];

const LOCK = 16; // dp: the footer's lock, beside its overline

const handwriting = (font: string) => `${font === 'PatrickHand' ? 'Patrick Hand' : font} handwriting`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The To check card's title: "2 invoices to check and 1 photo to retake", or either part alone. */
function toCheckTitle({ toCheck, retake }: { toCheck: number; retake: number }): string {
  const parts: string[] = [];
  if (toCheck > 0) parts.push(`${plural(toCheck, 'invoice', 'invoices')} to check`);
  if (retake > 0) parts.push(`${plural(retake, 'photo', 'photos')} to retake`);
  return parts.join(' and ');
}

export default function Home() {
  // one guard for every press (ruling T6-1): push, a screen over the tabs; navigate, another tab or a screen in one
  const open = useOpenOnce();
  const { push, navigate: navigateOnce } = open;
  const flow = useScanFlow(open);
  const recent = useSyncExternalStore(subscribeRecent, recentScans); // a scan read on any screen shows at once
  const saved = useSyncExternalStore(subscribeSaved, savedList);
  const theLists = useSyncExternalStore(subscribeLists, lists);
  const theSettings = useSyncExternalStore(subscribeSettings, settings);
  const { sessions, statuses } = useSessions();
  const [samplesOpen, setSamplesOpen] = useState(false);
  const samplesButton = useRef<ViewInstance>(null); // TalkBack focus goes back to it when the sheet closes
  const now = new Date();

  // Get set up: any rows in the lists, and the export defaults (a VAT status chosen and a revenue account)
  const listsDone = theLists.parties.length + theLists.items.length > 0;
  const defaultsDone = theSettings.vatRegistered !== null && theSettings.revenueAccount.trim() !== '';
  const settingUp = !theSettings.setupDone;
  useEffect(() => {
    // Both done: the card goes for good (the plan's call 12), whether or not anything was scanned. It's set once: the
    // store's own value, so a second run before the re-render doesn't write it again.
    if (settingUp && listsDone && defaultsDone && !settings().setupDone) void updateSettings({ setupDone: true });
  }, [settingUp, listsDone, defaultsDone]);

  const firstRun = recent.length === 0 && saved.length === 0; // a sample counts as a scan
  const counts = homeCounts(sessions, statuses); // samples count nowhere (ruling T4-1)
  const lastSession = sessions.find((s) => s.id !== null) ?? null; // newest first

  /** A session's screen in the Sessions tab, its list under it; a scan with no session id, its Scan screen. */
  const openSession = (s: Session) =>
    s.id !== null
      ? navigateOnce({ pathname: '/sessions/[id]', params: { id: s.id } }, { withAnchor: true })
      : push({ pathname: '/result', params: { id: s.members[0].id, from: 'list' } });
  const checkNow = () => {
    const s = oldestWithWork(sessions, statuses);
    if (s) openSession(s);
  };

  return (
    <View style={styles.root}>
      <Screen header={<Header title={greeting(now)} subtitle={longDay(now)} onBack={null} />}>
        <View style={styles.cards}>
          {settingUp && (
            <Card title={`Get set up ${Number(listsDone) + Number(defaultsDone)} of 2`}>
              <View style={styles.rows}>
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
              </View>
            </Card>
          )}

          {firstRun && (
            <Card
              title="Take your first photo"
              body="The round button at the bottom opens the camera."
              action={{ label: 'Open the camera', onPress: () => navigateOnce('/camera') }}>
              <Tips />
            </Card>
          )}

          {counts.toCheck + counts.retake > 0 && (
            <Card title={toCheckTitle(counts)} tone="attention" action={{ label: 'Check now', onPress: checkNow }} />
          )}

          {waitingOf(null, saved).length > 0 && (
            <Card
              title="Ready to send to MyBizMate"
              action={{
                label: 'Go to Export',
                variant: 'secondary',
                icon: Send,
                onPress: () => navigateOnce('/export'),
              }}>
              <ToSend saved={saved} />
            </Card>
          )}

          {lastSession && (
            <Card
              title="Last session"
              body={`${sessionTitle(lastSession.at, now)} · ${countLine(lastSession)}`}
              action={{ label: 'Open the session', variant: 'secondary', onPress: () => openSession(lastSession) }}
            />
          )}
        </View>

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
              if (open.busy()) return; // another press has opened a screen: this one waits
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

/** The first photo's three numbered tips, each one stop for TalkBack. */
function Tips() {
  return (
    <View style={styles.tips}>
      {TIPS.map((tip, i) => (
        <View key={tip} accessible style={styles.tip}>
          <Text style={[type.figure, styles.tipNumber]}>{`${i + 1}`}</Text>
          <Text style={[type.body, styles.tipText]}>{tip}</Text>
        </View>
      ))}
    </View>
  );
}

/**
 * The saved scans waiting to go out (lib/exportFile's waitingOf, as Export counts them): a line per kind with any, its
 * count (value) on the left and its total (figure) on the right, one stop for TalkBack.
 */
function ToSend({ saved }: { saved: readonly SavedSummary[] }) {
  const lines = KINDS.map((k) => ({ ...k, mine: waitingOf(k.kind, saved) })).filter((k) => k.mine.length > 0);
  return (
    <View>
      {lines.map(({ kind, title, mine }, i) => {
        const label = `${title} · ${mine.length}`;
        const total = peso(totalOf(mine));
        return (
          <View
            key={kind}
            testID={`send-${kind}`}
            accessible
            accessibilityLabel={`${label}, ${total}`}
            style={[styles.line, i > 0 && styles.lineAfter]}>
            <Text style={[type.value, styles.lineTitle]}>{label}</Text>
            <Text style={[type.figure, styles.lineTotal]}>{total}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  cards: { gap: space.m, paddingTop: space.l },
  // the rows reach the card's edges, their own gutter in place of its padding
  rows: { marginHorizontal: -space.l, borderTopWidth: 1, borderTopColor: colors.hairline },
  tips: { gap: space.s, paddingVertical: space.xs },
  tip: { flexDirection: 'row', gap: space.m },
  tipNumber: { color: colors.brandText },
  tipText: { flex: 1, color: colors.ink },
  line: { flexDirection: 'row', alignItems: 'baseline', gap: space.m, paddingVertical: space.xs },
  lineAfter: { borderTopWidth: 1, borderTopColor: colors.hairline },
  lineTitle: { flex: 1, color: colors.ink },
  lineTotal: { color: colors.ink, textAlign: 'right' },
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
