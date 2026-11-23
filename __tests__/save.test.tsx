import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { Platform } from 'react-native';

import Result from '../app/result';
import { SnackbarHost } from '../components/Snackbar';
import { saveBlock } from '../lib/exportRows';
import { addParty, clearParties, lists } from '../lib/lists';
import { saleOf } from '../lib/sale';
import * as savedStore from '../lib/saved';
import { openSaved } from '../lib/saved';
import { addScan, confirmBox, forgetScan, getScan, setEdit, type StoredScan, updateScan } from '../lib/scans';
import { annotationOn, settings, updateSettings } from '../lib/settings';
import { currentSnack, dismissSnack, type SnackAction } from '../lib/snackbar';
import * as theme from '../lib/theme';
import { uncheckedBoxes } from '../lib/training/boxes';
import { cleanCode } from '../lib/training/codes';
import type { ScanResult } from '../modules/scanner';
import { parseScanResult } from '../modules/scanner/src/parse';
import { coreJson } from '../test-utils/coreJson';
import { memoryFs } from '../test-utils/memoryFs';
import { PACK_LISTS } from '../test-utils/packLists';
import { pinToday } from '../test-utils/today';

// Design B §9.6, and §9.11 for annotation mode: the save sheets. A summary of the import row (a 2307's rows), today's
// fields restyled, a warning banner for what's still marked to check, then Cancel and the save pinned under them. The
// save loads while it runs and runs once; after it, the sheet closes and a snackbar says so, with View, which opens
// Saved for the kind.

let mockParams: { id?: string; from?: string } = {};
let mockTeam = false;
const mockToast = jest.fn();
const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useNavigation: () => ({ canGoBack: () => true, goBack: jest.fn() }), // going back (lib/navigation)
  useRouter: () => ({ back: jest.fn(), replace: jest.fn(), push: mockPush }),
  // a screen's pushes run once until it's focused again (lib/navigation)
  useFocusEffect: (effect: () => void) => require('../test-utils/screenFocus').useFocusEffect(effect),
  useIsFocused: () => true,
}));
jest.mock('../modules/scanner', () => ({
  enhance: async (_uri: string, mode: string) => `file:///x/${mode}.img`,
  saveToPictures: jest.fn(),
  scanPhoto: jest.fn(),
}));
// Ruling P8: the snackbar's action goes through too, so a test can check it. The arguments go through as given, so a
// message without an action is still checked by its words alone.
jest.mock('../lib/toast', () => ({ toast: (...args: unknown[]) => mockToast(...args) }));
jest.mock('../lib/build', () => ({
  get TEAM_BUILD() {
    return mockTeam;
  },
}));
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
}));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: async () => ({ localUri: 'file:///s' }) }) } }));
jest.mock('expo-file-system', () => require('../test-utils/memoryFs').memoryFs.module);

/** The real toast, which raises the snackbar: a test that looks at where a message shows lets the calls through. */
const { toast: actualToast } = jest.requireActual<{ toast: (message: string, action?: SnackAction) => void }>(
  '../lib/toast',
);

async function show(
  stem: string,
  opts: { source?: StoredScan['source']; edit?: (r: ScanResult) => void } = {},
): Promise<string> {
  const result = parseScanResult(coreJson(stem));
  opts.edit?.(result);
  const id = addScan({ label: 'Camera photo', source: opts.source ?? 'camera', result });
  mockParams = { id };
  await render(<Result />);
  return id;
}

const press = (el: Parameters<typeof fireEvent.press>[0]) => act(async () => fireEvent.press(el));
const type = (label: string, text: string) => act(async () => fireEvent.changeText(screen.getByLabelText(label), text));
const header = (name: string) => screen.getByRole('header', { name });
/** The open sheet. */
const sheet = () => within(screen.getByTestId('sheet-panel'));
/** The sheet's pinned action row: its buttons, in order. */
const actions = () =>
  within(screen.getByTestId('sheet-actions'))
    .getAllByRole('button')
    .map((b) => b.props.accessibilityLabel);
/** A radio group's options, in order. */
const options = (group: string) =>
  within(screen.getByRole('radiogroup', { name: group }))
    .getAllByRole('radio')
    .map((r) => r.props.accessibilityLabel);
/** Checks every box that can become training data, as "Looks right" does. */
const checkEveryBox = (id: string) =>
  act(async () => uncheckedBoxes(getScan(id)!).forEach((box) => confirmBox(id, box)));
const keptScan = (id: string) => JSON.parse(memoryFs.files.get(`file:///docs/saved/${id}/scan.json`) as string);
const keptRecent = (id: string) =>
  JSON.parse(memoryFs.files.get('file:///docs/recent.json') as string).find((s: { id: string }) => s.id === id);
const CHANGED = 'Changed since it was saved. The export still has the saved version. Save changes to update it.';
const SAVED = 'Saved as a sale · Nov\u00A018 · Not exported yet';
const SUGGESTED = "Suggested from the invoice's VAT boxes";
const ACCOUNT_HELPER = 'Code or name, as in MyBizMate';
const CODES_ONLY = 'Codes only, like C014 and W03. Never a name.';
const CODE_FORM = 'Start with a letter. Use letters, digits and -, with 1 to 6 digits.';
/** The snackbar's action after a save. */
const VIEW = { label: 'View', onPress: expect.any(Function) };
/** The action of the last message, as the snackbar would get it. */
const lastAction = () => mockToast.mock.calls.at(-1)![1] as SnackAction;
/** Saves the sale on screen with the save sheet: the first save of the test, so it asks about VAT. */
async function saveSale() {
  await press(screen.getByTestId('save-open'));
  await press(screen.getByText('Not VAT-registered'));
  await type('Revenue account', '4010');
  await press(screen.getByTestId('save-confirm'));
}

