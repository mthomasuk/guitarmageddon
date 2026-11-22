import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSong, columnBeats, normalizeSong } from '../js/model.js';
import { Editor } from '../js/editor.js';
import { songToText, layoutSection } from '../js/tabtext.js';
import { songToPdf } from '../js/pdf.js';

const LOW_E = 0;

function editorWithSection(len = 4) {
  const song = createSong({ title: 'T' });
  song.sections[0].columns.length = len;
  return new Editor(song);
}

// ---------------------------------------------------------------- note lengths

test('new notes take the current length, and it carries on as you write', () => {
  const e = new Editor(createSong());
  e.setDuration(4);
  e.enterFret(3, LOW_E);
  e.enterFret(5, LOW_E);
  const cols = e.section.columns;
  assert.equal(cols[0].dur, 4);
  assert.equal(cols[1].dur, 4);
  assert.equal(e.column.dur, 4, 'the unwritten column the cursor moved into is a quarter too');
  assert.equal(e.song.rhythm, true, 'choosing a length turns rhythm display on');
});

test('stepping right over unwritten space makes rests of the current length', () => {
  const e = new Editor(createSong());
  e.setDuration(2);
  e.enterFret(0, LOW_E);
  e.moveRight(); // half rest
  e.enterFret(2, LOW_E);
  const [a, rest, b] = e.section.columns;
  assert.equal(a.dur, 2);
  assert.equal(rest.dur, 2);
  assert.ok(rest.cells.every((c) => c === ''));
  assert.equal(b.dur, 2);
});

test('selecting a written column shows its length; changing length edits it', () => {
  const e = new Editor(createSong());
  e.setDuration(16);
  e.enterFret(1, LOW_E);
  e.setDuration(4);
  e.enterFret(2, LOW_E);
  e.select(0, 0);
  assert.equal(e.duration, 16, 'length buttons follow the selected note');
  e.setDuration(8);
  assert.equal(e.section.columns[0].dur, 8);
  assert.equal(e.section.columns[1].dur, 4, 'other notes untouched');
});

test('dotted toggles on the current column and new notes', () => {
  const e = new Editor(createSong());
  e.setDuration(4);
  e.toggleDot();
  e.enterFret(0, LOW_E);
  assert.equal(e.section.columns[0].dot, true);
  assert.equal(columnBeats(e.section.columns[0]), 1.5);
  e.select(0, 0);
  e.toggleDot();
  assert.equal(e.section.columns[0].dot, undefined);
});

test('beats per column', () => {
  assert.equal(columnBeats({ type: 'note', dur: 1 }), 4);
  assert.equal(columnBeats({ type: 'note', dur: 8 }), 0.5);
  assert.equal(columnBeats({ type: 'note' }), 0.5, 'old tabs without lengths play as eighths');
  assert.equal(columnBeats({ type: 'bar' }), 0);
});

