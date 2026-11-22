import { createSong, cellFret, clone, uid, applyTuning, transposeForTuning, MAX_FRET } from './model.js';
import { Editor, JOIN_TECHNIQUES } from './editor.js';
import { TUNINGS, stringLabels, tuningName, tuningText, parseTuning, noteName, noteToMidi, shiftNote, sameTuning } from './tunings.js';
import { CHORD_GROUPS, fitShape } from './chords.js';
import { songToText } from './tabtext.js';
import { songToPdf } from './pdf.js';
import * as store from './storage.js';
import { playColumn, playMidi, midiFor, playSong, stopSong, audioContext } from './audio.js';

// ---------------------------------------------------------------- helpers
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) node.append(c instanceof Node ? c : String(c));
  return node;
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

function buzz() {
  if (navigator.vibrate) navigator.vibrate(6);
}

const prefs = store.loadPrefs();
if (!prefs.pageSizeChosen) prefs.pageSize = /^en-(US|CA)|es-(MX|US)/.test(navigator.language || '') ? 'letter' : 'a4';
const savePrefs = () => store.savePrefs(prefs);

// ---------------------------------------------------------------- dialogs
/**
 * Generic modal (bottom sheet on phones). Resolves with the clicked button's value
 * (or 'cancel'). The dialog's inputs are still readable after resolving.
 */
function modal({ title, content = [], buttons = [{ label: 'Done', value: 'ok', kind: 'primary' }], className = '' }) {
  return new Promise((resolve) => {
    const d = h('dialog', { class: `modal ${className}` });
    const form = h('form', { method: 'dialog' });
    const parts = [
      h('div', { class: 'modal-head' }, h('h3', {}, title), h('button', { type: 'button', class: 'icon-btn small', 'aria-label': 'Close', onclick: () => d.close('cancel') }, '✕')),
      h('div', { class: 'modal-body' }, content),
      buttons.length
        ? h(
            'div',
            { class: 'modal-foot' },
            buttons.map((b) =>
              b.value === 'cancel'
                ? h('button', { type: 'button', class: `btn ${b.kind || ''}`, onclick: () => d.close('cancel') }, b.label)
                : h('button', { class: `btn ${b.kind || ''}`, value: b.value }, b.label)
            )
          )
        : null,
    ];
    form.append(...parts.filter(Boolean));
    d.append(form);
    d.addEventListener('click', (e) => {
      if (e.target === d) d.close('cancel');
    });
    d.addEventListener('close', () => {
      resolve({ value: d.returnValue || 'cancel', dialog: d });
      d.remove();
    });
    document.body.append(d);
    d.showModal();
    const first = d.querySelector('[autofocus]');
    if (first) setTimeout(() => first.focus(), 50);
  });
}

async function promptText(title, value = '', { multiline = false, placeholder = '', chips = [] } = {}) {
  const input = multiline
    ? h('textarea', { rows: 5, placeholder, autofocus: true })
    : h('input', { type: 'text', placeholder, autofocus: true, enterkeyhint: 'done', autocomplete: 'off' });
  input.value = value;
  const content = [input];
  if (chips.length) {
    content.unshift(
      h(
        'div',
        { class: 'chips' },
        chips.map((c) =>
          h('button', { type: 'button', class: 'chip', onclick: () => { input.value = c; input.closest('form').requestSubmit(input.closest('form').querySelector('[value=ok]')); } }, c)
        )
      )
    );
  }
  const { value: v } = await modal({
    title,
    content,
    buttons: [
      { label: 'Cancel', value: 'cancel' },
      { label: 'Save', value: 'ok', kind: 'primary' },
    ],
  });
  return v === 'ok' ? input.value : null;
}

async function actionSheet(title, actions) {
  const content = h(
    'div',
    { class: 'action-list' },
    actions.map((a) => h('button', { class: `action-item ${a.danger ? 'danger' : ''}`, value: a.value, disabled: a.disabled }, a.label))
  );
  const { value } = await modal({ title, content, buttons: [], className: 'actions' });
  return value === 'cancel' ? null : value;
}

async function confirmDanger(title, message, label = 'Delete') {
  const { value } = await modal({
    title,
    content: [h('p', {}, message)],
    buttons: [
      { label: 'Cancel', value: 'cancel' },
      { label, value: 'ok', kind: 'danger' },
    ],
  });
  return value === 'ok';
}

function showHelp() {
  const li = (b, t) => h('li', {}, h('b', {}, b), ' ', t);
  modal({
    title: 'How it works',
    className: 'help',
    content: [
      h(
        'ol',
        { class: 'help-list' },
        li('Tap the fretboard', 'where your finger would go. The note appears in the tab and you hear it.'),
        li('Notes →', 'mode moves along after each note. Switch to Chord ⇅ to stack several strings in one column.'),
        li('Techniques:', 'tap a note, then h, p, /, \\, b or r, then the next fret: you get 5h7, 7b9, 5/7…'),
        li('Tap any spot in the tab', 'to select it. ⌫ clears it, | adds a bar line, → adds space.'),
        li('Chords', 'tab drops in a full shape with its name above it.'),
        li('Tuning:', 'tap the string names at the start of the tab to retune string by string, or pick Drop D, DADGAD and more.'),
        li('Export', 'gives you a printable PDF or a plain-text .txt. Everything saves on this device as you go, and reopens where you left off.')
      ),
      h('p', { class: 'muted small' }, 'Keyboard: digits enter frets (type 1 then 2 for 12), arrows move, Space = next, | = bar, h/p/b/r/~ techniques, ⌘/Ctrl+Z undo.'),
    ],
    buttons: [{ label: "Let's go", value: 'ok', kind: 'primary' }],
  });
}

