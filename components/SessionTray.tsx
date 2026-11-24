import { type ReactElement, type ReactNode } from 'react';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import type { TrayItem } from '../lib/sessions';
import { colors, radius, space, touch } from '../lib/theme';
import { Button } from './Buttons';
import { Check, FileText, type IconProps, ImageIcon } from './icons';
import { IconButton } from './IconButton';
import { useTabBarSpace } from './Screen';

// The camera's tray (spec §6.3, the plan's call 7), under the picture and over the tabs' floating bar: the gallery at
// its left end and the PDF import at its right, always, since a session can start with either. Its middle holds the
// status pill until the session has a photo, then the session's thumbnails in the order taken, and Done · N. Each
// thumbnail has a 16 dp mark on its corner: a brand ring while it's read, a ✓ once it's read, a "!" for a retake (a
// form not found, or a read that failed). The "!" is a glyph, drawn as the ✓ is (ruling P-F8).

// disabled: a photo is still being taken, which Done must not leave behind (ruling T7-2)
type DoneProps = { label: string; busy: boolean; disabled: boolean; onPress: () => Promise<void> };

const MARK = 16; // dp: a thumbnail's mark
const MARK_GLYPH = 12; // dp: the ✓ or ! inside it
const RING = 2; // dp: the mark's brand ring while it's read

const WORDS: Record<TrayItem['state'], string> = { reading: 'reading', read: 'read', problem: 'retake' };

/** A "!" on Lucide's 24 grid, stroked as its glyphs are: CircleAlert's stroke and dot, without the circle. */
function Exclamation({ size = 24, color, strokeWidth = 2 }: IconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden>
      <Path d="M12 5v9" />
      <Path d="M12 19h.01" />
    </Svg>
  );
}

function Thumbnail({ item, n }: { item: TrayItem; n: number }) {
  return (
    <View accessible accessibilityLabel={`Photo ${n}, ${WORDS[item.state]}`} style={styles.thumb}>
      {item.image !== null ? (
        <Image source={{ uri: item.image }} style={styles.photo} />
      ) : (
        <View style={[styles.photo, styles.noPhoto]} />
      )}
      <View testID={`mark-${item.state}`} style={[styles.mark, MARK_STYLE[item.state]]}>
        {item.state === 'read' && <Check size={MARK_GLYPH} color={colors.panel} strokeWidth={3} />}
        {item.state === 'problem' && <Exclamation size={MARK_GLYPH} color={colors.panel} strokeWidth={3} />}
      </View>
    </View>
  );
}

export function SessionTray({
  items,
  hint,
  done,
  onGallery,
  onPdf,
  disabled,
}: {
  items: readonly TrayItem[] | null; // null: no photo in the session yet, so the hint sits in the middle
  hint: ReactNode; // the status pill
  done: DoneProps | null;
  onGallery: () => void;
  onPdf: () => void;
  disabled: boolean; // while a picker is open
}): ReactElement {
  const tabBar = useTabBarSpace(); // the tabs' floating bar, over the foot of the screen
  return (
    <View testID="session-tray" style={[styles.tray, { paddingBottom: tabBar + space.s }]}>
      <IconButton icon={ImageIcon} label="Gallery" tone="camera" disabled={disabled} onPress={onGallery} />
      <View style={styles.middle}>
        {items === null ? (
          <View style={styles.hint}>{hint}</View>
        ) : (
          <>
            <ScrollView
              horizontal
              testID="tray-thumbnails"
              style={styles.scroll}
              contentContainerStyle={styles.thumbs}
              showsHorizontalScrollIndicator={false}>
              {items.map((item, i) => (
                <Thumbnail key={item.key} item={item} n={i + 1} />
              ))}
            </ScrollView>
            {done && (
              <Button
                label={done.label}
                variant="secondary"
                loading={done.busy}
                disabled={done.disabled}
                onPress={done.onPress}
              />
            )}
          </>
        )}
      </View>
      <IconButton icon={FileText} label="Import PDF" tone="camera" disabled={disabled} onPress={onPdf} />
    </View>
  );
}

const styles = StyleSheet.create({
  tray: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingTop: space.s, paddingHorizontal: space.xs },
  middle: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.s },
  hint: { flex: 1, alignItems: 'center' },
  scroll: { flex: 1 },
  thumbs: { alignItems: 'center', gap: space.s, padding: space.xs }, // room for the marks over the corners
  thumb: { width: touch.thumbW, height: touch.thumbH },
  photo: { width: touch.thumbW, height: touch.thumbH, borderRadius: radius.badge },
  noPhoto: { backgroundColor: colors.cameraPanel },
  mark: {
    position: 'absolute',
    top: -space.xs,
    right: -space.xs,
    width: MARK,
    height: MARK,
    borderRadius: MARK / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

const MARK_STYLE = StyleSheet.create({
  reading: { backgroundColor: colors.panel, borderWidth: RING, borderColor: colors.brand },
  read: { backgroundColor: colors.success },
  problem: { backgroundColor: colors.warning },
});
