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

// Manuscript colours (RGB 0..1): iron-gall ink, vermilion, lapis, gold.
const INK = [0.16, 0.1, 0.05];
const RED = [0.66, 0.15, 0.11];
const LAPIS = [0.12, 0.24, 0.53];
const GOLD = [0.83, 0.64, 0.23];
const GOLD_LIGHT = [0.95, 0.84, 0.5];

const rgb = (c, op) => `${c.map(num).join(' ')} ${op}`;

/**
 * Build the PDF for a song. Returns a Uint8Array.
 * style: 'illuminated' (manuscript look: ruled frame, gilt initial, rubrics) or 'plain'.
 */
export function songToPdf(song, { pageSize = 'a4', style = 'illuminated' } = {}) {
  const [W, H] = PAGE_SIZES[pageSize] || PAGE_SIZES.a4;
  const fancy = style !== 'plain';
  const M = fancy ? 54 : 48; // side margin (inside the frame when illuminated)
  const TOP = fancy ? 62 : 56;
  const BOTTOM = fancy ? 62 : 56;
  const TAB_SIZE = 10;
  const CHAR_W = TAB_SIZE * 0.6; // Courier advance width
  const LEAD = 11.5;
  const usableW = W - 2 * M;
  const maxChars = Math.floor(usableW / CHAR_W);
  const F = fancy
    ? { body: 'F6', bold: 'F7', italic: 'F8' } // Times
    : { body: 'F1', bold: 'F2', italic: 'F5' }; // Helvetica
  const width = (t, size) => helvWidth(t, size) * (fancy ? 0.93 : 1); // Times runs a little narrower

  const pages = [];
  let ops = null;
  let y = 0;
  const newPage = () => {
    ops = [];
    pages.push(ops);
    y = H - TOP;
    if (fancy) drawFrame();
  };
  /** color: a gray level (0 = black) or an [r, g, b] triple */
  const text = (x, yy, font, size, str, color = 0) => {
    const fill = Array.isArray(color) ? rgb(color, 'rg') : `${num(color)} g`;
    ops.push(`${fill} BT /${font} ${size} Tf ${num(x)} ${num(yy)} Td ${pdfString(str)} Tj ET`);
  };
  const ensure = (h) => {
    if (y - h < BOTTOM) newPage();
  };
  const rect = (x, yy, w, h, op) => `${num(x)} ${num(yy)} ${num(w)} ${num(h)} re ${op}`;
  const diamond = (cx, cy, r, color) =>
    ops.push(`${rgb(color, 'rg')} ${num(cx)} ${num(cy + r)} m ${num(cx + r)} ${num(cy)} l ${num(cx)} ${num(cy - r)} l ${num(cx - r)} ${num(cy)} l f`);

  function drawFrame() {
    // Double ruling, vermilion outside and lapis inside, with gilt corner lozenges.
    ops.push(`${rgb(RED, 'RG')} 1.1 w ${rect(24, 24, W - 48, H - 48, 'S')}`);
    ops.push(`${rgb(LAPIS, 'RG')} 0.5 w ${rect(28.5, 28.5, W - 57, H - 57, 'S')}`);
    for (const [cx, cy] of [[24, 24], [W - 24, 24], [24, H - 24], [W - 24, H - 24]]) diamond(cx, cy, 4.5, GOLD);
  }

  /** Gilt initial on a lapis ground with a dotted diaper, like the app's title. */
  function illuminatedInitial(x, top, size, letter) {
    const yy = top - size;
    ops.push(`${rgb(RED, 'RG')} 1 w ${rect(x - 3.5, yy - 3.5, size + 7, size + 7, 'S')}`);
    ops.push(`${rgb(GOLD, 'rg')} ${rect(x - 2, yy - 2, size + 4, size + 4, 'f')}`);
    ops.push(`${rgb(LAPIS, 'rg')} ${rect(x, yy, size, size, 'f')}`);
    const step = size / 6;
    for (let i = 1; i < 6; i++) for (let j = 1; j < 6; j++) diamond(x + i * step, yy + j * step, 0.9, GOLD_LIGHT);
    const fs = size * 0.76;
    const lw = width(letter, fs) * 1.08;
    // a soft shadow then the gold letter
    text(x + (size - lw) / 2 + 1, yy + size * 0.24 - 1, F.bold, fs, letter, [0.05, 0.1, 0.25]);
    text(x + (size - lw) / 2, yy + size * 0.24, F.bold, fs, letter, GOLD_LIGHT);
  }

  newPage();

  // ---------- header
  const title = song.title || 'Untitled tab';
  if (fancy) {
    const SIZE = 56;
    const [first, ...rest] = [...title];
    illuminatedInitial(M, y + 6, SIZE, first.toUpperCase());
    const tx = M + SIZE + 14;
    let ty = y - 20;
    const lines = wrapHelv(rest.join('') || ' ', 24, usableW - SIZE - 20);
    lines.forEach((t, i) => {
      text(tx, ty, F.bold, 24, t, INK);
      if (i < lines.length - 1) ty -= 26;
    });
    if (song.artist) {
      ty -= 17;
      text(tx, ty, F.italic, 13, song.artist, RED);
    }
    ty -= 14;
    text(tx, ty, F.body, 9.5, metaLine(song), 0.38);
    y = Math.min(ty, y + 6 - SIZE) - 14;
    ops.push(`${rgb(RED, 'RG')} 0.8 w ${num(M)} ${num(y)} m ${num(W - M)} ${num(y)} l S`);
    ops.push(`${rgb(RED, 'RG')} 0.4 w ${num(M)} ${num(y - 2.5)} m ${num(W - M)} ${num(y - 2.5)} l S`);
    y -= 18;
  } else {
    for (const t of wrapHelv(title, 22, usableW * 0.9)) {
      y -= 22;
      text(M, y, F.bold, 22, t);
      y -= 4;
    }
    if (song.artist) {
      y -= 14;
      text(M, y, F.body, 13, song.artist, 0.25);
    }
    y -= 16;
    text(M, y, F.body, 9.5, metaLine(song), 0.4);
    y -= 10;
    ops.push(`0.8 G 0.6 w ${num(M)} ${num(y)} m ${num(W - M)} ${num(y)} l S`);
    y -= 16;
  }

  // ---------- sections
  song.sections.forEach((sec, si) => {
    const systems = layoutSection(sec, song.tuning, maxChars, { rhythm: !!song.rhythm });
    const sysHeight = (s) => (s.label ? LEAD : 0) + (s.rhythm ? LEAD : 0) + s.lines.length * LEAD + 10;
    // Keep the heading with the first row of tab.
    ensure(26 + (systems.length ? sysHeight(systems[0]) : 14));
    y -= 14;
    if (fancy) {
      // Rubric: a pilcrow alternating lapis / vermilion, then the name in red.
      const mark = '¶ ';
      text(M, y, F.bold, 13.5, mark, si % 2 ? RED : LAPIS);
      text(M + width(mark, 13.5) + 1, y, F.bold, 13.5, sec.name, RED);
    } else {
      text(M, y, F.bold, 12, sec.name);
    }
    y -= 10;
    for (const sys of systems) {
      ensure(sysHeight(sys));
      if (sys.label) {
        y -= LEAD;
        text(M, y, 'F4', TAB_SIZE, sys.label, fancy ? RED : 0.15);
      }
      for (const line of sys.lines) {
        y -= LEAD;
        text(M, y, 'F3', TAB_SIZE, line, fancy ? INK : 0);
      }
      if (sys.rhythm) {
        y -= LEAD;
        text(M, y, 'F4', TAB_SIZE, sys.rhythm, fancy ? LAPIS : 0.35);
      }
      y -= 10;
    }
    if (sec.notes) {
      for (const line of wrapHelv(sec.notes, 10.5, usableW)) {
        ensure(13);
        y -= 13;
        if (line) text(M, y, F.italic, fancy ? 10.5 : 10, line, fancy ? INK : 0.2);
      }
      y -= 6;
    }
    y -= 8;
  });

  // ---------- legend
  const legend = usedLegend(song);
  if (legend.length) {
    const legendLines = legend.flatMap((l) => wrapWords(l, Math.floor(usableW / (8.5 * 0.6))));
    ensure(20 + legendLines.length * 12);
    y -= 12;
    text(M, y, F.bold, 9, 'Legend', fancy ? RED : 0.35);
    for (const l of legendLines) {
      y -= 12;
      text(M, y, 'F3', 8.5, l, 0.35);
    }
  }

  // ---------- colophon
  if (fancy) {
    ensure(34);
    y -= 26;
    const end = 'Here endeth the tab';
    const w = width(end, 11);
    diamond(W / 2 - w / 2 - 12, y + 3.5, 3, GOLD);
    text(W / 2 - w / 2, y, F.italic, 11, end, RED);
    diamond(W / 2 + w / 2 + 12, y + 3.5, 3, GOLD);
  }

  // ---------- footers
  const footLeft = [title, song.artist].filter(Boolean).join(' — ');
  const footY = fancy ? 38 : 30;
  pages.forEach((pg, i) => {
    ops = pg;
    const font = fancy ? F.italic : F.body;
    const color = fancy ? [0.45, 0.33, 0.22] : 0.55;
    text(M, footY, font, 8.5, footLeft, color);
    const right = fancy ? `folio ${i + 1} of ${pages.length}` : `Page ${i + 1} of ${pages.length}`;
    text(W - M - width(right, 8.5), footY, font, 8.5, right, color);
  });

  return writePdf(pages, W, H, title);
}

function writePdf(pages, W, H, title) {
  const objects = []; // index i => object number i+1
  const add = (body) => {
    objects.push(body);
    return objects.length;
  };
  const catalog = add(null);
  const pagesObj = add(null);
  const fonts = ['Helvetica', 'Helvetica-Bold', 'Courier', 'Courier-Bold', 'Helvetica-Oblique', 'Times-Roman', 'Times-Bold', 'Times-Italic'].map((f) =>
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