beforeAll(() => pinToday(new Date(2026, 10, 18, 10, 0)));
afterAll(() => jest.useRealTimers());

beforeEach(async () => {
  jest.clearAllMocks();
  memoryFs.reset();
  mockTeam = false;
  await updateSettings({
    vatRegistered: null,
    revenueAccount: '',
    expenseAccount: '',
    atc: '',
    offsetAccount: '',
    annotation: false,
    clientCode: '',
    writerCode: '',
  });
  const left = currentSnack(); // a message a test left up, with no host now to take it down
  if (left) dismissSnack(left.id);
});

afterEach(() => {
  jest.restoreAllMocks(); // a test's spy on the save
  mockToast.mockReset(); // and its real toast
});

test('the first sale asks whether the business is VAT-registered', async () => {
  await show('inv_0007');
  await press(screen.getByTestId('save-open'));
  expect(screen.getByText('Save as a sale')).toBeTruthy();
  expect(screen.getByText('Your business is')).toBeTruthy();
  await press(screen.getByText('Not VAT-registered'));
  expect(settings().vatRegistered).toBe(false);
  expect(screen.getByRole('radio', { name: 'Non-VAT', checked: true })).toBeTruthy();
  expect(screen.queryByText('Your business is')).toBeNull();
});

test('the sale sheet: title, subtitle, the summary with New, five tax types, Cash / On account', async () => {
  await updateSettings({ vatRegistered: true });
  const id = await show('inv_0007'); // its customer, as written: there are no customers yet
  await press(screen.getByTestId('save-open'));
  expect(header('Save as a sale')).toBeOnTheScreen();
  expect(sheet().getByText("It becomes a row in MyBizMate's Sales import. Export it from Saved.")).toBeOnTheScreen();

  // the summary: the date and the gross in figures, and the customer with New, since it goes out as written
  expect(sheet().getByLabelText('Date, Sep 20, 2026')).toBeOnTheScreen();
  const customer = sheet().getByLabelText('Customer, TorresConstruction Supply, New');
  expect(within(customer).getByText('New')).toHaveStyle({ color: theme.colors.brandText }); // the brand badge
  expect(sheet().getByLabelText('Gross (VAT included), ₱24,377.00')).toBeOnTheScreen();
  expect(sheet().queryByText('Discount')).toBeNull(); // none on this invoice
  expect(sheet().queryByText(/not in your list/)).toBeNull(); // the badge says it now

  // today's five tax types; the terms as Cash or On account, ticked as on the paper
  expect(options('Tax type')).toEqual(['VAT', 'Non-VAT', 'Zero-rated', 'VAT-exempt', 'Not applicable']);
  expect(options('Terms')).toEqual(['Cash', 'On account']);
  expect(screen.getByRole('radio', { name: 'On account', checked: true })).toBeOnTheScreen();

  // the account in figures, with its helper in place of a placeholder
  const account = screen.getByLabelText('Revenue account');
  expect(account).toHaveStyle(theme.type.figure);
  expect(account.props.placeholder).toBeUndefined();
  expect(account.props.accessibilityHint).toBe(ACCOUNT_HELPER);
  expect(sheet().getByText(ACCOUNT_HELPER)).toBeOnTheScreen();

  // Cancel and Save sale, pinned under the scroll: Save waits for the account
  expect(actions()).toEqual(['Cancel', 'Save sale']);
  expect(within(screen.getByTestId('sheet-scroll')).queryByRole('button', { name: 'Cancel' })).toBeNull();
  expect(within(screen.getByTestId('sheet-actions')).getByText('Cancel')).toHaveStyle({
    color: theme.colors.brandText, // a text button
  });
  expect(screen.getByTestId('save-confirm')).toBeDisabled();
  await type('Revenue account', '4010');
  await press(screen.getByTestId('save-confirm'));
  expect(getScan(id)!.saved!.details).toEqual({ taxType: 'VAT', account: '4010', terms: 'account', atc: '' });
  // On account is only how the sheet says it: the export still writes MyBizMate's word
  expect(savedStore.summaryRows(savedStore.savedSummary(id)!)[0]['Terms *']).toBe('On Account');

  // a discount shows when the invoice has one
  await show('svc_0002');
  await press(screen.getByTestId('save-open'));
  expect(sheet().getByLabelText('Discount, ₱77.95')).toBeOnTheScreen();
});

test('the purchase sheet: the supplier as typed, with New, and the expense account', async () => {
  const id = await show('inv_0007');
  await act(async () => updateScan(id, { kind: 'purchase', party: { name: 'Juan Hardware' } }));
  await press(screen.getByTestId('save-open'));
  expect(header('Save as a purchase')).toBeOnTheScreen();
  expect(
    sheet().getByText("It becomes a row in MyBizMate's Purchases import. Export it from Saved."),
  ).toBeOnTheScreen();
  expect(sheet().getByLabelText('Supplier, Juan Hardware, New')).toBeOnTheScreen();
  expect(screen.queryByText('Your business is')).toBeNull(); // only a sale asks
  expect(screen.getByLabelText('Expense account')).toHaveStyle(theme.type.figure);
  expect(actions()).toEqual(['Cancel', 'Save purchase']);
  await type('Expense account', '5010');
  await press(screen.getByTestId('save-confirm'));
  expect(mockToast).toHaveBeenCalledWith('Saved as a purchase', VIEW);
  lastAction().onPress();
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/saved', params: { kind: 'purchase' } });
});

