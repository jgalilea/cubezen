// The city: a neon shopping street at street level, wet and reflective, with a railway bridge,
// a yakitori stall, people, cars and a train. A scene module for the engine in ../main.js.
import * as THREE from 'three';
import { rng, makeGlow } from '../common.js';
import { createAtlas, SEASONS } from './textures.js';
import { generateCity, buildCityMeshes, G, CAM, END_Z } from './build.js';
import { createSignAtlas, paintSign, buildSignGeometry, createScreen } from './signs.js';
import { createProps } from './props.js';
import { createLife, createTraffic } from './life.js';

// Same fields as the valley's keys, plus: neon (sign and baked light brightness), sat (grade
// saturation), stars (how many show through the light pollution).
const KEYS = [
  { t: 0.00, top: '#0c0a24', hor: '#4a1e5a', light: '#8a9cff', li: 0.35, hs: '#4a4290', hg: '#2a1840', hi: 0.9, night: 1, st: '#2a1468', lt: '#ffb4e4', neon: 1, sat: 1.32, stars: 0.25 },
  { t: 0.21, top: '#141034', hor: '#56285e', light: '#8a9cff', li: 0.35, hs: '#4c4492', hg: '#2c1a42', hi: 0.9, night: 0.95, st: '#2a1468', lt: '#ffb8e4', neon: 1, sat: 1.32, stars: 0.25 },
  { t: 0.25, top: '#36387e', hor: '#d07a92', light: '#ff9a8a', li: 0.5, hs: '#9a88c8', hg: '#4a3456', hi: 0.95, night: 0.6, st: '#40287a', lt: '#ffd0b8', neon: 0.85, sat: 1.25, stars: 0.1 },
  { t: 0.30, top: '#6a80c0', hor: '#ecc0b8', light: '#ffd0b0', li: 1.4, hs: '#d8c4dc', hg: '#5c4a66', hi: 1.05, night: 0.12, st: '#3a3080', lt: '#ffe0c0', neon: 0.45, sat: 1.15, stars: 0 },
  { t: 0.40, top: '#6a8ccc', hor: '#cad6e6', light: '#fff2e2', li: 1.9, hs: '#bccce8', hg: '#5a5672', hi: 1.1, night: 0, st: '#2c3474', lt: '#fff0d8', neon: 0.3, sat: 1.12, stars: 0 },
  { t: 0.50, top: '#6490d0', hor: '#d0dcea', light: '#fff6ea', li: 2.0, hs: '#c0d0ec', hg: '#5c5874', hi: 1.15, night: 0, st: '#2c3474', lt: '#fff2d8', neon: 0.28, sat: 1.12, stars: 0 },
  { t: 0.63, top: '#6a8ac8', hor: '#f0d8c4', light: '#fff0d4', li: 1.9, hs: '#c8d0e8', hg: '#625474', hi: 1.1, night: 0, st: '#34347a', lt: '#ffe8c4', neon: 0.32, sat: 1.15, stars: 0 },
  { t: 0.70, top: '#6a4eb0', hor: '#ff8e8a', light: '#ff9a70', li: 1.5, hs: '#e0aed4', hg: '#6a4472', hi: 1.05, night: 0.12, st: '#5a2a7a', lt: '#ffd0a8', neon: 0.6, sat: 1.22, stars: 0 },
  { t: 0.75, top: '#2c2070', hor: '#c25890', light: '#ff7aa0', li: 0.55, hs: '#8a70c0', hg: '#40284e', hi: 0.95, night: 0.6, st: '#40207a', lt: '#ffb8d0', neon: 0.95, sat: 1.3, stars: 0.05 },
  { t: 0.79, top: '#130e34', hor: '#4e2262', light: '#8a9cff', li: 0.35, hs: '#4c4292', hg: '#2c1842', hi: 0.9, night: 0.95, st: '#2a1468', lt: '#ffb4e4', neon: 1, sat: 1.32, stars: 0.25 },
  { t: 1.00, top: '#0c0a24', hor: '#4a1e5a', light: '#8a9cff', li: 0.35, hs: '#4a4290', hg: '#2a1840', hi: 0.9, night: 1, st: '#2a1468', lt: '#ffb4e4', neon: 1, sat: 1.32, stars: 0.25 },
];

