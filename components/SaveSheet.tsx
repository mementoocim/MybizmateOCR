import { useState, useSyncExternalStore } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { type CertView, periodName, taxWithheld } from '../lib/cert';
import type { Terms } from '../lib/checks/finalize';
import { peso, prettyDate } from '../lib/format';
import type { SaleView } from '../lib/sale';
import { saveScan } from '../lib/saved';
import type { StoredScan } from '../lib/scans';
import { annotationOn, settings, subscribeSettings, type TaxType, updateSettings } from '../lib/settings';
import { bold, colors } from '../lib/theme';
import { toast } from '../lib/toast';
import { cleanTag } from '../lib/training/codes';
import { PrimaryButton, TextButton } from './Buttons';
import { ChoiceChips } from './ChoiceChips';
import { Sheet } from './Sheet';
import { TextField } from './TextField';

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
const TERMS = [
  { value: 'cash', label: 'Cash' },
  { value: 'account', label: 'On Account' },
] as const;
const NOT_LISTED: Record<string, string> = {
  new: ' (not in your list)',
  unlisted: ' (not in your list)',
  typed: ' (not in your list)',
  unsure: ' (match not confirmed)',
};

/**
 * Saving a scan as a sale or a purchase: what the import row will hold, and what MyBizMate's import needs that isn't
 * on the paper (the tax type, the account, the terms when the ticks are unclear, the withholding tax's ATC code).
 */
