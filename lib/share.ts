import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';

import { toast } from './toast';

// Sharing an export file: the import files (Saved invoices) and the team's training data (Settings › Team tools).

/** How what's in a file is counted ("1 sale", "2 sales"), and what leaves it out once marked ("the next export"). */
export type Wording = { one: string; many: string; next: string };

/**
 * Writes the file and opens the share sheet. The share sheet can't tell whether the file was sent, so the person says
 * so before what went in it is marked as exported.
 */
export async function shareThenAsk(
  write: (now: Date) => Promise<string>,
  mimeType: string,
  n: number,
  words: Wording,
  mark: (now: Date) => Promise<void>,
): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    toast("This phone can't share files.");
    return;
  }
  try {
    const now = new Date();
    const uri = await write(now);
    await Sharing.shareAsync(uri, { mimeType, dialogTitle: 'Send the file' });
    Alert.alert(
      'Did the file go where you wanted?',
      n === 1
        ? `Mark this ${words.one} as exported, so the ${words.next} leaves it out.`
        : `Mark these ${n} ${words.many} as exported, so the ${words.next} leaves them out.`,
      [
        { text: 'Not yet', style: 'cancel' },
        {
          text: 'Mark as exported',
          onPress: () => {
            void mark(now).then(() => toast(`Marked ${n} ${n === 1 ? words.one : words.many} as exported.`));
          },
        },
      ],
    );
  } catch {
    toast("Couldn't make the file.");
  }
}
