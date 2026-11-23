import type { FieldType, FormName } from '../modules/scanner';

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

type Field = { name: string; type: FieldType; label?: string };
type Template = { fields: (Field | { name: string; type: 'checkbox' })[] };
/** The templates the scanner reads each form with: its boxes, in order, with their types (and the 2307's words). */
const TEMPLATES: Record<FormName, Template> = {
  sales_invoice: require('../modules/scanner/assets/scanner/field_map.json'),
  service_invoice: require('../modules/scanner/assets/scanner/service_invoice.json'),
  bir_2307: require('../modules/scanner/assets/scanner/bir_2307.json'),
};
/** A template's boxes, without the tick boxes. */
const boxesOf = (form: FormName) => TEMPLATES[form].fields.filter((f): f is Field => f.type !== 'checkbox');

const FIELDS: Record<FormName, string[]> = {
  sales_invoice: boxesOf('sales_invoice').map((f) => f.name),
  // amount_words2 is read into amount_words (the scanner merges the two lines)
  service_invoice: boxesOf('service_invoice')
    .filter((f) => f.name !== 'amount_words2')
    .map((f) => f.name),
  bir_2307: boxesOf('bir_2307').map((f) => f.name),
};

const typesOf = (form: FormName): Readonly<Record<string, FieldType>> =>
  Object.fromEntries(boxesOf(form).map((f) => [f.name, f.type]));
/** Each form's boxes' types, as their templates give them, built once. */
const TYPES: Record<FormName, Readonly<Record<string, FieldType>>> = {
  sales_invoice: typesOf('sales_invoice'),
  service_invoice: typesOf('service_invoice'),
  bir_2307: typesOf('bir_2307'),
};

/** The words a template gives its own boxes: the 2307's are the official form's. */
const TEMPLATE_LABELS: Partial<Record<FormName, Readonly<Record<string, string>>>> = {
  bir_2307: Object.fromEntries(boxesOf('bir_2307').flatMap((f) => (f.label ? [[f.name, f.label]] : []))),
};

/** A form's boxes in its template's order, without the tick boxes. */
export function formFields(form: FormName): string[] {
  return FIELDS[form];
}

/**
 * What kind of box it is, as the form's template says: an amount, a date, a TIN, a 2307's ATC (code)… It picks the
 * box's keyboard. 'text' for a name the form has no box for (a tick box among them).
 */
export function fieldType(form: FormName, name: string): FieldType {
  return Object.prototype.hasOwnProperty.call(TYPES[form], name) ? TYPES[form][name] : 'text';
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
