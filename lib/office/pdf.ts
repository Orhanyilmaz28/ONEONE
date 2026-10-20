import { deflateSync } from "node:zlib";

/**
 * Schlanker PDF-Schreiber für Büro-Dokumente (Lieferscheine, Listen, Berichte) – ohne zusätzliches Paket.
 *
 * - Schriften: Helvetica und Helvetica-Bold (in jedem PDF-Programm eingebaut), Zeichensatz WinAnsi:
 *   Umlaute, ß, €, „“ und – werden korrekt gedruckt. Zeichen außerhalb (z. B. ş, ı, ł) werden zum
 *   Grundbuchstaben vereinfacht (ş → s), nie weggelassen.
 * - Koordinaten in Punkt (1 pt = 1/72 Zoll), Ursprung oben links (y wächst nach unten).
 * - Seitenzahlen pro Gruppe („Seite 1 von 2“ je Lieferschein) werden erst beim Erzeugen eingesetzt.
 * Ohne Server-Abhängigkeiten (testbar).
 */
export type FontName = "regular" | "bold";
export type TextOpts = { size?: number; font?: FontName; gray?: number; align?: "left" | "right" | "center" };

export const A4 = { w: 595.28, h: 841.89 };
export const mm = (v: number) => (v * 72) / 25.4;

/* Breiten der Zeichen 32–255 im WinAnsi-Zeichensatz (1/1000 der Schriftgröße, Adobe-Standardwerte) */
// biome-ignore format: Tabelle
const W_REGULAR = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,350,556,350,222,556,333,1000,556,556,333,1000,667,333,1000,350,611,350,350,222,222,333,333,350,556,1000,333,1000,500,333,944,350,500,667,278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,333,400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,500];
// biome-ignore format: Tabelle
const W_BOLD = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,350,556,350,278,556,500,1000,556,556,333,1000,667,333,1000,350,611,350,350,278,278,500,500,350,556,1000,333,1000,556,333,944,350,500,667,278,333,556,556,556,556,280,556,333,737,370,556,584,333,737,333,400,584,333,333,333,611,556,278,333,333,365,556,834,834,834,611,722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,584,611,611,611,611,611,556,611,556];

/** Unicode-Zeichen im Bereich 0x80–0x9F von WinAnsi */
const WIN_EXTRA: Record<string, number> = {
  "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85, "†": 0x86, "‡": 0x87, "ˆ": 0x88, "‰": 0x89, "Š": 0x8a, "‹": 0x8b, "Œ": 0x8c, "Ž": 0x8e,
  "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97, "˜": 0x98, "™": 0x99, "š": 0x9a, "›": 0x9b, "œ": 0x9c, "ž": 0x9e, "Ÿ": 0x9f,
};
/** Häufige Zeichen ohne WinAnsi-Gegenstück, die sich nicht über Akzent-Entfernung vereinfachen lassen */
const FALLBACK: Record<string, string> = { "ı": "i", "ł": "l", "Ł": "L", "đ": "d", "Đ": "D", "→": "->", "≈": "~", " ": " ", " ": " ", " ": " " };

/** Text → WinAnsi-Bytes (als Latin-1-Zeichenkette). Steuerzeichen werden zu Leerzeichen. */
export function toWinAnsi(input: string): string {
  let out = "";
  for (const ch of String(input ?? "")) {
    const code = ch.codePointAt(0) ?? 32;
    if (code === 9 || code === 10 || code === 13) out += " ";
    else if (code < 32 || code === 127) continue;
    else if (code < 128 || (code >= 0xa0 && code <= 0xff)) out += ch;
    else if (WIN_EXTRA[ch] !== undefined) out += String.fromCharCode(WIN_EXTRA[ch]);
    else if (FALLBACK[ch] !== undefined) out += toWinAnsi(FALLBACK[ch]);
    else {
      const base = ch.normalize("NFD").replace(/\p{M}/gu, "");
      out += base && base !== ch && [...base].every((c) => (c.codePointAt(0) ?? 0) < 256) ? base : "?";
    }
  }
  return out;
}

