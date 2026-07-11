// =========================================================
//  NEON SURVIVOR: CORE BREACH — Player (AXIOM-7)
//  Procedural third-person cybernetic hero
// =========================================================
import * as THREE from 'three';
import { ARENA } from './World.js';

export class Player {
  constructor(scene, audio) {
    this.scene = scene;
    this.audio = audio;
    this.group = new THREE.Group();
    scene.add(this.group);

    this.radius = 0.7;
    this.maxHealth = 100;
    this.health = 100;
    this.maxShield = 50;
    this.shield = 50;
    this.shieldRegenDelay = 3.0;
    this.shieldTimer = 0;
    this.level = 1;
    this.xp = 0;
    this.xpToNext = 8;
    this.speed = 7.5;
    this.sprintMult = 1.6;
    this.dashMax = 1.4;
    this.dashCd = 0;
    this.dashing = 0;
    this.dashDir = new THREE.Vector3(0, 0, 1);
    this.invuln = 0;
    this.alive = true;

    // upgradeable combat stats
    this.damageMult = 1;
    this.fireRateMult = 1;
    this.magSizeMult = 1;
    this.reloadMult = 1;
    this.moveMult = 1;
    this.dashCdMult = 1;
    this.critChance = 0.05;
    this.critMult = 2;
    this.upgradeStacks = {};

    this.shootTimer = 0;
    this.hitTimer = 0;
    this.animTime = 0;
    this.gait = 0;
    this.reloading = false;
    this.weaponMount = null;

    this.ghosts = [];
    this._ghostTimer = 0;
    this._ghostGeo = new THREE.CapsuleGeometry(0.35, 1.2, 4, 10);

    this.build();
  }

