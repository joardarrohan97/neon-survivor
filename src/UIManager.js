// =========================================================
//  NEON SURVIVOR: CORE BREACH — UIManager
//  Full 3D game HUD + overlay controller
//  Safely handles missing optional DOM elements.
// =========================================================
export class UIManager {
  constructor() {
    const $ = (id) => document.getElementById(id);
    this.el = {
      hud: $('hud'),
      hpBar: $('hp-bar'), hpText: $('hp-text'),
      shieldBar: $('shield-bar'), shieldText: $('shield-text'),
      weaponName: $('weapon-name'),
      weaponHud: $('weapon-hud'),
      ammoCur: $('ammo-cur'), ammoMax: $('ammo-max'), ammoStatus: null,
      reloadInd: $('reload-ind'), reloadFill: $('reload-fill'), reloadHint: $('reload-hint'),
      lvlNum: $('lvl-num'), xpBar: $('xp-bar'),
      dashBar: $('dash-bar'), dashText: $('dash-text'), abilityHud: $('ability-hud'),
      scoreValue: $('score-value'), killsValue: $('kills-value'), scoreHud: $('score-hud'),
      objectiveHud: $('objective-hud'),
      objTitle: $('obj-title'), objSub: $('obj-sub'),
      objTarget: $('obj-target'), objDist: $('obj-dist'),
      crosshair: $('crosshair'),
      prompt: $('prompt'),
      notification: $('notification'),
      bossWrap: $('boss-bar-wrap'), bossName: $('boss-name'), bossBar: $('boss-bar'),
      edgeMarker: $('edge-marker'), edgeArrow: $('edge-arrow'), edgeLabel: $('edge-label'),
      floaters: $('floaters'),
      dmgVignette: $('damage-vignette'),
      shieldFlash: $('shield-flash'), dmgDir: $('dmg-dir'),
      muteBtn: $('mute-btn'), muteIcon: $('mute-icon'),
      compass: $('compass'), compassStrip: $('compass-strip'), compassObj: $('compass-obj'),
      killfeed: $('killfeed'),
      levelup: $('levelup'), upgradeCards: $('upgrade-cards'),
      gameover: $('gameover'),
      goScore: $('go-score'), goTerminals: $('go-terminals'), goLevel: $('go-level'), goKills: $('go-kills'), goBest: $('go-best'),
      complete: $('complete'),
      mcTime: $('mc-time'), mcKills: $('mc-kills'), mcAcc: $('mc-acc'), mcDmg: $('mc-dmg'), mcLevel: $('mc-level'),
    };

    // rotating objective-direction arrow (injected into objective HUD)
    this.objArrow = document.createElement('div');
    this.objArrow.id = 'obj-arrow';
    this.objArrow.textContent = '➤';
    if (this.el.objectiveHud) this.el.objectiveHud.appendChild(this.objArrow);

    // dynamic reload hint element (created here to keep HTML lean)
    if (this.el.hud) {
      const rh = document.createElement('div');
      rh.id = 'reload-hint';
      rh.className = 'reload-hint hidden';
      rh.innerHTML = 'R <span>RELOAD</span>';
      this.el.hud.appendChild(rh);
      this.el.reloadHint = rh;
    }

    // dynamic ammo status line (AMMO FULL / OUT OF AMMO / etc.)
    if (this.el.weaponHud) {
      const as = document.createElement('div');
      as.id = 'ammo-status';
      as.className = 'ammo-status hidden';
      this.el.weaponHud.appendChild(as);
      this.el.ammoStatus = as;
    }

    this.camera = null;
    this.objTitle = '';
    this.objSub = '';
    this._dvTimer = null;
    this._shTimer = null;
    this._fireTimer = null;
    this._hmTimer = null;
    this._killTimer = null;
    this._kfRows = [];
    this.buildCompass();
  }

  bind(camera) { this.camera = camera; }

