import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState, useSyncExternalStore } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { BoxSheet } from '../components/BoxSheet';
import { OutlinedButton, PrimaryButton, TextButton } from '../components/Buttons';
import { Camera } from '../components/icons';
import { PartySheet } from '../components/PartySheet';
import { ReadingOverlay } from '../components/ReadingOverlay';
import { SaleRow } from '../components/SaleRow';
import { SaveSheet } from '../components/SaveSheet';
import { ScanImage } from '../components/ScanImage';
import { Segmented } from '../components/Segmented';
import { StatusCard } from '../components/StatusCard';
import { SupplierSheet } from '../components/SupplierSheet';
import { TermsSheet } from '../components/TermsSheet';
import { TEAM_BUILD } from '../lib/build';
import { localIsoDate } from '../lib/checks/dates';
import { candidates } from '../lib/checks/num';
import { exportRow, saveBlock, sameRow } from '../lib/exportRows';
import { formatMs, peso, prettyDate, qty } from '../lib/format';
import { FORMS, formFields } from '../lib/forms';
import { addItem, lists, subscribeLists } from '../lib/lists';
import { boxValue, rawFromScan, saleOf, type SaleView } from '../lib/sale';
import { compareWithSample, sampleInfo } from '../lib/samples';
import { savedSummary, subscribeSaved } from '../lib/saved';
import { useScanFlow } from '../lib/scanFlow';
import { getScan, type Kind, type StoredScan, subscribeRecent, updateScan } from '../lib/scans';
import { settings, subscribeSettings } from '../lib/settings';
import { bold, colors, sectionLabel } from '../lib/theme';
import { toast } from '../lib/toast';
import type { ScanResult } from '../modules/scanner';

const CUSTOMER_BOXES = ['customer_name', 'customer_tin', 'customer_address'];
const TOTAL_BOXES = [
  'total_due',
  'total_due_2',
  'total_sales',
  'amount_figure',
  'amount_words',
  'discount',
  'withholding',
  'zero_rated',
  'vat_exempt',
];
const KINDS = [
  { value: 'sale', label: 'A sale' },
  { value: 'purchase', label: 'A purchase' },
] as const;
const KIND_CAPTION: Record<Kind, string> = {
  sale: "You issued it. It becomes a row in MyBizMate's Sales import.",
  purchase: "Another business issued it to you. It becomes a row in MyBizMate's Purchases import.",
};

type OpenSheet =
  | { kind: 'boxes'; title: string; boxes: string[]; row?: number } // row: an item row's sheet
  | { kind: 'terms' }
  | { kind: 'customer' }
  | { kind: 'supplier' }
  | { kind: 'save' };

const BLOCKED: Record<string, string> = {
  no_date: 'Add the date first: tap Date.',
  no_total: 'Add the total first: tap Total due.',
  no_supplier: 'Choose the supplier first: tap Supplier.',
};
const dayOf = (iso: string) => prettyDate(localIsoDate(new Date(iso)));

/**
 * A PDF's own footnote: where its boxes came from (its text, or its rendered page; a picture PDF is read like a photo)
 * and, when it has more pages, that only page 1 was read. null when there's nothing to tell.
 */
function pdfFootnote(r: ScanResult): string | null {
  const text = r.reads.filter((b) => b.fromText).length;
  const boxes = `${text} ${text === 1 ? 'box' : 'boxes'} from its text, ${r.reads.length - text} read from the page`;
  const how = r.picture ? 'The PDF is a picture: read like a photo.' : r.aligned ? `Read from the PDF: ${boxes}.` : null;
  const pages = r.pageCount !== null && r.pageCount > 1 ? `Only page 1 of ${r.pageCount} was read.` : null;
  return [how, pages].filter((s) => s !== null).join(' ') || null;
}

