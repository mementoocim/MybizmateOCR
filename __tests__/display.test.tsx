import { fireEvent, render, screen } from '@testing-library/react-native';
import { createRef } from 'react';
import { View, type ViewInstance } from 'react-native';

import { Badge, type BadgeTone } from '../components/Badge';
import { Banner } from '../components/Banner';
import { EmptyState } from '../components/EmptyState';
import { CircleAlert, type IconComponent, TriangleAlert } from '../components/icons';
import { LedgerRow } from '../components/LedgerRow';
import { ListRow } from '../components/ListRow';
import { SectionHeader } from '../components/SectionHeader';
import { amount } from '../lib/format';
import { colors, radius, space, touch, type } from '../lib/theme';

// Design B §5.6 and §7: the display pieces the screens build from. A badge is caps mono text on its tone. A section
// strip is a header, with a column name, a count or a text action on its right. A list row and a ledger row are each
// one stop for TalkBack, and that stop's label carries the row's badge or its flag. Banners alert, and an empty state
// says what to do next. Layout itself is native, so these tests read the styles, the labels and what a press does.

const noop = () => {};
type Instance = ReturnType<typeof screen.getByText>;

/** The icons under a node drawn in a color: a row's chevron or check, a banner's glyph. */
const iconsIn = (node: Instance, color: string) => node.queryAll((n) => n.props.stroke === color);
/** Whether this node, or a view above it, hides it from TalkBack. */
const hiddenFromTalkBack = (node: Instance | null): boolean =>
  node !== null && (node.props.importantForAccessibility === 'no-hide-descendants' || hiddenFromTalkBack(node.parent));
/** A glyph as drawn on its own, to compare with the one a component draws. */
async function drawingOf(Icon: IconComponent, color: string) {
  await render(<Icon size={touch.iconSmall} color={color} />);
  return screen.root!.toJSON();
}

const LONG_NAME = 'Isabela Prime Builders and General Merchandise Trading Corp.';

test('Badge: caps mono text on its tone', async () => {
  await render(<Badge label="To export" tone="brand" />);
  const text = screen.getByText('To export');
  expect(text).toHaveStyle({ ...type.badge, color: colors.brandText, textTransform: 'uppercase' });
  expect(text.parent).toHaveStyle({
    backgroundColor: colors.brandTint,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.badge,
    paddingHorizontal: space.s - 2,
  });

  // Each tone's text on its fill, in a 1 dp line of the text color at 30%: warningLine, or line for the others.
  const TONES: Record<BadgeTone, readonly [text: string, fill: string, line: string]> = {
    warning: [colors.warning, colors.warningTint, colors.warningLine],
    success: [colors.success, colors.successTint, colors.line],
    brand: [colors.brandText, colors.brandTint, colors.line],
    neutral: [colors.mute, colors.sand, colors.line],
    danger: [colors.danger, colors.dangerTint, colors.line],
  };
  for (const [tone, [color, fill, line]] of Object.entries(TONES) as [BadgeTone, (typeof TONES)[BadgeTone]][]) {
    await render(<Badge label={`A ${tone} badge`} tone={tone} />);
    const badge = screen.getByText(`A ${tone} badge`);
    expect(badge).toHaveStyle({ color });
    expect(badge.parent).toHaveStyle({ backgroundColor: fill, borderColor: line });
  }
});

test('SectionHeader: a header with its right side or action', async () => {
  const onPress = jest.fn();
  await render(
    <>
      <SectionHeader title="Items · 3" right="Amount" />
      <SectionHeader title="To export" action={{ label: 'All saved', onPress }} />
    </>,
  );
  const header = screen.getByRole('header', { name: 'Items · 3' });
  expect(header).toHaveStyle({ ...type.overline, color: colors.mute });
  expect(header.parent).toHaveStyle({
    backgroundColor: colors.sand,
    paddingVertical: space.s,
    paddingHorizontal: space.l,
  });
  expect(screen.getByText('Amount')).toHaveStyle({ ...type.overline, color: colors.mute });

  expect(screen.getByRole('header', { name: 'To export' })).toBeOnTheScreen();
  expect(screen.getByText('All saved ›')).toHaveStyle({ ...type.overline, color: colors.brandText });
  const action = screen.getByRole('button', { name: 'All saved' });
  expect(action).toHaveStyle({ minHeight: touch.target }); // a 48 dp target, though the strip pads 8
  await fireEvent.press(action);
  expect(onPress).toHaveBeenCalledTimes(1);
});

