import { type RefObject, useState, useSyncExternalStore } from 'react';
import { StyleSheet, Text, View, type ViewInstance } from 'react-native';

import { addParty, lists, subscribeLists, suppliersOf } from '../lib/lists';
import { SAMPLE_NAMES, type SaleView } from '../lib/sale';
import { type PartyChoice, type StoredScan, updateScan } from '../lib/scans';
import { colors, space, type } from '../lib/theme';
import { toast } from '../lib/toast';
import { ButtonRow } from './BottomBar';
import type { ButtonProps } from './Buttons';
import { ListRow } from './ListRow';
import { PartyPicker } from './PartyPicker';
import { SectionHeader } from './SectionHeader';
import { Sheet } from './Sheet';
import { TextField } from './TextField';

// Design B §9.5: the Supplier row's sheet on a purchase. The seller is printed, not read, so the person chooses it:
// from their suppliers (the picker), as Various suppliers, or by a name not in the list, used as typed or added to the
// suppliers. A list of full-bleed rows and strips, so the sheet has no gutter, and the field and its buttons pad
// themselves onto it.

export function SupplierSheet({
  visible,
  scan,
  onClose,
  returnFocus,
}: {
  visible: boolean;
  scan: StoredScan;
  sale: SaleView;
  onClose: () => void;
  returnFocus?: RefObject<ViewInstance | null>; // the row that opened it
}) {
  const theLists = useSyncExternalStore(subscribeLists, lists);
  const [name, setName] = useState('');
  const suppliers = suppliersOf(theLists);
  const typed = name.trim();
  const sample = scan.source === 'sample';

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

  const use: ButtonProps = {
    label: 'Use this name',
    variant: 'secondary',
    disabled: !typed,
    onPress: () => pick({ name: typed }),
  };
  const addIt: ButtonProps = { label: 'Add to your suppliers', variant: 'text', disabled: !typed, onPress: add };

  return (
    <Sheet
      visible={visible}
      title="Supplier"
      subtitle="Who sold it to you: the business printed at the top of the invoice. The scanner doesn't read that part, so choose it here."
      onClose={onClose}
      returnFocus={returnFocus}
      gutter={false}>
      {suppliers.length > 0 ? (
        <PartyPicker parties={suppliers} label="Search your suppliers" onPick={(p) => pick({ listId: p.id })} />
      ) : null}
      <ListRow title="Various suppliers" sub="Exported as VARIOUS-SUPP" onPress={() => pick({ various: true })} />
      <SectionHeader title="Not in your list?" />
      <View style={styles.typed}>
        <TextField label="Supplier's name" value={name} onChangeText={setName} />
        {/* a sample's made-up names never reach the lists: the note in place of Add */}
        <ButtonRow buttons={sample ? [use] : [use, addIt]} />
        {sample ? <Text style={[type.body, styles.note]}>{SAMPLE_NAMES}</Text> : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  typed: { paddingHorizontal: space.l, paddingTop: space.l, gap: space.m },
  note: { color: colors.mute },
});
