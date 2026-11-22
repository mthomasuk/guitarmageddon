import { emptyColumn, barColumn, isEmptyNote, clone, createSection, fitColumn, MAX_FRET, DEFAULT_DUR } from './model.js';

// Techniques that join two frets inside one cell, e.g. 5h7, 7b9, 9r7, 5/7.
export const JOIN_TECHNIQUES = {
  h: 'Hammer-on',
  p: 'Pull-off',
  '/': 'Slide up',
  '\\': 'Slide down',
  b: 'Bend',
  r: 'Release',
};

const UNDO_LIMIT = 200;

/**
 * Editing state + operations for one song. Strings are indexed low (0) -> high.
 * cursor.col always points at an existing column.
 */
export class Editor {
  constructor(song, { onChange } = {}) {
    this.song = song;
    this.cursor = { sec: 0, col: 0, str: song.tuning.length - 1 };
    this.mode = 'melody'; // 'melody' = advance after each note, 'chord' = stay on column
    this.pendingJoin = null; // {sec,col,str} awaiting the 2nd fret of a technique
    this.lastEdit = null; // {sec,col,str,time,value}
    this.undoStack = [];
    this.redoStack = [];
    this.duration = DEFAULT_DUR; // length given to new notes (see model DURATIONS)
    this.dot = false;
    this.selection = null; // {sec, anchor, head} column range within one section
    this.onChange = onChange || (() => {});
  }

  get strings() {
    return this.song.tuning.length;
  }
  get section() {
    return this.song.sections[this.cursor.sec];
  }
  get column() {
    return this.section.columns[this.cursor.col];
  }

  // ---------- history ----------
  snapshot() {
    return JSON.stringify({ song: this.song, cursor: this.cursor });
  }
  /** Run a mutation with undo support. Most edits end a selection; pass keepSelection to keep it. */
  commit(fn, { keepSelection = false } = {}) {
    const before = this.snapshot();
    const result = fn();
    if (!keepSelection) this.selection = null;
    if (this.snapshot() !== before) {
      this.undoStack.push(before);
      if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();
      this.redoStack = [];
      this.song.updated = Date.now();
      this.onChange({ content: true });
    } else {
      this.onChange({ content: false });
    }
    return result;
  }
  restore(json) {
    const { song, cursor } = JSON.parse(json);
    Object.keys(this.song).forEach((k) => delete this.song[k]);
    Object.assign(this.song, song);
    this.cursor = cursor;
    this.pendingJoin = null;
    this.lastEdit = null;
    this.selection = null;
    this.clampCursor();
  }
  undo() {
    if (!this.undoStack.length) return false;
    this.redoStack.push(this.snapshot());
    this.restore(this.undoStack.pop());
    this.song.updated = Date.now();
    this.onChange({ content: true });
    return true;
  }
  redo() {
    if (!this.redoStack.length) return false;
    this.undoStack.push(this.snapshot());
    this.restore(this.redoStack.pop());
    this.song.updated = Date.now();
    this.onChange({ content: true });
    return true;
  }

  // ---------- cursor ----------
  clampCursor() {
    const c = this.cursor;
    c.sec = Math.max(0, Math.min(c.sec, this.song.sections.length - 1));
    const cols = this.section.columns;
    if (!cols.length) cols.push(emptyColumn(this.strings));
    c.col = Math.max(0, Math.min(c.col, cols.length - 1));
    c.str = Math.max(0, Math.min(c.str, this.strings - 1));
  }
  select(sec, col, str = this.cursor.str) {
    this.cursor = { sec, col, str };
    this.pendingJoin = null;
    this.clampCursor();
    this.followLength();
    this.onChange({ content: false });
  }

