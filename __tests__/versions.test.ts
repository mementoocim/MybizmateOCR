// The app's and the model's versions, which each scan keeps from when it was made, and the version line Settings shows.

let mockConfig: { version?: string; android?: { versionCode?: number } } | null = null;

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return mockConfig;
    },
  },
}));

const V = (): typeof import('../lib/versions') => require('../lib/versions');

beforeEach(() => {
  jest.resetModules();
});

test("the app's version is its config's", () => {
  const { expo } = require('../app.json');
  mockConfig = expo;
  expect(V().APP_VERSION).toBe(expo.version);
  jest.resetModules();
  mockConfig = null;
  expect(V().APP_VERSION).toBe('unknown');
});

test('versionLine shows the build number only when there is one', () => {
  // a release that sets android.versionCode: the version, then the build number
  mockConfig = { version: '1.0.0', android: { versionCode: 12 } };
  expect(V().BUILD_NUMBER).toBe('12');
  expect(V().versionLine()).toBe('1.0.0 (12)');
  // none set: the version alone
  for (const config of [{ version: '1.0.0', android: {} }, { version: '1.0.0' }]) {
    jest.resetModules();
    mockConfig = config;
    expect(V().BUILD_NUMBER).toBeNull();
    expect(V().versionLine()).toBe('1.0.0');
  }
  // the app's own app.json, whatever it sets: its version, then its android.versionCode once a release sets one
  jest.resetModules();
  const { expo } = require('../app.json');
  mockConfig = expo;
  const code: number | undefined = expo.android?.versionCode;
  expect(V().BUILD_NUMBER).toBe(code === undefined ? null : String(code));
  expect(V().versionLine()).toBe(code === undefined ? expo.version : `${expo.version} (${code})`);
  // no config at all: no build number either
  jest.resetModules();
  mockConfig = null;
  expect(V().BUILD_NUMBER).toBeNull();
});

test('model.json is the shipped model', () => {
  const onnx: Uint8Array = require('fs').readFileSync('modules/scanner/assets/scanner/inference_latin.onnx'); // jest runs from the repo's root
  const sha256: string = require('crypto').createHash('sha256').update(onnx).digest('hex');
  const { MODEL, modelVersion } = V();
  expect(MODEL).toEqual({ name: 'PP-OCRv6 small, Latin cut, pretrained', sha256, bytes: onnx.length });
  expect(modelVersion()).toBe(`PP-OCRv6 small, Latin cut, pretrained ${sha256.slice(0, 12)}`);
});
