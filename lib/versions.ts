import Constants from 'expo-constants';

// The app's and the model's versions. Each scan keeps both from when it was made (StoredScan.made), so an update
// between scanning and exporting doesn't relabel its training data. Settings › About shows the app's, with the build
// number when the build has one.

type Model = { name: string; sha256: string; bytes: number };

/** The app's version (app.json's expo.version), as the build, or the update it runs, carries it. */
export const APP_VERSION: string = Constants.expoConfig?.version ?? 'unknown';

const versionCode = Constants.expoConfig?.android?.versionCode;
/** The build number (app.json's android.versionCode) as a string, or null when there's none: app.json sets none yet. */
export const BUILD_NUMBER: string | null = versionCode == null ? null : String(versionCode);

/** The version as Settings shows it: "1.0.0 (12)", or "1.0.0" with no build number. */
export function versionLine(): string {
  return BUILD_NUMBER === null ? APP_VERSION : `${APP_VERSION} (${BUILD_NUMBER})`;
}

/** The recognition model the app ships (inference_latin.onnx), as model.json beside it says: a test pins the two. */
export const MODEL = require('../modules/scanner/assets/scanner/model.json') as Model;

/** The model's name and the first 12 hex digits of its SHA-256, as each scan keeps it. */
export function modelVersion(): string {
  return `${MODEL.name} ${MODEL.sha256.slice(0, 12)}`;
}
