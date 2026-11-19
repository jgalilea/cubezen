// People walking the pavements (umbrellas up when it rains), cars with their lights and a
// commuter train crossing the bridge. Nothing here casts shadows: the shadow map is static.
import * as THREE from 'three';
import { pixelTexture } from '../common.js';
import { G, CROSS, BRIDGE, END_Z } from './build.js';
import { YATAI } from './props.js';
import { kit, shadedBox, PAT } from './kit.js';

const mats = new Map();
const lambert = (c) => { if (!mats.has(c)) mats.set(c, new THREE.MeshLambertMaterial({ color: c, vertexColors: true })); return mats.get(c); };
const umbrellaMats = new Map();

const COATS = ['#2a2a3a', '#4a4a5e', '#7a3a4a', '#3a5a7a', '#c8c0b0', '#5a6a4a', '#8a6a4a', '#1e1e28', '#d86a8a', '#e8e4dc', '#c89a4a', '#5a4a7a'];
const PANTS = ['#22222e', '#3a3a4e', '#4a4038', '#2a3448', '#5a5a64', '#2a2a2a'];
const SKIN = ['#f0c8a8', '#d8a888', '#b88468', '#f4d4bc', '#8a5a40'];
const HAIR = ['#1a1418', '#2a1e1a', '#4a3020', '#8a6a4a', '#c8c0c0', '#6a2a2a'];
const SHIRTS = ['#e8e4dc', '#c8d4e4', '#2a2a30', '#d8c8a8'];
const SHOES = ['#1a1a20', '#e8e8e8', '#5a3a28', '#2a2a40'];
const UMBRELLAS = ['#e8eef4', '#1e1e28', '#c83a4a', '#3a5aa8', '#e8eef4'];
const darker = (hex, k) => '#' + new THREE.Color(hex).multiplyScalar(k).getHexString();

