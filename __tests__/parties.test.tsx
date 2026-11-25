import { act, fireEvent, render, screen, within } from '@testing-library/react-native';

import Result from '../app/result';
import { Check, type IconComponent } from '../components/icons';
import { SnackbarHost } from '../components/Snackbar';
import { addParty, clearItems, clearParties, customersOf, importPartiesCsv, lists } from '../lib/lists';
import { addScan, setEdit, updateScan } from '../lib/scans';
import { currentSnack, dismissSnack } from '../lib/snackbar';
import { colors, touch, type } from '../lib/theme';
import { parseScanResult } from '../modules/scanner/src/parse';
import { coreJson } from '../test-utils/coreJson';
import { clearFieldsFocused, fieldsFocused } from '../test-utils/fieldFocus';
import { memoryFs } from '../test-utils/memoryFs';
import { pinToday } from '../test-utils/today';
import { typeStylesOf } from '../test-utils/typeStyles';

// Design B §9.5: the party sheet (what the camera saw in the customer's boxes, then "In your customers" with the match
// and why, or "Not in your customers" with a New badge, since it goes out as written), its picker (a search, focused
// on open, that ignores case, accents and a TIN's dashes), the supplier sheet, and the terms as radio rows.

let mockParams: { id?: string; from?: string } = {};
const mockToast = jest.fn();

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useNavigation: () => ({ canGoBack: () => true, goBack: jest.fn() }), // going back (lib/navigation)
  useRouter: () => ({ back: jest.fn(), replace: jest.fn(), push: jest.fn() }),
  // the Scan screen's presses that open or leave run once until it's focused again (lib/navigation)
  useFocusEffect: (effect: () => void) => require('../test-utils/screenFocus').useFocusEffect(effect),
  useIsFocused: () => true,
}));
jest.mock('../modules/scanner', () => ({
  enhance: async (_uri: string, mode: string) => `file:///x/${mode}.img`,
  saveToPictures: jest.fn(),
  scanPhoto: jest.fn(),
}));
jest.mock('../lib/toast', () => ({ toast: (m: string) => mockToast(m) }));
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
}));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: async () => ({ localUri: 'file:///s' }) }) } }));
jest.mock('expo-file-system', () => require('../test-utils/memoryFs').memoryFs.module);

/** The real toast, which raises the snackbar: a test that looks at the message lets one call through. */
const { toast: actualToast } = jest.requireActual<{ toast: (message: string) => void }>('../lib/toast');

// The made-up lists (fixtures/lists): the synthetic pack's customers, a supplier, and a customer who is also a supplier.
const PARTIES: string = require('fs').readFileSync('fixtures/lists/parties.csv', 'utf8');

/** A made-up customer with an accent in its name. */
const PENA = {
  code: 'C021',
  type: 'customer',
  entity: 'company',
  registeredName: 'Peña Hardware',
  lastName: '',
  firstName: '',
  middleName: '',
  tradeName: '',
  tin: '900-000-004-00000',
  address: '',
  vatStatus: '',
  terms: '',
  fromScan: false,
} as const;

/** Sample 0007 (its customer: Torres Construction Supply, in the made-up lists; its first item: Sugar). */
async function showSample(): Promise<string> {
  // in act: the screen a test showed before re-renders with the sessions (useSessions)
  const id = await act(async () =>
    addScan({ label: 'Sample 0007', source: 'sample', result: parseScanResult(coreJson('inv_0007')) }),
  );
  mockParams = { id };
  await render(<Result />);
  return id;
}

/** The same invoice from the camera (or another fixture's): a real scan, whose names can be added to the lists. */
async function showScan(stem = 'inv_0007'): Promise<string> {
  // in act: the screen a test showed before re-renders with the sessions (useSessions)
  const id = await act(async () =>
    addScan({ label: 'Camera photo', source: 'camera', result: parseScanResult(coreJson(stem)) }),
  );
  mockParams = { id };
  await render(<Result />);
  return id;
}

