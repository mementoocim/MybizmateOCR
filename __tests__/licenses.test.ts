import { coveredBy, LICENSES } from '../lib/licenses';

// Design B §9.10: Settings › About › Open-source licenses lists what the app ships, each with its license and its text.
// lib/licenses holds the entries; scripts/collect-licenses.mjs gathers their texts into assets/licenses (`npm run
// licenses`). Jest runs from the repo's root, so the files are read from there.

const fs = require('fs');
const { dependencies } = require('../package.json') as { dependencies: Record<string, string> };

const named = (name: string) => LICENSES.find((entry) => entry.name === name);
const MODEL = 'PP-OCRv6 small, Latin (PaddleOCR)';
const CAMERAX = 'CameraX (AndroidX)';
/** The scanner module's build.gradle: its native libraries and their versions. */
const GRADLE: string = fs.readFileSync('modules/scanner/android/build.gradle', 'utf8');

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
});

test("the design's required notices are there", () => {
  // §9.10: the fonts' OFL 1.1 text, Lucide's ISC notice, and React Native's, Expo's, OpenCV's, ONNX Runtime's and the
  // model's licenses; and PDFium's, which the README says a release has to carry, and CameraX's (ruling T21-1)
  const licenses = Object.fromEntries(LICENSES.map((entry) => [entry.name, entry.license]));
  expect(licenses).toMatchObject({
    'Schibsted Grotesk': 'OFL-1.1',
    'IBM Plex Mono': 'OFL-1.1',
    Lucide: 'ISC',
    OpenCV: 'Apache-2.0',
    'ONNX Runtime': 'MIT',
    PDFium: 'BSD-3-Clause and others',
    [CAMERAX]: 'Apache-2.0',
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
  expect(files).toHaveLength(14); // the table's 13, and CameraX's (ruling T21-1)
  expect(new Set(files).size).toBe(files.length); // and its own

  const shipped: string[] = fs.readdirSync('assets/licenses').filter((file: string) => file.endsWith('.txt'));
  for (const file of files) {
    expect(shipped).toContain(file);
    expect([file, fs.readFileSync(`assets/licenses/${file}`, 'utf8').trim().length > 0]).toEqual([file, true]);
  }
});