// A pedestrian in boxes about the size of the city's texture pixels: shoes with soles, hands,
// cuffs and collars, a face with eyes, one of several haircuts or a hat, and maybe a bag or a scarf.
function makePerson(r) {
  const g = new THREE.Group();
  const pick = (a) => a[Math.floor(r() * a.length)];
  const coat = pick(COATS), pants = pick(PANTS), hair = pick(HAIR), skin = pick(SKIN), shoe = pick(SHOES);
  const cloth = r() < 0.25 ? PAT.knit : PAT.fabric, trim = darker(coat, 0.7);
  const long = r() < 0.35;                                                    // a long coat
  const limb = (x, y, build) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    pivot.add(build(kit()).mesh());
    g.add(pivot);
    return pivot;
  };
  const legs = [-0.11, 0.11].map((x) => limb(x, 0.82, (k) => k
    .box(0.17, 0.74, 0.2, pants, 0, -0.37, 0, { pat: PAT.fabric })
    .box(0.18, 0.04, 0.21, darker(pants, 0.75), 0, -0.72, 0)                   // turn-ups
    .box(0.18, 0.09, 0.27, shoe, 0, -0.76, 0.035)
    .box(0.19, 0.035, 0.29, shoe === '#e8e8e8' ? '#b8b8c0' : '#d8d4cc', 0, -0.8, 0.035)));   // soles
  const arms = [-0.3, 0.3].map((x) => limb(x, 1.42, (k) => k
    .box(0.13, 0.5, 0.16, coat, 0, -0.25, 0, { pat: cloth })
    .box(0.14, 0.05, 0.17, trim, 0, -0.5, 0)                                  // cuffs
    .box(0.1, 0.11, 0.12, skin, 0, -0.58, 0.01)));                            // hands
  const b = kit()
    .box(0.46, 0.62, 0.28, coat, 0, 1.13, 0, { pat: cloth })
    .box(0.5, 0.07, 0.3, coat, 0, 1.41, 0, { pat: cloth })                     // shoulders
    .box(0.03, 0.5, 0.01, trim, 0, 1.1, 0.142)                                // the opening down the front
    .box(0.12, 0.13, 0.012, pick(SHIRTS), 0, 1.36, 0.142)                     // shirt at the neck
    .box(0.4, 0.06, 0.3, trim, 0, 1.46, -0.01)                                // collar
    .box(0.14, 0.08, 0.14, skin, 0, 1.5, 0)                                   // neck
    .box(0.32, 0.32, 0.3, skin, 0, 1.68, 0)                                   // head
    .box(0.05, 0.05, 0.01, '#1a1420', -0.075, 1.69, 0.152)                    // eyes
    .box(0.05, 0.05, 0.01, '#1a1420', 0.075, 1.69, 0.152)
    .box(0.06, 0.015, 0.01, darker(skin, 0.7), 0, 1.585, 0.152)               // mouth
    .box(0.03, 0.08, 0.06, darker(skin, 0.9), -0.17, 1.67, 0)                 // ears
    .box(0.03, 0.08, 0.06, darker(skin, 0.9), 0.17, 1.67, 0);
  for (const x of [-0.12, 0.12]) b.box(0.1, 0.07, 0.012, trim, x, 1.0, 0.142);   // pockets
  if (long) b.box(0.47, 0.3, 0.29, coat, 0, 0.7, 0, { pat: cloth }).box(0.03, 0.3, 0.01, trim, 0, 0.7, 0.147);
  else b.box(0.44, 0.06, 0.27, darker(pants, 0.8), 0, 0.82, 0);              // belt line
  // Hair, or a hat.
  const style = Math.floor(r() * 5), hp = { pat: PAT.hair };
  if (style === 3) {                                                          // a knitted beanie
    const hat = pick(['#c83a4a', '#e8c43a', '#3a5aa8', '#2a2a30', '#e8e4dc']);
    b.box(0.35, 0.16, 0.33, hat, 0, 1.87, -0.005, { pat: PAT.knit }).box(0.36, 0.06, 0.34, darker(hat, 0.8), 0, 1.8, -0.005, { pat: PAT.knit });
    b.box(0.34, 0.12, 0.06, hair, 0, 1.73, -0.14, hp);
  } else if (style === 4) {                                                   // a cap
    const hat = pick(['#1e1e28', '#e8e8ec', '#2a4a8a', '#5a6a4a']);
    b.box(0.35, 0.12, 0.33, hat, 0, 1.87, -0.005, { pat: PAT.fabric }).box(0.3, 0.03, 0.15, hat, 0, 1.82, 0.22);
    b.box(0.34, 0.14, 0.06, hair, 0, 1.74, -0.14, hp);
  } else {
    b.box(0.35, 0.09, 0.33, hair, 0, 1.87, -0.005, hp)                        // top
      .box(0.35, 0.24, 0.07, hair, 0, 1.74, -0.145, hp)                       // back
      .box(0.03, 0.17, 0.27, hair, -0.17, 1.77, -0.02, hp)                    // sides
      .box(0.03, 0.17, 0.27, hair, 0.17, 1.77, -0.02, hp)
      .box(0.33, 0.06, 0.04, hair, r() < 0.5 ? 0 : 0.04, 1.8, 0.15, hp);      // fringe
    if (style === 1) b.box(0.36, 0.38, 0.08, hair, 0, 1.56, -0.15, hp).box(0.04, 0.3, 0.12, hair, -0.17, 1.6, -0.07, hp).box(0.04, 0.3, 0.12, hair, 0.17, 1.6, -0.07, hp);   // long
    if (style === 2) b.box(0.15, 0.13, 0.14, hair, 0, 1.93, -0.1, hp);                     // a bun
  }
  // Something to carry or wear.
  const extra = r();
  if (extra < 0.25) {                                                         // a backpack with straps
    const bag = pick(['#3a2a20', '#1a1a20', '#6a4a8a', '#2a4a5a']);
    b.box(0.32, 0.38, 0.14, bag, 0, 1.13, -0.22, { pat: PAT.fabric }).box(0.26, 0.12, 0.04, darker(bag, 0.8), 0, 1.02, -0.3);
    for (const x of [-0.13, 0.13]) b.box(0.05, 0.4, 0.012, darker(bag, 0.7), x, 1.2, 0.143);
  } else if (extra < 0.45) {                                                  // a shoulder bag on a strap
    const bag = pick(['#5a3a28', '#1a1a20', '#c8b8a0']);
    b.box(0.08, 0.26, 0.26, bag, -0.29, 0.93, 0, { pat: PAT.fabric }).box(0.04, 0.7, 0.012, darker(bag, 0.7), 0, 1.2, 0.143, { rz: 0.6 });
  } else if (extra < 0.6) {                                                   // a scarf
    const sc = pick(['#c83a4a', '#e8c43a', '#e8e4dc', '#3a7a6a']);
    b.box(0.36, 0.09, 0.32, sc, 0, 1.47, 0, { pat: PAT.knit }).box(0.09, 0.26, 0.04, sc, 0.08, 1.32, 0.16, { pat: PAT.knit });
  }
  g.add(b.mesh());
  // Umbrella: a low eight-sided cone on a handle, held a little forward.
  const umbrella = new THREE.Group();
  const col = pick(UMBRELLAS);
  if (!umbrellaMats.has(col)) { const clear = col === '#e8eef4'; umbrellaMats.set(col, new THREE.MeshLambertMaterial({ color: col, transparent: clear, opacity: clear ? 0.6 : 1 })); }
  const canopy = new THREE.Mesh(new THREE.ConeGeometry(0.72, 0.32, 8), umbrellaMats.get(col));
  canopy.position.y = 0.16;
  umbrella.add(canopy, kit().box(0.04, 0.75, 0.04, '#2a2a30', 0, -0.3, 0).box(0.05, 0.05, 0.05, '#2a2a30', 0, 0.36, 0).mesh());
  umbrella.position.set(0.12, 2.2, 0.1);
  g.add(umbrella);
  return { group: g, legs, arms, umbrella, wantsUmbrella: r() };
}

