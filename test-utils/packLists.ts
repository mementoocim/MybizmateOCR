import type { Lists, Party } from '../lib/lists';

// The Python's synthetic scan pack (fixtures/checks/scan_pack.json) as a person's lists: one customer per pack
// customer (its code = its id) and one item per pack item.

const PACK = require('../fixtures/checks/scan_pack.json');

/** A company customer with the given fields; the rest blank. */
export function party(fields: Partial<Party> & Pick<Party, 'id' | 'registeredName'>): Party {
  return {
    code: '',
    type: 'customer',
    entity: 'company',
    lastName: '',
    firstName: '',
    middleName: '',
    tradeName: '',
    tin: '',
    address: '',
    vatStatus: '',
    terms: '',
    fromScan: false,
    exportedAt: null,
    ...fields,
  };
}

export const PACK_LISTS: Lists = {
  parties: PACK.customers.map((c: { id: string; name: string; tin: string }) =>
    party({ id: `p-${c.id}`, code: c.id, registeredName: c.name, tin: c.tin }),
  ),
  items: PACK.items.map((i: { id: string; description: string; unit: string; price: number }) => ({
    id: `i-${i.id}`,
    name: i.description,
    unit: i.unit,
    price: i.price,
  })),
  version: 1,
};

export const EMPTY_LISTS: Lists = { parties: [], items: [], version: 0 };
