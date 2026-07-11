// =========================================================
//  NEON SURVIVOR: CORE BREACH — Projectile
//  Pooled enemy/boss projectiles + player tracer visuals
// =========================================================
import * as THREE from 'three';

export class ProjectileManager {
  constructor(scene, game) {
    this.scene = scene;
    this.game = game;
    this.group = new THREE.Group();
    scene.add(this.group);

    this.pool = [];
    this.active = [];
    this.tracers = [];
    this.tracerPool = [];

    this._buildPool(60);
    this._buildTracers(48);
  }

  _buildPool(n) {
    for (let i = 0; i < n; i++) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.25, 10, 10),
        new THREE.MeshBasicMaterial({ color: 0xff3b57 })
      );
      mesh.visible = false;
      this.group.add(mesh);
      this.pool.push(mesh);
    }
  }

  _buildTracers(n) {
    const geo = new THREE.CylinderGeometry(0.04, 0.04, 1, 6);
    geo.translate(0, 0.5, 0); // pivot at base
    for (let i = 0; i < n; i++) {
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.9 }));
      mesh.visible = false;
      this.group.add(mesh);
      this.tracerPool.push(mesh);
    }
  }

  spawnEnemyProjectile(pos, dir, speed, damage, color = 0xff3b57, radius = 0.25) {
    let mesh = this.pool.find(m => !m.visible);
    if (!mesh) { mesh = this.pool[0]; }
    mesh.material.color.setHex(color);
    mesh.scale.setScalar(radius / 0.25);
    mesh.position.copy(pos);
    mesh.visible = true;
    const vel = dir.clone().normalize().multiplyScalar(speed);
    this.active.push({ mesh, vel, damage, radius, life: 6 });
  }

  spawnTracer(from, to, color = 0x00f0ff) {
    let mesh = this.tracerPool.find(m => !m.visible);
    if (!mesh) mesh = this.tracerPool[0];
    mesh.material.color.setHex(color);
    mesh.material.opacity = 0.9;
    mesh.position.copy(from);
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();
    if (len < 0.001) return;
    mesh.scale.set(1, len, 1);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    mesh.visible = true;
    this.tracers.push({ mesh, life: 0.09 });
  }

  update(dt) {
    const player = this.game.player;
    const pPos = player ? player.group.position : null;
    // enemy projectiles
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      p.mesh.position.addScaledVector(p.vel, dt);
      p.life -= dt;
      let dead = p.life <= 0;
      if (!dead && pPos && player.alive) {
        const dx = p.mesh.position.x - pPos.x;
        const dy = p.mesh.position.y - (pPos.y + 1.0);
        const dz = p.mesh.position.z - pPos.z;
        const rr = p.radius + player.radius;
        if (dx * dx + dy * dy + dz * dz <= rr * rr) {
          player.takeDamage(p.damage);
          this.game.onPlayerHit(p.mesh.position);
          this.game.spawnImpact(p.mesh.position, 0xff3b57);
          dead = true;
        }
      }
      if (dead) {
        p.mesh.visible = false;
        this.active.splice(i, 1);
      }
    }
    // tracers
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      t.mesh.material.opacity = Math.max(0, t.life / 0.09) * 0.9;
      if (t.life <= 0) { t.mesh.visible = false; this.tracers.splice(i, 1); }
    }
  }

  clear() {
    for (const p of this.active) p.mesh.visible = false;
    this.active.length = 0;
    for (const t of this.tracers) t.mesh.visible = false;
    this.tracers.length = 0;
  }
}
