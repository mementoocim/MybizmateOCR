import type { FieldType, FormName } from '../../modules/scanner';
import { certOf, is2307 } from '../cert';
import { installId } from '../install';
import type { Lists } from '../lists';
import { isInvoice, saleOf } from '../sale';
import type { SourceTag, StoredScan } from '../scans';
import type { Settings } from '../settings';
import { boxState, trainingBoxes } from './boxes';
import { usedValues } from './used';

// One saved, annotated scan as training data. Each training box: its crop's path in the export, the model's reading,
// the person's label and what they did to it, and the value the checks used when it differs. And the scan's form,
// source tag, install ID, versions, photo measures and flags. Nothing else: never a personal box, the party, the
// scan's label (a PDF's file name), what it was saved with, or a file's URI.

/** A training box as the export keeps it. */
export type TrainingBox = {
  name: string;
  type: FieldType;
  crop: string; // the crop's path in the export
  size: [number, number]; // the crop's width and height
  reading: string; // the model's first reading
  conf: number;
  alts: string[]; // its backup readings
  used: string | null; // what the checks used, where it differs from the reading
  label: string; // what the box says: the person's edit, else the reading
  edited: boolean; // the person corrected it
  confirmed: boolean; // the person checked it: confirmed as read, or corrected
};

/** A scan as the export keeps it. */
export type TrainingScan = {
  id: string;
  form: FormName;
  source: 'photo' | 'pdf'; // what the scanner read
  annotated: boolean;
  tag: SourceTag | null;
  installId: string;
  app: string | null; // the versions it was read with; none on a scan made before milestone 4
  model: string | null;
  photo: {
    sharpness: number | null;
    sharpMin: number | null;
    light: number | null;
    darkMax: number | null;
    turned: boolean;
  };
  flags: string[]; // the checks' flags: codes, never what a box says
  boxes: TrainingBox[];
};

/**
 * A scan as training data, or null unless it's saved, saved in annotation mode, not a sample or a camera test image,
 * with its form found and at least one training box. Only then is the install ID asked for: it throws until it's
 * loaded.
 */
export function trainingRecord(scan: StoredScan, lists: Lists, settings: Settings): TrainingScan | null {
  const form = isInvoice(scan) || is2307(scan) ? scan.result.form : null;
  if (!scan.saved || !scan.annotated || scan.source === 'sample' || scan.testImage || form === null) return null;
  const boxes = trainingBoxes(scan);
  if (boxes.length === 0) return null;
  const install = installId();
  const used = usedValues(scan, lists, settings);
  const r = scan.result;
  return {
    id: scan.id,
    form,
    source: r.source,
    annotated: scan.annotated,
    tag: scan.tag ?? null,
    installId: install,
    app: scan.made?.app ?? null,
    model: scan.made?.model ?? null,
    photo: { sharpness: r.sharpness, sharpMin: r.sharpMin, light: r.light, darkMax: r.darkMax, turned: r.turned },
    flags: isInvoice(scan) ? saleOf(scan, lists, settings).final.flags : certOf(scan, lists, settings).cert.flags,
    boxes: boxes.map((read) => {
      const state = boxState(scan, read.name);
      return {
        name: read.name,
        type: read.type,
        crop: `crops/${scan.id}/${read.name}.png`,
        size: read.cropSize,
        reading: read.text,
        conf: read.conf,
        alts: read.alts,
        used: used[read.name] ?? null,
        label: state === 'corrected' ? scan.edits[read.name] : read.text, // '' when the person cleared it
        edited: state === 'corrected',
        confirmed: state !== 'unchecked',
      };
    }),
  };
}
