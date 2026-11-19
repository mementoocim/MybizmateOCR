import { Asset } from 'expo-asset';

// The 8 synthetic sample invoices bundled with the app (written by prototype/benchmark/export_core_fixtures.py).
export type Sample = { id: string; label: string; source: number };

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

export const SAMPLES: Sample[] = Object.entries(sources).map(([id, source]) => ({
  id,
  label: id.replace('inv_', 'Sample '),
  source,
}));

/** A local file URI for a sample, which the scanner can open. */
export async function sampleUri(id: string): Promise<string> {
  const sample = SAMPLES.find((s) => s.id === id);
  if (!sample) throw new Error(`No sample ${id}`);
  const asset = await Asset.fromModule(sample.source).downloadAsync();
  return asset.localUri ?? asset.uri;
}