// Reflections in the wet street: emissive things are drawn again, mirrored under the road, and
// added on top of it. Where the eye ray meets the road, a noise pattern decides how much of a
// puddle there is; rain makes the puddles spread and the reflections ripple.
const REFLECT_VERT = `
  #ifdef NEON
  attribute vec3 neon; varying vec3 vNeon;
  #endif
  uniform float uTime; uniform float uRipple; uniform float uG;
  varying vec2 vUv; varying vec3 vW; varying vec3 vCol;
  void main() {
    vUv = uv;
    #ifdef USE_COLOR
    vCol = color;
    #else
    vCol = vec3(1.0);
    #endif
    #ifdef NEON
    vNeon = neon;
    #endif
    vec4 w = modelMatrix * vec4(position, 1.0);
    float depth = max(0.0, uG - w.y);
    w.x += sin(uTime * 2.3 + w.y * 1.9 + w.z * 0.35) * uRipple * min(depth, 10.0) * 0.025;
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;
const REFLECT_FRAG = `
  uniform sampler2D map; uniform float uStrength; uniform float uWet; uniform float uG; uniform float uEmis; uniform float uNeonK;
  varying vec2 vUv; varying vec3 vW; varying vec3 vCol;
  #ifdef NEON
  varying vec3 vNeon;
  #endif
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  void main() {
    vec3 c = texture2D(map, vUv).rgb * vCol;
    #ifdef NEON
    c = c * uEmis + vNeon * uNeonK;
    #endif
    vec3 d = vW - cameraPosition;
    vec2 hit = cameraPosition.xz + d.xz * ((uG - cameraPosition.y) / min(d.y, -0.001));
    float n = vnoise(hit * vec2(0.5, 0.2)) * 0.6 + vnoise(hit * 0.9 + 7.0) * 0.4;
    float puddle = smoothstep(0.66 - uWet * 0.42, 0.74 - uWet * 0.3, n);
    float k = uStrength * mix(0.05, 1.0, puddle);
    k *= exp(-max(0.0, uG - vW.y) * 0.035);
    k *= 1.0 - smoothstep(60.0, 220.0, length(hit - cameraPosition.xz));
    gl_FragColor = vec4(c * k, 1.0);
  }`;

export function createScene(root, params) {
  const r = rng(77);
  const city = generateCity();
  const atlas = createAtlas();

  // ---------- glows (and their reflections) ----------
  const glows = [];
  function addGlow(x, y, z, size, color, strength, reflect) {
    const s = makeGlow(root, x, y, z, size, color, strength);
    const m = reflect ? makeGlow(root, x, 2 * G - y, z, size, color, strength) : null;
    const entry = { s, m };
    s.userData.level = 1;
    s.userData.place = (px, py, pz) => { s.position.set(px, py, pz); m?.position.set(px, 2 * G - py, pz); };
    s.userData.remove = () => {
      root.remove(s); s.material.dispose();
      if (m) { root.remove(m); m.material.dispose(); }
      glows.splice(glows.indexOf(entry), 1);
    };
    glows.push(entry);
    return s;
  }

  // Props add their light sources before the meshes bake them in.
  const traffic = createTraffic();
  const props = createProps(root, city, addGlow, traffic);

  // ---------- blocks and ground, with baked neon light ----------
  const neonU = { value: 1 }, groundNeonU = { value: 1 }, skyU = { value: new THREE.Color() }, sheenU = { value: 0 };
  function withNeon(mat, ground) {
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uNeon = ground ? groundNeonU : neonU;
      sh.uniforms.uSky = skyU;
      sh.uniforms.uSheen = sheenU;
      sh.vertexShader = 'attribute vec3 neon; varying vec3 vNeon;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vNeon = neon;');
      sh.fragmentShader = 'uniform float uNeon; uniform vec3 uSky; uniform float uSheen; varying vec3 vNeon;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n  totalEmissiveRadiance += vNeon * uNeon * (diffuseColor.rgb * 1.6' + (ground ? ' + uSheen * 0.12) + uSky * uSheen * 0.12;' : ');'));
    };
    mat.customProgramCacheKey = () => (ground ? 'city-ground' : 'city-blocks');
    return mat;
  }
  const meshes = buildCityMeshes(city);
  const blockMat = withNeon(new THREE.MeshLambertMaterial({ map: atlas.map, vertexColors: true, alphaTest: 0.5, emissive: 0xffffff, emissiveMap: atlas.emissiveMap, emissiveIntensity: 0 }), false);
  blockMat.shadowSide = THREE.DoubleSide;
  const blocks = new THREE.Mesh(meshes.blocks, blockMat);
  blocks.castShadow = blocks.receiveShadow = true;
  root.add(blocks);
  // The ground doesn't write depth, so the mirrored world under it shows through (see REFLECT_*).
  const groundMat = withNeon(new THREE.MeshLambertMaterial({ map: atlas.map, vertexColors: true, depthWrite: false }), true);
  const ground = new THREE.Mesh(meshes.ground, groundMat);
  ground.receiveShadow = true;
  ground.renderOrder = -0.5;
  root.add(ground);

  // ---------- signs and the big screen ----------
  const signAtlas = createSignAtlas(1024);
  const signs = city.signs.filter((s) => (s.uv = paintSign(signAtlas, s)));
  const signGeo = buildSignGeometry(signs);
  const signMat = new THREE.MeshBasicMaterial({ map: signAtlas.texture, vertexColors: true, toneMapped: false });
  const signMesh = new THREE.Mesh(signGeo, signMat);
  root.add(signMesh);
  for (const s of signs) {
    if (s.kind === 'board' && s.normal !== 'z+') continue;           // shop boards are lit by their shopfronts
    s.glow = addGlow(s.x + (s.normal === 'z+' ? 0 : s.normal === 'x+' ? 0.5 : -0.5), s.y, s.z + (s.normal === 'z+' ? 0.5 : 0), Math.max(s.w, s.h) * 1.5, new THREE.Color(s.color), 0.4, true);
  }
  // Frames holding up the rooftop signs.
  const frameMat = new THREE.MeshLambertMaterial({ color: 0x2a2830 });
  for (const s of signs) if (s.frame) for (const dx of [-0.4, 0.4]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.15, s.h, 0.15), frameMat);
    leg.position.set(s.x + dx * s.w, s.y - s.h / 2 + 0.05, s.z - 0.2);
    root.add(leg);
  }
  const flickers = signs.filter((s) => s.flicker);
  const SC = city.screen;
  const screen = createScreen(64, 36, 9);
  const screenMat = new THREE.MeshBasicMaterial({ map: screen.texture, toneMapped: false, fog: false });
  const screenMesh = new THREE.Mesh(new THREE.PlaneGeometry(SC.w, SC.h), screenMat);
  screenMesh.position.set(SC.x, SC.y, SC.z);
  root.add(screenMesh);
  const screenGlow = addGlow(SC.x, SC.y, SC.z + 2, SC.w * 1.4, 0xd080ff, 0.35, true);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(SC.w + 1, SC.h + 1, 0.4), frameMat);
  frame.position.set(SC.x, SC.y, SC.z - 0.26);
  root.add(frame);

  // ---------- reflections ----------
  const R = { strength: { value: 0.6 }, wet: { value: 0.5 }, time: { value: 0 }, ripple: { value: 0 }, emis: { value: 1 }, neonK: { value: 0.3 }, g: { value: G } };
  const reflectMat = (map, { neon = false, colors = true } = {}) => new THREE.ShaderMaterial({
    uniforms: { map: { value: map }, uStrength: R.strength, uWet: R.wet, uG: R.g, uTime: R.time, uRipple: R.ripple, uEmis: R.emis, uNeonK: R.neonK },
    defines: neon ? { NEON: '' } : {},
    vertexColors: colors,
    vertexShader: REFLECT_VERT, fragmentShader: REFLECT_FRAG,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const mirror = new THREE.Group();
  mirror.scale.y = -1;
  mirror.position.y = 2 * G;
  mirror.add(new THREE.Mesh(meshes.blocks, reflectMat(atlas.emissiveMap, { neon: true })));
  mirror.add(new THREE.Mesh(signGeo, reflectMat(signAtlas.texture)));
  const screenReflect = new THREE.Mesh(screenMesh.geometry, reflectMat(screen.texture, { colors: false }));
  screenReflect.position.copy(screenMesh.position);
  mirror.add(screenReflect);
  root.add(mirror);

  const life = createLife(root, addGlow, r, traffic);

  let season = null, screenTimer = 0, night = 1, wet = 0.5;
  const signColor = new THREE.Color();
  return {
    keys: KEYS,
    rainGrey: 0.3,
    camera: { pos: new THREE.Vector3(CAM.x, CAM.y, CAM.z), target: new THREE.Vector3(0.5, 12.5, -80), fov: 50, portraitFov: 68, sway: 0.35 },
    area: { x0: -10, x1: 11, y0: G, y1: 30, z0: -75, z1: 14 },
    fog: { near: 34, far: 330, wetNear: 16, wetFar: 150 },
    shadow: { target: new THREE.Vector3(0.5, 10, -50), extent: 95 },
    particles: (name) => SEASONS[name].particles,

    // ?advance=N: fast-forward the people, cars and train N seconds, for previews.
    preview() {
      const n = Number(params.get('advance') || 0) * 10;
      const env = { k: { night: 0 }, rain: 0, fire: 0, season };
      for (let i = 0; i < n; i++) life.update(0.1, i * 0.1, env);
    },

    dispose() { traffic.stop(); },

    applySeason(name) {
      season = name;
      atlas.paint(name);
    },

    applyTime(k, env) {
      night = k.night;
      wet = 0.4 + env.rain * 0.6;
      blockMat.emissiveIntensity = 0.12 + k.night * 1.05;
      neonU.value = k.neon * 0.9;
      groundNeonU.value = k.neon * (0.8 + env.rain * 0.6);
      skyU.value.copy(k.hor);
      sheenU.value = wet;
      groundMat.color.setScalar(0.8 - env.rain * 0.25);
      signColor.setScalar(0.5 + k.neon * 0.85);
      signMat.color.copy(signColor);
      screenMat.color.setScalar(0.75 + k.night * 0.5);
      R.wet.value = wet;
      R.strength.value = (0.35 + 0.65 * k.neon) * wet * 0.75;
      R.emis.value = blockMat.emissiveIntensity * 0.9;
      R.neonK.value = k.neon * 0.2;
      R.ripple.value = env.rain;
      const dayK = 0.15 + 0.85 * k.neon;
      for (const { s, m } of glows) {
        s.material.opacity = s.userData.strength * s.userData.level * dayK;
        if (m) {
          m.material.opacity = s.material.opacity * 0.5 * wet;
          m.material.color.copy(s.material.color);
          m.scale.copy(s.scale);
        }
      }
      props.applyTime(k.night);
      life.applyTime(k.night);
    },

    update(step, time, env) {
      R.time.value = time;
      screenTimer += step;
      if (screenTimer > 0.1) { screenTimer = 0; screen.update(time); }
      // A few signs have a dodgy tube that stutters now and then.
      if (flickers.length) {
        const col = signGeo.attributes.color;
        for (const s of flickers) {
          s.off = s.off > 0 ? s.off - step : Math.random() < step * 0.25 ? 0.05 + Math.random() * 0.5 : 0;
          const b = s.off > 0 && Math.random() < 0.7 ? 0.2 : 1;
          for (let i = 0; i < 4; i++) col.setXYZ(s.vertex + i, b, b, b);
          if (s.glow) s.glow.userData.level = b;
        }
        col.needsUpdate = true;
      }
      props.update(step, time, env);
      life.update(step, time, env);
    },
  };
}
