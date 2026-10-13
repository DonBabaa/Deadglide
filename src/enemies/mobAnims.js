// Motion capture for the monsters (public/models/mob_anims.json: see tools/build_mob_anims.py).
//
// A monster is a handful of rigid parts, not a skinned body, so a clip here is only what those parts need: how his
// hips, chest and head are turned, which way each arm, thigh and shin points, and how far his hips have dropped.
// loadMobAnims() is awaited once (main.js); pose() gives the clip at a time, blended with another if asked; place()
// turns that into where each part of one monster goes.
import * as THREE from 'three';
import { legLine } from './knees.js';

let clips = null, fps = 30;
export async function loadMobAnims() {
  try { const data = await (await fetch(`${import.meta.env.BASE_URL}models/mob_anims.json`)).json(); clips = data.clips; fps = data.fps || 30; } catch (error) { console.warn('Monsters: no motion capture to load, so they move as they did.', error); }
}
export const hasMobAnims = () => !!clips;
export const clipLength = (name) => (clips && clips[name] ? clips[name].frames / fps : 1);
export const SLAM_LANDS = 1.6;   // (how far into Babitus's slam, in seconds, he comes down)

// Which clips each kind of monster moves by. walk: its gait (speed: how fast it is played). attack: when it is on
// you (a boss: a swipe). roar, act: when it bellows; when it throws (or deals). turnL, turnR: stepping round to face
// you, when you get round it. die: a boss going down. leap, jump: Babitus leaping into his run at you, and his slam
// at the end of it. arms: false = its arms stay as it was made (it is holding something) except while it acts.
// pace: the speed (m/s) its walk clip is run at, so that its legs keep time with how fast it is going (in place of
// `speed`). alt: another gait some of its kind have instead (a limp). climb, fall: going up the face of something
// after you, and dropping off an edge (see Horde.scale). run: a boss's, for his run at you. idle: what it does
// stood still (a boss, between moves). rise: getting up, as it comes out of the ground (it is played through as it
// comes up). start: up out of a crouch into its run, once it is out.
export const MOCAP = {
  shambler: { walk: 'sprint', pace: 6.2, alt: 'injured', rise: 'zstand', start: 'crouchsprint', attack: 'zattack', climb: 'wallclimb', fall: 'walldrop' },
  rattler: { walk: 'sprint', pace: 7.6, attack: 'zattack', climb: 'wallclimb', fall: 'walldrop' },
  thrower: { walk: 'zwalk', speed: 0.9, act: 'throw', climb: 'wallclimb', fall: 'walldrop' },
  // (Hamzitus and Rubistus: the bodies they came with (tools/build_zombies.py), and a move of his own each, the one
  // that came with him. Hamzitus: `hamz`, both fists going, round and round: what he does when he has got to you.
  // Rubistus: `rubi`, up into the air and right over: how he lets a volley of bones go. Both get up off the ground
  // to arrive, as the zombies do.)
  boss: { walk: 'mwalk', speed: 0.7, rise: 'zstand', roar: 'mroar', act: 'throw', attack: 'hamz', turnL: 'mturnl', turnR: 'mturnr', die: 'mdie' },
  boss2: { walk: 'mwalk', speed: 0.85, rise: 'zstand', roar: 'zscream', act: 'rubi', attack: 'mswipe', turnL: 'mturnl', turnR: 'mturnr', die: 'zdeath' },
  // (Babitus moves as the zombies do: their sprint, their attack, their scream, their death. What only he does is
  // still his own: he deals, he leaps into his run, he slams.)
  boss3: { walk: 'sprint', pace: 7.4, idle: 'zidle', stop: 'runstop', start: 'crouchsprint', act: 'cards', roar: 'zscream', attack: 'zattack', leap: 'mjump', jump: 'mslam', turnL: 'mturnl', turnR: 'mturnr', die: 'zdeath' },
};
for (const more of ['b', 'c', 'd']) MOCAP[`boss3${more}`] = MOCAP.boss3;
MOCAP.zombieb = MOCAP.zombiec = MOCAP.shambler;   // (the other zombies: see ZOMBIES in types.js. start: up out of a crouch into its run, as it comes out of the ground)
// The spiders (spider: true: eight legs, placed by placeSpider below, from a tarantula's clips). rear: up on its back
// legs, front ones in the air (when it is nearly on you; the queen, about to spit). idle: when it is not going
// anywhere. die: over on its back, legs drawn in (what is left of one for a moment after it is killed).
MOCAP.crawler = MOCAP.queen = { spider: true, walk: 'swalk', attack: 'sbite', rear: 'srear', idle: 'sidle', die: 'sdie' };

