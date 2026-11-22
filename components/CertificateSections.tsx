import { StyleSheet, Text, View } from 'react-native';

import type { CertView, PayorStatus } from '../lib/cert';
import type { CertRow } from '../lib/checks/bir2307';
import { peso, prettyDate, qty } from '../lib/format';
import { formFields } from '../lib/forms';
import { formatTin, partyName } from '../lib/lists';
import { boxValue } from '../lib/sale';
import type { StoredScan } from '../lib/scans';
import { colors, sectionLabel } from '../lib/theme';
import { SaleRow } from './SaleRow';

type Table = CertRow['table'];

const PERIOD_BOXES = ['period_from', 'period_to'];
const partyBoxes = (who: 'payee' | 'payor') => ['tin', 'name', 'address', 'zip'].map((c) => `${who}_${c}`);
const ROW_COLUMNS = ['payment', 'atc', 'm1', 'm2', 'm3', 'total', 'tax'];
const TOTAL_COLUMNS = ['m1', 'm2', 'm3', 'total', 'tax'];

/** Each table's words: its section, its line in the totals, a row's name, and whose ATCs it takes. */
const TABLES: Record<Table, { section: string; total: string; row: string; atcFor: string }> = {
  ewt: { section: 'INCOME PAYMENTS', total: 'Income payments', row: 'Row', atcFor: 'income payments' },
  bt: { section: 'BUSINESS TAX', total: 'Business tax', row: 'Business tax row', atcFor: 'business tax' },
};

const PAYOR_SUB: Record<PayorStatus, string> = {
  auto: 'Matched in your customers',
  unsure: 'Closest match in your customers', // with that customer's name (payorSub)
  new: 'Not in your customers',
  unlisted: 'Add your customers in Your lists to check names',
  none: 'Not in your customers', // no payor written: never an invoice's walk-in
};

/** How the payor stands against the customers; an unsure match names the closest one, since the payor is as written. */
const payorSub = ({ status, listParty }: CertView['payor']) =>
  status === 'unsure' && listParty ? `Closest match: ${partyName(listParty)}` : PAYOR_SUB[status];

/** "Oct 1 – Dec 31, 2026 (Q4)": a quarter's first and last days, its year said once. */
function quarterText(from: string, to: string, quarter: string): string {
  return `${prettyDate(from)!.replace(/, \d+$/, '')} – ${prettyDate(to)} (${quarter.split('-')[1]})`;
}

/** A party's TIN as the BIR writes it, then its ZIP code; a box that wasn't read is a dash. */
const tinAndZip = (p: { tin: string; zip: string }) =>
  `TIN ${p.tin ? formatTin(p.tin) : '—'} · ZIP ${p.zip || '—'}`;

/** A rate as people write it: 1%, 0.5%, 15%. */
const percent = (rate: number) => `${qty(rate * 100)}%`;

/** A total row as read, unless its amounts are all zero or unreadable: a template's 0.00 or "-" line is no total. */
function realTotal(row: CertRow | null): CertRow | null {
  return row && [...row.months, row.total, row.tax].some((v) => v !== null && v !== 0) ? row : null;
}

/**
 * A BIR 2307's sections: the period, the payee (the business), the payor (matched like a sale's customer), Part III's
 * income payments, its business-tax rows when it has any, and each table's totals. Every row opens what the camera
 * saw in its boxes (openBoxes), each box fixable, and the checks run again.
 */
