// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'android/*', 'ios/*'],
  },
  {
    // jest.mock() factories, and the fixtures' JSON, load with require()
    files: ['__tests__/**', 'test-utils/**'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
]);
