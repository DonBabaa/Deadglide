// A monster stood somewhere that is not a fight (Babitus, dealing the cards and spinning the wheel in the players'
// casino): one mesh for each of its parts, moved by its motion capture as the horde moves its own (see mobAnims.js).
//
//   const him = standIn('boss3');
//   scene.add(him.group);                                   // his feet are at its origin; he faces +z
//   him.pose(clip, time, other, otherTime, w, loop, tweak)  // every frame: `clip` at `time` (round and round), mixed
//                                                           // `w` of the way to `other` at `otherTime` (once through,
//                                                           // or looped); tweak(P): the pose, to be changed before
//                                                           // he is put in it (see pose() in mobAnims.js for what is in it)
//   him.handAt(side, out), him.eyesAt(out)                  // where a hand (1: his left, -1: his right) and his eyes are, in the world
//   him.body, him.arm(side), him.hand(side)                 // the meshes of his trunk, an upper arm, and a forearm with its hand: to hang things on
import * as THREE from 'three';
import { ENEMY_PARTS } from './enemyModels.js';
import { ENEMY_TYPES } from './types.js';
import { withKnees } from './knees.js';
import { hasMobAnims, pose, place, describe } from './mobAnims.js';

export function standIn(name) {
  const T = ENEMY_TYPES[name], group = new THREE.Group();
  const flesh = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }), lit = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const list = withKnees(name, ENEMY_PARTS[name]()), parts = describe(name, list, T.height);
  parts.forEach((part, i) => {
    part.glow = !!list[i].glow;
    part.mesh = new THREE.Mesh(part.geometry, part.glow ? lit : flesh);
    part.mesh.matrixAutoUpdate = false;
    part.mesh.frustumCulled = false;   // (its box is where it was made, not where the clip has put it)
    part.mesh.matrix.makeTranslation(part.pivot.x, part.pivot.y, part.pivot.z);
    group.add(part.mesh);
  });
  // His eyes: the first lit part of him (the middle of it). His hands: on the end of whatever reaches furthest from
  // each shoulder (his forearm, if his arm has an elbow in it).
  const eyes = parts.find((part) => part.glow) || parts.find((part) => part.role === 'head') || parts[0], hands = {};
  eyes.geometry.computeBoundingBox();
  const middle = eyes.geometry.boundingBox.getCenter(new THREE.Vector3());
  for (const part of parts) {
    if (part.role !== 'forearm' && (part.role !== 'arm' || part.elbow)) continue;
    const at = part.geometry.attributes.position, tip = new THREE.Vector3();
    let reach = 0;
    for (let v = 0; v < at.count; v++) { const d = at.getX(v) ** 2 + at.getY(v) ** 2 + at.getZ(v) ** 2; if (d > reach) { reach = d; tip.set(at.getX(v), at.getY(v), at.getZ(v)); } }
    if (!hands[part.side] || hands[part.side].reach < reach) hands[part.side] = { part, reach, tip: tip.multiplyScalar(0.88) };
  }
  const put = (part, local) => { part.mesh.matrix.copy(local); part.mesh.matrixWorldNeedsUpdate = true; };
  return {
    group, parts, eyes: middle,
    body: parts.find((part) => part.role === 'core' && !part.glow).mesh,
    arm: (side) => parts.find((part) => part.role === 'arm' && part.side === side).mesh,
    hand: (side) => hands[side].part.mesh,
    tip: (side) => hands[side].tip,
    pose(a, ta, b = null, tb = 0, w = 0, loop = false, tweak = null) {
      if (!hasMobAnims()) return;
      const P = pose(a, ta, b, tb, w, loop);
      if (tweak) tweak(P);
      place(parts, P, parts.hipY, true, put);
      group.updateMatrixWorld(true);
    },
    handAt: (side, out) => out.copy(hands[side].tip).applyMatrix4(hands[side].part.mesh.matrixWorld),
    eyesAt: (out) => out.copy(middle).applyMatrix4(eyes.mesh.matrixWorld),
  };
}

// Babitus laughing (`ha`: how hard, 0..1), put on whatever pose `P` he was in (see pose() in mobAnims.js): thrown
// back, his arms up and out, shaking with it. (A tweak for standIn().pose.)
const turned = new THREE.Quaternion(), RIGHT = new THREE.Vector3(1, 0, 0), v = new THREE.Vector3();
export function laughing(P, ha, time) {
  const shake = Math.sin(time * 24);
  turned.setFromAxisAngle(RIGHT, -(0.34 + 0.04 * shake) * ha);
  P.hips.multiply(turned); P.chest.multiply(turned);
  for (const [upper, fore, side] of [[P.upperL, P.foreL, 1], [P.upperR, P.foreR, -1]]) {
    upper.lerp(v.set(side * 0.8, 0.38 + 0.06 * shake * side, 0.12).normalize(), ha).normalize();
    fore.lerp(v.set(side * (0.3 + 0.1 * shake), 0.92, 0.18).normalize(), ha).normalize();
  }
}

// His arms put where they are wanted (another tweak for a pose): `upper` and `fore` are which way his left upper arm
// and forearm are to point ([x, y, z]: his right arm is the mirror of it); `w` how far towards that they go from where
// the pose has them; `lean` how far back his trunk goes with it (radians, negative).
export function reaching(P, w, upper, fore, lean = 0) {
  if (lean) { turned.setFromAxisAngle(RIGHT, lean * w); P.hips.multiply(turned); P.chest.multiply(turned); }
  for (const [u, f, side] of [[P.upperL, P.foreL, 1], [P.upperR, P.foreR, -1]]) {
    u.lerp(v.set(side * upper[0], upper[1], upper[2]).normalize(), w).normalize();
    f.lerp(v.set(side * fore[0], fore[1], fore[2]).normalize(), w).normalize();
  }
}

// How he stands, apart from his arms: for laying one clip's stance under another's hands (Babitus at his table,
// stood breathing as a man does while his hands keep hold of the deck as his dealing clip has them).
//   const S = stance();                    somewhere to keep one
//   standing(S, clip, time, other, w)      fill it from `clip` at `time` (round and round), mixed `w` of the way to `other`
//   stood(P, S, w)                         a tweak for a pose: his hips, chest, head and legs go `w` of the way to it
const QUATS = ['hips', 'chest', 'head'], LEGS = ['thighL', 'thighR', 'calfL', 'calfR'];
export const stance = () => ({ hips: new THREE.Quaternion(), chest: new THREE.Quaternion(), head: new THREE.Quaternion(), thighL: new THREE.Vector3(), thighR: new THREE.Vector3(), calfL: new THREE.Vector3(), calfR: new THREE.Vector3(), drop: 0, ready: false });
export function standing(S, clip, time, other = null, w = 0) {
  if (!hasMobAnims()) return S;
  const P = pose(clip, time, other, time, w, true);
  for (const k of QUATS) S[k].copy(P[k]);
  for (const k of LEGS) S[k].copy(P[k]);
  S.drop = P.drop;
  S.ready = true;
  return S;
}
export function stood(P, S, w) {
  if (!S.ready || w <= 0) return;
  for (const k of QUATS) P[k].slerp(S[k], w);
  for (const k of LEGS) P[k].lerp(S[k], w).normalize();
  P.drop += (S.drop - P.drop) * w;
}
