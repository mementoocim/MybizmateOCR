import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { AccessibilityInfo, Platform, ScrollView, TextInput, View } from 'react-native';

import ProfileScreen from '../app/(tabs)/profile';
import { addItem, addParty, clearItems, clearParties } from '../lib/lists';
import * as store from '../lib/settings';
import { loadSettings, settings, updateSettings } from '../lib/settings';
import { colors, space, touch } from '../lib/theme';
import { keyboard } from '../test-utils/keyboard';
import { memoryFs } from '../test-utils/memoryFs';
import { focusAgain } from '../test-utils/screenFocus';
import { typeStylesOf } from '../test-utils/typeStyles';

// Design B §9.10: Settings, in groups, as the Profile tab (camera first, spec §6.8, call 17): with no Back. Your
// business: VAT-registered or not, which suggests each sale's tax type. Export defaults: the accounts and the ATC
// MyBizMate's imports need that aren't on the paper, in figures, each saved as it's typed; an ATC that isn't 2 letters
// and 3 digits gets a gentle warning. Your lists: Customers and items, with its counts, opens Your lists. About: Privacy
// in plain words, the open-source licenses, and the version. In team builds, Team tools (§9.11): annotation mode as one
// switch row, the training data and the speed test.

let mockTeam = false;
const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useNavigation: () => ({ canGoBack: () => true, goBack: jest.fn() }), // going back (lib/navigation)
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
  // a screen's pushes run once until it's focused again (lib/navigation)
  useFocusEffect: (effect: () => void) => require('../test-utils/screenFocus').useFocusEffect(effect),
}));
jest.mock('../lib/build', () => ({
  get TEAM_BUILD() {
    return mockTeam;
  },
}));
jest.mock('expo-file-system', () => require('../test-utils/memoryFs').memoryFs.module);
// The app's config as a release that sets a build number carries it.
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '1.0.0', android: { versionCode: 12 } } },
}));

const NOTE =
  "These fill in what MyBizMate's import needs that isn't on the paper. You can change them on each invoice when you save it. Changes save as you type.";
const ANNOTATION_NOTE = 'Every box must be checked before a scan saves, and each scan gets a client and writer code.';
const ACCOUNT_HELPER = 'Code or name, as in MyBizMate';
const ATC_HELPER = 'Used when an invoice shows tax withheld';
const ATC_WARNING = 'Like WC158: 2 letters, 3 digits';
const PRIVACY = [
  'Scans are read and kept on this phone.',
  'Nothing is sent anywhere.',
  "There's no cloud backup.",
  'Uninstalling the app removes everything it kept.',
];
/** The export defaults, top to bottom: each field's label and its helper. */
const FIELDS: readonly [label: string, helper: string | undefined][] = [
  ['Revenue account for sales', ACCOUNT_HELPER],
  ['Expense account for purchases', undefined],
  ['Withholding tax ATC', ATC_HELPER],
  ['Offset account for 2307s', undefined],
];

type Instance = ReturnType<typeof screen.getByText>;
const press = (el: Instance) => act(async () => fireEvent.press(el));
const typeIn = (el: Instance, text: string) => act(async () => fireEvent.changeText(el, text));
const button = (name: string | RegExp) => screen.getByRole('button', { name });
const header = (name: string) => screen.getByRole('header', { name });
/** A field's input, by the name TalkBack says. */
const field = (label: string) => screen.getByLabelText(label);
/** The header's title, then each group's strip, top to bottom. */
const headers = () => screen.getAllByRole('header').map((h) => h.props.children);
/** A row's chevrons. */
const chevronsIn = (node: Instance) => node.queryAll((n) => n.props.stroke === colors.chevron);
/** Whether this node, or a view above it, hides it from TalkBack (RNTL also counts iOS's accessibilityElementsHidden). */
const hiddenFromTalkBack = (node: Instance | null): boolean =>
  node !== null && (node.props.importantForAccessibility === 'no-hide-descendants' || hiddenFromTalkBack(node.parent));
/** The open sheet. */
const sheet = () => within(screen.getByTestId('sheet-panel'));
const focus = jest.mocked(AccessibilityInfo.sendAccessibilityEvent);
/** What TalkBack focus was sent to since the last clear: each view's spoken name, and the event. */
const focused = () =>
  focus.mock.calls.map(([view, event]) => [
    (view as { props?: { accessibilityLabel?: string } }).props?.accessibilityLabel,
    event,
  ]);
