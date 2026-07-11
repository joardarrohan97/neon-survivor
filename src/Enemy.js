// =========================================================
//  NEON SURVIVOR: CORE BREACH — Enemy
//  Procedural NULL robots + NULL WARDEN boss
// =========================================================
import * as THREE from 'three';
import { fitToGround } from './AssetManager.js';

const RED = 0xff3b57;
const RED_DIM = 0x3a0d16;

export class Enemy {
  constructor(type, position, scene, game) {
    this.type = type;
    this.scene = scene;
    this.game = game;
    this.group = new THREE.Group();
    this.group.position.copy(position);
    scene.add(this.group);

    this.dead = false;
    this.dying = false;
    this.deathTimer = 0;
    this.deathMax = 1;
    this.hitFlash = 0;
    this.hitWhite = 0;
    this.attackCd = Math.random() * 1.2;
    this.glowMats = [];
    this.hitTargets = [];
    this.facing = 0;
    this.wobble = Math.random() * Math.PI * 2;
    this.spawning = 0.5;
    this.spawnMax = 0.5;
    this.hitKick = new THREE.Vector3();
    this.fragments = [];
    this.detect = 0;
    this._hpQ = new THREE.Quaternion();
    this._hpWQ = new THREE.Quaternion();
    this.hpShow = 0;

    const cfg = Enemy.stats(type, game.mission ? game.mission.difficulty : 1);
    this.health = cfg.hp;
    this.maxHealth = cfg.hp;
    this.speed = cfg.speed;
    this.damage = cfg.dmg;
    this.score = cfg.score;
    this.xp = cfg.xp;
    this.radius = cfg.radius;
    this.melee = cfg.melee;
    this.ranged = cfg.ranged;
    this.fireCd = cfg.fireCd || 0;

    this.build(cfg);
  }

  build(cfg) {
    this.body = new THREE.Group();
    this.group.add(this.body);

    // Prefer the real glTF models when preloaded; fall back to the
    // procedural robot if an asset is missing.
    const am = this.game.assets;
    const keyMap = { drone: 'eyeDrone', rifleman: 'trilobite', brute: 'quadShell' };
    const key = keyMap[this.type];
    if (am && am.isLoaded(key)) {
      this._buildFromAsset(key, cfg);
    } else {
      this._buildProcedural(cfg);
    }

    if (this._spawnBase === undefined) {
      this._spawnBase = this.type === 'brute' ? 1.7 : (this.type === 'drone' ? 0.85 : 1);
    }

    // red ground glow (danger indicator)
    const glow = new THREE.Mesh(new THREE.CircleGeometry(this.radius + 0.4, 18),
      new THREE.MeshBasicMaterial({ color: RED, transparent: true, opacity: 0.22, depthWrite: false }));
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.05;
    this.groundGlow = glow;
    this.group.add(glow);

    // red holographic spawn warning marker
    const spawnRing = new THREE.Mesh(new THREE.TorusGeometry(this.radius + 0.3, 0.07, 6, 20),
      new THREE.MeshBasicMaterial({ color: RED, transparent: true, opacity: 0.8 }));
    spawnRing.rotation.x = Math.PI / 2;
    spawnRing.position.y = 0.1;
    const spawnCross = new THREE.Group();
    const c1 = new THREE.Mesh(new THREE.BoxGeometry((this.radius + 0.3) * 2, 0.04, 0.04),
      new THREE.MeshBasicMaterial({ color: RED, transparent: true, opacity: 0.8 }));
    const c2 = c1.clone(); c2.rotation.y = Math.PI / 2;
    spawnCross.add(c1, c2); spawnCross.position.y = 0.1;
    this.spawnRing = new THREE.Group();
    this.spawnRing.add(spawnRing, spawnCross);
    this.group.add(this.spawnRing);

    for (const t of this.hitTargets) t.userData.enemy = this;
    this.buildHealthBar();
  }

