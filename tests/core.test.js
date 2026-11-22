import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSong, applyTuning, normalizeSong } from '../js/model.js';
import { Editor } from '../js/editor.js';
import { songToText, layoutSection } from '../js/tabtext.js';
import { songToPdf, pdfString } from '../js/pdf.js';
import { parseTuning, stringLabels, noteToMidi } from '../js/tunings.js';
import { CHORD_GROUPS } from '../js/chords.js';

const LOW_E = 0;
const HIGH_E = 5;

function newEditor() {
  return new Editor(createSong({ title: 'Test' }));
}

test('melody mode advances after each note; chord mode stacks', () => {
  const e = newEditor();
  e.enterFret(3, LOW_E);
  e.enterFret(5, LOW_E);
  assert.equal(e.section.columns[0].cells[LOW_E], '3');
  assert.equal(e.section.columns[1].cells[LOW_E], '5');
  assert.equal(e.cursor.col, 2);

  e.mode = 'chord';
  e.enterFret(0, 1);
  e.enterFret(2, 2);
  assert.deepEqual(e.section.columns[2].cells, ['', '0', '2', '', '', '']);
  assert.equal(e.cursor.col, 2);
});

test('techniques join two frets in one cell', () => {
  const e = newEditor();
  e.enterFret(5, 3);
  assert.ok(e.technique('h'));
  assert.deepEqual(e.pendingJoin, { sec: 0, col: 0, str: 3 });
  e.enterFret(7, 3);
  assert.equal(e.section.columns[0].cells[3], '5h7');
  assert.equal(e.cursor.col, 1);
  assert.equal(e.pendingJoin, null);

  e.enterFret(7, 2);
  e.technique('b');
  e.enterFret(9, 2);
  e.technique('~');
  assert.equal(e.section.columns[1].cells[2], '7b9~');
});

test('technique with no note returns false', () => {
  const e = newEditor();
  assert.equal(e.technique('h'), false);
});

test('harmonic and ghost wrap and unwrap', () => {
  const e = newEditor();
  e.mode = 'chord';
  e.enterFret(12, 2);
  e.technique('harmonic');
  assert.equal(e.column.cells[2], '<12>');
  e.technique('harmonic');
  assert.equal(e.column.cells[2], '12');
  e.technique('ghost');
  assert.equal(e.column.cells[2], '(12)');
});

test('typing 1 then 2 quickly makes fret 12', () => {
  const e = newEditor();
  e.cursor.str = HIGH_E;
  e.typeDigit('1', 1000);
  e.typeDigit('2', 1200);
  assert.equal(e.section.columns[0].cells[HIGH_E], '12');
  e.typeDigit('3', 5000);
  assert.equal(e.section.columns[1].cells[HIGH_E], '3');
});

test('bar replaces an empty column, backspace walks back like text', () => {
  const e = newEditor();
  e.section.columns.length = 1;
  e.enterFret(0, LOW_E);
  e.insertBar();
  assert.equal(e.section.columns[1].type, 'bar');
  assert.equal(e.cursor.col, 2);
  e.backspace(); // empty column removed
  e.backspace(); // bar removed
  assert.equal(e.section.columns.filter((c) => c.type === 'bar').length, 0);
  assert.equal(e.cursor.col, 0);
  assert.equal(e.cursor.str, LOW_E);
  e.backspace(); // note cleared
  assert.equal(e.section.columns[0].cells[LOW_E], '');
});

test('undo / redo', () => {
  const e = newEditor();
  e.enterFret(3, 0);
  e.enterFret(5, 0);
  e.undo();
  assert.equal(e.section.columns[1].cells[0], '');
  assert.equal(e.cursor.col, 1);
  e.redo();
  assert.equal(e.section.columns[1].cells[0], '5');
});

test('chords insert with label and advance', () => {
  const e = newEditor();
  const am = CHORD_GROUPS.flatMap((g) => g.chords).find((c) => c.name === 'Am');
  e.insertChord(am.name, am.frets);
  assert.deepEqual(e.section.columns[0].cells, ['', '0', '2', '2', '1', '0']);
  assert.equal(e.section.columns[0].label, 'Am');
  assert.equal(e.cursor.col, 1);
});

test('changing to a 7-string tuning adds a low string', () => {
  const song = createSong();
  song.sections[0].columns[0].cells[0] = '3';
  applyTuning(song, parseTuning('B E A D G B E'));
  assert.equal(song.tuning[0], 'B1');
  assert.equal(song.sections[0].columns[0].cells.length, 7);
  assert.equal(song.sections[0].columns[0].cells[1], '3');
});

