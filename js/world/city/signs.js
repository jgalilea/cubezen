// Neon signs: a 3x5 pixel font for latin names, an invented blocky glyph script (not a real
// writing system: easier to read at this size than tiny kanji, and nothing to get wrong), a
// shared sign atlas, and the animated screens. All names and pictures are made up.
import * as THREE from 'three';
import { rng, pixelTexture } from '../common.js';

// ---------- 3x5 font ----------
const FONT = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
  F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010',
  K: '101110100110101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010',
  P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010',
  Z: '111001010100111', 0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110',
  4: '101101111001001', 5: '111100110001110', 6: '011100110101010', 7: '111001010010010', 8: '010101010101010',
  9: '010101011001110', '-': '000000111000000', ' ': '000000000000000', '&': '010101010101011', '.': '000000000000010',
  '!': '010010010000010', "'": '010010000000000', '+': '000010111010000', '*': '000101010101000',
};
export function textWidth(text, s) { return text.length * 4 * s - s; }
function drawText(g, text, x, y, s, color) {
  g.fillStyle = color;
  for (const ch of text.toUpperCase()) {
    const bits = FONT[ch] ?? FONT[' '];
    for (let i = 0; i < 15; i++) if (bits[i] === '1') g.fillRect(x + (i % 3) * s, y + Math.floor(i / 3) * s, s, s);
    x += 4 * s;
  }
}

// ---------- invented glyphs ----------
// Strokes between the points of a 3x3 lattice on a 7x7 grid: blocky, katakana-ish shapes.
const GLYPHS = (() => {
  const r = rng(4242), P = [0, 3, 6], out = [];
  const segs = [];
  for (let j = 0; j < 3; j++) for (let i = 0; i < 2; i++) { segs.push([i, j, i + 1, j]); segs.push([j, i, j, i + 1]); }
  for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) { segs.push([i, j, i + 1, j + 1]); segs.push([i + 1, j, i, j + 1]); }
  while (out.length < 64) {
    const n = 2 + Math.floor(r() * 3), chosen = new Set();
    while (chosen.size < n) chosen.add(Math.floor(r() * segs.length));
    const bits = new Uint8Array(49);
    let straight = 0;
    for (const k of chosen) {
      const [a, b, c, d] = segs[k];
      if (a === c || b === d) straight++;
      const x0 = P[a], y0 = P[b], x1 = P[c], y1 = P[d], steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
      for (let t = 0; t <= steps; t++) bits[Math.round(y0 + (y1 - y0) * t / steps) * 7 + Math.round(x0 + (x1 - x0) * t / steps)] = 1;
    }
    if (straight >= 1) out.push(bits);
  }
  return out;
})();
function drawGlyph(g, idx, x, y, s, color) {
  const bits = GLYPHS[idx % GLYPHS.length];
  g.fillStyle = color;
  for (let i = 0; i < 49; i++) if (bits[i]) g.fillRect(x + (i % 7) * s, y + Math.floor(i / 7) * s, s, s);
}

export const NEON = ['#ff3fa4', '#e040ff', '#2ee6ff', '#4a7bff', '#ff3b3b', '#ff9a2e', '#ffe23a', '#3dff8a', '#f4f4ff'];
const PANEL = ['#ffe23a', '#ff3b3b', '#f4f4ff', '#2e6bff', '#ff7a1e', '#ff3fa4', '#18c48a'];
const dark = '#160c1e';

// Invented names: the kinds of places you'd find on a busy shopping street.
export const NAMES = [
  'RAMEN TORA', 'BIT BURGER', 'KARAOKE 88', 'MOCHI MART', 'NEKO GAMES', 'DENKI LAND', 'CAFE CUBE',
  'SUSHI GO', 'HOTEL LUNA', 'PACHI-PON', 'NOODLE BAR', 'PHARMACY', 'BOOKS', 'IZAKAYA', 'GAME CENTER',
  'GYOZA 24H', 'PIXEL PALACE', 'TAKO TACO', 'KISSA', 'CAMERA', 'OKONOMI', 'TEA HOUSE', 'MANGA',
  'SOBA', 'ARCADE', 'YAKITORI', 'CURRY', 'BAR 7', 'CLUB ORBIT', 'RECORDS', 'DRUG STORE', 'BANK',
];

