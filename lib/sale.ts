import { localIsoDate } from './checks/dates';
import { type Final, finalize, type Pack, type Raw, type Terms } from './checks/finalize';
import { type Box, candidates, pyRound } from './checks/num';
import { customersOf, exportName, type Lists, packFor, type Party, partyName } from './lists';
import type { Kind, StoredScan } from './scans';
import type { Settings, TaxType } from './settings';

// A scan's sale: the checks (lib/checks) run on what the boxes say (the person's edits over the readings), with the
// app's rules on top: empty lists skip their checks; a purchase skips the customer and item-list checks (its customer
// boxes name the buyer, the business itself); the customer or supplier that goes out in MyBizMate's import; the
// suggested tax type; and the import's Gross (VAT included, before the discount and the withholding tax).

export const SAMPLE_DAY = '2026-11-18'; // the samples are made-up invoices of that time: checked as of then
export const VARIOUS_CUSTOMER = 'VARIOUS-CUST';
/** Said where a real scan could add a name to the lists: a sample's made-up names never reach them, or an export. */
export const SAMPLE_NAMES = "Samples are made up, so their names aren't added to your lists.";
export const VARIOUS_SUPPLIER = 'VARIOUS-SUPP';

export type PartyStatus = 'auto' | 'chosen' | 'unsure' | 'new' | 'unlisted' | 'blank' | 'typed' | 'various' | 'missing';
export type SaleView = {
  final: Final; // the checks, without the list checks this app skips
  problems: string[]; // the status card's words, in order
  party: { status: PartyStatus; column: string; shown: string; written: string; listParty: Party | null };
  terms: Terms | null; // the person's pick, else the ticks
  gross: number | null;
  discount: number | null;
  withholding: number | null;
  taxType: TaxType; // the suggestion
  listPrices: Readonly<Record<number, number>>; // item row -> the list price of the item it matched
};

const hasOwn = (o: object, key: string) => Object.prototype.hasOwnProperty.call(o, key);

/** What a box says: the person's edit, else its reading; null when it wasn't read and isn't edited. */
export function boxValue(scan: StoredScan, box: string): string | null {
  if (hasOwn(scan.edits, box)) return scan.edits[box];
  return scan.result.reads.find((r) => r.name === box)?.text ?? null;
}

/**
 * What the checks read: each box's reading and backups, an edited box as the person typed it (with no backups), and
 * the photo's measures. The core measures every page it straightens, a PDF's rendered page too, but a box read from
 * the PDF's own text is exact whatever the page looks like: a PDF gets no photo checks when every box read came from
 * its text. A box the model read from the page is only as good as the page, so a photo, a picture PDF, and a PDF whose
 * visible text (a page number, a stamp on a scan) left some box to the model get them.
 */
export function rawFromScan(scan: StoredScan): Raw {
  const r = scan.result;
  const boxes: Record<string, Box> = {};
  for (const read of r.reads) boxes[read.name] = { text: read.text, alts: read.alts };
  for (const [name, text] of Object.entries(scan.edits)) {
    if (text === '') delete boxes[name];
    else boxes[name] = { text, alts: [] };
  }
  const typed = r.source === 'pdf' && r.reads.length > 0 && r.reads.every((read) => read.fromText);
  const photo =
    !typed && r.aligned && r.sharpness != null && r.sharpMin != null && r.light != null && r.darkMax != null
      ? { sharpness: pyRound(r.sharpness, 4), sharp_min: r.sharpMin, light: pyRound(r.light, 1), dark_max: r.darkMax }
      : null;
  return { boxes, terms: scan.terms ?? r.terms, photo };
}

/** The day the date is checked against: the scan's own day on the phone's clock; samples, the day they were made for. */
export function checkDay(scan: StoredScan): string {
  return scan.source === 'sample' ? SAMPLE_DAY : localIsoDate(scan.at);
}

const firstAmount = (raw: Raw, box: string) => candidates(raw.boxes[box])[0] ?? 0;
const VAT_BOXES = ['vatable_sales', 'vat', 'less_vat', 'net_of_vat', 'add_vat'];

/**
 * The import's Type for this invoice. A sale by a business that isn't VAT-registered: NONVAT. A VAT-registered sale:
 * ZERO or EXEMPT when those are its only VAT-box amounts, else VAT. A purchase, or a sale before the question is
 * answered: VAT when a VAT box has an amount, else ZERO or EXEMPT, else NONVAT.
 */
export function suggestTaxType(kind: Kind, raw: Raw, vatRegistered: boolean | null): TaxType {
  const hasVat = VAT_BOXES.some((b) => firstAmount(raw, b) > 0);
  const zero = firstAmount(raw, 'zero_rated') > 0;
  const exempt = firstAmount(raw, 'vat_exempt') > 0;
  if (kind === 'sale' && vatRegistered === false) return 'NONVAT';
  if (kind === 'sale' && vatRegistered === true) {
    if (zero && !hasVat && !exempt) return 'ZERO';
    if (exempt && !hasVat && !zero) return 'EXEMPT';
    return 'VAT';
  }
  if (hasVat) return 'VAT';
  if (zero) return 'ZERO';
  if (exempt) return 'EXEMPT';
  return 'NONVAT';
}

