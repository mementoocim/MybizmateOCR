// Gathers the license texts the app shows in Settings › About › Open-source licenses (app/licenses.tsx): a file per
// entry of lib/licenses.ts, assets/licenses/<slug>.txt, which the app bundles as an asset (metro.config.js).
// The sources:
// - an npm package's own LICENSE, in node_modules;
// - Task 0's downloads, the <project>-<license>.txt files in assets/licenses. They stay there as this script's
//   sources, and the app doesn't bundle them (nothing requires them);
// - the fonts' OFL texts, beside the fonts in assets/fonts;
// - pdfium's notices, from the cache scripts/fetch-pdfium.mjs fills (the folder build.gradle builds against): an ABI's
//   LICENSE and every file in its licenses/ (each ABI has the same ones).
// An entry with more than one source has them one after another: each after the first under a "_____" line and its
// file's name, the way ONNX Runtime's own notices part theirs. Line endings become \n.
// Every source is checked before anything is written: a missing one is named, and the script exits 1.
// Usage: npm run licenses   (after a dependency changes; then commit what changed in assets/licenses)
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PDFIUM_DIR } from './fetch-pdfium.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'assets', 'licenses');

/** A source: its file, and the name it goes under after an entry's first. */
const source = (file, title = path.basename(file)) => ({ file: path.resolve(ROOT, file), title });
const npm = (pkg) => [source(`node_modules/${pkg}/LICENSE`)];
const own = (name, title) => source(`assets/licenses/${name}`, title);
const font = (name) => source(`assets/fonts/${name}`);

/** pdfium's: the first ABI folder with a LICENSE (any will do), then each of its licenses/ by name. */
function pdfium() {
  const abis = existsSync(PDFIUM_DIR) ? readdirSync(PDFIUM_DIR).sort() : [];
  const abi = abis.find((name) => existsSync(path.join(PDFIUM_DIR, name, 'LICENSE')));
  if (abi === undefined) return [source(path.join(PDFIUM_DIR, '<ABI>', 'LICENSE'))];
  const notices = path.join(PDFIUM_DIR, abi, 'licenses');
  const names = existsSync(notices) ? readdirSync(notices).sort() : [];
  return [
    source(path.join(PDFIUM_DIR, abi, 'LICENSE')),
    ...(names.length > 0 ? names : ['*']).map((name) => source(path.join(notices, name), `licenses/${name}`)),
  ];
}

// lib/licenses.ts's entries, in its order: each one's file, and where its text comes from.
const ENTRIES = [
  ['react-native', npm('react-native')],
  ['react', npm('react')],
  ['expo', npm('expo')],
  ['react-native-svg', npm('react-native-svg')],
  ['react-native-screens', npm('react-native-screens')],
  ['react-native-safe-area-context', npm('react-native-safe-area-context')],
  ['opencv', [own('opencv-Apache-2.0.txt')]],
  ['onnxruntime', [own('onnxruntime-MIT.txt'), own('onnxruntime-ThirdPartyNotices.txt', 'ThirdPartyNotices.txt')]],
  ['pdfium', pdfium()],
  ['paddleocr', [own('paddleocr-Apache-2.0.txt')]],
  ['lucide', [own('lucide-ISC.txt')]],
  ['schibsted-grotesk', [font('OFL-SchibstedGrotesk.txt')]],
  ['ibm-plex-mono', [font('OFL-IBMPlexMono.txt')]],
];

const missing = ENTRIES.flatMap(([, sources]) => sources)
  .map(({ file }) => file)
  .filter((file) => !existsSync(file) || !statSync(file).isFile());
if (missing.length > 0) {
  for (const file of missing) {
    const shown = file.startsWith(ROOT + path.sep) ? path.relative(ROOT, file) : file;
    console.error(`collect-licenses: can't find ${shown}`);
  }
  if (missing.some((file) => file.startsWith(PDFIUM_DIR))) {
    console.error('collect-licenses: pdfium comes from its cache: run node scripts/fetch-pdfium.mjs first');
  }
  process.exit(1);
}

/** A source's text: \n line endings, without blank lines before it or space after it. */
const textOf = (file) =>
  readFileSync(file, 'utf8')
    .replace(/\r\n?/g, '\n')
    .replace(/^(?:[ \t]*\n)+/, '')
    .trimEnd();

for (const [slug, sources] of ENTRIES) {
  const parts = sources.map(({ file, title }, i) => (i === 0 ? textOf(file) : `_____\n\n${title}\n\n${textOf(file)}`));
  writeFileSync(path.join(OUT, `${slug}.txt`), `${parts.join('\n\n')}\n`);
}
console.log(`collect-licenses: wrote ${ENTRIES.length} files into assets/licenses`);
