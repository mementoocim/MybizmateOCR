import type { BoxRead, FormName } from '../../modules/scanner';
import type { StoredScan } from '../scans';

// Which of a scan's boxes can become training data ("training boxes"), and whether the person has checked each one.
// Annotation mode's save gate and the training export both ask here, so the two never disagree.

/**
 * The boxes that name a person or a business: the customer's on an invoice, the payee's and the payor's on a 2307.
 * They never become training data. A test pins them against the templates' own field names.
 */
export const PERSONAL: Readonly<Record<FormName, ReadonlySet<string>>> = {
  sales_invoice: new Set(['customer_name', 'customer_tin', 'customer_address']),
  service_invoice: new Set(['customer_name', 'customer_tin', 'customer_address']),
  bir_2307: new Set([
    'payee_tin',
    'payee_name',
    'payee_address',
    'payee_zip',
    'payor_tin',
    'payor_name',
    'payor_address',
    'payor_zip',
  ]),
};

type Template = { fields: { name: string; multiline?: boolean }[] };

const multiLine = (template: Template, also: string[] = []): ReadonlySet<string> =>
  new Set([...template.fields.filter((f) => f.multiline === true).map((f) => f.name), ...also]);

// Each form's multi-line boxes, from the templates the scanner reads (the JSON lib/forms.ts reads too).
const MULTI_LINE: Record<FormName, ReadonlySet<string>> = {
  sales_invoice: multiLine(require('../../modules/scanner/assets/scanner/field_map.json')),
  // the amount in words is written over two boxes, a line each, and read as one (amount_words2 into amount_words)
  service_invoice: multiLine(require('../../modules/scanner/assets/scanner/service_invoice.json'), ['amount_words']),
  bir_2307: multiLine(require('../../modules/scanner/assets/scanner/bir_2307.json')),
};

/**
 * A box read as more than one line: a template field marked multiline, and the Service Invoice's amount in words. Its
 * crop stacks its lines, each of which the model read on its own, so the crop and its text aren't one model input's.
 */
export function isMultiLine(form: FormName, box: string): boolean {
  return MULTI_LINE[form].has(box);
}

/**
 * The boxes that can become training data, in field order: the ones the model read from the picture, without the
 * personal and the multi-line boxes. A box read from a PDF's own text isn't the model's reading, and a blank box has
 * no read at all. None when no form was found.
 */
export function trainingBoxes(scan: StoredScan): BoxRead[] {
  const form = scan.result.form;
  if (form === null) return [];
  return scan.result.reads.filter((r) => !r.fromText && !PERSONAL[form].has(r.name) && !isMultiLine(form, r.name));
}

/** A box as the person left it: not checked yet, confirmed as read ("Looks right"), or corrected (edited). */
export type BoxState = 'unchecked' | 'confirmed' | 'corrected';

const hasOwn = (o: object, key: string) => Object.prototype.hasOwnProperty.call(o, key);

/**
 * Corrected when the box has an edit (one cleared to nothing too), even if it was confirmed; confirmed when the person
 * said it was read right; otherwise not checked yet. An edit drops the confirm (setEdit), so one taken back leaves the
 * box unchecked.
 */
export function boxState(scan: StoredScan, box: string): BoxState {
  if (hasOwn(scan.edits, box)) return 'corrected';
  return scan.confirmed?.includes(box) ? 'confirmed' : 'unchecked';
}

/** The training boxes the person hasn't confirmed or corrected yet, in field order. */
export function uncheckedBoxes(scan: StoredScan): string[] {
  return trainingBoxes(scan)
    .map((r) => r.name)
    .filter((box) => boxState(scan, box) === 'unchecked');
}
