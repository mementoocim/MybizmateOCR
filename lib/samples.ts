import { Asset } from 'expo-asset';

// The 8 synthetic sample invoices bundled with the app, each with what was written in its boxes and what the laptop
// (the Python reference) read (written by prototype/benchmark/export_core_fixtures.py).
export type SampleInfo = { font: string; truth: Record<string, string>; laptop: Record<string, string> };
export type Sample = { id: string; label: string; font: string; source: number };

const sources: Record<string, number> = {
  inv_0001: require('../assets/samples/inv_0001.jpg'),
  inv_0007: require('../assets/samples/inv_0007.jpg'),
  inv_0011: require('../assets/samples/inv_0011.jpg'),
  inv_0017: require('../assets/samples/inv_0017.jpg'),
  inv_0027: require('../assets/samples/inv_0027.jpg'),
  inv_0041: require('../assets/samples/inv_0041.jpg'),
  inv_0051: require('../assets/samples/inv_0051.jpg'),
  inv_0091: require('../assets/samples/inv_0091.jpg'),
};

const infos: Record<string, SampleInfo> = {
  inv_0001: require('../assets/samples/inv_0001.json'),
  inv_0007: require('../assets/samples/inv_0007.json'),
  inv_0011: require('../assets/samples/inv_0011.json'),
  inv_0017: require('../assets/samples/inv_0017.json'),
  inv_0027: require('../assets/samples/inv_0027.json'),
  inv_0041: require('../assets/samples/inv_0041.json'),
  inv_0051: require('../assets/samples/inv_0051.json'),
  inv_0091: require('../assets/samples/inv_0091.json'),
};

export const SAMPLES: Sample[] = Object.entries(sources).map(([id, source]) => ({
  id,
  label: id.replace('inv_', 'Sample '),
  font: infos[id].font,
  source,
}));

/** What was written in a sample's boxes, and what the laptop read in them. */
export function sampleInfo(id: string): SampleInfo {
  const info = infos[id];
  if (!info) throw new Error(`No sample ${id}`);
  return info;
}

/** A local file URI for a sample, which the scanner can open. */
export async function sampleUri(id: string): Promise<string> {
  const sample = SAMPLES.find((s) => s.id === id);
  if (!sample) throw new Error(`No sample ${id}`);
  const asset = await Asset.fromModule(sample.source).downloadAsync();
  return asset.localUri ?? asset.uri;
}
