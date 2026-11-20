import { parseScanResult } from './src/parse';
import ScannerModule from './src/ScannerModule';
import type { CoreInfo, ScanOptions, ScanResult, ScannerStats } from './src/types';

export { parseScanResult } from './src/parse';
export { ScannerCameraView } from './src/ScannerCameraView';
export type { CameraErrorCode, CameraStatus, ScannerCameraProps, ScannerCameraRef } from './src/ScannerCameraView';
export type { BoxRead, CoreInfo, FieldType, FormName, ScanOptions, ScanResult, ScannerStats } from './src/types';

/** The libraries the C++ scanner core was built with. */
export function coreInfo(): CoreInfo {
  return JSON.parse(ScannerModule.coreInfo());
}

/** Loads the model and the forms once, so the first scan doesn't wait for it. */
export function preload(): Promise<void> {
  return ScannerModule.preload();
}

/**
 * Reads a photo (a file:// or content:// URI). Rejects with code ERR_UNREADABLE_IMAGE when the file isn't a photo the
 * scanner can open.
 */
export async function scanPhoto(uri: string, options?: ScanOptions): Promise<ScanResult> {
  return parseScanResult(await ScannerModule.scanPhoto(uri, options ?? {}));
}

/** The scan view's Enhanced or B&W image of a scan's page (made once, then reused): its file:// URI. */
export function enhance(pageUri: string, mode: 'enhanced' | 'bw'): Promise<string> {
  return ScannerModule.enhance(pageUri, mode);
}

/**
 * Copies an image into the phone's Pictures/MyBizMate Scan; resolves to its file name. Rejects with
 * ERR_SAVE_NEEDS_ANDROID_10 before Android 10, or ERR_SAVE_FAILED.
 */
export function saveToPictures(fileUri: string): Promise<string> {
  return ScannerModule.saveToPictures(fileUri);
}

/** How long the scanner took to start, and the app's peak memory so far (for the team's speed test). */
export function stats(): Promise<ScannerStats> {
  return ScannerModule.stats();
}
