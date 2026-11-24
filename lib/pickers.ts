import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

import { displayName, releaseAccess } from '../modules/scanner';

// The phone's pickers, apart from reading what they give: the gallery, the phone's camera app and the file picker
// (a PDF). lib/scanFlow reads what they give straight away; the camera tab hands it to the queue (lib/captureQueue).

/**
 * A photo from the gallery: the picker's copy in the app's cache (the person's photo is never touched), or null when
 * the person cancelled. Throws when the picker fails.
 */
export async function pickPhoto(): Promise<string | null> {
  const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
  return picked.canceled ? null : picked.assets[0].uri;
}

/**
 * A photo from the phone's camera app, in the app's cache; null when the person cancelled; 'no_permission' when the
 * camera permission wasn't given. Throws when the camera app fails.
 */
export async function cameraAppPhoto(): Promise<string | null | 'no_permission'> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return 'no_permission';
  const taken = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
  return taken.canceled ? null : taken.assets[0].uri;
}

const PDF_TYPE = 'application/pdf';

/** A PDF by its name (as its app gives it; there may be none) or by the type the phone gives it. */
function isPdf(name: string | null, type: string | null): boolean {
  const mime = (type ?? '').split(';')[0].trim().toLowerCase();
  return (name ?? '').toLowerCase().endsWith('.pdf') || mime === PDF_TYPE;
}

/** A PDF the file picker gave: its uri, and its name as its app gives it (there may be none). */
export type PickedPdf = { uri: string; name: string | null };

/**
 * A PDF from the system's file picker; null when the person cancelled; 'not_pdf' for another kind of file, whose
 * access has been given up already (letGoOfPdf). Android's picker hands over the person's own file: a content:// link,
 * which the scanner reads through a copy of its own and never changes. iOS's picker opens a copy in the app's temporary
 * folder (a file://). Throws when the picker fails.
 */
export async function pickPdf(): Promise<PickedPdf | 'not_pdf' | null> {
  const picked = await File.pickFileAsync({ mimeTypes: [PDF_TYPE] });
  if (picked.canceled) return null;
  const file = picked.result;
  // the name its app gives: a link's own last segment can be an id (Android's Downloads: …/document/msf%3A54)
  const name = await displayName(file.uri).catch(() => null);
  if (!isPdf(name, file.type)) {
    letGoOfPdf(file.uri);
    return 'not_pdf';
  }
  return { uri: file.uri, name };
}

/**
 * After a picked PDF's read: iOS's copy (a file://) is deleted, and Android's lasting access to the person's file (a
 * content://) is given up (readPdf does it too, once it has read it). It's no part of the read: nothing waits for it,
 * and its failure changes nothing.
 */
export function letGoOfPdf(uri: string): void {
  if (uri.startsWith('file://')) {
    try {
      new File(uri).delete();
    } catch {
      // already gone
    }
  } else {
    void releaseAccess(uri).catch(() => undefined);
  }
}
