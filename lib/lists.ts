import type { Pack, Terms } from './checks/finalize';
import { parseAmount } from './checks/num';
import { tinLengthOk } from './checks/tin';
import { parseCsv } from './csv';
import { readJson, writeJson } from './jsonFile';

// The business's own customers, suppliers and items, kept on the phone (lists.json). They are imported from CSV
// files (customers and suppliers in MyBizMate's Parties import columns; items as Name, Unit, Price) and added from
// scans. Contact numbers and emails are never read into the app.

export type PartyType = 'customer' | 'supplier' | 'both';
export type Party = {
  id: string; // the app's own id
  code: string; // MyBizMate's code, '' when it isn't known
  type: PartyType;
  entity: 'company' | 'individual';
  registeredName: string;
  lastName: string;
  firstName: string;
  middleName: string;
  tradeName: string;
  tin: string;
  address: string;
  vatStatus: 'vat' | 'nonvat' | '';
  terms: Terms | '';
  fromScan: boolean;
  exportedAt: string | null; // when it went out in a Parties import file
};
export type ListItem = { id: string; name: string; unit: string; price: number | null };
export type Lists = { parties: readonly Party[]; items: readonly ListItem[]; version: number };
export type ImportSummary = { added: number; updated: number; skipped: number; customers: number; suppliers: number };

export class ListImportError extends Error {
  code: 'no_columns';
  constructor(code: 'no_columns') {
    super(code);
    this.name = 'ListImportError';
    this.code = code;
  }
}

const FILE = 'lists.json';
let current: Lists = { parties: [], items: [], version: 0 }; // replaced, never changed in place: screens subscribe
const listeners = new Set<() => void>();
let counter = 0;
const newId = (prefix: string) => `${prefix}${Date.now().toString(36)}-${(++counter).toString(36)}`;

function commit(parties: readonly Party[], items: readonly ListItem[]): Promise<void> {
  current = { parties, items, version: current.version + 1 };
  listeners.forEach((listener) => listener());
  return writeJson(FILE, { parties, items });
}

export function lists(): Lists {
  return current;
}

