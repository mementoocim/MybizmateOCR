import { Platform } from 'react-native';

import {
  bar, colors, durations, elevation, EMBEDDED_FONTS, face, radius, ripple, space, touch, type,
} from '../lib/theme';
import { contrast } from '../test-utils/contrast';

// Design B §5: the color roles and their measured contrast (§5.1), the type scale (§5.2), space, shape and touch
// (§5.3), and press feedback and motion (§5.5). See-through colors are #RRGGBBAA, React Native's order.

afterEach(() => jest.restoreAllMocks()); // and Platform.OS, even when a test fails

test('every color role has its design value', () => {
  expect(colors).toMatchObject({
    ink: '#1A1512', mute: '#5A5147', paper: '#FCFAF6', panel: '#FFFFFF', sand: '#F2ECDF',
    line: '#1A151224', hairline: '#1A151214', outline: '#918B84', // line: ink at 14%; hairline: ink at 8%
    brand: '#FC7C4C', brandPressed: '#E26331', brandText: '#B13E03', brandTint: '#FFF1EB', focus: '#DE602E',
    success: '#3E7A52', successTint: '#EEF6F0',
    warning: '#8F5300', warningTint: '#FCEFD9', warningLine: '#8F53004D', flag: '#B8741A', // warningLine: 30%
    danger: '#CC2827', dangerTint: '#FDECEB', dangerLine: '#CC282773', // dangerLine: danger at 45%
    chevron: '#8A837C', scrim: '#1A151273', wash: '#FCFAF6DB', crop: '#F4F1EB', // scrim: ink at 45%; wash: paper at 86%
    camera: '#000000', cameraPanel: '#221C18', cameraText: '#FFFFFF', cameraMute: '#D8D2CB',
    pill: '#1A1512C7', viewer: '#161310', // pill: ink at 78%
  });
});

test('the retired colors are gone', () => {
  const RETIRED = [
    'coral', 'ember', 'coralText', 'coralTint', 'pine', 'pineTint', 'amber', 'amberTint', 'imageBg', 'cropBg',
    'fullScreen', 'backdrop',
  ];
  for (const key of RETIRED) expect(colors).not.toHaveProperty(key);
});

test('the retired text styles are gone: bold and sectionLabel', () => {
  const theme: Record<string, unknown> = require('../lib/theme');
  expect(theme).not.toHaveProperty('bold');
  expect(theme).not.toHaveProperty('sectionLabel');
});

type Role = keyof typeof colors;

const PAIRS: [Role, Role, string, number, number][] = [
  // [fg, bg, name, design figure, threshold]
  ['ink', 'paper', 'text', 17.37, 4.5], ['ink', 'panel', 'text', 18.1, 4.5], ['ink', 'sand', 'text', 15.38, 4.5],
  ['mute', 'paper', 'text', 7.45, 4.5], ['mute', 'panel', 'text', 7.77, 4.5], ['mute', 'sand', 'text', 6.6, 4.5],
  ['outline', 'panel', 'boundary', 3.37, 3], ['outline', 'paper', 'boundary', 3.23, 3],
  ['ink', 'brand', 'label', 7.01, 4.5], ['ink', 'brandPressed', 'label', 5.23, 4.5],
  ['brandText', 'paper', 'text', 5.66, 4.5], ['brandText', 'panel', 'text', 5.9, 4.5],
  ['brandText', 'brandTint', 'text', 5.35, 4.5], ['brandText', 'sand', 'text', 5.01, 4.5],
  ['focus', 'panel', 'boundary', 3.61, 3],
  ['success', 'successTint', 'text', 4.64, 4.5], ['success', 'panel', 'text', 5.11, 4.5],
  ['warning', 'warningTint', 'text', 5.43, 4.5], ['warning', 'panel', 'text', 6.17, 4.5],
  ['flag', 'panel', 'boundary', 3.78, 3], ['chevron', 'panel', 'icon', 3.74, 3],
  ['danger', 'panel', 'text', 5.38, 4.5], ['danger', 'paper', 'text', 5.16, 4.5],
  ['danger', 'dangerTint', 'text', 4.71, 4.5],
  ['cameraText', 'cameraPanel', 'text', 16.84, 4.5], ['cameraMute', 'camera', 'text', 14.0, 4.5],
  ['brand', 'cameraPanel', 'ring', 6.52, 3], ['paper', 'ink', 'selection', 17.37, 4.5],
  ['brand', 'cameraPanel', 'text', 6.52, 4.5], // the camera panels' text buttons, in coral (ruling T16-2)
];

test.each(PAIRS)('the documented pairs meet their thresholds: %s on %s (%s)', (fg, bg, name, figure, threshold) => {
  const ratio = contrast(colors[fg], colors[bg]);
  expect(ratio).toBeCloseTo(figure, 1);
  expect(ratio).toBeGreaterThanOrEqual(threshold);
});

test("the camera's status pill keeps its white words readable even over a white preview", () => {
  // contrast() lays the see-through pill over the white preview first, then measures it against white: the white
  // (cameraText) words on it.
  expect(contrast(colors.pill, colors.cameraText)).toBeCloseTo(9.04, 1);
});

