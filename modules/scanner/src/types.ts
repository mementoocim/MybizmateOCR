// What the scanner core returns (docs/superpowers/plans: milestone 1's "The scan result" and milestone 2's "version
// 2"), with the files it writes as file:// URIs.

export type FieldType = 'printed_digits' | 'date' | 'tin' | 'amount' | 'number' | 'text';

export type FormName = 'sales_invoice' | 'service_invoice';

export type BoxRead = {
  name: string;
  type: FieldType;
  text: string;
  conf: number;
  alts: string[]; // backup readings, most likely first
  cropSize: [number, number];
  cropUri: string | null; // the crop as the model saw it; null when the scan kept no files
};

export type ScanResult = {
  aligned: boolean;
  form: FormName | null;
  photoSize: [number, number];
  turned: boolean;
  corners: [number, number][] | null; // tl, tr, br, bl in photo pixels
  sharpness: number | null;
  sharpMin: number | null;
  light: number | null;
  darkMax: number | null;
  terms: 'cash' | 'account' | null;
  blanks: number;
  reads: BoxRead[]; // in field order
  pageUri: string | null; // the straightened page (the Service Invoice: its paper)
  originalUri: string | null; // the photo with the found outline drawn
  scanDir: string | null; // the scan's folder; null when it kept no files
  timing: { alignMs: number; cropMs: number; readMs: number; totalMs: number };
};

export type ScanOptions = {
  keepFiles?: boolean; // write the scan's images (default true)
  deletePhoto?: boolean; // delete the photo after reading it: a camera capture in the app's cache (default false)
};

export type ScannerStats = { loadMs: number | null; peakKb: number };

export type CoreInfo = { opencv: string; onnxruntime: string };