test('the customer: New when it goes out as written, and an unsure match says so', async () => {
  // the pack's customers: Santos Merchandise (C004) is only the closest match for "Santos Merchandising"
  for (const { id, exportedAt, ...customer } of PACK_LISTS.parties) await addParty(customer);
  try {
    const id = await show('inv_0007');
    await act(async () => {
      setEdit(id, 'customer_name', 'Bagong Tindahan');
      setEdit(id, 'customer_tin', '900-000-003');
    });
    await press(screen.getByTestId('save-open'));
    expect(sheet().getByLabelText('Customer, Bagong Tindahan, New')).toBeOnTheScreen();
    await press(screen.getByRole('button', { name: 'Cancel' }));
    await act(async () => {
      setEdit(id, 'customer_name', 'Santos Merchandising');
      setEdit(id, 'customer_tin', '99988877700000');
    });
    await press(screen.getByTestId('save-open'));
    expect(sheet().getByLabelText('Customer, Santos Merchandise (match not confirmed)')).toBeOnTheScreen();
    expect(sheet().queryByText('New')).toBeNull();
  } finally {
    await act(async () => clearParties('customer')); // the screen is still up, and the lists change under it
  }
});

test('the tax type helper shows while it is the suggestion, and only one the VAT boxes made', async () => {
  const id = await show('inv_0007');
  await press(screen.getByTestId('save-open'));
  // suggested from the VAT boxes, until the answer about VAT or the person's pick
  expect(screen.getByRole('radio', { name: 'VAT', checked: true })).toBeOnTheScreen();
  expect(sheet().getByText(SUGGESTED)).toBeOnTheScreen();
  // ruling T15-1: a business that isn't VAT-registered sells Non-VAT, whatever the boxes say: the helper would be untrue
  await press(screen.getByText('Not VAT-registered'));
  expect(screen.getByRole('radio', { name: 'Non-VAT', checked: true })).toBeOnTheScreen();
  expect(sheet().queryByText(SUGGESTED)).toBeNull();
  await press(screen.getByRole('radio', { name: 'Zero-rated' }));
  expect(screen.getByRole('radio', { name: 'Zero-rated', checked: true })).toBeOnTheScreen();
  expect(sheet().queryByText(SUGGESTED)).toBeNull();

  // saved with it: the sheet opens again at the saved type, which isn't a suggestion
  await type('Revenue account', '4010');
  await press(screen.getByTestId('save-confirm'));
  expect(getScan(id)!.saved!.details).toMatchObject({ taxType: 'ZERO' });
  await press(screen.getByTestId('save-open'));
  expect(screen.getByRole('radio', { name: 'Zero-rated', checked: true })).toBeOnTheScreen();
  expect(sheet().queryByText(SUGGESTED)).toBeNull();
});

test("the tax type helper: a VAT-registered business's sale, and any purchase, are suggested from the VAT boxes", async () => {
  // ruling T15-1: only a sale by a business that isn't VAT-registered is Non-VAT by that status
  await updateSettings({ vatRegistered: true });
  const id = await show('inv_0007');
  await press(screen.getByTestId('save-open'));
  expect(screen.getByRole('radio', { name: 'VAT', checked: true })).toBeOnTheScreen();
  expect(sheet().getByText(SUGGESTED)).toBeOnTheScreen();
  await press(screen.getByRole('button', { name: 'Cancel' }));

  await act(async () => updateSettings({ vatRegistered: false }));
  await press(screen.getByTestId('save-open'));
  expect(screen.getByRole('radio', { name: 'Non-VAT', checked: true })).toBeOnTheScreen();
  expect(sheet().queryByText(SUGGESTED)).toBeNull();
  await press(screen.getByRole('button', { name: 'Cancel' }));

  // the same business's purchase: its type is the supplier's, read from the boxes
  await act(async () => updateScan(id, { kind: 'purchase', party: { name: 'Juan Hardware' } }));
  await press(screen.getByTestId('save-open'));
  expect(screen.getByRole('radio', { name: 'VAT', checked: true })).toBeOnTheScreen();
  expect(sheet().getByText(SUGGESTED)).toBeOnTheScreen();
});

test('Save stays off until the account and the terms are set', async () => {
  await show('inv_0007', {
    edit: (r) => {
      r.terms = null;
    },
  });
  await press(screen.getByTestId('save-open'));
  await press(screen.getByText('VAT-registered'));
  expect(screen.getByTestId('save-confirm')).toBeDisabled();
  await type('Revenue account', '4010');
  expect(screen.getByTestId('save-confirm')).toBeDisabled();
  await press(screen.getByRole('radio', { name: 'Cash' }));
  expect(screen.getByTestId('save-confirm')).toBeEnabled();
});

test('saving', async () => {
  await show('inv_0007');
  await press(screen.getByTestId('save-open'));
  await press(screen.getByText('Not VAT-registered'));
  await type('Revenue account', '4010');
  await press(screen.getByTestId('save-confirm'));
  expect(mockToast).toHaveBeenCalledWith('Saved as a sale', VIEW);
  expect(screen.getByText(SAVED)).toBeTruthy();
  expect(screen.getByTestId('save-open')).toHaveTextContent('Save changes');
  expect(settings().revenueAccount).toBe('4010');
});