  // ---- 3D billboard health bar (shows after damage) ----
  buildHealthBar() {
    const s = this.group.scale.x || 1;
    const w = this.type === 'brute' ? 2.4 : (this.type === 'rifleman' ? 1.5 : 1.1);
    const topY = (this.type === 'brute' ? 4.4 : this.type === 'rifleman' ? 2.6 : 2.1) / s;
    const g = new THREE.Group();
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.08, 0.22),
      new THREE.MeshBasicMaterial({ color: 0x240407, transparent: true, opacity: 0.85, depthTest: false }));
    const fgGeo = new THREE.PlaneGeometry(w, 0.16);
    fgGeo.translate(w / 2, 0, 0);
    const fg = new THREE.Mesh(fgGeo,
      new THREE.MeshBasicMaterial({ color: 0xff3550, transparent: true, opacity: 0.95, depthTest: false }));
    fg.position.x = -w / 2;
    fg.renderOrder = 1001; bg.renderOrder = 1000;
    g.add(bg, fg);
    g.position.set(0, topY, 0);
    g.scale.setScalar(1 / s);
    g.visible = false;
    this.group.add(g);
    this.hpBar = g;
    this.hpFill = fg;
    this.hpW = w;
  }

  // ---- Procedural fallback (used only if a glTF asset is unavailable) ----
  _buildProcedural(cfg) {
    const dark = new THREE.MeshStandardMaterial({ color: 0x1a1f29, roughness: 0.5, metalness: 0.78 });
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x242b3a, roughness: 0.5, metalness: 0.78 });
    const steel = new THREE.MeshStandardMaterial({ color: 0x2c3445, roughness: 0.45, metalness: 0.8 });
    const redGlow = new THREE.MeshStandardMaterial({ color: RED_DIM, emissive: RED, emissiveIntensity: 1.7, roughness: 0.4 });
    const orangeGlow = new THREE.MeshStandardMaterial({ color: 0x3a2208, emissive: 0xff8a2a, emissiveIntensity: 1.4, roughness: 0.45 });
    this.glowMats.push(redGlow);
    this.redGlow = redGlow;

    const box = (w, h, d, mat, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      return m;
    };
    const orbGlow = (r, x, y, z, mat) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 10), mat);
      m.position.set(x, y, z);
      return m;
    };

    if (this.type === 'drone') {
      this.group.scale.setScalar(0.85);
      const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 0.85, 6), bodyMat);
      torso.position.y = 0.95;
      const shL = box(0.22, 0.12, 0.34, dark, -0.2, 1.25, 0); shL.rotation.z = 0.4;
      const shR = box(0.22, 0.12, 0.34, dark, 0.2, 1.25, 0); shR.rotation.z = -0.4;
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.4, 6), dark);
      head.position.y = 1.5;
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 10), redGlow);
      eye.position.set(0, 1.48, 0.14);
      this.eye = eye;
      this.legL = this._limb(0.05, 0.9, dark, -0.1, 0.45);
      this.legR = this._limb(0.05, 0.9, dark, 0.1, 0.45);
      this.armL = this._limb(0.04, 0.8, dark, -0.26, 1.1);
      this.armR = this._limb(0.04, 0.8, dark, 0.26, 1.1);
      const fL = box(0.06, 0.34, 0.1, dark, -0.26, 0.66, 0.02); fL.rotation.x = 0.5;
      const fR = box(0.06, 0.34, 0.1, dark, 0.26, 0.66, 0.02); fR.rotation.x = 0.5;
      const jL = orbGlow(0.06, -0.2, 1.25, 0, orangeGlow);
      const jR = orbGlow(0.06, 0.2, 1.25, 0, orangeGlow);
      const jHipL = orbGlow(0.05, -0.1, 0.5, 0, orangeGlow);
      const jHipR = orbGlow(0.05, 0.1, 0.5, 0, orangeGlow);
      this.body.add(torso, shL, shR, head, eye, this.legL, this.legR, this.armL, this.armR, fL, fR, jL, jR, jHipL, jHipR);
      this.hitTargets.push(torso, head);
    } else if (this.type === 'rifleman') {
      const torso = box(0.7, 0.8, 0.45, bodyMat, 0, 1.1, 0);
      const shL = box(0.34, 0.26, 0.5, dark, -0.5, 1.4, 0); shL.rotation.z = 0.2;
      const shR = box(0.34, 0.26, 0.5, dark, 0.5, 1.4, 0); shR.rotation.z = -0.2;
      const head = box(0.36, 0.36, 0.36, dark, 0, 1.68, 0);
      const crest = box(0.08, 0.16, 0.2, dark, 0, 1.86, -0.05);
      const visor = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.06), redGlow);
      visor.position.set(0, 1.68, 0.18);
      this.eye = visor;
      this.legL = this._limb(0.18, 0.95, dark, -0.2, 0.5);
      this.legR = this._limb(0.18, 0.95, dark, 0.2, 0.5);
      this.armL = this._limb(0.14, 0.7, dark, -0.5, 1.25);
      this.armR = this._limb(0.14, 0.7, dark, 0.5, 1.25);
      const gun = box(0.14, 0.18, 0.85, dark, 0.5, 1.05, 0.32);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.5, 8), dark);
      barrel.rotation.x = Math.PI / 2; barrel.position.set(0.5, 1.05, 0.8);
      const gGlow = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.4), redGlow);
      gGlow.position.set(0.5, 1.05, 0.7);
      this.muzzle = new THREE.Object3D();
      this.muzzle.position.set(0.5, 1.05, 1.0);
      const chamber = orbGlow(0.1, 0.5, 1.2, 0.45, redGlow);
      this.body.add(torso, shL, shR, head, crest, visor, this.legL, this.legR, this.armL, this.armR, gun, barrel, gGlow, chamber, this.muzzle);
      this.hitTargets.push(torso, head, gun);
    } else { // brute
      this.group.scale.setScalar(1.7);
      const torso = box(1.0, 1.1, 0.7, bodyMat, 0, 1.5, 0);
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 16), redGlow);
      core.position.set(0, 1.5, 0.38);
      this.eye = core;
      this.core = core;
      const head = box(0.5, 0.42, 0.5, dark, 0, 2.32, 0);
      const headVisor = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.1, 0.06), redGlow);
      headVisor.position.set(0, 2.34, 0.26);
      const shL = box(0.7, 0.6, 0.8, dark, -0.85, 2.05, 0);
      const shR = shL.clone(); shR.position.x = 0.85;
      this.armL = this._limb(0.32, 1.1, dark, -0.9, 1.7);
      this.armR = this._limb(0.32, 1.1, dark, 0.9, 1.7);
      this.legL = this._limb(0.36, 1.1, dark, -0.34, 0.55);
      this.legR = this._limb(0.36, 1.1, dark, 0.34, 0.55);
      const warnL = orbGlow(0.16, -0.85, 2.4, 0.42, orangeGlow);
      const warnR = orbGlow(0.16, 0.85, 2.4, 0.42, orangeGlow);
      this.body.add(torso, core, head, headVisor, shL, shR, this.armL, this.armR, this.legL, this.legR, warnL, warnR);
      this.hitTargets.push(torso, head, shL, shR, core);
    }
  }

  // ---- Real glTF model (EyeDrone / Trilobite / QuadShell) ----
  _buildFromAsset(key, cfg) {
    this.hasModel = true;
    this._spawnBase = 1;
    this.group.scale.setScalar(1);

    const model = this.game.assets.clone(key);
    if (!model) { this._buildProcedural(cfg); return; }

    const targetH = this.type === 'brute' ? 3.4 : this.type === 'rifleman' ? 2.1 : 1.7;
    fitToGround(model, targetH);
    model.userData.baseY = model.position.y;
    this.visual = model;
    this.body.add(model);

    // hit targets: every mesh of the model, tagged for raycasting
    this.hitTargets = [];
    model.traverse((o) => {
      if (o.isMesh) { o.userData.enemy = this; this.hitTargets.push(o); }
    });

    // hostile identification marker (does NOT recolor the original asset)
    const markerColor = this.type === 'brute' ? 0xff8a2a : 0xff3b57;
    const markerSize = this.type === 'brute' ? 0.2 : 0.13;
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(markerSize, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0x220007, emissive: markerColor, emissiveIntensity: 1.9, roughness: 0.4 })
    );
    marker.position.set(0, targetH * 0.78, (model.userData.__frontZ || 0));
    this.body.add(marker);
    this.eye = marker;
    this.redGlow = marker.material;
    this.glowMats = [marker.material];

    // clearly visible red ranged attack origin for the NULL STALKER
    if (this.type === 'rifleman') {
      this.muzzle = new THREE.Object3D();
      this.muzzle.position.set(0, targetH * 0.62, (model.userData.__frontZ || 0.3) + 0.25);
      this.body.add(this.muzzle);
      const mz = new THREE.Mesh(
        new THREE.SphereGeometry(0.13, 12, 12),
        new THREE.MeshStandardMaterial({ color: 0x220007, emissive: 0xff3b57, emissiveIntensity: 2.2, roughness: 0.4 })
      );
      mz.position.copy(this.muzzle.position);
      this.body.add(mz);
    }
  }

  _animateModel(dt, moving) {
    if (!this.visual || this.dying) return;
    if (this.type === 'drone') {
      // EyeDrone visibly hovers
      this.visual.position.y = 0.25 + Math.sin(this.wobble * 2) * 0.18;
      this.visual.rotation.y += dt * 0.6;
    } else {
      const bob = Math.sin(this.wobble) * 0.05;
      this.visual.position.y = (this.visual.userData.baseY || 0) + bob;
    }
  }

  updateHealthBar(dt, player) {
    if (!this.hpBar) return;
    const frac = Math.max(0, Math.min(1, this.health / this.maxHealth));
    this.hpFill.scale.x = frac;
    if (this.health < this.maxHealth) this.hpShow = 2.6;
    const near = this.type === 'brute' && player &&
      Math.hypot(this.group.position.x - player.group.position.x, this.group.position.z - player.group.position.z) < 32;
    if (this.hpShow > 0) this.hpShow -= dt;
    const show = this.hpShow > 0 || near;
    this.hpBar.visible = show && !this.dying;
    if (show && this.game.camera) {
      this.group.getWorldQuaternion(this._hpWQ);
      this._hpQ.copy(this._hpWQ).invert().multiply(this.game.camera.quaternion);
      this.hpBar.quaternion.copy(this._hpQ);
    }
  }

  _limb(r, len, mat, x, y) {
    const g = new THREE.Group();
    g.position.set(x, y, 0);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.8, len, 6), mat);
    m.position.y = -len / 2;
    g.add(m);
    g.userData.baseX = x;
    return g;
  }

  takeDamage(amount, isCrit) {
    if (this.dead) return;
    this.health -= amount;
    this.hitFlash = 0.12;
    this.hitWhite = 0.1;
    const p = this.game.player.group.position;
    const dx = this.group.position.x - p.x, dz = this.group.position.z - p.z;
    const l = Math.hypot(dx, dz) || 1;
    this.hitKick.set(dx / l, 0, dz / l).multiplyScalar(Math.min(1.2, amount * 0.04));
    this.game.onEnemyHit(this, amount, isCrit);
    if (this.health <= 0) this.die();
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    this.dying = true;
    if (this.type === 'drone') { this.deathTimer = 0.9; this.deathMax = 0.9; this._spawnFragments(7, RED); }
    else if (this.type === 'rifleman') { this.deathTimer = 1.0; this.deathMax = 1.0; }
    else { this.deathTimer = 1.2; this.deathMax = 1.2; this._spawnFragments(11, RED); }
    this.game.onEnemyKilled(this);
  }

  _spawnFragments(n, color) {
    for (let i = 0; i < n; i++) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 }));
      f.position.set((Math.random() - 0.5) * 0.4, 1 + Math.random(), (Math.random() - 0.5) * 0.4);
      const vel = new THREE.Vector3((Math.random() - 0.5) * 4, 2 + Math.random() * 3, (Math.random() - 0.5) * 4);
      this.group.add(f);
      this.fragments.push({ mesh: f, vel, life: 0.6 + Math.random() * 0.3, max: 0.9 });
    }
  }

  _updateFragments(dt) {
    for (let i = this.fragments.length - 1; i >= 0; i--) {
      const f = this.fragments[i];
      f.life -= dt;
      f.vel.y -= 9 * dt;
      f.mesh.position.addScaledVector(f.vel, dt);
      f.mesh.rotation.x += dt * 6; f.mesh.rotation.z += dt * 5;
      f.mesh.material.opacity = Math.max(0, f.life / f.max);
      if (f.life <= 0) { this.group.remove(f.mesh); this.fragments.splice(i, 1); }
    }
  }

  update(dt, player) {
    this.wobble += dt * 4;
    if (this.hitFlash > 0) {
      this.hitFlash -= dt;
      const f = Math.max(0, this.hitFlash / 0.12);
      for (const m of this.glowMats) m.emissiveIntensity = 1.6 + f * 3;
    }
    if (this.hitWhite > 0) {
      this.hitWhite -= dt;
      const w = Math.max(0, this.hitWhite / 0.1);
      for (const m of this.glowMats) m.emissive.setRGB(1, 0.25 + w * 0.1, 0.3 + w * 0.05);
      if (this.hitWhite <= 0) for (const m of this.glowMats) { m.emissive.setHex(RED); m.emissiveIntensity = 1.6; }
    }

    if (this.dying) {
      this.deathTimer -= dt;
      const t = Math.max(0, this.deathTimer / this.deathMax);
      if (this.type === 'drone') {
        this.body.rotation.z += dt * 3;
        this._updateFragments(dt);
      } else if (this.type === 'rifleman') {
        this.body.rotation.x = (1 - t) * -1.4; // fall backward
      } else {
        // brute: stagger then fall / core burst
        this.body.rotation.z += dt * 2 * t;
        this.body.position.y = Math.sin(this.wobble * 6) * 0.12 * t;
        this._updateFragments(dt);
        if (this.core) this.core.material.emissiveIntensity = 1.6 + (1 - t) * 4;
      }
      this._updateGlow(dt);
      return;
    }

    if (this.spawning > 0) {
      this.spawning -= dt;
      this.animateSpawn();
      if (this.spawning <= 0 && this.spawnRing) {
        this.group.remove(this.spawnRing);
        this.spawnRing = null;
      }
      this._animateGlow(dt);
      return;
    }

    const toPlayer = new THREE.Vector3().subVectors(player.group.position, this.group.position);
    const dist = toPlayer.length();
    toPlayer.y = 0;
    const flat = toPlayer.clone().normalize();
    this.facing = Math.atan2(flat.x, flat.z);
    this.group.rotation.y = this.facing;

    // detection: brighten eye when close
    if (dist < 26) { this.detect = Math.min(1, this.detect + dt * 3); }
    else { this.detect = Math.max(0, this.detect - dt * 2); }

    // knockback from hits
    if (this.hitKick.lengthSq() > 0.0001) {
      this.group.position.addScaledVector(this.hitKick, dt * 10);
      this.hitKick.multiplyScalar(0.85);
    }

    let move = 0;
    if (this.type === 'drone') {
      move = 1;
    } else if (this.type === 'rifleman') {
      const ideal = 18;
      if (dist > ideal + 3) move = 1;
      else if (dist < ideal - 3) move = -1;
      else {
        this.group.position.x += Math.sin(this.wobble) * this.speed * 0.4 * dt;
        this.group.position.z += Math.cos(this.wobble) * this.speed * 0.4 * dt;
      }
      this.updateRanged(dt, player, flat);
    } else if (this.type === 'brute') {
      move = 1;
      this.updateBrute(dt, player, dist);
    }

    if (move !== 0) this.group.position.addScaledVector(flat, this.speed * move * dt);

    this._animateGlow(dt);
    this.animate(dt, move !== 0);
    this.updateHealthBar(dt, player);
  }

  updateRanged(dt, player, flat) {
    this.attackCd -= dt;
    if (this.attackCd <= 0 && !this.spawning) {
      this.attackCd = this.fireCd;
      const from = this.muzzle ? this.muzzle.getWorldPosition(new THREE.Vector3()) : this.group.position.clone().setY(1.2);
      const to = player.group.position.clone().setY(1.1);
      const dir = new THREE.Vector3().subVectors(to, from).normalize();
      this.game.projectiles.spawnEnemyProjectile(from, dir, 22, this.damage, RED, 0.28);
      this.game.audio.play('bossAttack');
    }
  }

  updateBrute(dt, player, dist) {
    this.attackCd -= dt;
    if (this.attackCd <= 0 && dist < 4) {
      this.attackCd = 2.2;
      this.lunge = 0.3;
      if (dist < 2.6) { player.takeDamage(this.damage); this.game.onPlayerHit(this.group.position); }
    }
    if (this.slamCd === undefined) this.slamCd = 6 + Math.random() * 3;
    this.slamCd -= dt;
    if (this.slamCd <= 0 && dist < 12 && dist > 3) { this.slamCd = 8; this.slamTimer = 0.9; }
    if (this.slamTimer > 0) {
      if (!this._slamTele) this._slamTele = this.game.spawnTelegraph(this.group.position.clone().setY(0), 7, 0.9);
      this.slamTimer -= dt;
      if (this.slamTimer <= 0) {
        if (this._slamTele) { this.game.removeTelegraph(this._slamTele); this._slamTele = null; }
        if (dist < 7) { player.takeDamage(this.damage * 1.2); this.game.onPlayerHit(this.group.position); }
        this.game.spawnImpact(this.group.position.clone().setY(0.2), 0xff3b57, 2.5);
        this.game.audio.play('bossAttack');
      }
    }
  }

  animateSpawn() {
    const t = 1 - this.spawning / this.spawnMax;
    const base = this._spawnBase !== undefined ? this._spawnBase : (this.type === 'brute' ? 1.7 : (this.type === 'drone' ? 0.85 : 1));
    const s = base * (0.2 + t * 0.8);
    this.group.scale.setScalar(s);
    if (this.spawnRing) {
      this.spawnRing.rotation.y += 0.2;
      const o = 0.4 + Math.sin(t * Math.PI * 4) * 0.4;
      this.spawnRing.children[0].material.opacity = o;
      this.spawnRing.children[1].children.forEach(c => c.material.opacity = o);
      this.spawnRing.scale.setScalar(1 + (1 - t) * 0.4);
    }
    this.body.position.y = (1 - t) * 1.2;
  }

  _animateGlow(dt) {
    if (this.groundGlow) {
      const pulse = 0.18 + Math.sin(this.wobble * 2) * 0.08 + this.detect * 0.25;
      this.groundGlow.material.opacity = pulse;
      const sc = 1 + this.detect * 0.3;
      this.groundGlow.scale.setScalar(sc);
    }
    if (this.eye) {
      const base = this.type === 'rifleman' ? 1.6 : 1.8;
      this.eye.material.emissiveIntensity = base + this.detect * 2 + Math.sin(this.wobble * 3) * 0.4;
    }
  }

  _updateGlow(dt) {
    if (this.groundGlow) this.groundGlow.material.opacity *= 0.92;
  }

  animate(dt, moving) {
    if (this.hasModel) { this._animateModel(dt, moving); return; }
    if (this.type === 'drone') {
      const w = moving ? Math.sin(this.wobble * 2) * 0.6 : Math.sin(this.wobble) * 0.15;
      this.legL.rotation.x = w; this.legR.rotation.x = -w;
      this.armL.rotation.x = w * 0.5; this.armR.rotation.x = -w * 0.5;
      // lean forward while running (aggressive)
      this.body.rotation.x = moving ? -0.25 : Math.sin(this.wobble) * 0.05;
    } else if (this.type === 'rifleman') {
      const w = moving ? Math.sin(this.wobble * 1.5) * 0.5 : 0;
      this.legL.rotation.x = w; this.legR.rotation.x = -w;
      this.armR.rotation.x = -1.2; // aim gun
      this.armL.rotation.x = -0.3;
    } else {
      const w = moving ? Math.sin(this.wobble) * 0.4 : 0;
      this.legL.rotation.x = w; this.legR.rotation.x = -w;
      const lunge = this.lunge > 0 ? (this.lunge -= dt * 2, this.lunge * 1.5) : 0;
      this.armR.rotation.x = -0.4 + lunge;
      this.armL.rotation.x = -0.4 + lunge;
    }
  }
}

