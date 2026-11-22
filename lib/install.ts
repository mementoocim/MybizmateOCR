import * as Crypto from 'expo-crypto';

import { readJson, writeJson } from './jsonFile';

// The install ID: a random ID (expo-crypto's version 4 UUID) made on the app's first start and kept in install.json,
// so the training data keeps one phone's handwriting together. It comes from nothing about the business or the phone,
// and it is never shown on the client's screens.

const FILE = 'install.json';
let id: string | null = null;

/** This install's ID. Throws before loadInstall, so nothing is ever exported without it. */
export function installId(): string {
  if (id === null) throw new Error('install_not_loaded');
  return id;
}

/** At start: the kept ID, or a new one, written once. A new ID is used only once it's kept. */
export async function loadInstall(): Promise<void> {
  const kept = await readJson<{ id?: string }>(FILE);
  if (kept?.id) {
    id = kept.id;
    return;
  }
  const made = Crypto.randomUUID();
  await writeJson(FILE, { id: made });
  id = made;
}
