// Loot: chests and hearts.
// Monsters sometimes leave a chest behind (elites always do). Ride over it to
// open it and get one random item. They also drop small hearts now and then,
// which heal a little when you ride through them.
//
// Add an item by adding an entry to ITEMS:
//   weight: how often it turns up (bigger = more common)
//   use(game): what it does. `game` offers heal(n), isHurt(), addXp(n), magnet(),
//              blast(radius, damage), freeUpgrade(), frenzy(seconds), shield(seconds).
//
// Chests hold one of two categories: ITEMS (below) or a weapon. Every gun in
// player/weapons.js that you don't own yet is in the draw; once you have them
// all, chests only hold items.
import * as THREE from 'three';
import { config } from '../config.js';
import { glowTexture } from '../world/textures.js';
import { WEAPONS } from '../player/weapons.js';

export const ITEMS = [
  { name: 'Bandages', description: '+25 HP', weight: 4, use: (g) => g.heal(25) },
  { name: 'Soul Jar', description: 'a big lump of XP', weight: 4, use: (g) => g.addXp(12) },
  { name: 'Grave Magnet', description: 'every gem flies to you', weight: 3, use: (g) => g.magnet() },
  { name: 'Holy Water', description: 'blasts everything nearby', weight: 3, use: (g) => g.blast(28, 250) },
  { name: 'Energy Drink', description: 'double fire rate for 10 s', weight: 3, use: (g) => g.frenzy(10) },
  { name: 'Lucky Charm', description: 'nothing can hurt you for 8 s', weight: 2, use: (g) => g.shield(8) },
  { name: 'Old Tome', description: 'a free upgrade', weight: 1, use: (g) => g.freeUpgrade() },
];

// The weapons category: one entry per gun (except the pistol you start with).
export const WEAPON_ITEMS = Object.values(WEAPONS).filter((w) => w.id !== 'pistol').map((w) => ({
  name: w.name, description: w.description, weapon: w.id, use: (g) => g.giveWeapon(w.id),
}));

function rollItem(game) {
  const pool = [...ITEMS, ...WEAPON_ITEMS.filter((w) => !game.hasWeapon(w.weapon)).map((w) => ({ ...w, weight: config.loot.weaponWeight }))];
  let r = Math.random() * pool.reduce((sum, item) => sum + item.weight, 0);
  return pool.find((item) => (r -= item.weight) < 0) || pool[0];
}

const MAX_HEARTS = 40;
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e3 = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();

