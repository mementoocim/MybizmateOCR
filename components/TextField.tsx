import { type Ref, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  type KeyboardTypeOptions,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  type TextInputInstance,
  type TextInputProps,
  View,
  type ViewInstance,
} from 'react-native';

import { colors, radius, space, touch, type } from '../lib/theme';
import { IconButton } from './IconButton';
import { CircleAlert, Close, type IconComponent, TriangleAlert } from './icons';
import { useKeyboardHeight, useScrollIntoView } from './Screen';

// Design B §5.6: a text field. Its label sits above it, unless hideLabel (a search field, whose label is only
// spoken); either way TalkBack says the label once, as the input's name ([216]). The field is a panel box in a 1 dp
// outline border, which becomes a 2 dp focus border while it has focus; the padding gives the extra 1 dp back, so
// nothing inside moves. mono sets the text in the figure style. Under it, one note: the error (danger, with an icon),
// else the warning (warning, with an icon), else the helper (mute); it's also what TalkBack hears as the field's hint.
// Autocorrect is always off: an edit means "the box says this". A search field leads with its icon, and ends with a
// clear button while there's text, which gives the field the focus as it goes.
// Taking focus, the field asks the nearest ScrollIntoViewScope (the Screen's, or a sheet's) to scroll it into view:
// the whole field, its label, box and note, not only the box, whose label would sit above the scroll's top, under the
// header, at a large font size (QA pass 2). The keyboard opens after that, and the end of the scroll grows with it, so
// the field asks again whenever the keyboard grows while it has focus (ruling T5-2).

const BORDER = 1;
const FOCUS_BORDER = 2;
/** What the focus border adds on each side, and the padding gives back. */
const GROW = FOCUS_BORDER - BORDER;
/** The note's icon, in dp. */
const NOTE_ICON = 16;

type Note = { text: string; color: string; Icon: IconComponent | null };

/**
 * The plan's call 15: a field's keyboard for what isn't words (a code, an amount, a date, a TIN, digits, a number).
 * Android's visible-password keyboard keeps every character ("WC158", "1,140.00", "Oct 29") and adds a number row,
 * with no suggestions; iOS has no such keyboard, so its default one. A code (an ATC) in capitals, else as typed. The
 * box editor's, Settings' ATC and the save sheet's ATC spread it into their TextField.
 */
export function codeKeyboard(autoCapitalize: 'characters' | 'none' = 'characters'): {
  keyboardType: KeyboardTypeOptions;
  autoCapitalize: TextInputProps['autoCapitalize'];
} {
  return { keyboardType: Platform.OS === 'android' ? 'visible-password' : 'default', autoCapitalize };
}

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  helper,
  warning,
  error,
  mono = false,
  keyboardType,
  autoCapitalize,
  onFocus,
  onBlur,
  autoFocus,
  leading: Leading,
  clearLabel,
  hideLabel = false,
  testID,
  inputRef,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  helper?: string | null;
  warning?: string | null;
  error?: string | null;
  mono?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: TextInputProps['autoCapitalize'];
  onFocus?: () => void;
  onBlur?: () => void;
  autoFocus?: boolean;
  leading?: IconComponent; // Search
  clearLabel?: string; // an x IconButton with this name while there's text
  hideLabel?: boolean; // search fields: the label is spoken, not shown
  testID?: string;
  inputRef?: Ref<TextInputInstance>;
}) {
  const [focused, setFocused] = useState(false);
  const input = useRef<TextInputInstance>(null);
  // The caller's ref gets the same input.
  useImperativeHandle<TextInputInstance | null, TextInputInstance | null>(inputRef, () => input.current);
  const field = useRef<ViewInstance>(null); // the whole field: what scrolls into view
  const scrollIntoView = useScrollIntoView();
  const keyboard = useKeyboardHeight();
  const lastKeyboard = useRef(keyboard);
  useEffect(() => {
    if (focused && keyboard > lastKeyboard.current) scrollIntoView(field.current);
    lastKeyboard.current = keyboard;
  }, [focused, keyboard, scrollIntoView]);

  const note: Note | null = error
    ? { text: error, color: colors.danger, Icon: CircleAlert }
    : warning
      ? { text: warning, color: colors.warning, Icon: TriangleAlert }
      : helper
        ? { text: helper, color: colors.mute, Icon: null }
        : null;

  return (
    <View ref={field} style={styles.field}>
      {hideLabel ? null : (
        // TalkBack says it as the input's name, not twice
        <Text
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
          style={[type.label, styles.label]}>
          {label}
        </Text>
      )}
      <View style={[styles.box, focused && styles.boxFocused]}>
        {Leading ? <Leading size={touch.iconSmall} color={colors.chevron} /> : null}
        <TextInput
          ref={input}
          testID={testID}
          accessibilityLabel={label}
          accessibilityHint={note?.text}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.mute}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          autoFocus={autoFocus}
          underlineColorAndroid="transparent" // the box is the field: no EditText underline inside it
          onFocus={() => {
            setFocused(true);
            scrollIntoView(field.current);
            onFocus?.();
          }}
          onBlur={() => {
            setFocused(false);
            onBlur?.();
          }}
          style={[mono ? type.figure : type.body, styles.input, focused && styles.inputFocused]}
        />
        {clearLabel !== undefined && value !== '' ? (
          <View style={styles.clear}>
            <IconButton
              icon={Close}
              label={clearLabel}
              onPress={() => {
                onChangeText('');
                input.current?.focus(); // the button goes with the text, focus and all: typing goes on in the field
              }}
            />
          </View>
        ) : null}
      </View>
      {note ? (
        <View style={styles.note}>
          {note.Icon ? <note.Icon size={NOTE_ICON} color={note.color} /> : null}
          <Text style={[type.label, styles.noteText, { color: note.color }]}>{note.text}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: space.s },
  label: { color: colors.mute },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s,
    minHeight: touch.target,
    paddingHorizontal: space.m,
    borderWidth: BORDER,
    borderColor: colors.outline,
    borderRadius: radius.field,
    backgroundColor: colors.panel,
  },
  boxFocused: { borderWidth: FOCUS_BORDER, borderColor: colors.focus, paddingHorizontal: space.m - GROW },
  input: {
    flex: 1,
    alignSelf: 'stretch', // the whole box takes the tap
    paddingHorizontal: 0, // optical: the text starts at the box's padding, without Android's own EditText padding
    paddingVertical: space.s,
    textAlignVertical: 'center',
    color: colors.ink,
  },
  inputFocused: { paddingVertical: space.s - GROW },
  // The 48 dp button overlaps the border rather than stretch the box, and ends at the border, so its icon sits as far
  // in as the leading one.
  clear: { marginVertical: -FOCUS_BORDER, marginRight: -space.m },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: space.xs },
  noteText: { flex: 1 },
});
