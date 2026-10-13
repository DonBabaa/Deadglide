// The editor's model library: every monster, boss, costume and gun, and a few of the bigger set pieces, each on its
// own on a turntable. It has its own little scene (a floor, three lights, nothing else), drawn in place of the
// menu's while it is open.
//   show(i)   put model i on the turntable
//   hide()    close it
//   update(dt), render()   called by main.js every frame while it is open
// Drag to turn it, scroll to move in and out (see the listeners at the bottom).
import * as THREE from 'three';
import { ENEMY_PARTS } from '../enemies/enemyModels.js';
import { withKnees } from '../enemies/knees.js';
import { MOCAP, hasMobAnims, pose, place, describe, clipLength, poseSpider, placeSpider, poseQuad, placeQuad } from '../enemies/mobAnims.js';
import { ENEMY_TYPES } from '../enemies/types.js';
import { SkaterModel } from '../player/skaterModel.js';
import { COSTUMES } from '../player/costumes.js';
import { WEAPONS } from '../player/weapons.js';
import { buildCasinoFront } from '../world/casinoFront.js';
import { astronaut } from '../freeride/targets.js';
import { Portal } from '../systems/portal.js';
import { ghost } from '../systems/descent.js';
import { glowTexture } from '../world/textures.js';

const MOB_NAMES = { shambler: 'Zombie', zombieb: 'Zombie (the soldier)', zombiec: 'Zombie (the gaunt one)', rattler: 'Skeleton', wraith: 'Ghost', rat: 'Rat', crawler: 'Spider', thrower: 'Bone-thrower' };