// (upperL/R, foreL/R: the two halves of an arm, for a monster with elbows. A clip made before there were any has
// only the whole arm, armL/R, and both halves take that.)
const QUATS = ['hips', 'chest', 'head'], DIRS = ['armL', 'armR', 'thighL', 'thighR', 'calfL', 'calfR', 'upperL', 'upperR', 'foreL', 'foreR'], WHOLE = { upperL: 'armL', foreL: 'armL', upperR: 'armR', foreR: 'armR' };
const blank = () => ({ hips: new THREE.Quaternion(), chest: new THREE.Quaternion(), head: new THREE.Quaternion(), ...Object.fromEntries(DIRS.map((k) => [k, new THREE.Vector3()])), drop: 0 });
const A = blank(), B = blank(), qa = new THREE.Quaternion(), va = new THREE.Vector3();

function sample(name, time, loop, out) {
  const c = clips[name], n = c.frames;
  let f = time * fps;
  f = loop ? ((f % n) + n) % n : Math.max(0, Math.min(n - 1.001, f));
  const i = Math.floor(f), j = loop ? (i + 1) % n : Math.min(n - 1, i + 1), k = f - i;
  for (const key of QUATS) out[key].fromArray(c[key][i]).slerp(qa.fromArray(c[key][j]), k);
  for (const key of DIRS) { const from = c[key] || c[WHOLE[key]]; out[key].fromArray(from[i]).lerp(va.fromArray(from[j]), k).normalize(); }
  out.drop = c.drop[i] + (c.drop[j] - c.drop[i]) * k;
  return out;
}
// The pose of clip `a` at `ta` (looped), mixed `w` (0..1) of the way to clip `b` at `tb` (played once through, or looped).
export function pose(a, ta, b = null, tb = 0, w = 0, loopB = false) {
  sample(a, ta, true, A);
  if (b && w > 0.001 && clips[b]) {
    sample(b, tb, loopB, B);
    for (const key of QUATS) A[key].slerp(B[key], w);
    for (const key of DIRS) A[key].lerp(B[key], w).normalize();
    A.drop += (B.drop - A.drop) * w;
  }
  return A;
}

const C = new THREE.Matrix4(), L = new THREE.Matrix4(), T = new THREE.Matrix4(), core = new THREE.Quaternion(), turn = new THREE.Quaternion(), P = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3();
// Put the parts of one monster where pose `p` has them. parts: as horde.js builds them (role, pivot, side, aim, rel,
// parent, local); set(part, matrix): called for each with where it goes, in the monster's own space. hipY: how high
// its hips are. arms: false = leave its arms as they were made, moving with its body.
export function place(parts, p, hipY, arms, set) {
  core.copy(p.hips).slerp(p.chest, 0.5);
  C.makeTranslation(0, hipY * (1 + p.drop * 0.85), 0).multiply(T.makeRotationFromQuaternion(core)).multiply(L.makeTranslation(0, -hipY, 0));
  for (const part of parts) {
    if (part.role === 'core' || part.role === 'tail') { set(part, C); continue; }
    if (part.role === 'forearm') {   // (on the end of its upper arm, and pointing from its elbow to its wrist)
      const arm = parts[part.parent];
      P.copy(part.rel).applyMatrix4(arm.local);
      if (arms) turn.setFromUnitVectors(part.aim, part.side > 0 ? p.foreL : p.foreR); else turn.setFromRotationMatrix(arm.local);
      set(part, L.compose(P, turn, one));
      continue;
    }
    if (part.role === 'shin') {
      const leg = parts[part.parent];
      P.copy(part.rel).applyMatrix4(leg.local);
      turn.setFromUnitVectors(part.aim, part.side > 0 ? p.calfL : p.calfR);
      set(part, L.compose(P, turn, one));
      continue;
    }
    P.copy(part.pivot).applyMatrix4(C);
    if (part.role === 'head') turn.copy(p.head);
    else if (part.role === 'arm') { if (arms) turn.setFromUnitVectors(part.aim, part.elbow ? (part.side > 0 ? p.upperL : p.upperR) : part.side > 0 ? p.armL : p.armR); else turn.copy(core); }
    else turn.setFromUnitVectors(part.aim, part.side > 0 ? p.thighL : p.thighR);
    L.compose(P, turn, one);
    if (part.role === 'leg' || part.role === 'arm') part.local.copy(L);
    set(part, L);
  }
}

