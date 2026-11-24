import { TEAM_BUILD } from './build';
import { readJson, writeJson } from './jsonFile';

// The export defaults, kept on the phone: whether the business is VAT-registered, the accounts the imports need (as
// a code or a name from the business's chart of accounts, which isn't on the phone: an invoice's revenue or expense
// account, and the offset account a 2307's withheld tax goes to), and the last withholding tax ATC. And the team's
// own: whether annotation mode is on (Settings › Team tools, team builds only), and the client and writer codes the
// last annotated save used, which the next one starts from. And whether Home's "Get set up" was finished once: it
// never shows again after that (design B §9.2).

export type TaxType = 'VAT' | 'NONVAT' | 'ZERO' | 'EXEMPT' | 'NA';
export type Settings = {
  vatRegistered: boolean | null;
  revenueAccount: string;
  expenseAccount: string;
  atc: string;
  offsetAccount: string;
  annotation: boolean;
  clientCode: string;
  writerCode: string;
  setupDone: boolean; // "Get set up" was finished once
};

const FILE = 'settings.json';
// Settings kept by an older version lack the newer fields: these fill them in when they load.
const DEFAULTS: Settings = {
  vatRegistered: null,
  revenueAccount: '',
  expenseAccount: '',
  atc: '',
  offsetAccount: '',
  annotation: false,
  clientCode: '',
  writerCode: '',
  setupDone: false,
};

let current: Settings = DEFAULTS; // replaced, never changed in place: screens subscribe to it
const listeners = new Set<() => void>();

const changed = () => listeners.forEach((listener) => listener());

export function settings(): Settings {
  return current;
}

/**
 * Whether annotation mode is on: the setting, in a team build. A phone moved from a team build to a client build keeps
 * the setting in settings.json, where its switch is hidden, so the build decides too. Everything annotation mode
 * changes asks this.
 */
export function annotationOn(): boolean {
  return TEAM_BUILD && current.annotation;
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

/**
 * Changes the settings and keeps them on the phone. A change that changes nothing (a save's defaults, as a rule) keeps
 * the same settings and tells no screen, so nothing that shows them draws again (the final review's Important 1).
 */
export function updateSettings(change: Partial<Settings>): Promise<void> {
  const keys = Object.keys(change) as (keyof Settings)[];
  if (keys.some((key) => change[key] !== current[key])) {
    current = { ...current, ...change };
    changed();
  }
  return writeJson(FILE, current);
}
