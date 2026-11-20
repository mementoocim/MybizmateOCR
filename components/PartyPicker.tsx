import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { type Party, partyName } from '../lib/lists';
import { bold, colors } from '../lib/theme';

const SHOWN = 50; // rows shown at a time: a long list is narrowed by typing

/** A party's second line: "TIN 123-456-789-00000 · C001", the missing parts left out. */
export function partyLine(p: Party): string {
  return [p.tin && `TIN ${p.tin}`, p.code].filter(Boolean).join(' · ');
}

/** A search over the parties by name, trade name, code or TIN digits; tapping one picks it. */
export function PartyPicker({
  parties,
  placeholder,
  onPick,
}: {
  parties: readonly Party[];
  placeholder: string;
  onPick: (p: Party) => void;
}) {
  const [query, setQuery] = useState('');
  const text = query.trim().toLowerCase();
  const digits = query.replace(/\D/g, '');
  const found = parties.filter(
    (p) =>
      !text ||
      partyName(p).toLowerCase().includes(text) ||
      p.tradeName.toLowerCase().includes(text) ||
      p.code.toLowerCase().includes(text) ||
      (digits !== '' && p.tin.replace(/\D/g, '').includes(digits)),
  );
  return (
    <View>
      <TextInput
        accessibilityLabel={placeholder}
        placeholder={placeholder}
        placeholderTextColor={colors.mute}
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
        style={styles.input}
      />
      {found.length === 0 && <Text style={styles.none}>No match.</Text>}
      {found.slice(0, SHOWN).map((p) => (
        <Pressable
          key={p.id}
          accessibilityRole="button"
          onPress={() => onPick(p)}
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
          <Text style={styles.name}>{partyName(p)}</Text>
          {partyLine(p) !== '' && <Text style={styles.line}>{partyLine(p)}</Text>}
        </Pressable>
      ))}
      {found.length > SHOWN && <Text style={styles.none}>Showing the first 50. Type to find the others.</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.panel,
    marginVertical: 8,
  },
  none: { fontSize: 14, color: colors.mute, paddingVertical: 8 },
  row: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  pressed: { opacity: 0.6 },
  name: { ...bold, fontSize: 15, color: colors.ink },
  line: { fontSize: 13, color: colors.mute, marginTop: 2 },
});