// Which way a part points, as it was made: from its hinge to its far end (an arm: the vertex furthest from the
// shoulder; a leg or a shin: the middle of it). geometry: its points, measured from its hinge.
export function aimOf(geometry, role) {
  const pos = geometry.attributes.position, out = new THREE.Vector3();
  if (role === 'arm' || role === 'forearm') {
    let far = 0;
    for (let i = 0; i < pos.count; i++) { const d = pos.getX(i) ** 2 + pos.getY(i) ** 2 + pos.getZ(i) ** 2; if (d > far) { far = d; out.set(pos.getX(i), pos.getY(i), pos.getZ(i)); } }
  } else {
    for (let i = 0; i < pos.count; i++) { up.set(pos.getX(i), pos.getY(i), pos.getZ(i)); if (up.y < 0) out.add(up); }
    if (out.lengthSq() < 1e-9) out.set(0, -1, 0);
  }
  return out.normalize();
}

// ---- The rat ----
// Its clips are another rat's run and its standing still (tools/build_mob_anims.py): how its body and its head have
// turned, how far its hips have lifted, which way its tail runs and, for each of its four legs (F: fore, B: hind; L: its
// left), which way its upper half (leg..) and its lower half (paw..) point. Its own body is stiff parts: a body, a
// tail, four legs each cut at the knee (knees.js): placeQuad() turns each to match.
MOCAP.rat = { quad: true, walk: 'ratrun', idle: 'ratidle' };
const QUAD_V = ['tail', 'legFL', 'legFR', 'legBL', 'legBR', 'pawFL', 'pawFR', 'pawBL', 'pawBR'];
const four = () => ({ body: new THREE.Quaternion(), head: new THREE.Quaternion(), lift: 0, ...Object.fromEntries(QUAD_V.map((k) => [k, new THREE.Vector3()])) });
const QA = four(), QB = four();
function sampleQuad(name, time, out) {
  const c = clips[name], n = c.frames, f = (((time * fps) % n) + n) % n, i = Math.floor(f), j = (i + 1) % n, k = f - i;
  out.body.fromArray(c.body[i]).slerp(qa.fromArray(c.body[j]), k);
  out.head.fromArray(c.head[i]).slerp(qa.fromArray(c.head[j]), k);
  for (const key of QUAD_V) out[key].fromArray(c[key][i]).lerp(va.fromArray(c[key][j]), k).normalize();
  out.lift = c.lift[i] + (c.lift[j] - c.lift[i]) * k;
  return out;
}
// Its pose `time` seconds into clip `a` (round and round), mixed `w` (0..1) of the way to clip `b` at the same moment.
export function poseQuad(a, time, b = null, w = 0) {
  sampleQuad(a, time, QA);
  if (b && w > 0.001 && clips[b]) {
    sampleQuad(b, time, QB);
    QA.body.slerp(QB.body, w); QA.head.slerp(QB.head, w);
    for (const key of QUAD_V) QA[key].lerp(QB[key], w).normalize();
    QA.lift += (QB.lift - QA.lift) * w;
  }
  return QA;
}
// Put its parts where pose `p` has them. set(part, matrix): as place().
export function placeQuad(parts, p, set) {
  const hipY = (parts.quadHip ??= (parts.find((o) => o.role === 'leg') || { pivot: { y: 0.2 } }).pivot.y);
  C.makeTranslation(0, hipY * (1 + p.lift * 0.7), 0).multiply(T.makeRotationFromQuaternion(p.body)).multiply(L.makeTranslation(0, -hipY, 0));
  for (const part of parts) {
    if (part.role === 'shin') {   // (a leg's lower half: on the end of the upper, and pointing down to its paw)
      const leg = parts[part.parent];
      P.copy(part.rel).applyMatrix4(leg.local);
      set(part, L.compose(P, turn.setFromUnitVectors(part.aim, p['paw' + leg.quad]), one));
      continue;
    }
    if (part.role === 'leg') {
      part.quad ??= (part.pivot.z > 0 ? 'F' : 'B') + (part.side > 0 ? 'L' : 'R');
      P.copy(part.pivot).applyMatrix4(C);
      L.compose(P, turn.setFromUnitVectors(part.aim, p['leg' + part.quad]), one);
      part.local.copy(L);
      set(part, L);
      continue;
    }
    if (part.role === 'tail') {
      part.runs ??= aimOf(part.geometry || part.mesh.geometry, 'arm');   // (which way it runs as it was made: to its tip)
      P.copy(part.pivot).applyMatrix4(C);
      set(part, L.compose(P, turn.setFromUnitVectors(part.runs, p.tail), one));
      continue;
    }
    set(part, C);   // (its body, and its eyes in it)
  }
}