// ---------- the atlas ----------
export function createSignAtlas(size = 1024) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, size, size);
  const texture = pixelTexture(canvas);
  let sx = 0, sy = 0, shelf = 0;
  // Shelf packing: good enough for a few dozen rectangles.
  function alloc(w, h) {
    if (sx + w > size) { sx = 0; sy += shelf + 1; shelf = 0; }
    if (sy + h > size) return null;
    const rect = { x: sx, y: sy, w, h };
    sx += w + 1;
    shelf = Math.max(shelf, h);
    return rect;
  }
  const uv = (rc) => [rc.x / size, 1 - (rc.y + rc.h) / size, (rc.x + rc.w) / size, 1 - rc.y / size];
  return { canvas, g, texture, alloc, uv };
}

// Paints one sign into the atlas and returns its UV rect, or null when the atlas is full.
// spec: { kind: blade|stack|board|roof, w, h (in blocks), color, style: neon|panel, text, seed }
export function paintSign(atlas, spec) {
  const PX = 16;
  const W = Math.round(spec.w * PX), H = Math.round(spec.h * PX);
  const rc = atlas.alloc(W, H);
  if (!rc) return null;
  const g = atlas.g, r = rng(spec.seed);
  const { x, y } = rc;
  const main = spec.color;
  const border = (col) => { g.fillStyle = col; g.fillRect(x, y, W, 1); g.fillRect(x, y + H - 1, W, 1); g.fillRect(x, y, 1, H); g.fillRect(x + W - 1, y, 1, H); };
  const bg = (col) => { g.fillStyle = col; g.fillRect(x, y, W, H); };
  const glyphCol = (x0, y0, x1, y1, fg, s) => {     // a column of glyphs centred in a box
    const gw = 7 * s, pitch = 7 * s + Math.max(2, s + 1);
    const n = Math.max(1, Math.floor((y1 - y0 - 2) / pitch));
    const top = y0 + Math.floor((y1 - y0 - n * pitch + (pitch - gw)) / 2);
    for (let i = 0; i < n; i++) drawGlyph(g, Math.floor(r() * 64), x0 + Math.floor((x1 - x0 - gw) / 2), top + i * pitch, s, fg);
  };

  if (spec.kind === 'stack') {
    // A tenant board: a column of small panels in different colours, one or two glyphs each.
    let cy = y;
    while (cy < y + H) {
      const ph = Math.min(y + H - cy, (r() < 0.5 ? 1 : 2) * PX);
      const col = PANEL[Math.floor(r() * PANEL.length)];
      g.fillStyle = col;
      g.fillRect(x, cy, W, ph);
      const fg = col === '#ffe23a' || col === '#f4f4ff' ? dark : '#ffffff';
      glyphCol(x, cy, x + W, cy + ph, fg, W >= 18 ? 2 : 1);
      g.fillStyle = dark;
      g.fillRect(x, cy + ph - 1, W, 1);
      cy += ph;
    }
    border('#2a2030');
  } else if (spec.kind === 'blade') {
    if (spec.style === 'panel') {
      bg(main);
      const fg = main === '#ffe23a' || main === '#f4f4ff' ? dark : '#ffffff';
      glyphCol(x, y + 2, x + W, y + H - 2, fg, 2);
      border(dark);
    } else {
      bg(dark);
      glyphCol(x, y + 2, x + W, y + H - 2, main, 2);
      border(main);
    }
  } else {
    // board (shop sign) or roof: a latin name, as big as fits, maybe with a row of glyphs.
    const text = spec.text;
    let s = 4;
    while (s > 1 && (textWidth(text, s) > W - 6 || 5 * s > H - 4)) s--;
    const tw = textWidth(text, s), th = 5 * s;
    const panel = spec.style === 'panel';
    bg(panel ? main : dark);
    const fg = panel ? (main === '#ffe23a' || main === '#f4f4ff' ? dark : '#ffffff') : main;
    const tx = x + Math.floor((W - tw) / 2), ty = y + Math.floor((H - th) / 2);
    if (!panel) {                                         // a soft halo behind neon letters
      g.globalAlpha = 0.35;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) drawText(g, text, tx + dx, ty + dy, s, main);
      g.globalAlpha = 1;
      drawText(g, text, tx, ty, s, '#ffffff');
      g.globalAlpha = 0.55;
      drawText(g, text, tx, ty, s, main);
      g.globalAlpha = 1;
    } else drawText(g, text, tx, ty, s, fg);
    // Little glyphs either side of the name when there's room.
    const room = Math.floor((W - tw) / 2) - 4;
    if (room >= 9 && H >= 11) {
      for (const gx of [x + 2, x + W - 2 - 7]) drawGlyph(g, Math.floor(r() * 64), gx, y + Math.floor((H - 7) / 2), 1, fg);
    }
    border(panel ? dark : main);
  }
  atlas.texture.needsUpdate = true;
  return atlas.uv(rc);
}

