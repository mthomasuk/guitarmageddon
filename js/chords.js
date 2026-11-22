// Common chord shapes for standard 6-string tuning, written low E -> high e.
// "x" = not played (left blank in the tab).

const RAW = {
  Major: { C: 'x32010', D: 'xx0232', E: '022100', F: '133211', G: '320003', A: 'x02220', B: 'x24442' },
  Minor: { Cm: 'x35543', Dm: 'xx0231', Em: '022000', Fm: '133111', Gm: '355333', Am: 'x02210', Bm: 'x24432' },
  '7th': {
    C7: 'x32310', D7: 'xx0212', E7: '020100', G7: '320001', A7: 'x02020', B7: 'x21202',
    Am7: 'x02010', Em7: '020000', Dm7: 'xx0211', Cmaj7: 'x32000', Fmaj7: 'xx3210', Amaj7: 'x02120',
  },
  'Sus / Add': {
    Dsus2: 'xx0230', Dsus4: 'xx0233', Asus2: 'x02200', Asus4: 'x02230', Esus4: '022200',
    Cadd9: 'x32033', 'G/B': 'x20003', 'D/F#': '200232',
  },
  Power: {
    E5: '022xxx', F5: '133xxx', G5: '355xxx', A5: 'x022xx', B5: 'x244xx', C5: 'x355xx', D5: 'xx023x',
  },
};

function parseShape(shape) {
  // shapes are single digit per string except where a 2-digit fret is needed (none here)
  return shape.split('').map((ch) => (ch === 'x' ? '' : ch));
}

export const CHORD_GROUPS = Object.entries(RAW).map(([group, chords]) => ({
  group,
  chords: Object.entries(chords).map(([name, shape]) => ({ name, frets: parseShape(shape) })),
}));

/** Fit a 6-string shape onto `count` strings. Returns null if impossible. */
export function fitShape(frets, count) {
  if (count === 6) return frets.slice();
  if (count > 6) return [...Array(count - 6).fill(''), ...frets];
  return null;
}
