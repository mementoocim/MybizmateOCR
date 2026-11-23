import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { AccessibilityInfo, Alert, type AlertButton } from 'react-native';

import ListsScreen from '../app/lists';
import { addParty, clearItems, clearParties, markPartiesExported, type Party } from '../lib/lists';
import { colors, type } from '../lib/theme';
import { memoryFs } from '../test-utils/memoryFs';
import { scrollListToEnd } from '../test-utils/scrollList';
import { typeStylesOf } from '../test-utils/typeStyles';

// Design B §9.9: Your lists, the customers, suppliers and items the checks use, imported from CSV files (MyBizMate's
// export, saved as CSV). The tabs say their counts plainly. A search finds a party by its name, TIN or code, or an item
// by its name, and the strip says how many it found. Import CSV opens one picker however fast it's tapped, and How to
// import explains the file in a sheet. A wrong file says why in a banner, and Clear names what it clears and asks
// first. The made-up lists (fixtures/lists): 20 customers, a supplier, one that is both, and a row with no name.

const fs = require('fs');
const PARTIES: string = fs.readFileSync('fixtures/lists/parties.csv', 'utf8');
const ITEMS: string = fs.readFileSync('fixtures/lists/items.csv', 'utf8');

const mockToast = jest.fn();
const mockPick = jest.fn();
const mockRelease = jest.fn(async (_uri: string) => undefined);

// Ruling P8: the toast's arguments go through as given, so a message without an action is checked by its words alone.
jest.mock('../lib/toast', () => ({ toast: (...args: unknown[]) => mockToast(...args) }));
jest.mock('../modules/scanner', () => ({ releaseAccess: (uri: string) => mockRelease(uri) }));
jest.mock('expo-file-system', () => {
  const memory = require('../test-utils/memoryFs').memoryFs.module;
  return { ...memory, File: Object.assign(memory.File, { pickFileAsync: (options: object) => mockPick(options) }) };
});
// the header's Back (lib/navigation): the screen's own navigation, and the way Home
jest.mock('expo-router', () => ({
  useNavigation: () => ({ canGoBack: () => true, goBack: jest.fn() }),
  useRouter: () => ({ replace: jest.fn() }),
}));

/** Today's words for each tab, now in How to import. */
const INTRO = {
  customers:
    "Your scans' customers are matched against these names and TINs. In MyBizMate, export your parties, open the file in Excel or Google Sheets, save it as CSV, then import it here.",
  suppliers: 'The suppliers you choose from when you save a purchase. Import them the same way as customers.',
  items: 'Your items and their list prices. A row whose price is far from its list price is marked to check.',
};
const PARTY_COLUMNS =
  "The first row names the columns, as in MyBizMate's Parties import: Code, Type, Entity type, Registered name, Last name, First name, Middle name, Trade name, TIN, Sub-street, Street, Barangay, City / Municipality, Province, ZIP, VAT status and Payment terms. Other columns are skipped. Contact numbers and emails are never kept.";
const ITEM_COLUMNS = 'The first row names the columns: Name, Unit and Price.';
/** Each empty tab's title and body (design §9.9; the plan's call 18 for suppliers and items). */
const EMPTY: readonly [tab: string, title: string, body: string][] = [
  [
    'Customers 0',
    'No customers yet',
    'Import the parties file from MyBizMate as a CSV. Scans then match names and TINs against it.',
  ],
  [
    'Suppliers 0',
    'No suppliers yet',
    'Import the parties file from MyBizMate as a CSV. You choose from these when you save a purchase.',
  ],
  [
    'Items 0',
    'No items yet',
    "Import your items as a CSV, with Name, Unit and Price. Scans then check each row's price.",
  ],
];
const CLEAR_BODY = "They're removed from this phone. Saved scans don't change. You can import the file again.";
/** Today's words for a file that can't be imported. */
const NOT_CSV = 'Choose a .csv file. In Excel or Google Sheets, save or download the sheet as CSV.';
const NO_NAMES =
  "That file has no Registered name, Last name or First name column. Use the columns of MyBizMate's Parties import.";
