import { requireNativeModule } from 'expo';

// The native side: ScannerModule.kt (Android). Strings in, JSON strings out; index.ts parses them.
type ScannerNative = {
  coreInfo(): string;
};

export default requireNativeModule<ScannerNative>('Scanner');
