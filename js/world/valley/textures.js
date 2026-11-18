// Procedural 16x16 pixel textures (all original), repainted per season.
import * as THREE from 'three';

import { rng } from '../common.js';
export { rng };

export const T = {
  grassTop: 0, grassSide: 1, dirt: 2, stone: 3, sand: 4, logSide: 5, logTop: 6, leaves0: 7,
  leaves1: 8, leaves2: 9, planks: 10, cobble: 11, roof: 12, window: 13, path: 14, birch: 15,
  door: 16, tallGrass: 17, flower0: 18, flower1: 19, flower2: 20, bush: 21,
  farmland: 22, wheat0: 23, wheat1: 24, wheat2: 25, wheat3: 26, stubble: 27,
  oreCoal: 28, oreCopper: 29, oreGold: 30, oreCrystal: 31,
};
const COLS = 8, ROWS = 4, S = 16;

export function tileUV(tile) {
  const c = tile % COLS, r = Math.floor(tile / COLS);
  const e = 0.02 / (COLS * S);
  return [c / COLS + e, 1 - (r + 1) / ROWS + e, (c + 1) / COLS - e, 1 - r / ROWS - e];
}

// Palettes are hue-shifted ramps (dark tones lean teal/violet, light tones lean warm), and get
// sorted dark to light when painted, so their order here doesn't matter.
export const SEASONS = {
  spring: {
    grass: ['#4c9a5a', '#62b45a', '#7cc864', '#a2da76'],
    leaves: [
      ['#d8687e', '#ee8ca0', '#ffadbe', '#ffd4dc'],   // blossom
      ['#3c8a56', '#5aaa52', '#80c662', '#b0de78'],
      ['#e07a8c', '#f49cac', '#ffbcc8', '#ffe0e6'],
    ],
    tallGrass: ['#5aaa5a', '#72c060', '#94d474'],
    flowers: ['#ff9ec7', '#ffffff', '#ffe066'],
    flowerChance: 0.45, plantChance: 0.9, snow: false,
    particles: { kind: 'petal', colors: ['#ffc0dc', '#f7a1c8', '#ffe3ef'], count: 260 },
  },
  summer: {
    grass: ['#3f8a54', '#509e4a', '#68b450', '#8eca5e'],
    leaves: [
      ['#2e6a4a', '#408a48', '#62ac4e', '#92cc5c'],
      ['#336e46', '#4a9446', '#70b450', '#a2d062'],
      ['#28604e', '#367e52', '#52a058', '#7cbc66'],
    ],
    tallGrass: ['#4a9a4a', '#62b052', '#84c862'],
    flowers: ['#ffd23f', '#ff6b6b', '#9ec9ff'],
    flowerChance: 0.25, plantChance: 1, snow: false,
    particles: { kind: 'pollen', colors: ['#fff3b0', '#ffffff'], count: 110 },
  },
  autumn: {
    grass: ['#76844a', '#92a04e', '#adb25c', '#cabe6e'],
    leaves: [
      ['#a4401e', '#d0622a', '#ea8a36', '#f6b252'],
      ['#7a2a30', '#a43a2e', '#c85236', '#e0743e'],
      ['#a47824', '#cca032', '#e6c446', '#f6dc72'],
    ],
    tallGrass: ['#a8964a', '#c0aa58', '#d6c06c'],
    flowers: ['#ec8a2c', '#cf4a2c', '#f0d060'],
    flowerChance: 0.15, plantChance: 0.6, snow: false,
    particles: { kind: 'leaf', colors: ['#ec8a2c', '#cf4a2c', '#e9c443', '#d7721f'], count: 200 },
  },
  winter: {
    grass: ['#c4d2ea', '#dbe5f4', '#ecf2fa', '#ffffff'],
    leaves: [
      ['#1e3e3c', '#284e42', '#33604c', '#46745a'],
      ['#22443c', '#2e5644', '#3a684e', '#4e7e5e'],
      ['#1a3a3c', '#244a42', '#2f5a4c', '#426e58'],
    ],
    tallGrass: ['#8a7a5a', '#7a6a4a', '#9a8a6a'],
    flowers: ['#ffffff', '#ffffff', '#ffffff'],
    flowerChance: 0, plantChance: 0.12, snow: true,
    particles: { kind: 'snow', colors: ['#ffffff', '#eef4ff'], count: 700 },
  },
};