export class Loot {
  constructor(scene) {
    this.scene = scene;
    this.chests = [];
    const wood = new THREE.MeshStandardMaterial({ color: 0x5b3a1e, roughness: 0.8 });
    const brass = new THREE.MeshStandardMaterial({ color: 0xc9a24a, roughness: 0.4, metalness: 0.6, emissive: 0x3a2a08 });
    // One chest, cloned for each drop: box, rounded lid, brass bands and lock,
    // inside a show of light so you can spot it from far off.
    this.template = new THREE.Group();
    const box = new THREE.Group();   // the chest itself (it bobs and turns)
    box.name = 'box';
    box.scale.setScalar(1.35);
    this.template.add(box);
    const add = (geo, mat, x, y, z) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      box.add(mesh);
    };
    add(new THREE.BoxGeometry(0.9, 0.45, 0.55), wood, 0, 0.225, 0);
    add(new THREE.CylinderGeometry(0.275, 0.275, 0.9, 12, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateX(-Math.PI / 2), wood, 0, 0.45, 0);
    for (const x of [-0.3, 0.3]) add(new THREE.BoxGeometry(0.07, 0.48, 0.58), brass, x, 0.235, 0);
    add(new THREE.BoxGeometry(0.14, 0.16, 0.06), brass, 0, 0.42, 0.29);
    // Light show. None of it is dimmed by fog, so it carries across the map.
    const glow = glowTexture(), lit = { map: glow, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending };
    this.beamMat = new THREE.SpriteMaterial({ ...lit, color: 0xffc94a, opacity: 0.8 });
    const beam = new THREE.Sprite(this.beamMat);          // a pillar of light into the sky
    beam.position.y = 30;
    beam.scale.set(3.2, 62, 1);
    this.haloMat = new THREE.SpriteMaterial({ ...lit, color: 0xffe9a8, opacity: 0.9 });
    const halo = new THREE.Sprite(this.haloMat);          // a bright burst round the chest
    halo.position.y = 0.6;
    halo.scale.setScalar(5);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.85, 40),
      new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, fog: false, toneMapped: false }));
    ring.rotation.x = -Math.PI / 2;                        // a pulsing circle on the ground
    ring.position.y = 0.08;
    ring.name = 'ring';
    const points = [];
    for (let i = 0; i < 26; i++) {                          // sparks spiralling up the beam
      const a = i * 2.4, r = 0.5 + (i % 5) * 0.22;
      points.push(Math.cos(a) * r, 0.4 + i * 0.42, Math.sin(a) * r);
    }
    const sparkGeo = new THREE.BufferGeometry();
    sparkGeo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ ...lit, color: 0xfff0b8, size: 0.7 }));
    sparks.name = 'sparks';
    this.template.add(beam, halo, ring, sparks);
    this.time = 0;

    // Small hearts: one instanced mesh for all of them.
    const heart = new THREE.Shape();
    heart.moveTo(0, -0.5);
    heart.bezierCurveTo(-0.9, 0.1, -0.55, 0.75, 0, 0.3);
    heart.bezierCurveTo(0.55, 0.75, 0.9, 0.1, 0, -0.5);
    this.hearts = [];
    this.heartMesh = new THREE.InstancedMesh(
      new THREE.ExtrudeGeometry(heart, { depth: 0.22, bevelEnabled: false }).translate(0, 0, -0.11),
      new THREE.MeshBasicMaterial({ color: 0xff3b4e, toneMapped: false }), MAX_HEARTS);
    this.heartMesh.frustumCulled = false;
    for (let i = 0; i < MAX_HEARTS; i++) this.heartMesh.setMatrixAt(i, HIDDEN);
    scene.add(this.heartMesh);
  }

  // The chest closest to a point, or null. (For the on-screen marker.)
  nearest(pos) {
    let best = null, bestDist = Infinity;
    for (const c of this.chests) {
      const d = c.mesh.position.distanceTo(pos);
      if (d < bestDist) { best = c.mesh.position; bestDist = d; }
    }
    return best;
  }

  reset() {
    for (const c of this.chests) this.scene.remove(c.mesh);
    this.chests.length = 0;
    this.hearts.length = 0;
  }

  // Called for every kill.
  maybeDrop(kill) {
    if (Math.random() < config.loot.heartChance) {
      if (this.hearts.length >= MAX_HEARTS) this.hearts.shift();
      this.hearts.push({ x: kill.x + (Math.random() - 0.5), y: kill.y + 0.7, z: kill.z + (Math.random() - 0.5), age: 0 });
    }
    if (!kill.elite && Math.random() > config.loot.chestChance) return;
    if (this.chests.length >= 12) this.scene.remove(this.chests.shift().mesh);
    const mesh = this.template.clone();
    mesh.position.set(kill.x, kill.y, kill.z);
    mesh.rotation.y = Math.random() * 6.28;
    this.scene.add(mesh);
    this.chests.push({ mesh, age: 0, box: mesh.getObjectByName('box'), ring: mesh.getObjectByName('ring'), sparks: mesh.getObjectByName('sparks') });
  }

  // Returns { item, healed }: the item from a chest opened this frame (or null),
  // and how much HP was picked up from hearts.
  update(dt, player, game) {
    let opened = null;
    this.time += dt;
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 5);
    this.beamMat.opacity = 0.55 + 0.4 * pulse;
    this.haloMat.opacity = 0.6 + 0.4 * pulse;
    for (let i = this.chests.length - 1; i >= 0; i--) {
      const c = this.chests[i];
      c.age += dt;
      c.mesh.scale.setScalar(Math.min(1, c.age * 4));        // pop in
      c.box.position.y = 0.25 + Math.sin(c.age * 3) * 0.15;  // hover, turning slowly
      c.box.rotation.y += dt * 1.2;
      c.sparks.rotation.y -= dt * 2.5;
      c.sparks.position.y = (c.age * 1.5) % 0.42;            // drift upward, endlessly
      c.ring.scale.setScalar(1 + 0.25 * pulse);
      const near = c.mesh.position.distanceTo(player.pos) < config.loot.pickupRadius;
      if (near || c.age > config.loot.chestLifetime) {
        this.scene.remove(c.mesh);
        this.chests.splice(i, 1);
        if (near) {
          opened = rollItem(game);
          opened.use(game);
        }
      }
    }
    // Hearts: bob and spin, drift toward you when close, heal on touch.
    const L = config.loot, wanted = game.isHurt();   // at full health, hearts stay where they are for later
    let healed = 0;
    for (let i = this.hearts.length - 1; i >= 0; i--) {
      const h = this.hearts[i];
      h.age += dt;
      v.set(player.pos.x - h.x, player.pos.y + 0.8 - h.y, player.pos.z - h.z);
      const dist = v.length();
      if (dist < 1.3 && wanted) {
        game.heal(L.heartHeal);
        healed += L.heartHeal;
        this.hearts.splice(i, 1);
      } else if (h.age > L.heartLifetime) this.hearts.splice(i, 1);
      else if (dist < L.heartPull && wanted) {
        const step = Math.max(14, player.speed * 1.5) * dt / dist;
        h.x += v.x * step; h.y += v.y * step; h.z += v.z * step;
      }
    }
    for (let i = 0; i < MAX_HEARTS; i++) {
      const h = this.hearts[i];
      if (!h) { this.heartMesh.setMatrixAt(i, HIDDEN); continue; }
      const size = 0.5 * Math.min(1, h.age * 5) * (1 + 0.12 * Math.sin(this.time * 7 + i));   // pop in, then beat
      this.heartMesh.setMatrixAt(i, m.compose(v.set(h.x, h.y + Math.sin(this.time * 2.5 + i) * 0.12, h.z), q.setFromEuler(e3.set(0, this.time * 2 + i, 0)), sc.setScalar(size)));
    }
    this.heartMesh.instanceMatrix.needsUpdate = true;

    return { item: opened, healed };
  }
}
