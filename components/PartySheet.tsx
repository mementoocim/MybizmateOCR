import { type ReactNode, type RefObject, useState, useSyncExternalStore } from 'react';
import { StyleSheet, Text, View, type ViewInstance } from 'react-native';

import { formFields } from '../lib/forms';
import { addParty, customersOf, formatTin, lists, type Party, subscribeLists } from '../lib/lists';
import { boxValue, SAMPLE_NAMES, type SaleView } from '../lib/sale';
import { type StoredScan, updateScan } from '../lib/scans';
import { colors, space, type } from '../lib/theme';
import { toast } from '../lib/toast';
import type { BadgeSpec } from './Badge';
import { BoxSheet } from './BoxSheet';
import { Button } from './Buttons';
import { ListRow } from './ListRow';
import { PartyPicker } from './PartyPicker';
import { SectionHeader } from './SectionHeader';

// Design B §9.5: the Customer row's sheet. What the camera saw in the customer's boxes, listed and fixable as in any
// row's sheet (BoxSheet), then who the customer is. "In your customers": the match, the person's pick, the closest
// match or the walk-in customer, as a row with its TIN, then today's reason and buttons. Or "Not in your customers":
// the name as written with a New badge, since it goes out as written, then today's buttons and notes. Choose another
// searches the customers in the same sheet (PartyPicker). The box list is full-bleed, and so is this: the strips and
// rows pad themselves, and the notes and buttons sit on the gutter.

const CUSTOMER_BOXES = ['customer_name', 'customer_tin', 'customer_address'];
const NEW: BadgeSpec = { label: 'New', tone: 'brand' };
const EMPTY_LIST = 'Your customer list is empty. Import it in Your lists.';
const EMPTY_LIST_ADD = 'Your customer list is empty. Import it in Your lists, or add this customer now.';
const WALK_IN = "No customer written. It's exported as VARIOUS-CUST, the walk-in customer.";

export function PartySheet({
  visible,
  scan,
  sale,
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
  const [picking, setPicking] = useState(false);
  const party = sale.party;
  const written = party.written;

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
  const chooseAnother = (label: string) => <Button variant="text" label={label} onPress={() => setPicking(true)} />;
  // a sample's made-up names never reach the lists: the note in place of the button
  const addButton = (label: string) =>
    canAdd ? (
      <Button variant="text" label={label} onPress={add} />
    ) : (
      <Text style={[type.body, styles.note]}>{SAMPLE_NAMES}</Text>
    );

  let inList = true; // which strip: In your customers, or Not in your customers
  let notes: string[];
  let buttons: ReactNode;
  if (party.status === 'auto' || party.status === 'chosen') {
    notes = [party.status === 'auto' ? 'Matched by its TIN and name.' : 'You chose this customer.'];
    buttons = chooseAnother('Choose another');
  } else if (party.status === 'unsure') {
    const closest = party.listParty;
    notes = ['Closest match.'];
    buttons = (
      <>
        <Button
          variant="text"
          label="That's the one"
          onPress={() => {
            if (closest) choose(closest);
          }}
        />
        {chooseAnother('Choose another')}
        {addButton(`Add “${written}” as a new customer`)}
      </>
    );
  } else if (party.status === 'new' || party.status === 'unlisted') {
    inList = false;
    notes = ['It goes out as written.', ...(party.status === 'unlisted' ? [canAdd ? EMPTY_LIST_ADD : EMPTY_LIST] : [])];
    buttons = (
      <>
        {addButton(`Add “${written}” to your customers`)}
        {party.status === 'new' ? chooseAnother('Choose from your customers') : null}
      </>
    );
  } else {
    notes = [WALK_IN]; // blank: nothing written (a purchase's statuses never open this sheet)
    buttons = chooseAnother('Choose from your customers');
  }

  const tin = party.listParty?.tin;
  const fields = formFields(scan.result.form!);
  return (
    <BoxSheet
      visible={visible}
      title="Customer"
      scan={scan}
      boxes={fields.filter((f) => CUSTOMER_BOXES.includes(f))}
      onClose={onClose}
      returnFocus={returnFocus}>
      {picking ? (
        <>
          <SectionHeader title="In your customers" />
          <PartyPicker parties={customersOf(theLists)} label="Search your customers" onPick={choose} />
        </>
      ) : (
        <>
          <SectionHeader title={inList ? 'In your customers' : 'Not in your customers'} />
          {inList ? (
            <ListRow title={party.shown} sub={tin ? `TIN ${tin}` : null} subMono />
          ) : (
            <ListRow title={written} badge={NEW} />
          )}
          <View style={styles.below}>
            {notes.map((note) => (
              <Text key={note} style={[type.body, styles.note]}>
                {note}
              </Text>
            ))}
            {buttons}
          </View>
        </>
      )}
    </BoxSheet>
  );
}

const styles = StyleSheet.create({
  // under the full-bleed rows, on the gutter; the text buttons span it, as today
  below: { paddingHorizontal: space.l, paddingTop: space.m, gap: space.s },
  note: { color: colors.mute },
});
