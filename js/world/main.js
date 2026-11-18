// Cubezen's 3D engine: renderer, sky, day/night, weather, the painterly grade and the loop.
// What's on screen comes from a scene module (valley/, city/), loaded on demand.
//
// A scene module exports createScene(root, params) and returns:
//   keys        day keyframes (see valley/index.js) sampled with sampleKeys()
//   camera      { pos, target } Vector3s
//   area        { x0, x1, y0, y1, z0, z1 } box where seasonal particles and rain fall
//   fog         { near, far, wetNear, wetFar } (how much near/far shrink at full rain)
//   shadow      { target, extent } for the sun's shadow camera
//   particles   (season) => { kind: petal|pollen|leaf|snow, colors, count }
//   applySeason(name), applyTime(k, env), update(step, time, env), preview?(), dispose?()
//   rainGrey?   how much rain greys the sky (default 0.55)
// Everything it creates goes under `root`, which the engine disposes when the scene changes.
import * as THREE from 'three';
import { rng, sampleKeys, disposeTree } from './common.js';

const PIXEL = 0.5;            // render at half resolution for a soft pixel look
const DAY_LENGTH = 20 * 60;   // seconds per full day in cycle mode
const params = new URLSearchParams(location.search);
const SCENES = {
  valley: () => import('./valley/index.js'),
  city: () => import('./city/index.js'),
};

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

// ---------- sky, sun, moon, stars ----------
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

// ---------- lights ----------
const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
scene.add(hemi);
const sunLight = new THREE.DirectionalLight(0xffffff, 2);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(innerWidth < 800 ? 1024 : 2048, innerWidth < 800 ? 1024 : 2048);
Object.assign(sunLight.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 400 });
sunLight.shadow.bias = -0.0004;
sunLight.shadow.normalBias = 0.04;
scene.add(sunLight, sunLight.target);

// ---------- state ----------
const state = {
  scene: 'valley', timeMode: 'clock', season: 'auto', rain: 0, fire: 0.35,
  t: 0.62, resolvedSeason: null,
};
// Start from the saved settings (written by app.js), so the first frame already shows the
// chosen scene, time, season, rain and fire instead of the defaults.
try {
  const world = JSON.parse(localStorage.getItem('cubezen.world'));
  if (world?.v >= 2) Object.assign(state, { timeMode: world.time, season: world.season });
  if (world?.scene in SCENES) state.scene = world.scene;
  const prefs = JSON.parse(localStorage.getItem('cubezen.prefs'));
  if (prefs) Object.assign(state, { rain: prefs.rain ?? 0, fire: prefs.fire ?? 0.35 });
} catch {}
const FIXED_TIMES = { day: 0.45, sunset: 0.715, night: 0.92 };

function seasonFromDate() {
  const m = new Date().getMonth();
  return m <= 1 || m === 11 ? 'winter' : m <= 4 ? 'spring' : m <= 7 ? 'summer' : 'autumn';
}

let current = null;          // the live scene module instance
let root = null;             // its Group

// ---------- particles ----------
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
const tmpC = new THREE.Color();
function resetParticle(i, anywhere) {
  const A = current.area;
  pPos[i * 3] = A.x0 + Math.random() * (A.x1 - A.x0);
  pPos[i * 3 + 1] = anywhere ? A.y0 + Math.random() * (A.y1 - A.y0) : A.y1;
  pPos[i * 3 + 2] = A.z0 + Math.random() * (A.z1 - A.z0);
  pVel[i * 4] = Math.random() * Math.PI * 2;
  pVel[i * 4 + 1] = 0.6 + Math.random() * 0.8;
}
function setupParticles(seasonName) {
  const p = current.particles(seasonName);
  pKind = p.kind;
  pCount = p.count;
  for (let i = 0; i < MAX_P; i++) {
    resetParticle(i, true);
    tmpC.set(p.colors[i % p.colors.length]);
    pCol[i * 3] = tmpC.r; pCol[i * 3 + 1] = tmpC.g; pCol[i * 3 + 2] = tmpC.b;
  }
  pMat.size = pKind === 'snow' ? 0.16 : pKind === 'pollen' ? 0.09 : 0.2;
  pGeo.setDrawRange(0, pCount);
  pGeo.attributes.color.needsUpdate = true;
}
function updateParticles(dt, time) {
  const A = current.area;
  const fall = pKind === 'snow' ? 1.6 : pKind === 'pollen' ? -0.05 : 0.9;
  for (let i = 0; i < pCount; i++) {
    const ph = pVel[i * 4], sp = pVel[i * 4 + 1];
    pPos[i * 3] += (Math.sin(time * 0.7 * sp + ph) * 0.6 + 0.5) * dt;
    pPos[i * 3 + 1] -= fall * sp * dt + (pKind === 'pollen' ? Math.sin(time + ph) * 0.1 * dt : 0);
    pPos[i * 3 + 2] += Math.cos(time * 0.5 * sp + ph) * 0.4 * dt;
    if (pPos[i * 3 + 1] < A.y0 - 2 || pPos[i * 3 + 1] > A.y1 + 1 || pPos[i * 3] > A.x1) resetParticle(i, pKind === 'pollen');
  }
  pGeo.attributes.position.needsUpdate = true;
}

