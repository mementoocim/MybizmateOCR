import { useState, useSyncExternalStore } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { Chips } from '../components/Chips';
import { VAT_STATUS } from '../components/SaveSheet';
import { TextField } from '../components/TextField';
import { settings, subscribeSettings, updateSettings } from '../lib/settings';
import { colors, sectionLabel } from '../lib/theme';

// Settings: the export defaults the phone keeps (lib/settings.ts). A text field is saved as it's typed: going back
// while a field still has the cursor doesn't blur it (React Native calls no onBlur on unmount), so saving when it's
// left would lose the change.
export default function SettingsScreen() {
  const s = useSyncExternalStore(subscribeSettings, settings);
  const [revenue, setRevenue] = useState(s.revenueAccount);
  const [expense, setExpense] = useState(s.expenseAccount);
  const [atc, setAtc] = useState(s.atc);
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={sectionLabel}>EXPORTS TO MYBIZMATE</Text>
      <Chips
        label="Your business is"
        options={VAT_STATUS}
        value={s.vatRegistered === null ? null : s.vatRegistered ? 'yes' : 'no'}
        onChange={(v) => void updateSettings({ vatRegistered: v === 'yes' })}
      />
      <TextField
        label="Revenue account for sales"
        placeholder="Code or name, as in MyBizMate"
        value={revenue}
        onChangeText={(t) => {
          setRevenue(t);
          void updateSettings({ revenueAccount: t.trim() });
        }}
      />
      <TextField
        label="Expense account for purchases"
        placeholder="Code or name, as in MyBizMate"
        value={expense}
        onChangeText={(t) => {
          setExpense(t);
          void updateSettings({ expenseAccount: t.trim() });
        }}
      />
      <TextField
        label="Withholding tax ATC"
        placeholder="e.g. WC158"
        value={atc}
        onChangeText={(t) => {
          setAtc(t.toUpperCase());
          void updateSettings({ atc: t.toUpperCase().trim() });
        }}
        autoCapitalize="characters"
      />
      <Text style={styles.note}>
        {"These fill in what MyBizMate's import needs that isn't on the paper. You can change them on each invoice when you save it."}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 16, paddingBottom: 32 },
  note: { fontSize: 13, color: colors.mute, marginTop: 20, lineHeight: 18 },
});
