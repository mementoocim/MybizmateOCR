/**
 * A CSV file's records, as Excel and Google Sheets write them (RFC 4180): fields separated by commas, records by
 * CRLF, LF or CR; a field in quotes keeps its commas and line breaks, with "" for one quote. A leading byte order mark
 * is dropped, and records whose fields are all empty are skipped.
 */
export function parseCsv(text: string): string[][] {
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let quoted = false;
  const endField = () => {
    record.push(field);
    field = '';
  };
  const endRecord = () => {
    endField();
    if (record.some((f) => f !== '')) records.push(record);
    record = [];
  };
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ',') {
      endField();
    } else if (c === '\r' || c === '\n') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      endRecord();
    } else {
      field += c;
    }
  }
  if (field !== '' || record.length > 0) endRecord();
  return records;
}

// Windows-1252's bytes 0x80-0x9F (its other bytes are Latin-1's code points); the 5 it leaves unused stay as they are.
const CP1252_HIGH = [
  0x20ac, 0x81, 0x201a, 0x192, 0x201e, 0x2026, 0x2020, 0x2021, 0x2c6, 0x2030, 0x160, 0x2039, 0x152, 0x8d, 0x17d, 0x8f,
  0x90, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x2dc, 0x2122, 0x161, 0x203a, 0x153, 0x9d, 0x17e, 0x178,
];
const RUN = 4096; // code points per String.fromCodePoint call

/**
 * A CSV file's text from its bytes: UTF-8 when they are valid UTF-8 (Google Sheets, Excel's "CSV UTF-8"), else
 * Windows-1252, which Excel's plain "CSV (Comma delimited)" writes on a Philippine or US Windows (its ñ is one byte).
 */
export function decodeCsv(bytes: Uint8Array): string {
  return utf8(bytes) ?? cp1252(bytes);
}

/** Strict UTF-8 (no overlong forms, surrogates or code points past U+10FFFF), or null. */
function utf8(b: Uint8Array): string | null {
  const parts: string[] = [];
  let run: number[] = [];
  for (let i = 0; i < b.length; ) {
    const lead = b[i];
    let n: number;
    let cp: number;
    if (lead < 0x80) [n, cp] = [1, lead];
    else if (lead >= 0xc2 && lead <= 0xdf) [n, cp] = [2, lead & 0x1f];
    else if (lead >= 0xe0 && lead <= 0xef) [n, cp] = [3, lead & 0x0f];
    else if (lead >= 0xf0 && lead <= 0xf4) [n, cp] = [4, lead & 0x07];
    else return null;
    if (i + n > b.length) return null;
    for (let k = 1; k < n; k++) {
      const c = b[i + k];
      if ((c & 0xc0) !== 0x80) return null;
      cp = (cp << 6) | (c & 0x3f);
    }
    if ((n === 3 && (cp < 0x800 || (cp >= 0xd800 && cp <= 0xdfff))) || (n === 4 && (cp < 0x10000 || cp > 0x10ffff))) {
      return null;
    }
    run.push(cp);
    if (run.length === RUN) {
      parts.push(String.fromCodePoint(...run));
      run = [];
    }
    i += n;
  }
  parts.push(String.fromCodePoint(...run));
  return parts.join('');
}

function cp1252(b: Uint8Array): string {
  const parts: string[] = [];
  for (let i = 0; i < b.length; i += RUN) {
    const run = Array.from(b.subarray(i, i + RUN), (x) => (x >= 0x80 && x <= 0x9f ? CP1252_HIGH[x - 0x80] : x));
    parts.push(String.fromCharCode(...run));
  }
  return parts.join('');
}
