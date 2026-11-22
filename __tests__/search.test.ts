import type { ListItem } from '../lib/lists';
import { fold, matchesItem, matchesParty } from '../lib/search';
import { party } from '../test-utils/packLists';

// Design B §9.5: a search over the person's lists (the party pickers, and Your lists) ignores case and accents, so
// "pena" finds "Peña", and finds a TIN by its digits, typed with or without dashes. The names are made up.

test('fold removes case and accents', () => {
  expect(fold(' Peña ')).toBe('pena');
  expect(fold('PEÑAFLOR, Ma. Teresa')).toBe('penaflor, ma. teresa');
  expect(fold('Café Niño')).toBe('cafe nino');
  expect(fold('Pen\u0303a')).toBe('pena'); // already split into the letter and its tilde
  expect(fold('Santos General Merchandise')).toBe('santos general merchandise');
  expect(fold('   ')).toBe('');
});

test('fold never throws where normalize is missing or breaks: the accents just stay', () => {
  // Ruling T14-3: until the phone's engine is checked (Task 26), a String.prototype.normalize that's missing, or that
  // throws, leaves the string as it is, lowercased and trimmed; a name typed as written is still found.
  const pena = party({ id: 'p1', registeredName: 'Peña Hardware' });
  const builtIn = Object.getOwnPropertyDescriptor(String.prototype, 'normalize')!;
  Reflect.deleteProperty(String.prototype, 'normalize'); // an engine without it
  try {
    expect(''.normalize).toBeUndefined();
    expect(() => fold(' Peña ')).not.toThrow();
    expect(fold(' Peña ')).toBe('peña');
    expect(matchesParty(pena, 'PEÑA')).toBe(true);
  } finally {
    Reflect.defineProperty(String.prototype, 'normalize', builtIn); // the built-in back, as it was
  }
  const broken = jest.spyOn(String.prototype, 'normalize').mockImplementation(() => {
    throw new RangeError('Invalid normalization form');
  });
  try {
    expect(fold('PEÑA ')).toBe('peña');
    expect(broken).toHaveBeenCalled(); // it was asked, and failed
  } finally {
    broken.mockRestore();
  }
  expect(fold(' Peña ')).toBe('pena'); // back as before
});

test('a party matches by name, trade name or code, folded', () => {
  const pena = party({ id: 'p1', registeredName: 'Peña Hardware', tradeName: 'Casa Niño', code: 'C-021' });
  for (const query of ['pena', 'PEÑA', ' hardware ', 'peña hard', 'nino', 'CASA', 'c-021', 'C-02']) {
    expect([query, matchesParty(pena, query)]).toEqual([query, true]);
  }
  for (const query of ['penas', 'Santos', 'C-022']) {
    expect([query, matchesParty(pena, query)]).toEqual([query, false]);
  }
  // a person, by the name the app shows: "First Middle Last"
  const maria = party({ id: 'p2', registeredName: '', entity: 'individual', firstName: 'María', lastName: 'Ibáñez' });
  expect(matchesParty(maria, 'maria ibanez')).toBe(true);
  expect(matchesParty(maria, 'IBAÑEZ')).toBe(true);
  // nothing typed finds every party
  expect(matchesParty(pena, '')).toBe(true);
  expect(matchesParty(pena, '  ')).toBe(true);
});

test('a TIN matches with or without dashes', () => {
  const p = party({ id: 'p1', registeredName: 'Peña Hardware', tin: '123-456-789-00000' });
  expect(matchesParty(p, '123456789')).toBe(true);
  expect(matchesParty(p, '123-456-789')).toBe(true);
  expect(matchesParty(p, '456 789')).toBe(true);
  expect(matchesParty(p, '123456789-00000')).toBe(true);
  expect(matchesParty(p, '999-888')).toBe(false);
  // a TIN kept as digits only, found with its dashes typed
  const digits = party({ id: 'p2', registeredName: 'Garcia Agri Supply', tin: '67890123400000' });
  expect(matchesParty(digits, '678-901-234')).toBe(true);
  // a party with no TIN is found only by its words
  expect(matchesParty(party({ id: 'p3', registeredName: 'Flores Grocery' }), '123')).toBe(false);
});

test('items match by name', () => {
  const coffee: ListItem = { id: 'i1', name: 'Café de Lipa 250g', unit: 'pack', price: 120 };
  for (const query of ['cafe', 'CAFÉ', ' de lipa ', '250G']) {
    expect([query, matchesItem(coffee, query)]).toEqual([query, true]);
  }
  expect(matchesItem(coffee, 'pack')).toBe(false); // by its name, not its unit
  expect(matchesItem(coffee, 'tea')).toBe(false);
  expect(matchesItem(coffee, '')).toBe(true);
});
