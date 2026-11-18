// Procedural 16x16 pixel textures for the city (all original), repainted per season, plus the
// emissive twin of the atlas (lit windows, shop glass, neon tubes, vending machines).
import { rng, pixelTexture } from '../common.js';

export const T = {
  asphalt: 0, lane: 1, zebra: 2, zebraX: 3, walk: 4, curb: 5,
  wallA: 6, wallB: 7, wallTile: 8, brick: 9,
  winWarm: 10, winCool: 11, winPink: 12, winDark: 13,
  shop: 14, shutter: 15, door: 16, glass: 17, glassLit: 18, roof: 19, metal: 20, vending: 21,
  steel: 22, rail: 23, leaves: 24, trunk: 25, neonPink: 26, neonCyan: 27, planter: 28, awning: 29,
};
const COLS = 8, ROWS = 4, S = 16;

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

    const tile = (id, draw) => {
      const ox = (id % COLS) * S, oy = Math.floor(id / COLS) * S;
      const px = (x, y, c) => { if (x >= 0 && y >= 0 && x < S && y < S) { g.fillStyle = c; g.fillRect(ox + x, oy + y, 1, 1); } };
      const glow = (x, y, c) => { if (x >= 0 && y >= 0 && x < S && y < S) { eg.fillStyle = c; eg.fillRect(ox + x, oy + y, 1, 1); } };
      draw(px, glow);
    };
    // Soft value clusters picking from a dark-to-light palette, plus grain.
    const fill = (px, pal, { cell = 4, grain = 0.15, bias = 0, x0 = 0, y0 = 0, x1 = S, y1 = S } = {}) => {
      const n = Math.ceil(S / cell) + 1, grid = Array.from({ length: n * n }, r);
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const v = grid[Math.floor(y / cell) * n + Math.floor(x / cell)] * 0.55 + r() * grain + 0.45 * 0.5 + bias - grain / 2;
        px(x, y, pal[Math.max(0, Math.min(pal.length - 1, Math.floor(v * pal.length)))]);
      }
    };

    const snow = season.snow;
    const ASPHALT = ['#24242e', '#2a2a36', '#30303c', '#363644'];
    const asphalt = (px) => {
      fill(px, ASPHALT, { cell: 2, grain: 0.35 });
      for (let i = 0; i < 6; i++) px(Math.floor(r() * S), Math.floor(r() * S), '#4a4a5a');
    };
    tile(T.asphalt, asphalt);
    tile(T.lane, (px) => { asphalt(px); for (let y = 0; y < S; y++) { px(7, y, '#d8d8cc'); px(8, y, '#c8c8bc'); } });
    tile(T.zebra, (px) => { asphalt(px); for (let y = 0; y < S; y++) for (let x = 2; x < 9; x++) if (r() > 0.06) px(x, y, r() < 0.2 ? '#c4c4c0' : '#dcdcd6'); });
    tile(T.zebraX, (px) => { asphalt(px); for (let y = 2; y < 9; y++) for (let x = 0; x < S; x++) if (r() > 0.06) px(x, y, r() < 0.2 ? '#c4c4c0' : '#dcdcd6'); });
    const WALK = snow ? ['#9aa0b4', '#b4bacc', '#ccd2e2', '#e4e8f4'] : ['#54525e', '#5e5c68', '#686672', '#72707c'];
    tile(T.walk, (px) => {
      fill(px, WALK, { cell: 4, grain: 0.3 });
      for (let i = 0; i < S; i++) { px(i, 7, WALK[0]); px(i, 15, WALK[0]); px(7, i, WALK[0]); px(15, i, WALK[0]); }
    });
    tile(T.curb, (px) => { fill(px, ['#7a7884', '#86848e', '#908e98'], { grain: 0.3 }); for (let y = 0; y < S; y++) px(15, y, '#4a4854'); });

    const WALL_A = ['#6e6a7a', '#7a7686', '#868292', '#928e9e'];
    const WALL_B = ['#3a3846', '#42404e', '#4a4856', '#52505e'];
    const stains = (px, pal) => { for (let i = 0; i < 3; i++) { const x = Math.floor(r() * S); for (let y = Math.floor(r() * 6); y < S; y += 1) if (r() < 0.6) px(x, y, pal[0]); } };
    tile(T.wallA, (px) => { fill(px, WALL_A, { cell: 4, grain: 0.25 }); stains(px, WALL_A); });
    tile(T.wallB, (px) => { fill(px, WALL_B, { cell: 4, grain: 0.25 }); stains(px, WALL_B); });
    tile(T.wallTile, (px) => {
      fill(px, ['#a8a6b4', '#b4b2c0', '#bebcca'], { cell: 4, grain: 0.2 });
      for (let i = 0; i < S; i++) { px(i, 3, '#8c8a98'); px(i, 11, '#8c8a98'); }
      for (let y = 0; y < S; y++) { px((y < 4 || y > 11) ? 5 : 13, y, '#8c8a98'); }
    });
    tile(T.brick, (px) => {
      const B = ['#4e2a2e', '#5e3234', '#6c3a38', '#7a4440'];
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const row = Math.floor(y / 4), off = row % 2 ? 4 : 0;
        const mortar = y % 4 === 3 || (x + off) % 8 === 7;
        px(x, y, mortar ? '#3a2428' : pick(B));
      }
    });

    // Windows: a dark frame and a sill, glass that is either lit (with a curtain or a lamp) or dark.
    const FRAME = '#262430', SILL = '#5a5866';
    const windowTile = (id, lit) => tile(id, (px, glow) => {
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) px(x, y, FRAME);
      for (let x = 0; x < S; x++) px(x, 15, SILL);
      for (let y = 2; y < 14; y++) for (let x = 2; x < 14; x++) {
        if (!lit) { px(x, y, (x + y) % 9 === 0 || (x + y) % 9 === 1 ? '#323a56' : y < 7 ? '#1e2236' : '#181a2a'); continue; }
        const [a, b, c] = lit;
        const curtain = x < 5 || (y < 4);
        const col = curtain ? b : (y > 10 && x > 9) ? c : a;
        px(x, y, col);
        glow(x, y, col);
      }
      for (let y = 2; y < 14; y++) px(8, y, FRAME);             // the mullion
    });
    windowTile(T.winWarm, ['#ffd38a', '#e8a85a', '#ffefc0']);
    windowTile(T.winCool, ['#c4e0ff', '#8ab0e0', '#eef6ff']);
    windowTile(T.winPink, ['#ff9ad4', '#d860a8', '#ffd4ee']);
    windowTile(T.winDark, null);

    // Shop glass: warm light, shelves of colourful goods; the glow is dimmer than the paint so
    // a street of shopfronts doesn't blow out to white.
    const dim = (hex, k) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * k).toString(16).padStart(2, '0')).join('');
    tile(T.shop, (px, glow) => {
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        let c = y < 2 ? '#2a2834' : y > 12 ? '#e8b878' : '#f4d8a8';
        if (y >= 2 && (y === 6 || y === 11)) c = '#8a6a5a';                       // shelves
        else if (y >= 2 && y < 13 && y % 5 !== 1 && r() < 0.5) c = pick(['#ff7a7a', '#7ad0ff', '#ffe066', '#8ae28a', '#ff9ad4', '#c8a0ff']);
        if (x === 0 || x === 15) c = '#2a2834';
        px(x, y, c);
        if (y >= 2 && c !== '#2a2834') glow(x, y, dim(c, 0.45));
      }
    });
    tile(T.shutter, (px) => {
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) px(x, y, y % 2 ? '#4e5260' : (r() < 0.1 ? '#5e6270' : '#646876'));
      for (let i = 0; i < 4; i++) { const x = Math.floor(r() * 12), y = Math.floor(r() * 12); px(x, y, '#7a5a8a'); px(x + 1, y, '#7a5a8a'); }   // a little graffiti tag
    });
    tile(T.door, (px, glow) => {
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const frame = x < 2 || x > 13 || y < 1;
        const c = frame ? '#2a2834' : x === 8 ? '#3a3844' : '#ffe6b8';
        px(x, y, c);
        if (!frame && x !== 8) glow(x, y, '#c8a878');
      }
    });
    tile(T.glass, (px) => {
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) px(x, y, x % 4 === 0 || y % 4 === 0 ? '#2c3450' : (x + y * 2) % 11 === 0 ? '#28304a' : '#1a2036');
    });
    tile(T.glassLit, (px, glow) => {
      for (let cy = 0; cy < 4; cy++) for (let cx = 0; cx < 4; cx++) {
        const lit = r() < 0.55, col = lit ? pick(['#d8ecff', '#fff0c8', '#c0d8ff', '#ffe2a8']) : '#1a2036';
        for (let y = 1; y < 4; y++) for (let x = 1; x < 4; x++) { px(cx * 4 + x, cy * 4 + y, col); if (lit) glow(cx * 4 + x, cy * 4 + y, col); }
        for (let i = 0; i < 4; i++) { px(cx * 4, cy * 4 + i, '#2c3450'); px(cx * 4 + i, cy * 4, '#2c3450'); }
      }
    });
    tile(T.roof, (px) => fill(px, snow ? ['#c8d0e0', '#dce2ee', '#eef2fa', '#ffffff'] : ['#3a3844', '#44424e', '#4e4c58', '#585662'], { cell: 2, grain: 0.4 }));
    tile(T.metal, (px) => {
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) px(x, y, x % 3 === 0 ? '#5a5e6a' : '#767a86');
      for (let y = 4; y < 12; y++) for (let x = 4; x < 12; x++) px(x, y, (x + y) % 2 ? '#3a3e48' : '#4a4e58');   // fan grille
      if (snow) for (let x = 0; x < S; x++) { px(x, 0, '#f4f8ff'); px(x, 1, '#e4ecf8'); }
    });
    tile(T.vending, (px, glow) => {
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) px(x, y, '#e8e8f0');
      for (let row = 0; row < 3; row++) for (let i = 0; i < 4; i++) {
        const c = pick(['#ff5a5a', '#4ab0ff', '#ffd23a', '#5ad87a', '#ff8ad0', '#ffffff']);
        for (let y = 2 + row * 4; y < 5 + row * 4; y++) { px(2 + i * 3, y, c); glow(2 + i * 3, y, c); px(3 + i * 3, y, c); glow(3 + i * 3, y, c); }
      }
      for (let y = 1; y < 14; y++) { glow(1, y, '#c8d8ff'); glow(14, y, '#c8d8ff'); }
      for (let x = 2; x < 14; x++) px(x, 14, '#2a2834');
    });
    tile(T.steel, (px) => {
      fill(px, ['#24524a', '#2c6054', '#356e5e', '#3e7c68'], { cell: 4, grain: 0.2 });
      for (let x = 0; x < S; x++) { px(x, 0, '#4a8a74'); px(x, 15, '#1a3a34'); }
      for (let x = 2; x < S; x += 4) { px(x, 2, '#5a9a84'); px(x, 13, '#5a9a84'); }
    });
    tile(T.rail, (px) => {
      fill(px, ['#3a3640', '#46424c', '#524e58'], { cell: 2, grain: 0.5 });
      for (let y = 0; y < S; y++) { px(3, y, '#9a9aa8'); px(12, y, '#9a9aa8'); }
      for (let y = 1; y < S; y += 4) for (let x = 1; x < 15; x++) if (x !== 3 && x !== 12) px(x, y, '#5a4a3e');
    });
    // Leaves: soft clusters of light and shade with a few dark gaps, no grid to read as bricks.
    tile(T.leaves, (px) => {
      const L = season.leaves;
      if (snow) {
        for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) px(x, y, r() < 0.45 ? (r() < 0.5 ? L[2] : L[3]) : (r() < 0.5 ? L[0] : L[1]));
        return;
      }
      fill(px, L, { cell: 3, grain: 0.55, bias: 0.06 });
      for (let i = 0; i < 9; i++) {                            // highlights: little sunlit leaves
        const x = Math.floor(r() * 15), y = Math.floor(r() * 15);
        px(x, y, L[3]); px(x + 1, y, L[2]);
      }
      for (let i = 0; i < 7; i++) px(Math.floor(r() * S), Math.floor(r() * S), L[0]);
    });
    tile(T.trunk, (px) => { for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) px(x, y, x % 4 === 1 ? '#3a2a26' : r() < 0.3 ? '#5a4036' : '#4a342e'); });
    const neon = (id, tube, core) => tile(id, (px, glow) => {
      fill(px, WALL_B, { cell: 4, grain: 0.2 });
      for (let y = 0; y < S; y++) {
        for (let x = 6; x < 10; x++) { px(x, y, x === 7 || x === 8 ? core : tube); glow(x, y, x === 7 || x === 8 ? core : tube); }
        glow(5, y, '#000'); glow(10, y, '#000');
      }
    });
    neon(T.neonPink, '#ff3fa4', '#ffd0ec');
    neon(T.neonCyan, '#22d8ff', '#d4faff');
    tile(T.planter, (px) => {
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) px(x, y, y < 2 ? '#8a8894' : (x + y) % 5 === 0 ? '#5a5864' : '#6a6874');
    });
    tile(T.awning, (px) => {
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) px(x, y, Math.floor(x / 4) % 2 ? '#e8e0d8' : '#c83a4a');
      if (snow) for (let y = 0; y < 3; y++) for (let x = 0; x < S; x++) px(x, y, '#f4f8ff');
    });

    map.needsUpdate = true;
    emissiveMap.needsUpdate = true;
  }

  return { map, emissiveMap, paint };
}
