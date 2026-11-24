import { TextInput } from 'react-native';

/**
 * jest's text inputs share their native methods' mocks: focus() is one jest.fn on TextInput's prototype, and each call
 * keeps the field it was made on. Read when called, so it's the mock jest has then.
 */
const focus = () => (TextInput as unknown as { prototype: { focus: jest.Mock } }).prototype.focus;

/** The fields focus() was called on since the last clear, in order, by their spoken names. */
export function fieldsFocused(): (string | undefined)[] {
  return focus().mock.contexts.map((field) => (field as { props: { accessibilityLabel?: string } }).props.accessibilityLabel);
}

/** Forgets the fields focused so far (jest.clearAllMocks() does too). */
export function clearFieldsFocused(): void {
  focus().mockClear();
}
