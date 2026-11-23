// Gathers the license texts the app shows in Settings › About › Open-source licenses (app/licenses.tsx): a file per
// entry of lib/licenses.ts, assets/licenses/<slug>.txt, which the app bundles as an asset (metro.config.js).
// The sources:
// - an npm package's own LICENSE, in node_modules;
// - Task 0's downloads, the <project>-<license>.txt files in assets/licenses. They stay there as this script's
//   sources, and the app doesn't bundle them (nothing requires them);
// - for CameraX, the Apache-2.0 text alone, since AndroidX ships no LICENSE or NOTICE of its own. That's OpenCV's
//   Task 0 file, which is apache.org's LICENSE-2.0.txt byte for byte;
// - pdfium's notices, from the cache scripts/fetch-pdfium.mjs fills (the folder build.gradle builds against): an ABI's
//   LICENSE and every file in its licenses/ (each ABI has the same ones);
// - for nlohmann/json, which the scanner core compiles in, a text built from the vendored json.hpp itself (ruling
//   T21-3): the MIT license with json.hpp's copyright, then the notices json.hpp carries for the code it takes from
//   others, quoted from its comments, with the Apache-2.0 text after the Abseil-derived code's (ruling T21-5);
// - the fonts' OFL texts, beside the fonts in assets/fonts.
// A source is read as UTF-8, or as Latin-1 where it isn't valid UTF-8 (PDFium's licenses/freetype.txt), so no
// character turns into U+FFFD; each source read as Latin-1 is named on stdout. An entry with more than one source has
// them one after another: each after the first under a "_____" line and its file's name, the way ONNX Runtime's own
// notices part theirs. Line endings become \n.
// Every source is checked, and every text built, before anything is written: a missing source, or a notice json.hpp
// no longer has, is named, and the script exits 1.
// Usage: npm run licenses   (after a dependency changes; then commit what changed in assets/licenses)
//        node scripts/collect-licenses.mjs [folder]   (writes the texts into that folder instead: a test's scratch one)
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PDFIUM_DIR } from './fetch-pdfium.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_NAME = process.argv[2] ?? 'assets/licenses';
const OUT = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ROOT, 'assets', 'licenses');

/** A file as the messages name it: from the repo's root when it's in the repo, else in full (pdfium's cache). */
const shown = (file) => (file.startsWith(ROOT + path.sep) ? path.relative(ROOT, file) : file);

const utf8 = new TextDecoder('utf-8', { fatal: true });
/** The sources read as Latin-1, each named once on stdout: one stray byte sends a whole file there. */
const latin1 = new Set();

/**
 * A file's text: UTF-8, or Latin-1 where it isn't valid UTF-8 (FreeType's notice, whose © is the one byte A9); with \n
 * line endings, and without blank lines before it or space after it.
 */
function textOf(file) {
  const bytes = readFileSync(file);
  let text;
  try {
    text = utf8.decode(bytes);
  } catch {
    text = bytes.toString('latin1');
    if (!latin1.has(file)) console.log(`collect-licenses: read ${shown(file)} as Latin-1: it isn't UTF-8`);
    latin1.add(file);
  }
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/^(?:[ \t]*\n)+/, '')
    .trimEnd();
}

/** A source: the files it reads, its text, and the name it goes under after an entry's first. */
function source(file, title = path.basename(file)) {
  const resolved = path.resolve(ROOT, file);
  return { files: [resolved], title, text: () => textOf(resolved) };
}
const npm = (pkg) => [source(`node_modules/${pkg}/LICENSE`)];
const own = (name, title) => source(`assets/licenses/${name}`, title);
const font = (name) => source(`assets/fonts/${name}`);

/**
 * The Apache-2.0 license's own text: apache.org's LICENSE-2.0.txt, byte for byte (SHA-256
 * cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30), which is what OpenCV's LICENSE is.
 */
const APACHE_2_0 = own('opencv-Apache-2.0.txt');

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

const JSON_HPP = 'modules/scanner/cpp/third_party/nlohmann/json.hpp';
/** The MIT license's text: nlohmann/json's takes it from its permission notice on, without react's copyright line. */
const MIT_TEXT = 'node_modules/react/LICENSE';

/**
 * The code json.hpp takes from others (ruling T21-3): the holder its SPDX copyright line names, then its comment's
 * words on what the code is or where it's from, from the line holding `from` to the next one holding `to`, after any
 * copyright line of the comment's own (the SPDX line gives it already). Code under another license than the MIT one
 * above it has that license's text after its notice, so the entry stands alone (ruling T21-5).
 */
const JSON_NOTICES = [
  { title: 'Hedley', holder: 'Evan Nemerson', from: '/* Hedley - ', to: 'Created by Evan Nemerson' },
  {
    title: 'Code from Google Abseil',
    holder: 'The Abseil Authors',
    from: 'The following code is taken from https://github.com/abseil/',
    to: 'licensed under the Apache License 2.0.',
    license: APACHE_2_0,
  },
  {
    title: "Björn Hoehrmann's UTF-8 decoder",
    holder: 'Hoehrmann',
    from: '@sa http://bjoern.hoehrmann.de/', // the line under its @copyright line
    to: '@sa http://bjoern.hoehrmann.de/',
  },
  {
    title: "Florian Loitsch's Grisu2",
    holder: 'Florian Loitsch',
    from: '@brief implements the Grisu2 algorithm',
    to: 'The code is distributed under the MIT license',
  },
];

