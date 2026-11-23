import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';

import { toast } from './toast';

// Sharing an export file: the import files (the export sheet, which asks its question as a step of its own) and the
// team's training data (Settings › Team tools, which asks it in an Alert).

/** How what's in a file is counted ("1 sale", "2 sales"), and what leaves it out once marked ("the next export"). */
export type Wording = { one: string; many: string; next: string };

/**
 * A file shared: ok once the share sheet has closed, with the time the file was written for. The share sheet can't
 * tell whether the file was sent, so ok holds when the person backed out too. Else why it wasn't, in a sentence.
 */
export type Shared = { ok: true; at: Date } | { ok: false; message: string };

/** Writes the file and opens the share sheet with it. */
export async function shareFile(write: (now: Date) => Promise<string>, mimeType: string): Promise<Shared> {
  if (!(await Sharing.isAvailableAsync())) return { ok: false, message: "This phone can't share files." };
  try {
    const at = new Date();
    const uri = await write(at);
    await Sharing.shareAsync(uri, { mimeType, dialogTitle: 'Send the file' });
    return { ok: true, at };
  } catch {
    return { ok: false, message: "Couldn't make the file." };
  }
}

/**
 * Writes the file and opens the share sheet. The share sheet can't tell whether the file was sent, so the person says
 * so, in an Alert, before what went in it is marked as exported.
 */
export async function shareThenAsk(
  write: (now: Date) => Promise<string>,
  mimeType: string,
  n: number,
  words: Wording,
  mark: (now: Date) => Promise<void>,
): Promise<void> {
  const shared = await shareFile(write, mimeType);
  if (!shared.ok) {
    toast(shared.message);
    return;
  }
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
          void mark(shared.at).then(() => toast(`Marked ${n} ${n === 1 ? words.one : words.many} as exported.`));
        },
      },
    ],
  );
}
