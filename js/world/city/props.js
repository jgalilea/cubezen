// Street furniture: lamps, utility poles with sagging wires, traffic lights, and the yakitori
// stall whose grill follows the Fire slider. Light sources are added to city.lights so the
// baked neon light includes them (call before buildCityMeshes).
import * as THREE from 'three';
import { makeBox, pixelTexture } from '../common.js';
import { G, CROSS } from './build.js';

export const YATAI = { x: -7.6, z: 2.5 };

export function createProps(root, city, addGlow) {
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
  const wood = new THREE.MeshLambertMaterial({ color: 0x7a4a2a }), woodLight = new THREE.MeshLambertMaterial({ color: 0xa8784a });
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x6a2a24 });
  box(2.0, 1.0, 3.2, wood, Y.x, G + 0.55, Y.z);
  box(2.3, 0.1, 3.5, woodLight, Y.x, G + 1.1, Y.z);
  for (const dz of [-1.25, 1.25]) box(0.12, 0.6, 0.6, darkMat, Y.x - 1.05, G + 0.3, Y.z + dz);    // wheels
  for (const [dx, dz] of [[-0.95, -1.55], [-0.95, 1.55], [0.95, -1.55], [0.95, 1.55]]) box(0.1, 1.5, 0.1, wood, Y.x + dx, G + 1.85, Y.z + dz);
  box(2.7, 0.14, 3.8, roofMat, Y.x, G + 2.65, Y.z);
  box(2.4, 0.3, 3.5, roofMat, Y.x, G + 2.85, Y.z);
  for (const dz of [-1, 0, 1]) box(0.45, 0.5, 0.45, darkMat, Y.x + 1.7, G + 0.25, Y.z + dz * 1.1);           // stools
  // Noren: the split cloth hanging from the roof on the street side.
  const norenCanvas = document.createElement('canvas');
  norenCanvas.width = 48; norenCanvas.height = 12;
  {
    const g = norenCanvas.getContext('2d');
    g.fillStyle = '#2a2a5a'; g.fillRect(0, 0, 48, 12);
    g.fillStyle = '#f4f0e8';
    for (let i = 0; i < 3; i++) { g.fillRect(i * 16 + 6, 3, 4, 1); g.fillRect(i * 16 + 7, 3, 2, 6); g.fillRect(i * 16 + 5, 6, 6, 1); }
    g.fillStyle = '#1a1a3a';
    for (const x of [15, 31]) g.fillRect(x, 4, 2, 8);
  }
  const noren = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.6), new THREE.MeshLambertMaterial({ map: pixelTexture(norenCanvas), side: THREE.DoubleSide }));
  noren.position.set(Y.x + 1.33, G + 2.3, Y.z);
  noren.rotation.y = Math.PI / 2;
  root.add(noren);
  // Red paper lanterns.
  const lanternMat = new THREE.MeshBasicMaterial({ color: 0xff5a3a });
  const lanterns = [];
  for (const dz of [-1.5, 1.5]) {
    const lx = Y.x + 1.25, lz = Y.z + dz;
    box(0.42, 0.55, 0.42, lanternMat, lx, G + 2.15, lz).castShadow = false;
    box(0.46, 0.06, 0.46, darkMat, lx, G + 2.45, lz);
    box(0.46, 0.06, 0.46, darkMat, lx, G + 1.86, lz);
    lanterns.push(addGlow(lx, G + 2.15, lz, 2.6, 0xff6a3a, 0.9, true));
    light(lx + 0.5, G + 2.1, lz, '#ff6a3a', 1.6);
  }
  city.signs.push({ kind: 'board', normal: 'z+', x: Y.x, y: G + 3.25, z: Y.z + 1.78, w: 2.2, h: 0.5, color: '#ff3b3b', style: 'panel', text: 'YAKITORI', seed: 5 });
  // The grill: a dark box with pixel flames and a column of smoke.
  box(1.2, 0.25, 0.5, darkMat, Y.x + 0.2, G + 1.27, Y.z);
  const fireCanvas = document.createElement('canvas');
  fireCanvas.width = 24; fireCanvas.height = 10;
  const fireTex = pixelTexture(fireCanvas);
  const fireMat = new THREE.MeshBasicMaterial({ map: fireTex, transparent: true, alphaTest: 0.1, side: THREE.DoubleSide, depthWrite: false, toneMapped: false });
  const flame = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.5), fireMat);
  flame.position.set(Y.x + 0.2, G + 1.62, Y.z);
  flame.rotation.y = Math.PI / 2;
  root.add(flame);
  // Skewers over the grill.
  for (let i = 0; i < 5; i++) box(0.5, 0.06, 0.08, woodLight, Y.x + 0.2, G + 1.45, Y.z - 0.4 + i * 0.2).castShadow = false;
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

  let fireTimer = 0, signalT = 0;
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
      // Traffic lights: green 12 s, amber 3 s, red 15 s; the two sides are out of phase.
      signalT += step;
      signals.forEach((s, i) => {
        const t = (signalT + i * 15) % 30, on = t < 12 ? 0 : t < 15 ? 1 : 2;
        s.lamps.forEach((m, k) => { m.material = k === on ? signalMats[k] : offMat; });
        s.glow.material.color.copy(signalMats[on].color);
      });
    },
  };
}
