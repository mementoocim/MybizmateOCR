import { coveredBy, LICENSES } from '../lib/licenses';

// Design B §9.10: Settings › About › Open-source licenses lists what the app ships, each with its license and its text.
// lib/licenses holds the entries; scripts/collect-licenses.mjs gathers their texts into assets/licenses (`npm run
// licenses`). Jest runs from the repo's root, so the files are read from there.

const fs = require('fs');
const { dependencies } = require('../package.json') as { dependencies: Record<string, string> };

const named = (name: string) => LICENSES.find((entry) => entry.name === name);
const MODEL = 'PP-OCRv6 small, Latin (PaddleOCR)';
const CAMERAX = 'CameraX (AndroidX)';
const JSON_LIBRARY = 'nlohmann/json';
/** The scanner module's build.gradle: its native libraries and their versions. */
const GRADLE: string = fs.readFileSync('modules/scanner/android/build.gradle', 'utf8');
/** A Gradle dependency the app ships: implementation, api or runtimeOnly, then its "group:artifact:…" in either quotes. */
const SHIPS = /^\s*(?:implementation|api|runtimeOnly)\s*\(?\s*["']([^"':]+:[^"':]+):/gm;
/** The C++ the scanner core compiles in, each library in its own folder. */
const THIRD_PARTY = 'modules/scanner/cpp/third_party';
/** What a decoder writes for bytes it can't read: U+FFFD. */
const REPLACEMENT = String.fromCharCode(0xfffd);
/** The Apache-2.0 license's own text, which the script takes for every entry that needs it (ruling T21-1, T21-5). */
const APACHE_2_0 = 'assets/licenses/opencv-Apache-2.0.txt';

/** A source's text as the script reads it: \n line endings, from its first line with text, with no space after it. */
const textOf = (file: string): string =>
  fs
    .readFileSync(file, 'utf8')
    .replace(/\r\n?/g, '\n')
    .replace(/^(?:[ \t]*\n)+/, '')
    .trimEnd();

test('every production dependency is covered', () => {
  const uncovered = Object.keys(dependencies).filter((dependency) => coveredBy(dependency) === undefined);
  expect(uncovered).toEqual([]);

  // each by its own entry: every expo-* module by Expo's, react-dom by React's, react-native-svg by its own
  expect(coveredBy('expo')).toBe(named('Expo'));
  expect(coveredBy('expo-font')).toBe(named('Expo'));
  expect(coveredBy('expo-haptics')).toBe(named('Expo'));
  expect(coveredBy('react')).toBe(named('React'));
  expect(coveredBy('react-dom')).toBe(named('React'));
  expect(coveredBy('react-native')).toBe(named('React Native'));
  expect(coveredBy('react-native-svg')).toBe(named('react-native-svg'));
  // a dependency with no entry has none, so the first check names it
  expect(coveredBy('left-pad')).toBeUndefined();
  expect(coveredBy('expolorer')).toBeUndefined(); // "expo-*" is the expo- prefix

  // and what the scanner module ships, by its build.gradle's dependencies (group:artifact) that reach the app: its
  // implementation, api and runtimeOnly lines, in either quotes, with or without parentheses. Its test-only and
  // compile-only libraries don't ship.
  const shipped = (gradle: string) => [...gradle.matchAll(SHIPS)].map((match) => match[1]);
  expect(
    shipped(
      [
        'implementation "a.b:c:${v}"',
        "  implementation 'a.b:d:1.0'",
        'api "a.b:e:1.0"',
        "runtimeOnly 'a.b:f:1.0'",
        'implementation("a.b:g:1.0")',
        "implementation ('a.b:h:1.0')",
        'testImplementation "junit:junit:4.13.2"',
        'compileOnly "a.b:i:1.0"',
        '// implementation "a.b:j:1.0"',
      ].join('\n'),
    ),
  ).toEqual(['a.b:c', 'a.b:d', 'a.b:e', 'a.b:f', 'a.b:g', 'a.b:h']);
  const native = shipped(GRADLE);
  expect(native).toEqual(
    expect.arrayContaining(['org.opencv:opencv', 'com.microsoft.onnxruntime:onnxruntime-android', 'androidx.camera:camera-core']),
  );
  expect(native.filter((dependency) => coveredBy(dependency) === undefined)).toEqual([]);
  expect(coveredBy('org.opencv:opencv')).toBe(named('OpenCV'));
  expect(coveredBy('com.microsoft.onnxruntime:onnxruntime-android')).toBe(named('ONNX Runtime'));
  for (const camera of ['camera-core', 'camera-camera2', 'camera-lifecycle', 'camera-view']) {
    expect(coveredBy(`androidx.camera:${camera}`)).toBe(named(CAMERAX)); // "androidx.camera:*"
  }
  expect(coveredBy('androidx.core:core')).toBeUndefined();

  // and the C++ the scanner core compiles in (cpp/CMakeLists.txt puts third_party on its include path), by its folder.
  // doctest is the core's tests' alone (cpp/tests): no core source includes it, so it doesn't ship.
  const vendored: string[] = fs.readdirSync(THIRD_PARTY).filter((folder: string) => folder !== 'doctest');
  expect(vendored).toContain('nlohmann');
  expect(vendored.filter((folder) => coveredBy(`third_party/${folder}`) === undefined)).toEqual([]);
  expect(coveredBy('third_party/nlohmann')).toBe(named(JSON_LIBRARY));
  const core: string[] = fs.readdirSync('modules/scanner/cpp/core');
  const testing = core.filter((file) => fs.readFileSync(`modules/scanner/cpp/core/${file}`, 'utf8').includes('doctest'));
  expect(testing).toEqual([]);
});

