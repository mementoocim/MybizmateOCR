import type { Href } from 'expo-router';
import { useRef, useState, useSyncExternalStore } from 'react';
import { StyleSheet, Switch, Text, View, type ViewInstance } from 'react-native';

import { ChoiceChips } from '../components/ChoiceChips';
import { Header } from '../components/Header';
import { ListRow } from '../components/ListRow';
import { VAT_STATUS } from '../components/SaveSheet';
import { Screen } from '../components/Screen';
import { SectionHeader } from '../components/SectionHeader';
import { Sheet } from '../components/Sheet';
import { Tap } from '../components/Tap';
import { codeKeyboard, TextField } from '../components/TextField';
import { TEAM_BUILD } from '../lib/build';
import { usePushOnce } from '../lib/navigation';
import { settings, subscribeSettings, updateSettings } from '../lib/settings';
import { colors, space, touch, type } from '../lib/theme';
import { versionLine } from '../lib/versions';

// Design B §9.10: Settings, in groups. Your business: VAT-registered or not, which suggests each sale's tax type.
// Export defaults: what MyBizMate's imports need that isn't on the paper (lib/settings.ts), in figures. A field is
// saved as it's typed: going back while a field still has the cursor doesn't blur it (React Native calls no onBlur on
// unmount), so saving when it's left would lose the change. An ATC that isn't 2 letters and 3 digits gets a warning in
// place of its helper, and is saved all the same. The fields scroll into view above the keyboard through the Screen.
// About: Privacy, in plain words in a sheet; the open-source licenses; the version. In team builds, Team tools (§9.11).

const NOTE =
  "These fill in what MyBizMate's import needs that isn't on the paper. You can change them on each invoice when you save it. Changes save as you type.";
const ACCOUNT_HELPER = 'Code or name, as in MyBizMate';
/** An ATC as MyBizMate takes it: 2 letters, then 3 digits (WC158). */
const ATC_SHAPE = /^[A-Z]{2}\d{3}$/;
const PRIVACY = [
  'Scans are read and kept on this phone.',
  'Nothing is sent anywhere.',
  "There's no cloud backup.",
  'Uninstalling the app removes everything it kept.',
];
const ANNOTATION_NOTE = 'Every box must be checked before a scan saves, and each scan gets a client and writer code.';

export default function SettingsScreen() {
  const push = usePushOnce(); // one for the screen's every row, the team tools' too
  const s = useSyncExternalStore(subscribeSettings, settings);
  const [revenue, setRevenue] = useState(s.revenueAccount);
  const [expense, setExpense] = useState(s.expenseAccount);
  const [atc, setAtc] = useState(s.atc);
  const [offset, setOffset] = useState(s.offsetAccount);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const privacyRow = useRef<ViewInstance>(null); // TalkBack focus goes back to it once the sheet has gone
  const keptAtc = atc.trim(); // checked as it's kept, without the spaces at its ends
  const atcWarning = keptAtc === '' || ATC_SHAPE.test(keptAtc) ? null : 'Like WC158: 2 letters, 3 digits';

  return (
    <View style={styles.root}>
      <Screen header={<Header title="Settings" />}>
        <SectionHeader title="Your business" />
        <View style={styles.group}>
          <ChoiceChips
            label="Your business is"
            options={VAT_STATUS}
            value={s.vatRegistered === null ? null : s.vatRegistered ? 'yes' : 'no'}
            onChange={(v) => void updateSettings({ vatRegistered: v === 'yes' })}
            helper="Suggests each sale's tax type"
          />
        </View>

        <SectionHeader title="Export defaults" />
        <View style={styles.group}>
          <TextField
            label="Revenue account for sales"
            helper={ACCOUNT_HELPER}
            mono
            value={revenue}
            onChangeText={(t) => {
              setRevenue(t);
              void updateSettings({ revenueAccount: t.trim() });
            }}
          />
          <TextField
            label="Expense account for purchases"
            mono
            value={expense}
            onChangeText={(t) => {
              setExpense(t);
              void updateSettings({ expenseAccount: t.trim() });
            }}
          />
          <TextField
            label="Withholding tax ATC"
            placeholder="e.g. WC158"
            helper="Used when an invoice shows tax withheld"
            warning={atcWarning}
            mono
            {...codeKeyboard()} // a code (the plan's call 15): capitals, and a number row, no suggestions
            value={atc}
            onChangeText={(t) => {
              setAtc(t.toUpperCase());
              void updateSettings({ atc: t.toUpperCase().trim() });
            }}
          />
          <TextField
            label="Offset account for 2307s"
            mono
            value={offset}
            onChangeText={(t) => {
              setOffset(t);
              void updateSettings({ offsetAccount: t.trim() });
            }}
          />
        </View>
        <Text style={[type.label, styles.note]}>{NOTE}</Text>

        <SectionHeader title="About" />
        <ListRow ref={privacyRow} title="Privacy" chevron onPress={() => setPrivacyOpen(true)} />
        <ListRow title="Open-source licenses" chevron onPress={() => push('/licenses')} />
        <ListRow title="Version" amount={versionLine()} />

        {TEAM_BUILD && <TeamTools annotation={s.annotation} push={push} />}
      </Screen>

      <Sheet visible={privacyOpen} title="Privacy" onClose={() => setPrivacyOpen(false)} returnFocus={privacyRow}>
        <View style={styles.privacy}>
          {PRIVACY.map((line) => (
            <Text key={line} style={[type.body, styles.ink]}>
              {line}
            </Text>
          ))}
        </View>
      </Sheet>
    </View>
  );
}

/**
 * Team builds only (§9.11): annotation mode, behaving as milestone 4 had it, then the team's own two screens. The
 * switch is one row, and one stop for TalkBack: a tap anywhere on it toggles the setting. The Switch in it shows the
 * state, and a tap on the Switch itself toggles the same setting; TalkBack skips it, so the row isn't read twice.
 */
function TeamTools({ annotation, push }: { annotation: boolean; push: (href: Href) => void }) {
  return (
    <>
      <SectionHeader title="Team tools" />
      <Tap
        accessibilityRole="switch"
        accessibilityLabel="Annotation mode"
        accessibilityState={{ checked: annotation }}
        onPress={() => void updateSettings({ annotation: !settings().annotation })}
        focusRing="inside" // a full-bleed row, as ListRow's (ruling T4-1)
        focusRadius={0}
        style={styles.switchRow}>
        <Text style={[type.value, styles.switchLabel]}>Annotation mode</Text>
        <Switch
          testID="annotation-switch"
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
          value={annotation}
          onValueChange={(on) => void updateSettings({ annotation: on })}
          trackColor={{ false: colors.outline, true: colors.brand }}
          thumbColor={colors.panel}
        />
      </Tap>
      <Text style={[type.label, styles.note]}>{ANNOTATION_NOTE}</Text>
      <ListRow title="Training data" chevron onPress={() => push('/training')} />
      <ListRow title="Speed test" chevron onPress={() => push('/speed')} />
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  // the chips, or the fields, on the gutter in a white band with a hairline under it, as the rows below sit (§9.10's
  // mockup); the inputs have no margins of their own
  group: {
    gap: space.l,
    paddingVertical: space.m,
    paddingHorizontal: space.l,
    backgroundColor: colors.panel,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  // a group's note, on the paper under it
  note: { color: colors.mute, paddingTop: space.s, paddingBottom: space.l, paddingHorizontal: space.l },
  // as a ListRow: a white row on a hairline, at least 48 dp tall
  switchRow: {
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
  switchLabel: { flex: 1, color: colors.ink },
  privacy: { gap: space.m },
  ink: { color: colors.ink },
});
