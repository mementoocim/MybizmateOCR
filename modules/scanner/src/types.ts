// What the scanner core returns (docs/superpowers/plans/2026-11-19-scanner-m1-core-reads-a-photo.md, "The scan
// result"), with the files it writes as file:// URIs.

export type FieldType = 'printed_digits' | 'date' | 'tin' | 'amount' | 'number' | 'text';

export type BoxRead = {
  name: string;
  type: FieldType;
  text: string;
  conf: number;
  alts: string[]; // backup readings, most likely first
  cropSize: [number, number];
  cropUri: string; // the crop as the model saw it
};

export type ScanResult = {
  aligned: boolean;
  form: 'sales_invoice' | null;
  photoSize: [number, number];
  turned: boolean;
  corners: [number, number][] | null; // tl, tr, br, bl in photo pixels
  sharpness: number | null;
  sharpMin: number | null;
  light: number | null;
  terms: 'cash' | 'account' | null;
  blanks: number;
  reads: BoxRead[]; // in field order
  pageUri: string | null; // the straightened page
  timing: { alignMs: number; cropMs: number; readMs: number; totalMs: number };
};

export type CoreInfo = { opencv: string; onnxruntime: string };
