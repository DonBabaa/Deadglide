// The scares: things that happen because of what you do, not on a clock. None of them knock the camera about (the
// game's rule: fluidity first); it is the light, the sound and what is suddenly there that does it.
//
//   the lamp      walking the Spine or the Lab alone in a quiet moment, your lamp stutters and dies; when it comes
//                 back, one of them is standing right in front of you, looking at you. Then it screams.
//   the vent      the first time you pass under the vent in the Spine's ceiling, from round 3: something bangs and
//                 scrabbles along inside it over your head... and drops out behind you.
//   the breath    reloading, with nothing in sight: a breath, right behind your ear. Nothing there.
//   the doorstep  coming out of the lounge while a round is on: sometimes one is waiting just outside the airlock.
//   the blackout  the last of a round dies: every light in the station goes out, and somewhere far off, a scream.
//
// The ones that put a zombie somewhere are the host's to do (the host runs the dead); the rest are everyone's own.
//
//   const scares = createScares({ station, dead, walker, sound, kit });
//   scares.update(dt, { me, round, host, quiet, reloading })   each frame; its `dim` (0..1) is how dark the station has gone
//   scares.doorstep(at, facing) / scares.blackout()             from index.js, when those happen
import * as THREE from 'three';
import { CELL, HEIGHT, ceilAt, BUNKS, RISE, blanketTexture, CRANK, crankWheel } from './station.js';

export const SCARES = {
  lampGap: 45,        // seconds at least between two of the lamp
  lampChance: 1 / 8,  // ...and the chance a second, when it could
  breathChance: 0.5,  // a reload, with nothing about
  breathGap: 30,
  doorstep: 0.6,      // the chance one is waiting outside the lounge
  first: 24,          // the director: seconds into a round before it makes something happen...
  every: [32, 55],    // ...and between one thing and the next (it picks whatever fits where you are)
};
// The vent in the Spine's ceiling (cell 7, 2).
const VENT = new THREE.Vector3(7 * CELL, HEIGHT - 0.04, 2 * CELL);
// Pipes that let go (steam): [x, z, dx, dz] where, and which way it blows into the room.
const STEAM = [[22, 2.44, 0, 1], [34, 2.44, 0, 1], [38.4, 9.6, 1, 0], [34, 30.6, 0, 1], [54, 6.4, 0, 1], [45.6, 22, -1, 0]];
// Where one can hang from a cable in the ceiling, and drop: [x, z, yaw]. The Reactor's.
const HANGS = [[34, 34.5, 1.2], [40.5, 36.5, -0.6], [36.5, 39.5, 2.4]];
// Sleepers: bodies on the floor that are not as dead as they look. [x, z, yaw, id] (the id the same everywhere: dead.js).
const SLEEPERS = [[8.6 * CELL, 5.6 * CELL, 2.2, -101], [15.4 * CELL, 4.4 * CELL, -0.8, -102], [13.2 * CELL, 2.3 * CELL, 1.4, -103], [10.6 * CELL, 9.2 * CELL, 0.4, -104]];

