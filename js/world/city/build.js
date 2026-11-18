// The city: a narrow shopping street running away from the camera (towards -z) between voxel
// buildings, a cross street, a railway bridge and a wall of towers at the end. Facades are
// decided per block; signs and light sources are collected for the scene to build.
import * as THREE from 'three';
import { rng } from '../common.js';
import { T, tileUV } from './textures.js';
import { NEON, NAMES } from './signs.js';

export const G = 1;                       // street level: the top of the ground layer
const X0 = -64, X1 = 64, Z0 = -284, Z1 = 22, H = 150;
const W = X1 - X0, D = Z1 - Z0;
export const CAM = { x: 0.5, y: 4.4, z: 16 };
export const CROSS = { z0: -46, z1: -36 };
export const BRIDGE = { z0: -96, z1: -92, y: G + 11 };
export const END_Z = -203;                // front face of the tower that closes the street

// Block ids are atlas tile index + 1.
export const B = { AIR: 0 };
for (const [k, v] of Object.entries(T)) B[k] = v + 1;
const ROOFED = new Set(['wallA', 'wallB', 'wallTile', 'brick', 'winWarm', 'winCool', 'winPink', 'winDark', 'shop', 'shutter', 'door', 'glass', 'glassLit', 'neonPink', 'neonCyan', 'planter'].map((k) => B[k]));
// [top, bottom, side] tiles per block id.
function faceTiles(id) {
  const t = id - 1;
  if (ROOFED.has(id)) return [T.roof, T.wallB, t];
  if (id === B.vending) return [T.metal, T.metal, t];
  if (id === B.rail) return [T.rail, T.steel, T.steel];
  if (id === B.trunk) return [T.trunk, T.trunk, t];
  return [t, t, t];
}