  // ---------- HUD visibility ----------
  showHUD(show) {
    const v = show ? 'remove' : 'add';
    if (this.el.hud) this.el.hud.classList[v]('hidden');
    if (this.el.objectiveHud) this.el.objectiveHud.classList[v]('hidden');
    if (this.el.crosshair) this.el.crosshair.classList[show ? 'remove' : 'add']('hidden');
    if (this.el.compass) this.el.compass.classList[v]('hidden');
    if (this.el.killfeed) this.el.killfeed.classList[v]('hidden');
    if (this.el.scoreHud) this.el.scoreHud.classList[v]('hidden');
    if (this.el.dmgDir) this.el.dmgDir.classList.remove('show');
    if (this.el.shieldFlash) this.el.shieldFlash.classList.remove('show');
  }

  // ---------- COMPASS ----------
  buildCompass() {
    const strip = this.el.compassStrip;
    if (!strip) return;
    const labels = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
    const SPAN = 640; // px for 360deg
    for (let a = -45; a <= 720; a += 15) {
      const mod = ((a % 360) + 360) % 360;
      const major = mod % 45 === 0;
      const tick = document.createElement('div');
      tick.className = 'compass-tick' + (major ? ' card' : '');
      const left = (a / 360) * SPAN;
      tick.style.left = left + 'px';
      if (major && labels[mod]) {
        tick.innerHTML = `${labels[mod]}<div class="ct-line"></div>`;
      } else {
        tick.innerHTML = `<div class="ct-line"></div>`;
        tick.style.opacity = '0.4';
      }
      strip.appendChild(tick);
    }
  }

  updateCompass(yaw, target) {
    const strip = this.el.compassStrip;
    const wrap = this.el.compass;
    if (!strip || !wrap) return;
    const W = wrap.clientWidth || 440;
    const SPAN = 640;
    const yawDeg = ((yaw * 180 / Math.PI) % 360 + 360) % 360;
    strip.style.transform = `translateX(${W / 2 - (yawDeg / 360) * SPAN}px)`;
    if (this.el.compassObj && target && target.position) {
      const dx = target.position.x - this._playerPos.x;
      const dz = target.position.z - this._playerPos.z;
      const bearing = (Math.atan2(dx, dz) * 180 / Math.PI + 360) % 360;
      let delta = ((bearing - yawDeg + 540) % 360) - 180;
      const left = W / 2 + (delta / 360) * SPAN;
      if (left < 6 || left > W - 6) {
        this.el.compassObj.style.opacity = '0';
      } else {
        this.el.compassObj.style.opacity = '1';
        this.el.compassObj.style.left = left + 'px';
      }
    }
  }

