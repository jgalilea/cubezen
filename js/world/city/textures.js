// Procedural 32x32 pixel textures for the city (all original), repainted per season, plus the
// emissive twin of the atlas (lit windows, shop glass, neon tubes, vending machines). The street
// is seen from close up, so its tiles have twice the valley's resolution to keep the pixels small.
import { rng, pixelTexture } from '../common.js';

export const T = {
  asphalt: 0, lane: 1, zebra: 2, zebraX: 3, walk: 4, curb: 5,
  wallA: 6, wallB: 7, wallTile: 8, brick: 9,
  winWarm: 10, winCool: 11, winPink: 12, winDark: 13,
  shop: 14, shutter: 15, door: 16, glass: 17, glassLit: 18, roof: 19, metal: 20, vending: 21,
  steel: 22, rail: 23, leaves: 24, trunk: 25, neonPink: 26, neonCyan: 27, planter: 28, awning: 29,
  railing: 30, aircon: 31,
};
const COLS = 8, ROWS = 4, S = 32;

export function tileUV(tile) {
  const c = tile % COLS, r = Math.floor(tile / COLS);
  const e = 0.02 / (COLS * S);
  return [c / COLS + e, 1 - (r + 1) / ROWS + e, (c + 1) / COLS - e, 1 - r / ROWS - e];
}

export const SEASONS = {
  spring: { leaves: ['#d86a8a', '#f08aa8', '#ffb0c8', '#ffd8e4'], snow: false,
    particles: { kind: 'petal', colors: ['#ffc0dc', '#f7a1c8', '#ffe3ef'], count: 160 } },
  summer: { leaves: ['#245a40', '#357a48', '#4e9a50', '#78bc5e'], snow: false,
    particles: { kind: 'pollen', colors: ['#fff3b0', '#ffd0f0'], count: 50 } },
  autumn: { leaves: ['#9a3a1e', '#c85a26', '#e88a34', '#f6b44e'], snow: false,
    particles: { kind: 'petal', colors: ['#e07a2e', '#c8501e', '#f0b040'], count: 90 } },
  winter: { leaves: ['#5a4a46', '#6a5a52', '#d8e0ee', '#f4f8ff'], snow: true,
    particles: { kind: 'snow', colors: ['#ffffff', '#eef4ff'], count: 650 } },
};

const dim = (hex, k) => '#' + [1, 3, 5].map((i) => Math.min(255, Math.round(parseInt(hex.slice(i, i + 2), 16) * k)).toString(16).padStart(2, '0')).join('');

