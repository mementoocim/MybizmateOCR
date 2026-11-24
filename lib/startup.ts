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
