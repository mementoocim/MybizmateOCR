import {
  Children,
  type ReactNode,
  type Ref,
  type RefObject,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  AccessibilityInfo,
  Image,
  type KeyboardTypeOptions,
  Platform,
  StyleSheet,
  Text,
  type TextInputProps,
  View,
  type ViewInstance,
} from 'react-native';

import { fieldLabel, fieldType } from '../lib/forms';
import { boxValue } from '../lib/sale';
import { confirmBox, setEdit, type StoredScan } from '../lib/scans';
import { annotationOn, subscribeSettings } from '../lib/settings';
import { colors, radius, space, touch, type } from '../lib/theme';
import { boxState, type BoxState, trainingBoxes } from '../lib/training/boxes';
import type { BoxRead, FieldType } from '../modules/scanner';
import { Badge, type BadgeSpec } from './Badge';
import type { ButtonProps } from './Buttons';
import { CHIP_SLOP } from './FlagChip';
import { Sheet } from './Sheet';
import { Tap } from './Tap';
import { TextField } from './TextField';

// Design B §9.5 ("Fix a box"), §12 A8 and the plan's calls 15 and 19: what the camera saw in a row's boxes, each one
// fixable. The person types what the box says (an edit is "the box says this", kept apart from the reading), and the
// checks run again. A row with one box, and nothing under it, opens straight at that box's editor; otherwise the sheet
// lists the boxes, full-bleed rows each with its crop (ruling T13-1), what was read and its badges, with what comes
// under them (children: the party, a new item; full-bleed too, so they pad their own text), and Done. A listed box
// opens its editor in the same sheet, with Back to the list.
// The editor: what the camera saw (or that the box is the PDF's own text), the reading with no percentage and "Hard
// to read" under 0.90, the other readings as chips that fill the field, and the field, not focused on open, with the
// keyboard for the box's kind (call 15). Cancel, Looks right (annotation mode) and Save are the sheet's pinned actions
// (ruling T7-4), so a fix for the keyboard over a sheet only has to lift them. Save, or Looks right, goes back to the
// list, or closes a one-box sheet and calls onSaved (the Scan screen then gives TalkBack focus to its strip). Cancel
// leaves at once; Back, Close, the scrim and system back ask first while the field differs from where it started.
// A box opened from the list is a step of the sheet (focusKey), so TalkBack focus moves to its title, the box's label;
// back at the list, focus goes to that box's row, which opened it (ruling T13-2, design §7). A box from the PDF's own
// text has no reading line in its editor: its overline says so, and the field holds the text (ruling T13-3).
// The draft lives in this sheet's state, with the box it's for. It's set only when an editor opens, from a chip, or by
// typing, so a new scan, list or settings while the editor is open never resets it (Review Focus 2). The Scan screen
// keys the sheet per opening (ruling T11-1), so each opening starts fresh.
// In annotation mode (team builds; milestone 4's behaviour), each box that can become training data shows its state in
// place of "Edited" (call 19), in the list and in its editor (a one-box row has no list), and its value as it stands
// can be confirmed ("Looks right") until something else is picked or typed.

/** Under this score a reading is "Hard to read" (§6): today's threshold, which colored it ember. */
const HARD_TO_READ = 0.9;
/** A crop's height in dp: in the list, and in the editor. */
const LIST_CROP = 56;
const EDITOR_CROP = 72;

const HELPER = "Type exactly what's written. The checks run again.";
const HARD: BadgeSpec = { label: 'Hard to read', tone: 'warning' };
const EDITED: BadgeSpec = { label: 'Edited', tone: 'neutral' };
/** A training box's state, in annotation mode. */
const STATE: Record<BoxState, BadgeSpec> = {
  unchecked: { label: 'Not checked yet', tone: 'warning' },
  confirmed: { label: 'Checked', tone: 'success' },
  corrected: { label: 'Corrected', tone: 'success' },
};

const hasOwn = (o: object, key: string) => Object.prototype.hasOwnProperty.call(o, key);

/** How a box was read (§6): "Read as “Oct 29, 2026”", nothing made out, the PDF's own text, or no read at all. */
export function readingLine(read: BoxRead | null): string {
  if (!read) return 'Empty box';
  if (read.fromText) return "From the PDF's text";
  return read.text === '' ? "Couldn't make out any writing" : `Read as “${read.text}”`;
}

/**
 * "Hard to read": a reading of the picture whose score is under 0.90. A PDF's own text is exact, and where nothing was
 * read there's nothing to say.
 */
export function isHardToRead(read: BoxRead | null): boolean {
  return read !== null && !read.fromText && read.text !== '' && read.conf < HARD_TO_READ;
}

/** The box being fixed: what's typed, where it started, and whether the editor was opened from the list. */
type Editor = { box: string; draft: string; start: string; fromList: boolean };

const editorOf = (scan: StoredScan, box: string, fromList: boolean): Editor => {
  const value = boxValue(scan, box) ?? '';
  return { box, draft: value, start: value, fromList };
};