// Light on the road in front of a car and a red smudge behind it. Shared by all cars, so their
// brightness is set once per frame for the time of day.
function poolTexture(long) {
  const c = document.createElement('canvas');
  c.width = 16; c.height = 32;
  const g = c.getContext('2d');
  for (let y = 0; y < 32; y++) for (let x = 0; x < 16; x++) {
    const u = (x - 7.5) / 8, v = y / 31;
    const a = long ? Math.max(0, 1 - v) * Math.max(0, 1 - Math.abs(u) / (0.45 + v * 0.55)) : Math.max(0, 1 - Math.hypot(u, (v - 0.5) * 2));
    g.fillStyle = `rgba(255,255,255,${(a * a).toFixed(3)})`;
    g.fillRect(x, y, 1, 1);
  }
  return pixelTexture(c);
}
const beamMat = new THREE.MeshBasicMaterial({ map: poolTexture(true), color: 0xfff0d0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
const tailPoolMat = new THREE.MeshBasicMaterial({ map: poolTexture(false), color: 0xff2a2a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });

const CAR_COLOURS = ['#e8e8ec', '#1e1e26', '#e8c43a', '#8a2a30', '#9aa0ac', '#2a4a8a', '#3a6a5a', '#e8e8ec', '#c8b8a0'];
// A small saloon or a hatchback: sloped windscreen and rear window, pillars, door seams and
// handles, chrome trim, wheel arches with hub caps, a grille, indicators and number plates.
function makeCar(r) {
  const g = new THREE.Group();
  const body = CAR_COLOURS[Math.floor(r() * CAR_COLOURS.length)];
  const hatch = r() < 0.4, taxi = body === '#e8c43a';
  const glass = '#141a28', sky = '#46546e', trim = '#1e1e26', chrome = '#a8a8b4', tyre = '#141418';
  const M = { pat: PAT.metal };
  const back = hatch ? -1.75 : -1.0;                         // where the cabin ends
  const cab = 0.5 - back;
  const k = kit()
    .box(1.8, 0.46, 4.2, body, 0, 0.5, 0, M)                 // lower body
    .box(1.76, 0.18, 1.3, body, 0, 0.82, 1.42, M)             // bonnet
    .box(1.78, 0.2, cab, body, 0, 0.83, (0.5 + back) / 2, M)  // under the windows
    .box(1.83, 0.035, 4.0, chrome, 0, 0.6, 0)                 // a bright line along the side
    .box(1.8, 0.03, cab - 0.1, chrome, 0, 0.935, (0.5 + back) / 2)
    .box(1.54, 0.48, cab - 0.2, glass, 0, 1.18, (0.5 + back) / 2 - 0.05)   // the cabin glass
    .box(1.56, 0.06, cab - 0.3, sky, 0, 1.34, (0.5 + back) / 2 - 0.05)     // sky caught in the side windows
    .box(1.5, 0.06, cab - 0.25, body, 0, 1.44, (0.5 + back) / 2 - 0.07, M) // roof
    .box(1.5, 0.04, 0.72, glass, 0, 1.19, 0.72, { rx: 0.8 })              // windscreen
    .box(1.4, 0.03, 0.06, sky, 0, 1.38, 0.53, { rx: 0.8 })
    .box(1.58, 0.48, 0.09, body, 0, 1.18, (0.5 + back) / 2 + 0.05, M);    // the B pillar
  for (const x of [-0.765, 0.765]) k.box(0.06, 0.05, 0.74, body, x, 1.19, 0.72, { rx: 0.8 });   // A pillars
  if (hatch) k.box(1.5, 0.48, 0.06, glass, 0, 1.15, back + 0.07, { rx: -0.25 }).box(1.58, 0.48, 0.16, body, 0, 1.18, back + 0.25, M);
  else {
    k.box(1.76, 0.18, 1.0, body, 0, 0.82, -1.6, M)          // boot
      .box(1.5, 0.04, 0.6, glass, 0, 1.15, -1.17, { rx: -0.85 })
      .box(1.58, 0.48, 0.14, body, 0, 1.18, -0.86, M);       // C pillar
  }
  // Door seams and handles.
  for (const z of [0.42, -0.4, ...(hatch ? [] : [-1.05])]) k.box(1.815, 0.5, 0.025, trim, 0, 0.72, z);
  for (const z of [0.05, -0.75]) k.box(1.83, 0.035, 0.14, chrome, 0, 0.86, z);
  // Wheels in dark arches, with hub caps.
  for (const z of [-1.3, 1.3]) {
    k.box(1.81, 0.36, 0.86, '#0e0e12', 0, 0.42, z);
    for (const x of [-0.82, 0.82]) {
      k.box(0.22, 0.58, 0.58, tyre, x, 0.29, z, { pat: PAT.rubber });
      k.box(0.03, 0.3, 0.3, chrome, x * 1.12, 0.29, z).box(0.035, 0.1, 0.1, '#3a3a44', x * 1.13, 0.29, z);
    }
  }
  k.box(1.82, 0.06, 1.7, trim, 0, 0.27, 0);                  // sill between the wheels
  // Front and back.
  k.box(1.86, 0.18, 0.14, trim, 0, 0.3, 2.12).box(1.86, 0.18, 0.14, trim, 0, 0.3, -2.12);         // bumpers
  k.box(0.9, 0.16, 0.03, '#2a2a32', 0, 0.6, 2.105, { pat: PAT.grille });
  for (const z of [-2.12, 2.12]) k.box(0.46, 0.14, 0.04, '#e8e8e0', 0, 0.44, z + Math.sign(z) * 0.07).box(0.3, 0.04, 0.045, '#3a3a5a', 0, 0.44, z + Math.sign(z) * 0.07);   // plates
  k.box(0.1, 0.1, 0.16, '#3a3a40', 0.55, 0.22, -2.18);       // exhaust
  // Mirrors and wipers.
  for (const x of [-1, 1]) k.box(0.16, 0.12, 0.2, body, x * 0.97, 1.0, 0.62, M).box(0.02, 0.08, 0.14, '#5a6a8a', x * 1.055, 1.0, 0.62);
  for (const x of [-0.35, 0.3]) k.box(0.5, 0.025, 0.03, '#0a0a0e', x, 0.96, 0.98, { ry: 0.15 });
  if (taxi) k.box(1.82, 0.08, 1.4, '#2a2a2a', 0, 0.62, 0.2).box(0.18, 0.3, 0.18, '#2a2a2a', 0, 1.6, -0.3);
  const lights = kit();
  for (const x of [-0.62, 0.62]) {
    lights.box(0.36, 0.12, 0.05, '#fff4d8', x, 0.7, 2.11, true).box(0.12, 0.07, 0.05, '#ffa82a', x * 1.38, 0.7, 2.1, true);
    lights.box(0.4, 0.12, 0.05, '#ff2a2a', x, 0.72, -2.11, true).box(0.1, 0.06, 0.05, '#f4f4ff', x * 0.6, 0.6, -2.115, true);
  }
  if (!hatch) lights.box(0.9, 0.04, 0.05, '#ff2a2a', 0, 0.72, -2.11, true);
  if (taxi) lights.box(0.5, 0.2, 0.28, '#fff0c8', 0, 1.58, -0.3, true);    // the roof sign
  g.add(k.mesh(), lights.mesh(true));
  const beam = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 9), beamMat);
  beam.rotation.x = -Math.PI / 2;
  beam.position.set(0, 0.03, 2.1 + 4.5);
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2), tailPoolMat);
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(0, 0.03, -2.6);
  g.add(beam, pool);
  return g;
}

