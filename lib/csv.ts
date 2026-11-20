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
