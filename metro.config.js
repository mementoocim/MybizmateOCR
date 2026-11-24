// Metro: Expo's default config, with .txt as an asset, so the open-source license texts (lib/licenses.ts) are bundled
// as files the app reads (app/license.tsx). https://docs.expo.dev/versions/v58.0.0/config/metro/
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('txt');

module.exports = config;
