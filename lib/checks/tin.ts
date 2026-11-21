// A TIN (Philippine taxpayer identification number) is 9 digits, then its branch code: 3 digits on most BIR forms
// (000), 5 on the 2307 (00000), and 4 as MyBizMate prints it (0000). One rule for the 2307's TIN check, for the TIN as
// the app shows it (formatTin) and as the Parties import takes it (partiesTin), so the three never disagree.

/** Whether a TIN's digits (its dashes and spaces taken out) are as many as a TIN has: 9, 12, 13 or 14. */
export function tinLengthOk(digits: string): boolean {
  return /^\d{9}(\d{3,5})?$/.test(digits);
}
