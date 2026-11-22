// Plucked-string synth (Karplus-Strong), rendered into cached AudioBuffers.
import { cellFret, columnBeats } from './model.js';
import { noteToMidi } from './tunings.js';

let ctx = null;
let master = null;
const cache = new Map();
let active = [];

export function audioContext() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.6;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function pluckBuffer(midi) {
  if (cache.has(midi)) return cache.get(midi);
  const sr = ctx.sampleRate;
  const freq = 440 * 2 ** ((midi - 69) / 12);
  const len = Math.floor(sr * 2.2);
  const period = Math.max(2, Math.round(sr / freq));
  const buf = ctx.createBuffer(1, len, sr);
  const out = buf.getChannelData(0);
  const ring = new Float32Array(period);
  // Slightly low-passed noise burst = warmer pick attack
  let prev = 0;
  for (let i = 0; i < period; i++) {
    const r = Math.random() * 2 - 1;
    prev = prev * 0.5 + r * 0.5;
    ring[i] = prev;
  }
  // Higher notes ring shorter; lower decay factor for bass keeps it from mudding up
  const decay = 0.996 - Math.min(0.006, Math.max(0, (midi - 40) * 0.00006));
  let idx = 0;
  const fade = Math.floor(sr * 0.15);
  for (let i = 0; i < len; i++) {
    const a = ring[idx];
    const b = ring[(idx + 1) % period];
    out[i] = a;
    ring[idx] = decay * 0.5 * (a + b);
    idx = (idx + 1) % period;
    if (i > len - fade) out[i] *= (len - i) / fade;
  }
  cache.set(midi, buf);
  return buf;
}

export function playMidi(midi, when = 0, gain = 0.8) {
  const c = audioContext();
  if (!c || midi == null) return;
  const src = c.createBufferSource();
  src.buffer = pluckBuffer(midi);
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(g).connect(master);
  src.start(when || c.currentTime);
  active.push(src);
  src.onended = () => {
    active = active.filter((s) => s !== src);
  };
}

export function midiFor(song, str, cell) {
  const fret = cellFret(cell);
  if (fret == null) return null;
  const open = noteToMidi(song.tuning[str]);
  if (open == null) return null;
  return open + Number(song.capo || 0) + fret;
}

/** Play one tab column (a chord is strummed slightly, low to high). */
export function playColumn(song, col, when = 0) {
  if (!col || col.type !== 'note') return;
  const c = audioContext();
  if (!c) return;
  const t0 = when || c.currentTime;
  let k = 0;
  col.cells.forEach((cell, str) => {
    const midi = midiFor(song, str, cell);
    if (midi != null) playMidi(midi, t0 + k++ * 0.012, 0.6);
  });
}

let timers = [];

/**
 * Play from a position to the end of the song, following each column's note length.
 * onStep(sec, col) is called as each column sounds; onDone when finished.
 */
export function playSong(song, from, { onStep, onDone } = {}) {
  stopSong();
  const c = audioContext();
  if (!c) return;
  const beat = 60 / (Number(song.tempo) || 100);
  let t = 0.08;
  const start = c.currentTime;
  for (let s = from.sec; s < song.sections.length; s++) {
    const cols = song.sections[s].columns;
    let last = cols.length;
    while (last > 0 && cols[last - 1].type === 'note' && cols[last - 1].cells.every((v) => !v)) last--;
    for (let i = s === from.sec ? from.col : 0; i < last; i++) {
      const col = cols[i];
      if (col.type === 'bar') continue;
      playColumn(song, col, start + t);
      const at = t;
      const sec = s;
      timers.push(setTimeout(() => onStep && onStep(sec, i), at * 1000));
      t += columnBeats(col) * beat;
    }
  }
  timers.push(setTimeout(() => onDone && onDone(), t * 1000 + 150));
}

export function stopSong() {
  timers.forEach(clearTimeout);
  timers = [];
  active.forEach((s) => {
    try {
      s.stop();
    } catch {
      /* already stopped */
    }
  });
  active = [];
}
