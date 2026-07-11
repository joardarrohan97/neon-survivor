// =========================================================
//  NEON SURVIVOR: CORE BREACH — AssetManager
//  Loads, caches, clones and provides real glTF game assets.
//  Uses the same Three.js version as the project (0.160.0).
// =========================================================
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';

// Base browser-relative path to the Sci-Fi Essentials Kit glTF folder.
// The folder contains spaces and square brackets — encodeURI leaves the
// square brackets intact (they are valid in a URL path) and converts the
// spaces to %20, producing a valid browser URL.
const ASSET_ROOT = 'assets/files/Sci-Fi Essentials Kit[Standard]/glTF/';

function assetUrl(file) {
  return encodeURI(ASSET_ROOT + file);
}

function hasSkinned(root) {
  let skinned = false;
  root.traverse((o) => { if (o.isSkinnedMesh) skinned = true; });
  return skinned;
}

// Position a cloned model so its lowest point sits on y = 0 and it is
// horizontally centered on the local origin. Returns the fitted model.
// `targetHeight` controls the on-ground visual size.
export function fitToGround(model, targetHeight = 2) {
  model.rotation.set(0, 0, 0);
  model.scale.set(1, 1, 1);
  model.position.set(0, 0, 0);
  model.updateMatrixWorld(true);

  let box = new THREE.Box3().setFromObject(model);
  let size = box.getSize(new THREE.Vector3());
  const h = size.y || 1;
  const scale = targetHeight / h;
  model.scale.setScalar(scale);
  model.updateMatrixWorld(true);

  box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= box.min.y;

  model.userData.__frontZ = box.max.z;
  model.userData.__frontY = center.y;
  return model;
}

// Position a held / oriented model so its longest horizontal axis points
// toward +Z (the engine's forward / firing direction). The model is
// vertically and horizontally centered on the local origin so it can be
// attached to a hand / mount. `targetLen` sets the overall length.
export function fitToForward(model, targetLen = 1.1) {
  model.rotation.set(0, 0, 0);
  model.scale.set(1, 1, 1);
  model.position.set(0, 0, 0);
  model.updateMatrixWorld(true);

  let box = new THREE.Box3().setFromObject(model);
  let size = box.getSize(new THREE.Vector3());
  // align the longest horizontal axis to +Z (forward)
  if (size.x > size.z) {
    model.rotation.y = Math.PI / 2;
    model.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(model);
    size = box.getSize(new THREE.Vector3());
  }
  const len = Math.max(size.x, size.z) || 1;
  const scale = targetLen / len;
  model.scale.setScalar(scale);
  model.updateMatrixWorld(true);

  box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= center.y;

  model.userData.__frontZ = box.max.z;
  model.userData.__frontX = 0;
  model.userData.__frontY = 0;
  return model;
}