export function SaveSheet({
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
  const s = useSyncExternalStore(subscribeSettings, settings);
  const isSale = scan.kind === 'sale';
  const saved = scan.saved?.details;
  const before = saved && 'taxType' in saved ? saved : undefined; // as it was saved
  const [chosenType, setChosenType] = useState<TaxType | null>(before?.taxType ?? null);
  const [account, setAccount] = useState(before?.account ?? (isSale ? s.revenueAccount : s.expenseAccount));
  const [terms, setTerms] = useState<Terms | null>(before?.terms ?? sale.terms ?? (sale.party.listParty?.terms || null));
  const [atc, setAtc] = useState(before?.atc ?? s.atc);
  const codes = useCodes(scan);
  const [saving, setSaving] = useState(false);
  const taxType = chosenType ?? sale.taxType; // the suggestion follows the VAT answer until the person picks one
  const askVat = isSale && s.vatRegistered === null;
  const ready = account.trim() !== '' && terms !== null && !askVat && codes.ready && !saving;
  const problems = sale.problems.length;

  async function save() {
    if (!ready || terms === null) return;
    setSaving(true);
    try {
      const details = {
        taxType,
        account: account.trim(),
        terms,
        atc: sale.withholding !== null ? atc.trim().toUpperCase() : '',
      };
      await saveScan(scan.id, details, codes.tag);
      onClose();
      toast('Saved. Export it from Saved invoices.');
    } catch {
      setSaving(false);
      toast("Couldn't save the invoice.");
    }
  }

  return (
    <Sheet
      visible={visible}
      title={isSale ? 'Save as a sale' : 'Save as a purchase'}
      subtitle={`It becomes a row in MyBizMate's ${isSale ? 'Sales' : 'Purchases'} import. Export it from Saved invoices.`}
      onClose={onClose}>
      <View style={styles.summary}>
        <Line label="Date" value={prettyDate(sale.final.date) ?? '—'} />
        <Line label={isSale ? 'Customer' : 'Supplier'} value={sale.party.shown + (NOT_LISTED[sale.party.status] ?? '')} />
        <Line label="Gross (VAT included)" value={peso(sale.gross)} />
        {sale.discount !== null && <Line label="Discount" value={peso(sale.discount)} />}
      </View>
      {askVat && (
        <ChoiceChips
          label="Your business is"
          options={VAT_STATUS}
          value={null}
          onChange={(v) => void updateSettings({ vatRegistered: v === 'yes' })}
        />
      )}
      <ChoiceChips label="Tax type" options={TAX_TYPES} value={taxType} onChange={setChosenType} />
      <TextField
        label={isSale ? 'Revenue account' : 'Expense account'}
        placeholder="Code or name, as in MyBizMate"
        value={account}
        onChangeText={setAccount}
      />
      <ChoiceChips label="Terms" options={TERMS} value={terms} onChange={setTerms} />
      {sale.withholding !== null && (
        <>
          <TextField
            label="Withholding tax ATC"
            placeholder="e.g. WC158"
            value={atc}
            onChangeText={(t) => setAtc(t.toUpperCase())}
            autoCapitalize="characters"
          />
          <Text style={styles.note}>
            {`The invoice shows ${peso(sale.withholding)} withheld. MyBizMate works out the tax from the ATC code.`}
          </Text>
        </>
      )}
      <CodeFields codes={codes} />
      <StillToCheck problems={problems} />
      <View style={styles.buttons}>
        <PrimaryButton
          testID="save-confirm"
          label={isSale ? 'Save sale' : 'Save purchase'}
          disabled={!ready}
          onPress={() => void save()}
        />
        <TextButton label="Cancel" onPress={onClose} />
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
}: {
  visible: boolean;
  scan: StoredScan;
  view: CertView;
  onClose: () => void;
}) {
  const s = useSyncExternalStore(subscribeSettings, settings);
  const [account, setAccount] = useState(scan.saved?.details.account ?? s.offsetAccount);
  const codes = useCodes(scan);
  const [saving, setSaving] = useState(false);
  const ready = account.trim() !== '' && codes.ready && !saving;
  const { cert, payor, problems } = view;

  async function save() {
    if (!ready) return;
    setSaving(true);
    try {
      await saveScan(scan.id, { account: account.trim() }, codes.tag);
      onClose();
      toast('Saved. Export it from Saved invoices.');
    } catch {
      setSaving(false);
      toast("Couldn't save the 2307.");
    }
  }

  return (
    <Sheet
      visible={visible}
      title="Save 2307"
      subtitle="Each payment becomes a row in MyBizMate's 2307-CWT import. Export it from Saved invoices."
      onClose={onClose}>
      <View style={styles.summary}>
        <Line label="Payor" value={payor.shown + (NOT_LISTED[payor.status] ?? '')} />
        <Line label="Period" value={periodName(cert)} />
        <Line label="Tax withheld" value={peso(taxWithheld(cert))} />
      </View>
      <TextField
        label="Offset account"
        placeholder="Code or name, as in MyBizMate"
        value={account}
        onChangeText={setAccount}
      />
      <CodeFields codes={codes} />
      <StillToCheck problems={problems.length} />
      <View style={styles.buttons}>
        <PrimaryButton testID="save-confirm" label="Save 2307" disabled={!ready} onPress={() => void save()} />
        <TextButton label="Cancel" onPress={onClose} />
      </View>
    </Sheet>
  );
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

/** The source tag's two codes, in annotation mode. */
function CodeFields({ codes }: { codes: ReturnType<typeof useCodes> }) {
  if (!codes.asked) return null;
  return (
    <>
      <TextField
        label="Client code"
        value={codes.client}
        onChangeText={(t) => codes.setClient(t.toUpperCase())}
        autoCapitalize="characters"
      />
      <TextField
        label="Writer code"
        value={codes.writer}
        onChangeText={(t) => codes.setWriter(t.toUpperCase())}
        autoCapitalize="characters"
      />
      <Text style={styles.note}>Codes only, like C014 and W03. Never a name.</Text>
      <Text style={styles.note}>Start with a letter. Use letters, digits and -, with 1 to 6 digits.</Text>
    </>
  );
}

/** The things still marked to check: saving doesn't wait for them. */
function StillToCheck({ problems }: { problems: number }) {
  if (problems === 0) return null;
  return (
    <Text style={styles.warning}>
      {problems === 1
        ? '1 thing is still marked to check. You can save anyway.'
        : `${problems} things are still marked to check. You can save anyway.`}
    </Text>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.line}>
      <Text style={styles.lineLabel}>{label}</Text>
      <Text style={styles.lineValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  summary: { marginTop: 8, borderRadius: 12, backgroundColor: colors.paper, padding: 12, gap: 6 },
  line: { flexDirection: 'row', gap: 8 },
  lineLabel: { width: 150, fontSize: 14, color: colors.mute },
  lineValue: { ...bold, flex: 1, fontSize: 14, color: colors.ink },
  note: { fontSize: 13, color: colors.mute, marginTop: 8, lineHeight: 18 },
  warning: { fontSize: 14, color: colors.ember, marginTop: 16 },
  buttons: { marginTop: 20, gap: 4 },
});