const press = (el: Parameters<typeof fireEvent.press>[0]) => act(async () => fireEvent.press(el));
const typeIn = (label: string, text: string) => act(async () => fireEvent.changeText(screen.getByLabelText(label), text));
const header = (name: string) => screen.getByRole('header', { name });
/** The open sheet. */
const sheet = () => within(screen.getByTestId('sheet-panel'));
/** The open sheet's own buttons, in order: not its box rows, Close or Done. */
const sheetButtons = () =>
  sheet()
    .getAllByRole('button')
    .filter((b) => !String(b.props.testID).startsWith('box-'))
    .map((b) => b.props.accessibilityLabel)
    .filter((name) => name !== 'Close' && name !== 'Done');
/** The picker's rows, as TalkBack says them. */
const found = () => sheet().queryAllByTestId(/^party-/).map((row) => row.props.accessibilityLabel);
type Instance = ReturnType<typeof screen.getByText>;
/** The icons under a node drawn in a color. */
const iconsIn = (node: Instance, color: string) => node.queryAll((n) => n.props.stroke === color);
/** A glyph as drawn on its own, to compare with the one a row draws. */
async function drawingOf(Icon: IconComponent, color: string) {
  await render(<Icon size={touch.iconSmall} color={color} />);
  return screen.root!.toJSON();
}

beforeAll(() => pinToday(new Date(2026, 10, 18, 10, 0))); // a camera scan is checked as of the day it's read
afterAll(() => jest.useRealTimers());

beforeEach(async () => {
  jest.clearAllMocks();
  memoryFs.reset();
  await clearParties('customer');
  await clearParties('supplier');
  await clearItems();
  const left = currentSnack(); // a message a test left up, with no host now to take it down
  if (left) dismissSnack(left.id);
});

test('a matched customer', async () => {
  await importPartiesCsv(PARTIES, 'customer');
  await showSample();
  await press(screen.getByText('Customer'));
  expect(sheet().getByLabelText('Torres Construction Supply, TIN 223-344-556-00000')).toBeTruthy();
  expect(screen.getByText('Matched by its TIN and name.')).toBeTruthy();
});

test("the customer's boxes come under what the camera saw, or a text PDF's text", async () => {
  // design §9.5: "WHAT THE CAMERA SAW" with the name, TIN and address boxes (caps by the overline style); a text PDF
  // has no camera, so its heading says where its boxes came from (ruling T26-1)
  await showScan();
  await press(screen.getByText('Customer'));
  expect(sheet().getByText('What the camera saw')).toHaveStyle({ ...type.overline, color: colors.mute });
  expect(sheet().getByRole('header', { name: 'What the camera saw' })).toBeTruthy();

  const result = parseScanResult(coreJson('sales_text_0'));
  const id = await act(async () => addScan({ label: 'PDF: sales_text_0.pdf', source: 'pdf', result }));
  mockParams = { id };
  await render(<Result />);
  await press(screen.getByText('Customer'));
  expect(sheet().getByText("From the PDF's text")).toHaveStyle({ ...type.overline, color: colors.mute });
  expect(sheet().queryByText('What the camera saw')).toBeNull();
  expect(sheet().getByLabelText("Customer, From the PDF's text: “Cruz Trading”")).toBeTruthy();
});

