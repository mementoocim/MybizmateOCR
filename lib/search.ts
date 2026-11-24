import { type ListItem, type Party, partyName } from './lists';

// Design B §9.5: searching the person's lists (the party pickers; Your lists' search). What's typed and what it's
// looked for in are folded alike, so case and accents don't matter ("pena" finds "Peña"), and a TIN is found by its
// digits, typed with or without the dashes. Nothing typed finds everything.

/** What NFD splits from a letter: the combining marks, U+0300 to U+036F, such as the tilde of an ñ. */
const MARKS = /[\u0300-\u036f]/g;
/** A character past ASCII: only a string with one can change under NFD. */
const PAST_ASCII = /[\u0080-\uffff]/;

/**
 * Lowercase, accents removed (NFD), trimmed: " Peña " is "pena". It never throws: where the engine has no
 * String.prototype.normalize, or its normalize throws (Hermes, until the phone check: ruling T14-3), the string stays
 * as it is, only lowercased and trimmed, so a name typed as written is still found.
 */
export function fold(s: string): string {
  return withoutAccents(s).toLowerCase().trim();
}

/** The string with its letters' accents taken off: as it is when it's plain ASCII, or when NFD can't be had. */
function withoutAccents(s: string): string {
  if (!PAST_ASCII.test(s)) return s; // NFD leaves plain ASCII as it is, and a picker folds every name at each keystroke
  try {
    return s.normalize('NFD').replace(MARKS, '');
  } catch {
    return s;
  }
}

const digitsOf = (s: string) => s.replace(/\D/g, '');

/**
 * A TIN as it's typed: digits, spaces and dashes only. With a letter in it, a query is words (ruling T14-5): branch
 * codes are 00000, so "C0" by its digits would find every party with a TIN.
 */
const TIN_TYPED = /^[\d\s-]+$/;

/**
 * Whether what's typed finds a party: in its name, trade name or code, folded; or, when it's typed as a TIN, in its
 * TIN, by the digits.
 */
export function matchesParty(p: Party, query: string): boolean {
  return found([partyName(p), p.tradeName, p.code], p.tin, query);
}

/** Whether what's typed is in one of the words, folded; or, typed as a TIN, in the TIN, by the digits. */
function found(words: readonly string[], tin: string, query: string): boolean {
  const text = fold(query);
  if (text === '') return true;
  const digits = TIN_TYPED.test(text) ? digitsOf(text) : '';
  return words.some((w) => fold(w).includes(text)) || (digits !== '' && digitsOf(tin).includes(digits));
}

/** Whether an item is found by what's typed: its name contains it, folded. */
export function matchesItem(i: ListItem, query: string): boolean {
  return fold(i.name).includes(fold(query));
}

/**
 * Whether what's typed finds a scan (Sessions' search, spec §6.6), as a party is found: in its party's name or its
 * number, folded; or, when it's typed as a TIN, in its TIN, by the digits. fields: lib/sessions' scanFields.
 */
export function matchesScan(fields: { name: string; number: string; tin: string }, query: string): boolean {
  return found([fields.name, fields.number], fields.tin, query);
}