// Rain streaks.
const RAIN = 1800;
const rGeo = new THREE.BufferGeometry();
const rPos = new Float32Array(RAIN * 6);
function setDrop(i, anywhere) {
  const A = current.area;
  const x = A.x0 + Math.random() * (A.x1 - A.x0), z = A.z0 + Math.random() * (A.z1 - A.z0);
  const y = anywhere ? A.y0 + Math.random() * 36 : A.y1 + 8 + Math.random() * 6;
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
    if (rPos[i * 6 + 1] < current.area.y0 - 3) setDrop(i, false);
  }
  rGeo.attributes.position.needsUpdate = true;
}

// ---------- apply time & season ----------
function applySeason(name) {
  if (state.resolvedSeason === name) return;
  state.resolvedSeason = name;
  current.applySeason(name);
  setupParticles(name);
  renderer.shadowMap.needsUpdate = true;
}

const sunDir = new THREE.Vector3();
const grey = new THREE.Color(0x5a6270), snowHaze = new THREE.Color(0xdde8f5);
function applyTime(t) {
  const k = sampleKeys(current.keys, t);
  const winter = state.resolvedSeason === 'winter';
  const wet = state.rain, rg = current.rainGrey ?? 0.55;
  const hor = k.hor.clone().lerp(grey, wet * rg), top = k.top.clone().lerp(grey, wet * (rg + 0.05));
  if (winter) { hor.lerp(snowHaze, 0.15 * (1 - k.night)); }
  skyUniforms.top.value.copy(top);
  skyUniforms.horizon.value.copy(hor);
  scene.fog.color.copy(k.fog ?? hor);
  // Aerial perspective: the far hills melt into the horizon colour in layers.
  const F = current.fog;
  scene.fog.near = F.near - wet * F.wetNear;
  scene.fog.far = F.far - wet * F.wetFar;
  gradeUniforms.shadowTint.value.copy(k.st);
  gradeUniforms.lightTint.value.copy(k.lt);
  gradeUniforms.sat.value = k.sat ?? 1.2;

  const a = (t - 0.25) * Math.PI * 2;
  sunDir.set(Math.cos(a) * 0.95, Math.sin(a), -0.3).normalize();
  skyUniforms.sunDir.value.copy(sunDir);
  skyUniforms.sunColor.value.copy(k.light).multiplyScalar((1 - k.night) * (1 - wet) * (k.sunGlow ?? 1));
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
  sun.visible = sunDir.y > -0.1 && wet < 0.6 && (k.sunGlow ?? 1) > 0.5;
  moon.position.copy(camera.position).addScaledVector(sunDir, -500);
  moon.lookAt(camera.position);
  moon.material.opacity = k.night * (1 - wet);
  moon.visible = k.night > 0.05;
  stars.material.opacity = Math.max(0, k.night - 0.2) * (1 - wet) * (k.stars ?? 1);
  stars.visible = stars.material.opacity > 0.01;

  hemi.color.copy(k.hs);
  hemi.groundColor.copy(k.hg);
  hemi.intensity = k.hi * (1 - wet * 0.3);
  current.applyTime(k, { rain: wet, fire: fireLevel, season: state.resolvedSeason });
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
  camera.fov = camera.aspect < 1 ? (current?.camera.portraitFov ?? 62) : (current?.camera.fov ?? 48);
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

let last = performance.now(), time = 0, acc = 0, fireLevel = state.fire;

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
  if (!current) return;
  time += step;

  resolveTime(step);
  applySeason(state.season === 'auto' ? seasonFromDate() : state.season);
  const k = applyTime(state.t);

  const cam = current.camera;
  camOffset.set(Math.sin(time * 0.05) * 1.2, Math.sin(time * 0.07) * 0.4, 0).multiplyScalar(cam.sway ?? 1);   // slow, gentle sway
  camera.position.copy(cam.pos).add(camOffset);
  camera.lookAt(cam.target);
  sky.position.copy(camera.position);
  stars.position.copy(camera.position);

  current.update(step, time, { k, rain: state.rain, fire: fireLevel, season: state.resolvedSeason });
  fireLevel += (state.fire - fireLevel) * Math.min(1, step * 2);   // ease towards the slider
  updateParticles(step, time);
  updateRain(step);

  refreshShadows();
  watchSpeed(step);
  renderer.setRenderTarget(rt);
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  renderer.render(postScene, postCam);
}