test('In your customers, with the match and its reason', async () => {
  await importPartiesCsv(PARTIES, 'customer');
  const id = await showScan();
  await press(screen.getByText('Customer'));
  // Matched: the strip, the customer as a row (its name, then its TIN in figures), why, and Choose another
  expect(header('In your customers')).toBeTruthy();
  const torres = sheet().getByLabelText('Torres Construction Supply, TIN 223-344-556-00000');
  expect(within(torres).getByText('Torres Construction Supply')).toHaveStyle({ ...type.value, color: colors.ink });
  expect(within(torres).getByText('TIN 223-344-556-00000')).toHaveStyle(type.figureSmall);
  // jest runs as iOS, where value and button flatten alike, and so do figureSmall and label: the styles themselves
  expect(typeStylesOf(within(torres).getByText('Torres Construction Supply'))).toEqual(['value']);
  expect(typeStylesOf(within(torres).getByText('TIN 223-344-556-00000'))).toEqual(['figureSmall']);
  expect(sheet().getByText('Matched by its TIN and name.')).toHaveStyle({ ...type.body, color: colors.mute });
  expect(sheetButtons()).toEqual(['Choose another']);
  expect(sheet().getByText('Choose another')).toHaveStyle({ ...type.button, color: colors.brandText }); // a text button
  expect(typeStylesOf(sheet().getByText('Choose another'))).toEqual(['button']);
  expect(sheet().queryByText('New', { includeHiddenElements: true })).toBeNull();

  // The closest match: That's the one, Choose another, or add the name as written
  await act(async () => {
    setEdit(id, 'customer_name', 'Santos Merchandising');
    setEdit(id, 'customer_tin', '999-888-777');
  });
  expect(header('In your customers')).toBeTruthy();
  expect(sheet().getByLabelText('Santos Merchandise, TIN 345-678-901-00001')).toBeTruthy();
  expect(sheet().getByText('Closest match.')).toBeTruthy();
  expect(sheetButtons()).toEqual(["That's the one", 'Choose another', 'Add “Santos Merchandising” as a new customer']);
  await press(sheet().getByText("That's the one"));

  // Chosen: the person's pick, and why it's this one
  expect(sheet().getByLabelText('Santos Merchandise, TIN 345-678-901-00001')).toBeTruthy();
  expect(sheet().getByText('You chose this customer.')).toBeTruthy();
  expect(sheetButtons()).toEqual(['Choose another']);
  expect(screen.getByText('Chosen from your customers')).toBeTruthy();

  // Nothing written: the walk-in customer, with no TIN
  await act(async () => {
    updateScan(id, { party: null });
    setEdit(id, 'customer_name', '');
    setEdit(id, 'customer_tin', '');
  });
  expect(header('In your customers')).toBeTruthy();
  expect(sheet().getByLabelText('Walk-in (VARIOUS)')).toBeTruthy();
  expect(sheet().getByText("No customer written. It's exported as VARIOUS-CUST, the walk-in customer.")).toBeTruthy();
  expect(sheetButtons()).toEqual(['Choose from your customers']);
});

test('Not in your customers: the New badge and It goes out as written.', async () => {
  await importPartiesCsv(PARTIES, 'customer');
  const id = await showScan();
  // Review Focus 5: a 60-character name shows in full (made up, and like none of the customers)
  const name = 'Bagong Silang Northern Luzon Handicraft Weavers Cooperative.';
  expect(name).toHaveLength(60);
  await act(async () => {
    setEdit(id, 'customer_name', name);
    setEdit(id, 'customer_tin', '900-000-003');
  });
  await press(screen.getByText('Customer'));
  expect(header('Not in your customers')).toBeTruthy();
  // the name as written, with a New badge in brand that TalkBack says with it (ruling T4-4)
  const row = sheet().getByLabelText(`${name}, New`);
  expect(within(row).getByText(name).props.numberOfLines).toBeUndefined();
  const badge = within(row).getByText('New', { includeHiddenElements: true });
  expect(badge).toHaveStyle({ ...type.badge, color: colors.brandText });
  expect(badge.parent).toHaveStyle({ backgroundColor: colors.brandTint });
  expect(sheet().getByText('It goes out as written.')).toHaveStyle({ ...type.body, color: colors.mute });
  // today's buttons, as text buttons
  expect(sheetButtons()).toEqual([`Add “${name}” to your customers`, 'Choose from your customers']);
  const add = sheet().getByText(`Add “${name}” to your customers`);
  expect(add).toHaveStyle({ color: colors.brandText });
  expect(add.props.numberOfLines).toBeUndefined();

  // No customers at all: the same, with today's note on the empty list
  await act(async () => clearParties('customer'));
  expect(header('Not in your customers')).toBeTruthy();
  expect(sheet().getByLabelText(`${name}, New`)).toBeTruthy();
  expect(sheet().getByText('It goes out as written.')).toBeTruthy();
  expect(
    sheet().getByText('Your customer list is empty. Import it in Your lists, or add this customer now.'),
  ).toBeTruthy();
  expect(sheetButtons()).toEqual([`Add “${name}” to your customers`]);
});