// One quad per sign, merged into one geometry. `normal` is the side it faces: 'x+', 'x-' or 'z+'.
// Each quad's vertex colours hold its brightness, so signs can flicker.
export function buildSignGeometry(list) {
  const pos = [], uv = [], col = [], nor = [], index = [];
  for (const s of list) {
    const n = { 'x+': [1, 0, 0], 'x-': [-1, 0, 0], 'z+': [0, 0, 1] }[s.normal];
    const right = { 'x+': [0, 0, -1], 'x-': [0, 0, 1], 'z+': [1, 0, 0] }[s.normal];
    const hw = s.w / 2, hh = s.h / 2, base = pos.length / 3;
    s.vertex = base;
    const [u0, v0, u1, v1] = s.uv;
    for (const [a, b, uu, vv] of [[-1, -1, u0, v0], [1, -1, u1, v0], [1, 1, u1, v1], [-1, 1, u0, v1]]) {
      pos.push(s.x + right[0] * hw * a, s.y + hh * b, s.z + right[2] * hw * a);
      uv.push(uu, vv);
      col.push(1, 1, 1);
      nor.push(...n);
    }
    index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(index);
  return g;
}

// ---------- animated screens ----------
// A big LED screen that cycles through made-up adverts: a pixel character, a drink, a scroll.
export function createScreen(w, h, seed) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  const texture = pixelTexture(canvas);
  const r = rng(seed);
  const hairs = ['#3a2a8a', '#ff6ab0', '#2ad0ff', '#ffd23a', '#1a1a2a', '#ff7a3a'];
  const skies = [['#2a0a4a', '#ff3fa4'], ['#0a1a4a', '#2ee6ff'], ['#3a0a1a', '#ff9a2e']];
  let ad = 0, adTime = 0, hair = hairs[0], sky = skies[0], glyphs = [];

  function character(time) {
    const [a, b] = sky;
    for (let y = 0; y < h; y++) { g.fillStyle = y % 2 ? a : mix(a, b, y / h); g.fillRect(0, y, w, 1); }
    const cx = Math.floor(w * 0.36), fw = Math.floor(h * 0.62), fy = Math.floor(h * 0.22);
    // hair behind, face, fringe
    g.fillStyle = hair;
    g.fillRect(cx - fw / 2 - 3, fy - 4, fw + 6, Math.floor(fw * 1.25));
    g.fillStyle = '#ffd8c4';
    g.fillRect(cx - fw / 2, fy + 2, fw, Math.floor(fw * 0.95));
    g.fillRect(cx - fw / 2 + 2, fy + Math.floor(fw * 0.95) + 2, fw - 4, 2);
    g.fillStyle = hair;
    for (let i = 0; i < fw + 6; i += 3) g.fillRect(cx - fw / 2 - 3 + i, fy - 4, 3, 7 + ((i / 3) % 2) * 3);
    // big eyes that blink
    const blink = (time % 4.3) < 0.15;
    const ey = fy + Math.floor(fw * 0.42);
    for (const ex of [cx - Math.floor(fw * 0.26), cx + Math.floor(fw * 0.1)]) {
      if (blink) { g.fillStyle = '#3a2030'; g.fillRect(ex, ey + 2, 5, 1); continue; }
      g.fillStyle = '#1a1030'; g.fillRect(ex, ey, 5, 6);
      g.fillStyle = hair; g.fillRect(ex + 1, ey + 2, 3, 3);
      g.fillStyle = '#ffffff'; g.fillRect(ex + 1, ey + 1, 2, 2);
    }
    g.fillStyle = '#ff7a9a';
    g.fillRect(cx - 2, fy + Math.floor(fw * 0.78), 4, 1);
    // a little tagline
    drawText(g, 'CUBE', Math.floor(w * 0.66), Math.floor(h * 0.25), 1, '#ffffff');
    drawText(g, 'POP', Math.floor(w * 0.68), Math.floor(h * 0.25) + 7, 1, b);
    for (let i = 0; i < 2; i++) drawGlyph(g, glyphs[i], Math.floor(w * 0.66) + i * 9, Math.floor(h * 0.55), 1, '#ffffff');
  }
  function drink(time) {
    g.fillStyle = '#ff3b3b'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < w + h; i += 6) { g.fillStyle = '#ff5a4a'; for (let k = 0; k < 3; k++) g.fillRect(i - k - Math.floor(time * 8) % 6, k, 1, 1); }
    const bx = Math.floor(w * 0.18), by = Math.floor(h * 0.18) + Math.round(Math.sin(time * 3) * 1.5), bw = Math.floor(h * 0.3), bh = Math.floor(h * 0.62);
    g.fillStyle = '#f4f4ff'; g.fillRect(bx, by, bw, bh);
    g.fillStyle = '#2e6bff'; g.fillRect(bx, by + Math.floor(bh * 0.35), bw, Math.floor(bh * 0.3));
    g.fillStyle = '#c8c8d8'; g.fillRect(bx + 1, by - 2, bw - 2, 2);
    drawText(g, 'CUBE', Math.floor(w * 0.45), Math.floor(h * 0.22), 2, '#ffffff');
    drawText(g, 'COLA', Math.floor(w * 0.45), Math.floor(h * 0.22) + 12, 2, '#ffe23a');
    for (let i = 0; i < 4; i++) drawGlyph(g, glyphs[i], Math.floor(w * 0.45) + i * 9, Math.floor(h * 0.78) - 3, 1, '#ffffff');
  }
  function scroll(time) {
    g.fillStyle = '#0a0a1a'; g.fillRect(0, 0, w, h);
    const off = Math.floor(time * 14) % 10;
    for (let row = 0; row < Math.floor(h / 10); row++) {
      const c = NEON[(row * 3 + ad) % NEON.length];
      for (let i = -1; i < w / 10 + 1; i++) drawGlyph(g, glyphs[(i + row * 5 + 64) % glyphs.length], i * 10 + (row % 2 ? off : -off) + 1, row * 10 + 2, 1, c);
    }
  }
  const ADS = [character, drink, scroll];
  function next() {
    ad = (ad + 1) % ADS.length;
    hair = hairs[Math.floor(r() * hairs.length)];
    sky = skies[Math.floor(r() * skies.length)];
    glyphs = Array.from({ length: 12 }, () => Math.floor(r() * 64));
  }
  next();
  return {
    texture,
    update(time) {
      if (time - adTime > 9) { adTime = time; next(); }
      ADS[ad](time);
      // LED rows: every other line slightly darker
      g.fillStyle = 'rgba(0,0,0,0.18)';
      for (let y = 1; y < h; y += 2) g.fillRect(0, y, w, 1);
      texture.needsUpdate = true;
    },
  };
}

function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const c = [16, 8, 0].map((s) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
