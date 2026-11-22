import { File } from 'expo-file-system';

import { localIsoDate } from '../checks/dates';
import { writeExportBytes } from '../exportFile';
import { installId, loadInstall } from '../install';
import { lists } from '../lists';
import { readScan, savedList } from '../saved';
import type { StoredScan } from '../scans';
import { settings } from '../settings';
import { APP_VERSION } from '../versions';
import { zipStored } from '../zip';
import { isTrainingScan, type TrainingBox, type TrainingScan, trainingRecord } from './record';

// The training-data export (Settings › Team tools, team builds): the scans saved in annotation mode that haven't gone
// out in one yet, the oldest 50 at a time, as a zip of manifest.json (each scan's training record) and each training
// box's crop at the path its record gives. Nothing else goes in: no personal box, no page or photo, no other file.

/** What the manifest is, for the script that reads it: its format and that format's version. */
export const TRAINING_FORMAT = { format: 'mybizmate-scan-training', version: 1 } as const;

/**
 * The most scans one export takes, the oldest first. The whole zip is built in the phone's memory, so a long backlog
 * goes out in parts, each one a size the phone can make.
 */
export const PER_EXPORT = 50;

const MOST_ENTRIES = 0xffff; // a zip without ZIP64 counts its entries in 16 bits

/**
 * The saved scans that are training data and haven't gone out in a training export, oldest first (by when each was
 * last saved; a tie in the order they were saved), each as it was last saved (saved/<id>/scan.json): a change made
 * since lives only in the app's memory, and never reaches the export. The annotation setting isn't asked, so turning
 * the mode off keeps the scans saved in it.
 */
export async function pendingTraining(): Promise<StoredScan[]> {
  const scans: StoredScan[] = [];
  for (const summary of [...savedList()].reverse()) {
    if (summary.trainingExportedAt) continue;
    const scan = await readScan(summary.id);
    if (scan && isTrainingScan(scan)) scans.push(scan);
  }
  const at = (scan: StoredScan) => scan.saved!.savedAt; // saved: isTrainingScan
  return scans.sort((a, b) => (at(a) < at(b) ? -1 : at(a) > at(b) ? 1 : 0));
}

const two = (n: number) => String(n).padStart(2, '0');

/**
 * The export's file name: the phone's own date and time to the second, then the install ID's first 4 characters
 * ("MyBizMate Scan training data 2026-11-22 143205 1df7.zip"). So a file saved next to another export, one phone's a
 * minute later or a teammate's from the same day, doesn't replace it.
 */
function exportName(at: Date, install: string): string {
  const time = two(at.getHours()) + two(at.getMinutes()) + two(at.getSeconds());
  return `MyBizMate Scan training data ${localIsoDate(at)} ${time} ${install.slice(0, 4)}.zip`;
}

/** A crop's PNG; null when the scan kept none, or its file can't be read (its folder deleted or moved). */
async function cropOf(uri: string | null): Promise<Uint8Array | null> {
  if (uri === null) return null;
  try {
    return await new File(uri).bytes();
  } catch {
    return null;
  }
}

/**
 * The zip of these scans' training data, dated `at`: manifest.json, written from the records alone, then each box's
 * crop, read from its scan's own files. A box whose crop can't be read is left out and counted in `missing` (the
 * manifest says it too); a scan whose crops are all gone stays, with no boxes. Throws too_big past the 65,535 entries a
 * zip without ZIP64 can hold, counted from the records before any crop is read, and install_not_loaded until the
 * install ID is loaded (the manifest holds it).
 */
export async function buildTrainingExport(
  scans: readonly { record: TrainingScan; scan: StoredScan }[],
  at: Date,
): Promise<{ name: string; bytes: Uint8Array; boxes: number; missing: number }> {
  const install = installId();
  if (1 + scans.reduce((n, { record }) => n + record.boxes.length, 0) > MOST_ENTRIES) throw new Error('too_big');
  const crops: { name: string; data: Uint8Array }[] = [];
  const records: TrainingScan[] = [];
  let missing = 0;
  for (const { record, scan } of scans) {
    const reads = new Map(scan.result.reads.map((r) => [r.name, r]));
    const boxes: TrainingBox[] = []; // a new list: the record's own arrays are the screens' too
    for (const box of record.boxes) {
      const data = await cropOf(reads.get(box.name)?.cropUri ?? null);
      if (data === null) {
        missing++;
        continue;
      }
      crops.push({ name: box.crop, data });
      boxes.push(box);
    }
    records.push({ ...record, boxes });
  }
  const manifest = {
    ...TRAINING_FORMAT,
    exportedAt: at.toISOString(),
    installId: install,
    app: APP_VERSION,
    missing,
    scans: records,
  };
  const files = [{ name: 'manifest.json', data: new TextEncoder().encode(JSON.stringify(manifest)) }, ...crops];
  return {
    name: exportName(at, install),
    bytes: zipStored(files, at),
    boxes: crops.length,
    missing,
  };
}

/**
 * Writes the training export of these scans (the oldest PER_EXPORT of pendingTraining's) for the share sheet; its
 * file:// URI. Every scan given goes in the zip, so the ones the person then marks are exactly the ones sent. When the
 * start couldn't keep the install ID, it's loaded once more first. Throws when it still can't be, not_training when a
 * scan given has no training record, when the zip would be too big, or when the file can't be written.
 */
export async function writeTrainingExport(scans: readonly StoredScan[], now: Date): Promise<string> {
  try {
    installId();
  } catch {
    await loadInstall();
  }
  const pairs = scans.map((scan) => {
    const record = trainingRecord(scan, lists(), settings());
    if (record === null) throw new Error('not_training');
    return { record, scan };
  });
  const { name, bytes } = await buildTrainingExport(pairs, now);
  return writeExportBytes(name, bytes);
}
