import { type ListItem, type Party, partyName } from './lists';

// Design B §9.5: searching the person's lists (the party pickers; Your lists' search). What's typed and what it's
// looked for in are folded alike, so case and accents don't matter ("pena" finds "Peña"), and a TIN is found by its
// digits, typed with or without the dashes. Nothing typed finds everything.

/** What NFD splits from a letter: the combining marks, such as the tilde of an ñ. */
const MARKS = /[̀-ͯ]/g;
/** A character past ASCII: only a string with one can change under NFD. */
const PAST_ASCII = /[\u0080-￿]/;

/**
 * Lowercase, accents removed (NFD), trimmed: " Peña " is "pena". A plain ASCII string skips the normalizing, since NFD
 * leaves it as it is: a picker folds every name in the list at each keystroke.
 */
export function fold(s: string): string {
  const bare = PAST_ASCII.test(s) ? s.normalize('NFD').replace(MARKS, '') : s;
  return bare.toLowerCase().trim();
}

const digitsOf = (s: string) => s.replace(/\D/g, '');

/** Whether a party is found by what's typed: its name, trade name or code contain it, folded; or its TIN, the digits. */
export function matchesParty(p: Party, query: string): boolean {
  const text = fold(query);
  if (text === '') return true;
  const digits = digitsOf(query);
  return (
    [partyName(p), p.tradeName, p.code].some((words) => fold(words).includes(text)) ||
    (digits !== '' && digitsOf(p.tin).includes(digits))
  );
}

/** Whether an item is found by what's typed: its name contains it, folded. */
export function matchesItem(i: ListItem, query: string): boolean {
  return fold(i.name).includes(fold(query));
}