test('ListRow speaks its badge as part of the row', async () => {
  const onPress = jest.fn();
  await render(
    <ListRow
      title="Camera photo"
      sub="10:24 AM · Service invoice"
      badge={{ label: '2 to check', tone: 'warning' }}
      onPress={onPress}
    />,
  );
  const row = screen.getByRole('button', { name: 'Camera photo, 10:24 AM · Service invoice, 2 to check' });
  // The badge is shown, but it's in the row's label, so it isn't a stop of its own (design §7).
  const badge = screen.getByText('2 to check', { includeHiddenElements: true });
  expect(badge).toHaveStyle({ color: colors.warning });
  expect(hiddenFromTalkBack(badge)).toBe(true);
  expect(hiddenFromTalkBack(row)).toBe(false);
  expect(screen.queryByText('2 to check')).toBeNull();
  await fireEvent.press(row);
  expect(onPress).toHaveBeenCalledTimes(1);

  // Without a press: no button role, and still one stop with the row's label.
  await render(<ListRow title="Camera photo" sub="10:24 AM · Service invoice" />);
  expect(screen.queryByRole('button')).toBeNull();
  expect(screen.getByLabelText('Camera photo, 10:24 AM · Service invoice')).toBeOnTheScreen();
});

test('ListRow: a panel row at least 48 dp tall, a hairline under it, and its focus ring inside', async () => {
  await render(<ListRow title="Open-source licenses" chevron onPress={noop} />);
  const row = screen.getByRole('button', { name: 'Open-source licenses' });
  expect(row).toHaveStyle({
    backgroundColor: colors.panel,
    minHeight: touch.target,
    paddingVertical: space.m,
    paddingHorizontal: space.l,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  });
  await fireEvent(row, 'focus');
  // Ruling T4-1: the next row's fill would cover a ring outside, so a row's ring is on its edge, square.
  expect(screen.getByTestId('focus-ring')).toHaveStyle({ top: 0, left: 0, right: 0, bottom: 0, borderRadius: 0 });
});

test('ListRow: the title, then the sub-line in label type, or in caps mono for times, codes and dates', async () => {
  await render(
    <>
      <ListRow title="Privacy" sub="Scans are read and kept on this phone" />
      <ListRow title="Fernandez Electrical" sub="Sale · Nov 22 · SI 5184138" subMono subCaps />
      <ListRow title="Bautista Pharmacy" sub="TIN 789-012-345-00000 · C008" subMono />
    </>,
  );
  expect(screen.getByText('Privacy')).toHaveStyle({ ...type.value, color: colors.ink });
  expect(screen.getByText('Scans are read and kept on this phone')).toHaveStyle({
    ...type.label,
    color: colors.mute,
    textTransform: undefined,
  });
  expect(screen.getByText('Sale · Nov 22 · SI 5184138')).toHaveStyle({
    ...type.figureSmall,
    color: colors.mute,
    textTransform: 'uppercase',
  });
  expect(screen.getByText('TIN 789-012-345-00000 · C008')).toHaveStyle({
    ...type.figureSmall,
    textTransform: undefined,
  });
});