Enemy.stats = function (type, diff) {
  const d = diff || 1;
  if (type === 'drone') return { hp: 30 * d, speed: 6.5, dmg: 10, score: 10, xp: 3, radius: 0.6, melee: true, ranged: false, fireCd: 0 };
  if (type === 'rifleman') return { hp: 55 * d, speed: 3.6, dmg: 12, score: 18, xp: 6, radius: 0.7, melee: false, ranged: true, fireCd: 1.6 };
  if (type === 'brute') return { hp: 220 * d, speed: 2.6, dmg: 26, score: 50, xp: 18, radius: 1.3, melee: true, ranged: false, fireCd: 0 };
  return { hp: 30, speed: 5, dmg: 10, score: 10, xp: 3, radius: 0.6, melee: true, ranged: false, fireCd: 0 };
};

// =========================================================
//  NULL WARDEN — final boss (Phase 1)
// =========================================================
export class Boss {
  constructor(position, scene, game) {
    this.scene = scene;
    this.game = game;
    this.group = new THREE.Group();
    this.group.position.copy(position);
    // built geometry is already ~3x a normal enemy (rifleman ~2.1 units tall)
    this.group.scale.setScalar(1);
    scene.add(this.group);
    this.isBoss = true;
    this.name = 'THE NULL WARDEN';

    this.maxHealth = 5000;
    this.health = this.maxHealth;
    this.radius = 3;
    this.dead = false;
    this.dying = false;
    this.deathTimer = 0;
    this.hitFlash = 0;
    this.glowMats = [];
    this.hitTargets = [];

    this.state = 'intro';
    this.stateTimer = 2.2;
    this.wobble = 0;
    this.ringRot = 0;
    this.fireCd = 2.5; // first heavy plasma shot fires after 2.5s
    this._deathParticles = [];

    // Phase 2 state
    this.phase = 1;
    this.phase2Triggered = false;
    this.transition = false;
    this.transitionTimer = 0;
    this.moveSpeed = 3.5;
    this.summonCd = 15;
    this.maxDrones = 6;
    this._phaseSeq = 0;

    this.build();
  }