/** Breite eines Textes in Punkt */
export function textWidth(text: string, size: number, font: FontName = "regular") {
  const table = font === "bold" ? W_BOLD : W_REGULAR;
  let w = 0;
  const enc = toWinAnsi(text);
  for (let i = 0; i < enc.length; i++) {
    const c = enc.charCodeAt(i);
    w += c >= 32 && c <= 255 ? table[c - 32] || 556 : 556;
  }
  return (w * size) / 1000;
}

/** Zeilenumbruch an Wortgrenzen; überlange Wörter werden hart getrennt. Leerer Text → eine leere Zeile. */
export function wrapText(text: string, maxWidth: number, size: number, font: FontName = "regular"): string[] {
  const lines: string[] = [];
  for (const para of String(text ?? "").split(/\r?\n/)) {
    const words = para.split(/\s+/).filter(Boolean);
    let line = "";
    for (let word of words) {
      while (textWidth(word, size, font) > maxWidth && word.length > 1) {
        // Wort passt nicht in eine Zeile → so viel wie möglich abschneiden
        if (line) {
          lines.push(line);
          line = "";
        }
        let cut = word.length - 1;
        while (cut > 1 && textWidth(word.slice(0, cut), size, font) > maxWidth) cut--;
        lines.push(word.slice(0, cut));
        word = word.slice(cut);
      }
      const next = line ? `${line} ${word}` : word;
      if (textWidth(next, size, font) <= maxWidth) line = next;
      else {
        if (line) lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines.length ? lines : [""];
}

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
const num = (n: number) => (Math.round(n * 100) / 100).toString();

/** Text für Dokument-Eigenschaften (UTF-16, damit Umlaute im Titel stimmen) */
function infoString(s: string) {
  const buf = Buffer.from(`﻿${s}`, "utf16le").swap16();
  return `<${buf.toString("hex")}>`;
}

type Page = { ops: string[]; group: number };

/** Bild für das PDF: Pixel als RGB (3 Byte je Pixel) und optional Deckkraft (1 Byte je Pixel) */
export type PdfImage = { width: number; height: number; rgb: Buffer; alpha?: Buffer };

export type FooterFn = (page: number, pages: number, group: number) => { left?: string; right?: string; center?: string };

export class PdfDoc {
  readonly w: number;
  readonly h: number;
  private pages: Page[] = [];
  private group = 0;
  private images: PdfImage[] = [];
  /** Fußzeile je Seite (wird beim Erzeugen gezeichnet, wenn die Seitenzahl je Gruppe feststeht) */
  footer?: FooterFn;

  constructor(
    readonly title: string,
    opts: { landscape?: boolean } = {},
  ) {
    this.w = opts.landscape ? A4.h : A4.w;
    this.h = opts.landscape ? A4.w : A4.h;
  }

  get pageCount() {
    return this.pages.length;
  }

  /** Neue Gruppe (z. B. ein neuer Lieferschein): Seitenzahlen beginnen wieder bei 1 */
  newGroup() {
    this.group++;
    this.addPage();
  }

  addPage() {
    this.pages.push({ ops: [], group: this.group });
  }

  private get ops() {
    if (!this.pages.length) this.addPage();
    return this.pages[this.pages.length - 1].ops;
  }

  text(x: number, y: number, text: string, o: TextOpts = {}) {
    const size = o.size ?? 10;
    const font = o.font ?? "regular";
    const enc = toWinAnsi(text);
    if (!enc) return;
    const width = textWidth(text, size, font);
    const left = o.align === "right" ? x - width : o.align === "center" ? x - width / 2 : x;
    const gray = o.gray ?? 0;
    // y = Grundlinie (von oben gemessen)
    this.ops.push(`BT ${num(gray)} g /${font === "bold" ? "F2" : "F1"} ${num(size)} Tf 1 0 0 1 ${num(left)} ${num(this.h - y)} Tm (${esc(enc)}) Tj ET`);
  }

  line(x1: number, y1: number, x2: number, y2: number, width = 0.5, gray = 0) {
    this.ops.push(`${num(gray)} G ${num(width)} w ${num(x1)} ${num(this.h - y1)} m ${num(x2)} ${num(this.h - y2)} l S`);
  }

  /** Bild einbinden (nur einmal je Dokument gespeichert) und zeichnen; x/y = obere linke Ecke, Höhe aus dem Seitenverhältnis */
  image(img: PdfImage, x: number, y: number, w: number) {
    let i = this.images.indexOf(img);
    if (i < 0) i = this.images.push(img) - 1;
    const h = (w * img.height) / img.width;
    this.ops.push(`q ${num(w)} 0 0 ${num(h)} ${num(x)} ${num(this.h - y - h)} cm /Im${i + 1} Do Q`);
    return h;
  }

  /** Gefülltes Rechteck (x/y = obere linke Ecke) */
  rect(x: number, y: number, w: number, h: number, gray = 0.95) {
    this.ops.push(`${num(gray)} g ${num(x)} ${num(this.h - y - h)} ${num(w)} ${num(h)} re f`);
  }

  /** Rechteck-Rahmen */
  box(x: number, y: number, w: number, h: number, width = 0.5, gray = 0.6) {
    this.ops.push(`${num(gray)} G ${num(width)} w ${num(x)} ${num(this.h - y - h)} ${num(w)} ${num(h)} re S`);
  }

  /** Das fertige PDF */
  build(created = new Date()): Buffer {
    if (!this.pages.length) this.addPage();
    const groups = new Map<number, number>();
    for (const p of this.pages) groups.set(p.group, (groups.get(p.group) ?? 0) + 1);
    const seen = new Map<number, number>();
    const pageOps = this.pages.map((p) => {
      const ops = [...p.ops];
      if (this.footer) {
        const i = (seen.get(p.group) ?? 0) + 1;
        seen.set(p.group, i);
        const f = this.footer(i, groups.get(p.group) ?? 1, p.group);
        let y = this.h - mm(10);
        const add = (x: number, t: string | undefined, align: TextOpts["align"]) => {
          if (!t) return;
          const enc = toWinAnsi(t);
          const width = textWidth(t, 7.5);
          const left = align === "right" ? x - width : align === "center" ? x - width / 2 : x;
          ops.push(`BT 0.4 g /F1 7.5 Tf 1 0 0 1 ${num(left)} ${num(this.h - y)} Tm (${esc(enc)}) Tj ET`);
        };
        // Passt der linke Text nicht neben den rechten, steht er eine Zeile darüber (nie überlappend)
        const free = this.w - mm(30) - textWidth(f.right ?? "", 7.5) - mm(6);
        add(this.w - mm(15), f.right, "right");
        add(this.w / 2, f.center, "center");
        if (f.left && textWidth(f.left, 7.5) > free) {
          const lines = wrapText(f.left, this.w - mm(30), 7.5);
          lines.forEach((l, i) => {
            y = this.h - mm(10) - (lines.length - i) * 9.5;
            add(mm(15), l, "left");
          });
        } else add(mm(15), f.left, "left");
      }
      return ops.join("\n");
    });

    // Objekte: 1 Katalog, 2 Seitenbaum, 3/4 Schriften, 5 Info, danach je Seite: Seite + Inhalt
    const objects: Buffer[] = [];
    const kids = pageOps.map((_, i) => `${6 + i * 2} 0 R`).join(" ");
    objects.push(Buffer.from("<< /Type /Catalog /Pages 2 0 R >>", "latin1"));
    objects.push(Buffer.from(`<< /Type /Pages /Kids [${kids}] /Count ${pageOps.length} >>`, "latin1"));
    objects.push(Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>", "latin1"));
    objects.push(Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>", "latin1"));
    const d = created.toISOString().replace(/[-:T]/g, "").slice(0, 14);
    objects.push(Buffer.from(`<< /Title ${infoString(this.title)} /Producer (EXSTASE Buero) /Creator (EXSTASE Buero) /CreationDate (D:${d}Z) >>`, "latin1"));
    // Bilder liegen nach den Seiten: je Bild ein Objekt für die Farben und eins für die Deckkraft
    const imgStart = 6 + pageOps.length * 2;
    const imgRefs = this.images.map((_, i) => `/Im${i + 1} ${imgStart + i * 2} 0 R`).join(" ");
    const xobjects = this.images.length ? ` /XObject << ${imgRefs} >>` : "";
    for (let i = 0; i < pageOps.length; i++) {
      objects.push(
        Buffer.from(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(this.w)} ${num(this.h)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>${xobjects} >> /Contents ${7 + i * 2} 0 R >>`, "latin1"),
      );
      const data = deflateSync(Buffer.from(pageOps[i], "latin1"));
      objects.push(Buffer.concat([Buffer.from(`<< /Length ${data.length} /Filter /FlateDecode >>\nstream\n`, "latin1"), data, Buffer.from("\nendstream", "latin1")]));
    }

    this.images.forEach((img, i) => {
      const rgb = deflateSync(img.rgb);
      const smask = img.alpha ? ` /SMask ${imgStart + i * 2 + 1} 0 R` : "";
      objects.push(
        Buffer.concat([
          Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode${smask} /Length ${rgb.length} >>\nstream\n`, "latin1"),
          rgb,
          Buffer.from("\nendstream", "latin1"),
        ]),
      );
      const a = deflateSync(img.alpha ?? Buffer.alloc(img.width * img.height, 255));
      objects.push(
        Buffer.concat([
          Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ${a.length} >>\nstream\n`, "latin1"),
          a,
          Buffer.from("\nendstream", "latin1"),
        ]),
      );
    });

    const parts: Buffer[] = [Buffer.from("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n", "latin1")];
    let offset = parts[0].length;
    const offsets: number[] = [];
    objects.forEach((body, i) => {
      offsets.push(offset);
      const chunk = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`, "latin1"), body, Buffer.from("\nendobj\n", "latin1")]);
      parts.push(chunk);
      offset += chunk.length;
    });
    const xref = [`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`, ...offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`)].join("");
    parts.push(Buffer.from(`${xref}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${offset}\n%%EOF\n`, "latin1"));
    return Buffer.concat(parts);
  }
}

/* ───────────── Fließtext und Tabellen mit Seitenumbruch ───────────── */

export type Column = { header: string; width: number; align?: "left" | "right"; bold?: boolean };

/** Schreibposition auf der Seite mit automatischem Seitenumbruch */
export class Flow {
  y: number;
  readonly left: number;
  readonly right: number;
  readonly bottom: number;

  constructor(
    readonly doc: PdfDoc,
    readonly top: number,
    /** Wird auf jeder neuen Seite (nach dem Umbruch) aufgerufen, z. B. für den Seitenkopf; gibt die neue y-Position zurück */
    readonly onNewPage?: () => number,
    margin = mm(15),
    rightMargin = mm(15),
  ) {
    this.y = top;
    this.left = margin;
    this.right = doc.w - rightMargin;
    this.bottom = doc.h - mm(18);
  }

  get width() {
    return this.right - this.left;
  }

  /** Platz für `h` Punkt sicherstellen, sonst neue Seite */
  ensure(h: number) {
    if (this.y + h <= this.bottom) return false;
    this.doc.addPage();
    this.y = this.onNewPage ? this.onNewPage() : this.top;
    return true;
  }

  paragraph(text: string, o: TextOpts & { gap?: number; indent?: number } = {}) {
    const size = o.size ?? 10;
    const lh = size * 1.35;
    for (const l of wrapText(text, this.width - (o.indent ?? 0), size, o.font)) {
      this.ensure(lh);
      this.y += lh;
      this.doc.text(this.left + (o.indent ?? 0), this.y - size * 0.3, l, o);
    }
    this.y += o.gap ?? 0;
  }

  /** Zwischenüberschrift: bleibt mit dem folgenden Inhalt zusammen (nie allein unten auf einer Seite) */
  heading(text: string, o: TextOpts & { gap?: number; keep?: number } = {}) {
    this.ensure((o.size ?? 10) * 1.35 + (o.keep ?? 60));
    this.paragraph(text, { ...o, font: "bold" });
  }

  /** Zwei Spalten „Bezeichnung … Wert“ */
  keyValues(rows: [string, string][], o: { size?: number; keyWidth?: number; bold?: string[] } = {}) {
    const size = o.size ?? 10;
    const kw = o.keyWidth ?? 170;
    const lh = size * 1.5;
    for (const [k, v] of rows) {
      const lines = wrapText(v, this.width - kw, size);
      this.ensure(lh * lines.length);
      const bold = o.bold?.includes(k);
      this.doc.text(this.left, this.y + size, k, { size, gray: 0.35, font: bold ? "bold" : "regular" });
      lines.forEach((l, i) => this.doc.text(this.left + kw, this.y + size + i * lh, l, { size, font: bold ? "bold" : "regular" }));
      this.y += lh * lines.length;
    }
  }

  /**
   * Tabelle mit Kopfzeile (auf jeder Seite wiederholt), Zeilenumbruch in Zellen und Trennlinien.
   * `widths` werden auf die verfügbare Breite skaliert. Zeilen werden nie zwischen zwei Seiten geteilt.
   */
  table(columns: Column[], rows: (string[] | { cells: string[]; bold?: boolean; shade?: boolean })[], o: { size?: number; padding?: number } = {}) {
    const size = o.size ?? 9;
    const pad = o.padding ?? 4;
    const lh = size * 1.3;
    const total = columns.reduce((n, c) => n + c.width, 0);
    const widths = columns.map((c) => (c.width / total) * this.width);
    const xs = widths.map((_, i) => this.left + widths.slice(0, i).reduce((n, w) => n + w, 0));

    const header = () => {
      const lines = columns.map((c, i) => wrapText(c.header, widths[i] - pad * 2, size - 0.5, "bold"));
      const h = Math.max(...lines.map((l) => l.length)) * lh + pad * 2;
      this.doc.rect(this.left, this.y, this.width, h, 0.93);
      columns.forEach((c, i) =>
        lines[i].forEach((l, j) =>
          this.doc.text(c.align === "right" ? xs[i] + widths[i] - pad : xs[i] + pad, this.y + pad + size * 0.95 + j * lh, l, { size: size - 0.5, font: "bold", align: c.align }),
        ),
      );
      this.y += h;
    };

    this.ensure(lh * 3 + pad * 4);
    header();
    for (const raw of rows) {
      const r = Array.isArray(raw) ? { cells: raw } : raw;
      const lines = columns.map((c, i) => wrapText(r.cells[i] ?? "", widths[i] - pad * 2, size, r.bold || c.bold ? "bold" : "regular"));
      const h = Math.max(...lines.map((l) => l.length)) * lh + pad * 2;
      if (this.ensure(h)) header();
      if (r.shade) this.doc.rect(this.left, this.y, this.width, h, 0.965);
      columns.forEach((c, i) =>
        lines[i].forEach((l, j) =>
          this.doc.text(c.align === "right" ? xs[i] + widths[i] - pad : xs[i] + pad, this.y + pad + size * 0.95 + j * lh, l, { size, font: r.bold || c.bold ? "bold" : "regular", align: c.align }),
        ),
      );
      this.y += h;
      this.doc.line(this.left, this.y, this.right, this.y, 0.4, 0.8);
    }
  }
}