test('a double tap saves once', async () => {
  // Review Focus 3: the second tap comes while the first save is still being written
  const realSave = savedStore.saveScan;
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  const save = jest.spyOn(savedStore, 'saveScan').mockImplementation(async (...args) => {
    await held;
    return realSave(...args);
  });
  const id = await show('inv_0007');
  await press(screen.getByTestId('save-open'));
  await press(screen.getByText('Not VAT-registered'));
  await type('Revenue account', '4010');
  // A fast double tap: inside one act() scope, nothing re-renders between the two taps.
  await act(async () => {
    await fireEvent.press(screen.getByTestId('save-confirm'));
    await fireEvent.press(screen.getByTestId('save-confirm'));
  });
  expect(save).toHaveBeenCalledTimes(1);
  // it loads while the save runs, and a tap then does nothing either
  expect(screen.getByTestId('save-confirm-spinner')).toBeOnTheScreen();
  await press(screen.getByTestId('save-confirm'));
  expect(save).toHaveBeenCalledTimes(1);

  await act(async () => release());
  expect(save).toHaveBeenCalledTimes(1);
  expect(getScan(id)!.saved).not.toBeNull();
  expect(mockToast).toHaveBeenCalledTimes(1);
  expect(screen.queryByTestId('sheet-panel')).toBeNull();
});

test('after a save, a snackbar with View opens Saved for that kind', async () => {
  const id = await show('inv_0007');
  await saveSale();
  // the sheet has closed, and the strip and the saved line show the saved state
  expect(getScan(id)!.saved).not.toBeNull();
  expect(screen.queryByTestId('sheet-panel')).toBeNull();
  expect(screen.getByText('Look over the values')).toBeOnTheScreen();
  expect(screen.getByText(SAVED)).toBeOnTheScreen();
  expect(mockToast).toHaveBeenCalledTimes(1);
  expect(mockToast).toHaveBeenCalledWith('Saved as a sale', VIEW);
  expect(mockPush).not.toHaveBeenCalled();
  lastAction().onPress();
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/saved', params: { kind: 'sale' } });
});

test('a re-save says Changes saved', async () => {
  await show('inv_0007');
  await saveSale();
  expect(mockToast).toHaveBeenLastCalledWith('Saved as a sale', VIEW);
  await press(screen.getByTestId('save-open')); // Save changes
  await press(screen.getByTestId('save-confirm'));
  expect(mockToast).toHaveBeenLastCalledWith('Changes saved', VIEW);
  lastAction().onPress();
  expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/saved', params: { kind: 'sale' } });
});

test("a failed save keeps the sheet open, and says so in it, not behind it", async () => {
  // Review Focus 1: a message raised while the sheet is open shows in the sheet's own host, above its scrim, not in
  // the root layout's under it. These messages go through the real toast.
  mockToast.mockImplementation(actualToast);
  const save = jest.spyOn(savedStore, 'saveScan').mockRejectedValueOnce(new Error('No space left on device'));
  const id = addScan({ label: 'Camera photo', source: 'camera', result: parseScanResult(coreJson('inv_0007')) });
  mockParams = { id };
  await render(
    <>
      <Result />
      <SnackbarHost />
    </>,
  );
  await press(screen.getByTestId('save-open'));
  await press(screen.getByText('Not VAT-registered'));
  await type('Revenue account', '4010');
  await press(screen.getByTestId('save-confirm'));
  expect(screen.getAllByText("Couldn't save the invoice.", { includeHiddenElements: true })).toHaveLength(1);
  expect(sheet().getByText("Couldn't save the invoice.")).toBeOnTheScreen();
  // the sheet stays as it was, and Save runs again
  expect(getScan(id)!.saved).toBeNull();
  expect(screen.getByLabelText('Revenue account').props.value).toBe('4010');
  expect(screen.getByTestId('save-confirm')).toBeEnabled();
  await press(screen.getByTestId('save-confirm'));
  expect(save).toHaveBeenCalledTimes(2);
  expect(getScan(id)!.saved).not.toBeNull();
  // the sheet has gone, and the message that it saved shows over the screen, with View
  expect(screen.queryByTestId('sheet-panel')).toBeNull();
  expect(screen.getByText('Saved as a sale')).toBeOnTheScreen();
  await press(screen.getByRole('button', { name: 'View' }));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/saved', params: { kind: 'sale' } });

  // a 2307's says it for a 2307
  save.mockRejectedValueOnce(new Error('No space left on device'));
  await show('bir2307_text_1', { source: 'pdf' });
  await press(screen.getByTestId('save-open'));
  await type('Offset account', '1205');
  await press(screen.getByTestId('save-confirm'));
  expect(sheet().getByText("Couldn't save the 2307.")).toBeOnTheScreen();
});

test("a sample can't be saved", async () => {
  await show('inv_0007', { source: 'sample' });
  expect(screen.queryByTestId('save-open')).toBeNull();
  expect(screen.getByText("Samples are made up, so they can't be saved.")).toBeTruthy();
});

test('the date is needed first', async () => {
  const id = await show('inv_0007');
  await act(async () => setEdit(id, 'date', 'hello'));
  await press(screen.getByTestId('save-open'));
  expect(mockToast).toHaveBeenCalledWith('Add the date first: tap Date.');
  expect(screen.queryByText('Save as a sale')).toBeNull();
});

test('a purchase needs its supplier first', async () => {
  await show('inv_0007');
  await press(screen.getByText('Purchase'));
  expect(screen.getByTestId('save-open')).toHaveTextContent('Save purchase');
  await press(screen.getByTestId('save-open'));
  expect(mockToast).toHaveBeenCalledWith('Choose the supplier first: tap Supplier.');
});