  // ---------- Per-frame HUD refresh ----------
  update(data) {
    const { player, weapon, mission, enemyManager, score, kills, aiming, moving, sprint, yaw, state, camera } = data;
    if (camera) this.camera = camera;
    this._playerPos = player ? player.group.position : null;

    if (player) {
      this.setHealth(player.health, player.maxHealth);
      this.setShield(player.shield, player.maxShield);
      this.setLevel(player.level);
      this.setXP(player.xp / player.xpToNext);
    }
    if (weapon) {
      this.setAmmo(weapon.ammo, weapon.reserve, weapon.reloading);
      this.setWeapon(weapon.name || 'VX-7 ENERGY RIFLE');
      if (weapon.reloading) {
        const frac = 1 - Math.max(0, weapon.reloadTimer) / weapon.reloadTime;
        this.setReload(true, frac);
      } else {
        this.setReload(false, 0);
      }
    }
    if (player && player.dashMax) {
      const total = player.dashMax * (player.dashCdMult || 1);
      const frac = total > 0 ? 1 - Math.max(0, player.dashCd) / total : 1;
      this.setDash(Math.min(1, Math.max(0, frac)), player.dashCd <= 0);
    }
    if (score !== undefined) this.setScore(score, kills || 0);

    // objective + distance
    if (mission && player) {
      const tgt = mission.target;
      let dist = '';
      if (tgt && tgt.position) {
        const dx = tgt.position.x - player.group.position.x;
        const dz = tgt.position.z - player.group.position.z;
        dist = Math.round(Math.hypot(dx, dz)) + 'm';
      }
      if (this.el.objTitle) this.el.objTitle.textContent = this.objTitle;
      if (this.el.objSub) this.el.objSub.textContent = this.objSub;
      if (this.el.objTarget) this.el.objTarget.textContent = tgt ? tgt.label : '';
      if (this.el.objDist) this.el.objDist.textContent = dist;
      this.updateObjArrow(tgt);
      this.updateCompass(yaw || 0, tgt);
    }

    // crosshair ADS
    if (this.el.crosshair) this.el.crosshair.classList.toggle('ads', !!aiming);

    // prompt
    if (mission && mission.getPrompt) {
      const p = mission.getPrompt();
      if (p) this.showPrompt(p); else this.hidePrompt();
    }

    // boss bar
    if (enemyManager && enemyManager.boss) {
      this.showBoss(enemyManager.boss.name || 'NULL WARDEN');
      this.setBossHealth(enemyManager.boss.health / enemyManager.boss.maxHealth);
    } else {
      this.hideBoss();
    }

    // screen-edge objective indicator
    if (state === 'playing' && mission && mission.target) {
      this.updateEdge(mission.target.label, mission.target.position);
    } else {
      this.hideEdge();
    }
  }

  // ---------- Bars / values ----------
  setHealth(hp, max) {
    const f = max > 0 ? Math.max(0, hp / max) : 0;
    if (this.el.hpBar) this.el.hpBar.style.width = (f * 100) + '%';
    if (this.el.hpText) this.el.hpText.textContent = Math.max(0, Math.round(hp)) + ' / ' + Math.round(max);
  }

  setShield(sh, max) {
    const f = max > 0 ? Math.max(0, sh / max) : 0;
    if (this.el.shieldBar) {
      this.el.shieldBar.style.width = (f * 100) + '%';
      this.el.shieldBar.classList.remove('flash');
    }
    if (this.el.shieldText) this.el.shieldText.textContent = Math.max(0, Math.round(sh)) + ' / ' + Math.round(max);
  }

  setAmmo(cur, reserve, reloading) {
    if (this.el.ammoCur) {
      this.el.ammoCur.textContent = cur;
      this.el.ammoCur.classList.toggle('empty', cur <= 0);
      this.el.ammoCur.classList.toggle('low', cur > 0 && cur <= 6);
    }
    if (this.el.ammoMax) this.el.ammoMax.textContent = reserve;

    const MAX_RESERVE = 300;
    if (this.el.ammoMax) this.el.ammoMax.classList.toggle('ammo-flash', reserve < 30 && reserve < MAX_RESERVE);

    const s = this.el.ammoStatus;
    if (s) {
      let text = '', cls = 'ammo-status';
      if (reserve >= MAX_RESERVE) { text = 'AMMO FULL'; cls += ' full'; }
      else if (cur <= 0 && reserve <= 0) { text = 'SEARCH FOR AMMO'; cls += ' search'; }
      else if (cur <= 0 && reserve > 0) { text = 'PRESS R TO RELOAD'; cls += ' reload'; }
      else if (reserve === 0) { text = 'OUT OF AMMO'; cls += ' out'; }
      else if (reserve < 20) { text = 'LOW AMMO'; cls += ' low'; }
      if (text) { s.textContent = text; s.className = cls; }
      else s.className = 'ammo-status hidden';
    }

    if (this.el.reloadHint) this.el.reloadHint.classList.toggle('hidden', !(cur <= 0 && !reloading));
  }

