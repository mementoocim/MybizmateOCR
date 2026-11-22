import { render, screen } from '@testing-library/react-native';

import { SummaryBox } from '../components/SummaryBox';
import { colors, radius, space, type } from '../lib/theme';

// Design B §9.6 (and §9.8's export file): what a save or an export will hold, in a sand box. Each line is a key in caps
// mono and its value, in figures for amounts and dates, with an optional badge beside it. A line is one stop for
// TalkBack, which says its key, its value and its badge (§7; ruling T4-4).

const LONG_NAME = 'Isabela Prime Builders and General Merchandise Trading Corp.';

test('keys in caps mono, values, and a badge', async () => {
  await render(
    <SummaryBox
      lines={[
        { key: 'Date', value: 'Oct 29, 2026', mono: true },
        { key: 'Customer', value: 'Fernandez Electrical', badge: { label: 'New', tone: 'brand' } },
        { key: 'Gross (VAT included)', value: '₱5,810.50', mono: true, badge: null },
      ]}
    />,
  );
  // the keys: the overline style, which uppercases them, in mute; the words stay sentence case for TalkBack
  for (const key of ['Date', 'Customer', 'Gross (VAT included)']) {
    expect(screen.getByText(key)).toHaveStyle({ ...type.overline, color: colors.mute, textTransform: 'uppercase' });
  }
  // the values: figures for amounts and dates, the value style for names; in ink
  expect(screen.getByText('Oct 29, 2026')).toHaveStyle({ ...type.figure, color: colors.ink });
  expect(screen.getByText('₱5,810.50')).toHaveStyle({ ...type.figure, color: colors.ink });
  expect(screen.getByText('Fernandez Electrical')).toHaveStyle({ ...type.value, color: colors.ink });

  // the badge beside its value, in a row that wraps, so it keeps its own width (Badge has no alignSelf)
  const badge = screen.getByText('New');
  expect(badge).toHaveStyle({ ...type.badge, color: colors.brandText });
  const valueLine = screen.getByText('Fernandez Electrical').parent!;
  expect(badge.parent!.parent).toBe(valueLine);
  expect(valueLine).toHaveStyle({ flexDirection: 'row', flexWrap: 'wrap' });

  // each line is one stop for TalkBack: its key, its value and its badge
  expect(screen.getByLabelText('Date, Oct 29, 2026')).toBeOnTheScreen();
  expect(screen.getByLabelText('Customer, Fernandez Electrical, New')).toBeOnTheScreen();
  expect(screen.getByLabelText('Gross (VAT included), ₱5,810.50')).toBeOnTheScreen();
  const line = screen.getByLabelText('Customer, Fernandez Electrical, New');
  expect(line.props.accessible).toBe(true);
  expect(screen.getByText('Customer').parent).toBe(line);

  // the box: sand, the panel's corners, padded on the space scale
  const box = line.parent!;
  expect(box).toHaveStyle({ backgroundColor: colors.sand, borderRadius: radius.panel, padding: space.m });
  expect(box.children).toHaveLength(3);

  // as in a ledger row (§11): the key keeps its width, and the value block's basis is half the line, so the value
  // moves under its key when the key takes more than half of it
  expect(line).toHaveStyle({ flexDirection: 'row', flexWrap: 'wrap' });
  expect(valueLine).toHaveStyle({ flexGrow: 1, flexBasis: '50%' });
});

test('a long value is never cut', async () => {
  // Review Focus 5: a 60-character name shows in full, wrapping where it must
  expect(LONG_NAME).toHaveLength(60);
  await render(<SummaryBox lines={[{ key: 'Payor', value: LONG_NAME, badge: { label: 'New', tone: 'brand' } }]} />);
  for (const text of [screen.getByText('Payor'), screen.getByText(LONG_NAME)]) {
    expect(text.props.numberOfLines).toBeUndefined();
    expect(text.props.ellipsizeMode).toBeUndefined();
  }
  expect(screen.getByLabelText(`Payor, ${LONG_NAME}, New`)).toBeOnTheScreen();
});
