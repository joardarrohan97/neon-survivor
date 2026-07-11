// =========================================================
//  NEON SURVIVOR: CORE BREACH — EnemyManager
//  Spawning, AI updates, contact damage, cleanup
// =========================================================
import * as THREE from 'three';
import { Enemy, Boss } from './Enemy.js';
import { ARENA } from './World.js';

export class EnemyManager {
  constructor(scene, game) {
    this.scene = scene;
    this.game = game;
    this.enemies = [];
    this.boss = null;
    this.difficulty = 1;
    this.bossPhase = false;
  }

  setBossPhase(active) {
    this.bossPhase = !!active;
  }

  spawn(type, position) {
    const e = new Enemy(type, position, this.scene, this.game);
    this.enemies.push(e);
    // spawn flash
    this.game.spawnImpact(position.clone().setY(1), 0xff3b57, 1.5);
    return e;
  }

  spawnAtRandom(type) {
    if (this.bossPhase) return null; // normal spawning paused during the boss fight
    const player = this.game.player;
    let x, z, tries = 0;
    do {
      x = (Math.random() - 0.5) * (ARENA * 2 - 12);
      z = (Math.random() - 0.5) * (ARENA * 2 - 12);
      tries++;
    } while (player && Math.hypot(x - player.group.position.x, z - player.group.position.z) < 26 && tries < 30);
    return this.spawn(type, new THREE.Vector3(x, 0, z));
  }

  spawnBossDrones(n) {
    const center = this.boss ? this.boss.group.position : this.game.player.group.position;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const p = new THREE.Vector3(center.x + Math.cos(a) * 6, 0, center.z + Math.sin(a) * 6);
      this.spawn('drone', p);
    }
  }

  spawnBoss() {
    if (this.boss) return;
    const b = new Boss(new THREE.Vector3(0, 0, 0), this.scene, this.game);
    b.name = 'THE NULL WARDEN';
    this.boss = b;
    this.game.audio.play('bossAppear');
    this.game.addShake(8);
    return b;
  }

  getHitTargets() {
    const arr = [];
    for (const e of this.enemies) if (!e.dying) arr.push(...e.hitTargets);
    if (this.boss && !this.boss.dying) arr.push(...this.boss.hitTargets);
    return arr;
  }

  update(dt, player) {
    // enemies
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      e.update(dt, player);

      // contact melee (drones)
      if (e.melee && e.type === 'drone' && !e.dying && !e.spawning) {
        e.attackCd -= dt;
        const dx = e.group.position.x - player.group.position.x;
        const dz = e.group.position.z - player.group.position.z;
        const d = Math.hypot(dx, dz);
        if (d < e.radius + player.radius + 0.1 && e.attackCd <= 0) {
           player.takeDamage(e.damage);
           this.game.onPlayerHit(e.group.position);
           e.attackCd = 1.0;
        }
      }

      // separation
      for (let j = i - 1; j >= 0; j--) {
        const o = this.enemies[j];
        if (o.dying || e.dying) continue;
        const dx = e.group.position.x - o.group.position.x;
        const dz = e.group.position.z - o.group.position.z;
        const min = e.radius + o.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 < min * min && d2 > 0.0001) {
          const d = Math.sqrt(d2);
          const push = (min - d) * 0.5;
          e.group.position.x += (dx / d) * push;
          e.group.position.z += (dz / d) * push;
          o.group.position.x -= (dx / d) * push;
          o.group.position.z -= (dz / d) * push;
        }
      }

      // remove after death anim
      if (e.dying && e.deathTimer <= 0) {
        if (e._slamTele) this.game.removeTelegraph(e._slamTele);
        this.scene.remove(e.group);
        this.enemies.splice(i, 1);
      }
    }

    // boss
    if (this.boss) {
      this.boss.update(dt, player);
      if (this.boss.dying && this.boss.deathTimer <= 0) {
        if (this.boss._tele) this.game.removeTelegraph(this.boss._tele);
        this.scene.remove(this.boss.group);
        this.boss = null;
      }
    }
  }

  count() { return this.enemies.length; }

  clear() {
    for (const e of this.enemies) this.scene.remove(e.group);
    this.enemies.length = 0;
    if (this.boss) { this.scene.remove(this.boss.group); this.boss = null; }
    this.bossPhase = false;
  }
}
