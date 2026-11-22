import { type Href, useRouter } from 'expo-router';
import { useState, useSyncExternalStore } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { Chips } from '../components/Chips';
import { ChevronRight } from '../components/icons';
import { VAT_STATUS } from '../components/SaveSheet';
import { TextField } from '../components/TextField';
import { TEAM_BUILD } from '../lib/build';
import { settings, subscribeSettings, updateSettings } from '../lib/settings';
import { colors, sectionLabel } from '../lib/theme';

const TEAM_SCREENS: { label: string; to: Href }[] = [
  { label: 'Training data', to: '/training' },
  { label: 'Speed test', to: '/speed' },
];

// Settings: the export defaults the phone keeps (lib/settings.ts), and in team builds the team's own tools. A text
// field is saved as it's typed: going back while a field still has the cursor doesn't blur it (React Native calls no
// onBlur on unmount), so saving when it's left would lose the change.
export default function SettingsScreen() {
  const router = useRouter();
  const s = useSyncExternalStore(subscribeSettings, settings);
  const [revenue, setRevenue] = useState(s.revenueAccount);
  const [expense, setExpense] = useState(s.expenseAccount);
  const [atc, setAtc] = useState(s.atc);
  const [offset, setOffset] = useState(s.offsetAccount);
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
      <TextField
        label="Offset account for 2307s"
        placeholder="Code or name, as in MyBizMate"
        value={offset}
        onChangeText={(t) => {
          setOffset(t);
          void updateSettings({ offsetAccount: t.trim() });
        }}
      />
      <Text style={styles.note}>
        {"These fill in what MyBizMate's import needs that isn't on the paper. You can change them on each invoice when you save it."}
      </Text>

      {TEAM_BUILD && (
        <>
          <Text style={[sectionLabel, styles.section]}>TEAM TOOLS</Text>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Annotation mode</Text>
            <Switch
              accessibilityLabel="Annotation mode"
              value={s.annotation}
              onValueChange={(on) => void updateSettings({ annotation: on })}
              trackColor={{ false: colors.line, true: colors.coral }}
              thumbColor={colors.panel}
            />
          </View>
          <Text style={styles.switchNote}>
            Every box must be checked before a scan saves, and each scan gets a client and writer code.
          </Text>
          <View style={styles.list}>
            {TEAM_SCREENS.map((item, i) => (
              <Pressable
                key={item.label}
                accessibilityRole="button"
                onPress={() => router.push(item.to)}
                style={({ pressed }) => [styles.row, i > 0 && styles.divided, pressed && styles.pressed]}>
                <Text style={styles.rowLabel}>{item.label}</Text>
                <ChevronRight size={20} color={colors.mute} />
              </Pressable>
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 16, paddingBottom: 32 },
  note: { fontSize: 13, color: colors.mute, marginTop: 20, lineHeight: 18 },
  section: { marginTop: 28 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16 },
  switchLabel: { flex: 1, fontSize: 15, color: colors.ink },
  switchNote: { fontSize: 13, color: colors.mute, marginTop: 4, lineHeight: 18 },
  list: {
    marginTop: 16,
    backgroundColor: colors.panel,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 16,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 14 },
  divided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  pressed: { opacity: 0.6 },
  rowLabel: { flex: 1, fontSize: 15, color: colors.ink },
});
