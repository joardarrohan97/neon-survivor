// =========================================================
//  NEON SURVIVOR: CORE BREACH — AudioManager
//  Procedural Web Audio API sound engine (no external files)
// =========================================================
export class AudioManager {
  constructor() {
    this.actx = null;
    this.master = null;
    this.muted = localStorage.getItem('cb_muted') === '1';
    this.lastPlay = Object.create(null);
    this.unlocked = false;
  }

  init() {
    if (this.actx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.actx = new AC();
      this.master = this.actx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.55;
      this.master.connect(this.actx.destination);
    } catch (e) {
      this.actx = null;
    }
  }

  resume() {
    if (this.actx && this.actx.state === 'suspended') this.actx.resume();
  }

  unlock() {
    if (this.unlocked) { this.resume(); return; }
    this.unlocked = true;
    this.init();
    this.resume();
  }

  // ---- core synthesis ----
  tone({ type = 'sine', freq = 440, freqEnd = null, dur = 0.15, vol = 0.3, attack = 0.005, filterType = null, filterFreq = 800, filterQ = 1 } = {}) {
    if (!this.actx || this.muted) return;
    const now = this.actx.currentTime;
    const osc = this.actx.createOscillator();
    const g = this.actx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (freqEnd !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), now + dur);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(vol, now + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    let node = osc;
    if (filterType) {
      const flt = this.actx.createBiquadFilter();
      flt.type = filterType;
      flt.frequency.value = filterFreq;
      flt.Q.value = filterQ;
      osc.connect(flt); flt.connect(g);
    } else {
      osc.connect(g);
    }
    g.connect(this.master);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  noise({ dur = 0.25, vol = 0.3, filterFreq = 1200, filterType = 'lowpass', sweepTo = null, filterQ = 1 } = {}) {
    if (!this.actx || this.muted) return;
    const now = this.actx.currentTime;
    const len = Math.max(1, Math.floor(this.actx.sampleRate * dur));
    const buffer = this.actx.createBuffer(1, len, this.actx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.actx.createBufferSource();
    src.buffer = buffer;
    const flt = this.actx.createBiquadFilter();
    flt.type = filterType;
    flt.frequency.setValueAtTime(filterFreq, now);
    flt.Q.value = filterQ;
    if (sweepTo !== null) flt.frequency.exponentialRampToValueAtTime(Math.max(1, sweepTo), now + dur);
    const g = this.actx.createGain();
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.connect(flt); flt.connect(g); g.connect(this.master);
    src.start(now);
    src.stop(now + dur + 0.02);
  }

  // ---- sound definitions ----
  get SFX() {
    return {
      shoot:        () => { this.tone({ type: 'square', freq: 900, freqEnd: 170, dur: 0.07, vol: 0.16, filterType: 'lowpass', filterFreq: 2800 }); this.noise({ dur: 0.06, vol: 0.2, filterFreq: 3200, sweepTo: 600, filterQ: 1 }); },
      dryFire:      () => this.tone({ type: 'square', freq: 220, freqEnd: 120, dur: 0.05, vol: 0.08, filterType: 'highpass', filterFreq: 400 }),
      enemyHit:     () => this.tone({ type: 'triangle', freq: 1050, freqEnd: 620, dur: 0.045, vol: 0.12, filterType: 'bandpass', filterFreq: 1300, filterQ: 2 }),
      critHit:      () => { this.tone({ type: 'sawtooth', freq: 1350, freqEnd: 720, dur: 0.07, vol: 0.16, filterType: 'bandpass', filterFreq: 1700, filterQ: 2 }); },
      enemyDeath:   () => { this.tone({ type: 'sawtooth', freq: 380, freqEnd: 90, dur: 0.2, vol: 0.18, filterType: 'lowpass', filterFreq: 1400 }); this.noise({ dur: 0.18, vol: 0.12, filterFreq: 1800, sweepTo: 300 }); },
      playerDamage: () => this.tone({ type: 'sawtooth', freq: 300, freqEnd: 70, dur: 0.3, vol: 0.24, filterType: 'lowpass', filterFreq: 700 }),
      shieldDamage: () => this.tone({ type: 'sine', freq: 1200, freqEnd: 600, dur: 0.16, vol: 0.14, filterType: 'highpass', filterFreq: 500 }),
      shieldRecharge: () => this.tone({ type: 'sine', freq: 500, freqEnd: 1100, dur: 0.5, vol: 0.08 }),
      dash:         () => { this.tone({ type: 'sine', freq: 240, freqEnd: 760, dur: 0.2, vol: 0.18 }); this.noise({ dur: 0.14, vol: 0.08, filterFreq: 2600, sweepTo: 600 }); },
      reloadStart:   () => this.tone({ type: 'square', freq: 320, freqEnd: 200, dur: 0.07, vol: 0.1, filterType: 'lowpass', filterFreq: 1600 }),
      reloadComplete: () => { this.tone({ type: 'square', freq: 520, freqEnd: 780, dur: 0.09, vol: 0.12 }); this.tone({ type: 'triangle', freq: 900, dur: 0.06, vol: 0.08 }); },
      terminalActivate: () => { this.tone({ type: 'triangle', freq: 440, dur: 0.14, vol: 0.18 }); this.tone({ type: 'triangle', freq: 660, dur: 0.18, vol: 0.18 }); },
      terminalActivation: () => { this.tone({ type: 'triangle', freq: 440, dur: 0.14, vol: 0.18 }); this.tone({ type: 'triangle', freq: 660, dur: 0.18, vol: 0.18 }); },
      terminalUpload: () => this.tone({ type: 'sine', freq: 660, freqEnd: 990, dur: 0.12, vol: 0.07 }),
      objective:    () => { this.tone({ type: 'triangle', freq: 523, dur: 0.12, vol: 0.18 }); this.tone({ type: 'triangle', freq: 784, dur: 0.16, vol: 0.18 }); this.tone({ type: 'triangle', freq: 1046, dur: 0.22, vol: 0.18 }); },
      objectiveUpdate: () => { this.tone({ type: 'triangle', freq: 523, dur: 0.12, vol: 0.18 }); this.tone({ type: 'triangle', freq: 784, dur: 0.16, vol: 0.18 }); this.tone({ type: 'triangle', freq: 1046, dur: 0.22, vol: 0.18 }); },
      bossAppear:   () => this.tone({ type: 'sawtooth', freq: 70, freqEnd: 180, dur: 0.8, vol: 0.26, filterType: 'lowpass', filterFreq: 700 }),
      bossAttack:   () => this.tone({ type: 'square', freq: 300, freqEnd: 150, dur: 0.18, vol: 0.14, filterType: 'lowpass', filterFreq: 1400 }),
      bossDeath:    () => { this.tone({ type: 'sawtooth', freq: 260, freqEnd: 40, dur: 1.0, vol: 0.3, filterType: 'lowpass', filterFreq: 900 }); this.noise({ dur: 0.9, vol: 0.28, filterFreq: 1600, sweepTo: 100 }); },
      missionComplete: () => { this.tone({ type: 'triangle', freq: 523, dur: 0.16, vol: 0.2 }); this.tone({ type: 'triangle', freq: 659, dur: 0.16, vol: 0.2 }); this.tone({ type: 'triangle', freq: 784, dur: 0.16, vol: 0.2 }); this.tone({ type: 'triangle', freq: 1046, dur: 0.4, vol: 0.22 }); },
      levelUp:      () => { this.tone({ type: 'triangle', freq: 523, dur: 0.12, vol: 0.18 }); this.tone({ type: 'triangle', freq: 784, dur: 0.16, vol: 0.18 }); this.tone({ type: 'triangle', freq: 1046, dur: 0.22, vol: 0.18 }); },
      upgrade:      () => this.tone({ type: 'square', freq: 660, freqEnd: 990, dur: 0.16, vol: 0.16, filterType: 'lowpass', filterFreq: 2200 }),
      hover:        () => this.tone({ type: 'sine', freq: 620, dur: 0.05, vol: 0.05 }),
      click:        () => this.tone({ type: 'square', freq: 480, freqEnd: 720, dur: 0.08, vol: 0.12 }),
      bossSpawnDrone: () => this.tone({ type: 'sawtooth', freq: 200, freqEnd: 90, dur: 0.3, vol: 0.16, filterType: 'lowpass', filterFreq: 1200 }),
      ammoPickup:    () => { this.tone({ type: 'triangle', freq: 660, freqEnd: 990, dur: 0.1, vol: 0.12 }); this.tone({ type: 'square', freq: 1320, dur: 0.05, vol: 0.06 }); },
    };
  }

  play(name) {
    if (this.muted || !this.actx) return;
    const fn = this.SFX[name];
    if (!fn) return;
    const gap = this.MIN_INTERVAL[name];
    if (gap !== undefined) {
      const now = this.actx.currentTime;
      if (this.lastPlay[name] !== undefined && now - this.lastPlay[name] < gap) return;
      this.lastPlay[name] = now;
    }
    fn();
  }

  get MIN_INTERVAL() {
    return { shoot: 0.04, enemyHit: 0.04, critHit: 0.04, dryFire: 0.12, reloadComplete: 0.1, terminalUpload: 0.12, bossAttack: 0.1 };
  }

  setMuted(m) {
    this.muted = m;
    localStorage.setItem('cb_muted', m ? '1' : '0');
    if (this.master && this.actx) this.master.gain.setValueAtTime(m ? 0 : 0.55, this.actx.currentTime);
  }

  toggle() { this.setMuted(!this.muted); return this.muted; }
  isMuted() { return this.muted; }
}