// The result (the test app's ResultActivity): the checks' card, the scan view, the sale with every row opening what
// the camera saw in its boxes (each box fixable, the checks run again at once), the footnote, and Retake.
export default function Result() {
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const flow = useScanFlow();
  const scan = useSyncExternalStore(subscribeRecent, () => (id ? getScan(id) : undefined));
  const theLists = useSyncExternalStore(subscribeLists, lists);
  const theSettings = useSyncExternalStore(subscribeSettings, settings);
  const sale = useMemo(
    () => (scan && scan.result.aligned && scan.result.form ? saleOf(scan, theLists, theSettings) : null),
    [scan, theLists, theSettings],
  );
  const summary = useSyncExternalStore(subscribeSaved, () => (id ? savedSummary(id) : undefined));
  const [sheet, setSheet] = useState<OpenSheet | null>(null);
  if (!scan) {
    return (
      <View style={styles.screen}>
        <Text style={styles.gone}>This scan is no longer here. Go back and read the photo again.</Text>
      </View>
    );
  }
  const r = scan.result;
  const form = r.form ? FORMS[r.form] : null;

  const total = formatMs(r.timing.totalMs);
  const boxes = `${r.reads.length} ${r.reads.length === 1 ? 'box' : 'boxes'}`;
  const footnote = !r.aligned
    ? `Checked on this phone in ${total}. Nothing left the phone.`
    : TEAM_BUILD
      ? `${boxes} read on this phone in ${total} (straighten ${formatMs(r.timing.alignMs)}, read ${formatMs(r.timing.readMs)}). Nothing left the phone.`
      : `${boxes} read on this phone in ${total}. Nothing left the phone.`;
  // r.source is what the scanner read (a photo or a PDF); scan.source is how the scan came in
  const pdfLine = r.source === 'pdf' ? pdfFootnote(r) : null;
  let sampleLine: string | null = null;
  if (scan.sampleId && r.aligned) {
    const { exact, written } = compareWithSample(r.reads, sampleInfo(scan.sampleId));
    sampleLine = `Sample invoice: ${exact} of ${written} boxes read exactly as written.`;
  }
  const isSample = scan.source === 'sample';
  const canSave = r.aligned && !isSample && sale !== null;
  // A saved invoice changed here (a box, sale or purchase, its party) goes out as saved until Save changes.
  const changed =
    summary !== undefined &&
    sale !== null &&
    scan.saved !== null &&
    !sameRow(exportRow(scan, sale, scan.saved.details), summary.row);
  const savedLine = !summary
    ? null
    : changed
      ? 'Changed since it was saved. The export still has the saved version: tap Save changes.'
      : `Saved as a ${summary.kind} on ${dayOf(summary.savedAt)}. ${summary.exportedAt ? `Exported ${dayOf(summary.exportedAt)}.` : 'Not exported yet.'}`;
  const back = from === 'recent' || from === 'saved';

  function openSave() {
    const block = saveBlock(scan!, sale);
    if (block === null) setSheet({ kind: 'save' });
    else if (BLOCKED[block]) toast(BLOCKED[block]);
  }

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerTitle: () => <Title subtitle={form?.title} /> }} />
      <ScrollView contentContainerStyle={styles.content}>
        <StatusCard result={r} problems={sale?.problems ?? null} />
        <ScanImage result={r} />
        {sale && <SaleSections scan={scan} sale={sale} open={setSheet} />}
        <Text style={styles.footnote}>{footnote}</Text>
        {pdfLine && <Text style={styles.footnote}>{pdfLine}</Text>}
        {sampleLine && <Text style={styles.footnote}>{sampleLine}</Text>}
        {isSample && r.aligned && (
          <Text style={styles.footnote}>{"Sample invoices are made up, so they can't be saved."}</Text>
        )}
      </ScrollView>
      <View style={styles.bottom}>
        {savedLine && <Text style={[styles.saved, changed && styles.changed]}>{savedLine}</Text>}
        {r.aligned ? (
          <View style={styles.buttons}>
            <View style={styles.button}>
              <OutlinedButton label="Retake" onPress={() => flow.retake(scan, back)} />
            </View>
            {canSave && (
              <View style={styles.button}>
                <PrimaryButton
                  testID="save-open"
                  label={summary ? 'Save changes' : scan.kind === 'sale' ? 'Save sale' : 'Save purchase'}
                  onPress={openSave}
                />
              </View>
            )}
          </View>
        ) : (
          <PrimaryButton label="Retake" icon={Camera} onPress={() => flow.retake(scan, back)} />
        )}
      </View>
      {sheet?.kind === 'boxes' && (
        <BoxSheet visible title={sheet.title} scan={scan} boxes={sheet.boxes} onClose={() => setSheet(null)}>
          {sheet.row !== undefined && sale && <NewItem scan={scan} sale={sale} row={sheet.row} />}
        </BoxSheet>
      )}
      {sheet?.kind === 'terms' && <TermsSheet visible scan={scan} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'customer' && sale && (
        <PartySheet visible scan={scan} sale={sale} onClose={() => setSheet(null)} />
      )}
      {sheet?.kind === 'supplier' && sale && (
        <SupplierSheet visible scan={scan} sale={sale} onClose={() => setSheet(null)} />
      )}
      {sheet?.kind === 'save' && sale && <SaveSheet visible scan={scan} sale={sale} onClose={() => setSheet(null)} />}
      <ReadingOverlay visible={flow.reading} />
    </View>
  );
}