  setReload(active, frac) {
    if (this.el.reloadInd) this.el.reloadInd.classList.toggle('hidden', !active);
    if (active && this.el.reloadFill) this.el.reloadFill.style.width = (Math.max(0, Math.min(1, frac)) * 100) + '%';
  }

  setWeapon(name) {
    if (this.el.weaponName) this.el.weaponName.textContent = name;
  }

  setLevel(lvl) {
    if (this.el.lvlNum) this.el.lvlNum.textContent = lvl;
  }

  setXP(frac) {
    if (this.el.xpBar) this.el.xpBar.style.width = (Math.min(1, Math.max(0, frac)) * 100) + '%';
  }

  setDash(frac, ready) {
    if (this.el.dashBar) {
      this.el.dashBar.style.width = (frac * 100) + '%';
      this.el.dashBar.classList.toggle('cooling', !ready);
    }
    if (this.el.dashText) {
      this.el.dashText.textContent = ready ? 'READY' : Math.round(frac * 100) + '%';
      this.el.dashText.classList.toggle('ready', ready);
      this.el.dashText.classList.toggle('cooling', !ready);
    }
    if (this.el.abilityHud) this.el.abilityHud.classList.toggle('ready', ready);
  }

  setScore(score, kills) {
    if (this.el.scoreValue) this.el.scoreValue.textContent = score;
    if (this.el.killsValue) this.el.killsValue.textContent = kills + ' KILLS';
  }

  // ---------- Objective ----------
  setObjective(title, sub) {
    if (title !== undefined && title !== null) this.objTitle = title;
    if (sub !== undefined && sub !== null) this.objSub = sub;
    if (this.el.objTitle) this.el.objTitle.textContent = this.objTitle;
    if (this.el.objSub) this.el.objSub.textContent = this.objSub;
  }

  // ---------- Objective direction arrow ----------
  updateObjArrow(tgt) {
    if (!this.objArrow || !this.camera || !tgt || !tgt.position) return;
    const v = tgt.position.clone().project(this.camera);
    const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
    const sx = (v.x * 0.5 + 0.5) * window.innerWidth;
    const sy = (-v.y * 0.5 + 0.5) * window.innerHeight;
    const ang = Math.atan2(sy - cy, sx - cx) + Math.PI / 2;
    this.objArrow.style.transform = `rotate(${ang}rad)`;
  }

  // ---------- Notifications ----------
  showNotification(text, color) {
    const el = this.el.notification;
    if (!el) return;
    el.textContent = text;
    const c = color === 'red' ? 'var(--red)'
      : color === 'green' ? 'var(--green)'
      : color === 'amber' ? 'var(--amber)'
      : 'var(--cyan)';
    el.style.color = c;
    el.style.textShadow = `0 0 18px ${c}, 0 0 40px var(--blue)`;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }

  // ---------- Prompt ----------
  showPrompt(text) {
    const el = this.el.prompt;
    if (!el) return;
    if (el.dataset.text !== text) {
      el.dataset.text = text;
      el.innerHTML = '<span class="pkey">E</span> ' + text;
    }
    el.classList.remove('hidden');
  }
  hidePrompt() {
    if (this.el.prompt) this.el.prompt.classList.add('hidden');
  }

  // ---------- Boss bar ----------
  showBoss(name) {
    if (this.el.bossWrap) this.el.bossWrap.classList.remove('hidden');
    if (this.el.bossName && name) this.el.bossName.textContent = name;
  }
  hideBoss() {
    if (this.el.bossWrap) this.el.bossWrap.classList.add('hidden');
  }
  setBossHealth(frac) {
    if (this.el.bossBar) this.el.bossBar.style.width = (Math.min(1, Math.max(0, frac)) * 100) + '%';
  }