test('old songs load with default lengths and rhythm off', () => {
  const s = normalizeSong({ tuning: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'], sections: [{ name: 'A', columns: [{ type: 'note', cells: ['1', '', '', '', '', ''] }] }] });
  assert.equal(s.sections[0].columns[0].dur, 8);
  assert.equal(s.rhythm, false);
});

test('text export: rhythm line, proportional spacing and legend', () => {
  const e = new Editor(createSong());
  e.setDuration(4);
  e.enterFret(3, LOW_E);
  e.setDuration(8);
  e.enterFret(5, LOW_E);
  e.moveRight(); // eighth rest
  e.setDuration(16);
  e.toggleDot();
  e.enterFret(7, LOW_E);
  const sys = layoutSection(e.section, e.song.tuning, 80, { rhythm: true })[0];
  const low = sys.lines[sys.lines.length - 1];
  assert.equal(low, 'E|-3---5-----7--|');
  assert.equal(sys.rhythm, '   Q   E  e  S.');
  // letters sit directly under their notes
  assert.equal(low.indexOf('3'), sys.rhythm.indexOf('Q'));
  assert.equal(low.indexOf('5'), sys.rhythm.indexOf('E'));
  assert.equal(low.indexOf('7'), sys.rhythm.indexOf('S'));
  const txt = songToText(e.song);
  assert.match(txt, /E\|-3---5-----7--\|\n {3}Q {3}E {2}e {2}S\./);
  assert.match(txt, /Rhythm \(under the tab\): W whole/);

  e.song.rhythm = false;
  assert.doesNotMatch(songToText(e.song), /Rhythm|Q {3}E/, 'hidden when rhythm display is off');
});

test('pdf export with rhythm stays valid', () => {
  const e = new Editor(createSong());
  e.setDuration(4);
  for (let i = 0; i < 60; i++) e.enterFret(i % 12, i % 6);
  const str = Buffer.from(songToPdf(e.song)).toString('latin1');
  assert.ok(str.startsWith('%PDF-1.4'));
  assert.match(str, /\(Rhythm \\\(under the tab\\\)/);
});

// ---------------------------------------------------------------- selection

test('select a range, copy and paste it elsewhere', () => {
  const e = editorWithSection(4);
  e.enterFret(1, LOW_E);
  e.enterFret(2, LOW_E);
  e.enterFret(3, LOW_E);
  e.startSelection(0, 0);
  e.extendSelection(0, 1);
  assert.equal(e.selCount, 2);
  const clip = e.copySelection();
  assert.deepEqual(clip.map((c) => c.cells[LOW_E]), ['1', '2']);
  e.clearSelection();
  e.select(0, 3); // the empty column after "3"
  e.paste(clip);
  assert.deepEqual(e.section.columns.map((c) => c.cells[LOW_E]), ['1', '2', '3', '1', '2', '']);
  assert.equal(e.cursor.col, 5, 'cursor lands just after the pasted music');
  assert.equal(e.selection, null);
});

test('paste after a written column inserts rather than overwrites', () => {
  const e = editorWithSection(2);
  e.enterFret(1, LOW_E);
  e.enterFret(2, LOW_E);
  e.select(0, 0);
  e.paste([{ type: 'note', cells: ['9', '', '', '', '', ''], label: '', dur: 8 }]);
  assert.deepEqual(e.section.columns.map((c) => c.cells[LOW_E]).slice(0, 3), ['1', '9', '2']);
});

test('paste replaces a selection', () => {
  const e = editorWithSection(3);
  e.enterFret(1, LOW_E);
  e.enterFret(2, LOW_E);
  e.enterFret(3, LOW_E);
  e.startSelection(0, 0);
  e.extendSelection(0, 1);
  e.paste([{ type: 'bar' }]);
  assert.deepEqual(e.section.columns.slice(0, 2).map((c) => c.type), ['bar', 'note']);
  assert.equal(e.section.columns[1].cells[LOW_E], '3');
});

test('repeat duplicates a bar and selects the copy, so it can repeat again', () => {
  const e = editorWithSection(1);
  e.enterFret(0, LOW_E);
  e.enterFret(3, LOW_E);
  e.insertBar();
  e.select(0, 0);
  e.selectBar();
  assert.deepEqual(e.selRange, { sec: 0, from: 0, to: 2 }, 'bar selection includes its closing bar line');
  e.repeatSelection();
  e.repeatSelection();
  const flat = e.section.columns.map((c) => (c.type === 'bar' ? '|' : c.cells[LOW_E]));
  assert.deepEqual(flat.slice(0, 9), ['0', '3', '|', '0', '3', '|', '0', '3', '|']);
  assert.deepEqual(e.selRange, { sec: 0, from: 6, to: 8 });
  e.undo();
  assert.equal(e.section.columns.filter((c) => c.type === 'bar').length, 2, 'undo removes one repeat');
});

test('cut and delete remove the selection; clear keeps the columns as rests', () => {
  const e = editorWithSection(3);
  e.setDuration(4);
  ['1', '2', '3'].forEach((f) => e.enterFret(f, LOW_E));
  e.startSelection(0, 1);
  const clip = e.cutSelection();
  assert.equal(clip[0].cells[LOW_E], '2');
  assert.deepEqual(e.section.columns.map((c) => c.cells[LOW_E]).slice(0, 2), ['1', '3']);

  e.startSelection(0, 0);
  e.extendSelection(0, 1);
  e.clearSelected();
  assert.ok(e.section.columns.slice(0, 2).every((c) => c.cells.every((v) => v === '') && c.dur === 4));
  assert.ok(e.selection, 'selection kept after clearing');
  e.deleteSelection();
  assert.equal(e.section.columns.length, 1);
});

test('length change applies to every selected column', () => {
  const e = editorWithSection(3);
  ['1', '2', '3'].forEach((f) => e.enterFret(f, LOW_E));
  e.startSelection(0, 0);
  e.extendSelection(0, 2);
  e.setDuration(16);
  assert.deepEqual(e.section.columns.slice(0, 3).map((c) => c.dur), [16, 16, 16]);
  assert.ok(e.selection);
});

test('pasting into a tab with a different number of strings fits the columns', () => {
  const e = new Editor(createSong());
  const sevenString = [{ type: 'note', cells: ['0', '1', '2', '3', '4', '5', '6'], label: '', dur: 8 }];
  e.paste(sevenString);
  assert.deepEqual(e.section.columns[0].cells, ['1', '2', '3', '4', '5', '6'], 'lowest string dropped');
});

test('other edits end the selection; selections in another section start over', () => {
  const e = new Editor(createSong());
  e.addSection('Verse');
  e.startSelection(0, 0);
  e.extendSelection(0, 3);
  e.extendSelection(1, 2);
  assert.deepEqual(e.selRange, { sec: 1, from: 2, to: 2 });
  e.enterFret(5, LOW_E);
  assert.equal(e.selection, null);
});