  // ---------- note lengths ----------
  /** True if column i is empty and nothing but empty columns follow it (unwritten space). */
  isFresh(i = this.cursor.col, cols = this.section.columns) {
    for (let k = i; k < cols.length; k++) if (!isEmptyNote(cols[k])) return false;
    return true;
  }
  hasCurrentLength(col) {
    return col.type === 'note' && (col.dur || DEFAULT_DUR) === this.duration && !!col.dot === this.dot;
  }
  setLength(col, dur, dot) {
    if (col.type !== 'note') return;
    col.dur = dur;
    if (dot) col.dot = true;
    else delete col.dot;
  }
  /** When you select written music, the length buttons show (and continue with) its length. */
  followLength() {
    const col = this.column;
    if (col.type === 'note' && !this.isFresh()) {
      this.duration = col.dur || DEFAULT_DUR;
      this.dot = !!col.dot;
    }
  }
  /** Unwritten space you move into takes the current length, so rhythms carry on as you write. */
  inheritLength() {
    if (this.isFresh()) this.setLength(this.column, this.duration, this.dot);
  }
  /** Columns a length change applies to: the selection, or the column under the cursor. */
  lengthTargets() {
    const r = this.selRange;
    if (r) return this.song.sections[r.sec].columns.slice(r.from, r.to + 1).filter((c) => c.type === 'note');
    return this.column.type === 'note' ? [this.column] : [];
  }
  setDuration(dur) {
    this.commit(
      () => {
        this.duration = dur;
        this.song.rhythm = true;
        for (const col of this.lengthTargets()) this.setLength(col, dur, !!col.dot); // each keeps its own dot
      },
      { keepSelection: true }
    );
  }
  toggleDot() {
    this.commit(
      () => {
        this.dot = !this.dot;
        this.song.rhythm = true;
        for (const col of this.lengthTargets()) this.setLength(col, col.dur || DEFAULT_DUR, this.dot);
      },
      { keepSelection: true }
    );
  }

  /** Move right one column, appending new columns at the end of a section. */
  advance() {
    const cols = this.section.columns;
    if (this.cursor.col >= cols.length - 1) cols.push(emptyColumn(this.strings, this.duration, this.dot));
    this.cursor.col += 1;
    this.inheritLength();
  }
  moveRight() {
    this.pendingJoin = null;
    const cols = this.section.columns;
    const next = this.cursor.col + 1;
    // Growing the section, or stepping into unwritten space that needs the current length (a rest).
    if (next >= cols.length || (this.isFresh(next) && !this.hasCurrentLength(cols[next]))) {
      return this.commit(() => this.advance(), { keepSelection: true });
    }
    this.cursor.col = next;
    this.followLength();
    this.onChange({ content: false });
  }
  moveLeft() {
    this.pendingJoin = null;
    if (this.cursor.col > 0) this.cursor.col -= 1;
    else if (this.cursor.sec > 0) {
      this.cursor.sec -= 1;
      this.cursor.col = this.section.columns.length - 1;
    }
    this.followLength();
    this.onChange({ content: false });
  }
  moveString(delta) {
    this.pendingJoin = null;
    this.cursor.str = Math.max(0, Math.min(this.strings - 1, this.cursor.str + delta));
    this.onChange({ content: false });
  }

  /** Ensure the cursor sits on a note column (if on a bar, step past it). */
  ensureNoteColumn() {
    if (this.column.type === 'bar') {
      this.section.columns.splice(this.cursor.col + 1, 0, emptyColumn(this.strings, this.duration, this.dot));
      this.cursor.col += 1;
    }
    return this.column;
  }

  // ---------- note entry ----------
  /** Enter a fret (number or 'x') on a string at the cursor column. */
  enterFret(fret, str = this.cursor.str) {
    const value = String(fret);
    return this.commit(() => {
      this.cursor.str = str;
      const pj = this.pendingJoin;
      const joining = pj && pj.sec === this.cursor.sec && pj.col === this.cursor.col && pj.str === str;
      const col = this.ensureNoteColumn();
      if (col.cells.every((c) => c === '')) this.setLength(col, this.duration, this.dot);
      if (joining) {
        col.cells[str] += value;
      } else {
        col.cells[str] = value;
      }
      this.pendingJoin = null;
      this.lastEdit = { sec: this.cursor.sec, col: this.cursor.col, str, time: Date.now(), value };
      if (this.mode === 'melody') this.advance();
    });
  }

