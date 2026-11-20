import { loadLists } from './lists';
import { loadRecent } from './scans';
import { loadSettings } from './settings';

/** Everything the app keeps on the phone, read back at start: the recent scans, the lists and the settings. */
export async function loadAppData(): Promise<void> {
  await Promise.all([loadRecent(), loadLists(), loadSettings()]);
}
