import type { BoxRead, ScanResult } from './types';

const toUri = (path: string | null | undefined): string | null =>
  !path ? null : path.startsWith('file://') ? path : `file://${path}`;

/** The core's JSON (scanPhoto) as a ScanResult, with its file paths as file:// URIs (null when there's no file). */
export function parseScanResult(json: string): ScanResult {
  const raw = JSON.parse(json);
  return {
    aligned: raw.aligned,
    form: raw.form,
    photoSize: raw.photoSize,
    turned: raw.turned,
    corners: raw.corners,
    sharpness: raw.sharpness,
    sharpMin: raw.sharpMin,
    light: raw.light,
    darkMax: raw.darkMax ?? null,
    terms: raw.terms,
    blanks: raw.blanks,
    reads: raw.reads.map(({ cropFile, ...read }: Omit<BoxRead, 'cropUri'> & { cropFile: string }) => ({
      ...read,
      cropUri: toUri(cropFile),
    })),
    pageUri: toUri(raw.pageFile),
    originalUri: toUri(raw.originalFile),
    scanDir: toUri(raw.scanDir),
    timing: raw.timing,
  };
}