// ---------- scenes ----------
async function loadScene(name) {
  const mod = await SCENES[name]();
  if (root) { scene.remove(root); current.dispose?.(); disposeTree(root); }
  root = new THREE.Group();
  scene.add(root);
  current = mod.createScene(root, params);
  state.scene = name;
  state.resolvedSeason = null;
  sunLight.target.position.copy(current.shadow.target);
  const E = current.shadow.extent;
  Object.assign(sunLight.shadow.camera, { left: -E, right: E, top: E, bottom: -E });
  sunLight.shadow.camera.updateProjectionMatrix();
  shadowDir.set(0, 0, 0);
  for (let i = 0; i < RAIN; i++) setDrop(i, true);
  resize();
  applySeason(state.season === 'auto' ? seasonFromDate() : state.season);
  current.preview?.();
  update(1 / 30);
}

// Swapping scenes fades the canvas out to the CSS sky, rebuilds, then fades back in.
let switching = Promise.resolve();
function switchScene(name) {
  if (!(name in SCENES)) return;
  switching = switching.then(async () => {
    if (name === state.scene && current) return;
    canvas.classList.remove('ready');
    await new Promise((r) => setTimeout(r, 600));
    try { await loadScene(name); } catch (e) { console.error(e); }
    // The page behind the canvas shows the new scene's sky while it fades in.
    const k = sampleKeys(current.keys, state.t);
    document.documentElement.style.setProperty('--sky', `linear-gradient(#${k.top.getHexString()}, #${k.hor.getHexString()})`);
    canvas.classList.add('ready');
  });
}

// URL overrides, e.g. ?time=sunset&season=spring (handy for screenshots).
if (params.get('scene') in SCENES) state.scene = params.get('scene');
if (params.get('time')) state.timeMode = params.get('time');
if (params.get('season')) state.season = params.get('season');
if (params.get('fire')) state.fire = fireLevel = Number(params.get('fire'));
if (params.get('rain')) state.rain = Number(params.get('rain'));
if (params.get('t')) { state.timeMode = 'cycle'; state.t = Number(params.get('t')); }
resolveTime(0);
try { await loadScene(state.scene); } catch (e) { console.error(e); state.scene = 'valley'; await loadScene('valley'); }
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
  setRain(level) { if (!params.get('rain')) state.rain = Math.max(0, Math.min(1, level)); },
  setFire(level) { if (!params.get('fire')) state.fire = Math.max(0, Math.min(1, level)); },
  setTimeMode(mode) { if (!params.get('time') && !params.get('t')) state.timeMode = mode; },
  setSeason(season) { if (!params.get('season')) state.season = season; },
  setScene(name) { if (!params.get('scene')) switchScene(name); },
  get state() { return { ...state, season: state.season, resolved: state.resolvedSeason }; },
};
