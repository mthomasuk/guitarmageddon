import { normalizeSong } from './model.js';

const SONGS_KEY = 'guitarmageddon.songs.v1';
const PREFS_KEY = 'guitarmageddon.prefs.v1';

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function listSongs() {
  const all = read(SONGS_KEY, {});
  return Object.values(all)
    .map(normalizeSong)
    .sort((a, b) => b.updated - a.updated);
}

export function getSong(id) {
  const all = read(SONGS_KEY, {});
  return all[id] ? normalizeSong(all[id]) : null;
}

export function saveSong(song) {
  const all = read(SONGS_KEY, {});
  all[song.id] = song;
  return write(SONGS_KEY, all);
}

export function deleteSong(id) {
  const all = read(SONGS_KEY, {});
  delete all[id];
  write(SONGS_KEY, all);
}

export function loadPrefs() {
  return Object.assign({ panel: 'fretboard', mode: 'melody', sound: true, collapsed: false, pageSize: 'a4', txtWidth: 80, lastSong: null }, read(PREFS_KEY, {}));
}

export function savePrefs(prefs) {
  write(PREFS_KEY, prefs);
}
