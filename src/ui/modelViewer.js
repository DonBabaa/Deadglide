// The editor's model library: every monster, boss, costume and gun, and a few of the bigger set pieces, each on its
// own on a turntable. It has its own little scene (a floor, three lights, nothing else), drawn in place of the
// menu's while it is open.
//   show(i)   put model i on the turntable
//   hide()    close it
//   update(dt), render()   called by main.js every frame while it is open
// Drag to turn it, scroll to move in and out (see the listeners at the bottom).
import * as THREE from 'three';
import { ENEMY_PARTS } from '../enemies/enemyModels.js';
import { ENEMY_TYPES } from '../enemies/types.js';
import { SkaterModel } from '../player/skaterModel.js';
import { COSTUMES } from '../player/costumes.js';
import { WEAPONS } from '../player/weapons.js';
import { buildCasinoFront } from '../world/casinoFront.js';
import { astronaut } from '../freeride/targets.js';
import { Portal } from '../systems/portal.js';

const MOB_NAMES = { shambler: 'Zombie', rattler: 'Skeleton', wraith: 'Ghost', rat: 'Rat', crawler: 'Spider', thrower: 'Bone-thrower' };

export function createModelViewer({ renderer, look }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x14161b);
  scene.add(new THREE.HemisphereLight(0xcfdcff, 0x3a3026, 1.25));
  const key = new THREE.DirectionalLight(0xfff1dc, 2.4), rim = new THREE.DirectionalLight(0x9fc0ff, 1.3);
  key.position.set(4, 7, 6);
  rim.position.set(-6, 5, -7);
  scene.add(key, rim);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(1, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x24272d, roughness: 1 }));
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.985, 1, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffb347 }));
  ring.position.y = 0.004;
  scene.add(floor, ring);
  const turntable = new THREE.Group();   // what is being looked at goes in here
  scene.add(turntable);
  const camera = new THREE.PerspectiveCamera(36, 1, 0.05, 2000);

  // ---- How each kind of thing is built. Each returns { object, tick(dt, time, animate) } ----
  // A monster, from its list of parts, walking on the spot.
  function monster(name) {
    const T = ENEMY_TYPES[name], object = new THREE.Group();
    const flesh = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, emissive: T.emissive || 0, side: THREE.DoubleSide, transparent: !!T.opacity, opacity: T.opacity || 1 });
    const glow = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    const limbs = ENEMY_PARTS[name]().map((p) => {
      const mesh = new THREE.Mesh(p.geometry, p.glow ? glow : flesh);
      mesh.position.set(...p.pivot);
      object.add(mesh);
      return { mesh, p };
    });
    object.scale.setScalar(T.scale || 1);
    return { object, parts: limbs.length, tick(dt, time, animate) {
      const walk = time * 7 * (T.stride ? 0.5 / T.stride : 1);
      for (const { mesh, p } of limbs) { const s = animate ? Math.sin(walk + p.phase) : 0; mesh.rotation.set(p.swing[0] * s, p.swing[1] * s, p.swing[2] * s); }
    } };
  }
  // Kirky: one model, dressed and armed differently for each entry.
  let kirkyModel = null;
  function kirky(change = {}, weapon = 'pistol') {
    kirkyModel ||= new SkaterModel(scene);
    scene.remove(kirkyModel.root);
    kirkyModel.root.position.set(0, 0, 0);
    kirkyModel.root.rotation.set(0, 0, 0);
    kirkyModel.applyLook({ ...look(), ...change });
    kirkyModel.setWeapon(WEAPONS[weapon]);
    kirkyModel.setVisible(true);
    return { object: kirkyModel.root, tick(dt) { kirkyModel.updateSmoke(dt); } };
  }
  const thing = (make, tick) => { const object = make(); return { object, tick: tick ? (dt, time) => tick(object, dt, time) : null }; };

  const MODELS = [
    ...Object.keys(MOB_NAMES).map((id) => ({ group: 'Monsters', name: MOB_NAMES[id], build: () => monster(id) })),
    { group: 'Bosses', name: ENEMY_TYPES.queen.title, build: () => monster('queen') },
    { group: 'Bosses', name: ENEMY_TYPES.boss.title, build: () => monster('boss') },
    { group: 'Bosses', name: ENEMY_TYPES.boss2.title, build: () => monster('boss2') },
    { group: 'Bosses', name: `${ENEMY_TYPES.boss3.title} (bare)`, build: () => monster('boss3') },
    { group: 'Bosses', name: `${ENEMY_TYPES.boss3.title} (in his gold)`, build: () => monster('boss3d') },
    { group: 'Kirky', name: 'As you have him dressed', build: () => kirky() },
    { group: 'Kirky', name: 'Plain (no costume)', build: () => kirky({ outfit: 'none', mask: 'none' }) },
    ...Object.entries(COSTUMES).map(([id, c]) => ({ group: 'Costumes', name: c.name, build: () => kirky({ outfit: id, mask: id }) })),
    ...Object.values(WEAPONS).map((w) => ({ group: 'Guns (in his hand)', name: w.name, build: () => kirky({ outfit: 'none', mask: 'none' }, w.id) })),
    { group: 'Set pieces', name: 'The casino, from outside', build: () => thing(() => { const c = buildCasinoFront(); c.fall(0); c.group.rotation.y = Math.PI; return c.group; }) },
    { group: 'Set pieces', name: 'The exit portal', build: () => { const holder = new THREE.Scene(), portal = new Portal(holder); portal.open(0, 0, 0); portal.group.remove(portal.beam); portal.update(2, { pos: camera.position }); return { object: portal.group, tick: (dt) => portal.update(dt, { pos: camera.position }) }; } },   // (without its beam, which is 220 m tall, and already open)
    { group: 'Set pieces', name: 'Astronaut (a Free Ride target)', build: () => thing(astronaut) },
  ];

  let shown = null, yaw = 0.6, pitch = 0.18, zoom = 1, fit = 2, time = 0;
  const centre = new THREE.Vector3(), box = new THREE.Box3(), size = new THREE.Vector3();
  const state = { active: false, spin: true, animate: true, info: '' };

  function show(i) {
    const entry = MODELS[i];
    if (!entry) return;
    turntable.clear();
    if (kirkyModel) kirkyModel.setVisible(false);
    shown = entry.build();
    turntable.add(shown.object);
    shown.tick?.(0, 0, false);
    turntable.updateMatrixWorld(true);
    box.setFromObject(shown.object);
    box.getSize(size);
    box.getCenter(centre);
    fit = Math.max(size.x, size.y, size.z, 0.4);
    floor.scale.setScalar(Math.max(size.x, size.z) * 0.75 + 0.5);
    ring.scale.copy(floor.scale);
    floor.position.y = ring.position.y = box.min.y - 0.002;
    ring.position.y += 0.004;
    zoom = 1;
    let triangles = 0, meshes = 0;
    shown.object.traverse((o) => { if (o.isMesh && o.visible) { meshes++; const g = o.geometry; triangles += (g.index ? g.index.count : g.attributes.position.count) / 3; } });
    state.info = `${entry.name}  ·  ${size.y.toFixed(2)} m tall, ${Math.max(size.x, size.z).toFixed(2)} m across  ·  ${meshes} pieces, ${Math.round(triangles).toLocaleString()} triangles`;
    state.active = true;
  }

  return Object.assign(state, {
    MODELS, show,
    hide() { state.active = false; turntable.clear(); if (kirkyModel) kirkyModel.setVisible(false); shown = null; },
    resetView() { yaw = 0.6; pitch = 0.18; zoom = 1; },
    turn(dx, dy) { yaw -= dx * 0.008; pitch = Math.max(-0.4, Math.min(1.3, pitch + dy * 0.006)); },
    zoomBy(k) { zoom = Math.max(0.25, Math.min(4, zoom * k)); },
    update(dt) {
      time += dt;
      if (state.spin) yaw += dt * 0.5;
      shown?.tick?.(dt, time, state.animate);
    },
    render() {
      const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight, dist = (fit * 1.05) / Math.tan((camera.fov * Math.PI) / 360) * zoom;
      camera.aspect = w / h;
      camera.setViewOffset(w, h, -w * 0.2, 0, w, h);   // (the list is on the left: the model sits right of the middle)
      camera.position.set(centre.x + Math.sin(yaw) * Math.cos(pitch) * dist, centre.y + Math.sin(pitch) * dist, centre.z + Math.cos(yaw) * Math.cos(pitch) * dist);
      camera.lookAt(centre);
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    },
  });
}
