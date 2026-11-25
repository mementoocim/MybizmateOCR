import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { StyleSheet, View } from 'react-native';

import { Banner } from '../../../components/Banner';
import { ButtonRow } from '../../../components/BottomBar';
import { Card } from '../../../components/Card';
import { EmptyState } from '../../../components/EmptyState';
import { Header } from '../../../components/Header';
import { ListRow } from '../../../components/ListRow';
import { Screen } from '../../../components/Screen';
import { SectionHeader } from '../../../components/SectionHeader';
import { confirmDeleteSaved, confirmDeleteScan } from '../../../lib/confirmDelete';
import { amount, formatClock } from '../../../lib/format';
import { lists, subscribeLists } from '../../../lib/lists';
import { useOpenOnce } from '../../../lib/navigation';
import { openSaved } from '../../../lib/saved';
import { getScan } from '../../../lib/scans';
import { shownLabel } from '../../../lib/scanState';
import { currentSession, type FailedRead, retakeIn, subscribeSession } from '../../../lib/session';
import {
  cardLine,
  countLine,
  type Member,
  memberAmount,
  nextToCheck,
  type Session,
  scanBadge,
  scanFields,
  scanSub,
  sessionTitle,
  tallyOf,
  useSessions,
} from '../../../lib/sessions';
import { settings, subscribeSettings } from '../../../lib/settings';
import { colors, space } from '../../../lib/theme';
import { toast } from '../../../lib/toast';

// Spec §6.4 (the plan's calls 2, 3, 9 and 10): a session, in the Sessions tab under its bar. The header is when it
// started, with "Session · 3 invoices". A card counts what's left ("1 ready · 1 to check · 1 to retake", the reads that
// failed among the retakes), amber while anything is, with Check the next one: the first scan, oldest first, that isn't
// saved and whose form was found. While it's the camera's session, a banner says which photos couldn't be read, and
// why. Then a row per scan, oldest first, each opening its Scan screen in this session; a long press asks to delete it.
// A scan whose form wasn't found has Retake (the camera, in this session: its next photo replaces the scan once it
// reads) and Remove under its row. Every press that opens goes through the one guard (ruling T6-1), and a delete's
// dialog is one at a time, so a double tap runs once (Review Focus 5).
//
// The Stack keeps one session screen (ruling T7-6), so Done on another session gives this one a new id while it's
// mounted. Everything below is keyed on the id: its guards and its Header start again with each session.

export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <SessionOf key={id} id={id ?? ''} />;
}

/** A session with no scans left: its reads that failed alone, or nothing. */
const none = (id: string): Session => ({ key: id, id, at: new Date(0), members: [] });
const NO_FAILED: readonly FailedRead[] = [];

/** "1 photo couldn't be read. Retake it.", "2 photos couldn't be read. Retake them.", then each one's time and words. */
function failedWords(failed: readonly FailedRead[]): string {
  const n = failed.length;
  const head = n === 1 ? "1 photo couldn't be read. Retake it." : `${n} photos couldn't be read. Retake them.`;
  return [head, ...failed.map((f) => `${formatClock(new Date(f.at))}: ${f.reason}`)].join('\n');
}

