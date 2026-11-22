import { Pressable, StyleSheet, Text } from 'react-native';

import type { Terms } from '../lib/checks/finalize';
import { FORMS } from '../lib/forms';
import { type StoredScan, updateScan } from '../lib/scans';
import { bold, colors } from '../lib/theme';
import { TextButton } from './Buttons';
import { CircleCheck } from './icons';
import { Sheet } from './Sheet';

/** The terms: what the ticks on the paper show, and the person's pick when they are unclear or wrong. */
export function TermsSheet({ visible, scan, onClose }: { visible: boolean; scan: StoredScan; onClose: () => void }) {
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
    <Sheet visible={visible} title="Terms" subtitle={subtitle} onClose={onClose}>
      {(['cash', 'account'] as const).map((t) => (
        <Pressable
          key={t}
          accessibilityRole="button"
          accessibilityState={{ selected: current === t }}
          onPress={() => choose(t)}
          style={({ pressed }) => [styles.option, pressed && styles.pressed]}>
          <Text style={[styles.optionText, current === t && styles.chosen]}>{t === 'cash' ? form.cash : form.account}</Text>
          {current === t && <CircleCheck size={20} color={colors.coralText} />}
        </Pressable>
      ))}
      {scan.terms !== null && <TextButton label="Use the tick on the paper" onPress={() => choose(null)} />}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  pressed: { opacity: 0.6 },
  optionText: { fontSize: 16, color: colors.ink },
  chosen: { ...bold, color: colors.coralText },
});
