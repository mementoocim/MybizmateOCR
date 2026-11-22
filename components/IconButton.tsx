import { StyleSheet } from 'react-native';

import { colors, touch } from '../lib/theme';
import type { IconComponent } from './icons';
import { Tap } from './Tap';

// Design B §5.3 and §5.6: an icon-only control is a 48 dp target with a 24 dp icon, and its label is what TalkBack
// says. On light surfaces the icon is ink, with the theme's borderless icon ripple; on the camera and the photo viewer
// it's cameraText, with the camera's. Its focus ring is a circle, like the ripple. As a switch (the flashlight), it
// carries its checked state.

export function IconButton({
  icon: Icon,
  label,
  onPress,
  tone = 'light',
  accessibilityRole = 'button',
  checked,
  disabled,
  testID,
  accessibilityHint,
}: {
  icon: IconComponent;
  label: string;
  onPress: () => void;
  tone?: 'light' | 'camera';
  accessibilityRole?: 'button' | 'switch';
  checked?: boolean; // a switch's state
  disabled?: boolean;
  testID?: string;
  accessibilityHint?: string;
}) {
  const camera = tone === 'camera';
  return (
    <Tap
      accessibilityRole={accessibilityRole}
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={accessibilityRole === 'switch' ? { checked } : undefined}
      testID={testID}
      disabled={disabled}
      onPress={onPress}
      ripple={camera ? 'iconCamera' : 'icon'}
      focusRadius={touch.target / 2}
      style={styles.target}>
      <Icon size={touch.icon} color={camera ? colors.cameraText : colors.ink} />
    </Tap>
  );
}

const styles = StyleSheet.create({
  target: { width: touch.target, height: touch.target, alignItems: 'center', justifyContent: 'center' },
});
