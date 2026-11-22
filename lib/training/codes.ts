import type { SourceTag } from '../scans';

// The source tag's codes: the team's own codes for the client and the writer of an annotated scan, so its training
// data can be split by writer while no name ever leaves the phone.

/**
 * A code as it's kept, trimmed and upper-cased ("c014" is "C014"); null unless it's 1 to 12 of A-Z, 0-9 and "-" that
 * start with a letter and hold a digit. So a name ("Juan") is never one, nor is a phone number or a TIN.
 */
export function cleanCode(text: string): string | null {
  const code = text.trim().toUpperCase();
  return /^[A-Z][A-Z0-9-]{0,11}$/.test(code) && /[0-9]/.test(code) ? code : null;
}

/** Both codes as they're kept, or null unless both are codes. */
export function cleanTag(tag: SourceTag): SourceTag | null {
  const client = cleanCode(tag.client);
  const writer = cleanCode(tag.writer);
  return client !== null && writer !== null ? { client, writer } : null;
}