const hash = (a, b, c) => {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

export function generateCity() {
  const r = rng(2077);
  const ri = (a, b) => a + Math.floor(r() * (b - a + 1));
  const grid = new Uint8Array(W * H * D);
  const tint = new Uint8Array(W * H * D);
  const inside = (x, y, z) => x >= X0 && x < X1 && z >= Z0 && z < Z1 && y >= 0 && y < H;
  const at = (x, y, z) => ((y * D) + (z - Z0)) * W + (x - X0);
  const get = (x, y, z) => (inside(x, y, z) ? grid[at(x, y, z)] : B.AIR);
  const set = (x, y, z, id, b = 0) => { if (inside(x, y, z)) { grid[at(x, y, z)] = id; tint[at(x, y, z)] = b; } };

  // ---------- ground ----------
  const road = (x) => x >= -5 && x <= 5;
  const walk = (x) => (x >= -9 && x <= -6) || (x >= 6 && x <= 9);
  for (let z = Z0; z < Z1; z++) for (let x = X0; x < X1; x++) {
    const inCross = z >= CROSS.z0 && z <= CROSS.z1;
    let id = B.walk;
    if (road(x) && z > END_Z) {
      if ((z >= -34 && z <= -32) || (z >= -50 && z <= -48)) id = B.zebra;
      else if (x === 0 && !inCross && ((z % 6) + 6) % 6 < 3) id = B.lane;
      else id = B.asphalt;
    } else if (inCross) id = walk(x) ? B.zebraX : B.asphalt;
    else if (walk(x)) id = x === 6 || x === -6 ? B.curb : B.walk;
    else if (z >= -98 && z <= -90) id = B.asphalt;     // the lane under the bridge
    set(x, 0, z, id);
  }

  const signs = [], lights = [], buildings = [], vending = [], rooftops = [];
  const light = (x, y, z, color, intensity) => lights.push({ x, y, z, color: new THREE.Color(color), intensity });

  // ---------- buildings ----------
  function facade(b, m, u, len, ry, street) {
    if (ry === m.top - 1) return b.wall;                                    // parapet
    if (b.tower) {
      if (ry % 5 === 4 || u === 0 || u === len - 1) return b.wall;
      return hash(b.id, Math.floor(ry / 5), Math.floor(u / 3) + (street ? 0 : 99)) < b.lit ? B.glassLit : B.glass;
    }
    if (ry < 4) {
      if (ry === 3 || u === 0 || u === len - 1) return b.wall;             // sign band and pillars
      if (b.shop === 'shutter') return B.shutter;
      if (street && u === b.door && ry < 2) return B.door;
      return B.shop;
    }
    if (b.neon && u === 0) return b.neon;
    const fy = (ry - 4) % b.fh;
    if (fy === b.fh - 1 || u === 0 || u === len - 1 || (u - 1) % b.winEvery !== 0) return b.wall;
    const h = hash(b.id, Math.floor((ry - 4) / b.fh), Math.floor(u / 3) + (street ? 0 : 99));
    if (h > b.lit) return B.winDark;
    return h < b.lit * 0.55 ? B.winWarm : h < b.lit * 0.85 ? B.winCool : B.winPink;
  }
  // A mass is a box of the building: xf is the block column on the street, d its depth away
  // from the street, z0..z1 its length, y0..top its height (relative to the street).
  function fillMass(b, m) {
    for (let ry = m.y0; ry < m.top; ry++) for (let z = m.z0; z <= m.z1; z++) for (let k = 0; k < m.d; k++) {
      const x = m.xf + b.s * k;
      const street = k === 0, front = z === m.z1;
      const id = street ? facade(b, m, m.z1 - z, m.z1 - m.z0 + 1, ry, true) : front ? facade(b, m, k, m.d, ry, false) : b.wall;
      set(x, G + ry, z, id, b.id);
    }
  }
  const WALLS = [B.wallA, B.wallB, B.wallTile, B.brick, B.wallA, B.wallB];
  let nextId = 1;
  function building(s, z1, w, opts = {}) {
    const z0 = z1 - w + 1;
    const far = Math.min(1, Math.max(0, -z1 / 200));
    const h = opts.h ?? ri(10, 20) + Math.round(far * ri(6, 34)) + (r() < 0.2 ? ri(6, 12) : 0);
    const d = opts.d ?? ri(10, 16);
    const b = {
      id: nextId++, s, z0, z1, h, xf: s > 0 ? 10 : -10,
      wall: WALLS[Math.floor(r() * WALLS.length)], fh: r() < 0.6 ? 3 : 4, winEvery: r() < 0.65 ? 1 : 2,
      lit: 0.35 + r() * 0.4, shop: r() < 0.15 ? 'shutter' : 'shop', door: ri(1, Math.max(1, w - 2)),
      neon: r() < 0.22 ? (r() < 0.5 ? B.neonPink : B.neonCyan) : 0, tower: false,
    };
    const masses = [{ xf: b.xf, d, z0, z1, y0: 0, top: h }];
    if (h > 22 && r() < 0.5) {                                 // a setback for the upper floors
      const y = ri(Math.floor(h * 0.45), Math.floor(h * 0.7));
      masses[0].top = y;
      masses.push({ xf: b.xf + s * 2, d: d - 2, z0, z1: z1 - (w > 7 ? 2 : 0), y0: y, top: h });
    }
    for (const m of masses) fillMass(b, m);
    b.masses = masses;
    buildings.push(b);

    const faceX = s > 0 ? 10 : -9, normal = s > 0 ? 'x-' : 'x+';
    // The shop sign over the ground floor, along the facade.
    if (b.shop === 'shop' && w >= 4) {
      const color = NEON[Math.floor(r() * NEON.length)];
      signs.push({ kind: 'board', normal, x: faceX - s * 0.06, y: G + 3.5, z: (z0 + z1 + 1) / 2, w: w - 2, h: 0.95,
        color, style: r() < 0.5 ? 'panel' : 'neon', text: NAMES[Math.floor(r() * NAMES.length)], seed: b.id * 7 });
      for (let z = z0 + 1; z < z1; z += 3) light(faceX - s * 1.2, G + 1.2, z + 0.5, '#ffd8a8', 0.55);
    }
    // Awnings over some shopfronts.
    if (b.shop === 'shop' && r() < 0.3) for (let z = z0 + 1; z < z1; z++) set(s > 0 ? 9 : -9, G + 2, z, B.awning, b.id);
    // Vertical blade signs sticking out over the pavement, facing down the street.
    const blades = h > 9 ? (r() < 0.8 ? 1 : 0) + (w > 8 && r() < 0.4 ? 1 : 0) : 0;
    for (let i = 0; i < blades; i++) {
      const len = Math.min(ri(4, 11), h - 6);
      if (len < 3) break;
      const y0 = G + 5 + (i ? ri(0, 3) : 0);
      const stack = r() < 0.4, color = NEON[Math.floor(r() * NEON.length)];
      const sz = i === 0 ? z1 + 0.7 : z0 + 0.6;
      const sx = faceX - s * 0.8;
      signs.push({ kind: stack ? 'stack' : 'blade', normal: 'z+', x: sx, y: y0 + len / 2, z: sz, w: 1.25, h: len, color,
        style: r() < 0.45 ? 'panel' : 'neon', seed: b.id * 13 + i, flicker: r() < 0.12 });
      light(sx, y0 + len / 2, sz + 1.2, stack ? '#ffb8d8' : color, len * 0.3);
    }
    // Things on the roof: air conditioners, a water tank, sometimes a sign facing the camera.
    const top = masses[masses.length - 1];
    rooftops.push({ b, m: top });
    return b;
  }
  function rowOf(s, zStart, zEnd) {
    let z = zStart;
    while (z - 3 > zEnd) {
      let w = ri(6, 13);
      if (z - w + 1 < zEnd) w = z - zEnd + 1;
      building(s, z, w);
      z -= w + (r() < 0.2 ? 1 : 0);
    }
  }
  for (const s of [-1, 1]) {
    rowOf(s, 19, -31);
    rowOf(s, -51, -89);
    rowOf(s, -99, END_Z - 1);
  }

  // The tower that closes the street, with a big screen, and taller towers behind it.
  const tower = (x0, x1, z0, z1, h, opts = {}) => {
    const b = { id: nextId++, s: 1, tower: true, wall: opts.wall ?? B.wallB, lit: opts.lit ?? 0.45, fh: 4, winEvery: 1, neon: opts.neon ?? 0 };
    buildings.push(b);
    for (let y = 0; y < h; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const front = z === z1, edgeL = x === x0, edgeR = x === x1;
      let id = b.wall;
      if (front) id = (b.neon && (edgeL || edgeR) && y > 3) ? b.neon : facade(b, { top: h }, x - x0, x1 - x0 + 1, y, true);
      else if (edgeL || edgeR) id = facade(b, { top: h }, z1 - z, z1 - z0 + 1, y, false);
      set(x, G + y, z, id, b.id);
    }
    return b;
  };
  tower(-24, 25, END_Z - 26, END_Z - 1, 58, { neon: B.neonPink, lit: 0.5 });
  const screen = { x: 0.5, y: G + 33, z: END_Z + 0.06, w: 30, h: 17 };
  for (let i = 0; i < 18; i++) {
    const cx = ri(-58, 58), w = ri(9, 20), d = ri(10, 18), z1 = ri(-250, -214);
    const h = ri(55, 120) - Math.round(Math.abs(cx) * 0.3);
    tower(Math.max(X0, cx - (w >> 1)), Math.min(X1 - 1, cx + (w >> 1)), z1 - d, z1, h,
      { lit: 0.3 + r() * 0.35, neon: r() < 0.3 ? (r() < 0.5 ? B.neonPink : B.neonCyan) : 0, wall: r() < 0.5 ? B.wallB : B.wallA });
  }
  // Mid-distance towers peeking over the street's rooftops.
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
    const z1 = -70 - i * 34 - ri(0, 10), x0 = s * ri(30, 40);
    const b = tower(Math.min(x0, x0 + s * 12), Math.max(x0, x0 + s * 12), z1 - ri(10, 14), z1, ri(42, 78), { lit: 0.35 + r() * 0.3, neon: r() < 0.4 ? B.neonCyan : 0 });
    if (r() < 0.7) rooftops.push({ b, m: null, x: x0 + s * 6, z: z1, h: b.h });
  }

  // ---------- railway bridge ----------
  for (let x = X0; x < X1; x++) for (let z = BRIDGE.z0; z <= BRIDGE.z1; z++) {
    set(x, BRIDGE.y, z, B.steel);
    if (z === BRIDGE.z0 || z === BRIDGE.z1) { set(x, BRIDGE.y + 1, z, B.steel); set(x, BRIDGE.y + 2, z, B.steel); }
    else set(x, BRIDGE.y + 1, z, B.rail);
  }
  for (const px of [-11, -10, 10, 11]) for (const pz of [-95, -94, -93]) for (let y = G; y < BRIDGE.y; y++) set(px, y, pz, B.steel);
  for (const px of [-30, -29, 29, 30, -52, -51, 51, 52]) for (const pz of [-95, -94, -93]) for (let y = G; y < BRIDGE.y; y++) set(px, y, pz, B.steel);

  // ---------- rooftops ----------
  for (const { b, m, x, z, h } of rooftops) {
    if (m) {
      const y = G + m.top;
      for (let i = 0; i < ri(0, 3); i++) {
        const ax = m.xf + b.s * ri(1, Math.max(1, m.d - 3)), az = ri(m.z0 + 1, Math.max(m.z0 + 1, m.z1 - 1));
        set(ax, y, az, B.metal, b.id);
      }
      if (r() < 0.35) {                                         // a water tank
        const tx = m.xf + b.s * ri(2, Math.max(2, m.d - 3)), tz = ri(m.z0, Math.max(m.z0, m.z1 - 1));
        for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 2; dx++) for (let dz = 0; dz < 2; dz++) set(tx + dx * b.s, y + dy, tz + dz, dy === 0 ? B.steel : B.metal, b.id);
      }
      if (m.d >= 6 && r() < 0.3) {                             // a rooftop sign facing the camera
        const color = NEON[Math.floor(r() * NEON.length)];
        const sw = Math.min(9, m.d - 1), face = b.s > 0 ? m.xf : m.xf + 1;
        const sx = face + b.s * (sw / 2 + 0.3), sz = m.z1 + 0.7;
        signs.push({ kind: 'roof', normal: 'z+', x: sx, y: y + 1.5, z: sz, w: sw, h: 2.2,
          color, style: r() < 0.5 ? 'neon' : 'panel', text: NAMES[Math.floor(r() * NAMES.length)], seed: b.id * 31, frame: true });
        light(sx, y + 1.5, sz + 1.2, color, 2.5);
      }
    } else {
      const color = NEON[Math.floor(r() * NEON.length)];
      signs.push({ kind: 'roof', normal: 'z+', x, y: G + h + 2.4, z: z + 1.2, w: 11, h: 3, color, style: 'neon', text: NAMES[Math.floor(r() * NAMES.length)], seed: b.id * 17, frame: true });
    }
  }

  // ---------- street furniture in the grid ----------
  // Vending machines against the walls, trees in planters along the kerb.
  for (const [vx, vz] of [[9, 4], [-9, -18], [9, -62], [-9, -112], [9, -140]]) {
    if (get(vx + Math.sign(vx), G, vz) === B.AIR) continue;
    for (let y = G; y < G + 2; y++) set(vx, y, vz, B.vending);
    vending.push({ x: vx + 0.5, z: vz + 0.5 });
    light(vx + 0.5 - Math.sign(vx) * 1.2, G + 1, vz + 0.5, '#d0e4ff', 1.4);
  }
  const trees = [[6, -9], [-6, -16], [6, -26], [-6, -72], [6, -102], [-6, -126]];
  for (const [tx, tz] of trees) {
    set(tx, G, tz, B.planter);
    for (let y = G + 1; y < G + 4; y++) set(tx, y, tz, B.trunk);
    for (let y = G + 3; y < G + 6; y++) for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      const dd = dx * dx + dz * dz + (y - G - 4) * (y - G - 4) * 1.5;
      if (dd <= 4.2 && get(tx + dx, y, tz + dz) === B.AIR && !road(tx + dx)) set(tx + dx, y, tz + dz, B.leaves);
    }
  }

  return { get, grid, tint, inside, signs, lights, buildings, vending, screen, trees, X0, X1, Z0, Z1, H };
}