export function CertificateSections({
  scan,
  view,
  openBoxes,
}: {
  scan: StoredScan;
  view: CertView;
  openBoxes: (title: string, boxes: string[]) => void;
}) {
  const { cert, payor } = view;
  const has = (flag: string) => cert.flags.includes(flag);
  const fields = formFields('bir_2307');
  const boxesOf = (title: string, names: readonly string[]) => () =>
    openBoxes(title, fields.filter((f) => names.includes(f)));
  const rowsOf = (table: Table) => cert.rows.filter((r) => r.table === table);

  const read = [boxValue(scan, 'period_from'), boxValue(scan, 'period_to')];
  const period =
    cert.quarter !== null && cert.from !== null && cert.to !== null
      ? quarterText(cert.from, cert.to, cert.quarter)
      : read.some((v) => v)
        ? read.map((v) => v || '—').join(' – ')
        : null;

  const paymentRow = (row: CertRow) => {
    const name = `${row.table}${row.row}`; // the row's boxes and flags: ewt1_total, ewt1_sum
    const words = TABLES[row.table];
    const title = [row.atc, row.payment].filter((s) => s).join(' · ') || `${words.row} ${row.row}`;
    const sub =
      `Tax withheld ${peso(row.tax)}` +
      (has(`${name}_sum`) ? " · the months don't add up to the total" : '') +
      (has(`${name}_tax`) && row.rate !== null ? ` · not ${percent(row.rate)} of the total` : '') +
      (has(`${name}_atc`) ? (row.atc === null ? ' · no ATC' : ` · not an ATC for ${words.atcFor}`) : '');
    return (
      <SaleRow
        key={name}
        value={title}
        sub={sub}
        amount={peso(row.total)}
        flagged={has(`${name}_sum`) || has(`${name}_tax`) || has(`${name}_atc`)}
        onPress={boxesOf(
          title,
          ROW_COLUMNS.map((c) => `${name}_${c}`),
        )}
      />
    );
  };
  const income = rowsOf('ewt');
  const business = rowsOf('bt');
  // a table's total, when it has rows or its total row doesn't add up (so it can be fixed)
  const totals = (['ewt', 'bt'] as const).filter((t) => rowsOf(t).length > 0 || has(`${t}_total`));

  return (
    <>
      <Text style={[sectionLabel, styles.first]}>PERIOD</Text>
      <View style={styles.card}>
        <SaleRow
          value={period}
          sub={has('period') ? 'Not one calendar quarter' : null}
          flagged={has('period')}
          onPress={boxesOf('Period', PERIOD_BOXES)}
        />
      </View>

      <Text style={[sectionLabel, styles.section]}>PAYEE</Text>
      <View style={styles.card}>
        <SaleRow
          value={cert.payee.name || null}
          sub={tinAndZip(cert.payee)}
          flagged={has('payee_tin')}
          onPress={boxesOf('Payee', partyBoxes('payee'))}
        />
      </View>

      <Text style={[sectionLabel, styles.section]}>PAYOR</Text>
      <View style={styles.card}>
        <SaleRow
          value={payor.shown || null}
          sub={`${payorSub(payor)}\n${tinAndZip(cert.payor)}`}
          flagged={has('payor_tin') || has('payor_new') || has('payor_unsure')}
          onPress={boxesOf('Payor', partyBoxes('payor'))}
        />
      </View>

      <Text style={[sectionLabel, styles.section]}>{TABLES.ewt.section}</Text>
      <View style={styles.card}>
        {income.length === 0 ? <SaleRow value="No income payments read" /> : income.map(paymentRow)}
      </View>

      {business.length > 0 && (
        <>
          <Text style={[sectionLabel, styles.section]}>{TABLES.bt.section}</Text>
          <View style={styles.card}>{business.map(paymentRow)}</View>
        </>
      )}

      {totals.length > 0 && (
        <>
          <Text style={[sectionLabel, styles.section]}>TOTALS</Text>
          <View style={styles.card}>
            {totals.map((table) => {
              const total = realTotal(cert.totals[table]);
              const words = TABLES[table];
              const off = has(`${table}_total`);
              const sub = `Tax withheld ${peso(total?.tax ?? null)}`;
              return (
                <SaleRow
                  key={table}
                  value={words.total}
                  sub={off ? `${sub} · the rows don't add up to the total row` : sub}
                  amount={peso(total?.total ?? null)}
                  flagged={off}
                  onPress={boxesOf(
                    words.total,
                    TOTAL_COLUMNS.map((c) => `${table}_total_${c}`),
                  )}
                />
              );
            })}
          </View>
        </>
      )}
    </>
  );
}

// as the sale's sections (app/result.tsx)
const styles = StyleSheet.create({
  first: { marginBottom: 8 },
  section: { marginTop: 24, marginBottom: 8 },
  card: { backgroundColor: colors.panel, borderRadius: 18, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
});
