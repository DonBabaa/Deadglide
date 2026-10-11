// Riding together: Free Ride with up to four players.
//
// Everybody skates in their own browser; nothing has to agree. About twelve
// times a second each player says where they are and what they're doing, and
// everyone else draws them: a "ghost" that glides between updates. One player
// hosts and gets a code; the others join with it, and everything goes through
// the host (the same direct browser-to-browser connection the casino uses).
//
//   guest -> host:  { t: 'hello', name, look }   { t: 's', ...state }
//   host -> guest:  { t: 'welcome', id }   { t: 'full' }   { t: 'all', clock, list: [{ id, name, look, ...state }] }
//   either way:     { t: 'g', m }      something for the game on top (the targets: see targets.js); `onGame` gets it
//                   { t: 'hit', to }   a rider shot another; whoever `to` is gets `onHit(name of the shooter)`
//
// A state is what main.js hands over in `me()`: where the board is and how it is
// turned, how fast, what trick is running, where the gun points, and the line
// being built. See `STATE` below for the fields.
import * as THREE from 'three';
import { Net } from '../casino/net.js';
import { SkaterModel } from '../player/skaterModel.js';
import { TRICKS } from '../player/tricks.js';
import { createEmoter } from '../player/emotes.js';
import { WEAPONS } from '../player/weapons.js';

export const MAX_RIDERS = 4;
const SEND_EVERY = 1 / 12, GONE_AFTER = 5000;   // seconds between updates; milliseconds of silence before a rider is taken to have left
// x y z: position.  vx vy vz: velocity.  fx fy fz / ux uy uz: the board's heading and its up.
// flip: front / back flip so far (radians).  speed.  ground, grind: 1 or 0.  trick: its place in TRICKS (-1 = none), tp: how far through.
// charge: ollie charge.  steer.  ax ay az: where the gun is aimed.  gun: 1 if it's up.  line: the line being built.  best: best line this session.
// safe: seconds of safety left after being shot off the board (they blink, and can't be shot again).
const STATE = ['x', 'y', 'z', 'vx', 'vy', 'vz', 'fx', 'fy', 'fz', 'ux', 'uy', 'uz', 'flip', 'speed', 'ground', 'grind', 'trick', 'tp', 'charge', 'steer', 'ax', 'ay', 'az', 'gun', 'line', 'best', 'safe', 'emote'];
const clean = (raw) => { const s = {}; for (const k of STATE) s[k] = Number.isFinite(raw?.[k]) ? raw[k] : 0; return s; };

// A name floating over a rider's head.
const TAG_W = 3.2, TAG_H = 1, TAG_NEAR = 10;   // a name tag's size in metres, and the distance beyond which it stops shrinking
function nameTag(name) {
  // Yellow on black with a thick outline and a pointer underneath: it has to read as a speck across the arena.
  const c = Object.assign(document.createElement('canvas'), { width: 512, height: 160 }), g = c.getContext('2d');
  g.font = '84px Anton, Impact, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const text = name.toUpperCase(), wide = Math.min(480, g.measureText(text).width + 56), left = 256 - wide / 2;
  g.fillStyle = '#0c0c0e';
  g.fillRect(left, 8, wide, 112);
  g.beginPath(); g.moveTo(232, 118); g.lineTo(280, 118); g.lineTo(256, 154); g.closePath(); g.fill();
  g.lineWidth = 8; g.strokeStyle = '#ffd23a';
  g.strokeRect(left + 4, 12, wide - 8, 104);
  g.fillStyle = '#ffd23a';
  g.fillText(text, 256, 68, 440);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  // (Drawn over everything, so you can find a friend behind a hill.)
  const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, fog: false }));
  tag.renderOrder = 20;
  tag.scale.set(TAG_W, TAG_H, 1);
  return tag;
}

