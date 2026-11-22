import { STANDARD, noteToMidi } from './tunings.js';

export const MAX_FRET = 24;
export const DEFAULT_SECTION_LENGTH = 16;

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

/** Note lengths: 1 = whole, 2 = half, 4 = quarter, 8 = eighth, 16 = sixteenth, 32 = thirty-second. */
export const DURATIONS = [1, 2, 4, 8, 16, 32];
export const DEFAULT_DUR = 8;

export function emptyColumn(strings, dur = DEFAULT_DUR, dot = false) {
  const col = { type: 'note', cells: Array(strings).fill(''), label: '', dur };
  if (dot) col.dot = true;
  return col;
}

/** Length of a column in quarter-note beats (bars take no time). */
export function columnBeats(col) {
  if (col.type !== 'note') return 0;
  return (4 / (col.dur || DEFAULT_DUR)) * (col.dot ? 1.5 : 1);
}

/** Fit a column copied from a tab with a different number of strings (low strings added/dropped). */
export function fitColumn(col, strings) {
  if (col.type !== 'note' || col.cells.length === strings) return col;
  const n = col.cells.length;
  col.cells = strings > n ? [...Array(strings - n).fill(''), ...col.cells] : col.cells.slice(n - strings);
  return col;
}

export function barColumn() {
  return { type: 'bar' };
}

export function isEmptyNote(col) {
  return col.type === 'note' && !col.label && col.cells.every((c) => c === '');
}

export function createSection(name, strings, length = DEFAULT_SECTION_LENGTH) {
  return {
    id: uid(),
    name,
    notes: '',
    columns: Array.from({ length }, () => emptyColumn(strings)),
  };
}

export function createSong(opts = {}) {
  const tuning = opts.tuning || STANDARD.slice();
  const now = Date.now();
  return {
    id: uid(),
    title: opts.title || 'Untitled tab',
    artist: opts.artist || '',
    tuning,
    capo: 0,
    tempo: 100,
    rhythm: false, // show note lengths in the tab and exports
    sections: [createSection('Intro', tuning.length)],
    created: now,
    updated: now,
  };
}

export function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/** Change tuning, adding/removing strings (low strings are added/removed). */
export function applyTuning(song, notes) {
  const oldN = song.tuning.length;
  const newN = notes.length;
  song.tuning = notes.slice();
  if (oldN === newN) return;
  for (const sec of song.sections) {
    for (const col of sec.columns) {
      if (col.type !== 'note') continue;
      if (newN > oldN) col.cells = [...Array(newN - oldN).fill(''), ...col.cells];
      else col.cells = col.cells.slice(oldN - newN);
    }
  }
}

/** First fret number found in a cell ("5h7" -> 5, "<12>" -> 12, "x" -> null). */
export function cellFret(cell) {
  const m = /\d+/.exec(cell || '');
  return m ? Number(m[0]) : null;
}

/** Make sure a loaded song has every field we expect (forward compatibility). */
export function normalizeSong(raw) {
  const song = Object.assign(createSong(), raw);
  const n = song.tuning.length;
  song.sections = (song.sections || []).map((s) => ({
    id: s.id || uid(),
    name: s.name || 'Section',
    notes: s.notes || '',
    columns: (s.columns || []).map((c) =>
      c.type === 'bar'
        ? barColumn()
        : {
            type: 'note',
            label: c.label || '',
            cells: Array.from({ length: n }, (_, i) => String((c.cells || [])[i] ?? '')),
            dur: DURATIONS.includes(c.dur) ? c.dur : DEFAULT_DUR,
            ...(c.dot ? { dot: true } : {}),
          }
    ),
  }));
  if (!song.sections.length) song.sections.push(createSection('Intro', n));
  song.rhythm = !!song.rhythm;
  return song;
}

/**
 * Move fret numbers so every note keeps sounding the same after a retune
 * (same string count only). Cells that would go below 0 or above MAX_FRET are
 * left as they were; returns how many cells that happened to.
 */
export function transposeForTuning(song, newNotes) {
  if (newNotes.length !== song.tuning.length) return 0;
  const deltas = newNotes.map((n, i) => noteToMidi(n) - noteToMidi(song.tuning[i]));
  let skipped = 0;
  for (const sec of song.sections) {
    for (const col of sec.columns) {
      if (col.type !== 'note') continue;
      col.cells = col.cells.map((cell, i) => {
        if (!deltas[i] || !/\d/.test(cell)) return cell;
        let ok = true;
        const moved = cell.replace(/\d+/g, (n) => {
          const f = Number(n) - deltas[i];
          if (f < 0 || f > MAX_FRET) ok = false;
          return String(f);
        });
        if (!ok) skipped++;
        return ok ? moved : cell;
      });
    }
  }
  return skipped;
}