test('tuning parsing and labels', () => {
  assert.deepEqual(parseTuning('D A D G B E'), ['D2', 'A2', 'D3', 'G3', 'B3', 'E4']);
  assert.deepEqual(parseTuning('E A D G'), ['E1', 'A1', 'D2', 'G2']);
  assert.equal(parseTuning('nope'), null);
  assert.equal(noteToMidi('E2'), 40);
  assert.deepEqual(stringLabels(['E2', 'A2', 'D3', 'G3', 'B3', 'E4']), ['E', 'A', 'D', 'G', 'B', 'e']);
  assert.deepEqual(stringLabels(['Eb2', 'Ab2', 'Db3', 'Gb3', 'Bb3', 'Eb4']), ['Eb', 'Ab', 'Db', 'Gb', 'Bb', 'eb']);
});

function longSong() {
  const e = newEditor();
  for (let i = 0; i < 120; i++) {
    e.enterFret(i % 15, i % 6);
    if (i % 8 === 7) e.insertBar();
  }
  return e.song;
}

test('text layout: aligned rows that respect the width', () => {
  const song = longSong();
  for (const width of [40, 60, 80, 100]) {
    const systems = layoutSection(song.sections[0], song.tuning, width);
    assert.ok(systems.length > 1);
    for (const sys of systems) {
      const lens = new Set(sys.lines.map((l) => l.length));
      assert.equal(lens.size, 1, 'all string lines in a row have equal length');
      assert.ok(sys.lines[0].length <= width, `line fits in ${width}`);
      assert.ok(sys.lines.every((l) => /\|$/.test(l)));
    }
  }
});

test('text export content', () => {
  const e = newEditor();
  e.song.artist = 'Band';
  e.song.capo = 2;
  e.enterFret(5, 4);
  e.technique('h');
  e.enterFret(7, 4);
  e.moveLeft();
  e.setLabel('Am');
  const txt = songToText(e.song);
  assert.match(txt, /^Test\n====\nby Band\nTuning: E A D G B E {2}\| {2}Capo: fret 2/);
  assert.match(txt, /\[Intro\]\n {3}Am\ne\|-----\|\nB\|-5h7-\|/);
  assert.match(txt, /h {2}hammer-on/);
  // trailing empty columns are trimmed
  assert.ok(!/-{10}/.test(txt));
});

test('pdf: valid structure with correct xref offsets', () => {
  const song = longSong();
  song.title = 'Smoke (test) \\ “quotes” — dash';
  song.sections[0].notes = 'Some notes about this riff. '.repeat(20);
  for (let i = 0; i < 12; i++) song.sections.push(JSON.parse(JSON.stringify(song.sections[0])));
  const bytes = songToPdf(song, { pageSize: 'letter' });
  const str = Buffer.from(bytes).toString('latin1');
  assert.ok(str.startsWith('%PDF-1.4'));
  assert.ok(str.trimEnd().endsWith('%%EOF'));
  const startxref = Number(/startxref\n(\d+)/.exec(str)[1]);
  assert.ok(str.slice(startxref).startsWith('xref'));
  const entries = [...str.slice(startxref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
  entries.forEach((off, i) => assert.ok(str.slice(off).startsWith(`${i + 1} 0 obj`), `object ${i + 1} offset`));
  const pages = Number(/\/Type \/Pages \/Kids \[[^\]]*\] \/Count (\d+)/.exec(str)[1]);
  assert.ok(pages > 1, 'long song spans multiple pages');
  // stream lengths are exact
  for (const m of str.matchAll(/<< \/Length (\d+) >>\nstream\n/g)) {
    const start = m.index + m[0].length;
    assert.equal(str.slice(start + Number(m[1]), start + Number(m[1]) + 10), '\nendstream');
  }
});

test('pdfString escapes', () => {
  assert.equal(pdfString('a(b)c\\'), '(a\\(b\\)c\\\\)');
  assert.equal(pdfString('—é'), '(\\227\\351)');
});

test('normalizeSong repairs partial data', () => {
  const s = normalizeSong({ title: 'x', tuning: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'], sections: [{ name: 'A', columns: [{ type: 'note', cells: ['1'] }, { type: 'bar' }] }] });
  assert.equal(s.sections[0].columns[0].cells.length, 6);
  assert.equal(s.sections[0].columns[1].type, 'bar');
});