export function createAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = COLS * S;
  canvas.height = ROWS * S;
  const emissiveCanvas = document.createElement('canvas');
  emissiveCanvas.width = canvas.width;
  emissiveCanvas.height = canvas.height;
  const waterCanvas = document.createElement('canvas');
  waterCanvas.width = waterCanvas.height = S;

  const tex = (c, repeat) => {
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.colorSpace = THREE.SRGBColorSpace;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  };
  const map = tex(canvas), emissiveMap = tex(emissiveCanvas), waterMap = tex(waterCanvas, true);

  function paint(seasonName) {
    const season = SEASONS[seasonName];
    const g = canvas.getContext('2d');
    const eg = emissiveCanvas.getContext('2d');
    g.clearRect(0, 0, canvas.width, canvas.height);
    eg.fillStyle = '#000';
    eg.fillRect(0, 0, canvas.width, canvas.height);
    const r = rng(42);
    const pick = (arr) => arr[Math.floor(r() * arr.length)];

    const tile = (id, draw) => {
      const ox = (id % COLS) * S, oy = Math.floor(id / COLS) * S;
      const px = (x, y, c) => { if (x >= 0 && y >= 0 && x < S && y < S) { g.fillStyle = c; g.fillRect(ox + x, oy + y, 1, 1); } };
      const glow = (x, y, c) => { eg.fillStyle = c; eg.fillRect(ox + x, oy + y, 1, 1); };
      draw(px, glow);
    };
    const noiseFill = (px, palette, weights) => {
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        let v = r(), i = 0;
        if (weights) { while (i < weights.length - 1 && (v -= weights[i]) > 0) i++; } else i = Math.floor(v * palette.length);
        px(x, y, palette[i]);
      }
    };

    // Soft clusters instead of per-pixel noise: a tileable blend of a coarse and a finer random
    // grid picks the palette index, plus optional top-down / diagonal light and a little grain.
    const lum = (hex) => { const v = parseInt(hex.slice(1), 16); return (v >> 16) * 0.3 + ((v >> 8) & 255) * 0.59 + (v & 255) * 0.11; };
    const gridNoise = (cell) => {
      const n = S / cell, g = Array.from({ length: n * n }, r);
      const at = (a, b) => g[(b % n) * n + (a % n)];
      return (x, y) => {
        const fx = x / cell, fy = y / cell, ix = Math.floor(fx), iy = Math.floor(fy);
        let tx = fx - ix, ty = fy - iy;
        tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
        const a = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * tx;
        const b = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * tx;
        return a + (b - a) * ty;
      };
    };
    const clusterFill = (px, palette, { cell = 8, grain = 0.12, top = 0, diag = 0, bias = 0, contrast = 1.9 } = {}) => {
      const pal = [...palette].sort((a, b) => lum(a) - lum(b));
      const big = gridNoise(cell), small = gridNoise(cell / 2);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        let v = big(x, y) * 0.6 + small(x, y) * 0.4;
        v = (v - 0.5) * contrast + 0.5 + bias + (r() - 0.5) * grain - (y / 15 - 0.5) * top - ((x + y) / 30 - 0.5) * diag;
        px(x, y, pal[Math.max(0, Math.min(pal.length - 1, Math.floor(v * pal.length)))]);
      }
    };

    const DIRT = ['#5c3a3e', '#74493a', '#8a5c40', '#9e6e4a'];

    const grassSorted = [...season.grass].sort((a, b) => lum(a) - lum(b));
    tile(T.grassTop, (px) => clusterFill(px, season.grass, { cell: 4, grain: 0.14, bias: 0.12, contrast: 1.1 }));
    tile(T.grassSide, (px) => {
      clusterFill(px, DIRT, { cell: 8, grain: 0.1, top: 0.5 });
      // A soft scalloped overhang: a lit top row, the body, and a darker lip.
      const ph = r() * 6;
      for (let x = 0; x < S; x++) {
        const depth = 6 + Math.round(1.5 + Math.sin(x * 0.8 + ph) * 1.8 + Math.sin(x * 2.1) * 0.7);
        for (let y = 0; y < depth; y++) px(x, y, y === 0 ? grassSorted[3] : y === depth - 1 ? grassSorted[0] : grassSorted[y < 3 ? 2 : (x * 3 + y) % 5 === 0 ? 2 : 1]);
      }
    });
    tile(T.dirt, (px) => clusterFill(px, DIRT, { cell: 4, grain: 0.12, contrast: 1.3 }));
    const STONE = ['#666a82', '#7e8296', '#9498aa', '#acb0c0'];
    const stoneFill = (px) => {
      clusterFill(px, STONE, { cell: 8, grain: 0.08, top: 0.35 });
      for (let i = 0; i < 3; i++) {
        const y = 2 + Math.floor(r() * 12), x0 = Math.floor(r() * S), len = 3 + Math.floor(r() * 4);
        for (let x = x0; x < x0 + len; x++) { px(x % S, y, STONE[0]); px(x % S, y - 1, STONE[3]); }
      }
    };
    tile(T.stone, stoneFill);
    tile(T.sand, (px) => clusterFill(px, ['#d2b886', '#e2cc9a', '#ecdaaa', '#f6e8c2'], { cell: 8, grain: 0.08, bias: 0.1 }));
    tile(T.logSide, (px) => {
      const cols = ['#6e4c36', '#5e4030', '#82593c', '#4c3228'];
      for (let x = 0; x < S; x++) {
        const base = cols[(x * 7 + 3) % 4 === 0 ? 3 : x % 3];
        for (let y = 0; y < S; y++) px(x, y, r() < 0.12 ? pick(cols) : base);
      }
    });
    tile(T.logTop, (px) => {
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
        px(x, y, d > 6.5 ? '#5c3f24' : Math.floor(d) % 2 ? '#b08a5a' : '#9c7748');
      }
    });
    [T.leaves0, T.leaves1, T.leaves2].forEach((id, i) => tile(id, (px) => {
      // Bunches of leaves: dark gaps behind, then overlapping round clumps, each lit from the
      // top-left with a darker lower rim, so a canopy reads as foliage rather than a flat colour.
      const pal = [...season.leaves[i]].sort((a, b) => lum(a) - lum(b));
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) px(x, y, r() < 0.25 ? pal[1] : pal[0]);
      const clumps = [];
      for (let gy = 0; gy < 2; gy++) for (let gx = 0; gx < 2; gx++) {
        clumps.push([gx * 8 + (gy % 2) * 4 + 2 + r() * 2, gy * 8 + 2 + r() * 2, 4 + r() * 1.3]);
      }
      clumps.push([r() * 16, r() * 16, 3 + r()]);
      clumps.sort((a, b) => a[1] - b[1]);                      // lower clumps overlap the upper ones
      for (const [cx, cy, rad] of clumps) {
        for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
          const d = Math.hypot(dx, dy * 1.1);
          if (d > rad) continue;
          const t = (dx + dy * 1.3) / (rad * 2.2);
          const c = d > rad - 0.9 && dx + dy > 0 ? pal[0] : t < -0.32 ? pal[3] : t < 0.12 ? pal[2] : pal[1];
          px(mod(Math.round(cx + dx)), mod(Math.round(cy + dy)), c);
        }
        // a few bright leaf tips on the lit side
        for (let k = 0; k < 3; k++) px(mod(Math.round(cx - 1 - r() * 2)), mod(Math.round(cy - 1 - r() * 2)), pal[3]);
      }
      if (season.snow) {
        const ph = r() * 6;
        for (let x = 0; x < S; x++) {
          const d = 4 + Math.round(Math.sin(x * 0.7 + ph) * 1.5);
          for (let y = 0; y < d; y++) px(x, y, y === d - 1 ? '#c8d8ee' : '#f6f9fd');
        }
      }
    }));
    tile(T.planks, (px) => {
      const cols = ['#c08c56', '#b0804e', '#ca9a62'];
      for (let row = 0; row < 4; row++) {
        const base = cols[row % 3], seam = (row * 5 + 3) % S;
        for (let y = row * 4; y < row * 4 + 4; y++) for (let x = 0; x < S; x++) {
          const edge = y % 4 === 3 || x === seam;
          px(x, y, edge ? '#7a5240' : y % 4 === 0 ? '#d8aa70' : r() < 0.06 ? '#a87448' : base);
        }
      }
    });
    tile(T.cobble, (px) => {
      noiseFill(px, ['#585a6e'], null);
      // Rounded stones, lit top-left with a shaded lower rim.
      for (let i = 0; i < 9; i++) {
        const cx = Math.floor(r() * S), cy = Math.floor(r() * S), rad = 2 + Math.floor(r() * 2);
        const [lo, mid, hi] = pick([['#6c6e84', '#8a8ca0', '#a8aabc'], ['#747088', '#9290a4', '#b0aec0'], ['#686e80', '#868c9c', '#a4aab8']]);
        for (let y = -rad; y <= rad; y++) for (let x = -rad; x <= rad; x++) {
          if (x * x + y * y > rad * rad) continue;
          const c = x + y < -rad * 0.6 ? hi : x + y > rad * 0.8 ? lo : mid;
          px(mod(cx + x), mod(cy + y), c);
        }
      }
      if (seasonName === 'spring' || seasonName === 'summer') for (let i = 0; i < 6; i++) px(Math.floor(r() * S), Math.floor(r() * S), '#4f8a3a');
    });
    tile(T.roof, (px) => {
      const cols = ['#a44c3a', '#943f34', '#b2583e'];
      for (let row = 0; row < 4; row++) {
        const off = row % 2 ? 4 : 0;
        for (let y = row * 4; y < row * 4 + 4; y++) for (let x = 0; x < S; x++) {
          const edge = y % 4 === 3 || (x + off) % 8 === 0;
          px(x, y, edge ? '#7a3634' : y % 4 === 0 ? '#bc6650' : cols[(row + (x + off >> 3)) % 3]);
        }
      }
      if (season.snow) for (let x = 0; x < S; x++) for (let y = 0; y < 3 + (r() < 0.5 ? 1 : 0); y++) px(x, y, '#f4f8fc');
    });
    tile(T.window, (px, glow) => {
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const frame = x < 2 || y < 2 || x > 13 || y > 13 || x === 7 || x === 8 || y === 7 || y === 8;
        if (frame) px(x, y, '#5a3d24');
        else {
          px(x, y, (x + y) % 7 === 0 ? '#d4ecfa' : '#8fb9d6');
          glow(x, y, (x + y) % 5 === 0 ? '#ffe2a0' : '#ffc66e');
        }
      }
    });
    tile(T.path, (px) => {
      clusterFill(px, ['#8a6a54', '#a2825e', '#b8986e', '#ccb286'], { cell: 4, grain: 0.15, bias: 0.05 });
      for (let i = 0; i < 4; i++) { const x = Math.floor(r() * 15), y = Math.floor(r() * 15); px(x, y, '#ddd2bc'); px(x + 1, y + 1, '#9a8a80'); }
      if (season.snow) {                                    // trodden snow: patches with a few gaps
        const n = gridNoise(4);
        for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
          const v = n(x, y) + (r() - 0.5) * 0.2;
          if (v > 0.32) px(x, y, v > 0.7 ? '#f8fbfe' : v > 0.5 ? '#eef3f9' : '#d8e2f0');
        }
      }
    });
    tile(T.birch, (px) => {
      noiseFill(px, ['#e8e4dc', '#d8d4cc', '#f2efe8'], [0.5, 0.3, 0.2]);
      for (let i = 0; i < 6; i++) {
        const y = Math.floor(r() * S), x0 = Math.floor(r() * S), len = 2 + Math.floor(r() * 3);
        for (let x = x0; x < x0 + len; x++) px(x % S, y, '#3a3a3a');
      }
    });
    tile(T.door, (px) => {
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const edge = x === 0 || x === 15 || x % 5 === 0;
        px(x, y, edge ? '#4a3220' : r() < 0.1 ? '#5c3f26' : '#6b4a2b');
      }
      px(12, 8, '#d0b060');
      px(12, 9, '#a08840');
    });
    tile(T.tallGrass, (px) => {
      const pal = season.tallGrass;
      for (let i = 0; i < 8; i++) {
        let x = 1 + Math.floor(r() * 14);
        const h = 6 + Math.floor(r() * 9);
        const c = pick(pal);
        for (let y = 15; y > 15 - h; y--) {
          px(x, y, c);
          if (r() < 0.15) x += r() < 0.5 ? -1 : 1;
        }
      }
    });
    [T.flower0, T.flower1, T.flower2].forEach((id, i) => tile(id, (px) => {
      const stem = season.tallGrass[0];
      for (let y = 8; y < 16; y++) px(7, y, stem);
      px(6, 12, stem); px(5, 11, stem); px(8, 13, stem); px(9, 12, stem);
      const c = season.flowers[i];
      for (let y = 4; y < 8; y++) for (let x = 5; x < 10; x++) if (!((x === 5 || x === 9) && (y === 4 || y === 7))) px(x, y, c);
      px(7, 5, '#f7d04a'); px(7, 6, '#e0a830');
    }));
    tile(T.bush, (px) => {
      for (let i = 0; i < 6; i++) {
        let x = 4 + Math.floor(r() * 8);
        for (let y = 15; y > 7 + Math.floor(r() * 4); y--) { px(x, y, '#7a5a3a'); if (r() < 0.3) x += r() < 0.5 ? -1 : 1; }
      }
    });

    // ---- crops ----
    tile(T.farmland, (px) => {
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const ridge = y % 4 === 0 || y % 4 === 1;
        let c = ridge ? (r() < 0.5 ? '#6e4a2e' : '#674429') : (r() < 0.5 ? '#4a301d' : '#523520');
        if (season.snow && (ridge ? r() < 0.95 : r() < 0.7)) c = r() < 0.85 ? '#f2f6fb' : '#dde6f0';
        px(x, y, c);
      }
    });
    const stalks = (px, count, minH, maxH, stem, head) => {
      for (let i = 0; i < count; i++) {
        const x = 1 + Math.floor(r() * 14), h = minH + Math.floor(r() * (maxH - minH + 1));
        for (let y = 15; y > 15 - h; y--) px(x, y, pick(stem));
        if (head) for (let y = 16 - h; y < 16 - h + 3; y++) { px(x, y, pick(head)); if (r() < 0.5) px(x + 1, y, pick(head)); }
      }
    };
    tile(T.wheat0, (px) => stalks(px, 6, 2, 4, ['#6cc04f', '#5aa843'], null));
    tile(T.wheat1, (px) => stalks(px, 11, 6, 10, ['#6cc04f', '#5aa843', '#7cd05e'], null));
    tile(T.wheat2, (px) => stalks(px, 14, 11, 15, ['#8fb848', '#a3c050', '#7aa83e'], ['#d6d070', '#c8c060']));
    tile(T.wheat3, (px) => stalks(px, 14, 12, 15, ['#c8a040', '#d8b450', '#b89038'], ['#e8c860', '#f0d470', '#d0a840']));
    tile(T.stubble, (px) => stalks(px, 12, 1, 3, ['#c8a040', '#a88a3a'], null));

    // ---- ores: stone with chunky veins; the crystal glows a little at night ----
    const ore = (id, pal, glowColor) => tile(id, (px, glow) => {
      stoneFill(px);
      for (let k = 0; k < 6; k++) {
        const cx = 1 + ((k % 3) * 5 + Math.floor(r() * 3)), cy = 2 + (Math.floor(k / 3) * 7 + Math.floor(r() * 4));
        for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0], [0, -1], [2, 1], [1, 2]]) {
          if (Math.abs(dx) + Math.abs(dy) > 1 && r() < 0.4) continue;
          const c = dy < 0 || dx < 0 ? pal[0] : dx && dy ? pal[2] : pal[1];   // lit top-left, shaded corner
          px(cx + dx, cy + dy, c);
          if (glowColor) glow(cx + dx, cy + dy, glowColor);
        }
      }
    });
    ore(T.oreCoal, ['#56565e', '#26262c', '#141418']);
    ore(T.oreCopper, ['#ffb070', '#e07f3a', '#6cc4a4']);
    ore(T.oreGold, ['#fff6b0', '#ffd23e', '#c09020']);
    ore(T.oreCrystal, ['#e8fbff', '#8fe4f4', '#4ab0d8'], '#4a9ab0');

    // Water (or ice in winter): its own repeating texture.
    const wg = waterCanvas.getContext('2d');
    const wr = rng(7);
    // Open water is near-white here and gets its colour from the depth bands (vertex colours);
    // ice keeps its own pale blues.
    const wpal = season.snow ? ['#cfe6f5', '#bcdcf0', '#e2f1fa', '#c4e0f2'] : ['#e6eef6', '#dce6f2', '#eef4fa', '#d4e0ee'];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { wg.fillStyle = wpal[Math.floor(wr() * 4)]; wg.fillRect(x, y, 1, 1); }
    wg.fillStyle = season.snow ? '#a6c8e0' : '#ffffff';
    for (let i = 0; i < 4; i++) {
      const y = Math.floor(wr() * S), x0 = Math.floor(wr() * S), len = 2 + Math.floor(wr() * 4);
      for (let x = x0; x < x0 + len; x++) wg.fillRect(x % S, season.snow ? (y + x - x0) % S : y, 1, 1);
    }

    map.needsUpdate = emissiveMap.needsUpdate = waterMap.needsUpdate = true;
  }

  const mod = (v) => ((v % S) + S) % S;
  return { map, emissiveMap, waterMap, paint };
}
