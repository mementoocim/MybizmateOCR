import type { CameraStatus, FormName } from '../modules/scanner';
import { FORMS } from './forms';

// The camera screen's words (the test app's CameraActivity.java, and design B §9.3).

const WITH_FORM = {
  holding: ' · hold still',
  blurry: ' · blurry, hold still',
  found: ' found · tap the button',
} as const;

/** The pill under the picture: what the camera is doing, with the form it sees. */
export function statusText(status: CameraStatus | 'starting', form: FormName | null): string {
  if (status === 'starting') return 'Starting the camera…';
  if (status === 'capturing') return 'Taking the photo…';
  if (status === 'looking' || !form) return 'Looking for the form…';
  return FORMS[form].title + WITH_FORM[status];
}

/** The panels' titles, and the body of the one for a permission refused for good (§9.3). */
export const CAMERA_TEXT = {
  allowTitle: 'Allow the camera',
  offTitle: 'Camera access is off',
  offBody: "Turn on the camera for MyBizMate Scan in the phone's settings.",
  startTitle: "The camera couldn't start", // its raw message shows on its own line, in team builds only
} as const;

export const CAMERA_ERRORS = {
  capture: "Couldn't take the photo. Try the button again.",
  keep: "Couldn't keep the photo. Try again.",
  noCamera: 'This phone has no camera the scanner can use.',
};

export const PERMISSION_TEXT = 'The scanner needs the camera to see the invoice. Nothing it sees leaves the phone.';
