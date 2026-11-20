import type { Final } from './checks/finalize';
import { qty } from './format';
import type { Party } from './lists';
import type { SaleView } from './sale';
import type { SaveDetails, StoredScan } from './scans';

// A saved scan as a row of MyBizMate's Sales import or Purchases import (docs/mybizmate-templates): the templates'
// header rows word for word, and each value where its column goes. Columns a row leaves out are blank.

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

/** A TIN as MyBizMate's Parties import writes it, 123-456-789-00000 (00000: the head office); '' when it can't be. */
export function partiesTin(tin: string): string {
  const d = tin.replace(/\D/g, '');
  if (d.length !== 9 && d.length !== 12 && d.length !== 14) return '';
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
export type SaveBlock = 'sample' | 'no_form' | 'no_date' | 'no_total' | 'no_supplier';

/** Why a scan can't be saved yet, or null. Samples are made up, so they never are. */
export function saveBlock(scan: StoredScan, sale: SaleView | null): SaveBlock | null {
  if (scan.source === 'sample') return 'sample';
  if (!scan.result.aligned || !sale) return 'no_form';
  if (sale.final.date === null) return 'no_date';
  if (sale.gross === null) return 'no_total';
  if (scan.kind === 'purchase' && sale.party.status === 'missing') return 'no_supplier';
  return null;
}

/** The items for the Description column: "10 × Detergent 1kg; 5 × Nails 2in". */
export function itemsDescription(final: Final): string {
  return final.items
    .filter((it) => it.description !== '')
    .map((it) => (it.qty !== null ? `${qty(it.qty)} × ${it.description}` : it.description))
    .join('; ');
}

export function exportRow(scan: StoredScan, sale: SaleView, details: SaveDetails): ExportRow {
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