const NO_NAME = 'That file has no Name column.';
const UNREADABLE = "Couldn't read that file.";
/** 60 characters (Review Focus 5). */
const LONG_NAME = 'Isabela Prime Builders and General Merchandise Trading Corp.';

/** Android's picker hands over the person's own file: a content:// link, here Downloads' (without the file's name). */
const LINK = 'content://com.android.providers.downloads.documents/document/msf%3A31';

/** What the file picker gives: a file with that name, type and text (its bytes UTF-8, as Google Sheets writes). */
const picked = (name: string, text: string | Error, type = 'text/csv') => ({
  canceled: false,
  result: {
    uri: LINK,
    name,
    type,
    text: async () => (text instanceof Error ? Promise.reject(text) : text),
    bytes: async () => (text instanceof Error ? Promise.reject(text) : new TextEncoder().encode(text)),
  },
});

type Instance = ReturnType<typeof screen.getByText>;
const press = (el: Instance) => act(async () => fireEvent.press(el));
const button = (name: string | RegExp) => screen.getByRole('button', { name });
const radio = (name: string) => screen.getByRole('radio', { name });
const header = (name: string) => screen.getByRole('header', { name });
/** A banner, by its words. */
const banner = (text: string) => screen.getByRole('alert', { name: text });
/** The search field, by the name TalkBack says (it shows as the placeholder too). */
const searchField = (name = 'Search name, TIN or code') => screen.getByLabelText(name);
const typeIn = (field: Instance, text: string) => act(async () => fireEvent.changeText(field, text));
/** The tabs, in order, as TalkBack says each. */
const tabs = () =>
  within(screen.getByRole('radiogroup', { name: 'List' }))
    .getAllByRole('radio')
    .map((r) => r.props.accessibilityLabel);
/** The rows shown, top to bottom, as TalkBack says each: the name, the sub-line, then the badge (ruling T4-4). */
const rows = () => screen.queryAllByTestId('list-row').map((r) => r.props.accessibilityLabel);
/** A row, by its name. */
const row = (name: string) => screen.getByLabelText(new RegExp(`^${name}(, |$)`));
/** That these nodes sit in the list in this order, top to bottom. */
function expectInOrder(...nodes: Instance[]) {
  const all = screen.getByTestId('lists-list').queryAll(() => true);
  const order = nodes.map((node) => all.indexOf(node));
  expect(order.every((at) => at >= 0)).toBe(true);
  expect(order).toEqual([...order].sort((a, b) => a - b));
}
/** The sheet's parts. */
const sheet = () => within(screen.getByTestId('sheet-panel'));
const sheetActions = () => within(screen.getByTestId('sheet-actions'));
const focus = jest.mocked(AccessibilityInfo.sendAccessibilityEvent);
/** What TalkBack focus was sent to since the last clear: each view's spoken name, and the event. */
const focused = () =>
  focus.mock.calls.map(([view, event]) => [
    (view as { props?: { accessibilityLabel?: string } }).props?.accessibilityLabel,
    event,
  ]);

let alertSpy: jest.SpyInstance;
/** Presses a button of the last Alert. */
const answer = (text: string) =>
  act(async () => {
    const buttons = alertSpy.mock.calls.at(-1)![2] as AlertButton[];
    buttons.find((b) => b.text === text)?.onPress?.();
  });

async function importFile(name: string, text: string | Error, type?: string) {
  mockPick.mockResolvedValueOnce(picked(name, text, type));
  await press(button('Import CSV'));
}

/** A party as a scan adds it: no MyBizMate code yet, unless given one. */
const fromScan = (registeredName: string, tin = '', extra: Partial<Party> = {}) =>
  addParty({
    code: '',
    type: 'customer',
    entity: 'company',
    registeredName,
    lastName: '',
    firstName: '',
    middleName: '',
    tradeName: '',
    tin,
    address: '',
    vatStatus: '',
    terms: '',
    fromScan: true,
    ...extra,
  });

/** A row's height as the test lays the list out (test-utils/scrollList). */
const ROW = 60;