test('withholding asks for the ATC', async () => {
  const id = await show('svc_0002');
  await act(async () => setEdit(id, 'withholding', '50.00'));
  await press(screen.getByTestId('save-open'));
  expect(screen.getByLabelText('Withholding tax ATC')).toBeTruthy();
  const note = 'The invoice shows ₱50.00 withheld. MyBizMate works out the tax from the ATC code.';
  expect(screen.getByText(note)).toBeTruthy();
  expect(screen.getByText(/things? (is|are) still marked to check\. You can save anyway\./)).toBeTruthy();
  // in figures, with today's note under it, which TalkBack hears as the field's hint
  expect(screen.getByLabelText('Withholding tax ATC')).toHaveStyle(theme.type.figure);
  expect(screen.getByLabelText('Withholding tax ATC').props.accessibilityHint).toBe(note);
});

test("the ATC is a code: capitals, on Android's keyboard with a number row; the accounts take a code or a name", async () => {
  // the plan's call 15, as Settings' ATC has it: visible-password keeps every character and adds a number row
  jest.replaceProperty(Platform, 'OS', 'android');
  const keyboardOf = (label: string) => {
    const { keyboardType, autoCapitalize, autoCorrect } = screen.getByLabelText(label).props;
    return [keyboardType, autoCapitalize, autoCorrect];
  };
  const id = await show('svc_0002');
  await act(async () => setEdit(id, 'withholding', '50.00'));
  await press(screen.getByTestId('save-open'));
  expect(keyboardOf('Withholding tax ATC')).toEqual(['visible-password', 'characters', false]);
  expect(keyboardOf('Revenue account')).toEqual([undefined, undefined, false]); // words: the default keyboard
  await show('bir2307_text_1', { source: 'pdf' });
  await press(screen.getByTestId('save-open'));
  expect(keyboardOf('Offset account')).toEqual([undefined, undefined, false]);
});

test('the banner counts what is still marked to check', async () => {
  await updateSettings({ vatRegistered: true });
  // checks passed: no banner
  const id = await show('inv_0007');
  await press(screen.getByTestId('save-open'));
  expect(sheet().queryByRole('alert')).toBeNull();
  await press(screen.getByRole('button', { name: 'Cancel' }));
  // a date that isn't in the last 6 months: 1 thing, the strip's count
  await act(async () => setEdit(id, 'date', '01/15/2020'));
  expect(header('1 to check')).toBeOnTheScreen();
  await press(screen.getByTestId('save-open'));
  const banner = sheet().getByRole('alert', { name: '1 thing is still marked to check. You can save anyway.' });
  expect(banner).toHaveStyle({ backgroundColor: theme.colors.warningTint, borderColor: theme.colors.warningLine });
  expect(within(screen.getByTestId('sheet-scroll')).getByRole('alert')).toBe(banner); // in the scroll, not pinned
  await type('Revenue account', '4010');
  expect(screen.getByTestId('save-confirm')).toBeEnabled(); // saving doesn't wait for it
  // 2 things
  await show('inv_0051');
  expect(header('2 to check')).toBeOnTheScreen();
  await press(screen.getByTestId('save-open'));
  expect(
    sheet().getByRole('alert', { name: '2 things are still marked to check. You can save anyway.' }),
  ).toBeOnTheScreen();
});

test('a change after saving says the export still has the saved version', async () => {
  const id = await show('inv_0007');
  await press(screen.getByTestId('save-open'));
  await press(screen.getByText('Not VAT-registered'));
  await type('Revenue account', '4010');
  await press(screen.getByTestId('save-confirm'));
  expect(screen.getByText(SAVED)).toBeTruthy();
  await act(async () => setEdit(id, 'invoice_no', '0007999'));
  expect(screen.getByText(CHANGED)).toBeTruthy();
  await press(screen.getByTestId('save-open'));
  await press(screen.getByTestId('save-confirm'));
  expect(screen.getByText(SAVED)).toBeTruthy();
  // a switch to a purchase changes what would go out too
  await press(screen.getByText('Purchase'));
  expect(screen.getByText(CHANGED)).toBeTruthy();
});

// A made-up 2307 (fixtures/core/expected2307) imported as a text PDF. bir2307_text_1, Q4 2026: four income payments
// and one business-tax row, tax withheld ₱47,937.78 + ₱9,462.76; its payor, Castillo Eatery, with no customers yet.

test('the 2307 sheet: Payor, Period, Tax withheld, the offset account', async () => {
  const id = await show('bir2307_text_1', { source: 'pdf' });
  await press(screen.getByTestId('save-open'));
  expect(header('Save 2307')).toBeOnTheScreen();
  expect(
    sheet().getByText("Each payment becomes a row in MyBizMate's 2307-CWT import. Export it from Saved."),
  ).toBeOnTheScreen();
  // the summary: the payor with New, since it goes out as written; the period and the rows' tax in figures
  expect(sheet().getByLabelText('Payor, Castillo Eatery, New')).toBeOnTheScreen();
  expect(sheet().getByLabelText('Period, Q4 2026')).toBeOnTheScreen();
  expect(sheet().getByLabelText('Tax withheld, ₱57,400.54')).toBeOnTheScreen();
  expect(sheet().getByText('Q4 2026')).toHaveStyle(theme.type.figure);
  expect(sheet().getByText('₱57,400.54')).toHaveStyle(theme.type.figure);
  // the offset account in figures, with the account's helper in place of a placeholder
  const account = screen.getByLabelText('Offset account');
  expect(account).toHaveStyle(theme.type.figure);
  expect(account.props.placeholder).toBeUndefined();
  expect(account.props.accessibilityHint).toBe(ACCOUNT_HELPER);
  // none of an invoice's fields
  for (const group of ['Your business is', 'Tax type', 'Terms']) {
    expect(screen.queryByRole('radiogroup', { name: group })).toBeNull();
  }
  expect(actions()).toEqual(['Cancel', 'Save 2307']);
  expect(screen.getByTestId('save-confirm')).toBeDisabled();
  await type('Offset account', '1205');
  await press(screen.getByTestId('save-confirm'));
  expect(getScan(id)!.saved!.details).toEqual({ account: '1205' });
  expect(mockToast).toHaveBeenCalledWith('Saved as a 2307', VIEW);
  lastAction().onPress();
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/saved', params: { kind: '2307' } });
});

