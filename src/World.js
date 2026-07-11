// =========================================================
//  NEON SURVIVOR: CORE BREACH — World
//  Procedural cyber-city combat arena
// =========================================================
import * as THREE from 'three';
import { fitToGround } from './AssetManager.js';

export const ARENA = 80; // half-extent of playable bounds

export class World {
  constructor(scene, assets) {
    this.scene = scene;
    this.assets = assets || null;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.barriers = [];
    this.holos = [];
    this.particles = null;
    this.pointLights = [];
    this.instanced = [];
    this.dynamicGlow = [];
    this.clock = 0;
    this.build();
  }

  build() {
    const scene = this.scene;

    // ---- fog + background (dark navy sky, readable) ----
    scene.background = new THREE.Color(0x0a1430);
    scene.fog = new THREE.Fog(0x0a1430, 80, 230);

    // ---- lights (readable ambient + cool directional + hemisphere) ----
    const ambient = new THREE.AmbientLight(0x5a6ea6, 1.5);
    scene.add(ambient);

    const hemi = new THREE.HemisphereLight(0x7fabff, 0x18223e, 1.35);
    scene.add(hemi);

    const dir = new THREE.DirectionalLight(0xcfe2ff, 1.4);
    dir.position.set(50, 110, 40);
    scene.add(dir);

    // subtle cool fill from the opposite side (no purple wash)
    const fill = new THREE.DirectionalLight(0x3a5cff, 0.35);
    fill.position.set(-50, 60, -40);
    scene.add(fill);

    // ---- floor ----
    this.buildFloor();

    // ---- perimeter walls ----
    this.buildWalls();

    // ---- interior structures ----
    this.buildStructures();

    // ---- environment dressing (props, clusters) ----
    this.buildDressing();

    // ---- neon signs ----
    this.buildSigns();

    // ---- controlled accent lights at key zones (kept modest) ----
    this.addPointLight(-50, 6, 50, 0x19e8ff, 22);
    this.addPointLight(50, 6, 50, 0x19e8ff, 22);
    this.addPointLight(0, 6, -58, 0x19e8ff, 22);
    this.addPointLight(-30, 5, 30, 0x19e8ff, 16);
    this.addPointLight(30, 5, 20, 0x19e8ff, 16);

    // ---- environmental particles ----
    this.buildParticles();

    // ---- sky dome ----
    this.buildSky();
  }