/** That these nodes sit in the screen's scroll in this order, top to bottom. */
function expectInOrder(...nodes: Instance[]) {
  const all = screen.getByTestId('screen-scroll').queryAll(() => true);
  const order = nodes.map((node) => all.indexOf(node));
  expect(order.every((at) => at >= 0)).toBe(true);
  expect(order).toEqual([...order].sort((a, b) => a - b));
}

beforeEach(async () => {
  mockTeam = false;
  mockPush.mockClear();
  memoryFs.reset();
  await updateSettings({
    vatRegistered: true,
    revenueAccount: '4010',
    expenseAccount: '',
    atc: '',
    offsetAccount: '',
    annotation: false,
    clientCode: '',
    writerCode: '',
  });
});

afterEach(() => {
  jest.restoreAllMocks(); // Platform.OS, where a test replaced it
});

const PARTY = {
  code: '',
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
} as const;

test('Profile: the settings as a tab, with no Back', async () => {
  await render(<ProfileScreen />);
  expect(header('Profile')).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  expect(screen.queryByText('Settings')).toBeNull();
});

test('Customers and items, with its counts, opens Your lists', async () => {
  await clearParties('customer');
  await clearParties('supplier');
  await clearItems();
  await render(<ProfileScreen />);
  // with nothing imported yet: the counts at 0, in figures and capitals as the row's sub-line
  const row = () => button(/^Customers and items, /);
  expect(row().props.accessibilityLabel).toBe('Customers and items, 0 customers · 0 suppliers · 0 items');
  const sub = within(row()).getByText('0 customers · 0 suppliers · 0 items');
  expect(typeStylesOf(sub)).toEqual(['figureSmall']);
  expect(sub).toHaveStyle({ textTransform: 'uppercase' });
  expect(chevronsIn(row())).not.toHaveLength(0);

  // one of each: "customer", "supplier", "item"; a party that's both counts in both
  await act(async () => {
    await addParty({ ...PARTY, type: 'both', registeredName: 'Torres Construction Supply' });
    await addItem({ name: 'Cement 40kg', unit: 'bag', price: 250 });
  });
  expect(row().props.accessibilityLabel).toBe('Customers and items, 1 customer · 1 supplier · 1 item');
  await act(async () => {
    await addParty({ ...PARTY, type: 'customer', registeredName: 'Reyes Hardware' });
    await addParty({ ...PARTY, type: 'customer', registeredName: 'Lim Trading' });
    await addItem({ name: 'Rebar 10mm', unit: 'pc', price: 180 });
  });
  expect(row().props.accessibilityLabel).toBe('Customers and items, 3 customers · 1 supplier · 2 items');

  await press(row());
  expect(mockPush).toHaveBeenCalledTimes(1);
  expect(mockPush).toHaveBeenLastCalledWith('/lists');
});

test('four groups, each field with its helper', async () => {
  await updateSettings({ vatRegistered: null }); // not answered yet
  await render(<ProfileScreen />);
  expect(headers()).toEqual(['Profile', 'Your business', 'Export defaults', 'Your lists', 'About']);

  // Your business: the two chips, neither chosen until one is, and what the answer does
  const business = screen.getByRole('radiogroup', { name: 'Your business is' });
  expect(
    within(business)
      .getAllByRole('radio')
      .map((chip) => [chip.props.accessibilityLabel, chip.props.accessibilityState.checked]),
  ).toEqual([
    ['VAT-registered', false],
    ['Not VAT-registered', false],
  ]);
  const suggests = screen.getByText("Suggests each sale's tax type");
  expect(suggests).toHaveStyle({ color: colors.mute });

  // Export defaults: each field in figures, with its helper under it, which is also its hint for TalkBack
  for (const [label, helper] of FIELDS) {
    expect(typeStylesOf(field(label))).toEqual(['figure']);
    expect(field(label).props.accessibilityHint).toBe(helper);
  }
  expect(screen.getAllByText(ACCOUNT_HELPER)).toHaveLength(1); // under the revenue account only
  expect(screen.getByText(ATC_HELPER)).toHaveStyle({ color: colors.mute });
  // the helper says what an account is: the accounts have no placeholder; the ATC keeps today's example
  for (const label of ['Revenue account for sales', 'Expense account for purchases', 'Offset account for 2307s']) {
    expect(field(label).props.placeholder).toBeUndefined();
  }
  expect(field('Withholding tax ATC').props.placeholder).toBe('e.g. WC158');
  const note = screen.getByText(NOTE);
  expect(note).toHaveStyle({ color: colors.mute });

  // top to bottom: each group under its strip, the note after the fields, Your lists' row, then About's three rows
  expectInOrder(
    header('Your business'),
    business,
    suggests,
    header('Export defaults'),
    ...FIELDS.map(([label]) => field(label)),
    note,
    header('Your lists'),
    button(/^Customers and items, /),
    header('About'),
    button('Privacy'),
    button('Open-source licenses'),
    screen.getByLabelText(/^Version, /),
  );
});

