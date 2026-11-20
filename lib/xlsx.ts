import type { ExportRow } from './exportRows';
import { zipStored } from './zip';

// A one-sheet .xlsx in an import template's layout: row 1 is the template's header row, then one row per export
// row, each value under its column. Text is an inline string, numbers are numbers, blank cells are left out.

const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PACKAGE_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';

const CONTENT_TYPES =
  `${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
  '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
  '</Types>';
const ROOT_RELS =
  `${HEAD}<Relationships xmlns="${PACKAGE_REL}">` +
  `<Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
const WORKBOOK_RELS =
  `${HEAD}<Relationships xmlns="${PACKAGE_REL}">` +
  `<Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`;

/** 0 -> A, 25 -> Z, 26 -> AA. */
export function columnLetter(index: number): string {
  let n = index + 1;
  let letters = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    letters = String.fromCharCode(65 + r) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

/** Text for XML: control characters other than tab and line ends removed, & < > " ' escaped. */
function xmlText(s: string): string {
  const kept = Array.from(s)
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return code >= 32 || code === 9 || code === 10 || code === 13;
    })
    .join('');
  return kept.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function cell(ref: string, value: string | number): string {
  return typeof value === 'number'
    ? `<c r="${ref}"><v>${value}</v></c>`
    : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlText(value)}</t></is></c>`;
}

function sheetXml(columns: readonly string[], rows: readonly ExportRow[]): string {
  const header = columns.map((name, i) => cell(`${columnLetter(i)}1`, name)).join('');
  const body = rows.map((row, r) => {
    const cells = columns
      .map((name, i) => {
        const value = row[name];
        return value === undefined || value === '' ? '' : cell(`${columnLetter(i)}${r + 2}`, value);
      })
      .join('');
    return `<row r="${r + 2}">${cells}</row>`;
  });
  return `${HEAD}<worksheet xmlns="${MAIN}"><sheetData><row r="1">${header}</row>${body.join('')}</sheetData></worksheet>`;
}

export function workbook(sheetName: string, columns: readonly string[], rows: readonly ExportRow[], at: Date): Uint8Array {
  const encoder = new TextEncoder();
  const workbookXml =
    `${HEAD}<workbook xmlns="${MAIN}" xmlns:r="${REL}">` +
    `<sheets><sheet name="${xmlText(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  return zipStored(
    [
      { name: '[Content_Types].xml', data: encoder.encode(CONTENT_TYPES) },
      { name: '_rels/.rels', data: encoder.encode(ROOT_RELS) },
      { name: 'xl/workbook.xml', data: encoder.encode(workbookXml) },
      { name: 'xl/_rels/workbook.xml.rels', data: encoder.encode(WORKBOOK_RELS) },
      { name: 'xl/worksheets/sheet1.xml', data: encoder.encode(sheetXml(columns, rows)) },
    ],
    at,
  );
}
