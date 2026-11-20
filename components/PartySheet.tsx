import { useState, useSyncExternalStore } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { formFields } from '../lib/forms';
import { addParty, customersOf, formatTin, lists, type Party, subscribeLists } from '../lib/lists';
import { boxValue, SAMPLE_NAMES, type SaleView } from '../lib/sale';
import { type StoredScan, updateScan } from '../lib/scans';
import { colors, sectionLabel } from '../lib/theme';
import { toast } from '../lib/toast';
import { BoxSheet } from './BoxSheet';
import { TextButton } from './Buttons';
import { PartyPicker } from './PartyPicker';

const CUSTOMER_BOXES = ['customer_name', 'customer_tin', 'customer_address'];

/** The Customer row's sheet: what the camera saw in the customer's boxes, and who it is in the person's customers. */
export function PartySheet({
  visible,
  scan,
  sale,
  onClose,
}: {
  visible: boolean;
  scan: StoredScan;
  sale: SaleView;
  onClose: () => void;
}) {
  const theLists = useSyncExternalStore(subscribeLists, lists);
  const [picking, setPicking] = useState(false);
  const party = sale.party;
  const written = party.written;
  const withTin = (name: string, p: Party | null) => (p?.tin ? `${name} · TIN ${p.tin}` : name);

  function choose(p: Party) {
    updateScan(scan.id, { party: { listId: p.id } });
    setPicking(false);
  }

  async function add() {
    const p = await addParty({
      code: '',
      type: 'customer',
      entity: 'company',
      registeredName: written,
      lastName: '',
      firstName: '',
      middleName: '',
      tradeName: '',
      tin: formatTin((boxValue(scan, 'customer_tin') ?? '').replace(/\D/g, '')),
      address: boxValue(scan, 'customer_address') ?? '',
      vatStatus: '',
      terms: '',
      fromScan: true,
    });
    choose(p);
    toast('Added to your customers.');
  }

  const canAdd = scan.source !== 'sample';
  const chooseAnother = (label: string) => <TextButton label={label} onPress={() => setPicking(true)} />;
  const addButton = (label: string) =>
    canAdd ? <TextButton label={label} onPress={() => void add()} /> : <Text style={styles.note}>{SAMPLE_NAMES}</Text>;

  let section;
  if (picking) {
    section = <PartyPicker parties={customersOf(theLists)} placeholder="Search your customers" onPick={choose} />;
  } else if (party.status === 'auto' || party.status === 'chosen') {
    section = (
      <>
        <Text style={styles.party}>{withTin(party.shown, party.listParty)}</Text>
        <Text style={styles.note}>{party.status === 'auto' ? 'Matched by its TIN and name.' : 'You chose this customer.'}</Text>
        {chooseAnother('Choose another')}
      </>
    );
  } else if (party.status === 'unsure') {
    section = (
      <>
        <Text style={styles.party}>{`Closest match: ${withTin(party.shown, party.listParty)}`}</Text>
        <TextButton label="That's the one" onPress={() => party.listParty && choose(party.listParty)} />
        {chooseAnother('Choose another')}
        {addButton(`Add “${written}” as a new customer`)}
      </>
    );
  } else if (party.status === 'new') {
    section = (
      <>
        <Text style={styles.note}>Not in your customer list.</Text>
        {addButton(`Add “${written}” to your customers`)}
        {chooseAnother('Choose from your customers')}
      </>
    );
  } else if (party.status === 'unlisted') {
    section = (
      <>
        <Text style={styles.note}>
          {canAdd
            ? 'Your customer list is empty. Import it in Your lists, or add this customer now.'
            : 'Your customer list is empty. Import it in Your lists.'}
        </Text>
        {addButton(`Add “${written}” to your customers`)}
      </>
    );
  } else {
    section = (
      <>
        <Text style={styles.note}>{"No customer written. It's exported as VARIOUS-CUST, the walk-in customer."}</Text>
        {chooseAnother('Choose from your customers')}
      </>
    );
  }

  const fields = formFields(scan.result.form!);
  return (
    <BoxSheet
      visible={visible}
      title="Customer"
      scan={scan}
      boxes={fields.filter((f) => CUSTOMER_BOXES.includes(f))}
      onClose={onClose}>
      <View style={styles.section}>
        <Text style={sectionLabel}>IN YOUR CUSTOMERS</Text>
        {section}
      </View>
    </BoxSheet>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 20 },
  party: { fontSize: 16, color: colors.ink, marginTop: 8 },
  note: { fontSize: 14, color: colors.mute, marginTop: 6, lineHeight: 20 },
});
