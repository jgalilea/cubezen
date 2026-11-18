(() => {
  const $ = (sel) => document.querySelector(sel);
  // The 3D world loads after this script (from a CDN, and it takes a moment to build), and the
  // page has to work without it. Calls go to window.Scene once it exists; until then the world
  // reads the same saved settings itself when it starts.
  const Scene = new Proxy({}, { get: (_, fn) => (...args) => window.Scene?.[fn]?.(...args) });
  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem('cubezen.' + key); return v ? JSON.parse(v) : fallback; }
      catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem('cubezen.' + key, JSON.stringify(value)); } catch {}
    },
  };

  // ---------- toast & notifications ----------
  // A small note at the bottom of the screen; a system notification only when the page isn't in
  // front (and only if the user turned it on), silent because the chime already plays.
  const toastEl = $('#toast');
  let toastTimer = null;
  function toast(text) {
    toastEl.textContent = text;
    toastEl.hidden = false;
    requestAnimationFrame(() => toastEl.classList.add('show'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.classList.remove('show');
      toastTimer = setTimeout(() => { toastEl.hidden = true; }, 400);
    }, 5000);
  }

  function notify(text) {
    if (!pomo.notify || !('Notification' in window) || Notification.permission !== 'granted') return;
    if (!document.hidden && document.hasFocus()) return;
    const opts = { body: text, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'cubezen-timer', silent: true };
    const show = () => {
      try {
        const n = new Notification('Cubezen', opts);
        n.onclick = () => { window.focus(); n.close(); };
        setTimeout(() => n.close(), 8000);
      } catch {}
    };
    // Installed apps on mobile only allow notifications through the service worker.
    if (navigator.serviceWorker?.controller) navigator.serviceWorker.ready.then((r) => r.showNotification('Cubezen', opts)).catch(show);
    else show();
  }

  // ---------- player & mixer ----------
  const playBtn = $('#btn-play');
  function renderPlay() {
    const playing = Ambience.playing;
    playBtn.classList.toggle('playing', playing);
    playBtn.setAttribute('aria-label', playing ? 'Pause music' : 'Play music');
    syncMediaSession(playing);
  }
  function togglePlay() { Ambience.toggle(); renderPlay(); }
  playBtn.addEventListener('click', togglePlay);

  // ---------- media keys & system controls ----------
  // Play/pause keys, headphone buttons and the OS media panel / lock screen. Browsers only hand
  // those to a page that is playing a media element, and Web Audio doesn't count, so a silent
  // looping <audio> plays alongside the music (the sound itself still comes from Web Audio).
  const media = 'mediaSession' in navigator ? navigator.mediaSession : null;
  let silentEl = null;
  function silentWav(seconds = 10, rate = 8000) {
    const n = seconds * rate, buf = new ArrayBuffer(44 + n), v = new DataView(buf);
    const str = (o, t) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    str(0, 'RIFF'); v.setUint32(4, 36 + n, true); str(8, 'WAVEfmt '); v.setUint32(16, 16, true);
    v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate, true);
    v.setUint16(32, 1, true); v.setUint16(34, 8, true); str(36, 'data'); v.setUint32(40, n, true);
    new Uint8Array(buf, 44).fill(128);                   // 8-bit silence
    return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
  }
  function syncMediaSession(playing) {
    if (!media) return;
    if (playing) {
      if (!silentEl) { silentEl = new Audio(silentWav()); silentEl.loop = true; }
      silentEl.play().catch(() => {});
    } else silentEl?.pause();
    media.playbackState = playing ? 'playing' : 'paused';
  }
  function setTrack(name) {
    $('#track').textContent = `${name} · generative`;
    if (media && 'MediaMetadata' in window) {
      media.metadata = new MediaMetadata({
        title: name, artist: 'Cubezen', album: 'Generative piano',
        artwork: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }],
      });
    }
  }
  Ambience.onPiece(setTrack);
  if (media) {
    const handle = (action, fn) => { try { media.setActionHandler(action, fn); } catch {} };
    handle('play', () => { if (!Ambience.playing) togglePlay(); });
    handle('pause', () => { if (Ambience.playing) togglePlay(); });
    handle('stop', () => { if (Ambience.playing) togglePlay(); });
  }

  const KINDS = ['music', 'rain', 'fire'];
  const prefs = store.get('prefs', { music: 0.6, rain: 0, fire: 0.35 });
  function setVolume(kind, v, save = true) {
    const el = $('#vol-' + kind);
    el.value = v;
    prefs[kind] = Number(el.value);
    el.style.setProperty('--fill', prefs[kind] * 100 + '%');
    Ambience.setVolume(kind, prefs[kind]);
    if (kind === 'rain') Scene.setRain(prefs[kind]);
    if (kind === 'fire') Scene.setFire(prefs[kind]);
    if (save) store.set('prefs', prefs);
  }
  for (const kind of KINDS) {
    setVolume(kind, prefs[kind], false);
    $('#vol-' + kind).addEventListener('input', (e) => {
      Ambience.init();
      delete prefs.unmute;                       // moving a slider by hand ends a mute
      setVolume(kind, Number(e.target.value));
    });
  }

  // M: every slider to 0, and back to where they were.
  function toggleMute() {
    Ambience.init();
    if (prefs.unmute) {
      const back = prefs.unmute;
      delete prefs.unmute;
      KINDS.forEach((k) => setVolume(k, back[k]));
      toast('Sound on');
    } else {
      const before = Object.fromEntries(KINDS.map((k) => [k, prefs[k]]));
      if (KINDS.every((k) => !before[k])) return toast('Everything is already at 0');
      KINDS.forEach((k) => setVolume(k, 0, false));
      prefs.unmute = before;
      store.set('prefs', prefs);
      toast('Muted · press M to bring the sound back');
    }
  }

  // ---------- sleep timer ----------
  // Fades music, rain and fire out over a few seconds, then pauses the music and leaves the
  // sliders at 0. The end time is stored, so a reload doesn't cancel it.
  const SLEEP_STEPS = [0, 15, 30, 45, 60, 90];
  const sleepBtn = $('#btn-sleep');
  let sleepEnd = store.get('sleep', 0), fading = null;

  function renderSleep() {
    const left = sleepEnd ? Math.max(0, sleepEnd - Date.now()) : 0;
    const on = sleepEnd > 0;
    sleepBtn.classList.toggle('on', on);
    $('#sleep-label').textContent = !on ? 'Sleep' : left >= 60000 ? `${Math.ceil(left / 60000)}m` : `${Math.ceil(left / 1000)}s`;
    sleepBtn.setAttribute('aria-label', on ? `Sleep timer: sound off in ${Math.ceil(left / 60000)} minutes` : 'Sleep timer off');
  }

  function cycleSleep() {
    const mins = sleepEnd ? Math.round((sleepEnd - Date.now()) / 60000) : 0;
    const next = SLEEP_STEPS.find((s) => s > mins + 1) || 0;   // the next step up, or off
    sleepEnd = next ? Date.now() + next * 60000 : 0;
    store.set('sleep', sleepEnd);
    renderSleep();
    toast(next ? `Sound off in ${next} minutes` : 'Sleep timer off');
  }

  function sleepNow() {
    sleepEnd = 0;
    store.set('sleep', 0);
    renderSleep();
    const from = Object.fromEntries(KINDS.map((k) => [k, prefs[k]]));
    const start = performance.now(), FADE = 8000;
    clearInterval(fading);
    fading = setInterval(() => {
      const p = Math.min(1, (performance.now() - start) / FADE);
      KINDS.forEach((k) => setVolume(k, from[k] * (1 - p), false));
      if (p < 1) return;
      clearInterval(fading);
      if (Ambience.playing) Ambience.pause();
      renderPlay();
      delete prefs.unmute;
      store.set('prefs', prefs);
      toast('Good night · the sound is off');
    }, 100);
  }

  sleepBtn.addEventListener('click', cycleSleep);
  setInterval(() => {
    if (!sleepEnd) return;
    if (Date.now() >= sleepEnd) sleepNow(); else renderSleep();
  }, 1000);
  // Expired while the page was closed: just leave the sound off.
  if (sleepEnd && Date.now() >= sleepEnd) {
    sleepEnd = 0;
    store.set('sleep', 0);
    KINDS.forEach((k) => setVolume(k, 0, false));
    store.set('prefs', prefs);
  }
  renderSleep();

  // ---------- pomodoro ----------
  // Settings (minutes, auto-start, notifications) and the running timer are both stored, so a
  // reload picks up where it left off. A running timer is kept as its end time, not a countdown.
  const LABEL = { focus: 'Focus', short: 'Short break', long: 'Long break' };
  const pomo = Object.assign({ focus: 25, short: 5, long: 15, auto: false, notify: false }, store.get('pomo', {}));
  const DURATION = (m) => pomo[m] * 60;
  const todayKey = () => new Date().toDateString();
  let stats = store.get('stats', { day: todayKey(), count: 0 });
  if (stats.day !== todayKey()) stats = { day: todayKey(), count: 0 };

  const saved = store.get('timer', null);
  let mode = saved?.mode in LABEL ? saved.mode : 'focus';
  let remaining = saved ? saved.remaining : DURATION(mode);
  let endAt = saved?.running ? saved.endAt : 0;
  let running = false, timer = null;

  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  const saveTimer = () => store.set('timer', { mode, remaining, running, endAt });

  // A new day resets the count, also when the page was left open past midnight.
  function checkDay() {
    if (stats.day === todayKey()) return false;
    stats = { day: todayKey(), count: 0 };
    store.set('stats', stats);
    return true;
  }

  // Keep the screen on while the timer runs (tablets and laptops propped up beside you).
  // The browser drops the lock whenever the page is hidden; the next tick asks again.
  let wakeLock = null, wakePending = false;
  function syncWakeLock() {
    if (!('wakeLock' in navigator)) return;
    if (running && !wakeLock && !wakePending && !document.hidden) {
      wakePending = true;
      navigator.wakeLock.request('screen').then((lock) => {
        wakeLock = lock;
        lock.addEventListener('release', () => { wakeLock = null; });
        if (!running) { lock.release(); }
      }).catch(() => {}).finally(() => { wakePending = false; });
    } else if (!running && wakeLock) {
      wakeLock.release().catch(() => {});
      wakeLock = null;
    }
  }

  function renderPomodoro() {
    checkDay();
    syncWakeLock();
    $('#pomo-time').textContent = fmt(remaining);
    $('#pomo-peek').textContent = fmt(remaining);
    $('#pomo-start').textContent = running ? 'Pause' : 'Start';
    document.title = running ? `${fmt(remaining)} · ${LABEL[mode]} — Cubezen` : 'Cubezen — cozy blocky lofi';
    document.querySelectorAll('#pomodoro .tab[data-mode]').forEach((t) => t.classList.toggle('active', t.dataset.mode === mode));
    document.querySelectorAll('#pomodoro .tab[data-mode]').forEach((t) => { t.title = `${pomo[t.dataset.mode]} min`; });
    const inCycle = stats.count % 4 || (stats.count ? 4 : 0);
    $('#pomo-blocks').innerHTML = [0, 1, 2, 3].map((i) => `<span class="${i < inCycle ? 'on' : ''}"></span>`).join('');
    $('#pomo-count').textContent = `${stats.count} focus session${stats.count === 1 ? '' : 's'} today`;
  }

  function stop() {
    if (running) remaining = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
    running = false;
    endAt = 0;
    clearInterval(timer);
    saveTimer();
    renderPomodoro();
  }

  function setMode(m) { stop(); mode = m; remaining = DURATION(m); saveTimer(); renderPomodoro(); }

  // `quiet` is for catching up after a reload: no tick yet, the caller checks the time.
  function start(at = Date.now(), quiet = false) {
    if (!quiet) Ambience.init();
    if (remaining <= 0) remaining = DURATION(mode);
    running = true;
    endAt = at + remaining * 1000;
    clearInterval(timer);
    if (quiet) return;
    timer = setInterval(update, 250);
    update();
  }

  const nextMode = () => (mode === 'focus' ? (stats.count % 4 === 0 ? 'long' : 'short') : 'focus');

  // One phase is over. `away` means it ended while the page was closed: no chime, and with
  // auto-start the next phase is counted from when this one ended.
  function finish(away = false) {
    const ended = endAt || Date.now();
    if (mode === 'focus') {
      checkDay();
      stats.count++;
      store.set('stats', stats);
    }
    const done = LABEL[mode];
    clearInterval(timer);
    running = false;
    endAt = 0;
    mode = nextMode();
    remaining = DURATION(mode);
    const msg = `${done} done · ${pomo.auto ? 'starting' : 'next:'} ${LABEL[mode].toLowerCase()}`;
    if (!away) {
      Ambience.chime();
      toast(msg);
      notify(msg);
    }
    if (pomo.auto) start(away ? ended : Date.now(), away);
    else { saveTimer(); renderPomodoro(); }
  }

  function update() {
    remaining = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
    if (remaining > 0) { saveTimer(); return renderPomodoro(); }
    finish();
  }

  const toggleTimer = () => (running ? stop() : start());
  const resetTimer = () => setMode(mode);
  const skipPhase = () => { stop(); mode = nextMode(); remaining = DURATION(mode); saveTimer(); renderPomodoro(); toast(`Skipped to ${LABEL[mode].toLowerCase()}`); };

  $('#pomo-start').addEventListener('click', toggleTimer);
  $('#pomo-reset').addEventListener('click', resetTimer);
  document.querySelectorAll('#pomodoro .tab[data-mode]').forEach((t) => t.addEventListener('click', () => setMode(t.dataset.mode)));

  // Resume after a reload. If phases ended while the page was closed, catch up on them.
  if (endAt) {
    running = true;
    let missed = 0;
    while (missed < 50 && running && Date.now() >= endAt) { finish(true); missed++; }
    if (running) { timer = setInterval(update, 250); update(); }
    if (missed) toast(`Time was up while you were away · now: ${LABEL[mode].toLowerCase()}`);
  }
  renderPomodoro();
  setInterval(() => { if (checkDay()) renderPomodoro(); }, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) renderPomodoro(); });

  // Settings panel.
  const gear = $('#pomo-gear'), settings = $('#pomo-settings');
  const savePomo = () => store.set('pomo', pomo);
  function renderSettings() {
    for (const m of ['focus', 'short', 'long']) $('#set-' + m).value = pomo[m];
    $('#set-auto').checked = pomo.auto;
    $('#set-notify').checked = pomo.notify && 'Notification' in window && Notification.permission === 'granted';
    document.querySelectorAll('[data-preset]').forEach((b) => b.classList.toggle('active', b.dataset.preset === `${pomo.focus},${pomo.short},${pomo.long}`));
  }
  // New lengths apply right away to a phase that hasn't started; a running one keeps its time.
  function setLengths(next) {
    const fresh = !running && remaining === DURATION(mode);
    Object.assign(pomo, next);
    savePomo();
    if (fresh) { remaining = DURATION(mode); saveTimer(); }
    renderSettings();
    renderPomodoro();
  }
  gear.addEventListener('click', () => {
    settings.hidden = !settings.hidden;
    gear.setAttribute('aria-expanded', String(!settings.hidden));
    renderSettings();
  });
  document.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => {
    const [focus, short, long] = b.dataset.preset.split(',').map(Number);
    setLengths({ focus, short, long });
  }));
  for (const m of ['focus', 'short', 'long']) {
    const el = $('#set-' + m);
    el.addEventListener('change', () => {
      const v = Math.round(Number(el.value));
      if (!v || v < 1) return renderSettings();
      setLengths({ [m]: Math.min(Number(el.max), v) });
    });
  }
  $('#set-auto').addEventListener('change', (e) => { pomo.auto = e.target.checked; savePomo(); });
  $('#set-notify').addEventListener('change', async (e) => {
    if (!e.target.checked) { pomo.notify = false; return savePomo(); }
    if (!('Notification' in window)) { e.target.checked = false; return toast('This browser has no notifications'); }
    const perm = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
    pomo.notify = perm === 'granted';
    e.target.checked = pomo.notify;
    if (!pomo.notify) toast('Notifications are blocked for this site');
    savePomo();
  });

  // ---------- world: time of day & season ----------
  // v2 made Clock + Auto the default; older saves always stored the previous default (Cycle), so reset them once.
  let worldPrefs = store.get('world', null);
  if (!worldPrefs || worldPrefs.v !== 2) worldPrefs = { time: 'clock', season: 'auto', v: 2 };
  function renderWorld() {
    document.querySelectorAll('#time-tabs .tab').forEach((t) => t.classList.toggle('active', t.dataset.time === worldPrefs.time));
    document.querySelectorAll('#season-tabs .tab').forEach((t) => t.classList.toggle('active', t.dataset.season === worldPrefs.season));
    Scene.setTimeMode(worldPrefs.time);
    Scene.setSeason(worldPrefs.season);
    store.set('world', worldPrefs);
  }
  document.querySelectorAll('#time-tabs .tab').forEach((t) => t.addEventListener('click', () => { worldPrefs.time = t.dataset.time; renderWorld(); }));
  document.querySelectorAll('#season-tabs .tab').forEach((t) => t.addEventListener('click', () => { worldPrefs.season = t.dataset.season; renderWorld(); }));
  renderWorld();

  // ---------- tasks ----------
  // Double-click (or Enter on a focused task) to edit, drag the grip to reorder.
  let tasks = store.get('tasks', []);
  const list = $('#task-list');
  const clearBtn = $('#task-clear');

  function saveTasks() { store.set('tasks', tasks); renderTasks(); }

  function editTask(task, span) {
    const input = document.createElement('input');
    input.className = 'edit';
    input.value = task.text;
    input.maxLength = 80;
    input.setAttribute('aria-label', 'Edit task');
    span.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const commit = (keep) => {
      if (done) return;
      done = true;
      const text = input.value.trim();
      if (keep && text) task.text = text;
      saveTasks();
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') commit(true);
      else if (e.key === 'Escape') { e.stopPropagation(); commit(false); }
    });
    input.addEventListener('blur', () => commit(true));
  }

  // Listens on window: moving the row in the DOM would drop pointer capture on the grip.
  function dragTask(e, li) {
    e.preventDefault();
    li.classList.add('dragging');
    const move = (ev) => {
      for (const other of [...list.children]) {
        if (other === li) continue;
        const r = other.getBoundingClientRect();
        const mid = r.top + r.height / 2;
        const below = li.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING;
        if (below && ev.clientY > mid) other.after(li);
        else if (!below && ev.clientY < mid) { other.before(li); break; }
      }
    };
    const end = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', end);
      removeEventListener('pointercancel', end);
      li.classList.remove('dragging');
      const order = [...list.children].map((el) => Number(el.dataset.id));
      tasks.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
      saveTasks();
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', end);
    addEventListener('pointercancel', end);
  }

  function moveTask(task, by) {
    const i = tasks.indexOf(task), j = i + by;
    if (j < 0 || j >= tasks.length) return;
    [tasks[i], tasks[j]] = [tasks[j], tasks[i]];
    saveTasks();
    list.querySelector(`[data-id="${task.id}"] .grip`)?.focus();
  }

  function renderTasks() {
    list.innerHTML = '';
    const doneCount = tasks.filter((t) => t.done).length;
    clearBtn.hidden = !doneCount;
    clearBtn.textContent = `Clear done (${doneCount})`;
    if (!tasks.length) {
      list.innerHTML = '<li class="empty">Nothing yet. Add something cozy.</li>';
      return;
    }
    for (const task of tasks) {
      const li = document.createElement('li');
      li.dataset.id = task.id;
      li.classList.toggle('done', task.done);
      const grip = document.createElement('button');
      grip.className = 'grip';
      grip.setAttribute('aria-label', 'Reorder (drag, or use the arrow keys)');
      grip.title = 'Drag to reorder';
      grip.addEventListener('pointerdown', (e) => dragTask(e, li));
      grip.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); moveTask(task, e.key === 'ArrowUp' ? -1 : 1); }
      });
      const check = document.createElement('button');
      check.className = 'check';
      check.setAttribute('aria-label', task.done ? 'Mark as not done' : 'Mark as done');
      check.addEventListener('click', () => { task.done = !task.done; saveTasks(); });
      const text = document.createElement('span');
      text.textContent = task.text;
      text.title = 'Double-click to edit';
      text.tabIndex = 0;
      text.addEventListener('dblclick', () => editTask(task, text));
      text.addEventListener('keydown', (e) => { if (e.key === 'Enter') editTask(task, text); });
      const del = document.createElement('button');
      del.className = 'del';
      del.textContent = '×';
      del.setAttribute('aria-label', 'Delete task');
      del.addEventListener('click', () => { tasks = tasks.filter((t) => t !== task); saveTasks(); });
      li.append(grip, check, text, del);
      list.append(li);
    }
  }

  clearBtn.addEventListener('click', () => { tasks = tasks.filter((t) => !t.done); saveTasks(); });
  $('#task-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('#task-input');
    const text = input.value.trim();
    if (!text) return;
    tasks.push({ id: Math.max(Date.now(), ...tasks.map((t) => t.id + 1)), text, done: false });
    input.value = '';
    saveTasks();
  });
  renderTasks();

  // ---------- widgets: minimize / hide ----------
  // layout[id] is 'min', 'hidden' or missing (open).
  const WIDGETS = { pomodoro: 'Timer', world: 'World', tasks: 'Tasks', player: 'Music', brand: 'Title' };
  const layout = store.get('layout', {});
  const menu = $('#widget-menu');
  const menuBtn = $('#btn-widgets');

  function setLayout(id, state) {
    if (state) layout[id] = state; else delete layout[id];
    store.set('layout', layout);
    renderLayout();
  }

  function renderLayout() {
    for (const [id, name] of Object.entries(WIDGETS)) {
      const el = document.getElementById(id);
      const min = layout[id] === 'min';
      el.hidden = layout[id] === 'hidden';
      el.classList.toggle('min', min);
      const minBtn = el.querySelector('[data-act=min]');
      if (minBtn) {
        minBtn.textContent = min ? '+' : '−';
        minBtn.setAttribute('aria-label', `${min ? 'Expand' : 'Minimize'} ${name}`);
        minBtn.setAttribute('aria-expanded', String(!min));
      }
      menu.querySelector(`[data-widget=${id}]`).setAttribute('aria-pressed', String(!el.hidden));
    }
  }

  for (const [id, name] of Object.entries(WIDGETS)) {
    const item = document.createElement('button');
    item.className = 'menu-item';
    item.dataset.widget = id;
    item.innerHTML = '<span class="check"></span>';
    item.append(name);
    item.addEventListener('click', () => setLayout(id, layout[id] === 'hidden' ? null : 'hidden'));
    menu.append(item);

    const head = document.querySelector(`#${id} > .head`);
    if (!head) continue;
    const win = document.createElement('div');
    win.className = 'win';
    const minBtn = document.createElement('button');
    minBtn.dataset.act = 'min';
    minBtn.addEventListener('click', () => setLayout(id, layout[id] === 'min' ? null : 'min'));
    const hideBtn = document.createElement('button');
    hideBtn.textContent = '×';
    hideBtn.setAttribute('aria-label', `Hide ${name}`);
    hideBtn.title = 'Hide (bring it back from Widgets)';
    hideBtn.addEventListener('click', () => setLayout(id, 'hidden'));
    win.append(minBtn, hideBtn);
    head.append(win);
  }
  renderLayout();

  const toggleMenu = (open = menu.hidden) => {
    menu.hidden = !open;
    menuBtn.setAttribute('aria-expanded', String(open));
  };
  menuBtn.addEventListener('click', () => toggleMenu());

  // ---------- install (PWA) & offline ----------
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
  // The browser offers installing on its own; this adds the same thing to the Widgets menu.
  let installPrompt = null;
  const installItem = document.createElement('button');
  installItem.className = 'menu-item install';
  installItem.textContent = 'Install app';
  installItem.hidden = true;
  installItem.addEventListener('click', async () => {
    toggleMenu(false);
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice.catch(() => {});
    installPrompt = null;
    installItem.hidden = true;
  });
  menu.append(installItem);
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; installItem.hidden = false; });
  addEventListener('appinstalled', () => { installItem.hidden = true; toast('Cubezen is installed'); });

  // ---------- help ----------
  const help = $('#help'), helpBtn = $('#btn-help');
  const toggleHelp = (open = help.hidden) => {
    help.hidden = !open;
    helpBtn.setAttribute('aria-expanded', String(open));
  };
  helpBtn.addEventListener('click', () => toggleHelp());
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#widget-menu, #btn-widgets')) toggleMenu(false);
    if (!e.target.closest('#help, #btn-help')) toggleHelp(false);
  });

  // ---------- zen, fullscreen, shortcuts ----------
  const tools = $('.tools');
  const toggleZen = () => {
    const zen = document.body.classList.toggle('zen');
    // Go straight to the faded buttons even though the pointer is still on "Zen".
    document.body.classList.toggle('zen-fresh', zen);
    if (zen) { toggleMenu(false); toggleHelp(false); }
  };
  tools.addEventListener('pointerleave', () => document.body.classList.remove('zen-fresh'));
  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  };
  $('#btn-zen').addEventListener('click', toggleZen);
  $('#btn-fs').addEventListener('click', toggleFullscreen);

  const newTask = () => {
    if (layout.tasks) setLayout('tasks', null);   // bring the widget back if it was hidden or minimized
    document.body.classList.remove('zen');
    $('#task-input').focus();
  };

  const KEYS = {
    m: toggleMute, z: cycleSleep, s: toggleTimer, r: resetTimer, n: skipPhase, t: newTask,
    h: toggleZen, f: toggleFullscreen, '?': () => toggleHelp(),
  };
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { toggleMenu(false); toggleHelp(false); }
    if (e.target.closest('input, textarea') || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === 'Space' && !e.target.closest('button')) { e.preventDefault(); togglePlay(); return; }
    const act = KEYS[e.key.toLowerCase()];
    if (!act || e.repeat) return;
    e.preventDefault();
    act();
  });
})();