  /** Keyboard helper: typing "1" then "2" quickly becomes fret 12. */
  typeDigit(d, now = Date.now()) {
    const le = this.lastEdit;
    if (le && now - le.time < 800 && /^[12]$/.test(le.value)) {
      const col = this.song.sections[le.sec]?.columns[le.col];
      const combined = Number(le.value + d);
      if (col && col.type === 'note' && combined <= MAX_FRET && col.cells[le.str].endsWith(le.value)) {
        return this.commit(() => {
          col.cells[le.str] = col.cells[le.str].slice(0, -1) + String(combined);
          this.lastEdit = null;
        });
      }
    }
    return this.enterFret(d);
  }

  /** The cell a technique should apply to: the selected cell, or the note just entered. */
  techniqueTarget() {
    const c = this.cursor;
    const col = this.column;
    if (col.type === 'note' && col.cells[c.str] !== '') return { sec: c.sec, col: c.col, str: c.str };
    const le = this.lastEdit;
    if (le) {
      const lc = this.song.sections[le.sec]?.columns[le.col];
      if (lc && lc.type === 'note' && lc.cells[le.str] !== '') return { sec: le.sec, col: le.col, str: le.str };
    }
    return null;
  }

  /**
   * Apply a technique. Returns false if there is no note to apply it to.
   * kind: one of JOIN_TECHNIQUES keys, '~' (vibrato), 'harmonic', 'ghost'.
   */
  technique(kind) {
    const t = this.techniqueTarget();
    if (!t) return false;
    this.commit(() => {
      const col = this.song.sections[t.sec].columns[t.col];
      let v = col.cells[t.str];
      if (kind in JOIN_TECHNIQUES) {
        if (/[hp/\\br]$/.test(v)) v = v.slice(0, -1);
        col.cells[t.str] = v + kind;
        this.cursor = { ...t };
        this.pendingJoin = { ...t };
        return;
      }
      if (kind === '~') col.cells[t.str] = v.endsWith('~') ? v.slice(0, -1) : v + '~';
      else if (kind === 'harmonic') col.cells[t.str] = /^<.*>$/.test(v) ? v.slice(1, -1) : `<${v}>`;
      else if (kind === 'ghost') col.cells[t.str] = /^\(.*\)$/.test(v) ? v.slice(1, -1) : `(${v})`;
      this.pendingJoin = null;
    });
    return true;
  }

  /** Clear the selected cell; if it is already empty, step back (like a text backspace). */
  backspace() {
    const pj = this.pendingJoin;
    if (pj) {
      return this.commit(() => {
        const col = this.song.sections[pj.sec].columns[pj.col];
        col.cells[pj.str] = col.cells[pj.str].slice(0, -1);
        this.pendingJoin = null;
      });
    }
    const col = this.column;
    if (col.type === 'note' && col.cells[this.cursor.str] !== '') {
      return this.commit(() => {
        col.cells[this.cursor.str] = '';
      });
    }
    if ((col.type === 'bar' || isEmptyNote(col)) && this.section.columns.length > 1) {
      // Remove the empty column / bar and step back onto the previous note.
      return this.commit(() => {
        this.section.columns.splice(this.cursor.col, 1);
        if (this.cursor.col > 0) this.cursor.col -= 1;
        this.clampCursor();
        this.focusSingleNote();
      });
    }
    this.moveLeft();
    this.focusSingleNote();
  }

  /** If the column under the cursor holds exactly one note, put the cursor on its string. */
  focusSingleNote() {
    const col = this.column;
    if (col.type !== 'note' || col.cells[this.cursor.str] !== '') return;
    const filled = col.cells.map((v, i) => (v !== '' ? i : -1)).filter((i) => i >= 0);
    if (filled.length === 1) this.cursor.str = filled[0];
  }

  clearColumn() {
    this.commit(() => {
      const col = this.column;
      if (col.type === 'note') {
        col.cells = col.cells.map(() => '');
        col.label = '';
      }
    });
  }

  /** Bar line: replaces an empty column, otherwise goes after the current one. */
  insertBar() {
    this.commit(() => {
      this.pendingJoin = null;
      const cols = this.section.columns;
      if (isEmptyNote(this.column)) {
        cols[this.cursor.col] = barColumn();
      } else {
        cols.splice(this.cursor.col + 1, 0, barColumn());
        this.cursor.col += 1;
      }
      this.advance();
    });
  }

