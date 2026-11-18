// Small voxel animals that bring the valley to life without stealing attention:
// a cat asleep by the fire, butterflies on warm days, and visitors that drop by, up to two at
// a time: rabbits, birds, ducks, a deer and a fox by day; an owl and a hedgehog at night.
import * as THREE from 'three';

const mats = new Map();
const mat = (c) => {
  if (!mats.has(c)) mats.set(c, new THREE.MeshLambertMaterial({ color: c }));
  return mats.get(c);
};
function box(parent, w, h, d, color, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}
function pivot(parent, x, y, z) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

// Soft round "blob" shadow: cheap, and it never lags behind like a shadow map would.
const blobTexture = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(0,0,0,0.5)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
})();
const blobMat = new THREE.MeshBasicMaterial({ map: blobTexture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
function blob(parent, size) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), blobMat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.02;
  parent.add(m);
  return m;
}

// Models face +x. heading(dx, dz) turns them towards a direction.
const heading = (dx, dz) => Math.atan2(-dz, dx);
const lerp = (a, b, t) => a + (b - a) * t;

function makeCat() {
  const g = new THREE.Group();
  const fur = '#d98a3a', stripe = '#b0682a';
  const body = box(g, 0.56, 0.26, 0.36, fur, 0, 0.13, 0);
  box(body, 0.07, 0.27, 0.37, stripe, -0.14, 0, 0);
  box(body, 0.07, 0.27, 0.37, stripe, 0.04, 0, 0);
  const head = box(g, 0.26, 0.23, 0.26, fur, 0.3, 0.12, 0.07);
  box(head, 0.07, 0.08, 0.06, fur, 0.01, 0.15, -0.08);
  box(head, 0.07, 0.08, 0.06, fur, 0.01, 0.15, 0.08);
  box(head, 0.02, 0.015, 0.06, '#3a2a20', 0.131, 0.03, -0.06);
  box(head, 0.02, 0.015, 0.06, '#3a2a20', 0.131, 0.03, 0.06);
  box(head, 0.02, 0.03, 0.04, '#e8a090', 0.131, -0.04, 0);
  const tail = pivot(g, -0.26, 0.05, 0.14);
  box(tail, 0.46, 0.08, 0.08, fur, 0.23, 0, 0.08);
  blob(g, 1.0);
  g.scale.setScalar(1.4);
  return { g, body, tail };
}

function makeRabbit(snowy) {
  const g = new THREE.Group();
  const fur = snowy ? '#eeeeee' : '#c49a72', inner = snowy ? '#e0c8c8' : '#e8c4a8';
  box(g, 0.42, 0.3, 0.28, fur, 0, 0.18, 0);
  const head = pivot(g, 0.24, 0.32, 0);
  box(head, 0.22, 0.2, 0.2, fur, 0.04, 0, 0);
  box(head, 0.05, 0.22, 0.07, fur, 0.0, 0.2, -0.05);
  box(head, 0.05, 0.22, 0.07, fur, 0.0, 0.2, 0.05);
  box(head, 0.051, 0.16, 0.03, inner, 0.0, 0.2, -0.05);
  box(head, 0.02, 0.03, 0.03, '#202020', 0.15, 0.03, -0.07);
  box(head, 0.02, 0.03, 0.03, '#202020', 0.15, 0.03, 0.07);
  box(g, 0.1, 0.1, 0.1, '#f4f4f4', -0.24, 0.24, 0);
  const shadow = blob(g, 0.8);
  g.scale.setScalar(1.5);
  return { g, head, shadow };
}

function makeBird() {
  const g = new THREE.Group();
  box(g, 0.34, 0.12, 0.12, '#2c2c36', 0, 0, 0);
  box(g, 0.1, 0.08, 0.08, '#2c2c36', 0.2, 0.03, 0);
  const wings = [-1, 1].map((side) => {
    const w = pivot(g, 0, 0.04, side * 0.06);
    box(w, 0.16, 0.02, 0.36, '#3a3a46', 0, 0, side * 0.18);
    return { w, side };
  });
  return { g, wings };
}

