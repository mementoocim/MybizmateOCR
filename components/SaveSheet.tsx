import { type RefObject, useState, useSyncExternalStore } from 'react';
import { StyleSheet, Text, View, type ViewInstance } from 'react-native';

import { type CertView, type PayorStatus, periodName, taxWithheld } from '../lib/cert';
import type { Terms } from '../lib/checks/finalize';
import { peso, prettyDate } from '../lib/format';
import { usePushOnce } from '../lib/navigation';
import { type PartyStatus, type SaleView, taxTypeFromBoxes } from '../lib/sale';
import { saveScan } from '../lib/saved';
import type { Kind, SaveDetails, SourceTag, StoredScan } from '../lib/scans';
import { annotationOn, settings, subscribeSettings, type TaxType, updateSettings } from '../lib/settings';
import { colors, space, type } from '../lib/theme';
import { toast } from '../lib/toast';
import { cleanTag } from '../lib/training/codes';
import type { BadgeSpec } from './Badge';
import { Banner } from './Banner';
import { ChoiceChips } from './ChoiceChips';
import { Sheet } from './Sheet';
import { SummaryBox, type SummaryLine } from './SummaryBox';
import { codeKeyboard, TextField } from './TextField';

// Design B §9.6, and §9.11 for annotation mode: the save sheets. A summary box of what the import row (a 2307's rows)
// will hold: the date, the party and the gross, or the payor, the period and the tax withheld. The party has a New
// badge when it goes out as written, not in the list; an unsure match says so, as today. Then today's fields, restyled:
// whether the business is VAT-registered (asked once), the tax type (its helper shows while it's the VAT boxes'
// suggestion, never for a sale that's Non-VAT because the business isn't VAT-registered: ruling T15-1), the account in
// figures, the terms, the withholding tax's ATC (a code: call 15's keyboard); a 2307's offset account. In annotation
// mode (team builds; milestone 4's behaviour), the scan's source tag, with M4's two notes. A warning banner counts
// what's still marked to check, which saving doesn't wait for. Cancel and the save are the sheet's pinned actions
// (ruling T7-4). The save's press returns its promise, so the button loads while the save runs and a double tap saves
// once (Review Focus 3). After a save, the sheet closes, and a snackbar says so, with View, which opens Saved for the
// kind. A save that fails keeps the sheet open, and says so in it, above the scrim (Review Focus 1).

export const TAX_TYPES = [
  { value: 'VAT', label: 'VAT' },
  { value: 'NONVAT', label: 'Non-VAT' },
  { value: 'ZERO', label: 'Zero-rated' },
  { value: 'EXEMPT', label: 'VAT-exempt' },
  { value: 'NA', label: 'Not applicable' },
] as const;
export const VAT_STATUS = [
  { value: 'yes', label: 'VAT-registered' },
  { value: 'no', label: 'Not VAT-registered' },
] as const;
/** The terms in the design's words (§6): only the label changes, and the export still writes "On Account". */
const TERMS = [
  { value: 'cash', label: 'Cash' },
  { value: 'account', label: 'On account' },
] as const;
const SUGGESTED = "Suggested from the invoice's VAT boxes";
const ACCOUNT_HELPER = 'Code or name, as in MyBizMate';
/** Milestone 4's two notes on the source tag's codes. */
const CODE_NOTES = [
  'Codes only, like C014 and W03. Never a name.',
  'Start with a letter. Use letters, digits and -, with 1 to 6 digits.',
] as const;
const NEW: BadgeSpec = { label: 'New', tone: 'brand' };
/** A party that goes out as written, not in the list: the customer or payor as read, or the supplier as typed. */
const AS_WRITTEN = new Set<PartyStatus | PayorStatus>(['new', 'unlisted', 'typed']);

/**
 * Saving a scan as a sale or a purchase: what the import row will hold, and what MyBizMate's import needs that isn't
 * on the paper (the tax type, the account, the terms when the ticks are unclear, the withholding tax's ATC code).
 */