  buildFloor() {
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x1b2748, roughness: 0.78, metalness: 0.4 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    this.group.add(floor);

    // large panel sections with subtle shade variation
    const panelMat = new THREE.MeshStandardMaterial({ color: 0x223158, roughness: 0.68, metalness: 0.45 });
    const panelGeo = new THREE.PlaneGeometry(20, 20);
    const dummy = new THREE.Object3D();
    const im = new THREE.InstancedMesh(panelGeo, panelMat, 100);
    let idx = 0;
    for (let gx = -100; gx <= 100; gx += 20) {
      for (let gz = -100; gz <= 100; gz += 20) {
        if (idx >= 100) break;
        dummy.position.set(gx + 10, 0.012, gz + 10);
        dummy.rotation.set(-Math.PI / 2, 0, 0);
        dummy.updateMatrix();
        im.setMatrixAt(idx++, dummy.matrix);
      }
    }
    im.count = idx;
    im.instanceMatrix.needsUpdate = true;
    this.group.add(im);
    this.instanced.push(im);

    // neon grid
    const grid = new THREE.GridHelper(240, 60, 0x2bd6ff, 0x1d3f63);
    grid.material.transparent = true;
    grid.material.opacity = 0.4;
    grid.position.y = 0.02;
    this.group.add(grid);

    // energy channels radiating from center toward the three terminals
    const channelMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.5 });
    const channels = [
      [-50, 50], [50, 50], [0, -60],
    ];
    for (const [tx, tz] of channels) {
      const len = Math.hypot(tx, tz);
      const ang = Math.atan2(tx, tz);
      const ch = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, len), channelMat);
      ch.position.set(tx / 2, 0.03, tz / 2);
      ch.rotation.y = ang;
      this.group.add(ch);
      // directional light strips along the channel
      for (let d = 6; d < len; d += 12) {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 2),
          new THREE.MeshBasicMaterial({ color: 0x66e6ff, transparent: true, opacity: 0.8 }));
        strip.position.set(Math.sin(ang) * d * 0.5, 0.04, Math.cos(ang) * d * 0.5);
        this.group.add(strip);
      }
    }
  }

  buildWalls() {
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x141d3a, roughness: 0.6, metalness: 0.55 });
    const H = ARENA, h = 9, t = 3;
    const specs = [
      [0, h / 2, -H, 2 * H, h, t],
      [0, h / 2, H, 2 * H, h, t],
      [-H, h / 2, 0, t, h, 2 * H],
      [H, h / 2, 0, t, h, 2 * H],
    ];
    for (const [x, y, z, w, hh, d] of specs) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), wallMat);
      m.position.set(x, y, z);
      this.group.add(m);
      this.addEdges(m, 0x00f0ff, 0.4);
    }
    // vertical structural supports + cyan/purple energy strips along each wall
    const supportMat = new THREE.MeshStandardMaterial({ color: 0x121a3a, roughness: 0.5, metalness: 0.7 });
    const stripCyan = new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.85 });
    const stripPurple = new THREE.MeshBasicMaterial({ color: 0x9b5cff, transparent: true, opacity: 0.85 });
    const dirs = [
      { axis: 'z', fixed: -H, sign: 1, len: 2 * H, perp: 'x' },
      { axis: 'z', fixed: H, sign: -1, len: 2 * H, perp: 'x' },
      { axis: 'x', fixed: -H, sign: 1, len: 2 * H, perp: 'z' },
      { axis: 'x', fixed: H, sign: -1, len: 2 * H, perp: 'z' },
    ];
    for (const wd of dirs) {
      for (let p = -H + 8; p <= H - 8; p += 16) {
        const sx = wd.axis === 'z' ? p : wd.fixed;
        const sz = wd.axis === 'z' ? wd.fixed : p;
        const sup = new THREE.Mesh(new THREE.BoxGeometry(wd.axis === 'z' ? 1.2 : t + 0.4, h, wd.axis === 'z' ? t + 0.4 : 1.2), supportMat);
        sup.position.set(sx, h / 2, sz);
        this.group.add(sup);
        const usePurple = (Math.round((p + 1000) / 16) % 4 === 0);
        const strip = new THREE.Mesh(new THREE.BoxGeometry(wd.axis === 'z' ? 0.2 : t + 0.5, 6, wd.axis === 'z' ? t + 0.6 : 0.2),
          usePurple ? stripPurple : stripCyan);
        strip.position.set(sx, h / 2, sz);
        this.group.add(strip);
      }
    }
  }

  buildStructures() {
    this.addPlatform(-30, 1.4, -20, 18, 1.4, 18);
    this.addPlatform(28, 2.2, 18, 16, 2.2, 16);
    this.addPlatform(0, 1.0, 35, 22, 1.0, 10);

    this.addRamp(-30, 18, -28, Math.PI / 2);
    this.addRamp(28, 16, 10, -Math.PI / 2);

    for (const [x, z] of [[-55, -55], [55, -55], [-55, 55], [55, 55], [0, -30], [40, -40]]) {
      this.addPillar(x, z);
    }

    this.addCover(10, -5, 0, 14, 4, 1.2);
    this.addCover(-15, 25, Math.PI / 2, 1.2, 4, 16);
    this.addCover(45, -10, 0, 10, 4, 1.2);

    this.addHolo(-30, 3.2, -20);
    this.addHolo(28, 4, 18);
    this.addHolo(0, 2.2, 35);

    this.buildCore();
  }

  buildCore() {
    const g = new THREE.Group();
    g.position.set(0, 0, 0);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x101428, roughness: 0.6, metalness: 0.6 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(6, 0.5, 12, 40), baseMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 1.2;
    g.add(ring);
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.35, 12, 32),
      new THREE.MeshStandardMaterial({ color: 0x201030, emissive: 0xff3b57, emissiveIntensity: 1.2, roughness: 0.4 }));
    ring2.rotation.x = Math.PI / 2;
    ring2.position.y = 1.2;
    g.add(ring2);
    const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.4, 6, 8),
      new THREE.MeshStandardMaterial({ color: 0x15102a, emissive: 0xff3b57, emissiveIntensity: 0.8, roughness: 0.4 }));
    spire.position.y = 4;
    g.add(spire);
    this.coreCore = spire;
    this.coreRing = ring2;

    const barrierMat = new THREE.MeshBasicMaterial({ color: 0xff3b57, transparent: true, opacity: 0.28, side: THREE.DoubleSide });
    const barrier = new THREE.Mesh(new THREE.CylinderGeometry(7.5, 7.5, 9, 40, 1, true), barrierMat);
    barrier.position.y = 4.5;
    g.add(barrier);
    this.coreBarrier = barrier;
    this.group.add(g);
  }

  // ---------------------------------------------------------
  //  ENVIRONMENT DRESSING — clustered, intentional cover
  // ---------------------------------------------------------
  buildDressing() {
    const box = (x, y, z, w, h, d, mat, ry = 0, glow = null) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y + h / 2, z);
      m.rotation.y = ry;
      this.group.add(m);
      if (glow) {
        const g = new THREE.Mesh(new THREE.BoxGeometry(w * 1.02, 0.08, d * 1.02),
          new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: 0.8 }));
        g.position.set(x, y + h - 0.05, z);
        g.rotation.y = ry;
        this.group.add(g);
      }
      return m;
    };
    const metal = new THREE.MeshStandardMaterial({ color: 0x141c3a, roughness: 0.55, metalness: 0.7 });
    const metalDark = new THREE.MeshStandardMaterial({ color: 0x0c1228, roughness: 0.6, metalness: 0.65 });

    // collect instanced crate + barrier transforms
    const crateT = [];
    const barrierT = [];
    const pushCrate = (x, z, s = 1) => crateT.push({ x, y: 0, z, ry: Math.random() * 0.4 - 0.2, s });
    const pushBarrier = (x, z, ry = 0) => barrierT.push({ x, y: 0, z, ry, s: 1 });

    // ---- Cluster A: approach to Terminal A (-50,50) ----
    pushCrate(-28, 38, 1.4); pushCrate(-24, 40, 1.1); pushCrate(-30, 44, 1.2);
    pushCrate(-22, 34, 1.0); pushCrate(-34, 32, 1.3);
    pushBarrier(-18, 46, 0.3); pushBarrier(-26, 30, -0.2);
    box(-40, 0, 42, 3, 3.5, 3, metalDark, 0.4, 0x00f0ff); // energy container
    box(-44, 0, 48, 2.4, 2.4, 2.4, metal, 0, 0x9b5cff);    // server
    this.addAntenna(-38, 36);
    this.addGenerator(-34, 48);
    this.addVent(-20, 42);
    this.addPipeRun(-42, 44, -36, 46);

    // ---- Cluster B: mid-left field ----
    pushCrate(-30, -8, 1.2); pushCrate(-34, -12, 1.0); pushCrate(-26, -6, 1.3);
    pushBarrier(-22, -14, 0.6); pushBarrier(-38, -4, -0.4);
    box(-30, 0, -18, 3.2, 3.2, 3.2, metalDark, 0.2, 0x00f0ff); // energy container
    this.addGenerator(-40, -10);
    this.addPipeRun(-44, -14, -26, -16);
    this.addVent(-36, 0);
    this.addServerRack(-44, -2, 0.3);

    // ---- Cluster C: right side near Terminal B (50,50) ----
    pushCrate(26, 36, 1.3); pushCrate(30, 40, 1.1); pushCrate(22, 42, 1.2);
    pushCrate(34, 32, 1.0); pushCrate(28, 30, 1.4);
    pushBarrier(18, 44, -0.3); pushBarrier(38, 38, 0.4);
    box(42, 0, 44, 3, 3.6, 3, metalDark, -0.3, 0x00f0ff); // energy container
    box(46, 0, 36, 2.4, 2.4, 2.4, metal, 0.2, 0x9b5cff);   // server
    this.addAntenna(40, 48);
    this.addGenerator(34, 46);
    this.addVent(22, 34);
    this.addHoloPillar(30, 28);

    // ---- Cluster D: center-front between spawn and core ----
    pushBarrier(-10, 34, 0.2); pushBarrier(12, 32, -0.2);
    pushCrate(0, 40, 1.2); pushCrate(6, 38, 1.0);
    this.addHoloPillar(-8, 30);
    this.addHoloPillar(10, 36);
    box(0, 0, 44, 4, 1.2, 6, metal, 0, 0x00f0ff); // low platform w/ glow

    // ---- Cluster E: near Terminal C (0,-60) ----
    pushCrate(-18, -42, 1.3); pushCrate(18, -42, 1.2); pushCrate(-12, -48, 1.0);
    pushCrate(12, -48, 1.1); pushCrate(0, -50, 1.4);
    pushBarrier(-26, -38, 0.3); pushBarrier(26, -38, -0.3);
    box(-24, 0, -46, 3, 3.4, 3, metalDark, 0.2, 0x00f0ff);
    box(24, 0, -46, 3, 3.4, 3, metalDark, -0.2, 0x00f0ff);
    this.addServerRack(-30, -40, 0.2);
    this.addServerRack(30, -40, -0.2);
    this.addGenerator(0, -54);
    this.addVent(-20, -54);
    this.addVent(20, -54);

    // ---- scattered broken wall sections (corners) ----
    this.addBrokenWall(-58, -20); this.addBrokenWall(58, 20);
    this.addBrokenWall(-58, 20); this.addBrokenWall(58, -20);

    // flush instanced meshes
    if (crateT.length) this._instancedBox(new THREE.BoxGeometry(2, 2, 2), metal, crateT, 0x00f0ff);
    if (barrierT.length) this._instancedBox(new THREE.BoxGeometry(3, 2.2, 1), metalDark, barrierT, 0xff2bd6);
  }

  _instancedBox(geo, mat, transforms, edgeColor) {
    const im = new THREE.InstancedMesh(geo, mat, transforms.length);
    const d = new THREE.Object3D();
    transforms.forEach((t, i) => {
      d.position.set(t.x, t.y + (geo.parameters.height / 2), t.z);
      d.rotation.set(0, t.ry || 0, 0);
      d.scale.setScalar(t.s || 1);
      d.updateMatrix();
      im.setMatrixAt(i, d.matrix);
    });
    im.instanceMatrix.needsUpdate = true;
    this.group.add(im);
    this.instanced.push(im);
  }

  addPlatform(x, y, z, w, h, d) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color: 0x202c50, roughness: 0.65, metalness: 0.45 }));
    m.position.set(x, y / 2, z);
    this.group.add(m);
    this.addEdges(m, 0x19e8ff, 0.7);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 0.05, 0.3),
      new THREE.MeshBasicMaterial({ color: 0x00f0ff }));
    strip.position.set(x, y + 0.03, z - d / 2 + 0.4);
    this.group.add(strip);
  }

  addRamp(x, z, rotY, rotX) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(6, 0.4, 10),
      new THREE.MeshStandardMaterial({ color: 0x0e1428, roughness: 0.7, metalness: 0.4 }));
    m.position.set(x, 0.8, z);
    m.rotation.y = rotY;
    m.rotation.x = -0.5;
    this.group.add(m);
    this.addEdges(m, 0x00f0ff, 0.5);
  }

  addPillar(x, z) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x0c1024, roughness: 0.6, metalness: 0.6 });
    const p = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.0, 12, 10), mat);
    p.position.set(x, 6, z);
    this.group.add(p);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 0.5, 10),
      new THREE.MeshBasicMaterial({ color: 0x9b5cff }));
    band.position.set(x, 4, z);
    this.group.add(band);
    this.addEdges(p, 0x00f0ff, 0.3);
  }

  addCover(x, z, rotY, w, h, d) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color: 0x1a2748, roughness: 0.65, metalness: 0.55 }));
    m.position.set(x, h / 2, z);
    m.rotation.y = rotY;
    this.group.add(m);
    this.addEdges(m, 0x19e8ff, 0.6);
  }

  addHolo(x, y, z) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    const mat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.5, wireframe: true });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.08, 8, 24), mat);
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.06, 8, 20), mat);
    ring2.rotation.x = Math.PI / 2;
    g.add(ring2);
    this.group.add(g);
    this.holos.push(g);
  }

  addHoloPillar(x, z) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 4.2, 10),
      new THREE.MeshStandardMaterial({ color: 0x101a38, roughness: 0.5, metalness: 0.6 }));
    col.position.y = 2.1;
    const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.54, 0.54, 3.6, 10),
      new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.35 }));
    glow.position.y = 2.1;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.5 }));
    beam.position.y = 4;
    g.add(col, glow, beam);
    this.group.add(g);
    this.holos.push(g);
  }

  addAntenna(x, z) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x141c3a, roughness: 0.5, metalness: 0.7 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 6, 8), mat);
    pole.position.set(x, 3, z);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0xff3b57 }));
    tip.position.set(x, 6.2, z);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.05, 6, 16),
      new THREE.MeshBasicMaterial({ color: 0x9b5cff, transparent: true, opacity: 0.7 }));
    ring.position.set(x, 4.5, z); ring.rotation.x = Math.PI / 2;
    this.group.add(pole, tip, ring);
    this.dynamicGlow.push(ring);
  }

  addGenerator(x, z) {
    const base = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.2, 2.4),
      new THREE.MeshStandardMaterial({ color: 0x121a38, roughness: 0.5, metalness: 0.7 }));
    base.position.set(x, 1.1, z);
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.45, 14, 14),
      new THREE.MeshStandardMaterial({ color: 0x003842, emissive: 0x00f0ff, emissiveIntensity: 1.6 }));
    core.position.set(x, 1.6, z + 1.0);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.42, 0.12, 2.42),
      new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.7 }));
    stripe.position.set(x, 2.1, z);
    this.group.add(base, core, stripe);
    this.dynamicGlow.push(core);
  }

  addVent(x, z) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.2, 0.6, 12),
      new THREE.MeshStandardMaterial({ color: 0x0e1428, roughness: 0.6, metalness: 0.6 }));
    m.position.set(x, 0.3, z);
    const grate = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.08, 6, 18),
      new THREE.MeshBasicMaterial({ color: 0x9b5cff, transparent: true, opacity: 0.6 }));
    grate.position.set(x, 0.62, z); grate.rotation.x = Math.PI / 2;
    this.group.add(m, grate);
  }

  addPipeRun(x1, z1, x2, z2) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x16203f, roughness: 0.5, metalness: 0.7 });
    const len = Math.hypot(x2 - x1, z2 - z1);
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, len, 8), mat);
    pipe.position.set((x1 + x2) / 2, 0.6, (z1 + z2) / 2);
    pipe.rotation.z = Math.PI / 2;
    pipe.rotation.y = Math.atan2(z2 - z1, x2 - x1) + Math.PI / 2;
    const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, len, 8),
      new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.25 }));
    glow.position.copy(pipe.position); glow.rotation.copy(pipe.rotation);
    this.group.add(pipe, glow);
  }

  addServerRack(x, z, ry = 0) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(2, 3.2, 1.4),
      new THREE.MeshStandardMaterial({ color: 0x10162e, roughness: 0.6, metalness: 0.6 }));
    m.position.set(x, 1.6, z); m.rotation.y = ry;
    const strip = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.1, 1.42),
      new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.7 }));
    strip.position.set(x, 2.8, z); strip.rotation.y = ry;
    this.group.add(m, strip);
  }

  addBrokenWall(x, z) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x0c1226, roughness: 0.8, metalness: 0.5 });
    const a = new THREE.Mesh(new THREE.BoxGeometry(3, 4, 1), mat);
    a.position.set(x, 2, z); a.rotation.y = Math.random(); a.rotation.z = 0.1;
    const b = new THREE.Mesh(new THREE.BoxGeometry(2, 2.2, 1), mat);
    b.position.set(x + (x < 0 ? 1.5 : -1.5), 1.1, z + 1); b.rotation.y = -0.3;
    this.addEdges(a, 0xff2bd6, 0.4);
    this.addEdges(b, 0xff2bd6, 0.4);
    this.group.add(a, b);
  }

  buildSigns() {
    const signs = [
      ['NEON CITY', -79, 6, 40, 0xff2bd6, 0],
      ['SECTOR 7', 79, 6, -10, 0x00f0ff, Math.PI],
      ['THE NULL', 0, 7, -79, 0xff3b57, 0],
      ['DANGER', -79, 6, -40, 0xff3b57, 0],
      ['CORE BREACH', 79, 6, 30, 0x9b5cff, Math.PI],
    ];
    for (const [text, x, y, z, color, ry] of signs) {
      const mesh = this.makeNeonSign(text, color);
      mesh.position.set(x, y, z);
      mesh.rotation.y = ry;
      this.group.add(mesh);
    }
  }

  makeNeonSign(text, color) {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 128;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 512, 128);
    ctx.font = 'bold 80px Orbitron, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const hex = '#' + new THREE.Color(color).getHexString();
    ctx.shadowColor = hex; ctx.shadowBlur = 30;
    ctx.fillStyle = hex;
    ctx.fillText(text, 256, 64);
    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 4;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(16, 4), mat);
    return mesh;
  }

  addPointLight(x, y, z, color, dist) {
    const l = new THREE.PointLight(color, 1.6, dist, 2);
    l.position.set(x, y, z);
    this.group.add(l);
    this.pointLights.push(l);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8),
      new THREE.MeshBasicMaterial({ color }));
    orb.position.set(x, y, z);
    this.group.add(orb);
  }

  addEdges(mesh, color, opacity = 0.6) {
    const edges = new THREE.EdgesGeometry(mesh.geometry);
    const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
    mesh.add(line);
  }

  buildParticles() {
    const count = 700;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 170;
      pos[i * 3 + 1] = Math.random() * 40;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 170;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: 0x66e0ff, size: 0.25, transparent: true, opacity: 0.6 });
    this.particles = new THREE.Points(geo, mat);
    this.group.add(this.particles);
  }

  buildSky() {
    const geo = new THREE.SphereGeometry(300, 32, 16);
    const mat = new THREE.MeshBasicMaterial({ color: 0x0b1535, side: THREE.BackSide, fog: false });
    const sky = new THREE.Mesh(geo, mat);
    this.group.add(sky);
  }

  openBarrier() {
    if (this.coreBarrier) {
      this.coreBarrier.material.opacity = 0.0;
      this.coreBarrier.visible = false;
    }
    if (this.coreRing) {
      this.coreRing.material.emissive.setHex(0x00f0ff);
      this.coreRing.material.color.setHex(0x003040);
    }
    if (this.coreCore) this.coreCore.material.emissive.setHex(0x00f0ff);
  }

  update(dt) {
    this.clock += dt;
    if (this.particles) {
      const p = this.particles.geometry.attributes.position.array;
      for (let i = 1; i < p.length; i += 3) {
        p[i] += dt * 1.5;
        if (p[i] > 42) p[i] = 0;
      }
      this.particles.geometry.attributes.position.needsUpdate = true;
    }
    for (const h of this.holos) {
      h.rotation.y += dt * 0.8;
      if (h.children[1]) h.children[1].rotation.z += dt * 1.4;
    }
    for (const g of this.dynamicGlow) {
      if (g.material && g.material.emissiveIntensity !== undefined) {
        g.material.emissiveIntensity = 1.4 + Math.sin(this.clock * 3 + g.position.x) * 0.5;
      } else if (g.material && g.material.opacity !== undefined) {
        g.material.opacity = 0.5 + Math.sin(this.clock * 3 + g.position.z) * 0.2;
      }
    }
    if (this.coreBarrier && this.coreBarrier.visible) {
      this.coreBarrier.rotation.y += dt * 0.4;
      this.coreBarrier.material.opacity = 0.2 + Math.sin(this.clock * 3) * 0.08;
    }
    if (this.coreRing) this.coreRing.rotation.z += dt * 0.6;
  }

  // ---------------------------------------------------------
  //  REAL glTF ENVIRONMENT PROPS — intentional, pre-placed
  //  clusters (combat cover / industrial / terminal support).
  //  Visual dressing only: the World has no per-prop obstacle
  //  collision, so existing simple gameplay collision is kept.
  // ---------------------------------------------------------
  populateAssetProps(assets) {
    if (this._propsBuilt) return;
    this._propsBuilt = true;
    const a = assets || this.assets;
    if (!a) return;

    const place = (key, x, z, h, ry = 0) => {
      if (!a.isLoaded(key)) return;
      const m = a.clone(key);
      if (!m) return;
      fitToGround(m, h);
      m.rotation.y = ry;
      m.position.set(x, 0, z);
      this.group.add(m);
    };

    // ---- combat cover area ----
    place('crateLarge', 8, 40, 2.0, 0.3);
    place('crate', 12, 42, 1.2, -0.2);
    place('barrel1', 4, 38, 1.6, 0);

    // ---- industrial area ----
    place('locker', 42, 22, 2.4, 0.5);
    place('shelves', 46, 20, 3.0, -0.3);
    place('barrel2', 38, 24, 1.6, 0);

    // ---- terminal A support area ----
    place('crate', -30, 38, 1.2, 0.2);
    place('chest', -34, 40, 1.2, 0.4);
    place('satellite', -44, 36, 3.0, 0);

    // ---- terminal B support area ----
    place('crate', 30, 38, 1.2, -0.2);
    place('chest', 34, 40, 1.2, -0.4);

    // ---- terminal C support area ----
    place('crate', 0, -38, 1.2, 0.1);
    place('shelves', -6, -40, 3.0, 0.3);
    place('barrel1', 6, -36, 1.6, 0);

    // ---- scattered dressing (kept clear of spawn / core / extraction) ----
    place('barrel2', -20, 10, 1.6, 0);
    place('crateLarge', 20, 0, 2.0, 0.2);
    place('locker', -50, 10, 2.4, -0.3);
    place('chest', 50, 10, 1.2, 0.3);
  }

}
