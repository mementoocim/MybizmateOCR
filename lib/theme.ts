import { Platform, type PressableAndroidRippleConfig, type TextStyle } from 'react-native';

// The MyBizMate look, from design B §5 (the UI/UX design of 2026-11-22): color roles (§5.1), type (§5.2), space, shape,
// elevation and touch (§5.3), and press feedback and motion (§5.5). Screens use these tokens, not numbers of their own.
// See-through colors are #RRGGBBAA, React Native's order.
export const colors = {
  ink: '#1A1512', // text, icons, the selection fill
  mute: '#5A5147', // secondary text, helper text, placeholders, section labels
  paper: '#FCFAF6', // the screen's background
  panel: '#FFFFFF', // rows, fields, sheets, headers, bottom bars
  sand: '#F2ECDF', // section strips, summary boxes, the neutral badge's fill
  line: '#1A151224', // ink at 14%: decorative borders (chips, menus)
  hairline: '#1A151214', // ink at 8%: row separators, under headers and over bottom bars
  outline: '#918B84', // a control's boundary: fields, secondary buttons, segmented controls
  brand: '#FC7C4C', // the primary button's fill, the progress bar, the shutter ring; never text on a light background
  brandPressed: '#E26331', // the primary button while pressed
  brandText: '#B13E03', // orange text: text buttons, links, tip numbers, ".io"
  brandTint: '#FFF1EB', // the "New" and "To export" badges' fill
  focus: '#DE602E', // a focused field's 2 dp border
  success: '#3E7A52',
  successTint: '#EEF6F0',
  warning: '#8F5300',
  warningTint: '#FCEFD9',
  warningLine: '#8F53004D', // warning at 30%
  flag: '#B8741A', // the 3 dp bar on a flagged row
  danger: '#CC2827', // delete, clear, field errors
  dangerTint: '#FDECEB',
  dangerLine: '#CC282773', // danger at 45%: the destructive button's border
  chevron: '#8A837C', // chevrons and other quiet icons
  scrim: '#1A151273', // ink at 45%: behind sheets and menus
  wash: '#FCFAF6DB', // paper at 86%: behind the reading card
  crop: '#F4F1EB', // behind a box's crop
  camera: '#000000', // camera, cameraPanel, cameraText, cameraMute: the camera screen and the photo viewer
  cameraPanel: '#221C18',
  cameraText: '#FFFFFF',
  cameraMute: '#D8D2CB',
  pill: '#1A1512C7', // ink at 78%: the camera's status pill
  viewer: '#161310', // the full-screen photo
} as const;

/** Space on a 4 dp scale. The screen's gutter is l; rows pad m top and bottom and l at the sides; strips s and l. */
export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32 } as const;

/**
 * Corners: field for fields and segmented controls; panel for the cards that remain, the reading card and menus; sheet
 * for a sheet's top corners; pill (full) for chips.
 */
export const radius = { badge: 4, field: 6, button: 10, panel: 10, sheet: 16, pill: 999 } as const;

/**
 * In dp: every target is at least 48 (chips are 40, with hitSlop to 48), and a large button ("Take photo") at least 56
 * (§5.6); icons are 24 in headers and on the camera, 20 in buttons and rows; the shutter (§9.3) and the photo's
 * thumbnail (§9.5).
 */
export const touch = {
  target: 48, buttonLarge: 56, chip: 40, icon: 24, iconSmall: 20, shutter: 72, thumbW: 36, thumbH: 48,
} as const;

/** Flat by default: only sheets, menus and the snackbar have a shadow. */
export const elevation = { overlay: 8 } as const;

/** How long each of the motions takes, in ms. Nothing else animates, and reduced motion fades only (lib/motion). */
export const durations = {
  sheetIn: 250, sheetOut: 200, scrim: 200, menu: 150, snackbar: 200, strip: 150, card: 150,
} as const;

const RIPPLE_ON_LIGHT = '#1A15121A'; // ink at 10%
const RIPPLE_ON_DARK = '#FFFFFF33'; // white at 20%

/**
 * Every pressable's press feedback, named by the surface it's on: light; the brand fill; or dark (the camera, the photo
 * viewer, the snackbar's ink). Bounded on rows and buttons, borderless (radius 24) on icon buttons.
 */
export const ripple: Record<'light' | 'brand' | 'dark' | 'icon' | 'iconDark', PressableAndroidRippleConfig> = {
  light: { color: RIPPLE_ON_LIGHT },
  brand: { color: '#1A151229' }, // ink at 16%, on the brand fill
  dark: { color: RIPPLE_ON_DARK },
  icon: { color: RIPPLE_ON_LIGHT, borderless: true, radius: 24 },
  iconDark: { color: RIPPLE_ON_DARK, borderless: true, radius: 24 },
};

/** Task 0 embedded both families in the Android build, as XML font families (expo-font's plugin). */
export const EMBEDDED_FONTS: boolean = true;

/**
 * A family at a weight: Schibsted Grotesk for words, IBM Plex Mono for figures, dates, codes, section labels and
 * badges. On Android the weight picks the embedded face; iOS keeps the system font until milestone 9.
 */
export function face(family: 'grotesk' | 'mono', weight: 400 | 500 | 600 | 800): TextStyle {
  const fontWeight = `${weight}` as const;
  if (Platform.OS !== 'android') return { fontWeight };
  if (EMBEDDED_FONTS) return { fontFamily: family === 'grotesk' ? 'SchibstedGrotesk' : 'IBMPlexMono', fontWeight };
  return { fontFamily: family === 'mono' ? 'monospace' : undefined, fontWeight };
}

/**
 * The type scale, in sp (it follows the phone's font size). No color: the screen gives it. Letter spacing is the
 * design's em at the style's size: title −0.02 em, overline 0.12 em, badge 0.04 em.
 */
export const type: Record<
  | 'title' | 'headerTitle' | 'headline' | 'value' | 'body' | 'button' | 'buttonLarge' | 'label'
  | 'figure' | 'figureStrong' | 'figureSmall' | 'overline' | 'badge',
  TextStyle
> = {
  title: { ...face('grotesk', 800), fontSize: 20, lineHeight: 26, letterSpacing: -0.4 },
  headerTitle: { ...face('grotesk', 800), fontSize: 18, lineHeight: 24 },
  headline: { ...face('grotesk', 800), fontSize: 17, lineHeight: 22 },
  value: { ...face('grotesk', 600), fontSize: 15, lineHeight: 20 },
  body: { ...face('grotesk', 400), fontSize: 15, lineHeight: 22 },
  button: { ...face('grotesk', 600), fontSize: 15, lineHeight: 20 },
  buttonLarge: { ...face('grotesk', 600), fontSize: 16, lineHeight: 20 }, // "Take photo"
  label: { ...face('grotesk', 400), fontSize: 13, lineHeight: 18 },
  figure: { ...face('mono', 500), fontSize: 15, lineHeight: 20 },
  figureStrong: { ...face('mono', 600), fontSize: 17, lineHeight: 22 },
  figureSmall: { ...face('mono', 400), fontSize: 13, lineHeight: 18 },
  overline: { ...face('mono', 500), fontSize: 12, lineHeight: 16, letterSpacing: 1.44, textTransform: 'uppercase' },
  badge: { ...face('mono', 500), fontSize: 12, lineHeight: 16, letterSpacing: 0.48, textTransform: 'uppercase' },
};