export function SaveSheet({
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
  returnFocus?: RefObject<ViewInstance | null>; // Save, which opened it
}) {
  const s = useSyncExternalStore(subscribeSettings, settings);
  const isSale = scan.kind === 'sale';
  const saved = scan.saved?.details;
  const before = saved && 'taxType' in saved ? saved : undefined; // as it was saved
  const [chosenType, setChosenType] = useState<TaxType | null>(before?.taxType ?? null);
  const [account, setAccount] = useState(before?.account ?? (isSale ? s.revenueAccount : s.expenseAccount));
  const [terms, setTerms] = useState<Terms | null>(before?.terms ?? sale.terms ?? (sale.party.listParty?.terms || null));
  const [atc, setAtc] = useState(before?.atc ?? s.atc);
  const codes = useCodes(scan);
  const run = useSave(scan, isSale ? 'sale' : 'purchase', "Couldn't save the invoice.", onClose);
  const taxType = chosenType ?? sale.taxType; // the suggestion follows the VAT answer until the person picks one
  const askVat = isSale && s.vatRegistered === null;
  const ready = account.trim() !== '' && terms !== null && !askVat && codes.ready;

  async function save() {
    if (!ready || terms === null) return;
    const atcCode = sale.withholding !== null ? atc.trim().toUpperCase() : '';
    await run({ taxType, account: account.trim(), terms, atc: atcCode }, codes.tag);
  }

  return (
    <Sheet
      visible={visible}
      title={isSale ? 'Save as a sale' : 'Save as a purchase'}
      subtitle={`It becomes a row in MyBizMate's ${isSale ? 'Sales' : 'Purchases'} import. Export it from Saved.`}
      onClose={onClose}
      returnFocus={returnFocus}
      actions={[
        { label: 'Cancel', variant: 'text', onPress: onClose },
        { label: isSale ? 'Save sale' : 'Save purchase', testID: 'save-confirm', disabled: !ready, onPress: save },
      ]}>
      <View style={styles.body}>
        <SummaryBox
          lines={[
            { key: 'Date', value: prettyDate(sale.final.date) ?? '—', mono: true },
            partyLine(isSale ? 'Customer' : 'Supplier', sale.party),
            { key: 'Gross (VAT included)', value: peso(sale.gross), mono: true },
            ...(sale.discount !== null ? [{ key: 'Discount', value: peso(sale.discount), mono: true }] : []),
          ]}
        />
        {askVat ? (
          <ChoiceChips
            label="Your business is"
            options={VAT_STATUS}
            value={null}
            onChange={(v) => void updateSettings({ vatRegistered: v === 'yes' })}
          />
        ) : null}
        <ChoiceChips
          label="Tax type"
          options={TAX_TYPES}
          value={taxType}
          onChange={setChosenType}
          // only while it's the boxes' suggestion: a non-VAT-registered business's sale is Non-VAT by that (T15-1)
          helper={chosenType === null && taxTypeFromBoxes(scan.kind, s.vatRegistered) ? SUGGESTED : null}
        />
        <TextField
          label={isSale ? 'Revenue account' : 'Expense account'}
          value={account}
          onChangeText={setAccount}
          helper={ACCOUNT_HELPER}
          mono
        />
        <ChoiceChips label="Terms" options={TERMS} value={terms} onChange={setTerms} />
        {sale.withholding !== null ? (
          <TextField
            label="Withholding tax ATC"
            placeholder="e.g. WC158"
            value={atc}
            onChangeText={(t) => setAtc(t.toUpperCase())}
            helper={`The invoice shows ${peso(sale.withholding)} withheld. MyBizMate works out the tax from the ATC code.`}
            mono
            {...codeKeyboard()} // a code, as Settings' ATC: capitals, with a number row (call 15)
          />
        ) : null}
        <CodeFields codes={codes} />
        <StillToCheck problems={sale.problems.length} />
      </View>
    </Sheet>
  );
}

/**
 * Saving a 2307: what its rows in MyBizMate's 2307-CWT import will hold, and the offset account the import needs that
 * isn't on the paper (asked at the first save, then kept in Settings).
 */
