import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Platform, processColor, Text } from 'react-native';

import { Button } from '../components/Buttons';
import { IconButton } from '../components/IconButton';
import { Flashlight, SettingsIcon } from '../components/icons';
import { Tap } from '../components/Tap';
import { colors, radius, ripple, type } from '../lib/theme';
import { typeStylesOf } from '../test-utils/typeStyles';

// Design B §5.5 and §5.6: one pressable (Tap) with the Android ripple and a keyboard focus ring; the Button's
// variants, sizes and states; and the 48 dp IconButton. The ripple itself is native, so these tests read the styles,
// the accessibility state and what a press does.

const noop = () => {};
const button = (name: string) => screen.getByRole('button', { name });
type Instance = ReturnType<typeof screen.getByRole>;
/** An icon button's glyph: its Svg, the one host child it has while unfocused. */
const glyphOf = (target: Instance) => target.children.find((child): child is Instance => typeof child !== 'string');

test('a primary button: brand fill, ink label, role button', async () => {
  const onPress = jest.fn();
  await render(<Button label="Save sale" onPress={onPress} />);
  expect(button('Save sale')).toHaveStyle({ backgroundColor: colors.brand });
  expect(screen.getByText('Save sale')).toHaveStyle({ color: colors.ink });
  await fireEvent.press(button('Save sale'));
  expect(onPress).toHaveBeenCalledTimes(1);
});

test('secondary, text, destructive and destructiveText look as the design says', async () => {
  await render(
    <>
      <Button label="Retake" variant="secondary" onPress={noop} />
      <Button label="Which columns?" variant="text" onPress={noop} />
      <Button label="Delete" variant="destructive" onPress={noop} />
      <Button label="Clear suppliers" variant="destructiveText" onPress={noop} />
    </>,
  );
  expect(button('Retake')).toHaveStyle({ backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.outline });
  expect(screen.getByText('Retake')).toHaveStyle({ color: colors.ink });
  expect(button('Which columns?')).toHaveStyle({ backgroundColor: undefined, borderWidth: undefined });
  expect(screen.getByText('Which columns?')).toHaveStyle({ color: colors.brandText });
  expect(button('Delete')).toHaveStyle({ backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.dangerLine });
  expect(screen.getByText('Delete')).toHaveStyle({ color: colors.danger });
  expect(button('Clear suppliers')).toHaveStyle({ backgroundColor: undefined, borderWidth: undefined });
  expect(screen.getByText('Clear suppliers')).toHaveStyle({ color: colors.danger });
});

test('disabled: sand fill, mute label, no press', async () => {
  const onPress = jest.fn();
  await render(
    <>
      <Button label="Save sale" disabled onPress={onPress} />
      <Button label="Retake" variant="secondary" disabled onPress={onPress} />
      <Button label="Delete" variant="destructive" disabled onPress={onPress} />
    </>,
  );
  for (const name of ['Save sale', 'Retake', 'Delete']) {
    expect(button(name)).toHaveStyle({ backgroundColor: colors.sand });
    expect(screen.getByText(name)).toHaveStyle({ color: colors.mute });
    expect(button(name).props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(button(name));
  }
  expect(onPress).not.toHaveBeenCalled();
});

test('disabled text and destructiveText buttons get the sand fill too', async () => {
  const onPress = jest.fn();
  await render(
    <>
      <Button label="Use this name" variant="text" disabled onPress={onPress} />
      <Button label="Clear suppliers" variant="destructiveText" disabled onPress={onPress} />
    </>,
  );
  for (const name of ['Use this name', 'Clear suppliers']) {
    expect(button(name)).toHaveStyle({ backgroundColor: colors.sand });
    expect(screen.getByText(name)).toHaveStyle({ color: colors.mute });
    await fireEvent.press(button(name));
  }
  expect(onPress).not.toHaveBeenCalled();
});

test('loading keeps the label, shows a spinner and blocks presses', async () => {
  const onPress = jest.fn();
  await render(<Button label="Save" testID="save" loading onPress={onPress} />);
  expect(screen.getByTestId('save-spinner')).toBeOnTheScreen();
  expect(screen.getByText('Save')).toBeOnTheScreen();
  expect(button('Save').props.accessibilityState).toEqual({ busy: true, disabled: true });
  await fireEvent.press(button('Save'));
  expect(onPress).not.toHaveBeenCalled();
});

test('a press that returns a promise runs once until it settles', async () => {
  let resolve = () => {};
  const onPress = jest.fn(() => new Promise<void>((r) => (resolve = r)));
  await render(<Button label="Save" testID="save" onPress={onPress} />);

  // A fast double tap: inside one act() scope, React doesn't re-render the button as busy between the two presses.
  await act(async () => {
    await fireEvent.press(button('Save'));
    await fireEvent.press(button('Save'));
  });
  expect(onPress).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId('save-spinner')).toBeOnTheScreen();
  await fireEvent.press(button('Save')); // and a press while the spinner shows
  expect(onPress).toHaveBeenCalledTimes(1);

  await act(async () => resolve());
  expect(screen.queryByTestId('save-spinner')).toBeNull();
  await fireEvent.press(button('Save'));
  expect(onPress).toHaveBeenCalledTimes(2);
});