// ---------------------------------------------------------------- state
let editor = null;
let playing = null; // {sec, col} while playing
let saveTimer = null;
let renderQueued = false;
let lastCursorKey = '';
let builtFor = '';

let songDirty = false;

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 300);
}
/** Write the tab (if it changed) and the editing session to localStorage. */
function flushSave() {
  clearTimeout(saveTimer);
  if (!editor) return;
  if (songDirty) {
    if (store.saveSong(editor.song)) songDirty = false;
    else toast('Could not save — storage is full');
  }
  store.saveSession(editor.song.id, {
    cursor: editor.cursor,
    undo: editor.undoStack,
    redo: editor.redoStack,
    sheetScroll: $('#sheet').scrollTop,
    fretScroll: $('#panel-fretboard .fretboard')?.scrollLeft || 0,
  });
}
document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flushSave());
window.addEventListener('pagehide', flushSave);

function onEditorChange({ content }) {
  if (content) songDirty = true;
  scheduleSave();
  scheduleRender();
}

function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    renderEditor();
  });
}

// ---------------------------------------------------------------- routing
function route() {
  const m = /^#\/tab\/(.+)$/.exec(location.hash);
  if (m) {
    const song = editor && editor.song.id === m[1] ? editor.song : store.getSong(m[1]);
    if (song) return openEditor(song);
  }
  closeEditor();
}
window.addEventListener('hashchange', route);

function openEditor(song) {
  let session = null;
  if (!editor || editor.song.id !== song.id) {
    stopPlayback();
    flushSave();
    editor = new Editor(song, { onChange: onEditorChange });
    editor.mode = prefs.mode;
    songDirty = false;
    session = store.loadSession(song.id);
    if (session) {
      if (session.cursor) editor.cursor = { ...editor.cursor, ...session.cursor };
      editor.undoStack = Array.isArray(session.undo) ? session.undo : [];
      editor.redoStack = Array.isArray(session.redo) ? session.redo : [];
      editor.clampCursor();
    }
    builtFor = '';
    lastCursorKey = `${editor.cursor.sec}:${editor.cursor.col}:${editor.cursor.str}`;
  }
  prefs.lastSong = song.id;
  prefs.lastView = 'editor';
  savePrefs();
  $('#library-view').hidden = true;
  $('#editor-view').hidden = false;
  document.body.classList.add('editing');
  renderEditor();
  if (session) {
    $('#sheet').scrollTop = session.sheetScroll || 0;
    const fbEl = $('#panel-fretboard .fretboard');
    if (fbEl) fbEl.scrollLeft = session.fretScroll || 0;
  } else if (session === null && lastCursorKey === '0:0:' + (song.tuning.length - 1)) {
    $('#sheet').scrollTop = 0;
  }
  if (!prefs.seenHelp) {
    prefs.seenHelp = true;
    savePrefs();
    showHelp();
  }
}

function closeEditor() {
  stopPlayback();
  flushSave();
  if (editor) {
    prefs.lastView = 'library';
    savePrefs();
  }
  editor = null;
  $('#editor-view').hidden = true;
  $('#library-view').hidden = false;
  document.body.classList.remove('editing');
  renderLibrary();
}