test('the ATC is a code: capitals, on the keyboard with a number row; the accounts are words or codes', async () => {
  // the plan's call 15: Android's visible-password keyboard for a code, the default one for words; autocorrect off
  jest.replaceProperty(Platform, 'OS', 'android');
  await render(<ProfileScreen />);
  const keyboardOf = (label: string) => {
    const { keyboardType, autoCapitalize, autoCorrect } = field(label).props;
    return [keyboardType, autoCapitalize, autoCorrect];
  };
  expect(keyboardOf('Withholding tax ATC')).toEqual(['visible-password', 'characters', false]);
  for (const label of ['Revenue account for sales', 'Expense account for purchases', 'Offset account for 2307s']) {
    expect(keyboardOf(label)).toEqual([undefined, undefined, false]);
  }
});

test('the settings show what the phone keeps', async () => {
  await render(<ProfileScreen />);
  expect(header('Export defaults')).toBeTruthy();
  expect(field('Revenue account for sales').props.value).toBe('4010');
  expect(screen.getByRole('radio', { name: 'VAT-registered', checked: true })).toBeTruthy();
  expect(screen.getByText(NOTE)).toBeTruthy();
});

test('a field is saved as it is typed, and the VAT answer at once', async () => {
  await render(<ProfileScreen />);
  await typeIn(field('Expense account for purchases'), ' 5010 ');
  expect(settings().expenseAccount).toBe('5010');
  await typeIn(field('Withholding tax ATC'), 'wc158');
  expect(field('Withholding tax ATC').props.value).toBe('WC158');
  expect(settings().atc).toBe('WC158');
  await press(screen.getByText('Not VAT-registered'));
  expect(settings().vatRegistered).toBe(false);
});

test('the offset account is kept as typed', async () => {
  await render(<ProfileScreen />);
  expect(field('Offset account for 2307s').props.value).toBe('');
  await typeIn(field('Offset account for 2307s'), ' 1205 CWT Receivable ');
  expect(settings().offsetAccount).toBe('1205 CWT Receivable');
  await screen.unmount(); // left while the field still has the cursor
  expect(settings().offsetAccount).toBe('1205 CWT Receivable');
  // and shown when the screen opens again
  await render(<ProfileScreen />);
  expect(field('Offset account for 2307s').props.value).toBe('1205 CWT Receivable');
});

test('what was typed is kept when the screen is left from the field', async () => {
  await render(<ProfileScreen />);
  await typeIn(field('Revenue account for sales'), '4000 Sales Revenue');
  await screen.unmount(); // going back while the field still has the cursor: React Native doesn't blur it
  expect(settings().revenueAccount).toBe('4000 Sales Revenue');
});

test('the ATC hint warns without blocking, and the value saves as typed', async () => {
  await render(<ProfileScreen />);
  const atc = () => field('Withholding tax ATC');
  // empty: the helper
  expect(screen.getByText(ATC_HELPER)).toBeOnTheScreen();
  expect(screen.queryByText(ATC_WARNING)).toBeNull();

  // not 2 letters and 3 digits: the helper turns into the warning, and what was typed is saved all the same
  await typeIn(atc(), 'wc15');
  expect(atc().props.value).toBe('WC15');
  expect(settings().atc).toBe('WC15');
  expect(screen.getByText(ATC_WARNING)).toHaveStyle({ color: colors.warning });
  expect(atc().props.accessibilityHint).toBe(ATC_WARNING); // what TalkBack hears too
  expect(screen.queryByText(ATC_HELPER)).toBeNull();
  for (const typed of ['W158', 'WC1580', '1C158', 'WC-158', 'WCX58']) {
    await typeIn(atc(), typed);
    expect(screen.getByText(ATC_WARNING)).toBeOnTheScreen();
    expect(settings().atc).toBe(typed);
  }

  // the shape it asks for: the helper again (a space at the end is never kept)
  await typeIn(atc(), 'wc158 ');
  expect(settings().atc).toBe('WC158');
  expect(screen.queryByText(ATC_WARNING)).toBeNull();
  expect(screen.getByText(ATC_HELPER)).toBeOnTheScreen();
  expect(atc().props.accessibilityHint).toBe(ATC_HELPER);
  // cleared: nothing to warn about
  await typeIn(atc(), '');
  expect(settings().atc).toBe('');
  expect(screen.queryByText(ATC_WARNING)).toBeNull();

  // one kept from before in another shape warns when the screen opens
  await screen.unmount();
  await updateSettings({ atc: 'WI01' });
  await render(<ProfileScreen />);
  expect(atc().props.value).toBe('WI01');
  expect(screen.getByText(ATC_WARNING)).toBeOnTheScreen();
});

