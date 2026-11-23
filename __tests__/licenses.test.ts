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
/** The C++ the scanner core compiles in, each library in its own folder. */
const THIRD_PARTY = 'modules/scanner/cpp/third_party';
/** What a decoder writes for bytes it can't read: U+FFFD. */
const REPLACEMENT = String.fromCharCode(0xfffd);

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

  // and what the scanner module ships, by its build.gradle's implementation lines (group:artifact); its test-only
  // libraries don't ship
  const native = [...GRADLE.matchAll(/^\s*implementation\s+"([^":]+:[^":]+):/gm)].map((match) => match[1]);
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

test("each version is its source's: package.json, the scanner module's build.gradle, model.json", () => {
  // package.json's version, without its range's ~ or ^
  for (const dependency of [
    'react-native',
    'react',
    'expo',
    'react-native-svg',
    'react-native-screens',
    'react-native-safe-area-context',
  ]) {
    expect([dependency, coveredBy(dependency)?.version]).toEqual([dependency, dependencies[dependency].replace(/^[~^]/, '')]);
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

test("nlohmann/json's text: the MIT license with json.hpp's copyright, then the notices json.hpp carries", () => {
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
    'Copyright (c) 2008-2009 Bjoern Hoehrmann <bjoern@hoehrmann.de>\nhttp://bjoern.hoehrmann.de/utf-8/decoder/dfa/',
    'Copyright (c) 2009 Florian Loitsch\n\nimplements the Grisu2 algorithm for binary to decimal floating-point',
    'The code is distributed under the MIT license, Copyright (c) 2009 Florian Loitsch.',
  ]) {
    expect(text).toContain(notice);
  }
  expect(text).not.toMatch(/^\s*(?:\/\/|\/\*|\*\/|@brief|@copyright|@sa)/m); // the comments' marks don't come along
});

test('no text holds U+FFFD, the mark of a source read in the wrong encoding', () => {
  const texts: string[] = fs.readdirSync('assets/licenses').filter((file: string) => file.endsWith('.txt'));
  expect(texts.filter((file) => fs.readFileSync(`assets/licenses/${file}`, 'utf8').includes(REPLACEMENT))).toEqual([]);
  // FreeType's notice is Latin-1 (PDFium's licenses/freetype.txt): the credit line it asks for keeps its ©
  const pdfium: string = fs.readFileSync('assets/licenses/pdfium.txt', 'utf8');
  expect(pdfium).toContain('Portions of this software are copyright © <year> The FreeType');
});
