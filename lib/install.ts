import * as Crypto from 'expo-crypto';

import { readJson, writeJson } from './jsonFile';

// The install ID: a random ID (expo-crypto's version 4 UUID) made on the app's first start and kept in install.json,
// so the training data keeps one phone's handwriting together. It comes from nothing about the business or the phone,
// and it is never shown on the client's screens.

const FILE = 'install.json';
let id: string | null = null;

/** This install's ID. Throws until a load has read or kept one, so nothing is ever exported without it. */
export function installId(): string {
  if (id === null) throw new Error('install_not_loaded');
  return id;
}

/**
 * At start: the kept ID, or a new one written once (a broken install.json is replaced). A new ID is used only once
 * it's kept. Only the team's training export needs it, so a load that fails leaves it unset and the app still starts;
 * the next load (the next start, or the export) tries again.
 */
export async function loadInstall(): Promise<void> {
  try {
    const kept = await readJson<{ id?: unknown }>(FILE);
    if (typeof kept?.id === 'string' && kept.id !== '') {
      id = kept.id;
      return;
    }
    const made = Crypto.randomUUID();
    await writeJson(FILE, { id: made });
    id = made;
  } catch {
    // the phone couldn't make or keep it (full, or its storage failed): the app starts without it
  }
}