// ---------------------------------------------------------------- library
function relTime(t) {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function renderLibrary() {
  const songs = store.listSongs();
  const list = $('#song-list');
  list.innerHTML = '';
  $('#empty-library').hidden = songs.length > 0;
  $('#list-title').hidden = songs.length === 0;
  for (const s of songs) {
    const notes = s.sections.reduce((n, sec) => n + sec.columns.filter((c) => c.type === 'note' && c.cells.some(Boolean)).length, 0);
    list.append(
      h(
        'li',
        { class: 'song-item' },
        h(
          'button',
          { class: 'song-open', onclick: () => (location.hash = `#/tab/${s.id}`) },
          h('span', { class: 'song-title' }, s.title || 'Untitled tab'),
          h('span', { class: 'song-sub' }, [s.artist, tuningName(s.tuning), `${notes} note${notes === 1 ? '' : 's'}`, relTime(s.updated)].filter(Boolean).join(' · '))
        ),
        h('button', { class: 'icon-btn', 'aria-label': `Options for ${s.title}`, onclick: () => songMenu(s) }, '⋯')
      )
    );
  }
}

async function songMenu(song) {
  const a = await actionSheet(song.title || 'Untitled tab', [
    { label: 'Open', value: 'open' },
    { label: 'Export PDF / TXT…', value: 'export' },
    { label: 'Duplicate', value: 'dup' },
    { label: 'Delete', value: 'del', danger: true },
  ]);
  if (a === 'open') location.hash = `#/tab/${song.id}`;
  if (a === 'export') exportDialog(song);
  if (a === 'dup') {
    const copy = clone(song);
    copy.id = uid();
    copy.title = `${song.title} (copy)`;
    copy.created = copy.updated = Date.now();
    store.saveSong(copy);
    renderLibrary();
    toast('Duplicated');
  }
  if (a === 'del' && (await confirmDanger('Delete tab?', `“${song.title}” will be removed from this device.`))) {
    store.deleteSong(song.id);
    renderLibrary();
    toast('Deleted');
  }
}

$('#btn-new').addEventListener('click', async () => {
  const song = createSong();
  const ok = await songInfoDialog(song, true);
  if (!ok) return;
  store.saveSong(song);
  location.hash = `#/tab/${song.id}`;
});
$('#btn-help-lib').addEventListener('click', showHelp);

// ---------------------------------------------------------------- song info
async function songInfoDialog(song, isNew = false) {
  const title = h('input', { type: 'text', value: isNew ? '' : song.title, placeholder: 'Song title', autofocus: true, autocomplete: 'off' });
  const artist = h('input', { type: 'text', value: song.artist, placeholder: 'Artist (optional)', autocomplete: 'off' });
  const tuningSel = h('select', {}, TUNINGS.map((t) => h('option', { value: t.name }, `${t.name} — ${tuningText(t.notes)}`)), h('option', { value: 'Custom' }, 'Custom…'));
  tuningSel.value = tuningName(song.tuning);
  const custom = h('input', { type: 'text', value: tuningText(song.tuning), placeholder: 'e.g. D A D G B E (low to high)', autocomplete: 'off', autocapitalize: 'characters' });
  const customWrap = h('label', { class: 'field' }, h('span', {}, 'Custom tuning (low → high)'), custom);
  customWrap.hidden = tuningSel.value !== 'Custom';
  tuningSel.addEventListener('change', () => {
    customWrap.hidden = tuningSel.value !== 'Custom';
    const t = TUNINGS.find((t) => t.name === tuningSel.value);
    if (t) custom.value = tuningText(t.notes);
  });
  const tuningBtn = h('button', { type: 'button', class: 'tuning-btn' });
  const showTuning = () => {
    tuningBtn.innerHTML = `<b>${esc(tuningText(song.tuning))}</b><span>${esc(tuningName(song.tuning))} · Change…</span>`;
  };
  showTuning();
  tuningBtn.addEventListener('click', async () => {
    await tuningDialog();
    showTuning();
  });
  const capo = h('input', { type: 'number', min: 0, max: 12, value: song.capo, inputmode: 'numeric' });
  const tempo = h('input', { type: 'number', min: 30, max: 300, value: song.tempo, inputmode: 'numeric' });

  const field = (label, input) => h('label', { class: 'field' }, h('span', {}, label), input);
  const { value } = await modal({
    title: isNew ? 'New tab' : 'Song details',
    content: [
      field('Title', title),
      field('Artist', artist),
      isNew ? field('Tuning', tuningSel) : h('div', { class: 'field' }, h('span', {}, 'Tuning'), tuningBtn),
      isNew ? customWrap : null,
      h('div', { class: 'field-row' }, field('Capo', capo), field('Tempo (BPM)', tempo)),
    ],
    buttons: [
      { label: 'Cancel', value: 'cancel' },
      { label: isNew ? 'Start writing' : 'Save', value: 'ok', kind: 'primary' },
    ],
  });
  if (value !== 'ok') return false;

  let notes = isNew ? TUNINGS.find((t) => t.name === tuningSel.value)?.notes : song.tuning;
  if (isNew && tuningSel.value === 'Custom') {
    notes = parseTuning(custom.value);
    if (!notes) {
      toast('Tuning not recognised — use 4 to 8 notes like “D A D G B E”');
      notes = song.tuning;
    }
  }
  const apply = (s) => {
    s.title = title.value.trim() || (isNew ? 'Untitled tab' : s.title);
    s.artist = artist.value.trim();
    s.capo = Math.max(0, Math.min(12, parseInt(capo.value, 10) || 0));
    s.tempo = Math.max(30, Math.min(300, parseInt(tempo.value, 10) || 100));
    applyTuning(s, notes);
  };
  if (isNew) {
    apply(song);
    song.sections[0].columns.forEach((c) => c.type === 'note' && (c.cells = Array(notes.length).fill('')));
  } else editor.updateSong(apply);
  return true;
}

// ---------------------------------------------------------------- tuning
/** Retune string by string (or pick a preset). Applies to the open tab. */
async function tuningDialog() {
  const song = editor.song;
  let draft = song.tuning.slice();
  const summary = h('div', { class: 'tuning-summary' });
  const rows = h('div', { class: 'tuning-rows' });
  const keep = h('input', { type: 'checkbox' });
  const keepLabel = h(
    'label',
    { class: 'check' },
    keep,
    h('span', {}, h('b', {}, 'Keep notes sounding the same'), h('small', {}, 'Moves the fret numbers in your tab to match the new tuning'))
  );
  const chips = h(
    'div',
    { class: 'chips' },
    TUNINGS.map((t) =>
      h('button', { type: 'button', class: 'chip', 'data-name': t.name, onclick: () => { draft = t.notes.slice(); draw(); } }, t.name)
    )
  );
  const pluck = (note) => sound(() => playMidi(noteToMidi(note) + Number(song.capo || 0)));
  const inRange = (note) => {
    const m = noteToMidi(note);
    return m >= 21 && m <= 76;
  };
  const shift = (i, d) => {
    const next = shiftNote(draft[i], d);
    if (!inRange(next)) return;
    draft[i] = next;
    pluck(next);
    draw();
  };
  const shiftAll = (d) => {
    const next = draft.map((n) => shiftNote(n, d));
    if (!next.every(inRange)) return;
    draft = next;
    draw();
  };

  function draw() {
    const labels = stringLabels(draft);
    const name = tuningName(draft);
    summary.innerHTML = `<b>${esc(tuningText(draft))}</b><span>${esc(name)}${sameTuning(draft, song.tuning) ? ' · current' : ''}</span>`;
    $$('.chip', chips).forEach((c) => c.classList.toggle('on', c.dataset.name === name));
    rows.innerHTML = '';
    for (let i = draft.length - 1; i >= 0; i--) {
      const n = draft.length - i;
      const diff = song.tuning.length === draft.length ? noteToMidi(draft[i]) - noteToMidi(song.tuning[i]) : 0;
      rows.append(
        h(
          'div',
          { class: 'tuning-row' },
          h('span', { class: 'string-no' }, String(n)),
          h('button', { type: 'button', class: 'step', 'aria-label': `Tune string ${n} down`, onclick: () => shift(i, -1) }, '−'),
          h(
            'button',
            { type: 'button', class: `note${diff ? ' changed' : ''}`, 'aria-label': `Play string ${n}`, onclick: () => pluck(draft[i]) },
            h('b', {}, labels[i].trim()),
            h('small', {}, diff ? `${diff > 0 ? '+' : ''}${diff} semitone${Math.abs(diff) === 1 ? '' : 's'}` : draft[i])
          ),
          h('button', { type: 'button', class: 'step', 'aria-label': `Tune string ${n} up`, onclick: () => shift(i, 1) }, '+')
        )
      );
    }
    rows.append(
      h(
        'div',
        { class: 'tuning-row all' },
        h('span', { class: 'string-no' }, ''),
        h('button', { type: 'button', class: 'step', 'aria-label': 'All strings down a half step', onclick: () => shiftAll(-1) }, '−'),
        h('span', { class: 'note' }, h('b', {}, 'All strings'), h('small', {}, 'half step')),
        h('button', { type: 'button', class: 'step', 'aria-label': 'All strings up a half step', onclick: () => shiftAll(1) }, '+')
      )
    );
    const canKeep = draft.length === song.tuning.length;
    keepLabel.hidden = !canKeep;
    if (!canKeep) keep.checked = false;
  }
  draw();

  const { value } = await modal({
    title: 'Tuning',
    className: 'tuning',
    content: [chips, summary, rows, keepLabel],
    buttons: [
      { label: 'Cancel', value: 'cancel' },
      { label: 'Apply', value: 'ok', kind: 'primary' },
    ],
  });
  if (value !== 'ok' || sameTuning(draft, song.tuning)) return false;
  let skipped = 0;
  const before = song.tuning.length;
  editor.updateSong((s) => {
    if (keep.checked) skipped = transposeForTuning(s, draft);
    applyTuning(s, draft);
  });
  const name = tuningName(draft);
  if (skipped) toast(`${skipped} note${skipped === 1 ? '' : 's'} would go below fret 0, so ${skipped === 1 ? 'it was' : 'they were'} left as is`);
  else if (draft.length !== before) toast(`Now ${draft.length} strings — ${draft.length > before ? 'low strings added' : 'lowest strings removed'}`);
  else toast(`Tuned to ${name === 'Custom' ? tuningText(draft) : name}`);
  return true;
}

// ---------------------------------------------------------------- export
function fileBase(song) {
  return (song.title || 'tab').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 60) || 'tab';
}