test('"Added to your customers." shows above the sheet, not dimmed behind it', async () => {
  // Review Focus 1 (the plan's call 4): an open sheet is the snackbar's host, above its scrim; the root layout's host
  // is under the sheet. This one message goes through the real toast.
  mockToast.mockImplementationOnce(actualToast);
  await importPartiesCsv(PARTIES, 'customer');
  const id = addScan({ label: 'Camera photo', source: 'camera', result: parseScanResult(coreJson('inv_0007')) });
  setEdit(id, 'customer_name', 'Bagong Tindahan');
  setEdit(id, 'customer_tin', '900-000-003');
  mockParams = { id };
  await render(
    <>
      <Result />
      <SnackbarHost />
    </>,
  );
  await press(screen.getByText('Customer'));
  await press(screen.getByText('Add “Bagong Tindahan” to your customers'));
  // once, in the open sheet: not in the root host, dimmed behind its scrim
  expect(screen.getAllByText('Added to your customers.', { includeHiddenElements: true })).toHaveLength(1);
  expect(sheet().getByText('Added to your customers.')).toBeOnTheScreen();
  // the sheet goes: the message stays up, over the screen
  await press(screen.getByLabelText('Close'));
  expect(screen.queryByTestId('sheet-panel')).toBeNull();
  expect(screen.getAllByText('Added to your customers.', { includeHiddenElements: true })).toHaveLength(1);
});

test('choose another', async () => {
  await importPartiesCsv(PARTIES, 'customer');
  await showSample();
  await press(screen.getByText('Customer'));
  await press(screen.getByText('Choose another'));
  await typeIn('Search your customers', 'santos');
  await press(screen.getByText('Santos General Merchandise'));
  expect(within(screen.getByTestId('row-customer')).getByText('Santos General Merchandise')).toBeTruthy();
  expect(sheet().getByLabelText('Santos General Merchandise, TIN 345-678-901-00000')).toBeTruthy();
  expect(screen.getByText('Chosen from your customers')).toBeTruthy();
  expect(screen.getByText('You chose this customer.')).toBeTruthy();
});

test("the picker's search is focused and finds Peña by pena", async () => {
  await importPartiesCsv(PARTIES, 'customer');
  await addParty(PENA);
  await showSample();
  await press(screen.getByText('Customer'));
  await press(screen.getByText('Choose another'));
  expect(header('In your customers')).toBeTruthy();
  // a search field, focused on open (§9.5; Choose another opens it to search): its label is spoken, not shown, and it
  // leads with the search icon
  const search = () => screen.getByLabelText('Search your customers');
  expect(search().props.autoFocus).toBe(true);
  expect(search().props.placeholder).toBe('Search your customers');
  expect(sheet().queryByText('Search your customers')).toBeNull();
  expect(iconsIn(search().parent!, colors.chevron)).toHaveLength(1);
  // every customer as a list row: its name, then its TIN and code in figures
  const everyone = customersOf(lists()).length;
  expect(found()).toHaveLength(everyone);
  expect(found()).toContain('Peña Hardware, TIN 900-000-004-00000 · C021');
  expect(sheet().getByText('TIN 900-000-004-00000 · C021')).toHaveStyle(type.figureSmall);
  expect(typeStylesOf(sheet().getByText('TIN 900-000-004-00000 · C021'))).toEqual(['figureSmall']);

  // case and accents aside, either way round
  for (const query of ['pena', 'PEÑA HARD', ' peña ']) {
    await typeIn('Search your customers', query);
    expect([query, found()]).toEqual([query, ['Peña Hardware, TIN 900-000-004-00000 · C021']]);
  }
  // a TIN by its digits, with or without dashes
  for (const query of ['900000004', '900-000-004']) {
    await typeIn('Search your customers', query);
    expect([query, found()]).toEqual([query, ['Peña Hardware, TIN 900-000-004-00000 · C021']]);
  }
  await typeIn('Search your customers', 'nobody by that name');
  expect(found()).toEqual([]);
  expect(sheet().getByText('No match.')).toHaveStyle({ ...type.body, color: colors.mute });

  // Clear the search: every customer again, and typing goes on in the field (the clear button that had the focus is
  // gone with the text)
  clearFieldsFocused();
  await press(screen.getByRole('button', { name: 'Clear the search' }));
  expect(search().props.value).toBe('');
  expect(found()).toHaveLength(everyone);
  expect(fieldsFocused()).toEqual(['Search your customers']);

  await typeIn('Search your customers', 'pena');
  await press(sheet().getByText('Peña Hardware'));
  expect(sheet().getByLabelText('Peña Hardware, TIN 900-000-004-00000')).toBeTruthy();
  expect(sheet().getByText('You chose this customer.')).toBeTruthy();
});

