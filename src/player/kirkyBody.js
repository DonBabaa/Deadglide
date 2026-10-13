// Kirky's body: a real character (public/models/kirky.glb: a stocky man in a fedora, a red shirt and waistcoat, tan
// trousers and black shoes, on a game skeleton; see tools/build_kirky.py), in place of the one skaterModel.js builds
// out of shapes. (It will take another body on the same bone names: tools/build_kirky_skater.py makes one, a skater
// in a black T-shirt and baggy jeans, with headphones, glasses and a pack; what is here for those is for him.)
//
// Nothing about how he moves has changed. skaterModel.js still poses its own jointed figure, everywhere he appears
// (riding, aiming, the casino, the menu, emotes, cutscenes); that figure is simply no longer drawn. Every frame this
// reads where its joints have got to and turns the skeleton's bones to match: thigh to thigh, forearm to forearm.
// What he carries and wears on top (the gun, the board, the beanie, what is in his mouth, a costume's head, a pack)
// still hangs off the old figure, which is kept the same size as the new one so that it all lands in the right place.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { COSTUMES } from './costumes.js';
import { glowTexture } from '../world/textures.js';

const FILE = `${import.meta.env.BASE_URL}models/kirky.glb`;
// A vertex that was bound to no bone when the file was made is bound, in the file, to one of its own that nothing
// ever moves ('neutral_bone': a few dozen, on the chest of his shirt and its print). They stay where he stood when
// the rest of him does not (down on his hands, flat on his back), drawn out into threads. Each is given the binding
// of the nearest vertex that has one.
function mend(scene) {
  scene.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const spare = o.skeleton.bones.findIndex((b) => b.name === 'neutral_bone');
    if (spare < 0) return;
    const index = o.geometry.attributes.skinIndex, weight = o.geometry.attributes.skinWeight, at = o.geometry.attributes.position, lost = [], bound = [];
    for (let i = 0; i < index.count; i++) {
      let share = 0;
      for (let j = 0; j < 4; j++) if (index.getComponent(i, j) === spare) share += weight.getComponent(i, j);
      (share > 0.01 ? lost : bound).push(i);
    }
    for (const i of lost) {
      let best = -1, near = Infinity;
      for (const j of bound) { const d = (at.getX(i) - at.getX(j)) ** 2 + (at.getY(i) - at.getY(j)) ** 2 + (at.getZ(i) - at.getZ(j)) ** 2; if (d < near) { near = d; best = j; } }
      if (best < 0) continue;
      for (let j = 0; j < 4; j++) { index.setComponent(i, j, index.getComponent(best, j)); weight.setComponent(i, j, weight.getComponent(best, j)); }
    }
    index.needsUpdate = weight.needsUpdate = true;
  });
}
let template = null, failed = false;
const waiting = [];
new GLTFLoader().load(FILE, (gltf) => {
  template = gltf.scene;
  mend(template);
  template.updateMatrixWorld(true);
  for (const go of waiting.splice(0)) go();
}, undefined, (error) => { failed = true; console.warn('Kirky: no body to load, so he stays as he was.', error); });