function makeDuck(duckling) {
  const g = new THREE.Group();
  const body = duckling ? '#e6cf6a' : '#8a6a4a', headC = duckling ? '#e6cf6a' : '#2f6a42';
  box(g, 0.48, 0.24, 0.3, body, 0, 0.08, 0);
  box(g, 0.14, 0.1, 0.22, duckling ? '#d8be58' : '#6a5038', -0.26, 0.16, 0);
  const head = pivot(g, 0.22, 0.3, 0);
  box(head, 0.18, 0.18, 0.18, headC, 0, 0, 0);
  box(head, 0.12, 0.05, 0.1, '#e8a030', 0.13, -0.03, 0);
  if (!duckling) box(g, 0.05, 0.04, 0.31, '#f0f0f0', 0.14, 0.18, 0);
  g.scale.setScalar(duckling ? 0.8 : 1.45);
  return { g, head };
}

function makeDeer() {
  const g = new THREE.Group();
  const coat = '#8a5a36', light = '#c9a27a';
  box(g, 1.0, 0.45, 0.38, coat, 0, 0.85, 0);
  box(g, 0.2, 0.12, 0.2, '#f2eadc', -0.52, 0.95, 0);
  const neck = pivot(g, 0.42, 0.95, 0);
  box(neck, 0.18, 0.5, 0.18, coat, 0.06, 0.2, 0);
  const head = pivot(neck, 0.1, 0.48, 0);
  box(head, 0.34, 0.2, 0.2, coat, 0.1, 0, 0);
  box(head, 0.1, 0.08, 0.12, light, 0.26, -0.04, 0);
  box(head, 0.05, 0.14, 0.12, coat, -0.04, 0.15, -0.12);
  box(head, 0.05, 0.14, 0.12, coat, -0.04, 0.15, 0.12);
  const legs = [[0.38, -0.12], [0.38, 0.12], [-0.38, -0.12], [-0.38, 0.12]].map(([x, z], i) => {
    const p = pivot(g, x, 0.65, z);
    box(p, 0.1, 0.65, 0.1, i < 2 ? coat : '#7a4e2e', 0, -0.32, 0);
    return p;
  });
  blob(g, 1.6);
  g.scale.setScalar(1.4);
  return { g, neck, legs };
}

function makeButterfly(color) {
  const g = new THREE.Group();
  box(g, 0.03, 0.03, 0.12, '#3a2a2a', 0, 0, 0);
  const wings = [-1, 1].map((side) => {
    const w = pivot(g, 0, 0, 0);
    box(w, 0.13, 0.01, 0.12, color, side * 0.065, 0, 0);
    return { w, side };
  });
  g.scale.setScalar(1.6);
  return { g, wings };
}

function makeFox() {
  const g = new THREE.Group();
  const coat = '#e0702c', light = '#f6ece0', dark = '#3a2620';
  const body = box(g, 0.8, 0.32, 0.3, coat, 0, 0.55, 0);
  box(body, 0.5, 0.06, 0.26, light, 0.1, -0.15, 0);                  // pale belly
  const head = pivot(g, 0.44, 0.72, 0);
  box(head, 0.3, 0.26, 0.28, coat, 0.06, 0, 0);
  box(head, 0.18, 0.12, 0.16, light, 0.26, -0.06, 0);                // muzzle
  box(head, 0.05, 0.05, 0.05, dark, 0.36, -0.03, 0);                 // nose
  box(head, 0.06, 0.14, 0.09, coat, 0.0, 0.18, -0.09);
  box(head, 0.06, 0.14, 0.09, coat, 0.0, 0.18, 0.09);
  box(head, 0.061, 0.05, 0.09, dark, 0.0, 0.24, -0.09);
  box(head, 0.061, 0.05, 0.09, dark, 0.0, 0.24, 0.09);
  box(head, 0.02, 0.04, 0.04, dark, 0.21, 0.05, -0.08);
  box(head, 0.02, 0.04, 0.04, dark, 0.21, 0.05, 0.08);
  const tail = pivot(g, -0.4, 0.6, 0);
  box(tail, 0.5, 0.18, 0.18, coat, -0.25, -0.02, 0);
  box(tail, 0.14, 0.16, 0.16, light, -0.52, -0.02, 0);
  const legs = [[0.28, -0.1], [0.28, 0.1], [-0.28, -0.1], [-0.28, 0.1]].map(([x, z]) => {
    const p = pivot(g, x, 0.42, z);
    box(p, 0.09, 0.42, 0.09, dark, 0, -0.2, 0);
    return p;
  });
  blob(g, 1.1);
  g.scale.setScalar(1.35);
  return { g, head, tail, legs, body };
}

