// The valley: river, cabin, farm, mine and campfire under the open sky. A scene module for the
// engine in ../main.js (see the contract described there).
import * as THREE from 'three';
import { createAtlas, SEASONS } from './textures.js';
import { generateWorld, buildTerrain, buildWater, buildFoam, buildPlants, buildFar } from './build.js';
import { createCritters } from './critters.js';
import { createProps } from './props.js';
import { rng, makeGlow, makeBox, makeClouds } from '../common.js';

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

export function createScene(root, params) {
  const world = generateWorld();
  const atlas = createAtlas();
  const blockMat = new THREE.MeshLambertMaterial({
    map: atlas.map, vertexColors: true, alphaTest: 0.5,
    emissive: 0xffffff, emissiveMap: atlas.emissiveMap, emissiveIntensity: 0,
  });
  const terrain = new THREE.Mesh(buildTerrain(world), blockMat);
  terrain.castShadow = terrain.receiveShadow = true;
  root.add(terrain);

  const waterMat = new THREE.MeshLambertMaterial({ map: atlas.waterMap, transparent: true, opacity: 0.82, vertexColors: true });
  const water = new THREE.Mesh(buildWater(world), waterMat);
  water.receiveShadow = true;
  root.add(water);
  const foamData = buildFoam(world);
  const foamMat = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, transparent: true, opacity: 0.8, depthWrite: false });
  const foam = new THREE.Mesh(foamData.geometry, foamMat);
  root.add(foam);
  // Glints: little sparkles that wink on the open water in daylight.
  const glintGeo = new THREE.BufferGeometry();
  const glintPos = new Float32Array(foamData.glints.length * 3), glintCol = new Float32Array(foamData.glints.length * 3);
  foamData.glints.forEach((g, i) => glintPos.set([g.x, g.y, g.z], i * 3));
  glintGeo.setAttribute('position', new THREE.BufferAttribute(glintPos, 3));
  glintGeo.setAttribute('color', new THREE.BufferAttribute(glintCol, 3));
  const glints = new THREE.Points(glintGeo, new THREE.PointsMaterial({ size: 0.22, vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
  root.add(glints);
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
    mat.customProgramCacheKey = () => (sways ? 'valley-sway' : 'valley-still');
    return mat;
  }
  withCloudShadows(blockMat, true);
  withCloudShadows(plantMat, true);
  withCloudShadows(waterMat);

  const critters = createCritters(root, world);
  const props = createProps(root, world);

  // ---------- small props: lantern posts, lanterns, campfire ----------
  const woodMat = new THREE.MeshLambertMaterial({ color: 0x5a3b22 });
  const ironMat = new THREE.MeshLambertMaterial({ color: 0x2d2d33 });
  const lanternMat = new THREE.MeshBasicMaterial({ color: 0xffc66e });
  const glows = [];
  const addGlow = (...a) => { const s = makeGlow(root, ...a); glows.push(s); return s; };
  const box = (...a) => makeBox(root, ...a);
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
    root.add(p);
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
  root.add(fireLight);
  const fireGlow = addGlow(F.x, F.y + 1, F.z, 11, 0xff8a3c, 0.8);
  const windowLight = new THREE.PointLight(0xffb35c, 0, 16, 1.6);
  windowLight.position.set(69.5, world.G + 3, 62);
  root.add(windowLight);

  // Clouds on the horizon, among the far hills.
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, emissive: 0xffffff, emissiveIntensity: 0.25, fog: false });
  const CLOUD_SPAN = 320;
  const clouds = new THREE.Group();
  clouds.add(makeClouds(cloudMat, 77, 12, -210, -90, 34, 1.8, CLOUD_SPAN));
  root.add(clouds);

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
  root.add(fireflies);
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
  root.add(wisps);
  smoke.frustumCulled = false;
  root.add(smoke);
  const eGeo = new THREE.BufferGeometry(), ePos = new Float32Array(EMBERS * 3), eAge = new Float32Array(EMBERS);
  for (let i = 0; i < EMBERS; i++) eAge[i] = Math.random() * 2;
  eGeo.setAttribute('position', new THREE.BufferAttribute(ePos, 3));
  const embers = new THREE.Points(eGeo, new THREE.PointsMaterial({ color: 0xffa040, size: 0.08, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false }));
  embers.frustumCulled = false;
  root.add(embers);
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

  let season = null, fireTimer = 1;
  const grey = new THREE.Color(0x5a6270), white = new THREE.Color(0xffffff), lantern = new THREE.Color(0xffc66e);

  return {
    keys: KEYS,
    camera: { pos: new THREE.Vector3(52, 25, 101), target: new THREE.Vector3(63, 10, 46) },
    area: { x0: 20, x1: 100, y0: 6, y1: 34, z0: 40, z1: 96 },   // where weather particles and rain fall
    fog: { near: 45, far: 260, wetNear: 25, wetFar: 140 },
    shadow: { target: new THREE.Vector3(56, 8, 55), extent: 70 },
    particles: (name) => SEASONS[name].particles,

    applySeason(name) {
      season = name;
      atlas.paint(name);
      if (plants) { root.remove(plants); plants.geometry.dispose(); }
      plants = new THREE.Mesh(buildPlants(world, name), plantMat);
      plants.receiveShadow = true;
      root.add(plants);
      if (far) { root.remove(far); far.geometry.dispose(); }
      far = new THREE.Mesh(buildFar(world, name), farMat);
      root.add(far);
      const winter = name === 'winter';
      waterMat.opacity = winter ? 0.96 : 0.88;
      waterMat.vertexColors = !winter;                         // ice ignores the depth bands
      waterMat.needsUpdate = true;
      foam.visible = glints.visible = !winter;
      props.setSeason(name);
    },

    // k: the sampled keyframe; env: { rain, fire } (fire is the smoothed fire level).
    applyTime(k, env) {
      const wet = env.rain;
      cloudShadow.strength.value = 0.34 * (1 - k.night) * (1 - wet);
      cloudMat.color.copy(k.hor).lerp(white, 0.6 * (1 - k.night)).lerp(grey, wet * 0.6);
      cloudMat.emissive.copy(k.hor);
      cloudMat.emissiveIntensity = 0.55;
      blockMat.emissiveIntensity = 0.05 + k.night * 1.1;
      lanternMat.color.setScalar(0.55 + k.night * 0.45).multiply(lantern);
      windowLight.intensity = k.night * 18;
      for (const g of glows) g.material.opacity = g.userData.strength * (g === fireGlow ? (0.5 + k.night * 0.5) * (0.3 + env.fire * 0.7) : k.night);
    },

    // env: { k, rain, fire, season }
    update(step, time, env) {
      const { k, fire } = env;
      fireTimer += step;
      if (fireTimer > 0.09) {
        fireTimer = 0;
        drawFire(fire);
        for (const f of flames) f.scale.set(0.8 + fire * 0.45, 0.7 + fire * 0.7, 1);
        fireLight.intensity = (16 + Math.random() * 10) * (0.15 + k.night * 0.95) * (0.12 + fire * 0.95);
        fireGlow.scale.setScalar((4 + fire * 8) * (1 + Math.random() * 0.18));
      }
      atlas.waterMap.offset.x = season === 'winter' ? 0 : time * 0.02;
      atlas.waterMap.offset.y = season === 'winter' ? 0 : Math.sin(time * 0.3) * 0.05;
      clouds.position.x = (time * 0.6) % CLOUD_SPAN;
      cloudShadow.offset.value.set(-time * 0.9, time * 0.15);
      wind.time.value = time;
      wind.amount.value = 1 + env.rain * 1.2;                // a stormier sway in the rain

      updateWater(time, (1 - k.night) * (1 - env.rain));
      updateFireflies(time, (season === 'summer' || season === 'spring' ? 1 : season === 'autumn' ? 0.4 : 0) * Math.max(0, k.night - 0.3) * (1 - env.rain));
      updateSmokeAndEmbers(step, time, fire);
      critters.update(step, time, { night: k.night, rain: env.rain, season });
      props.update(step, time);
    },

    // ?critter=deer&advance=12: spawn a visitor and fast-forward it, for previews.
    preview() {
      if (!params.get('critter')) return;
      const env = { night: 0, rain: 0, season };
      critters.spawn(params.get('critter'), env);
      for (let i = 0; i < Number(params.get('advance') || 0) * 10; i++) critters.update(0.1, i * 0.1, env);
    },

    dispose() { atlas.map.dispose(); atlas.emissiveMap.dispose(); atlas.waterMap.dispose(); cloudShadowTex.dispose(); },
  };
}