  // ---------- Damage / shield feedback ----------
  flashDamage(shield, dir) {
    if (shield) {
      if (this.el.shieldFlash) {
        this.el.shieldFlash.classList.add('show');
        if (this._shTimer) clearTimeout(this._shTimer);
        this._shTimer = setTimeout(() => { this.el.shieldFlash.classList.remove('show'); }, 130);
      }
    } else {
      const d = this.el.dmgDir;
      if (!d) return;
      const side = dir || 'front';
      d.classList.remove('top', 'bottom', 'left', 'right');
      d.classList.add(side, 'show');
      if (this._dvTimer) clearTimeout(this._dvTimer);
      this._dvTimer = setTimeout(() => {
        d.classList.remove('show', 'top', 'bottom', 'left', 'right');
      }, 360);
    }
  }

  // ---------- Hit marker on crosshair ----------
  hitMarker(isCrit) {
    const c = this.el.crosshair;
    if (!c) return;
    c.classList.remove('hit', 'crit');
    void c.offsetWidth;
    c.classList.add(isCrit ? 'crit' : 'hit');
    if (this._hmTimer) clearTimeout(this._hmTimer);
    this._hmTimer = setTimeout(() => c.classList.remove('hit', 'crit'), 220);
  }

  crosshairFire() {
    const c = this.el.crosshair;
    if (!c) return;
    c.classList.add('firing');
    if (this._fireTimer) clearTimeout(this._fireTimer);
    this._fireTimer = setTimeout(() => c.classList.remove('firing'), 70);
  }

  crosshairKill(text) {
    const c = this.el.crosshair;
    if (!c) return;
    const k = document.getElementById('ch-kill');
    if (k) k.textContent = text;
    c.classList.remove('kill');
    void c.offsetWidth;
    c.classList.add('kill');
    if (this._killTimer) clearTimeout(this._killTimer);
    this._killTimer = setTimeout(() => c.classList.remove('kill'), 900);
  }

  // ---------- Kill feed ----------
  addKill(type, elite) {
    const cont = this.el.killfeed;
    if (!cont) return;
    const names = { drone: 'NULL DRONE', rifleman: 'NULL STALKER', brute: 'NULL BRUTE', boss: 'NULL WARDEN' };
    const ename = names[type] || 'NULL HOSTILE';
    const row = document.createElement('div');
    row.className = 'kf-row';
    row.innerHTML = `<span class="kf-p">AXIOM-7</span><span class="kf-sep">&gt;</span><span class="kf-e">${ename}</span>`;
    cont.appendChild(row);
    this._kfRows.push(row);
    while (this._kfRows.length > 4) {
      const old = this._kfRows.shift();
      if (old.parentNode) old.parentNode.removeChild(old);
    }
    setTimeout(() => {
      row.classList.add('fade');
      setTimeout(() => { if (row.parentNode) row.parentNode.removeChild(row); }, 600);
    }, 3200);
  }

  // ---------- Mute ----------
  setMuted(muted) {
    if (this.el.muteBtn) this.el.muteBtn.classList.toggle('muted', !!muted);
    if (this.el.muteIcon) this.el.muteIcon.innerHTML = muted ? '&#128263;' : '&#9834;';
  }