/** Things a person should look at, in plain words and the test app's order (Checks.Sale.problems), plus the supplier. */
export function problemWords(final: Final, kind: Kind, supplierMissing: boolean): string[] {
  const has = (f: string) => final.flags.includes(f);
  const out: string[] = [];
  if (has('blurry')) out.push('Blurry photo (retake it)'); // first: retaking fixes the rest too
  if (has('dark')) out.push('Dark photo (retake it)');
  if (has('date')) out.push('Date');
  if (has('customer_unsure')) out.push('Customer (confirm the match)');
  if (has('customer_new')) out.push('Customer (not in your list)');
  if (kind === 'purchase' && supplierMissing) out.push('Supplier (choose one)');
  if (has('terms')) out.push('Terms');
  for (const it of final.items) {
    if (has(`row${it.row}`)) out.push(`Row ${it.row} math`);
    else if (has(`item${it.row}`)) out.push(`Row ${it.row} item`);
    else if (has(`price${it.row}`)) out.push(`Row ${it.row} price`);
  }
  if (has('total')) out.push('Total');
  if (has('total_rows')) out.push('Rows vs total');
  if (final.flags.some((f) => f.startsWith('check_'))) out.push('VAT breakdown');
  return out;
}

/** A list party as MyBizMate's imports name it: its code, else its name as MyBizMate has it. */
export const listColumn = (p: Party) => p.code || exportName(p);

/** A scan with a sale: one of the two invoices, its form found. A BIR 2307 has its own checks (lib/cert.ts). */
export function isInvoice(scan: StoredScan): boolean {
  const { aligned, form } = scan.result;
  return aligned && (form === 'sales_invoice' || form === 'service_invoice');
}

// One run of the checks per scan as it stands: Home's row, the scan's screen and Saved invoices share it. The
// stores replace a scan, the lists or the settings when they change, so the same objects give the same answer.
const views = new WeakMap<StoredScan, { lists: Lists; settings: Settings; view: SaleView }>();

/** The sale of an invoice's scan (isInvoice): a 2307 never goes through a sale's checks. */
export function saleOf(scan: StoredScan, lists: Lists, settings: Settings): SaleView {
  const hit = views.get(scan);
  if (hit && hit.lists === lists && hit.settings === settings) return hit.view;
  const view = checkSale(scan, lists, settings);
  views.set(scan, { lists, settings, view });
  return view;
}

function checkSale(scan: StoredScan, lists: Lists, settings: Settings): SaleView {
  const raw = rawFromScan(scan);
  const isSale = scan.kind === 'sale';
  const pack: Pack = isSale ? packFor(lists) : { customers: [], items: [] };
  const checked = finalize(raw, pack, checkDay(scan));
  const choice = scan.party;
  const chosen = choice && 'listId' in choice ? (lists.parties.find((p) => p.id === choice.listId) ?? null) : null;
  const noCustomers = customersOf(lists).length === 0;
  const dropCustomer = !isSale || noCustomers || chosen !== null;
  const dropItems = !isSale || lists.items.length === 0;
  const final: Final = {
    ...checked,
    flags: checked.flags.filter(
      (f) =>
        !(dropCustomer && (f === 'customer_unsure' || f === 'customer_new')) && !(dropItems && /^(item|price)\d+$/.test(f)),
    ),
  };
  const written = (boxValue(scan, 'customer_name') ?? '').trim();

  let party: SaleView['party'];
  if (isSale) {
    const matched = lists.parties.find((p) => p.id === checked.customer_id) ?? null;
    const status = checked.customer_status;
    if (chosen) party = { status: 'chosen', column: listColumn(chosen), shown: partyName(chosen), written, listParty: chosen };
    else if (status === 'auto' && matched) {
      party = { status: 'auto', column: listColumn(matched), shown: partyName(matched), written, listParty: matched };
    } else if (status === 'unsure' && matched) {
      party = { status: 'unsure', column: written, shown: partyName(matched), written, listParty: matched };
    } else if (status === 'blank' || written === '') {
      party = { status: 'blank', column: VARIOUS_CUSTOMER, shown: 'Walk-in (VARIOUS)', written, listParty: null };
    } else {
      party = { status: noCustomers ? 'unlisted' : 'new', column: written, shown: written, written, listParty: null };
    }
  } else if (chosen) {
    party = { status: 'chosen', column: listColumn(chosen), shown: partyName(chosen), written, listParty: chosen };
  } else if (choice && 'name' in choice) {
    party = { status: 'typed', column: choice.name, shown: choice.name, written, listParty: null };
  } else if (choice && 'various' in choice) {
    party = { status: 'various', column: VARIOUS_SUPPLIER, shown: 'Various suppliers', written, listParty: null };
  } else {
    party = { status: 'missing', column: '', shown: 'Not chosen yet', written, listParty: null };
  }

  const amountOrNull = (box: string) => {
    const v = firstAmount(raw, box);
    return v > 0 ? v : null;
  };
  const listPrices: Record<number, number> = {};
  for (const it of final.items) {
    const price = it.item_id === null ? undefined : pack.items.find((i) => i.id === it.item_id)?.price;
    if (price && price > 0) listPrices[it.row] = price;
  }
  return {
    final,
    problems: problemWords(final, scan.kind, party.status === 'missing'),
    party,
    terms: raw.terms,
    gross: final.gross,
    discount: amountOrNull('discount'),
    withholding: amountOrNull('withholding'),
    taxType: suggestTaxType(scan.kind, raw, settings.vatRegistered),
    listPrices,
  };
}
