import { type ReactNode, useRef } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useGoBackOrHome } from '../lib/navigation';
import { colors, space, touch, type } from '../lib/theme';
import { IconButton } from './IconButton';
import { ArrowLeft, Close } from './icons';

// Design B §5.6 and §8: every screen's header, in place of the Stack's own (the root layout hides it on every route)
// and Home's fixed 48 dp top padding. The app is edge-to-edge, so its fill reaches under the status bar and it pads by
// the bar's inset. Under that, a row at least 56 dp tall: Back or Close; the title (headerTitle, a TalkBack header),
// which wraps and grows with the font size, with an optional overline under it; then up to two icon buttons, or the
// photo thumbnail, on the right. A hairline sits under it. Home shows the logo and "mybizmate.io" in place of a title.
// Dark is the photo viewer's: the viewer fill, light text and icons, no hairline.

const LOGO = 30; // dp: the brand mark, as Home shows it today

export function Header({
  title,
  subtitle,
  brand = false,
  onBack,
  backIcon = 'back',
  right,
  tone = 'light',
}: {
  title?: string;
  subtitle?: string | null;
  brand?: boolean; // Home: the logo and "mybizmate.io" in place of a title
  onBack?: (() => void) | null; // default: back, or Home (useGoBackOrHome), once; null: no back button
  backIcon?: 'back' | 'close'; // spoken "Back" or "Close"
  right?: ReactNode; // up to two IconButtons, or the photo thumbnail
  tone?: 'light' | 'dark'; // dark: the photo viewer (viewer fill, cameraText)
}) {
  const insets = useSafeAreaInsets();
  const goBackOrHome = useGoBackOrHome();
  const leaving = useRef(false); // set at once, so a second tap is refused before the screen has gone
  const dark = tone === 'dark';
  const close = backIcon === 'close';
  const hasBack = onBack !== null;
  const hasRight = Boolean(right);

  /**
   * The default Back, once, as the camera's Close: going back queues a GO_BACK per call, so a fast double tap would
   * leave the screen under this one too. With nothing to go back to, Home (lib/navigation).
   */
  function goBack() {
    if (leaving.current) return;
    leaving.current = true;
    goBackOrHome();
  }
  return (
    <View testID="header" style={[styles.header, dark && styles.dark, { paddingTop: insets.top }]}>
      <View style={[styles.row, !dark && styles.hairline]}>
        {hasBack && (
          <IconButton
            icon={close ? Close : ArrowLeft}
            label={close ? 'Close' : 'Back'}
            tone={dark ? 'camera' : 'light'}
            onPress={onBack ?? goBack}
          />
        )}
        <View style={[styles.middle, !hasBack && styles.atStart, !hasRight && styles.atEnd]}>
          {brand ? (
            <View style={styles.brand}>
              <Image testID="header-logo" source={require('../assets/brand/logo_mark.png')} style={styles.logo} />
              <Text accessibilityRole="header" style={[type.headerTitle, styles.wordmark]}>
                <Text>mybizmate</Text>
                <Text style={styles.io}>.io</Text>
              </Text>
            </View>
          ) : (
            title !== undefined && (
              <Text accessibilityRole="header" style={[type.headerTitle, { color: dark ? colors.cameraText : colors.ink }]}>
                {title}
              </Text>
            )
          )}
          {!brand && Boolean(subtitle) && (
            // On the viewer, mute would be too dark to read: cameraMute is its quiet text.
            <Text style={[type.overline, { color: dark ? colors.cameraMute : colors.mute }]}>{subtitle}</Text>
          )}
        </View>
        {hasRight && <View style={styles.right}>{right}</View>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: colors.panel },
  dark: { backgroundColor: colors.viewer },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: touch.target + space.s,
    paddingHorizontal: space.xs,
  },
  hairline: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
  // The title's block takes the rest of the row and wraps. Beside a 48 dp button it keeps a small gap; at the row's
  // ends it lines up with the screen's 16 dp gutter (4 for the row, 12 here).
  middle: { flex: 1, paddingVertical: space.s, paddingHorizontal: space.xs },
  atStart: { paddingLeft: space.m },
  atEnd: { paddingRight: space.m },
  brand: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  logo: { width: LOGO, height: LOGO },
  wordmark: { flexShrink: 1, color: colors.ink },
  io: { color: colors.brandText },
  right: { flexDirection: 'row', alignItems: 'center' },
});
