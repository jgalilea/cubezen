// Cubezen's 3D voxel background: day/night cycle, seasons, weather and cosy lights.
import * as THREE from 'three';
import { createAtlas, SEASONS, rng } from './textures.js';
import { generateWorld, buildTerrain, buildWater, buildFoam, buildPlants, buildFar } from './build.js';
import { createCritters } from './critters.js';
import { createProps } from './props.js';

const PIXEL = 0.5;            // render at half resolution for a soft pixel look
const DAY_LENGTH = 20 * 60;   // seconds per full day in cycle mode
const params = new URLSearchParams(location.search);

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'low-power', preserveDrawingBuffer: params.has('shot') });
renderer.setPixelRatio(PIXEL);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
// The scene renders into a linear HDR target; a final pass does the tone mapping and grading.
renderer.toneMapping = THREE.NoToneMapping;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xffffff, 45, 260);
const camera = new THREE.PerspectiveCamera(48, 1, 0.5, 900);
const CAM_POS = new THREE.Vector3(52, 25, 101), CAM_TARGET = new THREE.Vector3(63, 10, 46);

// ---------- world ----------
const world = generateWorld();
const atlas = createAtlas();
const blockMat = new THREE.MeshLambertMaterial({
  map: atlas.map, vertexColors: true, alphaTest: 0.5,
  emissive: 0xffffff, emissiveMap: atlas.emissiveMap, emissiveIntensity: 0,
});
const terrain = new THREE.Mesh(buildTerrain(world), blockMat);
terrain.castShadow = terrain.receiveShadow = true;
scene.add(terrain);

const waterMat = new THREE.MeshLambertMaterial({ map: atlas.waterMap, transparent: true, opacity: 0.82, vertexColors: true });
const water = new THREE.Mesh(buildWater(world), waterMat);
water.receiveShadow = true;
scene.add(water);
const foamData = buildFoam(world);
const foamMat = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, transparent: true, opacity: 0.8, depthWrite: false });
const foam = new THREE.Mesh(foamData.geometry, foamMat);
scene.add(foam);
// Glints: little sparkles that wink on the open water in daylight.
const glintGeo = new THREE.BufferGeometry();
const glintPos = new Float32Array(foamData.glints.length * 3), glintCol = new Float32Array(foamData.glints.length * 3);
foamData.glints.forEach((g, i) => glintPos.set([g.x, g.y, g.z], i * 3));
glintGeo.setAttribute('position', new THREE.BufferAttribute(glintPos, 3));
glintGeo.setAttribute('color', new THREE.BufferAttribute(glintCol, 3));
const glints = new THREE.Points(glintGeo, new THREE.PointsMaterial({ size: 0.22, vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
scene.add(glints);
function updateWater(time, day) {
  foamMat.opacity = 0.55 + Math.sin(time * 1.3) * 0.15;
  foamData.glints.forEach((g, i) => {
    const b = Math.pow(Math.max(0, Math.sin(time * 1.7 * g.sp + g.ph)), 12) * day;
    glintCol[i * 3] = glintCol[i * 3 + 1] = glintCol[i * 3 + 2] = b;
  });
  glintGeo.attributes.color.needsUpdate = true;
}

const plantMat = new THREE.MeshLambertMaterial({ map: atlas.map, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide });
let plants = null, far = null;
const farMat = new THREE.MeshLambertMaterial({ vertexColors: true });

// ---------- cloud shadows ----------
// Instead of the shadow map (refreshed only twice a second, so it would stutter), a tiling mask of
// blobby pixel clouds is projected straight down and slid every frame. 1 texel = 2 blocks.
const cloudShadowTex = (() => {
  const N = 64, c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d'), r = rng(78);
  g.fillStyle = '#000';
  g.fillRect(0, 0, N, N);
  g.fillStyle = '#fff';
  for (let i = 0; i < 11; i++) {
    const cx = r() * N, cy = r() * N, n = 3 + Math.floor(r() * 3), big = 0.8 + r() * 0.6;
    for (let j = 0; j < n; j++) {
      const t = j / (n - 1) - 0.5, rad = (2.5 + r() * 2) * big * (1 - Math.abs(t) * 0.5);
      const x = cx + t * 11 * big, y = cy + (r() - 0.5) * 3;
      for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) { g.beginPath(); g.arc(x + ox, y + oy, rad, 0, Math.PI * 2); g.fill(); }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  return t;
})();
const cloudShadow = { map: { value: cloudShadowTex }, offset: { value: new THREE.Vector2() }, strength: { value: 0 } };
const wind = { time: { value: 0 }, amount: { value: 1 } };
// Shared shader tweaks: projected cloud shadows, and (for meshes with a 'sway' attribute) a soft
// wind that rocks leaves and grass. The offset is a smooth function of world position, so
// neighbouring leaf faces move together and never open gaps.
function withCloudShadows(mat, sways = false) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.cloudShadowMap = cloudShadow.map;
    shader.uniforms.cloudShadowOffset = cloudShadow.offset;
    shader.uniforms.cloudShadowStrength = cloudShadow.strength;
    shader.uniforms.windTime = wind.time;
    shader.uniforms.windAmount = wind.amount;
    const swayCode = sways ? `
  {
    vec3 wp = (modelMatrix * vec4(transformed, 1.0)).xyz;
    float gust = 0.6 + 0.4 * sin(windTime * 0.23 + wp.x * 0.02);
    float s = sway * windAmount * gust;
    transformed.x += (sin(windTime * 1.4 + wp.x * 0.35 + wp.z * 0.21) * 0.07 + sin(windTime * 2.9 + wp.y * 0.6 + wp.z * 0.5) * 0.025) * s;
    transformed.z += cos(windTime * 1.1 + wp.z * 0.3 + wp.x * 0.17) * 0.05 * s;
    transformed.y += sin(windTime * 1.7 + wp.x * 0.4) * 0.015 * s;
  }` : '';
    shader.vertexShader = (sways ? 'attribute float sway;\n' : '') + 'uniform float windTime; uniform float windAmount; varying vec2 vCloudXZ;\n' +
      shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>' + swayCode)
        .replace('#include <project_vertex>', '#include <project_vertex>\n  vCloudXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
    shader.fragmentShader = 'uniform sampler2D cloudShadowMap; uniform vec2 cloudShadowOffset; uniform float cloudShadowStrength; varying vec2 vCloudXZ;\n' +
      shader.fragmentShader.replace('#include <opaque_fragment>',
        'outgoingLight *= 1.0 - cloudShadowStrength * texture2D(cloudShadowMap, (vCloudXZ + cloudShadowOffset) / 128.0).r;\n  #include <opaque_fragment>');
  };
  mat.customProgramCacheKey = () => (sways ? 'sway' : 'still');
  return mat;
}
withCloudShadows(blockMat, true);
withCloudShadows(plantMat, true);
withCloudShadows(waterMat);

const critters = createCritters(scene, world);
const props = createProps(scene, world);

// ---------- small props: lantern posts, lanterns, campfire ----------
const woodMat = new THREE.MeshLambertMaterial({ color: 0x5a3b22 });
const ironMat = new THREE.MeshLambertMaterial({ color: 0x2d2d33 });
const lanternMat = new THREE.MeshBasicMaterial({ color: 0xffc66e });
const glowTexture = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const glows = [];
function addGlow(x, y, z, size, color, strength) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false,
  }));
  s.position.set(x, y, z);
  s.scale.setScalar(size);
  s.userData.strength = strength;
  scene.add(s);
  glows.push(s);
  return s;
}
const box = (w, h, d, mat, x, y, z) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  scene.add(m);
  return m;
};
for (const d of world.decor) {
  if (d.type === 'post') {
    box(0.22, 1.5, 0.22, woodMat, d.x, d.y + 0.75, d.z);
  } else {
    box(0.42, 0.08, 0.42, ironMat, d.x, d.y + 0.27, d.z);
    box(0.42, 0.06, 0.42, ironMat, d.x, d.y - 0.22, d.z);
    box(0.32, 0.42, 0.32, lanternMat, d.x, d.y, d.z).castShadow = false;
    if (d.hanging) box(0.05, 0.3, 0.05, ironMat, d.x, d.y + 0.45, d.z);
    addGlow(d.x, d.y, d.z, 3.2, 0xffb35c, 0.9);
  }
}
for (const w of world.windows) addGlow(w.x, w.y, w.z - 0.9, 7, 0xffb35c, 0.55);
for (const b of props.bulbs) {                            // the string of lights over the terrace
  box(0.12, 0.16, 0.12, lanternMat, b.x, b.y, b.z).castShadow = false;
  addGlow(b.x, b.y, b.z, 1.3, 0xffc878, 0.8);
}

