import { forwardRef, useEffect, useRef, useState } from 'react';
import {
  Animated,
  type LayoutChangeEvent,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ViewInstance,
} from 'react-native';

import { useReducedMotion } from '../lib/motion';
import type { SavedState, ScanState } from '../lib/scanState';
import { colors, durations, space, touch, type } from '../lib/theme';
import { CHIP_SLOP, FlagChip } from './FlagChip';
import { CircleCheck, TriangleAlert } from './icons';

// Design B §9.5, §5.5 and §7, and the plan's call 9: the status strip, pinned under the Scan screen's header. Things
// to check ("3 to check", "Tap one to fix it", then a flag chip per problem word, wrapping); what the scan still needs
// before it can be saved (the reason, "Can't save yet"); or "Checks passed", with what to do next. An icon goes with
// the words, so the state isn't color alone. The headline is a header, and the strip is a polite live region, so after
// a fix TalkBack says "2 to check" or "Checks passed". When the chips would make the strip take more than a third of
// the screen (large text, many problems), they scroll in one row instead. When its state or its count changes, it
// cross-fades: it fades out with what it showed, then in with the new state, each over half of durations.strip; with
// reduced motion it changes at once. Its ref is the strip's own view, for TalkBack focus.

type StripState = Exclude<ScanState, { kind: 'not_found' }>;
type StatusStripProps = {
  state: StripState;
  fixed: number; // the boxes the person fixed
  sample: boolean;
  saved: SavedState;
  onChip: (problem: string) => void;
};

/** Each half of the cross-fade, out and then in: the change takes durations.strip in all. */
const HALF = durations.strip / 2;

/** What the strip's motion follows: its state, and how many things there are to check. */
const motionKey = (state: StripState) => (state.kind === 'to_check' ? `to_check ${state.problems.length}` : state.kind);

/** Under "Checks passed", by whether it was saved. */
const LOOK: Record<SavedState, string> = {
  no: 'Look over the values, then save',
  unchanged: 'Look over the values',
  changed: 'Look over the values, then save the changes',
};

export const StatusStrip = forwardRef<ViewInstance, StatusStripProps>(function StatusStrip(props, ref) {
  const reduced = useReducedMotion();
  const { width, height, fontScale } = useWindowDimensions();

  // What the strip shows: its props, except that a new state or count waits for the strip to fade out what it showed.
  const [shown, setShown] = useState(props);
  const fading = !reduced && motionKey(shown.state) !== motionKey(props.state);
  if (!fading && shown !== props) setShown(props);
  const latest = useRef(props); // the props as last rendered: what goes on once the strip has faded out
  useEffect(() => {
    latest.current = props;
  });
  const [opacity] = useState(() => new Animated.Value(1));
  const dim = useRef(false); // a fade has taken the strip's opacity from 1, and hasn't brought it back yet

  // Out, or back in. The fade out's end puts the new state on, and this effect runs again to fade it in.
  useEffect(() => {
    if (reduced || (!fading && !dim.current)) return;
    dim.current = true;
    const animation = Animated.timing(opacity, { toValue: fading ? 0 : 1, duration: HALF, useNativeDriver: true });
    animation.start(({ finished }) => {
      if (!finished) return; // cut short: another change came, or the strip went
      if (fading) setShown(latest.current);
      else dim.current = false;
    });
    return () => animation.stop();
  }, [fading, reduced, opacity]);

  // Chips that make the strip take more than a third of the screen scroll in one row, from then on at this width and
  // font size: in one row the strip is short again, and flipping back would loop.
  const sizeKey = `${fontScale}|${width}`;
  const [scrollAt, setScrollAt] = useState<ReadonlySet<string>>(() => new Set());
  const problems = shown.state.kind === 'to_check' ? shown.state.problems : [];
  const onLayout = (e: LayoutChangeEvent) => {
    if (problems.length === 0 || e.nativeEvent.layout.height <= height / 3) return;
    setScrollAt((keys) => (keys.has(sizeKey) ? keys : new Set(keys).add(sizeKey)));
  };

  const warn = shown.state.kind !== 'passed';
  const Icon = warn ? TriangleAlert : CircleCheck;
  const { headline, sub } = linesOf(shown);
  const chips = problems.map((problem) => (
    <FlagChip key={problem} problem={problem} onPress={() => props.onChip(problem)} />
  ));
  return (
    <Animated.View
      ref={ref}
      testID="status-strip"
      accessibilityLiveRegion="polite"
      onLayout={onLayout}
      style={[
        styles.strip,
        { backgroundColor: warn ? colors.warningTint : colors.successTint },
        reduced ? null : { opacity },
      ]}>
      <View style={styles.head}>
        <Icon size={touch.iconSmall} color={warn ? colors.warning : colors.success} />
        <View style={styles.words}>
          <Text accessibilityRole="header" style={[type.headline, styles.headline]}>
            {headline}
          </Text>
          <Text style={[type.label, styles.sub]}>{sub}</Text>
        </View>
      </View>
      {chips.length === 0 ? null : scrollAt.has(sizeKey) ? (
        <ScrollView
          testID="strip-chips-scroll"
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.scroll}
          contentContainerStyle={styles.scrollChips}>
          {chips}
        </ScrollView>
      ) : (
        <View testID="strip-chips" style={styles.chips}>
          {chips}
        </View>
      )}
    </Animated.View>
  );
});

/** The headline and the line under it. A sample's line says it can't be saved, in place of what to do next. */
function linesOf({ state, fixed, sample, saved }: StatusStripProps): { headline: string; sub: string } {
  if (state.kind === 'to_check') return { headline: `${state.problems.length} to check`, sub: 'Tap one to fix it' };
  if (state.kind === 'blocked') return { headline: state.reason, sub: "Can't save yet" };
  if (sample) return { headline: 'Checks passed', sub: "Samples can't be saved" };
  const boxes = fixed === 1 ? '1 box' : `${fixed} boxes`;
  return { headline: 'Checks passed', sub: fixed > 0 ? `${LOOK[saved]} · you fixed ${boxes}` : LOOK[saved] };
}

const styles = StyleSheet.create({
  strip: {
    gap: space.s,
    paddingHorizontal: space.l,
    paddingVertical: space.m,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: space.s },
  words: { flex: 1 },
  headline: { color: colors.ink },
  sub: { color: colors.mute },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s },
  // Out to the strip's edges, and over the chips' hitSlop: a scroll view takes no touch outside itself, so it holds
  // their whole 48 dp targets.
  scroll: { marginHorizontal: -space.l, marginVertical: -CHIP_SLOP },
  scrollChips: { gap: space.s, paddingHorizontal: space.l, paddingVertical: CHIP_SLOP },
});