  build() {
    const armor = new THREE.MeshStandardMaterial({ color: 0x1b2747, roughness: 0.36, metalness: 0.82 });
    const armorLight = new THREE.MeshStandardMaterial({ color: 0x2c3c66, roughness: 0.32, metalness: 0.8 });
    const armorDark = new THREE.MeshStandardMaterial({ color: 0x101a33, roughness: 0.48, metalness: 0.72 });
    const plate = new THREE.MeshStandardMaterial({ color: 0x3a4d7a, roughness: 0.3, metalness: 0.7 });
    const white = new THREE.MeshStandardMaterial({ color: 0xdfeeff, emissive: 0x4a6a9a, emissiveIntensity: 0.5, roughness: 0.4 });
    const cyan = new THREE.MeshStandardMaterial({ color: 0x004a55, emissive: 0x19e8ff, emissiveIntensity: 2.0, roughness: 0.28 });
    const cyanDim = new THREE.MeshStandardMaterial({ color: 0x003038, emissive: 0x19e8ff, emissiveIntensity: 1.2, roughness: 0.3 });
    this._cyan = cyan;
    this._armor = armor;
    this._armorLight = armorLight;
    this._armorDark = armorDark;
    this._cyanDim = cyanDim;

    const box = (w, h, d, mat, x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      return m;
    };
    const glowLine = (w, h, d, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), cyanDim);
      m.position.set(x, y, z);
      return m;
    };

    // body group (for breathing + recoil lean)
    this.body = new THREE.Group();
    this.group.add(this.body);

    // ---------------- LEGS ----------------
    this.legL = new THREE.Group();
    this.legR = new THREE.Group();
    this.legL.position.set(-0.24, 0.95, 0);
    this.legR.position.set(0.24, 0.95, 0);
    for (const [leg, sx] of [[this.legL, -1], [this.legR, 1]]) {
      const thigh = box(0.3, 0.56, 0.34, armor, 0, -0.28, 0);
      const knee = box(0.27, 0.2, 0.32, armorLight, 0, -0.58, 0.02);
      const shin = box(0.24, 0.46, 0.28, armorDark, 0, -0.82, 0);
      const boot = box(0.33, 0.24, 0.52, armor, 0, -1.04, 0.12);
      const bootToe = box(0.3, 0.14, 0.2, armorLight, 0, -1.12, 0.34);
      const shinGlow = glowLine(0.06, 0.34, 0.04, sx * 0.1, -0.82, 0.15);
      leg.add(thigh, knee, shin, boot, bootToe, shinGlow);
      leg.userData.baseX = sx * 0.24;
    }
    this.body.add(this.legL, this.legR);

    // ---------------- TORSO ----------------
    this.torso = new THREE.Group();
    this.torso.position.y = 0.95;

    const pelvis = box(0.64, 0.42, 0.4, armorDark, 0, 0.0, 0);
    const pelvisGlow = glowLine(0.5, 0.05, 0.05, 0, 0.18, 0.2);
    const abdomen = box(0.52, 0.34, 0.36, armor, 0, 0.34, 0);
    const abLine1 = glowLine(0.46, 0.03, 0.04, 0, 0.3, 0.19);
    const abLine2 = glowLine(0.46, 0.03, 0.04, 0, 0.42, 0.19);
    const chest = box(0.78, 0.52, 0.44, armor, 0, 0.74, 0);
    const chestL = box(0.34, 0.44, 0.22, armorLight, -0.2, 0.76, 0.22);
    const chestR = box(0.34, 0.44, 0.22, armorLight, 0.2, 0.76, 0.22);
    const chestTrim = box(0.8, 0.04, 0.46, armorDark, 0, 0.6, 0);

    // bright cyan chest energy reactor
    const reactor = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.12, 18), cyan);
    reactor.rotation.x = Math.PI / 2;
    reactor.position.set(0, 0.74, 0.26);
    this.chestCore = reactor;
    const reactorRing = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.03, 8, 20), cyanDim);
    reactorRing.position.set(0, 0.74, 0.27);
    const spineGlow = glowLine(0.06, 0.5, 0.05, 0, 0.66, -0.22);

    // broad armored shoulders
    this.shoulderL = box(0.44, 0.38, 0.5, armor, -0.54, 0.78, 0);
    this.shoulderR = box(0.44, 0.38, 0.5, armor, 0.54, 0.78, 0);
    this.shoulderL.rotation.z = 0.12; this.shoulderR.rotation.z = -0.12;
    const pauldronGlowL = glowLine(0.06, 0.3, 0.4, -0.74, 0.78, 0);
    const pauldronGlowR = glowLine(0.06, 0.3, 0.4, 0.74, 0.78, 0);
    // blue-gray armor plates + small white markings on shoulders
    const purpleL = box(0.12, 0.1, 0.4, plate, -0.5, 0.94, 0);
    const purpleR = box(0.12, 0.1, 0.4, plate, 0.5, 0.94, 0);
    box(0.1, 0.04, 0.32, white, -0.5, 1.02, 0.02);
    box(0.1, 0.04, 0.32, white, 0.5, 1.02, 0.02);

    this.torso.add(pelvis, pelvisGlow, abdomen, abLine1, abLine2, chest, chestL, chestR, chestTrim,
      reactor, reactorRing, spineGlow, this.shoulderL, this.shoulderR,
      pauldronGlowL, pauldronGlowR, purpleL, purpleR);
    this.body.add(this.torso);

    // ---------------- ARMS ----------------
    this.armL = new THREE.Group();
    this.armR = new THREE.Group();
    this.armL.position.set(-0.54, 0.78, 0);
    this.armR.position.set(0.54, 0.78, 0);
    for (const [arm, sx] of [[this.armL, -1], [this.armR, 1]]) {
      const upper = box(0.22, 0.46, 0.24, armor, 0, -0.24, 0);
      const fore = box(0.2, 0.44, 0.22, armorDark, 0, -0.66, 0.02);
      const glove = box(0.24, 0.2, 0.28, armor, 0, -0.94, 0.05);
      const foreGlow = glowLine(0.05, 0.32, 0.03, sx * 0.1, -0.66, 0.13);
      const elbow = box(0.2, 0.16, 0.22, armorLight, 0, -0.46, 0);
      arm.add(upper, fore, glove, foreGlow, elbow);
      arm.userData.baseX = sx * 0.54;
    }
    this.torso.add(this.armL, this.armR);

    // weapon mount on right hand
    this.weaponMount = new THREE.Group();
    this.weaponMount.position.set(0, -0.98, 0.12);
    this.armR.add(this.weaponMount);

    // ---------------- HEAD / HELMET ----------------
    this.head = new THREE.Group();
    this.head.position.set(0, 1.04, 0);
    const shell = box(0.44, 0.46, 0.44, armorLight, 0, 0, 0);
    const shellTop = box(0.3, 0.16, 0.34, armor, 0, 0.26, -0.02);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.11, 0.06), cyan);
    visor.position.set(0, -0.02, 0.22);
    this.visor = visor;
    const sideL = box(0.12, 0.4, 0.36, armor, -0.24, 0, 0);
    const sideR = box(0.12, 0.4, 0.36, armor, 0.24, 0, 0);
    const rear = box(0.4, 0.42, 0.14, armorDark, 0, 0.02, -0.24);
    const crest = box(0.1, 0.18, 0.32, cyanDim, 0, 0.24, -0.04);
    const jawGlow = glowLine(0.3, 0.04, 0.05, 0, -0.16, 0.2);
    this.head.add(shell, shellTop, visor, sideL, sideR, rear, crest, jawGlow);
    this.torso.add(this.head);

    // shadow blob for grounding
    const blob = new THREE.Mesh(new THREE.CircleGeometry(0.8, 20),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 }));
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.02;
    this.group.add(blob);
  }

  setMuzzleProvider(fn) { this._muzzleWorld = fn; }
  getMuzzleWorld(target) { return this._muzzleWorld ? this._muzzleWorld(target) : this.group.position.clone(); }

  tryDash() {
    if (this.dashCd > 0 || this.dashing > 0 || !this.alive) return false;
    this.dashing = 0.18;
    this.invuln = Math.max(this.invuln, 0.26);
    this.dashCd = this.dashMax * this.dashCdMult;
    this.audio.play('dash');
    return true;
  }

  onShoot() { this.shootTimer = 0.12; }

  onHit() { this.hitTimer = 0.25; }

  takeDamage(amount) {
    if (this.invuln > 0 || !this.alive) return 0;
    let dmg = amount;
    if (this.shield > 0) {
      const absorbed = Math.min(this.shield, dmg);
      this.shield -= absorbed;
      dmg -= absorbed;
      this.lastDamageShield = absorbed > 0;
      this.audio.play('shieldDamage');
    } else {
      this.lastDamageShield = false;
    }
    if (dmg > 0) {
      this.health -= dmg;
      this.audio.play('playerDamage');
    }
    this.shieldTimer = 0;
    this.invuln = 0.5;
    this.onHit();
    if (this.health <= 0) { this.health = 0; this.alive = false; }
    return amount;
  }

  heal(amount) {
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  addXP(amount) {
    this.xp += amount;
  }

  update(dt, opts) {
    const { moveVec, sprint, aimYaw, reloading } = opts;
    if (reloading !== undefined) this.reloading = reloading;
    if (!this.alive) return;

    // timers
    if (this.dashCd > 0) this.dashCd -= dt;
    if (this.invuln > 0) this.invuln -= dt;
    if (this.shootTimer > 0) this.shootTimer -= dt;
    if (this.hitTimer > 0) this.hitTimer -= dt;

    // shield regen
    this.shieldTimer += dt;
    if (this.shieldTimer >= this.shieldRegenDelay && this.shield < this.maxShield) {
      const before = this.shield;
      this.shield = Math.min(this.maxShield, this.shield + dt * 14);
      if (before === 0 && this.shield > 0) this.audio.play('shieldRecharge');
    }

    // movement
    let speed = this.speed * this.moveMult;
    const moving = moveVec.lengthSq() > 0.001;
    if (this.dashing > 0) {
      this.dashing -= dt;
      this.group.position.addScaledVector(this.dashDir, 26 * dt);
      this._ghostTimer -= dt;
      if (this._ghostTimer <= 0) { this._ghostTimer = 0.035; this.spawnGhost(); }
    } else if (moving) {
      const s = sprint ? speed * this.sprintMult : speed;
      this.group.position.addScaledVector(moveVec, s * dt);
    }

    // dash afterimages cleanup
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const g = this.ghosts[i];
      g.life -= dt;
      const f = Math.max(0, g.life / g.max);
      g.mesh.material.opacity = f * 0.5;
      g.mesh.scale.setScalar(1 + (1 - f) * 0.25);
      if (g.life <= 0) { this.scene.remove(g.mesh); this.ghosts.splice(i, 1); }
    }

    // bounds
    const lim = ARENA - 2;
    this.group.position.x = THREE.MathUtils.clamp(this.group.position.x, -lim, lim);
    this.group.position.z = THREE.MathUtils.clamp(this.group.position.z, -lim, lim);
    this.group.position.y = 0;

    // face aim direction
    this.group.rotation.y = aimYaw;

    // ---- animation ----
    this.animTime += dt;
    this.gait += dt * (moving ? (sprint ? 14 : 9) : 0);
    this.animate(dt, moving, sprint);
  }

  spawnGhost() {
    const m = new THREE.Mesh(this._ghostGeo, new THREE.MeshBasicMaterial({
      color: 0x00f0ff, transparent: true, opacity: 0.5, depthWrite: false,
    }));
    m.position.set(this.group.position.x, 1.05, this.group.position.z);
    m.rotation.y = this.group.rotation.y;
    m.scale.set(0.55, 1.0, 0.55);
    this.scene.add(m);
    this.ghosts.push({ mesh: m, life: 0.32, max: 0.32 });
  }

  animate(dt, moving, sprint) {
    // breathing / idle
    const breath = Math.sin(this.animTime * 1.6) * 0.02;
    this.body.position.y = moving ? 0 : breath;

    // legs — alternating swing
    const swing = moving ? Math.sin(this.gait) * (sprint ? 0.85 : 0.5) : 0;
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    this.legL.position.x = this.legL.userData.baseX + (moving ? Math.cos(this.gait) * 0.04 : 0);
    this.legR.position.x = this.legR.userData.baseX - (moving ? Math.cos(this.gait) * 0.04 : 0);

    // arm swing (left arm opposite to legs)
    const armSwing = moving ? Math.sin(this.gait) * 0.32 : 0;
    const idleSway = moving ? 0 : Math.sin(this.animTime * 1.6) * 0.05;

    // recoil + hit reactions
    let recoil = 0;
    if (this.shootTimer > 0) recoil = (this.shootTimer / 0.12) * 0.2;
    let hitLean = 0;
    if (this.hitTimer > 0) hitLean = Math.sin(this.hitTimer * 30) * 0.09;

    // torso — forward lean when running + small rotation while walking
    const runLean = moving ? (sprint ? 0.32 : 0.13) : 0;
    this.torso.rotation.x = runLean + recoil - hitLean * 0.5;
    this.torso.rotation.y = moving && !sprint ? Math.sin(this.gait * 0.5) * 0.06 : 0;
    this.torso.position.z = hitLean * 0.08;

    // body lean for dash
    const bodyLean = this.dashing > 0 ? -0.45 : 0;
    this.body.rotation.x += (bodyLean - this.body.rotation.x) * Math.min(1, dt * 12);

    // ---- arm targets ----
    let rArmX = -1.3 + idleSway + recoil * 0.6;
    let rArmZ = -0.05;
    let lArmX = -armSwing;
    let lArmZ = 0.1 + (sprint ? Math.sin(this.animTime * 1.6) * 0.05 : 0);
    if (this.reloading) {
      // weapon inward, one arm reaches to chamber
      rArmX = -0.85; rArmZ = -0.3;
      lArmX = -0.95; lArmZ = 0.22;
    }
    if (this.dashing > 0) { rArmX = -1.55; lArmX = -1.5; }
    this.armR.rotation.x += (rArmX - this.armR.rotation.x) * Math.min(1, dt * 18);
    this.armR.rotation.z += (rArmZ - this.armR.rotation.z) * Math.min(1, dt * 18);
    this.armL.rotation.x += (lArmX - this.armL.rotation.x) * Math.min(1, dt * 18);
    this.armL.rotation.z += (lArmZ - this.armL.rotation.z) * Math.min(1, dt * 18);

    // ---- emissive energy ----
    const flash = this.hitTimer > 0 ? (Math.sin(this.hitTimer * 40) * 0.5 + 0.5) : 0;
    this.chestCore.material.emissiveIntensity = 1.8 + flash * 2.5 + (this.reloading ? (0.5 + 0.5 * Math.sin(this.animTime * 16)) * 1.6 : 0);
    this.visor.material.emissiveIntensity = 1.5 + flash * 1.5;
  }

  reset() {
    this.health = this.maxHealth;
    this.shield = this.maxShield;
    this.level = 1; this.xp = 0; this.xpToNext = 8;
    this.alive = true;
    this.dashCd = 0; this.dashing = 0; this.invuln = 0;
    this.damageMult = 1; this.fireRateMult = 1; this.magSizeMult = 1;
    this.reloadMult = 1; this.moveMult = 1; this.dashCdMult = 1;
    this.critChance = 0.05; this.critMult = 2;
    this.upgradeStacks = {};
    this.reloading = false;
    this.gait = 0;
    for (const g of this.ghosts) this.scene.remove(g.mesh);
    this.ghosts.length = 0;
    this.group.position.set(0, 0, 60);
    this.group.rotation.set(0, 0, 0);
  }
}
