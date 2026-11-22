// The scanner core's JSON for a fixture, as scanPhoto and readPdf give it, with the files and timing the core adds.
// dir: the scan's folder, or null for a scan that kept no files. The fixture is one of:
// - fixtures/core/expected/<stem>.json: a photo and what the Python reads in it, as a photo's result (no page count,
//   no picture, no read from a PDF's text);
// - fixtures/core/expected2307/<stem>.json: a made-up 2307 or invoice (a text PDF, a picture PDF or a photo) and the
//   values written in it, read as written: one read per value, in its template's order, conf 1, and on a text PDF
//   each from the PDF's own text; with the PDF's page count and whether its page is a picture.
export function coreJson(stem: string, dir: string | null = '/data/x'): string {
  const scan = require('fs').existsSync(`fixtures/core/expected2307/${stem}.json`) // jest runs from the repo's root
    ? asRead(require(`../fixtures/core/expected2307/${stem}.json`))
    : asPhoto(require(`../fixtures/core/expected/${stem}.json`));
  return JSON.stringify({
    ...scan,
    reads: scan.reads.map((r) => ({ ...r, cropFile: dir ? `${dir}/${r.name}.png` : '' })),
    pageFile: scan.aligned && dir ? `${dir}/page.jpg` : null,
    originalFile: dir ? `${dir}/original.jpg` : null,
    scanDir: dir,
    timing: { alignMs: 0, cropMs: 0, readMs: 0, totalMs: 0 },
  });
}

type Scan = { aligned: boolean; reads: { name: string }[]; [key: string]: unknown };

function asPhoto(expected: Scan): Scan {
  return {
    ...expected,
    source: 'photo',
    pageCount: null,
    picture: null,
    reads: expected.reads.map((r) => ({ ...r, fromText: false })),
  };
}

type Box = { name: string; type: string; bbox: [number, number, number, number] };
type Written = { kind: 'text' | 'picture' | 'photo'; form: string; pageCount: number | null; values: Record<string, string> };

// The forms the made-up fixtures are written on: their boxes, their page as a PDF renders it (its long side 2400 px)
// and their minimum sharpness (photo_quality.h).
const WRITTEN_ON: Record<string, { boxes: Box[]; page: [number, number]; sharpMin: number }> = {
  sales_invoice: { boxes: require('../modules/scanner/assets/scanner/field_map.json').fields, page: [1855, 2400], sharpMin: 1 },
  bir_2307: { boxes: require('../modules/scanner/assets/scanner/bir_2307.json').fields, page: [1569, 2400], sharpMin: 0.5 },
};

function asRead(w: Written): Scan {
  const { boxes, page, sharpMin } = WRITTEN_ON[w.form];
  const [width, height] = page;
  const pdf = w.kind !== 'photo';
  const reads = boxes
    .filter((b) => w.values[b.name] !== undefined)
    .map((b) => ({
      name: b.name,
      type: b.type,
      text: w.values[b.name],
      conf: 1,
      alts: [],
      fromText: w.kind === 'text',
      cropSize: [b.bbox[2] - b.bbox[0], b.bbox[3] - b.bbox[1]],
    }));
  return {
    aligned: true,
    form: w.form,
    source: pdf ? 'pdf' : 'photo',
    pageCount: w.pageCount,
    picture: pdf ? w.kind === 'picture' : null,
    // not measured: a sharp, well-lit page that fills the picture
    photoSize: page,
    turned: false,
    corners: [[0, 0], [width, 0], [width, height], [0, height]],
    sharpness: 2,
    sharpMin,
    light: 255,
    darkMax: 50,
    terms: null,
    blanks: boxes.filter((b) => b.type !== 'checkbox').length - reads.length,
    reads,
  };
}
