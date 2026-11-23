import { act, fireEvent, render, screen, within } from '@testing-library/react-native';

import LicenseScreen from '../app/license';
import LicensesScreen from '../app/licenses';
import { LICENSES } from '../lib/licenses';
import { colors } from '../lib/theme';
import { memoryFs } from '../test-utils/memoryFs';
import { scrollListToEnd } from '../test-utils/scrollList';
import { typeStylesOf } from '../test-utils/typeStyles';

// Design B §9.10: Open-source licenses, from Settings › About. A row per component, with its license and version,
// opens its text: the bundled .txt asset, read from the file expo-asset puts it in, and shown a paragraph at a time.

let mockParams: { i?: string } = {};
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
}));
/** expo-asset's downloadAsync, for the module it was given: the asset, with the file it's put in. */
const mockDownload = jest.fn<Promise<{ localUri: string | null }>, [number]>();
jest.mock('expo-asset', () => ({
  Asset: { fromModule: (module: number) => ({ downloadAsync: () => mockDownload(module) }) },
}));
jest.mock('expo-file-system', () => require('../test-utils/memoryFs').memoryFs.module);

/** Where expo-asset puts a license on the phone. */
const FILE = 'file:///cache/ExponentAsset-license.txt';
const ONNX = LICENSES.findIndex((entry) => entry.name === 'ONNX Runtime');

/**
 * The table's entries, in its order, with CameraX (ruling T21-1) and nlohmann/json among the scanner module's native
 * libraries.
 */
const NAMES = [
  'React Native',
  'React',
  'Expo',
  'react-native-svg',
  'react-native-screens',
  'react-native-safe-area-context',
  'OpenCV',
  'ONNX Runtime',
  'CameraX (AndroidX)',
  'PDFium',
  'nlohmann/json',
  'PP-OCRv6 small, Latin (PaddleOCR)',
  'Lucide',
  'Schibsted Grotesk',
  'IBM Plex Mono',
];

type Instance = ReturnType<typeof screen.getByText>;
/** The text as shown, a paragraph each, as written. */
const paragraphs = () =>
  within(screen.getByTestId('license-text'))
    .queryAllByText(/./)
    .map((paragraph) => paragraph.props.children);

/** A paragraph's height as the test lays the text out (test-utils/scrollList). */
const PARAGRAPH = 60;

beforeEach(() => {
  jest.clearAllMocks();
  memoryFs.reset();
  mockParams = {};
});

test('the list names each component with its license', async () => {
  await render(<LicensesScreen />);
  expect(screen.getByRole('header', { name: 'Open-source licenses' })).toBeOnTheScreen();
  expect(LICENSES.map((entry) => entry.name)).toEqual(NAMES);

  // a row each, in the table's order: the name, then the license and the version
  const rows = within(screen.getByTestId('licenses-list')).getAllByRole('button');
  expect(rows.map((row) => row.props.accessibilityLabel)).toEqual(
    LICENSES.map(({ name, license, version }) => `${name}, ${license} · ${version}`),
  );
  for (const [i, row] of rows.entries()) {
    const { name, license, version } = LICENSES[i];
    const title = within(row).getByText(name);
    const sub = within(row).getByText(`${license} · ${version}`);
    // the license and the version in figures (jest runs as iOS, where mono and sans flatten alike)
    expect(typeStylesOf(sub)).toEqual(['figureSmall']);
    // in full, however long (Review Focus 5)
    expect(title.props.numberOfLines).toBeUndefined();
    expect(sub.props.numberOfLines).toBeUndefined();
    // a chevron: it opens the text
    expect(row.queryAll((n: Instance) => n.props.stroke === colors.chevron)).not.toHaveLength(0);
  }
});

