// =========================================================
//  NEON SURVIVOR: CORE BREACH — Game
//  Three.js scene integration, game loop, state machine
// =========================================================
import * as THREE from 'three';
import { AudioManager } from './AudioManager.js';
import { AssetManager } from './AssetManager.js';
import { World } from './World.js';
import { Player } from './Player.js';
import { Weapon } from './Weapon.js';
import { EnemyManager } from './EnemyManager.js';
import { MissionManager } from './MissionManager.js';
import { AmmoPickup } from './AmmoPickup.js';
import { ProjectileManager } from './Projectile.js';
import { UIManager } from './UIManager.js';
import { fitToGround } from './AssetManager.js';

const ZERO_MV = new THREE.Vector3();

export class Game {
  constructor() {
    this.state = 'menu'; // menu | playing | paused | levelup | gameover | complete
    this.clock3 = new THREE.Clock();
    this.elapsed = 0;
    this.clock = 0; // scalar accumulator referenced by other modules
    this.keys = new Set();
    this.firing = false;
    this.aiming = false;
    this.yaw = 0;
    this.pitch = 0.15;
    this.sens = 0.0022;
    // over-the-shoulder third-person shooter framing
    this.camDist = 6.2;
    this.adsDist = 3.2;
    this.camHeight = 2.35;
    this.adsCamHeight = 1.95;
    this.shoulder = 1.25;     // horizontal shoulder offset (OTS)
    this.adsShoulder = 0.6;
    this.lookAhead = 11;
    this.baseFov = 70;
    this.adsFov = 50;
    this.shake = 0;
    this.shakeMax = 1.1;
    this.camRecoil = 0;       // decaying camera recoil impulse
    this.introT = 0;          // opening cinematic timer
    this.introSpawnT = 0;
    this.pendingIntroSpawns = 0;
    this._introMsg2 = false;
    this._camDesired = new THREE.Vector3();
    this._camLook = new THREE.Vector3();
    this._camRight = new THREE.Vector3();

    this.score = 0;
    this.kills = 0;
    this.shotsFired = 0;
    this.shotsHit = 0;
    this.damageDealt = 0;
    this.bossDefeated = false;
    this.pendingLevels = 0;
    this.pendingInteract = false;

    this.impactPool = [];
    this.telegraphs = [];
    this._tmpVec = new THREE.Vector3();
    this._tmpVec2 = new THREE.Vector3();
    this._centerNDC = new THREE.Vector2(0, 0);
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 250;
  }

  // ---------------------------------------------------------
  //  INIT — build scene graph + bind input. Called once.
  // ---------------------------------------------------------
  init() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.domElement.id = 'game';
    this.renderer.domElement.style.position = 'fixed';
    this.renderer.domElement.style.inset = '0';
    this.renderer.domElement.style.zIndex = '0';
    const wrap = document.getElementById('game-wrap') || document.body;
    wrap.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(this.baseFov, window.innerWidth / window.innerHeight, 0.1, 600);
    this.camera.position.set(0, 6, 70);

    this.audio = new AudioManager();
    this.ui = new UIManager();
    this.ui.bind(this.camera);

    this.assets = new AssetManager();
    this.world = new World(this.scene, this.assets);
    this.player = new Player(this.scene, this.audio);
    this.player.reset();
    this.player.group.position.set(0, 0, 60);
    this.weapon = new Weapon(this.player.weaponMount, this.player, this.audio);
    this.weapon.name = 'VX-7 ENERGY RIFLE';
    this.player.setMuzzleProvider((t) => this.weapon.getMuzzleWorld(t));

    this.enemyManager = new EnemyManager(this.scene, this);
    this.mission = new MissionManager(this.scene, this);
    this.projectiles = new ProjectileManager(this.scene, this);

    this.upgrades = this.buildUpgrades();

    this.healthPickups = [];
    this.ammoPickups = [];
    this._pickupPos = [
      new THREE.Vector3(-30, 0, 28),
      new THREE.Vector3(30, 0, 28),
      new THREE.Vector3(0, 0, -40),
      new THREE.Vector3(0, 0, 18),
    ];

    this.bindInput();
    window.addEventListener('resize', () => this.onResize());
    this.ui.setMuted(this.audio.isMuted());