export function createAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = COLS * S;
  canvas.height = ROWS * S;
  const emissiveCanvas = document.createElement('canvas');
  emissiveCanvas.width = canvas.width;
  emissiveCanvas.height = canvas.height;
  const map = pixelTexture(canvas), emissiveMap = pixelTexture(emissiveCanvas);

  function paint(seasonName) {
    const season = SEASONS[seasonName];
    const g = canvas.getContext('2d'), eg = emissiveCanvas.getContext('2d');
    g.clearRect(0, 0, canvas.width, canvas.height);
    eg.fillStyle = '#000';
    eg.fillRect(0, 0, canvas.width, canvas.height);
    const r = rng(1337);
    const pick = (a) => a[Math.floor(r() * a.length)];
    const ri = (n) => Math.floor(r() * n);

    const tile = (id, draw) => {
      const ox = (id % COLS) * S, oy = Math.floor(id / COLS) * S;
      const px = (x, y, c) => { if (x >= 0 && y >= 0 && x < S && y < S) { g.fillStyle = c; g.fillRect(ox + x, oy + y, 1, 1); } };
      const glow = (x, y, c) => { if (x >= 0 && y >= 0 && x < S && y < S) { eg.fillStyle = c; eg.fillRect(ox + x, oy + y, 1, 1); } };
      const rect = (x0, y0, x1, y1, c) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) px(x, y, c); };
      draw(px, glow, rect);
    };
    // Soft value clusters picking from a dark-to-light palette, plus grain.
    const fill = (px, pal, { cell = 8, grain = 0.15, bias = 0, x0 = 0, y0 = 0, x1 = S, y1 = S } = {}) => {
      const n = Math.ceil(S / cell) + 1, grid = Array.from({ length: n * n }, r);
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const v = grid[Math.floor(y / cell) * n + Math.floor(x / cell)] * 0.55 + r() * grain + 0.45 * 0.5 + bias - grain / 2;
        px(x, y, pal[Math.max(0, Math.min(pal.length - 1, Math.floor(v * pal.length)))]);
      }
    };

    const snow = season.snow;

    // ---------- ground ----------
    const ASPHALT = ['#24242e', '#2a2a36', '#30303c', '#363644'];
    const asphalt = (px) => {
      fill(px, ASPHALT, { cell: 3, grain: 0.4 });
      for (let i = 0; i < 26; i++) px(ri(S), ri(S), pick(['#444452', '#4a4a5a', '#1c1c24']));
      if (r() < 0.9) {                                          // a hairline crack
        let x = ri(S), y = ri(S);
        for (let i = 0; i < 12; i++) { px(x, y, '#1a1a22'); x += ri(3) - 1; y += 1; }
      }
    };
    tile(T.asphalt, asphalt);
    const paintLine = (px, x, y) => px(x, y, r() < 0.12 ? '#a8a8a0' : r() < 0.3 ? '#c8c8bc' : '#dcdcd0');
    tile(T.lane, (px) => { asphalt(px); for (let y = 0; y < S; y++) for (let x = 14; x < 18; x++) paintLine(px, x, y); });
    tile(T.zebra, (px) => { asphalt(px); for (let y = 0; y < S; y++) for (let x = 3; x < 18; x++) if (r() > 0.05) paintLine(px, x, y); });
    tile(T.zebraX, (px) => { asphalt(px); for (let y = 3; y < 18; y++) for (let x = 0; x < S; x++) if (r() > 0.05) paintLine(px, x, y); });
    // Pavement: four slabs per block, each a slightly different tone.
    const WALK = snow ? ['#9aa0b4', '#b4bacc', '#ccd2e2', '#e4e8f4'] : ['#54525e', '#5e5c68', '#686672', '#72707c'];
    tile(T.walk, (px) => {
      for (let sy = 0; sy < 2; sy++) for (let sx = 0; sx < 2; sx++) {
        const b = (r() - 0.5) * 0.25;
        fill(px, WALK, { cell: 4, grain: 0.3, bias: b, x0: sx * 16, y0: sy * 16, x1: sx * 16 + 16, y1: sy * 16 + 16 });
      }
      for (let i = 0; i < S; i++) { px(i, 15, WALK[0]); px(i, 31, WALK[0]); px(15, i, WALK[0]); px(31, i, WALK[0]); px(i, 16, WALK[3]); px(16, i, WALK[3]); }
    });
    // The kerb stones, with the yellow tactile strip along them.
    tile(T.curb, (px) => {
      fill(px, ['#7a7884', '#86848e', '#908e98'], { cell: 4, grain: 0.3 });
      for (let y = 0; y < S; y++) { px(30, y, '#5a5864'); px(31, y, '#3a3844'); px(0, y, '#5a5864'); }
      if (!snow) for (let y = 0; y < S; y++) for (let x = 6; x < 18; x++) px(x, y, (x % 4 === 0 || y % 4 === 0) ? '#b8962a' : '#d8b440');
      for (let y = 7; y < S; y += 8) for (let x = 1; x < 30; x++) if (x < 6 || x >= 18 || snow) px(x, y, '#6a6874');
    });

    // ---------- walls ----------
    const WALL_A = ['#6e6a7a', '#7a7686', '#868292', '#928e9e'];
    const WALL_B = ['#3a3846', '#42404e', '#4a4856', '#52505e'];
    const streaks = (px, pal, n = 4) => {
      for (let i = 0; i < n; i++) {
        const x = ri(S), y0 = ri(10), len = 8 + ri(S);
        for (let y = y0; y < Math.min(S, y0 + len); y++) if (r() < 0.75) { px(x, y, pal[0]); if (r() < 0.3) px(x + 1, y, pal[0]); }
      }
    };
    // Cast concrete: panels with a seam and the little tie holes left by the formwork.
    const concrete = (px, pal) => {
      fill(px, pal, { cell: 6, grain: 0.22 });
      for (let x = 0; x < S; x++) { px(x, 15, pal[0]); px(x, 16, pal[3]); }
      for (let y = 0; y < S; y++) px(0, y, pal[0]);
      for (const [hx, hy] of [[6, 7], [24, 7], [6, 23], [24, 23]]) { px(hx, hy, '#2a2834'); px(hx + 1, hy, pal[0]); px(hx, hy + 1, pal[0]); }
      streaks(px, pal);
    };
    tile(T.wallA, (px) => concrete(px, WALL_A));
    tile(T.wallB, (px) => concrete(px, WALL_B));
    // Small square tiles, the classic finish of a mid-rise block.
    tile(T.wallTile, (px) => {
      const TL = ['#a8a6b4', '#b0aebc', '#b8b6c4', '#c2c0ce'];
      for (let ty = 0; ty < 8; ty++) for (let tx = 0; tx < 8; tx++) {
        const c = pick(TL);
        for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
          const grout = x === 3 || y === 3;
          px(tx * 4 + x, ty * 4 + y, grout ? '#8c8a98' : (x === 0 && y === 0 ? dim(c, 1.06) : c));
        }
      }
      streaks(px, ['#9a98a6'], 3);
    });
    tile(T.brick, (px) => {
      const BR = ['#4e2a2e', '#5e3234', '#6c3a38', '#7a4440'];
      for (let row = 0; row < 8; row++) {
        const off = row % 2 ? 5 : 0;
        for (let bx = -1; bx < 4; bx++) {
          const c = pick(BR), x0 = bx * 10 + off;
          for (let y = row * 4; y < row * 4 + 4; y++) for (let x = x0; x < x0 + 10; x++) {
            if (x < 0 || x >= S) continue;
            const mortar = y % 4 === 3 || x === x0 + 9;
            px(x, y, mortar ? '#3a2428' : (y % 4 === 0 ? dim(c, 1.1) : r() < 0.15 ? dim(c, 0.88) : c));
          }
        }
      }
    });

    // ---------- windows ----------
    // An aluminium frame with a sill and two sliding panes; lit ones show a curtain, a blind and
    // a plant against the light, dark ones the sky reflected in the glass.
    const FRAME = '#262430', ALU = '#8a8896', SILL = '#6a6876';
    const windowTile = (id, lit) => tile(id, (px, glow, rect) => {
      fill(px, WALL_B, { cell: 6, grain: 0.2 });
      rect(3, 3, 29, 28, FRAME);
      rect(4, 4, 28, 27, ALU);
      rect(1, 27, 31, 30, SILL);
      for (let x = 1; x < 31; x++) px(x, 30, '#2a2834');
      const pane = (x0, x1, which) => {
        for (let y = 5; y < 26; y++) for (let x = x0; x < x1; x++) {
          if (!lit) {
            const refl = (x - y * 0.6 + 40) % 14;
            px(x, y, refl < 2 ? '#3a4466' : y < 12 ? '#22263c' : '#191b2c');
            continue;
          }
          const [a, b, c] = lit;
          let col = a;
          if (which === 0 && x < x0 + 5) col = (x - x0) % 3 === 0 ? dim(b, 0.85) : b;   // curtain drawn aside
          if (which === 1 && y < 9) col = y % 2 ? dim(b, 0.9) : b;                      // a blind half down
          if (which === 0 && y > 12 && y < 17 && x > x1 - 6 && x < x1 - 2) col = c;      // a lamp
          px(x, y, col);
          glow(x, y, col);
        }
      };
      pane(5, 16, 0);
      pane(16, 27, 1);
      for (let y = 5; y < 26; y++) { px(16, y, FRAME); px(15, y, ALU); }
      if (lit) for (let y = 20; y < 26; y++) for (let x = 19; x < 24; x++) if ((x + y) % 3 === 0 || y === 20) { px(x, y, '#3e5a3a'); glow(x, y, '#000'); }   // a plant on the sill
    });
    windowTile(T.winWarm, ['#ffd38a', '#e8a85a', '#fff2cc']);
    windowTile(T.winCool, ['#c4e0ff', '#8ab0e0', '#f2f8ff']);
    windowTile(T.winPink, ['#ff9ad4', '#d860a8', '#ffd8f0']);
    windowTile(T.winDark, null);

    // ---------- street level ----------
    // Shop glass: warm light, shelves of colourful goods; the glow is dimmer than the paint so
    // a street of shopfronts doesn't blow out to white.
    tile(T.shop, (px, glow) => {
      const GOODS = ['#ff7a7a', '#7ad0ff', '#ffe066', '#8ae28a', '#ff9ad4', '#c8a0ff', '#ffffff', '#ff9a4a'];
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        let c = y < 3 ? '#2a2834' : y === 3 ? '#fff6e0' : y > 26 ? '#e0b070' : '#f4d8a8';
        if (y > 3 && (y === 12 || y === 21 || y === 26)) c = '#8a6a5a';           // shelves
        else if (y > 4 && y < 26) {
          const slot = Math.floor(x / 3) + Math.floor(y / 9) * 11;
          const h = ((slot * 2654435761) >>> 0) % 997 / 997;
          if (h < 0.75 && y % 9 > (h < 0.3 ? 2 : 4)) c = GOODS[Math.floor(h * 97) % GOODS.length];
          if (x % 3 === 2) c = '#f4d8a8';
        }
        if (x === 0 || x === 31 || (x === 15 && y > 3)) c = '#2a2834';
        if (y === 22 && x % 7 === 3) c = '#ffffff';                                  // price tags
        px(x, y, c);
        if (y >= 3 && c !== '#2a2834') glow(x, y, dim(c, y === 3 ? 0.9 : 0.45));
      }
    });
    tile(T.shutter, (px) => {
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const rib = y % 3;
        px(x, y, rib === 0 ? '#464a58' : rib === 1 ? (r() < 0.08 ? '#5e6270' : '#6a6e7c') : '#585c6a');
      }
      for (let y = 0; y < S; y++) { px(0, y, '#2a2834'); px(31, y, '#2a2834'); }
      for (let x = 13; x < 19; x++) { px(x, 29, '#2a2834'); px(x, 30, '#9a9eaa'); }     // the handle
      const tag = pick(['#7a5a8a', '#3a7a8a', '#8a4a5a']);                          // a little graffiti tag
      let x = 4 + ri(8), y = 8 + ri(8);
      for (let i = 0; i < 18; i++) { px(x, y, tag); px(x + 1, y, tag); x += 1; y += Math.round(Math.sin(i * 0.9) * 1.4); }
    });
    tile(T.door, (px, glow) => {
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const frame = x < 3 || x > 28 || y < 2 || x === 15 || x === 16;
        let c = frame ? '#2a2834' : y > 28 ? '#d8b888' : '#ffe6b8';
        if (!frame && y > 8 && y < 18 && ((x > 4 && x < 11) || (x > 20 && x < 27))) c = y < 11 ? '#c83a4a' : '#f0e8d8';   // posters
        if ((x === 13 || x === 18) && y > 12 && y < 20) c = '#c0c0cc';                              // handles
        px(x, y, c);
        if (!frame && c !== '#c0c0cc') glow(x, y, dim(c, 0.75));
      }
    });
    tile(T.glass, (px) => {
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const mull = x % 8 === 0 || y % 8 === 0;
        const refl = (x - y * 0.7 + 64) % 23;
        px(x, y, mull ? '#2c3450' : refl < 2 ? '#2a3250' : y % 8 < 3 ? '#1e2440' : '#1a2036');
      }
    });
    tile(T.glassLit, (px, glow) => {
      for (let cy = 0; cy < 4; cy++) for (let cx = 0; cx < 4; cx++) {
        const lit = r() < 0.55, col = lit ? pick(['#d8ecff', '#fff0c8', '#c0d8ff', '#ffe2a8']) : '#1a2036';
        for (let y = 1; y < 8; y++) for (let x = 1; x < 8; x++) {
          const c = lit && y > 5 && r() < 0.4 ? dim(col, 0.7) : col;
          px(cx * 8 + x, cy * 8 + y, c);
          if (lit) glow(cx * 8 + x, cy * 8 + y, c);
        }
        for (let i = 0; i < 8; i++) { px(cx * 8, cy * 8 + i, '#2c3450'); px(cx * 8 + i, cy * 8, '#2c3450'); }
      }
    });
    tile(T.roof, (px) => {
      fill(px, snow ? ['#c8d0e0', '#dce2ee', '#eef2fa', '#ffffff'] : ['#3a3844', '#44424e', '#4e4c58', '#585662'], { cell: 3, grain: 0.45 });
      if (!snow) for (let i = 0; i < S; i++) { px(i, 0, '#5e5c68'); px(0, i, '#5e5c68'); }
    });
    // Ribbed sheet metal (rooftop units, water tanks) with a fan grille.
    tile(T.metal, (px) => {
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) px(x, y, x % 4 === 0 ? '#5a5e6a' : x % 4 === 1 ? '#8a8e9a' : '#767a86');
      for (let y = 8; y < 24; y++) for (let x = 8; x < 24; x++) {
        const d = Math.hypot(x - 15.5, y - 15.5);
        if (d < 8) px(x, y, d > 6.8 ? '#4a4e58' : (Math.floor(d) % 2 ? '#3a3e48' : '#4e525c'));
      }
      if (snow) for (let x = 0; x < S; x++) for (let y = 0; y < 3; y++) px(x, y, y ? '#e4ecf8' : '#f4f8ff');
    });
    tile(T.vending, (px, glow) => {
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) px(x, y, x < 2 || x > 29 ? '#c8c8d4' : '#e8e8f0');
      for (let y = 2; y < 21; y++) for (let x = 3; x < 29; x++) { px(x, y, '#cfe4ff'); glow(x, y, '#5a6a80'); }
      for (let row = 0; row < 3; row++) {
        for (let i = 0; i < 6; i++) {
          const c = pick(['#ff5a5a', '#4ab0ff', '#ffd23a', '#5ad87a', '#ff8ad0', '#ffffff', '#ff9a3a']);
          for (let y = 3 + row * 6; y < 7 + row * 6; y++) for (let dx = 0; dx < 3; dx++) {
            const cc = y === 3 + row * 6 ? '#e8e8f0' : c;
            px(4 + i * 4 + dx, y, cc); glow(4 + i * 4 + dx, y, dim(cc, 0.9));
          }
          px(5 + i * 4, 7 + row * 6, '#ff3a3a'); glow(5 + i * 4, 7 + row * 6, '#ff3a3a');   // the buttons
        }
      }
      for (let y = 22; y < 26; y++) for (let x = 20; x < 27; x++) px(x, y, '#3a3a46');      // coin slot panel
      for (let y = 27; y < 31; y++) for (let x = 4; x < 28; x++) px(x, y, '#2a2834');       // the tray
      for (let y = 1; y < 21; y++) { glow(2, y, '#c8d8ff'); glow(29, y, '#c8d8ff'); }
    });

    // ---------- railway ----------
    tile(T.steel, (px) => {
      fill(px, ['#24524a', '#2c6054', '#356e5e', '#3e7c68'], { cell: 6, grain: 0.2 });
      for (let x = 0; x < S; x++) { px(x, 0, '#4a8a74'); px(x, 1, '#3e7c68'); px(x, 30, '#1e443c'); px(x, 31, '#1a3a34'); }
      for (let x = 3; x < S; x += 6) for (const y of [4, 27]) { px(x, y, '#6aaa94'); px(x + 1, y + 1, '#1a3a34'); }   // rivets
      for (let x = 0; x < S; x++) if (r() < 0.25) px(x, 29, '#5a3a2a');                                               // rust at the seam
    });
    tile(T.rail, (px) => {
      fill(px, ['#3a3640', '#46424c', '#524e58'], { cell: 2, grain: 0.55 });
      for (let y = 2; y < S; y += 8) for (let x = 2; x < 30; x++) for (let k = 0; k < 3; k++) px(x, y + k, k === 0 ? '#6a5a4c' : '#5a4a3e');
      for (let y = 0; y < S; y++) for (const x of [6, 7, 24, 25]) px(x, y, x % 2 ? '#7a7a88' : '#b4b4c0');
    });

    // ---------- trees ----------
    // Leaves: soft clusters of light and shade with a few dark gaps, no grid to read as bricks.
    tile(T.leaves, (px) => {
      const L = season.leaves;
      if (snow) {
        for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) px(x, y, r() < 0.45 ? (r() < 0.5 ? L[2] : L[3]) : (r() < 0.5 ? L[0] : L[1]));
        return;
      }
      fill(px, L, { cell: 5, grain: 0.55, bias: 0.06 });
      for (let i = 0; i < 30; i++) {                           // little sunlit leaves
        const x = ri(31), y = ri(31);
        px(x, y, L[3]); px(x + 1, y, L[2]); px(x, y + 1, L[2]);
      }
      for (let i = 0; i < 24; i++) { const x = ri(S), y = ri(S); px(x, y, L[0]); px(x, y + 1, dim(L[0], 0.8)); }
    });
    tile(T.trunk, (px) => {
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const ridge = (x + Math.round(Math.sin(y * 0.5) * 1.2) + 5) % 5;
        px(x, y, ridge === 0 ? '#2e221e' : ridge === 1 ? '#3a2a26' : r() < 0.25 ? '#5a4036' : '#4a342e');
      }
    });

    // ---------- neon, planters, awnings ----------
    const neon = (id, tube, core) => tile(id, (px, glow) => {
      fill(px, WALL_B, { cell: 6, grain: 0.2 });
      for (let y = 0; y < S; y++) {
        for (let x = 12; x < 20; x++) {
          const c = x >= 14 && x < 18 ? core : tube;
          px(x, y, c); glow(x, y, c);
        }
        px(11, y, '#2a2834'); px(20, y, '#2a2834');
      }
      for (let y = 4; y < S; y += 10) for (let x = 10; x < 22; x++) { px(x, y, '#5a5866'); glow(x, y, '#000'); }   // clips
    });
    neon(T.neonPink, '#ff3fa4', '#ffd0ec');
    neon(T.neonCyan, '#22d8ff', '#d4faff');
    tile(T.planter, (px) => {
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        let c = (x + y) % 9 === 0 ? '#5a5864' : r() < 0.2 ? '#727080' : '#6a6874';
        if (y < 3) c = y === 0 ? '#9a98a4' : '#8a8894';
        if (y % 10 === 9) c = '#585664';
        px(x, y, c);
      }
    });
    tile(T.awning, (px) => {
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const red = Math.floor(x / 8) % 2 === 0;
        px(x, y, red ? (y % 8 === 0 ? '#a82a3a' : '#c83a4a') : (y % 8 === 0 ? '#d0c8c0' : '#e8e0d8'));
      }
      for (let x = 0; x < S; x++) px(x, 31, '#5a2a30');
      if (snow) for (let y = 0; y < 5; y++) for (let x = 0; x < S; x++) px(x, y, y < 4 ? '#f4f8ff' : '#dce4f0');
    });
    // Balcony railing: transparent between the bars (the block material has alphaTest).
    tile(T.railing, (px) => {
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        if (y < 3 || y > 29 || x % 6 === 0) px(x, y, y === 0 || (x % 6 === 0 && y > 2) ? '#9a98a6' : '#6a6876');
      }
    });
    // An air conditioner's outdoor unit: an off-white case with a round fan.
    tile(T.aircon, (px) => {
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        let c = r() < 0.1 ? '#c4c2c8' : '#d4d2d6';
        if (y < 2 || x < 1 || x > 30 || y > 29) c = '#9a98a0';
        const d = Math.hypot(x - 12, y - 15.5);
        if (d < 10.5) c = d > 9.5 ? '#7a7880' : ((Math.floor(d * 0.8 + Math.atan2(y - 15.5, x - 12) * 1.3) % 2 + 2) % 2 ? '#3a3a42' : '#4e4e56');
        if (x > 24 && x < 29 && y > 4 && y < 27 && y % 3 === 0) c = '#8a8890';      // side vents
        px(x, y, c);
      }
      if (snow) for (let x = 0; x < S; x++) for (let y = 0; y < 3; y++) px(x, y, '#f4f8ff');
    });

    map.needsUpdate = true;
    emissiveMap.needsUpdate = true;
  }

  return { map, emissiveMap, paint };
}