beforeEach(async () => {
  jest.clearAllMocks();
  memoryFs.reset();
  await clearParties('customer');
  await clearParties('supplier');
  await clearItems();
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

test('the tabs are a radio group with plain counts', async () => {
  await render(<ListsScreen />);
  expect(header('Your lists')).toBeOnTheScreen();
  expect(tabs()).toEqual(['Customers 0', 'Suppliers 0', 'Items 0']);
  expect(radio('Customers 0')).toBeChecked();

  await importFile('parties.csv', PARTIES);
  expect(tabs()).toEqual(['Customers 21', 'Suppliers 2', 'Items 0']); // no parentheses
  expect(header('21 customers')).toBeOnTheScreen();
  await press(radio('Items 0'));
  expect(radio('Items 0')).toBeChecked();
  expect(radio('Customers 21')).not.toBeChecked();
  await importFile('items.csv', ITEMS);
  expect(tabs()).toEqual(['Customers 21', 'Suppliers 2', 'Items 18']); // the items leave the parties as they were
  expect(header('18 items')).toBeOnTheScreen();
  await press(radio('Suppliers 2'));
  expect(header('2 suppliers')).toBeOnTheScreen();
  expect(screen.queryByText(/\(\d+\)/)).toBeNull();
});

test('search finds by name with or without accents, by TIN with or without dashes, and by code; the strip says 3 of 21 customers', async () => {
  await render(<ListsScreen />);
  await importFile('parties.csv', PARTIES.replace('Dela Cruz Hardware', 'Dela Peña Hardware'));
  const field = searchField();
  expect(field.props.placeholder).toBe('Search name, TIN or code');
  expect(header('21 customers')).toBeOnTheScreen();

  // a name, typed with or without its accent
  for (const query of ['pena', 'PEÑA', 'dela peña hard']) {
    await typeIn(field, query);
    expect([query, rows()]).toEqual([query, ['Dela Peña Hardware, TIN 234-567-890-00000 · C002']]);
  }
  expect(header('1 of 21 customers')).toBeOnTheScreen();
  // a TIN, typed with or without its dashes
  for (const query of ['345678901', '345-678-901', '345 678 901']) {
    await typeIn(field, query);
    expect([query, rows()]).toEqual([
      query,
      [
        'Santos General Merchandise, TIN 345-678-901-00000 · C003',
        'Santos Merchandise, TIN 345-678-901-00001 · C004',
      ],
    ]);
  }
  await typeIn(field, '345-678-901-00001');
  expect(rows()).toEqual(['Santos Merchandise, TIN 345-678-901-00001 · C004']);
  // a code: with letters in it, it's words, so the TINs' zeros don't count (ruling T14-5)
  await typeIn(field, 'c017');
  expect(rows()).toEqual(['Cruz Trading, TIN 667-788-990-00002 · C017']);
  await typeIn(field, 'C01');
  expect(header('10 of 21 customers')).toBeOnTheScreen(); // C010 to C019
  // three of the 21
  await typeIn(field, 'santos');
  expect(rows()).toEqual([
    'Santos General Merchandise, TIN 345-678-901-00000 · C003',
    'Santos Merchandise, TIN 345-678-901-00001 · C004',
    'Maria Santos Reyes, TIN 900-000-002-00000 · B001',
  ]);
  expect(header('3 of 21 customers')).toBeOnTheScreen();
  // none: the strip says so, and the tab isn't empty
  await typeIn(field, 'zzz');
  expect(rows()).toEqual([]);
  expect(header('0 of 21 customers')).toBeOnTheScreen();
  expect(screen.queryByText('No customers yet')).toBeNull();

  // its clear button empties it
  await press(button('Clear the search'));
  expect(field.props.value).toBe('');
  expect(header('21 customers')).toBeOnTheScreen();
  // and so does a tab change; the tab it's on changes nothing
  await typeIn(field, 'santos');
  await press(radio('Customers 21'));
  expect(field.props.value).toBe('santos');
  await press(radio('Suppliers 2'));
  expect(searchField().props.value).toBe('');
  expect(rows()).toEqual([
    'Isabela Wholesale Trading, TIN 900-000-001-00000 · S001',
    'Maria Santos Reyes, TIN 900-000-002-00000 · B001',
  ]);

  // items, by their names alone
  await press(radio('Items 0'));
  await importFile('items.csv', ITEMS);
  const items = searchField('Search name');
  expect(items.props.placeholder).toBe('Search name');
  await typeIn(items, 'RICE');
  expect(rows()).toEqual(['Rice 25kg, sack · ₱1,350.00']);
  expect(header('1 of 18 items')).toBeOnTheScreen();
  await typeIn(items, 'sack');
  expect(header('0 of 18 items')).toBeOnTheScreen();
});

test("the rows: a party's name over its TIN and code in figures, an item's over its unit and price", async () => {
  await render(<ListsScreen />);
  await importFile('parties.csv', PARTIES);
  expect(rows().slice(0, 2)).toEqual([
    'Sample Company, TIN 123-456-789-00000 · C001',
    'Dela Cruz Hardware, TIN 234-567-890-00000 · C002',
  ]);
  const sample = row('Sample Company');
  expect(within(sample).getByText('Sample Company')).toHaveStyle({ ...type.value, color: colors.ink });
  expect(typeStylesOf(within(sample).getByText('Sample Company'))).toEqual(['value']); // button flattens alike here
  // jest runs as iOS, where the figure and label styles of a size flatten alike: the token tells them apart
  const sub = within(sample).getByText('TIN 123-456-789-00000 · C001');
  expect(typeStylesOf(sub)).toEqual(['figureSmall']);
  expect(sub).toHaveStyle({ color: colors.mute });
  // not tappable, as today
  expect(screen.queryByRole('button', { name: /^Sample Company/ })).toBeNull();

  // an item: its unit and price, the missing ones left out
  await press(radio('Items 0'));
  const items = 'Name,Unit,Price\r\nRice 25kg,sack,"1,350.00"\r\nGift wrap,,\r\nDelivery,,150.00\r\nTape,roll,\r\n';
  await importFile('items.csv', items);
  expect(rows()).toEqual(['Rice 25kg, sack · ₱1,350.00', 'Gift wrap', 'Delivery, ₱150.00', 'Tape, roll']);
  expect(tabs()).toEqual(['Customers 21', 'Suppliers 2', 'Items 4']);
});

test('long names and long lists show in full', async () => {
  // Review Focus 5: a 60-character name wraps rather than being cut, and every row of a long list can be reached
  const csv = [
    'Code,Registered name,TIN',
    `C001,${LONG_NAME},123-456-789-00000`,
    ...Array.from({ length: 59 }, (_, i) => `C${String(i + 2).padStart(3, '0')},Customer ${i + 2},`),
  ].join('\r\n');
  await render(<ListsScreen />);
  await importFile('long.csv', csv);
  expect(LONG_NAME).toHaveLength(60);
  for (const text of [screen.getByText(LONG_NAME), screen.getByText('TIN 123-456-789-00000 · C001')]) {
    expect(text.props.numberOfLines).toBeUndefined();
    expect(text.props.ellipsizeMode).toBeUndefined();
  }
  expect(header('60 customers')).toBeOnTheScreen();
  // the list is virtualized: its rows come as it scrolls, down to the last one
  expect(screen.queryByText('Customer 60')).toBeNull();
  await scrollListToEnd('lists-list', ROW);
  expect(row('Customer 60')).toBeOnTheScreen();
  expect(button('Clear customers')).toBeOnTheScreen();
});

test('a party from a scan says so, with New until it is exported', async () => {
  const bagong = await fromScan('Bagong Tindahan', '900000003');
  await fromScan('Tindahan ni Aling Nena'); // no TIN
  await fromScan('Lim Grocery', '900000004', { code: 'C021' }); // it has MyBizMate's code now: a party like the others
  await render(<ListsScreen />);
  expect(rows()).toEqual([
    'Bagong Tindahan, TIN 900-000-003 · Added from a scan · not exported yet, New',
    'Tindahan ni Aling Nena, Added from a scan · not exported yet, New',
    'Lim Grocery, TIN 900-000-004 · C021',
  ]);
  // New in brand: in the row's spoken label (ruling T4-4), not a stop of its own
  expect(within(row('Bagong Tindahan')).queryByText('New')).toBeNull();
  const badge = within(row('Bagong Tindahan')).getByText('New', { includeHiddenElements: true });
  expect(badge).toHaveStyle({ ...type.badge, color: colors.brandText });
  expect(badge.parent).toHaveStyle({ backgroundColor: colors.brandTint });
  // words, so the line is in the words' style (the mockup's), where a TIN and code alone are figures
  const sub = within(row('Bagong Tindahan')).getByText('TIN 900-000-003 · Added from a scan · not exported yet');
  expect(typeStylesOf(sub)).toEqual(['label']);
  expect(typeStylesOf(within(row('Lim Grocery')).getByText('TIN 900-000-004 · C021'))).toEqual(['figureSmall']);

  // once it has gone out in a Parties file
  await act(async () => markPartiesExported([bagong.id], new Date(2026, 10, 20)));
  expect(rows()[0]).toBe('Bagong Tindahan, TIN 900-000-003 · Added from a scan · sent in a Parties file');
  expect(within(row('Bagong Tindahan')).queryByText('New', { includeHiddenElements: true })).toBeNull();
});

test('Import CSV opens one picker on a double tap', async () => {
  // Review Focus 3: the second tap comes while the picker is still open
  await render(<ListsScreen />);
  let finish: (result: unknown) => void = () => {};
  const held = () => new Promise((resolve) => (finish = resolve));

  // the empty tab's Import CSV. A fast double tap: inside one act() scope, nothing re-renders between the two taps.
  mockPick.mockImplementationOnce(held);
  await act(async () => {
    await fireEvent.press(button('Import CSV'));
    await fireEvent.press(button('Import CSV'));
  });
  expect(mockPick).toHaveBeenCalledTimes(1);
  // its press returns the import, so it loads while the picker is open, and a tap then does nothing either
  expect(button('Import CSV')).toBeBusy();
  await press(button('Import CSV'));
  expect(mockPick).toHaveBeenCalledTimes(1);
  await act(async () => finish(picked('parties.csv', PARTIES)));
  expect(mockToast).toHaveBeenCalledTimes(1);
  expect(tabs()).toEqual(['Customers 21', 'Suppliers 2', 'Items 0']);

  // the list's Import CSV, the same
  mockPick.mockImplementationOnce(held);
  await act(async () => {
    await fireEvent.press(button('Import CSV'));
    await fireEvent.press(button('Import CSV'));
  });
  expect(mockPick).toHaveBeenCalledTimes(2);
  expect(button('Import CSV')).toBeBusy();
  await act(async () => finish({ canceled: true, result: null }));
  expect(button('Import CSV')).not.toBeBusy();
  expect(mockToast).toHaveBeenCalledTimes(1);
});

test("a wrong file shows today's words in a danger banner", async () => {
  await render(<ListsScreen />);
  // not a CSV, on the empty tab: under its actions
  await importFile('parties.xlsx', PARTIES, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  const notCsv = banner(NOT_CSV);
  expect(notCsv).toHaveStyle({ backgroundColor: colors.dangerTint, borderColor: colors.dangerLine });
  expect(within(notCsv).getByText(NOT_CSV)).toHaveStyle({ color: colors.danger });
  expect(notCsv.props.accessibilityLiveRegion).toBe('polite'); // a tap brought it, so TalkBack reads it out
  expect(screen.getByText('No customers yet')).toBeOnTheScreen();
  expectInOrder(button('Import CSV'), button('How to import'), notCsv);
  expect(mockToast).not.toHaveBeenCalled();

  // the next import clears it
  await importFile('parties.csv', PARTIES);
  expect(screen.queryByRole('alert')).toBeNull();
  // missing columns, with rows: under the list's actions, over the strip; the list stays as it was
  await importFile('other.csv', 'Foo,Bar\r\n1,2\r\n');
  const noNames = banner(NO_NAMES);
  expect(noNames.props.accessibilityLiveRegion).toBe('polite');
  expectInOrder(button('Import CSV'), button('How to import'), noNames, header('21 customers'));
  expect(tabs()).toEqual(['Customers 21', 'Suppliers 2', 'Items 0']);

  // a tab change clears it
  await press(radio('Items 0'));
  expect(screen.queryByRole('alert')).toBeNull();
  await importFile('other.csv', 'Foo,Bar\r\n1,2\r\n');
  expect(banner(NO_NAME)).toBeOnTheScreen();
  // a file that can't be read: in place of the last one
  await importFile('items.csv', new Error('gone'));
  expect(screen.getAllByRole('alert')).toHaveLength(1);
  expect(banner(UNREADABLE)).toBeOnTheScreen();
  expect(mockToast).toHaveBeenCalledTimes(1); // the import that worked, alone
});

test('an import confirms in a snackbar', async () => {
  await render(<ListsScreen />);
  await importFile('one.csv', 'Code,Registered name\r\nC9,One Customer\r\n');
  expect(mockPick).toHaveBeenCalledWith({ mimeTypes: ['*/*'] });
  // today's whole message, with no action
  expect(mockToast.mock.calls).toEqual([['Imported 1 customer and 0 suppliers.']]);
  expect(header('1 customer')).toBeOnTheScreen(); // the strip agrees in number too

  await importFile('parties.csv', PARTIES);
  expect(mockToast.mock.calls.at(-1)).toEqual(['Imported 21 customers and 2 suppliers. 1 row skipped: no name.']);
  expect(header('22 customers')).toBeOnTheScreen();
  await press(radio('Suppliers 2'));
  await importFile('one.csv', 'Code,Registered name\r\nS9,One Supplier\r\nX9,\r\n');
  expect(mockToast.mock.calls.at(-1)).toEqual(['Imported 0 customers and 1 supplier. 1 row skipped: no name.']);
  expect(rows().at(-1)).toBe('One Supplier, S9');

  await press(radio('Items 0'));
  await importFile('one.csv', 'Name,Unit,Price\r\nRice 25kg,sack,"1,350.00"\r\n');
  expect(mockToast.mock.calls.at(-1)).toEqual(['Imported 1 item.']);
  expect(header('1 item')).toBeOnTheScreen();
  await importFile('items.csv', ITEMS); // Rice 25kg again, and 17 more
  expect(mockToast.mock.calls.at(-1)).toEqual(['Imported 18 items.']);
  expect(screen.queryByRole('alert')).toBeNull();
});

test('Clear names the count and asks first', async () => {
  await render(<ListsScreen />);
  await importFile('parties.csv', PARTIES);
  await typeIn(searchField(), 'santos'); // 3 shown: Clear is for the whole tab all the same
  // at the end of the list, in danger
  const clearCustomers = button('Clear customers');
  expect(within(clearCustomers).getByText('Clear customers')).toHaveStyle({ color: colors.danger });
  expectInOrder(screen.getAllByTestId('list-row').at(-1)!, clearCustomers);
  await press(clearCustomers);
  expect(alertSpy).toHaveBeenCalledWith('Clear all 21 customers?', CLEAR_BODY, [
    { text: 'Cancel', style: 'cancel' },
    expect.objectContaining({ text: 'Clear', style: 'destructive' }),
  ]);
  await answer('Cancel');
  expect(tabs()).toEqual(['Customers 21', 'Suppliers 2', 'Items 0']);
  expect(header('3 of 21 customers')).toBeOnTheScreen(); // as it was
  await press(button('Clear customers'));
  await answer('Clear');
  expect(screen.getByText('No customers yet')).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Clear customers' })).toBeNull(); // nothing left to clear
  expect(tabs()).toEqual(['Customers 0', 'Suppliers 2', 'Items 0']); // the one that's both stays a supplier
  // the search went with them: the next import shows the whole list
  await importFile('parties.csv', PARTIES);
  expect(searchField().props.value).toBe('');
  expect(header('21 customers')).toBeOnTheScreen();

  await press(radio('Suppliers 2'));
  await press(button('Clear suppliers'));
  expect(alertSpy).toHaveBeenLastCalledWith('Clear all 2 suppliers?', CLEAR_BODY, expect.any(Array));
  await answer('Clear');
  expect(screen.getByText('No suppliers yet')).toBeOnTheScreen();

  // one left: it says so
  await press(radio('Items 0'));
  await importFile('one.csv', 'Name,Unit,Price\r\nRice 25kg,sack,"1,350.00"\r\n');
  await press(button('Clear items'));
  expect(alertSpy).toHaveBeenLastCalledWith('Clear 1 item?', CLEAR_BODY, expect.any(Array));
  await answer('Clear');
  expect(screen.getByText('No items yet')).toBeOnTheScreen();
});

test('an empty tab: its words, Import CSV and How to import', async () => {
  await render(<ListsScreen />);
  for (const [tab, title, body] of EMPTY) {
    await press(radio(tab));
    expect(screen.getByText(title)).toHaveStyle({ ...type.title, color: colors.ink });
    expect(screen.getByText(body)).toHaveStyle({ ...type.body, color: colors.mute });
    // Import CSV as the screen's primary, How to import as text, once each
    expect(screen.getAllByRole('button', { name: 'Import CSV' })).toHaveLength(1);
    expect(button('Import CSV')).toHaveStyle({ backgroundColor: colors.brand });
    expect(screen.getAllByRole('button', { name: 'How to import' })).toHaveLength(1);
    expect(within(button('How to import')).getByText('How to import')).toHaveStyle({ color: colors.brandText });
    // nothing to search, count or clear
    expect(screen.queryByLabelText(/^Search name/)).toBeNull();
    expect(screen.queryByRole('header', { name: /^0 / })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Clear / })).toBeNull();
    expect(rows()).toEqual([]);
  }
  // its Import CSV imports into that tab, and the list's own is then secondary
  await importFile('items.csv', ITEMS);
  expect(tabs()).toEqual(['Customers 0', 'Suppliers 0', 'Items 18']);
  expect(screen.queryByText('No items yet')).toBeNull();
  expect(button('Import CSV')).toHaveStyle({ backgroundColor: colors.panel, borderColor: colors.outline });
});

test('How to import shows the intro and the columns', async () => {
  await render(<ListsScreen />);
  // from the empty tab
  await press(button('How to import'));
  expect(header('How to import customers')).toBeOnTheScreen();
  const all = () => screen.getByTestId('sheet-scroll').queryAll(() => true);
  let [intro, columns] = [sheet().getByText(INTRO.customers), sheet().getByText(PARTY_COLUMNS)];
  expect(intro).toHaveStyle({ ...type.body, color: colors.ink });
  expect(columns).toHaveStyle({ ...type.body, color: colors.ink });
  expect(all().indexOf(intro)).toBeLessThan(all().indexOf(columns));
  // Close twice over (ruling T18-1): the title row's, as every sheet has, and the action
  expect(sheet().getAllByRole('button', { name: 'Close' })).toHaveLength(2);
  expect(sheetActions().getAllByRole('button').map((b) => b.props.accessibilityLabel)).toEqual(['Close']);
  // secondary: nothing in the sheet is a step forward
  expect(sheetActions().getByRole('button', { name: 'Close' })).toHaveStyle({
    backgroundColor: colors.panel,
    borderColor: colors.outline,
  });
  focus.mockClear();
  await press(sheetActions().getByRole('button', { name: 'Close' }));
  expect(screen.queryByTestId('sheet-panel')).toBeNull();
  // TalkBack focus goes back to How to import (design §7)
  expect(focused()).toEqual([['How to import', 'focus']]);

  await press(radio('Suppliers 0'));
  await press(button('How to import'));
  expect(header('How to import suppliers')).toBeOnTheScreen();
  [intro, columns] = [sheet().getByText(INTRO.suppliers), sheet().getByText(PARTY_COLUMNS)];
  expect(all().indexOf(intro)).toBeLessThan(all().indexOf(columns));
  await press(sheet().getAllByRole('button', { name: 'Close' })[0]); // the title row's
  expect(screen.queryByTestId('sheet-panel')).toBeNull();

  // from the list's actions, once there are rows
  await press(radio('Items 0'));
  await importFile('items.csv', ITEMS);
  await press(button('How to import'));
  expect(header('How to import items')).toBeOnTheScreen();
  [intro, columns] = [sheet().getByText(INTRO.items), sheet().getByText(ITEM_COLUMNS)];
  expect(all().indexOf(intro)).toBeLessThan(all().indexOf(columns));
  focus.mockClear();
  await press(sheet().getAllByRole('button', { name: 'Close' })[0]);
  expect(screen.queryByTestId('sheet-panel')).toBeNull();
  expect(focused()).toEqual([['How to import', 'focus']]);
});

test('a cancelled pick does nothing', async () => {
  await render(<ListsScreen />);
  mockPick.mockResolvedValueOnce({ canceled: true, result: null });
  await press(button('Import CSV'));
  expect(mockToast).not.toHaveBeenCalled();
  expect(screen.getByText('No customers yet')).toBeOnTheScreen();
  expect(mockRelease).not.toHaveBeenCalled(); // no file, no access to give up
  // a banner from the file before stays: no other file came
  await importFile('notes.txt', 'hello', 'text/plain');
  mockPick.mockResolvedValueOnce({ canceled: true, result: null });
  await press(button('Import CSV'));
  expect(banner(NOT_CSV)).toBeOnTheScreen();
});

test("the picker's lasting access to the file is given up once it has been read, or isn't a CSV", async () => {
  // Android's picker keeps a grant on every file it hands over: the app needs none once the file is read
  await render(<ListsScreen />);
  const file = picked('parties.csv', PARTIES);
  const bytes = jest.fn(file.result.bytes);
  mockPick.mockResolvedValueOnce({ ...file, result: { ...file.result, bytes } });
  await press(button('Import CSV'));
  expect(mockRelease.mock.calls).toEqual([[LINK]]);
  expect(bytes.mock.invocationCallOrder[0]).toBeLessThan(mockRelease.mock.invocationCallOrder[0]);
  expect(radio('Customers 21')).toBeOnTheScreen();
  await importFile('notes.txt', 'hello', 'text/plain');
  await importFile('broken.csv', new Error('unreadable'));
  expect(mockRelease.mock.calls).toEqual([[LINK], [LINK], [LINK]]);
  // a failure to give it up changes nothing for the person
  mockRelease.mockRejectedValueOnce(new Error('gone'));
  await importFile('one.csv', 'Code,Registered name\r\nC9,One Customer\r\n');
  expect(mockToast.mock.calls.at(-1)).toEqual(['Imported 1 customer and 0 suppliers.']);
});

test('not a CSV', async () => {
  await render(<ListsScreen />);
  await importFile('parties.xlsx', PARTIES, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  expect(banner(NOT_CSV)).toBeOnTheScreen();
  expect(screen.getByText('No customers yet')).toBeOnTheScreen();
  // the name's .csv in any case is enough, whatever type the phone gives it
  await importFile('PARTIES.CSV', PARTIES, 'application/octet-stream');
  expect(radio('Customers 21')).toBeOnTheScreen();
});

test("a CSV picked from Downloads, whose link doesn't carry its name, still imports", async () => {
  await render(<ListsScreen />);
  await importFile('msf:1000000123', PARTIES, 'text/comma-separated-values');
  expect(mockToast).toHaveBeenCalledWith('Imported 21 customers and 2 suppliers. 1 row skipped: no name.');
});

test("a CSV saved by Excel's plain CSV keeps its ñ", async () => {
  // Excel's "CSV (Comma delimited)" writes Windows-1252; read as UTF-8 (File.text() on Android), its ñ would be lost
  const bytes = Uint8Array.from(Array.from('Code,Registered name\r\nC1,Parañaque Hardware\r\n', (c) => c.charCodeAt(0)));
  mockPick.mockResolvedValueOnce({
    canceled: false,
    result: { name: 'parties.csv', type: 'text/csv', text: async () => new TextDecoder().decode(bytes), bytes: async () => bytes },
  });
  await render(<ListsScreen />);
  await press(button('Import CSV'));
  expect(screen.getByText('Parañaque Hardware')).toBeOnTheScreen();
});
