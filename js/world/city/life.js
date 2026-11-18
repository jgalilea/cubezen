// People walking the pavements (umbrellas up when it rains), cars with their lights and a
// commuter train crossing the bridge. Nothing here casts shadows: the shadow map is static.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { pixelTexture } from '../common.js';
import { G, CROSS, BRIDGE, END_Z } from './build.js';
import { YATAI } from './props.js';

// Boxes shaded per face like the voxels (bright tops, darker sides and undersides), so small
// things read as solid even when the light is flat.
const mats = new Map();
const lambert = (c) => { if (!mats.has(c)) mats.set(c, new THREE.MeshLambertMaterial({ color: c, vertexColors: true })); return mats.get(c); };
const SHADE = { px: 0.82, nx: 0.82, py: 1, ny: 0.45, pz: 0.7, nz: 0.7 };
function shadedBox(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d);
  const n = g.attributes.normal, col = [];
  for (let i = 0; i < n.count; i++) {
    const x = n.getX(i), y = n.getY(i);
    const k = y > 0.5 ? SHADE.py : y < -0.5 ? SHADE.ny : Math.abs(x) > 0.5 ? SHADE.px : SHADE.pz;
    col.push(k, k, k);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}
// A kit collects coloured boxes and merges them into one mesh: one draw call per car or limb.
const paintMat = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true });
const glowMat = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, toneMapped: false });
function kit() {
  const parts = [], c = new THREE.Color();
  return {
    box(w, h, d, color, x, y, z, lit = false) {
      const g = lit ? new THREE.BoxGeometry(w, h, d) : shadedBox(w, h, d);
      c.set(color);
      const col = g.attributes.color ?? new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3);
      // Plus a sheen: the purple sky and the neon caught on the paint, strongest on top, so even a
      // black car keeps its shape at night.
      const n = g.attributes.normal;
      for (let i = 0; i < col.count; i++) {
        const up = lit ? 0 : n.getY(i) > 0.5 ? 1 : n.getY(i) < -0.5 ? 0 : 0.35;
        col.setXYZ(i, col.getX(i) * c.r + up * 0.05, col.getY(i) * c.g + up * 0.035, col.getZ(i) * c.b + up * 0.09);
      }
      g.setAttribute('color', col);
      g.translate(x, y, z);
      parts.push(g);
      return this;
    },
    mesh(lit = false) {
      const m = new THREE.Mesh(mergeGeometries(parts), lit ? glowMat : paintMat);
      for (const p of parts) p.dispose();
      return m;
    },
  };
}
const umbrellaMats = new Map();

const COATS = ['#2a2a3a', '#4a4a5e', '#7a3a4a', '#3a5a7a', '#c8c0b0', '#5a6a4a', '#8a6a4a', '#1e1e28', '#d86a8a', '#e8e4dc'];
const PANTS = ['#22222e', '#3a3a4e', '#4a4038', '#2a3448'];
const SKIN = ['#f0c8a8', '#d8a888', '#b88468', '#f4d4bc'];
const HAIR = ['#1a1418', '#2a1e1a', '#4a3020', '#8a6a4a', '#c8c0c0'];
const UMBRELLAS = ['#e8eef4', '#1e1e28', '#c83a4a', '#3a5aa8', '#e8eef4'];

