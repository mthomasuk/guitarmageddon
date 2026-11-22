import { isEmptyNote, DEFAULT_DUR } from './model.js';

// Rhythm letters (a common ASCII-tab convention); lowercase marks a rest.
export const RHYTHM_LETTERS = { 1: 'W', 2: 'H', 4: 'Q', 8: 'E', 16: 'S', 32: 'T' };
// Dashes after each note when spacing is proportional to note length.
const RHYTHM_GAP = { 1: 9, 2: 5, 4: 3, 8: 2, 16: 1, 32: 1 };

function gapFor(col) {
  const g = RHYTHM_GAP[col.dur || DEFAULT_DUR] || 2;
  return col.dot ? Math.round(g * 1.5) : g;
}

export function rhythmMark(col) {
  const letter = RHYTHM_LETTERS[col.dur || DEFAULT_DUR] || 'E';
  const empty = col.cells.every((c) => c === '');
  return (empty ? letter.toLowerCase() : letter) + (col.dot ? '.' : '');
}
import { stringLabels, tuningText, tuningName } from './tunings.js';

const LEGEND = [
  [/\d[h]/, 'h  hammer-on'],
  [/\d[p]/, 'p  pull-off'],
  [/\//, '/  slide up'],
  [/\\/, '\\  slide down'],
  [/b/, 'b  bend'],
  [/r/, 'r  release bend'],
  [/~/, '~  vibrato'],
  [/x/, 'x  muted / dead note'],
  [/</, '<n>  natural harmonic'],
  [/\(/, '(n)  ghost note'],
];

/** Trim trailing empty columns; returns the usable columns. */
function usedColumns(section) {
  const cols = section.columns;
  let end = cols.length;
  while (end > 0 && isEmptyNote(cols[end - 1])) end--;
  return cols.slice(0, end);
}

/**
 * Lay a section out into "systems" (wrapped rows of tab) no wider than maxChars.
 * Returns [{ label: string|null, lines: string[] }] with lines ordered high string -> low.
 */
export function layoutSection(section, tuning, maxChars = 80, { rhythm = false } = {}) {
  const cols = usedColumns(section);
  if (!cols.length) return [];
  const labels = stringLabels(tuning);
  const prefixW = labels[0].length + 1; // "e|"
  const avail = Math.max(8, maxChars - prefixW - 2); // leading "-" and closing "|"

  const tokens = cols.map((c) =>
    c.type === 'bar'
      ? { bar: true, w: 2 }
      : (() => {
          const cw = Math.max(1, ...c.cells.map((s) => s.length));
          const gap = rhythm ? gapFor(c) : 1;
          return { bar: false, col: c, cw: cw + gap - 1, w: cw + gap };
        })()
  );

  const systems = [];
  let start = 0;
  while (start < tokens.length) {
    // A bar at the very start of a row is redundant with the "e|" prefix.
    while (start < tokens.length && tokens[start].bar) start++;
    if (start >= tokens.length) break;
    let width = 0;
    let i = start;
    let lastBar = -1;
    while (i < tokens.length) {
      const tw = tokens[i].w;
      if (width + tw > avail && i > start) break;
      width += tw;
      if (tokens[i].bar) lastBar = i;
      i++;
    }
    let end = i;
    // Prefer breaking right after a bar line, if that doesn't waste most of the row.
    if (i < tokens.length && !tokens[i].bar && lastBar > start && lastBar - start >= (i - start) * 0.5) {
      end = lastBar + 1;
    }
    // A bar right after the break belongs at the end of this row (it takes the closing "|" slot).
    if (end < tokens.length && tokens[end].bar) end++;
    systems.push(buildSystem(tokens.slice(start, end), labels, prefixW, tuning.length, rhythm));
    start = end;
  }
  return systems;
}

function buildSystem(toks, labels, prefixW, n, rhythm) {
  const endsWithBar = toks[toks.length - 1].bar;
  const offsets = [];
  let pos = prefixW + 1;
  toks.forEach((t, k) => {
    offsets.push(pos);
    pos += t.bar && k === toks.length - 1 ? 1 : t.w;
  });

  const lines = [];
  for (let s = n - 1; s >= 0; s--) {
    let line = labels[s] + '|-';
    toks.forEach((t, k) => {
      if (t.bar) line += k === toks.length - 1 ? '|' : '|-';
      else line += t.col.cells[s].padEnd(t.cw, '-') + '-';
    });
    if (!endsWithBar) line += '|';
    lines.push(line);
  }

  let label = null;
  if (toks.some((t) => !t.bar && t.col.label)) {
    const chars = [];
    let lastEnd = -1;
    toks.forEach((t, k) => {
      if (t.bar || !t.col.label) return;
      const at = Math.max(offsets[k], lastEnd + 1);
      for (let j = 0; j < t.col.label.length; j++) chars[at + j] = t.col.label[j];
      lastEnd = at + t.col.label.length;
    });
    label = Array.from(chars, (c) => c || ' ').join('').trimEnd();
  }

  let rhythmLine = null;
  if (rhythm) {
    const chars = Array(lines[0].length).fill(' ');
    toks.forEach((t, k) => {
      if (t.bar) return;
      const mark = rhythmMark(t.col);
      for (let j = 0; j < mark.length; j++) chars[offsets[k] + j] = mark[j];
    });
    rhythmLine = chars.join('').trimEnd();
  }
  return { label, lines, rhythm: rhythmLine };
}

export function wrapWords(text, width) {
  const out = [];
  for (const para of String(text).split('\n')) {
    if (!para.trim()) {
      out.push('');
      continue;
    }
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      if (!line) line = word;
      else if ((line + ' ' + word).length <= width) line += ' ' + word;
      else {
        out.push(line);
        line = word;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

export function metaLine(song) {
  const name = tuningName(song.tuning);
  const parts = [`Tuning: ${tuningText(song.tuning)}${name !== 'Standard' && name !== 'Custom' ? ` (${name})` : ''}`];
  if (Number(song.capo) > 0) parts.push(`Capo: fret ${song.capo}`);
  if (Number(song.tempo) > 0) parts.push(`Tempo: ${song.tempo} BPM`);
  return parts.join('  |  ');
}

/** Legend entries for the techniques that actually appear in the song. */
export function usedLegend(song) {
  const all = song.sections
    .flatMap((s) => s.columns)
    .filter((c) => c.type === 'note')
    .flatMap((c) => c.cells)
    .join(' ');
  const out = LEGEND.filter(([re]) => re.test(all)).map(([, text]) => text);
  if (song.rhythm) out.push('Rhythm (under the tab): W whole, H half, Q quarter, E eighth, S 16th, T 32nd, . dotted, lowercase = rest');
  return out;
}

export function songToText(song, { width = 80 } = {}) {
  const out = [];
  const title = song.title || 'Untitled tab';
  out.push(title);
  out.push('='.repeat(Math.min(width, title.length)));
  if (song.artist) out.push(`by ${song.artist}`);
  out.push(metaLine(song));
  out.push('');

  for (const sec of song.sections) {
    out.push(`[${sec.name}]`);
    const systems = layoutSection(sec, song.tuning, width, { rhythm: !!song.rhythm });
    systems.forEach((sys, i) => {
      if (sys.label) out.push(sys.label);
      out.push(...sys.lines);
      if (sys.rhythm) out.push(sys.rhythm);
      if (i < systems.length - 1) out.push('');
    });
    if (sec.notes) {
      if (systems.length) out.push('');
      out.push(...wrapWords(sec.notes, width));
    }
    out.push('');
  }

  const legend = usedLegend(song);
  if (legend.length) {
    out.push('Legend');
    out.push(...legend.map((l) => '  ' + l));
    out.push('');
  }
  return out.join('\n');
}
