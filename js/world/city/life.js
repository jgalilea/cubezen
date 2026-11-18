// People walking the pavements (umbrellas up when it rains), cars with their lights and a
// commuter train crossing the bridge. Nothing here casts shadows: the shadow map is static.
import * as THREE from 'three';
import { pixelTexture } from '../common.js';
import { G, CROSS, BRIDGE, END_Z } from './build.js';
import { YATAI } from './props.js';

const mats = new Map();
const lambert = (c) => { if (!mats.has(c)) mats.set(c, new THREE.MeshLambertMaterial({ color: c })); return mats.get(c); };
const part = (parent, w, h, d, color, x, y, z) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof color === 'string' ? lambert(color) : color);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
};

const COATS = ['#2a2a3a', '#4a4a5e', '#7a3a4a', '#3a5a7a', '#c8c0b0', '#5a6a4a', '#8a6a4a', '#1e1e28', '#d86a8a', '#e8e4dc'];
const PANTS = ['#22222e', '#3a3a4e', '#4a4038', '#2a3448'];
const SKIN = ['#f0c8a8', '#d8a888', '#b88468', '#f4d4bc'];
const HAIR = ['#1a1418', '#2a1e1a', '#4a3020', '#8a6a4a', '#c8c0c0'];
const UMBRELLAS = ['#e8eef4', '#1e1e28', '#c83a4a', '#3a5aa8', '#e8eef4'];

function makePerson(r) {
  const g = new THREE.Group();
  const pick = (a) => a[Math.floor(r() * a.length)];
  const coat = pick(COATS), pants = pick(PANTS);
  const legs = [-0.11, 0.11].map((x) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.82, 0);
    part(pivot, 0.17, 0.8, 0.2, pants, 0, -0.4, 0);
    part(pivot, 0.18, 0.1, 0.26, '#1a1a20', 0, -0.78, 0.03);
    g.add(pivot);
    return pivot;
  });
  part(g, 0.48, 0.66, 0.3, coat, 0, 1.15, 0);
  const arms = [-0.3, 0.3].map((x) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, 1.42, 0);
    part(pivot, 0.13, 0.6, 0.16, coat, 0, -0.3, 0);
    g.add(pivot);
    return pivot;
  });
  part(g, 0.34, 0.34, 0.32, pick(SKIN), 0, 1.66, 0);
  part(g, 0.37, 0.14, 0.35, pick(HAIR), 0, 1.84, -0.01);
  part(g, 0.37, 0.2, 0.08, pick(HAIR), 0, 1.72, -0.16);
  if (r() < 0.3) part(g, 0.3, 0.36, 0.14, pick(['#3a2a20', '#1a1a20', '#6a4a8a']), 0, 1.15, -0.22);   // a backpack
  // Umbrella: a low eight-sided cone on a handle, held a little forward.
  const umbrella = new THREE.Group();
  const col = pick(UMBRELLAS);
  const clear = col === '#e8eef4';
  umbrella.add(new THREE.Mesh(new THREE.ConeGeometry(0.72, 0.32, 8), new THREE.MeshLambertMaterial({ color: col, transparent: clear, opacity: clear ? 0.6 : 1 })));
  umbrella.children[0].position.y = 0.16;
  part(umbrella, 0.04, 0.75, 0.04, '#2a2a30', 0, -0.3, 0);
  umbrella.position.set(0.12, 2.2, 0.1);
  g.add(umbrella);
  return { group: g, legs, arms, umbrella, wantsUmbrella: r() };
}

function makeCar(r) {
  const g = new THREE.Group();
  const kinds = [['#e8e8ec', '#2a2e3a'], ['#1a1a22', '#2a2e3a'], ['#e8c43a', '#2a2e3a'], ['#8a2a30', '#2a2e3a'], ['#9aa0ac', '#2a2e3a'], ['#2a4a8a', '#2a2e3a']];
  const [body, glass] = kinds[Math.floor(r() * kinds.length)];
  part(g, 1.8, 0.75, 4.2, body, 0, 0.6, 0);
  part(g, 1.6, 0.6, 2.2, glass, 0, 1.25, -0.2);
  part(g, 1.62, 0.08, 2.0, body, 0, 1.58, -0.2);
  for (const [x, z] of [[-0.85, 1.3], [0.85, 1.3], [-0.85, -1.3], [0.85, -1.3]]) part(g, 0.2, 0.5, 0.5, '#141418', x, 0.25, z);
  if (body === '#e8c43a') part(g, 0.5, 0.22, 0.3, '#f4f0e0', 0, 1.73, 0);       // the taxi roof light
  const head = new THREE.MeshBasicMaterial({ color: 0xfff4d8 }), tail = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
  for (const x of [-0.6, 0.6]) {
    part(g, 0.36, 0.16, 0.05, head, x, 0.72, 2.11);
    part(g, 0.32, 0.14, 0.05, tail, x, 0.74, -2.11);
  }
  return g;
}

