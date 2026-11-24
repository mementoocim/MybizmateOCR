import { TEAM_BUILD } from './build';

// Why a read failed, in plain words. A capture read straight away (a sample, a Retake's pick) says it in a dialog with
// today's words (photoFailed, pdfFailed, failureDialog); a team build adds the scanner's own message under them. A
// capture read by the queue (lib/captureQueue) has no dialog: its session keeps a failed read, with its reason in plain
// words only, in every build (failedReadReason; the plan's call 5).

const codeOf = (e: unknown): string => {
  const code = (e as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : '';
};

/** What to do when the scanner itself failed, in plain words. */
const SCANNER_NEXT = { photo: 'Try again, or retake it.', PDF: 'Try importing it again.' } as const;

/**
 * The scanner's own failure (closed, or its model didn't load), naming what it was reading, then what to do. Its own
 * message is raw error text: a team build adds it under the words, as the splash and the camera show theirs, and a
 * client never sees it (design §12 A11; the final review's Minor 3).
 */
export function scannerFailed(what: 'photo' | 'PDF', e: unknown): string {
  const words = `Couldn't read that ${what}: ${SCANNER_NEXT[what]}`;
  const raw = (e as { message?: string } | null)?.message ?? String(e);
  return TEAM_BUILD && raw !== '' ? `${words}\n\n${raw}` : words;
}

/** A photo's failed read, as a dialog says it. */
export function photoFailed(e: unknown): string {
  return codeOf(e) === 'ERR_UNREADABLE_IMAGE'
    ? "Couldn't read that photo: This file isn't a photo the scanner can open."
    : scannerFailed('photo', e);
}

// readPdf's refusals (its pdf_* codes), in plain words.
export const PDF_REFUSED: Record<string, string> = {
  pdf_too_big: 'That PDF is over 20 MB. Choose a smaller file.',
  pdf_password: 'That PDF has a password. Save a copy without one, then import it.',
  pdf_broken: "Couldn't read that PDF.",
  pdf_unreadable: "Couldn't read that PDF.",
  pdf_page_too_big: "That PDF's page is too big to read.",
};

/** A refusal's words; a pdf_* code readPdf adds later reads as unreadable. */
const refusal = (code: string): string =>
  Object.prototype.hasOwnProperty.call(PDF_REFUSED, code) ? PDF_REFUSED[code] : PDF_REFUSED.pdf_unreadable;

/** A refused PDF in plain words. Any other failure is the scanner's own, so it isn't put on the PDF. */
export function pdfFailed(e: unknown): string {
  const code = codeOf(e);
  return code.startsWith('pdf_') ? refusal(code) : scannerFailed('PDF', e);
}

/**
 * A failure's words as Alert.alert's arguments: the reason as the title, then what to do as the message (ruling
 * T16-1), since Android stops a dialog's title at two lines with an ellipsis. The words are today's, with plain words
 * in place of the scanner's own message (scannerFailed), split at the colon after "Couldn't read that photo" (or PDF)
 * or at the end of the first sentence, whichever comes first. A full stop, "?" or "!" ends a sentence only when a space
 * and more words follow, so a file's name never splits. Words that don't split are the title alone, with no message,
 * as one-argument Alert.alert sends them (ruling T16-1a), never a message under an empty title: React Native shows an
 * empty title on Android as a blank, focusable heading.
 */
export function failureDialog(words: string): [title: string, message?: string] {
  const split = /: |[.?!] (?=\S)/.exec(words);
  if (!split) return [words];
  const reasonEnd = split[0] === ': ' ? split.index : split.index + 1; // a sentence keeps its full stop; a colon goes
  return [words.slice(0, reasonEnd), words.slice(split.index + split[0].length)];
}

/** The reason a session's failed read gives (lib/session's FailedRead): plain words only, never the scanner's own. */
export const UNREADABLE_PHOTO = "It isn't a photo the scanner can open.";
export const SCANNER_STOPPED = 'The scanner stopped while reading it.';

/**
 * Why the queue's read failed, for its session's failed read: a photo the scanner can't open, a PDF's refusal in its
 * own words (today's), or the scanner stopped. In every build, the scanner's own message stays out (the plan's call 5).
 */
export function failedReadReason(kind: 'photo' | 'pdf', e: unknown): string {
  const code = codeOf(e);
  if (kind === 'photo' && code === 'ERR_UNREADABLE_IMAGE') return UNREADABLE_PHOTO;
  if (kind === 'pdf' && code.startsWith('pdf_')) return refusal(code);
  return SCANNER_STOPPED;
}
