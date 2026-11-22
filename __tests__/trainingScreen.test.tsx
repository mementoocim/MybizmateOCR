import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert, type AlertButton } from 'react-native';

import TrainingScreen from '../app/training';
import { installId } from '../lib/install';
import { loadSaved, saveScan, savedSummary } from '../lib/saved';
import { addScan, confirmBox, getScan } from '../lib/scans';
import { updateSettings } from '../lib/settings';
import { uncheckedBoxes } from '../lib/training/boxes';
import { parseScanResult } from '../modules/scanner/src/parse';
import { coreJson } from '../test-utils/coreJson';
import { fixedCrypto } from '../test-utils/fixedCrypto';
import { memoryFs } from '../test-utils/memoryFs';
import { pinToday } from '../test-utils/today';
import { unzipStored } from '../test-utils/unzip';

const mockToast = jest.fn();
const mockShare = jest.fn(async (_uri: string, _options: object) => {});
const mockAvailable = jest.fn(async () => true);
// A scan whose training record comes out null, as a rule in trainingRecord alone (one isTrainingScan lacks) would make
let mockNoRecord: string | null = null;

jest.mock('../lib/training/record', () => {
  const actual = jest.requireActual('../lib/training/record');
  return {
    ...actual,
    trainingRecord: (scan: { id: string }, ...rest: unknown[]) =>
      scan.id === mockNoRecord ? null : actual.trainingRecord(scan, ...rest),
  };
});
jest.mock('../lib/toast', () => ({ toast: (m: string) => mockToast(m) }));
jest.mock('expo-sharing', () => ({
  shareAsync: (uri: string, options: object) => mockShare(uri, options),
  isAvailableAsync: () => mockAvailable(),
}));
jest.mock('expo-file-system', () => require('../test-utils/memoryFs').memoryFs.module);
jest.mock('expo-crypto', () => require('../test-utils/fixedCrypto').fixedCrypto.module);
jest.mock('../lib/build', () => ({ TEAM_BUILD: true }));

// Training data, in a team build: the count of annotated scans not sent yet, the zip shared, and the scans marked once
// the person says it went where they wanted.

const DETAILS = { taxType: 'VAT', account: 'Sales Revenue', terms: 'account', atc: 'WC158' } as const;
const NOW = new Date(2026, 10, 18, 10, 0);
const encoder = new TextEncoder();
let folders = 0;

/** A fixture photographed: its folder in the scanner's scans/, with each box's crop. */
function scanned(stem: string): string {
  const result = parseScanResult(coreJson(stem, `file:///docs/scans/${++folders}`));
  for (const r of result.reads) memoryFs.files.set(r.cropUri!, encoder.encode(`the crop of ${r.name}`));
  return addScan({ label: 'Camera photo', source: 'camera', result });
}

/** Saved in annotation mode: each training box confirmed, with the source tag. */
async function saveAnnotated(stem: string): Promise<string> {
  await updateSettings({ annotation: true });
  const id = scanned(stem);
  uncheckedBoxes(getScan(id)!).forEach((box) => confirmBox(id, box));
  await saveScan(id, getScan(id)!.kind === '2307' ? { account: '1205' } : DETAILS, { client: 'C014', writer: 'W03' });
  return id;
}

const press = (el: Parameters<typeof fireEvent.press>[0]) => act(async () => fireEvent.press(el));
let alertSpy: jest.SpyInstance;
const lastButtons = () => alertSpy.mock.calls.at(-1)![2] as AlertButton[];
/** Presses a button of the last Alert. */
const answer = (label: string) =>
  act(async () => {
    lastButtons()
      .find((b) => b.text === label)
      ?.onPress?.();
  });

beforeAll(() => pinToday(NOW));
afterAll(() => jest.useRealTimers());

/** The IDs of the scans in the last zip shared. */
function sharedIds(): string[] {
  const zip = unzipStored(memoryFs.files.get(mockShare.mock.calls.at(-1)![0]) as Uint8Array);
  return JSON.parse(new TextDecoder().decode(zip[0].data)).scans.map((s: { id: string }) => s.id);
}

