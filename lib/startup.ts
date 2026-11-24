import { useSyncExternalStore } from 'react';

import { loadInstall } from './install';
import { loadLists } from './lists';
import { loadSaved } from './saved';
import { loadRecent } from './scans';
import { loadSession } from './session';
import { loadSettings } from './settings';

/**
 * Everything the app keeps on the phone, read back at start: the recent scans, the lists, the settings and the install
 * ID (made on the first start), then the saved invoices (a save a kill cut short is summarised again with the lists and
 * settings). And the camera's session closes: a start never continues one (lib/session).
 */
export async function loadAppData(): Promise<void> {
  await Promise.all([loadRecent(), loadLists(), loadSettings(), loadInstall(), loadSession()]);
  await loadSaved();
}

// Whether the app has started: its splash has gone, so the camera may start and ask for its permission, and the queue
// reads what a closed app left (app/_layout). A new font size, display size or language mounts a new root in the same
// JS context (ruling T26-4), and its splash shows again: until it goes, the app hasn't started.
let started = false;
let unheard = false; // reset by a new root's render: its listeners hear of it at its next setStarted
const startedListeners = new Set<() => void>();

function subscribeStarted(listener: () => void): () => void {
  startedListeners.add(listener);
  return () => {
    startedListeners.delete(listener);
  };
}

/** The splash has gone (true), or a new root shows it (false). */
export function setStarted(next: boolean): void {
  if (started === next && !unheard) return;
  started = next;
  unheard = false;
  startedListeners.forEach((listener) => listener());
}

/**
 * A new root, as it renders: not started, before any of its screens renders or runs an effect (ruling T3-1). React runs
 * a screen's effects before its root's, so a reset in the root's effect comes too late. It tells no one, since nothing
 * may update another component while one renders: the root's effect then runs setStarted(false), which does. Run twice
 * (StrictMode), it changes nothing more.
 */
export function resetStarted(): void {
  if (!started) return;
  started = false;
  unheard = true;
}

/** Whether the splash has gone, for the screens: nothing starts behind it. */
export function useStarted(): boolean {
  return useSyncExternalStore(subscribeStarted, () => started);
}