/** On a sale, an item the lists don't have: one tap adds it, with its unit and the row's unit price. */
function NewItem({ scan, sale, row }: { scan: StoredScan; sale: SaleView; row: number }) {
  const item = sale.final.items.find((it) => it.row === row);
  if (scan.kind !== 'sale' || scan.source === 'sample' || !item || item.item_id !== null || !item.description) return null;
  const add = async () => {
    await addItem({ name: item.description, unit: boxValue(scan, `item${row}_unit`) ?? '', price: item.unit_price });
    toast('Added to your items.');
  };
  return <TextButton label={`Add “${item.description}” to your items`} onPress={() => void add()} />;
}

/** The sale's sections: sale or purchase, the invoice, its items and its totals. */
function SaleSections({ scan, sale, open }: { scan: StoredScan; sale: SaleView; open: (sheet: OpenSheet) => void }) {
  const r = scan.result;
  const form = FORMS[r.form!];
  const fields = formFields(r.form!);
  const final = sale.final;
  const has = (flag: string) => final.flags.includes(flag);
  const raw = rawFromScan(scan);
  const amount = (box: string) => candidates(raw.boxes[box])[0] ?? 0;
  const anyRead = (names: string[]) => names.some((b) => boxValue(scan, b) !== null);
  const boxesOf = (title: string, names: readonly string[], row?: number) => () =>
    open({ kind: 'boxes', title, boxes: fields.filter((f) => names.includes(f)), row });

  const dc = final.date_choice;
  const dateSub = dc.rebuilt
    ? `Read as “${boxValue(scan, 'date') ?? ''}”, the slashes unclear. Check the date.`
    : has('date') && dc.other
      ? `Could also be read as ${prettyDate(dc.other)}. Check the date.`
      : has('date')
        ? final.date === null
          ? "Couldn't make out a date"
          : 'Not a date in the last 6 months'
        : null;

  const party = sale.party;
  const tin = party.listParty?.tin || (boxValue(scan, 'customer_tin') ?? '');
  const customerSub: Record<string, string> = {
    auto: tin ? `TIN ${tin} · matched in your customers` : 'Matched in your customers',
    chosen: 'Chosen from your customers',
    unsure: 'Closest match. Tap to compare.',
    new: 'Not in your customer list',
    unlisted: 'Add your customers in Your lists to check names',
    blank: 'No customer written',
  };
  const supplierSub: Record<string, string> = {
    chosen: 'From your suppliers',
    typed: 'Not in your supplier list',
    various: 'Exported as VARIOUS-SUPP',
    missing: 'Printed at the top of the invoice: tap to choose it',
  };
  const termsValue = sale.terms === 'cash' ? form.cash : sale.terms === 'account' ? form.account : 'Unclear';
  const termsSub =
    sale.terms === null ? `Tick ${form.cash} or ${form.account} clearly` : scan.terms !== null ? 'Chosen by you' : null;

  const vatShown = sale.taxType === 'VAT' || final.flags.some((f) => f.startsWith('check_'));
  const rowsSum = final.items.reduce((sum, it) => sum + (it.amount ?? 0), 0);
  const totalSub = has('total')
    ? "The written totals don't agree"
    : has('total_rows')
      ? `The rows add up to ${peso(rowsSum)}. Check each row's price and amount.`
      : has('check_total_sales')
        ? "Total sales doesn't match the total due"
        : 'The written totals agree';
  const n = final.items.length;

  return (
    <>
      <Text style={sectionLabel}>THIS INVOICE IS</Text>
      <View style={styles.kind}>
        <Segmented
          options={KINDS}
          value={scan.kind}
          // the party chosen for one is never the other's: a sale's customer didn't issue the invoice
          onChange={(kind) => kind !== scan.kind && updateScan(scan.id, { kind, party: null })}
        />
      </View>
      <Text style={styles.caption}>{KIND_CAPTION[scan.kind]}</Text>

      <Text style={[sectionLabel, styles.section]}>INVOICE</Text>
      <View style={styles.card}>
        <SaleRow label={form.number} value={final.invoice_no || null} onPress={boxesOf(form.number, ['invoice_no'])} />
        <SaleRow
          label="Date"
          value={prettyDate(final.date) ?? boxValue(scan, 'date')}
          sub={dateSub}
          flagged={has('date')}
          onPress={boxesOf('Date', ['date'])}
        />
        {scan.kind === 'sale' ? (
          <SaleRow
            label="Customer"
            value={party.shown}
            sub={customerSub[party.status]}
            flagged={party.status === 'unsure' || party.status === 'new'}
            onPress={() => open({ kind: 'customer' })}
          />
        ) : (
          <>
            <SaleRow
              label="Supplier"
              value={party.shown}
              sub={supplierSub[party.status]}
              flagged={party.status === 'missing'}
              onPress={() => open({ kind: 'supplier' })}
            />
            <SaleRow
              label="Sold to"
              value={boxValue(scan, 'customer_name') || null}
              sub="You, as the invoice names you"
              onPress={boxesOf('Sold to', CUSTOMER_BOXES)}
            />
          </>
        )}
        <SaleRow
          label="Terms"
          value={termsValue}
          sub={termsSub}
          flagged={has('terms')}
          onPress={() => open({ kind: 'terms' })}
        />
      </View>

      <Text style={[sectionLabel, styles.section]}>{n === 1 ? '1 ITEM' : `${n} ITEMS`}</Text>
      <View style={styles.card}>
        {n === 0 ? (
          <SaleRow value="No items read" />
        ) : (
          final.items.map((it) => {
            const row = it.row;
            const sub =
              `${qty(it.qty)} × ${peso(it.unit_price)}` +
              (has(`row${row}`) ? " · doesn't add up" : '') +
              (has(`item${row}`) ? ' · not in your item list' : '') +
              (has(`price${row}`) ? ` · your list price is ${peso(sale.listPrices[row] ?? null)}` : '');
            const title = it.description || `Item ${row}`;
            return (
              <SaleRow
                key={row}
                value={title}
                sub={sub}
                amount={peso(it.amount)}
                flagged={has(`row${row}`) || has(`item${row}`) || has(`price${row}`)}
                onPress={boxesOf(
                  title,
                  ['qty', 'unit', 'description', 'unit_price', 'amount'].map((c) => `item${row}_${c}`),
                  row,
                )}
              />
            );
          })
        )}
      </View>

      <Text style={[sectionLabel, styles.section]}>TOTALS</Text>
      <View style={styles.card}>
        {(vatShown || anyRead(['vatable_sales', 'net_of_vat'])) && (
          <SaleRow
            label="VATable sales"
            value={peso(final.vatable_sales)}
            sub={has('check_vatable_sales') || has('check_net_of_vat') ? "A written VATable amount doesn't match the total" : null}
            flagged={has('check_vatable_sales') || has('check_net_of_vat')}
            onPress={boxesOf('VATable sales', ['vatable_sales', 'net_of_vat'])}
          />
        )}
        {(vatShown || anyRead(['vat', 'less_vat', 'add_vat'])) && (
          <SaleRow
            label="VAT 12%"
            value={peso(final.vat)}
            sub={has('check_vat') || has('check_less_vat') || has('check_add_vat') ? "A written VAT doesn't match 12/112" : null}
            flagged={has('check_vat') || has('check_less_vat') || has('check_add_vat')}
            onPress={boxesOf('VAT 12%', ['vat', 'less_vat', 'add_vat'])}
          />
        )}
        {amount('zero_rated') > 0 && (
          <SaleRow
            label="Zero-rated sales"
            value={peso(amount('zero_rated'))}
            onPress={boxesOf('Zero-rated sales', ['zero_rated'])}
          />
        )}
        {amount('vat_exempt') > 0 && (
          <SaleRow
            label="VAT-exempt sales"
            value={peso(amount('vat_exempt'))}
            onPress={boxesOf('VAT-exempt sales', ['vat_exempt'])}
          />
        )}
        <SaleRow
          label="Total due"
          value={peso(final.total_due)}
          sub={totalSub}
          flagged={has('total') || has('total_rows') || has('check_total_sales')}
          onPress={boxesOf('Total due', TOTAL_BOXES)}
        />
        {final.less > 0 && (
          <SaleRow
            label="Gross (VAT included)"
            value={peso(sale.gross)}
            sub="Before the discount and withholding tax. This goes to MyBizMate."
            onPress={boxesOf('Gross (VAT included)', ['total_sales', 'discount', 'withholding'])}
          />
        )}
      </View>
    </>
  );
}

function Title({ subtitle }: { subtitle?: string }) {
  return (
    <View>
      <Text style={styles.title}>Scan</Text>
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 16, paddingBottom: 24 },
  gone: { fontSize: 15, color: colors.ink, padding: 16 },
  kind: { marginTop: 8 },
  caption: { fontSize: 14, color: colors.mute, marginTop: 8, lineHeight: 20 },
  section: { marginTop: 24, marginBottom: 8 },
  card: { backgroundColor: colors.panel, borderRadius: 18, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  footnote: { fontSize: 13, color: colors.mute, marginTop: 16, lineHeight: 18 },
  bottom: { padding: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, backgroundColor: colors.panel },
  saved: { fontSize: 13, color: colors.pine, marginBottom: 12 },
  changed: { color: colors.ember },
  buttons: { flexDirection: 'row', gap: 12 },
  button: { flex: 1 },
  title: { ...bold, fontSize: 18, color: colors.ink },
  subtitle: { fontSize: 13, color: colors.mute },
});