test('a field scrolls into view above the keyboard, whole: its label, its input and its helper', async () => {
  await render(<ProfileScreen />);
  const atc = field('Withholding tax ATC');
  expect(within(screen.getByTestId('screen-scroll')).getByLabelText('Withholding tax ATC')).toBe(atc);
  // jest's scroll views and views have no layout, and share their native methods: Android's measurements stand in
  const scrollMethods = ScrollView.prototype as unknown as { getInnerViewRef: jest.Mock; scrollTo: jest.Mock };
  const viewMethods = View.prototype as unknown as { measureLayout: jest.Mock };
  const content = {};
  scrollMethods.getInnerViewRef.mockReturnValueOnce(content);
  scrollMethods.scrollTo.mockClear();
  viewMethods.measureLayout.mockClear();
  viewMethods.measureLayout.mockImplementationOnce(
    (relativeTo, onSuccess) => relativeTo === content && onSuccess(0, 600, 328, 3 * touch.target),
  );
  await act(async () => fireEvent(atc, 'focus'));
  // What's measured is the field's own view, its label's parent: the label, the input and the helper. (QA pass 2: at
  // 200%, measuring the input alone left the label half under the header.) The label shows, though TalkBack says it as
  // the input's name.
  const own = screen.getByText('Withholding tax ATC', { includeHiddenElements: true }).parent!;
  expect(within(own).getByLabelText('Withholding tax ATC')).toBe(atc);
  expect(within(own).getByText(ATC_HELPER)).toBeOnTheScreen();
  const measured = viewMethods.measureLayout.mock.contexts as { props: { children?: unknown } }[];
  expect(measured).toHaveLength(1);
  expect(measured[0]).not.toBeInstanceOf(TextInput);
  expect(measured[0].props.children).toBe(own.props.children); // jest's View draws its host view with these
  // the Screen's scroll-into-view: measured against the scroll's content, then 24 dp under its top
  expect(scrollMethods.scrollTo).toHaveBeenCalledWith({ y: 600 - space.xl, animated: true });
  // the open keyboard: the end of the scroll grows by its height, so the last field can sit above it
  await keyboard(300);
  expect(screen.getByTestId('screen-scroll').props.contentContainerStyle).toMatchObject({
    paddingBottom: space.xl + 300,
  });
  await keyboard(0);
});

test('Privacy opens a sheet in plain words', async () => {
  await render(<ProfileScreen />);
  expect(chevronsIn(button('Privacy'))).not.toHaveLength(0);
  await press(button('Privacy'));
  expect(header('Privacy')).toBeOnTheScreen();
  // its four lines, in order, in the body style
  const lines = within(screen.getByTestId('sheet-scroll')).getAllByText(/./);
  expect(lines.map((line) => line.props.children)).toEqual(PRIVACY);
  for (const line of lines) {
    expect(typeStylesOf(line)).toEqual(['body']);
    expect(line).toHaveStyle({ color: colors.ink });
  }
  // Close, and TalkBack focus goes back to Privacy (design §7)
  focus.mockClear();
  await press(sheet().getByRole('button', { name: 'Close' }));
  expect(screen.queryByTestId('sheet-panel')).toBeNull();
  expect(focused()).toEqual([['Privacy', 'focus']]);
});

test('Open-source licenses opens its screen', async () => {
  await render(<ProfileScreen />);
  const licenses = button('Open-source licenses');
  expect(chevronsIn(licenses)).not.toHaveLength(0);
  await press(licenses);
  expect(mockPush).toHaveBeenCalledTimes(1);
  expect(mockPush).toHaveBeenLastCalledWith('/licenses');
});

test('Version shows the version', async () => {
  await render(<ProfileScreen />);
  // the version and the build number, in figures on the right, as one stop for TalkBack
  const version = screen.getByLabelText('Version, 1.0.0 (12)');
  expect(typeStylesOf(within(version).getByText('1.0.0 (12)'))).toEqual(['figure']);
  // with no press: not a button, no chevron, and a tap does nothing
  expect(screen.queryByRole('button', { name: /^Version/ })).toBeNull();
  expect(chevronsIn(version)).toHaveLength(0);
  await press(version);
  expect(mockPush).not.toHaveBeenCalled();
  expect(screen.queryByTestId('sheet-panel')).toBeNull();
});

