// Tunings are stored low string -> high string, with octave numbers
// (octaves are only used for audio playback).

export const TUNINGS = [
  { name: 'Standard', notes: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'] },
  { name: 'Drop D', notes: ['D2', 'A2', 'D3', 'G3', 'B3', 'E4'] },
  { name: 'Half step down', notes: ['Eb2', 'Ab2', 'Db3', 'Gb3', 'Bb3', 'Eb4'] },
  { name: 'D standard', notes: ['D2', 'G2', 'C3', 'F3', 'A3', 'D4'] },
  { name: 'Drop C', notes: ['C2', 'G2', 'C3', 'F3', 'A3', 'D4'] },
  { name: 'DADGAD', notes: ['D2', 'A2', 'D3', 'G3', 'A3', 'D4'] },
  { name: 'Open G', notes: ['D2', 'G2', 'D3', 'G3', 'B3', 'D4'] },
  { name: 'Open D', notes: ['D2', 'A2', 'D3', 'F#3', 'A3', 'D4'] },
  { name: 'Open E', notes: ['E2', 'B2', 'E3', 'G#3', 'B3', 'E4'] },
  { name: '7-string', notes: ['B1', 'E2', 'A2', 'D3', 'G3', 'B3', 'E4'] },
  { name: 'Bass (4-string)', notes: ['E1', 'A1', 'D2', 'G2'] },
  { name: 'Bass (5-string)', notes: ['B0', 'E1', 'A1', 'D2', 'G2'] },
];

export const STANDARD = TUNINGS[0].notes;

const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const NOTE_RE = /^([A-Ga-g])([#b]?)(-?\d)?$/;

export function noteToMidi(note) {
  const m = NOTE_RE.exec(note);
  if (!m || m[3] === undefined) return null;
  const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  return (Number(m[3]) + 1) * 12 + SEMI[m[1].toUpperCase()] + acc;
}

export function noteName(note) {
  const m = NOTE_RE.exec(note);
  if (!m) return note;
  return m[1].toUpperCase() + m[2];
}

const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

export function midiToNote(midi) {
  return NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
}

/** Shift a note like "E2" by some semitones. */
export function shiftNote(note, semis) {
  return midiToNote(noteToMidi(note) + semis);
}

/** Same pitches, regardless of spelling (D#3 == Eb3). */
export function sameTuning(a, b) {
  return a.length === b.length && a.every((n, i) => noteToMidi(n) === noteToMidi(b[i]));
}

export function tuningName(notes) {
  const t = TUNINGS.find((t) => sameTuning(t.notes, notes));
  return t ? t.name : 'Custom';
}

export function tuningText(notes) {
  return notes.map(noteName).join(' ');
}

/**
 * Parse user text like "D A D G B E" or "B1 E2 A2 D3 G3 B3 E4".
 * Notes without octaves get ascending octaves assigned. Returns null if invalid.
 */
export function parseTuning(text) {
  const tokens = String(text).trim().split(/[\s,]+/).filter(Boolean);
  if (tokens.length < 4 || tokens.length > 8) return null;
  const out = [];
  let prev = null;
  let octave = tokens.length === 6 ? 2 : 1;
  for (const tok of tokens) {
    const m = NOTE_RE.exec(tok);
    if (!m) return null;
    const name = m[1].toUpperCase() + m[2];
    if (m[3] !== undefined) {
      out.push(name + m[3]);
      prev = noteToMidi(name + m[3]);
      octave = Number(m[3]);
      continue;
    }
    let midi = noteToMidi(name + octave);
    while (prev !== null && midi <= prev) {
      octave += 1;
      midi = noteToMidi(name + octave);
    }
    out.push(name + octave);
    prev = midi;
  }
  return out;
}

/** String labels low -> high, padded to equal width. High string lowercased if it repeats. */
export function stringLabels(notes) {
  const names = notes.map(noteName);
  const top = names.length - 1;
  if (names.slice(0, top).includes(names[top])) names[top] = names[top].toLowerCase();
  const w = Math.max(...names.map((n) => n.length));
  return names.map((n) => n.padEnd(w, ' '));
}
