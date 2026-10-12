// Kirky's body: a real character (public/models/kirky.glb: a MakeHuman body in a T-shirt, baggy trousers and skate shoes, on a game
// skeleton; see tools/build_kirky.py), in place of the one skaterModel.js builds out of shapes.
//
// Nothing about how he moves has changed. skaterModel.js still poses its own jointed figure, everywhere he appears
// (riding, aiming, the casino, the menu, emotes, cutscenes); that figure is simply no longer drawn. Every frame this
// reads where its joints have got to and turns the skeleton's bones to match: thigh to thigh, forearm to forearm.
// What he carries and wears on top (the gun, the board, the beanie, what is in his mouth, a costume's head, a pack)
// still hangs off the old figure, which is kept the same size as the new one so that it all lands in the right place.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

const FILE = `${import.meta.env.BASE_URL}models/kirky.glb`;
let template = null, failed = false;
const waiting = [];
new GLTFLoader().load(FILE, (gltf) => {
  template = gltf.scene;
  template.updateMatrixWorld(true);
  for (const go of waiting.splice(0)) go();
}, undefined, (error) => { failed = true; console.warn('Kirky: no body to load, so he stays as he was.', error); });

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
  if (meshes.Shirt) meshes.Shirt.material = meshes.Shirt.material.clone();
  if (meshes.Body) meshes.Body.material = meshes.Body.material.clone();
  for (const mesh of Object.values(meshes)) { mesh.material.roughness = Math.max(mesh.material.roughness, 0.8); mesh.material.metalness = 0; }
  for (const name of ['Shirt', 'Pants', 'Shoes']) if (meshes[name]) meshes[name].material.side = THREE.DoubleSide;   // (cloth has an inside: a sleeve, a cuff, the top of a shoe)
  if (meshes.Logo) { meshes.Logo.material = logoMaterial(); meshes.Logo.castShadow = false; }
  if (meshes.Brows) { meshes.Brows.material.transparent = true; meshes.Brows.material.alphaTest = 0.3; meshes.Brows.castShadow = false; }
  for (const name of ['Hair', 'HairTop']) if (meshes[name]) { meshes[name].material.transparent = false; meshes[name].material.depthWrite = true; meshes[name].material.alphaTest = 0.4; meshes[name].material.side = THREE.DoubleSide; }

  // ---- The old figure, made the size of the new one ----
  const place = (bone) => bone.getWorldPosition(new THREE.Vector3());   // (before he is put anywhere: in the body's own space)
  const hip = place(bones.thigh_l).y, K = hip / 0.86;                   // (0.86: how high the old figure's hips are)
  model.rider.scale.setScalar(K);
  model.legLength = 0.865 * K;
  model.head.scale.setScalar(HEAD_FIT / K);

  // His beanie sits down on his skull, what he smokes is in his mouth, and a pack sits on his back (all three were
  // placed for the old figure).
  model.beanieDome.position.y -= 0.04;
  model.brim.position.y -= 0.04;
  model.mouthAt = [0.004, 0.8 - 0.126, 0.122];
  model.packHolder.position.set(0, 0.3, -0.125);

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
  (function walk(bone, parent) { order.push({ bone, parent, rest: bone.quaternion.clone(), world: new THREE.Quaternion() }); for (const c of bone.children) if (c.isBone) walk(c, order.find((o) => o.bone === bone)); })(top, null);

  // ---- Put him in ----
  const root = model.root, sync = new THREE.Object3D();
  root.add(body);
  { const at = root.children.indexOf(model.gunArm); root.add(sync); root.children.splice(root.children.indexOf(sync), 1); root.children.splice(at, 0, sync); }   // (it runs after the figure is posed, and before the gun arm is hung on its shoulder)
  const jointQ = (joint) => (joint === model.gunArm ? q.copy(joint.quaternion) : joint === model.foreArm ? q.copy(model.gunArm.quaternion).multiply(joint.quaternion) : (joint.matrixWorld.decompose(v, q, s3), q.premultiply(rootQ)));
  sync.updateMatrixWorld = () => {
    if (!body.visible) return;
    root.matrixWorld.decompose(v, rootQ, s3);
    rootQ.invert();   // (everything below is worked out in his own space, not the world's)
    for (const o of order) {
      const d = driven.get(o.bone);
      if (d) {
        o.world.copy(jointQ(d.joint)).multiply(d.turn);
        // (his neck takes half of a turn of his head, his skull the rest: all of it at the collar wrings his neck out of his shirt)
        if (o.bone === bones.neck_01 && o.parent) o.world.slerp(q.copy(o.parent.world).multiply(o.rest), 0.55);
      }
      else if (o.parent) o.world.copy(o.parent.world).multiply(o.rest);
      else o.world.copy(above).multiply(o.rest);
      o.bone.quaternion.copy(o.world);
      if (o.parent) o.bone.quaternion.premultiply(q.copy(o.parent.world).invert());
    }
    bones.pelvis.parent.updateWorldMatrix(true, false);
    bones.pelvis.position.copy(bones.pelvis.parent.worldToLocal(model.torso.getWorldPosition(v)));   // his hips are where the figure's are
    body.updateMatrixWorld(true);
    // What he wears on his head goes where his head now is.
    bones.head.getWorldPosition(v).addScaledVector(w.set(0, 1, 0).applyQuaternion(bones.head.getWorldQuaternion(q)), SKULL);
    model.head.position.copy(model.torso.worldToLocal(v));
    model.head.position.y -= (0.11 * HEAD_FIT) / K;
    model.head.updateMatrixWorld(true);
  };
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
    model.neckwear.visible = false;
  };
  // Dressing him (see applyLook): the hoodie takes its colour, a costume its skin, and his hair shows when nothing is over it.
  model.afterLook = (masked) => {
    model.hideFigure();
    // (the colour the shop sells as his hoodie's is his T-shirt's now; the one he starts with is black)
    if (meshes.Shirt && model.shownHoodie) meshes.Shirt.material.color.set(String(model.shownHoodie).toLowerCase() === '#7a2f2b' ? BLACK_TEE : model.shownHoodie);
    if (meshes.Body) meshes.Body.material.color.copy(model.mats.skin.color.getHex() !== 0xc99873 ? model.mats.skin.color : WHITE);
    for (const name of ['Face', 'Brows', 'Eyes', 'Teeth']) if (meshes[name]) meshes[name].visible = REAL_FACE && !masked;
    if (meshes.Hair) meshes.Hair.visible = REAL_FACE && !masked;                                   // what hangs below his beanie
    if (meshes.HairTop) meshes.HairTop.visible = REAL_FACE && !masked && !model.beanieDome.visible;   // what is under it
    if (meshes.Face) meshes.Face.material.color.copy(meshes.Body.material.color);
  };
  model.body = body;
  model.bodyMeshes = meshes;
  if (model.look) model.applyLook(model.look);   // (so that what is in his mouth goes to where his mouth now is)
  else model.afterLook(false);
}
const BLACK_TEE = 0x1b1b1f;
// The print on his chest: DEADSLIDE, in flames. Drawn here, on a patch that lies over his shirt (see tools/build_kirky.py).
let logo = null;
function logoMaterial() {
  if (logo) return logo;
  const W = 768, H = 532, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const fire = g.createLinearGradient(0, H * 0.22, 0, H * 0.74);
  fire.addColorStop(0, '#ffe45c'); fire.addColorStop(0.45, '#ff9a1f'); fire.addColorStop(1, '#e0281c');
  g.translate(W / 2, H * 0.6);
  g.transform(1, 0, -0.2, 1, 0, 0);        // (leaning into it)
  g.font = '900 122px Impact, "Arial Black", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  const word = 'DEADSLIDE', wide = Math.min(g.measureText(word).width, W * 0.8), squeeze = wide / g.measureText(word).width;
  g.scale(squeeze, 1);
  // The flames: tongues licking up off the tops of the letters, taller towards the middle, each bent by the wind.
  const half = wide / squeeze / 2;
  g.fillStyle = fire;
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 26; i++) {
    const x = -half + (i + 0.5 + (rnd() - 0.5) * 0.6) * (2 * half / 26), base = -84, wideT = 11 + rnd() * 12;
    const tall = (46 + rnd() * 62) * (1 - 0.45 * Math.abs(x / half)), lean = 14 + rnd() * 22;
    g.beginPath();
    g.moveTo(x - wideT, base + 12);
    g.bezierCurveTo(x - wideT * 1.1, base - tall * 0.45, x + lean * 0.2, base - tall * 0.55, x + lean, base - tall);
    g.bezierCurveTo(x + lean * 0.5, base - tall * 0.5, x + wideT * 1.3, base - tall * 0.35, x + wideT, base + 12);
    g.closePath();
    g.fill();
  }
  g.lineJoin = 'round';
  g.strokeStyle = '#7a0f0a'; g.lineWidth = 12; g.strokeText(word, 0, 0);
  g.fillStyle = fire; g.fillText(word, 0, 0);
  g.strokeStyle = '#fff3b0'; g.lineWidth = 1.5; g.strokeText(word, 0, 0);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.font = '700 30px "Arial Black", Impact, sans-serif'; g.textAlign = 'center';
  g.fillStyle = '#e9e4d4';
  g.fillText('S K A T E   O R   D I E   A G A I N', W / 2, H * 0.6 + 52);
  // (worn: a few cracks through the print)
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 60; i++) { g.globalAlpha = 0.5; g.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 26, 1 + rnd() * 1.6); }
  const map = new THREE.CanvasTexture(c);
  map.flipY = false; map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
  logo = new THREE.MeshStandardMaterial({ map, transparent: true, alphaTest: 0.3, roughness: 0.75, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  return logo;
}
const WHITE = new THREE.Color(0xe6c49e);   // (the body's skin, warmed to the colour of his face)
const REAL_FACE = true;    // the body's own head (false: the old cartoon one, on top of it)