function makePerson(r) {
  const g = new THREE.Group();
  const pick = (a) => a[Math.floor(r() * a.length)];
  const coat = pick(COATS), pants = pick(PANTS), hair = pick(HAIR);
  const limb = (x, y, build) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    pivot.add(build(kit()).mesh());
    g.add(pivot);
    return pivot;
  };
  const legs = [-0.11, 0.11].map((x) => limb(x, 0.82, (k) => k.box(0.17, 0.8, 0.2, pants, 0, -0.4, 0).box(0.18, 0.1, 0.26, '#1a1a20', 0, -0.78, 0.03)));
  const arms = [-0.3, 0.3].map((x) => limb(x, 1.42, (k) => k.box(0.13, 0.6, 0.16, coat, 0, -0.3, 0)));
  const body = kit()
    .box(0.48, 0.66, 0.3, coat, 0, 1.15, 0)
    .box(0.34, 0.34, 0.32, pick(SKIN), 0, 1.66, 0)
    .box(0.37, 0.14, 0.35, hair, 0, 1.84, -0.01)
    .box(0.37, 0.2, 0.08, hair, 0, 1.72, -0.16);
  if (r() < 0.3) body.box(0.3, 0.36, 0.14, pick(['#3a2a20', '#1a1a20', '#6a4a8a']), 0, 1.15, -0.22);   // a backpack
  g.add(body.mesh());
  // Umbrella: a low eight-sided cone on a handle, held a little forward.
  const umbrella = new THREE.Group();
  const col = pick(UMBRELLAS);
  if (!umbrellaMats.has(col)) { const clear = col === '#e8eef4'; umbrellaMats.set(col, new THREE.MeshLambertMaterial({ color: col, transparent: clear, opacity: clear ? 0.6 : 1 })); }
  const canopy = new THREE.Mesh(new THREE.ConeGeometry(0.72, 0.32, 8), umbrellaMats.get(col));
  canopy.position.y = 0.16;
  umbrella.add(canopy, kit().box(0.04, 0.75, 0.04, '#2a2a30', 0, -0.3, 0).mesh());
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

const CAR_COLOURS = ['#e8e8ec', '#1e1e26', '#e8c43a', '#8a2a30', '#9aa0ac', '#2a4a8a', '#3a6a5a'];
function makeCar(r) {
  const g = new THREE.Group();
  const body = CAR_COLOURS[Math.floor(r() * CAR_COLOURS.length)];
  const glass = '#1a2030', trim = '#24242c';
  const k = kit()
    .box(1.8, 0.5, 4.2, body, 0, 0.47, 0)                         // lower body
    .box(1.76, 0.2, 3.9, body, 0, 0.82, -0.05)                    // waist, so the bonnet and boot step down
    .box(1.84, 0.06, 4.0, trim, 0, 0.73, 0)                       // a dark crease along the side
    .box(1.56, 0.56, 2.1, glass, 0, 1.2, -0.2)                    // the cabin
    .box(1.58, 0.1, 1.9, '#4e5c7a', 0, 1.3, -0.2)                 // sky caught in the side windows
    .box(1.5, 0.08, 1.8, body, 0, 1.52, -0.25);                   // roof
  for (const z of [-2.12, 2.12]) {
    k.box(1.86, 0.2, 0.14, trim, 0, 0.3, z);                      // bumpers
    k.box(0.46, 0.16, 0.04, '#e8e8e0', 0, 0.48, z + Math.sign(z) * 0.07);   // number plates
  }
  for (const [x, z] of [[-0.86, 1.3], [0.86, 1.3], [-0.86, -1.3], [0.86, -1.3]]) k.box(0.22, 0.56, 0.56, '#121216', x, 0.28, z);
  for (const x of [-0.98, 0.98]) k.box(0.14, 0.12, 0.22, body, x, 1.0, 0.75);     // mirrors
  if (body === '#e8c43a') k.box(0.5, 0.22, 0.3, '#f4f0e0', 0, 1.67, -0.2).box(1.82, 0.08, 1.2, '#2a2a2a', 0, 0.62, -0.3);   // taxi light and band
  const lights = kit();
  for (const x of [-0.62, 0.62]) lights.box(0.4, 0.14, 0.05, '#fff4d8', x, 0.68, 2.11, true).box(0.42, 0.12, 0.05, '#ff2a2a', x, 0.7, -2.11, true);
  lights.box(1.0, 0.05, 0.05, '#ff2a2a', 0, 0.7, -2.11, true);    // light bar between the tail lights
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
      updateCars(dt);
      updateTrain(dt);
    },
  };
}
