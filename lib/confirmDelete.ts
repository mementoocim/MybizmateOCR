import { Alert } from 'react-native';

import { deleteSaved } from './saved';
import { deleteScan, type StoredScan } from './scans';
import { toast } from './toast';

// Design B §9.5: deleting a saved scan asks first, in the same words from the Scan screen's ⋮ and from See invoices'
// long press. Delete runs the caller's own step first (the Scan screen starts going back: Review Focus 4), then the
// delete, in the same press. A delete that fails says so in the snackbar, in place of failing unseen (ruling T19-2).
// Camera first (spec §6.4): any scan, saved or not, from a session screen's row or its Remove (confirmDeleteScan).

/** Asks before deleting a saved scan; on Delete, runs `before` (if given), then deletes it. */
export function confirmDeleteSaved(id: string, before?: () => void): void {
  Alert.alert('Delete this saved scan?', "It's removed from this phone. Files you already exported don't change.", [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Delete',
      style: 'destructive',
      onPress: () => {
        before?.();
        deleteSaved(id).catch(() => toast("Couldn't delete the scan."));
      },
    },
  ]);
}

/**
 * Asks before deleting a scan. A saved one goes through confirmDeleteSaved, in today's words, and this resolves at once
 * (ruling P-F12): its delete is that flow's own. An unsaved one asks "Delete this scan?"; Delete runs `before` (if
 * given), then deletes it (lib/scans' deleteScan), and says so if that fails. For an unsaved scan this settles when the
 * dialog closes, either way, so a Button that runs it guards a double tap while it's up.
 */
export function confirmDeleteScan(scan: StoredScan, before?: () => void): Promise<void> {
  if (scan.saved) {
    confirmDeleteSaved(scan.id, before);
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    Alert.alert('Delete this scan?', "It's removed from this phone.", [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve() },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          try {
            before?.();
            try {
              deleteScan(scan.id);
            } catch {
              toast("Couldn't delete the scan.");
            }
          } finally {
            resolve();
          }
        },
      },
    ]);
  });
}