// Campfire on its stone hearth: a log teepee, a ring of stones and animated pixel flames.
const F = world.fire;
for (let i = 0; i < 3; i++) {
  const log = box(1.3, 0.2, 0.24, woodMat, F.x, F.y + 0.12, F.z);
  log.rotation.y = 0.4 + (i * Math.PI) / 3;
}
for (let i = 0; i < 4; i++) {                              // sticks leaning into a teepee
  const a = (i / 4) * Math.PI * 2 + 0.3;
  const stick = box(0.12, 0.9, 0.12, woodMat, F.x + Math.cos(a) * 0.28, F.y + 0.4, F.z + Math.sin(a) * 0.28);
  stick.rotation.set(-Math.sin(a) * 0.45, 0, Math.cos(a) * 0.45);
}
const stoneMat = new THREE.MeshLambertMaterial({ color: 0x8a8a92 });
const stoneDark = new THREE.MeshLambertMaterial({ color: 0x66666e });
for (let i = 0; i < 12; i++) {
  const a = (i / 12) * Math.PI * 2;
  const s = 0.3 + (i % 3) * 0.05;
  box(s, 0.24 + (i % 2) * 0.06, s, i % 2 ? stoneDark : stoneMat, F.x + Math.cos(a) * 0.95, F.y + 0.12, F.z + Math.sin(a) * 0.95).rotation.y = a;
}
const fireCanvas = document.createElement('canvas');
fireCanvas.width = 16;
fireCanvas.height = 24;
const fireTex = new THREE.CanvasTexture(fireCanvas);
fireTex.magFilter = fireTex.minFilter = THREE.NearestFilter;
fireTex.colorSpace = THREE.SRGBColorSpace;
const fireMat = new THREE.MeshBasicMaterial({ map: fireTex, transparent: true, alphaTest: 0.1, side: THREE.DoubleSide, depthWrite: false, toneMapped: false });
const flames = [Math.PI / 4, -Math.PI / 4].map((rot) => {
  const geo = new THREE.PlaneGeometry(1.15, 1.75);
  geo.translate(0, 0.875, 0);                             // grow upwards from the logs
  const p = new THREE.Mesh(geo, fireMat);
  p.position.set(F.x, F.y + 0.03, F.z);
  p.rotation.y = rot;
  scene.add(p);
  return p;
});
// level 0–1 follows the fire volume: 0 leaves glowing embers and a wisp of smoke.
function drawFire(level) {
  const g = fireCanvas.getContext('2d');
  g.clearRect(0, 0, 16, 24);
  for (let x = 3; x < 13; x++) {                         // embers at the base, always lit
    g.fillStyle = Math.random() < 0.35 ? '#ff8a2c' : Math.random() < 0.5 ? '#c8341a' : '#7a1e12';
    g.fillRect(x, 23, 1, 1);
    if (Math.abs(x - 7.5) < 3 && Math.random() < 0.5) g.fillRect(x, 22, 1, 1);
  }
  if (level < 0.02) { fireTex.needsUpdate = true; return; }
  const scale = 0.2 + level * 0.95;
  for (let x = 2; x < 14; x++) {
    const h = Math.max(0, Math.round((14 - Math.abs(x - 7.5) * 2.4) * (0.6 + Math.random() * 0.5) * scale));
    for (let k = 0; k < h; k++) {
      const f = k / Math.max(1, h);
      g.fillStyle = f < 0.3 && Math.abs(x - 7.5) < 3 ? '#fff4b0' : f < 0.6 ? '#ffb43c' : f < 0.85 ? '#ff6a24' : '#d0401c';
      g.fillRect(x, 23 - k, 1, 1);
    }
  }
  fireTex.needsUpdate = true;
}
const fireLight = new THREE.PointLight(0xff8a3c, 25, 32, 1.5);
fireLight.position.set(F.x, F.y + 1.2, F.z);
scene.add(fireLight);
const fireGlow = addGlow(F.x, F.y + 1, F.z, 11, 0xff8a3c, 0.8);
const windowLight = new THREE.PointLight(0xffb35c, 0, 16, 1.6);
windowLight.position.set(69.5, world.G + 3, 62);
scene.add(windowLight);

