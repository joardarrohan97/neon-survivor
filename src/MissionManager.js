// =========================================================
//  NEON SURVIVOR: CORE BREACH — MissionManager
//  Terminals, defense events, boss gate, extraction
// =========================================================
import * as THREE from 'three';
import { ARENA } from './World.js';

export class MissionManager {
  constructor(scene, game) {
    this.scene = scene;
    this.game = game;
    this.group = new THREE.Group();
    scene.add(this.group);

    this.terminals = [];
    this.phase = 'terminals';
    this.terminalsRestored = 0;
    this.bossSpawned = false;
    this.extraction = null;
    this.nearTerminal = null;
    this.activeDefense = null;
    this.defenseSpawnTimer = 0;
    this.difficulty = 1;
    this.target = { label: 'TERMINAL A', position: new THREE.Vector3() };

    const specs = [
      ['A', new THREE.Vector3(-50, 0, 50)],
      ['B', new THREE.Vector3(50, 0, 50)],
      ['C', new THREE.Vector3(0, 0, -60)],
    ];
    for (const [label, pos] of specs) this.createTerminal(label, pos);

    this.buildBeacon();
    this.buildPathArrows();
    this.highlight = null;
    this.beaconPulse = 0;
    this.beaconColor = null;
  }

  // ---- recolor the world-space objective beacon by objective type ----
  setBeaconColor(hex) {
    if (this.beaconColor === hex) return;
    this.beaconColor = hex;
    this.beaconBeam.material.color.setHex(hex);
    this.beaconDiamond.material.color.setHex(hex);
    this.beaconRing1.material.color.setHex(hex);
    this.beaconRing2.material.color.setHex(hex);
  }

