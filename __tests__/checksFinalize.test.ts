import { finalize, matchCustomer, type Pack, type Raw } from '../lib/checks/finalize';

// The Python reference's finalize on every case (fixtures/checks/finalize.json, written by
// prototype/benchmark/export_check_fixtures.py) and its synthetic scan pack.
const PACK: Pack = require('../fixtures/checks/scan_pack.json');
const FZ = require('../fixtures/checks/finalize.json');

/** The Python's flat raw dict as the TypeScript Raw: the boxes, the ticks and the photo's measures. */
function toRaw(py: Record<string, any>): Raw {
  const { terms = null, photo = null, ...boxes } = py;
  return { boxes, terms, photo };
}

test('every case like the Python', () => {
  for (const c of FZ.cases) expect([c.name, finalize(toRaw(c.raw), PACK, FZ.today)]).toEqual([c.name, c.expected]);
});

test('a party is matched on the best of its names', () => {
  const juan = { id: 'P1', name: 'Juan Dela Cruz', tin: '111-222-333-00000' };
  expect(matchCustomer('jdc hardware', '', { customers: [{ ...juan, names: ['JDC Hardware'] }], items: [] })).toEqual([
    'P1',
    'auto',
  ]);
  expect(matchCustomer('jdc hardware', '', { customers: [juan], items: [] })[1]).not.toBe('auto');
});
