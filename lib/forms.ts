import type { FormName } from '../modules/scanner';

// Each form's words on screen (the test app's OcrEngine.java:222 and service_invoice.json).
export const FORMS: Record<FormName, { title: string; cash: string; account: string; number: string }> = {
  sales_invoice: { title: 'MyBizMate Sales Invoice', cash: 'Cash', account: 'On account', number: 'SI no.' },
  service_invoice: { title: 'Service Invoice', cash: 'Cash sales', account: 'Charge sales', number: 'Invoice no.' },
};

const LABELS: Record<string, string> = {
  date: 'Date',
  customer_name: 'Customer',
  customer_tin: 'TIN',
  customer_address: 'Address',
  amount_words: 'Amount in words',
  amount_figure: 'Amount in figures',
  vatable_sales: 'VATable sales',
  vat: 'VAT',
  zero_rated: 'Zero-rated sales',
  vat_exempt: 'VAT-exempt sales',
  total_sales: 'Total sales',
  less_vat: 'Less VAT',
  net_of_vat: 'Net of VAT',
  add_vat: 'Add VAT',
  discount: 'Discount',
  withholding: 'Withholding tax',
  total_due: 'Total due',
  total_due_2: 'Total due (left column)',
};

const COLUMNS: Record<string, string> = {
  qty: 'Qty',
  unit: 'Unit',
  description: 'Description',
  unit_price: 'Unit price',
  amount: 'Amount',
};

/** A box's name as people read it: "SI no.", "Row 3 · Unit price", "Total due". */
export function fieldLabel(form: FormName, name: string): string {
  if (name === 'invoice_no') return FORMS[form].number;
  const row = /^item(\d+)_(.+)$/.exec(name);
  if (row) return `Row ${row[1]} · ${COLUMNS[row[2]] ?? row[2]}`;
  return LABELS[name] ?? name.replace(/_/g, ' ');
}
