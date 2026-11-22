// Small inline SVG glyphs for note and rest lengths (Unicode music symbols
// are missing from many phone fonts, so we draw our own).

const svg = (body, cls = '') =>
  `<svg class="glyph ${cls}" viewBox="0 0 16 24" width="13" height="20" aria-hidden="true">${body}</svg>`;

const FLAGS = { 8: 1, 16: 2, 32: 3 };

export function noteGlyph(dur = 8, dot = false) {
  let body = '';
  const hollow = dur <= 2;
  if (dur === 1) {
    body += '<ellipse cx="7" cy="18" rx="4.2" ry="2.9" fill="none" stroke="currentColor" stroke-width="1.6"/>';
  } else {
    body += `<ellipse cx="5" cy="19" rx="3.6" ry="2.6" transform="rotate(-20 5 19)" ${
      hollow ? 'fill="none" stroke="currentColor" stroke-width="1.4"' : 'fill="currentColor"'
    }/>`;
    body += '<path d="M8.2 18.6V2.5" stroke="currentColor" stroke-width="1.3"/>';
    for (let i = 0; i < (FLAGS[dur] || 0); i++) {
      const y = 2.5 + i * 4;
      body += `<path d="M8.2 ${y}C9 ${y + 3} 13.5 ${y + 4} 12.5 ${y + 8.5}" fill="none" stroke="currentColor" stroke-width="1.3"/>`;
    }
  }
  if (dot) body += '<circle cx="14" cy="19" r="1.4" fill="currentColor"/>';
  return svg(body);
}

export function restGlyph(dur = 8, dot = false) {
  let body = '';
  if (dur === 1) body = '<path d="M1.5 9H14.5" stroke="currentColor" stroke-width="1"/><rect x="3.5" y="9" width="9" height="3.2" fill="currentColor"/>';
  else if (dur === 2) body = '<path d="M1.5 13H14.5" stroke="currentColor" stroke-width="1"/><rect x="3.5" y="9.8" width="9" height="3.2" fill="currentColor"/>';
  else if (dur === 4)
    body = '<path d="M6 3.5L10 8.5L6.5 12.5L10 16.8C7 15.6 5.4 18 8.4 21" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>';
  else {
    const n = FLAGS[dur] || 1;
    body += `<path d="M${11 - (n - 1) * 0.8} 6L${6.5 - n * 0.6} ${15 + n * 2.5}" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>`;
    for (let i = 0; i < n; i++) {
      const y = 7 + i * 4.5;
      const x = 6 - i * 0.8;
      body += `<circle cx="${x}" cy="${y}" r="1.9" fill="currentColor"/><path d="M${x + 0.5} ${y + 1}C${x + 2} ${y + 1.6} ${x + 4} ${y + 0.6} ${x + 5} ${y - 1}" fill="none" stroke="currentColor" stroke-width="1.3"/>`;
    }
  }
  if (dot) body += '<circle cx="14" cy="12" r="1.4" fill="currentColor"/>';
  return svg(body, 'rest');
}

export const DURATION_NAMES = { 1: 'whole', 2: 'half', 4: 'quarter', 8: 'eighth', 16: '16th', 32: '32nd' };
export const DURATION_FRACTIONS = { 1: '1', 2: '½', 4: '¼', 8: '⅛', 16: '1/16', 32: '1/32' };
