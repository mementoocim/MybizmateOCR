import { detectKind, isOwnBusiness } from '../lib/ownBusiness';

// Sale or purchase, from the customer boxes: a purchase is made out to the person's own business (its TIN, else its
// name, as Profile gives them). Made-up names and TINs only.

const OWN = { ownTin: '223-344-556-000', ownName: 'Torres Construction Supply' };
const reads = (name: string, tin: string) => ({
  reads: [
    { name: 'customer_name', text: name },
    { name: 'customer_tin', text: tin },
  ],
});

test('the TIN decides when both have its 9 digits: the branch, dashes and spaces aside', () => {
  expect(isOwnBusiness({ name: '', tin: '223 344 556' }, OWN)).toBe(true);
  expect(isOwnBusiness({ name: 'Torres Construction Supply', tin: '223-344-557' }, OWN)).toBe(false); // another TIN
});

test("without a TIN on both, the name decides, as sure as a list match's auto", () => {
  expect(isOwnBusiness({ name: 'TorresConstruction Supply', tin: '' }, OWN)).toBe(true);
  expect(isOwnBusiness({ name: 'torres construction supply', tin: '22334' }, OWN)).toBe(true); // a TIN read in part
  expect(isOwnBusiness({ name: 'Isabela Wholesale Trading', tin: '' }, OWN)).toBe(false);
  expect(isOwnBusiness({ name: 'Torres Construction Supply', tin: '' }, { ownTin: OWN.ownTin, ownName: '' })).toBe(false);
});

test('with nothing in Profile, every invoice is a sale, as before', () => {
  expect(detectKind(reads('Torres Construction Supply', '223-344-556'), { ownTin: '', ownName: '' })).toBe('sale');
  expect(detectKind({ reads: [] }, OWN)).toBe('sale');
});

test('an invoice made out to the business is a purchase; one made out to someone else, a sale', () => {
  expect(detectKind(reads('TorresConstruction Supply', '223-344-556'), OWN)).toBe('purchase');
  expect(detectKind(reads('Isabela Wholesale Trading', '410-220-118'), OWN)).toBe('sale');
});
