import type { FormName } from '../modules/scanner';

// Each form's words on screen (the test app's OcrEngine.java:222, service_invoice.json and bir_2307.json).
export const FORMS: Record<FormName, { title: string; cash: string; account: string; number: string }> = {
  sales_invoice: { title: 'MyBizMate Sales Invoice', cash: 'Cash', account: 'On account', number: 'SI no.' },
  service_invoice: { title: 'Service Invoice', cash: 'Cash sales', account: 'Charge sales', number: 'Invoice no.' },
  bir_2307: { title: 'BIR Form 2307', cash: '', account: '', number: '' }, // no terms ticks, no number box
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

type Template = { fields: { name: string; type: string; label?: string }[] };
const BIR_2307 = require('../modules/scanner/assets/scanner/bir_2307.json') as Template;
const FIELDS: Record<FormName, string[]> = {
  sales_invoice: (require('../modules/scanner/assets/scanner/field_map.json') as Template).fields
    .filter((f) => f.type !== 'checkbox')
    .map((f) => f.name),
  // amount_words2 is read into amount_words (the scanner merges the two lines)
  service_invoice: (require('../modules/scanner/assets/scanner/service_invoice.json') as Template).fields
    .filter((f) => f.type !== 'checkbox' && f.name !== 'amount_words2')
    .map((f) => f.name),
  bir_2307: BIR_2307.fields.filter((f) => f.type !== 'checkbox').map((f) => f.name),
};

/** The words a template gives its own boxes: the 2307's are the official form's. */
const TEMPLATE_LABELS: Partial<Record<FormName, Readonly<Record<string, string>>>> = {
  bir_2307: Object.fromEntries(BIR_2307.fields.flatMap((f) => (f.label ? [[f.name, f.label]] : []))),
};

/** A form's boxes in its template's order, without the tick boxes. */
export function formFields(form: FormName): string[] {
  return FIELDS[form];
}

const COLUMNS: Record<string, string> = {
  qty: 'Qty',
  unit: 'Unit',
  description: 'Description',
  unit_price: 'Unit price',
  amount: 'Amount',
};

/** A box's name as people read it: "SI no.", "Row 3 · Unit price", "Total due", "Payor's TIN". */
export function fieldLabel(form: FormName, name: string): string {
  const own = TEMPLATE_LABELS[form]?.[name];
  if (own) return own;
  if (name === 'invoice_no') return FORMS[form].number;
  const row = /^item(\d+)_(.+)$/.exec(name);
  if (row) return `Row ${row[1]} · ${COLUMNS[row[2]] ?? row[2]}`;
  return LABELS[name] ?? name.replace(/_/g, ' ');
}
