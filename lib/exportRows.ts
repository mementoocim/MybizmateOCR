import type { CertView } from './cert';
import type { Final } from './checks/finalize';
import { tinLengthOk } from './checks/tin';
import { monthSpan, qty } from './format';
import type { Party } from './lists';
import type { SaleView } from './sale';
import type { CertDetails, InvoiceDetails, StoredScan } from './scans';
import { uncheckedBoxes } from './training/boxes';

// A saved scan as a row of MyBizMate's Sales import or Purchases import (docs/mybizmate-templates), and a saved 2307 as
// rows of its 2307-CWT (received) import: the templates' header rows word for word, and each value where its column
// goes. Columns a row leaves out are blank.

export const SALES_COLUMNS: readonly string[] = [
  'Date *',
  'Customer *',
  'Gross *',
  'Type *',
  'Revenue Account *',
  'CWT IT',
  'CWT VT',
  'Terms *',
  'SI/OR No.',
  'Branch',
  'CTYPE',
  'Cash/Bank/Advance',
  'Description',
  'Discount',
  'Beneficiary',
  'ID No.',
  'Statutory',
  "Child's Name",
  'Term Type',
  'Credit Days',
  'Due Date',
  'ID Type',
  'Beneficiary TIN',
  'Discount Prices',
  'Cap Left',
  "Child's Birth Date",
  'Particulars',
];

export const PURCHASE_COLUMNS: readonly string[] = [
  'Date *',
  'Supplier *',
  'Gross *',
  'Type *',
  'Expense Account *',
  'EWT',
  'WVAT',
  'Terms *',
  'Inv No.',
  'Branch',
  'Cash/Bank/Advance',
  'Description',
  'Discount',
  'Term Type',
  'Credit Days',
  'Due Date',
  'Particulars',
];

/**
 * MyBizMate's 2307-CWT (received) import header row, word for word, as copied from its template on 2026-11-20 (the
 * template stays outside the repo: it carries the test company's lists).
 */
export const CWT_COLUMNS: readonly string[] = [
  'Date *',
  'Customer *',
  'Tax Base (Net)',
  'CWT IT',
  'IT Amt',
  'CWT VT',
  'VT Amt',
  'Offset Account *',
  'Cert No.',
  'Branch',
  'Particulars',
];

/** MyBizMate's Parties import header row, word for word (its † marks the address columns of which one is needed). */
export const PARTIES_COLUMNS: readonly string[] = [
  'Code',
  'Type *',
  'Entity type',
  'Registered name',
  'Last name',
  'First name',
  'Middle name',
  'Trade name',
  'TIN *',
  'RDO',
  'Sub-street †',
  'Street †',
  'Barangay †',
  'City / Municipality *',
  'Province *',
  'ZIP *',
  'Contact number',
  'Email',
  'VAT status',
  'Payment terms',
  'Authorized representative',
  'Representative title',
  'Representative TIN',
  'Trade type',
  'Default branch',
];

/**
 * A TIN as MyBizMate's Parties import writes it, 123-456-789-00000 (00000: the head office; a shorter branch code is
 * padded); '' when it can't be.
 */
