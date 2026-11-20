import type { Final } from './checks/finalize';
import { qty } from './format';
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