/** json.hpp's SPDX copyright line for a holder, as a notice: "Copyright (c) 2013-2023 Niels Lohmann". */
function copyrightIn(lines, holder) {
  for (const line of lines) {
    const spdx = /SPDX-FileCopyrightText: (.+?)(?:\s*<[^>]*>)?\s*$/.exec(line);
    if (spdx && spdx[1].includes(holder)) return `Copyright (c) ${spdx[1]}`;
  }
  throw new Error(`${JSON_HPP} has no SPDX copyright line for ${holder}`);
}

/** A comment in json.hpp, from the line holding `from` to the next one holding `to`, without its comment marks. */
function commentIn(lines, { title, from, to }) {
  const start = lines.findIndex((line) => line.includes(from));
  const end = start < 0 ? -1 : lines.findIndex((line, i) => i >= start && line.includes(to));
  if (end < 0) throw new Error(`${JSON_HPP} no longer has the notice for ${title}`);
  return lines
    .slice(start, end + 1)
    .map((line) => line.replace(/^\s*(?:\/\/+|\/\*+!?|\*(?!\/))?\s*(?:@(?:brief|copyright|sa)\s+)?/, '').trimEnd())
    .join('\n');
}

/**
 * nlohmann/json's: the MIT license with json.hpp's own copyright, then each notice json.hpp carries, with its license's
 * text where it has one of its own.
 */
function nlohmannJson() {
  const [hppFile, mitFile] = [JSON_HPP, MIT_TEXT].map((file) => path.resolve(ROOT, file));
  const text = () => {
    const lines = textOf(hppFile).split('\n');
    const mit = textOf(mitFile);
    const permission = mit.indexOf('Permission is hereby granted');
    if (permission < 0) throw new Error(`${MIT_TEXT} isn't the MIT license's text`);
    const license = `MIT License\n\n${copyrightIn(lines, 'Niels Lohmann')}\n\n${mit.slice(permission)}`;
    const notices = JSON_NOTICES.map((notice) => {
      const quoted = [copyrightIn(lines, notice.holder), commentIn(lines, notice)];
      if (notice.license) quoted.push(notice.license.text());
      return ['_____', `${notice.title}, in json.hpp`, ...quoted].join('\n\n');
    });
    return [license, ...notices].join('\n\n');
  };
  const licenses = JSON_NOTICES.flatMap((notice) => notice.license?.files ?? []);
  return [{ files: [hppFile, mitFile, ...licenses], title: 'json.hpp', text }];
}

// lib/licenses.ts's entries, in its order: each one's file, and where its text comes from.
const ENTRIES = [
  ['react-native', npm('react-native')],
  ['react', npm('react')],
  ['expo', npm('expo')],
  ['react-native-svg', npm('react-native-svg')],
  ['react-native-screens', npm('react-native-screens')],
  ['react-native-safe-area-context', npm('react-native-safe-area-context')],
  ['opencv', [APACHE_2_0]],
  ['onnxruntime', [own('onnxruntime-MIT.txt'), own('onnxruntime-ThirdPartyNotices.txt', 'ThirdPartyNotices.txt')]],
  ['camerax', [APACHE_2_0]], // ruling T21-1
  ['pdfium', pdfium()],
  ['nlohmann-json', nlohmannJson()], // ruling T21-3
  ['paddleocr', [own('paddleocr-Apache-2.0.txt')]],
  ['lucide', [own('lucide-ISC.txt')]],
  ['schibsted-grotesk', [font('OFL-SchibstedGrotesk.txt')]],
  ['ibm-plex-mono', [font('OFL-IBMPlexMono.txt')]],
];

const missing = ENTRIES.flatMap(([, sources]) => sources)
  .flatMap(({ files }) => files)
  .filter((file) => !existsSync(file) || !statSync(file).isFile());
if (missing.length > 0) {
  for (const file of missing) console.error(`collect-licenses: can't find ${shown(file)}`);
  if (missing.some((file) => file.startsWith(PDFIUM_DIR))) {
    console.error('collect-licenses: pdfium comes from its cache: run node scripts/fetch-pdfium.mjs first');
  }
  process.exit(1);
}

let texts;
try {
  texts = ENTRIES.map(([slug, sources]) => [
    slug,
    sources.map(({ title, text }, i) => (i === 0 ? text() : `_____\n\n${title}\n\n${text()}`)).join('\n\n'),
  ]);
} catch (error) {
  console.error(`collect-licenses: ${error.message}`);
  process.exit(1);
}
for (const [slug, text] of texts) writeFileSync(path.join(OUT, `${slug}.txt`), `${text}\n`);
console.log(`collect-licenses: wrote ${texts.length} files into ${OUT_NAME}`);