beforeEach(async () => {
  jest.clearAllMocks();
  jest.setSystemTime(NOW);
  mockNoRecord = null;
  memoryFs.reset();
  await loadSaved(); // nothing saved
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

test('the training screen exports and marks', async () => {
  // the file's first test, so nothing has loaded the install ID yet: as when the start couldn't keep it
  expect(() => installId()).toThrow('install_not_loaded');
  const sale = await saveAnnotated('inv_0051');
  const cert = await saveAnnotated('bir2307_photo_0');
  await updateSettings({ annotation: false });
  await saveScan(scanned('inv_0007'), DETAILS); // not annotated: not counted
  await render(<TrainingScreen />);
  expect(screen.getByText('2 annotated scans not exported yet.')).toBeTruthy();

  // the ID still can't be made: no file
  fixedCrypto.module.randomUUID.mockImplementationOnce(() => {
    throw new Error('no ID');
  });
  await press(screen.getByRole('button', { name: 'Export training data' }));
  expect(mockToast).toHaveBeenCalledWith("Couldn't make the file.");
  expect(mockShare).not.toHaveBeenCalled();
  expect(alertSpy).not.toHaveBeenCalled();

  // now it can: the zip of both is shared, then the question
  await press(screen.getByRole('button', { name: 'Export training data' }));
  expect(mockShare).toHaveBeenCalledWith('file:///cache/exports/MyBizMate Scan training data 2026-11-18 100000 4a3f.zip', {
    mimeType: 'application/zip',
    dialogTitle: 'Send the file',
  });
  const zip = unzipStored(memoryFs.files.get(mockShare.mock.calls[0][0]) as Uint8Array);
  const manifest = JSON.parse(new TextDecoder().decode(zip[0].data));
  expect([zip[0].name, manifest.installId, manifest.scans.map((s: { id: string }) => s.id).sort()]).toEqual([
    'manifest.json',
    fixedCrypto.uuid,
    [sale, cert].sort(),
  ]);
  expect(alertSpy).toHaveBeenCalledWith(
    'Did the file go where you wanted?',
    'Mark these 2 scans as exported, so the next export leaves them out.',
    expect.anything(),
  );
  expect(lastButtons().map((b) => b.text)).toEqual(['Not yet', 'Mark as exported']);

  await answer('Mark as exported');
  expect(mockToast).toHaveBeenLastCalledWith('Marked 2 scans as exported.');
  for (const id of [sale, cert]) {
    expect(savedSummary(id)).toMatchObject({ trainingExportedAt: NOW.toISOString(), exportedAt: null });
  }
  expect(screen.getByText('No annotated scans to export yet.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Export training data' })).toBeNull();
});

test('one scan: "Not yet" keeps it, and none is left once it\'s marked', async () => {
  await render(<TrainingScreen />);
  expect(screen.getByText('No annotated scans to export yet.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Export training data' })).toBeNull();
  await screen.unmount();

  const id = await saveAnnotated('svc_0000');
  await render(<TrainingScreen />);
  expect(screen.getByText('1 annotated scan not exported yet.')).toBeTruthy();
  await press(screen.getByRole('button', { name: 'Export training data' }));
  expect(alertSpy).toHaveBeenLastCalledWith(
    'Did the file go where you wanted?',
    'Mark this scan as exported, so the next export leaves it out.',
    expect.anything(),
  );
  await answer('Not yet');
  expect(savedSummary(id)).toMatchObject({ trainingExportedAt: null });
  expect(screen.getByText('1 annotated scan not exported yet.')).toBeTruthy();

  await press(screen.getByRole('button', { name: 'Export training data' }));
  await answer('Mark as exported');
  expect(mockToast).toHaveBeenLastCalledWith('Marked 1 scan as exported.');
  expect(screen.getByText('No annotated scans to export yet.')).toBeTruthy();
});

test('each export takes the oldest 50, and marks exactly those', async () => {
  // annotated scans saved a second apart, the first the oldest
  const ids: string[] = [];
  const saveNext = async () => {
    jest.setSystemTime(new Date(NOW.getTime() - (51 - ids.length) * 1000));
    ids.push(await saveAnnotated('inv_0051'));
    jest.setSystemTime(NOW);
  };
  while (ids.length < 50) await saveNext();
  await render(<TrainingScreen />);
  expect(screen.getByText('50 annotated scans not exported yet.')).toBeTruthy();
  expect(screen.queryByText('Each export takes the oldest 50.')).toBeNull(); // they fit in one export
  await act(saveNext);
  expect(screen.getByText('51 annotated scans not exported yet.')).toBeTruthy();
  expect(screen.getByText('Each export takes the oldest 50.')).toBeTruthy();

  // the zip holds the oldest 50, the question counts them, and only they are marked
  await press(screen.getByRole('button', { name: 'Export training data' }));
  expect(sharedIds().sort()).toEqual(ids.slice(0, 50).sort());
  expect(alertSpy).toHaveBeenLastCalledWith(
    'Did the file go where you wanted?',
    'Mark these 50 scans as exported, so the next export leaves them out.',
    expect.anything(),
  );
  await answer('Mark as exported');
  expect(mockToast).toHaveBeenLastCalledWith('Marked 50 scans as exported.');
  expect(ids.filter((id) => savedSummary(id)!.trainingExportedAt === NOW.toISOString())).toEqual(ids.slice(0, 50));
  expect(savedSummary(ids[50])).toMatchObject({ trainingExportedAt: null });
  expect(screen.getByText('1 annotated scan not exported yet.')).toBeTruthy();
  expect(screen.queryByText('Each export takes the oldest 50.')).toBeNull();

  // the next export takes the last one
  await press(screen.getByRole('button', { name: 'Export training data' }));
  expect(sharedIds()).toEqual([ids[50]]);
  await answer('Mark as exported');
  expect(mockToast).toHaveBeenLastCalledWith('Marked 1 scan as exported.');
  expect(screen.getByText('No annotated scans to export yet.')).toBeTruthy();
});

test('a scan with no training record stops the export, and nothing is marked', async () => {
  const sale = await saveAnnotated('inv_0051');
  const cert = await saveAnnotated('bir2307_photo_0');
  mockNoRecord = cert;
  await render(<TrainingScreen />);
  expect(screen.getByText('2 annotated scans not exported yet.')).toBeTruthy();
  await press(screen.getByRole('button', { name: 'Export training data' }));
  expect(mockToast).toHaveBeenCalledWith("Couldn't make the file.");
  expect(mockShare).not.toHaveBeenCalled();
  expect(alertSpy).not.toHaveBeenCalled();
  for (const id of [sale, cert]) expect(savedSummary(id)).toMatchObject({ trainingExportedAt: null });
  expect(screen.getByText('2 annotated scans not exported yet.')).toBeTruthy();
});