export function partiesTin(tin: string): string {
  const d = tin.replace(/\D/g, '');
  if (!tinLengthOk(d)) return '';
  return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6, 9)}-${d.slice(9).padStart(5, '0')}`;
}

/** A party added from a scan as a Parties import row. Code is left for MyBizMate to give; City, Province and ZIP too. */
export function partyRow(p: Party): ExportRow {
  const row: Record<string, string> = {
    'Type *': p.type === 'customer' ? 'Customer' : p.type === 'supplier' ? 'Supplier' : 'Customer and Supplier',
    'Entity type': p.entity === 'company' ? 'Company' : 'Individual',
  };
  if (p.entity === 'company') {
    row['Registered name'] = p.registeredName;
  } else {
    if (p.lastName) row['Last name'] = p.lastName;
    if (p.firstName) row['First name'] = p.firstName;
    if (p.middleName) row['Middle name'] = p.middleName;
  }
  if (p.tradeName) row['Trade name'] = p.tradeName;
  const tin = partiesTin(p.tin);
  if (tin) row['TIN *'] = tin;
  if (p.address) row['Street †'] = p.address;
  if (p.vatStatus) row['VAT status'] = p.vatStatus === 'vat' ? 'VAT-registered' : 'Not VAT-registered';
  if (p.terms) row['Payment terms'] = p.terms === 'cash' ? 'Cash' : 'On Account';
  return row;
}

/** A template header -> its value; a column left out is blank. */
export type ExportRow = Readonly<Record<string, string | number>>;

/** The same row: the same columns with the same values. */
export function sameRow(a: ExportRow, b: ExportRow): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k]);
}

/** The same rows, in the same order. */
export function sameRows(a: readonly ExportRow[], b: readonly ExportRow[]): boolean {
  return a.length === b.length && a.every((row, i) => sameRow(row, b[i]));
}

export type SaveBlock =
  | 'sample'
  | 'no_form'
  | 'no_date'
  | 'no_total'
  | 'no_supplier'
  | 'no_period'
  | 'no_payor'
  | 'no_rows'
  | 'unchecked';

/** What a block asks of the person. A sample's screen and a form not found say why on their own. */
const BLOCK_WORDS: Partial<Record<SaveBlock, string>> = {
  no_date: 'Add the date first: tap Date.',
  no_total: 'Add the total first: tap Total due.',
  no_supplier: 'Choose the supplier first: tap Supplier.',
  no_period: 'Add the period first: tap Period.',
  no_payor: 'Add the payor first: tap Payor.',
  no_rows: 'No income payments were read.',
};

/**
 * A block's words for the person, or null when there are none (no block, a sample, a form not found). Boxes not
 * checked yet are counted on the scan.
 */
export function blockWords(block: SaveBlock | null, scan: StoredScan): string | null {
  if (block === 'unchecked') return `Check every box first: ${uncheckedBoxes(scan).length} left.`;
  return block === null ? null : (BLOCK_WORDS[block] ?? null);
}

/**
 * Why a scan can't be saved yet, or null: an invoice checked as a sale (SaleView), a 2307 as a certificate
 * (CertView). Samples are made up, so they never are. In annotation mode (opts.annotation: annotationOn()), a scan
 * the paper lets through also waits until every box that can become training data is checked.
 */
export function saveBlock(
  scan: StoredScan,
  checked: SaleView | CertView | null,
  opts?: { annotation?: boolean },
): SaveBlock | null {
  if (scan.source === 'sample') return 'sample';
  if (!scan.result.aligned || !checked) return 'no_form';
  if ('cert' in checked) {
    const { cert, payor } = checked;
    if (cert.from === null || cert.to === null) return 'no_period';
    if (payor.column === '') return 'no_payor'; // no name, and no customer matched
    if (cert.rows.length === 0) return 'no_rows';
  } else {
    if (checked.final.date === null) return 'no_date';
    if (checked.gross === null) return 'no_total';
    if (scan.kind === 'purchase' && checked.party.status === 'missing') return 'no_supplier';
  }
  return opts?.annotation && uncheckedBoxes(scan).length > 0 ? 'unchecked' : null;
}

/** The items for the Description column: "10 × Detergent 1kg; 5 × Nails 2in". */
export function itemsDescription(final: Final): string {
  return final.items
    .filter((it) => it.description !== '')
    .map((it) => (it.qty !== null ? `${qty(it.qty)} × ${it.description}` : it.description))
    .join('; ');
}

export function exportRow(scan: StoredScan, sale: SaleView, details: InvoiceDetails): ExportRow {
  const isSale = scan.kind === 'sale';
  const row: Record<string, string | number> = {
    'Date *': sale.final.date ?? '',
    [isSale ? 'Customer *' : 'Supplier *']: sale.party.column,
    'Gross *': sale.gross ?? 0,
    'Type *': details.taxType,
    [isSale ? 'Revenue Account *' : 'Expense Account *']: details.account,
    'Terms *': details.terms === 'cash' ? 'Cash' : 'On Account',
  };
  if (sale.withholding !== null && details.atc) row[isSale ? 'CWT IT' : 'EWT'] = details.atc;
  if (sale.final.invoice_no) row[isSale ? 'SI/OR No.' : 'Inv No.'] = sale.final.invoice_no;
  const description = itemsDescription(sale.final);
  if (description) row.Description = description;
  if (sale.discount !== null) row.Discount = sale.discount;
  return row;
}

/**
 * A saved 2307 as rows of the 2307-CWT import: one per payment in Part III, never its total rows. Each is dated the
 * period's last day, names the payor, and has the row's total as its tax base; an income payment's ATC and tax go
 * under CWT IT and IT Amt, a business tax's under CWT VT and VT Amt. Cert No. and Branch stay blank: the paper has no
 * certificate number, and the branch is the business's own, in MyBizMate.
 */
export function certRows({ cert, payor }: CertView, details: CertDetails): ExportRow[] {
  // a 2307 is saved only with its period (saveBlock), but one changed since can have lost it
  const particulars =
    cert.from !== null && cert.to !== null ? `BIR 2307 for ${monthSpan(cert.from, cert.to)}` : 'BIR 2307';
  return cert.rows.map((r) => {
    const row: Record<string, string | number> = {
      'Date *': cert.to ?? '',
      'Customer *': payor.column,
      'Offset Account *': details.account,
      Particulars: particulars,
    };
    if (r.total !== null) row['Tax Base (Net)'] = r.total;
    const [atc, tax] = r.table === 'ewt' ? ['CWT IT', 'IT Amt'] : ['CWT VT', 'VT Amt'];
    if (r.atc !== null) row[atc] = r.atc;
    if (r.tax !== null) row[tax] = r.tax;
    return row;
  });
}