// ---------- sky, sun, moon, stars, clouds ----------
const skyUniforms = {
  top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() },
  sunDir: { value: new THREE.Vector3() }, sunColor: { value: new THREE.Color() },
};
const sky = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 16), new THREE.ShaderMaterial({
  uniforms: skyUniforms, side: THREE.BackSide, depthWrite: false, fog: false,
  vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `
    uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunColor; varying vec3 vDir;
    void main(){
      float h = clamp(vDir.y, 0.0, 1.0);
      vec3 col = mix(horizon, top, pow(h, 0.55));
      float s = max(dot(normalize(vDir), sunDir), 0.0);
      col += sunColor * (pow(s, 8.0) * 0.45 + pow(s, 64.0) * 0.4) * smoothstep(-0.2, 0.15, sunDir.y);
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
}));
sky.renderOrder = -1;
scene.add(sky);

const sun = new THREE.Mesh(new THREE.PlaneGeometry(34, 34), new THREE.MeshBasicMaterial({ color: 0xfff6dc, fog: false, toneMapped: false }));
const moon = new THREE.Mesh(new THREE.PlaneGeometry(22, 22), new THREE.MeshBasicMaterial({ color: 0xe8ecff, fog: false, toneMapped: false, transparent: true }));
scene.add(sun, moon);

const stars = (() => {
  const r = rng(9), pos = [];
  for (let i = 0; i < 900; i++) {
    const u = r() * 2 - 1, a = r() * Math.PI * 2, y = Math.abs(u) * 0.95 + 0.05;
    const rad = Math.sqrt(1 - y * y);
    pos.push(Math.cos(a) * rad * 520, y * 520, Math.sin(a) * rad * 520);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, transparent: true, fog: false, depthWrite: false }));
})();
scene.add(stars);

// Puffy clouds: clusters of spheres voxelised at 2 units, white on top and lilac-blue underneath.
const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, emissive: 0xffffff, emissiveIntensity: 0.25, fog: false });
const clouds = new THREE.Group();
const CLOUD_SPAN = 320;
function makeClouds(seed, count, z0, z1, y, scale) {
  const r = rng(seed), V = 2;
  const pos = [], nor = [], col = [], index = [];
  const shadeTop = [1, 1, 1], shadeSide = [0.93, 0.94, 1], shadeBottom = [0.8, 0.82, 0.96];
  const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  for (let copy = 0; copy < 2; copy++) for (let i = 0; i < count; i++) {
    const cx = (i + r() * 0.8) / count * CLOUD_SPAN + copy * CLOUD_SPAN, cz = z0 + r() * (z1 - z0), cy = r() * 8;
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
  const m = new THREE.Mesh(g, cloudMat);
  m.position.set(-CLOUD_SPAN, y, 0);
  m.frustumCulled = false;
  clouds.add(m);
  return m;
}
makeClouds(77, 12, -210, -90, 34, 1.8);                    // on the horizon, among the far hills
scene.add(clouds);

// ---------- lights ----------
const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
scene.add(hemi);
const sunLight = new THREE.DirectionalLight(0xffffff, 2);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(innerWidth < 800 ? 1024 : 2048, innerWidth < 800 ? 1024 : 2048);
Object.assign(sunLight.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 400 });
sunLight.shadow.bias = -0.0004;
sunLight.shadow.normalBias = 0.04;
sunLight.target.position.set(56, 8, 55);
scene.add(sunLight, sunLight.target);

// ---------- time of day ----------
// t: 0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset.
// hs/hg: sky and ground colours of the fill light (ground is lilac, so shade reads violet, not grey).
// st/lt: the grade's shadow and highlight tints.
const KEYS = [
  { t: 0.00, top: '#0a0f2a', hor: '#232a5e', light: '#a8bcff', li: 0.75, hs: '#5f70b8', hg: '#2c2850', hi: 1.1, night: 1, st: '#1c2a6a', lt: '#c8d8ff' },
  { t: 0.21, top: '#171c4e', hor: '#4b4580', light: '#a8bcff', li: 0.65, hs: '#6470b8', hg: '#30284e', hi: 1.05, night: 0.95, st: '#22286a', lt: '#d0d8ff' },
  { t: 0.25, top: '#3e4794', hor: '#ec907e', light: '#ff9a7a', li: 0.4, hs: '#a890c8', hg: '#4a3456', hi: 0.95, night: 0.6, st: '#4a2a72', lt: '#ffd0b0' },
  { t: 0.29, top: '#5a78c8', hor: '#ffc29a', light: '#ffc490', li: 1.7, hs: '#f0c4d4', hg: '#6c5070', hi: 1.1, night: 0.1, st: '#4a3080', lt: '#ffe0b0' },
  { t: 0.36, top: '#4a8de6', hor: '#c2e2ff', light: '#fff1d8', li: 2.2, hs: '#c0daff', hg: '#6c6488', hi: 1.15, night: 0, st: '#30387a', lt: '#fff0c8' },
  { t: 0.50, top: '#4288e6', hor: '#cde8ff', light: '#fffaf0', li: 2.4, hs: '#c8e0ff', hg: '#6c6890', hi: 1.2, night: 0, st: '#2c3a7c', lt: '#fff4d0' },
  { t: 0.63, top: '#4a88e0', hor: '#ffe2bc', light: '#fff0d0', li: 2.2, hs: '#ccdaf4', hg: '#706090', hi: 1.15, night: 0, st: '#36367a', lt: '#ffe8c0' },
  { t: 0.70, top: '#7464c0', hor: '#ffa688', light: '#ffaa70', li: 1.9, hs: '#eab8da', hg: '#704a7a', hi: 1.15, night: 0.05, st: '#5a2a7a', lt: '#ffd8a8' },
  { t: 0.75, top: '#3c3480', hor: '#d4748e', light: '#ff8a70', li: 0.45, hs: '#a880c0', hg: '#4a3058', hi: 0.95, night: 0.55, st: '#4a2470', lt: '#ffc0b0' },
  { t: 0.79, top: '#171c4e', hor: '#4b3f78', light: '#a8bcff', li: 0.65, hs: '#6470b8', hg: '#30284e', hi: 1.05, night: 0.95, st: '#22286a', lt: '#d0d8ff' },
  { t: 1.00, top: '#0a0f2a', hor: '#232a5e', light: '#a8bcff', li: 0.75, hs: '#5f70b8', hg: '#2c2850', hi: 1.1, night: 1, st: '#1c2a6a', lt: '#c8d8ff' },
];
const tmpA = new THREE.Color(), tmpB = new THREE.Color();
function sample(t) {
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1].t <= t) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const f = (t - a.t) / (b.t - a.t);
  const c = (k) => tmpA.set(a[k]).lerp(tmpB.set(b[k]), f).clone();
  const n = (k) => a[k] + (b[k] - a[k]) * f;
  return { top: c('top'), hor: c('hor'), light: c('light'), li: n('li'), hs: c('hs'), hg: c('hg'), hi: n('hi'), night: n('night'), st: c('st'), lt: c('lt') };
}

const state = {
  timeMode: 'clock', season: 'auto', rain: 0, fire: 0.35,
  t: 0.62, resolvedSeason: null,
};
// Start from the saved settings (written by app.js), so the first frame already shows the
// chosen time, season, rain and fire instead of the defaults.
try {
  const world = JSON.parse(localStorage.getItem('cubezen.world'));
  if (world?.v === 2) Object.assign(state, { timeMode: world.time, season: world.season });
  const prefs = JSON.parse(localStorage.getItem('cubezen.prefs'));
  if (prefs) Object.assign(state, { rain: prefs.rain ?? 0, fire: prefs.fire ?? 0.35 });
} catch {}
const FIXED_TIMES = { day: 0.45, sunset: 0.715, night: 0.92 };

function seasonFromDate() {
  const m = new Date().getMonth();
  return m <= 1 || m === 11 ? 'winter' : m <= 4 ? 'spring' : m <= 7 ? 'summer' : 'autumn';
}

// ---------- particles ----------
const AREA = { x0: 20, x1: 100, y0: 6, y1: 34, z0: 40, z1: 96 };
const MAX_P = 700;
const pGeo = new THREE.BufferGeometry();
const pPos = new Float32Array(MAX_P * 3), pCol = new Float32Array(MAX_P * 3), pVel = new Float32Array(MAX_P * 4);
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
const pMat = new THREE.PointsMaterial({ size: 0.22, vertexColors: true, transparent: true, depthWrite: false });
const weather = new THREE.Points(pGeo, pMat);
weather.frustumCulled = false;
scene.add(weather);
let pKind = 'petal', pCount = 0;
function resetParticle(i, anywhere) {
  pPos[i * 3] = AREA.x0 + Math.random() * (AREA.x1 - AREA.x0);
  pPos[i * 3 + 1] = anywhere ? AREA.y0 + Math.random() * (AREA.y1 - AREA.y0) : AREA.y1;
  pPos[i * 3 + 2] = AREA.z0 + Math.random() * (AREA.z1 - AREA.z0);
  pVel[i * 4] = Math.random() * Math.PI * 2;
  pVel[i * 4 + 1] = 0.6 + Math.random() * 0.8;
}
function setupParticles(seasonName) {
  const p = SEASONS[seasonName].particles;
  pKind = p.kind;
  pCount = p.count;
  for (let i = 0; i < MAX_P; i++) {
    resetParticle(i, true);
    tmpA.set(p.colors[i % p.colors.length]);
    pCol[i * 3] = tmpA.r; pCol[i * 3 + 1] = tmpA.g; pCol[i * 3 + 2] = tmpA.b;
  }
  pMat.size = pKind === 'snow' ? 0.16 : pKind === 'pollen' ? 0.09 : 0.2;
  pGeo.setDrawRange(0, pCount);
  pGeo.attributes.color.needsUpdate = true;
}
function updateParticles(dt, time) {
  const fall = pKind === 'snow' ? 1.6 : pKind === 'pollen' ? -0.05 : 0.9;
  for (let i = 0; i < pCount; i++) {
    const ph = pVel[i * 4], sp = pVel[i * 4 + 1];
    pPos[i * 3] += (Math.sin(time * 0.7 * sp + ph) * 0.6 + 0.5) * dt;
    pPos[i * 3 + 1] -= fall * sp * dt + (pKind === 'pollen' ? Math.sin(time + ph) * 0.1 * dt : 0);
    pPos[i * 3 + 2] += Math.cos(time * 0.5 * sp + ph) * 0.4 * dt;
    if (pPos[i * 3 + 1] < AREA.y0 - 2 || pPos[i * 3 + 1] > AREA.y1 + 1 || pPos[i * 3] > AREA.x1) resetParticle(i, pKind === 'pollen');
  }
  pGeo.attributes.position.needsUpdate = true;
}

// Fireflies (spring/summer nights).
const FLIES = 130;
const fGeo = new THREE.BufferGeometry();
const fPos = new Float32Array(FLIES * 3), fCol = new Float32Array(FLIES * 3), fBase = [];
for (let i = 0; i < FLIES; i++) {
  fBase.push({ x: 30 + Math.random() * 65, z: 48 + Math.random() * 42, y: world.G + 1 + Math.random() * 3, ph: Math.random() * 6.28, sp: 0.5 + Math.random() });
}
fGeo.setAttribute('position', new THREE.BufferAttribute(fPos, 3));
fGeo.setAttribute('color', new THREE.BufferAttribute(fCol, 3));
const fireflies = new THREE.Points(fGeo, new THREE.PointsMaterial({ size: 0.18, vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false, fog: false }));
fireflies.frustumCulled = false;
scene.add(fireflies);
function updateFireflies(time, strength) {
  fireflies.visible = strength > 0.01;
  if (!fireflies.visible) return;
  fBase.forEach((f, i) => {
    fPos[i * 3] = f.x + Math.sin(time * 0.3 * f.sp + f.ph) * 3;
    fPos[i * 3 + 1] = f.y + Math.sin(time * 0.5 * f.sp + f.ph * 2) * 0.8;
    fPos[i * 3 + 2] = f.z + Math.cos(time * 0.25 * f.sp + f.ph) * 3;
    const b = Math.max(0, Math.sin(time * 1.4 * f.sp + f.ph * 3)) * strength;
    fCol[i * 3] = 0.85 * b; fCol[i * 3 + 1] = 1.0 * b; fCol[i * 3 + 2] = 0.45 * b;
  });
  fGeo.attributes.position.needsUpdate = fGeo.attributes.color.needsUpdate = true;
}

// Rain streaks.
const RAIN = 1800;
const rGeo = new THREE.BufferGeometry();
const rPos = new Float32Array(RAIN * 6);
for (let i = 0; i < RAIN; i++) setDrop(i, true);
function setDrop(i, anywhere) {
  const x = AREA.x0 + Math.random() * (AREA.x1 - AREA.x0), z = AREA.z0 + Math.random() * (AREA.z1 - AREA.z0);
  const y = anywhere ? AREA.y0 + Math.random() * 36 : AREA.y1 + 8 + Math.random() * 6;
  rPos.set([x, y, z, x - 0.05, y - 0.7, z], i * 6);
}
rGeo.setAttribute('position', new THREE.BufferAttribute(rPos, 3));
const rain = new THREE.LineSegments(rGeo, new THREE.LineBasicMaterial({ color: 0xaac4ee, transparent: true, opacity: 0.45, depthWrite: false }));
rain.frustumCulled = false;
scene.add(rain);
function updateRain(dt) {
  const n = Math.round(RAIN * state.rain);
  rGeo.setDrawRange(0, n * 2);
  rain.visible = n > 0;
  for (let i = 0; i < n; i++) {
    const dy = 26 * dt;
    rPos[i * 6 + 1] -= dy; rPos[i * 6 + 4] -= dy;
    rPos[i * 6] -= dy * 0.07; rPos[i * 6 + 3] -= dy * 0.07;
    if (rPos[i * 6 + 1] < AREA.y0 - 3) setDrop(i, false);
  }
  rGeo.attributes.position.needsUpdate = true;
}

// Chimney smoke, campfire smoke and embers.
const SMOKE = 40, EMBERS = 24, WISPS = 30;
const sGeo = new THREE.BufferGeometry(), sPos = new Float32Array(SMOKE * 3), sAge = new Float32Array(SMOKE);
const ch = world.chimney;
for (let i = 0; i < SMOKE; i++) { sAge[i] = Math.random() * 7; }
sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
const smoke = new THREE.Points(sGeo, new THREE.PointsMaterial({ color: 0xd6d6de, size: 0.7, transparent: true, opacity: 0.4, depthWrite: false }));
const wGeo = new THREE.BufferGeometry(), wPos = new Float32Array(WISPS * 3), wAge = new Float32Array(WISPS);
for (let i = 0; i < WISPS; i++) wAge[i] = Math.random() * 5;
wGeo.setAttribute('position', new THREE.BufferAttribute(wPos, 3));
const wisps = new THREE.Points(wGeo, new THREE.PointsMaterial({ color: 0xc8c8d0, size: 0.32, transparent: true, opacity: 0.35, depthWrite: false }));
wisps.frustumCulled = false;
scene.add(wisps);
smoke.frustumCulled = false;
scene.add(smoke);
const eGeo = new THREE.BufferGeometry(), ePos = new Float32Array(EMBERS * 3), eAge = new Float32Array(EMBERS);
for (let i = 0; i < EMBERS; i++) eAge[i] = Math.random() * 2;
eGeo.setAttribute('position', new THREE.BufferAttribute(ePos, 3));
const embers = new THREE.Points(eGeo, new THREE.PointsMaterial({ color: 0xffa040, size: 0.08, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false }));
embers.frustumCulled = false;
scene.add(embers);
function updateSmokeAndEmbers(dt, time, level) {
  // Chimney: a thin trail when the fire is low, a fuller plume when it's high.
  sGeo.setDrawRange(0, Math.round(14 + level * (SMOKE - 14)));
  smoke.material.opacity = 0.22 + level * 0.25;
  smoke.material.size = 0.5 + level * 0.35;
  // Campfire: smoke is most visible when it's only smouldering.
  wisps.material.opacity = 0.12 + (1 - level) * 0.3;
  for (let i = 0; i < WISPS; i++) {
    wAge[i] = (wAge[i] + dt) % 5;
    const a = wAge[i];
    wPos[i * 3] = F.x + a * 0.25 + Math.sin(a * 1.7 + i) * 0.18;
    wPos[i * 3 + 1] = F.y + 0.3 + a * (0.55 + level * 0.4);
    wPos[i * 3 + 2] = F.z + Math.cos(a * 1.3 + i * 2.1) * 0.18;
  }
  wGeo.attributes.position.needsUpdate = true;
  eGeo.setDrawRange(0, Math.round(EMBERS * level));
  for (let i = 0; i < SMOKE; i++) {
    sAge[i] = (sAge[i] + dt) % 7;
    const a = sAge[i];
    sPos[i * 3] = ch.x + 0.5 + a * 0.55 + Math.sin(a * 1.3 + i) * 0.2;
    sPos[i * 3 + 1] = world.G + 14 + a * 1.1;
    sPos[i * 3 + 2] = ch.z + 0.5 + Math.cos(a + i) * 0.2;
  }
  sGeo.attributes.position.needsUpdate = true;
  for (let i = 0; i < EMBERS; i++) {
    eAge[i] += dt;
    if (eAge[i] > 2) eAge[i] = 0;
    const a = eAge[i];
    ePos[i * 3] = F.x + Math.sin(i * 7.1 + time) * 0.25 + a * 0.1;
    ePos[i * 3 + 1] = F.y + 0.6 + a * (0.8 + level * 0.9);
    ePos[i * 3 + 2] = F.z + Math.cos(i * 3.3) * 0.25;
  }
  eGeo.attributes.position.needsUpdate = true;
}

// ---------- apply time & season ----------
function applySeason(name) {
  if (state.resolvedSeason === name) return;
  state.resolvedSeason = name;
  atlas.paint(name);
  if (plants) { scene.remove(plants); plants.geometry.dispose(); }
  plants = new THREE.Mesh(buildPlants(world, name), plantMat);
  plants.receiveShadow = true;
  scene.add(plants);
  if (far) { scene.remove(far); far.geometry.dispose(); }
  far = new THREE.Mesh(buildFar(world, name), farMat);
  scene.add(far);
  const winter = name === 'winter';
  waterMat.opacity = winter ? 0.96 : 0.88;
  waterMat.vertexColors = !winter;                         // ice ignores the depth bands
  waterMat.needsUpdate = true;
  foam.visible = glints.visible = !winter;
  setupParticles(name);
  props.setSeason(name);
  renderer.shadowMap.needsUpdate = true;
}

const sunDir = new THREE.Vector3();
function applyTime(t) {
  const k = sample(t);
  const winter = state.resolvedSeason === 'winter';
  const wet = state.rain;
  const grey = new THREE.Color(0x5a6270);
  const hor = k.hor.clone().lerp(grey, wet * 0.55), top = k.top.clone().lerp(grey, wet * 0.6);
  if (winter) { hor.lerp(new THREE.Color(0xdde8f5), 0.15 * (1 - k.night)); }
  skyUniforms.top.value.copy(top);
  skyUniforms.horizon.value.copy(hor);
  scene.fog.color.copy(hor);
  // Aerial perspective: the far hills melt into the horizon colour in layers.
  scene.fog.near = 45 - wet * 25;
  scene.fog.far = 260 - wet * 140;
  gradeUniforms.shadowTint.value.copy(k.st);
  gradeUniforms.lightTint.value.copy(k.lt);
  cloudShadow.strength.value = 0.34 * (1 - k.night) * (1 - wet);

  const a = (t - 0.25) * Math.PI * 2;
  sunDir.set(Math.cos(a) * 0.95, Math.sin(a), -0.3).normalize();
  skyUniforms.sunDir.value.copy(sunDir);
  skyUniforms.sunColor.value.copy(k.light).multiplyScalar((1 - k.night) * (1 - wet));
  const day = sunDir.y > 0;
  // Light from the sun's (or moon's) direction but never grazing, so golden hour stays bright.
  const lightDir = (day ? sunDir.clone() : sunDir.clone().negate());
  lightDir.y = Math.max(lightDir.y, 0.5);
  lightDir.normalize();
  sunLight.position.copy(sunLight.target.position).addScaledVector(lightDir, 150);
  sunLight.color.copy(k.light);
  sunLight.intensity = k.li * (1 - wet * 0.7);
  sun.position.copy(camera.position).addScaledVector(sunDir, 500);
  sun.lookAt(camera.position);
  sun.visible = sunDir.y > -0.1 && wet < 0.6;
  moon.position.copy(camera.position).addScaledVector(sunDir, -500);
  moon.lookAt(camera.position);
  moon.material.opacity = k.night * (1 - wet);
  moon.visible = k.night > 0.05;
  stars.material.opacity = Math.max(0, k.night - 0.2) * (1 - wet);
  stars.visible = stars.material.opacity > 0.01;

  hemi.color.copy(k.hs);
  hemi.groundColor.copy(k.hg);
  hemi.intensity = k.hi * (1 - wet * 0.3);
  cloudMat.color.copy(k.hor).lerp(new THREE.Color(0xffffff), 0.6 * (1 - k.night)).lerp(grey, wet * 0.6);
  cloudMat.emissive.copy(k.hor);
  cloudMat.emissiveIntensity = 0.55;

  blockMat.emissiveIntensity = 0.05 + k.night * 1.1;
  lanternMat.color.setScalar(0.55 + k.night * 0.45).multiply(new THREE.Color(0xffc66e));
  windowLight.intensity = k.night * 18;
  for (const g of glows) g.material.opacity = g.userData.strength * (g === fireGlow ? (0.5 + k.night * 0.5) * (0.3 + fireLevel * 0.7) : k.night);
  return k;
}


// ---------- painterly grade: soft tone curve, tinted shadows, ordered dither ----------
// Like pixel-art paintings: shadows go violet/blue instead of grey, highlights warm up, the
// palette is gently quantised with a 4x4 Bayer dither so gradients read as hand-placed pixels.
const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
const gradeUniforms = {
  tScene: { value: rt.texture }, exposure: { value: 1.0 },
  shadowTint: { value: new THREE.Color() }, lightTint: { value: new THREE.Color() },
  sat: { value: 1.2 }, levels: { value: 36 },
};
const postScene = new THREE.Scene(), postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
  uniforms: gradeUniforms, depthTest: false, depthWrite: false,
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `
    uniform sampler2D tScene; uniform float exposure; uniform vec3 shadowTint; uniform vec3 lightTint;
    uniform float sat; uniform float levels; varying vec2 vUv;
    float bayer(vec2 p){
      vec2 q = mod(floor(p), 4.0);
      int i = int(q.x) + int(q.y) * 4;
      int m[16]; m[0]=0;m[1]=8;m[2]=2;m[3]=10;m[4]=12;m[5]=4;m[6]=14;m[7]=6;m[8]=3;m[9]=11;m[10]=1;m[11]=9;m[12]=15;m[13]=7;m[14]=13;m[15]=5;
      for (int k = 0; k < 16; k++) if (k == i) return (float(m[k]) + 0.5) / 16.0;
      return 0.5;
    }
    vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
    void main(){
      vec3 c = texture2D(tScene, vUv).rgb * exposure;
      // Soft shoulder that keeps hue: compress luminance, not channels.
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      float lt = l * (1.0 + l / 2.6) / (1.0 + l);
      c *= lt / max(l, 1e-4);
      c = clamp(c, 0.0, 1.0);
      c = toSRGB(c);
      float y = dot(c, vec3(0.299, 0.587, 0.114));
      // Lift and tint the darks, warm the lights, a touch more saturation.
      c += shadowTint * pow(1.0 - y, 2.2) * 0.22;
      c *= mix(vec3(1.0), lightTint, smoothstep(0.45, 1.0, y) * 0.12);
      c = mix(vec3(dot(c, vec3(0.299, 0.587, 0.114))), c, sat);
      c = clamp(c, 0.0, 1.0);
      // Ordered dither, then quantise.
      c = floor(c * levels + bayer(gl_FragCoord.xy)) / levels;
      gl_FragColor = vec4(c, 1.0);
    }`,
})));

// ---------- loop ----------
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  rt.setSize(size.x, size.y);
  camera.aspect = innerWidth / innerHeight;
  // Keep the scene framed on narrow (portrait) screens.
  camera.fov = camera.aspect < 1 ? 62 : 48;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

let last = performance.now(), time = 0, acc = 0, fireTimer = 1, fireLevel = state.fire;

// Shadows are only redrawn when the light has turned enough to show: about every half second
// in Cycle mode, every minute or so in Clock mode and never at a fixed time of day. 0.003 rad
// moves the shadow of a 10-block tree by 0.03 blocks, under a shadow-map texel.
const shadowDir = new THREE.Vector3();
function refreshShadows() {
  const dir = sunLight.position.clone().sub(sunLight.target.position).normalize();
  if (dir.angleTo(shadowDir) < 0.003) return;
  shadowDir.copy(dir);
  renderer.shadowMap.needsUpdate = true;
}

// Slow machines: if the first seconds can't hold ~22 fps, step down once or twice (smaller,
// harder shadows, then a slightly lower render scale). Fast machines are never touched, and
// nothing is stored, so a hiccup on one visit doesn't stick.
const quality = { level: 0, warm: 4, samples: [] };
function watchSpeed(step) {
  if (quality.level >= 2 || params.has('shot')) return;
  if (quality.warm > 0) { quality.warm -= step; return; }      // skip shader compiles and loading
  quality.samples.push(step);
  if (quality.samples.length < 60) return;
  const median = quality.samples.sort((a, b) => a - b)[30];
  quality.samples = [];
  if (median < 1 / 22) { quality.level = 2; return; }           // fast enough: stop watching
  quality.level++;
  quality.warm = 2;
  state.quality = quality.level;                               // visible in Scene.state for debugging
  if (quality.level === 1) {
    sunLight.shadow.mapSize.set(1024, 1024);
    sunLight.shadow.map?.dispose();
    sunLight.shadow.map = null;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => { m.needsUpdate = true; }); });
    shadowDir.set(0, 0, 0);
  } else {
    renderer.setPixelRatio(PIXEL * 0.8);
    resize();
  }
}
const camOffset = new THREE.Vector3();

function resolveTime(dt) {
  if (state.timeMode === 'cycle') state.t = (state.t + dt / DAY_LENGTH) % 1;
  else if (state.timeMode === 'clock') { const d = new Date(); state.t = (d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600) / 24; }
  else state.t = FIXED_TIMES[state.timeMode];
}

// Background saving: while the page can't be seen (another tab, minimized, a covered window or
// a locked screen) the world stops completely, with no frames, no shadows and no critters.
// Music, rain and fire keep playing. It picks up where it was when the page comes back.
let looping = false;
function frame(now) {
  if (document.hidden) { looping = false; return; }
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  acc += dt;
  if (acc < 1 / 30) return;                 // cap at ~30 fps: it's a background
  update(acc);
  acc = 0;
}

function update(step) {
  time += step;

  resolveTime(step);
  applySeason(state.season === 'auto' ? seasonFromDate() : state.season);
  const k = applyTime(state.t);

  camOffset.set(Math.sin(time * 0.05) * 1.2, Math.sin(time * 0.07) * 0.4, 0);   // slow, gentle sway
  camera.position.copy(CAM_POS).add(camOffset);
  camera.lookAt(CAM_TARGET);
  sky.position.copy(camera.position);
  stars.position.copy(camera.position);

  fireTimer += step;
  if (fireTimer > 0.09) {
    fireTimer = 0;
    drawFire(fireLevel);
    for (const f of flames) f.scale.set(0.8 + fireLevel * 0.45, 0.7 + fireLevel * 0.7, 1);
    fireLight.intensity = (16 + Math.random() * 10) * (0.15 + k.night * 0.95) * (0.12 + fireLevel * 0.95);
    fireGlow.scale.setScalar((4 + fireLevel * 8) * (1 + Math.random() * 0.18));
  }
  atlas.waterMap.offset.x = state.resolvedSeason === 'winter' ? 0 : time * 0.02;
  atlas.waterMap.offset.y = state.resolvedSeason === 'winter' ? 0 : Math.sin(time * 0.3) * 0.05;
  clouds.position.x = (time * 0.6) % CLOUD_SPAN;
  cloudShadow.offset.value.set(-time * 0.9, time * 0.15);
  wind.time.value = time;
  wind.amount.value = 1 + state.rain * 1.2;                // a stormier sway in the rain

  updateWater(time, (1 - k.night) * (1 - state.rain));
  updateParticles(step, time);
  const s = state.resolvedSeason;
  updateFireflies(time, (s === 'summer' || s === 'spring' ? 1 : s === 'autumn' ? 0.4 : 0) * Math.max(0, k.night - 0.3) * (1 - state.rain));
  updateRain(step);
  fireLevel += (state.fire - fireLevel) * Math.min(1, step * 2);   // ease towards the slider
  updateSmokeAndEmbers(step, time, fireLevel);
  critters.update(step, time, { night: k.night, rain: state.rain, season: s });
  props.update(step, time);

  refreshShadows();
  watchSpeed(step);
  renderer.setRenderTarget(rt);
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  renderer.render(postScene, postCam);
}

// URL overrides, e.g. ?time=sunset&season=spring (handy for screenshots).
if (params.get('time')) state.timeMode = params.get('time');
if (params.get('season')) state.season = params.get('season');
if (params.get('fire')) state.fire = fireLevel = Number(params.get('fire'));
if (params.get('t')) { state.timeMode = 'cycle'; state.t = Number(params.get('t')); }
applySeason(state.season === 'auto' ? seasonFromDate() : state.season);
renderer.shadowMap.needsUpdate = true;
if (params.get('critter')) {                    // e.g. ?critter=deer&advance=12, for previews
  const env = { night: 0, rain: 0, season: state.resolvedSeason };
  critters.spawn(params.get('critter'), env);
  for (let i = 0; i < Number(params.get('advance') || 0) * 10; i++) critters.update(0.1, i * 0.1, env);
}
update(1 / 30);
canvas.classList.add('ready');                   // fade in over the sky colour painted in index.html
function startLoop() {
  if (looping || document.hidden) return;
  looping = true;
  last = performance.now();
  requestAnimationFrame(frame);
}
document.addEventListener('visibilitychange', startLoop);
startLoop();

window.Scene = {
  setRain(level) { state.rain = Math.max(0, Math.min(1, level)); },
  setFire(level) { if (!params.get('fire')) state.fire = Math.max(0, Math.min(1, level)); },
  setTimeMode(mode) { if (!params.get('time') && !params.get('t')) state.timeMode = mode; },
  setSeason(season) { if (!params.get('season')) state.season = season; },
  get state() { return { ...state, season: state.season, resolved: state.resolvedSeason }; },
};
