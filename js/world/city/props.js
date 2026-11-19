// Street furniture: lamps, utility poles with sagging wires, traffic lights, and the yakitori
// stall whose grill follows the Fire slider. Light sources are added to city.lights so the
// baked neon light includes them (call before buildCityMeshes).
import * as THREE from 'three';
import { makeBox, pixelTexture } from '../common.js';
import { G, CROSS } from './build.js';
import { kit, PAT } from './kit.js';

export const YATAI = { x: -7.6, z: 2.5 };

export function createProps(root, city, addGlow, traffic) {
  const lights = city.lights;
  const light = (x, y, z, color, intensity) => lights.push({ x, y, z, color: new THREE.Color(color), intensity });
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x3a3844 });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x222028 });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe2b0 });
  const box = (...a) => makeBox(root, ...a);

  // ---------- street lamps along the kerb, leaning over the road ----------
  for (const z of [11, -14, -58, -82, -112, -134, -162, -186]) for (const s of [-1, 1]) {
    if (s > 0 && (z === -14 || z === -112)) continue;
    const x = s > 0 ? 6.25 : -5.25, zz = z + (s > 0 ? 0 : -6);
    box(0.16, 6.2, 0.16, poleMat, x, G + 3.1, zz);
    box(1.5, 0.12, 0.14, poleMat, x - s * 0.7, G + 6.15, zz);
    box(0.5, 0.12, 0.3, lampMat, x - s * 1.35, G + 6.05, zz).castShadow = false;
    addGlow(x - s * 1.35, G + 5.9, zz, 3.2, 0xffd8a0, 0.75, true);
    light(x - s * 1.35, G + 5.6, zz, '#ffd8a0', 2.2);
  }

  // ---------- street trees: a low stone planter, a slim trunk and two branches into the canopy ----------
  const barkMat = new THREE.MeshLambertMaterial({ color: 0x4a362e });
  const planterMat = new THREE.MeshLambertMaterial({ color: 0x7a7884 }), soilMat = new THREE.MeshLambertMaterial({ color: 0x3a2e2a });
  for (const [tx, tz] of city.trees) {
    const x = tx + 0.5, z = tz + 0.5;
    for (const [w, d, dx, dz] of [[1.5, 0.18, 0, -0.66], [1.5, 0.18, 0, 0.66], [0.18, 1.5, -0.66, 0], [0.18, 1.5, 0.66, 0]]) box(w, 0.35, d, planterMat, x + dx, G + 0.175, z + dz);
    box(1.2, 0.2, 1.2, soilMat, x, G + 0.1, z);
    box(0.36, 4.4, 0.36, barkMat, x, G + 2.2, z);
    const lean = Math.sign(-tx) * 0.5;                    // the tree leans a little towards the light over the road
    box(0.24, 1.8, 0.24, barkMat, x + lean * 0.8, G + 3.9, z + 0.3).rotation.set(0.35, 0, -lean);
    box(0.22, 1.6, 0.22, barkMat, x - lean * 0.6, G + 3.8, z - 0.4).rotation.set(-0.4, 0, lean * 0.8);
  }

  // ---------- utility poles and their wires ----------
  const wirePts = [];
  const wire = (a, b, sag) => {
    const N = 14;
    for (let i = 0; i < N; i++) {
      const p = (t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - Math.sin(Math.PI * t) * sag, a[2] + (b[2] - a[2]) * t];
      wirePts.push(...p(i / N), ...p((i + 1) / N));
    }
  };
  const poles = { '-1': [], '1': [] };
  for (const z of [14, -22, -60, -84, -118, -146, -176]) for (const s of [-1, 1]) {
    const x = s > 0 ? 9.55 : -8.55, zz = z + (s > 0 ? 3 : 0);
    box(0.28, 9.5, 0.28, poleMat, x, G + 4.75, zz);
    box(0.14, 0.14, 1.8, poleMat, x, G + 8.6, zz);
    if ((z + s) % 3 === 0) box(0.5, 0.8, 0.5, darkMat, x - s * 0.35, G + 7.2, zz);      // a transformer
    poles[s].push([x, zz]);
  }
  for (const s of [-1, 1]) {
    const list = poles[s];
    for (let i = 0; i + 1 < list.length; i++) {
      const [ax, az] = list[i], [bx, bz] = list[i + 1];
      for (const [dy, dz] of [[8.6, -0.8], [8.6, 0.8], [7.9, 0]]) wire([ax, G + dy, az + dz], [bx, G + dy, bz + dz], 0.9 + dy * 0.02);
    }
  }
  // A few cables slung across the street, and some down to the buildings.
  for (let i = 0; i < poles[1].length; i++) {
    const [ax, az] = poles[-1][i], [bx, bz] = poles[1][i];
    wire([ax, G + 8.4, az], [bx, G + 8.1, bz], 1.1);
    if (i % 2 === 0) wire([ax, G + 7.9, az], [bx, G + 7.6, bz + 2], 1.4);
    wire([bx, G + 7.9, bz], [bx + 0.45, G + 6.2, bz - 3], 0.3);
  }
  const wireGeo = new THREE.BufferGeometry();
  wireGeo.setAttribute('position', new THREE.Float32BufferAttribute(wirePts, 3));
  const wires = new THREE.LineSegments(wireGeo, new THREE.LineBasicMaterial({ color: 0x0c0a12 }));
  wires.frustumCulled = false;
  root.add(wires);

  // ---------- traffic lights at the crossing ----------
  const signalMats = ['#3dff8a', '#ffc23a', '#ff3b3b'].map((c) => new THREE.MeshBasicMaterial({ color: c }));
  const offMat = new THREE.MeshBasicMaterial({ color: 0x1a1a22 });
  const signals = [];
  for (const [x, z, s] of [[-5.6, CROSS.z1 + 2.6, -1], [6.6, CROSS.z0 - 2.4, 1]]) {
    box(0.18, 5.2, 0.18, poleMat, x, G + 2.6, z);
    box(3.6, 0.14, 0.14, poleMat, x - s * 1.8, G + 5.1, z);
    box(1.15, 0.4, 0.32, darkMat, x - s * 3.2, G + 5.1, z + 0.05);
    const lamps = [-0.36, 0, 0.36].map((dx, i) => {
      const m = box(0.24, 0.24, 0.05, offMat, x - s * 3.2 + dx, G + 5.1, z + 0.23);
      m.castShadow = false;
      return m;
    });
    const glow = addGlow(x - s * 3.2, G + 5.1, z + 0.4, 1.6, 0xffffff, 0.9, true);
    signals.push({ lamps, glow, x: x - s * 3.2 });
  }

  // ---------- the yakitori stall ----------
  const Y = YATAI;
  // The cart is open at the back, where the cook stands; customers sit on the street side.
  const yk = kit();
  const WOOD = '#7a4a2a', WOOD_L = '#a8784a', WOOD_D = '#4a2c1a', W = { pat: PAT.wood };
  yk.box(0.95, 0.9, 3.2, WOOD, Y.x + 0.52, G + 0.55, Y.z, W)                      // the counter block
    .box(0.1, 0.75, 3.2, WOOD, Y.x - 0.95, G + 0.5, Y.z, W)                       // back panel, low
    .box(1.9, 0.9, 0.1, WOOD, Y.x, G + 0.55, Y.z + 1.55, W)                       // ends
    .box(1.9, 0.9, 0.1, WOOD, Y.x, G + 0.55, Y.z - 1.55, W)
    .box(2.0, 0.08, 3.3, WOOD_D, Y.x, G + 0.12, Y.z, W)                           // floor
    .box(1.3, 0.08, 3.5, WOOD_L, Y.x + 0.62, G + 1.04, Y.z, W)                    // counter top
    .box(0.06, 0.12, 3.5, WOOD_D, Y.x + 1.28, G + 0.98, Y.z)                      // its lip
    .box(0.5, 0.05, 3.1, WOOD_L, Y.x - 0.7, G + 0.85, Y.z, W);                    // the cook's shelf
  for (const dz of [-1.5, -0.5, 0.5, 1.5]) yk.box(0.08, 0.9, 0.08, WOOD_D, Y.x + 1.01, G + 0.55, Y.z + dz);   // frame on the front
  for (const dy of [0.22, 0.92]) yk.box(0.06, 0.06, 3.2, WOOD_D, Y.x + 1.01, G + dy, Y.z);
  for (const dx of [-0.6, 0.3]) yk.box(0.06, 0.9, 0.06, WOOD_D, Y.x + dx, G + 0.55, Y.z + 1.61);
  // Big spoked wheels on the back.
  for (const dz of [-1.0, 1.0]) {
    const wx = Y.x - 1.07, wy = G + 0.4, wz = Y.z + dz;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      yk.box(0.1, 0.06, 0.32, WOOD_D, wx, wy + Math.sin(a) * 0.36, wz + Math.cos(a) * 0.36, { rx: -a });   // rim
    }
    for (let i = 0; i < 4; i++) yk.box(0.05, 0.7, 0.05, WOOD, wx, wy, wz, { rx: (i / 4) * Math.PI });       // spokes
    yk.box(0.14, 0.14, 0.14, '#2a2420', wx, wy, wz);
  }
  for (const [dx, dz] of [[-0.95, -1.55], [-0.95, 1.55], [0.95, -1.55], [0.95, 1.55]]) yk.box(0.1, 1.5, 0.1, WOOD, Y.x + dx, G + 1.85, Y.z + dz, W);
  // A pitched roof of corrugated sheet on rafters, with boards along the eaves.
  const ROOF = '#7a2e26';
  for (const s of [-1, 1]) yk.box(1.5, 0.06, 3.9, ROOF, Y.x + s * 0.68, G + 2.72, Y.z, { pat: PAT.ribbed, rz: -s * 0.18 });
  yk.box(0.14, 0.12, 3.95, '#5a1e1a', Y.x, G + 2.86, Y.z)                         // ridge
    .box(0.06, 0.24, 3.9, WOOD_D, Y.x + 1.4, G + 2.52, Y.z, W)                    // eave boards
    .box(0.06, 0.24, 3.9, WOOD_D, Y.x - 1.4, G + 2.52, Y.z, W)
    .box(2.6, 0.1, 0.08, WOOD_D, Y.x, G + 2.58, Y.z + 1.9);
  // On the counter: bottles, cups, a tray of skewers waiting for the grill.
  for (const [dz, c] of [[-1.35, '#2a5a3a'], [-1.2, '#5a3a1a'], [-1.05, '#e8e4dc']]) {
    yk.box(0.12, 0.34, 0.12, c, Y.x + 0.95, G + 1.25, Y.z + dz).box(0.05, 0.1, 0.05, c, Y.x + 0.95, G + 1.47, Y.z + dz).box(0.08, 0.08, 0.125, '#f4f0e0', Y.x + 0.95, G + 1.24, Y.z + dz);
  }
  for (const dz of [0.95, 1.25]) yk.box(0.1, 0.12, 0.1, '#f4f4f0', Y.x + 1.05, G + 1.14, Y.z + dz).box(0.07, 0.02, 0.07, '#e8c060', Y.x + 1.05, G + 1.19, Y.z + dz);
  yk.box(0.3, 0.03, 0.5, '#e8e4dc', Y.x - 0.7, G + 0.89, Y.z + 0.9);
  for (let i = 0; i < 5; i++) yk.box(0.26, 0.04, 0.05, '#c87a4a', Y.x - 0.7, G + 0.92, Y.z + 0.72 + i * 0.09);
  // The grill: a charcoal box with a grate on top.
  yk.box(0.5, 0.22, 1.2, '#2a2a30', Y.x + 0.25, G + 1.19, Y.z, { pat: PAT.metal })
    .box(0.46, 0.02, 1.16, '#4a4a52', Y.x + 0.25, G + 1.31, Y.z, { pat: PAT.grille, ry: Math.PI / 2 });
  // Stools for the customers, crates of empties, and a chalk board on the pavement.
  for (const dz of [-1, 0, 1]) {
    const sx = Y.x + 1.75, sz = Y.z + dz * 1.1;
    yk.box(0.4, 0.07, 0.4, '#b82a2a', sx, G + 0.56, sz, { pat: PAT.fabric }).box(0.42, 0.04, 0.42, '#3a3a42', sx, G + 0.51, sz);
    for (const [lx, lz] of [[-0.15, -0.15], [0.15, -0.15], [-0.15, 0.15], [0.15, 0.15]]) yk.box(0.04, 0.5, 0.04, '#5a5a64', sx + lx, G + 0.25, sz + lz);
  }
  for (const [dy, c] of [[0.17, '#e8c43a'], [0.5, '#c83a3a']]) {
    yk.box(0.5, 0.32, 0.4, c, Y.x - 0.6, G + dy, Y.z - 2.05, { pat: PAT.grille });
    for (const dx of [-0.12, 0, 0.12]) yk.box(0.07, 0.04, 0.07, '#5a3a1a', Y.x - 0.6 + dx, G + dy + 0.17, Y.z - 2.05);
  }
  {                                                                               // an A-frame menu board
    const bx = Y.x + 1.7, bz = Y.z + 2.35;
    yk.box(0.56, 0.86, 0.04, WOOD, bx, G + 0.45, bz - 0.03, { rx: -0.2, pat: PAT.wood })
      .box(0.48, 0.76, 0.03, '#1e2a24', bx, G + 0.45, bz, { rx: -0.2 })
      .box(0.56, 0.86, 0.04, WOOD, bx, G + 0.45, bz - 0.36, { rx: 0.2, pat: PAT.wood });
    for (let i = 0; i < 5; i++) yk.box(0.32 - (i % 2) * 0.12, 0.025, 0.02, i ? '#e8e4dc' : '#ffb84a', bx - (i % 2) * 0.06, G + 0.72 - i * 0.12, bz + 0.02 + i * 0.024, { rx: -0.2 });
  }
  const stall = yk.mesh();
  stall.castShadow = stall.receiveShadow = true;
  root.add(stall);
  // Noren: the split cloth hanging from the roof on the street side, with an invented crest.
  const norenCanvas = document.createElement('canvas');
  norenCanvas.width = 108; norenCanvas.height = 20;
  {
    const g = norenCanvas.getContext('2d');
    g.fillStyle = '#2a2a5a'; g.fillRect(0, 0, 108, 20);
    g.fillStyle = '#3a3a72'; for (let x = 0; x < 108; x += 3) g.fillRect(x, 0, 1, 20);
    g.fillStyle = '#1a1a3a'; g.fillRect(0, 0, 108, 2);
    for (let i = 0; i < 3; i++) {
      const cx = i * 36 + 17, cy = 10;
      g.fillStyle = '#f4f0e8';
      for (let y = -5; y <= 5; y++) for (let x = -5; x <= 5; x++) { const d = Math.hypot(x, y); if (d <= 5.2 && d > 3.6) g.fillRect(cx + x, cy + y, 1, 1); }
      g.fillRect(cx - 2, cy - 1, 5, 1); g.fillRect(cx, cy - 3, 1, 6); g.fillRect(cx - 2, cy + 2, 5, 1);
    }
    g.fillStyle = '#0e0e20';
    for (const x of [35, 71]) g.fillRect(x, 5, 2, 15);
  }
  const noren = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.62), new THREE.MeshLambertMaterial({ map: pixelTexture(norenCanvas), side: THREE.DoubleSide }));
  noren.position.set(Y.x + 1.38, G + 2.1, Y.z);
  noren.rotation.y = Math.PI / 2;
  root.add(noren);
  // Red paper lanterns.
  const lanternMat = new THREE.MeshBasicMaterial({ color: 0xff5a3a });
  const lanterns = [];
  const lk = kit();
  for (const dz of [-1.82, 1.82]) {
    const lx = Y.x + 1.3, lz = Y.z + dz;
    const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.5, 8), lanternMat);
    lantern.position.set(lx, G + 2.15, lz);
    root.add(lantern);
    lk.box(0.32, 0.06, 0.32, '#1a1418', lx, G + 2.42, lz).box(0.32, 0.06, 0.32, '#1a1418', lx, G + 1.88, lz)
      .box(0.02, 0.12, 0.02, '#1a1418', lx, G + 2.5, lz);
    for (const dy of [-0.15, 0, 0.15]) lk.box(0.42, 0.015, 0.42, '#7a2a1a', lx, G + 2.15 + dy, lz, { ry: Math.PI / 8 });   // ribs
    lk.box(0.015, 0.2, 0.015, '#1a1418', lx, G + 1.78, lz);                                 // tassel
    lanterns.push(addGlow(lx, G + 2.15, lz, 2.6, 0xff6a3a, 0.9, true));
    light(lx + 0.5, G + 2.1, lz, '#ff6a3a', 1.6);
  }
  root.add(lk.mesh());
  city.signs.push({ kind: 'board', normal: 'z+', x: Y.x, y: G + 3.25, z: Y.z + 1.78, w: 2.2, h: 0.5, color: '#ff3b3b', style: 'panel', text: 'YAKITORI', seed: 5 });
  // Pixel flames over the grill and a column of smoke.
  const fireCanvas = document.createElement('canvas');
  fireCanvas.width = 24; fireCanvas.height = 10;
  const fireTex = pixelTexture(fireCanvas);
  const fireMat = new THREE.MeshBasicMaterial({ map: fireTex, transparent: true, alphaTest: 0.1, side: THREE.DoubleSide, depthWrite: false, toneMapped: false });
  const flame = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.5), fireMat);
  flame.position.set(Y.x + 0.25, G + 1.56, Y.z);
  flame.rotation.y = Math.PI / 2;
  root.add(flame);
  // Skewers over the grill.
  const sk = kit();
  for (let i = 0; i < 6; i++) {
    const z = Y.z - 0.45 + i * 0.18;
    sk.box(0.56, 0.02, 0.02, '#d8b888', Y.x + 0.25, G + 1.34, z);
    for (const dx of [-0.08, 0.02, 0.12]) sk.box(0.08, 0.06, 0.06, '#8a4a2a', Y.x + 0.25 + dx, G + 1.36, z);
  }
  root.add(sk.mesh());
  const grillLight = new THREE.PointLight(0xff8a3c, 0, 9, 1.6);
  grillLight.position.set(Y.x + 0.8, G + 1.9, Y.z);
  root.add(grillLight);
  const grillGlow = addGlow(Y.x + 0.2, G + 1.7, Y.z, 2.6, 0xff8a3c, 0.8, true);
  light(Y.x + 1.2, G + 1.6, Y.z, '#ff8a3c', 1.2);
  function drawGrill(level) {
    const g = fireCanvas.getContext('2d');
    g.clearRect(0, 0, 24, 10);
    for (let x = 1; x < 23; x++) {
      g.fillStyle = Math.random() < 0.4 ? '#ff8a2c' : '#a8301a';
      g.fillRect(x, 9, 1, 1);
      const h = Math.round((1 + Math.random() * 6) * level * (0.6 + 0.4 * Math.sin(x * 0.9)));
      for (let k = 0; k < h; k++) {
        const f = k / Math.max(1, h);
        g.fillStyle = f < 0.35 ? '#fff0a0' : f < 0.7 ? '#ffa83c' : '#ff5a24';
        g.fillRect(x, 8 - k, 1, 1);
      }
    }
    fireTex.needsUpdate = true;
  }
  const SMOKE = 26;
  const sGeo = new THREE.BufferGeometry(), sPos = new Float32Array(SMOKE * 3), sAge = new Float32Array(SMOKE);
  for (let i = 0; i < SMOKE; i++) sAge[i] = Math.random() * 4;
  sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  const smoke = new THREE.Points(sGeo, new THREE.PointsMaterial({ color: 0xc8c0d0, size: 0.4, transparent: true, opacity: 0.3, depthWrite: false }));
  smoke.frustumCulled = false;
  root.add(smoke);

  let fireTimer = 0;
  return {
    applyTime(night) {
      lampMat.color.setScalar(0.55 + night * 0.45).multiply(new THREE.Color(0xffe2b0));
      lanternMat.color.setRGB(1, 0.35, 0.23).multiplyScalar(0.6 + night * 0.4);
    },
    update(step, time, env) {
      const fire = env.fire, night = env.k.night;
      fireTimer += step;
      if (fireTimer > 0.1) {
        fireTimer = 0;
        drawGrill(fire);
        grillLight.intensity = (5 + Math.random() * 3) * (0.2 + night) * (0.1 + fire);
        grillGlow.userData.level = 0.25 + fire * 0.75;
        grillGlow.scale.setScalar((1.2 + fire * 2.4) * (1 + Math.random() * 0.15));
      }
      smoke.material.opacity = 0.12 + fire * 0.3;
      for (let i = 0; i < SMOKE; i++) {
        sAge[i] = (sAge[i] + step) % 4;
        const a = sAge[i];
        sPos[i * 3] = Y.x + 0.2 + Math.sin(a * 1.4 + i) * 0.15 + a * 0.15;
        sPos[i * 3 + 1] = G + 1.6 + a * (0.5 + fire * 0.5);
        sPos[i * 3 + 2] = Y.z - 0.4 + (i % 5) * 0.2 + Math.cos(a + i) * 0.1;
      }
      sGeo.attributes.position.needsUpdate = true;
      // The heads face down the main street, so they show its light.
      const on = { green: 0, amber: 1, red: 2 }[traffic.main];
      for (const sg of signals) {
        sg.lamps.forEach((m, k) => { m.material = k === on ? signalMats[k] : offMat; });
        sg.glow.material.color.copy(signalMats[on].color);
      }
    },
  };
}