  // ---------- Floating world-anchored text (e.g. ammo pickups) ----------
  floatText(worldPos, text, color) {
    const cont = this.el.floaters;
    if (!cont || !this.camera) return;
    const v = worldPos.clone().project(this.camera);
    if (v.z > 1) return;
    const x = (v.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-v.y * 0.5 + 0.5) * window.innerHeight;
    const el = document.createElement('div');
    el.className = 'ammo-float';
    el.textContent = text;
    el.style.color = color || 'var(--gold)';
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    cont.appendChild(el);
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 1100);
  }

  floatDamage(worldPos, amount, isCrit) {
    const cont = this.el.floaters;
    if (!cont || !this.camera) return;
    const v = worldPos.clone().project(this.camera);
    if (v.z > 1) return;
    const x = (v.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-v.y * 0.5 + 0.5) * window.innerHeight;
    const el = document.createElement('div');
    el.className = 'dmg-num' + (isCrit ? ' crit' : '');
    el.textContent = amount;
    el.style.color = isCrit ? 'var(--amber)' : 'var(--red)';
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    cont.appendChild(el);
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 900);
  }

  // ---------- Screen-edge objective indicator ----------
  updateEdge(label, targetPos) {
    const el = this.el.edgeMarker;
    if (!el || !this.camera || !targetPos) { this.hideEdge(); return; }
    const v = targetPos.clone().project(this.camera);
    const behind = v.z > 1;
    let x = (v.x * 0.5 + 0.5) * window.innerWidth;
    let y = (-v.y * 0.5 + 0.5) * window.innerHeight;
    if (behind) { x = window.innerWidth - x; y = window.innerHeight - y; }
    const onScreen = !behind && x >= 0 && x <= window.innerWidth && y >= 0 && y <= window.innerHeight;
    if (onScreen) { this.hideEdge(); return; }
    el.classList.remove('hidden');
    const margin = 56;
    const ex = Math.max(margin, Math.min(window.innerWidth - margin, x));
    const ey = Math.max(margin, Math.min(window.innerHeight - margin, y));
    el.style.left = ex + 'px';
    el.style.top = ey + 'px';
    const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
    const ang = Math.atan2(ey - cy, ex - cx) + Math.PI / 2;
    if (this.el.edgeArrow) this.el.edgeArrow.style.transform = `rotate(${ang}rad)`;
    if (this.el.edgeLabel) this.el.edgeLabel.textContent = label || 'OBJECTIVE';
  }
  hideEdge() {
    if (this.el.edgeMarker) this.el.edgeMarker.classList.add('hidden');
  }

  // ---------- Level up ----------
  showLevelUp(cards, onPick) {
    const wrap = this.el.levelup;
    const cont = this.el.upgradeCards;
    if (!wrap || !cont) return;
    cont.innerHTML = '';
    cards.forEach((card, i) => {
      const c = document.createElement('div');
      c.className = `card rarity-${card.rarity} c-${i + 1}`;
      c.innerHTML =
        `<div class="card-key">${i + 1}</div>` +
        `<div class="card-rarity">${card.rarity.toUpperCase()}</div>` +
        `<div class="card-icon">${card.icon || '★'}</div>` +
        `<div class="card-name">${card.name}</div>` +
        `<div class="card-desc">${card.desc}</div>`;
      c.addEventListener('click', () => { if (onPick) onPick(card); });
      cont.appendChild(c);
    });
    wrap.classList.remove('hidden');
  }
  hideLevelUp() {
    if (this.el.levelup) this.el.levelup.classList.add('hidden');
  }

  // ---------- Game over / complete ----------
  showGameOver(stats) {
    const e = this.el;
    if (!e.gameover) return;
    if (e.goScore) e.goScore.textContent = stats.score;
    if (e.goTerminals) e.goTerminals.textContent = stats.terminals + ' / 3';
    if (e.goLevel) e.goLevel.textContent = stats.level;
    if (e.goKills) e.goKills.textContent = stats.kills;
    if (e.goBest) e.goBest.textContent = stats.best;
    e.gameover.classList.remove('hidden');
  }
  hideGameOver() {
    if (this.el.gameover) this.el.gameover.classList.add('hidden');
  }
  showComplete(stats) {
    const e = this.el;
    if (!e.complete) return;
    if (e.mcTime) e.mcTime.textContent = stats.time;
    if (e.mcKills) e.mcKills.textContent = stats.kills;
    if (e.mcAcc) e.mcAcc.textContent = stats.acc + '%';
    if (e.mcDmg) e.mcDmg.textContent = stats.dmg;
    if (e.mcLevel) e.mcLevel.textContent = stats.level;
    e.complete.classList.remove('hidden');
  }
  hideComplete() {
    if (this.el.complete) this.el.complete.classList.add('hidden');
  }
}
