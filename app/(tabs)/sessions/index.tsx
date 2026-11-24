import { useState, useSyncExternalStore } from 'react';
import { FlatList, SectionList, StyleSheet, View } from 'react-native';

import { EmptyState } from '../../../components/EmptyState';
import { Header } from '../../../components/Header';
import { IconButton } from '../../../components/IconButton';
import { Close, Search } from '../../../components/icons';
import { ListRow } from '../../../components/ListRow';
import { Screen, useEndPadding } from '../../../components/Screen';
import { SectionHeader } from '../../../components/SectionHeader';
import { TextField } from '../../../components/TextField';
import { certOf, is2307, taxWithheld } from '../../../lib/cert';
import { amount } from '../../../lib/format';
import { type Lists, lists, subscribeLists } from '../../../lib/lists';
import { useOpenOnce } from '../../../lib/navigation';
import { isInvoice, saleOf } from '../../../lib/sale';
import { openSaved } from '../../../lib/saved';
import { getScan } from '../../../lib/scans';
import { fold, matchesScan } from '../../../lib/search';
import {
  byDay,
  type Member,
  rowTitle,
  type Session,
  scanBadge,
  scanFields,
  scanSub,
  sessionBadges,
  tallyOf,
  useSessions,
} from '../../../lib/sessions';
import { type Settings, settings, subscribeSettings } from '../../../lib/settings';
import { space } from '../../../lib/theme';
import { toast } from '../../../lib/toast';

// Spec §6.6 (the plan's call 11): Sessions, the tab. A row per session, newest first under day headers ("Today",
// "Yesterday", "Nov 20"): "9:41 AM · 3 invoices" and its badges, at most two (lib/sessions' sessionBadges). A scan with
// no session id (one kept or saved before camera first, a saved one past the newest 100, a sample) is a session of its
// own, under today's label, with its scan's one badge, and opens its Scan screen (Review Focus 2); a session opens its
// own screen. The header's Search shows a field under it: what's typed finds scans by party, number or TIN (lib/search's
// matchesScan), listed newest first, each opening its Scan screen. Every press goes through the one guard (ruling T6-1),
// so a double tap, or two rows tapped at once, opens one screen.

/** A scan's amount as its row shows it: a saved one's gross (a 2307's tax withheld); an unsaved one's, as checked now. */
function amountOf(m: Member, theLists: Lists, theSettings: Settings): string | null {
  const s = m.summary;
  if (s) return amount(s.kind === '2307' ? s.tax : s.gross);
  const scan = m.scan;
  if (scan && isInvoice(scan)) {
    const gross = saleOf(scan, theLists, theSettings).gross;
    return gross === null ? null : amount(gross);
  }
  if (scan && is2307(scan)) return amount(taxWithheld(certOf(scan, theLists, theSettings).cert));
  return null;
}

const newestFirst = (a: Member, b: Member) => b.at.getTime() - a.at.getTime();

export default function SessionsScreen() {
  const { push } = useOpenOnce(); // one guard for every press (ruling T6-1): a session, a scan, a search result
  const { sessions, statuses, states, saved } = useSessions();
  const theLists = useSyncExternalStore(subscribeLists, lists);
  const theSettings = useSyncExternalStore(subscribeSettings, settings);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const end = useEndPadding(false);
  const typed = searching && fold(query) !== ''; // with nothing typed yet, the sessions stay

  const badgeOf = (m: Member) => scanBadge(m, states.get(m.id) ?? null, saved.get(m.id) ?? 'no');

  /** A scan's Scan screen: a saved one no longer among the recent ones is read back first; one that's gone says so. */
  async function openScan(id: string) {
    if (!getScan(id)) {
      const scan = await openSaved(id);
      if (!scan) {
        toast("Couldn't open that scan.");
        return;
      }
    }
    push({ pathname: '/result', params: { id, from: 'list' } });
  }

  function openSession(s: Session) {
    if (s.id !== null) push({ pathname: '/sessions/[id]', params: { id: s.id } });
    else void openScan(s.members[0].id);
  }

  function toggleSearch() {
    if (searching) setQuery('');
    setSearching(!searching);
  }

  const header = (
    <Header
      title="Sessions"
      onBack={null}
      right={
        <IconButton
          icon={searching ? Close : Search}
          label={searching ? 'Close search' : 'Search'}
          onPress={toggleSearch}
        />
      }
    />
  );
  const field = searching ? (
    <View style={styles.search}>
      <TextField
        label="Search"
        placeholder="Name, number or TIN"
        hideLabel
        leading={Search}
        autoFocus
        value={query}
        onChangeText={setQuery}
        testID="sessions-search"
      />
    </View>
  ) : null;

  if (typed) {
    const found = sessions
      .flatMap((s) => s.members)
      .filter((m) => matchesScan(scanFields(m, theLists, theSettings), query))
      .sort(newestFirst);
    return (
      <Screen scroll={false} header={header} pinned={field}>
        <FlatList
          testID="sessions-results"
          data={found}
          keyExtractor={(m) => m.id}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<EmptyState title={`No scan matches “${query}”`} />}
          renderItem={({ item }) => (
            <ListRow
              title={scanFields(item, theLists, theSettings).name}
              sub={scanSub(item)}
              subMono
              subCaps
              amount={amountOf(item, theLists, theSettings)}
              badge={badgeOf(item)}
              onPress={() => void openScan(item.id)}
            />
          )}
          contentContainerStyle={{ paddingBottom: end }}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll={false} header={header} pinned={field}>
      <SectionList
        testID="sessions-list"
        sections={byDay(sessions, new Date())}
        keyExtractor={(s) => s.key}
        keyboardShouldPersistTaps="handled"
        stickySectionHeadersEnabled={false} // as Android has it
        ListEmptyComponent={
          <EmptyState
            title="Nothing scanned yet"
            body="Take a photo with the round button. Each run of photos shows up here."
          />
        }
        renderSectionHeader={({ section }) => <SectionHeader title={section.title} />}
        renderItem={({ item }) => (
          <ListRow
            title={rowTitle(item)}
            badges={item.id === null ? [badgeOf(item.members[0])] : sessionBadges(tallyOf(item, statuses))}
            chevron
            onPress={() => openSession(item)}
          />
        )}
        contentContainerStyle={{ paddingBottom: end }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  // the field on the gutter, under the header, outside the list
  search: { paddingHorizontal: space.l, paddingVertical: space.m },
});
