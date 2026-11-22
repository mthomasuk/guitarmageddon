// Minimal PDF 1.4 writer using the 14 standard fonts (no embedding needed).
import { layoutSection, metaLine, usedLegend, wrapWords } from './tabtext.js';

export const PAGE_SIZES = {
  a4: [595.28, 841.89],
  letter: [612, 792],
};

// Helvetica glyph widths (1/1000 em) for ASCII 32..126 — used for wrapping and right-aligning.
// prettier-ignore
const HELV = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];

export function helvWidth(text, size) {
  let w = 0;
  for (const ch of text) {
    const c = ch.charCodeAt(0);
    w += c >= 32 && c <= 126 ? HELV[c - 32] : 556;
  }
  return (w * size) / 1000;
}

const WIN_ANSI = { '—': 0x97, '–': 0x96, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '…': 0x85, '€': 0x80 };

/** Encode a JS string as a PDF literal string (ASCII only, octal escapes for the rest). */
export function pdfString(s) {
  let out = '(';
  for (const ch of String(s)) {
    const code = ch.codePointAt(0);
    if (ch === '(' || ch === ')' || ch === '\\') out += '\\' + ch;
    else if (code >= 32 && code < 127) out += ch;
    else if (code < 32) out += ' ';
    else {
      const b = WIN_ANSI[ch] ?? (code >= 160 && code <= 255 ? code : 63);
      out += '\\' + b.toString(8).padStart(3, '0');
    }
  }
  return out + ')';
}

function num(n) {
  return Number(n.toFixed(2)).toString();
}

function wrapHelv(text, size, maxW) {
  const out = [];
  for (const para of String(text).split('\n')) {
    if (!para.trim()) {
      out.push('');
      continue;
    }
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? line + ' ' + word : word;
      if (line && helvWidth(next, size) > maxW) {
        out.push(line);
        line = word;
      } else line = next;
    }
    if (line) out.push(line);
  }
  return out;
}

/** Build the PDF for a song. Returns a Uint8Array. */
export function songToPdf(song, { pageSize = 'a4' } = {}) {
  const [W, H] = PAGE_SIZES[pageSize] || PAGE_SIZES.a4;
  const M = 48; // side margin
  const TOP = 56;
  const BOTTOM = 56;
  const TAB_SIZE = 10;
  const CHAR_W = TAB_SIZE * 0.6; // Courier advance width
  const LEAD = 11.5;
  const usableW = W - 2 * M;
  const maxChars = Math.floor(usableW / CHAR_W);

  const pages = [];
  let ops = null;
  let y = 0;
  const newPage = () => {
    ops = [];
    pages.push(ops);
    y = H - TOP;
  };
  const text = (x, yy, font, size, str, gray = 0) => {
    ops.push(`${gray ? num(gray) : '0'} g BT /${font} ${size} Tf ${num(x)} ${num(yy)} Td ${pdfString(str)} Tj ET`);
  };
  const ensure = (h) => {
    if (y - h < BOTTOM) newPage();
  };

  newPage();

  // Header
  const titleLines = wrapHelv(song.title || 'Untitled tab', 22, usableW * 0.9);
  for (const t of titleLines) {
    y -= 22;
    text(M, y, 'F2', 22, t);
    y -= 4;
  }
  if (song.artist) {
    y -= 14;
    text(M, y, 'F1', 13, song.artist, 0.25);
  }
  y -= 16;
  text(M, y, 'F1', 9.5, metaLine(song), 0.4);
  y -= 10;
  ops.push(`0.8 G 0.6 w ${num(M)} ${num(y)} m ${num(W - M)} ${num(y)} l S`);
  y -= 16;

  for (const sec of song.sections) {
    const systems = layoutSection(sec, song.tuning, maxChars, { rhythm: !!song.rhythm });
    const sysHeight = (s) => (s.label ? LEAD : 0) + (s.rhythm ? LEAD : 0) + s.lines.length * LEAD + 10;
    // Keep the heading with the first row of tab.
    ensure(26 + (systems.length ? sysHeight(systems[0]) : 14));
    y -= 14;
    text(M, y, 'F2', 12, sec.name);
    y -= 10;
    for (const sys of systems) {
      ensure(sysHeight(sys));
      if (sys.label) {
        y -= LEAD;
        text(M, y, 'F4', TAB_SIZE, sys.label, 0.15);
      }
      for (const line of sys.lines) {
        y -= LEAD;
        text(M, y, 'F3', TAB_SIZE, line);
      }
      if (sys.rhythm) {
        y -= LEAD;
        text(M, y, 'F4', TAB_SIZE, sys.rhythm, 0.35);
      }
      y -= 10;
    }
    if (sec.notes) {
      for (const line of wrapHelv(sec.notes, 10, usableW)) {
        ensure(13);
        y -= 13;
        if (line) text(M, y, 'F5', 10, line, 0.2);
      }
      y -= 6;
    }
    y -= 8;
  }

  const legend = usedLegend(song);
  if (legend.length) {
    const legendLines = legend.flatMap((l) => wrapWords(l, Math.floor(usableW / (8.5 * 0.6))));
    ensure(20 + legendLines.length * 12);
    y -= 12;
    text(M, y, 'F2', 9, 'Legend', 0.35);
    for (const l of legendLines) {
      y -= 12;
      text(M, y, 'F3', 8.5, l, 0.35);
    }
  }

  // Footers
  const footLeft = [song.title || 'Untitled tab', song.artist].filter(Boolean).join(' — ');
  pages.forEach((p, i) => {
    ops = p;
    text(M, 30, 'F1', 8, footLeft, 0.55);
    const right = `Page ${i + 1} of ${pages.length}`;
    text(W - M - helvWidth(right, 8), 30, 'F1', 8, right, 0.55);
  });

  return writePdf(pages, W, H, song.title || 'Untitled tab');
}

function writePdf(pages, W, H, title) {
  const objects = []; // index i => object number i+1
  const add = (body) => {
    objects.push(body);
    return objects.length;
  };
  const catalog = add(null);
  const pagesObj = add(null);
  const fonts = ['Helvetica', 'Helvetica-Bold', 'Courier', 'Courier-Bold', 'Helvetica-Oblique'].map((f) =>
    add(`<< /Type /Font /Subtype /Type1 /BaseFont /${f} /Encoding /WinAnsiEncoding >>`)
  );
  const fontRes = fonts.map((id, i) => `/F${i + 1} ${id} 0 R`).join(' ');
  const kids = [];
  for (const ops of pages) {
    const content = ops.join('\n');
    const contentId = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    kids.push(
      add(
        `<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${num(W)} ${num(H)}] /Resources << /Font << ${fontRes} >> >> /Contents ${contentId} 0 R >>`
      )
    );
  }
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objects[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
  const d = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  const date = `D:${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
  const info = add(`<< /Title ${pdfString(title)} /Producer (Guitarmageddon) /Creator (Guitarmageddon) /CreationDate (${date}) >>`);

  let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
  return bytes;
}