test('Team tools: annotation mode is one switch row that toggles from its label', async () => {
  mockTeam = true;
  await render(<ProfileScreen />);
  // one stop for TalkBack: the row, a 48 dp full-bleed switch
  expect(screen.getAllByRole('switch')).toHaveLength(1);
  const row = () => screen.getByRole('switch', { name: 'Annotation mode' });
  expect(row().props.accessibilityState).toEqual({ checked: false });
  expect(row()).toHaveStyle({ minHeight: touch.target, backgroundColor: colors.panel });
  // the Switch in it shows the state, hidden from TalkBack; jest runs as iOS, where the track's colors are tintColor
  // (off: outline) and onTintColor (on: brand)
  const knob = () => screen.getByTestId('annotation-switch', { includeHiddenElements: true });
  expect(hiddenFromTalkBack(knob())).toBe(true);
  expect(knob().props).toMatchObject({
    value: false,
    tintColor: colors.outline,
    onTintColor: colors.brand,
    thumbTintColor: colors.panel,
  });

  // a tap on its label toggles it
  await press(screen.getByText('Annotation mode'));
  expect(settings().annotation).toBe(true);
  expect(row().props.accessibilityState).toEqual({ checked: true });
  expect(knob().props.value).toBe(true);
  // and so does the Switch itself, the same setting
  await act(async () => fireEvent(knob(), 'valueChange', false));
  expect(settings().annotation).toBe(false);
  expect(row().props.accessibilityState).toEqual({ checked: false });
  expect(knob().props.value).toBe(false);
  // a tap anywhere on the row, as TalkBack's double tap does
  await press(row());
  expect(settings().annotation).toBe(true);

  // a hardware keyboard's focus ring sits on the row's edge, as on every full-bleed row (ruling T4-1)
  await act(async () => fireEvent(row(), 'focus'));
  expect(screen.getByTestId('focus-ring')).toHaveStyle({ top: 0, left: 0, right: 0, bottom: 0, borderRadius: 0 });
});

test('the annotation switch is kept', async () => {
  mockTeam = true;
  const update = jest.spyOn(store, 'updateSettings'); // it still saves
  await render(<ProfileScreen />);
  await press(screen.getByRole('switch', { name: 'Annotation mode' }));
  expect(update).toHaveBeenCalledWith({ annotation: true });
  expect(screen.getByRole('switch', { name: 'Annotation mode', checked: true })).toBeTruthy();
  await update.mock.results[0].value; // its write to the phone
  update.mockRestore();
  await screen.unmount();
  await act(async () => loadSettings()); // read again from the phone, as at the next start
  expect(settings().annotation).toBe(true);
  await render(<ProfileScreen />);
  expect(screen.getByRole('switch', { name: 'Annotation mode', checked: true })).toBeTruthy();
});

test('team builds show the team tools, after About', async () => {
  mockTeam = true;
  await render(<ProfileScreen />);
  expect(headers()).toEqual(['Profile', 'Your business', 'Export defaults', 'Your lists', 'About', 'Team tools']);
  const note = screen.getByText(ANNOTATION_NOTE);
  expect(note).toHaveStyle({ color: colors.mute });
  expectInOrder(
    screen.getByLabelText(/^Version, /),
    header('Team tools'),
    screen.getByRole('switch', { name: 'Annotation mode', checked: false }),
    note,
    button('Training data'),
    button('Speed test'),
  );
  for (const name of ['Training data', 'Speed test']) expect(chevronsIn(button(name))).not.toHaveLength(0);
  await press(button('Training data'));
  expect(mockPush).toHaveBeenLastCalledWith('/training');
  // as the screen's other rows: once, until Profile is on top again (lib/navigation's usePushOnce)
  await press(button('Speed test'));
  expect(mockPush).toHaveBeenCalledTimes(1);
  await act(async () => focusAgain());
  await press(button('Speed test'));
  expect(mockPush).toHaveBeenLastCalledWith('/speed');
});

test('client builds show no team tools', async () => {
  // not even on a phone that had annotation mode on in a team build: the setting stays, unseen (milestone 4)
  await updateSettings({ annotation: true });
  await render(<ProfileScreen />);
  expect(headers()).toEqual(['Profile', 'Your business', 'Export defaults', 'Your lists', 'About']);
  expect(screen.queryByRole('switch')).toBeNull();
  expect(screen.queryByTestId('annotation-switch', { includeHiddenElements: true })).toBeNull();
  expect(screen.queryByText('Annotation mode')).toBeNull();
  expect(screen.queryByText(ANNOTATION_NOTE)).toBeNull();
  expect(screen.queryByText('Training data')).toBeNull();
  expect(screen.queryByText('Speed test')).toBeNull();
});
