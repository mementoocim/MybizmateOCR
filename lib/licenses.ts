import { MODEL } from './versions';

// Design B §9.10: what Settings › About › Open-source licenses lists (app/licenses.tsx), each with its license, its
// version and the text the app ships for it (app/license.tsx). The texts are .txt assets that
// scripts/collect-licenses.mjs gathers into assets/licenses, a file each (`npm run licenses`). A version is its
// source's: package.json, the scanner module's build.gradle (with the pdfium release scripts/fetch-pdfium.mjs pins),
// json.hpp's banner or model.json, as a test checks. Lucide's is the tag its glyphs were copied from
// (components/icons.tsx), and a font's is the version its files carry. A test fails when a dependency in package.json,
// one the scanner module's build.gradle implements, or a library its C++ core compiles in has no entry.

export type LicenseEntry = {
  name: string;
  version: string;
  license: string; // "MIT", "Apache-2.0", "BSD-3-Clause and others", "OFL-1.1", "ISC"
  covers: readonly string[]; // package names it covers; "expo-*" covers every expo-* module
  asset: number; // require('../assets/licenses/<file>.txt')
};

/* eslint-disable @typescript-eslint/no-require-imports -- the texts are assets: metro.config.js gives Metro txt as an
   asset extension, which eslint-config-expo's list of asset requires doesn't have */
export const LICENSES: readonly LicenseEntry[] = [
  {
    name: 'React Native',
    version: '0.88.1',
    license: 'MIT',
    covers: ['react-native'],
    asset: require('../assets/licenses/react-native.txt'),
  },
  {
    name: 'React',
    version: '19.3.0',
    license: 'MIT',
    covers: ['react', 'react-dom'],
    asset: require('../assets/licenses/react.txt'),
  },
  {
    name: 'Expo',
    version: '58.0.26',
    license: 'MIT',
    covers: ['expo', 'expo-*'], // every expo- module is Expo's, under the same license
    asset: require('../assets/licenses/expo.txt'),
  },
  {
    name: 'react-native-svg',
    version: '15.16.0',
    license: 'MIT',
    covers: ['react-native-svg'],
    asset: require('../assets/licenses/react-native-svg.txt'),
  },
  {
    name: 'react-native-screens',
    version: '4.30.1',
    license: 'MIT',
    covers: ['react-native-screens'],
    asset: require('../assets/licenses/react-native-screens.txt'),
  },
  {
    name: 'react-native-safe-area-context',
    version: '5.11.1',
    license: 'MIT',
    covers: ['react-native-safe-area-context'],
    asset: require('../assets/licenses/react-native-safe-area-context.txt'),
  },
  // The scanner module's native libraries, which cover what its build.gradle implements (group:artifact) and what its
  // C++ core compiles in (by its folder, third_party/<name>). The rest aren't dependencies, so they cover none: pdfium's
  // prebuilt library, the model, and what's copied into the app (the icons' paths, the fonts).
  {
    name: 'OpenCV',
    version: '5.1.0',
    license: 'Apache-2.0',
    covers: ['org.opencv:opencv'],
    asset: require('../assets/licenses/opencv.txt'),
  },
  {
    name: 'ONNX Runtime',
    version: '1.32.0',
    license: 'MIT', // and its third-party notices, after it
    covers: ['com.microsoft.onnxruntime:onnxruntime-android'],
    asset: require('../assets/licenses/onnxruntime.txt'),
  },
  {
    name: 'CameraX (AndroidX)', // the scanner's camera (ruling T21-1)
    version: '1.7.0',
    license: 'Apache-2.0', // AndroidX ships no NOTICE: the license's text alone
    covers: ['androidx.camera:*'], // camera-core, camera-camera2, camera-lifecycle, camera-view
    asset: require('../assets/licenses/camerax.txt'),
  },
  {
    name: 'PDFium',
    version: 'chromium/8125', // bblanchon/pdfium-binaries' release
    license: 'BSD-3-Clause and others', // the binaries' own notice, then each library's in libpdfium.so
    covers: [],
    asset: require('../assets/licenses/pdfium.txt'),
  },
  {
    name: 'nlohmann/json', // JSON for Modern C++, which the scanner core compiles in (ruling T21-3)
    version: '3.11.3',
    license: 'MIT', // then the notices json.hpp carries for the code it takes from others
    covers: ['third_party/nlohmann'],
    asset: require('../assets/licenses/nlohmann-json.txt'),
  },
  {
    // PaddleOCR's LICENSE, from its main branch at dab3fe35379033fdcb2d0e9572fac0b36c9a9ebf: no tag is pinned for the
    // model (ruling P3)
    name: 'PP-OCRv6 small, Latin (PaddleOCR)',
    version: MODEL.sha256.slice(0, 12), // the model's first 12 hex digits, as each scan keeps it (lib/versions)
    license: 'Apache-2.0',
    covers: [],
    asset: require('../assets/licenses/paddleocr.txt'),
  },
  {
    name: 'Lucide',
    version: '1.77.0',
    license: 'ISC', // and Feather's MIT notice, for the glyphs Lucide took from it
    covers: [],
    asset: require('../assets/licenses/lucide.txt'),
  },
  {
    name: 'Schibsted Grotesk',
    version: '1.100',
    license: 'OFL-1.1',
    covers: [],
    asset: require('../assets/licenses/schibsted-grotesk.txt'),
  },
  {
    name: 'IBM Plex Mono',
    version: '2.3',
    license: 'OFL-1.1',
    covers: [],
    asset: require('../assets/licenses/ibm-plex-mono.txt'),
  },
];
/* eslint-enable @typescript-eslint/no-require-imports */

/**
 * The entry that covers a dependency: a package.json one by its name, a Gradle one by group:artifact, and C++ the
 * scanner core compiles in by its folder (third_party/nlohmann). That's the entry naming it, or naming its prefix and
 * "*" ("expo-*", "androidx.camera:*").
 */
export function coveredBy(dependency: string): LicenseEntry | undefined {
  return LICENSES.find(({ covers }) =>
    covers.some((name) => (name.endsWith('*') ? dependency.startsWith(name.slice(0, -1)) : name === dependency)),
  );
}
