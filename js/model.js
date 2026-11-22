import { STANDARD } from './tunings.js';

export const MAX_FRET = 24;
export const DEFAULT_SECTION_LENGTH = 16;

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function emptyColumn(strings) {
  return { type: 'note', cells: Array(strings).fill(''), label: '' };
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
          }
    ),
  }));
  if (!song.sections.length) song.sections.push(createSection('Intro', n));
  return song;
}
