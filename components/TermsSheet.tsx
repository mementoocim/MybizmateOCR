import type { RefObject } from 'react';
import { StyleSheet, Text, View, type ViewInstance } from 'react-native';

import type { Terms } from '../lib/checks/finalize';
import { FORMS } from '../lib/forms';
import { type StoredScan, updateScan } from '../lib/scans';
import { colors, space, touch, type } from '../lib/theme';
import { Button } from './Buttons';
import { Check } from './icons';
import { Sheet } from './Sheet';
import { Tap } from './Tap';

// Design B §9.5: the terms. What the ticks on the paper show, then the choices as 48 dp radio rows in the form's own
// words (Cash or On account; a Service Invoice's Cash sales or Charge sales), the chosen one with a check in ink
// (selection is ink), and once the person has picked, a way back to the tick on the paper. A pick closes the sheet.
// TalkBack hears a radio group named Terms, as Segmented and ChoiceChips are (ruling T14-2), then each row as a radio
// button, checked or not. The rows are full-bleed, as list rows are, so the sheet has no gutter.

/** The terms: what the ticks on the paper show, and the person's pick when they are unclear or wrong. */
export function TermsSheet({
  visible,
  scan,
  onClose,
  returnFocus,
}: {
  visible: boolean;
  scan: StoredScan;
  onClose: () => void;
  returnFocus?: RefObject<ViewInstance | null>; // the row that opened it
}) {
  const form = FORMS[scan.result.form!];
  const paper = scan.result.terms;
  const subtitle =
    paper === 'cash'
      ? `On the paper: ${form.cash} is ticked.`
      : paper === 'account'
        ? `On the paper: ${form.account} is ticked.`
        : 'On the paper, neither box is clearly ticked.';
  const current = scan.terms ?? paper;
  const choose = (terms: Terms | null) => {
    updateScan(scan.id, { terms });
    onClose();
  };
  return (
    <Sheet
      visible={visible}
      title="Terms"
      subtitle={subtitle}
      onClose={onClose}
      returnFocus={returnFocus}
      gutter={false}>
      <View accessible accessibilityRole="radiogroup" accessibilityLabel="Terms">
        {(['cash', 'account'] as const).map((t) => {
          const words = t === 'cash' ? form.cash : form.account;
          const checked = current === t;
          return (
            <Tap
              key={t}
              accessibilityRole="radio"
              accessibilityLabel={words}
              accessibilityState={{ checked }}
              onPress={() => choose(t)}
              focusRing="inside" // rows stack edge to edge (ruling T4-1)
              focusRadius={0}
              style={styles.choice}>
              <Text style={[type.body, styles.words]}>{words}</Text>
              {checked ? <Check size={touch.iconSmall} color={colors.ink} /> : null}
            </Tap>
          );
        })}
      </View>
      {scan.terms !== null ? (
        <View style={styles.paper}>
          <Button variant="text" label="Use the tick on the paper" onPress={() => choose(null)} />
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  // a row of a list: white on a hairline, padded as rows are
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    minHeight: touch.target,
    paddingVertical: space.m,
    paddingHorizontal: space.l,
    backgroundColor: colors.panel,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  words: { flex: 1, color: colors.ink },
  paper: { paddingHorizontal: space.l, paddingTop: space.m },
});
