import ScannerModule from './src/ScannerModule';

export type CoreInfo = { opencv: string; onnxruntime: string };

/** The libraries the C++ scanner core was built with. */
export function coreInfo(): CoreInfo {
  return JSON.parse(ScannerModule.coreInfo());
}