test('saving a 2307: the first save asks for the offset account', async () => {
  const id = await show('bir2307_text_1', { source: 'pdf' });
  expect(screen.getByTestId('save-open')).toHaveTextContent('Save 2307');
  await press(screen.getByTestId('save-open'));
  expect(
    screen.getByText("Each payment becomes a row in MyBizMate's 2307-CWT import. Export it from Saved."),
  ).toBeTruthy();
  expect(screen.getByLabelText('Payor, Castillo Eatery, New')).toBeTruthy();
  expect(screen.getByText('Q4 2026')).toBeTruthy();
  expect(screen.getByText('₱57,400.54')).toBeTruthy(); // the rows' tax withheld, both tables
  expect(screen.getByLabelText('Offset account').props.value).toBe('');
  expect(screen.getByTestId('save-confirm')).toHaveTextContent('Save 2307');
  expect(screen.getByTestId('save-confirm')).toBeDisabled();
  await type('Offset account', ' 1205 CWT Receivable ');
  expect(screen.getByTestId('save-confirm')).toBeEnabled();
  await press(screen.getByTestId('save-confirm'));
  expect(mockToast).toHaveBeenCalledWith('Saved as a 2307', VIEW);
  expect(screen.getByText('Saved as a 2307 · Nov\u00A018 · Not exported yet')).toBeTruthy();
  expect(screen.getByTestId('save-open')).toHaveTextContent('Save changes');
  expect(settings().offsetAccount).toBe('1205 CWT Receivable');

  // a change after saving: the export still has the saved rows until Save changes
  await act(async () => setEdit(id, 'ewt1_tax', '21,942.00'));
  expect(screen.getByText(CHANGED)).toBeTruthy();
  await press(screen.getByTestId('save-open'));
  expect(screen.getByLabelText('Offset account').props.value).toBe('1205 CWT Receivable'); // as it was saved
  expect(screen.getByText('₱57,400.06')).toBeTruthy(); // the rows' tax, not the total rows'
  await press(screen.getByTestId('save-confirm'));
  expect(screen.getByText('Saved as a 2307 · Nov\u00A018 · Not exported yet')).toBeTruthy();

  // the next 2307 has the account already
  await show('bir2307_text_0', { source: 'pdf' });
  await press(screen.getByTestId('save-open'));
  expect(screen.getByLabelText('Offset account').props.value).toBe('1205 CWT Receivable');
  expect(screen.getByTestId('save-confirm')).toBeEnabled();
});

test("an unsure payor: the save sheet names the payor as written, the name that goes out", async () => {
  // the pack's customers: Santos Merchandise (C004) is only the closest match for "Santos Merchandising"
  for (const { id, exportedAt, ...customer } of PACK_LISTS.parties) await addParty(customer);
  try {
    const id = await show('bir2307_text_0', { source: 'pdf' });
    await act(async () => {
      setEdit(id, 'payor_name', 'Santos Merchandising');
      setEdit(id, 'payor_tin', '99988877700000');
    });
    await press(screen.getByTestId('save-open'));
    expect(screen.getByText('Santos Merchandising (match not confirmed)')).toBeTruthy();
  } finally {
    await act(async () => clearParties('customer')); // the screen is still up, and the lists change under it
  }
});

test('a 2307 needs its period first', async () => {
  const id = await show('bir2307_text_1', { source: 'pdf' });
  await act(async () => setEdit(id, 'period_to', ''));
  await press(screen.getByTestId('save-open'));
  expect(mockToast).toHaveBeenCalledWith('Add the period first: tap Period.');
  expect(screen.queryByLabelText('Offset account')).toBeNull();
});

test('a 2307 needs its payor first, and its strip says so', async () => {
  // no name, and a TIN that matches no customer (there are none yet): nothing to check, but no payor to export
  const id = await show('bir2307_text_1', { source: 'pdf' });
  await act(async () => setEdit(id, 'payor_name', ''));
  expect(screen.getByText('Add the payor first: tap Payor')).toBeTruthy();
  expect(screen.queryByText('Checks passed')).toBeNull();
  await press(screen.getByTestId('save-open'));
  expect(mockToast).toHaveBeenCalledWith('Add the payor first: tap Payor.');
  expect(screen.queryByLabelText('Offset account')).toBeNull();
});

test('a 2307 needs its payments first, and its strip says so', async () => {
  await show('bir2307_text_0', {
    source: 'pdf',
    edit: (r) => {
      r.reads = r.reads.filter((b) => !b.name.startsWith('ewt')); // it has no business-tax rows either
    },
  });
  expect(screen.getByText('No income payments were read')).toBeTruthy();
  expect(screen.queryByText('Checks passed')).toBeNull();
  await press(screen.getByTestId('save-open'));
  expect(mockToast).toHaveBeenCalledWith('No income payments were read.');
  expect(screen.queryByLabelText('Offset account')).toBeNull();
});

