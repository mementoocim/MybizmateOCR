// The scanner core's JSON for a fixture (fixtures/core/expected/<stem>.json): the Python's expected result plus the
// files and timing the core adds. dir: the scan's folder, or null for a scan that kept no files.
export function coreJson(stem: string, dir: string | null = '/data/x'): string {
  const expected = require(`../fixtures/core/expected/${stem}.json`);
  return JSON.stringify({
    ...expected,
    reads: expected.reads.map((r: { name: string }) => ({ ...r, cropFile: dir ? `${dir}/${r.name}.png` : '' })),
    pageFile: expected.aligned && dir ? `${dir}/page.jpg` : null,
    originalFile: dir ? `${dir}/original.jpg` : null,
    scanDir: dir,
    timing: { alignMs: 0, cropMs: 0, readMs: 0, totalMs: 0 },
  });
}