test('large is at least 56 dp, default 48, and neither has a fixed height', async () => {
  await render(
    <>
      <Button label="Take photo" size="large" onPress={noop} />
      <Button label="Save" onPress={noop} />
      <Button label="Cancel" variant="text" onPress={noop} />
    </>,
  );
  expect(button('Take photo')).toHaveStyle({ minHeight: 56, height: undefined });
  expect(button('Save')).toHaveStyle({ minHeight: 48, height: undefined });
  expect(button('Cancel')).toHaveStyle({ minHeight: 48, height: undefined }); // a text button is a 48 dp target too
  expect(screen.getByText('Take photo')).toHaveStyle(type.buttonLarge);
  expect(screen.getByText('Save')).toHaveStyle(type.button);
  expect(typeStylesOf(screen.getByText('Save'))).toEqual(['button']); // jest runs as iOS: value flattens alike here
});

test('IconButton is a labelled 48 dp target, and a switch carries its state', async () => {
  const onPress = jest.fn();
  await render(
    <>
      <IconButton icon={SettingsIcon} label="Settings" onPress={onPress} />
      <IconButton icon={Flashlight} label="Flashlight" tone="camera" accessibilityRole="switch" checked onPress={noop} />
    </>,
  );
  const settings = button('Settings');
  expect(settings).toHaveStyle({ width: 48, height: 48 });
  expect(glyphOf(settings)?.props).toMatchObject({ width: 24, stroke: colors.ink });
  await fireEvent.press(settings);
  expect(onPress).toHaveBeenCalledTimes(1);

  const flashlight = screen.getByRole('switch', { name: 'Flashlight' });
  expect(flashlight.props.accessibilityState).toMatchObject({ checked: true });
  expect(glyphOf(flashlight)?.props).toMatchObject({ width: 24, stroke: colors.cameraText });
});

test('a switch IconButton given no checked state says it is off, never undefined', async () => {
  await render(<IconButton icon={Flashlight} label="Flashlight" accessibilityRole="switch" onPress={noop} />);
  const flashlight = screen.getByRole('switch', { name: 'Flashlight' });
  expect(flashlight.props.accessibilityState).toEqual({ checked: false });
  expect(flashlight).not.toBeChecked();
});