// His lighter (public/models/lighter.glb: tools/build_lighter.py; "Lighter" by Johnathon Goswick, CC-BY-4.0). Fetched
// the first time anybody strikes one.
let lighterFile = null;
const lighterMade = () => (lighterFile ||= new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}models/lighter.glb`).then((gltf) => {
  let found = null;
  gltf.scene.traverse((o) => { if (o.isMesh && !found) found = o; });
  return found;
}).catch((error) => { console.warn('Kirky: no lighter to load.', error); return null; }));

// The body he wears as an alien (public/models/alien.glb: see tools/build_alien.py). It is on the same skeleton as his
// own, so it is posed bone for bone from his. It may arrive after he does: whoever is waiting for it is told.
let alienTemplate = null;
const wantAlien = [];
new GLTFLoader().load(`${import.meta.env.BASE_URL}models/alien.glb`, (gltf) => {
  alienTemplate = gltf.scene;
  mend(alienTemplate);
  alienTemplate.updateMatrixWorld(true);
  for (const go of wantAlien.splice(0)) go();
}, undefined, (error) => console.warn('Kirky: no alien body to load, so those costumes are heads on his own.', error));

// The space suit he wears as the Dead Astronaut, the Cosmonaut and the Golden Boy (public/models/astronaut.glb: see
// tools/build_astronaut.py): on his skeleton too, and posed from it the same way.
let suitTemplate = null;
const wantSuit = [];
new GLTFLoader().load(`${import.meta.env.BASE_URL}models/astronaut.glb`, (gltf) => {
  suitTemplate = gltf.scene;
  mend(suitTemplate);
  suitTemplate.updateMatrixWorld(true);
  for (const go of wantSuit.splice(0)) go();
}, undefined, (error) => console.warn('Kirky: no space suit to load, so those costumes are a helmet on his own body.', error));
// A suit standing by itself, for whoever wants one (a Free Ride target): resolves to an Object3D, 1.9 m tall, or null.
export const spaceSuit = (suit = 0xd9d9de, trim = 0x77787e, visor = 0x1a1206) => new Promise((done) => {
  const make = () => {
    const o = cloneSkinned(suitTemplate);
    o.traverse((m) => { if (m.isSkinnedMesh) { const kind = m.name.replace(/[^A-Za-z].*$/, ''); m.frustumCulled = false; m.castShadow = true; m.material = kind === 'Visor' ? new THREE.MeshStandardMaterial({ color: visor, roughness: 0.08, metalness: 0.6, emissive: 0x2a1c04 }) : new THREE.MeshStandardMaterial({ vertexColors: true, color: kind === 'Trim' ? trim : suit, roughness: 0.75 }); } });
    done(o);
  };
  if (suitTemplate) make(); else wantSuit.push(make);
});

// Motion capture (public/models/kirky_anims.glb: clips on his skeleton, made by tools/build_anims.py from the
// library in dl/). While he is riding, his body is played from these and not posed by hand: see `mocap` in attachBody.
let animFile = null, animDrop = null;   // (animDrop: how far his hips are from standing, clip by clip, frame by frame: kirky_anims.json)
fetch(`${import.meta.env.BASE_URL}models/kirky_anims.json`).then((r) => r.json()).then((d) => { animDrop = d; }).catch(() => {});
new GLTFLoader().load(`${import.meta.env.BASE_URL}models/kirky_anims.glb`, (gltf) => { animFile = gltf; }, undefined, () => console.warn('Kirky: no motion capture to load, so he is posed by hand.'));

// Call `go` once the file has arrived (straight away, if it has; never, if it could not be loaded).
export function whenBody(go) {
  if (template) go();
  else if (!failed) waiting.push(go);
}

const HEAD_FIT = 0.78;        // how big what he wears on his head is drawn, against the size it was made (his new head is smaller)
const SKULL = 0.08;         // the middle of his skull, this far above the bone his head turns on (m)
const v = new THREE.Vector3(), w = new THREE.Vector3(), s3 = new THREE.Vector3(), q = new THREE.Quaternion(), rootQ = new THREE.Quaternion(), m4 = new THREE.Matrix4();
// A frame: `axis` is the way the limb runs, `pole` the way its front faces (both made square to each other).
function frame(axis, pole, out = new THREE.Quaternion()) {
  const y = v.copy(axis).normalize().clone(), z = w.copy(pole).addScaledVector(y, -pole.dot(y)).normalize().clone();
  return out.setFromRotationMatrix(m4.makeBasis(new THREE.Vector3().crossVectors(y, z), y, z));
}

// The weave of a cloth, as a small normal map that repeats: 'knit' (the fine vertical ribs of jersey) or 'twill' (the
// diagonal of trouser cloth).
const weaves = {};
function weave(kind) {
  if (weaves[kind]) return weaves[kind];
  const S = 64, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d'), img = g.createImageData(S, S), h = (x, y) => (kind === 'knit' ? Math.sin(x * Math.PI / 4) * 0.6 + Math.sin(y * Math.PI / 2 + Math.sin(x * Math.PI / 4) * 1.5) * 0.4 : Math.sin((x + y) * Math.PI / 4) * 0.7 + Math.sin((x - y) * Math.PI / 8) * 0.3);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = h(x + 1, y) - h(x - 1, y), dy = h(x, y + 1) - h(x, y - 1), k = 1 / Math.hypot(dx, dy, 1), i = (y * S + x) * 4;
    img.data[i] = (-dx * k * 0.5 + 0.5) * 255; img.data[i + 1] = (dy * k * 0.5 + 0.5) * 255; img.data[i + 2] = (k * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(kind === 'knit' ? 170 : 150, kind === 'knit' ? 170 : 150);   // (fine: his clothes share one picture, and each is only a part of it)
  t.flipY = false;
  return (weaves[kind] = t);
}
const MOCAP_YAW = 0;   // how far the clips' skater is turned from the game's board (rad)
const UPRIGHT = { pelvis: 0.3, spine_01: 0.6, spine_02: 0.85 }, q2u = new THREE.Quaternion();   // how much of his torso's lean each takes
export function attachBody(model) {
  const body = cloneSkinned(template), bones = {}, meshes = {};
  body.traverse((o) => {
    if (o.isBone) bones[o.name] = o;
    if (o.isSkinnedMesh) {
      meshes[o.name.replace(/[^A-Za-z].*$/, '')] = o;
      o.castShadow = true;
      o.frustumCulled = false;   // (its bones are moved by hand: the box three.js would cull it by is not where he is)
    }
  });
  if (!bones.pelvis || !bones.thigh_l) { console.warn('Kirky: the body has not the skeleton that was expected.'); return; }
  // His own copy of what the shop recolours.
  for (const name of ['Shirt', 'Pants', 'Shoes']) if (meshes[name]) meshes[name].material = meshes[name].material.clone();   // (his own: a costume dyes them)
  // (his own skin, face and all: every Kirky there is shares the file's materials otherwise, and one in an alien's
  // colours, sat watching in the last scene, turned the face of every other one green)
  for (const name of ['Body', 'Face', 'Brows', 'Hair', 'HairTop', 'Eyes', 'Teeth', 'Hat']) if (meshes[name]) meshes[name].material = meshes[name].material.clone();
  for (const mesh of Object.values(meshes)) { mesh.material.roughness = Math.max(mesh.material.roughness, 0.8); mesh.material.metalness = 0; }
  // (what is not cloth or skin: the shells of his headphones, the wire of his glasses, and their lenses, which are clear)
  if (meshes.Headphones) meshes.Headphones.material.roughness = 0.42;
  if (meshes.Glasses) { meshes.Glasses.material.roughness = 0.3; meshes.Glasses.material.metalness = 0.4; }
  if (meshes.Lenses) Object.assign(meshes.Lenses.material, { transparent: true, opacity: 0.62, roughness: 0.06, metalness: 0.1, depthWrite: false });
  if (meshes.Lenses) meshes.Lenses.castShadow = false;
  if (meshes.Shoes) meshes.Shoes.material.roughness = 0.7;
  // (the weave of the cloth, for the light to catch on: jersey for his shirt, a twill for his trousers)
  // How what he wears on his head is fitted, by which body this is: the man in the fedora (he has a Hat) has a big
  // head; the skater's is a man's. head: how big it is drawn, against the size it was made; skull: the middle of his
  // skull, this far above the bone his head turns on (m); mouth: where his lips are.
  const FIT = meshes.Hat ? { head: 1.5, skull: 0.135, mouth: [0, 0.8 - 0.095, 0.108] } : { head: HEAD_FIT, skull: SKULL, mouth: [0.004, 0.8 - 0.126, 0.122] };
  if (meshes.Shirt && !meshes.Hat) { meshes.Shirt.material.normalMap = weave('knit'); meshes.Shirt.material.normalScale.set(0.3, 0.3); }
  if (meshes.Pants && !meshes.Hat) { meshes.Pants.material.normalMap = weave('twill'); meshes.Pants.material.normalScale.set(0.4, 0.4); }
  for (const name of ['Shirt', 'Pants', 'Shoes']) if (meshes[name]) meshes[name].material.side = THREE.DoubleSide;   // (cloth has an inside: a sleeve, a cuff, the top of a shoe)
  if (meshes.Logo) { meshes.Logo.material = logoMaterial(); meshes.Logo.castShadow = false; }
  if (meshes.Brows) { meshes.Brows.material.transparent = true; meshes.Brows.material.alphaTest = 0.3; meshes.Brows.castShadow = false; }
  for (const name of ['Hair', 'HairTop']) if (meshes[name]) { meshes[name].material.transparent = false; meshes[name].material.depthWrite = true; meshes[name].material.alphaTest = 0.4; meshes[name].material.side = THREE.DoubleSide; }

  // ---- The old figure, made the size of the new one ----
  const place = (bone) => bone.getWorldPosition(new THREE.Vector3());   // (before he is put anywhere: in the body's own space)
  const hip = place(bones.thigh_l).y, K = hip / 0.86;                   // (0.86: how high the old figure's hips are)
  model.rider.scale.setScalar(K);
  model.legLength = 0.865 * K;
  model.head.scale.setScalar(FIT.head / K);

  // His beanie sits down on his skull, what he smokes is in his mouth, and a pack sits on his back (all three were
  // placed for the old figure).
  model.beanieDome.position.y -= 0.055;
  model.brim.position.y -= 0.055;
  model.mouthAt = FIT.mouth;
  model.packHolder.position.set(0, 0.3, -0.125);
  // His chain and his headphones, brought down onto his own neck and collarbones.
  model.neckwear.scale.setScalar(0.85);
  model.neckwear.position.set(0, -0.04, 0);
  // (their band was made to go round the old figure's hood, and stood out in front of his chin: it is made again,
  // round the back of his neck, from one cup to the other)
  if (!model.headband) {
    for (const c of model.neckwear.children) if (c.geometry?.type === 'TorusGeometry' && Math.abs((c.geometry.parameters?.radius || 0) - 0.168) < 0.001) c.visible = false;
    const old = model.neckwear.children.find((c) => c.isMesh && c.geometry?.type === 'TorusGeometry' && !c.visible);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.011, 8, 32, Math.PI).rotateX(-Math.PI / 2 - 0.5), old?.material || new THREE.MeshStandardMaterial({ color: 0x1b1512, roughness: 0.8 }));
    band.position.set(0, 0.612, 0.07);   // (clear of the back of his neck: it was going through it)
    band.castShadow = true;
    model.neckwear.add(band);
    model.headband = band;
  }
  // The label sewn on his beanie's cuff: a tan tab, at his temple.
  if (!model.beanieTab) {
    const cuff = new THREE.Box3().setFromBufferAttribute(model.brim.geometry.attributes.position);
    const rx = (cuff.max.x - cuff.min.x) / 2, rz = (cuff.max.z - cuff.min.z) / 2, a = 0.95;   // (a: how far round from the front, rad)
    const tab = new THREE.Mesh(new THREE.BoxGeometry(0.03, (cuff.max.y - cuff.min.y) * 0.62, 0.004), new THREE.MeshStandardMaterial({ color: 0xc9a66b, roughness: 0.8 }));
    const stitch = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.012, 0.005), new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.9 }));
    tab.add(stitch);
    tab.position.set(Math.sin(a) * (rx + 0.002), (cuff.max.y + cuff.min.y) / 2, Math.cos(a) * (rz + 0.002));
    tab.rotation.y = a;
    model.brim.add(tab);
    model.beanieTab = tab;
  }

  // ---- Which joint of the old figure turns which bone ----
  // [bone, the joint, the way the joint's limb runs in its own space, the way its front faces, the bone it runs to]
  const Y = [0, 1, 0], Z = [0, 0, 1], down = [0, -1, 0];
  const pairs = [
    ['pelvis', model.torso, Y, Z, 'spine_01'], ['spine_01', model.torso, Y, Z, 'spine_02'], ['spine_02', model.torso, Y, Z, 'spine_03'], ['spine_03', model.torso, Y, Z, 'neck_01'],
    ['neck_01', model.head, Y, Z, 'head'], ['head', model.head, Y, Z, null],
    ['upperarm_l', model.gunArm, Z, Y, 'lowerarm_l'], ['lowerarm_l', model.foreArm, Z, Y, 'hand_l'],
    ['upperarm_r', model.leftArm, down, Z, 'lowerarm_r'], ['lowerarm_r', model.leftFore, down, Z, 'hand_r'],
    ['thigh_l', model.frontLeg, [0.09, -1, 0.03], Z, 'calf_l'], ['calf_l', model.frontLeg.knee, [0.09, -1, -0.03], Z, 'foot_l'],
    ['thigh_r', model.backLeg, [-0.09, -1, 0.03], Z, 'calf_r'], ['calf_r', model.backLeg.knee, [-0.09, -1, -0.03], Z, 'foot_r'],
  ];
  const driven = new Map();
  for (const [name, joint, axis, pole, toward] of pairs) {
    const bone = bones[name];
    if (!bone || !joint) continue;
    const runs = toward && bones[toward] ? place(bones[toward]).sub(place(bone)) : new THREE.Vector3(0, 1, 0);
    const ofBone = frame(runs, new THREE.Vector3(0, 0, 1)), ofJoint = frame(new THREE.Vector3(...axis), new THREE.Vector3(...pole));
    // (turn the joint's frame into the bone's, as they stood when he was made: from then on they turn together)
    driven.set(bone, { joint, turn: ofJoint.multiply(ofBone.invert()).multiply(bone.getWorldQuaternion(new THREE.Quaternion())) });
  }
  const top = bones.Root || bones.pelvis, above = top.parent ? top.parent.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion();   // (how whatever holds the skeleton is turned)
  const order = [];   // every bone, parents before children, with how it sat on its parent when he was made
  (function walk(bone, parent) { order.push({ bone, parent, rest: bone.quaternion.clone(), world: new THREE.Quaternion(), stood: bone.getWorldQuaternion(new THREE.Quaternion()), at: bone.getWorldPosition(new THREE.Vector3()) }); for (const c of bone.children) if (c.isBone) walk(c, order.find((o) => o.bone === bone)); })(top, null);
  // Another body he wears (an alien's, a space suit) is on a skeleton of its own, stood its own way (arms down, where
  // his may have been made straight out). So it is not his bones' turns that are copied to it: each of its bones is
  // turned as far from how it stood as his bone of that name has turned from how his stood, after allowing for the
  // two having stood differently (`line`: the turn from the way its bone ran, as it stood, to the way his did; a
  // bone that runs to nothing, a hand, takes its forearm's). shadow(body, its bones) gives the function that does
  // that, each frame.
  const mine = new Map(order.map((o) => [o.bone.name, o]));
  const TOWARD = { pelvis: 'spine_01', spine_01: 'spine_02', spine_02: 'spine_03', spine_03: 'neck_01', neck_01: 'head' };
  for (const sd of ['l', 'r']) for (const [from, to] of [['clavicle', 'upperarm'], ['upperarm', 'lowerarm'], ['lowerarm', 'hand'], ['thigh', 'calf'], ['calf', 'foot'], ['foot', 'ball']]) TOWARD[`${from}_${sd}`] = `${to}_${sd}`;
  const shadow = (other, theirs) => {
    const first = theirs.Root || theirs.pelvis, held = first.parent ? first.parent.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion(), list = [];
    (function walk(bone, parent) {
      const o = mine.get(bone.name), to = TOWARD[bone.name], his = to && mine.get(to);
      let line = parent ? parent.line : new THREE.Quaternion();
      if (o && his && theirs[to]) line = new THREE.Quaternion().setFromUnitVectors(theirs[to].getWorldPosition(new THREE.Vector3()).sub(bone.getWorldPosition(new THREE.Vector3())).normalize(), his.at.clone().sub(o.at).normalize());
      const entry = { bone, parent, line, rest: bone.quaternion.clone(), world: new THREE.Quaternion(), o, fix: o ? o.stood.clone().invert().multiply(line).multiply(bone.getWorldQuaternion(new THREE.Quaternion())) : null };
      list.push(entry);
      for (const c of bone.children) if (c.isBone) walk(c, entry);
    })(first, null);
    return () => {
      for (const b of list) {
        const up = b.parent ? b.parent.world : held;
        if (b.o) b.world.copy(b.o.world).multiply(b.fix); else b.world.copy(up).multiply(b.rest);
        b.bone.quaternion.copy(q.copy(up).invert()).multiply(b.world);
      }
      theirs.pelvis.parent.updateWorldMatrix(true, false);
      theirs.pelvis.position.copy(theirs.pelvis.parent.worldToLocal(bones.pelvis.getWorldPosition(v)));
      other.updateMatrixWorld(true);
    };
  };

  // ---- His hands ----
  // The one that holds a gun is closed round its grip (the first finger looser: it is on the trigger); the other
  // hangs half open. Each joint of each finger is bent about the line of his knuckles, towards his palm.
  const GRIP = [[0.55, 0.85, 0.5], [1.15, 1.25, 0.7]], LOOSE = [[0.2, 0.3, 0.2], [0.3, 0.4, 0.3]];   // [first finger, the others] x [knuckle, middle, tip] (rad)
  for (const side of ['l', 'r']) {
    const at = (name) => bones[`${name}_${side}`] && place(bones[`${name}_${side}`]);
    const first = at('index_01'), last = at('pinky_01'), m1 = at('middle_01'), m2 = at('middle_02');
    if (!first || !last || !m1 || !m2) continue;
    const knuckles = first.sub(last).normalize(), finger = m2.sub(m1).normalize(), out = side === 'l' ? 1 : -1;
    const bent = finger.clone().applyAxisAngle(knuckles, 0.5);
    const way = bent.y + bent.x * out < finger.y + finger.x * out ? 1 : -1;   // (as he is made, his palms face down and in)
    const amounts = side === 'l' ? GRIP : LOOSE;
    for (const o of order) {
      const is = o.bone.name.match(/^(index|middle|ring|pinky)_0([123])_([lr])$/);
      if (!is || is[3] !== side) continue;
      const stood = o.bone.getWorldQuaternion(new THREE.Quaternion());
      o.rest.multiply(stood.clone().invert().multiply(new THREE.Quaternion().setFromAxisAngle(knuckles, way * amounts[is[1] === 'index' ? 0 : 1][is[2] - 1])).multiply(stood));
    }
  }
  // His guns sit in his palm (they were hung at the old figure's wrist, which is where his own wrist is: his palm is further on).
  const PALM = 0.055;
  for (const id in model.guns) model.guns[id].group.position.z += PALM;
  model.gripShift = PALM;

  // ---- His face ----
  // It can take a few looks (the file has a shape for each: see LOOKS in tools/build_kirky.py), and blends between
  // them. He blinks by himself, his mouth works while he is talking, and whatever look he has been given wears off.
  //   model.express(look, seconds = 1.2, amount = 1)   'smile' | 'angry' | 'surprise' | 'sad' | 'ooh' | null
  //   model.talk(seconds)                              his mouth moves for that long
  const faces = [meshes.Face, meshes.Brows].filter((m) => m && m.morphTargetDictionary);
  const mug = { now: {}, look: null, amount: 0, until: 0, talking: 0, blinkAt: 2, blink: 0, last: performance.now() / 1000 };
  model.express = (look, seconds = 1.2, amount = 1) => { if (look === 'surprise' && seconds < 1) model.hitAt = performance.now(); mug.look = look; mug.amount = amount; mug.until = performance.now() / 1000 + seconds; };
  model.talk = (seconds = 1.5) => { mug.talking = performance.now() / 1000 + seconds; };
  const updateFace = () => {
    if (!faces.length) return;
    const t = performance.now() / 1000, dt = Math.min(0.1, Math.max(0, t - mug.last));
    mug.last = t;
    if (t > mug.until) mug.look = null;
    if (t > mug.blinkAt) { mug.blink = t; mug.blinkAt = t + 1.8 + Math.random() * 3.6; }   // (slow: he is stoned)
    const lid = Math.max(0, 1 - Math.abs((t - mug.blink) / 0.11 - 1));                         // down and up, in a fifth of a second
    const want = { blink: mug.look === 'surprise' ? 0 : lid, open: t < mug.talking ? 0.12 + 0.5 * Math.abs(Math.sin(t * 13) * Math.sin(t * 5.3 + 1)) : 0 };
    if (mug.look) want[mug.look] = mug.amount;
    for (const mesh of faces) {
      for (const name in mesh.morphTargetDictionary) {
        const quick = name === 'blink' || name === 'open' ? 40 : 9;
        mug.now[name] = (mug.now[name] || 0) + ((want[name] || 0) - (mug.now[name] || 0)) * (1 - Math.exp(-quick * dt));
        mesh.morphTargetInfluences[mesh.morphTargetDictionary[name]] = mug.now[name];
      }
    }
  };

  // ---- What he wears on him ----
  // A watch on his free wrist: made here, where it sits on him as he was made, and then hung on the bone it goes with.
  {
    const metalM = new THREE.MeshStandardMaterial({ color: 0xb9bec4, roughness: 0.3, metalness: 0.8 }), leatherM = new THREE.MeshStandardMaterial({ color: 0x1b1512, roughness: 0.8 });
    const glassM = new THREE.MeshStandardMaterial({ color: 0x0c1418, roughness: 0.1, metalness: 0.4, emissive: 0x143a2a, emissiveIntensity: 0.6 });
    const redM = new THREE.MeshStandardMaterial({ color: 0xb3261e, roughness: 0.9, side: THREE.DoubleSide }), whiteM = new THREE.MeshStandardMaterial({ color: 0xf0ece0, roughness: 0.9 });
    const hang = (bone, ...things) => { for (const o of things) { o.traverse((m) => { if (m.isMesh) m.castShadow = true; }); body.add(o); o.updateMatrixWorld(true); bone.attach(o); } };
    body.updateMatrixWorld(true);
    const local = (p) => body.worldToLocal(p.clone());
    // His watch: a leather strap round his wrist, a steel case on the back of it, a dark face with lit hands.
    if (bones.hand_r && bones.lowerarm_r) {
      const wrist = local(place(bones.hand_r)), elbow = local(place(bones.lowerarm_r)), along = wrist.clone().sub(elbow).normalize();
      const watch = new THREE.Group(), at = wrist.clone().addScaledVector(along, -0.025);
      const strap = new THREE.Mesh(new THREE.TorusGeometry(0.034, 0.008, 8, 24).scale(1, 1, 2.2), leatherM);
      const outward = new THREE.Vector3(-1, 0.35, 0).addScaledVector(along, -along.dot(new THREE.Vector3(-1, 0.35, 0))).normalize();   // (the back of his wrist: away from his body)
      const caseM = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.023, 0.012, 24), metalM), faceM = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.0135, 24), glassM);
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.008, 8).rotateZ(Math.PI / 2), metalM);
      crown.position.x = 0.025;
      const hands = [[0.011, 0.6], [0.015, 2.4]].map(([len, a]) => { const h = new THREE.Mesh(new THREE.BoxGeometry(0.0022, 0.002, len), new THREE.MeshBasicMaterial({ color: 0x9dffb0 })); h.position.set(Math.sin(a) * len / 2, 0.0075, Math.cos(a) * len / 2); h.rotation.y = a; return h; });
      const dial = new THREE.Group();
      dial.add(caseM, faceM, crown, ...hands);
      dial.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), outward);
      dial.position.copy(outward).multiplyScalar(0.037);
      strap.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), along);
      watch.add(strap, dial);
      watch.position.copy(at);
      hang(bones.lowerarm_r, watch);
      model.watch = watch;
    }
    model.worn = [model.watch].filter(Boolean);   // (he had a wallet chain and a bandana: they would not sit on him, and are gone)
  }

  // ---- Put him in ----
  const root = model.root, sync = new THREE.Object3D();
  root.add(body);
  { const at = root.children.indexOf(model.gunArm); root.add(sync); root.children.splice(root.children.indexOf(sync), 1); root.children.splice(at, 0, sync); }   // (it runs after the figure is posed, and before the gun arm is hung on its shoulder)
  const jointQ = (joint) => (joint === model.gunArm ? q.copy(joint.quaternion) : joint === model.foreArm ? q.copy(model.gunArm.quaternion).multiply(joint.quaternion) : (joint.matrixWorld.decompose(v, q, s3), q.premultiply(rootQ)));
  // ---- Motion capture ----
  // A second skeleton, never drawn, that the clips are played on; his own bones are then turned to match it (all but
  // his gun arm, which is still aimed by hand, and his feet, which are still put on the board).
  let mocap = null;
  const HAND_AIMED = new Set(['upperarm_l', 'lowerarm_l', 'hand_l']), FACE_Q = new THREE.Quaternion(), lean = new THREE.Euler();
  const startMocap = () => {
    if (mocap || !animFile) return;
    const puppet = animFile.scene.clone(true), joints = {}, mixer = new THREE.AnimationMixer(puppet), act = {};
    puppet.traverse((o) => { if (bones[o.name]) joints[o.name] = o; });
    for (const clip of animFile.animations) {
      clip.tracks = clip.tracks.filter((t) => t.name.endsWith('.quaternion'));
      act[clip.name] = mixer.clipAction(clip);
      act[clip.name].play();
      act[clip.name].setEffectiveWeight(0);
    }
    if (!act.ride) return;
    mocap = { puppet, joints, mixer, act, blend: 0, last: performance.now() };
  };
  // model.play(name, weight = 1, rate = 1, at, whole): play that clip on him this frame ('idle', 'walk', 'run', 'die'...).
  // Call it every frame it should go on for; when the calls stop, he goes back to how he is posed by hand. at: how
  // far into it he is, in seconds, if the caller is keeping its time (left out, it runs by itself, round and round).
  // whole: all of him is the clip's, his gun arm too (and so he is holding no gun while it plays).
  // Off his board only: on it, what he does is read from how he is riding (below).
  // how: { seated: his hips stay where whoever is playing it has put them (sat on something), whatever the clip has
  // them do; upright: 0..1, how far his back, neck and head are brought back from the clip's to how he holds them by
  // hand (a clip that has him hunched over, and he is to sit up); legs: false = his legs are not the clip's but as
  // they are posed by hand (sat on something the clip's seat was not: his knees are where the stone lets them be) }.
  // (true: seated, and nothing else.)
  model.play = (name, weight = 1, rate = 1, at, whole = false, how = null) => { model.acting = { name, weight, rate, at: performance.now(), time: at, whole, seated: how === true || !!how?.seated, upright: how?.upright || 0, legs: how?.legs !== false }; };
  const LEG_BONES = new Set(['thigh_l', 'calf_l', 'foot_l', 'ball_l', 'thigh_r', 'calf_r', 'foot_r', 'ball_r']);
  const STRAIGHT = { spine_01: 0.45, spine_02: 0.7, spine_03: 0.9, neck_01: 1, neck_02: 1, head: 1 };   // (how much of that each takes: his chest most of it, his head all of it)
  model.clips = () => (animFile ? animFile.animations.map((c) => ({ name: c.name, length: c.duration })) : []);
  const RIDING = new Set(['ride', 'push', 'ollie', 'air', 'hit', 'land']), RUNGS = new Set(['climb']);   // (RUNGS: his hips are not where they stand, and stay there: a ladder)
  const playMocap = () => {
    startMocap();
    if (!mocap) return 0;
    const now = performance.now(), dt = Math.min(0.1, (now - mocap.last) / 1000), A = mocap.act, before = mocap.last - 1;
    mocap.last = now;
    const fresh = (at) => at !== undefined && (now - at < 300 || at >= before);   // (said in the last moment, or since the last frame, however long ago that was)
    const riding = (model.onBoard = fresh(model.riding));
    // Off his board (the casino, the menu, dead on the ground): whatever clip he has been told to play this frame
    // (model.play), each fading in over the last.
    const told = !riding && model.acting && fresh(model.acting.at) ? model.acting : null;
    let drop = 0, sum = 0;
    for (const name in A) {
      if (riding && RIDING.has(name)) continue;
      const want = told && told.name === name ? 1 : 0, w = A[name].getEffectiveWeight() + (want - A[name].getEffectiveWeight()) * (1 - Math.exp(-9 * dt));
      A[name].setEffectiveWeight(w);
      if (want) { A[name].timeScale = told.time === undefined ? told.rate : 0; if (told.time !== undefined) A[name].time = Math.max(0, Math.min(A[name].getClip().duration - 0.02, told.time)); }
      const curve = w > 0.001 && animDrop && !RUNGS.has(name) ? animDrop.drop[name] : null;
      if (curve && curve.length) { const f = Math.min(curve.length - 1.001, Math.max(0, A[name].time * animDrop.fps)), i = Math.floor(f); drop += w * (curve[i] + (curve[i + 1] - curve[i]) * (f - i)); sum += w; }
    }
    mocap.blend += ((riding || told ? 1 : 0) - mocap.blend) * (1 - Math.exp(-10 * dt));
    mocap.drop = riding || (told && told.seated) ? 0 : drop / Math.max(1, sum);   // (on his board his hips are where his legs put them)
    if (told) mocap.whole = !!told.whole; else if (riding) mocap.whole = false;
    mocap.upright = told ? told.upright : 0;
    mocap.ownLegs = !!told && !told.legs;
    if (mocap.blend < 0.01) return 0;
    if (!riding) { mocap.mixer.update(dt); if (told) mocap.share = told.weight * (1 - (model.emoting || 0)); return mocap.blend * (mocap.share ?? 1); }   // (how much of him is the clip, and how much the pose he was given by hand: an emote is by hand)
    const kick = model.kick ?? 1, air = model.air || 0, crouch = model.crouch || 0, tricking = (model.tuck || 0) > 0.05;
    const pushing = kick < 1 ? Math.sin(Math.PI * kick) ** 0.5 : 0, popping = tricking ? 0 : Math.max(crouch * 0.9, air > 0 && air < 0.75 ? 1 : 0);
    A.ride.setEffectiveWeight(1);
    A.ride.timeScale = 1;
    if (A.push) { A.push.setEffectiveWeight(pushing); A.push.time = 0.55 + kick * 1.25; }                            // (the stroke of the push, in step with the game's)
    if (A.ollie) { A.ollie.setEffectiveWeight(popping); A.ollie.time = air > 0 ? Math.min(A.ollie.getClip().duration - 0.02, 0.4 + air * 0.95) : 0.4 * crouch; }   // (down as he charges it, up as he goes)
    if (A.air) { A.air.timeScale = 1; A.air.setEffectiveWeight(!tricking && air > 0.75 ? Math.min(1, (air - 0.75) * 4) : 0); }   // a long drop: arms and legs out, falling
    const since = (now - (model.hitAt || -1e9)) / 1000;                                                                 // hit: his head and shoulders snap back
    if (A.hit) { A.hit.setEffectiveWeight(since < 0.6 ? Math.sin((Math.PI * since) / 0.6) * 0.8 : 0); A.hit.time = 0.15 + since; }
    // Coming down from a long way up: he folds over it, and comes back up (the longer he fell, the more of it).
    if (air > 0) mocap.fell = air; else if (mocap.fell) { mocap.landed = { at: now, hard: Math.min(1, Math.max(0, (mocap.fell - 0.45) / 0.9)) }; mocap.fell = 0; }
    const down = mocap.landed ? (now - mocap.landed.at) / 1000 : 9;
    if (A.land) { A.land.setEffectiveWeight(down < 0.7 && !tricking ? Math.sin((Math.PI * down) / 0.7) ** 0.7 * 0.6 * mocap.landed.hard : 0); A.land.time = 0.12 + down * 0.9; }
    mocap.mixer.update(dt);
    return mocap.blend;
  };

  // What hangs on him and is not part of him (his headphones and chain, the pack on his back) was hung on the old
  // figure's chest, which is a stiff board; his own back bends, and in a clip it may be nowhere near where the old
  // figure's is (flat on the ground, dead). So they are hung on his chest bone: where they are on it is measured
  // once, with him standing straight (when the two agree), and kept.
  const HUNG = (model.hung ||= [model.neckwear, model.packHolder].filter(Boolean).map((thing) => ({ thing, on: null }))), hangM = new THREE.Matrix4();
  const hang = () => {
    for (const h of HUNG) {
      if (!h.on) continue;
      h.thing.parent.updateWorldMatrix(true, false);
      h.thing.matrixAutoUpdate = false;
      h.thing.matrix.copy(hangM.copy(h.thing.parent.matrixWorld).invert()).multiply(bones.spine_03.matrixWorld).multiply(h.on);
      h.thing.updateMatrixWorld(true);
    }
  };
  const measure = () => {
    const leant = model.torso.rotation.clone();
    model.torso.rotation.set(0, 0, 0);
    model.torso.updateMatrixWorld(true);
    pose(0);
    for (const h of HUNG) h.on = new THREE.Matrix4().copy(bones.spine_03.matrixWorld).invert().multiply(h.thing.matrixWorld);
    model.torso.rotation.copy(leant);
    model.torso.updateMatrixWorld(true);
  };
  sync.updateMatrixWorld = () => {
    if (!body.visible) return;
    updateFace();
    if (bones.spine_03 && HUNG.length && !HUNG[0].on) measure();
    const played = playMocap();
    model.clipOn = played > 0.5;
    pose(played);
    if (bones.spine_03) hang();
  };
  // ---- His arms stay out of him ----
  // He is a big man, and what moves his arms was made for thin ones: a gun carried at his side, an arm swung as he
  // rides, a hand brought across to a long gun's fore-end all went through his belly. So his body is two rounded
  // lumps (his belly, on his hips; his chest), each as wide, as tall and as deep as he is there plus half the
  // thickness of an arm, and an elbow or a wrist that is inside one is moved straight out of it, sideways and
  // forwards (not up or down: his arm is to go round him, not over him). The arm is then turned to its new elbow,
  // and its forearm to its new wrist.
  //   at: the middle of the lump, from the bone (left, up, forward, as he stood); r: half its width, height, depth.
  const BULK = meshes.Hat ? [{ bone: 'pelvis', at: [0, 0.06, 0.045], r: [0.31, 0.31, 0.32] }, { bone: 'spine_03', at: [0, -0.03, -0.012], r: [0.285, 0.25, 0.27] }] : [];
  const lumpAt = new THREE.Vector3(), lumpIn = new THREE.Vector3(), lumpQ = new THREE.Quaternion(), lumpBack = new THREE.Quaternion();
  const clearOf = (P) => {   // P: a point, in his own space. Moved out of him if it is in him: true if it was.
    let moved = false;
    for (const B of BULK) {
      const o = mine.get(B.bone);
      if (!o) continue;
      lumpQ.copy(o.world).multiply(lumpBack.copy(o.stood).invert());   // (how that part of him is turned from how it stood)
      root.worldToLocal(o.bone.getWorldPosition(lumpAt)).add(lumpIn.set(...B.at).applyQuaternion(lumpQ));
      lumpIn.copy(P).sub(lumpAt).applyQuaternion(lumpBack.copy(lumpQ).invert());
      const x = lumpIn.x / B.r[0], y = lumpIn.y / B.r[1], z = lumpIn.z / B.r[2], k = x * x + y * y + z * z;
      if (k >= 1) continue;
      if (y * y < 0.9) { const out = Math.sqrt((1 - y * y) / Math.max(1e-6, x * x + z * z)); lumpIn.x *= out; lumpIn.z *= out; }
      else lumpIn.multiplyScalar(1 / Math.sqrt(Math.max(1e-6, k)));
      P.copy(lumpIn.applyQuaternion(lumpQ)).add(lumpAt);
      moved = true;
    }
    return moved;
  };
  const armE = new THREE.Vector3(), armW = new THREE.Vector3(), armQ = new THREE.Quaternion(), armD = new THREE.Vector3();
  // The arm his gun is in is the old figure's (shoulder, and elbow hung off it: his own follows them), so it is the
  // old figure's that is moved.
  const keepGunArmOut = () => {
    const S = model.gunArm.position;
    armE.copy(model.foreArm.position).applyQuaternion(model.gunArm.quaternion);
    armD.copy(armE).normalize();
    armE.add(S);
    if (clearOf(armE)) {
      // (his upper arm goes to its new elbow; his forearm, and the gun along it, stay pointing where they were)
      lumpQ.copy(model.gunArm.quaternion).multiply(model.foreArm.quaternion);
      model.gunArm.quaternion.premultiply(armQ.setFromUnitVectors(armD, armE.sub(S).normalize()));
      model.foreArm.quaternion.copy(armQ.copy(model.gunArm.quaternion).invert().multiply(lumpQ));
    }
    armE.copy(model.foreArm.position).applyQuaternion(model.gunArm.quaternion).add(S);
    armQ.copy(model.gunArm.quaternion).multiply(model.foreArm.quaternion);
    armD.set(0, 0, 1).applyQuaternion(armQ);
    armW.copy(armD).multiplyScalar(0.29).add(armE);
    if (clearOf(armW)) {
      armQ.premultiply(lumpQ.setFromUnitVectors(armD, armW.sub(armE).normalize()));
      model.foreArm.quaternion.copy(lumpQ.copy(model.gunArm.quaternion).invert().multiply(armQ));
    }
  };
  // His other arm (and, when a clip has all of him, that one too) is his own bones'.
  const keepArmOut = (side) => {
    const upper = bones[`upperarm_${side}`], lower = bones[`lowerarm_${side}`], hand = bones[`hand_${side}`];
    if (!upper || !lower || !hand) return;
    root.worldToLocal(lower.getWorldPosition(armE));
    if (clearOf(armE)) point(upper, lower, root.localToWorld(armE));
    root.worldToLocal(hand.getWorldPosition(armW));
    if (clearOf(armW)) point(lower, hand, root.localToWorld(armW));
  };
  // How far round his chest comes to a long gun (rad, at each bone of his back), and how far round it is now (0..1).
  // (SQUARE: the share of the turn each bone of his back takes. squareTo: how far round that is, in rad: far enough to
  // have his chest square on to wherever the gun is pointing, which, pointing up the board, is 0.72 from side on.)
  const SQUARE = { spine_01: 0.28, spine_02: 0.62, spine_03: 1 }, SPINE_AXIS = new THREE.Vector3(0, 1, 0);
  let squared = 0, squareTo = 0.72;
  const pose = (played) => {
    squared += ((model.twoHanded && model.gun && !(mocap && mocap.whole && played > 0.5) ? 1 : 0) - squared) * 0.2;
    if (squared > 0.001) {
      armD.set(0, 0, 1).applyQuaternion(armQ.copy(model.gunArm.quaternion).multiply(model.foreArm.quaternion));
      squareTo += (Math.max(-0.45, Math.min(1, Math.atan2(armD.x, armD.z) + 0.72)) - squareTo) * 0.25;
    }
    if (BULK.length && !(mocap && mocap.whole && played > 0.5)) keepGunArmOut();
    if (played) FACE_Q.setFromEuler(lean.set(model.tilt.rotation.x, MOCAP_YAW, model.tilt.rotation.z));   // (leaning as the figure leans: into a carve, back on a tomb)
    const alien = model.alien && model.alien.body.visible ? model.alien : model.suit && model.suit.body.visible ? model.suit : null;   // (another body he is wearing: an alien's, or a space suit)
    root.matrixWorld.decompose(v, rootQ, s3);
    rootQ.invert();   // (everything below is worked out in his own space, not the world's)
    for (const o of order) {
      const d = driven.get(o.bone);
      if (d) {
        o.world.copy(jointQ(d.joint)).multiply(d.turn);
        // (he bends at the waist, not the hip: his pelvis stays nearly upright under him and his back takes the lean
        // a bone at a time, or his backside is stuck out behind him whenever he leans into his ride)
        const share = UPRIGHT[o.bone.name];
        if (share !== undefined) o.world.slerp(q2u.copy(jointQ(model.torso.parent)).multiply(d.turn), 1 - share);
        // (his neck takes half of a turn of his head, his skull the rest: all of it at the collar wrings his neck out of his shirt)
        if (o.bone === bones.neck_01 && o.parent) o.world.slerp(q.copy(o.parent.world).multiply(o.rest), 0.55);
      }
      else if (o.parent) o.world.copy(o.parent.world).multiply(o.rest);
      else o.world.copy(above).multiply(o.rest);
      // (motion capture: this bone as the clip has it, on whatever it hangs from; his hips also turned to the board)
      const joint = played && (mocap.whole || !HAND_AIMED.has(o.bone.name)) && !(mocap.ownLegs && LEG_BONES.has(o.bone.name)) ? mocap.joints[o.bone.name] : null;
      if (joint && o.parent) {
        q2u.copy(o.parent.world).multiply(joint.quaternion);
        if (o.bone === bones.pelvis) q2u.premultiply(FACE_Q);
        if (mocap.upright && STRAIGHT[o.bone.name]) q2u.slerp(o.world, mocap.upright * STRAIGHT[o.bone.name]);   // (sat up: back towards how he holds himself by hand)
        o.world.slerp(q2u, played);
      }
      // (both hands on a long gun: his chest comes round toward it, a bone at a time, as far as lets his other hand
      // get to its fore-end. Stood side on to the way he is going, as he rides, that hand cannot reach it.)
      if (squared > 0.001 && SQUARE[o.bone.name]) o.world.premultiply(q2u.setFromAxisAngle(SPINE_AXIS, SQUARE[o.bone.name] * squareTo * squared));
      o.bone.quaternion.copy(o.world);
      if (o.parent) o.bone.quaternion.premultiply(q.copy(o.parent.world).invert());
    }
    bones.pelvis.parent.updateWorldMatrix(true, false);
    model.torso.getWorldPosition(v);   // his hips are where the figure's are...
    if (played && mocap.drop) v.y += mocap.drop * (v.y - model.rider.getWorldPosition(w).y) * played;   // ...and as far down (a knee bent, flat on his back) or up (a jump) from there as the clip has them
    bones.pelvis.position.copy(bones.pelvis.parent.worldToLocal(v));
    // (all of him is the clip's: he has put his gun away)
    const away = !!(mocap && played > 0.5 && mocap.whole);
    if (mocap && away !== !!mocap.away) { mocap.away = away; model.gunArm.visible = !away; }
    body.updateMatrixWorld(true);
    if (BULK.length) { keepArmOut('r'); if (mocap && mocap.whole && played > 0.5) keepArmOut('l'); }
    plantFeet();
    if (alien) alien.follow();   // (the alien, or the suit, does as he does: see shadow)
    // What he wears on his head and has in his mouth goes where his head now is, and turns as it turns. (The old
    // figure's head is a holder, hinged at his neck, with everything inside it in a second one, `headIn`. The holder's
    // own turn is the game's to set, and his skull follows it; but a clip may have turned his skull some other way,
    // and then what is on it was left facing the way the holder did: a boof hanging in the air in front of a bowed
    // head. So the inner holder is turned by however far his skull is from where the outer one has it.)
    const skull = mine.get('head'), neck = driven.get(bones.head);
    if (skull && neck && model.headIn) {
      headTurn.copy(jointQ(model.head)).invert().multiply(headWant.copy(skull.world).multiply(headRest.copy(neck.turn).invert()));
      model.headIn.quaternion.copy(headTurn);
      model.headIn.position.set(0, -0.69, 0).applyQuaternion(headTurn);   // (about the hinge, not about its own corner)
    }
    bones.head.getWorldPosition(v).addScaledVector(w.set(0, 1, 0).applyQuaternion(bones.head.getWorldQuaternion(q)), FIT.skull - 0.11 * FIT.head);   // (the hinge: that far under the middle of his skull)
    model.head.position.copy(model.torso.worldToLocal(v));
    model.head.updateMatrixWorld(true);
    // (and in a costume, what he is smoking goes to that body's mouth: see mouthOn)
    const lips = alien && alien.mouth, smoke = model.cig;
    if (lips && smoke) {
      const holder = smoke.parent;
      lips.head.updateWorldMatrix(true, false);
      holder.updateWorldMatrix(true, false);
      smoke.position.copy(holder.worldToLocal(lips.head.localToWorld(v.copy(lips.spot))));
      smoke.quaternion.copy(holder.getWorldQuaternion(q)).invert().multiply(lips.head.getWorldQuaternion(q2u)).multiply(lips.unstood).multiply(DROOP);
      smoke.scale.setScalar(1.1 / holder.getWorldScale(w).y);   // (the size it is on a man: his own head is a big one, and it is made to match)
      smokeMoved = true;
    } else if (smokeMoved && smoke) {
      smokeMoved = false;
      smoke.position.set(...(model.mouthAt || [0, 0.75, 0.112]));
      smoke.rotation.set(0.16, 0, 0);
      smoke.scale.setScalar(1);
    }
  };
  const DROOP = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.16);
  let smokeMoved = false;
  const headTurn = new THREE.Quaternion(), headWant = new THREE.Quaternion(), headRest = new THREE.Quaternion();
  // Where the middle of his face is, in the world, and how big his head is against a man's (for whoever points a
  // camera at it: a close-up framed for a man's head has to stand further off for his).
  model.faceAt = (out) => bones.head.getWorldPosition(out).addScaledVector(w.set(0, 1, 0).applyQuaternion(bones.head.getWorldQuaternion(q)), FIT.skull * 0.85);
  model.faceBig = FIT.head / HEAD_FIT;
  // Both hands on a long gun: his other arm reaches for its fore-end (shoulder, elbow, hand: the elbow dropped, out
  // to the side). It runs after the gun arm has been aimed, so that it reaches for where the gun is now.
  const late = new THREE.Object3D(), S = new THREE.Vector3(), T = new THREE.Vector3(), E = new THREE.Vector3(), dir = new THREE.Vector3(), pole = new THREE.Vector3(), q2 = new THREE.Quaternion(), q3 = new THREE.Quaternion();
  root.add(late);
  const L1 = bones.lowerarm_r ? place(bones.lowerarm_r).distanceTo(place(bones.upperarm_r)) : 0, L2 = bones.hand_r ? place(bones.hand_r).distanceTo(place(bones.lowerarm_r)) + 0.06 : 0;
  const point = (bone, child, to) => {   // turn `bone` (the least it takes) so that `child` lies towards `to`
    bone.getWorldPosition(v); child.getWorldPosition(w);
    q2.setFromUnitVectors(w.sub(v).normalize(), dir.copy(to).sub(v).normalize());
    bone.getWorldQuaternion(q3).premultiply(q2);
    bone.quaternion.copy(bone.parent.getWorldQuaternion(q2).invert().multiply(q3));
    bone.updateMatrixWorld(true);
  };
  // ---- His lighter ----
  // model.light(raised, flame, spark), said every frame it is wanted: his other hand brings his lighter up under what
  // he is smoking (raised: 0 at his side, 1 there), with its flame that big (0..1) and that much of a spark off its
  // wheel (0..1: a strike that does not take). It is in his hand all the way up and down, and put away at the bottom.
  const LIGHTER = 1.35;   // (bigger than a real one, as his hands and his head are)
  let lit = null, lighter = null, flame = null, spark = null;
  const litE = new THREE.Vector3(), litB = new THREE.Vector3(), litT = new THREE.Vector3(), litUp = new THREE.Vector3(), litOut = new THREE.Vector3(), litH = new THREE.Vector3();
  model.light = (raised, burning = 0, struck = 0) => {
    lit = { raised, burning, struck, at: performance.now() };
    if (lighter) return;
    lighter = new THREE.Group();
    lighter.visible = false;
    root.add(lighter);
    const glowing = (color, size) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })); s.scale.setScalar(size); s.visible = false; lighter.add(s); return s; };
    // (its flame: a tongue of it, white at the heart and orange round that, and the glow it throws; drawn solid, so
    // that it shows against whatever is behind it)
    const tongue = (color, wide, tall) => new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.55, 0.12], [0.95, 0.3], [0.8, 0.52], [0.42, 0.78], [0, 1]].map(([r, y]) => new THREE.Vector2(r * wide, y * tall)), 12), new THREE.MeshBasicMaterial({ color, toneMapped: false }));
    flame = new THREE.Group();
    flame.add(tongue(0xff8a1e, 0.011, 0.058), tongue(0xfff0b0, 0.006, 0.036), glowing(0xffa040, 0.11));
    flame.children[1].position.y = 0.004;
    flame.children[2].position.y = 0.03;
    flame.children[2].visible = true;
    flame.children[2].material.opacity = 0.5;
    flame.visible = false;
    lighter.add(flame);
    spark = glowing(0xfff3c8, 0.035);
    lighter.scale.setScalar(LIGHTER);
    lighterMade().then((made) => { if (made) lighter.add(new THREE.Mesh(made.geometry, made.material)); });
  };
  const holdLighter = (L) => {
    const up = smoothstep(L.raised), holder = model.ember;
    litUp.set(0, 1, 0).applyQuaternion(root.getWorldQuaternion(q2));
    // Where it goes: its chimney a finger under the end of what he is smoking, stood upright. His wrist beside it.
    holder.getWorldPosition(litE);
    bones.hand_r.getWorldPosition(litH);
    bones.upperarm_r.getWorldPosition(S);
    litOut.copy(S).sub(bones.upperarm_l.getWorldPosition(w)).normalize();   // (to the side that arm is on)
    litB.copy(litE).addScaledVector(litUp, -(0.082 * LIGHTER + 0.05));   // (its flame is that tall: the top of it is at the end of what he is smoking)
    litT.copy(litB).addScaledVector(litUp, 0.025).addScaledVector(litOut, 0.062).addScaledVector(v.copy(S).sub(litE).setY(0).normalize(), 0.045);
    if (L.raised < 0.999) { v.copy(litB).sub(litT); litT.lerpVectors(litH, litT, up); litB.copy(litT).add(v); }   // (on its way: in his hand, wherever that has got to)
    const far = Math.min(S.distanceTo(litT), (L1 + L2) * 0.995), along = (L1 * L1 - L2 * L2 + far * far) / (2 * far), off = Math.sqrt(Math.max(0, L1 * L1 - along * along));
    dir.copy(litT).sub(S).normalize();
    pole.copy(litUp).multiplyScalar(-1).addScaledVector(litOut, 0.6);
    pole.addScaledVector(dir, -pole.dot(dir)).normalize();
    E.copy(S).addScaledVector(dir, along).addScaledVector(pole, off);
    point(bones.upperarm_r, bones.lowerarm_r, E);
    point(bones.lowerarm_r, bones.hand_r, litT);
    lighter.visible = true;
    lighter.position.copy(root.worldToLocal(litB));
    lighter.quaternion.copy(root.getWorldQuaternion(q2)).invert().multiply(q3.setFromUnitVectors(v.set(0, 1, 0), litUp)).multiply(q2.setFromAxisAngle(v.set(0, 1, 0), performance.now() * 0 + 1.2));
    const now = performance.now() / 1000;
    flame.visible = L.burning > 0.02;
    flame.position.set(0, 0.08, 0);
    flame.scale.set(L.burning * (0.85 + 0.15 * Math.sin(now * 31)), L.burning * (0.86 + 0.14 * Math.sin(now * 23 + 1)), L.burning);
    flame.rotation.z = 0.12 * Math.sin(now * 17);
    spark.visible = L.struck > 0.02;
    spark.position.set(0.004, 0.074, 0.006);
    spark.scale.setScalar(0.045 * L.struck * (0.7 + 0.3 * Math.sin(now * 90)));
  };
  const smoothstep = (k) => { k = Math.max(0, Math.min(1, k)); return k * k * (3 - 2 * k); };
  // ---- What he is smoking, out of his mouth ----
  // model.pluck(taken), said every frame it is wanted: his other hand takes what he is smoking out of his mouth and
  // holds it out of the way, stood on end in front of that shoulder (as high: where it can be seen), while something else goes there (a glass).
  // taken: 0 in his mouth, his hand wherever it was; 0.5 his fingers on it; 1 held aside. Run back down, he puts it
  // back. model.mouthWorld(out): where his mouth is, whether or not it is in it.
  let plucked = null;
  const home = { p: new THREE.Vector3(), q: new THREE.Quaternion(), s: 1, kept: false }, heldQ = new THREE.Quaternion(), heldZ = new THREE.Vector3(), heldAt = new THREE.Vector3(), heldG = new THREE.Vector3();
  model.pluck = (taken) => { plucked = { taken, at: performance.now() }; };
  model.mouthWorld = (out) => (home.kept ? model.cig.parent.localToWorld(out.copy(home.p)) : model.cig.getWorldPosition(out));
  const putBack = () => { const s = model.cig; if (s && home.kept && !smokeMoved) { s.position.copy(home.p); s.quaternion.copy(home.q); s.scale.setScalar(home.s); s.updateMatrixWorld(true); } };
  const holdSmoke = (P) => {
    const smoke = model.cig, holder = smoke.parent, rise = smoothstep(P.taken / 0.45), away = smoothstep((P.taken - 0.5) / 0.5);
    // (where it lives: in his mouth. A costume puts it in its own every frame; his own stays where it was put.)
    if (home.kept && !smokeMoved) putBack(); else { home.p.copy(smoke.position); home.q.copy(smoke.quaternion); home.s = smoke.scale.x; home.kept = true; }
    holder.updateWorldMatrix(true, false);
    smoke.updateMatrixWorld(true);
    root.getWorldQuaternion(q2);
    litUp.set(0, 1, 0).applyQuaternion(q2);
    heldZ.set(0, 0, 1).applyQuaternion(q2);   // (the way he faces)
    bones.upperarm_r.getWorldPosition(S);
    litOut.copy(S).sub(bones.upperarm_l.getWorldPosition(w)).normalize();   // (to the side that arm is on)
    bones.hand_r.getWorldPosition(litH);
    smoke.getWorldPosition(litE);     // (the end of it that is in his mouth)
    smoke.getWorldQuaternion(q3);     // (and how it lies there)
    // Held aside: in front of that shoulder, stood on end: its lit end up, and tipped away from him.
    heldAt.copy(S).addScaledVector(heldZ, 0.3).addScaledVector(litUp, 0.03).addScaledVector(litOut, 0.09);
    dir.set(0, 0, 1).applyQuaternion(q3);
    v.copy(litUp).addScaledVector(heldZ, 0.4).addScaledVector(litOut, 0.3).normalize();
    heldQ.setFromUnitVectors(dir, v).multiply(q3);
    q3.slerp(heldQ, away);
    litE.lerp(heldAt, away).addScaledVector(heldZ, 0.07 * Math.sin(Math.PI * away));   // (out forwards, clear of his face, and round)
    if (away > 0) {
      smoke.position.copy(holder.worldToLocal(v.copy(litE)));
      smoke.quaternion.copy(holder.getWorldQuaternion(heldQ)).invert().multiply(q3);
      smoke.updateMatrixWorld(true);
    }
    // His fingers on it: a third of the way along it, his hand under and outside that.
    heldG.set(0, 0, 0.04).applyQuaternion(q3).add(litE);
    litT.copy(heldG).addScaledVector(litUp, -0.03).addScaledVector(litOut, 0.05).addScaledVector(v.copy(S).sub(heldG).setY(0).normalize(), 0.03);
    if (rise < 0.999) litT.lerpVectors(litH, litT, rise);   // (on its way up: from wherever it was)
    const far = Math.min(S.distanceTo(litT), (L1 + L2) * 0.995), along = (L1 * L1 - L2 * L2 + far * far) / (2 * far), off = Math.sqrt(Math.max(0, L1 * L1 - along * along));
    dir.copy(litT).sub(S).normalize();
    pole.copy(litUp).multiplyScalar(-1).addScaledVector(litOut, 0.6);
    pole.addScaledVector(dir, -pole.dot(dir)).normalize();
    E.copy(S).addScaledVector(dir, along).addScaledVector(pole, off);
    point(bones.upperarm_r, bones.lowerarm_r, E);
    point(bones.lowerarm_r, bones.hand_r, litT);
  };
  late.updateMatrixWorld = () => {
    if (!body.visible || !L1) return;
    const plucking = plucked && plucked.taken > 0.01 && performance.now() - plucked.at < 300 ? plucked : null;
    if (!plucking && home.kept) { putBack(); home.kept = false; }
    if (plucking && model.cig) { if (lighter) lighter.visible = false; return holdSmoke(plucking); }
    const lighting = lit && lit.raised > 0.01 && performance.now() - lit.at < 300 ? lit : null;
    if (lighter) lighter.visible = false;
    if (lighting && lighter && model.ember) return holdLighter(lighting);
    if (!model.twoHanded || !model.gun || (mocap && mocap.away)) return;
    model.foreArm.updateWorldMatrix(true, false);
    T.copy(model.gun.support);
    T.z = Math.min(T.z, 0.27);   // (as far along it as he can reach with the gun held in)
    model.foreArm.localToWorld(T.add(w.set(0, -0.015, 0.29 + PALM)));   // (0.29: his hand, along his forearm)
    bones.upperarm_r.getWorldPosition(S);
    const far = Math.min(S.distanceTo(T), (L1 + L2) * 0.995), along = (L1 * L1 - L2 * L2 + far * far) / (2 * far), off = Math.sqrt(Math.max(0, L1 * L1 - along * along));
    dir.copy(T).sub(S).normalize();
    pole.set(0, -1, 0).applyQuaternion(root.getWorldQuaternion(q2)).addScaledVector(v.copy(S).sub(bones.spine_03.getWorldPosition(w)).normalize(), 0.5);
    pole.addScaledVector(dir, -pole.dot(dir)).normalize();
    E.copy(S).addScaledVector(dir, along).addScaledVector(pole, off);
    if (BULK.length) { root.worldToLocal(E); clearOf(E); root.localToWorld(E); }   // (round his belly, not through it)
    point(bones.upperarm_r, bones.lowerarm_r, E);
    point(bones.lowerarm_r, bones.hand_r, T);
  };
  // ---- A drag ----
  // model.toMouth(w, glass): the hand his gun is in, brought to what he is smoking (w: 0..1 of the way from wherever
  // it is), or, with `glass` a place in the world, to that: his fingers round a glass, wherever it has got to. His
  // arm is bent to reach: shoulder, elbow (down, and out to that side), and his fingers on it.
  const mouthT = new THREE.Vector3(), mouthU = new THREE.Vector3(), mouthX = new THREE.Vector3(), mouthY = new THREE.Vector3(), mouthQ = new THREE.Quaternion(), mouthM = new THREE.Matrix4();
  model.toMouth = (amount, glass = false) => {
    if (!model.cig || amount <= 0.001) return;
    const A = model.foreArm.position.length(), B = 0.29 + 0.07, Sm = model.gunArm.position;   // (upper arm; forearm, and his hand to its fingers)
    root.updateWorldMatrix(true, false);
    // (what he is smoking: a third of the way along it, and just under. A glass: his hand is round it, out in
    // front of his chin, its rim at his lips.)
    if (glass && glass.isVector3) root.worldToLocal(mouthT.copy(glass));
    else root.worldToLocal(model.cig.localToWorld(glass ? mouthT.set(0.03, -0.05, 0.095) : mouthT.set(0, -0.012, 0.035)));
    const far = Math.min(mouthT.distanceTo(Sm), (A + B) * 0.995), tilt = Math.acos(Math.max(-1, Math.min(1, (A * A + far * far - B * B) / (2 * A * far)))), bend = Math.PI - Math.acos(Math.max(-1, Math.min(1, (A * A + B * B - far * far) / (2 * A * B))));
    dir.copy(mouthT).sub(Sm).normalize();
    // (his elbow: down, and out to the side that arm hangs on; his forearm bends away from that)
    pole.set(Math.sign(Sm.x) || 1, -1.6, -0.2).normalize();
    mouthY.copy(pole).addScaledVector(dir, -pole.dot(dir)).normalize().multiplyScalar(-1);
    mouthX.crossVectors(mouthY, dir);
    mouthU.copy(dir).multiplyScalar(Math.cos(tilt)).addScaledVector(mouthY, -Math.sin(tilt));
    mouthY.crossVectors(mouthU, mouthX);
    mouthQ.setFromRotationMatrix(mouthM.makeBasis(mouthX, mouthY, mouthU));
    model.gunArm.quaternion.slerp(mouthQ, amount);
    model.foreArm.rotation.set(model.foreArm.rotation.x + (-bend - model.foreArm.rotation.x) * amount, 0, 0);
  };
  // ---- His feet ----
  // They go where a skater's feet go, whatever the rest of him is doing: on the board, over the bolts (the front one
  // across it, the back one on the tail), following it as it tips into a pop; lifted clear of it while it is
  // flipping under him; and, through a push, the back one off the board, down onto the ground beside it, driving
  // back along it, and up onto the tail again. Each leg is then bent to reach (hip, knee, ankle: the knee out in
  // front of him), and the foot laid flat on whatever it is standing on.
  const LEGS = [['l', 0.27], ['r', -0.28]].map(([side, z]) => {
    const thigh = bones[`thigh_${side}`], calf = bones[`calf_${side}`], foot = bones[`foot_${side}`];
    return thigh && calf && foot ? { thigh, calf, foot, z, back: z < 0, upper: place(calf).distanceTo(place(thigh)), lower: place(foot).distanceTo(place(calf)), flat: foot.getWorldQuaternion(new THREE.Quaternion()) } : null;
  }).filter(Boolean);
  const ANKLE = 0.118, T2 = new THREE.Vector3(), G = new THREE.Vector3(), H = new THREE.Vector3(), knee = new THREE.Vector3(), facing = new THREE.Vector3(), qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), size = new THREE.Vector3();
  const ease = (k) => { k = Math.max(0, Math.min(1, k)); return k * k * (3 - 2 * k); };
  function plantFeet() {
    if (!LEGS.length || !model.board || !model.tilt || !(mocap ? model.onBoard : performance.now() - (model.riding || -1e9) < 250)) return;   // (only while he is riding: in the menu, the casino and the scenes his legs are posed by hand)
    model.board.updateWorldMatrix(true, false);
    root.getWorldScale(size);
    const tuck = model.tuck || 0, kick = model.kick ?? 1, off = Math.min(1, tuck * 4);
    facing.set(0, 0, 1).applyQuaternion(model.rider.getWorldQuaternion(qa)).normalize();   // (the way he faces: across the board)
    const yaw = model.rider.rotation.y;
    // Where each foot is to go.
    for (const leg of LEGS) {
      leg.at ||= new THREE.Vector3();
      // On the board...
      model.board.localToWorld(T2.set(0, 0.012 + ANKLE, leg.z));
      // ...or held up over it while it flips...
      if (off > 0) T2.lerp(model.tilt.localToWorld(G.set(0, model.board.position.y + ANKLE + 0.2 * tuck, leg.z * 0.8)), off);
      // ...or (the back one) pushing: down onto the ground beside the board, driven back along it, and up onto the
      // tail again. (Here, whatever the clip has that leg do: the clip is for the rest of him, and a foot that does
      // not reach the ground is no push.)
      leg.down = 0;
      if (leg.back && kick < 1 && !off) {
        const out = ease(kick / 0.2), home = ease((kick - 0.72) / 0.28), sweep = Math.max(0, Math.min(1, (kick - 0.12) / 0.6));
        leg.down = out * (1 - home);
        model.tilt.localToWorld(G.set(Math.sin(yaw) * 0.22, ANKLE - 0.01 + 0.1 * Math.sin(Math.PI * out) * (out < 1 ? 1 : 0) + 0.12 * Math.sin(Math.PI * home), Math.cos(yaw) * 0.22 + 0.2 - 0.66 * ease(sweep)));
        T2.lerp(G, leg.down);
      }
      leg.at.copy(T2);
    }
    // His hips come down as far as it takes for both feet to get there: the leg he stands on bends, to let the other
    // one reach the ground (it matters most to a short-legged man; a long-legged one's reach it as he stands).
    let sink = 0;
    for (const leg of LEGS) {
      leg.thigh.getWorldPosition(H);
      const reach = (leg.upper + leg.lower) * size.x * 0.97, clear = Math.sqrt(Math.max(0, reach * reach - (H.x - leg.at.x) ** 2 - (H.z - leg.at.z) ** 2));   // (how far above its foot that hip can be)
      sink = Math.max(sink, H.y - leg.at.y - clear);
    }
    if (sink > 0.001) {
      bones.pelvis.getWorldPosition(H);
      H.y -= Math.min(0.32, sink);
      bones.pelvis.position.copy(bones.pelvis.parent.worldToLocal(H));
      bones.pelvis.updateMatrixWorld(true);
    }
    for (const leg of LEGS) {
      T2.copy(leg.at);
      const down = leg.down;
      // Hip, knee, ankle.
      leg.thigh.getWorldPosition(H);
      const reach = (leg.upper + leg.lower) * size.x, far = Math.max(reach * 0.3, Math.min(H.distanceTo(T2), reach * 0.995));
      dir.copy(T2).sub(H).normalize();
      T2.copy(H).addScaledVector(dir, far);
      const along = (leg.upper ** 2 - leg.lower ** 2) * size.x * size.x / (2 * far) + far / 2, bend = Math.sqrt(Math.max(0, (leg.upper * size.x) ** 2 - along * along));
      pole.copy(facing).addScaledVector(dir, -facing.dot(dir)).normalize();
      knee.copy(H).addScaledVector(dir, along).addScaledVector(pole, bend);
      point(leg.thigh, leg.calf, knee);
      point(leg.calf, leg.foot, T2);
      // The foot: flat on the board (tipping with it), or on the ground, or level under him in the air.
      qb.copy(off > 0.5 || down > 0.5 ? model.tilt.getWorldQuaternion(qa) : model.board.getWorldQuaternion(qa)).multiply(q2.setFromAxisAngle(w.set(0, 1, 0), yaw)).multiply(leg.flat);
      leg.foot.quaternion.copy(leg.calf.getWorldQuaternion(qa).invert().multiply(qb));
      leg.foot.updateMatrixWorld(true);
    }
  }

  // The gun arm hangs from his shoulder (the real one, now).
  model.seatArm = () => { model.gunArm.position.copy(root.worldToLocal(bones.upperarm_l.getWorldPosition(v))); };

  // ---- The old figure is no longer drawn (what he carries and wears still is) ----
  const keep = new Set([model.beanieDome, model.brim]);
  const face = new Set(model.headIn.children);
  const hideIn = (group, deep) => { for (const c of group.children) { if (c.isMesh) { if (!keep.has(c)) c.visible = false; } else if (deep && !c.isBone) hideIn(c, deep); } };
  model.hideFigure = () => {
    hideIn(model.frontLeg, true); hideIn(model.backLeg, true); hideIn(model.leftArm, true);
    hideIn(model.gunArm, false); hideIn(model.foreArm, false);       // (not the guns: those are groups)
    hideIn(model.torso, false);
    hideIn(model.headIn, false);   // (his old head: the beanie stays)
  };
  // Dressing him (see applyLook): the hoodie takes its colour, a costume its skin, and his hair shows when nothing is over it.
  model.afterLook = (masked) => {
    model.hideFigure();
    // His top: the shirt of that colour (its cloth and its print: see TEES). In a costume it is the suit: all of him
    // is, down to his boots, and in a helmet his arms are sleeves and gloves.
    const suit = COSTUMES[model.look?.outfit], tee = TEES[String(model.shownHoodie).toLowerCase()] || { cloth: model.shownHoodie };
    const own = !!meshes.Hat && String(model.shownHoodie).toLowerCase() === '#7a2f2b';   // (the man in the fedora, in what he came in: his shirt and waistcoat as they were painted)
    if (meshes.Shirt) {
      const m = meshes.Shirt.material;
      m.color.set(suit ? suit.suit : own ? 0xffffff : tee.cloth);
      m.metalness = suit ? (model.look.outfit === 'gilded' ? 0.7 : 0.1) : tee.metal || 0;
      m.roughness = suit ? (model.look.outfit === 'gilded' ? 0.35 : 0.7) : tee.rough || 0.85;
    }
    if (meshes.Logo) { meshes.Logo.visible = !suit && !!tee.print; if (tee.print) meshes.Logo.material = printMaterial(tee.print, tee.inks); }
    if (meshes.Pants) { meshes.Pants.material.color.set(suit ? new THREE.Color(suit.suit).multiplyScalar(0.92) : 0xffffff); meshes.Pants.material.metalness = suit && model.look.outfit === 'gilded' ? 0.6 : 0; }
    if (meshes.Shoes) meshes.Shoes.material.color.set(suit ? (suit.helmet ? 0x9a9aa2 : 0x55555c) : 0xffffff);
    for (const o of model.worn || []) o.visible = !suit;
    // (a suit is its own cloth: his trousers' khaki weave, and in a helmet the skin of his arms, give way to it)
    for (const [name, plain] of [['Pants', !!suit], ['Body', !!(suit && suit.helmet)]]) {
      const m = meshes[name]?.material;
      if (!m) continue;
      m.userData.map ??= m.map;
      const map = plain ? null : m.userData.map;
      if (m.map !== map) { m.map = map; m.needsUpdate = true; }
    }
    if (meshes.Body) meshes.Body.material.color.copy(suit && suit.helmet ? new THREE.Color(suit.suit) : model.mats.skin.color.getHex() !== 0xc99873 ? model.mats.skin.color : WHITE);
    for (const name of ['Face', 'Brows', 'Eyes', 'Teeth']) if (meshes[name]) meshes[name].visible = REAL_FACE && !masked;
    if (meshes.Hair) meshes.Hair.visible = REAL_FACE && !masked;
    if (meshes.HairTop) meshes.HairTop.visible = REAL_FACE && !masked;   // (under a beanie too: it is the top of his head)
    // What he has on over it all: headphones and glasses (on his own head only), his pack and the hem of the shirt
    // under his shirt (in his own clothes only: a costume is a suit, with a pack of its own if it has one).
    for (const name of ['Headphones', 'Glasses', 'Lenses']) if (meshes[name]) meshes[name].visible = REAL_FACE && !masked;
    for (const name of ['Pack', 'Hem']) if (meshes[name]) meshes[name].visible = !suit;
    if (meshes.Headphones) meshes.Headphones.visible &&= !model.beanieDome.visible;   // (a beanie goes on in place of them)
    if (meshes.Hat) {   // his fedora: on unless a costume's head is, in whichever felt he has chosen
      meshes.Hat.visible = REAL_FACE && !masked;
      const hat = HATS[String(model.look?.beanie).toLowerCase()] || null, m = meshes.Hat.material;
      m.userData.own ??= m.map;
      const map = hat ? hatTexture(m.userData.own, hat) : m.userData.own;
      if (m.map !== map) { m.map = map; m.needsUpdate = true; }
      m.metalness = hat?.metal || 0;
      m.roughness = hat?.rough || 0.8;
    }
    if (meshes.Face) meshes.Face.material.color.copy(meshes.Body.material.color);
    // An alien costume: the alien's body in place of his, and none of what he wears.
    const kind = COSTUMES[model.look?.mask]?.alien || COSTUMES[model.look?.outfit]?.alien, A = model.alien;
    const other = !!(kind && A);
    if (A) {
      A.body.visible = other;
      if (other) {
        A.skin.color.set(kind.color).multiplyScalar(kind.lit ? 2.2 : 1.35);   // (over the mottle baked onto it, which darkens it)
        A.skin.emissive.set(kind.lit ? 0x1a0a33 : 0x000000);
        A.eyes.color.set(kind.lit ? 0x000000 : kind.eyes);
        A.eyes.emissive.set(kind.lit ? kind.eyes : 0x000000);
        A.eyes.emissiveIntensity = kind.lit ? 1.6 : 0;
        A.feelers.visible = !!kind.antennae;
      }
    }
    if (other) { for (const name in meshes) meshes[name].visible = false; for (const o of model.worn || []) o.visible = false; model.neckwear.visible = false; }
    else for (const name of ['Body', 'Shirt', 'Pants', 'Shoes']) if (meshes[name]) meshes[name].visible = true;
    // A helmet costume: the whole suit in place of him (its cloth, its fittings and its visor in that costume's colours).
    const space = COSTUMES[model.look?.mask]?.helmet ? COSTUMES[model.look.mask] : COSTUMES[model.look?.outfit]?.helmet ? COSTUMES[model.look.outfit] : null, Su = model.suit;
    const suited = !!(space && Su && !other);
    if (Su) {
      Su.body.visible = suited;
      if (suited) {
        const gilt = model.look.outfit === 'gilded' || model.look.mask === 'gilded';
        Su.cloth.color.set(space.suit); Su.cloth.metalness = gilt ? 0.75 : 0; Su.cloth.roughness = gilt ? 0.35 : 0.8;
        Su.trim.color.set(space.pack ?? 0x77787e).multiplyScalar(1.25);
        Su.visor.color.set(space.helmet.visor); Su.visor.emissive.set(space.helmet.visor).multiplyScalar(0.25);
      }
    }
    if (suited) { for (const name in meshes) meshes[name].visible = false; for (const o of model.worn || []) o.visible = false; model.neckwear.visible = false; }
    model.maskHolder.visible = !other && !suited;   // (the head that used to stand in for it)
    model.packHolder.visible = !other && !suited;
    model.neckwear.visible = false;   // (the chain and the headphones the old figure wore round its neck: his are on his head now)
  };
  // What he is smoking, in a costume: it goes where that body's mouth is, and turns as that body's head turns (not
  // where his own mouth is, which is nowhere near an alien's, or a helmet's visor). at: where, from that head's bone,
  // across, up and forward, as the body stands. Gives { head, spot (in the bone's own space), unstood (the bone's turn
  // as it stands, undone) }.
  const mouthOn = (scene, theirs, at) => {
    let inverse = null;
    scene.traverse((o) => { const i = !inverse && o.isSkinnedMesh ? o.skeleton.bones.indexOf(theirs.head) : -1; if (i >= 0) inverse = o.skeleton.boneInverses[i]; });
    if (!inverse) return null;
    const spot = new THREE.Vector3(), axis = new THREE.Vector3();
    [[1, 0, 0], [0, 1, 0], [0, 0, 1]].forEach((way, i) => spot.addScaledVector(axis.set(...way).transformDirection(inverse), at[i]));
    return { head: theirs.head, spot, unstood: new THREE.Quaternion().setFromRotationMatrix(inverse) };
  };
  // ---- As an alien ----
  // Not his body in a mask: another body altogether (a bulb of a skull, a stalk of a neck, sticks for limbs, long
  // fingers, two great black eyes), in that alien's colours. His own is not drawn while he wears it.
  const addAlien = () => {
    const a = cloneSkinned(alienTemplate), aBones = {}, parts = {};
    a.traverse((o) => {
      if (o.isBone) aBones[o.name] = o;
      if (o.isSkinnedMesh) { parts[o.name.replace(/[^A-Za-z].*$/, '')] = o; o.castShadow = true; o.frustumCulled = false; }
    });
    if (!aBones.pelvis || !parts.Alien) return;
    const skin = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.05 });
    const eyes = new THREE.MeshStandardMaterial({ color: 0x050508, roughness: 0.06, metalness: 0.35 });
    parts.Alien.material = skin;
    if (parts.AlienEyes) parts.AlienEyes.material = eyes;
    // The Little Green Man's antennae: two stalks off the top of his skull, a bead on the end of each.
    const feelers = new THREE.Group(), top = aBones.head.getWorldPosition(new THREE.Vector3());
    for (const sd of [-1, 1]) {
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(sd * 0.05, 0.3, 0), new THREE.Vector3(sd * 0.08, 0.4, 0.02), new THREE.Vector3(sd * 0.13, 0.47, 0.06)]);
      const stalk = new THREE.Mesh(new THREE.TubeGeometry(curve, 10, 0.008, 6), skin), bead = new THREE.Mesh(new THREE.SphereGeometry(0.024, 12, 10), skin);
      bead.position.set(sd * 0.13, 0.47, 0.06);
      feelers.add(stalk, bead);
    }
    feelers.position.copy(top);
    a.add(feelers);
    a.updateMatrixWorld(true);
    aBones.head.attach(feelers);
    a.visible = false;
    const follow = shadow(a, aBones);
    root.add(a);
    model.alien = { body: a, bones: aBones, skin, eyes, feelers, follow, mouth: mouthOn(a, aBones, [0, -0.035, 0.098]) };   // (its mouth: under its eyes, on the front of its face)
    model.afterLook(model.masked);
  };
  if (alienTemplate) addAlien(); else wantAlien.push(addAlien);
  // ---- In a space suit ----
  const addSuit = () => {
    const a = cloneSkinned(suitTemplate), sBones = {}, parts = {};
    a.traverse((o) => {
      if (o.isBone) sBones[o.name] = o;
      if (o.isSkinnedMesh) { parts[o.name.replace(/[^A-Za-z].*$/, '')] = o; o.castShadow = true; o.frustumCulled = false; }
    });
    if (!sBones.pelvis || !parts.Suit) return;
    const cloth = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }), trim = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.3 });
    const visor = new THREE.MeshStandardMaterial({ color: 0x1a1206, roughness: 0.06, metalness: 0.7 });
    parts.Suit.material = cloth;
    if (parts.Trim) parts.Trim.material = trim;
    if (parts.Visor) parts.Visor.material = visor;
    a.visible = false;
    const follow = shadow(a, sBones);
    root.add(a);
    model.suit = { body: a, bones: sBones, cloth, trim, visor, follow, mouth: mouthOn(a, sBones, [0, 0.07, 0.165]) };   // (out through the bottom of its visor: he was never going to go without)
    model.afterLook(model.masked);
  };
  if (suitTemplate) addSuit(); else wantSuit.push(addSuit);
  model.body = body;
  model.bodyMeshes = meshes;
  if (model.look) model.applyLook(model.look);   // (so that what is in his mouth goes to where his mouth now is)
  else model.afterLook(false);
}
// ---- His hats ----
// The fedora, done over: each is the colour of its felt and of its band, and perhaps a pattern woven or printed into
// the felt (lines: pinstripes; check: houndstooth; spots: leopard). By the colour the shop sells it as (the slot is
// still called `beanie` in the save). The first, his own tan, is the hat as it was painted: nothing is done to it.
const HATS = {
  '#1d1d21': { felt: [0.105, 0.105, 0.12], band: [0.55, 0.09, 0.08] },
  '#2a2d3a': { felt: [0.13, 0.14, 0.19], band: [0.72, 0.72, 0.76], lines: [0.62, 0.65, 0.72] },
  '#e4dcc6': { felt: [0.9, 0.86, 0.76], band: [0.13, 0.11, 0.1] },
  '#8e1f1c': { felt: [0.52, 0.1, 0.09], band: [0.07, 0.07, 0.08] },
  '#2f5a3a': { felt: [0.16, 0.34, 0.21], band: [0.85, 0.68, 0.26] },
  '#55307a': { felt: [0.32, 0.17, 0.47], band: [0.85, 0.68, 0.26], rough: 1 },
  '#bdb8ac': { felt: [0.78, 0.76, 0.7], band: [0.09, 0.09, 0.1], check: [0.12, 0.12, 0.14] },
  '#d2a24c': { felt: [0.83, 0.62, 0.27], band: [0.07, 0.06, 0.06], spots: [0.15, 0.09, 0.04] },
  '#d9b24a': { felt: [0.95, 0.74, 0.26], band: [1, 0.93, 0.62], metal: 0.85, rough: 0.3 },
};
// Where his hat is on the picture that colours him (a share of its width and height: its band is the strip down the
// left of that, its crown and brim the rest), and how light the felt and the band were painted (what is kept of the
// painting is its light and shade, not its colour).
const HAT_AT = { x0: 0.75, x1: 1, y0: 0.615, y1: 1, band: 0.25, felt: 0.55, strap: 0.27 };
function hatTexture(own, hat) {
  hat.maps ||= new Map();
  if (hat.maps.has(own)) return hat.maps.get(own);
  const image = own.image, W = image.width, H = image.height, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.drawImage(image, 0, 0);
  const x0 = Math.floor(HAT_AT.x0 * W), y0 = Math.floor(HAT_AT.y0 * H), w = Math.ceil((HAT_AT.x1 - HAT_AT.x0) * W), h = Math.ceil((HAT_AT.y1 - HAT_AT.y0) * H);
  const data = g.getImageData(x0, y0, w, h), px = data.data, cell = Math.max(6, Math.round(w / 18));
  const rnd = (i, j, k) => { const n = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453; return n - Math.floor(n); };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, lum = (0.3 * px[i] + 0.59 * px[i + 1] + 0.11 * px[i + 2]) / 255;
    if (lum < 0.02) continue;   // (between the pieces of it: nothing is drawn from there)
    const strap = x < w * HAT_AT.band, shade = Math.min(1.7, lum / (strap ? HAT_AT.strap : HAT_AT.felt));
    let col = strap ? hat.band : hat.felt;
    if (!strap) {
      if (hat.lines && (x + y * 0.3) % (cell * 0.75) < 1.3) col = hat.lines;
      else if (hat.check) { const a = Math.floor(x / (cell * 0.5)), b = Math.floor(y / (cell * 0.5)); if ((a + b) % 2 === 0 && (a % 2 === 0 || (x + y) % cell < cell * 0.5)) col = hat.check; }
      else if (hat.spots) {
        const a = Math.floor(x / cell), b = Math.floor(y / cell);
        for (let da = -1; da <= 1; da++) for (let db = -1; db <= 1; db++) {
          const sx = (a + da + 0.2 + 0.6 * rnd(a + da, b + db, 1)) * cell, sy = (b + db + 0.2 + 0.6 * rnd(a + da, b + db, 2)) * cell, r = cell * (0.22 + 0.16 * rnd(a + da, b + db, 3));
          const d = Math.hypot(x - sx, (y - sy) * 1.2);
          if (d < r && d > r * 0.42 && rnd(a + da, b + db, 4) > 0.15) col = hat.spots;
        }
      }
    }
    // (painted colours are not light itself: 2.2 takes them to light, where the shade is laid on, and back)
    for (let k = 0; k < 3; k++) px[i + k] = Math.min(255, 255 * (col[k] * shade ** 2.2) ** (1 / 2.2));
  }
  g.putImageData(data, x0, y0);
  const map = new THREE.CanvasTexture(c);
  map.flipY = false; map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
  hat.maps.set(own, map);
  return map;
}

// ---- His T-shirts ----
// Each colour the shop sells is a shirt of its own: its cloth, and what is printed on its chest. (The slot is still
// called `hoodie` in the save: it is his top.) cloth: the colour it is dyed. print: which of PRINTS is on it, in which inks.
const TEES = {
  '#7a2f2b': { cloth: 0x18181b, print: 'kirky', inks: ['#efece2', '#8a8578', '#c8201b', '#e9e4d4'] },   // (what he starts in: black, a horned skull)
  '#7b2f2b': { cloth: 0x1b1b1f, print: 'flame', inks: ['#ffe45c', '#ff9a1f', '#e0281c', '#e9e4d4'] },
  '#1f2024': { cloth: 0x1f2024, print: 'skull', inks: ['#e9e4d4', '#8a8578', '#c8201b', '#e9e4d4'] },
  '#2f5a3a': { cloth: 0x2f5a3a, print: 'graves', inks: ['#e9e4d4', '#bfc8b0', '#18261b', '#e9e4d4'] },
  '#d6cfbd': { cloth: 0xd6cfbd, print: 'skull', inks: ['#1b1b1f', '#55524a', '#7a2f2b', '#1b1b1f'] },
  '#55307a': { cloth: 0x55307a, print: 'moon', inks: ['#f4e9a8', '#d0a6ff', '#2a1640', '#f4f0e4'] },
  '#1d2b55': { cloth: 0x1d2b55, print: 'moon', inks: ['#e9e4d4', '#7fc8ff', '#0e1630', '#e9e4d4'] },
  '#6fae1f': { cloth: 0x6fae1f, print: 'toxic', inks: ['#1b1b1f', '#e8ff5a', '#1b1b1f', '#1b1b1f'] },
  '#c9591c': { cloth: 0xc9591c, print: 'hazard', inks: ['#1b1b1f', '#ffd23a', '#1b1b1f', '#1b1b1f'] },
  '#c9487e': { cloth: 0xc9487e, print: 'flame', inks: ['#ffffff', '#ffd0e6', '#7a1848', '#ffffff'] },
  '#c9a23a': { cloth: 0xd9b24a, print: 'chip', inks: ['#7a1420', '#fff3b0', '#7a1420', '#7a1420'], metal: 0.75, rough: 0.35 },   // gold lamé: it shines
  '#6a0f2c': { cloth: 0x5a0c25, print: 'ace', inks: ['#ffd23a', '#f4f0e4', '#1b0810', '#ffd23a'], rough: 1 },                    // velvet: it does not
};
const prints = {};
function printMaterial(kind, inks) {
  const key = kind + inks.join('');
  if (prints[key]) return prints[key];
  const W = 768, H = 532, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d'), [a, b, d, small] = inks;
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const word = (text, y, px, fill, stroke = null, lean = 0) => {
    g.save(); g.translate(W / 2, y); g.transform(1, 0, lean, 1, 0, 0);
    g.font = `900 ${px}px Impact, "Arial Black", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.lineJoin = 'round';
    const k = Math.min(1, (W * 0.82) / g.measureText(text).width); g.scale(k, 1);
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = px * 0.1; g.strokeText(text, 0, 0); }
    g.fillStyle = fill; g.fillText(text, 0, 0); g.restore();
  };
  const line = (text, y, fill) => { g.font = '700 30px "Arial Black", Impact, sans-serif'; g.textAlign = 'center'; g.fillStyle = fill; g.fillText(text.split('').join(' '), W / 2, y); };
  const fade = (y0, y1) => { const f = g.createLinearGradient(0, y0, 0, y1); f.addColorStop(0, a); f.addColorStop(0.5, b); f.addColorStop(1, d); return f; };
  if (kind === 'kirky') {
    // His own: a horned skull, all teeth. Nothing written under it.
    const cx = W / 2;
    g.fillStyle = a;
    g.beginPath();
    g.moveTo(cx - 150, 152);
    g.bezierCurveTo(cx - 186, 96, cx - 204, 46, cx - 216, 12);        // up the outside of one horn to its tip
    g.bezierCurveTo(cx - 166, 44, cx - 132, 62, cx - 96, 64);         // and down the inside of it to his crown
    g.bezierCurveTo(cx - 50, 42, cx + 50, 42, cx + 96, 64);
    g.bezierCurveTo(cx + 132, 62, cx + 166, 44, cx + 216, 12);
    g.bezierCurveTo(cx + 204, 46, cx + 186, 96, cx + 150, 152);
    g.bezierCurveTo(cx + 190, 222, cx + 170, 296, cx + 124, 326);     // his cheekbone, and in under it
    g.lineTo(cx + 100, 380);
    for (let i = 3; i >= -3; i--) {                                    // his teeth: long and short by turns, to points
      const x = cx + i * 28, long = i % 2 ? 62 : 96;
      g.lineTo(x + 14, 384); g.lineTo(x + 9, 384 + long * 0.75); g.lineTo(x, 384 + long); g.lineTo(x - 9, 384 + long * 0.75); g.lineTo(x - 14, 384);
    }
    g.lineTo(cx - 100, 380); g.lineTo(cx - 124, 326);
    g.bezierCurveTo(cx - 170, 296, cx - 190, 222, cx - 150, 152);
    g.closePath(); g.fill();
    g.globalCompositeOperation = 'destination-out';
    for (const sd of [-1, 1]) {                                        // his eyes: slanted down to his nose, scowling
      g.beginPath(); g.moveTo(cx + sd * 20, 214);
      g.quadraticCurveTo(cx + sd * 74, 150, cx + sd * 138, 158);
      g.quadraticCurveTo(cx + sd * 136, 246, cx + sd * 64, 266);
      g.quadraticCurveTo(cx + sd * 24, 254, cx + sd * 20, 214); g.fill();
    }
    g.beginPath(); g.moveTo(cx, 264); g.quadraticCurveTo(cx - 36, 326, cx - 9, 330); g.lineTo(cx, 304); g.lineTo(cx + 9, 330); g.quadraticCurveTo(cx + 36, 326, cx, 264); g.fill();   // his nose
    for (let i = -3; i <= 4; i++) g.fillRect(cx + i * 28 - 16.5, 352, 5, 60);                                                                                                   // between his teeth
    g.fillRect(cx - 104, 346, 208, 7);
    g.globalCompositeOperation = 'source-over';
  } else if (kind === 'flame') {
    // DEADSLIDE, on fire: tongues licking up off the tops of the letters, taller towards the middle.
    g.fillStyle = fade(H * 0.2, H * 0.74);
    for (let i = 0; i < 26; i++) {
      const x = W * 0.12 + (i + 0.5 + (rnd() - 0.5) * 0.6) * (W * 0.76 / 26), base = H * 0.6 - 84, wide = 11 + rnd() * 12;
      const tall = (46 + rnd() * 62) * (1 - 0.45 * Math.abs((x - W / 2) / (W * 0.38))), lean = 14 + rnd() * 22;
      g.beginPath(); g.moveTo(x - wide, base + 12);
      g.bezierCurveTo(x - wide * 1.1, base - tall * 0.45, x + lean * 0.2, base - tall * 0.55, x + lean, base - tall);
      g.bezierCurveTo(x + lean * 0.5, base - tall * 0.5, x + wide * 1.3, base - tall * 0.35, x + wide, base + 12);
      g.closePath(); g.fill();
    }
    word('DEADSLIDE', H * 0.6, 122, fade(H * 0.35, H * 0.62), d, -0.2);
    line('SKATE OR DIE AGAIN', H * 0.6 + 52, small);
  } else if (kind === 'skull') {
    // A skull over two crossed boards.
    g.strokeStyle = b; g.lineWidth = 34; g.lineCap = 'round';
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(W / 2 - s * 250, H * 0.2); g.lineTo(W / 2 + s * 250, H * 0.72); g.stroke(); }
    g.fillStyle = a;
    g.beginPath(); g.ellipse(W / 2, H * 0.38, 120, 128, 0, 0, 7); g.fill();
    g.beginPath(); g.roundRect(W / 2 - 72, H * 0.5, 144, 96, 18); g.fill();
    g.globalCompositeOperation = 'destination-out';
    for (const s of [-1, 1]) { g.beginPath(); g.ellipse(W / 2 + s * 50, H * 0.4, 34, 40, s * 0.2, 0, 7); g.fill(); }
    g.beginPath(); g.moveTo(W / 2, H * 0.47); g.lineTo(W / 2 - 16, H * 0.56); g.lineTo(W / 2 + 16, H * 0.56); g.fill();
    for (let i = -2; i <= 2; i++) g.fillRect(W / 2 + i * 26 - 3, H * 0.6, 6, 60);
    g.globalCompositeOperation = 'source-over';
    word('DEADSLIDE', H * 0.93, 70, d === a ? b : d);
  } else if (kind === 'graves') {
    // The Cemetery: a row of headstones and a dead tree, under a moon.
    g.fillStyle = b; g.beginPath(); g.arc(W * 0.7, H * 0.26, 76, 0, 7); g.fill();
    g.fillStyle = a;
    for (const [x, w, h, round] of [[0.2, 70, 120, 1], [0.34, 56, 90, 0], [0.5, 80, 150, 1], [0.66, 50, 80, 1], [0.8, 64, 110, 0]]) {
      g.beginPath(); g.roundRect(W * x - w / 2, H * 0.72 - h, w, h, round ? [w / 2, w / 2, 0, 0] : 6); g.fill();
    }
    g.fillRect(W * 0.08, H * 0.72, W * 0.84, 10);
    g.strokeStyle = a; g.lineCap = 'round';
    const branch = (x, y, ang, len, w) => { if (len < 14) return; const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len; g.lineWidth = w; g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke(); branch(x2, y2, ang - 0.5 - rnd() * 0.3, len * 0.68, w * 0.65); branch(x2, y2, ang + 0.45 + rnd() * 0.3, len * 0.66, w * 0.65); };
    branch(W * 0.1, H * 0.72, -1.45, 110, 14);
    word('REST IN PIECES', H * 0.93, 64, small);
  } else if (kind === 'moon') {
    // Free Ride: a crescent, stars, and a skater's line across it.
    g.fillStyle = a; g.beginPath(); g.arc(W / 2, H * 0.4, 150, 0, 7); g.fill();
    g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(W / 2 + 64, H * 0.34, 132, 0, 7); g.fill(); g.globalCompositeOperation = 'source-over';
    g.fillStyle = b;
    for (let i = 0; i < 26; i++) { const x = rnd() * W, y = rnd() * H * 0.7, r = 2 + rnd() * 5; g.beginPath(); for (let k = 0; k < 8; k++) { const q = k * Math.PI / 4, rr = k % 2 ? r * 0.35 : r; g.lineTo(x + Math.cos(q) * rr, y + Math.sin(q) * rr); } g.fill(); }
    g.strokeStyle = b; g.lineWidth = 6; g.setLineDash([18, 12]); g.beginPath(); g.moveTo(W * 0.08, H * 0.66); g.quadraticCurveTo(W / 2, H * 0.1, W * 0.92, H * 0.6); g.stroke(); g.setLineDash([]);
    word('FREE RIDE', H * 0.9, 84, small, d);
  } else if (kind === 'toxic') {
    // Lettering that runs: slime dripping off the bottom of every letter.
    word('TOXIC', H * 0.5, 190, a, b);
    g.fillStyle = a;
    for (let i = 0; i < 16; i++) { const x = W * 0.16 + rnd() * W * 0.68, len = 30 + rnd() * 110, w = 8 + rnd() * 12; g.beginPath(); g.roundRect(x, H * 0.47, w, len, w / 2); g.fill(); g.beginPath(); g.arc(x + w / 2, H * 0.47 + len, w * 0.8, 0, 7); g.fill(); }
    line('DO NOT INHALE', H * 0.93, small);
  } else if (kind === 'hazard') {
    // A warning sign: black and yellow stripes round a skull-and-board triangle.
    g.save(); g.beginPath(); g.roundRect(W * 0.1, H * 0.12, W * 0.8, H * 0.6, 16); g.clip();
    g.fillStyle = b; g.fillRect(0, 0, W, H); g.fillStyle = a;
    for (let x = -H; x < W; x += 90) { g.beginPath(); g.moveTo(x, H * 0.72); g.lineTo(x + 45, H * 0.72); g.lineTo(x + 45 + H * 0.6, H * 0.12); g.lineTo(x + H * 0.6, H * 0.12); g.fill(); }
    g.restore();
    g.fillStyle = b; g.beginPath(); g.roundRect(W * 0.2, H * 0.24, W * 0.6, H * 0.36, 10); g.fill();
    word('DANGER', H * 0.52, 120, a);
    line('SKATER AT WORK', H * 0.9, small);
  } else if (kind === 'chip') {
    // The House's chip.
    g.fillStyle = a; g.beginPath(); g.arc(W / 2, H * 0.44, 200, 0, 7); g.fill();
    g.strokeStyle = b; g.lineWidth = 26; g.setLineDash([40, 34]); g.beginPath(); g.arc(W / 2, H * 0.44, 170, 0, 7); g.stroke(); g.setLineDash([]);
    g.lineWidth = 8; g.beginPath(); g.arc(W / 2, H * 0.44, 132, 0, 7); g.stroke();
    word('B.G.', H * 0.44 + 50, 140, b);
    line('THE HOUSE ALWAYS WINS', H * 0.97, small);
  } else if (kind === 'ace') {
    // The ace of spades.
    g.fillStyle = b; g.beginPath(); g.roundRect(W / 2 - 150, H * 0.04, 300, H * 0.84, 22); g.fill();
    g.fillStyle = d; g.beginPath(); g.moveTo(W / 2, H * 0.18);
    g.bezierCurveTo(W / 2 + 130, H * 0.36, W / 2 + 110, H * 0.62, W / 2 + 12, H * 0.54); g.lineTo(W / 2 + 34, H * 0.7); g.lineTo(W / 2 - 34, H * 0.7); g.lineTo(W / 2 - 12, H * 0.54);
    g.bezierCurveTo(W / 2 - 110, H * 0.62, W / 2 - 130, H * 0.36, W / 2, H * 0.18); g.fill();
    g.font = '900 64px Georgia, serif'; g.textAlign = 'center'; g.fillText('A', W / 2 - 112, H * 0.2); g.save(); g.translate(W / 2 + 112, H * 0.76); g.rotate(Math.PI); g.fillText('A', 0, 0); g.restore();
    line('HIGH ROLLER', H * 0.98, small);
  }
  // (worn: cracks through the print)
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 70; i++) { g.globalAlpha = 0.5; g.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 26, 1 + rnd() * 1.6); }
  const map = new THREE.CanvasTexture(c);
  map.flipY = false; map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
  return (prints[key] = new THREE.MeshStandardMaterial({ map, transparent: true, alphaTest: 0.3, roughness: 0.75, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
}
const logoMaterial = () => printMaterial('kirky', TEES['#7a2f2b'].inks);
const WHITE = new THREE.Color(0xfff4ea);   // (his skin as it is painted, a touch warmer)
const REAL_FACE = true;    // the body's own head (false: the old cartoon one, on top of it)