  insertColumn() {
    this.commit(() => {
      this.section.columns.splice(this.cursor.col, 0, emptyColumn(this.strings, this.duration, this.dot));
    });
  }

  deleteColumn() {
    this.commit(() => {
      const cols = this.section.columns;
      cols.splice(this.cursor.col, 1);
      if (!cols.length) cols.push(emptyColumn(this.strings));
      this.clampCursor();
    });
  }

  duplicateColumn() {
    this.commit(() => {
      const cols = this.section.columns;
      cols.splice(this.cursor.col + 1, 0, clone(this.column));
      this.cursor.col += 1;
    });
  }

  setLabel(text) {
    this.commit(() => {
      const col = this.ensureNoteColumn();
      col.label = String(text || '').trim();
    });
  }

  /** Insert a full chord shape (frets low -> high) and a label. */
  insertChord(name, frets) {
    this.commit(() => {
      this.pendingJoin = null;
      let col = this.ensureNoteColumn();
      if (!isEmptyNote(col)) {
        this.advance();
        col = this.ensureNoteColumn();
      }
      col.cells = frets.map((f) => String(f));
      col.label = name;
      this.setLength(col, this.duration, this.dot);
      this.lastEdit = null;
      this.advance();
    });
  }

  // ---------- selection ----------
  /** Normalised selection {sec, from, to} (inclusive), or null. */
  get selRange() {
    const s = this.selection;
    if (!s) return null;
    return { sec: s.sec, from: Math.min(s.anchor, s.head), to: Math.max(s.anchor, s.head) };
  }
  get selCount() {
    const r = this.selRange;
    return r ? r.to - r.from + 1 : 0;
  }
  isSelected(sec, col) {
    const r = this.selRange;
    return !!r && r.sec === sec && col >= r.from && col <= r.to;
  }
  startSelection(sec = this.cursor.sec, col = this.cursor.col) {
    this.pendingJoin = null;
    this.cursor = { ...this.cursor, sec, col };
    this.clampCursor();
    this.selection = { sec: this.cursor.sec, anchor: this.cursor.col, head: this.cursor.col };
    this.onChange({ content: false });
  }
  /** Extend the selection to a column (starting over if it's in another section). */
  extendSelection(sec, col) {
    if (!this.selection || this.selection.sec !== sec) return this.startSelection(sec, col);
    this.cursor = { ...this.cursor, sec, col };
    this.clampCursor();
    this.selection.head = this.cursor.col;
    this.onChange({ content: false });
  }
  /** Shift+arrow style: move the selection's moving end by one column. */
  nudgeSelection(delta) {
    if (!this.selection) this.startSelection();
    const cols = this.song.sections[this.selection.sec].columns;
    this.extendSelection(this.selection.sec, Math.max(0, Math.min(cols.length - 1, this.selection.head + delta)));
  }
  clearSelection() {
    if (!this.selection) return;
    this.selection = null;
    this.onChange({ content: false });
  }
  /** Select the whole bar (measure) around the cursor, including its closing bar line. */
  selectBar() {
    const cols = this.section.columns;
    const c = this.cursor.col;
    let from = cols[c].type === 'bar' ? c - 1 : c;
    while (from > 0 && cols[from - 1].type !== 'bar') from--;
    from = Math.max(0, from);
    let to = cols[c].type === 'bar' ? c : c;
    while (to < cols.length && cols[to].type !== 'bar') to++;
    if (to >= cols.length) {
      to = cols.length - 1;
      while (to > from && isEmptyNote(cols[to])) to--;
    }
    this.pendingJoin = null;
    this.selection = { sec: this.cursor.sec, anchor: from, head: to };
    this.cursor.col = to;
    this.onChange({ content: false });
  }
  /** Copies of the selected columns (or the cursor column if nothing is selected). */
  copySelection() {
    const r = this.selRange;
    if (!r) return [clone(this.column)];
    return clone(this.song.sections[r.sec].columns.slice(r.from, r.to + 1));
  }
  deleteSelection() {
    const r = this.selRange;
    if (!r) return this.deleteColumn();
    this.commit(() => {
      const cols = this.song.sections[r.sec].columns;
      cols.splice(r.from, r.to - r.from + 1);
      if (!cols.length) cols.push(emptyColumn(this.strings, this.duration, this.dot));
      this.cursor = { ...this.cursor, sec: r.sec, col: r.from };
      this.clampCursor();
    });
  }
  /** Empty the selected columns but keep them (and their lengths) as rests. */
  clearSelected() {
    const r = this.selRange;
    if (!r) return this.clearColumn();
    this.commit(
      () => {
        for (const col of this.song.sections[r.sec].columns.slice(r.from, r.to + 1)) {
          if (col.type !== 'note') continue;
          col.cells = col.cells.map(() => '');
          col.label = '';
        }
      },
      { keepSelection: true }
    );
  }
  cutSelection() {
    const clip = this.copySelection();
    this.deleteSelection();
    return clip;
  }
  /** Insert a copy of the selection right after it, and select the copy (tap again to keep repeating). */
  repeatSelection() {
    if (!this.selection) this.startSelection();
    const r = this.selRange;
    this.commit(
      () => {
        const cols = this.song.sections[r.sec].columns;
        const block = clone(cols.slice(r.from, r.to + 1));
        cols.splice(r.to + 1, 0, ...block);
        this.selection = { sec: r.sec, anchor: r.to + 1, head: r.to + block.length };
        this.cursor = { ...this.cursor, sec: r.sec, col: r.to + block.length };
      },
      { keepSelection: true }
    );
  }
  /**
   * Paste columns: replaces the selection if there is one, fills an empty column at the cursor,
   * or goes after the column under the cursor. The cursor ends just after the pasted music.
   */
  paste(columns) {
    if (!columns || !columns.length) return;
    this.commit(() => {
      const block = clone(columns).map((c) => fitColumn(c, this.strings));
      const r = this.selRange;
      let start;
      if (r) {
        this.cursor = { ...this.cursor, sec: r.sec };
        this.section.columns.splice(r.from, r.to - r.from + 1, ...block);
        start = r.from;
      } else if (isEmptyNote(this.column)) {
        start = this.cursor.col;
        this.section.columns.splice(start, 1, ...block);
      } else {
        start = this.cursor.col + 1;
        this.section.columns.splice(start, 0, ...block);
      }
      this.pendingJoin = null;
      this.lastEdit = null;
      this.cursor.col = start + block.length - 1;
      this.advance();
    });
  }