function makeFile(song, format) {
  if (format === 'pdf') {
    return new File([songToPdf(song, { pageSize: prefs.pageSize })], `${fileBase(song)}.pdf`, { type: 'application/pdf' });
  }
  const text = songToText(song, { width: Number(prefs.txtWidth) || 80 });
  return new File([text.replace(/\n/g, '\r\n')], `${fileBase(song)}.txt`, { type: 'text/plain' });
}

function download(file) {
  const url = URL.createObjectURL(file);
  const a = h('a', { href: url, download: file.name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function exportDialog(song) {
  flushSave();
  let format = prefs.exportFormat || 'pdf';
  const preview = h('pre', { class: 'preview' });
  const pageSel = h('select', {}, h('option', { value: 'a4' }, 'A4'), h('option', { value: 'letter' }, 'US Letter'));
  pageSel.value = prefs.pageSize;
  const widthSel = h('select', {}, [60, 72, 80, 100, 120].map((w) => h('option', { value: w }, `${w} characters`)));
  widthSel.value = String(prefs.txtWidth);
  const pageField = h('label', { class: 'field' }, h('span', {}, 'Paper size'), pageSel);
  const widthField = h('label', { class: 'field' }, h('span', {}, 'Line width'), widthSel);

  const update = () => {
    $$('.format-seg button', dlgContent).forEach((b) => b.classList.toggle('on', b.dataset.f === format));
    pageField.hidden = format !== 'pdf';
    widthField.hidden = format !== 'txt';
    const width = format === 'pdf' ? (prefs.pageSize === 'letter' ? 85 : 82) : Number(prefs.txtWidth);
    preview.textContent = songToText(song, { width });
    preview.style.setProperty('--cols', width);
  };
  pageSel.addEventListener('change', () => {
    prefs.pageSize = pageSel.value;
    prefs.pageSizeChosen = true;
    savePrefs();
    update();
  });
  widthSel.addEventListener('change', () => {
    prefs.txtWidth = Number(widthSel.value);
    savePrefs();
    update();
  });

  const seg = h(
    'div',
    { class: 'seg format-seg' },
    [
      ['pdf', 'PDF', 'for printing'],
      ['txt', 'TXT', 'plain text'],
    ].map(([f, label, sub]) =>
      h('button', { type: 'button', 'data-f': f, onclick: () => { format = f; prefs.exportFormat = f; savePrefs(); update(); } }, h('b', {}, label), h('small', {}, sub))
    )
  );

  const canShare = (() => {
    try {
      return !!(navigator.canShare && navigator.canShare({ files: [new File(['x'], 'x.txt', { type: 'text/plain' })] }));
    } catch {
      return false;
    }
  })();

  const doDownload = (e) => {
    e.preventDefault();
    download(makeFile(song, format));
    toast(`Saved ${format.toUpperCase()}`);
  };
  const doShare = async (e) => {
    e.preventDefault();
    const file = makeFile(song, format);
    try {
      await navigator.share({ files: [file], title: song.title });
    } catch (err) {
      if (err && err.name !== 'AbortError') download(file);
    }
  };

  const actions = h(
    'div',
    { class: 'export-actions' },
    canShare ? h('button', { type: 'button', class: 'btn', onclick: doShare }, 'Share…') : null,
    h('button', { type: 'button', class: 'btn primary', onclick: doDownload }, 'Download')
  );
  const dlgContent = h('div', {}, seg, pageField, widthField, h('div', { class: 'preview-wrap' }, preview), actions);
  update();
  modal({ title: 'Export', content: [dlgContent], buttons: [], className: 'export' });
}

// ---------------------------------------------------------------- editor rendering
function renderEditor() {
  if (!editor) return;
  const song = editor.song;
  $('#title-text').textContent = song.title || 'Untitled tab';
  $('#meta-text').textContent = [tuningName(song.tuning) === 'Standard' ? 'Standard' : tuningText(song.tuning), song.capo ? `Capo ${song.capo}` : '', `${song.tempo} BPM`]
    .filter(Boolean)
    .join(' · ');
  $('#btn-undo').disabled = !editor.undoStack.length;
  $('#btn-redo').disabled = !editor.redoStack.length;
  $('#btn-play').classList.toggle('playing', !!playing);

  const key = song.tuning.join() + '|' + song.capo;
  if (builtFor !== key) {
    buildFretboard();
    buildKeypad();
    buildChords();
    builtFor = key;
  }
  renderSheet();
  updatePanels();
  renderDockState();
}

function renderSheet() {
  const song = editor.song;
  const { cursor, pendingJoin } = editor;
  const labels = stringLabels(song.tuning);
  const n = song.tuning.length;
  let html = '';
  song.sections.forEach((sec, si) => {
    const active = si === cursor.sec;
    html += `<section class="tab-section${active ? ' active' : ''}" data-sec="${si}">`;
    html += `<div class="section-head"><button class="section-name" data-act="rename" data-sec="${si}">${esc(sec.name)}</button><button class="icon-btn small" data-act="secmenu" data-sec="${si}" aria-label="Section options">⋯</button></div>`;
    html += `<div class="staff" style="--n:${n}">`;
    html += `<div class="col names" data-act="tuning" role="button" aria-label="Change tuning" title="Change tuning"><div class="lbl"><span>tune</span></div>${labels
      .map((l, i) => ({ l, i }))
      .reverse()
      .map(({ l }) => `<div class="cell"><span>${esc(l.trim())}</span></div>`)
      .join('')}</div>`;
    sec.columns.forEach((col, ci) => {
      const cur = active && ci === cursor.col;
      const play = playing && playing.sec === si && playing.col === ci;
      if (col.type === 'bar') {
        html += `<div class="col bar${cur ? ' cur' : ''}${play ? ' playing' : ''}" data-sec="${si}" data-col="${ci}"><div class="lbl"></div>${'<div class="cell"></div>'.repeat(n)}</div>`;
        return;
      }
      html += `<div class="col note${cur ? ' cur' : ''}${play ? ' playing' : ''}" data-sec="${si}" data-col="${ci}">`;
      html += col.label
        ? `<div class="lbl" data-act="label"><span>${esc(col.label)}</span></div>`
        : `<div class="lbl"${cur ? ' data-act="label"' : ''}>${cur ? '<span class="add-label">+</span>' : ''}</div>`;
      for (let s = n - 1; s >= 0; s--) {
        const v = col.cells[s];
        const sel = cur && s === cursor.str;
        const join = pendingJoin && pendingJoin.sec === si && pendingJoin.col === ci && pendingJoin.str === s;
        html += `<div class="cell${sel ? ' sel' : ''}${join ? ' joining' : ''}${v ? ' has' : ''}" data-str="${s}">${v ? `<span>${esc(v)}</span>` : ''}</div>`;
      }
      html += '</div>';
    });
    html += '</div>';
    html += sec.notes
      ? `<button class="section-notes" data-act="notes" data-sec="${si}">${esc(sec.notes)}</button>`
      : active
        ? `<button class="section-notes empty" data-act="notes" data-sec="${si}">+ Add notes or lyrics</button>`
        : '';
    html += '</section>';
  });
  html += `<button class="btn add-section" data-act="addsec">+ Add section</button>`;
  html += `<div class="sheet-spacer"></div>`;
  const sheet = $('#sheet');
  sheet.innerHTML = html;

  const ck = `${cursor.sec}:${cursor.col}:${cursor.str}`;
  if (ck !== lastCursorKey) {
    lastCursorKey = ck;
    const sel = $('.col.cur', sheet);
    if (sel) sel.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}

function renderDockState() {
  $$('.dock .seg button').forEach((b) => b.classList.toggle('on', b.dataset.panel === prefs.panel));
  $$('.dock .panel').forEach((p) => (p.hidden = prefs.collapsed || p.id !== `panel-${prefs.panel}`));
  $('#dock').classList.toggle('collapsed', !!prefs.collapsed);
  $('#btn-mode').dataset.mode = editor.mode;
  $('#hint').innerHTML = hintText();
}

function hintText() {
  const { pendingJoin, song, cursor, mode } = editor;
  if (pendingJoin) {
    const v = song.sections[pendingJoin.sec].columns[pendingJoin.col].cells[pendingJoin.str];
    const name = JOIN_TECHNIQUES[v.slice(-1)] || 'Technique';
    return `<b>${name}</b> from <b>${esc(v.slice(0, -1))}</b> — now pick the next fret on the <b>${esc(noteName(song.tuning[pendingJoin.str]))}</b> string`;
  }
  const str = noteName(song.tuning[cursor.str]);
  const col = editor.column;
  if (col.type === 'bar') return 'Bar line selected — ⌫ removes it';
  if (mode === 'chord') return `Chord mode: tap several strings, then <b>→</b> to move on`;
  return prefs.panel === 'keypad'
    ? `Pick a string on the left, then a fret — <b>${esc(str)}</b> string selected`
    : prefs.panel === 'chords'
      ? 'Tap a chord to drop it into the tab'
      : 'Tap a fret where your finger goes — the cursor moves on by itself';
}

// ---------- fretboard
const MARKERS = new Set([3, 5, 7, 9, 15, 17, 19, 21]);
const DOUBLE = new Set([12, 24]);

function buildFretboard() {
  const song = editor.song;
  const panel = $('#panel-fretboard');
  const n = song.tuning.length;
  const labels = stringLabels(song.tuning);
  let html = `<div class="fretboard" style="--n:${n}"><div class="fb-inner">`;
  for (let s = n - 1; s >= 0; s--) {
    html += `<div class="fb-row" data-str="${s}" style="--t:${(1 + (s === n - 1 ? 0 : (n - 1 - s) * 0.32)).toFixed(2)}px">`;
    for (let f = 0; f <= MAX_FRET; f++) {
      html += `<button class="fb-cell${f === 0 ? ' open' : ''}" data-str="${s}" data-fret="${f}" aria-label="${esc(noteName(song.tuning[s]))} string fret ${f}">${f === 0 ? `<span class="open-name">${esc(labels[s].trim())}</span>` : '<i></i>'}</button>`;
    }
    html += '</div>';
  }
  html += '<div class="fb-nums">';
  for (let f = 0; f <= MAX_FRET; f++) {
    html += `<span class="${f === 0 ? 'open' : ''}${MARKERS.has(f) ? ' dot' : ''}${DOUBLE.has(f) ? ' dbl' : ''}">${f === 0 ? '' : f}</span>`;
  }
  html += '</div></div></div>';
  panel.innerHTML = html;
}

function buildKeypad() {
  const song = editor.song;
  const n = song.tuning.length;
  const labels = stringLabels(song.tuning);
  let strings = '';
  for (let s = n - 1; s >= 0; s--) strings += `<button class="kp-str" data-str="${s}">${esc(labels[s].trim())}</button>`;
  let frets = '';
  for (let f = 0; f <= MAX_FRET; f++) frets += `<button class="kp-fret" data-fret="${f}">${f}</button>`;
  frets += `<button class="kp-fret mute" data-fret="x">x</button>`;
  $('#panel-keypad').innerHTML = `<div class="keypad"><div class="kp-strings" style="--n:${n}">${strings}</div><div class="kp-grid">${frets}</div></div>`;
}

function buildChords() {
  const n = editor.song.tuning.length;
  const panel = $('#panel-chords');
  if (n < 6) {
    panel.innerHTML = `<div class="chords-empty">Chord shapes are for 6- and 7-string guitars. Use <b>Chord ⇅</b> mode on the fretboard to build your own.</div>`;
    return;
  }
  const std = ['Standard', '7-string'].includes(tuningName(editor.song.tuning));
  let html = '<div class="chords">';
  if (!std) html += `<p class="chords-note">Shapes are standard-tuning fingerings — they'll sound different in ${esc(tuningName(editor.song.tuning))}.</p>`;
  CHORD_GROUPS.forEach((g, gi) => {
    html += `<div class="chord-group"><h4>${esc(g.group)}</h4><div class="chord-grid">`;
    g.chords.forEach((c, ci) => {
      html += `<button class="chord-btn" data-g="${gi}" data-c="${ci}"><b>${esc(c.name)}</b><small>${c.frets.map((f) => (f === '' ? 'x' : f)).join('')}</small></button>`;
    });
    html += '</div></div>';
  });
  html += '</div>';
  panel.innerHTML = html;
}

function updatePanels() {
  const { cursor } = editor;
  const col = editor.column;
  // Fretboard: show the current column's notes as dots
  for (const b of $$('#panel-fretboard .fb-cell')) {
    const s = Number(b.dataset.str);
    const f = Number(b.dataset.fret);
    const on = col.type === 'note' && col.cells[s] !== '' && cellFret(col.cells[s]) === f;
    b.classList.toggle('on', on);
    if (on) {
      const v = col.cells[s];
      b.dataset.v = v.length <= 3 ? v : String(f);
    }
  }
  for (const r of $$('#panel-fretboard .fb-row')) r.classList.toggle('cur', Number(r.dataset.str) === cursor.str);
  for (const b of $$('#panel-fretboard .fb-cell.open')) {
    const s = Number(b.dataset.str);
    b.classList.toggle('muted', col.type === 'note' && col.cells[s] === 'x');
  }
  for (const b of $$('#panel-keypad .kp-str')) b.classList.toggle('on', Number(b.dataset.str) === cursor.str);
  const curVal = col.type === 'note' ? col.cells[cursor.str] : '';
  for (const b of $$('#panel-keypad .kp-fret')) b.classList.toggle('on', curVal !== '' && (b.dataset.fret === 'x' ? curVal === 'x' : cellFret(curVal) === Number(b.dataset.fret)));
}

// ---------- technique buttons
const TECHS = [
  { k: 'h', sym: 'h', name: 'hammer' },
  { k: 'p', sym: 'p', name: 'pull-off' },
  { k: '/', sym: '/', name: 'slide ↑' },
  { k: '\\', sym: '\\', name: 'slide ↓' },
  { k: 'b', sym: 'b', name: 'bend' },
  { k: 'r', sym: 'r', name: 'release' },
  { k: '~', sym: '~', name: 'vibrato' },
  { k: 'x', sym: 'x', name: 'mute' },
  { k: 'harmonic', sym: '<>', name: 'harmonic' },
  { k: 'ghost', sym: '( )', name: 'ghost' },
];
$('#tech-row').innerHTML = TECHS.map((t) => `<button class="tech" data-tech="${esc(t.k)}"><b>${esc(t.sym)}</b><small>${esc(t.name)}</small></button>`).join('');

// ---------------------------------------------------------------- actions
function sound(fn) {
  if (prefs.sound) {
    try {
      fn();
    } catch {
      /* audio unavailable */
    }
  }
}

function enterFret(fret, str) {
  if (fret !== 'x') sound(() => playMidi(midiFor(editor.song, str ?? editor.cursor.str, String(fret))));
  buzz();
  editor.enterFret(fret, str);
}

function applyTechnique(kind) {
  if (kind === 'x') return enterFret('x');
  if (!editor.technique(kind)) toast('Enter a note first, then add the technique');
  else buzz();
}

function stopPlayback() {
  stopSong();
  if (playing) {
    playing = null;
    scheduleRender();
  }
}

function togglePlay() {
  if (playing) return stopPlayback();
  if (!audioContext()) return toast('Audio is not supported in this browser');
  const from = { sec: editor.cursor.sec, col: editor.cursor.col };
  // If the cursor is at the end, play the section from its start
  const cols = editor.section.columns;
  if (cols.slice(from.col).every((c) => c.type === 'bar' || c.cells.every((v) => !v))) from.col = 0;
  playing = { ...from };
  scheduleRender();
  playSong(editor.song, from, {
    onStep: (sec, col) => {
      if (!playing) return;
      playing = { sec, col };
      $$('#sheet .col.playing').forEach((c) => c.classList.remove('playing'));
      const node = $(`#sheet .col[data-sec="${sec}"][data-col="${col}"]`);
      if (node) {
        node.classList.add('playing');
        node.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    },
    onDone: () => {
      playing = null;
      scheduleRender();
    },
  });
}

async function columnMenu() {
  const col = editor.column;
  const a = await actionSheet('More', [
    { label: col.type === 'note' && col.label ? `Edit label “${col.label}”` : 'Add chord name / label', value: 'label', disabled: col.type === 'bar' },
    { label: 'Insert empty column before', value: 'insert' },
    { label: 'Duplicate column', value: 'dup' },
    { label: 'Clear column', value: 'clear', disabled: col.type === 'bar' },
    { label: 'Delete column', value: 'delete', danger: true },
    { label: `Tuning: ${tuningText(editor.song.tuning)}…`, value: 'tuning' },
    { label: prefs.sound ? 'Turn note sounds off' : 'Turn note sounds on', value: 'sound' },
  ]);
  if (a === 'label') editLabel();
  else if (a === 'insert') editor.insertColumn();
  else if (a === 'dup') editor.duplicateColumn();
  else if (a === 'clear') editor.clearColumn();
  else if (a === 'delete') editor.deleteColumn();
  else if (a === 'tuning') tuningDialog();
  else if (a === 'sound') {
    prefs.sound = !prefs.sound;
    savePrefs();
    toast(prefs.sound ? 'Sounds on' : 'Sounds off');
  }
}

async function editLabel() {
  const col = editor.column;
  const v = await promptText('Chord name / label', col.type === 'note' ? col.label : '', {
    placeholder: 'e.g. Am, PM, let ring',
    chips: ['PM', 'let ring', 'N.C.', 'x2', 'x4'],
  });
  if (v !== null) editor.setLabel(v);
}

const SECTION_NAMES = ['Intro', 'Verse', 'Pre-chorus', 'Chorus', 'Bridge', 'Solo', 'Riff', 'Outro'];

async function addSection() {
  const used = editor.song.sections.map((s) => s.name);
  const suggestion = SECTION_NAMES.find((n) => !used.includes(n)) || 'Section';
  const name = await promptText('New section', suggestion, { chips: SECTION_NAMES });
  if (name !== null) editor.addSection(name.trim() || 'Section');
}

async function sectionMenu(i) {
  const sec = editor.song.sections[i];
  const last = editor.song.sections.length - 1;
  const a = await actionSheet(sec.name, [
    { label: 'Rename', value: 'rename' },
    { label: sec.notes ? 'Edit notes / lyrics' : 'Add notes / lyrics', value: 'notes' },
    { label: 'Duplicate section', value: 'dup' },
    { label: 'Move up', value: 'up', disabled: i === 0 },
    { label: 'Move down', value: 'down', disabled: i === last },
    { label: 'Delete section', value: 'del', danger: true },
  ]);
  if (a === 'rename') renameSection(i);
  else if (a === 'notes') editNotes(i);
  else if (a === 'dup') editor.duplicateSection(i);
  else if (a === 'up') editor.moveSection(i, -1);
  else if (a === 'down') editor.moveSection(i, 1);
  else if (a === 'del' && (await confirmDanger('Delete section?', `“${sec.name}” and its tab will be removed. You can undo this.`))) editor.deleteSection(i);
}

async function renameSection(i) {
  const name = await promptText('Section name', editor.song.sections[i].name, { chips: SECTION_NAMES });
  if (name !== null && name.trim()) editor.renameSection(i, name.trim());
}

async function editNotes(i) {
  const notes = await promptText('Notes / lyrics', editor.song.sections[i].notes, { multiline: true, placeholder: 'Lyrics, strumming pattern, “repeat 4x”…' });
  if (notes !== null) editor.setSectionNotes(i, notes.trim());
}

// ---------------------------------------------------------------- events
$('#btn-back').addEventListener('click', () => (location.hash = '#/'));
$('#btn-info').addEventListener('click', () => songInfoDialog(editor.song));
$('#btn-undo').addEventListener('click', () => editor.undo());
$('#btn-redo').addEventListener('click', () => editor.redo());
$('#btn-play').addEventListener('click', togglePlay);
$('#btn-export').addEventListener('click', () => exportDialog(editor.song));

$('#btn-mode').addEventListener('click', () => {
  editor.mode = editor.mode === 'melody' ? 'chord' : 'melody';
  prefs.mode = editor.mode;
  savePrefs();
  toast(editor.mode === 'chord' ? 'Chord mode — notes stack in one column' : 'Notes mode — moves on after each note');
  scheduleRender();
});
$('#btn-collapse').addEventListener('click', () => {
  prefs.collapsed = !prefs.collapsed;
  savePrefs();
  scheduleRender();
});
$$('.dock .seg button').forEach((b) =>
  b.addEventListener('click', () => {
    prefs.panel = b.dataset.panel;
    prefs.collapsed = false;
    savePrefs();
    scheduleRender();
  })
);

$('#panel-fretboard').addEventListener('click', (e) => {
  const b = e.target.closest('.fb-cell');
  if (!b) return;
  enterFret(Number(b.dataset.fret), Number(b.dataset.str));
});
$('#panel-keypad').addEventListener('click', (e) => {
  const s = e.target.closest('.kp-str');
  if (s) {
    editor.moveString(Number(s.dataset.str) - editor.cursor.str);
    return;
  }
  const f = e.target.closest('.kp-fret');
  if (f) enterFret(f.dataset.fret === 'x' ? 'x' : Number(f.dataset.fret));
});
$('#panel-chords').addEventListener('click', (e) => {
  const b = e.target.closest('.chord-btn');
  if (!b) return;
  const chord = CHORD_GROUPS[b.dataset.g].chords[b.dataset.c];
  const frets = fitShape(chord.frets, editor.strings);
  if (!frets) return;
  buzz();
  sound(() => playColumn(editor.song, { type: 'note', cells: frets }));
  editor.insertChord(chord.name, frets);
});
$('#tech-row').addEventListener('click', (e) => {
  const b = e.target.closest('.tech');
  if (b) applyTechnique(b.dataset.tech);
});
$('#act-left').addEventListener('click', () => editor.moveLeft());
$('#act-right').addEventListener('click', () => editor.moveRight());
$('#act-bar').addEventListener('click', () => editor.insertBar());
$('#act-back').addEventListener('click', () => editor.backspace());
$('#act-more').addEventListener('click', columnMenu);

$('#sheet').addEventListener('click', (e) => {
  const act = e.target.closest('[data-act]');
  if (act) {
    const i = Number(act.dataset.sec);
    switch (act.dataset.act) {
      case 'rename':
        return renameSection(i);
      case 'secmenu':
        return sectionMenu(i);
      case 'notes':
        return editNotes(i);
      case 'addsec':
        return addSection();
      case 'tuning':
        return tuningDialog();
      case 'label': {
        const colEl = act.closest('.col');
        const sec = Number(colEl.dataset.sec);
        const ci = Number(colEl.dataset.col);
        if (sec === editor.cursor.sec && ci === editor.cursor.col) return editLabel();
        editor.select(sec, ci);
        return;
      }
    }
  }
  const colEl = e.target.closest('.col[data-col]');
  if (!colEl) return;
  const cell = e.target.closest('.cell[data-str]');
  const sec = Number(colEl.dataset.sec);
  const ci = Number(colEl.dataset.col);
  editor.select(sec, ci, cell ? Number(cell.dataset.str) : editor.cursor.str);
  const col = editor.column;
  if (col.type === 'note' && cell && col.cells[editor.cursor.str]) sound(() => playColumn(editor.song, { type: 'note', cells: col.cells.map((v, i) => (i === editor.cursor.str ? v : '')) }));
});

// Keyboard support (desktop / tablets with keyboards)
document.addEventListener('keydown', (e) => {
  if (!editor || document.querySelector('dialog[open]')) return;
  if (e.target.matches('input, textarea, select')) return;
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    return e.shiftKey ? editor.redo() : editor.undo();
  }
  if (mod && e.key.toLowerCase() === 'y') {
    e.preventDefault();
    return editor.redo();
  }
  if (mod || e.altKey) return;
  const k = e.key;
  let handled = true;
  if (/^[0-9]$/.test(k)) {
    sound(() => playMidi(midiFor(editor.song, editor.cursor.str, k)));
    editor.typeDigit(k);
  } else if (k === 'ArrowLeft') editor.moveLeft();
  else if (k === 'ArrowRight') editor.moveRight();
  else if (k === 'ArrowUp') editor.moveString(1);
  else if (k === 'ArrowDown') editor.moveString(-1);
  else if (k === ' ') editor.moveRight();
  else if (k === '|') editor.insertBar();
  else if (k === 'Backspace') editor.backspace();
  else if (k === 'Delete') editor.clearColumn();
  else if (k in JOIN_TECHNIQUES || k === '~') applyTechnique(k);
  else if (k === 'x' || k === 'X') enterFret('x');
  else if (k === 'c' || k === 'C') $('#btn-mode').click();
  else if (k === 'Enter') togglePlay();
  else handled = false;
  if (handled) e.preventDefault();
});

// ---------------------------------------------------------------- boot
if ('serviceWorker' in navigator && location.protocol !== 'file:' && !/^(localhost|127\.)/.test(location.hostname)) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
// Reopen whatever was open last time, exactly where you left off.
store.requestPersistence();
if (!location.hash && prefs.lastView === 'editor' && prefs.lastSong && store.getSong(prefs.lastSong)) {
  history.replaceState(null, '', `#/tab/${prefs.lastSong}`);
}
route();
$('#sheet').addEventListener('scroll', () => editor && scheduleSave(), { passive: true });
$('#panel-fretboard').addEventListener('scroll', () => editor && scheduleSave(), { passive: true, capture: true });
