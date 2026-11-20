import { readJson, writeJson } from './jsonFile';

// The export defaults, kept on the phone: whether the business is VAT-registered, the accounts the import needs (as
// a code or a name from the business's chart of accounts, which isn't on the phone), and the last withholding tax ATC.

export type TaxType = 'VAT' | 'NONVAT' | 'ZERO' | 'EXEMPT' | 'NA';
export type Settings = { vatRegistered: boolean | null; revenueAccount: string; expenseAccount: string; atc: string };

const FILE = 'settings.json';
const DEFAULTS: Settings = { vatRegistered: null, revenueAccount: '', expenseAccount: '', atc: '' };

let current: Settings = DEFAULTS; // replaced, never changed in place: screens subscribe to it
const listeners = new Set<() => void>();

const changed = () => listeners.forEach((listener) => listener());

export function settings(): Settings {
  return current;
}

export function subscribeSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function loadSettings(): Promise<void> {
  const saved = await readJson<Partial<Settings>>(FILE);
  current = { ...DEFAULTS, ...(saved ?? {}) };
  changed();
}

export function updateSettings(change: Partial<Settings>): Promise<void> {
  current = { ...current, ...change };
  changed();
  return writeJson(FILE, current);
}