// scene: where to draw the others.  me(): this player's state (see STATE).  myName(), myLook(): who they are.
// onChange(): the list of riders, the code or the status changed (redraw the panel).
export function createRide({ scene, me, myName, myLook, onChange }) {
  let net = null, role = 'alone', myId = 'me', sinceSend = 0;
  const riders = new Map();   // (host) everyone, me included: id -> { id, name, look, ...state }
  const ghosts = new Map();   // everyone else, as drawn: id -> { id, name, model, tag, pos, aim, skater (what the model reads), last (their newest state), heard }
  const ride = { code: '', status: '', onGame: null, onHit: null, get active() { return role !== 'alone'; }, get hosting() { return role === 'host'; }, get myId() { return myId; } };
  // The session's clock, in seconds: the host's, which guests follow. (Alone, just this browser's.) Things that
  // must be in the same place for everyone, like the targets, are worked out from it.
  let ahead = 0;   // (guest) how far the host's clock is ahead of ours
  const local = () => performance.now() / 1000;
  ride.clock = () => local() + ahead;
  // Messages for the game on top. toHost: a guest asks the host (the host, or a rider alone, just gets it back).
  // toAll: the host tells every guest (it does not come back to the host).
  ride.toHost = (m) => { if (role === 'guest') net.send({ t: 'g', m }); else ride.onGame?.(myId, m); };
  ride.toAll = (m) => { if (role === 'host') net.broadcast({ t: 'g', m }); };
  // You've shot the rider `id` (head: in the head).
  ride.hit = (id, head = false) => {
    if (role === 'guest') net.send({ t: 'hit', to: id, head });
    else if (role === 'host') net.sendTo(id, { t: 'hit', by: myName(), head });
  };
  // The nearest other rider a shot would hit: from `origin` along `dir` (unit), as far as `reach`.
  // { id, name, dist, head, ghost } or null.
  ride.rayHit = (origin, dir, reach) => {
    let best = null;
    for (const g of ghosts.values()) {
      if (g.last.safe > 0) continue;
      for (const [up, radius, head] of [[1.7, 0.36, true], [0.95, 0.75, false]]) {   // (the head first: a shot through it is a headshot, even if it would clip a shoulder too)
        v.copy(g.pos).addScaledVector(g.skater.up, up).sub(origin);
        const along = v.dot(dir), off2 = v.lengthSq() - along * along;
        if (along > 0 && along < reach && off2 < radius * radius && (!best || (along < best.dist && best.id !== g.id))) best = { id: g.id, name: g.name, dist: along, head, ghost: g };
      }
    }
    return best;
  };

  function removeGhost(id) {
    const g = ghosts.get(id);
    if (!g) return;
    g.model.setVisible(false);
    scene.remove(g.model.root, g.tag);
    ghosts.delete(id);
  }

  // Somebody's newest state has arrived.
  function hear(id, name, look, state) {
    let g = ghosts.get(id);
    if (!g) {
      const model = new SkaterModel(scene);
      try { model.applyLook({ hoodie: '#7a2f2b', beanie: '#24262c', deck: 'wood', wheels: '#e9e4d4', smoke: 'cigarette', ...look, goldGuns: new Set() }); } catch {}
      model.setWeapon(WEAPONS.sniper);
      const tag = nameTag(name);
      scene.add(tag);
      g = {
        id, name, model, tag, pos: new THREE.Vector3(state.x, state.y, state.z), aim: new THREE.Vector3(), last: state, heard: performance.now(),
        skater: { fwd: new THREE.Vector3(0, 0, 1), up: new THREE.Vector3(0, 1, 0), flip: 0, speed: 0, grounded: true, grinding: false, steer: 0, drifting: false, trick: null, trickProgress: 0, charge: 0, sinceKick: 9 },
      };
      ghosts.set(id, g);
      onChange();
    }
    g.last = state;
    g.heard = performance.now();
  }

  const handlers = {
    open(code) {
      ride.code = code;
      if (role === 'host') ride.status = 'Give your friends the code';
      else { ride.status = 'Joined'; net.send({ t: 'hello', name: myName(), look: myLook() }); }
      onChange();
    },
    join() {},   // (a guest says hello once connected)
    leave(id) {
      riders.delete(id);
      removeGhost(id);
      onChange();
    },
    message(id, m) {
      if (!m || typeof m !== 'object') return;
      if (role === 'host') {
        if (m.t === 'hello') {
          if (riders.size >= MAX_RIDERS) return net.sendTo(id, { t: 'full' });
          riders.set(id, { id, name: String(m.name || 'Rider').slice(0, 16), look: m.look && typeof m.look === 'object' ? m.look : {}, ...clean(null), heard: performance.now() });
          net.sendTo(id, { t: 'welcome', id });
        } else if (m.t === 'g' && riders.has(id)) ride.onGame?.(id, m.m || {});
        else if (m.t === 'hit' && riders.has(id)) {   // one rider shot another: pass it on to whoever was hit
          const by = riders.get(id).name;
          if (m.to === myId) ride.onHit?.(by, !!m.head); else net.sendTo(m.to, { t: 'hit', by, head: !!m.head });
        } else if (m.t === 's' && riders.has(id)) {
          const r = riders.get(id);
          Object.assign(r, clean(m), { heard: performance.now() });
          hear(id, r.name, r.look, r);
        }
      } else if (m.t === 'welcome') myId = m.id;
      else if (m.t === 'g') ride.onGame?.('host', m.m || {});
      else if (m.t === 'hit') ride.onHit?.(String(m.by || 'someone').slice(0, 16), !!m.head);
      else if (m.t === 'full') { ride.leave(); ride.status = 'That session is full'; onChange(); }
      else if (m.t === 'all' && Array.isArray(m.list)) {
        if (Number.isFinite(m.clock)) ahead = m.clock - local();   // (follow the host's clock)
        const here = new Set();
        for (const r of m.list) {
          if (!r || r.id === myId) continue;
          here.add(r.id);
          hear(r.id, String(r.name || 'Rider').slice(0, 16), r.look && typeof r.look === 'object' ? r.look : {}, clean(r));
        }
        for (const id of [...ghosts.keys()]) if (!here.has(id)) { removeGhost(id); onChange(); }
      }
    },
    closed(why) {
      ride.leave();
      ride.status = why;
      onChange();
    },
  };

  function begin(asHost, code) {
    ride.leave();
    role = asHost ? 'host' : 'guest';
    myId = asHost ? 'host' : 'me';
    net = new Net(handlers, 'deadslide-ride-');
    ride.status = asHost ? 'Opening a session...' : 'Joining...';
    if (asHost) net.host(); else net.join(code);
    onChange();
  }
  ride.host = () => begin(true);
  ride.join = (code) => begin(false, code);
  ride.leave = () => {
    net?.close();
    net = null;
    role = 'alone';
    myId = 'me';
    ahead = 0;
    ride.code = ride.status = '';
    riders.clear();
    for (const id of [...ghosts.keys()]) removeGhost(id);
    onChange();
  };

  // Say where we are (a guest tells the host; the host tells everyone about everyone).
  function send() {
    if (role === 'host') {
      // (A closed tab can take half a minute to be noticed as a dropped connection: anyone silent for 5 seconds has gone.)
      for (const r of [...riders.values()]) if (r.id !== myId && performance.now() - r.heard > GONE_AFTER) { riders.delete(r.id); removeGhost(r.id); onChange(); }
      riders.set(myId, { id: myId, name: myName(), look: myLook(), ...clean(me()) });
      if (ride.code) net.broadcast({ t: 'all', clock: ride.clock(), list: [...riders.values()] });
    } else if (role === 'guest') net.send({ t: 's', ...clean(me()) });
  }
  // A browser stops drawing a tab you've switched away from, which would freeze a hosted session for
  // everyone. So while this tab is hidden, a timer keeps the host passing things on.
  setInterval(() => { if (role === 'host' && document.hidden) send(); }, 100);

  // Every frame: pass on our own state now and then, and move everybody else's ghost.
  ride.update = (dt) => {
    if (role === 'alone') return;
    if ((sinceSend += dt) >= SEND_EVERY) { sinceSend = 0; send(); }
    const now = performance.now(), mine = me();
    for (const g of ghosts.values()) {
      const s = g.last, k = g.skater, age = Math.min(0.25, (now - g.heard) / 1000), ease = 1 - Math.exp(-14 * dt);
      // Glide to where they said they were, carried on by how fast they said they were going.
      g.pos.lerp(v.set(s.x + s.vx * age, s.y + s.vy * age, s.z + s.vz * age), ease);
      if (g.pos.distanceToSquared(v) > 900) g.pos.copy(v);   // (miles off: they've been put somewhere else. Jump.)
      k.fwd.lerp(v.set(s.fx, s.fy, s.fz), ease);
      if (k.fwd.lengthSq() < 1e-4) k.fwd.set(0, 0, 1);
      k.fwd.normalize();
      k.up.lerp(v.set(s.ux, s.uy, s.uz), ease);
      if (k.up.lengthSq() < 1e-4) k.up.set(0, 1, 0);
      k.up.normalize();
      k.flip = s.flip; k.speed = s.speed; k.grounded = !!s.ground; k.grinding = !!s.grind; k.grindStyle = Math.max(0, Math.round(s.grind) - 1); k.steer = s.steer; k.charge = s.charge;
      k.trick = TRICKS[s.trick] || null; k.trickProgress = s.tp;
      g.aim.set(s.ax, s.ay, s.az);
      g.model.update(dt, k, g.pos, g.aim, !!s.gun, s.safe);   // (they blink while they can't be shot)
      g.emoter ||= createEmoter(g.model);
      g.emoter.match(Math.round(s.emote));
      g.emoter.update(dt);
      // The name: from far away it is kept the same size on screen, so it never shrinks to nothing.
      const far = Math.max(1, Math.hypot(g.pos.x - mine.x, g.pos.y - mine.y, g.pos.z - mine.z) / TAG_NEAR);
      g.tag.scale.set(TAG_W * far, TAG_H * far, 1);
      g.tag.position.copy(g.pos).addScaledVector(k.up, 2.3 + 0.6 * far);
    }
  };

  // Everyone riding, best line first: [{ name, best, line, me }].
  ride.board = () => {
    const mine = me(), rows = [{ name: myName(), best: mine.best, line: mine.line, me: true }];
    for (const g of ghosts.values()) rows.push({ name: g.name, best: g.last.best, line: g.last.line, me: false });
    return rows.sort((a, b) => b.best - a.best);
  };
  ride.ghosts = ghosts;
  return ride;
}
const v = new THREE.Vector3();