/**
 * Words get the default keyboard, in sentences. Every other box (amounts, dates, quantities, TINs, digits, codes,
 * numbers) gets Android's visible-password keyboard, which keeps every character ("1,140.00", "Oct 29", "P") and adds
 * a number row, with no suggestions; codes (a 2307's ATC) in capitals. Autocorrect is off in every field (TextField).
 */
function keyboardOf(kind: FieldType): {
  keyboardType: KeyboardTypeOptions;
  autoCapitalize: TextInputProps['autoCapitalize'];
} {
  if (kind === 'text') return { keyboardType: 'default', autoCapitalize: 'sentences' };
  return {
    keyboardType: Platform.OS === 'android' ? 'visible-password' : 'default',
    autoCapitalize: kind === 'code' ? 'characters' : 'none',
  };
}

export function BoxSheet({
  visible,
  title,
  scan,
  boxes,
  onClose,
  onSaved,
  returnFocus,
  children,
}: {
  visible: boolean;
  title: string;
  scan: StoredScan;
  boxes: readonly string[];
  onClose: () => void;
  onSaved?: () => void; // a one-box sheet: after Save (or Looks right) closes it
  returnFocus?: RefObject<ViewInstance | null>; // the row that opened it, which TalkBack focus goes back to
  children?: ReactNode; // under the list: the party section, the payor line, a new item
}) {
  const annotation = useSyncExternalStore(subscribeSettings, annotationOn);
  // One box and nothing under it: straight to its editor. Decided once, as the sheet opens.
  const [editor, setEditor] = useState<Editor | null>(() =>
    boxes.length === 1 && Children.toArray(children).length === 0 ? editorOf(scan, boxes[0], false) : null,
  );
  // Each listed box's row, by its box, and the box whose row takes TalkBack focus once the list is back.
  const [rowRefs] = useState(() => new Map<string, ViewInstance | null>());
  const returnTo = useRef<string | null>(null);
  useEffect(() => {
    if (editor !== null || returnTo.current === null) return;
    const row = rowRefs.get(returnTo.current);
    returnTo.current = null;
    if (row) AccessibilityInfo.sendAccessibilityEvent(row, 'focus');
  }, [editor, rowRefs]);
  const form = scan.result.form!;
  const readOf = (box: string) => scan.result.reads.find((r) => r.name === box) ?? null;
  // in annotation mode, the boxes that can become training data: only they have a state, and Looks right
  const training = new Set(annotation ? trainingBoxes(scan).map((r) => r.name) : []);
  const stateOf = (box: string) => (training.has(box) ? boxState(scan, box) : null);

  if (editor === null) {
    return (
      <Sheet
        visible={visible}
        title={title}
        onClose={onClose}
        returnFocus={returnFocus}
        gutter={false}
        actions={[{ label: 'Done', onPress: onClose }]}>
        {boxes.map((box) => (
          <ListedBox
            key={box}
            ref={(view) => {
              rowRefs.set(box, view);
            }}
            name={box}
            label={fieldLabel(form, box)}
            read={readOf(box)}
            edit={hasOwn(scan.edits, box) ? scan.edits[box] : null}
            state={stateOf(box)}
            onPress={() => setEditor(editorOf(scan, box, true))}
          />
        ))}
        {children}
      </Sheet>
    );
  }

  const { box, draft, start, fromList } = editor;
  const read = readOf(box);
  const state = stateOf(box);
  // "Looks right" checks the box's value as it stands: a backup reading picked or other words typed is a correction,
  // which only Save keeps
  const canConfirm = training.has(box) && draft.trim() === (boxValue(scan, box) ?? '');
  const others = [...new Set([...(read?.alts ?? []), ...(read && hasOwn(scan.edits, box) ? [read.text] : [])])].filter(
    (t) => t !== '',
  );
  const { keyboardType, autoCapitalize } = keyboardOf(fieldType(form, box));
  const setDraft = (text: string) => setEditor((e) => e && { ...e, draft: text });
  /** The list again, with TalkBack focus on this box's row. */
  const backToList = () => {
    returnTo.current = box;
    setEditor(null);
  };

  /** Done with the box: back to the list, or a one-box sheet closes (and the Scan screen hears it was saved). */
  function leave(saved: boolean) {
    if (fromList) {
      backToList();
      return;
    }
    onClose();
    if (saved) onSaved?.();
  }

  const cancel: ButtonProps = { label: 'Cancel', variant: 'text', onPress: () => leave(false) };
  const looksRight: ButtonProps = {
    label: 'Looks right',
    variant: 'secondary',
    testID: 'box-confirm',
    onPress: () => {
      confirmBox(scan.id, box);
      leave(true);
    },
  };
  const save: ButtonProps = {
    label: 'Save',
    testID: 'box-save',
    onPress: () => {
      setEdit(scan.id, box, draft);
      leave(true);
    },
  };
  // Cancel · Looks right · Save (the plan's call 19), Looks right only while the field holds the box's value
  const actions = canConfirm ? [cancel, looksRight, save] : [cancel, save];

  return (
    <Sheet
      visible={visible}
      title={fieldLabel(form, box)}
      onClose={onClose}
      onBack={fromList ? backToList : null}
      focusKey={fromList ? box : undefined} // a step of the list; a one-box sheet has only the one
      dirty={visible && draft !== start} // a closing sheet has nothing more to ask
      returnFocus={returnFocus}
      actions={actions}>
      <View style={styles.editor}>
        <View style={styles.group}>
          {/* caps by the overline style: WHAT THE CAMERA SAW, FROM THE PDF'S TEXT */}
          <Text style={[type.overline, styles.mute]}>
            {read?.fromText ? "From the PDF's text" : 'What the camera saw'}
          </Text>
          {read?.fromText ? null : read?.cropUri ? (
            <Image
              testID="editor-crop"
              source={{ uri: read.cropUri }}
              resizeMode="contain"
              style={[styles.crop, styles.editorCrop]}
            />
          ) : (
            <Text style={[type.body, styles.mute]}>No picture of this box</Text>
          )}
        </View>
        {read?.fromText ? null : ( // the overline already says it's the PDF's own text (ruling T13-3)
          <View style={styles.reading}>
            <Text style={[type.body, styles.ink]}>{readingLine(read)}</Text>
            {isHardToRead(read) ? <Badge {...HARD} /> : null}
            {state ? <Badge {...STATE[state]} /> : null}
          </View>
        )}
        {others.length > 0 ? (
          <View style={styles.group}>
            <Text style={[type.label, styles.mute]}>Could also be</Text>
            <View style={styles.chips}>
              {others.map((text) => (
                <Tap
                  key={text}
                  accessibilityRole="button"
                  accessibilityLabel={text}
                  onPress={() => setDraft(text)}
                  hitSlop={CHIP_SLOP}
                  focusRadius={radius.pill}
                  style={styles.chip}>
                  {/* in the field's own figures, so a 0 and an O look apart */}
                  <Text style={[type.figure, styles.ink]}>{text}</Text>
                </Tap>
              ))}
            </View>
          </View>
        ) : null}
        <TextField
          label="What the box says"
          value={draft}
          onChangeText={setDraft}
          helper={HELPER}
          mono
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
        />
      </View>
    </Sheet>
  );
}