function makeOwl() {
  const g = new THREE.Group();
  const feather = '#a07a56', light = '#e6d2ac';
  const body = box(g, 0.32, 0.4, 0.32, feather, 0, 0.2, 0);
  box(body, 0.02, 0.26, 0.22, light, 0.16, -0.04, 0);                 // speckled chest
  const head = pivot(g, 0, 0.5, 0);
  box(head, 0.32, 0.26, 0.34, feather, 0, 0, 0);
  box(head, 0.02, 0.18, 0.28, light, 0.16, -0.01, 0);                 // face disc
  // Eyes shine in the dark (unlit material), so the owl reads at night.
  const eyeMat = new THREE.MeshBasicMaterial({ color: '#ffd24a' });
  const eyes = [-0.07, 0.07].map((z) => {
    const e = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.08, 0.08), eyeMat);
    e.position.set(0.175, 0.02, z);
    head.add(e);
    return e;
  });
  box(head, 0.04, 0.05, 0.04, '#e8a030', 0.18, -0.06, 0);
  box(head, 0.08, 0.08, 0.06, feather, 0, 0.16, -0.12);               // ear tufts
  box(head, 0.08, 0.08, 0.06, feather, 0, 0.16, 0.12);
  const wings = [-1, 1].map((side) => {
    const w = pivot(g, 0, 0.36, side * 0.16);
    box(w, 0.26, 0.04, 0.34, '#6e523a', 0, 0, side * 0.17);
    return { w, side };
  });
  for (const w of wings) w.w.visible = false;
  g.scale.setScalar(2.1);
  return { g, head, eyes, wings };
}

function makeHedgehog() {
  const g = new THREE.Group();
  const spikes = '#7a604a', tip = '#b09478', face = '#e2c4a2';
  const body = box(g, 0.5, 0.3, 0.4, spikes, 0, 0.17, 0);
  for (const [x, y, z] of [[-0.1, 0.17, -0.12], [0.06, 0.2, 0.1], [-0.18, 0.12, 0.12], [0.1, 0.16, -0.12], [-0.02, 0.24, 0]]) box(body, 0.06, 0.06, 0.06, tip, x, y - 0.17 + 0.12, z);
  const head = pivot(g, 0.27, 0.12, 0);
  box(head, 0.2, 0.17, 0.24, face, 0, 0, 0);
  box(head, 0.1, 0.08, 0.1, face, 0.12, -0.03, 0);
  box(head, 0.04, 0.04, 0.04, '#201814', 0.18, -0.02, 0);
  box(head, 0.02, 0.03, 0.03, '#201814', 0.1, 0.04, -0.08);
  box(head, 0.02, 0.03, 0.03, '#201814', 0.1, 0.04, 0.08);
  blob(g, 0.8);
  g.scale.setScalar(1.9);
  return { g, head, body };
}