// ---- Spiders ----
// A spider's clip is where its body is and where each of its eight feet is (see tools/build_mob_anims.py). Its legs
// here are two stiff halves each (hip to the top of the arch, and down from there to the foot: knees.js), so each is
// bent to stand its foot on the spot the clip gives: hip, the top of the arch, foot.
const eight = () => ({ body: new THREE.Quaternion(), lift: new THREE.Vector3(), feet: Array.from({ length: 8 }, () => new THREE.Vector3()) });
const SA = eight(), SB = eight();
function sampleSpider(name, time, loop, out) {
  const c = clips[name], n = c.frames;
  let f = time * fps;
  f = loop ? ((f % n) + n) % n : Math.max(0, Math.min(n - 1.001, f));
  const i = Math.floor(f), j = loop ? (i + 1) % n : Math.min(n - 1, i + 1), k = f - i;
  out.body.fromArray(c.body[i]).slerp(qa.fromArray(c.body[j]), k);
  out.lift.fromArray(c.lift[i]).lerp(va.fromArray(c.lift[j]), k);
  for (let s = 0; s < 8; s++) out.feet[s].fromArray(c.feet[i][s]).lerp(va.fromArray(c.feet[j][s]), k);
  return out;
}
// As pose(), for a spider: clip `a` at `ta` (looped), mixed `w` of the way to clip `b` at `tb`.
export function poseSpider(a, ta, b = null, tb = 0, w = 0, loopB = false) {
  sampleSpider(a, ta, true, SA);
  if (b && w > 0.001 && clips[b]) {
    sampleSpider(b, tb, loopB, SB);
    SA.body.slerp(SB.body, w);
    SA.lift.lerp(SB.lift, w);
    for (let s = 0; s < 8; s++) SA.feet[s].lerp(SB.feet[s], w);
  }
  return SA;
}
// Its legs, front pair first and the right one of each pair first (as the clips have their feet), with what bending
// them needs: how long each half is, which way each points as it was made, and where its foot stands.
function spiderLegs(parts) {
  const geometryOf = (part) => part.geometry || part.mesh.geometry;
  const legs = parts.map((part, index) => ({ part, index })).filter((o) => o.part.role === 'leg')
    .sort((a, b) => (Math.abs(b.part.pivot.z - a.part.pivot.z) > 0.01 ? b.part.pivot.z - a.part.pivot.z : a.part.side - b.part.side))
    .map(({ part, index }) => {
      const shin = parts.find((o) => o.role === 'shin' && o.parent === index) || null, at = geometryOf(shin || part).attributes.position, foot = new THREE.Vector3();
      let low = Infinity;
      for (let i = 0; i < at.count; i++) if (at.getY(i) < low) { low = at.getY(i); foot.set(at.getX(i), low, at.getZ(i)); }   // (its foot: the lowest point of it)
      const knee = shin ? shin.rel.clone() : new THREE.Vector3();
      return { part, shin, upper: knee.length(), lower: foot.length(), aimUpper: (shin ? knee : foot).clone().normalize(), aimLower: foot.clone().normalize(), stands: part.pivot.clone().add(knee).add(foot) };
    });
  const n = Math.max(1, legs.length);
  return { legs, span: legs.reduce((sum, l) => sum + Math.hypot(l.stands.x, l.stands.z), 0) / n || 1, hipY: legs.reduce((sum, l) => sum + l.part.pivot.y, 0) / n };
}
export const spiderOf = (parts) => (parts.spider ||= spiderLegs(parts));
// How many seconds of its walk a spider gets through in a second, going at `speed` (m/s) at `scale`: fast enough that
// its feet are not left behind, but never a blur (above that they slide, as they always have: it is a quick thing).
export const STEP = 1.5;   // (its steps are longer than the tarantula's, leg for leg)
export function spiderRate(parts, name, speed, scale) {
  const c = clips && clips[name];
  if (!c) return 1;
  return Math.max(0.9, Math.min(2.3, (speed * (c.frames / fps)) / ((c.stride || 0.5) * STEP * spiderOf(parts).span * scale)));
}
const H = new THREE.Vector3(), F = new THREE.Vector3(), K = new THREE.Vector3(), reachTo = new THREE.Vector3(), pole = new THREE.Vector3(), over = new THREE.Vector3(), was = new THREE.Vector3(), now = new THREE.Vector3();
// Put the parts of one spider where pose `p` (from poseSpider) has them. set(part, matrix): as for place().
export function placeSpider(parts, p, set) {
  const S = spiderOf(parts);
  C.makeTranslation(p.lift.x * S.span, S.hipY + p.lift.y * S.span, p.lift.z * S.span).multiply(T.makeRotationFromQuaternion(p.body)).multiply(L.makeTranslation(0, -S.hipY, 0));
  over.set(0, 1, 0).applyQuaternion(p.body);   // (which way its back faces: its knees are that side of its legs)
  for (const part of parts) if (part.role !== 'leg' && part.role !== 'shin') set(part, L.makeTranslation(part.pivot.x, part.pivot.y, part.pivot.z).premultiply(C));
  S.legs.forEach((leg, j) => {
    H.copy(leg.part.pivot).applyMatrix4(C);
    const f = p.feet[j] || P.set(0, 0, 0);
    F.set(leg.stands.x + f.x * S.span, Math.max(0, leg.stands.y + f.y * S.span), leg.stands.z + f.z * S.span * STEP);
    reachTo.copy(F).sub(H);
    let far = reachTo.length();
    reachTo.normalize();
    if (!leg.shin) {   // (a leg in one piece: it points at its foot)
      turn.setFromUnitVectors(was.copy(leg.aimUpper).applyQuaternion(p.body), reachTo).multiply(p.body);
      set(leg.part, L.compose(H, turn, one));
      return;
    }
    far = Math.max(Math.abs(leg.upper - leg.lower) + 0.02, Math.min((leg.upper + leg.lower) * 0.995, far));
    const along = (leg.upper * leg.upper - leg.lower * leg.lower + far * far) / (2 * far), out = Math.sqrt(Math.max(0, leg.upper * leg.upper - along * along));
    pole.copy(over).addScaledVector(reachTo, -over.dot(reachTo));
    if (pole.lengthSq() < 1e-6) pole.set(leg.part.side || 1, 0, 0).applyQuaternion(p.body);
    K.copy(H).addScaledVector(reachTo, along).addScaledVector(pole.normalize(), out);
    turn.setFromUnitVectors(was.copy(leg.aimUpper).applyQuaternion(p.body), now.copy(K).sub(H).normalize()).multiply(p.body);
    set(leg.part, L.compose(H, turn, one));
    F.copy(H).addScaledVector(reachTo, far);
    turn.setFromUnitVectors(was.copy(leg.aimLower).applyQuaternion(p.body), now.copy(F).sub(K).normalize()).multiply(p.body);
    set(leg.shin, L.compose(K, turn, one));
  });
}

