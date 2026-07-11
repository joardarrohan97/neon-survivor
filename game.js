/* =========================================================
   NEON SURVIVOR — Phase 2
   Top-down cyberpunk survival shooter (HTML5 Canvas)
   ========================================================= */
(() => {
  'use strict';

  // ---------- Canvas & context ----------
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  let W = 0, H = 0, DPR = Math.min(window.devicePixelRatio || 1, 2);

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W * DPR;
    canvas.height = H * DPR;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------- Utility ----------
  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
  const TAU = Math.PI * 2;

  // ---------- Game states ----------
  const STATE = { MENU: 'menu', PLAY: 'play', PAUSE: 'pause', OVER: 'over', HOW: 'how', LEVELUP: 'levelup' };
  let state = STATE.MENU;

  // ---------- DOM ----------
  const el = {
    hud: document.getElementById('hud'),
    menu: document.getElementById('menu'),
    how: document.getElementById('how'),
    pause: document.getElementById('pause'),
    gameover: document.getElementById('gameover'),
    levelup: document.getElementById('levelup'),
    hpBar: document.getElementById('hp-bar'),
    hpText: document.getElementById('hp-text'),
    waveNum: document.getElementById('wave-num'),
    waveTimer: document.getElementById('wave-timer'),
    scoreValue: document.getElementById('score-value'),
    killsValue: document.getElementById('kills-value'),
    multValue: document.getElementById('mult-value'),
    ammoCur: document.getElementById('ammo-cur'),
    bestScore: document.getElementById('best-score'),
    goScore: document.getElementById('go-score'),
    goWave: document.getElementById('go-wave'),
    goLevel: document.getElementById('go-level'),
    goKills: document.getElementById('go-kills'),
    goBest: document.getElementById('go-best'),
    lvlNum: document.getElementById('lvl-num'),
    xpBar: document.getElementById('xp-bar'),
    dashBar: document.getElementById('dash-bar'),
    dashText: document.getElementById('dash-text'),
    upgradeCards: document.getElementById('upgrade-cards'),
    bossBarWrap: document.getElementById('boss-bar-wrap'),
    bossBar: document.getElementById('boss-bar'),
    bossName: document.getElementById('boss-name'),
    muteBtn: document.getElementById('mute-btn'),
    muteIcon: document.getElementById('mute-icon'),
    damageVignette: document.getElementById('damage-vignette'),
  };

  // wave announcement element (created dynamically inside wrap)
  const waveAnnounce = document.createElement('div');
  waveAnnounce.id = 'wave-announce';
  document.getElementById('game-wrap').appendChild(waveAnnounce);

  // ---------- Input ----------
  const keys = {};
  const mouse = { x: W / 2, y: H / 2, down: false };

  window.addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    keys[k] = true;
    unlockAudio();
    if (k === ' ' || k === 'arrowup' || k === 'arrowdown' || k === 'arrowleft' || k === 'arrowright') {
      e.preventDefault();
    }
    if (k === 'm') { toggleMute(); return; }
    if ((k === 'p' || k === 'escape') && (state === STATE.PLAY || state === STATE.PAUSE)) {
      togglePause();
    }
    if (k === ' ' && state === STATE.PLAY) tryDash();
    // level-up keyboard selection
    if (state === STATE.LEVELUP && (k === '1' || k === '2' || k === '3')) {
      const idx = parseInt(k, 10) - 1;
      if (currentCards[idx]) chooseUpgrade(currentCards[idx]);
    }
  });
  window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

  // Create/resume the AudioContext only after a genuine user interaction
  let audioUnlocked = false;
  function unlockAudio() {
    if (audioUnlocked) { AudioManager.resume(); return; }
    audioUnlocked = true;
    AudioManager.init();
    AudioManager.resume();
    refreshMuteButton();
  }

  canvas.addEventListener('mousemove', e => {
    const r = canvas.getBoundingClientRect();
    mouse.x = e.clientX - r.left;
    mouse.y = e.clientY - r.top;
  });
  canvas.addEventListener('mousedown', e => { if (e.button === 0) { unlockAudio(); mouse.down = true; } });
  window.addEventListener('mouseup', () => { mouse.down = false; });
  // touch (basic)
  canvas.addEventListener('touchstart', e => {
    unlockAudio();
    const r = canvas.getBoundingClientRect();
    const t = e.touches[0];
    mouse.x = t.clientX - r.left; mouse.y = t.clientY - r.top; mouse.down = true;
  }, { passive: true });
  canvas.addEventListener('touchmove', e => {
    const r = canvas.getBoundingClientRect();
    const t = e.touches[0];
    mouse.x = t.clientX - r.left; mouse.y = t.clientY - r.top;
  }, { passive: true });
  canvas.addEventListener('touchend', () => { mouse.down = false; }, { passive: true });

  // ---------- Persistent best score ----------
  let best = parseInt(localStorage.getItem('neon_best') || '0', 10) || 0;
  el.bestScore.textContent = best;

  // ---------- Audio Manager (Web Audio API, no external files) ----------
  const AudioManager = (() => {
    let actx = null;
    let master = null;
    let muted = localStorage.getItem('neon_muted') === '1';
    const lastPlay = Object.create(null); // throttle per sound name

    function init() {
      if (actx) return;
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        actx = new AC();
        master = actx.createGain();
        master.gain.value = muted ? 0 : 0.6;
        master.connect(actx.destination);
      } catch (err) {
        actx = null;
      }
    }

    function resume() {
      if (actx && actx.state === 'suspended') actx.resume();
    }

    // Generic tone with envelope + optional pitch sweep + filter
    function tone(opts) {
      if (!actx || muted) return;
      const now = actx.currentTime;
      const {
        type = 'sine', freq = 440, freqEnd = null,
        dur = 0.15, vol = 0.3, attack = 0.005,
        filterType = null, filterFreq = 800, filterQ = 1,
      } = opts;
      const osc = actx.createOscillator();
      const g = actx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      if (freqEnd !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), now + dur);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(vol, now + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      let node = osc;
      if (filterType) {
        const flt = actx.createBiquadFilter();
        flt.type = filterType;
        flt.frequency.value = filterFreq;
        flt.Q.value = filterQ;
        osc.connect(flt);
        flt.connect(g);
      } else {
        osc.connect(g);
      }
      g.connect(master);
      osc.start(now);
      osc.stop(now + dur + 0.02);
    }

    // Short filtered-noise burst (for explosions / hits)
    function noise(opts) {
      if (!actx || muted) return;
      const now = actx.currentTime;
      const { dur = 0.25, vol = 0.3, filterFreq = 1200, filterType = 'lowpass', sweepTo = null, filterQ = 1 } = opts;
      const len = Math.max(1, Math.floor(actx.sampleRate * dur));
      const buffer = actx.createBuffer(1, len, actx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = actx.createBufferSource();
      src.buffer = buffer;
      const flt = actx.createBiquadFilter();
      flt.type = filterType;
      flt.frequency.setValueAtTime(filterFreq, now);
      flt.Q.value = filterQ;
      if (sweepTo !== null) flt.frequency.exponentialRampToValueAtTime(Math.max(1, sweepTo), now + dur);
      const g = actx.createGain();
      g.gain.setValueAtTime(vol, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      src.connect(flt); flt.connect(g); g.connect(master);
      src.start(now);
      src.stop(now + dur + 0.02);
    }

    // sound definitions
    const SFX = {
      shoot() { tone({ type: 'square', freq: 720, freqEnd: 240, dur: 0.09, vol: 0.14, filterType: 'lowpass', filterFreq: 1600 }); },
      hit()   { tone({ type: 'triangle', freq: 900, freqEnd: 500, dur: 0.06, vol: 0.16 }); },
      death() { tone({ type: 'sawtooth', freq: 380, freqEnd: 90, dur: 0.22, vol: 0.2, filterType: 'lowpass', filterFreq: 1400 }); noise({ dur: 0.2, vol: 0.14, filterFreq: 1800, sweepTo: 300 }); },
      tankDeath() { tone({ type: 'sawtooth', freq: 200, freqEnd: 50, dur: 0.5, vol: 0.28, filterType: 'lowpass', filterFreq: 900 }); noise({ dur: 0.45, vol: 0.26, filterFreq: 1400, sweepTo: 120 }); },
      hurt()  { tone({ type: 'sawtooth', freq: 320, freqEnd: 70, dur: 0.3, vol: 0.26, filterType: 'lowpass', filterFreq: 700 }); },
      dash()  { tone({ type: 'sine', freq: 240, freqEnd: 760, dur: 0.2, vol: 0.2 }); noise({ dur: 0.16, vol: 0.1, filterFreq: 2600, sweepTo: 600 }); },
      xp()    { tone({ type: 'sine', freq: 880, freqEnd: 1320, dur: 0.08, vol: 0.1 }); },
      levelUp() { tone({ type: 'triangle', freq: 523, dur: 0.14, vol: 0.2 }); tone({ type: 'triangle', freq: 784, dur: 0.18, vol: 0.2 }); tone({ type: 'triangle', freq: 1046, dur: 0.24, vol: 0.2 }); },
      upgrade() { tone({ type: 'square', freq: 660, freqEnd: 990, dur: 0.16, vol: 0.18, filterType: 'lowpass', filterFreq: 2200 }); },
      waveStart() { tone({ type: 'sawtooth', freq: 130, freqEnd: 260, dur: 0.4, vol: 0.2, filterType: 'lowpass', filterFreq: 1200 }); },
      gameOver() { tone({ type: 'sawtooth', freq: 440, freqEnd: 60, dur: 1.1, vol: 0.28, filterType: 'lowpass', filterFreq: 1000 }); },
      hover() { tone({ type: 'sine', freq: 620, dur: 0.05, vol: 0.06 }); },
      click() { tone({ type: 'square', freq: 480, freqEnd: 720, dur: 0.08, vol: 0.14 }); },
      bossRadial() { tone({ type: 'square', freq: 300, freqEnd: 160, dur: 0.18, vol: 0.16, filterType: 'lowpass', filterFreq: 1400 }); },
      bossCharge() { tone({ type: 'sawtooth', freq: 90, freqEnd: 260, dur: 0.5, vol: 0.22, filterType: 'lowpass', filterFreq: 800 }); },
      bossDeath() { tone({ type: 'sawtooth', freq: 260, freqEnd: 40, dur: 1.0, vol: 0.32, filterType: 'lowpass', filterFreq: 900 }); noise({ dur: 0.9, vol: 0.3, filterFreq: 1600, sweepTo: 100 }); },
      bossSpawn() { tone({ type: 'sawtooth', freq: 70, freqEnd: 180, dur: 0.7, vol: 0.26, filterType: 'lowpass', filterFreq: 700 }); },
      threat() { tone({ type: 'sawtooth', freq: 160, freqEnd: 80, dur: 0.6, vol: 0.24, filterType: 'lowpass', filterFreq: 900 }); },
    };

    // Minimum interval (seconds) between repeats of the same sound to avoid overlap spam
    const MIN_INTERVAL = {
      shoot: 0.045, hit: 0.03, xp: 0.04, death: 0.04,
    };

    function play(name) {
      if (muted || !actx) return;
      const fn = SFX[name];
      if (!fn) return;
      const now = actx.currentTime;
      const gap = MIN_INTERVAL[name];
      if (gap !== undefined) {
        if (lastPlay[name] !== undefined && now - lastPlay[name] < gap) return;
        lastPlay[name] = now;
      }
      fn();
    }

    function applyMute() {
      if (master && actx) master.gain.setValueAtTime(muted ? 0 : 0.6, actx.currentTime);
    }

    function setMuted(m) {
      muted = m;
      localStorage.setItem('neon_muted', muted ? '1' : '0');
      applyMute();
    }

    function toggle() { setMuted(!muted); return muted; }
    function isMuted() { return muted; }

    return { init, resume, play, setMuted, toggle, isMuted };
  })();

  // ---------- Entities ----------
  let player, bullets, enemies, particles, pickups, xpOrbs, floaters;
  let enemyBullets, warnings, trails, boss;
  let score, kills, wave, multiplier, multTimer;
  let waveState, waveTimer, spawnQueue, spawnTimer, enemiesToSpawn, aliveTarget;
  let shootCooldown, screenShake, camShakeX, camShakeY, flash;
  let arenaPulse, damagePulse;
  let stars = [];

  // ---------- Camera ----------
  const camera = { x: 0, y: 0, targetX: 0, targetY: 0, zoom: 1, targetZoom: 1 };
  const BASE_ZOOM = 1.14;
  // world-space mouse (derived from screen coords + camera each frame)
  const mouseWorld = { x: 0, y: 0 };

  function screenToWorld(sx, sy) {
    return {
      x: (sx - W / 2) / camera.zoom + camera.x,
      y: (sy - H / 2) / camera.zoom + camera.y,
    };
  }

  // Add screen shake with a hard cap so gameplay stays comfortable
  function addShake(amount, cap) {
    screenShake = Math.min(screenShake + amount, cap || 16);
  }

  function updateCamera(dt) {
    const halfW = W / (2 * camera.zoom);
    const halfH = H / (2 * camera.zoom);
    // subtle look-ahead toward the mouse (screen-relative, camera-independent)
    const laX = (mouse.x - W / 2) * 0.14;
    const laY = (mouse.y - H / 2) * 0.14;
    camera.targetX = player.x + laX;
    camera.targetY = player.y + laY;
    // keep the view inside the arena bounds
    camera.targetX = clamp(camera.targetX, halfW, W - halfW);
    camera.targetY = clamp(camera.targetY, halfH, H - halfH);
    // smooth follow (frame-rate independent)
    const kPos = 1 - Math.pow(0.0009, dt);
    camera.x += (camera.targetX - camera.x) * kPos;
    camera.y += (camera.targetY - camera.y) * kPos;
    // zoom drifts back to its target
    const kZoom = 1 - Math.pow(0.02, dt);
    camera.zoom += (camera.targetZoom - camera.zoom) * kZoom;
  }

  let vignetteOn = false;
  function showDamageVignette(strength) {
    el.damageVignette.style.opacity = String(clamp(strength, 0, 0.85));
    vignetteOn = true;
  }
  function hideDamageVignette() {
    el.damageVignette.style.opacity = '0';
    vignetteOn = false;
  }


  function initStarfield() {
    stars = [];
    for (let i = 0; i < 90; i++) {
      stars.push({ x: rand(0, W), y: rand(0, H), z: rand(0.2, 1), s: rand(0.4, 1.8) });
    }
  }

  const computeXpToNext = (lvl) => Math.round(6 + (lvl - 1) * 5);

  function resetGame() {
    player = {
      x: W / 2, y: H / 2, r: 15, speed: 280,
      hp: 110, maxHp: 110, angle: 0,
      invuln: 0, dashTrail: [],
      level: 1, xp: 0, xpToNext: computeXpToNext(1),
      dmgMult: 1, fireRateMult: 1, speedMult: 1, projSpeedMult: 1, multishot: 1,
      upgradeStacks: {},
      dashCd: 0, dashMax: 1.4, dashing: 0, dashDir: { x: 1, y: 0 },
    };
    bullets = [];
    enemies = [];
    particles = [];
    pickups = [];
    xpOrbs = [];
    floaters = [];
    enemyBullets = [];
    warnings = [];
    trails = [];
    boss = null;
    score = 0; kills = 0; wave = 0;
    multiplier = 1; multTimer = 0;
    shootCooldown = 0;
    screenShake = 0; camShakeX = 0; camShakeY = 0; flash = 0;
    arenaPulse = 0; damagePulse = 0;
    // camera starts centered on player
    camera.x = camera.targetX = player.x;
    camera.y = camera.targetY = player.y;
    camera.zoom = camera.targetZoom = BASE_ZOOM;
    mouseWorld.x = player.x; mouseWorld.y = player.y;
    el.bossBarWrap.classList.add('hidden');
    hideDamageVignette();
    waveState = 'intermission';
    waveTimer = 1.4;
    initStarfield();
    startNextWave();
  }

  // ---------- Weapon ----------
  const WEAPON = { name: 'PULSE SMG', fireRate: 0.11, spread: 0.05, speed: 720, dmg: 24, life: 0.9, r: 4 };
  const effFireRate = () => WEAPON.fireRate / player.fireRateMult;
  const effDmg = () => WEAPON.dmg * player.dmgMult;
  const effProjSpeed = () => WEAPON.speed * player.projSpeedMult;

  function shoot() {
    const count = player.multishot;
    const muzzle = player.r + 8;
    const bx = player.x + Math.cos(player.angle) * muzzle;
    const by = player.y + Math.sin(player.angle) * muzzle;
    for (let s = 0; s < count; s++) {
      // spread projectiles across the multishot fan
      const offset = count > 1 ? (s - (count - 1) / 2) * 0.10 : 0;
      const ang = player.angle + offset + rand(-WEAPON.spread, WEAPON.spread);
      const spd = effProjSpeed();
      bullets.push({
        x: bx, y: by,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        r: WEAPON.r, life: WEAPON.life, dmg: effDmg(),
      });
    }
    // muzzle particles
    for (let i = 0; i < 4; i++) {
      const a = player.angle + rand(-0.4, 0.4);
      pushParticle(mkParticle(bx, by,
        Math.cos(a) * rand(60, 180), Math.sin(a) * rand(60, 180),
        rand(0.1, 0.25), '#00f0ff', rand(1, 3)));
    }
    // powerful multishot attacks kick the camera a little harder (kept comfortable)
    addShake(0.8 + Math.min(count, 6) * 0.35, 5);
    AudioManager.play('shoot');
  }

  // ---------- Enemy types ----------
  // ---------- Balance configuration ----------
  // Centralized, easy-to-tune difficulty constants for the early-game curve.
  const BALANCE = {
    // Enemy count for non-boss waves: gentle early curve, gradual later growth.
    enemyCount(wave) {
      const EARLY = { 1: 5, 2: 7, 3: 9, 4: 11, 5: 13 };
      if (EARLY[wave] !== undefined) return EARLY[wave];
      // After Wave 5: grow gently by ~3 per wave (no sudden jumps).
      return 13 + (wave - 5) * 3;
    },
    // Type composition for a non-boss wave (totals always match enemyCount()).
    composition(wave) {
      const total = this.enemyCount(wave);
      let fast = wave >= 2 ? Math.min(wave - 1, total) : 0;
      let tank = 0;
      if (wave >= 3) tank = wave >= 5 ? 2 : 1; // light pressure from Wave 3
      fast = Math.min(fast, total);
      tank = Math.min(tank, total);
      const grunt = Math.max(0, total - fast - tank);
      return { grunt, fast, tank };
    },
    // Minion counts for boss waves (kept modest so the fight stays readable).
    bossMinions(wave) {
      return {
        grunt: 4 + Math.floor(wave * 0.4),
        fast: Math.floor(wave * 0.3),
      };
    },
    // Health multiplier applied to an enemy's base hp by wave (gentle, then gradual).
    hpScale(wave) {
      return 1 + (wave - 1) * 0.06 + Math.max(0, wave - 5) * 0.05;
    },
    // Contact-damage multiplier by wave (flat early, rises slowly after Wave 3).
    dmgScale(wave) {
      return wave <= 3 ? 1 : 1 + (wave - 3) * 0.08;
    },
    // Base contact damage per enemy type (before wave scaling).
    baseDmg: { grunt: 10, fast: 8, tank: 18 },
    // Seconds between spawn bursts: long early, gradually shorter later.
    spawnInterval(wave) {
      return Math.max(0.4, 1.5 - wave * 0.12);
    },
    // How many enemies materialize per spawn tick (no big simultaneous waves early).
    spawnBurst(wave) {
      return wave >= 6 ? 2 : 1;
    },
    // Minimum distance (px) an enemy may spawn from the player.
    safeSpawnDist: 260,
    // HP-core drop chance (more generous during the early waves).
    hpDropChance(wave) {
      return wave <= 5 ? 0.20 : 0.12;
    },
    // HP restored by a single core (never exceeds maxHp).
    hpCoreHeal: 25,
  };

  const ENEMY_TYPES = {
    grunt:   { r: 16, speed: 78,  hp: 36,  dmg: 10, color: '#ff2bd6', score: 10, sides: 6, xp: 3 },
    fast:    { r: 12, speed: 150, hp: 20,  dmg: 8,  color: '#ffe14d', score: 15, sides: 3, xp: 5 },
    tank:    { r: 26, speed: 46,  hp: 90,  dmg: 18, color: '#9b5cff', score: 30, sides: 8, xp: 12 },
  };

  function spawnEnemy(type) {
    // Choose a spawn point inside the arena, away from the player, then show a
    // warning marker. The actual enemy materializes when the warning expires.
    let x, y, tries = 0;
    do {
      x = rand(70, W - 70);
      y = rand(70, H - 70);
      tries++;
    } while (dist2(x, y, player.x, player.y) < BALANCE.safeSpawnDist * BALANCE.safeSpawnDist && tries < 24);
    const life = 0.8;
    warnings.push({ x, y, type, life, maxLife: life, r: ENEMY_TYPES[type].r });
  }

  function spawnEnemyNow(type, x, y) {
    const t = ENEMY_TYPES[type];
    const hpScale = BALANCE.hpScale(wave);
    enemies.push({
      type, x, y, r: t.r, speed: t.speed * (1 + (wave - 1) * 0.02),
      hp: t.hp * hpScale, maxHp: t.hp * hpScale, dmg: BALANCE.baseDmg[type] * BALANCE.dmgScale(wave),
      color: t.color, score: t.score, xpVal: Math.round(t.xp * (1 + (wave - 1) * 0.05)), sides: t.sides,
      angle: 0, wobble: rand(0, TAU), hitFlash: 0,
      spawning: 0.4, spawnMax: 0.4,
    });
  }

  // ---------- Wave logic ----------
  function startNextWave() {
    wave++;
    el.waveNum.textContent = wave;
    const bossWave = wave % 5 === 0;
    // build spawn queue
    enemiesToSpawn = [];
    if (bossWave) {
      // fewer minions on boss waves so the fight stays readable
      const m = BALANCE.bossMinions(wave);
      for (let i = 0; i < m.grunt; i++) enemiesToSpawn.push('grunt');
      for (let i = 0; i < m.fast; i++) enemiesToSpawn.push('fast');
    } else {
      const c = BALANCE.composition(wave);
      for (let i = 0; i < c.grunt; i++) enemiesToSpawn.push('grunt');
      for (let i = 0; i < c.fast; i++) enemiesToSpawn.push('fast');
      for (let i = 0; i < c.tank; i++) enemiesToSpawn.push('tank');
    }
    // shuffle
    for (let i = enemiesToSpawn.length - 1; i > 0; i--) {
      const j = randInt(0, i);
      [enemiesToSpawn[i], enemiesToSpawn[j]] = [enemiesToSpawn[j], enemiesToSpawn[i]];
    }
    spawnTimer = bossWave ? 0.9 : 0;
    waveState = 'spawning';
    arenaPulse = 1;
    announceWave(bossWave);
    AudioManager.play(bossWave ? 'threat' : 'waveStart');
    if (bossWave) spawnBoss();
  }

  function announceWave(bossWave) {
    if (bossWave) {
      waveAnnounce.textContent = 'THREAT ESCALATION';
      waveAnnounce.classList.add('threat');
    } else {
      waveAnnounce.textContent = 'WAVE ' + wave;
      waveAnnounce.classList.remove('threat');
    }
    waveAnnounce.classList.remove('show');
    void waveAnnounce.offsetWidth; // reflow to restart animation
    waveAnnounce.classList.add('show');
  }

  // ---------- Boss ----------
  function spawnBoss() {
    if (boss) return; // only one boss active at a time
    const hp = 1200 + wave * 240;
    boss = {
      x: W / 2, y: 110, r: 58, angle: 0,
      hp, maxHp: hp, color: '#ff3b57',
      spawning: 1.1, spawnMax: 1.1,
      state: 'idle', stateTimer: 2.2,
      telegraph: 0, chargeTime: 0, volleys: 0, volleyTimer: 0,
      chargeDir: { x: 0, y: 1 }, hitFlash: 0, wobble: rand(0, TAU), ringRot: 0,
    };
    el.bossName.textContent = 'CYBERNETIC OVERLORD';
    el.bossBar.style.width = '100%';
    el.bossBarWrap.classList.remove('hidden');
    AudioManager.play('bossSpawn');
    addShake(6, 16);
  }

  function fireRadial(b) {
    const n = 18;
    const base = Math.random() * TAU;
    const spd = 230;
    for (let i = 0; i < n; i++) {
      const a = base + (i / n) * TAU;
      enemyBullets.push({ x: b.x, y: b.y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, r: 7, life: 4.5, dmg: 14 });
    }
  }

  function updateBoss(dt) {
    const b = boss;
    b.wobble += dt * 2;
    b.ringRot += dt * 0.6;
    if (b.hitFlash > 0) b.hitFlash -= dt;
    const ang = Math.atan2(player.y - b.y, player.x - b.x);
    b.angle = ang;

    if (b.spawning > 0) { b.spawning -= dt; return; } // materializing = harmless

    switch (b.state) {
      case 'idle': {
        const d = Math.hypot(player.x - b.x, player.y - b.y);
        const desired = 280, spd = 62;
        if (d > desired + 24) { b.x += Math.cos(ang) * spd * dt; b.y += Math.sin(ang) * spd * dt; }
        else if (d < desired - 24) { b.x -= Math.cos(ang) * spd * dt; b.y -= Math.sin(ang) * spd * dt; }
        b.stateTimer -= dt;
        if (b.stateTimer <= 0) {
          if (Math.random() < 0.5) { b.state = 'radial'; b.volleys = 3; b.volleyTimer = 0; }
          else { b.state = 'charge-telegraph'; b.telegraph = 1.0; b.chargeDir = { x: Math.cos(ang), y: Math.sin(ang) }; }
        }
        break;
      }
      case 'radial': {
        b.volleyTimer -= dt;
        if (b.volleyTimer <= 0 && b.volleys > 0) {
          fireRadial(b);
          b.volleys--;
          b.volleyTimer = 0.5;
          AudioManager.play('bossRadial');
        }
        if (b.volleys <= 0) { b.state = 'idle'; b.stateTimer = 1.8; }
        break;
      }
      case 'charge-telegraph': {
        b.telegraph -= dt;
        // slow re-aim during telegraph so the charge is dangerous but dodgeable
        b.chargeDir = { x: Math.cos(ang), y: Math.sin(ang) };
        if (b.telegraph <= 0) {
          b.state = 'charging'; b.chargeTime = 0.6;
          AudioManager.play('bossCharge');
          addShake(4, 16);
        }
        break;
      }
      case 'charging': {
        b.chargeTime -= dt;
        const spd = 760;
        b.x += b.chargeDir.x * spd * dt;
        b.y += b.chargeDir.y * spd * dt;
        addTrail(b.x, b.y, b.r * 0.9, '#ff3b57', 0.28);
        const rr = b.r + player.r;
        if (dist2(b.x, b.y, player.x, player.y) <= rr * rr) hurtPlayer(28);
        if (b.chargeTime <= 0) { b.state = 'idle'; b.stateTimer = 1.6; }
        break;
      }
    }

    b.x = clamp(b.x, b.r, W - b.r);
    b.y = clamp(b.y, b.r, H - b.r);

    // passive contact damage
    const rr = b.r + player.r;
    if (dist2(b.x, b.y, player.x, player.y) <= rr * rr) hurtPlayer(16);

    el.bossBar.style.width = clamp(b.hp / b.maxHp, 0, 1) * 100 + '%';
  }

  function killBoss() {
    const b = boss;
    const gained = Math.round(600 * multiplier);
    score += gained;
    kills++;
    addFloater(b.x, b.y, '+' + gained, '#ff2bd6');
    // large particle burst
    for (let i = 0; i < 80; i++) {
      const a = rand(0, TAU);
      const sp = rand(60, 520);
      pushParticle(mkParticle(b.x, b.y, Math.cos(a) * sp, Math.sin(a) * sp,
        rand(0.5, 1.2), i % 3 === 0 ? '#ffffff' : (i % 3 === 1 ? '#ff2bd6' : '#ff3b57'),
        rand(4, 11), { drag: 0.9, glow: 16 }));
    }
    pushParticle(mkParticle(b.x, b.y, 0, 0, 0.7, '#ffffff', b.r * 1.2, { type: 'ring', drag: 1, glow: 24 }));
    addShake(14, 18);
    AudioManager.play('bossDeath');
    // big XP reward
    for (let i = 0; i < 14; i++) dropXP(b.x + rand(-50, 50), b.y + rand(-50, 50), 8);
    boss = null;
    el.bossBarWrap.classList.add('hidden');
    updateHUD();
  }

  // ---------- Trails (bounded) ----------
  const MAX_TRAILS = 90;
  function addTrail(x, y, r, color, life) {
    if (trails.length >= MAX_TRAILS) trails.shift();
    trails.push({ x, y, r, color, life, maxLife: life });
  }

  // ---------- Particles / floaters ----------
  const MAX_PARTICLES = 460; // hard cap keeps things smooth on a MacBook Air

  function mkParticle(x, y, vx, vy, life, color, size, opts) {
    const p = {
      x, y, vx, vy, life, maxLife: life, color, size,
      type: 'spark', drag: 0.94, angle: 0, len: 0, glow: 8,
    };
    if (opts) {
      if (opts.type) p.type = opts.type;
      if (opts.drag !== undefined) p.drag = opts.drag;
      if (opts.angle !== undefined) p.angle = opts.angle;
      if (opts.len !== undefined) p.len = opts.len;
      if (opts.glow !== undefined) p.glow = opts.glow;
    }
    return p;
  }

  function pushParticle(p) {
    // enforce cap by discarding the oldest particle
    if (particles.length >= MAX_PARTICLES) particles.shift();
    particles.push(p);
  }

  function burst(x, y, color, count, power) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, TAU);
      const sp = rand(0.2, 1) * power;
      pushParticle(mkParticle(x, y, Math.cos(a) * sp, Math.sin(a) * sp,
        rand(0.3, 0.7), color, rand(2, 5)));
    }
  }

  // Distinct enemy death feels ------------------------------------------
  function deathParticles(e) {
    if (e.type === 'fast') {
      // sharp streak particles fired outward
      for (let i = 0; i < 14; i++) {
        const a = rand(0, TAU);
        const sp = rand(160, 420);
        pushParticle(mkParticle(e.x, e.y, Math.cos(a) * sp, Math.sin(a) * sp,
          rand(0.22, 0.42), i % 2 ? '#ffe14d' : '#fff6b0', rand(2, 4),
          { type: 'streak', angle: a, len: rand(14, 30), drag: 0.9 }));
      }
    } else if (e.type === 'tank') {
      // large, heavy explosion + shock ring
      for (let i = 0; i < 40; i++) {
        const a = rand(0, TAU);
        const sp = rand(60, 380);
        pushParticle(mkParticle(e.x, e.y, Math.cos(a) * sp, Math.sin(a) * sp,
          rand(0.4, 0.95), i % 3 === 0 ? '#ffffff' : e.color, rand(4, 9),
          { drag: 0.9, glow: 14 }));
      }
      pushParticle(mkParticle(e.x, e.y, 0, 0, 0.5, '#ffffff', e.r,
        { type: 'ring', drag: 1, glow: 20 }));
    } else {
      // basic enemies: cyan / pink sparks
      for (let i = 0; i < 24; i++) {
        const a = rand(0, TAU);
        const sp = rand(60, 300);
        pushParticle(mkParticle(e.x, e.y, Math.cos(a) * sp, Math.sin(a) * sp,
          rand(0.3, 0.65), i % 2 ? '#00f0ff' : '#ff2bd6', rand(2, 5)));
      }
    }
  }

  // Bullet impact sparks with directional velocity from the projectile ---
  function bulletImpact(x, y, vx, vy) {
    const baseAng = Math.atan2(vy, vx);
    const spd = Math.hypot(vx, vy);
    for (let i = 0; i < 6; i++) {
      const a = baseAng + rand(-1.1, 1.1);
      const sp = rand(0.15, 0.5) * spd + rand(40, 120);
      pushParticle(mkParticle(x, y,
        Math.cos(a) * sp, Math.sin(a) * sp,
        rand(0.1, 0.28), i % 2 ? '#ffffff' : '#bff6ff', rand(1.5, 3.5),
        { drag: 0.88 }));
    }
  }

  function addFloater(x, y, text, color) {
    floaters.push({ x, y, text, color, life: 0.9, vy: -40 });
  }

  // ---------- Pickups (HP cores) ----------
  function maybeDropPickup(x, y) {
    if (Math.random() < BALANCE.hpDropChance(wave)) {
      pickups.push({ x, y, r: 11, type: 'hp', life: 12, bob: rand(0, TAU) });
    }
  }

  // ---------- XP orbs ----------
  function dropXP(x, y, value) {
    xpOrbs.push({ x: x + rand(-6, 6), y: y + rand(-6, 6), r: 7, value, life: 16, bob: rand(0, TAU) });
  }

  function addXP(amount) {
    player.xp += amount;
  }

  // ---------- Upgrades ----------
  const UPGRADES = [
    { id: 'damage',    name: 'DAMAGE',    icon: '⚡', base: 0.20,
      desc: (v) => '+' + Math.round(v * 100) + '% projectile damage',
      apply: (v) => { player.dmgMult *= (1 + v); } },
    { id: 'fireRate',  name: 'FIRE RATE', icon: '➤', base: 0.15,
      desc: (v) => '+' + Math.round(v * 100) + '% fire rate',
      apply: (v) => { player.fireRateMult *= (1 + v); } },
    { id: 'moveSpeed', name: 'MOBILITY',  icon: '✺', base: 0.10,
      desc: (v) => '+' + Math.round(v * 100) + '% movement speed',
      apply: (v) => { player.speedMult *= (1 + v); } },
    { id: 'maxHealth', name: 'VITALITY',  icon: '❤', base: 25,
      desc: (v) => '+' + Math.round(v) + ' max integrity & full heal',
      apply: (v) => { player.maxHp += Math.round(v); player.hp = player.maxHp; } },
    { id: 'projSpeed', name: 'VELOCITY',  icon: '☄', base: 0.18,
      desc: (v) => '+' + Math.round(v * 100) + '% projectile speed',
      apply: (v) => { player.projSpeedMult *= (1 + v); } },
    { id: 'multishot', name: 'MULTISHOT', icon: '⋔', base: 1,
      desc: (v) => '+' + Math.round(v) + ' projectile' + (Math.round(v) > 1 ? 's' : '') + ' per shot',
      apply: (v) => { player.multishot += Math.round(v); } },
  ];

  // Rarity tiers with weighted selection; higher tiers apply stronger values.
  const RARITIES = [
    { id: 'COMMON', mult: 1.0, weight: 65, cls: 'rarity-common' },
    { id: 'RARE',   mult: 1.6, weight: 27, cls: 'rarity-rare' },
    { id: 'EPIC',   mult: 2.4, weight: 8,  cls: 'rarity-epic' },
  ];

  function rollRarity() {
    const total = RARITIES.reduce((s, r) => s + r.weight, 0);
    let r = Math.random() * total;
    for (const rar of RARITIES) { if (r < rar.weight) return rar; r -= rar.weight; }
    return RARITIES[0];
  }

  function rarityValue(u, rar) {
    if (u.id === 'multishot') return rar.id === 'EPIC' ? 2 : 1;
    if (u.id === 'maxHealth') return Math.round(u.base * rar.mult);
    return u.base * rar.mult;
  }

  let currentCards = [];

  function buildCards() {
    // pick 3 unique upgrades
    const pool = UPGRADES.slice();
    for (let i = pool.length - 1; i > 0; i--) {
      const j = randInt(0, i);
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const picks = pool.slice(0, 3);
    currentCards = [];
    el.upgradeCards.innerHTML = '';
    picks.forEach((u, idx) => {
      const rar = rollRarity();
      const value = rarityValue(u, rar);
      const choice = { u, value, rar };
      currentCards.push(choice);
      const card = document.createElement('div');
      card.className = 'card ' + rar.cls + ' c-' + (idx + 1);
      const stack = player.upgradeStacks[u.id] || 0;
      card.innerHTML =
        '<div class="card-key">' + (idx + 1) + '</div>' +
        '<div class="card-rarity">' + rar.id + '</div>' +
        '<div class="card-icon" style="color:var(--neon-cyan)">' + u.icon + '</div>' +
        '<div class="card-name">' + u.name + '</div>' +
        '<div class="card-desc">' + u.desc(value) + '</div>' +
        (stack > 0 ? '<div class="card-lvl">OWNED x' + stack + '</div>' : '');
      card.addEventListener('click', () => chooseUpgrade(choice));
      card.addEventListener('mouseenter', () => AudioManager.play('hover'));
      el.upgradeCards.appendChild(card);
    });
  }

  function doLevelUp() {
    player.level++;
    player.xp -= player.xpToNext;
    if (player.xp < 0) player.xp = 0;
    player.xpToNext = computeXpToNext(player.level);
    state = STATE.LEVELUP;
    mouse.down = false;
    buildCards();
    show(el.levelup);
    AudioManager.play('levelUp');
    updateHUD();
  }

  function chooseUpgrade(choice) {
    if (state !== STATE.LEVELUP) return;
    choice.u.apply(choice.value);
    player.upgradeStacks[choice.u.id] = (player.upgradeStacks[choice.u.id] || 0) + 1;
    AudioManager.play('upgrade');
    currentCards = [];
    show(null);
    el.hud.classList.remove('hidden');
    state = STATE.PLAY;
    last = performance.now();
    updateHUD();
  }

  // ---------- Dash ----------
  function tryDash() {
    if (player.dashCd > 0 || player.dashing > 0) return;
    let dx = (keys['d'] || keys['arrowright'] ? 1 : 0) - (keys['a'] || keys['arrowleft'] ? 1 : 0);
    let dy = (keys['s'] || keys['arrowdown'] ? 1 : 0) - (keys['w'] || keys['arrowup'] ? 1 : 0);
    if (dx === 0 && dy === 0) { dx = Math.cos(player.angle); dy = Math.sin(player.angle); }
    const l = Math.hypot(dx, dy) || 1;
    player.dashDir = { x: dx / l, y: dy / l };
    player.dashing = 0.16;
    player.invuln = Math.max(player.invuln, 0.24);
    player.dashCd = player.dashMax;
    burst(player.x, player.y, '#00f0ff', 14, 220);
    AudioManager.play('dash');
  }

  // ---------- Damage / death ----------
  function hurtPlayer(amount) {
    if (player.invuln > 0) return;
    player.hp -= amount;
    player.invuln = 0.7;
    addShake(7, 14); // medium shake on taking damage
    flash = 0.4;
    damagePulse = 1;
    showDamageVignette(0.7);
    // brief zoom punch inward, camera lerps back to base
    camera.zoom = BASE_ZOOM + 0.12;
    burst(player.x, player.y, '#ff3b57', 18, 260);
    AudioManager.play('hurt');
    if (player.hp <= 0) { player.hp = 0; gameOver(); }
    updateHUD();
  }

  function killEnemy(e, idx) {
    kills++;
    // multiplier
    multiplier = Math.min(multiplier + 0.1, 5);
    multTimer = 3;
    const gained = Math.round(e.score * multiplier);
    score += gained;
    addFloater(e.x, e.y, '+' + gained, '#00f0ff');
    deathParticles(e);
    if (e.type === 'tank') {
      addShake(9, 14); // strong shake when a tank dies
      AudioManager.play('tankDeath');
    } else {
      addShake(2.5, 12);
      AudioManager.play('death');
    }
    maybeDropPickup(e.x, e.y);
    dropXP(e.x, e.y, e.xpVal);
    enemies.splice(idx, 1);
    updateHUD();
  }

  function gameOver() {
    state = STATE.OVER;
    mouse.down = false;
    AudioManager.play('gameOver');
    el.bossBarWrap.classList.add('hidden');
    hideDamageVignette();
    if (score > best) { best = score; localStorage.setItem('neon_best', String(best)); }
    el.goScore.textContent = score;
    el.goWave.textContent = wave;
    el.goLevel.textContent = player.level;
    el.goKills.textContent = kills;
    el.goBest.textContent = best;
    el.bestScore.textContent = best;
    show(el.gameover);
    el.hud.classList.add('hidden');
  }

  // ---------- HUD ----------
  function updateHUD() {
    const pct = clamp(player.hp / player.maxHp, 0, 1);
    el.hpBar.style.width = (pct * 100) + '%';
    el.hpText.textContent = Math.ceil(player.hp);
    el.hpBar.style.background = pct > 0.5
      ? 'linear-gradient(90deg,#39ff88,#00f0ff)'
      : pct > 0.25
        ? 'linear-gradient(90deg,#ffe14d,#ff2bd6)'
        : 'linear-gradient(90deg,#ff3b57,#ff2bd6)';
    el.scoreValue.textContent = score;
    el.killsValue.textContent = kills + ' KILLS';
    el.multValue.textContent = 'x' + multiplier.toFixed(1);
    el.lvlNum.textContent = player.level;
    el.xpBar.style.width = clamp(player.xp / player.xpToNext, 0, 1) * 100 + '%';
  }

  // cached wave-timer text so we avoid touching the DOM every frame
  let _waveTimerText = '';
  function setWaveTimer(text) {
    if (text !== _waveTimerText) {
      _waveTimerText = text;
      el.waveTimer.textContent = text;
    }
  }

  // ---------- Update ----------
  function update(dt) {
    // ----- multiplier decay -----
    if (multTimer > 0) { multTimer -= dt; if (multTimer <= 0) { multiplier = 1; updateHUD(); } }

    // ----- dash cooldown -----
    if (player.dashCd > 0) player.dashCd -= dt;

    // ----- player movement -----
    let mx = 0, my = 0;
    if (keys['w'] || keys['arrowup']) my -= 1;
    if (keys['s'] || keys['arrowdown']) my += 1;
    if (keys['a'] || keys['arrowleft']) mx -= 1;
    if (keys['d'] || keys['arrowright']) mx += 1;
    const len = Math.hypot(mx, my) || 1;
    // convert screen-space mouse into world coords, then aim at it
    const mw = screenToWorld(mouse.x, mouse.y);
    mouseWorld.x = mw.x; mouseWorld.y = mw.y;
    player.angle = Math.atan2(mouseWorld.y - player.y, mouseWorld.x - player.x);
    if (player.invuln > 0) player.invuln -= dt;

    if (player.dashing > 0) {
      player.dashing -= dt;
      const ds = 1000 * dt;
      player.x = clamp(player.x + player.dashDir.x * ds, player.r, W - player.r);
      player.y = clamp(player.y + player.dashDir.y * ds, player.r, H - player.r);
      // neon dash trail (bounded via addTrail)
      addTrail(player.x, player.y, player.r * 0.85, '#00f0ff', 0.3);
      camera.targetZoom = BASE_ZOOM - 0.05; // subtle zoom-out while dashing
    } else {
      player.x = clamp(player.x + (mx / len) * player.speed * player.speedMult * dt, player.r, W - player.r);
      player.y = clamp(player.y + (my / len) * player.speed * player.speedMult * dt, player.r, H - player.r);
      camera.targetZoom = BASE_ZOOM;
    }

    // dash trail record (legacy short ring under player)
    player.dashTrail.push({ x: player.x, y: player.y, life: 0.25 });
    if (player.dashTrail.length > 12) player.dashTrail.shift();
    for (const t of player.dashTrail) t.life -= dt;

    // ----- trails cleanup -----
    for (let i = trails.length - 1; i >= 0; i--) {
      trails[i].life -= dt;
      if (trails[i].life <= 0) trails.splice(i, 1);
    }

    // ----- camera follow -----
    updateCamera(dt);

    // ----- shooting -----
    shootCooldown -= dt;
    if (mouse.down && shootCooldown <= 0) {
      shoot();
      shootCooldown = effFireRate();
    }

    // ----- bullets -----
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (b.life <= 0 || b.x < -20 || b.x > W + 20 || b.y < -20 || b.y > H + 20) {
        bullets.splice(i, 1); continue;
      }
      let hit = false;
      // collide with enemies
      for (let j = enemies.length - 1; j >= 0; j--) {
        const e = enemies[j];
        const rr = (b.r + e.r);
        if (dist2(b.x, b.y, e.x, e.y) <= rr * rr) {
          e.hp -= b.dmg;
          e.hitFlash = 0.12;
          bulletImpact(b.x, b.y, b.vx, b.vy);
          AudioManager.play('hit');
          addFloater(e.x, e.y - e.r - 4, Math.round(b.dmg), '#ffd6ec');
          bullets.splice(i, 1);
          if (e.hp <= 0) killEnemy(e, j);
          hit = true;
          break;
        }
      }
      if (hit) continue;
      // collide with boss
      if (boss && boss.spawning <= 0) {
        const rr = b.r + boss.r;
        if (dist2(b.x, b.y, boss.x, boss.y) <= rr * rr) {
          boss.hp -= b.dmg;
          boss.hitFlash = 0.1;
          bulletImpact(b.x, b.y, b.vx, b.vy);
          AudioManager.play('hit');
          addFloater(b.x, b.y, Math.round(b.dmg), '#ffd6ec');
          bullets.splice(i, 1);
          if (boss.hp <= 0) killBoss();
        }
      }
    }

    // ----- warnings -> materialize enemies -----
    for (let i = warnings.length - 1; i >= 0; i--) {
      const w = warnings[i];
      w.life -= dt;
      if (w.life <= 0) {
        spawnEnemyNow(w.type, w.x, w.y);
        // materialize burst
        burst(w.x, w.y, ENEMY_TYPES[w.type].color, 10, 160);
        warnings.splice(i, 1);
      }
    }

    // ----- wave spawning -----
    if (waveState === 'spawning') {
      spawnTimer -= dt;
      if (spawnTimer <= 0 && enemiesToSpawn.length > 0) {
        // spawn in small bursts, faster on higher waves
        const burstN = Math.min(BALANCE.spawnBurst(wave), enemiesToSpawn.length);
        for (let k = 0; k < burstN; k++) spawnEnemy(enemiesToSpawn.pop());
        spawnTimer = BALANCE.spawnInterval(wave);
      }
      if (enemiesToSpawn.length === 0 && warnings.length === 0) waveState = 'clearing';
      setWaveTimer(boss ? 'BOSS ENGAGED' : 'HOSTILES INBOUND');
    } else if (waveState === 'clearing') {
      setWaveTimer(boss ? 'BOSS ENGAGED' : (enemies.length + ' REMAINING'));
      if (enemies.length === 0 && warnings.length === 0 && !boss) {
        waveState = 'intermission';
        waveTimer = 3;
        // reward: small heal between waves
        player.hp = clamp(player.hp + 12, 0, player.maxHp);
        updateHUD();
      }
    } else if (waveState === 'intermission') {
      waveTimer -= dt;
      setWaveTimer('NEXT WAVE ' + Math.ceil(waveTimer));
      if (waveTimer <= 0) startNextWave();
    }

    // ----- boss -----
    if (boss) updateBoss(dt);

    // ----- enemy projectiles -----
    for (let i = enemyBullets.length - 1; i >= 0; i--) {
      const eb = enemyBullets[i];
      eb.x += eb.vx * dt; eb.y += eb.vy * dt; eb.life -= dt;
      if (eb.life <= 0 || eb.x < -30 || eb.x > W + 30 || eb.y < -30 || eb.y > H + 30) {
        enemyBullets.splice(i, 1); continue;
      }
      const rr = eb.r + player.r;
      if (dist2(eb.x, eb.y, player.x, player.y) <= rr * rr) {
        hurtPlayer(eb.dmg);
        enemyBullets.splice(i, 1);
      }
    }

    // ----- enemies -----
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      e.wobble += dt * 3;
      if (e.hitFlash > 0) e.hitFlash -= dt;
      const ang = Math.atan2(player.y - e.y, player.x - e.x);
      e.angle = ang;

      // materializing: no movement, no contact damage
      if (e.spawning > 0) {
        e.spawning -= dt;
        continue;
      }

      // slight wobble for organic movement
      const wob = e.type === 'fast' ? Math.sin(e.wobble) * 0.5 : 0;
      e.x += Math.cos(ang + wob) * e.speed * dt;
      e.y += Math.sin(ang + wob) * e.speed * dt;

      // separation (avoid stacking)
      for (let j = i - 1; j >= 0; j--) {
        const o = enemies[j];
        if (o.spawning > 0) continue;
        const min = e.r + o.r;
        const d2 = dist2(e.x, e.y, o.x, o.y);
        if (d2 < min * min && d2 > 0.001) {
          const d = Math.sqrt(d2);
          const push = (min - d) * 0.5;
          const nx = (e.x - o.x) / d, ny = (e.y - o.y) / d;
          e.x += nx * push; e.y += ny * push;
          o.x -= nx * push; o.y -= ny * push;
        }
      }

      // collide with player
      const rr = e.r + player.r;
      if (dist2(e.x, e.y, player.x, player.y) <= rr * rr) {
        hurtPlayer(e.dmg);
        // knockback enemy
        e.x -= Math.cos(ang) * 24;
        e.y -= Math.sin(ang) * 24;
      }
    }

    // ----- XP orbs -----
    for (let i = xpOrbs.length - 1; i >= 0; i--) {
      const o = xpOrbs[i];
      o.life -= dt; o.bob += dt * 4;
      const d2p = dist2(o.x, o.y, player.x, player.y);
      // attract toward player when nearby
      if (d2p < 150 * 150) {
        const d = Math.sqrt(d2p) || 1;
        const pull = 320 * dt;
        o.x += (player.x - o.x) / d * pull;
        o.y += (player.y - o.y) / d * pull;
      }
      const rr = o.r + player.r;
      if (dist2(o.x, o.y, player.x, player.y) <= rr * rr) {
        addXP(o.value);
        addFloater(o.x, o.y, '+' + o.value + ' XP', '#00f0ff');
        burst(o.x, o.y, '#00f0ff', 8, 160);
        AudioManager.play('xp');
        xpOrbs.splice(i, 1);
        updateHUD();
        continue;
      }
      if (o.life <= 0) xpOrbs.splice(i, 1);
    }

    // ----- pickups (HP cores) -----
    for (let i = pickups.length - 1; i >= 0; i--) {
      const p = pickups[i];
      p.life -= dt; p.bob += dt * 4;
      const rr = p.r + player.r;
      if (dist2(p.x, p.y, player.x, player.y) <= rr * rr) {
        player.hp = clamp(player.hp + BALANCE.hpCoreHeal, 0, player.maxHp);
        addFloater(p.x, p.y, '+' + BALANCE.hpCoreHeal + ' HP', '#39ff88');
        burst(p.x, p.y, '#39ff88', 16, 220);
        pickups.splice(i, 1);
        updateHUD();
        continue;
      }
      if (p.life <= 0) pickups.splice(i, 1);
    }

    // ----- particles -----
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= p.drag; p.vy *= p.drag;
      if (p.life <= 0) particles.splice(i, 1);
    }

    // ----- floaters -----
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i];
      f.life -= dt; f.y += f.vy * dt;
      if (f.life <= 0) floaters.splice(i, 1);
    }

    // ----- level up check -----
    if (player.xp >= player.xpToNext) { doLevelUp(); return; }

    // ----- screen shake & flash -----
    if (screenShake > 0) {
      screenShake *= Math.pow(0.0009, dt); // smooth fast decay
      if (screenShake < 0.05) screenShake = 0;
      camShakeX = rand(-screenShake, screenShake);
      camShakeY = rand(-screenShake, screenShake);
    } else { camShakeX = camShakeY = 0; }
    if (flash > 0) flash -= dt * 1.6;

    // ----- arena pulse & damage feedback decay -----
    if (arenaPulse > 0) { arenaPulse -= dt * 1.1; if (arenaPulse < 0) arenaPulse = 0; }
    if (damagePulse > 0) {
      damagePulse -= dt * 2.2;
      if (damagePulse <= 0) { damagePulse = 0; hideDamageVignette(); }
      else if (vignetteOn) showDamageVignette(damagePulse * 0.7);
    }

    // starfield drift
    for (const s of stars) {
      s.y += s.z * 10 * dt;
      if (s.y > H) { s.y = 0; s.x = rand(0, W); }
    }

    // ----- dash HUD -----
    if (player.dashCd > 0) {
      const ratio = clamp(1 - player.dashCd / player.dashMax, 0, 1);
      el.dashBar.style.width = (ratio * 100) + '%';
      _dashWidth = '';
      if (!_dashCooling) { el.dashBar.classList.add('cooling'); _dashCooling = true; }
      setDashText(player.dashing > 0 ? 'DASHING' : '…');
    } else {
      if (_dashWidth !== '100%') { el.dashBar.style.width = '100%'; _dashWidth = '100%'; }
      if (_dashCooling) { el.dashBar.classList.remove('cooling'); _dashCooling = false; }
      setDashText('READY');
    }
  }

  let _dashText = '', _dashCooling = false, _dashWidth = '';
  function setDashText(t) {
    if (t !== _dashText) { _dashText = t; el.dashText.textContent = t; }
  }

  // ---------- Rendering ----------
  function drawGrid() {
    const grid = 48;
    ctx.save();
    ctx.strokeStyle = 'rgba(0,240,255,0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= W; x += grid) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = 0; y <= H; y += grid) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();
    ctx.restore();
  }

  function drawArena() {
    const pulse = arenaPulse;
    ctx.save();
    const col = boss ? '255,59,87' : '0,240,255';
    ctx.lineWidth = 2 + pulse * 4;
    ctx.strokeStyle = 'rgba(' + col + ',' + (0.14 + pulse * 0.5) + ')';
    ctx.shadowColor = boss ? '#ff3b57' : '#00f0ff';
    ctx.shadowBlur = 10 + pulse * 34;
    ctx.strokeRect(2, 2, W - 4, H - 4);
    ctx.restore();
  }

  function drawStars() {
    ctx.save();
    for (const s of stars) {
      ctx.globalAlpha = s.z * 0.6;
      ctx.fillStyle = '#8be9ff';
      ctx.fillRect(s.x, s.y, s.s, s.s);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawPolygon(x, y, r, sides, rot) {
    ctx.beginPath();
    for (let i = 0; i <= sides; i++) {
      const a = rot + (i / sides) * TAU;
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  function drawWarnings() {
    for (const w of warnings) {
      const t = 1 - w.life / w.maxLife;
      const pulse = Math.sin(w.life * 22) * 0.5 + 0.5;
      const col = ENEMY_TYPES[w.type].color;
      ctx.save();
      ctx.translate(w.x, w.y);
      ctx.globalAlpha = 0.35 + pulse * 0.5;
      ctx.strokeStyle = col;
      ctx.shadowColor = col;
      ctx.shadowBlur = 12;
      ctx.lineWidth = 2;
      const rr = w.r * (0.6 + t * 0.9);
      ctx.beginPath(); ctx.arc(0, 0, rr, 0, TAU); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-w.r - 6, 0); ctx.lineTo(w.r + 6, 0);
      ctx.moveTo(0, -w.r - 6); ctx.lineTo(0, w.r + 6);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawBoss() {
    const b = boss;
    const materialize = b.spawning > 0 ? clamp(1 - b.spawning / b.spawnMax, 0, 1) : 1;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.globalAlpha = 0.25 + materialize * 0.75;
    const scale = 0.4 + materialize * 0.6;
    ctx.scale(scale, scale);

    // telegraph line before a charge
    if (b.state === 'charge-telegraph') {
      const blink = Math.sin(b.telegraph * 30) * 0.5 + 0.5;
      ctx.save();
      ctx.rotate(Math.atan2(b.chargeDir.y, b.chargeDir.x));
      ctx.globalAlpha = 0.3 + blink * 0.5;
      ctx.strokeStyle = '#ff3b57';
      ctx.shadowColor = '#ff3b57';
      ctx.shadowBlur = 16;
      ctx.lineWidth = 6;
      ctx.setLineDash([18, 14]);
      ctx.beginPath();
      ctx.moveTo(b.r, 0);
      ctx.lineTo(b.r + 620, 0);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    const flashing = b.hitFlash > 0;
    // outer rotating ring
    ctx.save();
    ctx.rotate(b.ringRot);
    ctx.strokeStyle = flashing ? '#ffffff' : '#ff2bd6';
    ctx.shadowColor = '#ff2bd6';
    ctx.shadowBlur = 22;
    ctx.lineWidth = 4;
    drawPolygon(0, 0, b.r + 14, 8, 0);
    ctx.stroke();
    ctx.restore();

    // core body
    ctx.rotate(-b.ringRot * 0.5);
    ctx.shadowColor = '#ff3b57';
    ctx.shadowBlur = 28;
    ctx.lineWidth = 3;
    ctx.strokeStyle = flashing ? '#ffffff' : '#ff3b57';
    ctx.fillStyle = flashing ? 'rgba(255,255,255,0.4)' : 'rgba(40,6,18,0.85)';
    drawPolygon(0, 0, b.r, 6, b.angle);
    ctx.fill();
    ctx.stroke();

    // inner cores
    ctx.shadowBlur = 12;
    const throb = Math.sin(b.wobble * 3) * 0.15 + 0.85;
    ctx.fillStyle = '#ff2bd6';
    ctx.beginPath();
    ctx.arc(0, 0, b.r * 0.34 * throb, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#fff2fb';
    ctx.beginPath();
    ctx.arc(0, 0, b.r * 0.14, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function render() {
    // background
    ctx.clearRect(0, 0, W, H);
    const g = ctx.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, Math.max(W, H) * 0.7);
    g.addColorStop(0, '#0b0e26');
    g.addColorStop(1, '#04050e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // far parallax stars stay in screen space
    drawStars();

    // ---- world camera transform ----
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x + camShakeX, -camera.y + camShakeY);

    drawGrid();
    drawArena();
    drawWarnings();

    // pickups (HP cores)
    for (const p of pickups) {
      const bob = Math.sin(p.bob) * 3;
      const a = p.life < 3 ? (Math.sin(p.life * 12) * 0.5 + 0.5) : 1;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.shadowColor = '#39ff88';
      ctx.shadowBlur = 18;
      ctx.fillStyle = '#39ff88';
      ctx.strokeStyle = '#eafff2';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y + bob, p.r, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = a;
      ctx.fillStyle = '#04120a';
      ctx.fillRect(p.x - 5, p.y + bob - 1.5, 10, 3);
      ctx.fillRect(p.x - 1.5, p.y + bob - 5, 3, 10);
      ctx.restore();
    }

    // XP orbs
    for (const o of xpOrbs) {
      const bob = Math.sin(o.bob) * 2.5;
      const a = o.life < 3 ? (Math.sin(o.life * 12) * 0.5 + 0.5) : 1;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.shadowColor = '#00f0ff';
      ctx.shadowBlur = 16;
      ctx.fillStyle = 'rgba(0,240,255,0.25)';
      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 2;
      drawPolygon(o.x, o.y + bob, o.r, 4, Math.PI / 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#d8feff';
      ctx.beginPath();
      ctx.arc(o.x, o.y + bob, o.r * 0.32, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    // movement / charge trails
    for (const t of trails) {
      const a = clamp(t.life / t.maxLife, 0, 1);
      ctx.globalAlpha = a * 0.4;
      ctx.fillStyle = t.color;
      ctx.shadowColor = t.color;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r * a, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    // particles (fade + shrink, multiple shapes)
    for (const p of particles) {
      const a = clamp(p.life / p.maxLife, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.strokeStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = p.glow;
      if (p.type === 'streak') {
        const sz = p.size * a;
        ctx.lineWidth = sz;
        ctx.lineCap = 'round';
        const ex = Math.cos(p.angle) * p.len * a;
        const ey = Math.sin(p.angle) * p.len * a;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - ex, p.y - ey);
        ctx.stroke();
      } else if (p.type === 'ring') {
        const rr = p.size * (1 + (1 - a) * 3);
        ctx.lineWidth = 3 * a;
        ctx.beginPath();
        ctx.arc(p.x, p.y, rr, 0, TAU);
        ctx.stroke();
      } else {
        const sz = p.size * a;
        ctx.fillRect(p.x - sz / 2, p.y - sz / 2, sz, sz);
      }
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    // enemy projectiles
    for (const eb of enemyBullets) {
      ctx.save();
      ctx.shadowColor = '#ff3b57';
      ctx.shadowBlur = 12;
      ctx.fillStyle = '#ffb3c2';
      ctx.beginPath();
      ctx.arc(eb.x, eb.y, eb.r, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ff3b57';
      ctx.beginPath();
      ctx.arc(eb.x, eb.y, eb.r * 0.5, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    // bullets
    for (const b of bullets) {
      ctx.save();
      ctx.shadowColor = '#00f0ff';
      ctx.shadowBlur = 14;
      ctx.fillStyle = '#d8feff';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, TAU);
      ctx.fill();
      // trail
      ctx.strokeStyle = 'rgba(0,240,255,0.5)';
      ctx.lineWidth = b.r * 1.4;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
      ctx.stroke();
      ctx.restore();
    }

    // enemies
    for (const e of enemies) {
      const materialize = e.spawning > 0 ? clamp(1 - e.spawning / e.spawnMax, 0, 1) : 1;
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.globalAlpha = 0.25 + materialize * 0.75;
      const sc = 0.4 + materialize * 0.6;
      ctx.scale(sc, sc);
      ctx.shadowColor = e.color;
      ctx.shadowBlur = 16;
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = e.hitFlash > 0 ? '#ffffff' : e.color;
      ctx.fillStyle = e.hitFlash > 0 ? 'rgba(255,255,255,0.35)' : 'rgba(20,10,30,0.5)';
      drawPolygon(0, 0, e.r, e.sides, e.angle);
      ctx.fill();
      ctx.stroke();
      // inner core
      ctx.shadowBlur = 0;
      ctx.fillStyle = e.color;
      ctx.globalAlpha *= 0.85;
      ctx.beginPath();
      ctx.arc(0, 0, e.r * 0.28, 0, TAU);
      ctx.fill();
      ctx.restore();
      // hp bar for damaged (drawn unscaled, above enemy)
      if (e.spawning <= 0 && e.hp < e.maxHp) {
        const bw = e.r * 2;
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(e.x - bw / 2, e.y - e.r - 10, bw, 4);
        ctx.fillStyle = e.color;
        ctx.fillRect(e.x - bw / 2, e.y - e.r - 10, bw * (e.hp / e.maxHp), 4);
        ctx.restore();
      }
    }

    // boss
    if (boss) drawBoss();

    // player dash trail (legacy soft ring)
    for (const t of player.dashTrail) {
      if (t.life <= 0) continue;
      ctx.globalAlpha = clamp(t.life / 0.25, 0, 1) * 0.25;
      ctx.fillStyle = '#00f0ff';
      ctx.beginPath();
      ctx.arc(t.x, t.y, player.r * 0.8, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // player
    drawPlayer();

    // floaters
    for (const f of floaters) {
      ctx.save();
      ctx.globalAlpha = clamp(f.life / 0.9, 0, 1);
      ctx.font = '700 18px Orbitron, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = f.color;
      ctx.shadowColor = f.color;
      ctx.shadowBlur = 10;
      ctx.fillText(f.text, f.x, f.y);
      ctx.restore();
    }

    ctx.restore(); // end camera

    // hit flash overlay (screen space)
    if (flash > 0) {
      ctx.fillStyle = 'rgba(255,59,87,' + clamp(flash, 0, 0.4) + ')';
      ctx.fillRect(0, 0, W, H);
    }

    // chromatic-style red/cyan edge flash on damage (subtle, screen space)
    if (damagePulse > 0) {
      const p = clamp(damagePulse, 0, 1);
      const edge = Math.max(W, H) * 0.12;
      const lg = ctx.createLinearGradient(0, 0, edge, 0);
      lg.addColorStop(0, 'rgba(255,59,87,' + (0.4 * p) + ')');
      lg.addColorStop(1, 'rgba(255,59,87,0)');
      ctx.fillStyle = lg;
      ctx.fillRect(0, 0, edge, H);
      const rg = ctx.createLinearGradient(W, 0, W - edge, 0);
      rg.addColorStop(0, 'rgba(0,240,255,' + (0.4 * p) + ')');
      rg.addColorStop(1, 'rgba(0,240,255,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(W - edge, 0, edge, H);
    }

    // vignette (screen space)
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  }

  function drawPlayer() {
    const p = player;
    const blink = p.invuln > 0 && Math.floor(p.invuln * 20) % 2 === 0;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    if (blink) ctx.globalAlpha = 0.4;

    // body glow
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 22;
    // ship triangle
    ctx.beginPath();
    ctx.moveTo(p.r + 6, 0);
    ctx.lineTo(-p.r * 0.7, -p.r * 0.8);
    ctx.lineTo(-p.r * 0.35, 0);
    ctx.lineTo(-p.r * 0.7, p.r * 0.8);
    ctx.closePath();
    ctx.fillStyle = 'rgba(10,20,40,0.9)';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#00f0ff';
    ctx.stroke();

    // cockpit core
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#ff2bd6';
    ctx.beginPath();
    ctx.arc(2, 0, 4, 0, TAU);
    ctx.fill();

    // gun barrel
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#9b5cff';
    ctx.fillRect(p.r * 0.3, -2, p.r * 0.9, 4);

    ctx.restore();

    // aim reticle (world-space, follows the converted mouse position)
    ctx.save();
    ctx.strokeStyle = 'rgba(0,240,255,0.55)';
    ctx.lineWidth = 1.5;
    const mxw = mouseWorld.x, myw = mouseWorld.y;
    ctx.beginPath();
    ctx.arc(mxw, myw, 12, 0, TAU);
    ctx.moveTo(mxw - 18, myw); ctx.lineTo(mxw - 6, myw);
    ctx.moveTo(mxw + 6, myw); ctx.lineTo(mxw + 18, myw);
    ctx.moveTo(mxw, myw - 18); ctx.lineTo(mxw, myw - 6);
    ctx.moveTo(mxw, myw + 6); ctx.lineTo(mxw, myw + 18);
    ctx.stroke();
    ctx.restore();
  }

  // ---------- Main loop ----------
  let last = performance.now();
  function loop(now) {
    let dt = (now - last) / 1000;
    last = now;
    dt = Math.min(dt, 0.05); // clamp big frame gaps

    if (state === STATE.PLAY) {
      update(dt);
      render();
    } else if (state === STATE.PAUSE || state === STATE.OVER || state === STATE.LEVELUP) {
      render(); // freeze frame under overlay
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // ---------- State transitions ----------
  function show(overlay) {
    [el.menu, el.how, el.pause, el.gameover, el.levelup].forEach(o => o.classList.add('hidden'));
    if (overlay) overlay.classList.remove('hidden');
  }

  function startGame() {
    resetGame();
    updateHUD();
    state = STATE.PLAY;
    show(null);
    el.hud.classList.remove('hidden');
    last = performance.now();
  }

  function togglePause() {
    if (state === STATE.PLAY) {
      state = STATE.PAUSE;
      mouse.down = false;
      show(el.pause);
    } else if (state === STATE.PAUSE) {
      state = STATE.PLAY;
      show(null);
      last = performance.now();
    }
  }

  function toMenu() {
    state = STATE.MENU;
    show(el.menu);
    el.hud.classList.add('hidden');
    el.bestScore.textContent = best;
  }

  // ---------- Mute controls ----------
  function refreshMuteButton() {
    const muted = AudioManager.isMuted();
    el.muteIcon.textContent = muted ? '✕' : '♪';
    el.muteBtn.classList.toggle('muted', muted);
    el.muteBtn.title = muted ? 'Unmute (M)' : 'Mute (M)';
  }
  function toggleMute() {
    // ensure context exists so the state is applied immediately
    AudioManager.init();
    AudioManager.resume();
    AudioManager.toggle();
    refreshMuteButton();
  }
  refreshMuteButton();
  el.muteBtn.addEventListener('click', () => { toggleMute(); });

  // ---------- Button wiring ----------
  function wireBtn(id, fn) {
    const b = document.getElementById(id);
    b.addEventListener('click', () => { unlockAudio(); AudioManager.play('click'); fn(); });
    b.addEventListener('mouseenter', () => { AudioManager.play('hover'); });
  }
  wireBtn('btn-start', startGame);
  wireBtn('btn-how', () => { state = STATE.HOW; show(el.how); });
  wireBtn('btn-back', () => { state = STATE.MENU; show(el.menu); });
  wireBtn('btn-resume', togglePause);
  wireBtn('btn-restart', startGame);
  wireBtn('btn-quit', toMenu);
  wireBtn('btn-retry', startGame);
  wireBtn('btn-menu', toMenu);

  // ---------- Boot ----------
  toMenu();
})();
