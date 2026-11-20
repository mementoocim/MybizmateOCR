import { useState, useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { addParty, lists, subscribeLists, suppliersOf } from '../lib/lists';
import { SAMPLE_NAMES, type SaleView } from '../lib/sale';
import { type PartyChoice, type StoredScan, updateScan } from '../lib/scans';
import { bold, colors, sectionLabel } from '../lib/theme';
import { toast } from '../lib/toast';
import { TextButton } from './Buttons';
import { PartyPicker } from './PartyPicker';
import { Sheet } from './Sheet';

/** The Supplier row's sheet on a purchase: the seller is printed, not read, so the person chooses it. */
export function SupplierSheet({
  visible,
  scan,
  onClose,
}: {
  visible: boolean;
  scan: StoredScan;
  sale: SaleView;
  onClose: () => void;
}) {
  const theLists = useSyncExternalStore(subscribeLists, lists);
  const [name, setName] = useState('');
  const suppliers = suppliersOf(theLists);
  const typed = name.trim();

  function pick(party: PartyChoice) {
    updateScan(scan.id, { party });
    onClose();
  }

  async function add() {
    const p = await addParty({
      code: '',
      type: 'supplier',
      entity: 'company',
      registeredName: typed,
      lastName: '',
      firstName: '',
      middleName: '',
      tradeName: '',
      tin: '',
      address: '',
      vatStatus: '',
      terms: '',
      fromScan: true,
    });
    pick({ listId: p.id });
    toast('Added to your suppliers.');
  }

  return (
    <Sheet
      visible={visible}
      title="Supplier"
      subtitle="Who sold it to you: the business printed at the top of the invoice. The scanner doesn't read that part, so choose it here."
      onClose={onClose}>
      {suppliers.length > 0 && (
        <PartyPicker parties={suppliers} placeholder="Search your suppliers" onPick={(p) => pick({ listId: p.id })} />
      )}
      <Pressable
        accessibilityRole="button"
        onPress={() => pick({ various: true })}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
        <Text style={styles.name}>Various suppliers</Text>
        <Text style={styles.line}>Exported as VARIOUS-SUPP</Text>
      </Pressable>
      <View style={styles.section}>
        <Text style={sectionLabel}>NOT IN YOUR LIST?</Text>
        <TextInput
          accessibilityLabel="Supplier's name"
          placeholder="Supplier's name"
          placeholderTextColor={colors.mute}
          value={name}
          onChangeText={setName}
          style={styles.input}
        />
        <TextButton label="Use this name" disabled={!typed} onPress={() => pick({ name: typed })} />
        {scan.source === 'sample' ? (
          <Text style={styles.note}>{SAMPLE_NAMES}</Text>
        ) : (
          <TextButton label="Add to your suppliers" disabled={!typed} onPress={() => void add()} />
        )}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  pressed: { opacity: 0.6 },
  name: { ...bold, fontSize: 15, color: colors.ink },
  line: { fontSize: 13, color: colors.mute, marginTop: 2 },
  section: { marginTop: 20 },
  note: { fontSize: 14, color: colors.mute, marginTop: 6, lineHeight: 20 },
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
});
