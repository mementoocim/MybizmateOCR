import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { type Party, partyName } from '../lib/lists';
import { matchesParty } from '../lib/search';
import { colors, space, type } from '../lib/theme';
import { Search } from './icons';
import { ListRow } from './ListRow';
import { TextField } from './TextField';

// Design B §9.5: the party picker, in the Customer and Supplier sheets. A search field at the top finds a party by its
// name, trade name or code, case and accents aside, or by its TIN's digits (lib/search); then the parties as list
// rows, the name over its TIN and code in figures, and tapping one picks it. The search is focused on open where the
// picker is what the person came for (Choose another); the Supplier sheet shows its other choices first, which the
// keyboard would cover (ruling T14-1). Its rows are full-bleed, so it pads its own field and notes: its sheet has no
// gutter.

const SHOWN = 50; // rows shown at a time: a long list is narrowed by typing

/** A party's second line: "TIN 123-456-789-00000 · C001", the missing parts left out. */
export function partyLine(p: Party): string {
  return [p.tin && `TIN ${p.tin}`, p.code].filter(Boolean).join(' · ');
}

export function PartyPicker({
  parties,
  label,
  onPick,
  autoFocus = true,
}: {
  parties: readonly Party[];
  label: string; // the search's spoken name and placeholder: "Search your customers"
  onPick: (p: Party) => void;
  autoFocus?: boolean; // default true: the search takes the focus (and the keyboard) on open
}) {
  const [query, setQuery] = useState('');
  const found = parties.filter((p) => matchesParty(p, query));
  return (
    <View>
      <View style={styles.search}>
        <TextField
          label={label}
          placeholder={label}
          hideLabel
          leading={Search}
          clearLabel="Clear the search"
          autoFocus={autoFocus}
          value={query}
          onChangeText={setQuery}
        />
      </View>
      {found.length === 0 ? <Text style={[type.body, styles.note]}>No match.</Text> : null}
      {found.slice(0, SHOWN).map((p) => (
        <ListRow
          key={p.id}
          testID={`party-${p.id}`}
          title={partyName(p)}
          sub={partyLine(p) || null}
          subMono
          onPress={() => onPick(p)}
        />
      ))}
      {found.length > SHOWN ? (
        <Text style={[type.body, styles.note]}>Showing the first 50. Type to find the others.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  search: { paddingHorizontal: space.l, paddingVertical: space.m },
  note: { paddingHorizontal: space.l, paddingVertical: space.m, color: colors.mute },
});