  // ---- holographic objective beacon ----
  buildBeacon() {
    const g = new THREE.Group();
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.35, 40, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffae33, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
    beam.position.y = 20;
    const diamond = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.1, 0),
      new THREE.MeshBasicMaterial({ color: 0xffc23a, transparent: true, opacity: 0.9 }));
    diamond.position.y = 7;
    const ring1 = new THREE.Mesh(
      new THREE.TorusGeometry(2.2, 0.12, 8, 28),
      new THREE.MeshBasicMaterial({ color: 0xffae33, transparent: true, opacity: 0.8 }));
    ring1.rotation.x = Math.PI / 2; ring1.position.y = 1.6;
    const ring2 = new THREE.Mesh(
      new THREE.TorusGeometry(1.4, 0.08, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0xffae33, transparent: true, opacity: 0.8 }));
    ring2.rotation.x = Math.PI / 2; ring2.position.y = 1.6;
    g.add(beam, diamond, ring1, ring2);
    g.visible = false;
    this.scene.add(g);
    this.beacon = g;
    this.beaconBeam = beam;
    this.beaconDiamond = diamond;
    this.beaconRing1 = ring1;
    this.beaconRing2 = ring2;
  }

  buildPathArrows() {
    this.pathArrows = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffae33, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false });
      const chev = new THREE.Group();
      const a = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, 0.5), mat);
      const b = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, 0.5), mat);
      a.position.set(-0.45, 0, 0); a.rotation.y = 0.6;   // V tip points local +Z
      b.position.set(0.45, 0, 0); b.rotation.y = -0.6;
      chev.add(a, b);
      chev.position.y = 0.09;
      chev.visible = false;
      chev.userData.mat = mat;
      this.pathArrows.add(chev);
    }
    this.scene.add(this.pathArrows);
  }

  highlightTerminal(labelIndex) {
    const t = this.terminals[labelIndex];
    if (t) this.highlight = t;
  }

  updateBeacon(dt) {
    const tgt = this.target;
    if (!tgt || !tgt.position) { this.beacon.visible = false; return; }
    this.beacon.visible = true;
    // color-code beacon: cyan terminals / orange Neural Core / green extraction
    let bc = 0x00f0ff;
    if (this.phase === 'boss') bc = 0xffae33;
    else if (this.phase === 'extraction') bc = 0x39ffb0;
    this.setBeaconColor(bc);
    this.beacon.position.set(tgt.position.x, 0, tgt.position.z);
    this.beaconPulse += dt;
    const p = this.beaconPulse;
    this.beaconDiamond.rotation.y += dt * 1.5;
    this.beaconDiamond.position.y = 7 + Math.sin(p * 2) * 0.4;
    const s = 1 + Math.sin(p * 4) * 0.12;
    this.beaconDiamond.scale.setScalar(s);
    this.beaconRing1.rotation.z += dt * 1.2;
    this.beaconRing2.rotation.z -= dt * 1.8;
    this.beaconBeam.material.opacity = 0.14 + Math.sin(p * 3) * 0.06;
  }

  updatePath(dt, pPos) {
    const tgt = this.target;
    if (!tgt || !tgt.position) return;
    const dx = tgt.position.x - pPos.x, dz = tgt.position.z - pPos.z;
    const dist = Math.hypot(dx, dz);
    const ang = Math.atan2(dx, dz);
    for (let i = 0; i < this.pathArrows.children.length; i++) {
      const arr = this.pathArrows.children[i];
      const d = 7 + i * 7;
      if (d > dist - 4) { arr.visible = false; continue; }
      arr.visible = true;
      arr.position.set(pPos.x + Math.sin(ang) * d, 0.09, pPos.z + Math.cos(ang) * d);
      arr.rotation.y = ang;
      arr.userData.mat.opacity = 0.4 + Math.sin(this.beaconPulse * 4 - i) * 0.3;
    }
  }

  createTerminal(label, pos) {
    const g = new THREE.Group();
    g.position.copy(pos);

    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.5, 0.6, 12),
      new THREE.MeshStandardMaterial({ color: 0x10162e, roughness: 0.6, metalness: 0.6 }));
    base.position.y = 0.3;
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.6, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x0c1020, roughness: 0.5, metalness: 0.7 }));
    pillar.position.y = 1.3;

    const markerMat = new THREE.MeshBasicMaterial({ color: 0xffae33, transparent: true, opacity: 0.7 });
    const marker = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 3.5, 16, 1, true), markerMat);
    marker.position.y = 3.2;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.08, 8, 24), markerMat);
    ring.rotation.x = Math.PI / 2; ring.position.y = 1.4;
    const labelMesh = this.makeLabel(label, '#ffc23a');
    labelMesh.position.y = 5.4;

    g.add(base, pillar, marker, ring, labelMesh);
    this.group.add(g);

    const t = {
      label, pos: pos.clone(), group: g, marker, markerMat, ring,
      state: 'inactive', timer: 30, upload: 0,
    };
    this.terminals.push(t);
  }

  makeLabel(text, color) {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    const ctx = c.getContext('2d');
    ctx.font = 'bold 90px Orbitron, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = color; ctx.shadowBlur = 20;
    ctx.fillStyle = color;
    ctx.fillText(text, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide }));
    return mesh;
  }

  start() {
    this.phase = 'terminals';
    this.terminalsRestored = 0;
    this.bossSpawned = false;
    this._bossSeq = (this._bossSeq || 0) + 1; // invalidate any pending cinematic timeout
    this.activeDefense = null;
    this.defenseSpawnTimer = 0;
    this.difficulty = 1;
      for (const t of this.terminals) {
        t.state = 'inactive'; t.timer = 30; t.upload = 0;
        t.markerMat.color.setHex(0xffae33);
      }
    if (this.extraction) { this.scene.remove(this.extraction.group); this.extraction = null; }
    this.game.ui.setObjective('RESTORE THE ENERGY GRID', 'TERMINALS 0 / 3');
    this.game.ui.showNotification('MISSION UPDATED', 'cyan');
  }

  update(dt, player, interactPressed) {
    const pPos = player.group.position;

    // animate terminals
    for (const t of this.terminals) {
      t.ring.rotation.z += dt * 1.5;
      t.marker.rotation.y += dt * 0.8;
      t.marker.material.opacity = t.state === 'restored' ? 0.4 : 0.5 + Math.sin(this.game.clock * 3) * 0.2;
    }

    // ---- TERMINALS PHASE ----
    if (this.phase === 'terminals') {
      // find nearest inactive terminal in range
      this.nearTerminal = null;
      let best = 5;
      for (const t of this.terminals) {
        if (t.state !== 'inactive') continue;
        const d = Math.hypot(t.pos.x - pPos.x, t.pos.z - pPos.z);
        if (d < best) { best = d; this.nearTerminal = t; }
      }

      if (this.nearTerminal && interactPressed && !this.activeDefense) {
        this.activeDefense = this.nearTerminal;
        this.nearTerminal.state = 'defending';
        this.nearTerminal.timer = 30;
        this.defenseSpawnTimer = 0.5;
        this.game.audio.play('terminalActivate');
        this.game.ui.showNotification('MISSION UPDATED', 'cyan');
        this.game.ui.setObjective('DEFEND THE TERMINAL', this.nearTerminal.label + ' UPLOADING…');
      }

      if (this.activeDefense) {
        const t = this.activeDefense;
        t.timer -= dt;
        t.upload = Math.max(0, Math.min(100, (1 - t.timer / 30) * 100));
        // defense spawns
        this.defenseSpawnTimer -= dt;
        if (this.defenseSpawnTimer <= 0) {
          this.defenseSpawnTimer = 2.4;
          const type = Math.random() < 0.5 ? 'drone' : (Math.random() < 0.6 ? 'rifleman' : 'brute');
          this.game.enemyManager.spawnAtRandom(type);
        }
        if (t.timer <= 0) {
          t.state = 'restored';
          t.markerMat.color.setHex(0xffc23a);
          this.terminalsRestored++;
          this.game.audio.play('terminalUpload');
          this.game.ui.showNotification('OBJECTIVE COMPLETE', 'green');
          this.game.ui.setObjective('RESTORE THE ENERGY GRID', 'ENERGY TERMINALS: ' + this.terminalsRestored + ' / 3');
          this.activeDefense = null;
          this.game.spawnTerminalAmmo(t.pos);
        }
      }

      if (this.terminalsRestored >= 3 && !this.bossSpawned) {
        this.phase = 'boss';
        this.bossSpawned = true;
        this._bossSeq = (this._bossSeq || 0) + 1;
        const seq = this._bossSeq;
        this.startBossSequence(seq);
      }
    }

    // ---- BOSS PHASE ----
    if (this.phase === 'boss') {
      if (this.game.bossDefeated && !this.extraction) {
        this.phase = 'extraction';
        this.spawnExtraction();
        this.game.ui.setObjective('REACH EXTRACTION', 'ESCAPE THE SECTOR');
        this.game.ui.showNotification('MISSION UPDATED', 'cyan');
        this.game.ui.showNotification('EXTRACTION AVAILABLE', 'green');
        this.game.audio.play('objective');
      }
    }

    // ---- EXTRACTION PHASE ----
    if (this.phase === 'extraction' && this.extraction) {
      this.extraction.group.rotation.y += dt * 1.2;
      this.extraction.group.children.forEach(c => { if (c.material) c.material.opacity = 0.5 + Math.sin(this.game.clock * 4) * 0.3; });
      const d = Math.hypot(this.extraction.pos.x - pPos.x, this.extraction.pos.z - pPos.z);
      if (d < 3) {
        this.game.missionComplete();
      }
    }

    // update objective target (for HUD distance + edge indicator)
    this.updateTarget(pPos);
    this.updateBeacon(dt);
    this.updatePath(dt, pPos);

    // terminal highlight pulse (intro emphasis on Terminal A + near terminal)
    for (const t of this.terminals) {
      const pulse = (t === this.highlight || t === this.nearTerminal) && t.state === 'inactive';
      if (pulse) {
        t.markerMat.opacity = 0.8 + Math.sin(this.game.clock * 8) * 0.2;
        t.marker.scale.setScalar(1 + Math.sin(this.game.clock * 8) * 0.08);
      } else if (t.state === 'inactive') {
        t.markerMat.opacity = 0.5 + Math.sin(this.game.clock * 3) * 0.2;
        t.marker.scale.setScalar(1);
      }
    }
  }

  // ---- BOSS SEQUENCE: triggered once all terminals are restored ----
  startBossSequence(seq) {
    this.game.world.openBarrier();
    this.difficulty = 1.4;
    this.game.enemyManager.setBossPhase(true);
    this.game.ui.setObjective('BREACH THE NEURAL CORE', 'ELIMINATE THE NULL WARDEN');
    // 1. MISSION UPDATED
    this.game.ui.showNotification('MISSION UPDATED', 'cyan');
    // 2. Power Restored
    setTimeout(() => { if (seq === this._bossSeq) this.game.ui.showNotification('Power Restored', 'green'); }, 1400);
    // 3. WARNING
    setTimeout(() => {
      if (seq !== this._bossSeq) return;
      this.game.ui.showNotification('WARNING', 'red');
      this.game.audio.play('bossWarning');
    }, 2600);
    // 4. Unknown AI Signal
    setTimeout(() => { if (seq === this._bossSeq) this.game.ui.showNotification('Unknown AI Signal', 'red'); }, 3400);
    // 5. Core Chamber Unlocking
    setTimeout(() => { if (seq === this._bossSeq) this.game.ui.showNotification('Core Chamber Unlocking', 'amber'); }, 4200);
    // 6. NULL WARDEN ACTIVATING -> spawn the boss
    setTimeout(() => {
      if (seq !== this._bossSeq) return;
      this.game.ui.showNotification('NULL WARDEN ACTIVATING', 'red');
      this.game.enemyManager.spawnBoss();
      this.game.audio.play('bossAppear');
    }, 5000);
  }

  updateTarget(pPos) {
    if (this.phase === 'extraction' && this.extraction) {
      this.target.label = 'EXTRACTION';
      this.target.position.copy(this.extraction.pos);
      return;
    }
    if (this.phase === 'boss') {
      this.target.label = 'NEURAL CORE';
      this.target.position.set(0, 0, 0);
      return;
    }
    // nearest incomplete terminal
    let best = Infinity, tgt = null;
    for (const t of this.terminals) {
      if (t.state === 'restored') continue;
      const d = Math.hypot(t.pos.x - pPos.x, t.pos.z - pPos.z);
      if (d < best) { best = d; tgt = t; }
    }
    if (tgt) { this.target.label = 'TERMINAL ' + tgt.label; this.target.position.copy(tgt.pos); }
  }

  spawnExtraction() {
    const pos = new THREE.Vector3(0, 0, 72);
    const g = new THREE.Group();
    g.position.copy(pos);
    const torus = new THREE.Mesh(new THREE.TorusGeometry(2.5, 0.4, 16, 40),
      new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.7 }));
    const inner = new THREE.Mesh(new THREE.CircleGeometry(2.3, 32),
      new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.3, side: THREE.DoubleSide }));
    inner.position.z = 0.1;
    const light = new THREE.PointLight(0x00f0ff, 3, 20, 2);
    g.add(torus, inner, light);
    this.scene.add(g);
    this.extraction = { group: g, pos };
  }

  getPrompt() {
    if (this.phase === 'terminals' && this.nearTerminal && !this.activeDefense) {
      return 'PRESS E TO ACTIVATE TERMINAL';
    }
    if (this.phase === 'terminals' && this.activeDefense) {
      return 'DEFEND TERMINAL — ' + Math.ceil(this.activeDefense.upload) + '%';
    }
    return null;
  }
}