function SessionOf({ id }: { id: string }) {
  const { push, navigate } = useOpenOnce(); // one guard for every press that opens (ruling T6-1)
  const navigation = useNavigation();
  const { sessions, statuses, states, saved } = useSessions();
  const theLists = useSyncExternalStore(subscribeLists, lists);
  const theSettings = useSyncExternalStore(subscribeSettings, settings);
  const camera = useSyncExternalStore(subscribeSession, currentSession);
  // A saved scan's read back (openSaved) is in flight: every press that opens waits for it (ruling T8-3), and it opens
  // only while this screen is still here and on top.
  const reading = useRef(false);
  const asking = useRef(false); // a delete's dialog is up: one at a time
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const found = sessions.find((s) => s.id === id);
  const session = found ?? none(id);
  const failed = camera?.id === id ? camera.failed : NO_FAILED; // only while it's the camera's session (call 2)
  const members = session.members;
  const title = found
    ? sessionTitle(found.at, new Date())
    : failed.length > 0
      ? sessionTitle(new Date(failed[0].at), new Date())
      : 'Session';
  const header = (
    <Header title={title} subtitle={members.length > 0 || failed.length > 0 ? `Session · ${countLine(session)}` : null} />
  );

  if (members.length === 0 && failed.length === 0) {
    return (
      <Screen header={header}>
        <EmptyState title="Nothing left in this session" body="Its scans were deleted." />
      </Screen>
    );
  }

  const tally = tallyOf(session, statuses);
  const line = cardLine(tally, failed.length);
  const left = tally.ready + tally.toCheck + tally.retake + failed.length > 0;
  const next = nextToCheck(session, statuses);

  /** A scan's Scan screen, in this session: a saved one no longer among the recent ones is read back first. */
  async function openScan(scanId: string) {
    if (reading.current) return;
    if (!getScan(scanId)) {
      reading.current = true;
      let scan;
      try {
        scan = await openSaved(scanId);
      } finally {
        reading.current = false;
      }
      if (!mounted.current || !navigation.isFocused()) return; // left while it was read (T26-4)
      if (!scan) {
        toast("Couldn't open that scan.");
        return;
      }
    }
    push({ pathname: '/result', params: { id: scanId, from: 'session', session: id } });
  }

  /** Asks before deleting a scan, one dialog at a time; settles when it closes (a saved one's at once: P-F12). */
  async function askDelete(m: Member) {
    if (asking.current) return;
    asking.current = true;
    try {
      if (m.scan) await confirmDeleteScan(m.scan);
      else confirmDeleteSaved(m.id); // a saved scan known by its summary alone
    } finally {
      asking.current = false;
    }
  }

  function retake(scanId: string) {
    if (reading.current) return;
    // the camera's session only if the camera opens: a second press, or one after another press, changes nothing
    navigate('/camera', undefined, () => retakeIn(id, scanId, new Date()));
  }

  /** A row's title: a saved scan's party as saved, else the party shown; or the scan's label. */
  const titleOf = (m: Member) =>
    m.summary ? m.summary.partyName || shownLabel({ label: m.summary.label }) : scanFields(m, theLists, theSettings).name;
  const amountOf = (m: Member) => {
    const v = memberAmount(m);
    return v === null ? null : amount(v);
  };

  return (
    <Screen header={header}>
      <View style={styles.top}>
        {line !== '' ? (
          <Card
            title={line}
            tone={left ? 'attention' : 'plain'}
            action={
              next === null
                ? null
                : {
                    label: 'Check the next one',
                    onPress: () => {
                      if (reading.current) return;
                      push({ pathname: '/result', params: { id: next, from: 'session', session: id } });
                    },
                  }
            }
          />
        ) : null}
        {failed.length > 0 ? (
          <View style={styles.gutter}>
            <Banner tone="warning" text={failedWords(failed)} />
          </View>
        ) : null}
      </View>
      {members.length > 0 ? (
        <View testID="session-scans">
          <SectionHeader title="Invoices" right={`${members.length}`} />
          {members.map((m) => {
            const badge = scanBadge(m, states.get(m.id) ?? null, saved.get(m.id) ?? 'no');
            const notFound = statuses.get(m.id) === 'retake' && m.scan !== null && !m.summary;
            return (
              <View key={m.id}>
                <ListRow
                  title={titleOf(m)}
                  sub={scanSub(m)}
                  subMono
                  subCaps
                  amount={amountOf(m)}
                  badge={badge}
                  chevron
                  testID={`row-${m.id}`}
                  onPress={() => void openScan(m.id)}
                  onLongPress={() => void askDelete(m)}
                />
                {notFound ? (
                  <View testID={`retake-${m.id}`} style={styles.actions}>
                    <ButtonRow
                      buttons={[
                        { label: 'Remove', variant: 'destructiveText', onPress: () => askDelete(m) },
                        { label: 'Retake', variant: 'text', onPress: () => retake(m.id) },
                      ]}
                    />
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { gap: space.m, paddingVertical: space.l },
  gutter: { paddingHorizontal: space.l },
  // under its row, on the row's panel, on a hairline of its own
  actions: {
    alignItems: 'flex-end',
    paddingHorizontal: space.l,
    paddingBottom: space.s,
    backgroundColor: colors.panel,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
});