test("the design's required notices are there", () => {
  // §9.10: the fonts' OFL 1.1 text, Lucide's ISC notice, and React Native's, Expo's, OpenCV's, ONNX Runtime's and the
  // model's licenses; and PDFium's, which the README says a release has to carry, CameraX's (ruling T21-1) and
  // nlohmann/json's, which the scanner core compiles in
  const licenses = Object.fromEntries(LICENSES.map((entry) => [entry.name, entry.license]));
  expect(licenses).toMatchObject({
    'Schibsted Grotesk': 'OFL-1.1',
    'IBM Plex Mono': 'OFL-1.1',
    Lucide: 'ISC',
    OpenCV: 'Apache-2.0',
    'ONNX Runtime': 'MIT',
    PDFium: 'BSD-3-Clause and others',
    [CAMERAX]: 'Apache-2.0',
    [JSON_LIBRARY]: 'MIT',
    'React Native': 'MIT',
    Expo: 'MIT',
    [MODEL]: 'Apache-2.0',
  });
});

test("each version is its source's: the installed package, the scanner module's build.gradle, model.json", () => {
  // the version installed, which is what ships: node_modules/<package>/package.json's, not package.json's range (whose
  // floor an update leaves behind)
  const installed = (pkg: string): string => JSON.parse(fs.readFileSync(`node_modules/${pkg}/package.json`, 'utf8')).version;
  for (const dependency of [
    'react-native',
    'react',
    'expo',
    'react-native-svg',
    'react-native-screens',
    'react-native-safe-area-context',
  ]) {
    expect([dependency, coveredBy(dependency)?.version]).toEqual([dependency, installed(dependency)]);
  }
  expect(named('OpenCV')?.version).toBe(/def opencvVersion = '([^']+)'/.exec(GRADLE)?.[1]);
  expect(named('ONNX Runtime')?.version).toBe(/def ortVersion = '([^']+)'/.exec(GRADLE)?.[1]);
  expect(named(CAMERAX)?.version).toBe(/def cameraxVersion = '([^']+)'/.exec(GRADLE)?.[1]);
  // the release build.gradle's fetchPdfium task fetches: the one scripts/fetch-pdfium.mjs pins
  const fetchPdfium: string = fs.readFileSync('scripts/fetch-pdfium.mjs', 'utf8');
  expect(named('PDFium')?.version).toBe(/const RELEASE = '([^']+)'/.exec(fetchPdfium)?.[1]);
  expect(GRADLE).toContain(`pdfium/${named('PDFium')?.version.replace('/', '-')}`); // its cache folder
  // json.hpp's banner, line 3: "version 3.11.3"
  const jsonHpp: string[] = fs.readFileSync(`${THIRD_PARTY}/nlohmann/json.hpp`, 'utf8').split('\n');
  expect(named(JSON_LIBRARY)?.version).toBe(/\bversion (\d+\.\d+\.\d+)\b/.exec(jsonHpp[2])?.[1]);
  // the model's first 12 hex digits, as each scan keeps it (lib/versions)
  const model: { sha256: string } = JSON.parse(fs.readFileSync('modules/scanner/assets/scanner/model.json', 'utf8'));
  expect(named(MODEL)?.version).toBe(model.sha256.slice(0, 12));
});