// Annotation mode (Settings › Team tools, team builds only): each scan is saved with a source tag, a client's and a
// writer's code.

test('codes are codes', () => {
  expect(cleanCode('c014')).toBe('C014');
  expect(cleanCode('W03')).toBe('W03');
  expect(cleanCode('W-03')).toBe('W-03');
  expect(cleanCode(' w03 ')).toBe('W03');
  expect(cleanCode('CLIENT-00014')).toBe('CLIENT-00014'); // 12 characters
  expect(cleanCode('C123456')).toBe('C123456'); // 6 digits
  // a name, nothing, a space inside, 13 characters, a letter outside A-Z, no digit at all; what doesn't start with a
  // letter: a phone number, a TIN, a dash; and more than 6 digits, as a phone number or a TIN after a letter has
  const refused = ['Juan', '', 'C 014', 'CLIENT-000014', 'ñ1', 'WC-', '09171234567', '123-456-789', '-03'];
  refused.push('C1234567', 'P09171234567', 'T123-456-789');
  expect(refused.map(cleanCode)).toEqual(refused.map(() => null));
});

test("annotation mode: the codes with M4's notes; Save waits for valid codes", async () => {
  mockTeam = true;
  await updateSettings({ annotation: true });
  const first = await show('inv_0007');
  await checkEveryBox(first);
  await press(screen.getByTestId('save-open'));
  await press(screen.getByText('Not VAT-registered'));
  await type('Revenue account', '4010');
  expect(screen.getByLabelText('Client code').props.value).toBe(''); // none kept yet
  expect(screen.getByLabelText('Writer code').props.value).toBe('');
  expect(screen.getByText(CODES_ONLY)).toBeTruthy();
  expect(screen.getByText(CODE_FORM)).toBeTruthy();
  // the codes in figures, typed in capitals; M4's two notes as lines under the Writer code field (the plan's call 19)
  for (const label of ['Client code', 'Writer code']) {
    expect(screen.getByLabelText(label)).toHaveStyle(theme.type.figure);
    expect(screen.getByLabelText(label).props.autoCapitalize).toBe('characters');
  }
  const notes = [CODES_ONLY, CODE_FORM].map((note) => screen.getByText(note));
  for (const note of notes) expect(note).toHaveStyle({ ...theme.type.label, color: theme.colors.mute });
  // the Writer code field, then the two notes last, in a group of their own
  const writer = screen.getByTestId('writer-code');
  expect(within(writer).getByLabelText('Writer code')).toBeOnTheScreen();
  expect(within(writer).queryByLabelText('Client code')).toBeNull();
  expect(writer.children.slice(-2)).toEqual(notes);

  expect(screen.getByTestId('save-confirm')).toBeDisabled();
  await type('Client code', 'Juan');
  expect(screen.getByTestId('save-confirm')).toBeDisabled();
  await type('Client code', 'c014');
  expect(screen.getByLabelText('Client code').props.value).toBe('C014');
  expect(screen.getByTestId('save-confirm')).toBeDisabled(); // the writer's is still missing
  await type('Writer code', 'W 03');
  expect(screen.getByTestId('save-confirm')).toBeDisabled();
  await type('Writer code', 'w-03');
  expect(screen.getByTestId('save-confirm')).toBeEnabled();
  await press(screen.getByTestId('save-confirm'));
  expect(mockToast).toHaveBeenCalledWith('Saved as a sale', VIEW);
  const tag = { client: 'C014', writer: 'W-03' };
  expect(getScan(first)).toMatchObject({ annotated: true, tag });
  expect(keptScan(first)).toMatchObject({ annotated: true, tag });
  expect(settings()).toMatchObject({ clientCode: 'C014', writerCode: 'W-03' });

  // the next scan starts from the codes kept in Settings
  const next = await show('inv_0007');
  await checkEveryBox(next);
  await press(screen.getByTestId('save-open'));
  expect(screen.getByLabelText('Client code').props.value).toBe('C014');
  expect(screen.getByLabelText('Writer code').props.value).toBe('W-03');
  expect(screen.getByTestId('save-confirm')).toBeEnabled();
  await type('Client code', 'C015');
  await press(screen.getByTestId('save-confirm'));
  expect(getScan(next)).toMatchObject({ annotated: true, tag: { client: 'C015', writer: 'W-03' } });
  expect(settings()).toMatchObject({ clientCode: 'C015', writerCode: 'W-03' });

  // a saved scan's own codes stay its own when it's saved again
  mockParams = { id: first };
  await render(<Result />);
  await press(screen.getByTestId('save-open'));
  expect(screen.getByLabelText('Client code').props.value).toBe('C014');
  await press(screen.getByTestId('save-confirm'));
  expect(getScan(first)).toMatchObject({ annotated: true, tag });

  // a 2307 is asked for them too (a text PDF's boxes are its text's, so none waits to be checked)
  const cert = await show('bir2307_text_1', { source: 'pdf' });
  await press(screen.getByTestId('save-open'));
  expect(screen.getByLabelText('Client code').props.value).toBe('C014');
  expect(screen.getByText(CODES_ONLY)).toBeTruthy();
  await type('Offset account', '1205');
  await type('Client code', 'Maria');
  expect(screen.getByTestId('save-confirm')).toBeDisabled();
  await type('Client code', 'C016');
  await press(screen.getByTestId('save-confirm'));
  expect(getScan(cert)).toMatchObject({ annotated: true, tag: { client: 'C016', writer: 'W-03' } });
  expect(keptScan(cert)).toMatchObject({ annotated: true, tag: { client: 'C016', writer: 'W-03' } });
});

