import { scanPhoto, stats } from '../modules/scanner';
import { compareWithSample, SAMPLES, sampleInfo, sampleUri } from './samples';

// The team's speed test (the test app's SpeedTestActivity.java): the 8 samples read 3 times on this phone.

export type SpeedResult = {
  medianMs: number;
  p90Ms: number;
  readMedianMs: number;
  exact: { a: number; b: number }; // boxes read exactly as written, of the boxes with writing (round 1)
  laptop: { a: number; b: number }; // boxes read the way the laptop read them, of the laptop's reads (round 1)
  peakMb: number;
  loadMs: number | null;
};

/** numpy's default percentile: linear between the two nearest values. q is 0–100. */
export function percentile(xs: number[], q: number): number {
  const s = [...xs].sort((a, b) => a - b);
  const pos = (q / 100) * (s.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.min(lo + 1, s.length - 1);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

/** Reads every sample `repeats` times, one after another, keeping no files. */
export async function runSpeedTest(
  onProgress: (done: number, total: number) => void,
  repeats = 3,
): Promise<SpeedResult> {
  const uris: string[] = [];
  for (const s of SAMPLES) uris.push(await sampleUri(s.id));
  const total = SAMPLES.length * repeats;
  const totals: number[] = [];
  const reads: number[] = [];
  const exact = { a: 0, b: 0 };
  const laptop = { a: 0, b: 0 };
  let done = 0;
  for (let round = 0; round < repeats; round++) {
    for (let i = 0; i < SAMPLES.length; i++) {
      const r = await scanPhoto(uris[i], { keepFiles: false });
      totals.push(r.timing.totalMs);
      reads.push(r.timing.readMs);
      if (round === 0) {
        const c = compareWithSample(r.reads, sampleInfo(SAMPLES[i].id));
        exact.a += c.exact;
        exact.b += c.written;
        laptop.a += c.sameAsLaptop;
        laptop.b += c.laptopBoxes;
      }
      onProgress(++done, total);
    }
  }
  const s = await stats();
  return {
    medianMs: percentile(totals, 50),
    p90Ms: percentile(totals, 90),
    readMedianMs: percentile(reads, 50),
    exact,
    laptop,
    peakMb: Math.round(s.peakKb / 1024),
    loadMs: s.loadMs,
  };
}
