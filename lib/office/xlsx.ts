import { deflateRawSync } from "node:zlib";
import { excelSerial } from "./time";

/**
 * Kleiner XLSX-Schreiber ohne Zusatzpaket (Office Open XML in einer ZIP-Datei).
 *
 * - Zahlen bleiben Zahlen, Geldbeträge als Zahl mit €-Format, Datum als echtes Excel-Datum (Berliner Zeit)
 * - PLZ, Bestell- und Telefonnummern als Text (führende Nullen bleiben erhalten)
 * - Kopfzeile fett, fixiert, mit Autofilter, sinnvolle Spaltenbreiten
 * - Umlaute/Unicode über UTF-8; ungültige XML-Zeichen werden entfernt
 * - Schutz vor Formel-Injection: Texte werden nie als Formel gespeichert; Texte, die mit = + - @ Tab oder
 *   Zeilenumbruch beginnen, bekommen zusätzlich das Excel-Textkennzeichen, „=“, „@“, Tab und CR ein sichtbares ' davor
 */
export type ColType = "text" | "code" | "money" | "datetime" | "date" | "int" | "dec";
export type Column = { header: string; type?: ColType; width?: number };
export type CellValue = string | number | boolean | null | undefined;
export type Row = CellValue[] | { cells: CellValue[]; bold?: boolean };
export type Sheet = { name: string; columns: Column[]; rows: Row[] };

/** Excel erlaubt höchstens 32.767 Zeichen je Zelle */
export const MAX_CELL = 32_767;

const STYLE = {
  default: 0,
  header: 1,
  textGuard: 2,
  code: 3,
  money: 4,
  datetime: 5,
  date: 6,
  int: 7,
  dec: 8,
  boldText: 9,
  boldMoney: 10,
  boldInt: 11,
  boldDec: 12,
  codeGuard: 13,
} as const;

const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
const RISKY = /^[=+\-@\t\r]/;
const VISIBLE_GUARD = /^[=@\t\r]/;