/**
 * A box in the list: its label, its crop, how it was read, what the person changed it to, and its badges ("Hard to
 * read"; "Edited", or a training box's state). One full-bleed row that opens its editor, and one stop for TalkBack,
 * which says it all, badges included (ruling T4-4).
 */
function ListedBox({
  name,
  label,
  read,
  edit,
  state,
  onPress,
  ref,
}: {
  name: string;
  label: string;
  read: BoxRead | null;
  edit: string | null; // '' when the person cleared it
  state: BoxState | null; // annotation mode, a training box
  onPress: () => void;
  ref?: Ref<ViewInstance>; // the row, which takes TalkBack focus back from its editor
}) {
  const changed = edit === null ? null : edit === '' ? 'You cleared it.' : `You changed it to “${edit}”.`;
  const badges = [isHardToRead(read) ? HARD : null, state ? STATE[state] : edit !== null ? EDITED : null].filter(
    (b) => b !== null,
  );
  const spoken = [label, readingLine(read), changed?.replace(/\.$/, ''), ...badges.map((b) => b.label)]
    .filter(Boolean)
    .join(', ');
  return (
    <Tap
      ref={ref}
      testID={`box-${name}`}
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityHint="Opens it to fix"
      onPress={onPress}
      focusRing="inside" // rows stack edge to edge (ruling T4-1)
      focusRadius={0}
      style={styles.row}>
      <Text style={[type.label, styles.mute]}>{label}</Text>
      {read?.cropUri ? (
        <Image
          testID={`crop-${name}`}
          source={{ uri: read.cropUri }}
          resizeMode="contain"
          style={[styles.crop, styles.listCrop]}
        />
      ) : null}
      <Text style={[type.body, styles.ink]}>{readingLine(read)}</Text>
      {changed ? <Text style={[type.body, styles.ink]}>{changed}</Text> : null}
      {badges.length > 0 ? (
        <View style={styles.badges}>
          {badges.map((b) => (
            <Badge key={b.label} {...b} />
          ))}
        </View>
      ) : null}
    </Tap>
  );
}

const styles = StyleSheet.create({
  ink: { color: colors.ink },
  mute: { color: colors.mute },
  // A full-bleed row on a hairline, as list rows are: its ripple spans the sheet.
  row: {
    minHeight: touch.target,
    gap: space.s,
    paddingVertical: space.m,
    paddingHorizontal: space.l,
    backgroundColor: colors.panel,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  crop: { width: '100%', backgroundColor: colors.crop, borderRadius: radius.field },
  listCrop: { height: LIST_CROP },
  editorCrop: { height: EDITOR_CROP },
  // badges keep their own width in a row that wraps
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s },
  editor: { gap: space.l, paddingBottom: space.l },
  group: { gap: space.s },
  reading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.s },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s },
  chip: {
    minHeight: touch.chip,
    justifyContent: 'center',
    paddingHorizontal: space.m,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
  },
});
