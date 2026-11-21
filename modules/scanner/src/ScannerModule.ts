import { requireNativeModule } from 'expo';

import type { ScanOptions, ScannerStats } from './types';

// The native side: ScannerModule.kt (Android). Strings in, JSON strings out; index.ts parses them.
type ScannerNative = {
  coreInfo(): string;
  preload(): Promise<void>;
  scanPhoto(uri: string, options: ScanOptions): Promise<string>;
  readPdf(uri: string): Promise<string>;
  enhance(pageUri: string, mode: 'enhanced' | 'bw'): Promise<string>;
  saveToPictures(fileUri: string): Promise<string>;
  stats(): Promise<ScannerStats>;
};

export default requireNativeModule<ScannerNative>('Scanner');
