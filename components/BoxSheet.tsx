import { type ReactNode, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { fieldLabel } from '../lib/forms';
import { boxValue } from '../lib/sale';
import { setEdit, type StoredScan } from '../lib/scans';
import { bold, colors, sectionLabel } from '../lib/theme';
import { BoxRow } from './BoxRow';
import { PrimaryButton, TextButton } from './Buttons';
import { Sheet } from './Sheet';

const hasOwn = (o: object, key: string) => Object.prototype.hasOwnProperty.call(o, key);

/**
 * What the camera saw in a row's boxes, each one fixable: the person types what the box says (an edit is "the box
 * says this", kept apart from the reading), and the checks run again. children: more under the boxes (the customer).
 */
export function BoxSheet({
  visible,
  title,
  scan,
  boxes,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  scan: StoredScan;
  boxes: readonly string[];
  onClose: () => void;
  children?: ReactNode;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const form = scan.result.form!;
  const readOf = (box: string) => scan.result.reads.find((r) => r.name === box) ?? null;

  function close() {
    setEditing(null);
    onClose();
  }

  if (editing !== null) {
    const read = readOf(editing);
    const others = [...new Set([...(read?.alts ?? []), ...(read && hasOwn(scan.edits, editing) ? [read.text] : [])])].filter(
      (t) => t !== '',
    );
    return (
      <Sheet visible={visible} title={title} onClose={close}>
        <Text style={styles.heading}>{fieldLabel(form, editing)}</Text>
        {read?.cropUri && <Image source={{ uri: read.cropUri }} style={styles.bigCrop} resizeMode="contain" />}
        {read && (
          <Text style={[styles.reading, read.conf < 0.9 && styles.unsure]}>
            {read.text === '' ? "Couldn't make out any writing" : `Read as “${read.text}” · ${Math.round(read.conf * 100)}% sure`}
          </Text>
        )}
        {others.length > 0 && (
          <>
            <Text style={[sectionLabel, styles.others]}>OTHER READINGS</Text>
            <View style={styles.chips}>
              {others.map((t) => (
                <Pressable key={t} accessibilityRole="button" onPress={() => setDraft(t)} style={styles.chip}>
                  <Text style={styles.chipText}>{t}</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}
        <TextInput
          accessibilityLabel="What the box says"
          value={draft}
          onChangeText={setDraft}
          style={styles.input}
          autoCorrect={false}
        />
        <Text style={styles.note}>
          {"Type exactly what is written, even if it looks wrong. The checks then show what doesn't add up."}
        </Text>
        <View style={styles.buttons}>
          <PrimaryButton
            testID="box-save"
            label="Save"
            onPress={() => {
              setEdit(scan.id, editing, draft);
              setEditing(null);
            }}
          />
          <TextButton label="Cancel" onPress={() => setEditing(null)} />
        </View>
      </Sheet>
    );
  }

  return (
    <Sheet
      visible={visible}
      title={title}
      subtitle="What the camera saw in each box. If a box was read wrong, type what it says."
      onClose={close}>
      {boxes.map((box) => {
        const read = readOf(box);
        const edit = hasOwn(scan.edits, box) ? scan.edits[box] : null;
        return (
          <View key={box} style={styles.box}>
            <BoxRow label={fieldLabel(form, box)} read={read} />
            {edit !== null && (
              <Text style={styles.edited}>{edit === '' ? 'You cleared it.' : `You changed it to “${edit}”.`}</Text>
            )}
            <TextButton
              testID={`fix-${box}`}
              label={read ? 'Fix it' : 'Add what it says'}
              onPress={() => {
                setDraft(boxValue(scan, box) ?? '');
                setEditing(box);
              }}
            />
          </View>
        );
      })}
      {children}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  box: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, paddingBottom: 4 },
  edited: { fontSize: 14, color: colors.pine, marginTop: 6 },
  heading: { ...bold, fontSize: 15, color: colors.ink, marginTop: 12, marginBottom: 8 },
  bigCrop: { width: '100%', height: 72, backgroundColor: colors.cropBg, borderRadius: 12, marginBottom: 8 },
  reading: { fontSize: 15, color: colors.ink },
  unsure: { color: colors.ember },
  others: { marginTop: 16, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: colors.line, borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12 },
  chipText: { fontSize: 15, color: colors.ink },
  input: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.panel,
  },
  note: { fontSize: 13, color: colors.mute, marginTop: 8, lineHeight: 18 },
  buttons: { marginTop: 16, gap: 4 },
});
