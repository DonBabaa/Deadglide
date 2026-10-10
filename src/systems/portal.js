// The exit portal. It tears open where the final boss died; ride into it to
// finish the level.
import * as THREE from 'three';

const RADIUS = 3.4;   // of the ring, in metres

export class Portal {
  constructor(scene) {
    this.group = new THREE.Group();
    this.position = this.group.position;

    const glow = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, toneMapped: false, side: THREE.DoubleSide, depthWrite: false });
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(RADIUS, 0.28, 10, 48), glow(0x9dffc4));
    this.swirl = new THREE.Mesh(new THREE.CircleGeometry(RADIUS, 40), glow(0x2bd98a, 0.55));
    this.core = new THREE.Mesh(new THREE.CircleGeometry(RADIUS * 0.6, 32), glow(0xe6fff1, 0.5));
    this.core.position.z = 0.02;
    // A second, broken ring spinning the other way, and a beam so you can find it from afar.
    this.arcs = new THREE.Mesh(new THREE.TorusGeometry(RADIUS * 0.78, 0.09, 6, 40, Math.PI * 1.3), glow(0xe6fff1, 0.9));
    this.arcs.position.z = 0.04;
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 220, 10, 1, true), glow(0x7dffb0, 0.22));
    this.beam.position.y = 110;
    this.light = new THREE.PointLight(0x7dffb0, 0, 60, 1.6);

    // The ring stands upright, its centre a little above the ground.
    this.gate = new THREE.Group();
    this.gate.position.y = RADIUS + 0.3;
    this.gate.add(this.ring, this.swirl, this.core, this.arcs, this.light);
    this.group.add(this.gate, this.beam);
    scene.add(this.group);
    this.reset();
  }

  reset() {
    this.active = false;
    this.age = 0;
    this.group.visible = false;
  }

  open(x, y, z) {
    this.position.set(x, y, z);
    this.active = true;
    this.age = 0;
    this.group.visible = true;
  }

  // Returns true when the player rides into it.
  update(dt, player) {
    if (!this.active) return false;
    this.age += dt;
    const grow = Math.min(1, this.age / 1.2), pulse = 1 + Math.sin(this.age * 4) * 0.04;
    this.gate.scale.setScalar(grow * grow * (3 - 2 * grow) * pulse);
    // Always face the player, so it's a doorway from wherever you come at it.
    this.gate.rotation.y = Math.atan2(player.pos.x - this.position.x, player.pos.z - this.position.z);
    this.swirl.rotation.z -= dt * 1.5;
    this.arcs.rotation.z += dt * 2.6;
    this.core.scale.setScalar(0.8 + Math.sin(this.age * 6) * 0.15);
    this.light.intensity = 260 * grow;
    this.beam.material.opacity = 0.16 + Math.sin(this.age * 3) * 0.06;

    const dx = player.pos.x - this.position.x, dz = player.pos.z - this.position.z;
    return this.age > 1.2 && dx * dx + dz * dz < RADIUS * RADIUS && Math.abs(player.pos.y - this.position.y) < RADIUS * 2.5;
  }
}