// A monster's parts (as enemyModels.js / knees.js give them: geometry, pivot, role, parent) as place() wants them.
// height: how tall its kind is. (horde.js makes its own, the same way, with its instanced meshes on them.)
export function describe(name, list, height) {
  const parts = list.map((p) => {
    const [px, py, pz] = p.pivot, mid = Math.abs(px) < 0.02;
    const role = p.role ? p.role : Math.hypot(px, py, pz) < 0.01 ? 'core' : mid ? (py > height * 0.72 ? 'head' : 'tail') : py > (legLine(name) ?? height * 0.6) ? 'arm' : 'leg';
    return { geometry: p.geometry, pivot: new THREE.Vector3(px, py, pz), role, elbow: !!p.elbow, held: !!p.held, side: Math.sign(px) || (p.parent !== undefined ? Math.sign(list[p.parent].pivot[0]) : 0), parent: p.parent, local: new THREE.Matrix4(), aim: aimOf(p.geometry, role),
      rel: p.parent !== undefined ? new THREE.Vector3(px, py, pz).sub(new THREE.Vector3(...list[p.parent].pivot)) : null };
  });
  for (const part of parts) if (part.role === 'arm') { const first = parts.find((o) => o.role === 'arm' && o.pivot.equals(part.pivot)); if (first !== part) part.aim = first.aim; }
  for (const part of parts) if (part.held) { const fore = parts.find((o) => o.role === 'forearm' && o.parent === part.parent && !o.held); if (fore) part.aim = fore.aim; }   // (what is in his hand points as his forearm does)
  parts.hipY = (parts.find((o) => o.role === 'leg') || { pivot: { y: height * 0.5 } }).pivot.y;
  return parts;
}
