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
  try {
    localStorage.removeItem(SESSION_PREFIX + id);
  } catch {
    /* ignore */
  }
}

// Per-tab editing session: cursor, undo/redo history, scroll positions.
const SESSION_PREFIX = 'guitarmageddon.session.v1.';
const HISTORY_KEEP = 60;
const SESSION_BUDGET = 1_500_000; // characters; history is trimmed to stay under this

export function loadSession(id) {
  return read(SESSION_PREFIX + id, null);
}

export function saveSession(id, session) {
  const s = { ...session, undo: (session.undo || []).slice(-HISTORY_KEEP), redo: (session.redo || []).slice(-HISTORY_KEEP) };
  // Keep the newest history that fits the budget, then fall back to dropping it.
  while (JSON.stringify(s).length > SESSION_BUDGET && (s.undo.length || s.redo.length)) {
    if (s.undo.length >= s.redo.length) s.undo.shift();
    else s.redo.shift();
  }
  if (write(SESSION_PREFIX + id, s)) return true;
  return write(SESSION_PREFIX + id, { ...s, undo: [], redo: [] });
}

/** Ask the browser not to evict our data when the device is low on space. */
export function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  } catch {
    /* unsupported */
  }
}

export function loadPrefs() {
  return Object.assign({ panel: 'fretboard', mode: 'melody', sound: true, collapsed: false, pageSize: 'a4', txtWidth: 80, lastSong: null }, read(PREFS_KEY, {}));
}

export function savePrefs(prefs) {
  write(PREFS_KEY, prefs);
}
