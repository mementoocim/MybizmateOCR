import { wRatio } from './checks/fuzzy';
import type { InvoiceKind } from './scans';
import type { Settings } from './settings';

// Sale or purchase, told from the paper: the invoice's customer boxes name who it was issued to. On a sale that's
// someone else; on a purchase it's the person's own business, as Profile gives it (its TIN, else its name). A scan
// just read starts as what this says; the Scan screen's switch still changes it.

/** How close a name read must be to the business's own (wRatio, 0 to 100): a sure match, as matchCustomer's auto. */
const SAME_NAME = 90;

const tin9 = (text: string) => text.replace(/\D/g, '').slice(0, 9);

/**
 * Whether a customer TIN and name are the person's own business: the TIN's 9 digits (its branch aside) when both have
 * them, else the name, as matchCustomer scores a party's.
 */
export function isOwnBusiness(
  customer: { name: string; tin: string },
  own: Pick<Settings, 'ownTin' | 'ownName'>,
): boolean {
  const ownTin = tin9(own.ownTin);
  const readTin = tin9(customer.tin);
  if (ownTin.length === 9 && readTin.length === 9) return readTin === ownTin;
  const ownName = own.ownName.trim().toLowerCase();
  const readName = customer.name.trim().toLowerCase();
  return (
    ownName.length >= 2 &&
    readName.length >= 2 &&
    wRatio(readName, ownName) >= SAME_NAME
  );
}

/** What an invoice just read is: a purchase when its customer boxes name the person's own business, else a sale. */
export function detectKind(
  result: { reads: readonly { name: string; text: string }[] },
  own: Pick<Settings, 'ownTin' | 'ownName'>,
): InvoiceKind {
  const text = (box: string) =>
    result.reads.find((r) => r.name === box)?.text ?? '';
  return isOwnBusiness(
    { name: text('customer_name'), tin: text('customer_tin') },
    own,
  )
    ? 'purchase'
    : 'sale';
}