test('add a new customer', async () => {
  await importPartiesCsv(PARTIES, 'customer');
  const id = await showScan();
  await act(async () => {
    setEdit(id, 'customer_name', 'Bagong Tindahan');
    setEdit(id, 'customer_tin', '900-000-003');
  });
  expect(screen.getByText(/Customer \(not in your list\)/)).toBeTruthy();
  await press(screen.getByText('Customer'));
  expect(header('Not in your customers')).toBeTruthy();
  await press(screen.getByText('Add “Bagong Tindahan” to your customers'));
  expect(mockToast).toHaveBeenCalledWith('Added to your customers.');
  expect(lists().parties.find((p) => p.registeredName === 'Bagong Tindahan')).toMatchObject({
    type: 'customer',
    tin: '900-000-003',
    fromScan: true,
    code: '',
  });
  expect(screen.getByText('Chosen from your customers')).toBeTruthy();
  expect(screen.queryByText(/Customer \(/)).toBeNull();
});

test('an empty customer list', async () => {
  await showScan();
  await press(screen.getByText('Customer'));
  expect(screen.getByText('Your customer list is empty. Import it in Your lists, or add this customer now.')).toBeTruthy();
  expect(screen.getByText('Add “TorresConstruction Supply” to your customers')).toBeTruthy();
});

test('a supplier from the list', async () => {
  await importPartiesCsv(PARTIES, 'customer');
  await showSample();
  await press(screen.getByText('Purchase'));
  await press(screen.getByText('Supplier'));
  await typeIn('Search your suppliers', 'wholesale');
  await press(screen.getByText('Isabela Wholesale Trading'));
  expect(screen.getByText('Isabela Wholesale Trading')).toBeTruthy();
  expect(screen.getByText('From your suppliers')).toBeTruthy();
  expect(screen.queryByText(/Supplier \(choose one\)/)).toBeNull();
});

test('a typed supplier', async () => {
  await showSample();
  await press(screen.getByText('Purchase'));
  await press(screen.getByText('Supplier'));
  await typeIn("Supplier's name", 'Juan Hardware');
  await press(screen.getByText('Use this name'));
  expect(screen.getByText('Juan Hardware')).toBeTruthy();
  expect(screen.getByText('Not in your supplier list')).toBeTruthy();
});

test('various suppliers', async () => {
  await showSample();
  await press(screen.getByText('Purchase'));
  await press(screen.getByText('Supplier'));
  await press(screen.getByText('Various suppliers'));
  expect(screen.getByText('Various suppliers')).toBeTruthy();
  expect(screen.getByText('Exported as VARIOUS-SUPP')).toBeTruthy();
});

test('the supplier sheet: the picker, Various suppliers, and a name not in the list', async () => {
  await importPartiesCsv(PARTIES, 'customer');
  await showScan();
  await press(screen.getByText('Purchase'));
  await press(screen.getByText('Supplier'));
  expect(header('Supplier')).toBeTruthy();
  expect(
    sheet().getByText(
      "Who sold it to you: the business printed at the top of the invoice. The scanner doesn't read that part, so choose it here.",
    ),
  ).toBeTruthy();
  // the suppliers to pick from, as the customers' picker has them, but its search isn't focused on open: the sheet
  // shows its choices first, which the keyboard would cover (ruling T14-1)
  const search = screen.getByLabelText('Search your suppliers');
  expect(search.props.autoFocus).toBe(false);
  expect(found()).toEqual([
    'Isabela Wholesale Trading, TIN 900-000-001-00000 · S001',
    'Maria Santos Reyes, TIN 900-000-002-00000 · B001',
  ]);
  // Various suppliers, a row of its own
  expect(sheet().getByRole('button', { name: 'Various suppliers, Exported as VARIOUS-SUPP' })).toBeTruthy();
  // not in the list: a strip, the name's field, then Use this name (secondary, the row's own share) and Add to your
  // suppliers (text), off until a name is typed
  expect(header('Not in your list?')).toBeTruthy();
  // a field's label, shown (TalkBack says it as the input's name)
  expect(sheet().getByText("Supplier's name", { includeHiddenElements: true })).toHaveStyle(type.label);
  const use = () => sheet().getByRole('button', { name: 'Use this name' });
  const add = () => sheet().getByRole('button', { name: 'Add to your suppliers' });
  expect(use()).toBeDisabled();
  expect(add()).toBeDisabled();
  await typeIn("Supplier's name", 'Juan Hardware');
  expect(use()).toBeEnabled();
  expect(add()).toBeEnabled();
  expect(use().parent).toHaveStyle({ flex: 1 }); // the one button that grows: no gap beside the text button
  expect(sheet().getByText('Add to your suppliers')).toHaveStyle({ color: colors.brandText });
});

test('add a typed supplier to the list', async () => {
  await showScan();
  await press(screen.getByText('Purchase'));
  await press(screen.getByText('Supplier'));
  await typeIn("Supplier's name", 'Juan Hardware');
  await press(screen.getByText('Add to your suppliers'));
  expect(mockToast).toHaveBeenCalledWith('Added to your suppliers.');
  expect(lists().parties.find((p) => p.registeredName === 'Juan Hardware')).toMatchObject({ type: 'supplier', fromScan: true });
  expect(screen.getByText('From your suppliers')).toBeTruthy();
});

test('search by TIN', async () => {
  await importPartiesCsv(PARTIES, 'customer');
  await showSample();
  await press(screen.getByText('Purchase'));
  await press(screen.getByText('Supplier'));
  await typeIn('Search your suppliers', '900000002');
  expect(screen.getByText('Maria Santos Reyes')).toBeTruthy();
  expect(screen.queryByText('Isabela Wholesale Trading')).toBeNull();
});

test("terms are radio rows in the form's words", async () => {
  const check = await drawingOf(Check, colors.ink);
  await showScan(); // sample 0007's photo: On account is ticked
  await press(screen.getByTestId('row-terms'));
  expect(sheet().getByText('On the paper: On account is ticked.')).toBeTruthy();
  // a radio group named Terms, as Segmented and ChoiceChips are (ruling T14-2), of the two choices in the form's order
  const choices = (group: string) =>
    within(screen.getByRole('radiogroup', { name: group }))
      .getAllByRole('radio')
      .map((radio) => radio.props.accessibilityLabel);
  expect(choices('Terms')).toEqual(['Cash', 'On account']);
  const cash = () => screen.getByRole('radio', { name: 'Cash' });
  const account = () => screen.getByRole('radio', { name: 'On account' });
  expect(account()).toBeChecked();
  expect(cash()).not.toBeChecked();
  // 48 dp rows in the form's own words, the chosen one with a check in ink (selection is ink)
  for (const row of [cash(), account()]) expect(row).toHaveStyle({ minHeight: touch.target });
  expect(within(cash()).getByText('Cash')).toHaveStyle({ ...type.body, color: colors.ink });
  expect(iconsIn(account(), colors.ink).map((icon) => icon.toJSON())).toEqual([check]);
  expect(iconsIn(cash(), colors.ink)).toHaveLength(0);
  expect(screen.queryByText('Use the tick on the paper')).toBeNull(); // nothing picked over the paper yet

  // a pick closes the sheet, and the row says it's the person's
  await press(cash());
  expect(screen.queryByTestId('sheet-panel')).toBeNull();
  expect(within(screen.getByTestId('row-terms')).getByText('Cash')).toBeTruthy();
  expect(screen.getByText('Chosen by you')).toBeTruthy();
  await press(screen.getByTestId('row-terms'));
  expect(cash()).toBeChecked();
  expect(account()).not.toBeChecked();
  // back to the tick on the paper: a text button
  expect(sheet().getByText('Use the tick on the paper')).toHaveStyle({ color: colors.brandText });
  await press(sheet().getByRole('button', { name: 'Use the tick on the paper' }));
  expect(screen.queryByText('Chosen by you')).toBeNull();
  expect(within(screen.getByTestId('row-terms')).getByText('On account')).toBeTruthy();

  // a Service Invoice's own words
  await showScan('svc_0000');
  await press(screen.getByTestId('row-terms'));
  expect(sheet().getByText('On the paper: Cash sales is ticked.')).toBeTruthy();
  expect(choices('Terms')).toEqual(['Cash sales', 'Charge sales']);
  expect(screen.getByRole('radio', { name: 'Cash sales' })).toBeChecked();
  expect(screen.getByRole('radio', { name: 'Charge sales' })).not.toBeChecked();
});

test('add an item from a scan', async () => {
  await showScan();
  await press(screen.getByText('Sugar'));
  await press(screen.getByText('Add “Sugar” to your items'));
  expect(mockToast).toHaveBeenCalledWith('Added to your items.');
  expect(lists().items).toMatchObject([{ name: 'Sugar', unit: 'kg', price: 85 }]);
  expect(screen.queryByText('Add “Sugar” to your items')).toBeNull();
});

test("a sample's made-up names aren't added to the lists", async () => {
  await showSample();
  await press(screen.getByText('Customer'));
  expect(screen.getByText('Your customer list is empty. Import it in Your lists.')).toBeTruthy();
  expect(screen.getByText("Samples are made up, so their names aren't added to your lists.")).toBeTruthy();
  expect(screen.queryByText('Add “TorresConstruction Supply” to your customers')).toBeNull();
  await press(screen.getByLabelText('Close'));
  await press(screen.getByText('Sugar'));
  expect(screen.queryByText('Add “Sugar” to your items')).toBeNull();
  await press(screen.getByLabelText('Close'));
  await press(screen.getByText('Purchase'));
  await press(screen.getByText('Supplier'));
  await typeIn("Supplier's name", 'Juan Hardware');
  expect(screen.getByText('Use this name')).toBeTruthy();
  expect(screen.queryByText('Add to your suppliers')).toBeNull();
  expect(lists().parties).toHaveLength(0);
});

test('switching between a sale and a purchase drops the chosen party', async () => {
  await importPartiesCsv(PARTIES, 'customer');
  await showScan();
  await press(screen.getByText('Customer'));
  await press(screen.getByText('Choose another'));
  await typeIn('Search your customers', 'santos');
  await press(screen.getByText('Santos General Merchandise'));
  await press(screen.getByLabelText('Close'));
  await press(screen.getByText('Purchase'));
  // the customer chosen for the sale isn't the supplier who issued the invoice
  expect(screen.getByText('Not chosen yet')).toBeTruthy();
  expect(screen.getByText(/Supplier \(choose one\)/)).toBeTruthy();
  await press(screen.getByText('Sale'));
  expect(screen.queryByText('Chosen from your customers')).toBeNull();
  expect(screen.getByText('Torres Construction Supply')).toBeTruthy();
});
