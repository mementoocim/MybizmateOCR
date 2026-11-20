import { Platform, type TextStyle } from 'react-native';

// The MyBizMate look: the Android test app's colors.xml and themes.xml (prototype/android_test).
export const colors = {
  coral: '#FC7C4C',
  ember: '#E26331',
  coralText: '#B13E03',
  coralTint: '#FFEEE6',
  ink: '#201913',
  mute: '#635C57',
  line: '#E1DDD8',
  paper: '#FAF7F0',
  panel: '#FFFFFF',
  pine: '#3E7A52',
  pineTint: '#E8F3EB',
  amber: '#8F5300',
  amberTint: '#FCEFD9',
  scrim: '#CCFAF7F0',
  imageBg: '#F1EEE8',
  cropBg: '#F4F1EB',
  fullScreen: '#161310',
  pill: '#B3201913',
} as const;

/** Bold text: Android's sans-serif-medium, as the test app uses. */
export const bold: TextStyle =
  Platform.select<TextStyle>({ android: { fontFamily: 'sans-serif-medium' }, default: { fontWeight: '600' } }) ?? {};

/** A section's label: 13 sp, bold, mute, in capitals with a little letter spacing (0.06 em). */
export const sectionLabel: TextStyle = { ...bold, fontSize: 13, color: colors.mute, letterSpacing: 0.78 };