// ---------- traffic lights ----------
// One controller for the crossing: the main street and the cross street take turns, with amber
// and a moment of all-red in between. People cross the main street while the cross street has
// green (and the walk signal chirps).
const PHASES = [['green', 'red', 16], ['amber', 'red', 3], ['red', 'red', 1.5], ['red', 'green', 12], ['red', 'amber', 3], ['red', 'red', 1.5]];
export function createTraffic() {
  const t = { main: 'green', cross: 'red', phase: 0, time: 0, walk: false };
  const tell = (on) => dispatchEvent(new CustomEvent('cubezen:city', { detail: { type: 'crossing', on, duration: PHASES[3][2] } }));
  t.update = (dt) => {
    t.time += dt;
    while (t.time > PHASES[t.phase][2]) { t.time -= PHASES[t.phase][2]; t.phase = (t.phase + 1) % PHASES.length; }
    [t.main, t.cross] = PHASES[t.phase];
    const walk = t.phase === 3;
    if (walk !== t.walk) { t.walk = walk; tell(walk); }
  };
  t.stop = () => { if (t.walk) { t.walk = false; tell(false); } };
  return t;
}

export function createLife(root, addGlow, seedRng, traffic) {
  const r = seedRng;
  // ---------- pedestrians ----------
  const people = [];
  const LANES = { '-1': [-7.8, -6.4], '1': [7.2, 8.6] };
  function placePerson(p, anywhere) {
    p.side = r() < 0.5 ? -1 : 1;
    const [a, b] = LANES[p.side];
    p.lane = a + r() * (b - a);
    p.dir = r() < 0.5 ? -1 : 1;
    p.speed = 1.0 + r() * 0.6;
    p.z = anywhere ? 14 - r() * 170 : p.dir < 0 ? 22 : -160;
    p.x = p.lane;
    p.crossing = 0;
    p.decided = p.wantsCross = false;
  }
  for (let i = 0; i < 22; i++) {
    const p = makePerson(r);
    p.phase = r() * 6;
    p.walk = 0;
    placePerson(p, true);
    root.add(p.group);
    people.push(p);
  }
  // The cook behind the yakitori counter, in a headband and apron, fanning the charcoal.
  const cook = makePerson(seedRng);
  cook.umbrella.visible = false;
  cook.group.add(kit()
    .box(0.37, 0.07, 0.35, '#f4f0e8', 0, 1.82, -0.005, { pat: PAT.fabric })
    .box(0.06, 0.12, 0.04, '#f4f0e8', 0.12, 1.86, -0.18)
    .box(0.42, 0.72, 0.015, '#2a3a6a', 0, 1.0, 0.152, { pat: PAT.fabric }).mesh());
  const fan = kit().box(0.03, 0.26, 0.24, '#e8d8b0', 0, -0.72, 0.08, { pat: PAT.paper }).box(0.02, 0.18, 0.02, '#8a6a4a', 0, -0.56, 0.02).mesh();
  cook.arms[1].add(fan);
  cook.group.position.set(YATAI.x - 0.5, G + 0.16, YATAI.z + 0.2);
  cook.group.rotation.y = Math.PI / 2;
  root.add(cook.group);
  function updateCook(time, fire) {
    cook.arms[1].rotation.x = -0.9 + Math.sin(time * (6 + fire * 6)) * (0.15 + fire * 0.2);
    cook.arms[1].rotation.z = 0.25;
    cook.arms[0].rotation.x = -0.5 + Math.sin(time * 0.7) * 0.08;
    cook.group.rotation.y = Math.PI / 2 + Math.sin(time * 0.31) * 0.25;
  }

  const ZEBRA_Z = CROSS.z1 + 3.5;                         // the crosswalk over the main street
  function updatePeople(dt, time, rain) {
    for (const p of people) {
      let moving = true;
      // At the crosswalk some people decide to go over to the other side; they wait for the walk
      // signal (only starting in its first seconds, so they're across before the cars go).
      if (!p.crossing && !p.decided && Math.abs(p.z - ZEBRA_Z) < 0.4) { p.decided = true; p.wantsCross = r() < 0.4; }
      if (p.decided && Math.abs(p.z - ZEBRA_Z) > 2) p.decided = false;
      if (!p.crossing && p.decided && p.wantsCross) {
        if (traffic.walk && traffic.time < 5) {
          p.crossing = 1; p.wantsCross = false; p.from = p.x; p.to = LANES[-p.side][0] + r() * 1.4; p.side = -p.side; p.lane = p.to;
        } else moving = false;
      }
      if (!moving) {
        p.group.rotation.y = -p.side * Math.PI / 2;                 // facing the road, waiting
      } else if (p.crossing) {
        const step = p.speed * 1.3 * dt * Math.sign(p.to - p.from);
        p.x += step;
        if ((step > 0 && p.x >= p.to) || (step < 0 && p.x <= p.to)) { p.x = p.to; p.crossing = 0; }
        p.group.rotation.y = step > 0 ? Math.PI / 2 : -Math.PI / 2;
      } else {
        // Walking along the pavement they cross the side street with the main street's green;
        // otherwise they wait at the kerb.
        const next = p.z + p.dir * p.speed * dt;
        const into = (z) => z >= CROSS.z0 - 0.6 && z <= CROSS.z1 + 1.6;
        if (!into(p.z) && into(next) && traffic.main !== 'green') moving = false;
        else p.z = next;
        // Step around the yakitori stall.
        const target = p.side < 0 && Math.abs(p.z - YATAI.z) < 3.2 ? -5.7 : p.lane;
        p.x += (target - p.x) * Math.min(1, dt * 2);
        p.group.rotation.y = p.dir > 0 ? 0 : Math.PI;
        if (p.z < -165 || p.z > 24) placePerson(p, false);
      }
      if (moving) p.walk += dt * p.speed * 5;
      const t = p.walk + p.phase;
      const swing = moving ? Math.sin(t) * 0.55 : 0;
      p.legs[0].rotation.x = swing; p.legs[1].rotation.x = -swing;
      p.arms[0].rotation.x = -swing * 0.7;
      p.arms[1].rotation.x = p.umbrella.visible ? -0.9 : swing * 0.7;
      p.group.position.set(p.x, G + (moving ? Math.abs(Math.cos(t)) * 0.05 : 0), p.z);
      p.umbrella.visible = rain > 0.15 + p.wantsUmbrella * 0.5;
    }
  }

  // ---------- cars ----------
  // Traffic keeps to the left: the left lane drives away from the camera, the right one towards
  // it. Each lane knows where its stop line is and which light it obeys; cars brake for red (and
  // for amber when they can stop in time) and keep their distance from the car in front.
  const cars = [];
  const LANES_CAR = [
    { x: -2.2, dir: -1, axis: 'z', from: 26, to: END_Z - 2, stop: CROSS.z1 + 4.8, light: 'main', next: 3 },
    { x: 3.2, dir: 1, axis: 'z', from: END_Z + 4, to: 28, stop: CROSS.z0 - 4.3, light: 'main', next: 6 },
    { z: CROSS.z0 + 2.7, dir: 1, axis: 'x', from: -70, to: 70, stop: -9.3, light: 'cross', next: 2 },
    { z: CROSS.z1 - 2.3, dir: -1, axis: 'x', from: 70, to: -70, stop: 10.3, light: 'cross', next: 9 },
  ];
  const HALF = 2.1, GAP = 1.8, BRAKE = 4, ACCEL = 2.5;
  function spawnCar(lane) {
    // Wait while the last car is still near the start (a queue at a red light can reach back).
    if (cars.some((c) => c.lane === lane && (c.pos - lane.from) * lane.dir < HALF * 2 + GAP + 3)) return false;
    const g = makeCar(r);
    const speed = 6 + r() * 4;
    root.add(g);
    // Headlights and taillights glow, and so do their reflections on the wet road.
    const front = [0, 1].map(() => addGlow(0, 0, 0, 2.4, 0xfff0d0, 0.85, true));
    const back = [0, 1].map(() => addGlow(0, 0, 0, 1.6, 0xff2a2a, 0.8, true));
    cars.push({ g, lane, v0: speed, v: speed, pos: lane.from, front, back });
    return true;
  }
  const fwd = new THREE.Vector3(), side = new THREE.Vector3();
  function updateCars(dt) {
    for (const lane of LANES_CAR) {
      lane.next -= dt;
      if (lane.next <= 0 && spawnCar(lane)) lane.next = 4 + r() * 12;
    }
    for (let i = cars.length - 1; i >= 0; i--) {
      const c = cars[i], L = c.lane;
      // Room ahead: up to the stop line when the light says stop, and up to the car in front.
      let room = Infinity;
      const toLine = (L.stop - (c.pos + L.dir * HALF)) * L.dir;
      const light = traffic[L.light];
      if (toLine > -0.3 && (light === 'red' || (light === 'amber' && toLine > (c.v * c.v) / (2 * BRAKE)))) room = toLine;
      for (const o of cars) {
        if (o === c || o.lane !== L) continue;
        const d = (o.pos - c.pos) * L.dir;
        if (d > 0) room = Math.min(room, d - HALF * 2 - GAP);
      }
      const want = Math.min(c.v0, Math.sqrt(2 * BRAKE * Math.max(0, room - 0.2)));
      c.v = want > c.v ? Math.min(want, c.v + ACCEL * dt) : Math.max(want, c.v - BRAKE * 2.5 * dt);
      c.pos += L.dir * c.v * dt;
      if ((L.dir > 0 && c.pos > L.to) || (L.dir < 0 && c.pos < L.to)) {
        root.remove(c.g);
        c.g.traverse((o) => o.geometry?.dispose());
        for (const s of [...c.front, ...c.back]) { s.userData.remove(); }
        cars.splice(i, 1);
        continue;
      }
      if (L.axis === 'z') { c.g.position.set(L.x, G, c.pos); c.g.rotation.y = L.dir > 0 ? 0 : Math.PI; fwd.set(0, 0, L.dir); side.set(1, 0, 0); }
      else { c.g.position.set(c.pos, G, L.z); c.g.rotation.y = L.dir > 0 ? Math.PI / 2 : -Math.PI / 2; fwd.set(L.dir, 0, 0); side.set(0, 0, 1); }
      const p = c.g.position;
      // Brake lights flare when slowing down or standing.
      const braking = c.v < c.v0 - 0.3;
      c.front.forEach((s, k) => s.userData.place(p.x + fwd.x * 2.3 + side.x * (k ? 0.6 : -0.6), G + 0.72, p.z + fwd.z * 2.3 + side.z * (k ? 0.6 : -0.6)));
      c.back.forEach((s, k) => {
        s.userData.place(p.x - fwd.x * 2.25 + side.x * (k ? 0.6 : -0.6), G + 0.74, p.z - fwd.z * 2.25 + side.z * (k ? 0.6 : -0.6));
        s.userData.level = braking ? 1.8 : 1;
      });
    }
  }

  // ---------- the train ----------
  // A long, slow commuter train, so it's on screen for a good while as it crosses the street:
  // silver cars with a green stripe, lit windows, headlights at the front and red lights behind.
  const winCanvas = document.createElement('canvas');
  winCanvas.width = 44; winCanvas.height = 10;
  {
    const g = winCanvas.getContext('2d');
    g.fillStyle = '#d4d8e0'; g.fillRect(0, 0, 44, 10);
    g.fillStyle = '#2aa86a'; g.fillRect(0, 7, 44, 1);
    g.fillStyle = '#1e7a50'; g.fillRect(0, 8, 44, 1);
    for (const [x, w, door] of [[1, 3, true], [6, 6], [14, 6], [22, 3, true], [27, 6], [35, 6], [42, 2, true]]) {
      g.fillStyle = door ? '#9aa0ac' : '#fff2cc';
      g.fillRect(x, door ? 1 : 2, w, door ? 8 : 4);
      if (door) { g.fillStyle = '#fff2cc'; g.fillRect(x, 2, w, 3); }
    }
  }
  const winTex = pixelTexture(winCanvas);
  const trainSide = new THREE.MeshLambertMaterial({ map: winTex, emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: 0 });
  const trainBody = lambert('#d4d8e0');
  const train = new THREE.Group();
  const CARS = 8, LEN = 11, SPEED = 9;
  for (let i = 0; i < CARS; i++) {
    const m = new THREE.Mesh(shadedBox(LEN - 0.4, 2.7, 2.8), [trainBody, trainBody, lambert('#9aa0ac'), trainBody, trainSide, trainSide]);
    m.position.set(i * LEN, 0, 0);
    train.add(m);
  }
  const trainZ = (BRIDGE.z0 + BRIDGE.z1 + 1) / 2, trainY = BRIDGE.y + 2 + 1.35;
  train.position.set(-400, trainY, trainZ);
  root.add(train);
  // Lights at both ends; which end is the front depends on the direction.
  const ends = [-LEN / 2 + 0.1, (CARS - 0.5) * LEN - 0.1].map((x) => [-0.8, 0.8].map((dz) => addGlow(0, 0, 0, 2.2, 0xffffff, 0.9, true)));
  for (const end of ends) for (const s of end) s.userData.level = 0;
  const SPAN = 100;
  let trainWait = 4, trainDir = 1;
  function updateTrain(dt) {
    if (trainWait > 0) {
      trainWait -= dt;
      train.visible = false;
      for (const end of ends) for (const s of end) s.userData.level = 0;    // fades its reflection too
      if (trainWait <= 0) {
        trainDir = r() < 0.5 ? 1 : -1;
        train.position.x = trainDir > 0 ? -SPAN - CARS * LEN : SPAN;
        const duration = (2 * SPAN + CARS * LEN) / SPEED;
        dispatchEvent(new CustomEvent('cubezen:city', { detail: { type: 'train', dir: trainDir, duration } }));
      }
      return;
    }
    train.visible = true;
    train.position.x += trainDir * SPEED * dt;
    ends.forEach((end, i) => {
      const front = (i === 1) === (trainDir > 0);
      end.forEach((s, k) => {
        s.userData.place(train.position.x + (i ? (CARS - 0.5) * LEN : -LEN / 2) + (i ? 0.25 : -0.25), trainY - 0.6, trainZ + (k ? 0.8 : -0.8));
        s.material.color.set(front ? 0xfff4dc : 0xff3030);
        s.userData.level = front ? 1.3 : 0.8;
      });
    });
    if ((trainDir > 0 && train.position.x > SPAN) || (trainDir < 0 && train.position.x < -SPAN - CARS * LEN)) trainWait = 20 + r() * 30;
  }

  return {
    applyTime(night) {
      trainSide.emissiveIntensity = 0.1 + night * 1.2;
      beamMat.opacity = 0.08 + night * 0.4;
      tailPoolMat.opacity = 0.05 + night * 0.35;
    },
    update(dt, time, env) {
      traffic.update(dt);
      updatePeople(dt, time, env.rain);
      updateCook(time, env.fire);
      updateCars(dt);
      updateTrain(dt);
    },
  };
}
