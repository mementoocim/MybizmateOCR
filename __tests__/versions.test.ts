// The app's and the model's versions, which each scan keeps from when it was made.

let mockConfig: { version?: string } | null = null;

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

test('model.json is the shipped model', () => {
  const onnx: Uint8Array = require('fs').readFileSync('modules/scanner/assets/scanner/inference_latin.onnx'); // jest runs from the repo's root
  const sha256: string = require('crypto').createHash('sha256').update(onnx).digest('hex');
  const { MODEL, modelVersion } = V();
  expect(MODEL).toEqual({ name: 'PP-OCRv6 small, Latin cut, pretrained', sha256, bytes: onnx.length });
  expect(modelVersion()).toBe(`PP-OCRv6 small, Latin cut, pretrained ${sha256.slice(0, 12)}`);
});