test('ListRow: what leads, the amount with its badge under it, then a chevron, or a check when done', async () => {
  await render(
    <>
      <ListRow title="Sales" sub="4 to export" amount="₱38,240.00" chevron onPress={noop} />
      <ListRow
        title="Fernandez Electrical"
        amount="5,810.50"
        badge={{ label: 'To export', tone: 'brand' }}
        onPress={noop}
      />
      <ListRow title="Import your customers and items" chevron checked onPress={noop} />
      <ListRow title="Set your export defaults" chevron checked={false} onPress={noop} />
      <ListRow title="Sample 0051" leading={<View testID="thumbnail" />} onPress={noop} />
    </>,
  );
  const sales = screen.getByRole('button', { name: 'Sales, 4 to export, ₱38,240.00' });
  expect(screen.getByText('₱38,240.00')).toHaveStyle({ ...type.figure, color: colors.ink, textAlign: 'right' });
  expect(iconsIn(sales, colors.chevron)).toHaveLength(1);
  expect(sales.props.accessibilityState?.checked).toBeUndefined();

  // the badge sits under the amount, in one column
  const saved = screen.getByRole('button', { name: 'Fernandez Electrical, 5,810.50, To export' });
  const column = screen.getByText('5,810.50').parent!;
  expect(column).toHaveStyle({ alignItems: 'flex-end' });
  expect(column.queryAll((n) => n.props.children === 'To export')).toHaveLength(1);
  expect(iconsIn(saved, colors.chevron)).toHaveLength(0); // no chevron unless asked

  const done = screen.getByRole('button', { name: 'Import your customers and items' });
  expect(done.props.accessibilityState).toMatchObject({ checked: true });
  expect(iconsIn(done, colors.success)).toHaveLength(1);
  expect(iconsIn(done, colors.chevron)).toHaveLength(0);
  const notYet = screen.getByRole('button', { name: 'Set your export defaults' });
  expect(notYet.props.accessibilityState).toMatchObject({ checked: false });
  expect(iconsIn(notYet, colors.chevron)).toHaveLength(1);
  expect(iconsIn(notYet, colors.success)).toHaveLength(0);

  // what leads comes first, before the title (a sample's thumbnail; here a stand-in)
  const sample = screen.getByRole('button', { name: 'Sample 0051' });
  expect(sample.children[0]).toBe(screen.getByTestId('thumbnail'));
});

test('a flagged LedgerRow: bar, Check badge, reason, and its spoken label', async () => {
  const onPress = jest.fn();
  const reason = 'Could also be read as Oct 28, 2026. Check the date.';
  await render(<LedgerRow label="Date" value="Oct 29, 2026" reason={reason} flagged onPress={onPress} />);
  expect(screen.getByTestId('flag-bar')).toHaveStyle({
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: colors.flag,
  });
  expect(screen.getByText('Check')).toHaveStyle({ color: colors.warning });
  expect(screen.getByText(reason)).toHaveStyle({ ...type.label, color: colors.warning });
  const row = screen.getByRole('button', {
    name: 'Date, Oct 29, 2026. Check: could also be read as Oct 28, 2026. Check the date.',
  });
  expect(row.props.accessibilityHint).toBe('Opens what the camera saw');
  expect(iconsIn(row, colors.chevron)).toHaveLength(0); // the badge takes the chevron's place
  await fireEvent.press(row);
  expect(onPress).toHaveBeenCalledTimes(1);

  // flagged with no reason: just "Check"; a hint of the row's own
  await render(<LedgerRow label="Terms" value="Unclear" flagged onPress={noop} accessibilityHint="Opens the terms" />);
  expect(screen.getByRole('button', { name: 'Terms, Unclear. Check' }).props.accessibilityHint).toBe('Opens the terms');
});

test('an edited LedgerRow says so', async () => {
  await render(<LedgerRow label="Date" value="Oct 28, 2026" edited onPress={noop} />);
  expect(screen.getByText('Edited')).toHaveStyle({ color: colors.mute }); // neutral
  const row = screen.getByRole('button', { name: 'Date, Oct 28, 2026, edited' });
  expect(row.props.accessibilityLabel).toMatch(/, edited$/);
  expect(iconsIn(row, colors.chevron)).toHaveLength(0);

  // A flag wins: Check, not Edited, and no ", edited".
  await render(
    <LedgerRow
      label="Date"
      value="Oct 28, 2026"
      edited
      flagged
      reason="Not a date in the last 6 months"
      onPress={noop}
    />,
  );
  expect(screen.queryByText('Edited')).toBeNull();
  expect(screen.getByText('Check')).toBeOnTheScreen();
  expect(
    screen.getByRole('button', { name: 'Date, Oct 28, 2026. Check: not a date in the last 6 months' }),
  ).toBeOnTheScreen();
});

