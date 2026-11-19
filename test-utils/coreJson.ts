// The scanner core's JSON for a fixture (fixtures/core/expected/<stem>.json): the Python's expected result plus the
// files and timing the core adds.
export function coreJson(stem: string, dir = '/data/x'): string {
  const expected = require(`../fixtures/core/expected/${stem}.json`);
  return JSON.stringify({
    ...expected,
    reads: expected.reads.map((r: { name: string }) => ({ ...r, cropFile: `${dir}/${r.name}.png` })),
    pageFile: expected.aligned ? `${dir}/page.jpg` : null,
    timing: { alignMs: 0, cropMs: 0, readMs: 0, totalMs: 0 },
  });
}
