import type { BoxRead, ScanResult } from './types';

const toUri = (path: string | null | undefined): string | null =>
  !path ? null : path.startsWith('file://') ? path : `file://${path}`;

// A read as the core's JSON has it: its crop's path, and no fromText before PDFs.
type RawRead = Omit<BoxRead, 'cropUri' | 'fromText'> & { cropFile: string; fromText?: boolean };

/**
 * The core's JSON (scanPhoto, readPdf) as a ScanResult, with its file paths as file:// URIs (null when there's no
 * file). A JSON from before PDFs (no source, pageCount, picture or fromText) is a photo's.
 */
export function parseScanResult(json: string): ScanResult {
  const raw = JSON.parse(json);
  return {
    aligned: raw.aligned,
    form: raw.form,
    source: raw.source ?? 'photo',
    pageCount: raw.pageCount ?? null,
    picture: raw.picture ?? null,
    photoSize: raw.photoSize,
    turned: raw.turned,
    corners: raw.corners,
    sharpness: raw.sharpness,
    sharpMin: raw.sharpMin,
    light: raw.light,
    darkMax: raw.darkMax ?? null,
    terms: raw.terms,
    blanks: raw.blanks,
    reads: raw.reads.map(({ cropFile, fromText, ...read }: RawRead) => ({
      ...read,
      fromText: fromText ?? false,
      cropUri: toUri(cropFile),
    })),
    pageUri: toUri(raw.pageFile),
    originalUri: toUri(raw.originalFile),
    scanDir: toUri(raw.scanDir),
    timing: raw.timing,
  };
}