test('without annotation mode nothing changes', async () => {
  await updateSettings({ clientCode: 'C014', writerCode: 'W03' });
  // annotation mode is the setting in a team build: a phone moved to a client build keeps the setting, and only that
  for (const [team, annotation] of [
    [true, false],
    [false, true],
  ] as const) {
    mockTeam = team;
    await act(async () => updateSettings({ annotation }));
    const id = await show('inv_0007'); // none of its boxes checked
    const scan = getScan(id)!;
    expect(uncheckedBoxes(scan).length).toBeGreaterThan(0);
    expect(saveBlock(scan, saleOf(scan, lists(), settings()), { annotation: annotationOn() })).toBeNull();
    expect(screen.getByText('Checks passed')).toBeTruthy();
    await press(screen.getByTestId('save-open'));
    expect(screen.getByText('Save as a sale')).toBeTruthy();
    expect(screen.queryByLabelText('Client code')).toBeNull();
    expect(screen.queryByLabelText('Writer code')).toBeNull();
    expect(screen.queryByText('Codes only, like C014 and W03. Never a name.')).toBeNull();
    if (settings().vatRegistered === null) await press(screen.getByText('Not VAT-registered'));
    await type('Revenue account', '4010');
    await press(screen.getByTestId('save-confirm'));
    expect(getScan(id)).toMatchObject({ annotated: false, tag: null });
    expect(keptScan(id)).toMatchObject({ annotated: false, tag: null });
    // a box outside the import row changed since: only the import row counts, as before
    await act(async () => setEdit(id, 'item1_unit', 'kgs'));
    expect(screen.getByText(SAVED)).toBeTruthy();
    expect(screen.queryByText(CHANGED)).toBeNull();
  }
  expect(settings()).toMatchObject({ clientCode: 'C014', writerCode: 'W03' });
});

test('in annotation mode, any box changed since the save says so', async () => {
  mockTeam = true;
  await updateSettings({ annotation: true, clientCode: 'C014', writerCode: 'W03' });
  const id = await show('inv_0007');
  await act(async () => setEdit(id, 'item1_unit', 'kgs')); // read "kg": corrected before the save
  await checkEveryBox(id);
  await saveSale();
  expect(screen.getByText(SAVED)).toBeTruthy();
  // the save keeps a short hash of the edits and checks, never what a box says: on the scan, in scan.json and in
  // recent.json
  const marks = getScan(id)!.savedMarks;
  expect(marks).toMatch(/^[0-9a-f]{8}$/);
  expect([keptScan(id).savedMarks, keptRecent(id).savedMarks]).toEqual([marks, marks]);

  // a box outside the import row: the row's unit
  await act(async () => setEdit(id, 'item1_unit', 'pcs'));
  expect(screen.getByText(CHANGED)).toBeTruthy();
  // taken back to what was saved
  await act(async () => setEdit(id, 'item1_unit', 'kgs'));
  expect(screen.getByText(SAVED)).toBeTruthy();
  expect(screen.queryByText(CHANGED)).toBeNull();
  // a check alone: "Looks right" on the corrected unit, as it stands
  await act(async () => confirmBox(id, 'item1_unit'));
  expect(screen.getByText(CHANGED)).toBeTruthy();
  await press(screen.getByTestId('save-open'));
  await press(screen.getByTestId('save-confirm'));
  expect(screen.getByText(SAVED)).toBeTruthy();

  // a checked box edited and then taken back is no longer checked, so it says so until the box is checked again; the
  // order the boxes were checked in doesn't count
  await act(async () => setEdit(id, 'item2_unit', 'pcs')); // read "pc"
  expect(screen.getByText(CHANGED)).toBeTruthy();
  await act(async () => setEdit(id, 'item2_unit', 'pc'));
  expect(screen.getByText(CHANGED)).toBeTruthy();
  await act(async () => confirmBox(id, 'item2_unit'));
  expect(screen.getByText(SAVED)).toBeTruthy();

  // with the mode off, only the import row counts, as before
  await act(async () => setEdit(id, 'item1_unit', 'pcs'));
  expect(screen.getByText(CHANGED)).toBeTruthy();
  await act(async () => updateSettings({ annotation: false }));
  expect(screen.getByText(SAVED)).toBeTruthy();
  expect(screen.queryByText(CHANGED)).toBeNull();
});

test('a scan saved before the save kept its marks says only what its import row says', async () => {
  mockTeam = true;
  await updateSettings({ annotation: true, clientCode: 'C014', writerCode: 'W03' });
  const id = await show('inv_0007');
  await checkEveryBox(id);
  await saveSale();
  // its scan.json without the marks, as a save before this change wrote it, opened again from Saved
  const kept = keptScan(id);
  delete kept.savedMarks;
  memoryFs.files.set(`file:///docs/saved/${id}/scan.json`, JSON.stringify(kept));
  await act(async () => {
    forgetScan(id);
    await openSaved(id);
  });
  expect(getScan(id)!.savedMarks).toBe('');
  mockParams = { id, from: 'saved' };
  await render(<Result />);
  expect(screen.getByText(SAVED)).toBeTruthy();
  await act(async () => setEdit(id, 'item1_unit', 'pcs'));
  expect(screen.getByText(SAVED)).toBeTruthy();
  expect(screen.queryByText(CHANGED)).toBeNull();
  // its import row still counts
  await act(async () => setEdit(id, 'invoice_no', '0007999'));
  expect(screen.getByText(CHANGED)).toBeTruthy();
});
