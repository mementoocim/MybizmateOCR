import { parseScanResult } from './src/parse';
import ScannerModule from './src/ScannerModule';
import type { CoreInfo, ScanResult } from './src/types';

export { parseScanResult } from './src/parse';
export type { BoxRead, CoreInfo, FieldType, ScanResult } from './src/types';

/** The libraries the C++ scanner core was built with. */
export function coreInfo(): CoreInfo {
  return JSON.parse(ScannerModule.coreInfo());
}

/** Loads the model and the form once, so the first scan doesn't wait for it. */
export function preload(): Promise<void> {
  return ScannerModule.preload();
}

/**
 * Reads a photo (a file:// or content:// URI). Rejects with code ERR_UNREADABLE_IMAGE when the file isn't a photo the
 * scanner can open.
 */
export async function scanPhoto(uri: string): Promise<ScanResult> {
  return parseScanResult(await ScannerModule.scanPhoto(uri));
}
