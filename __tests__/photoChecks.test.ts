import { FLAG_TEXT, photoFlags } from '../lib/photoChecks';
import type { ScanResult } from '../modules/scanner';
import { parseScanResult } from '../modules/scanner/src/parse';
import { coreJson } from '../test-utils/coreJson';

// Every photo in fixtures/core/expected (export_core_fixtures.py)
const STEMS = [
  'blank_page', 'inv_0001', 'inv_0007', 'inv_0007_large', 'inv_0007_large_exif6', 'inv_0011', 'inv_0017', 'inv_0027',
  'inv_0041', 'inv_0051', 'inv_0051_blur', 'inv_0051_dark', 'inv_0051_dark2', 'inv_0051_exif6', 'inv_0051_shake',
  'inv_0051_turned', 'inv_0091', 'svc_0000', 'svc_0000_blur', 'svc_0000_cw', 'svc_0000_small', 'svc_0000_tilt',
  'svc_0000_top', 'svc_0000_turned', 'svc_0001', 'svc_0002', 'svc_0003',
];

function make(overrides: Partial<ScanResult>): ScanResult {
  return { ...parseScanResult(coreJson('inv_0007')), ...overrides };
}

test('flags match the Python on every fixture', () => {
  expect(STEMS.length).toBe(27);
  for (const stem of STEMS) {
    const expected = require(`../fixtures/core/expected/${stem}.json`);
    expect({ stem, flags: photoFlags(parseScanResult(coreJson(stem))) }).toEqual({ stem, flags: expected.photoFlags });
  }
});

test('rounds like the Python before comparing', () => {
  expect(photoFlags(make({ sharpness: 0.99996, sharpMin: 1, light: 200 }))).toEqual([]); // 1.0
  expect(photoFlags(make({ sharpness: 0.99994, sharpMin: 1, light: 200 }))).toEqual(['blurry']); // 0.9999
  expect(photoFlags(make({ sharpness: 2, sharpMin: 1, light: 49.96 }))).toEqual([]); // 50.0
  expect(photoFlags(make({ sharpness: 0.4, sharpMin: 0.5, light: 30 }))).toEqual(['blurry', 'dark']);
  expect(photoFlags(make({ aligned: false }))).toEqual([]);
});

test('says what each flag means', () => {
  expect(FLAG_TEXT.blurry).toBe('Blurry photo (retake it)');
  expect(FLAG_TEXT.dark).toBe('Dark photo (retake it)');
});