export function createCritters(scene, world) {
  const { ground, riverX, fire } = world;
  // Walking height. world.ground() jumps a whole block at each step, so animals would pop up or
  // down. Here they stay flat across a block, rise over the last stretch before a higher one and
  // step down just past the edge of a lower one, so climbs read as a hop rather than a teleport.
  const REACH = 0.85;                                  // how far before an edge the climb starts
  const walkY = (x, z) => {
    const cx = Math.floor(x), cz = Math.floor(z), own = ground(x, z);
    let y = own;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      if (!i && !j) continue;
      const h = ground(cx + i + 0.5, cz + j + 0.5);
      if (h <= y) continue;
      // Distance from (x, z) to that neighbouring block's footprint.
      const dx = Math.max(cx + i - x, 0, x - (cx + i + 1)), dz = Math.max(cz + j - z, 0, z - (cz + j + 1));
      const s = Math.max(0, 1 - Math.hypot(dx, dz) / REACH);
      y = Math.max(y, own + (h - own) * s * s * (3 - 2 * s));
    }
    return y;
  };
  // Places a walking animal: its height follows walkY() with a little lag, quicker going up than
  // down so it never sinks into a step, and the body leans with the slope it is climbing.
  function feet() {
    let y = null, lean = 0;
    return (g, x, z, dt, lift = 0) => {
      const target = walkY(x, z);
      if (y === null || Math.abs(target - y) > 3) y = target;
      y += (target - y) * Math.min(1, dt * (target > y ? 9 : 5));
      const fx = Math.cos(g.rotation.y), fz = -Math.sin(g.rotation.y);
      const slope = (walkY(x + fx * 0.45, z + fz * 0.45) - walkY(x - fx * 0.45, z - fz * 0.45)) / 0.9;
      lean += (Math.atan(slope) * 0.45 - lean) * Math.min(1, dt * 6);
      g.position.set(x, y + lift, z);
      g.rotation.z = lean;
    };
  }
  const waterY = world.WL + 1 - 0.14;

  // ---- the cat, always asleep by the fire ----
  const cat = makeCat();
  cat.g.position.set(fire.x + 1.4, ground(fire.x + 1.4, fire.z + 1.2), fire.z + 1.2);
  cat.g.rotation.y = 2.4;
  scene.add(cat.g);

  // ---- butterflies on warm days ----
  const butterflies = ['#f5d76e', '#f0a0c8', '#ffffff', '#a8c8ff'].map((c) => {
    const b = makeButterfly(c);
    b.home = { x: 42 + Math.random() * 30, z: 74 + Math.random() * 14 };
    b.ph = Math.random() * 10;
    scene.add(b.g);
    return b;
  });

  // ---- visitors ----
  const VISITORS = {
    rabbit(env) {
      const r = makeRabbit(env.season === 'winter');
      const z0 = 64 + Math.random() * 7;               // stays clear of the tent
      const stops = [
        { x: 72 + Math.random() * 10, z: z0 + (Math.random() - 0.5) * 4, rest: 4 + Math.random() * 5 },
        { x: 66 + Math.random() * 8, z: z0 + (Math.random() - 0.5) * 5, rest: Math.random() < 0.5 ? 3 + Math.random() * 3 : 0 },
        { x: 96, z: z0 + (Math.random() - 0.5) * 6, rest: 0 },
      ];
      let x = 95, z = z0, phase = 'pause', timer = 0.4, from = null, to = null, stop = 0;
      r.g.position.set(x, walkY(x, z), z);
      const place = feet();
      return {
        obj: r.g,
        update(dt, time) {
          timer -= dt;
          if (phase === 'hop') {
            const p = Math.min(1, 1 - timer / 0.32);
            x = lerp(from.x, to.x, p);
            z = lerp(from.z, to.z, p);
            const lift = Math.sin(p * Math.PI) * 0.35;
            place(r.g, x, z, dt, lift);
            r.shadow.position.y = 0.02 - lift / 1.5;
            if (timer <= 0) { phase = 'pause'; timer = 0.08 + Math.random() * 0.3; }
            return true;
          }
          // Nibbling / sniffing while resting.
          r.head.rotation.z = phase === 'rest' ? -0.35 + Math.sin(time * 8) * 0.08 * (Math.sin(time * 0.9) > 0 ? 1 : 0) : 0;
          if (timer > 0) return true;
          const target = stops[stop];
          const dx = target.x - x, dz = target.z - z, dist = Math.hypot(dx, dz);
          if (dist < 0.5) {
            if (stop === stops.length - 1) return false;
            if (phase !== 'rest' && target.rest) { phase = 'rest'; timer = target.rest; return true; }
            stop++;
            phase = 'pause';
            return true;
          }
          const step = Math.min(0.9, dist);
          from = { x, z };
          to = { x: x + (dx / dist) * step, z: z + (dz / dist) * step };
          r.g.rotation.y = heading(dx, dz);
          phase = 'hop';
          timer = 0.32;
          return true;
        },
      };
    },

    birds() {
      const flock = new THREE.Group();
      const birds = [];
      const n = 4 + Math.floor(Math.random() * 4);
      for (let i = 0; i < n; i++) {
        const b = makeBird();
        const row = Math.ceil(i / 2), side = i % 2 ? 1 : -1;
        b.g.position.set(-row * 1.4, Math.random() * 0.4, side * row * 1.2);
        b.ph = Math.random() * 6;
        birds.push(b);
        flock.add(b.g);
      }
      flock.scale.setScalar(1.5);
      const dir = Math.random() < 0.5 ? 1 : -1;
      let x = dir > 0 ? -30 : 150;
      const y = 32 + Math.random() * 8, z = 20 + Math.random() * 30;
      flock.rotation.y = heading(dir, 0);
      return {
        obj: flock,
        update(dt, time) {
          x += dir * 6 * dt;
          flock.position.set(x, y + Math.sin(time * 0.6) * 0.8, z + Math.sin(time * 0.3) * 2);
          for (const b of birds) {
            const flap = Math.sin(time * 9 + b.ph);
            const glide = Math.sin(time * 0.7 + b.ph) > 0.3 ? 0.15 : 1;  // birds glide now and then
            for (const w of b.wings) w.w.rotation.x = w.side * flap * 0.7 * glide;
          }
          return dir > 0 ? x < 150 : x > -30;
        },
      };
    },

    ducks() {
      const family = [makeDuck(false), makeDuck(true), makeDuck(true), makeDuck(true)];
      const group = new THREE.Group();
      family.forEach((d) => group.add(d.g));
      let zLead = 10;
      return {
        obj: group,
        update(dt, time) {
          zLead += 0.75 * dt;
          family.forEach((d, i) => {
            const z = zLead - i * (i ? 0.8 : 1.2);
            const x = riverX(z) - 1.7 + Math.sin(z * 0.4 + i) * 0.3;   // keep clear of the dock and boat
            const dx = riverX(z + 0.5) - riverX(z - 0.5);
            d.g.position.set(x, waterY - 0.02 + Math.sin(time * 2 + i) * 0.02, z);
            d.g.rotation.y = heading(dx, 1);
            d.head.rotation.z = Math.sin(time * 1.3 + i * 2) > 0.92 ? -0.6 : 0;  // a quick dip now and then
          });
          return zLead < world.D + 3;
        },
      };
    },

    deer() {
      const d = makeDeer();
      // It drinks on the meadow-side bank, upstream of the dock, so it stands in the open.
      const zt = 30 + Math.random() * 7;
      let bx = riverX(zt) + 2;                           // first dry ground beside the water
      while (ground(bx, zt) <= world.WL && bx < riverX(zt) + 14) bx += 0.5;
      const bank = { x: bx + 0.4, z: zt };
      const forest = { x: bank.x + 14, z: zt - 6 - Math.random() * 6 };
      let phase = 'in', t = 0, drink = 9 + Math.random() * 6;
      const place = feet();
      const walkTime = Math.hypot(bank.x - forest.x, bank.z - forest.z) / 1.1;
      return {
        obj: d.g,
        update(dt, time) {
          t += dt;
          const walking = phase === 'in' || phase === 'out';
          if (walking) {
            const p = Math.min(1, t / walkTime);
            const [a, b] = phase === 'in' ? [forest, bank] : [bank, forest];
            const x = lerp(a.x, b.x, p), z = lerp(a.z, b.z, p);
            d.g.rotation.y = heading(b.x - a.x, b.z - a.z);
            if (phase === 'in' && p > 0.97) d.g.rotation.y = heading(-1, 0);   // turn to face the water
            place(d.g, x, z, dt);
            d.legs.forEach((l, i) => { l.rotation.z = Math.sin(time * 6 + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * 0.35; });
            d.neck.rotation.z = 0;
            if (p >= 1) {
              if (phase === 'out') return false;
              phase = 'drink';
              t = 0;
            }
          } else {
            d.legs.forEach((l) => { l.rotation.z = 0; });
            const lookUp = Math.sin(t * 0.8) > 0.75;                  // glances up every few seconds
            d.neck.rotation.z = lerp(d.neck.rotation.z, lookUp ? 0 : -1.25, Math.min(1, dt * 3));
            if (t > drink) { phase = 'out'; t = 0; }
          }
          return true;
        },
      };
    },
  };

  // Walk a model along waypoints at a given speed, pausing where a point asks for it.
  // gait(model, moving, time, dt) animates legs and head; returns false once it's off stage.
  function walker(model, points, speed, gait) {
    let i = 0, x = points[0].x, z = points[0].z, wait = 0;
    model.g.position.set(x, walkY(x, z), z);
    const place = feet();
    return {
      obj: model.g,
      update(dt, time) {
        if (wait > 0) { wait -= dt; gait(model, false, time, dt, points[i]); return true; }
        const to = points[i + 1];
        if (!to) return false;
        const dx = to.x - x, dz = to.z - z, dist = Math.hypot(dx, dz);
        if (dist < 0.05) {
          i++;
          wait = to.wait || 0;
          if (to.face !== undefined) model.g.rotation.y = to.face;
          return true;
        }
        const step = Math.min(dist, speed * dt);
        x += (dx / dist) * step; z += (dz / dist) * step;
        model.g.rotation.y = heading(dx, dz);
        place(model.g, x, z, dt);
        gait(model, true, time, dt, to);
        return true;
      },
    };
  }
  const legSwing = (legs, time, rate, amp) => legs.forEach((l, i) => { l.rotation.z = Math.sin(time * rate + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * amp; });

  Object.assign(VISITORS, {
    // A fox trots across the meadow, sits a while looking at the valley, then goes on its way.
    fox() {
      const f = makeFox();
      // In from the right-hand woods, a sit in the meadow between the fire and the mine path,
      // then off up the slope.
      const z = 68 + Math.random() * 2, mid = 78 + Math.random() * 8;
      return walker(f, [{ x: 104, z: z + 3 }, { x: mid, z, wait: 7 + Math.random() * 5, face: heading(-0.3, 1) }, { x: 99, z: 60 }, { x: 110, z: 58 }], 2.2, (m, moving, time) => {
        legSwing(m.legs, time, 11, moving ? 0.5 : 0);
        m.tail.rotation.y = Math.sin(time * (moving ? 6 : 1.5)) * (moving ? 0.25 : 0.4);
        m.body.position.y = moving ? 0.55 + Math.abs(Math.sin(time * 11)) * 0.03 : 0.5;
        m.head.rotation.y = moving ? 0 : Math.sin(time * 0.6) * 0.5;
      });
    },

    // A hedgehog shuffles through the meadow at night, stopping to sniff.
    hedgehog() {
      const h = makeHedgehog();
      // Out of the long grass, a visit to the warm side of the campfire, and back again.
      const F = fire, dz = Math.random() * 2;
      const pts = [
        { x: 34, z: 82 + dz },
        { x: 50, z: 80 + dz, wait: 3 + Math.random() * 2 },
        { x: F.x - 1.7, z: F.z + 1.7, wait: 6 + Math.random() * 4 },
        { x: F.x - 8, z: F.z - 1, wait: 2 + Math.random() * 2 },
        { x: 34, z: 74 },
      ];
      return walker(h, pts, 0.8, (m, moving, time) => {
        m.body.position.y = 0.17 + (moving ? Math.abs(Math.sin(time * 14)) * 0.015 : 0);
        m.head.rotation.z = moving ? 0 : -0.25 + Math.sin(time * 5) * 0.08;   // nose down, sniffing
      });
    },

    // An owl glides in to the scarecrow's hat, looks around for a while and flies off.
    owl() {
      const o = makeOwl();
      const perch = world.perch;
      const start = { x: perch.x - 40, y: perch.y + 14, z: perch.z - 30 }, end = { x: perch.x + 45, y: perch.y + 16, z: perch.z - 25 };
      let phase = 'in', t = 0;
      const stay = 30 + Math.random() * 20, flyTime = 6;
      o.g.rotation.y = heading(0, 1);
      const fly = (a, b, p, time) => {
        const e = p * p * (3 - 2 * p);
        o.g.position.set(lerp(a.x, b.x, e), lerp(a.y, b.y, e) + Math.sin(p * Math.PI) * 3, lerp(a.z, b.z, e));
        o.g.rotation.y = heading(b.x - a.x, b.z - a.z);
        for (const w of o.wings) { w.w.visible = true; w.w.rotation.x = w.side * Math.sin(time * 10) * 0.8; }
      };
      return {
        obj: o.g,
        update(dt, time) {
          t += dt;
          if (phase === 'in') {
            fly(start, perch, Math.min(1, t / flyTime), time);
            if (t >= flyTime) { phase = 'perch'; t = 0; for (const w of o.wings) w.w.visible = false; o.g.rotation.y = heading(0, 1); }
          } else if (phase === 'perch') {
            o.g.position.set(perch.x, perch.y, perch.z);
            // Slow head turns, with the occasional blink.
            const look = Math.sin(t * 0.35) + (Math.sin(t * 0.13) > 0.8 ? 0.6 : 0);
            o.head.rotation.y = Math.max(-1.3, Math.min(1.3, look * 1.1));
            const blink = (t % 4.3) < 0.15;
            for (const e of o.eyes) e.scale.y = blink ? 0.15 : 1;
            if (t > stay) { phase = 'out'; t = 0; }
          } else {
            fly(perch, end, Math.min(1, t / flyTime), time);
            if (t >= flyTime) return false;
          }
          return true;
        },
      };
    },
  });

  // Up to two visitors at once (never two of the same kind), with short breaks in between.
  const actives = [];
  let nextIn = 3 + Math.random() * 4, lastKind = null;

  function eligible(env) {
    const day = env.night < 0.5, dusk = env.night < 0.8, night = env.night > 0.45, dry = env.rain < 0.5;
    const list = [];
    if (day && dry) list.push(['rabbit', 3], ['birds', 2]);
    if (day && dry && env.season !== 'winter') list.push(['ducks', 2]);
    if (day) list.push(['deer', 2]);
    if (dusk && dry) list.push(['fox', 2.5]);
    if (night) list.push(['owl', 3]);
    if (night && dry && env.season !== 'winter') list.push(['hedgehog', 2.5]);
    const busy = new Set(actives.map((a) => a.kind));
    const free = list.filter(([k]) => !busy.has(k));
    const fresh = free.filter(([k]) => k !== lastKind);
    return fresh.length ? fresh : free;
  }

  function spawn(kind, env) {
    const v = VISITORS[kind](env);
    v.kind = kind;
    lastKind = kind;
    actives.push(v);
    scene.add(v.obj);
  }

  return {
    spawn,
    update(dt, time, env) {
      // Cat: slow breathing and a lazy tail.
      cat.body.scale.y = 1 + Math.sin(time * 1.6) * 0.04;
      cat.tail.rotation.y = Math.sin(time * 0.5) * 0.12 + (Math.sin(time * 0.13) > 0.9 ? Math.sin(time * 6) * 0.15 : 0);

      const warm = (env.season === 'spring' || env.season === 'summer') && env.night < 0.3 && env.rain < 0.3;
      butterflies.forEach((b, i) => {
        b.g.visible = warm;
        if (!warm) return;
        const t = time * 0.35 + b.ph;
        const x = b.home.x + Math.sin(t) * 3 + Math.sin(t * 2.3) * 0.8;
        const z = b.home.z + Math.cos(t * 0.8) * 2.5;
        b.g.position.set(x, ground(x, z) + 0.6 + Math.sin(t * 3.1) * 0.25, z);
        b.g.rotation.y = heading(Math.cos(t), -Math.sin(t * 0.8));
        const flap = Math.sin(time * 18 + i) * 0.9;
        for (const w of b.wings) w.w.rotation.x = w.side * flap;
      });

      for (let i = actives.length - 1; i >= 0; i--) {
        if (!actives[i].update(dt, time)) {
          scene.remove(actives[i].obj);
          actives.splice(i, 1);
          nextIn = Math.min(nextIn, 6 + Math.random() * 8);
        }
      }
      if (actives.length >= 2) return;
      nextIn -= dt;
      if (nextIn > 0) return;
      nextIn = 10 + Math.random() * 12;                     // gap before a second one may join
      const options = eligible(env);
      if (!options.length) { nextIn = 10; return; }
      let roll = Math.random() * options.reduce((s, [, w]) => s + w, 0);
      const kind = options.find(([, w]) => (roll -= w) < 0)[0];
      spawn(kind, env);
    },
  };
}