    this.loop = this.loop.bind(this);
    this.clock3.start();
    requestAnimationFrame(this.loop);

    // preload real glTF combat assets, then enable DEPLOY
    this._assetsReady = false;
    this._startPreload();
  }

  buildUpgrades() {
    return [
      { id: 'dmg', name: 'OVERCHARGE', rarity: 'common', icon: '⚡', desc: '+20% weapon damage', apply: p => { p.damageMult *= 1.2; } },
      { id: 'rof', name: 'OVERCLOCK', rarity: 'common', icon: '⟳', desc: '+18% fire rate', apply: p => { p.fireRateMult *= 1.18; } },
      { id: 'mag', name: 'EXTENDED MAG', rarity: 'common', icon: '▮', desc: '+50% magazine size', apply: p => { p.magSizeMult *= 1.5; } },
      { id: 'move', name: 'SERVO BOOST', rarity: 'common', icon: '⏩', desc: '+12% move speed', apply: p => { p.moveMult *= 1.12; } },
      { id: 'reload', name: 'FAST HANDS', rarity: 'common', icon: '↻', desc: '+25% reload speed', apply: p => { p.reloadMult *= 1.25; } },
      { id: 'crit', name: 'TARGETING', rarity: 'common', icon: '✛', desc: '+8% critical chance', apply: p => { p.critChance += 0.08; } },
      { id: 'hp', name: 'NANO WEAVE', rarity: 'rare', icon: '❤', desc: '+30 max integrity', apply: p => { p.maxHealth += 30; p.heal(30); } },
      { id: 'shield', name: 'SHIELD CELL', rarity: 'rare', icon: '🛡', desc: '+30 max shield', apply: p => { p.maxShield += 30; p.shield += 30; } },
      { id: 'dash', name: 'PHASE DRIVE', rarity: 'rare', icon: '➤', desc: '-20% dash cooldown', apply: p => { p.dashCdMult *= 0.8; } },
      { id: 'critd', name: 'KINETIC ROUND', rarity: 'rare', icon: '✸', desc: '+1.0 critical damage', apply: p => { p.critMult += 1.0; } },
      { id: 'epic1', name: 'ANNIHILATION', rarity: 'epic', icon: '☢', desc: '+60% damage', apply: p => { p.damageMult *= 1.6; } },
      { id: 'epic2', name: 'HYPERFIRE', rarity: 'epic', icon: '✺', desc: '+40% fire rate', apply: p => { p.fireRateMult *= 1.4; } },
      { id: 'epic3', name: 'BULLETSTORM', rarity: 'epic', icon: '☄', desc: '+100% mag, +15% damage', apply: p => { p.magSizeMult *= 2; p.damageMult *= 1.15; } },
    ];
  }

  // ---------------------------------------------------------
  //  INPUT
  // ---------------------------------------------------------
  bindInput() {
    const canvas = this.renderer.domElement;

    canvas.addEventListener('mousedown', (e) => {
      if (this.state !== 'playing') return;
      if (document.pointerLockElement !== canvas) { this.requestLock(); return; }
      if (e.button === 0) this.firing = true;
      else if (e.button === 2) this.aiming = true;
    });
    canvas.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.firing = false;
      else if (e.button === 2) this.aiming = false;
    });
    canvas.addEventListener('click', () => {
      if (this.state === 'paused') this.resume();
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== canvas) return;
      const s = this.aiming ? this.sens * 0.6 : this.sens;
      this.yaw -= e.movementX * s;
      this.pitch -= e.movementY * s;
      this.pitch = THREE.MathUtils.clamp(this.pitch, -0.45, 0.95);
    });

    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement !== canvas && this.state === 'playing') this.pause();
    });

    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));

    window.addEventListener('blur', () => { this.firing = false; this.keys.clear(); });
  }

  onKeyDown(e) {
    if (e.code === 'KeyM') { this.toggleMute(); return; }
    if (e.code === 'Escape') {
      if (this.state === 'playing') this.pause();
      else if (this.state === 'paused') this.resume();
      return;
    }
    if (this.state !== 'playing') return;
    this.keys.add(e.code);
    if (e.code === 'Space') this.doDash();
    if (e.code === 'KeyR') this.weapon.startReload();
    if (e.code === 'KeyE') this.pendingInteract = true;
  }

  requestLock() {
    const canvas = this.renderer.domElement;
    if (canvas.requestPointerLock) canvas.requestPointerLock();
  }

  // ---------------------------------------------------------
  //  STATE TRANSITIONS
  // ---------------------------------------------------------
  start() {
    this.resetRun();
    this.state = 'playing';
    this.ui.showHUD(true);
    this.ui.hideGameOver();
    this.ui.hideComplete();
    this.ui.hideLevelUp();
    this.audio.unlock();
    this.audio.resume();
    // ---- opening deploy cinematic ----
    this.introT = 2.8;
    this.introSpawnT = 1.4;
    this.pendingIntroSpawns = 3;
    this._introMsg2 = false;
    this.yaw = Math.PI; // face into the arena
    this.pitch = 0.12;
    this.ui.showNotification('SECTOR 7 // NULL OCCUPATION ZONE', 'cyan');
    this.requestLock();
  }

  resetRun() {
    this.player.reset();
    this.player.group.position.set(0, 0, 60);
    this.weapon.reset();
    this.enemyManager.clear();
    this.projectiles.clear();
    this.mission.start();
    this.bossDefeated = false;
    this.score = 0;
    this.kills = 0;
    this.shotsFired = 0;
    this.shotsHit = 0;
    this.damageDealt = 0;
    this.pendingLevels = 0;
    this.pendingInteract = false;
    this.firing = false;
    this.aiming = false;
    this.yaw = Math.PI;
    this.pitch = 0.15;
    this.shake = 0;
    this.camRecoil = 0;
    this.resetHealthPickups();
    this.resetAmmoPickups();
    this.introT = 0;
    this.introSpawnT = 0;
    this.pendingIntroSpawns = 0;
    this._introMsg2 = false;
    this.elapsed = 0;
    this.clock = 0;
    for (const m of this.impactPool) { m.active = false; m.mesh.visible = false; }
  }

  pause() {
    this.state = 'paused';
    if (document.pointerLockElement) document.exitPointerLock();
    const p = document.getElementById('pause');
    if (p) p.classList.remove('hidden');
  }

  resume() {
    const p = document.getElementById('pause');
    if (p) p.classList.add('hidden');
    this.state = 'playing';
    this.audio.resume();
    this.requestLock();
  }

  restart() {
    const p = document.getElementById('pause');
    if (p) p.classList.add('hidden');
    this.ui.hideGameOver();
    this.ui.hideComplete();
    this.ui.hideLevelUp();
    this.start();
  }

  toMenu() {
    this.state = 'menu';
    if (document.pointerLockElement) document.exitPointerLock();
    this.ui.showHUD(false);
    this.ui.hideGameOver();
    this.ui.hideComplete();
    this.ui.hideLevelUp();
    const p = document.getElementById('pause');
    if (p) p.classList.add('hidden');
    const menu = document.getElementById('menu');
    if (menu) menu.classList.remove('hidden');
  }

  toggleMute() {
    const muted = this.audio.toggle();
    this.ui.setMuted(muted);
  }

  gameOver() {
    if (this.state === 'gameover') return;
    this.state = 'gameover';
    if (document.pointerLockElement) document.exitPointerLock();
    this.firing = false;
    const best = this.saveBest();
    this.ui.showGameOver({
      score: this.score,
      terminals: this.mission.terminalsRestored,
      level: this.player.level,
      kills: this.kills,
      best,
    });
  }

  missionComplete() {
    if (this.state === 'complete') return;
    this.state = 'complete';
    if (document.pointerLockElement) document.exitPointerLock();
    this.firing = false;
    this.audio.play('missionComplete');
    const acc = this.shotsFired > 0 ? Math.round((this.shotsHit / this.shotsFired) * 100) : 0;
    const t = Math.floor(this.elapsed);
    const time = Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
    this.ui.showComplete({
      time, kills: this.kills, acc, dmg: Math.round(this.damageDealt), level: this.player.level,
    });
  }

  saveBest() {
    let best = 0;
    try { best = parseInt(localStorage.getItem('cb_best') || '0', 10) || 0; } catch (e) {}
    if (this.score > best) { best = this.score; try { localStorage.setItem('cb_best', String(best)); } catch (e) {} }
    return best;
  }

  // ---------------------------------------------------------
  //  ASSET PRELOAD + LOADING SCREEN
  // ---------------------------------------------------------
  _startPreload() {
    const fill = document.getElementById('load-fill');
    const pct = document.getElementById('load-pct');
    const screen = document.getElementById('loading-screen');
    const deploy = document.getElementById('btn-deploy');
    if (deploy) deploy.disabled = true;

    this.assets.preload((done, total) => {
      const p = Math.round((done / total) * 100);
      if (fill) fill.style.width = p + '%';
      if (pct) pct.textContent = p + '%';
    }).then(() => {
      this._assetsReady = true;
      if (screen) screen.classList.add('hidden');
      if (deploy) deploy.disabled = false;
      // assets are cached — swap in the real models now
      this.weapon.applyAsset(this.assets);
      this.world.populateAssetProps(this.assets);
      this.resetHealthPickups();
    });
  }

  // ---------------------------------------------------------
  //  HEALTH PICKUPS (real Prop_HealthPack_Tube models)
  // ---------------------------------------------------------
  spawnHealthPickup(pos) {
    const assets = this.assets;
    if (!assets || !assets.isLoaded('health')) return;
    const model = assets.clone('health');
    if (!model) return;
    fitToGround(model, 1.2);

    const g = new THREE.Group();
    g.position.copy(pos);
    g.add(model);

    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0x39ffb0, transparent: true, opacity: 0.5 })
    );
    glow.position.y = 0.85;
    g.add(glow);

    const light = new THREE.PointLight(0x39ffb0, 1.1, 9, 2);
    light.position.y = 0.95;
    g.add(light);

    this.scene.add(g);
    this.healthPickups.push({ group: g, model, glow, baseY: model.position.y, t: Math.random() * 6 });
  }

  resetHealthPickups() {
    for (const pk of this.healthPickups) this.scene.remove(pk.group);
    this.healthPickups.length = 0;
    if (this.assets && this.assets.isLoaded('health')) {
      for (const pos of this._pickupPos) this.spawnHealthPickup(pos);
    }
  }

  updateHealthPickups(dt) {
    if (!this.healthPickups.length) return;
    const p = this.player.group.position;
    for (let i = this.healthPickups.length - 1; i >= 0; i--) {
      const pk = this.healthPickups[i];
      pk.t += dt;
      pk.model.rotation.y += dt * 1.2;
      pk.model.position.y = pk.baseY + Math.sin(pk.t * 2) * 0.12;
      pk.glow.material.opacity = 0.4 + Math.sin(pk.t * 3) * 0.2;
      const d = Math.hypot(pk.group.position.x - p.x, pk.group.position.z - p.z);
      if (d < 2.4 && this.player.health < this.player.maxHealth) {
        this.player.heal(30);
        this.audio.play('shieldRecharge');
        this.spawnImpact(pk.group.position.clone().setY(1), 0x39ffb0, 1);
        this.scene.remove(pk.group);
        this.healthPickups.splice(i, 1);
      }
    }
  }

  // ---------------------------------------------------------
  //  AMMO PICKUPS
  // ---------------------------------------------------------
  spawnAmmoPickup(pos, amount, isLarge = false) {
    const pk = new AmmoPickup(this.scene, this.assets, pos, amount, isLarge);
    this.ammoPickups.push(pk);
    return pk;
  }

  // Spawn a large ammo crate beside a completed terminal (+100 rifle ammo).
  spawnTerminalAmmo(terminalPos) {
    const pos = terminalPos.clone().add(new THREE.Vector3(3.5, 0, 0));
    const pk = this.spawnAmmoPickup(pos, 100, true);
    if (pk) this.ui.floatText(pk.group.position.clone().setY(1.8), '+100 AMMO', '#ffc23a');
  }

  rollAmmoDrop(type) {
    let chance = 0, amt = 0;
    if (type === 'drone') { chance = 0.15; amt = 15; }
    else if (type === 'rifleman') { chance = 0.30; amt = 25; }
    else if (type === 'brute') { chance = 1.0; amt = 50; }
    else return 0;
    return Math.random() < chance ? amt : 0;
  }

  updateAmmoPickups(dt) {
    if (!this.ammoPickups.length) return;
    const p = this.player.group.position;
    for (let i = this.ammoPickups.length - 1; i >= 0; i--) {
      const pk = this.ammoPickups[i];
      pk.update(dt);
      const d = Math.hypot(pk.group.position.x - p.x, pk.group.position.z - p.z);
      if (d < 2.4) {
        const added = this.weapon.addReserve(pk.amount);
        if (added > 0) {
          this.audio.play('ammoPickup');
          this.ui.floatText(pk.group.position.clone().setY(1.8), '+' + added + ' AMMO', '#ffc23a');
          this.spawnImpact(pk.group.position.clone().setY(1), 0xffc23a, 1);
          pk.dispose();
          this.ammoPickups.splice(i, 1);
        }
        // if reserve is already full, leave the crate (AMMO FULL shown in HUD)
      }
    }
  }

  resetAmmoPickups() {
    for (const pk of this.ammoPickups) pk.dispose();
    this.ammoPickups.length = 0;
  }

  // ---------------------------------------------------------
  //  LEVEL UP
  // ---------------------------------------------------------
  checkLevelUp() {
    while (this.player.xp >= this.player.xpToNext) {
      this.player.xp -= this.player.xpToNext;
      this.player.level++;
      this.player.xpToNext = Math.round(this.player.xpToNext * 1.25 + 4);
      this.pendingLevels++;
    }
    if (this.pendingLevels > 0 && this.state === 'playing') this.openLevelUp();
  }

  openLevelUp() {
    this.state = 'levelup';
    if (document.pointerLockElement) document.exitPointerLock();
    this.firing = false;
    this.audio.play('levelUp');
    const cards = this.rollUpgrades(3);
    this.ui.showLevelUp(cards, (card) => this.pickUpgrade(card));
  }

  rollUpgrades(n) {
    const pool = this.upgrades.slice();
    const out = [];
    for (let i = 0; i < n && pool.length; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      out.push(pool.splice(idx, 1)[0]);
    }
    return out;
  }

  pickUpgrade(card) {
    if (card && card.apply) card.apply(this.player);
    this.audio.play('upgrade');
    this.pendingLevels--;
    if (this.pendingLevels > 0) {
      this.openLevelUp();
    } else {
      this.ui.hideLevelUp();
      this.state = 'playing';
      this.audio.resume();
      this.requestLock();
    }
  }

  // ---------------------------------------------------------
  //  HOOKS called by other modules
  // ---------------------------------------------------------
  onEnemyHit(enemy, amount, isCrit) {
    this.damageDealt += amount;
    const pos = enemy.group.position.clone();
    pos.y += 1.4;
    this.ui.floatDamage(pos, Math.round(amount), isCrit);
    this.audio.play(isCrit ? 'critHit' : 'enemyHit');
  }

  onEnemyKilled(enemy) {
    this.score += enemy.score;
    this.kills++;
    this.player.addXP(enemy.xp);
    this.audio.play('enemyDeath');
    if (enemy.type === 'brute') this.ui.crosshairKill('NULL BRUTE ELIMINATED');
    else this.ui.crosshairKill('+' + enemy.score);
    this.ui.addKill(enemy.type, enemy.type === 'brute');
    const drop = this.rollAmmoDrop(enemy.type);
    if (drop > 0) this.spawnAmmoPickup(enemy.group.position.clone(), drop, false);
    this.checkLevelUp();
  }

  onBossKilled(boss) {
    this.bossDefeated = true;
    this.score += 1000;
    this.kills++;
    this.audio.play('bossDeath');
    this.addShake(12);
    this.ui.crosshairKill('NULL WARDEN ELIMINATED');
    this.ui.addKill('boss', true);
  }

  onPlayerHit(srcPos) {
    const p = this.player.group.position;
    let dir = 'front';
    if (srcPos) {
      const dx = srcPos.x - p.x, dz = srcPos.z - p.z;
      const localX = dx * Math.cos(this.yaw) - dz * Math.sin(this.yaw);
      const localZ = dx * Math.sin(this.yaw) + dz * Math.cos(this.yaw);
      if (Math.abs(localX) > Math.abs(localZ)) dir = localX > 0 ? 'right' : 'left';
      else dir = localZ > 0 ? 'front' : 'back';
    }
    this.ui.flashDamage(this.player.lastDamageShield, dir);
    if (!this.player.lastDamageShield) this.addShake(2);
  }

  spawnImpact(pos, color = 0xff3b57, size = 1) {
    let m = this.impactPool.find(i => !i.active);
    if (!m) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.3, 8, 8),
        new THREE.MeshBasicMaterial({ color, transparent: true })
      );
      mesh.visible = false;
      this.scene.add(mesh);
      m = { mesh, active: false, life: 0, max: 0.4, base: size };
      this.impactPool.push(m);
    }
    m.active = true;
    m.life = m.max;
    m.mesh.visible = true;
    m.mesh.position.copy(pos);
    m.mesh.material.color.setHex(color);
    m.mesh.material.opacity = 1;
    m.mesh.scale.setScalar(m.base);
  }

  addShake(amount) {
    this.shake = Math.min(this.shakeMax, this.shake + amount * 0.12);
  }

  addRecoil(amount) {
    this.camRecoil = Math.min(0.5, this.camRecoil + amount);
  }

  // ---- enemy attack telegraphs (red-orange closing-ring ground marker) ----
  spawnTelegraph(pos, radius, duration) {
    let t = this.telegraphs.find(x => !x.active);
    if (!t) {
      const group = new THREE.Group();
      const base = new THREE.Mesh(
        new THREE.CircleGeometry(1, 36),
        new THREE.MeshBasicMaterial({ color: 0xff5a2a, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide })
      );
      base.rotation.x = -Math.PI / 2;
      base.position.y = 0.04;
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1, 0.14, 8, 36),
        new THREE.MeshBasicMaterial({ color: 0xff7a33, transparent: true, opacity: 0.9, depthWrite: false })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.06;
      group.add(base, ring);
      group.visible = false;
      this.scene.add(group);
      t = { group, base, ring, active: false, life: 0, max: 1, radius: 1 };
      this.telegraphs.push(t);
    }
    t.active = true;
    t.life = duration;
    t.max = duration;
    t.radius = radius;
    t.group.position.set(pos.x, 0, pos.z);
    t.group.visible = true;
    return t;
  }

  removeTelegraph(t) {
    if (!t) return;
    t.active = false;
    t.group.visible = false;
  }

  updateTelegraphs(dt) {
    for (const t of this.telegraphs) {
      if (!t.active) continue;
      t.life -= dt;
      const k = Math.max(0, Math.min(1, 1 - t.life / t.max)); // 0 -> 1 over time
      const s = t.radius * (1.9 - 0.9 * k); // ring shrinks toward impact radius
      t.ring.scale.set(s, s, s);
      t.base.scale.set(t.radius, t.radius, t.radius);
      t.ring.material.opacity = 0.55 + Math.sin(t.life * 22) * 0.25;
      t.base.material.opacity = 0.16 + 0.06 * Math.sin(t.life * 18);
      if (t.life <= 0) { t.active = false; t.group.visible = false; }
    }
  }

  // ---------------------------------------------------------
  //  COMBAT
  // ---------------------------------------------------------
  doDash() {
    const mv = this.getMoveVec();
    if (mv.lengthSq() < 0.001) {
      mv.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    }
    this.player.dashDir.copy(mv).normalize();
    this.player.tryDash();
  }

  getMoveVec() {
    const f = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const r = new THREE.Vector3(f.z, 0, -f.x);
    const mv = new THREE.Vector3();
    if (this.keys.has('KeyW')) mv.add(f);
    if (this.keys.has('KeyS')) mv.sub(f);
    if (this.keys.has('KeyD')) mv.add(r);
    if (this.keys.has('KeyA')) mv.sub(r);
    if (mv.lengthSq() > 0.001) mv.normalize();
    return mv;
  }

  fire() {
    const w = this.weapon;
    if (!w.canFire()) {
      if (w.ammo <= 0 && w.fireCd <= 0) {
        this.audio.play('dryFire');
        w.fireCd = 0.25;
        this.ui.crosshairFire();
      }
      return;
    }
    w.consume();
    this.ui.crosshairFire();
    this.shotsFired++;

    this.camera.updateMatrixWorld();
    const muzzle = w.getMuzzleWorld(this._tmpVec);
    // aim ray through crosshair (screen center)
    this.raycaster.setFromCamera(this._centerNDC, this.camera);
    const ray = this.raycaster.ray;
    const aimPoint = this._tmpVec2.copy(ray.origin).addScaledVector(ray.direction, 200);
    const dir = aimPoint.clone().sub(muzzle).normalize();

    // hit-test enemies from the muzzle
    const targets = this.enemyManager.getHitTargets();
    this.raycaster.set(muzzle, dir);
    this.raycaster.far = 250;
    const hits = targets.length ? this.raycaster.intersectObjects(targets, false) : [];
    let endPoint;
    if (hits.length) {
      endPoint = hits[0].point;
      const enemy = hits[0].object.userData.enemy;
      const isCrit = Math.random() < this.player.critChance;
      const dmg = this.player.damageMult * (isCrit ? this.player.critMult : 1) * 16;
      enemy.takeDamage(dmg, isCrit);
      this.shotsHit++;
      this.spawnImpact(hits[0].point, 0xff3b57, 0.8);
      this.ui.hitMarker(isCrit);
    } else {
      endPoint = muzzle.clone().addScaledVector(dir, 200);
    }
    this.projectiles.spawnTracer(muzzle, endPoint, 0x00f0ff);
    this.addRecoil(0.22);
  }

  // ---------------------------------------------------------
  //  MAIN LOOP
  // ---------------------------------------------------------
  loop() {
    requestAnimationFrame(this.loop);
    let dt = this.clock3.getDelta();
    if (dt > 0.05) dt = 0.05; // cap to avoid physics jumps after tab inactive
    this.elapsed += dt;
    this.clock = this.elapsed;

    if (this.state === 'playing') this.simulate(dt);

    this.updateCamera(dt);
    this.updateTelegraphs(dt);
    if (this.player && this.weapon && this.mission && this.enemyManager) {
      const moving = this.state === 'playing' &&
        (this.keys.has('KeyW') || this.keys.has('KeyA') || this.keys.has('KeyS') || this.keys.has('KeyD'));
      const sprint = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
      this.updateCrosshairState(moving, sprint);
      this.ui.update({
        player: this.player,
        weapon: this.weapon,
        mission: this.mission,
        enemyManager: this.enemyManager,
        score: this.score,
        kills: this.kills,
        aiming: this.aiming,
        moving, sprint,
        yaw: this.yaw,
        state: this.state,
        camera: this.camera,
      });
    }
    this.updateImpacts(dt);
    this.renderer.render(this.scene, this.camera);
  }

  updateCrosshairState(moving, sprint) {
    const c = this.ui.el.crosshair;
    if (!c) return;
    c.classList.toggle('moving', moving && !sprint && !this.aiming);
    c.classList.toggle('sprint', sprint && moving && !this.aiming);
    c.classList.toggle('ads', this.aiming);
    c.classList.toggle('reloading', this.weapon.reloading);
    // enemy under the crosshair?
    let enemyAim = false;
    if (this.state === 'playing') {
      this.camera.updateMatrixWorld();
      this.raycaster.setFromCamera(this._centerNDC, this.camera);
      this.raycaster.far = 300;
      const targets = this.enemyManager.getHitTargets();
      if (targets.length && this.raycaster.intersectObjects(targets, false).length) enemyAim = true;
    }
    c.classList.toggle('enemy', enemyAim);
  }

  simulate(dt) {
    if (this.introT > 0) { this.simulateIntro(dt); return; }

    const sprint = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    const moveVec = this.getMoveVec();
    this.player.update(dt, { moveVec, sprint, aimYaw: this.yaw, reloading: this.weapon.reloading });
    this.weapon.update(dt, { aiming: this.aiming });
    if (this.firing) this.fire();
    this.enemyManager.update(dt, this.player);
    this.mission.update(dt, this.player, this.pendingInteract);
    this.pendingInteract = false;
    this.projectiles.update(dt);
    this.world.update(dt);
    this.updateHealthPickups(dt);
    this.updateAmmoPickups(dt);
    if (!this.player.alive) this.gameOver();
  }

  simulateIntro(dt) {
    this.introT -= dt;
    if (!this._introMsg2 && this.introT < 1.8) {
      this._introMsg2 = true;
      this.ui.showNotification('PRIMARY OBJECTIVE UPDATED', 'cyan');
      this.ui.setObjective('RESTORE THE ENERGY GRID', 'TERMINALS 0 / 3');
      this.mission.highlightTerminal(0);
    }
    // spawn the first enemy group between the player and Terminal A
    if (this.introSpawnT > 0) {
      this.introSpawnT -= dt;
      if (this.introSpawnT <= 0 && this.pendingIntroSpawns > 0) {
        for (let i = 0; i < this.pendingIntroSpawns; i++) {
          const x = -10 - Math.random() * 22 + i * 8;
          const z = 54 - Math.random() * 18;
          this.enemyManager.spawn('drone', new THREE.Vector3(x, 0, z));
        }
        this.pendingIntroSpawns = 0;
      }
    }
    // keep the world / enemies / mission alive (objective beacon shows from start)
    this.enemyManager.update(dt, this.player);
    this.mission.update(dt, this.player, false);
    this.player.update(dt, { moveVec: ZERO_MV, sprint: false, aimYaw: this.yaw });
    this.weapon.update(dt, { aiming: false });
    this.projectiles.update(dt);
    this.world.update(dt);
    if (this.introT <= 0) {
      // hand control to the player
      this.ui.showNotification('RESTORE THE ENERGY GRID', 'cyan');
      this.pendingInteract = false;
    }
  }

  updateCamera(dt) {
    const p = this.player.group.position;
    const aiming = this.aiming;
    const dist = aiming ? this.adsDist : this.camDist;
    const camH = aiming ? this.adsCamHeight : this.camHeight;
    const sh = aiming ? this.adsShoulder : this.shoulder;
    const fovTarget = aiming ? this.adsFov : this.baseFov;
    this.camera.fov += (fovTarget - this.camera.fov) * Math.min(1, dt * 8);
    this.camera.updateProjectionMatrix();

    const fwd = this._tmpVec.set(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch)
    );
    const right = this._camRight.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw));

    // opening cinematic: start slightly elevated behind AXIOM-7
    let extraH = 0, extraDist = 0;
    if (this.introT > 0) {
      const k = Math.min(1, this.introT / 2.8);
      extraH = 1.8 * k; extraDist = 2.6 * k;
    }

    const desired = this._camDesired.copy(p)
      .addScaledVector(fwd, -(dist + extraDist))
      .add(new THREE.Vector3(0, camH + extraH, 0))
      .addScaledVector(right, -sh);
    const s = 1 - Math.exp(-12 * dt);
    this.camera.position.lerp(desired, s);

    if (this.shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
      this.camera.position.z += (Math.random() - 0.5) * this.shake;
      this.shake = Math.max(0, this.shake - dt * 3);
    }
    if (this.camRecoil > 0) {
      this.camera.position.y += this.camRecoil;
      this.camRecoil = Math.max(0, this.camRecoil - dt * 4);
    }

    // look slightly past the hero so AXIOM-7 sits in the lower-left of frame
    const look = this._camLook.copy(p)
      .addScaledVector(fwd, aiming ? (dist + 4) : this.lookAhead)
      .add(new THREE.Vector3(0, 1.55, 0))
      .addScaledVector(right, -sh * 0.35);
    this.camera.lookAt(look);
  }

  updateImpacts(dt) {
    for (const m of this.impactPool) {
      if (!m.active) continue;
      m.life -= dt;
      const t = Math.max(0, m.life / m.max);
      m.mesh.scale.setScalar(m.base * (1 + (1 - t) * 3));
      m.mesh.material.opacity = t;
      if (m.life <= 0) { m.active = false; m.mesh.visible = false; }
    }
  }

  onResize() {
    if (!this.renderer) return;
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }
}