export class AssetManager {
  constructor() {
    this.loader = new GLTFLoader();
    this.cache = new Map();   // key -> original glTF scene (cached, shared)
    this.config = {
      // ---- REQUIRED combat assets ----
      eyeDrone:   { url: assetUrl('Enemy_EyeDrone.gltf'),   required: true },
      trilobite:  { url: assetUrl('Enemy_Trilobite.gltf'),  required: true },
      quadShell:  { url: assetUrl('Enemy_QuadShell.gltf'),  required: true },
      rifle:      { url: assetUrl('Gun_Rifle.gltf'),       required: true },
      // ---- OPTIONAL assets (failure must not crash the game) ----
      pistol:      { url: assetUrl('Gun_Pistol.gltf'),          required: false },
      revolver:    { url: assetUrl('Gun_Revolver.gltf'),        required: false },
      smgAmmo:     { url: assetUrl('Gun_SMG_Ammo.gltf'),        required: false },
      sniperAmmo:  { url: assetUrl('Gun_Sniper_Ammo.gltf'),     required: false },
      sniper:      { url: assetUrl('Gun_Sniper.gltf'),          required: false },
      ammoClosed:  { url: assetUrl('Prop_Ammo_Closed.gltf'),    required: false },
      ammoSmall:   { url: assetUrl('Prop_Ammo_Small.gltf'),     required: false },
      ammo:        { url: assetUrl('Prop_Ammo.gltf'),           required: false },
      barrel1:     { url: assetUrl('Prop_Barrel1.gltf'),        required: false },
      barrel2:     { url: assetUrl('Prop_Barrel2_Closed.gltf'), required: false },
      barrel2Open: { url: assetUrl('Prop_Barrel2_Open.gltf'),   required: false },
      chair:       { url: assetUrl('Prop_Chair.gltf'),          required: false },
      chest:       { url: assetUrl('Prop_Chest.gltf'),          required: false },
      crateLarge:  { url: assetUrl('Prop_Crate_Large.gltf'),    required: false },
      crateTarp:   { url: assetUrl('Prop_Crate_Tarp.gltf'),     required: false },
      crateTarpL:  { url: assetUrl('Prop_Crate_Tarp_Large.gltf'), required: false },
      crate:       { url: assetUrl('Prop_Crate.gltf'),          required: false },
      deskL:       { url: assetUrl('Prop_Desk_L.gltf'),         required: false },
      deskM:       { url: assetUrl('Prop_Desk_Medium.gltf'),    required: false },
      deskS:       { url: assetUrl('Prop_Desk_Small.gltf'),     required: false },
      grenade:     { url: assetUrl('Prop_Grenade.gltf'),        required: false },
      healthPack:  { url: assetUrl('Prop_HealthPack_Tube.gltf'), required: false },
      health:      { url: assetUrl('Prop_HealthPack.gltf'),     required: false },
      keyCard:     { url: assetUrl('Prop_KeyCard.gltf'),        required: false },
      locker:      { url: assetUrl('Prop_Locker.gltf'),         required: false },
      mine:        { url: assetUrl('Prop_Mine.gltf'),           required: false },
      mug:         { url: assetUrl('Prop_Mug.gltf'),            required: false },
      satellite:   { url: assetUrl('Prop_SatelliteDish.gltf'),  required: false },
      shelvesTS:   { url: assetUrl('Prop_Shelves_ThinShort.gltf'), required: false },
      shelvesTT:   { url: assetUrl('Prop_Shelves_ThinTall.gltf'), required: false },
      shelvesWS:   { url: assetUrl('Prop_Shelves_WideShort.gltf'), required: false },
      shelvesWT:   { url: assetUrl('Prop_Shelves_WideTall.gltf'), required: false },
      syringe:     { url: assetUrl('Prop_Syringe.gltf'),        required: false },
    };
    this._loading = false;
  }

  isLoaded(key) {
    return this.cache.has(key);
  }

  // Load every configured asset once. Already-cached assets are skipped so
  // assets are never reloaded. `onProgress(done, total, key)` is called after
  // each asset settles (success or failure). Resolves when all settle.
  async loadAll(onProgress) {
    if (this._loading) return;
    this._loading = true;
    const keys = Object.keys(this.config).filter((k) => !this.cache.has(k));
    const total = keys.length;
    let done = 0;
    if (total === 0) { this._loading = false; return; }
    await Promise.all(keys.map(async (key) => {
      try {
        await this._loadOne(key);
      } catch (e) {
        console.error('[ASSET] Failed...', key, e);
      }
      done++;
      if (onProgress) onProgress(done, total, key);
    }));
    this._loading = false;
  }

  // Backwards-compatible alias used by the game bootstrap.
  preload(onProgress) {
    return this.loadAll(onProgress);
  }

  _loadOne(key) {
    const cfg = this.config[key];
    if (!cfg || this.cache.has(key)) return Promise.resolve();
    const url = cfg.url;
    console.log('[ASSET] Loading...', key, url);
    return new Promise((resolve) => {
      this.loader.load(
        url,
        (gltf) => {
          const scene = gltf.scene;
          scene.userData.__skinned = hasSkinned(scene);
          scene.traverse((o) => {
            if (o.isMesh && o.material) {
              o.castShadow = false;
              o.receiveShadow = false;
            }
          });
          this.cache.set(key, scene);
          console.log('[ASSET] Loaded...', key, url);
          resolve();
        },
        undefined,
        (err) => {
          console.log('[ASSET] Failed...', key, url);
          if (cfg.required) {
            console.error('[ASSET] Required asset failed:', url, err);
          } else {
            console.warn('[ASSET] Optional asset failed:', url, err);
          }
          resolve(); // never reject: continue despite failures
        }
      );
    });
  }

  // Return the cached original scene (do NOT add this directly to the scene;
  // clone it first via clone()).
  get(name) {
    return this.cache.get(name) || null;
  }

  // Backwards-compatible alias used by the game bootstrap.
  getModel(name) {
    return this.get(name);
  }

  // Return a fresh clone of a cached model. Uses SkeletonUtils.clone for
  // skinned meshes, otherwise scene.clone(true) to share geometry/materials.
  clone(name) {
    const src = this.cache.get(name);
    if (!src) return null;
    if (src.userData.__skinned) return skeletonClone(src);
    return src.clone(true);
  }
}