  // ---------- sections ----------
  addSection(name) {
    this.commit(() => {
      this.song.sections.push(createSection(name || 'Section', this.strings));
      this.cursor = { sec: this.song.sections.length - 1, col: 0, str: this.cursor.str };
    });
  }
  renameSection(i, name) {
    this.commit(() => {
      this.song.sections[i].name = name;
    });
  }
  setSectionNotes(i, notes) {
    this.commit(() => {
      this.song.sections[i].notes = notes;
    });
  }
  duplicateSection(i) {
    this.commit(() => {
      const copy = clone(this.song.sections[i]);
      copy.id = Math.random().toString(36).slice(2, 10);
      this.song.sections.splice(i + 1, 0, copy);
      this.cursor = { sec: i + 1, col: 0, str: this.cursor.str };
    });
  }
  moveSection(i, delta) {
    const j = i + delta;
    if (j < 0 || j >= this.song.sections.length) return;
    this.commit(() => {
      const s = this.song.sections;
      [s[i], s[j]] = [s[j], s[i]];
      this.cursor.sec = j;
      this.cursor.col = 0;
    });
  }
  deleteSection(i) {
    this.commit(() => {
      this.song.sections.splice(i, 1);
      if (!this.song.sections.length) this.song.sections.push(createSection('Intro', this.strings));
      if (this.cursor.sec >= i) this.cursor.sec = Math.max(0, this.cursor.sec - 1);
      this.cursor.col = 0;
      this.clampCursor();
    });
  }

  /** Edit song details. `fn` mutates the song. */
  updateSong(fn) {
    this.commit(() => {
      fn(this.song);
      this.clampCursor();
    });
  }
}
