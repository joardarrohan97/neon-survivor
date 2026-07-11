// =========================================================
//  NEON SURVIVOR: CORE BREACH — AmmoPickup
//  Collectible ammo crate (real Prop_Ammo glTF or procedural glow)
// =========================================================
import * as THREE from 'three';
import { fitToGround } from './AssetManager.js';

const AMMO_COLOR = 0xffc23a; // gold/amber ammo glow

export class AmmoPickup {
  constructor(scene, assets, position, amount, isLarge = false) {
    this.scene = scene;
    this.assets = assets;
    this.amount = amount;
    this.isLarge = isLarge;
    this.collected = false;

    const g = new THREE.Group();
    g.position.copy(position);
    this.group = g;

    this._buildVisual();

    // ground glow (danger-free, friendly amber)
    const glow = new THREE.Mesh(
      new THREE.CircleGeometry(isLarge ? 1.5 : 0.9, 18),
      new THREE.MeshBasicMaterial({ color: AMMO_COLOR, transparent: true, opacity: 0.3, depthWrite: false })
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.05;
    g.add(glow);
    this.glow = glow;

    const light = new THREE.PointLight(AMMO_COLOR, isLarge ? 2.4 : 1.5, isLarge ? 15 : 9, 2);
    light.position.y = isLarge ? 1.2 : 0.8;
    g.add(light);
    this.light = light;

    scene.add(g);
    this.t = Math.random() * 6;
    this.baseY = g.position.y;
  }

  _buildVisual() {
    const assets = this.assets;
    if (assets && assets.isLoaded('ammo')) {
      const model = assets.clone('ammo');
      if (model) {
        const h = this.isLarge ? 1.6 : 1.0;
        fitToGround(model, h);
        this.visual = model;
        this.group.add(model);
        return;
      }
    }
    // procedural glowing ammo crate fallback
    const s = this.isLarge ? 1.0 : 0.7;
    const crate = new THREE.Mesh(
      new THREE.BoxGeometry(s, s, s),
      new THREE.MeshStandardMaterial({ color: 0x2a2410, emissive: AMMO_COLOR, emissiveIntensity: 1.1, roughness: 0.4, metalness: 0.6 })
    );
    crate.position.y = s / 2;
    this.crate = crate;
    this.group.add(crate);

    const band = new THREE.Mesh(
      new THREE.BoxGeometry(s * 1.06, s * 0.2, s * 1.06),
      new THREE.MeshBasicMaterial({ color: AMMO_COLOR })
    );
    band.position.y = s / 2;
    this.group.add(band);
  }

  update(dt) {
    this.t += dt;
    this.group.position.y = this.baseY + Math.sin(this.t * 2) * 0.12;
    this.group.rotation.y += dt * 1.0;
    if (this.glow) this.glow.material.opacity = 0.28 + Math.sin(this.t * 3) * 0.14;
    if (this.light) this.light.intensity = (this.isLarge ? 2.4 : 1.5) * (0.7 + 0.3 * Math.sin(this.t * 3));
  }

  dispose() {
    this.scene.remove(this.group);
  }
}