export function CertSaveSheet({
  visible,
  scan,
  view,
  onClose,
  returnFocus,
}: {
  visible: boolean;
  scan: StoredScan;
  view: CertView;
  onClose: () => void;
  returnFocus?: RefObject<ViewInstance | null>; // Save, which opened it
}) {
  const s = useSyncExternalStore(subscribeSettings, settings);
  const [account, setAccount] = useState(scan.saved?.details.account ?? s.offsetAccount);
  const codes = useCodes(scan);
  const run = useSave(scan, '2307', "Couldn't save the 2307.", onClose);
  const ready = account.trim() !== '' && codes.ready;
  const { cert, payor, problems } = view;

  async function save() {
    if (!ready) return;
    await run({ account: account.trim() }, codes.tag);
  }

  return (
    <Sheet
      visible={visible}
      title="Save 2307"
      subtitle="Each payment becomes a row in MyBizMate's 2307-CWT import. Export it from Saved."
      onClose={onClose}
      returnFocus={returnFocus}
      actions={[
        { label: 'Cancel', variant: 'text', onPress: onClose },
        { label: 'Save 2307', testID: 'save-confirm', disabled: !ready, onPress: save },
      ]}>
      <View style={styles.body}>
        <SummaryBox
          lines={[
            partyLine('Payor', payor),
            { key: 'Period', value: periodName(cert), mono: true },
            { key: 'Tax withheld', value: peso(taxWithheld(cert)), mono: true },
          ]}
        />
        <TextField label="Offset account" value={account} onChangeText={setAccount} helper={ACCOUNT_HELPER} mono />
        <CodeFields codes={codes} />
        <StillToCheck problems={problems.length} />
      </View>
    </Sheet>
  );
}

/**
 * The save itself: the scan is saved (again) with what the sheet asks. Then the sheet closes, and a snackbar says so,
 * "Saved as a sale" (or a purchase, or a 2307; "Changes saved" for a re-save), with View, which opens Saved for the
 * kind. A save that fails keeps the sheet open, and says so in it. Its promise settles when it's done.
 */
function useSave(scan: StoredScan, kind: Kind, failed: string, onClose: () => void) {
  const push = usePushOnce();
  return async (details: SaveDetails, tag: SourceTag | null): Promise<void> => {
    const wasSaved = scan.saved !== null; // as the scan was before this save
    try {
      await saveScan(scan.id, details, tag);
    } catch {
      toast(failed);
      return;
    }
    onClose();
    toast(wasSaved ? 'Changes saved' : `Saved as a ${kind}`, {
      label: 'View',
      onPress: () => push({ pathname: '/saved', params: { kind } }),
    });
  };
}

/** The party's line in the summary: New when it goes out as written; an unsure match says it isn't confirmed. */
function partyLine(key: string, party: { status: PartyStatus | PayorStatus; shown: string }): SummaryLine {
  if (party.status === 'unsure') return { key, value: `${party.shown} (match not confirmed)` };
  return { key, value: party.shown, badge: AS_WRITTEN.has(party.status) ? NEW : null };
}

/**
 * In annotation mode, the scan's source tag as the person types it: a scan saved before keeps its own codes, a new one
 * starts from the last annotated save's (Settings). tag: the two codes once both are codes; ready: whether the save can
 * go ahead. Outside annotation mode nothing is asked.
 */
function useCodes(scan: StoredScan) {
  const asked = useSyncExternalStore(subscribeSettings, annotationOn);
  const [client, setClient] = useState(() => scan.tag?.client ?? settings().clientCode);
  const [writer, setWriter] = useState(() => scan.tag?.writer ?? settings().writerCode);
  const tag = asked ? cleanTag({ client, writer }) : null;
  return { asked, client, setClient, writer, setWriter, tag, ready: !asked || tag !== null };
}

/** The source tag's two codes, in annotation mode, with milestone 4's two notes under the Writer code field. */
function CodeFields({ codes }: { codes: ReturnType<typeof useCodes> }) {
  if (!codes.asked) return null;
  return (
    <>
      <TextField
        label="Client code"
        value={codes.client}
        onChangeText={(t) => codes.setClient(t.toUpperCase())}
        mono
        autoCapitalize="characters"
      />
      <View testID="writer-code" style={styles.group}>
        <TextField
          label="Writer code"
          value={codes.writer}
          onChangeText={(t) => codes.setWriter(t.toUpperCase())}
          mono
          autoCapitalize="characters"
        />
        {CODE_NOTES.map((note) => (
          <Text key={note} style={[type.label, styles.mute]}>
            {note}
          </Text>
        ))}
      </View>
    </>
  );
}

/** The things still marked to check, counted as the status strip counts them: saving doesn't wait for them. */
function StillToCheck({ problems }: { problems: number }) {
  if (problems === 0) return null;
  const things = problems === 1 ? '1 thing is' : `${problems} things are`;
  return <Banner tone="warning" text={`${things} still marked to check. You can save anyway.`} />;
}

const styles = StyleSheet.create({
  // the summary and the fields, spaced as the box editor's; the action row is pinned under the scroll
  body: { gap: space.l, paddingBottom: space.l },
  group: { gap: space.s }, // a field and its notes, as close as a field's own note
  mute: { color: colors.mute },
});
