import { Alert } from 'react-native';

import { deleteSaved } from './saved';
import { toast } from './toast';

// Design B §9.5: deleting a saved scan asks first, in the same words from the Scan screen's ⋮ and from Saved's long
// press. Delete runs the caller's own step first (the Scan screen starts going back: Review Focus 4), then the delete,
// in the same press. A delete that fails says so in the snackbar, in place of failing unseen (ruling T19-2).

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