export function createModelViewer({ renderer, look, horde }) {
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
    const limbs = withKnees(name, ENEMY_PARTS[name]()).map((p) => {
      const mesh = new THREE.Mesh(p.geometry, p.glow ? glow : flesh);
      mesh.position.set(...p.pivot);
      object.add(mesh);
      return { mesh, p };
    });
    // The ones that move by motion capture are shown doing it: their walk, and then each thing they do, in turn
    // (the name of what is playing is on the bar: see `doing`).
    const mo = hasMobAnims() ? MOCAP[name] : null;
    if (mo) {
      const parts = describe(name, limbs.map((l) => l.p), T.height);
      const NAMES = { attack: mo.spider ? 'biting' : T.boss ? 'swiping at you' : 'attacking', act: name.startsWith('boss3') ? 'dealing' : 'throwing', roar: 'roaring', rear: 'rearing up', idle: 'keeping still', rise: 'getting up out of the ground', start: 'off, out of a crouch', climb: 'going up a wall', fall: 'dropping off an edge', run: 'running at you', alt: 'limping (some of them)', leap: 'leaping into his run', jump: 'the slam', turnL: 'stepping round to his left', turnR: 'stepping round to his right', die: 'dying' };
      const LOOPS = new Set(['attack', 'turnL', 'turnR', 'idle', 'run', 'alt']), WALK = 4;
      const acts = Object.keys(NAMES).filter((k) => mo[k]).map((k) => ({ k, clip: mo[k], loop: LOOPS.has(k), time: LOOPS.has(k) ? 3.5 : Math.max(1.4, Math.min(7, clipLength(mo[k]))) }));
      const whole = WALK + acts.reduce((n, act) => n + act.time, 0);
      for (const { mesh } of limbs) mesh.matrixAutoUpdate = false;
      object.scale.setScalar(T.scale || 1);
      return { object, parts: limbs.length, doing: 'walking', tick(dt, time, animate) {
        const t = animate ? time : 0;
        let at = t % whole, now = null;
        if (at >= WALK) { at -= WALK; for (const act of acts) { if (at < act.time) { now = act; break; } at -= act.time; } }
        const w = now ? Math.min(1, at * 4, (now.time - at) * 4) : 0;
        this.doing = now ? NAMES[now.k] : 'walking';
        const put = (part, local) => { const mesh = limbs[parts.indexOf(part)].mesh; mesh.matrix.copy(local); mesh.matrixWorldNeedsUpdate = true; };
        if (mo.spider) return placeSpider(parts, poseSpider(mo.walk, t, now ? now.clip : null, at, w, now ? now.loop : false), put);
        if (mo.quad) return placeQuad(parts, poseQuad(now ? now.clip : mo.walk, t), put);
        const P = pose(mo.walk, t * (mo.speed || 1), now ? now.clip : null, at, w, now ? now.loop : false);
        place(parts, P, parts.hipY, mo.arms !== false || w > 0.3, put);
      } };
    }
    for (const { mesh, p } of limbs) if (p.role === 'forearm') { const arm = limbs[p.parent]; arm.mesh.add(mesh); mesh.position.set(p.pivot[0] - arm.p.pivot[0], p.pivot[1] - arm.p.pivot[1], p.pivot[2] - arm.p.pivot[2]); }   // (and a forearm from its upper arm)
    for (const { mesh, p } of limbs) if (p.role === 'shin') { const leg = limbs[p.parent]; leg.mesh.add(mesh); mesh.position.set(p.pivot[0] - leg.p.pivot[0], p.pivot[1] - leg.p.pivot[1], p.pivot[2] - leg.p.pivot[2]); }   // (a shin hangs from its leg, at the knee)
    const shin = (mesh, p, walk, animate) => { const c = walk + p.phase, k = animate ? 1 : 0; if (p.hinge === 'x') mesh.rotation.set(k * (p.flex * Math.max(0, -Math.cos(c)) + 0.12), 0, 0); else mesh.rotation.set(0, 0, -Math.sign(p.pivot[0]) * k * p.flex * Math.max(0, Math.cos(c))); };
    object.scale.setScalar(T.scale || 1);
    return { object, parts: limbs.length, tick(dt, time, animate) {
      const walk = time * 7 * (T.stride ? 0.5 / T.stride : 1);
      // (the stride only: the reaching, flinching, rearing and the rest of it happen in a run, where there is someone to go for)
      const sw = animate ? Math.sin(walk) : 0, heavy = name.startsWith('boss3'), rolls = name === 'boss2';
      if (heavy) {   // Babitus's walk, as in the fight (see the `stride` gait in enemies/horde.js)
        const fall = Math.abs(sw) ** 8;
        object.position.y = (0.025 - 0.075 * fall) * (animate ? 1 : 0);
        object.rotation.set(animate ? 0.1 + 0.04 * fall : 0, 0.11 * sw, sw * 0.075);
        for (const { mesh, p } of limbs) {
          if (p.role === 'shin') { shin(mesh, p, walk, animate); continue; }
          if (p.role === 'forearm') continue;
          const k = animate ? Math.sin(walk + p.phase) : 0, leg = Math.abs(p.pivot[0]) > 0.02 && p.pivot[1] < 1.4, arm = Math.abs(p.pivot[0]) > 0.02 && !leg;
          mesh.rotation.set(leg ? p.swing[0] * 1.3 * Math.sign(k) * Math.abs(k) ** 0.4 : arm ? 0.05 * k + 0.05 * fall : 0, 0, arm ? Math.sign(p.pivot[0]) * 0.04 : 0);
        }
        return;
      }
      if (rolls) {   // Rubistus: the mound turns under the great skull (the `roll` gait)
        const turn = animate ? time * 1.4 : 0;
        for (const { mesh, p } of limbs) {
          const core = Math.hypot(...p.pivot) < 0.01;
          if (core) { mesh.rotation.set(turn, 0, 0); mesh.position.set(0, 1.04 * (1 - Math.cos(turn)), -1.04 * Math.sin(turn)); }
          else mesh.rotation.set(animate ? 0.12 * Math.sin(time * 6.5) : 0, animate ? 0.3 * Math.sin(time * 0.7) : 0, 0);
        }
        return;
      }
      object.position.y = animate ? Math.abs(sw) * 0.06 * (T.scale || 1) : 0;
      object.rotation.z = sw * (T.sway || 0) * 1.5;
      for (const { mesh, p } of limbs) { if (p.role === 'shin') { shin(mesh, p, walk, animate); continue; } if (p.role === 'forearm') continue; const a = walk + p.phase, s2 = animate ? Math.sin(a) + 0.22 * Math.sin(2 * a) : 0; mesh.rotation.set(p.swing[0] * s2, p.swing[1] * s2, p.swing[2] * s2); }
    } };
  }
  // Kirky: one model, dressed and armed differently for each entry.
  let kirkyModel = null;
  function kirky(change = {}, weapon = 'pistol') {
    kirkyModel ||= new SkaterModel(scene);
    kirkyModel.home ??= kirkyModel.rider.position.y;
    kirkyModel.board.visible = true;
    kirkyModel.rider.position.y = kirkyModel.home;
    scene.remove(kirkyModel.root);
    kirkyModel.root.position.set(0, 0, 0);
    kirkyModel.root.rotation.set(0, 0, 0);
    kirkyModel.applyLook({ ...look(), ...change });
    kirkyModel.setWeapon(WEAPONS[weapon]);
    kirkyModel.setVisible(true);
    return { object: kirkyModel.root, frame: [[-0.75, 0, -0.75], [0.75, 1.95, 0.75]], tick(dt) { kirkyModel.updateArm(dt || 1, null, false); kirkyModel.updateSmoke(dt); } };   // (his gun arm settles to how he carries what he holds)
  }
  // What he moves by (motion capture: public/models/kirky_anims.glb), a clip at a time, round and round. board: one of
  // those he does on it (his feet are put on it in a run; here they are where the clip has them).
  const moving = (clip, board) => () => {
    const made = kirky({}, 'pistol'), k = kirkyModel;
    k.board.visible = board;
    if (!board) k.rider.position.y = 0;
    return { ...made, tick(dt, time, animate) { made.tick(dt); k.play?.(clip, 1, 1, animate ? undefined : 0, !board); } };
  };
  const MOVES = [
    ['On his board', [['ride', 'Riding'], ['push', 'Pushing'], ['ollie', 'An ollie'], ['air', 'A long drop'], ['land', 'Landing hard'], ['hit', 'Hit']], true],
    ['On foot', [['idle', 'Standing (the menu, the casino)'], ['idle2', 'Standing, shifting about (the casino)'], ['walk', 'Walking (the casino)'], ['run', 'Running (the casino)'], ['sprint', 'Flat out (the casino, with Shift)'], ['jump', 'Jumping, from a standstill (the casino)'], ['leap', 'Jumping, on the run (the casino)'], ['flair', 'Flair (an emote)'], ['die', 'Dying'], ['aim', 'Sat, bringing a pistol up (the title screen)']], false],
    ['Not in the game yet', [['stop', 'Pulling up out of a run'], ['roll', 'Falling, and rolling out of it'], ['shoot', 'Shooting (no gun in his hand yet)'], ['rifle', 'Firing a rifle (no gun in his hands yet)'], ['riflewalk', 'Walking with a rifle'], ['riflejump', 'Jumping with a rifle'], ['climb', 'Climbing a ladder'], ['sit', 'Sat back'], ['sitgun', 'Sat, a gun in his hands'], ['pistolidle', 'Stood with a pistol'], ['breathe', 'Stood, breathing']], false],
  ];
  const thing = (make, tick) => { const object = make(); return { object, tick: tick ? (dt, time) => tick(object, dt, time) : null }; };

  // The dead brothers as they come back on the hill: each alone, and the three run together (Goyitus Ultimus).
  const GHOSTS = [['boss', 0x7dff5a, 'Hamzitus'], ['boss2', 0x7ab8ff, 'Rubistus'], ['boss3d', 0xffc233, 'Babitus'], ['ultimus', 0xb9a0ff, 'Goyitus Ultimus']], SEAT = [[0, 0, 0, 0], [3.2, 3.4, 2, -0.3], [-1.6, 7.2, 1.2, 0.18]];
  const glow = glowTexture();
  const spectre = (which) => () => {
    const object = new THREE.Group(), all = which.map((i) => { const g = ghost(GHOSTS[i][0], GHOSTS[i][1], '', glow); g.material.color.copy(g.base); if (which.length > 1) { g.group.position.set(SEAT[i][0], SEAT[i][1], SEAT[i][2]); g.group.rotation.z = SEAT[i][3]; g.group.scale.multiplyScalar(1.55); } object.add(g.group); return g; });
    return { object, tick(dt, time, animate) { all.forEach((g, i) => { for (const arm of g.arms) arm.rotation.x = animate ? -0.4 + Math.sin(time * 1.6 + i) * 0.5 : 0; g.group.position.y = (which.length > 1 ? SEAT[i][1] : 0) + (animate ? Math.sin(time * 2 + i * 2) * 0.35 : 0); }); } };
  };
  // What the bosses (and the bone-throwers) throw, as the game draws them, turning.
  const thrown = (mesh, size = 1) => () => { const m = new THREE.Mesh(mesh.geometry, mesh.material); m.scale.setScalar(size); const object = new THREE.Group(); object.add(m); return { object, tick(dt, time, animate) { if (animate) m.rotation.set(time * 2, time * 1.3, 0); } }; };
  const sigil = () => {
    const c = Object.assign(document.createElement('canvas'), { width: 256, height: 256 }), g = c.getContext('2d');
    g.translate(128, 128); g.strokeStyle = '#fff'; g.lineCap = 'round'; g.lineWidth = 9; g.beginPath(); g.arc(0, 0, 112, 0, 7); g.stroke(); g.lineWidth = 4; g.beginPath(); g.arc(0, 0, 92, 0, 7); g.stroke();
    for (let i = 0; i < 12; i++) { g.rotate(Math.PI / 6); g.lineWidth = i % 3 ? 4 : 9; g.beginPath(); g.moveTo(0, -92); g.lineTo(0, i % 3 ? -104 : -70); g.stroke(); }
    g.lineWidth = 5; g.beginPath(); for (let i = 0; i < 4; i++) { const a = i * 2 * Math.PI / 3; g.lineTo(Math.sin(a) * 70, -Math.cos(a) * 70); } g.stroke();
    const object = new THREE.Group(), make = (map, size) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, color: 0x7dff5a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })); s.scale.setScalar(size); object.add(s); return s; };
    make(glow, 3.4);
    const ring = make(new THREE.CanvasTexture(c), 5.4);
    return { object, tick(dt, time, animate) { if (animate) { ring.scale.setScalar(5.4 - 3.4 * ((time / 5.4) % 1)); ring.material.rotation = time * 1.5; } } };
  };

  const MODELS = [
    ...Object.keys(MOB_NAMES).map((id) => ({ group: 'Monsters', name: MOB_NAMES[id], build: () => monster(id) })),
    { group: 'Bosses', name: ENEMY_TYPES.queen.title, build: () => monster('queen') },
    { group: 'Bosses', name: 'Goyitus Ultimus (solid, to look at)', build: () => monster('ultimus') },
    { group: 'Bosses', name: ENEMY_TYPES.boss.title, build: () => monster('boss') },
    { group: 'Bosses', name: ENEMY_TYPES.boss2.title, build: () => monster('boss2') },
    { group: 'Bosses', name: `${ENEMY_TYPES.boss3.title} (bare)`, build: () => monster('boss3') },
    { group: 'Bosses', name: `${ENEMY_TYPES.boss3.title} (in his gold)`, build: () => monster('boss3d') },
    ...GHOSTS.map(([, , who], i) => ({ group: 'Ghosts (The Long Way Down)', name: `${who}, as a ghost`, build: spectre([i]) })),
    ...(horde ? [
      { group: 'What they throw', name: 'Filth (Hamzitus)', build: () => { const made = thrown(horde.blobMesh, 1)(); made.object.children[0].material = horde.blobMesh.material.clone(); made.object.children[0].material.color.set(0x5a3418); return made; } },
      { group: 'What they throw', name: 'A bone (Rubistus, the bone-throwers)', build: thrown(horde.boneMesh, 1) },
      { group: 'What they throw', name: 'A card (Babitus)', build: thrown(horde.cardMesh, 1) },
      { group: 'What they throw', name: 'A chip (Babitus)', build: thrown(horde.chipMesh, 1) },
      { group: 'What they throw', name: 'A sigil (Goyitus Ultimus: shoot it out)', build: sigil },
    ] : []),
    { group: 'Kirky', name: 'As you have him dressed', build: () => kirky() },
    { group: 'Kirky', name: 'Plain (no costume)', build: () => kirky({ outfit: 'none', mask: 'none' }) },
    ...MOVES.flatMap(([where, list, board]) => list.map(([clip, name]) => ({ group: `How Kirky moves: ${where.toLowerCase()}`, name, build: moving(clip, board) }))),
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
    if (shown.frame) box.min.set(...shown.frame[0]), box.max.set(...shown.frame[1]);   // (what he carries but is not holding would count otherwise)
    else box.setFromObject(shown.object);
    box.getSize(size);
    box.getCenter(centre);
    fit = Math.max(size.x, size.y, size.z, 0.4);
    floor.scale.setScalar(Math.max(size.x, size.z) * 0.75 + 0.5);
    ring.scale.copy(floor.scale);
    floor.position.y = ring.position.y = box.min.y - 0.002;
    ring.position.y += 0.004;
    zoom = shown.frame ? 0.6 : 1;
    let triangles = 0, meshes = 0;
    shown.object.traverseVisible((o) => { if (o.isMesh) { meshes++; const g = o.geometry; triangles += (g.index ? g.index.count : g.attributes.position.count) / 3; } });
    state.info = `${entry.name}  ·  ${size.y.toFixed(2)} m tall, ${Math.max(size.x, size.z).toFixed(2)} m across  ·  ${meshes} pieces, ${Math.round(triangles).toLocaleString()} triangles`;
    state.active = true;
  }

  return Object.assign(state, {
    MODELS, show,
    rider: () => kirkyModel,
    hide() { state.active = false; turntable.clear(); if (kirkyModel) kirkyModel.setVisible(false); shown = null; },
    resetView() { yaw = 0.6; pitch = 0.18; zoom = 1; },
    turn(dx, dy) { yaw -= dx * 0.008; pitch = Math.max(-0.4, Math.min(1.3, pitch + dy * 0.006)); },
    zoomBy(k) { zoom = Math.max(0.25, Math.min(4, zoom * k)); },
    update(dt) {
      time += dt;
      if (state.spin) yaw += dt * 0.5;
      shown?.tick?.(dt, time, state.animate);
      if (shown?.doing) state.info = `${state.info.split('  ·  now: ')[0]}  ·  now: ${shown.doing}`;
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