export function createScares({ station, dead, walker, sound, pieces, scene }) {
  let lampWait = 40, breathWait = 20, vent = 'ready', ventT = 0, lampT = -1, stander = null, black = 0, wasReloading = false, scareWait = SCARES.first, flick = 0;
  // Steam: the spots, each with its own time; the puffs (sprites) of whichever is going.
  const steam = STEAM.map(([x, z, dx, dz]) => ({ p: new THREE.Vector3(x, 1.1, z), dir: new THREE.Vector3(dx, 0, dz), due: 12 + Math.random() * 20, going: 0 }));
  const puffTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const r = g.createRadialGradient(32, 32, 2, 32, 32, 30); r.addColorStop(0, 'rgba(230,232,236,0.55)'); r.addColorStop(0.5, 'rgba(210,214,220,0.22)'); r.addColorStop(1, 'rgba(200,204,210,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const puffs = Array.from({ length: 48 }, () => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, transparent: true, opacity: 0, depthWrite: false })); s.visible = false; s.userData = { life: 0, v: new THREE.Vector3() }; scene.add(s); return s; });
  let nextPuff = 0, hangCables = [], ankleWait = 0, knockT = 0;
  // ---- The cheap ones, by place (each once a run): something passes the deck's windows; a hand over the parapet, and
  // the one it belongs to coming down into the Med Bay; steps on the deck over your head; a body under a blanket in
  // the quarters that moves, and then gets up; one sitting at the top of the stairs with its back to you; blood dripping
  // off the parapet's edge onto the Med Bay's plates.
  let placeDone = {}, passer = null, passT = 0, leaner = null, leanT = 0, sitter = null, sitterT = 0, bunkT = -1, lump = null, bunkBody = null;
  // ...and four more: a footlocker in the quarters whose lid flies open as you pass (and slams shut when you look away);
  // the dish's crank wheel turning by itself while you are alone in the Med Bay; a body gone from where it lay when you
  // come back to the room (the blood still there); one of Jun's recorders playing by itself in another room.
  const CHEST = { x: 14.6 * CELL - CELL / 2, z: 11.05 * CELL - CELL / 2 }, NETTED = new Set(['chest', 'wheel', 'bunk', 'gone']);
  let lid = null, lidT = -1, wheelT = -1, gone = null, rec = null, bunkT_done = false;
  {
    lid = new THREE.Mesh(new THREE.BoxGeometry(1.46, 0.06, 0.74), new THREE.MeshStandardMaterial({ color: 0x4a4d52, metalness: 0.6, roughness: 0.5 }));
    lid.geometry.translate(0, 0.03, -0.37);   // (hinged along its far edge)
    lid.position.set(CHEST.x, 0.74, CHEST.z + 0.37); lid.castShadow = true;
    scene.add(lid);
  }
  const FACE = 1.56, DECK_Z = 3 * CELL, PARAPET_Z = 4 * CELL - FACE, WINDOW_Z = DECK_Z - FACE - 1.3;   // (the deck is the Med Bay's north side; its windows face north)
  {
    const B = BUNKS[1];
    // (a body under the blanket: the blanket's own cloth, humped over it, a head's bump at the pillow end)
    // (the blanket: a sheet of cloth draped over the shape of a body (one of the crew, dead.corpse, lies under it: reset()),
    // humped over the chest and the legs, hanging down over the slab's edges, the pillow end turned down)
    const geo = new THREE.PlaneGeometry(1.9, 1.3, 30, 18);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const along = x < -0.55 ? Math.max(0, 1 - (-0.55 - x) / 0.3) : x > 0.5 ? 0.75 : 1;   // (the chest full, the legs thinner, nothing past the pillow)
      const across = Math.max(0, 1 - (z / 0.34) ** 2);
      const hump = 0.27 * along * across * (x > 0.5 ? 0.8 : 1);
      const sag = Math.abs(z) > 0.48 ? Math.min(0.3, (Math.abs(z) - 0.48) * 1.4) : 0;
      pos.setY(i, 0.03 + hump - sag + (Math.sin(x * 9) * Math.cos(z * 7)) * 0.012);
    }
    geo.computeVertexNormals();
    lump = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: blanketTexture(), roughness: 0.95, side: THREE.DoubleSide }));
    lump.position.set(B[0] + 0.05, 0.6, B[1]); lump.castShadow = lump.receiveShadow = true;
    scene.add(lump);
  }
  const dropTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d'); const r = g.createRadialGradient(16, 16, 1, 16, 16, 14); r.addColorStop(0, 'rgba(120,6,8,1)'); r.addColorStop(0.6, 'rgba(90,4,6,0.9)'); r.addColorStop(1, 'rgba(60,0,2,0)'); g.fillStyle = r; g.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(c); })();
  const drips = Array.from({ length: 3 }, (_, i) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dropTex, transparent: true, depthWrite: false })); s.scale.setScalar(0.06); s.visible = false; s.userData = { wait: 0.6 + i * 0.9, vy: 0 }; scene.add(s); return s; });
  const placeFire = {
    chest(me) {
      if (lidT >= 0) return false;
      lidT = 0;
      sound.bang?.(1, new THREE.Vector3(CHEST.x, 0.7, CHEST.z));
      api.events.push({ kind: 'chest', p: new THREE.Vector3(CHEST.x, 0.4, CHEST.z) });
      return true;
    },
    wheel(me) {
      if (wheelT >= 0 || !crankWheel()) return false;
      wheelT = 0;
      api.events.push({ kind: 'wheel' });
      return true;
    },
    gone(me, host, forced = false) {
      if (gone || !host) return false;
      const eye = walker.camera.position;
      const z = dead.list.find((z) => z.keep && z.state === 'dead' && z.hp <= 0 && z.id < 0 && z.id > -100 && !sleepers.includes(z) && (forced || (z.pos.distanceTo(me.pos) > 11 && !station.see(eye, z.pos.clone().setY(0.5)))));
      if (!z) return false;
      z.keep = false; z.t = 99;   // (it sinks away, unseen)
      gone = { p: z.pos.clone(), seen: false };
      return true;
    },
    recorder(me, host, forced = false) {
      if (rec || !api.logs) return false;
      const l = api.logs.placed.find((l) => !l.taken && (forced || (Math.hypot(l.pos.x - me.pos.x, l.pos.z - me.pos.z) > 7 && Math.hypot(l.pos.x - me.pos.x, l.pos.z - me.pos.z) < 16)));
      if (!l) return false;
      rec = { l, t: 0 }; l.loud = true;
      sound.logFar?.(l.day, l.pos.clone().setY(0.3));
      api.events.push({ kind: 'recorder', p: l.pos.clone() });
      return true;
    },
    window(me, host) {
      if (!host || passer) return false;
      const x0 = me.pos.x + 5.5, x1 = me.pos.x - 5.5;
      const z = dead.spawn('walker', x0, WINDOW_Z, -Math.PI / 2, 'walk', 50);
      z.state = 'skit'; z.t = 0; z.y = RISE; z.watch = false; z.passer = true;
      z.skit = { to: new THREE.Vector3(x1, 0, WINDOW_Z), speed: 1.9, y: RISE, noCollide: true, t: 0 };
      passer = z; passT = 0;
      sound.moan?.('groan', z.pos.clone().setY(RISE + 1.4), { level: 0.5, wet: 0.7 });
      api.events.push({ kind: 'window', z });
      return true;
    },
    parapet(me, host) {
      if (!host || leaner) return false;
      const x = Math.max(15 * CELL - 1.2, Math.min(17 * CELL + 1.2, me.pos.x));
      const z = dead.spawn('runner', x, PARAPET_Z - 0.45, 0, 'walk', dead.hpNow || 300);   // (up on the parapet's ledge, leaning over)
      z.state = 'skit'; z.t = 0; z.y = RISE + 0.6; z.watch = false;
      z.skit = { clip: 'zattack', rate: 1.3, freeze: 0.8, face: me.pos, y: RISE + 0.6, t: 0 };
      leaner = z; leanT = 0; api.spawned++;
      sound.moan?.('groan', z.pos.clone().setY(RISE + 1.5), { level: 1.1 });
      api.events.push({ kind: 'parapet', z });
      return true;
    },
    overhead(me) {
      sound.overhead?.(new THREE.Vector3(me.pos.x, HEIGHT + 0.6, me.pos.z));   // (on the roof)
      api.events.push({ kind: 'overhead' });
      return true;
    },
    bunk(me) {
      if (bunkT >= 0) return false;
      bunkT = 0;
      sound.moan?.('groan', lump.position.clone().setY(0.8), { level: 0.9, rate: 0.85 });
      api.events.push({ kind: 'bunk', p: lump.position.clone() });
      return true;
    },
    sitter(me, host) {
      if (!host || sitter) return false;
      const z = dead.spawn('walker', 16 * CELL, 4 * CELL - FACE + 0.55, Math.PI, 'walk', dead.hpNow || 300);   // (stood at the Med Bay's north wall, its back to the room)
      z.state = 'stand'; z.standFor = 1e9; z.watch = false; z.t = 0; z.y = 0; z.sitter = true;
      sitter = z; sitterT = 0; api.spawned++;
      return true;
    },
  };
  const burst = (sp) => {
    sp.going = 0.9; sp.due = 25 + Math.random() * 30;
    sound.steam?.(sp.p);
    api.events.push({ kind: 'steam', p: sp.p.clone(), dir: sp.dir.clone() });
  };
  // The vent itself: the kit's, upside down in the ceiling.
  if (pieces?.Prop_Vent_Big) {
    const v = pieces.Prop_Vent_Big.clone(true);
    v.position.copy(VENT);
    v.rotation.x = Math.PI;
    v.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
    scene.add(v);
  }
  const quietAround = (p, far) => !dead.list.some((z) => z.hp > 0 && z.state !== 'feed' && z.state !== 'dead' && z.pos.distanceTo(p) < far);
  let sleepers = [];
  const api = {
    dim: 1,   // the station's lights (1: as they are; 0: out)
    spawned: 0,   // how many the scares have put in the station since index.js last looked (they count toward the round)
    fired: {},      // what has happened, how many times (the tests, and the editor)
    events: [],     // what just happened, for index.js's cut-ins: { kind, z }
    wants: null,    // 'watcher': the director wants one put in an opening (index.js does that: it knows the openings)
    // The editor: one of the place scares, now, wherever you are (window, parapet, overhead, bunk, sitter).
    force(id, me) { placeDone[id] = false; if (id === 'sitter') sitter = null; if (id === 'window') passer = null; if (id === 'parapet') leaner = null; if (id === 'bunk') { bunkT = -1; bunkT_done = false; } if (id === 'chest') { lidT = -1; lid.rotation.x = 0; } if (id === 'wheel') wheelT = -1; if (id === 'gone') gone = null; if (id === 'recorder') { if (rec) rec.l.loud = false; rec = null; } const ok = placeFire[id]?.(me, true, true) || false; if (ok && NETTED.has(id)) api.events.push({ kind: 'net', id, x: id === 'gone' && gone ? gone.p.x : 0, z: id === 'gone' && gone ? gone.p.z : 0 }); return ok; },
    logs: null,   // (index.js hands the logs in, for the recorder)
    // A place scare another player set off (net 'scare'): the same thing happens here, and its cut-in if you are near it.
    mirror(id, m = {}, me = null) {
      const near = (x, z, r) => !!me && Math.hypot(me.pos.x - x, me.pos.z - z) < r;
      if (id === 'chest' && lidT < 0) { lidT = 0; placeDone.chest = true; sound.bang?.(1, new THREE.Vector3(CHEST.x, 0.7, CHEST.z)); if (near(CHEST.x, CHEST.z, 9)) api.events.push({ kind: 'chest', p: new THREE.Vector3(CHEST.x, 0.4, CHEST.z) }); }
      else if (id === 'wheel' && wheelT < 0) { wheelT = 0; placeDone.wheel = true; if (near(CRANK.x, CRANK.z, 9)) api.events.push({ kind: 'wheel' }); }
      else if (id === 'bunk' && bunkT < 0) { bunkT = 0; placeDone.bunk = true; sound.moan?.('groan', lump.position.clone().setY(0.8), { level: 0.9, rate: 0.85 }); if (near(BUNKS[1][0], BUNKS[1][1], 9)) api.events.push({ kind: 'bunk', p: lump.position.clone() }); }
      else if (id === 'gone' && !gone && Number.isFinite(+m.x)) { const z = dead.list.find((z) => z.keep && z.state === 'dead' && Math.hypot(z.pos.x - +m.x, z.pos.z - +m.z) < 1.5); if (z) { z.keep = false; z.t = 99; gone = { p: z.pos.clone(), seen: false }; placeDone.gone = true; } }
    },
    get gone() { return gone; },
    get chest() { return { t: lidT, open: lid.rotation.x < -0.5 }; },
    get wheel() { return wheelT; },
    get bunk() { return { t: +bunkT.toFixed(2), blanket: [+lump.position.x.toFixed(2), +lump.position.y.toFixed(2), +lump.position.z.toFixed(2), +lump.rotation.x.toFixed(2)], body: bunkBody ? bunkBody.state : null }; },
    gaps: { lamp: 1, breath: 1 },   // (tonight's modifier: the lamp and the breath come sooner, or not)
    reset(extraSleepers = []) {
      lampWait = 20; breathWait = 12; vent = 'ready'; lampT = -1; stander = null; black = 0; walker.power = 1; api.dim = 1; scareWait = SCARES.first; flick = 0; api.fired = {}; api.wants = null;
      for (const sp of steam) { sp.due = 12 + Math.random() * 20; sp.going = 0; } for (const h of hangCables) h.cable.removeFromParent(); hangCables.length = 0; ankleWait = 8; knockT = 0;
      for (const d of station.doors) { d.knocked = false; d.jolt = 0; }
      sleepers = [...SLEEPERS, ...extraSleepers].map(([x, z, yaw, id]) => dead.corpse(x, z, yaw, id));   // (lying there, from the start, on every browser alike)
      placeDone = {}; passer = null; leaner = null; sitter = null; bunkT = -1; for (const s of drips) s.visible = false;
      if (lump) { lump.visible = true; lump.position.set(BUNKS[1][0] + 0.05, 0.6, BUNKS[1][1]); lump.rotation.set(0, 0, 0); lump.scale.set(1, 1, 1); }
      // (the one under it: on the slab, feet to the door, until the night it gets up)
      bunkBody = dead.corpse(BUNKS[1][0] - 0.05, BUNKS[1][1], Math.PI / 2, -150); bunkBody.y = 0.6; bunkBody.headless = false;
      lidT = -1; if (lid) lid.rotation.x = 0; wheelT = -1; gone = null; if (rec) rec.l.loud = false; rec = null; bunkT_done = false;
    },

    // One hangs from a cable in the Reactor's ceiling (the host's, from round 2): it drops as you pass under.
    hangOne() {
      if (!station.isOpenZone('r') || dead.list.some((z) => z.state === 'hang')) return null;
      const [x, z, yaw] = HANGS[Math.floor(Math.random() * HANGS.length)];
      const h = dead.spawn('runner', x, z, yaw, 'walk', dead.hpNow || 300);
      const top = ceilAt({ x, z });
      h.state = 'hang'; h.y = top - 2.05; h.vy = 0; h.t = 0;
      const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.3, 6), new THREE.MeshStandardMaterial({ color: 0x2a2b2e, roughness: 0.8 }));
      cable.position.set(x, top - 0.65, z); scene.add(cable);
      hangCables.push({ z: h, cable });
      api.spawned++;
      return h;
    },
    // (the editor and the tests: each, now)
    steamNow(p) { const sp = steam.slice().sort((a, b) => a.p.distanceTo(p) - b.p.distanceTo(p))[0]; if (sp) burst(sp); return !!sp; },
    knockNow(p) { const d = station.doors.slice().sort((a, b) => a.at.distanceTo(p) - b.at.distanceTo(p))[0]; if (!d || d.open) return false; d.knocked = true; d.jolt = 1.6; for (let i = 0; i < 3; i++) setTimeout(() => sound.bang?.(0.9, d.at.clone().setY(1.4)), i * 380); api.events.push({ kind: 'knock', door: d }); return true; },
    ankleNow(p) { const c = dead.list.filter((z) => z.keep && z.state === 'dead').sort((a, b) => a.pos.distanceTo(p) - b.pos.distanceTo(p))[0]; if (!c) return false; c.ankled = true; ankleWait = 20; api.events.push({ kind: 'ankle', z: c }); return true; },
    // The sleepers' round: every body on the floor gets up at once, and the lights go with them for a moment.
    riseAll() {
      let n = 0;
      for (const z of dead.list) {
        if (!z.keep) continue;
        z.keep = false; z.hp = dead.hpNow || 200; z.sink = 0; z.state = 'rise'; z.t = -0.3 * n; z.headless = false;
        z.kind = 'runner'; z.K = dead.kindOf('runner'); z.speed = z.K.speed;
        api.spawned++; n++;
      }
      if (n) { black = 2.0; sound.sting(1.2); api.events.push({ kind: 'riseAll', n }); }
      return n;
    },
    update(dt, { me, round, host, reloading, playing }) {
      lampWait -= dt; breathWait -= dt;
      // ---- steam ---- (a pipe lets go as you pass it; the director can make one go; the puffs of whichever is going)
      for (const sp of steam) {
        sp.due -= dt * (api.steamRate || 1);
        if (sp.due <= 0 && playing && !me.safe && sp.p.distanceTo(me.pos) < 3.4) burst(sp);
        if (sp.going > 0) {
          sp.going -= dt;
          if (Math.random() < dt * 30) { const s = puffs[nextPuff++ % puffs.length]; s.position.copy(sp.p).add(new THREE.Vector3((Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3)); s.userData.life = 1; s.userData.v.copy(sp.dir).multiplyScalar(2.2 + Math.random() * 1.6).add(new THREE.Vector3((Math.random() - 0.5) * 0.8, 0.4 + Math.random() * 0.6, (Math.random() - 0.5) * 0.8)); s.visible = true; }
          if (host && sp.going < 0.05 && Math.random() < 0.3) { const at = sp.p.clone().addScaledVector(sp.dir, 1.6); const z = dead.spawn('runner', at.x, at.z, Math.atan2(me.pos.x - at.x, me.pos.z - at.z), 'walk', dead.hpNow || 300); z.state = 'scream'; z.t = 0; api.spawned++; }   // (and sometimes something is in it)
        }
      }
      for (const s of puffs) { const u = s.userData; if (u.life <= 0) continue; u.life -= dt / 1.3; u.v.multiplyScalar(1 - 1.8 * dt); s.position.addScaledVector(u.v, dt); s.scale.setScalar(0.5 + (1 - u.life) * 2.2); s.material.opacity = Math.max(0, u.life) * 0.8; s.visible = u.life > 0; }
      // ---- the hanging one ---- (lets go as you pass under it)
      for (let i = hangCables.length - 1; i >= 0; i--) {
        const h = hangCables[i];
        if (h.z.hp <= 0 || h.z.state === 'dead') { h.cable.removeFromParent(); hangCables.splice(i, 1); continue; }
        // (and it does not keep a round open: the last one left, or long enough up there, it lets go on its own)
        h.t = (h.t || 0) + dt;
        const lastOne = dead.alive - dead.list.filter((z) => z.state === 'feed' && z.hp > 0).length <= 1;
        if (h.z.state === 'hang' && ((Math.hypot(h.z.pos.x - me.pos.x, h.z.pos.z - me.pos.z) < 2.3 && !me.safe) || lastOne || h.t > 70)) {
          h.z.state = 'drop'; h.z.t = 0; h.z.vy = -1;
          sound.cable?.(h.z.pos.clone().setY(ceilAt(h.z.pos) - 0.5)); api.events.push({ kind: 'hanging', z: h.z });
          h.cable.removeFromParent(); hangCables.splice(i, 1);
        }
      }
      // ---- the knock ---- (stand by a shut door a while: something on the other side wants through)
      if (playing && !me.safe) {
        const d = station.doors.find((d) => !d.open && !d.knocked && d.at.distanceTo(me.pos) < 2.4);
        if (d) { knockT += dt; if (knockT > 2.2 && Math.random() < dt * 0.5) { d.knocked = true; d.jolt = 1.6; knockT = 0; for (let i = 0; i < 3; i++) setTimeout(() => sound.bang?.(0.9, d.at.clone().setY(1.4)), i * 380); api.events.push({ kind: 'knock', door: d }); } }
        else knockT = Math.max(0, knockT - dt);
      }
      // ---- the ankle ---- (a body you step over takes hold of your foot)
      ankleWait -= dt;
      if (playing && !me.safe && !me.downed && ankleWait <= 0) {
        const c = dead.list.find((z) => z.keep && !z.ankled && z.state === 'dead' && Math.hypot(z.pos.x - me.pos.x, z.pos.z - me.pos.z) < 1.0);
        if (c) { c.ankled = true; if (Math.random() < 0.4) { ankleWait = 20; api.events.push({ kind: 'ankle', z: c }); } }
      }
      // ---- the cheap ones, by place ----
      {
        const zone = station.zoneAt(me.pos), live = playing && !me.safe && !me.downed;
        // (chest, wheel, bunk and the missing body happen for everyone: whoever sets one off tells the others: 'net' events)
        const once = (id, when) => { if (live && !placeDone[id] && when()) { if (placeFire[id](me, host)) { placeDone[id] = true; api.fired[id] = (api.fired[id] || 0) + 1; if (NETTED.has(id)) api.events.push({ kind: 'net', id, x: id === 'gone' && gone ? gone.p.x : 0, z: id === 'gone' && gone ? gone.p.z : 0 }); } } };
        // (the deck's two, the window and the parapet, went with it; the steps are on the roof now)
        once('overhead', () => zone === 'm' && round >= 1 && me.pos.z < 5 * CELL + 1);
        once('bunk', () => zone === 'q' && Math.hypot(me.pos.x - BUNKS[1][0], me.pos.z - BUNKS[1][1]) < 2.0);
        once('sitter', () => zone === 'm' && round >= 1);
        once('chest', () => zone === 'q' && Math.hypot(me.pos.x - CHEST.x, me.pos.z - CHEST.z) < 2.3);
        once('wheel', () => zone === 'm' && round >= 1 && Math.hypot(me.pos.x - CRANK.x, me.pos.z - CRANK.z) < 5.5 && quietAround(me.pos, 7) && Math.random() < dt * 0.25);
        once('gone', () => round >= 2 && zone !== 'b' && Math.random() < dt * 0.06);
        once('recorder', () => round >= 1 && quietAround(me.pos, 8) && Math.random() < dt * 0.08);
        // (the lid: up in a snap; and shut again, hard, once you are off and not looking)
        if (lidT >= 0) {
          lidT += dt;
          lid.rotation.x = -Math.min(1.75, lidT * 9);
          const away = new THREE.Vector3(CHEST.x - me.pos.x, 0, CHEST.z - me.pos.z), d = away.length();
          if (lidT > 3 && d > 4.5 && away.normalize().dot(new THREE.Vector3(Math.sin(walker.yaw), 0, Math.cos(walker.yaw))) < 0.2) { lid.rotation.x = 0; lidT = -2; sound.slam?.(new THREE.Vector3(CHEST.x, 0.7, CHEST.z)); }
        }
        // (the wheel: a turn and a half on its own, clanking)
        if (wheelT >= 0 && wheelT < 1.8) { const w = crankWheel(); wheelT += dt; if (w) w.rotateZ(dt * 7); if (Math.floor(wheelT * 4) !== Math.floor((wheelT - dt) * 4)) sound.clatter?.('mag', new THREE.Vector3(CRANK.x, 1, CRANK.z), 0.6); if (wheelT >= 1.8) wheelT = 99; }
        // (the body: back in sight of where it lay, and it is not there)
        if (gone && !gone.seen && live && Math.hypot(gone.p.x - me.pos.x, gone.p.z - me.pos.z) < 7 && station.see(walker.camera.position, gone.p.clone().setY(0.4))) { gone.seen = true; api.events.push({ kind: 'gone', p: gone.p.clone() }); setTimeout(() => sound.moan?.('groan', me.pos.clone().add(new THREE.Vector3(-Math.sin(walker.yaw) * 4, 1.4, -Math.cos(walker.yaw) * 4)), { level: 0.9 }), 1600); }
        // (the recorder: it plays until you are on it, or long enough)
        if (rec) { rec.t += dt; if (rec.t > 9 || rec.l.taken || Math.hypot(rec.l.pos.x - me.pos.x, rec.l.pos.z - me.pos.z) < 2.2) { rec.l.loud = false; rec = null; } }
        // (the passer: along outside the glass, and gone)
        if (passer) { passT += dt; if (passer.hp <= 0 || passer.skit?.there || passT > 7) { if (passer.hp > 0) { passer.hp = 0; passer.state = 'dead'; passer.t = 99; passer.sink = 2; passer.keep = false; } passer = null; } }
        // (the leaner: a moment over the parapet, then over it and down)
        if (leaner) { leanT += dt; if (leaner.hp <= 0 || leaner.state !== 'skit') leaner = null; else if (leanT > 1.3) { leaner.skit = null; leaner.pos.z = PARAPET_Z + 0.6; leaner.state = 'drop'; leaner.t = 0; leaner.y = RISE + 0.2; leaner.vy = -0.5; sound.cable?.(leaner.pos.clone().setY(RISE + 1)); leaner = null; } }
        // (the sitter: its back to the stairs until you are near; then it turns, and comes)
        if (sitter && (sitter.hp <= 0 || sitter.state !== 'stand')) sitter = null;
        if (sitter) {
          sitterT += dt;
          const near = live && Math.hypot(sitter.pos.x - me.pos.x, sitter.pos.z - me.pos.z) < 3.6 && zone === 'm';
          // (and it does not keep a round open: the last one standing, or long enough, it comes down on its own)
          if (near || dead.alive <= 1 || sitterT > 75) { sitter.state = 'scream'; sitter.t = 0; sitter.standFor = 0; if (near) { api.events.push({ kind: 'sitter', z: sitter }); api.fired.sitterUp = 1; } sitter = null; }
        }
        // (the bunk: the blanket moves; then what is under it gets up at the foot of the bed)
        if (bunkT >= 0) {
          bunkT += dt;
          if (bunkT < 1.4) { lump.position.x = BUNKS[1][0] + 0.05 + Math.sin(bunkT * 38) * 0.03; lump.scale.y = 1 + Math.abs(Math.sin(bunkT * 19)) * 0.35; }   // (it moves under the cloth)
          else if (bunkT < 2.6) { lump.scale.y = 1; }
          else if (bunkT < 3.2) {   // (the blanket thrown off: over the edge and onto the floor, in a heap)
            const k = (bunkT - 2.6) / 0.6, e = k * k;
            lump.position.set(BUNKS[1][0] + 0.05 - 1.3 * k, 0.6 - 0.55 * e, BUNKS[1][1] - 1.2 * k); lump.rotation.x = 0.9 * Math.sin(k * Math.PI); lump.rotation.z = -0.5 * Math.sin(k * Math.PI); lump.scale.set(1, 1 - 0.6 * e, 1 - 0.25 * e);   // (off to the side, clear of what gets up)   // (the bunks stand against the south wall: the room is to the north, -z)
            if (bunkBody && bunkBody.state === 'dead') { bunkBody.keep = false; bunkBody.sink = 2; bunkBody = null; }
          }
          else if (!bunkT_done) { bunkT_done = true; if (host) { const z = dead.spawn('walker', BUNKS[1][0] + 0.1, BUNKS[1][1] - 1.0, Math.atan2(me.pos.x - BUNKS[1][0], me.pos.z - BUNKS[1][1] + 1.0), 'rise', dead.hpNow || 300); z.watch = false; api.spawned++; api.events.push({ kind: 'bunkUp', z }); } }
        }
        // (the drip: from the ceiling, onto the plates, while you are in the Med Bay)
        if (zone === 'm') for (const s of drips) {
          const u = s.userData;
          if (!s.visible) { u.wait -= dt; if (u.wait <= 0) { s.visible = true; s.position.set(15 * CELL - 1 + Math.random() * (2 * CELL + 2), HEIGHT - 0.25, PARAPET_Z + 0.6 + Math.random() * 0.3); u.vy = 0; } continue; }
          u.vy -= 9.8 * dt; s.position.y += u.vy * dt;
          if (s.position.y <= 0.02) { s.visible = false; u.wait = 0.5 + Math.random() * 1.4; sound.drip?.(s.position.clone()); }
        } else for (const s of drips) s.visible = false;
      }
      const did = (kind) => { api.fired[kind] = (api.fired[kind] || 0) + 1; scareWait = SCARES.every[0] + Math.random() * (SCARES.every[1] - SCARES.every[0]); };
      const out = playing && round >= 1 && !me.safe && !me.downed;
      const zone = station.zoneAt(me.pos);
      const roomAhead = () => station.ray(new THREE.Vector3(me.pos.x, 1, me.pos.z), new THREE.Vector3(Math.sin(walker.yaw), 0, Math.cos(walker.yaw)), 4) > 2.4;
      // ---- the director: nothing happening for a while is not allowed. Whatever fits where you are, now. ----
      if (out) scareWait -= dt;
      if (out && scareWait <= 0 && black <= 0 && lampT < 0) {
        if (zone !== 'b' && quietAround(me.pos, 9) && roomAhead()) { lampT = 0; lampWait = SCARES.lampGap * api.gaps.lamp; stander = null; did('lamp'); api.events.push({ kind: 'lampOut' }); }
        else if (host && vent === 'ready' && round >= 2 && Math.hypot(me.pos.x - VENT.x, me.pos.z - VENT.z) < 10) { vent = 'banging'; ventT = 0; did('vent'); }
        else if (steam.some((sp) => sp.going <= 0 && sp.p.distanceTo(me.pos) < 9)) { const sp = steam.filter((q) => q.going <= 0 && q.p.distanceTo(me.pos) < 9).sort((a, b) => a.p.distanceTo(me.pos) - b.p.distanceTo(me.pos))[0]; burst(sp); did('steam'); }
        else if (host && round >= 2 && !api.wants && !dead.list.some((z) => z.K.stalk && z.hp > 0) && Math.random() < 0.5) { api.wants = 'stalker'; did('stalker'); }
        else if (host && !api.wants && Math.random() < 0.6) { api.wants = 'watcher'; did('watcher'); }
        else if (quietAround(me.pos, 8)) { api.breath(me); breathWait = SCARES.breathGap; did('breath'); api.events.push({ kind: 'breath' }); }
        else { flick = 1.4; sound.bang?.(0.7, me.pos.clone().add(new THREE.Vector3(Math.sin(walker.yaw + 2.2) * 6, 1.5, Math.cos(walker.yaw + 2.2) * 6))); sound.faraway?.(); did('flicker'); }
      }
      // ---- the lamp (on its own, too: a quiet moment, away from the bay) ----
      if (lampT < 0 && out && lampWait <= 0 && zone !== 'b' && quietAround(me.pos, 10) && Math.random() < SCARES.lampChance * dt) { lampT = 0; lampWait = SCARES.lampGap; stander = null; api.fired.lamp = (api.fired.lamp || 0) + 1; api.events.push({ kind: 'lampOut' }); }
      if (lampT >= 0) {
        lampT += dt;
        // (a stutter, then out, then back)
        const t = lampT;
        walker.power = t < 0.9 ? (Math.sin(t * 47) * Math.sin(t * 13) > 0.1 ? 1 : 0.05) : t < 2.4 ? 0 : 1;
        if (t >= 1.2 && !stander) {
          // Somewhere to stand: a couple of metres ahead of you, where there is floor.
          const ahead = new THREE.Vector3(Math.sin(walker.yaw), 0, Math.cos(walker.yaw));
          const room = station.ray(new THREE.Vector3(me.pos.x, 1, me.pos.z), ahead, 4);
          if (room > 2.4 && host) {
            const at = me.pos.clone().addScaledVector(ahead, 2.1);
            stander = dead.spawn('runner', at.x, at.z, walker.yaw + Math.PI, 'walk', dead.hpNow || 300);
            stander.state = 'stand'; stander.t = 0; stander.standFor = 1.6;
            api.spawned++;
          } else stander = { none: true };
        }
        if (t >= 2.4 && lampT - dt < 2.4) { walker.power = 1; if (stander && !stander.none) { sound.sting(1.1); api.events.push({ kind: 'lamp', z: stander }); } }
        if (t > 2.6) lampT = -1;
      }
      // ---- the sleepers ---- (the host's: one you walk up to gets up)
      if (host && out) {
        for (const z of sleepers) {
          if (!z.keep || z.pos.distanceTo(me.pos) > 2.4) continue;
          z.keep = false; z.hp = dead.hpNow || 200; z.sink = 0; z.state = 'rise'; z.t = 0; z.headless = false;
          z.kind = 'runner'; z.K = dead.kindOf('runner'); z.speed = z.K.speed;
          api.spawned++;
          sound.sting(0.9);
          api.events.push({ kind: 'sleeper', z });
          api.fired.sleeper = (api.fired.sleeper || 0) + 1;
        }
      }
      // ---- the vent ---- (from round 2, the first time you pass under it)
      if (vent === 'ready' && host && out && round >= 2 && Math.hypot(me.pos.x - VENT.x, me.pos.z - VENT.z) < 3) { vent = 'banging'; ventT = 0; api.fired.vent = (api.fired.vent || 0) + 1; }
      if (vent === 'banging') {
        if (ventT === 0) api.events.push({ kind: 'vent' });
        ventT += dt;
        if (Math.random() < dt * 9) sound.clatter('mag', VENT.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3 * (1 - ventT / 2), -0.1, 0)), 0.9);
        if (ventT > 2.1) {
          vent = 'done';
          // (out of it, behind you)
          const back = new THREE.Vector3(-Math.sin(walker.yaw), 0, -Math.cos(walker.yaw)), at = me.pos.clone().addScaledVector(back, 2);
          const drop = station.ray(new THREE.Vector3(me.pos.x, 1, me.pos.z), back, 3) > 2.2 ? at : VENT.clone().setY(0);
          const z = dead.spawn('crawler', drop.x, drop.z, walker.yaw, 'walk', dead.hpNow ? dead.hpNow * 0.6 : 200);
          z.state = 'drop'; z.y = HEIGHT - 0.6; z.vy = 0; z.t = 0;
          api.spawned++;
          sound.sting(0.8);
          api.events.push({ kind: 'ventDrop', z });
        }
      }
      // ---- the breath ----
      if (reloading && !wasReloading && breathWait <= 0 && !me.safe && quietAround(me.pos, 10) && Math.random() < SCARES.breathChance) {
        breathWait = SCARES.breathGap;
        api.breath(me);
        api.fired.breath = (api.fired.breath || 0) + 1;
        api.events.push({ kind: 'breath' });
      }
      wasReloading = reloading;
      // ---- the flicker ---- (every light in the station stutters, and something bangs, not far off)
      if (flick > 0 && black <= 0) { flick -= dt; api.dim = flick <= 0 ? 1 : Math.random() < 0.55 ? 1 : 0.12; }
      // ---- the blackout ----
      if (black > 0) {
        black -= dt;
        const t = 2.4 - black;
        api.dim = t < 0.15 ? 1 - t / 0.15 : black < 0.4 ? Math.random() < 0.5 ? 1 : 0 : 0;
        walker.power = black > 0.3 ? 0.08 : 1;
        if (black <= 0) { api.dim = 1; walker.power = 1; }
      }
    },
    // Coming out of the lounge, mid-round: one there, on the doorstep (the host's).
    doorstep(at, facing, hp, sure = false) {
      if (!sure && Math.random() > SCARES.doorstep) return null;
      const out = new THREE.Vector3(Math.sin(facing), 0, Math.cos(facing)), p = at.clone().addScaledVector(out, 1.7);
      const z = dead.spawn('runner', p.x, p.z, facing + Math.PI, 'walk', hp || 300);
      z.state = 'stand'; z.t = 0; z.standFor = 0.9;
      api.spawned++;
      api.events.push({ kind: 'doorstep', z });
      return z;
    },
    blackout() { black = 2.4; sound.blackout?.(); api.events.push({ kind: 'blackout' }); },
    lamp() { lampT = 0; stander = null; api.events.push({ kind: 'lampOut' }); },   // (for testing: the lamp, now)
    vent() { vent = 'banging'; ventT = 0; },   // (and the vent, now: stand under it)
    breath(me) { const behind = me.pos.clone().add(new THREE.Vector3(-Math.sin(walker.yaw) * 0.8, 1.55, -Math.cos(walker.yaw) * 0.8)); sound.breath?.(behind); },
    get venting() { return vent; },
  };
  return api;
}
