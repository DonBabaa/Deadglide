// What the dead drop now and then besides gold: a glowing thing on the floor, for whoever gets to it (and it is for everyone).
//   MAX AMMO   every gun in every hand filled
//   NUKE       everything alive in the station dies, and everyone gets 400
// They hang in the air where the body fell, turning, and go after a while (blinking first). In a party the host says where
// one is and who got it (index.js).
//
//   const pickups = new Pickups(scene);
//   pickups.drop(kind, at, id)   pickups.near(p) -> the one you are on, or null   pickups.take(id)   pickups.update(dt)
import * as THREE from 'three';

export const PICKUPS = {
  ammo: { name: 'MAX AMMO', colour: 0x7dffb0, chance: 0.03 },
  nuke: { name: 'NUKE', colour: 0xffd27a, chance: 0.015 },
};
const LIFE = 25;
const KINDS = Object.keys(PICKUPS);

export class Pickups {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.nextId = 1;
    this.time = 0;
    this.rings = {};
    for (const k of KINDS) this.rings[k] = new THREE.MeshBasicMaterial({ color: PICKUPS[k].colour, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  }
  // Which (if any) a kill drops.
  static roll() {
    let r = Math.random();
    for (const k of KINDS) { if ((r -= PICKUPS[k].chance) < 0) return k; }
    return null;
  }
  drop(kind, at, id = null) {
    const P = PICKUPS[kind];
    if (!P) return null;
    const g = new THREE.Group();
    g.position.set(at.x, 0, at.z);
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: label(P.name, P.colour), transparent: true, depthWrite: false, toneMapped: false }));
    tag.scale.set(1.3, 0.42, 1);
    tag.position.y = 1.05;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.025, 8, 32).rotateX(Math.PI / 2), this.rings[kind]);
    ring.position.y = 0.5;
    const spark = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), this.rings[kind]);
    spark.position.y = 0.5;
    g.add(tag, ring, spark);
    this.scene.add(g);
    const p = { id: id ?? this.nextId++, kind, g, ring, spark, age: 0, pos: g.position };
    this.list.push(p);
    return p;
  }
  near(p) { return this.list.find((o) => o.pos.distanceTo(p) < 1.3 && o.age > 0.4) || null; }
  take(id) { const i = this.list.findIndex((o) => o.id === id); if (i >= 0) { this.scene.remove(this.list[i].g); this.list.splice(i, 1); } }
  clear() { for (const o of this.list) this.scene.remove(o.g); this.list.length = 0; }
  update(dt) {
    this.time += dt;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const o = this.list[i];
      o.age += dt;
      if (o.age > LIFE) { this.scene.remove(o.g); this.list.splice(i, 1); continue; }
      const blink = o.age > LIFE - 5 && Math.sin(o.age * 16) > 0.3;
      o.g.visible = !blink;
      o.ring.rotation.y = this.time * 1.8;
      o.spark.rotation.y = -this.time * 2.6;
      o.spark.rotation.x = this.time * 1.1;
      o.spark.position.y = 0.5 + 0.08 * Math.sin(this.time * 3 + o.id);
    }
  }
}

function label(text, colour) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 160;
  const g = c.getContext('2d'), hex = `#${colour.toString(16).padStart(6, '0')}`;
  g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(40, 30, 432, 100);
  g.strokeStyle = hex; g.lineWidth = 6; g.strokeRect(40, 30, 432, 100);
  g.font = '72px Anton, Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = hex; g.shadowColor = hex; g.shadowBlur = 24;
  g.fillText(text, 256, 82);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
