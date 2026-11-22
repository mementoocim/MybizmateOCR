// What the scanner core returns (docs/superpowers/plans: milestone 1's "The scan result", milestone 2's "version
// 2" and milestone 5's PDF fields), with the files it writes as file:// URIs.

// digits and code: the BIR 2307's comb boxes (its period and ZIPs) and its ATCs
export type FieldType = 'printed_digits' | 'date' | 'tin' | 'amount' | 'number' | 'text' | 'digits' | 'code';

export type FormName = 'sales_invoice' | 'service_invoice' | 'bir_2307';

export type BoxRead = {
  name: string;
  type: FieldType;
  text: string;
  conf: number;
  alts: string[]; // backup readings, most likely first
  fromText: boolean; // the PDF's own text (conf 1, no backup readings), not read from the picture
  cropSize: [number, number];
  cropUri: string | null; // the crop as the model saw it; null when the scan kept no files
};

export type ScanResult = {
  aligned: boolean;
  form: FormName | null;
  source: 'photo' | 'pdf';
  pageCount: number | null; // a PDF's pages (only page 1 is read); null for a photo
  picture: boolean | null; // a PDF's page 1 is a picture (a scan, say), read like a photo; null for a photo
  photoSize: [number, number]; // a PDF: its page 1 as rendered
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