// ---------- meshing ----------
const FACES = [
  { n: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], slot: 2 },
  { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], slot: 2 },
  { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], slot: 2 },
  { n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], slot: 2 },
  { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], slot: 0 },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], slot: 1 },
];
const AO = [0.5, 0.68, 0.84, 1];

// Light sources bucketed by z so each vertex only looks at the ones nearby.
function lightField(lights) {
  const R = 16, BUCKET = 8, buckets = new Map();
  for (const l of lights) {
    for (let k = Math.floor((l.z - R) / BUCKET); k <= Math.floor((l.z + R) / BUCKET); k++) {
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(l);
    }
  }
  return (x, y, z, n, out) => {
    out[0] = out[1] = out[2] = 0;
    const list = buckets.get(Math.floor(z / BUCKET));
    if (!list) return out;
    for (const l of list) {
      const dx = l.x - x, dy = l.y - y, dz = l.z - z, d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > R * R) continue;
      const d = Math.sqrt(d2) || 1;
      const facing = (n[0] * dx + n[1] * dy + n[2] * dz) / d;
      if (facing < -0.2) continue;
      const k = l.intensity * (0.3 + 0.7 * Math.max(0, facing)) / (1 + d2 * 0.08);
      out[0] += l.color.r * k; out[1] += l.color.g * k; out[2] += l.color.b * k;
    }
    for (let i = 0; i < 3; i++) out[i] = Math.min(1.6, out[i]);
    return out;
  };
}