  build() {
    const dark = new THREE.MeshStandardMaterial({ color: 0x141022, roughness: 0.4, metalness: 0.8 });
    const armor = new THREE.MeshStandardMaterial({ color: 0x201030, roughness: 0.5, metalness: 0.7 });
    const redGlow = new THREE.MeshStandardMaterial({ color: RED_DIM, emissive: RED, emissiveIntensity: 1.8, roughness: 0.4 });
    const purpleGlow = new THREE.MeshStandardMaterial({ color: 0x2a1140, emissive: 0x9b5cff, emissiveIntensity: 1.0, roughness: 0.4 });
    this.glowMats.push(redGlow);

    this.core = new THREE.Mesh(new THREE.SphereGeometry(0.9, 24, 24), redGlow);
    this.core.position.set(0, 4.5, 0.6);
    const torso = new THREE.Mesh(new THREE.BoxGeometry(3.2, 3.4, 2.0), armor);
    torso.position.y = 3.4;
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.0, 1.2), dark);
    head.position.y = 5.6;
    const visor = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.25, 0.1), redGlow);
    visor.position.set(0, 5.7, 0.62);

    this.shoulderL = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.0, 1.6), dark);
    this.shoulderR = this.shoulderL.clone();
    this.shoulderL.position.set(-2.6, 4.6, 0);
    this.shoulderR.position.set(2.6, 4.6, 0);
    const slGlow = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.2, 1.4), purpleGlow);
    slGlow.position.copy(this.shoulderL.position); slGlow.position.y -= 0.4;
    const srGlow = slGlow.clone(); srGlow.position.x = 2.6;
    this.glowMats.push(purpleGlow);

    this.armL = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.4, 3.0, 8), dark);
    this.armL.position.set(-2.2, 3.0, 0.4);
    this.armR = this.armL.clone(); this.armR.position.x = 2.2;
    const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.5, 2.6, 8), dark);
    legL.position.set(-1.0, 1.0, 0);
    const legR = legL.clone(); legR.position.x = 1.0;

    this.ring = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.3, 12, 48), redGlow);
    this.ring.rotation.x = Math.PI / 2;
    this.ring.position.y = 3.4;

    this.group.add(torso, head, visor, this.core, this.shoulderL, this.shoulderR, slGlow, srGlow, this.armL, this.armR, legL, legR, this.ring);
    this.hitTargets.push(torso, head, this.core, this.shoulderL, this.shoulderR);
    for (const t of this.hitTargets) t.userData.enemy = this;
  }

  getMuzzleWorld(target) { return this.core.getWorldPosition(target || new THREE.Vector3()); }

  takeDamage(amount, isCrit) {
    if (this.dead) return;
    this.health -= amount;
    this.hitFlash = 0.1;
    this.game.onEnemyHit(this, amount, isCrit);
    if (this.health <= 0) this.die();
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    this.dying = true;
    this.deathTimer = 3.0;
    this.game.onBossKilled(this);
    this.spawnDeathBurst();
  }

  update(dt, player) {
    this.wobble += dt * 2;
    this.ringRot += dt * 0.5;
    this.ring.rotation.z = this.ringRot;
    this.shoulderL.position.y = 4.6 + Math.sin(this.wobble) * 0.3;
    this.shoulderR.position.y = 4.6 - Math.sin(this.wobble) * 0.3;
    this.core.material.emissiveIntensity = 1.8 + Math.sin(this.wobble * 1.5) * 0.5;
    if (this.hitFlash > 0) {
      this.hitFlash -= dt;
      const f = Math.max(0, this.hitFlash / 0.1);
      for (const m of this.glowMats) m.emissiveIntensity = 1.8 + f * 3;
    }

    if (this.dying) {
      this.deathTimer -= dt;
      const k = 1 - Math.max(0, this.deathTimer) / 3;
      this.core.material.emissiveIntensity = 1.8 + k * 7;
      this._updateDeathParticles(dt);
      return;
    }

    // ---- continuously track the player ----
    const toPlayer = new THREE.Vector3().subVectors(player.group.position, this.group.position);
    const dist = toPlayer.length();
    const flat = toPlayer.clone(); flat.y = 0; flat.normalize();
    this.group.rotation.y = Math.atan2(flat.x, flat.z);

    if (this.state === 'intro') {
      this.stateTimer -= dt;
      if (this.stateTimer <= 0) this.state = 'active';
      return;
    }

    // ---- Phase 2 trigger at 70% health ----
    if (!this.phase2Triggered && this.health <= this.maxHealth * 0.7) {
      this.phase2Triggered = true;
      this.transition = true;
      this.transitionTimer = 1.4; // brief pause before changing phase
      this._beginPhase2Sequence();
    }

    // ---- phase transition: boss pauses briefly ----
    if (this.transition) {
      this.transitionTimer -= dt;
      if (this.transitionTimer <= 0) this._enterPhase2();
      return;
    }

    // approach the player, keeping a short standoff so it keeps firing
    const standoff = this.radius + player.radius + 3;
    if (dist > standoff) {
      this.group.position.addScaledVector(flat, this.moveSpeed * dt);
    }

    // fire plasma projectiles
    this.fireCd -= dt;
    if (this.fireCd <= 0) {
      this.fireCd = 2.5;
      if (this.phase === 2) this.fireTripleBurst(player);
      else this.fireHeavyPlasma(player);
    }

    // Phase 2: summon Eye Drones every 15 seconds (never more than 6 alive)
    if (this.phase === 2) {
      this.summonCd -= dt;
      if (this.summonCd <= 0) {
        this.summonCd = 15;
        const aliveDrones = this.game.enemyManager.countType('drone');
        const room = Math.min(2, this.maxDrones - aliveDrones);
        if (room > 0) this.game.enemyManager.spawnBossDrones(room);
      }
    }
  }

  _beginPhase2Sequence() {
    const seq = ++this._phaseSeq;
    this.game.ui.showNotification('WARNING', 'red');
    this.game.audio.play('bossWarning');
    setTimeout(() => {
      if (seq !== this._phaseSeq || this.dead) return;
      this.game.ui.showNotification('NULL WARDEN ADAPTING', 'red');
    }, 1000);
    setTimeout(() => {
      if (seq !== this._phaseSeq || this.dead) return;
      this.game.ui.showNotification('PHASE 2', 'red');
    }, 2000);
  }

  _enterPhase2() {
    this.transition = false;
    this.phase = 2;
    this.moveSpeed *= 1.25; // ~25% faster movement
    this.fireCd = 2.5;      // keep the firing cadence after the pause
    this.summonCd = 15;     // first drone summon after 15s
    this.name = 'NULL WARDEN — PHASE 2';
  }

  // ---- triple plasma burst (Phase 2): forward + -10deg + +10deg ----
  fireTripleBurst(player) {
    const from = this.getMuzzleWorld(new THREE.Vector3());
    const to = player.group.position.clone().setY(1.1);
    const baseDir = new THREE.Vector3().subVectors(to, from).normalize();
    const spread = THREE.MathUtils.degToRad(10);
    const dirs = [baseDir, this._rotateY(baseDir, -spread), this._rotateY(baseDir, spread)];
    for (const dir of dirs) {
      this.game.projectiles.spawnEnemyProjectile(from, dir, 18, 25, 0x9b5cff, 0.5);
    }
    this.game.audio.play('bossAttack');
  }

  _rotateY(vec, ang) {
    const c = Math.cos(ang), s = Math.sin(ang);
    return new THREE.Vector3(vec.x * c + vec.z * s, vec.y, -vec.x * s + vec.z * c);
  }

  // ---- heavy plasma: slow, high-damage aimed shot (existing projectile system) ----
  fireHeavyPlasma(player) {
    const from = this.getMuzzleWorld(new THREE.Vector3());
    const to = player.group.position.clone().setY(1.1);
    const dir = new THREE.Vector3().subVectors(to, from).normalize();
    this.game.projectiles.spawnEnemyProjectile(from, dir, 18, 25, 0x9b5cff, 0.5);
    this.game.audio.play('bossAttack');
  }

  // ---- death particle burst (explosion debris) ----
  spawnDeathBurst() {
    for (let i = 0; i < 70; i++) {
      const roll = Math.random();
      const color = roll < 0.5 ? 0xff3b57 : (roll < 0.8 ? 0x9b5cff : 0xffd23a);
      const f = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.3, 0.3),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 }));
      f.position.set((Math.random() - 0.5) * 3, 2 + Math.random() * 4, (Math.random() - 0.5) * 3);
      const vel = new THREE.Vector3((Math.random() - 0.5) * 16, 5 + Math.random() * 14, (Math.random() - 0.5) * 16);
      this.group.add(f);
      this._deathParticles.push({ mesh: f, vel, life: 1.8 + Math.random() * 1.4, max: 3.2 });
    }
  }

  _updateDeathParticles(dt) {
    for (let i = this._deathParticles.length - 1; i >= 0; i--) {
      const f = this._deathParticles[i];
      f.life -= dt;
      f.vel.y -= 14 * dt;
      f.mesh.position.addScaledVector(f.vel, dt);
      f.mesh.rotation.x += dt * 6; f.mesh.rotation.z += dt * 5;
      const s = Math.max(0.05, f.life / f.max);
      f.mesh.scale.setScalar(s);
      f.mesh.material.opacity = Math.max(0, f.life / f.max);
      if (f.life <= 0) { this.group.remove(f.mesh); this._deathParticles.splice(i, 1); }
    }
  }

}