export function subscribeLists(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function loadLists(): Promise<void> {
  const saved = await readJson<{ parties?: Party[]; items?: ListItem[] }>(FILE);
  current = {
    parties: (saved?.parties ?? []).map((p) => ({ ...p, exportedAt: p.exportedAt ?? null })),
    items: saved?.items ?? [],
    version: current.version + 1,
  };
  listeners.forEach((listener) => listener());
}

type Names = Pick<Party, 'entity' | 'registeredName' | 'lastName' | 'firstName' | 'middleName'>;
const squeeze = (s: string) => s.replace(/\s+/g, ' ').trim();
const personName = (p: Names) => squeeze(`${p.firstName} ${p.middleName} ${p.lastName}`);

/** A company's registered name; a person's "First Middle Last". */
export function partyName(p: Names): string {
  return p.entity === 'company' ? p.registeredName || personName(p) : personName(p) || p.registeredName;
}

/** The name MyBizMate shows: a company's registered name; a person's "Last, First Middle". */
export function exportName(p: Names): string {
  if (p.entity === 'individual' && p.lastName && p.firstName) {
    return `${p.lastName}, ${squeeze(`${p.firstName} ${p.middleName}`)}`;
  }
  return partyName(p);
}

export function customersOf(l: Lists): Party[] {
  return l.parties.filter((p) => p.type !== 'supplier');
}

export function suppliersOf(l: Lists): Party[] {
  return l.parties.filter((p) => p.type !== 'customer');
}

/** The checks' pack: the customers (with their trade name as another name) and the items. */
export function packFor(l: Lists): Pack {
  return {
    customers: customersOf(l).map((p) => ({
      id: p.id,
      name: partyName(p),
      tin: p.tin,
      ...(p.tradeName ? { names: [p.tradeName] } : {}),
    })),
    items: l.items.map((i) => ({ id: i.id, description: i.name, unit: i.unit, price: i.price ?? 0 })),
  };
}

/** A TIN's digits as 123-456-789, with its branch as -000, -0000 or -00000; anything else as given. */
export function formatTin(digits: string): string {
  const d = digits.replace(/\D/g, '');
  if (!tinLengthOk(d)) return digits;
  const head = `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6, 9)}`;
  return d.length === 9 ? head : `${head}-${d.slice(9)}`;
}

/** A header as the app matches it: lower case, without MyBizMate's * and † marks, spaces squeezed. */
const headerKey = (h: string) => squeeze(h.toLowerCase().replace(/[^a-z0-9/ -]/g, ''));

const PARTY_COLUMNS = [
  'code',
  'type',
  'entity type',
  'registered name',
  'last name',
  'first name',
  'middle name',
  'trade name',
  'tin',
  'sub-street',
  'street',
  'barangay',
  'city / municipality',
  'province',
  'zip',
  'vat status',
  'payment terms',
] as const;
type PartyColumn = (typeof PARTY_COLUMNS)[number];

function partyType(text: string, fallback: PartyType): PartyType {
  const t = text.toLowerCase();
  if ((t.includes('customer') && t.includes('supplier')) || t === 'both' || t === 'b') return 'both';
  if (t.includes('customer') || t === 'c') return 'customer';
  if (t.includes('supplier') || t === 's') return 'supplier';
  return fallback;
}

const codeKey = (code: string) => code.toLowerCase();
const tinNameKey = (tin: string, name: string) => `${tin.replace(/\D/g, '').slice(0, 9)}|${name.toLowerCase()}`;

/**
 * Where a CSV row's party is in the list: the first with the same code, else the first with the same first 9 TIN
 * digits and the same name (-1 when none). Kept as the rows change the list, so a file of thousands reads quickly.
 */
function partyIndex(parties: readonly Party[]) {
  const byCode = new Map<string, number[]>(); // each key's places in the list, in order
  const byTinName = new Map<string, number[]>();
  const keysOf = (p: Party) => ({ code: p.code ? codeKey(p.code) : null, tinName: tinNameKey(p.tin, partyName(p)) });
  const put = (map: Map<string, number[]>, key: string, i: number) => {
    const places = map.get(key);
    if (!places) return void map.set(key, [i]);
    const after = places.findIndex((at) => at > i);
    places.splice(after === -1 ? places.length : after, 0, i);
  };
  const drop = (map: Map<string, number[]>, key: string, i: number) => {
    const places = map.get(key);
    if (!places) return;
    places.splice(places.indexOf(i), 1);
    if (places.length === 0) map.delete(key);
  };
  const add = (p: Party, i: number) => {
    const k = keysOf(p);
    if (k.code !== null) put(byCode, k.code, i);
    put(byTinName, k.tinName, i);
  };
  parties.forEach(add);
  return {
    find(code: string, tin: string, name: string): number {
      const sameCode = code ? byCode.get(codeKey(code)) : undefined;
      if (sameCode) return sameCode[0];
      return byTinName.get(tinNameKey(tin, name))?.[0] ?? -1;
    },
    add,
    replace(i: number, before: Party, after: Party) {
      const k = keysOf(before);
      if (k.code !== null) drop(byCode, k.code, i);
      drop(byTinName, k.tinName, i);
      add(after, i);
    },
  };
}

/**
 * Customers and suppliers from a CSV with MyBizMate's Parties import columns (by header name; other columns are
 * skipped). A blank type takes defaultType. A row updates the party with the same code, else the same TIN and name,
 * keeping what its blank cells leave out; any other row is added.
 */
export async function importPartiesCsv(text: string, defaultType: 'customer' | 'supplier'): Promise<ImportSummary> {
  const [header = [], ...rows] = parseCsv(text);
  const columns = header.map(headerKey);
  if (!columns.includes('registered name') && !columns.includes('last name') && !columns.includes('first name')) {
    throw new ListImportError('no_columns');
  }
  const parties = [...current.parties];
  const index = partyIndex(parties);
  const summary: ImportSummary = { added: 0, updated: 0, skipped: 0, customers: 0, suppliers: 0 };
  for (const row of rows) {
    const cell = {} as Record<PartyColumn, string>;
    for (const name of PARTY_COLUMNS) {
      const i = columns.indexOf(name);
      cell[name] = i >= 0 ? (row[i] ?? '').trim() : '';
    }
    const named = { registeredName: cell['registered name'], lastName: cell['last name'], firstName: cell['first name'] };
    const entityText = cell['entity type'].toLowerCase();
    const entity: Party['entity'] = entityText.includes('individual')
      ? 'individual'
      : entityText.includes('company')
        ? 'company'
        : !named.registeredName && (named.lastName || named.firstName)
          ? 'individual'
          : 'company';
    if (entity === 'company' ? !named.registeredName : !(named.lastName || named.firstName)) {
      summary.skipped++;
      continue;
    }
    const vatText = cell['vat status'].toLowerCase();
    const termsText = cell['payment terms'].toLowerCase();
    const read: Omit<Party, 'id' | 'exportedAt'> = {
      code: cell.code,
      type: partyType(cell.type, defaultType),
      entity,
      ...named,
      middleName: cell['middle name'],
      tradeName: cell['trade name'],
      tin: cell.tin,
      address: [cell['sub-street'], cell.street, cell.barangay, cell['city / municipality'], cell.province, cell.zip]
        .filter((part) => part !== '')
        .join(', '),
      vatStatus: vatText.includes('not') ? 'nonvat' : vatText.includes('vat') ? 'vat' : '',
      terms: termsText.includes('account') ? 'account' : termsText.includes('cash') ? 'cash' : '',
      fromScan: false,
    };
    const i = index.find(read.code, read.tin, partyName(read));
    let saved: Party;
    if (i >= 0) {
      const old = parties[i];
      saved = {
        ...old,
        code: read.code && read.code.toLowerCase() !== old.code.toLowerCase() ? read.code : old.code,
        type: cell.type ? read.type : old.type,
        entity: cell['entity type'] ? read.entity : old.entity,
        registeredName: read.registeredName || old.registeredName,
        lastName: read.lastName || old.lastName,
        firstName: read.firstName || old.firstName,
        middleName: read.middleName || old.middleName,
        tradeName: read.tradeName || old.tradeName,
        tin: read.tin || old.tin,
        address: read.address || old.address,
        vatStatus: cell['vat status'] ? read.vatStatus : old.vatStatus,
        terms: cell['payment terms'] ? read.terms : old.terms,
        fromScan: false,
      };
      parties[i] = saved;
      index.replace(i, old, saved);
      summary.updated++;
    } else {
      saved = { ...read, id: newId('p'), exportedAt: null };
      parties.push(saved);
      index.add(saved, parties.length - 1);
      summary.added++;
    }
    if (saved.type !== 'supplier') summary.customers++;
    if (saved.type !== 'customer') summary.suppliers++;
  }
  await commit(parties, current.items);
  return summary;
}

/** Items from a CSV with Name (or Description), Unit and Price (or List price) columns; the same name updates. */
export async function importItemsCsv(text: string): Promise<ImportSummary> {
  const [header = [], ...rows] = parseCsv(text);
  const columns = header.map(headerKey);
  const first = (...names: string[]) => names.map((n) => columns.indexOf(n)).find((i) => i >= 0) ?? -1;
  const nameAt = first('name', 'description');
  if (nameAt < 0) throw new ListImportError('no_columns');
  const unitAt = first('unit');
  const priceAt = first('price', 'list price');
  const items = [...current.items];
  const summary: ImportSummary = { added: 0, updated: 0, skipped: 0, customers: 0, suppliers: 0 };
  for (const row of rows) {
    const name = (row[nameAt] ?? '').trim();
    if (!name) {
      summary.skipped++;
      continue;
    }
    const unit = unitAt >= 0 ? (row[unitAt] ?? '').trim() : '';
    const price = priceAt >= 0 ? parseAmount(row[priceAt]) : null;
    const i = items.findIndex((it) => it.name.toLowerCase() === name.toLowerCase());
    if (i >= 0) {
      items[i] = { ...items[i], name, unit, price };
      summary.updated++;
    } else {
      items.push({ id: newId('i'), name, unit, price });
      summary.added++;
    }
  }
  await commit(current.parties, items);
  return summary;
}

export async function addParty(p: Omit<Party, 'id' | 'exportedAt'>): Promise<Party> {
  const party: Party = { ...p, id: newId('p'), exportedAt: null };
  await commit([...current.parties, party], current.items);
  return party;
}

export async function addItem(i: Omit<ListItem, 'id'>): Promise<ListItem> {
  const item: ListItem = { ...i, id: newId('i') };
  await commit(current.parties, [...current.items, item]);
  return item;
}

/** The parties added from scans with no MyBizMate code yet (for a Parties import file); those sent only when asked. */
export function newParties(l: Lists, includeSent: boolean): Party[] {
  return l.parties.filter((p) => p.fromScan && p.code === '' && (includeSent || p.exportedAt === null));
}

/** Notes that these parties went out in a Parties import file. */
export function markPartiesExported(ids: readonly string[], at: Date): Promise<void> {
  const when = at.toISOString();
  return commit(
    current.parties.map((p) => (ids.includes(p.id) ? { ...p, exportedAt: when } : p)),
    current.items,
  );
}

/** Removes that type's parties; a party that is both keeps its other side. */
export function clearParties(type: 'customer' | 'supplier'): Promise<void> {
  const other: PartyType = type === 'customer' ? 'supplier' : 'customer';
  return commit(
    current.parties.flatMap((p) => (p.type === type ? [] : p.type === 'both' ? [{ ...p, type: other }] : [p])),
    current.items,
  );
}

export function clearItems(): Promise<void> {
  return commit(current.parties, []);
}
