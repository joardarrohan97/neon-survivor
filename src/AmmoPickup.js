// =========================================================
//  NEON SURVIVOR: CORE BREACH — AmmoPickup
//  Dropped ammo (small) + large terminal ammo crate.
//  Uses AssetManager for Prop_Ammo.gltf / Prop_Crate_Large.gltf,
//  falling back to a glowing procedural cyan pickup.
// =========================================================
import * as THREE from 'three';
import { fitToGround } from './AssetManager.js';

const CYAN = 0x19e8ff;

export class AmmoPickup {
  constructor(scene, assets, pos, amount, isLarge = false) {
    this.scene = scene;
    this.amount = amount;
    this.isLarge = isLarge;

    this.group = new THREE.Group();
    this.group.position.copy(pos);

    this.t = Math.random() * 6;
    this.baseY = isLarge ? 0.55 : 0.8;

    // Prefer the real glTF props; fall back to a procedural glowing pickup.
    const assetKey = isLarge ? 'crateLarge' : 'ammo';
    let model = null;
    if (assets && assets.isLoaded(assetKey)) {
      try { model = assets.clone(assetKey); } catch (e) { model = null; }
    }
    if (model) {
      const targetH = isLarge ? 1.5 : 0.8;
      fitToGround(model, targetH);
      this.group.add(model);
    } else {
      model = this._buildProcedural(isLarge);
      this.group.add(model);
    }
    this.model = model;

    // cyan glow orb (hovering above the pickup)
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(isLarge ? 0.55 : 0.3, 12, 12),
      new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.5 })
    );
    glow.position.y = this.baseY;
    this.group.add(glow);
    this.glow = glow;

    // cyan point light for local illumination
    const light = new THREE.PointLight(CYAN, isLarge ? 1.6 : 1.1, isLarge ? 12 : 9, 2);
    light.position.y = this.baseY;
    this.group.add(light);
    this.light = light;

    scene.add(this.group);
  }

  // Procedural fallback (used only if the glTF asset is unavailable).
  _buildProcedural(isLarge) {
    const g = new THREE.Group();
    const body = new THREE.MeshStandardMaterial({
      color: 0x003842, emissive: CYAN, emissiveIntensity: 2.0, roughness: 0.3, metalness: 0.6,
    });
    const trim = new THREE.MeshStandardMaterial({
      color: 0x002028, emissive: CYAN, emissiveIntensity: 1.2, roughness: 0.3,
    });
    if (isLarge) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.9), body);
      const lid = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.12, 0.96), trim);
      lid.position.y = 0.42;
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.1, 0.98), trim);
      stripe.position.y = 0.08;
      g.add(box, lid, stripe);
    } else {
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.4), body);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.1, 12), trim);
      cap.position.y = 0.3;
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.42), trim);
      g.add(box, cap, band);
    }
    return g;
  }

  update(dt) {
    this.t += dt;
    this.model.rotation.y += dt * 1.2;
    this.group.position.y = this.baseY + Math.sin(this.t * 2) * (this.isLarge ? 0.06 : 0.12);
    this.glow.material.opacity = 0.35 + Math.sin(this.t * 3) * 0.2;
    this.light.intensity = (this.isLarge ? 1.4 : 1.0) + Math.sin(this.t * 3) * 0.4;
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.isMesh) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
          else o.material.dispose();
        }
      }
    });
  }
}