export function buildCityMeshes(city) {
  const { get, tint, inside, X0, Z0 } = city;
  const field = lightField(city.lights);
  const solid = (x, y, z) => get(x, y, z) !== B.AIR;
  const tints = [];
  const tr = rng(99);
  for (let i = 0; i < 256; i++) { const v = 0.88 + tr() * 0.2, h = (tr() - 0.5) * 0.12; tints.push([v * (1 + h), v, v * (1 - h)]); }
  const make = () => ({ pos: [], nor: [], uv: [], col: [], neon: [], index: [] });
  const out = { blocks: make(), ground: make() };
  const tmp = [0, 0, 0];
  const Wd = X1 - X0, Dd = Z1 - Z0;

  for (let y = 0; y < H; y++) for (let z = Z0; z < Z1; z++) for (let x = X0; x < X1; x++) {
    const id = city.grid[((y * Dd) + (z - Z0)) * Wd + (x - X0)];
    if (id === B.AIR) continue;
    const tiles = faceTiles(id);
    const isGround = y === 0;
    // Only the street, the cross street and the lane under the bridge can be seen from the camera.
    if (isGround && !((x >= -12 && x <= 12 && z >= END_Z - 1) || (z >= CROSS.z0 - 1 && z <= CROSS.z1 + 1) || (z >= -98 && z <= -90))) continue;
    for (const f of FACES) {
      if (isGround && f.n[1] !== 1) continue;
      const nx = x + f.n[0], ny = y + f.n[1], nz = z + f.n[2];
      if (!inside(nx, ny, nz) || solid(nx, ny, nz)) continue;
      // The camera never moves far: skip faces turned away from it, except tops (they cast the shadows).
      const cx = x + 0.5 + f.n[0] * 0.5 - CAM.x, cy = y + 0.5 + f.n[1] * 0.5 - CAM.y, cz = z + 0.5 + f.n[2] * 0.5 - CAM.z;
      if (f.n[1] !== 1 && f.n[0] * cx + f.n[1] * cy + f.n[2] * cz > 1.5) continue;
      const o = isGround ? out.ground : out.blocks;
      const [u0, v0, u1, v1] = tileUV(tiles[f.slot]);
      const axis = f.n[0] ? 0 : f.n[1] ? 1 : 2, ta = (axis + 1) % 3, tb = (axis + 2) % 3;
      const base = o.pos.length / 3;
      const aos = f.c.map((c) => {
        const da = [0, 0, 0], db = [0, 0, 0];
        da[ta] = c[ta] ? 1 : -1;
        db[tb] = c[tb] ? 1 : -1;
        const s1 = solid(nx + da[0], ny + da[1], nz + da[2]), s2 = solid(nx + db[0], ny + db[1], nz + db[2]);
        const cr = solid(nx + da[0] + db[0], ny + da[1] + db[1], nz + da[2] + db[2]);
        return s1 && s2 ? 0 : 3 - (s1 + s2 + cr);
      });
      const t = tints[tint[((y * Dd) + (z - Z0)) * Wd + (x - X0)]] ?? [1, 1, 1];
      f.c.forEach((c, i) => {
        const vx = x + c[0], vy = y + c[1], vz = z + c[2];
        o.pos.push(vx, vy, vz);
        o.nor.push(...f.n);
        const s = AO[aos[i]], k = 1 - s;
        o.col.push(s * t[0] * (1 - k * 0.25), s * t[1] * (1 - k * 0.2), Math.min(1, s * t[2] * (1 + k * 0.3)));
        field(vx, vy, vz, f.n, tmp);
        o.neon.push(tmp[0], tmp[1], tmp[2]);
      });
      o.uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
      if (aos[0] + aos[2] < aos[1] + aos[3]) o.index.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
      else o.index.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  const geo = (o) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(o.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(o.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(o.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(o.col, 3));
    g.setAttribute('neon', new THREE.Float32BufferAttribute(o.neon, 3));
    g.setIndex(o.index);
    g.computeBoundingSphere();
    return g;
  };
  return { blocks: geo(out.blocks), ground: geo(out.ground) };
}
