// Helpers shared by the engine (main.js) and the scenes (valley/, city/).
import * as THREE from 'three';

export function rng(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Soft round halo used by every glow sprite. Shared, so scenes must not dispose it.
export const glowTexture = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.userData.shared = true;
  return t;
})();

// Additive halo sprite. `strength` is its full opacity; scenes scale it by night or by a level.
export function makeGlow(parent, x, y, z, size, color, strength) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false,
  }));
  s.position.set(x, y, z);
  s.scale.setScalar(size);
  s.userData.strength = strength;
  parent.add(s);
  return s;
}

export function makeBox(parent, w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

// Frees the GPU memory of everything under `root` (geometries, materials, their textures).
export function disposeTree(root) {
  const mats = new Set();
  root.traverse((o) => {
    o.geometry?.dispose();
    if (o.material) [].concat(o.material).forEach((m) => mats.add(m));
  });
  for (const m of mats) {
    for (const v of Object.values(m)) if (v?.isTexture && !v.userData.shared) v.dispose();
    m.dispose();
  }
}

export function pixelTexture(canvas, repeat) {
  const t = new THREE.CanvasTexture(canvas);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Day keyframes are sampled the same way for every scene. A key holds colours (strings) and
// numbers; sample() lerps all of them.
export function sampleKeys(keys, t) {
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1].t <= t) i++;
  const a = keys[i], b = keys[i + 1];
  const f = (t - a.t) / (b.t - a.t);
  const out = {};
  for (const k in a) {
    if (k === 't') continue;
    out[k] = typeof a[k] === 'number' ? a[k] + (b[k] - a[k]) * f : new THREE.Color(a[k]).lerp(new THREE.Color(b[k]), f);
  }
  return out;
}

// Puffy clouds: clusters of spheres voxelised at 2 units, white on top and lilac-blue underneath.
// Two copies side by side, so the group can slide by `span` and wrap around seamlessly.
export function makeClouds(mat, seed, count, z0, z1, y, scale, span) {
  const r = rng(seed), V = 2;
  const pos = [], nor = [], col = [], index = [];
  const shadeTop = [1, 1, 1], shadeSide = [0.93, 0.94, 1], shadeBottom = [0.8, 0.82, 0.96];
  const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  for (let copy = 0; copy < 2; copy++) for (let i = 0; i < count; i++) {
    const cx = (i + r() * 0.8) / count * span + copy * span, cz = z0 + r() * (z1 - z0), cy = r() * 8;
    const big = (0.7 + r() * 0.8) * scale;
    const blobs = [];
    const n = 3 + Math.floor(r() * 4);
    for (let j = 0; j < n; j++) {
      const t = n === 1 ? 0 : j / (n - 1) - 0.5;
      blobs.push([t * 22 * big + (r() - 0.5) * 4, (1 - Math.abs(t) * 1.6) * 3 * big, (r() - 0.5) * 8 * big, (4 + r() * 3.5) * big * (1 - Math.abs(t) * 0.6)]);
    }
    const cells = new Set(), key = (a, b, c) => a + ',' + b + ',' + c;
    for (const [bx, by, bz, br] of blobs) {
      const R = Math.ceil(br / V);
      for (let a = -R; a <= R; a++) for (let b = 0; b <= R; b++) for (let c = -R; c <= R; c++) {
        const x = Math.round(bx / V) + a, y = Math.round(by / V) + b, z = Math.round(bz / V) + c;
        const dx = x * V - bx, dy = (y * V - by) * 1.25, dz = z * V - bz;
        if (dx * dx + dy * dy + dz * dz <= br * br && y >= 0) cells.add(key(x, y, z));
      }
    }
    for (const k of cells) {
      const [x, y, z] = k.split(',').map(Number);
      for (const d of DIRS) {
        if (cells.has(key(x + d[0], y + d[1], z + d[2]))) continue;
        const base = pos.length / 3;
        const ax = d[0] ? 0 : d[1] ? 1 : 2, u = (ax + 1) % 3, w = (ax + 2) % 3;
        const corner = (su, sw) => {
          const p = [x, y, z].map((v, q) => v * V + (q === ax ? (d[q] > 0 ? V : 0) : 0));
          p[u] += su * V; p[w] += sw * V;
          pos.push(cx + p[0], cy + p[1], cz + p[2]);
          nor.push(...d);
          col.push(...(d[1] > 0 ? shadeTop : d[1] < 0 ? shadeBottom : shadeSide));
        };
        corner(0, 0); corner(1, 0); corner(1, 1); corner(0, 1);
        const flip = d[0] + d[1] + d[2] < 0;
        if (flip) index.push(base, base + 2, base + 1, base, base + 3, base + 2);
        else index.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(index);
  const m = new THREE.Mesh(g, mat);
  m.position.set(-span, y, 0);
  m.frustumCulled = false;
  return m;
}