test('an unflagged LedgerRow with a press shows a chevron; a reason shows only when flagged', async () => {
  const reason = 'Could also be read as Oct 28, 2026. Check the date.';
  await render(<LedgerRow label="Date" value="Oct 29, 2026" reason={reason} onPress={noop} />);
  const row = screen.getByRole('button', { name: 'Date, Oct 29, 2026' });
  expect(iconsIn(row, colors.chevron)).toHaveLength(1);
  expect(screen.queryByText(reason)).toBeNull();
  expect(screen.queryByText('Check')).toBeNull();
  expect(screen.queryByTestId('flag-bar')).toBeNull();

  // Not pressable: no chevron, no button role and no hint, and still one stop with its label.
  await render(<LedgerRow label="Straighten" value="0.4 s" />);
  expect(screen.queryByRole('button')).toBeNull();
  const still = screen.getByLabelText('Straighten, 0.4 s');
  expect(iconsIn(still, colors.chevron)).toHaveLength(0);
  expect(still.props.accessibilityHint).toBeUndefined();
});

test('an empty value reads as a dash, and blank to TalkBack', async () => {
  await render(<LedgerRow label="Customer" value={null} onPress={noop} />);
  expect(screen.getByText('—')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Customer, blank' })).toBeOnTheScreen();
});

test('LedgerRow: a spoken-only label is said first and never shown; a shown key is said instead', async () => {
  // Ruling T12-1: a one-row section's row (a 2307's Period) shows no key, since its strip names it, but says its field
  await render(
    <LedgerRow
      spokenLabel="Period"
      value="Oct 1 – Dec 31, 2026"
      valueStyle="figure"
      badge={{ label: 'Q4', tone: 'neutral' }}
      onPress={noop}
    />,
  );
  expect(screen.getByRole('button', { name: 'Period, Oct 1 – Dec 31, 2026, Q4' })).toBeOnTheScreen();
  expect(screen.queryByText('Period')).toBeNull();
  // blank and flagged, it still leads
  await render(<LedgerRow spokenLabel="Payor" value={null} sub="Not in your customers" flagged onPress={noop} />);
  expect(screen.getByRole('button', { name: 'Payor, blank, Not in your customers. Check' })).toBeOnTheScreen();
  expect(screen.queryByText('Payor')).toBeNull();
  // a row that shows its key says that one
  await render(<LedgerRow label="Date" spokenLabel="When" value="Oct 29, 2026" onPress={noop} />);
  expect(screen.getByRole('button', { name: 'Date, Oct 29, 2026' })).toBeOnTheScreen();
  expect(screen.queryByText('When')).toBeNull();
});

test('LedgerRow: the value in its style with its badge, the sub-line, and the amount on the right', async () => {
  await render(
    <>
      <LedgerRow
        label="Period"
        value="Oct 1 – Dec 31, 2026"
        valueStyle="figure"
        badge={{ label: 'Q4', tone: 'neutral' }}
        onPress={noop}
      />
      <LedgerRow value="Detergent" sub="2 × 110.00" subMono amount="220.00" onPress={noop} />
      <LedgerRow value="Income payments" sub="Total ₱559,190.98" amount="₱10,039.79" amountStrong />
      <LedgerRow
        label="Total due"
        value="₱5,810.50"
        valueStyle="figureStrong"
        sub="The written totals agree"
        onPress={noop}
      />
    </>,
  );
  expect(screen.getByText('Oct 1 – Dec 31, 2026')).toHaveStyle({ ...type.figure, color: colors.ink });
  expect(screen.getByText('Q4')).toHaveStyle({ ...type.badge, color: colors.mute }); // beside the value
  expect(screen.getByText('Q4').parent!.parent).toBe(screen.getByText('Oct 1 – Dec 31, 2026').parent);
  // Ruling T4-4: the badge is part of the row's label (§5.6, §7), right after the value.
  expect(screen.getByRole('button', { name: 'Period, Oct 1 – Dec 31, 2026, Q4' })).toBeOnTheScreen();

  expect(screen.getByText('Detergent')).toHaveStyle({ ...type.value, color: colors.ink });
  expect(screen.getByText('2 × 110.00')).toHaveStyle({ ...type.figureSmall, color: colors.mute });
  expect(screen.getByText('220.00')).toHaveStyle({ ...type.figure, color: colors.ink, textAlign: 'right' });
  const item = screen.getByRole('button', { name: 'Detergent, 2 × 110.00, 220.00' });
  expect(iconsIn(item, colors.chevron)).toHaveLength(1); // under the amount, so amounts line up

  expect(screen.getByText('₱10,039.79')).toHaveStyle(type.figureStrong);
  expect(screen.getByLabelText('Income payments, Total ₱559,190.98, ₱10,039.79')).toBeOnTheScreen();

  expect(screen.getByText('₱5,810.50')).toHaveStyle({ ...type.figureStrong, color: colors.ink });
  expect(screen.getByText('The written totals agree')).toHaveStyle({ ...type.label, color: colors.mute });

  // Every part at once, to pin the order: key, value, badge, sub-line, amount, then the flag.
  await render(
    <LedgerRow
      label="Period"
      value="Oct 1 – Dec 31, 2026"
      badge={{ label: 'Q4', tone: 'neutral' }}
      sub="Printed on the form"
      amount="₱1,144.03"
      reason="Not one calendar quarter"
      flagged
      onPress={noop}
    />,
  );
  expect(
    screen.getByRole('button', {
      name: 'Period, Oct 1 – Dec 31, 2026, Q4, Printed on the form, ₱1,144.03. Check: not one calendar quarter',
    }),
  ).toBeOnTheScreen();
});

test('LedgerRow: the key keeps its width; the value takes the rest, or goes under past half the row', async () => {
  await render(<LedgerRow label="Gross (VAT included)" value="₱5,810.50" valueStyle="figure" onPress={noop} />);
  const key = screen.getByText('Gross (VAT included)');
  expect(key).toHaveStyle({
    ...type.label,
    color: colors.mute,
    width: undefined,
    flex: undefined,
    flexGrow: undefined,
  });
  // §11, "measured by layout": the key and the value block wrap, and the block's basis is half the row, so the
  // value moves under the key exactly when the key takes more than half the row.
  const keyAndValue = key.parent!;
  expect(keyAndValue).toHaveStyle({ flexDirection: 'row', flexWrap: 'wrap' });
  expect(keyAndValue.children[1]).toHaveStyle({ flexGrow: 1, flexBasis: '50%' });
});

test('LedgerRow: a panel row at least 48 dp tall, a hairline under it, and its focus ring inside', async () => {
  await render(<LedgerRow label="Terms" value="Cash" onPress={noop} />);
  const row = screen.getByRole('button', { name: 'Terms, Cash' });
  expect(row).toHaveStyle({
    backgroundColor: colors.panel,
    minHeight: touch.target,
    paddingVertical: space.m,
    paddingHorizontal: space.l,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  });
  await fireEvent(row, 'focus');
  expect(screen.getByTestId('focus-ring')).toHaveStyle({ top: 0, left: 0, right: 0, bottom: 0, borderRadius: 0 });
});

test('LedgerRow forwards its ref to the row itself, pressable or not', async () => {
  // A flag chip scrolls to the row, and a closing sheet returns focus to it: both need the row's own view.
  const pressable = createRef<ViewInstance>();
  const still = createRef<ViewInstance>();
  await render(
    <>
      <LedgerRow ref={pressable} testID="row-date" label="Date" value="Oct 29, 2026" onPress={noop} />
      <LedgerRow ref={still} testID="row-gross" label="Gross" value="₱5,810.50" />
    </>,
  );
  // (jest-expo renders host views as mocks; a ref holds the mock, whose props are the view's)
  const propsOf = (ref: { current: ViewInstance | null }) => (ref.current as unknown as { props: object }).props;
  expect(propsOf(pressable)).toMatchObject({ testID: 'row-date', accessibilityLabel: 'Date, Oct 29, 2026' });
  expect(propsOf(still)).toMatchObject({ testID: 'row-gross', accessibilityLabel: 'Gross, ₱5,810.50' });
});

test('ListRow gives its ref the row itself, pressable or not', async () => {
  // A closing sheet gives TalkBack focus back to the row that opened it (§7): Settings' Privacy.
  const pressable = createRef<ViewInstance>();
  const still = createRef<ViewInstance>();
  await render(
    <>
      <ListRow ref={pressable} title="Privacy" chevron onPress={noop} />
      <ListRow ref={still} title="Version" amount="1.0.0 (12)" />
    </>,
  );
  // (jest-expo renders host views as mocks; a ref holds the mock, whose props are the view's)
  const propsOf = (ref: { current: ViewInstance | null }) => (ref.current as unknown as { props: object }).props;
  expect(propsOf(pressable)).toMatchObject({ accessibilityRole: 'button', accessibilityLabel: 'Privacy' });
  expect(propsOf(still)).toMatchObject({ accessible: true, accessibilityLabel: 'Version, 1.0.0 (12)' });
});

test('long values are never cut', async () => {
  // Review Focus 5: a 60-character name and ₱12,345,678.90 show in full, wrapping where they must.
  expect(LONG_NAME).toHaveLength(60);
  const big = amount(12345678.9);
  await render(<LedgerRow label="Customer" value={LONG_NAME} sub={LONG_NAME} amount={big} onPress={noop} />);
  for (const text of [...screen.getAllByText(LONG_NAME), screen.getByText(big)]) {
    expect(text.props.numberOfLines).toBeUndefined();
    expect(text.props.ellipsizeMode).toBeUndefined();
  }
  expect(screen.getByRole('button', { name: `Customer, ${LONG_NAME}, ${LONG_NAME}, ${big}` })).toBeOnTheScreen();

  await render(
    <ListRow
      title={LONG_NAME}
      sub={LONG_NAME}
      amount="₱12,345,678.90"
      badge={{ label: LONG_NAME, tone: 'neutral' }}
    />,
  );
  const shown = [
    ...screen.getAllByText(LONG_NAME, { includeHiddenElements: true }),
    screen.getByText('₱12,345,678.90'),
  ];
  expect(shown).toHaveLength(4);
  for (const text of shown) {
    expect(text.props.numberOfLines).toBeUndefined();
    expect(text.props.ellipsizeMode).toBeUndefined();
  }
});

test('Banner: role alert, tone fill and border', async () => {
  const circle = await drawingOf(CircleAlert, colors.danger);
  const triangle = await drawingOf(TriangleAlert, colors.warning);
  await render(
    <>
      <Banner tone="danger" text="This file has no Name column." />
      <Banner tone="warning" text="2 boxes are still marked to check." />
    </>,
  );
  // Ruling T4-3: a tint fill in a line border (§5.6), the tone's color at 45% or 30%; the words in the full color.
  const danger = screen.getByRole('alert', { name: 'This file has no Name column.' });
  expect(danger).toHaveStyle({
    backgroundColor: colors.dangerTint,
    borderColor: colors.dangerLine,
    borderWidth: 1,
    borderRadius: radius.panel,
  });
  expect(screen.getByText('This file has no Name column.')).toHaveStyle({ ...type.body, color: colors.danger });
  expect(iconsIn(danger, colors.danger).map((icon) => icon.toJSON())).toEqual([circle]);

  const warning = screen.getByRole('alert', { name: '2 boxes are still marked to check.' });
  expect(warning).toHaveStyle({
    backgroundColor: colors.warningTint,
    borderColor: colors.warningLine,
    borderWidth: 1,
    borderRadius: radius.panel,
  });
  expect(screen.getByText('2 boxes are still marked to check.')).toHaveStyle({ ...type.body, color: colors.warning });
  expect(iconsIn(warning, colors.warning).map((icon) => icon.toJSON())).toEqual([triangle]);
});

test('Banner: live, for one an action raises, is a polite live region; one shown with its screen is not', async () => {
  // Task 4's minor, carried to Task 18: an error a press brings up (a file that couldn't be made) is read out
  await render(
    <>
      <Banner tone="danger" text="Couldn't make the file." live />
      <Banner tone="warning" text="1 of them was exported before. Importing it again adds it to MyBizMate twice." />
    </>,
  );
  expect(screen.getByRole('alert', { name: "Couldn't make the file." }).props.accessibilityLiveRegion).toBe('polite');
  expect(screen.getByRole('alert', { name: /exported before/ }).props.accessibilityLiveRegion).toBeUndefined();
});

test('EmptyState: a title, its body, and its actions', async () => {
  const takePhoto = jest.fn();
  const sample = jest.fn();
  const howTo = jest.fn();
  await render(
    <EmptyState
      title="Nothing saved yet"
      body="Save a scan and it shows up here, ready to export."
      actions={[
        { label: 'Take photo', onPress: takePhoto },
        { label: 'Try a sample invoice', onPress: sample },
        { label: 'How to import', onPress: howTo, variant: 'text' },
      ]}
    />,
  );
  const title = screen.getByText('Nothing saved yet');
  expect(title).toHaveStyle({ ...type.title, color: colors.ink, textAlign: 'center' });
  expect(screen.getByText('Save a scan and it shows up here, ready to export.')).toHaveStyle({
    ...type.body,
    color: colors.mute,
    textAlign: 'center',
  });
  expect(title.parent).toHaveStyle({ alignItems: 'center', gap: space.m });
  // The first action is primary unless it says otherwise; the others are secondary.
  expect(screen.getByRole('button', { name: 'Take photo' })).toHaveStyle({ backgroundColor: colors.brand });
  expect(screen.getByRole('button', { name: 'Try a sample invoice' })).toHaveStyle({
    backgroundColor: colors.panel,
    borderColor: colors.outline,
  });
  expect(screen.getByText('How to import')).toHaveStyle({ color: colors.brandText });
  await fireEvent.press(screen.getByRole('button', { name: 'Take photo' }));
  await fireEvent.press(screen.getByRole('button', { name: 'How to import' }));
  expect(takePhoto).toHaveBeenCalledTimes(1);
  expect(howTo).toHaveBeenCalledTimes(1);
  expect(sample).not.toHaveBeenCalled();

  // A title alone: no body, no buttons.
  await render(<EmptyState title="No purchases saved" />);
  expect(screen.getByText('No purchases saved')).toBeOnTheScreen();
  expect(screen.queryByRole('button')).toBeNull();
});

test("EmptyState gives an action's ref its button's pressable", async () => {
  // How to import opens a sheet, and a closing sheet gives TalkBack focus back to the button that opened it (§7).
  const howTo = createRef<ViewInstance>();
  await render(
    <EmptyState
      title="No customers yet"
      actions={[
        { label: 'Import CSV', onPress: noop },
        { label: 'How to import', onPress: noop, variant: 'text', ref: howTo },
      ]}
    />,
  );
  // (jest-expo renders host views as mocks; a ref holds the mock, whose props are the view's)
  expect((howTo.current as unknown as { props: object }).props).toMatchObject({
    accessibilityRole: 'button',
    accessibilityLabel: 'How to import',
  });
});
