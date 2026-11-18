// Synthesised piano + pad that perform Composer's pieces, plus ambient rain, campfire, and the
// sounds of each scene: nature in the valley (stream, birds, crickets) and the city (traffic, crowd).
// No audio files: every sound is generated live with the Web Audio API.
window.Ambience = (() => {
  let ctx = null, master, musicBus, musicOut, rainGain, fireGain, natureGain, cityGain, white, pianoWave;
  // Sources of the current play session; dropped on pause so nothing keeps sounding.
  let session = null;
  let playing = false, scheduler = null, nameTimer = null;
  const vol = { music: 0.6, rain: 0, fire: 0.35, nature: 0.3, city: 0.3 };
  const LEVEL = { music: 0.9, rain: 0.5, fire: 0.7, nature: 0.75, city: 0.85 };
  // Nature only sounds in the valley and city noise only in the city.
  let scene = 'valley';
  const SCENE_OF = { nature: 'valley', city: 'city' };
  const heard = (kind) => (SCENE_OF[kind] && SCENE_OF[kind] !== scene ? 0 : vol[kind]);
  const pieceListeners = [];
  const LOOKAHEAD = 1.2;

  // Current piece and its playback position.
  let piece = null, queue = [], qi = 0, pieceStart = 0, pieceEnd = 0;

  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

  // When nothing can be heard (music paused, rain and fire at 0) the audio engine is suspended
  // so the noise loops stop costing CPU; any sound wakes it up again.
  let restTimer = null;
  const silent = () => !playing && ['rain', 'fire', 'nature', 'city'].every((k) => heard(k) < 0.005);
  function rest(delay = 1500) {
    if (!ctx) return;
    clearTimeout(restTimer);
    if (!silent()) { if (ctx.state === 'suspended') ctx.resume(); return; }
    restTimer = setTimeout(() => { if (silent() && ctx.state === 'running') ctx.suspend(); }, delay);
  }

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); rest(); return; }
    ctx = new (window.AudioContext || window.webkitAudioContext)();

    master = ctx.createGain();
    master.gain.value = 0.8;
    // Gentle safety limiter only: a heavy compressor flattens the volume sliders.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -6;
    comp.knee.value = 6;
    comp.ratio.value = 4;
    master.connect(comp).connect(ctx.destination);

    // Play/pause gate after the reverb, so pausing also cuts the reverb tail.
    musicOut = ctx.createGain();
    musicOut.gain.value = 0;
    musicOut.connect(master);

    // Music bus → soft top-end → dry + large, dark hall reverb.
    musicBus = ctx.createGain();
    musicBus.gain.value = 0;                               // fades in to the slider value
    // A little more body in the lows (+3 dB below ~150 Hz), like a piano recorded up close.
    const warmth = ctx.createBiquadFilter();
    warmth.type = 'lowshelf';
    warmth.frequency.value = 150;
    warmth.gain.value = 3;
    const soft = ctx.createBiquadFilter();
    soft.type = 'lowpass';
    soft.frequency.value = 6500;
    musicBus.connect(warmth).connect(soft);
    const dry = ctx.createGain();
    dry.gain.value = 0.75;
    soft.connect(dry).connect(musicOut);
    const preDelay = ctx.createDelay(0.1);
    preDelay.delayTime.value = 0.03;
    const dark = ctx.createBiquadFilter();
    dark.type = 'lowpass';
    dark.frequency.value = 3800;
    const reverb = ctx.createConvolver();
    reverb.buffer = impulse(5, 3);
    const wet = ctx.createGain();
    wet.gain.value = 0.6;
    soft.connect(preDelay).connect(dark).connect(reverb).connect(wet).connect(musicOut);

    // Piano timbre: harmonics falling off with order; a lowpass then makes them decay.
    const harmonics = [0, 1, 0.55, 0.3, 0.2, 0.12, 0.08, 0.05, 0.035, 0.02];
    pianoWave = ctx.createPeriodicWave(new Float32Array(harmonics.length), new Float32Array(harmonics));

    white = noiseBuffer(4);

    // Rain: band-limited noise.
    rainGain = ctx.createGain();
    rainGain.gain.value = 0;
    const rainHp = ctx.createBiquadFilter();
    rainHp.type = 'highpass';
    rainHp.frequency.value = 450;
    const rainLp = ctx.createBiquadFilter();
    rainLp.type = 'lowpass';
    rainLp.frequency.value = 3200;
    loopNoise().connect(rainHp).connect(rainLp).connect(rainGain).connect(master);

    // Fire: low rumble + random crackles.
    fireGain = ctx.createGain();
    fireGain.gain.value = 0;
    const rumble = ctx.createBiquadFilter();
    rumble.type = 'lowpass';
    rumble.frequency.value = 220;
    const rumbleGain = ctx.createGain();
    rumbleGain.gain.value = 0.9;
    loopNoise().connect(rumble).connect(rumbleGain).connect(fireGain);
    fireGain.connect(master);
    crackle();

    natureGain = ctx.createGain();
    natureGain.gain.value = 0;
    natureGain.connect(master);
    cityGain = ctx.createGain();
    cityGain.gain.value = 0;
    cityGain.connect(master);
    buildNature();
    buildCity();

    for (const k of Object.keys(vol)) setVolume(k, vol[k]);
    rest();
  }

  function impulse(seconds, decay) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  // White noise loops seamlessly, so every texture is filtered white noise.
  function noiseBuffer(seconds) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  function loopNoise() {
    const src = ctx.createBufferSource();
    src.buffer = white;
    src.loop = true;
    src.loopStart = Math.random();
    src.start();
    return src;
  }

  function crackle() {
    if (vol.fire > 0.01 && ctx.state === 'running') {
      const t = ctx.currentTime;
      const pops = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < pops; i++) {
        const start = t + 0.01 + i * Math.random() * 0.05;
        const src = ctx.createBufferSource();
        src.buffer = white;
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 1500 + Math.random() * 3500;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.2 + Math.random() * 0.6, start);
        g.gain.exponentialRampToValueAtTime(0.001, start + 0.01 + Math.random() * 0.04);
        src.connect(hp).connect(g).connect(fireGain);
        src.start(start, Math.random() * 3, 0.08);
      }
    }
    setTimeout(crackle, 80 + Math.random() * 520);
  }

  // Start a source and, if it belongs to the music session, remember it for pause.
  function launch(src, t, stopAt, tracked) {
    src.start(t);
    src.stop(stopAt);
    if (tracked && session) {
      const set = session.sources;
      set.add(src);
      src.onended = () => set.delete(src);
    }
  }

  // Piano: rich tone + a slightly detuned second "string" + a felt hammer thump.
  function piano(midi, t, velocity, hold, dest) {
    const f = mtof(midi);
    const out = dest || session.input;
    const decay = clamp(11 - (midi - 30) * 0.14, 1.8, 10);   // low notes sustain longer
    const end = t + Math.min(hold, decay);
    const stopAt = end + 0.6;
    const peak = velocity * velocity * 1.2;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(peak, t + 0.005);
    env.gain.setTargetAtTime(0, t + 0.005, decay / 3.5);
    env.gain.setTargetAtTime(0, end, 0.12);                 // damper

    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.Q.value = 0.3;
    tone.frequency.setValueAtTime(Math.min(14000, f * (2.5 + velocity * 9)), t);
    tone.frequency.setTargetAtTime(Math.max(180, f * 1.3), t, decay / 4);

    const pan = ctx.createStereoPanner();
    pan.pan.value = clamp((midi - 62) / 40, -0.45, 0.45);
    env.connect(pan).connect(out);

    const string1 = ctx.createOscillator();
    string1.setPeriodicWave(pianoWave);
    string1.frequency.value = f;
    string1.detune.value = -1.2;
    const string2 = ctx.createOscillator();
    string2.frequency.value = f;
    string2.detune.value = 1.6;
    const string2Gain = ctx.createGain();
    string2Gain.gain.value = 0.45;
    string1.connect(tone);
    string2.connect(string2Gain).connect(tone);
    tone.connect(env);

    const hammer = ctx.createBufferSource();
    hammer.buffer = white;
    const hammerTone = ctx.createBiquadFilter();
    hammerTone.type = 'bandpass';
    hammerTone.frequency.value = Math.min(5000, f * 3);
    hammerTone.Q.value = 0.8;
    const hammerEnv = ctx.createGain();
    hammerEnv.gain.setValueAtTime(peak * 0.25, t);
    hammerEnv.gain.setTargetAtTime(0, t, 0.012);
    hammer.connect(hammerTone).connect(hammerEnv).connect(pan);

    const tracked = !dest;
    launch(string1, t, stopAt, tracked);
    launch(string2, t, stopAt, tracked);
    hammer.start(t, Math.random() * 3, 0.1);
  }

  // Pad: two detuned saws through a dark filter, slow swell and release.
  function pad(midi, t, velocity, dur) {
    const f = mtof(midi);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(velocity, t + 2.5);
    env.gain.setValueAtTime(velocity, t + dur);             // explicit hold before the release
    env.gain.setTargetAtTime(0, t + dur, 1);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 650;
    filter.Q.value = 0.4;
    filter.connect(env).connect(session.input);
    for (const detune of [-7, 7]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = detune;
      o.connect(filter);
      launch(o, t, t + dur + 5, true);
    }
  }

  // Sub bass: a sine (with a touch of triangle so small speakers still hint at it) that swells
  // in slowly, holds under the chord and fades, so it adds warmth without a thump or a beat.
  function sub(midi, t, level, dur) {
    const f = mtof(midi);
    const peak = 0.075 * level;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(peak, t + 0.8);
    env.gain.setValueAtTime(peak, t + Math.max(0.8, dur - 0.6));
    env.gain.linearRampToValueAtTime(0, t + dur + 0.9);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 220;
    lp.Q.value = 0.5;
    lp.connect(env).connect(session.input);
    const sine = ctx.createOscillator();
    sine.frequency.value = f;
    sine.connect(lp);
    const tri = ctx.createOscillator();
    tri.type = 'triangle';
    tri.frequency.value = f;
    const triGain = ctx.createGain();
    triGain.gain.value = 0.25;
    tri.connect(triGain).connect(lp);
    launch(sine, t, t + dur + 1, true);
    launch(tri, t, t + dur + 1, true);
  }

  function startPiece(at) {
    piece = Composer.compose();
    queue = piece.events;
    qi = 0;
    pieceStart = at;
    pieceEnd = at + piece.length + 4 + Math.random() * 8;  // a quiet gap between pieces
    const name = piece.name;
    clearTimeout(nameTimer);
    nameTimer = setTimeout(() => pieceListeners.forEach((cb) => cb(name)), Math.max(0, (at - ctx.currentTime) * 1000));
  }

  function tick() {
    const horizon = ctx.currentTime + LOOKAHEAD;
    for (;;) {
      if (qi >= queue.length) {
        if (pieceEnd > horizon) break;
        startPiece(pieceEnd);
        continue;
      }
      const e = queue[qi];
      const at = pieceStart + e.t;
      if (at > horizon) break;
      const when = Math.max(at, ctx.currentTime + 0.01);
      if (e.kind === 'pad') pad(e.midi, when, e.v, e.dur);
      else if (e.kind === 'sub') sub(e.midi, when, e.v, e.dur);
      else piano(e.midi, when, e.v, e.dur);
      qi++;
    }
  }

  function play() {
    init();
    if (playing) return;
    playing = true;
    session = { input: ctx.createGain(), sources: new Set() };
    session.input.connect(musicBus);
    musicOut.gain.cancelScheduledValues(ctx.currentTime);
    musicOut.gain.setTargetAtTime(1, ctx.currentTime, 0.02);
    startPiece(ctx.currentTime + 0.15);
    tick();
    scheduler = setInterval(tick, 250);
  }

  function pause() {
    if (!playing) return;
    playing = false;
    clearInterval(scheduler);
    clearTimeout(nameTimer);
    // Quick fade (~150ms) instead of letting already-scheduled notes ring out.
    const old = session;
    session = null;
    musicOut.gain.cancelScheduledValues(ctx.currentTime);
    musicOut.gain.setTargetAtTime(0, ctx.currentTime, 0.04);
    old.input.gain.setTargetAtTime(0, ctx.currentTime, 0.04);
    setTimeout(() => {
      old.sources.forEach((s) => { try { s.stop(); } catch {} });
      old.input.disconnect();
    }, 300);
    rest();
  }

  function setVolume(kind, value) {
    vol[kind] = value;
    if (!ctx) return;
    const node = { music: musicBus, rain: rainGain, fire: fireGain, nature: natureGain, city: cityGain }[kind];
    const v = heard(kind);
    node.gain.setTargetAtTime(v * v * LEVEL[kind], ctx.currentTime, 0.03);
    rest();
  }

  // Switching scenes crossfades their ambiences over a couple of seconds.
  function setScene(name) {
    scene = name;
    if (!ctx) return;
    for (const [kind, node] of [['nature', natureGain], ['city', cityGain]]) {
      const v = heard(kind);
      node.gain.setTargetAtTime(v * v * LEVEL[kind], ctx.currentTime, 0.6);
    }
    rest();
  }

  // ---------- scene ambiences ----------
  // The world tells us the time of day and the weather through window.Scene.
  const world = () => window.Scene?.state ?? { t: 0.5, rain: 0 };
  const isNight = () => { const t = world().t; return t < 0.23 || t > 0.79; };
  const live = (kind) => ctx && ctx.state === 'running' && heard(kind) > 0.01;
  const rnd = (a, b) => a + Math.random() * (b - a);
  // A short sine note sliding between frequencies, panned and shaped; the basis of every call.
  function tone(out, t, dur, f0, f1, gain, pan = 0, type = 'sine') {
    const o = ctx.createOscillator(), g = ctx.createGain(), p = ctx.createStereoPanner();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.02, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    p.pan.value = pan;
    o.connect(g).connect(p).connect(out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  function noiseBurst(out, t, dur, filters, env, pan = 0) {
    const src = ctx.createBufferSource();
    src.buffer = white;
    let node = src;
    for (const f of filters) node = node.connect(f);
    const g = ctx.createGain(), p = ctx.createStereoPanner();
    env(g.gain, p.pan);
    if (typeof pan === 'number') p.pan.value = pan;
    node.connect(g).connect(p).connect(out);
    src.start(t, Math.random() * 3, dur + 0.1);
  }
  const filter = (type, f, q = 1) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };

  function buildNature() {
    // The stream: a soft wash plus two gurgling bands whose pitch wanders every few ms.
    const wash = ctx.createGain();
    wash.gain.value = 0.35;
    loopNoise().connect(filter('bandpass', 900, 0.6)).connect(wash).connect(natureGain);
    const gurgles = [[700, 1600], [1400, 3200]].map(([lo, hi], i) => {
      const bp = filter('bandpass', lo, 7), g = ctx.createGain(), p = ctx.createStereoPanner();
      g.gain.value = 0.5;
      p.pan.value = i ? 0.35 : -0.25;
      loopNoise().connect(bp).connect(g).connect(p).connect(natureGain);
      return { bp, g, lo, hi };
    });
    (function babble() {
      if (live('nature')) {
        const t = ctx.currentTime;
        for (const b of gurgles) {
          b.bp.frequency.setTargetAtTime(rnd(b.lo, b.hi), t, 0.03);
          b.g.gain.setTargetAtTime(rnd(0.15, 0.7), t, 0.04);
        }
      }
      setTimeout(babble, 50 + Math.random() * 70);
    })();
    // Birds by day (a few more at dawn, fewer in the rain); crickets and now and then an owl at night.
    (function birds() {
      let wait = 1500;
      if (live('nature')) {
        const t = ctx.currentTime + 0.05, { t: day, rain = 0 } = world();
        if (!isNight()) {
          const dawn = day > 0.24 && day < 0.36 ? 2 : 1;
          if (Math.random() < 0.7 * (1 - rain * 0.85)) birdCall(t, rnd(-0.8, 0.8), rnd(0.03, 0.12));
          wait = rnd(900, 4500) / dawn;
        } else {
          if (Math.random() < 0.04) owl(t, rnd(-0.6, 0.6));
          wait = 2000;
        }
      }
      setTimeout(birds, wait);
    })();
    function birdCall(t, pan, g) {
      const kind = Math.floor(Math.random() * 3), f = rnd(2400, 4600);
      if (kind === 0) {                                    // a few quick tweets
        const n = 2 + Math.floor(Math.random() * 5);
        for (let i = 0; i < n; i++) tone(natureGain, t + i * rnd(0.11, 0.16), rnd(0.05, 0.09), f * rnd(0.9, 1.05), f * rnd(1.15, 1.4), g, pan);
      } else if (kind === 1) {                             // a trill
        const n = 10 + Math.floor(Math.random() * 10);
        for (let i = 0; i < n; i++) tone(natureGain, t + i * 0.035, 0.028, f * (1 - i * 0.01), f * (1 - i * 0.01) * 1.08, g * 0.8, pan);
      } else {                                             // a two-note whistle
        const a = rnd(1700, 2300);
        tone(natureGain, t, 0.24, a, a * 1.3, g, pan);
        tone(natureGain, t + 0.3, 0.3, a * 1.25, a * 0.9, g, pan);
      }
    }
    function owl(t, pan) {
      for (const [d, f] of [[0, 380], [0.55, 360], [0.8, 360]]) tone(natureGain, t + d, 0.35, f, f * 0.92, 0.12, pan);
    }
    const crickets = [0, 1, 2].map(() => ({ f: rnd(4200, 4900), pan: rnd(-0.9, 0.9), every: rnd(0.45, 0.9), next: 0 }));
    (function chirp() {
      if (live('nature') && isNight()) {
        const t = ctx.currentTime;
        for (const c of crickets) {
          if (c.next > t + 0.3) continue;
          const start = Math.max(t + 0.02, c.next);
          for (let i = 0; i < 3; i++) tone(natureGain, start + i * 0.032, 0.018, c.f, c.f * 0.98, 0.035, c.pan);
          c.next = start + c.every * rnd(0.85, 1.15);
        }
      }
      setTimeout(chirp, 150);
    })();
  }

  function buildCity() {
    // The far-off roar of a big city, always there.
    const hum = ctx.createGain();
    hum.gain.value = 0.9;
    loopNoise().connect(filter('lowpass', 160)).connect(hum).connect(cityGain);
    const hiss = ctx.createGain();
    hiss.gain.value = 0.08;
    loopNoise().connect(filter('bandpass', 700, 0.5)).connect(hiss).connect(cityGain);
    // A crowd: a handful of murmuring voices, band-passed noise that rises and falls like speech.
    const voices = [0, 1, 2, 3, 4].map((i) => {
      const bp = filter('bandpass', rnd(350, 800), 5), g = ctx.createGain(), p = ctx.createStereoPanner();
      g.gain.value = 0;
      p.pan.value = -0.8 + i * 0.4;
      loopNoise().connect(bp).connect(g).connect(p).connect(cityGain);
      return { bp, g };
    });
    (function murmur() {
      if (live('city')) {
        const t = ctx.currentTime;
        for (const v of voices) {
          const talking = Math.random() < 0.6;
          v.g.gain.setTargetAtTime(talking ? rnd(0.08, 0.3) : 0, t, 0.05);
          v.bp.frequency.setTargetAtTime(rnd(300, 900), t, 0.08);
        }
      }
      setTimeout(murmur, 110 + Math.random() * 200);
    })();
    // Cars going by, left to right or right to left; on wet roads with a hiss of spray.
    (function pass() {
      if (live('city')) {
        const t = ctx.currentTime + 0.05, dur = rnd(2.2, 4), dir = Math.random() < 0.5 ? -1 : 1, wet = world().rain ?? 0, loud = rnd(0.25, 0.6);
        const env = (gain, pan) => {
          gain.setValueAtTime(0.0001, t);
          gain.exponentialRampToValueAtTime(loud, t + dur * 0.5);
          gain.exponentialRampToValueAtTime(0.0001, t + dur);
          pan.setValueAtTime(-0.85 * dir, t);
          pan.linearRampToValueAtTime(0.85 * dir, t + dur);
        };
        const bp = filter('bandpass', 260, 1.2);
        bp.frequency.setValueAtTime(220, t);
        bp.frequency.linearRampToValueAtTime(520, t + dur * 0.5);
        bp.frequency.linearRampToValueAtTime(240, t + dur);
        noiseBurst(cityGain, t, dur, [bp], env, null);
        if (wet > 0.1) noiseBurst(cityGain, t, dur, [filter('bandpass', 3500, 0.7)], (g, p) => {
          g.setValueAtTime(0.0001, t);
          g.exponentialRampToValueAtTime(loud * wet * 0.5, t + dur * 0.5);
          g.exponentialRampToValueAtTime(0.0001, t + dur);
          p.setValueAtTime(-0.85 * dir, t);
          p.linearRampToValueAtTime(0.85 * dir, t + dur);
        }, null);
      }
      setTimeout(pass, rnd(1800, 6500));
    })();
    // Now and then: a bicycle bell or a polite little horn somewhere down the street.
    (function now() {
      if (live('city')) {
        const t = ctx.currentTime + 0.05, pan = rnd(-0.7, 0.7);
        if (Math.random() < 0.6) for (const d of [0, 0.16]) tone(cityGain, t + d, 0.6, 2650, 2600, 0.05, pan);
        else {
          const g = ctx.createGain(), lp = filter('lowpass', 1400), p = ctx.createStereoPanner();
          p.pan.value = pan;
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.035, t + 0.02);
          g.gain.setValueAtTime(0.035, t + 0.22);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
          g.connect(lp).connect(p).connect(cityGain);
          for (const f of [415, 520]) { const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f; o.connect(g); o.start(t); o.stop(t + 0.32); }
        }
      }
      setTimeout(now, rnd(20000, 55000));
    })();
  }

  // Events from the city: the train crossing the bridge, the crossing's walk signal.
  let crossingTimer = null;
  addEventListener('cubezen:city', (e) => {
    const d = e.detail;
    if (d.type === 'crossing') {
      clearInterval(crossingTimer);
      if (!d.on) return;
      // The walk signal's cheerful two-note chirp, repeated while people may cross.
      crossingTimer = setInterval(() => {
        if (!live('city')) return;
        const t = ctx.currentTime + 0.02;
        tone(cityGain, t, 0.09, 2900, 2200, 0.05, -0.2);
        tone(cityGain, t + 0.16, 0.12, 2200, 2800, 0.04, -0.2);
      }, 1100);
    } else if (d.type === 'train' && live('city')) {
      // A rumble that swells and fades as the train goes by, the rolling noise of the wheels,
      // the clack-clack of the rail joints and the electric motors' whine.
      const t = ctx.currentTime + 0.05, dur = d.duration, dir = d.dir;
      const swell = (peak) => (g, p) => {
        g.setValueAtTime(0.0001, t);
        g.exponentialRampToValueAtTime(peak, t + dur * 0.35);
        g.setValueAtTime(peak, t + dur * 0.65);
        g.exponentialRampToValueAtTime(0.0001, t + dur);
        if (p) { p.setValueAtTime(-0.7 * dir, t); p.linearRampToValueAtTime(0.7 * dir, t + dur); }
      };
      noiseBurst(cityGain, t, dur, [filter('lowpass', 260)], swell(2.6), null);
      noiseBurst(cityGain, t, dur, [filter('bandpass', 650, 0.8)], swell(0.45), null);
      for (let c = 0.3; c < dur - 0.3; c += 0.9) {
        const k = Math.sin(Math.PI * c / dur) ** 2;
        for (const off of [0, 0.13]) noiseBurst(cityGain, t + c + off, 0.08, [filter('bandpass', 320, 1.5)], (g) => {
          g.setValueAtTime(0.0001, t + c + off);
          g.exponentialRampToValueAtTime(2.2 * k + 0.001, t + c + off + 0.006);
          g.exponentialRampToValueAtTime(0.0001, t + c + off + 0.08);
        }, (c / dur - 0.5) * 1.2 * dir);
      }
      const whine = ctx.createGain(), wp = ctx.createStereoPanner();
      swell(0.05)(whine.gain, wp.pan);
      whine.connect(wp).connect(cityGain);
      for (const [f, a] of [[290, 1], [580, 0.5], [870, 0.25]]) {
        const o = ctx.createOscillator(), og = ctx.createGain();
        o.frequency.value = f;
        og.gain.value = a;
        o.connect(og).connect(whine);
        o.start(t);
        o.stop(t + dur + 0.1);
      }
    }
  });

  function chime() {
    init();
    const t = ctx.currentTime + 0.05;
    [72, 76, 79, 84].forEach((m, i) => piano(m, t + i * 0.18, 0.7, 3, master));
    rest(6000);                                          // let the chime ring out first
  }

  return {
    init,
    play,
    pause,
    toggle() { playing ? pause() : play(); return playing; },
    get playing() { return playing; },
    get state() { return ctx ? ctx.state : 'off'; },   // 'running' or 'suspended' once started
    setVolume,
    setScene,
    chime,
    onPiece(cb) { pieceListeners.push(cb); },
  };
})();