test('a license opens its text', async () => {
  await render(<LicensesScreen />);
  await act(async () => fireEvent.press(screen.getByRole('button', { name: /^ONNX Runtime, / })));
  expect(mockPush).toHaveBeenCalledWith(`/license?i=${ONNX}`);
  await screen.unmount();

  // the route: its asset, put in a file on the phone, then read; a spinner until then
  let downloaded!: (asset: { localUri: string }) => void;
  mockDownload.mockReturnValueOnce(new Promise((resolve) => (downloaded = resolve)));
  memoryFs.files.set(
    FILE,
    [
      'MIT License',
      '',
      'Copyright (c) Microsoft Corporation',
      '',
      'Permission is hereby granted, free of charge, to any person obtaining a copy',
      'of this software and associated documentation files (the "Software"), to deal',
      '   ', // a line of spaces is a blank line too
      '_____',
      '',
      '', // and two are one break
      'ThirdPartyNotices.txt',
      '',
      '    * Redistributions of source code must retain the above copyright',
      'notice, this list of conditions and the following disclaimer.',
      '',
    ].join('\r\n'),
  );
  mockParams = { i: String(ONNX) };
  await render(<LicenseScreen />);
  expect(screen.getByRole('header', { name: 'ONNX Runtime' })).toBeOnTheScreen();
  expect(screen.getByTestId('license-loading')).toHaveProp('color', colors.brand);
  expect(screen.queryByTestId('license-text')).toBeNull();
  expect(mockDownload).toHaveBeenCalledWith(LICENSES[ONNX].asset);

  await act(async () => downloaded({ localUri: FILE }));
  await screen.findByTestId('license-text');
  expect(screen.queryByTestId('license-loading')).toBeNull();
  // split on blank lines, each paragraph as written: its line breaks and its indent kept
  expect(paragraphs()).toEqual([
    'MIT License',
    'Copyright (c) Microsoft Corporation',
    'Permission is hereby granted, free of charge, to any person obtaining a copy\nof this software and associated documentation files (the "Software"), to deal',
    '_____',
    'ThirdPartyNotices.txt',
    '    * Redistributions of source code must retain the above copyright\nnotice, this list of conditions and the following disclaimer.',
  ]);
  for (const paragraph of within(screen.getByTestId('license-text')).getAllByText(/./)) {
    expect(typeStylesOf(paragraph)).toEqual(['figureSmall']);
    expect(paragraph).toHaveStyle({ color: colors.ink });
  }
});

test('a long text shows in full, a paragraph at a time', async () => {
  // as ONNX Runtime's notices are: hundreds of paragraphs, some of them long (Review Focus 5)
  const icons = Array.from({ length: 150 }, (_, i) => `icon-${i + 1}`).join(', '); // about 1,300 characters
  const text = Array.from({ length: 40 }, (_, i) => (i === 30 ? icons : `Paragraph ${i + 1}.`));
  memoryFs.files.set(FILE, text.join('\n\n'));
  mockDownload.mockResolvedValueOnce({ localUri: FILE });
  mockParams = { i: String(ONNX) };
  await render(<LicenseScreen />);
  await screen.findByTestId('license-text');

  // virtualized: the first paragraphs at first, the rest as it scrolls, every one of them in full
  expect(paragraphs().length).toBeLessThan(text.length);
  await scrollListToEnd('license-text', PARAGRAPH);
  expect(paragraphs()).toEqual(text);
  const long = within(screen.getByTestId('license-text')).getByText(icons);
  expect(long.props.numberOfLines).toBeUndefined();
  expect(long.props.ellipsizeMode).toBeUndefined();
});

test("a license that can't be opened says so", async () => {
  const fails = async (i: string) => {
    mockParams = { i };
    await render(<LicenseScreen />);
    const message = await screen.findByText("Couldn't open this license.");
    expect(message).toHaveProp('accessibilityLiveRegion', 'polite'); // TalkBack says it when it shows
    expect(screen.queryByTestId('license-loading')).toBeNull();
    expect(screen.queryByTestId('license-text')).toBeNull();
    await screen.unmount();
  };

  // the asset isn't put in a file
  mockDownload.mockRejectedValueOnce(new Error('No space left on the phone'));
  await fails('0');
  // it's given no file
  mockDownload.mockResolvedValueOnce({ localUri: null });
  await fails('0');
  // the file isn't there
  mockDownload.mockResolvedValueOnce({ localUri: 'file:///cache/gone.txt' });
  await fails('0');
  expect(mockDownload).toHaveBeenCalledTimes(3);

  // a link to no entry: nothing to read, and no title
  for (const i of ['99', '-1', '1.5', 'onnx', '']) await fails(i);
  expect(mockDownload).toHaveBeenCalledTimes(3);
  mockParams = { i: '99' };
  await render(<LicenseScreen />);
  expect(screen.queryByRole('header')).toBeNull();
  expect(screen.getByRole('button', { name: 'Back' })).toBeOnTheScreen();
});