export function xmlEscape(v: string) {
  return v.replace(INVALID_XML, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Text für eine Zelle vorbereiten: Formel-Schutz und Längengrenze */
export function guardText(raw: string): { text: string; risky: boolean } {
  let text = raw.replace(INVALID_XML, "");
  const risky = RISKY.test(text);
  if (VISIBLE_GUARD.test(text)) text = `'${text}`;
  if (text.length > MAX_CELL) text = `${text.slice(0, MAX_CELL - 1)}…`;
  return { text, risky };
}

export function colName(i: number) {
  let n = i + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function cellXml(ref: string, value: CellValue, type: ColType, bold: boolean): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "boolean") value = value ? "ja" : "nein";
  if (typeof value === "number" && Number.isFinite(value) && type !== "text" && type !== "code") {
    let v = value;
    let style: number;
    switch (type) {
      case "money":
        v = value / 100;
        style = bold ? STYLE.boldMoney : STYLE.money;
        break;
      case "datetime":
        v = excelSerial(value);
        style = STYLE.datetime;
        break;
      case "date":
        v = excelSerial(value);
        style = STYLE.date;
        break;
      case "dec":
        style = bold ? STYLE.boldDec : STYLE.dec;
        break;
      default:
        style = bold ? STYLE.boldInt : STYLE.int;
    }
    // Rundungsrauschen vermeiden (z. B. 0,1 + 0,2)
    const num = Number.parseFloat(v.toPrecision(15));
    return `<c r="${ref}" s="${style}"><v>${num}</v></c>`;
  }
  const { text, risky } = guardText(String(value));
  const style = type === "code" ? (risky ? STYLE.codeGuard : STYLE.code) : risky ? STYLE.textGuard : bold ? STYLE.boldText : STYLE.default;
  const space = /^\s|\s$|\n/.test(text) ? ' xml:space="preserve"' : "";
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t${space}>${xmlEscape(text)}</t></is></c>`;
}

const rowCells = (r: Row) => (Array.isArray(r) ? r : r.cells);
const rowBold = (r: Row) => (!Array.isArray(r) && r.bold) || false;

function autoWidth(col: Column, i: number, rows: Row[]): number {
  if (col.width) return col.width;
  const fixed: Partial<Record<ColType, number>> = { money: 13, datetime: 17, date: 11, int: 9, dec: 10 };
  let w = Math.max(col.header.length + 2, fixed[col.type ?? "text"] ?? 8);
  if (!fixed[col.type ?? "text"]) {
    for (const r of rows.slice(0, 500)) {
      const v = rowCells(r)[i];
      if (v !== null && v !== undefined) w = Math.max(w, Math.min(60, String(v).length + 2));
    }
  }
  return Math.min(60, w);
}

export function sheetXml(sheet: Sheet): string {
  const cols = sheet.columns;
  const lastCol = colName(Math.max(0, cols.length - 1));
  const lastRow = sheet.rows.length + 1;
  const parts: string[] = [];
  parts.push('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">');
  parts.push(`<dimension ref="A1:${lastCol}${lastRow}"/>`);
  parts.push('<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>');
  parts.push('<sheetFormatPr defaultRowHeight="15"/>');
  parts.push(`<cols>${cols.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${autoWidth(c, i, sheet.rows)}" customWidth="1"/>`).join("")}</cols>`);
  parts.push("<sheetData>");
  parts.push(`<row r="1">${cols.map((c, i) => `<c r="${colName(i)}1" s="${STYLE.header}" t="inlineStr"><is><t>${xmlEscape(c.header)}</t></is></c>`).join("")}</row>`);
  sheet.rows.forEach((r, ri) => {
    const n = ri + 2;
    const cells = rowCells(r);
    const bold = rowBold(r);
    let xml = "";
    for (let i = 0; i < cols.length; i++) xml += cellXml(`${colName(i)}${n}`, cells[i], cols[i].type ?? "text", bold);
    parts.push(`<row r="${n}">${xml}</row>`);
  });
  parts.push("</sheetData>");
  if (cols.length) parts.push(`<autoFilter ref="A1:${lastCol}${lastRow}"/>`);
  parts.push('<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup orientation="landscape" paperSize="9" fitToWidth="1" fitToHeight="0"/>');
  parts.push("</worksheet>");
  return parts.join("");
}

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="3"><numFmt numFmtId="164" formatCode="#,##0.00\\ &quot;€&quot;"/><numFmt numFmtId="165" formatCode="dd.mm.yyyy\\ hh:mm"/><numFmt numFmtId="166" formatCode="dd.mm.yyyy"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8EEF4"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FF9AA5B1"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="14">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" quotePrefix="1"/>
<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
<xf numFmtId="3" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
<xf numFmtId="4" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" quotePrefix="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Standard" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

/** Gültiger Blattname: höchstens 31 Zeichen, ohne : \ / ? * [ ], eindeutig */
export function safeSheetName(name: string, used: Set<string>) {
  const base = (name.replace(/[:\\/?*[\]]/g, " ").trim() || "Tabelle").slice(0, 31);
  let n = base;
  for (let i = 2; used.has(n.toLowerCase()); i++) n = `${base.slice(0, 31 - String(i).length - 1)} ${i}`;
  used.add(n.toLowerCase());
  return n;
}

export function buildXlsx(sheets: Sheet[], opts: { title?: string; created?: Date } = {}): Buffer {
  const used = new Set<string>();
  const names = sheets.map((s) => safeSheetName(s.name, used));
  const created = (opts.created ?? new Date()).toISOString().replace(/\.\d{3}Z$/, "Z");
  const files: [string, string][] = [
    [
      "[Content_Types].xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${names.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`,
    ],
    [
      "_rels/.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`,
    ],
    [
      "docProps/core.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xmlEscape(opts.title ?? "EXSTASE Export")}</dc:title><dc:creator>EXSTASE Büroverwaltung</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${created}</dcterms:created></cp:coreProperties>`,
    ],
    [
      "docProps/app.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>EXSTASE Büroverwaltung</Application></Properties>`,
    ],
    [
      "xl/workbook.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${names.map((n, i) => `<sheet name="${xmlEscape(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets><definedNames>${sheets
        .map((s, i) => (s.columns.length ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${xmlEscape(names[i].replace(/'/g, "''"))}'!$A$1:$${colName(s.columns.length - 1)}$${s.rows.length + 1}</definedName>` : ""))
        .join("")}</definedNames></workbook>`,
    ],
    [
      "xl/_rels/workbook.xml.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${names.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${names.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    ],
    ["xl/styles.xml", STYLES_XML],
    ...sheets.map((s, i) => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s)] as [string, string]),
  ];
  return zip(files.map(([name, content]) => ({ name, data: Buffer.from(content, "utf8") })), opts.created ?? new Date());
}

/* ───────────── ZIP (Deflate) ───────────── */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(buf: Buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosTime(d: Date) {
  const time = (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | Math.floor(d.getUTCSeconds() / 2);
  const date = ((d.getUTCFullYear() - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate();
  return { time, date };
}

export function zip(entries: { name: string; data: Buffer }[], when: Date): Buffer {
  const { time, date } = dosTime(when);
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, "utf8");
    const packed = deflateRawSync(e.data, { level: 6 });
    const crc = crc32(e.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8-Dateinamen
    local.writeUInt16LE(8, 8); // Deflate
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(e.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, packed);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(e.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += 30 + name.length + packed.length;
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}
