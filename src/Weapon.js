// =========================================================
//  NEON SURVIVOR: CORE BREACH — Weapon (Pulse Rifle)
//  Procedural energy rifle + ammo / reload / recoil
// =========================================================
import * as THREE from 'three';
import { fitToForward } from './AssetManager.js';

export class Weapon {
  constructor(mount, player, audio) {
    this.player = player;
    this.audio = audio;
    this.mount = mount;
    this.group = new THREE.Group();
    mount.add(this.group);
    this.group.rotation.x = this.baseRotX;

    this.baseMag = 24;
    this.ammo = this.baseMag;
    this.baseReserve = 180;
    this.reserve = this.baseReserve;
    this.maxReserve = 300;
    this.fireRate = 0.1; // seconds between shots (base)
    this.fireCd = 0;
    this.reloading = false;
    this.reloadTime = 1.4;
    this.reloadTimer = 0;
    this.reloadAnim = 0;
    this.recoil = 0;
    this.muzzleFlashTimer = 0;
    this.adsBlend = 0;
    this.baseRotX = 1.3; // counter-rotates the arm's forward pose so the barrel is horizontal

    this.build();
  }

  build() {
    const dark = new THREE.MeshStandardMaterial({ color: 0x0d1224, roughness: 0.4, metalness: 0.85 });
    const mid = new THREE.MeshStandardMaterial({ color: 0x1c2447, roughness: 0.38, metalness: 0.82 });
    const light = new THREE.MeshStandardMaterial({ color: 0x2a3568, roughness: 0.35, metalness: 0.8 });
    const cyan = new THREE.MeshStandardMaterial({ color: 0x003842, emissive: 0x00f0ff, emissiveIntensity: 1.8, roughness: 0.3 });
    const cyanDim = new THREE.MeshStandardMaterial({ color: 0x002028, emissive: 0x00f0ff, emissiveIntensity: 1.0, roughness: 0.3 });
    const purple = new THREE.MeshStandardMaterial({ color: 0x2a1140, emissive: 0x9b5cff, emissiveIntensity: 1.0, roughness: 0.4 });

    const box = (w, h, d, mat, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      return m;
    };

    // weapon built pointing +Z (forward)
    const parts = [];
    // main body
    parts.push(box(0.18, 0.2, 0.9, dark, 0, 0, 0.1));
    // stock
    const stock = box(0.14, 0.16, 0.4, dark, 0, -0.02, -0.45);
    stock.rotation.x = 0.08;
    parts.push(stock);
    // grip
    const grip = box(0.12, 0.32, 0.14, dark, 0, -0.24, -0.12);
    grip.rotation.x = 0.4;
    parts.push(grip);
    // foregrip
    const foregrip = box(0.1, 0.2, 0.1, mid, 0, -0.16, 0.45);
    foregrip.rotation.x = 0.3;
    parts.push(foregrip);
    // top rail
    parts.push(box(0.06, 0.08, 0.9, mid, 0, 0.14, 0.1));
    // rear sight
    parts.push(box(0.04, 0.1, 0.1, cyanDim, 0, 0.2, -0.25));
    // front sight
    parts.push(box(0.04, 0.12, 0.08, cyanDim, 0, 0.22, 0.55));
    // barrel
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.8, 14), mid);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.03, 0.7);
    parts.push(barrel);
    // muzzle brake
    const muzzleBrake = box(0.16, 0.16, 0.18, dark, 0, 0.03, 1.05);
    parts.push(muzzleBrake);
    // energy chamber (below body)
    const chamber = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 16), cyan);
    chamber.position.set(0, -0.05, 0.05);
    this.chamber = chamber;
    parts.push(chamber);
    // cyan energy cell (side)
    const cell = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.5), cyan);
    cell.position.set(0.11, 0.02, 0.1);
    parts.push(cell);
    // side rail glow
    parts.push(box(0.03, 0.03, 0.5, cyanDim, -0.1, 0.06, 0.1));
    // purple accent
    parts.push(box(0.1, 0.05, 0.3, purple, 0, -0.13, -0.1));

    for (const p of parts) this.group.add(p);

    // muzzle anchor
    this.muzzle = new THREE.Object3D();
    this.muzzle.position.set(0, 0.03, 1.2);
    this.group.add(this.muzzle);

    // muzzle flash (cone + sprite-like plane)
    this.flash = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 10),
      new THREE.MeshBasicMaterial({ color: 0xbff6ff, transparent: true, opacity: 0.95 }));
    this.flash.rotation.x = Math.PI / 2;
    this.flash.position.set(0, 0.03, 1.25);
    this.flash.visible = false;
    this.group.add(this.flash);

    // muzzle light (kept cheap; only visible while firing)
    this.muzzleLight = new THREE.PointLight(0x00f0ff, 0, 7, 2);
    this.muzzleLight.position.set(0, 0.03, 1.2);
    this.group.add(this.muzzleLight);
  }

    getMuzzleWorld(target) {
      return this.muzzle.getWorldPosition(target || new THREE.Vector3());
    }

    // Swap the procedural rifle for the real Gun_Rifle glTF once it is cached.
    // Uses the shared AssetManager cache (clone) so the glTF is never reloaded.
    applyAsset(assets) {
      if (this._assetApplied) return;
      if (!assets || !assets.isLoaded('rifle')) return; // graceful fallback to procedural rifle

      let model;
      try {
        model = assets.clone('rifle');
        if (!model) return;
      } catch (e) {
        console.warn('[WEAPON] rifle clone failed; keeping procedural rifle', e);
        return;
      }
      this._assetApplied = true;

      // remove the procedural visual, but keep this.group and its transform
      for (let i = this.group.children.length - 1; i >= 0; i--) {
        this.group.remove(this.group.children[i]);
      }

      // holder keeps the real model + muzzle/flash on a single consistent node
      const holder = new THREE.Group();
      this.group.add(holder);
      this.visual = holder;

      // orient + scale the real rifle so its barrel points +Z (forward)
      fitToForward(model, 1.2);
      holder.add(model);

      // muzzle anchor Object3D at the forward-most point of the rifle (barrel tip)
      const frontZ = model.userData.__frontZ || 0.6;
      this.muzzle = new THREE.Object3D();
      this.muzzle.position.set(0, 0, frontZ);
      holder.add(this.muzzle);

      // muzzle flash + light re-created and placed at the barrel tip
      this.flash = new THREE.Mesh(
        new THREE.ConeGeometry(0.22, 0.6, 10),
        new THREE.MeshBasicMaterial({ color: 0xbff6ff, transparent: true, opacity: 0.95 })
      );
      this.flash.rotation.x = Math.PI / 2;
      this.flash.position.set(0, 0, frontZ);
      this.flash.visible = false;
      holder.add(this.flash);

      this.muzzleLight = new THREE.PointLight(0x00f0ff, 0, 7, 2);
      this.muzzleLight.position.set(0, 0, frontZ);
      holder.add(this.muzzleLight);

      this.chamber = null; // procedural chamber no longer exists
    }

  canFire() {
    return this.ammo > 0 && !this.reloading && this.fireCd <= 0 && this.player.alive;
  }

  consume() {
    this.ammo--;
    this.fireCd = this.fireRate / this.player.fireRateMult;
    this.recoil = 1;
    this.muzzleFlashTimer = 0.06;
    this.flash.visible = true;
    this.muzzleLight.intensity = 4;
    this.player.onShoot();
    this.audio.play('shoot');
  }

  startReload() {
    if (this.reloading || this.ammo >= this.maxAmmo()) return false;
    this.reloading = true;
    this.reloadTimer = this.reloadTime / this.player.reloadMult;
    this.reloadAnim = 1;
    this.audio.play('reload');
    return true;
  }

  maxAmmo() { return Math.round(this.baseMag * this.player.magSizeMult); }

  // Add to reserve, capped at maxReserve. Returns the amount actually added.
  addReserve(amount) {
    const before = this.reserve;
    this.reserve = Math.min(this.maxReserve, this.reserve + amount);
    return this.reserve - before;
  }

  update(dt, opts) {
    const aiming = !!(opts && opts.aiming);
    if (this.fireCd > 0) this.fireCd -= dt;
    const adsTarget = aiming ? 1 : 0;
    this.adsBlend += (adsTarget - this.adsBlend) * Math.min(1, dt * 10);
    if (this.recoil > 0) {
      this.recoil = Math.max(0, this.recoil - dt * 5);
      this.group.position.z = -this.recoil * 0.12 - this.adsBlend * 0.08;
      this.group.position.y = this.adsBlend * 0.05;
      this.group.rotation.x = this.baseRotX + this.recoil * 0.18;
      if (this.chamber) this.chamber.material.emissiveIntensity = 1.9 + this.recoil * 2.2;
    } else {
      this.group.position.z += (-this.adsBlend * 0.08 - this.group.position.z) * Math.min(1, dt * 12);
      this.group.position.y += (this.adsBlend * 0.05 - this.group.position.y) * Math.min(1, dt * 12);
      this.group.rotation.x += (this.baseRotX - this.group.rotation.x) * Math.min(1, dt * 12);
      if (this.chamber) this.chamber.material.emissiveIntensity += (1.9 - this.chamber.material.emissiveIntensity) * Math.min(1, dt * 6);
    }
    if (this.muzzleFlashTimer > 0) {
      this.muzzleFlashTimer -= dt;
      this.muzzleLight.intensity = Math.max(0, this.muzzleLight.intensity - dt * 50);
      if (this.muzzleFlashTimer <= 0) { this.flash.visible = false; this.muzzleLight.intensity = 0; }
    }
    if (this.reloading) {
      this.reloadTimer -= dt;
      this.reloadAnim = Math.min(1, this.reloadAnim + dt * 2.5);
      if (this.reloadTimer <= 0) {
        this.reloading = false;
        this.reloadAnim = 0;
        const need = this.maxAmmo() - this.ammo;
        const take = Math.min(need, this.reserve);
        this.ammo += take;
        this.reserve -= take;
        this.audio.play('reloadComplete');
      }
    }
  }

  reset() {
    this.ammo = this.maxAmmo();
    this.reserve = this.baseReserve;
    this.reloading = false;
    this.fireCd = 0;
    this.recoil = 0;
    this.reloadAnim = 0;
  }
}
