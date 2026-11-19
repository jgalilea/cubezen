// Small hand-built things (cars, people, the yakitori stall) as merged boxes. Every box is shaded
// per face like the voxels and carries a greyscale surface pattern (fabric, wood, rubber, grille,
// paper...) at the same density as the city's textures, 32 texels per unit, so these props have
// the same fine pixel grain as the buildings instead of reading as flat-coloured blocks.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, pixelTexture } from '../common.js';

export const PAT = { plain: 0, fabric: 1, wood: 2, rubber: 3, grille: 4, paper: 5, hair: 6, metal: 7, ribbed: 8, knit: 9 };
const N = 10, S = 32;

function patternAtlas() {
  const c = document.createElement('canvas');
  c.width = N * S; c.height = S;
  const g = c.getContext('2d'), r = rng(808);
  const tile = (i, f) => {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const v = Math.max(0, Math.min(255, Math.round(f(x, y) * 255)));
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(i * S + x, y, 1, 1);
    }
  };
  const n = () => r();
  tile(PAT.plain, () => 0.93 + n() * 0.07);
  tile(PAT.fabric, (x, y) => ((x + y) % 4 < 2 ? 0.94 : 0.84) + n() * 0.06);                        // twill
  tile(PAT.wood, (x, y) => {
    const plank = Math.floor(y / 8), seam = y % 8 === 7;
    const grain = Math.sin((x + plank * 13) * 0.35 + Math.sin(y * 0.9 + plank) * 1.5) * 0.06;
    return seam ? 0.55 : 0.86 + grain + n() * 0.06 + (plank % 2) * 0.05;
  });
  tile(PAT.rubber, (x, y) => (y % 6 < 2 ? 0.6 : 0.82) + n() * 0.08);
  tile(PAT.grille, (x, y) => (y % 4 === 0 ? 0.35 : y % 4 === 1 ? 1 : 0.75) * (x % 16 === 0 ? 0.6 : 1));
  tile(PAT.paper, (x, y) => (y % 5 === 0 ? 0.7 : 0.96) + n() * 0.04);                                // lantern ribs
  tile(PAT.hair, (x, y) => (x % 3 === 0 ? 0.78 : 0.95) + n() * 0.08 - (y % 9 === 0 ? 0.1 : 0));
  tile(PAT.metal, (x, y) => 0.86 + Math.sin(y * 1.7) * 0.03 + n() * 0.05);
  tile(PAT.ribbed, (x, y) => (x % 4 === 0 ? 0.62 : x % 4 === 1 ? 1 : 0.84));                        // corrugated sheet
  tile(PAT.knit, (x, y) => (((x >> 1) + (y >> 2)) % 2 ? 0.8 : 0.96) + n() * 0.05);
  return pixelTexture(c);
}

let shared = null;
// One material for the painted boxes and one for the self-lit ones, shared by every kit.
function materials() {
  if (shared) return shared;
  const map = patternAtlas();
  map.userData.shared = true;
  const paint = new THREE.MeshLambertMaterial({ map, vertexColors: true });
  paint.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float pat;\nvarying float vPat;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvPat = pat;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vPat;')
      .replace('#include <map_fragment>', `vec2 patUv = (vec2(floor(vPat + 0.5), 0.0) + fract(vMapUv)) / vec2(${N}.0, 1.0);
diffuseColor *= texture2D(map, patUv);`);
  };
  paint.customProgramCacheKey = () => 'city-kit';
  paint.userData.shared = true;
  const glow = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, toneMapped: false });
  glow.userData.shared = true;
  shared = { paint, glow };
  return shared;
}

// Boxes shaded per face like the voxels (bright tops, darker sides and undersides), so small
// things read as solid even when the light is flat.
const SHADE = { py: 1, ny: 0.45, x: 0.82, z: 0.7 };
export function shadedBox(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d);
  const n = g.attributes.normal, col = [];
  for (let i = 0; i < n.count; i++) {
    const x = n.getX(i), y = n.getY(i);
    const k = y > 0.5 ? SHADE.py : y < -0.5 ? SHADE.ny : Math.abs(x) > 0.5 ? SHADE.x : SHADE.z;
    col.push(k, k, k);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

// A kit collects boxes and merges them into one mesh: one draw call per car, limb or stall.
// box(w, h, d, colour, x, y, z, opts): opts is `true` for a self-lit box, or
// { lit, pat, rx, ry, rz } with a pattern from PAT and a rotation (radians, applied before moving).
export function kit() {
  const parts = [], c = new THREE.Color(), e = new THREE.Euler();
  return {
    box(w, h, d, color, x, y, z, opts = {}) {
      const o = opts === true ? { lit: true } : opts;
      const g = o.lit ? new THREE.BoxGeometry(w, h, d) : shadedBox(w, h, d);
      c.set(color);
      const col = g.attributes.color ?? new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3);
      const n = g.attributes.normal, p = g.attributes.position, uv = g.attributes.uv;
      for (let i = 0; i < col.count; i++) {
        // A sheen: the purple sky and the neon caught on the paint, strongest on top, so even a
        // black car keeps its shape at night.
        const up = o.lit ? 0 : n.getY(i) > 0.5 ? 1 : n.getY(i) < -0.5 ? 0 : 0.35;
        col.setXYZ(i, col.getX(i) * c.r + up * 0.05, col.getY(i) * c.g + up * 0.035, col.getZ(i) * c.b + up * 0.09);
        // Pattern coordinates in world units (one tile repeat per unit), offset by the position.
        const ax = Math.abs(n.getX(i)) > 0.5, ay = Math.abs(n.getY(i)) > 0.5;
        const px = p.getX(i) + x, py = p.getY(i) + y, pz = p.getZ(i) + z;
        if (ax) uv.setXY(i, pz, py); else if (ay) uv.setXY(i, px, pz); else uv.setXY(i, px, py);
      }
      g.setAttribute('color', col);
      g.setAttribute('pat', new THREE.Float32BufferAttribute(new Float32Array(p.count).fill(o.pat ?? PAT.plain), 1));
      if (o.rx || o.ry || o.rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(e.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0)));
      g.translate(x, y, z);
      parts.push(g);
      return this;
    },
    get empty() { return parts.length === 0; },
    mesh(lit = false) {
      const m = new THREE.Mesh(mergeGeometries(parts), lit ? materials().glow : materials().paint);
      for (const p of parts) p.dispose();
      return m;
    },
  };
}
