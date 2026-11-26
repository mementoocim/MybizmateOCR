import { useSyncExternalStore } from 'react';
import { StyleSheet, Text } from 'react-native';

import { EmptyState } from '../../../components/EmptyState';
import { Header } from '../../../components/Header';
import { ListRow } from '../../../components/ListRow';
import { Screen } from '../../../components/Screen';
import { localIsoDate } from '../../../lib/checks/dates';
import { newPartiesFirst, totalOf, waitingOf } from '../../../lib/exportFile';
import { FILES, FIRST, KINDS, lastSent, type Which } from '../../../lib/exportSteps';
import { peso, prettyDate } from '../../../lib/format';
import { lists, newParties, subscribeLists } from '../../../lib/lists';
import { usePushOnce } from '../../../lib/navigation';
import { savedList, subscribeSaved } from '../../../lib/saved';
import { colors, space, type } from '../../../lib/theme';

// Spec §6.7 and the plan's call 13: the Export tab's first step, the export sheet's list of files as a screen. The
// header is the mockup's, "Send to MyBizMate", with no Back (a tab), and how many saved scans wait, by the export's own
// rule (lib/exportFile's waitingOf: ruling T17-3), as the tab's count has it; new parties aren't counted. A row per kind
// with saved scans says how many wait (in figures) with their total, or that all have gone out (in words: a file can
// go again); then the parties' file once any party came from a scan, needing no saved scan (ruling T19-7). When a
// waiting scan names a party that hasn't gone out, the parties' file comes first, with why: it goes in before the
// files that name it. With nothing waiting, new parties included, "Everything is sent" and when the last file went head
// the rows, which stay, since "All" can still go again: while a new party waits, its row says so, and nothing says
// everything is sent (the user's word, 2026-11-26). A row opens its file's step (app/(tabs)/export/[which]), once (ruling T6-1).

export default function ExportScreen() {
  const push = usePushOnce();
  const saved = useSyncExternalStore(subscribeSaved, savedList);
  const theLists = useSyncExternalStore(subscribeLists, lists);
  const waiting = waitingOf(null, saved);
  const sent = lastSent(saved);

  const row = (which: Which, n: number, total: number | null) => (
    <ListRow
      key={which}
      title={FILES[which].row}
      sub={n > 0 ? `${n} to export` : 'All exported'}
      // a count in the figure style (ruling T18-3); All exported is words, in sans (T18-5)
      subMono={n > 0}
      amount={n > 0 && total !== null ? peso(total) : null}
      chevron
      onPress={() => push({ pathname: '/export/[which]', params: { which } })}
    />
  );
  const kinds = KINDS.filter((k) => saved.some((s) => s.kind === k)).map((k) => {
    const mine = waitingOf(k, saved);
    return row(k, mine.length, totalOf(mine));
  });
  const fromScans = newParties(theLists, true).length > 0; // gone out or not: its file can go again
  const partiesWaiting = newParties(theLists, false).length;
  const parties = fromScans ? row('parties', partiesWaiting, null) : null;
  const rows = newPartiesFirst(waiting, theLists) ? (
    <>
      {parties}
      <Text style={[type.label, styles.first]}>{FIRST}</Text>
      {kinds}
    </>
  ) : (
    <>
      {kinds}
      {parties}
    </>
  );

  return (
    <Screen
      header={
        <Header
          title="Send to MyBizMate"
          subtitle={waiting.length > 0 ? `${waiting.length} saved, not sent yet` : null}
          onBack={null}
        />
      }>
      {saved.length === 0 ? (
        <EmptyState title="Nothing saved yet" body="Save a scan and it shows up here, ready to send." />
      ) : waiting.length === 0 && partiesWaiting === 0 && sent !== null ? (
        <EmptyState title="Everything is sent" body={`Last sent ${prettyDate(localIsoDate(new Date(sent)))}.`} />
      ) : null}
      {rows}
    </Screen>
  );
}

const styles = StyleSheet.create({
  // a band of its own under the parties' row, between hairlines as the rows are: why that file goes first
  first: {
    color: colors.warning,
    paddingVertical: space.s,
    paddingHorizontal: space.l,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
});
