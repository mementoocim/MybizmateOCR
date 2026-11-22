import { failureDialog } from '../lib/scanFlow';

// Ruling T16-1: a failure that stops a capture shows in a dialog with today's words, split in two. The reason is the
// title, and what to do is the message, since Android stops a dialog's title at two lines with an ellipsis. Ruling
// T16-1a: words that don't split show as a title alone, as one-argument Alert.alert sends them. They never go under an
// empty title: React Native still sends an empty title on Android, where it opens the dialog with a blank, focusable
// heading. None of today's words has a decimal point or a "?". The nearest are the scanner's own messages after the
// colon: one has its own colon, and one has a full stop inside a file name. Each stays whole.

jest.mock('../modules/scanner', () => ({})); // the split needs nothing of the scanner

test('two sentences: the reason, then what to do', () => {
  expect(failureDialog('That PDF has a password. Save a copy without one, then import it.')).toEqual([
    'That PDF has a password.',
    'Save a copy without one, then import it.',
  ]);
  expect(failureDialog('That PDF is over 20 MB. Choose a smaller file.')).toEqual([
    'That PDF is over 20 MB.',
    'Choose a smaller file.',
  ]);
  expect(
    failureDialog('The camera app needs the camera permission too. Choose a photo from the gallery instead.'),
  ).toEqual(['The camera app needs the camera permission too.', 'Choose a photo from the gallery instead.']);
});

test("a colon: what couldn't be read, then why, whole", () => {
  expect(failureDialog("Couldn't read that photo: This file isn't a photo the scanner can open.")).toEqual([
    "Couldn't read that photo",
    "This file isn't a photo the scanner can open.",
  ]);
  expect(failureDialog("Couldn't read that PDF: The scanner was closed")).toEqual([
    "Couldn't read that PDF",
    'The scanner was closed',
  ]);
  // the scanner's own words stay whole, with their own colon or full stop
  expect(failureDialog("Couldn't read that PDF: open failed: ENOENT (No such file or directory)")).toEqual([
    "Couldn't read that PDF",
    'open failed: ENOENT (No such file or directory)',
  ]);
  expect(failureDialog("Couldn't read that photo: form_small.png can't be decoded")).toEqual([
    "Couldn't read that photo",
    "form_small.png can't be decoded",
  ]);
});

test('one sentence: a title alone, never under an empty title', () => {
  for (const words of [
    "Couldn't open the photo.",
    "Couldn't open that photo.",
    "Couldn't open that sample.",
    "Couldn't read that PDF.",
    "That PDF's page is too big to read.",
    'Choose a PDF file.',
  ]) {
    expect(failureDialog(words)).toStrictEqual([words]); // what Alert.alert(words) sends: one argument
  }
});
