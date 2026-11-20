import type { ScanResult } from '../modules/scanner';

// The photo checks, as the Python flags them (postprocess.py:449-455 on photo_quality.quality()'s rounded measures):
// blurry when the sharpness, rounded to 4 decimals, is under the form's minimum; dark when the light, rounded to 1
// decimal, is under 50. Both strict, blurry first.
export type PhotoFlag = 'blurry' | 'dark';

export const FLAG_TEXT: Record<PhotoFlag, string> = {
  blurry: 'Blurry photo (retake it)',
  dark: 'Dark photo (retake it)',
};

const DARK_MAX = 50;

/** Python's round(x, digits) for these measures: halves go to even. */
function pyRound(x: number, digits: number): number {
  const m = 10 ** digits;
  const v = x * m;
  const r = Math.round(v);
  const tie = Math.abs(v - Math.trunc(v)) === 0.5;
  return (tie && r % 2 !== 0 ? r - 1 : r) / m;
}

export function photoFlags(r: ScanResult): PhotoFlag[] {
  if (!r.aligned || r.sharpness == null || r.sharpMin == null || r.light == null) return [];
  const flags: PhotoFlag[] = [];
  if (pyRound(r.sharpness, 4) < r.sharpMin) flags.push('blurry');
  if (pyRound(r.light, 1) < (r.darkMax ?? DARK_MAX)) flags.push('dark');
  return flags;
}
