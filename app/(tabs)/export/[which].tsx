import { useLocalSearchParams, useNavigation } from 'expo-router';
import { type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Banner } from '../../../components/Banner';
import { ButtonRow } from '../../../components/BottomBar';
import { ChoiceChips } from '../../../components/ChoiceChips';
import { EmptyState } from '../../../components/EmptyState';
import { Header } from '../../../components/Header';
import { Share } from '../../../components/icons';
import { ListRow } from '../../../components/ListRow';
import { Screen } from '../../../components/Screen';
import { SummaryBox } from '../../../components/SummaryBox';
import type { ExportRange } from '../../../lib/exportFile';
import {
  chosen,
  FILES,
  isWhich,
  MARK_FAILED,
  NOTHING,
  PARTIES_NOTE,
  type Which,
  XLSX_MIME,
} from '../../../lib/exportSteps';
import { lists, markPartiesExported, subscribeLists } from '../../../lib/lists';
import { useGoBackOrHome, usePushOnce } from '../../../lib/navigation';
import { markExported, savedList, subscribeSaved } from '../../../lib/saved';
import { shareFile } from '../../../lib/share';
import { colors, space, type } from '../../../lib/theme';
import { toast } from '../../../lib/toast';

// Design B §9.8, spec §6.7 and the plan's call 13: a file's steps, in the Export tab's own Stack, as the export sheet
// had them. The header's Back replaces the sheet's Close, and each step's buttons sit at its end, above the floating
// bar, not in a pinned bar over it.
// - The file: its title, then why the last try failed (a banner TalkBack reads out, first, so it never sits below the
//   fold: rulings T18-4 and P-F14), the sentence on what the file is, what it will hold in a summary box, See invoices
//   for a kind (its saved scans: app/(tabs)/export/invoices), which ones, today's warnings as banners and the parties'
//   note. Then Share the file, whose press returns the share, so it loads while the file is written and a double tap
//   shares once (Review Focus 3).
// - Once the share sheet has closed, sent or not (it can't tell), today's question in its place: mark what went in the
//   file as exported, with the time it was written for, so the next file leaves it out (F-2: the mark is written
//   first); or not yet, which goes back. Mark runs once on a double tap too; once marked, it goes back, then a
//   snackbar says so. A mark that can't be written marks nothing and says so, the same way, so Mark can run again.
// After an await, it goes back or speaks only while this screen is still here and on top (ruling T8-3).

export default function FileScreen() {
  const { which } = useLocalSearchParams<{ which: string }>();
  // A new file is a new screen: nothing carries over from another one (its choice, its error, its question).
  if (!isWhich(which)) {
    return (
      <Screen header={<Header title="Send to MyBizMate" />}>
        <EmptyState title={NOTHING} />
      </Screen>
    );
  }
  return <FileOf key={which} which={which} />;
}

/** The question's step: what went in the file, and when it was written. */
type Asked = { at: Date; ids: readonly string[] };

