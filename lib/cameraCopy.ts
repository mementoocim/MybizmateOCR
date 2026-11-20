import type { CameraStatus, FormName } from '../modules/scanner';
import { FORMS } from './forms';

// The camera screen's words (the test app's CameraActivity.java).

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

export const CAMERA_ERRORS = {
  capture: "Couldn't take the photo. Try the button again.",
  keep: "Couldn't keep the photo. Try again.",
  noCamera: 'This phone has no camera the scanner can use.',
  start(message?: string): string {
    return message ? `The camera couldn't start: ${message}` : "The camera couldn't start.";
  },
};

export const PERMISSION_TEXT = 'The scanner needs the camera to see the invoice. Nothing it sees leaves the phone.';