test('a text button on the camera: a brand label and the dark ripple; the primary and a text button elsewhere keep theirs', async () => {
  // Android draws the ripple from the pressable's nativeBackgroundAndroid; jest runs as iOS, which has none.
  const os = jest.replaceProperty(Platform, 'OS', 'android');
  try {
    await render(
      <>
        <Button label="Use the phone's camera app instead" variant="text" tone="camera" onPress={noop} />
        <Button label="Allow the camera" tone="camera" onPress={noop} />
        <Button label="Which columns?" variant="text" onPress={noop} />
      </>,
    );
    const rippleOf = (name: string) => button(name).props.nativeBackgroundAndroid;
    // brand on cameraPanel is text-grade (theme.test's pairs: 6.52:1); brandText would be 2.85:1 there
    expect(screen.getByText("Use the phone's camera app instead")).toHaveStyle({ color: colors.brand });
    expect(rippleOf("Use the phone's camera app instead")).toMatchObject({
      color: processColor(ripple.dark.color),
      borderless: false,
    });
    expect(button("Use the phone's camera app instead")).toHaveStyle({ backgroundColor: undefined, minHeight: 48 });
    // the primary keeps its brand fill, ink label and ripple on the camera's panels
    expect(button('Allow the camera')).toHaveStyle({ backgroundColor: colors.brand });
    expect(screen.getByText('Allow the camera')).toHaveStyle({ color: colors.ink });
    expect(rippleOf('Allow the camera')).toMatchObject({ color: processColor(ripple.brand.color) });
    // on light surfaces, as before
    expect(screen.getByText('Which columns?')).toHaveStyle({ color: colors.brandText });
    expect(rippleOf('Which columns?')).toMatchObject({ color: processColor(ripple.light.color) });
  } finally {
    os.restore();
  }
});

test('Tap shows a 2 dp focus ring while focused', async () => {
  const onFocus = jest.fn();
  const onBlur = jest.fn();
  await render(
    <>
      <Tap accessibilityRole="button" accessibilityLabel="Open" onPress={noop} onFocus={onFocus} onBlur={onBlur}>
        <Text>Open</Text>
      </Tap>
      <Tap accessibilityRole="button" accessibilityLabel="Close" focusRadius={24} onPress={noop}>
        <Text>Close</Text>
      </Tap>
    </>,
  );
  const tap = button('Open');
  expect(screen.queryByTestId('focus-ring')).toBeNull();

  await fireEvent(tap, 'focus');
  // Ruling F3-1: the ring sits 3 dp outside the control, so it shows on any fill (focus on brand is about 1.4:1).
  expect(screen.getByTestId('focus-ring')).toHaveStyle({
    position: 'absolute',
    top: -3,
    left: -3,
    right: -3,
    bottom: -3,
    borderWidth: 2,
    borderColor: colors.focus,
    borderRadius: radius.button + 3,
  });
  expect(onFocus).toHaveBeenCalledTimes(1);

  await fireEvent(tap, 'blur');
  expect(screen.queryByTestId('focus-ring')).toBeNull();
  expect(onBlur).toHaveBeenCalledTimes(1);

  await fireEvent(button('Close'), 'focus'); // a Tap's own corner radius, 3 dp out
  expect(screen.getByTestId('focus-ring')).toHaveStyle({ borderRadius: 24 + 3 });
});

test("an inside focus ring sits on the control's edge, for full-bleed rows (ruling T4-1)", async () => {
  await render(
    <>
      <Tap accessibilityRole="button" accessibilityLabel="Row" focusRing="inside" focusRadius={0} onPress={noop}>
        <Text>Row</Text>
      </Tap>
      <Tap accessibilityRole="button" accessibilityLabel="Card" focusRing="inside" onPress={noop}>
        <Text>Card</Text>
      </Tap>
    </>,
  );
  // Rows stack edge to edge in a scroll view: the next row's fill would cover a ring outside, and the scroll would
  // clip its sides. Inside, it's the same 2 dp ring at inset 0, on the control's own radius.
  await fireEvent(button('Row'), 'focus');
  expect(screen.getByTestId('focus-ring')).toHaveStyle({
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 2,
    borderColor: colors.focus,
    borderRadius: 0,
  });
  await fireEvent(button('Row'), 'blur');

  await fireEvent(button('Card'), 'focus'); // the default radius, not 3 dp out
  expect(screen.getByTestId('focus-ring')).toHaveStyle({ top: 0, borderRadius: radius.button });
});