test("every entry's text file exists and isn't empty", () => {
  // Jest maps every .txt to one stub (package.json's moduleNameMapper), so each entry's file is read from its require
  // (a file's name, not the type's "<file>.txt").
  const source: string = fs.readFileSync('lib/licenses.ts', 'utf8');
  const files = [...source.matchAll(/require\('\.\.\/assets\/licenses\/([\w.-]+\.txt)'\)/g)].map((match) => match[1]);
  expect(files).toHaveLength(LICENSES.length); // one each
  expect(files).toHaveLength(15); // the table's 13, CameraX's (ruling T21-1) and nlohmann/json's
  expect(new Set(files).size).toBe(files.length); // and its own

  const shipped: string[] = fs.readdirSync('assets/licenses').filter((file: string) => file.endsWith('.txt'));
  for (const file of files) {
    expect(shipped).toContain(file);
    expect([file, fs.readFileSync(`assets/licenses/${file}`, 'utf8').trim().length > 0]).toEqual([file, true]);
  }
});

test('the script writes the very files lib/licenses requires, so no text is orphaned', () => {
  // scripts/collect-licenses.mjs's entries, each its slug and its sources: <slug>.txt is the file it writes. A checkout
  // may give it \r\n.
  const script: string = fs.readFileSync('scripts/collect-licenses.mjs', 'utf8').replace(/\r\n/g, '\n');
  const entries = /\nconst ENTRIES = \[\n([\s\S]*?)\n\];/.exec(script)?.[1] ?? '';
  const written = [...entries.matchAll(/^\s*\['([\w-]+)', /gm)].map((match) => `${match[1]}.txt`);
  const source: string = fs.readFileSync('lib/licenses.ts', 'utf8');
  const required = [...source.matchAll(/require\('\.\.\/assets\/licenses\/([\w.-]+\.txt)'\)/g)].map((match) => match[1]);
  expect(written).toHaveLength(LICENSES.length);
  expect([...written].sort()).toEqual([...required].sort());

  // and every other text in assets/licenses is one the script reads: Task 0's downloads, <project>-<license>.txt
  const read = [...script.matchAll(/\bown\('([\w.-]+\.txt)'/g)].map((match) => match[1]);
  const others = fs
    .readdirSync('assets/licenses')
    .filter((file: string) => file.endsWith('.txt') && !written.includes(file));
  expect(others.sort()).toEqual([...new Set(read)].sort());
});

test("nlohmann/json's text: the MIT license with json.hpp's copyright, then the notices json.hpp carries, Abseil's with Apache-2.0's text", () => {
  // built from the vendored json.hpp and the MIT text react ships (ruling T21-3); a checkout may give it \r\n
  const text = fs.readFileSync('assets/licenses/nlohmann-json.txt', 'utf8').replace(/\r\n/g, '\n');
  expect(text).toMatch(/^MIT License\n\nCopyright \(c\) 2013-2023 Niels Lohmann\n\nPermission is hereby granted, free/);
  expect(text).toContain('IN NO EVENT SHALL THE\nAUTHORS OR COPYRIGHT HOLDERS BE LIABLE');
  expect(text).not.toContain('Meta Platforms'); // the MIT text's own copyright line stays out
  // each embedded notice, with its holder, quoted from json.hpp's comments
  for (const notice of [
    'Copyright (c) 2016-2021 Evan Nemerson\n\nHedley - https://nemequ.github.io/hedley\nCreated by Evan Nemerson',
    'Copyright (c) 2018 The Abseil Authors\n\nThe following code is taken from https://github.com/abseil/abseil-cpp/',
    'which is part of Google Abseil (https://github.com/abseil/abseil-cpp), licensed under the Apache License 2.0.',
    'Copyright (c) 2008-2009 Björn Hoehrmann\n\nhttp://bjoern.hoehrmann.de/utf-8/decoder/dfa/',
    'Copyright (c) 2009 Florian Loitsch\n\nimplements the Grisu2 algorithm for binary to decimal floating-point',
    'The code is distributed under the MIT license, Copyright (c) 2009 Florian Loitsch.',
  ]) {
    expect(text).toContain(notice);
  }
  expect(text).not.toMatch(/^\s*(?:\/\/|\/\*|\*\/|@brief|@copyright|@sa)/m); // the comments' marks don't come along
  // each holder's copyright once, as json.hpp's SPDX line gives it: no quoted comment repeats it
  for (const holder of ['Niels Lohmann', 'Evan Nemerson', 'The Abseil Authors', 'Hoehrmann', 'Florian Loitsch']) {
    const lines = text.split('\n').filter((line: string) => line.startsWith('Copyright (c)') && line.includes(holder));
    expect([holder, lines.length]).toEqual([holder, 1]);
  }

  // Ruling T21-5: the Abseil-derived code is under Apache-2.0, so that license's text follows its notice, and the entry
  // stands alone. It's the canonical text, apache.org's LICENSE-2.0.txt byte for byte, as OpenCV's entry has it.
  expect(text).toContain(
    `licensed under the Apache License 2.0.\n\n${textOf(APACHE_2_0)}\n\n_____\n\nBjörn Hoehrmann's UTF-8 decoder, in json.hpp`,
  );
  const canonical = fs.readFileSync(APACHE_2_0, 'utf8').replace(/\r\n/g, '\n'); // a checkout may give it \r\n
  expect(require('crypto').createHash('sha256').update(canonical).digest('hex')).toBe(
    'cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30',
  );
});

test('no text holds U+FFFD, the mark of a source read in the wrong encoding', () => {
  const texts: string[] = fs.readdirSync('assets/licenses').filter((file: string) => file.endsWith('.txt'));
  expect(texts.filter((file) => fs.readFileSync(`assets/licenses/${file}`, 'utf8').includes(REPLACEMENT))).toEqual([]);
  // FreeType's notice is Latin-1 (PDFium's licenses/freetype.txt): the credit line it asks for keeps its ©
  const pdfium: string = fs.readFileSync('assets/licenses/pdfium.txt', 'utf8');
  expect(pdfium).toContain('Portions of this software are copyright © <year> The FreeType');
});

test("the script reads a source that isn't UTF-8 as Latin-1, keeps its characters, and names it on stdout", () => {
  // The script as `npm run licenses` runs it, but writing into a scratch folder, with a pdfium cache of its own: its
  // LICENSE and one notice in UTF-8, and one in Latin-1 whose © is the one byte A9, as FreeType's is. The other sources
  // are the repo's.
  const os = require('os');
  const path = require('path');
  const { Buffer } = require('buffer');
  const { spawnSync } = require('child_process');
  const scratch: string = fs.mkdtempSync(path.join(os.tmpdir(), 'collect-licenses-'));
  try {
    // where scripts/fetch-pdfium.mjs keeps its cache, under the LOCALAPPDATA (Windows) or HOME the script is given
    const cache: string =
      process.platform === 'win32'
        ? path.join(scratch, 'mbs-cxx', 'pdfium', 'chromium-8125')
        : path.join(scratch, '.cache', 'mbs-pdfium', 'chromium-8125');
    const notices: string = path.join(cache, 'arm64-v8a', 'licenses');
    fs.mkdirSync(notices, { recursive: true });
    fs.writeFileSync(path.join(cache, 'arm64-v8a', 'LICENSE'), 'Copyright © 2014 The PDFium Authors\n');
    fs.writeFileSync(path.join(notices, 'zlib.txt'), 'Copyright © 1995-2024 Jean-loup Gailly and Mark Adler\n');
    const [before, after] = ['Portions of this software are copyright ', ' <year> The FreeType\n'].map((s) => Buffer.from(s));
    fs.writeFileSync(path.join(notices, 'freetype.txt'), Buffer.concat([before, Buffer.from([0xa9]), after]));
    const out: string = path.join(scratch, 'out');
    fs.mkdirSync(out);

    const run = spawnSync(process.execPath, ['scripts/collect-licenses.mjs', out], {
      encoding: 'utf8',
      env: { ...process.env, LOCALAPPDATA: scratch, HOME: scratch },
    });
    expect([run.status, run.stderr]).toEqual([0, '']);
    // the Latin-1 source, named in full; none of the UTF-8 ones
    const named: string[] = run.stdout.split(/\r?\n/).filter((line: string) => line.includes('Latin-1'));
    expect(named).toEqual([`collect-licenses: read ${path.join(notices, 'freetype.txt')} as Latin-1: it isn't UTF-8`]);
    // and its ©, as the UTF-8 sources keep theirs
    const pdfium: string = fs.readFileSync(path.join(out, 'pdfium.txt'), 'utf8');
    expect(pdfium).toContain('Portions of this software are copyright © <year> The FreeType');
    expect(pdfium).toContain('Copyright © 1995-2024 Jean-loup Gailly and Mark Adler');
    expect(pdfium).not.toContain(REPLACEMENT);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});