test('type follows the scale', () => {
  expect(type).toMatchObject({
    title: { fontWeight: '800', fontSize: 20, lineHeight: 26, letterSpacing: -0.4 },
    headerTitle: { fontWeight: '800', fontSize: 18, lineHeight: 24 },
    headline: { fontWeight: '800', fontSize: 17, lineHeight: 22 },
    value: { fontWeight: '600', fontSize: 15, lineHeight: 20 },
    body: { fontWeight: '400', fontSize: 15, lineHeight: 22 },
    button: { fontWeight: '600', fontSize: 15, lineHeight: 20 },
    buttonLarge: { fontWeight: '600', fontSize: 16, lineHeight: 20 },
    label: { fontWeight: '400', fontSize: 13, lineHeight: 18 },
    figure: { fontWeight: '500', fontSize: 15, lineHeight: 20 },
    figureStrong: { fontWeight: '600', fontSize: 17, lineHeight: 22 },
    figureSmall: { fontWeight: '400', fontSize: 13, lineHeight: 18 },
    overline: { fontWeight: '500', fontSize: 12, lineHeight: 16, letterSpacing: 1.44, textTransform: 'uppercase' },
    badge: { fontWeight: '500', fontSize: 12, lineHeight: 16, letterSpacing: 0.48, textTransform: 'uppercase' },
  });
  for (const style of Object.values(type)) {
    expect(style.fontSize).toBeGreaterThanOrEqual(12);
    expect(style).not.toHaveProperty('color'); // the screen gives the color
  }
});

test('on Android, each type style is in its family: Schibsted Grotesk for words, IBM Plex Mono for figures', () => {
  // The scale is made when lib/theme loads, and jest runs as iOS, where face() sets no family: so it loads again, in a
  // registry of its own whose react-native says Android.
  let android: typeof type = type;
  jest.isolateModules(() => {
    jest.replaceProperty(require('react-native').Platform, 'OS', 'android');
    android = require('../lib/theme').type;
  });
  const WORDS = 'SchibstedGrotesk';
  const FIGURES = 'IBMPlexMono'; // figures, dates, codes, section labels and badges
  const families: Record<keyof typeof type, string> = {
    title: WORDS, headerTitle: WORDS, headline: WORDS, value: WORDS, body: WORDS, button: WORDS, buttonLarge: WORDS,
    label: WORDS, figure: FIGURES, figureStrong: FIGURES, figureSmall: FIGURES, overline: FIGURES, badge: FIGURES,
  };
  expect(android).not.toBe(type);
  const familyOf = Object.fromEntries(Object.entries(android).map(([name, style]) => [name, style.fontFamily]));
  expect(familyOf).toEqual(families); // every style, by name
  for (const name of Object.keys(families) as (keyof typeof type)[]) {
    // and the rest as the scale has it: the weight (which picks the face), size, line height and spacing
    expect(android[name]).toEqual({ ...type[name], fontFamily: families[name] });
  }
});

test('face picks the families', () => {
  expect(EMBEDDED_FONTS).toBe(true);
  expect(face('grotesk', 800)).toEqual({ fontWeight: '800' }); // jest runs as iOS, which keeps the system font
  jest.replaceProperty(Platform, 'OS', 'android');
  expect(face('grotesk', 800)).toEqual({ fontFamily: 'SchibstedGrotesk', fontWeight: '800' });
  expect(face('mono', 500)).toEqual({ fontFamily: 'IBMPlexMono', fontWeight: '500' });
});

test('space, shape, touch, ripple and motion have their design values', () => {
  expect(space).toEqual({ xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32 });
  expect(radius).toEqual({ badge: 4, field: 6, button: 10, panel: 10, sheet: 16, bar: 20, pill: 999 });
  expect(touch).toEqual({
    target: 48, buttonLarge: 56, chip: 40, icon: 24, iconSmall: 20, shutter: 72, thumbW: 36, thumbH: 48,
  });
  // Each is named by the surface it's on: light, the brand fill, or dark (the camera, the photo viewer, the snackbar).
  expect(ripple).toEqual({
    light: { color: '#1A15121A' }, // ink at 10%
    brand: { color: '#1A151229' }, // ink at 16%
    dark: { color: '#FFFFFF33' }, // white at 20%
    icon: { color: '#1A15121A', borderless: true, radius: 24 },
    iconDark: { color: '#FFFFFF33', borderless: true, radius: 24 },
  });
  expect(elevation).toEqual({ overlay: 8 });
  expect(durations).toEqual({
    sheetIn: 250, sheetOut: 200, scrim: 200, menu: 150, snackbar: 200, strip: 150, card: 150,
  });
});

test("the bar's measures", () => {
  // Spec §6.2: a white bar with 20 dp corners; the middle button a 60 dp coral circle, raised 26 dp, in a 4 dp paper
  // ring; the open tab's 5 dp coral dot.
  expect(radius.bar).toBe(20);
  expect(bar).toEqual({ circle: 60, raise: 26, ring: 4, dot: 5 });
});
