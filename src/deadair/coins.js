// Gold, in DEAD AIR: what the dead were carrying. A kill sometimes throws a coin or two out of the body (a headshot
// more often); they bounce, they spin, they catch the light (and glint a little of their own in the dark, so you can
// find them), and when you come near they come to you. Gold is spent in the Crew Lounge: at its tables, its slots and
// its bar (lounge.js). It is this game's gold, not the story's: a new game starts with none.
//
//   const coins = new Coins(scene);
//   coins.drop(position, value, count)
//   coins.update(dt, playerPosition) -> the gold picked up this frame
import * as THREE from 'three';

export const GOLD = {
  chance: 0.45,      // that a kill drops anything
  head: 0.25,        // ...and the more, if it went through the head
  value: (round) => Math.round((6 + Math.random() * 6 + 2 * round)),   // what a coin is worth
  reach: 2.6,        // come this near and it flies to you
  life: 40,          // seconds before it is gone (it blinks for the last five)
};
const MOST = 160;
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3();

export class Coins {
  constructor(scene) {
    this.list = [];
    this.mesh = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.15, 0.15, 0.035, 20).rotateX(Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0xffc233, metalness: 0.9, roughness: 0.22, emissive: 0x6a4300, emissiveIntensity: 0.9 }), MOST);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    for (let i = 0; i < MOST; i++) this.mesh.setMatrixAt(i, HIDDEN);
    scene.add(this.mesh);
    this.time = 0;
    this.nextId = 1;
    this.picked = [];   // the ids picked up this frame (for the party to hear of)
  }

  clear() { this.list.length = 0; this.draw(); }

  // id: the first coin's (in a party the host numbers them, so that one picked up can be taken off everyone's floor).
  // Returns the ids given.
  drop(at, value, count = 1, id = null) {
    const ids = [];
    for (let n = 0; n < count; n++) {
      if (this.list.length >= MOST) this.list.shift();
      const a = Math.random() * Math.PI * 2, out = 1 + Math.random() * 1.6, cid = id != null ? id + n : this.nextId++;
      this.list.push({ id: cid, p: new THREE.Vector3(at.x, 1.1, at.z), v: new THREE.Vector3(Math.cos(a) * out, 3.2 + Math.random() * 1.8, Math.sin(a) * out), value: Math.round(value / count), age: 0, pulled: false, spin: Math.random() * 6 });
      ids.push(cid);
    }
    return ids;
  }
  // Somebody else picked it up.
  take(id) { const i = this.list.findIndex((c) => c.id === id); if (i >= 0) this.list.splice(i, 1); }

  update(dt, to) {
    this.time += dt;
    this.picked.length = 0;
    let got = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const c = this.list[i];
      c.age += dt;
      v.set(to.x - c.p.x, 1.0 - c.p.y, to.z - c.p.z);
      const far = v.length();
      if (far < GOLD.reach && c.age > 0.35) c.pulled = true;
      if (c.pulled) {
        const speed = 5 + c.age * 3;
        if (far < 0.45 || far < speed * dt) { got += c.value; this.picked.push(c.id); this.list.splice(i, 1); continue; }
        c.p.addScaledVector(v, (speed * dt) / far);
      } else {
        // (thrown out of the body: up, over, and down, bouncing to a stop on its edge)
        c.v.y -= 14 * dt;
        c.p.addScaledVector(c.v, dt);
        if (c.p.y < 0.16) { c.p.y = 0.16; c.v.y = Math.abs(c.v.y) > 1.2 ? -c.v.y * 0.42 : 0; c.v.x *= 0.6; c.v.z *= 0.6; }
        if (c.age > GOLD.life) { this.list.splice(i, 1); continue; }
      }
    }
    this.draw();
    return got;
  }

  draw() {
    for (let i = 0; i < MOST; i++) {
      const c = this.list[i];
      if (!c) { this.mesh.setMatrixAt(i, HIDDEN); continue; }
      const blink = c.age > GOLD.life - 5 && Math.sin(c.age * 18) > 0.2 ? 0 : 1;
      const bob = c.v.y === 0 && !c.pulled ? 0.06 * Math.sin(this.time * 3 + i) : 0;
      this.mesh.setMatrixAt(i, m.compose(s.copy(c.p).setY(c.p.y + bob), q.setFromEuler(e.set(0, this.time * 3.5 + c.spin, 0)), v.setScalar(blink)));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