export function createLife(root, addGlow, seedRng) {
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
  }
  for (let i = 0; i < 22; i++) {
    const p = makePerson(r);
    p.phase = r() * 6;
    placePerson(p, true);
    root.add(p.group);
    people.push(p);
  }
  function updatePeople(dt, time, rain) {
    for (const p of people) {
      // At the crossing some people walk over to the other side.
      if (!p.crossing && Math.abs(p.z - (CROSS.z1 + 3.5)) < 0.3 && r() < 0.02 * 30 * dt) { p.crossing = 1; p.from = p.x; p.to = LANES[-p.side][0] + r() * 1.4; p.side = -p.side; p.lane = p.to; }
      if (p.crossing) {
        const step = p.speed * dt * Math.sign(p.to - p.from);
        p.x += step;
        if ((step > 0 && p.x >= p.to) || (step < 0 && p.x <= p.to)) { p.x = p.to; p.crossing = 0; }
        p.group.rotation.y = step > 0 ? Math.PI / 2 : -Math.PI / 2;
      } else {
        p.z += p.dir * p.speed * dt;
        // Step around the yakitori stall.
        const target = p.side < 0 && Math.abs(p.z - YATAI.z) < 3.2 ? -5.7 : p.lane;
        p.x += (target - p.x) * Math.min(1, dt * 2);
        p.group.rotation.y = p.dir > 0 ? 0 : Math.PI;
        if (p.z < -165 || p.z > 24) placePerson(p, false);
      }
      const t = time * p.speed * 5 + p.phase;
      const swing = Math.sin(t) * 0.55;
      p.legs[0].rotation.x = swing; p.legs[1].rotation.x = -swing;
      p.arms[0].rotation.x = -swing * 0.7;
      p.arms[1].rotation.x = p.umbrella.visible ? -0.9 : swing * 0.7;
      p.group.position.set(p.x, G + Math.abs(Math.cos(t)) * 0.05, p.z);
      p.umbrella.visible = rain > 0.15 + p.wantsUmbrella * 0.5;
    }
  }

  // ---------- cars ----------
  // Traffic keeps to the left: the left lane drives away from the camera, the right one towards it.
  const cars = [];
  const LANES_CAR = [
    { x: -2.2, dir: -1, axis: 'z', from: 26, to: END_Z - 2, next: 3 },
    { x: 3.2, dir: 1, axis: 'z', from: END_Z + 4, to: 28, next: 6 },
    { z: CROSS.z0 + 2.7, dir: 1, axis: 'x', from: -70, to: 70, next: 2 },
    { z: CROSS.z1 - 2.3, dir: -1, axis: 'x', from: 70, to: -70, next: 9 },
  ];
  function spawnCar(lane) {
    const g = makeCar(r);
    const speed = 6 + r() * 4;
    root.add(g);
    // Headlights and taillights glow, and so do their reflections on the wet road.
    const front = [-0.6, 0.6].map((x) => addGlow(0, 0, 0, 2.4, 0xfff0d0, 0.85, true));
    const back = [-0.6, 0.6].map((x) => addGlow(0, 0, 0, 1.6, 0xff2a2a, 0.8, true));
    const car = { g, lane, speed, pos: lane.from, front, back };
    cars.push(car);
  }
  const fwd = new THREE.Vector3(), side = new THREE.Vector3();
  function updateCars(dt) {
    for (const lane of LANES_CAR) {
      lane.next -= dt;
      if (lane.next <= 0) { spawnCar(lane); lane.next = 5 + r() * 12; }
    }
    for (let i = cars.length - 1; i >= 0; i--) {
      const c = cars[i], L = c.lane;
      c.pos += L.dir * c.speed * dt;
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
      c.front.forEach((s, k) => s.userData.place(p.x + fwd.x * 2.3 + side.x * (k ? 0.6 : -0.6), G + 0.72, p.z + fwd.z * 2.3 + side.z * (k ? 0.6 : -0.6)));
      c.back.forEach((s, k) => s.userData.place(p.x - fwd.x * 2.25 + side.x * (k ? 0.6 : -0.6), G + 0.74, p.z - fwd.z * 2.25 + side.z * (k ? 0.6 : -0.6)));
    }
  }

  // ---------- the train ----------
  const winCanvas = document.createElement('canvas');
  winCanvas.width = 32; winCanvas.height = 8;
  {
    const g = winCanvas.getContext('2d');
    g.fillStyle = '#c8ccd4'; g.fillRect(0, 0, 32, 8);
    g.fillStyle = '#2a8a5a'; g.fillRect(0, 6, 32, 1);
    for (let i = 0; i < 5; i++) { g.fillStyle = i === 2 ? '#3a3a44' : '#fff4d8'; g.fillRect(1 + i * 6 + (i > 2 ? 1 : 0), 2, i === 2 ? 3 : 5, 3); }
  }
  const winTex = pixelTexture(winCanvas);
  const trainSide = new THREE.MeshLambertMaterial({ map: winTex, emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: 0 });
  const trainBody = lambert('#c8ccd4');
  const train = new THREE.Group();
  const CARS = 5, LEN = 11;
  for (let i = 0; i < CARS; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(LEN - 0.4, 2.6, 2.8), [trainBody, trainBody, lambert('#9aa0ac'), trainBody, trainSide, trainSide]);
    m.position.set(i * LEN, 0, 0);
    train.add(m);
  }
  train.position.set(-200, BRIDGE.y + 2 + 1.3, (BRIDGE.z0 + BRIDGE.z1 + 1) / 2);
  root.add(train);
  let trainWait = 6, trainDir = 1;
  function updateTrain(dt) {
    if (trainWait > 0) { trainWait -= dt; train.visible = false; return; }
    train.visible = true;
    train.position.x += trainDir * 17 * dt;
    if ((trainDir > 0 && train.position.x > 90) || (trainDir < 0 && train.position.x < -90 - CARS * LEN)) {
      trainWait = 25 + r() * 40;
      trainDir = r() < 0.5 ? 1 : -1;
      train.position.x = trainDir > 0 ? -90 - CARS * LEN : 90;
    }
  }

  return {
    applyTime(night) { trainSide.emissiveIntensity = 0.1 + night * 1.2; },
    update(dt, time, env) {
      updatePeople(dt, time, env.rain);
      updateCars(dt);
      updateTrain(dt);
    },
  };
}