function FileOf({ which }: { which: Which }) {
  const push = usePushOnce();
  const goBackOrHome = useGoBackOrHome();
  const navigation = useNavigation();
  const saved = useSyncExternalStore(subscribeSaved, savedList);
  const theLists = useSyncExternalStore(subscribeLists, lists);
  const [range, setRange] = useState<ExportRange>('new');
  const [asked, setAsked] = useState<Asked | null>(null);
  const [error, setError] = useState<string | null>(null); // why the step's last try didn't work: a share, or a mark
  const mounted = useRef(true);
  const leaving = useRef(false); // going back already: once
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const here = () => mounted.current && navigation.isFocused();
  const leave = () => {
    if (leaving.current) return;
    leaving.current = true;
    goBackOrHome();
  };

  const words = FILES[which];
  let page: { title: string; content: ReactNode };
  if (asked) {
    const { at, ids } = asked;
    const n = ids.length;
    const { one, many, next } = words.words;
    const all = words.ranges.find((r) => r.value === 'all')!.label; // All, or All added from scans: in “ ”s
    const mark = async () => {
      setError(null);
      try {
        await (which === 'parties' ? markPartiesExported(ids, at) : markExported(ids, at));
      } catch {
        if (mounted.current) setError(MARK_FAILED); // nothing was marked: the question stays, to try again
        return;
      }
      if (!here()) {
        // left while it was written (ruling T8-3): no going back, nothing said; and back here, no question left over
        // what has been marked, but the file as it is now (T10-3)
        if (mounted.current) setAsked(null);
        return;
      }
      leave();
      toast(`Marked ${n} ${n === 1 ? one : many} as exported.`);
    };
    page = {
      title: 'Did the file go where you wanted?',
      content: (
        <View style={styles.body}>
          {/* first, as the file's step has it (ruling T18-4) */}
          {error ? <Banner tone="danger" text={error} live /> : null}
          <Text accessibilityLiveRegion="polite" style={[type.body, styles.ink]}>
            {n === 1
              ? `Mark this ${one} as exported, so the ${next} leaves it out. “${all}” still includes it.`
              : `Mark these ${n} ${many} as exported, so the ${next} leaves them out. “${all}” still includes them.`}
          </Text>
          <ButtonRow
            buttons={[
              { label: 'Not yet', variant: 'text', onPress: leave },
              { label: `Mark ${n} as exported`, onPress: mark },
            ]}
          />
        </View>
      ),
    };
  } else {
    const file = chosen(which, range, theLists);
    const share = async () => {
      setError(null);
      const shared = await shareFile(file.write, XLSX_MIME);
      if (!mounted.current) return;
      if (shared.ok) setAsked({ at: shared.at, ids: file.ids });
      else setError(shared.message);
    };
    const kept = which === 'parties' ? 0 : saved.filter((s) => s.kind === which).length;
    page = {
      title: words.title,
      content: (
        <>
          <View style={styles.body}>
            {/* first, so it shows where the person is looking, never below the fold (rulings T18-4, P-F14) */}
            {error ? <Banner tone="danger" text={error} live /> : null}
            <Text style={[type.body, styles.mute]}>{words.subtitle}</Text>
            <SummaryBox
              lines={[
                { key: 'File', value: `${words.file} · .xlsx` },
                file.ids.length > 0
                  ? { key: words.key, value: file.count, mono: true }
                  : { key: words.key, value: NOTHING },
              ]}
            />
          </View>
          {which !== 'parties' ? (
            <View style={styles.rows}>
              <ListRow
                title="See invoices"
                sub={`${kept} saved`}
                subMono
                chevron
                onPress={() => push({ pathname: '/export/invoices', params: { kind: which } })}
              />
            </View>
          ) : null}
          <View style={styles.body}>
            <ChoiceChips<ExportRange> label="Which ones" options={words.ranges} value={range} onChange={setRange} />
            {file.warnings.map((warning) => (
              <Banner key={warning} tone="warning" text={warning} />
            ))}
            {which === 'parties' ? <Text style={[type.body, styles.mute]}>{PARTIES_NOTE}</Text> : null}
            <ButtonRow
              buttons={[{ label: 'Share the file', icon: Share, disabled: file.ids.length === 0, onPress: share }]}
            />
          </View>
        </>
      ),
    };
  }

  // One Header for both steps, so the question's title takes TalkBack focus as it shows (focusKey: ruling T10-4), and
  // only then: the question cleared, by Not yet or by a mark finished on another tab, sends none (ruling T10-6).
  // The question has no Back: Not yet is its way out, and Android's back leaves it the same way.
  return (
    <Screen
      header={<Header title={page.title} onBack={asked ? null : undefined} focusKey={asked ? 'asked' : undefined} />}>
      {page.content}
    </Screen>
  );
}

const styles = StyleSheet.create({
  // the summary, the choice and what's said about it, spaced as the save sheets'; the step's buttons at its end
  body: { gap: space.l, paddingHorizontal: space.l, paddingTop: space.l },
  // See invoices, full-bleed as every row, between the summary and the choice
  rows: { paddingTop: space.l },
  ink: { color: colors.ink },
  mute: { color: colors.mute },
});
