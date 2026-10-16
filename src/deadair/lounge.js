// The Crew Lounge: DEAD AIR's safe room, through the airlock in the Arrival Bay. Nothing follows you in. It is the
// casino (casino/room.js and casino/casino.js: the same tables, the same staff, the same buttons), moved into the
// station: Babitus deals blackjack at the far end and his double spins the roulette wheel, the slots stand along one
// wall and she still tends the bar along the other; but the room round them is the station's own steel, low and dark,
// the windows look out on the crater, the carpet is worn through, and the warm lamps over the tables are the only warm
// light there is out here. The band is a tape on a loop, out of a speaker somewhere. And the dead are at the airlock:
// you can hear them on it.
//
// Your gold is the one you picked up off the dead (coins.js), not the story's. The tables multiply it (or take it);
// the bar's drinks are what it is for: each does something for you out there. Three skulls on a slot machine gild the
// gun in your hand.
//
//   const lounge = createLounge({ station, game, arms, walker, openCasino, onOut });
//   await lounge.enter();     the casino takes over (index.js draws lounge.scene with lounge.camera while lounge.inside)
import * as THREE from 'three';
import * as FIT from '../casino/decor.js';
import { CasinoRoom } from '../casino/room.js';
import { DRINKS } from '../casino/bar.js';
import { kitWelder } from './station.js';
import { GUNS } from './arms.js';
import { holdMusic, setRadio, playPowerup } from '../fx/audio.js';
import { Dead } from './dead.js';

// The stage: a riser against the near wall, right of the airlock, with a curtain behind it, a mic in the middle and
// three spots over it that are off. It stands empty. Dance on it (T) for four seconds and it is not empty any more.
const STAGE = { x: -9.5, z: 12.2, w: 6.4, d: 3.0, h: 0.18 };   // (left of the airlock: the right has the sofas)
// The open mic is his song, DEAD AIR (Hit That Boof) (public/sounds/deadair/show_song.ogg, 101 s), and a cut-in the whole
// length of it: Dave the Diver, and then some. SEC: its sections, by the song's own shape (the loud stretches are its
// choruses); BEAT: two beats at 140, the number's cut rate.
const SONG = 101.3, SHOW_TIME = SONG + 1.8, BEAT = 120 / 140;
const SEC = [['black', 0, 1.0], ['rise', 1.0, 3.6], ['billing', 3.6, 10.6], ['holdup', 10.6, 14.6], ['verse', 14.6, 56.8], ['chorus', 56.8, 70.1], ['bridge', 70.1, 80.4], ['mosh', 80.4, 87.8], ['surf', 87.8, 94.3], ['finale', 94.3, 100.5], ['end', 100.5, SHOW_TIME + 1]];   // (timed to the song by faster-whisper small + medium: tools/sync_lyrics.py, 2026-10-16)
const sectionAt = (t) => { const x = SEC.find((q) => t >= q[1] && t < q[2]) || SEC[SEC.length - 1]; return { name: x[0], s: Math.min(1, Math.max(0, (t - x[1]) / (x[2] - x[1]))), t0: x[1] }; };
// (a film of it was once recorded and played over the room in its place; the show was retimed to the song since, and is
// always played live: the old recording is kept in dl/video, out of the build)
// (what the casino is handed while the show plays: every key it reads, up; it walks him by steer, push, brake, drift, jump)
const STILL = { trickPressed: false, steer: 0, push: false, brake: false, drift: false, jumpHeld: false, kick: false, trickHeld: false };
// (the words of his song, as cards: timed to the recording with faster-whisper (tools/sync_lyrics.py; the medium model
// hears the second chorus: 'He hit that boof' at 88.6 s, the last BRAINS at 96.4 s))
const SHOW_LYRICS = [
  [10.6, '"Hold up. Let me hit that boof."'],
  [29.8, 'Mastre rolled in off the Moon, a skater with a gun'], [36.2, 'Twenty-five of us hit the floor before his hour begun'], [41.0, 'Then he stopped dead in the Spine, pulled that golden stick'], [48.5, 'Smoke down every corridor — the whole deck went thick'],
  [56.8, 'BOOF! He hit that boof!'], [60.3, "BOOF! That mastre, that's the truth"], [63.6, 'Thirty seconds golden and we go down in twos'], [66.6, "GOY! GOY! GOY! — BRAAAINS! BRAAAINS! We're the ones who lose"],
  [75.1, '"...I am fine. Shoot something."'], [80.4, '(GOY! GOY! BOOF! BOOF!)'],
  [87.8, 'BOOF! He hit that boof!'], [91.3, "BOOF! That mastre, that's the truth"], [94.3, "GOY! GOY! GOY! — BRAAAINS! BRAAAINS! We're the ones who lose"],
  [96.4, 'BRAAAAAAAAAAAAINS!'],
];

const CEILING = 5;     // the station's own height (the casino's hall is nine metres to its coffers)
const FACE = 1.56;     // how far a kit wall's inner face is from the middle of its cell
const PI = Math.PI;

// The bar's drinks, out here: what each does to you (and how many of it do anything).
export const PERKS = {
  whisky: { name: 'Deadeye Whisky', price: 60, does: '+20% damage', most: 4 },
  martini: { name: 'Quickdraw Martini', price: 90, does: 'faster reload, steadier aim', most: 3 },
  champagne: { name: 'Iron Champagne', price: 150, does: '+40 health', most: 3 },
};

export function createLounge({ station, game, arms, walker, openCasino, onOut, hud = null, sound = null, solo = () => true, friends = () => [], renderer = null }) {
  let api = null;
  // The band (once there is one): a Dead of its own, in the room's scene, posed by hand here: nobody hunts anybody.
  let band = null, show = null, bandOn = false, danced = 0, prompt = '', waiting = '', songOn = null;
  const onStage = (p) => Math.abs(p.x - STAGE.x) < STAGE.w / 2 && Math.abs(p.z - STAGE.z) < STAGE.d / 2;
  const S = THREE.Vector3;
  let room = null, casino = null, inside = false, glow = 0;

  // Where the gold goes: the game's (index.js keeps it in game.gold).
  const purse = {
    get gold() { return Math.floor(game.gold); },
    pay(n) { if (game.gold < n) return false; game.gold -= n; return true; },
    bank(n) { game.gold += n; },
    took(lost) { game.houseTake += lost; },
    get houseTake() { return game.houseTake; },
  };
  const drinks = DRINKS.map((d) => {
    const P = PERKS[d.id];
    if (!P) return d;
    return {
      ...d, name: P.name, price: P.price, does: `${P.does} (up to ${P.most})`,
      drunk() {
        const had = (game.perks[d.id] = (game.perks[d.id] || 0) + 1);
        if (had > P.most) return;   // (it does nothing more for you; it still does what drink does)
        if (d.id === 'whisky') game.mods.damage *= 1.2;
        else if (d.id === 'martini') { game.mods.reload *= 0.78; game.mods.spread *= 0.8; }
        else if (d.id === 'champagne') { game.maxHealth += 40; game.health = game.maxHealth; }
        playPowerup();
      },
    };
  });
  // Three skulls: the gun in your hand is gilded (or the other one, if it already is). Nothing left to gild: gold.
  const award = () => {
    const order = [arms.held, 1 - arms.held].map((i) => arms.carried[i]).filter(Boolean);
    const slot = order.find((c) => !arms.gilded.has(c.id));
    if (!slot) return null;
    arms.gild(slot.id);
    return { name: `a gilded ${GUNS[slot.id].name}` };
  };

  function build() {
    room = new CasinoRoom({ shell: (r, kit) => dress(r, kit, station.pieces) });
    band = new Dead(room.scene, station);
    return room;
  }

  // ---- The show: the band is put on the stage (a flash, and there they are), the spots come on, his song starts, and
  // for the length of it the camera is the show's. After that they stay, and play, for as long as you are in here.
  let fx = null;   // confetti and pyro, built the first time (in the room's scene)
  function buildFx() {
    const N = 300, colors = [0xffcf4a, 0xe8291c, 0xf4f0e6, 0xffcf4a, 0x9ae6ff];
    const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.09, 0.055), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false }), N);
    mesh.frustumCulled = false;
    const col = new THREE.Color();
    for (let i = 0; i < N; i++) mesh.setColorAt(i, col.setHex(colors[i % colors.length]));
    mesh.instanceColor.needsUpdate = true;
    room.scene.add(mesh);
    const parts = Array.from({ length: N }, () => ({ life: 0, p: new S(), v: new S(), r: new S(), w: new S() }));
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new S(1, 1, 1), none = new THREE.Matrix4().makeScale(0, 0, 0);
    let next = 0;
    // (the mic, in the star's hand: the stand's goes dark while he has it; and a low cool light over the crowd)
    const handMic = new THREE.Group();
    const micMat = new THREE.MeshStandardMaterial({ color: 0x202226, metalness: 0.6, roughness: 0.5 });
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.03, 0.2, 10), micMat); grip.position.y = 0.1; handMic.add(grip);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), new THREE.MeshStandardMaterial({ color: 0x5a5c62, metalness: 0.85, roughness: 0.35 })); ball.position.y = 0.24; handMic.add(ball);
    handMic.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    handMic.visible = false; room.scene.add(handMic);
    const house = new THREE.PointLight(0x8ab8ff, 0, 10, 1.5); house.position.set(STAGE.x, 2.9, STAGE.z - 5.6); room.scene.add(house);
    // (four flashes along the lip of the stage: pyro)
    const pyro = [-2.4, -0.8, 0.8, 2.4].map((dx) => { const L = new THREE.PointLight(0xffe2a8, 0, 7, 1.6); L.position.set(STAGE.x + dx, STAGE.h + 0.3, STAGE.z - STAGE.d / 2 + 0.1); room.scene.add(L); return L; });
    return {
      handMic, house,
      burst(n, x = STAGE.x, z = STAGE.z - 0.6, y = 3.3) {
        for (let i = 0; i < n; i++) {
          const P = parts[next++ % N];
          P.life = 1; P.p.set(x + (Math.random() - 0.5) * 5, y + Math.random() * 0.5, z + (Math.random() - 0.5) * 2.5);
          P.v.set((Math.random() - 0.5) * 2.6, 0.6 + Math.random() * 1.8, (Math.random() - 0.5) * 2.6);
          P.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6); P.w.set((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9);
        }
      },
      flare(k = 1) { for (const L of pyro) L.intensity = Math.max(L.intensity, 170 * k); },
      up(dt) {
        for (let i = 0; i < N; i++) {
          const P = parts[i];
          if (P.life <= 0) { mesh.setMatrixAt(i, none); continue; }
          P.v.y -= 2.4 * dt; P.v.multiplyScalar(Math.max(0, 1 - 1.4 * dt)); P.p.addScaledVector(P.v, dt); P.r.addScaledVector(P.w, dt);
          if (P.p.y < 0.03) { P.life = 0; mesh.setMatrixAt(i, none); continue; }
          mesh.setMatrixAt(i, m4.compose(P.p, q.setFromEuler(e.set(P.r.x, P.r.y, P.r.z)), one));
        }
        mesh.instanceMatrix.needsUpdate = true;
        for (const L of pyro) L.intensity *= Math.exp(-7 * dt);
      },
      clear() { for (const P of parts) P.life = 0; for (let i = 0; i < N; i++) mesh.setMatrixAt(i, none); mesh.instanceMatrix.needsUpdate = true; for (const L of pyro) L.intensity = 0; handMic.visible = false; house.intensity = 0; if (room.stageMic) room.stageMic.visible = true; },
    };
  }
  // The show's first frame used to stall for seconds: the band's bodies and the confetti drawn for the first time under the
  // room's lights, every one of their shaders compiled then and there. So they are compiled while nobody is looking: the
  // room's hidden meshes shown for a moment, the renderer asked to compile the room, and hidden again.
  let warmedUp = false;
  function warm() {
    if (warmedUp || !renderer || !room) return;
    warmedUp = true;
    try {
      if (!fx) fx = buildFx();
      const shown = [];
      room.scene.traverse((o) => { if ((o.isMesh || o.isSprite) && !o.visible) { o.visible = true; shown.push(o); } });
      renderer.compile(room.scene, room.camera);
      for (const o of shown) o.visible = false;
    } catch (error) { console.warn('DEAD AIR: the lounge could not be warmed up.', error); }
  }
  function startShow() {
    if (show || bandOn) return;
    const star = band.spawn('warden', STAGE.x, STAGE.z - 0.1, Math.PI, 'walk', 1);
    star.state = 'show'; star.role = 'star'; star.act = 'rise'; star.showT = 0; star.yaw = Math.PI; star.y = STAGE.h;
    const crowd = [-2.3, -1.2, 1.2, 2.3].map((dx, i) => {
      const z = band.spawn(i % 2 ? 'runner' : 'walker', STAGE.x + dx, STAGE.z + 0.5, Math.PI, 'walk', 1);
      z.state = 'show'; z.role = 'crowd'; z.showT = -0.2 * i; z.yaw = Math.PI; z.mark = { x: STAGE.x + dx, z: STAGE.z + 0.5 }; z.y = STAGE.h; z.who = i; z.star = star;
      return z;
    });
    // (and a crowd in front of the stage to watch it: a dozen of them, cheering, clapping, rallying)
    const fans = [];
    for (let i = 0; i < 12; i++) {
      const row = Math.floor(i / 6), x = STAGE.x - 3.0 + (i % 6) * 1.2 + (row ? 0.6 : 0), zz = STAGE.z - 6.4 + row * 1.15;
      const z = band.spawn(['walker', 'runner', 'walker', 'screamer'][i % 4], x, zz, 0, 'walk', 1);
      z.state = 'show'; z.role = 'fan'; z.showT = -0.3 * (i % 5); z.yaw = 0; z.mark = { x, z: zz }; z.y = 0; z.who = i;
      fans.push(z);
    }
    show = { t: 0, star, crowd, fans, lyric: -1, film: false, beatN: -1, clapped: false };
    bandOn = true;
    if (!fx) fx = buildFx();
    // (the song: it starts with the show and plays on after it, under the room, for as long as they are up there)
    if (songOn) songOn.stop();
    songOn = sound?.song?.('show_song', { level: 1 }) || null;
    sound?.crowd?.('roar', room.pos);
    // (he steps down off it as they arrive: in front of the stage and off to its side, out of the cameras' way, facing
    // it, still dancing)
    room.pos.set(STAGE.x - 1.7, 0, STAGE.z - 2.7);   // (clear of the pipe column at x -12.5)
    room.yaw = Math.atan2(1.7, 2.7);
    holdMusic(1);
    sound?.sting?.(0.7);
    hud?.whiteout?.(0.6);
  }
  // Each frame they are on the stage: posed, hopping, the star singing; down in the pit for the second chorus; the star
  // over their heads after it; the spots on them (strobing through the choruses, one low lamp for the bridge).
  function runBand(dt) {
    if (!bandOn) return;
    const t = show ? show.t : 999, sec = show ? sectionAt(t) : { name: 'after', s: 0 };
    const pit = sec.name === 'mosh', surf = sec.name === 'surf';
    const lip = STAGE.z - STAGE.d / 2 - 0.35;   // (no further back than the front of the stage: the floor, not the riser)
    for (const z of band.list) {
      z.showT = (z.showT || 0) + dt;
      if (z.role === 'star') {
        z.act = t < 3.6 ? 'rise' : sec.name === 'holdup' || (sec.name === 'finale' && sec.s > 0.5 && sec.s < 0.82) ? 'finale' : 'sing';
        if (surf) {   // (out over them, along the front of the stage and back, singing all the way)
          const k = Math.sin(sec.s * Math.PI);
          z.pos.set(STAGE.x + Math.sin(sec.s * Math.PI * 2) * 2.2, 0, Math.min(lip, STAGE.z - 1.0 - 1.9 * k)); z.y = STAGE.h + 1.3 * k; z.yaw = Math.PI;
        } else { z.pos.x += (STAGE.x - z.pos.x) * Math.min(1, dt * 3); z.pos.z += (STAGE.z - 0.1 - z.pos.z) * Math.min(1, dt * 3); z.y = STAGE.h; z.yaw = Math.PI; }
      } else if (z.role === 'fan') {   // (the crowd: on their feet in front of the stage, hopping with the choruses)
        const i = z.who || 0, hop = sec.name === 'chorus' || sec.name === 'finale' ? 0.3 : 0.1;
        z.pos.set(z.mark.x, 0, z.mark.z); z.y = Math.max(0, Math.sin(z.showT * 6.5 + i * 1.3) * hop - 0.02); z.yaw = 0.15 * Math.sin(z.showT * 1.1 + i);
      } else {
        const i = z.who || 0;
        z.dancing = !(pit || surf);
        if (pit || surf) {   // (rings round him in the pit; under the star when he comes out over them)
          const cx = surf ? z.star.pos.x : room.pos.x, cz = surf ? z.star.pos.z : Math.min(room.pos.z, lip - 0.6), r = surf ? 1.1 : 2.0;
          const a = z.showT * 2.4 + i * Math.PI / 2, nx = cx + Math.cos(a) * r, nz = Math.min(lip, cz + Math.sin(a) * r);
          z.yaw = Math.atan2(nx - z.pos.x, nz - z.pos.z) || z.yaw;
          z.pos.set(nx, 0, nz); z.y = Math.max(0, Math.sin(z.showT * 9 + i) * 0.3);
        } else {
          const hop = sec.name === 'chorus' || sec.name === 'finale' ? 0.48 : sec.name === 'bridge' ? 0 : 0.22;
          z.pos.x += (z.mark.x - z.pos.x) * Math.min(1, dt * 4); z.pos.z += (z.mark.z - z.pos.z) * Math.min(1, dt * 4);
          z.y = STAGE.h + (t > 3.6 ? Math.max(0, Math.sin(z.showT * 7.2 + z.phase * 6) * hop - 0.05) : 0);
          z.yaw = Math.PI + 0.25 * Math.sin(z.showT * 1.7 + z.phase * 5);
        }
      }
    }
    band.eye.set(STAGE.x, 1, STAGE.z);   // (seen from the stage itself: every one of them in full detail, however far the camera is)
    band.time += dt;
    band.draw(dt);
    // (the mic: in his hand, along his forearm; the one on the stand is his until he puts it back)
    const star = band.list.find((z) => z.role === 'star');
    if (fx && star?.handR && star.elbowR) {
      const d = star.handR.clone().sub(star.elbowR); const len = d.length();
      if (len > 1e-4) { d.divideScalar(len); fx.handMic.position.copy(star.handR).addScaledVector(d, -0.06); fx.handMic.quaternion.setFromUnitVectors(new S(0, 1, 0), d); fx.handMic.visible = true; }
    } else if (fx) fx.handMic.visible = false;
    if (room.stageMic) room.stageMic.visible = !bandOn;
    if (fx) fx.house.intensity = show ? (sec.name === 'bridge' ? 2 : 9) : 5;
    const strobe = show && (sec.name === 'chorus' || sec.name === 'finale') ? (Math.floor(t * 11) % 2 ? 1 : 0.3) : 1;
    (room.stageSpots || []).forEach((s, i) => {
      const base = !show ? 32 : t < 3.0 ? 0 : sec.name === 'bridge' ? (i === 1 ? 22 : 2) : sec.name === 'finale' ? 70 : 55;
      s.intensity = base * strobe * (0.9 + 0.1 * Math.sin(performance.now() / 180 + s.userData.ph));
    });
    fx?.up(dt);
  }
  // The cut-in, section by section: the camera, the titles, the words, the flashes and lines; confetti and pyro on the
  // hits; Kirky pulled up onto the stage for the finale.
  function runShow(dt) {
    const c = show;
    c.t = songOn ? songOn.time() : c.t + dt;   // (the song's own clock, when there is one: the show never drifts from it)
    const t = c.t, sec = sectionAt(t), cam = room.camera, stage = new S(STAGE.x, STAGE.h, STAGE.z), front = new S(0, 0, -1), side = new S(1, 0, 0);
    if (room.emoter.playing !== 4) room.emoter.play(3);   // (he keeps dancing: he started it)
    const star = c.star, head = star.head && Number.isFinite(star.head.x) ? star.head.clone() : stage.clone().setY(2.2);
    const kirky = room.pos.clone().setY(1.2);
    let at, pos, fov, lines = 0, flash = 0, title = '', sub = '', say = null, kk = 0, roll = 0;
    const beat = Math.floor(t / BEAT), inBeat = (t / BEAT) % 1, onHit = beat !== c.beatN, since = t - beat * BEAT;
    if (onHit) c.beatN = beat;
    const shake = (k) => { pos.x += Math.sin(t * 23) * 0.04 * k; pos.y += Math.cos(t * 19) * 0.03 * k; };
    switch (sec.name) {
      case 'black': pos = stage.clone().addScaledVector(front, 6).setY(1.4); at = stage.clone().setY(1.2); fov = 50; flash = t < 0.15 ? 0.9 : 0; break;
      case 'rise': { const s = sec.s; pos = stage.clone().addScaledVector(front, 3.6 - 0.8 * s).addScaledVector(side, -1.4).setY(0.9 + 0.5 * s); at = stage.clone().setY(1.5 + 0.5 * s); fov = 46 - 8 * s; lines = s < 0.3 ? 1 : 0; flash = s < 0.05 ? 0.7 : 0; break; }
      case 'holdup': {   // (the growl: a snap zoom into his face)
        const s = sec.s, z = Math.min(1, s * 4);
        pos = head.clone().addScaledVector(front, 1.6 - 0.6 * z).addScaledVector(side, 0.35); at = head.clone().setY(head.y - 0.1); fov = 40 - 12 * z;
        lines = 1; flash = s < 0.06 ? 0.8 : 0; title = 'HOLD UP.'; kk = Math.min(1, s * 5);
        if (s < 0.05) fx?.flare(0.6);
        break;
      }
      case 'billing': { const s = sec.s; pos = stage.clone().addScaledVector(front, 5.5 - 1.5 * s).addScaledVector(side, 0.8 - 1.6 * s).setY(1.6 + 0.8 * s); at = stage.clone().setY(1.7); fov = 44; title = 'THE DEAD AIR'; sub = 'LIVE AT THE CREW LOUNGE  ·  OPEN MIC'; kk = Math.min(1, s * 3); break; }
      case 'verse': {   // (the number: a cut every two beats, six set-ups)
        const k = beat % 6;
        if (k === 0) { pos = stage.clone().addScaledVector(front, 2.2).addScaledVector(side, 0.9).setY(1.4); at = head; fov = 40; }
        else if (k === 1) { pos = stage.clone().addScaledVector(side, -4.2).addScaledVector(front, 1.5).setY(1.2); at = stage.clone().addScaledVector(side, 0.5).setY(1.3); fov = 48; }
        else if (k === 2) { pos = room.pos.clone().addScaledVector(side, 2.3).addScaledVector(front, 0.9).setY(1.35); at = room.pos.clone().addScaledVector(side, -0.3).setY(1.15); fov = 44; }   // (Kirky, dancing, from his side: the band behind him)
        else if (k === 3) { pos = stage.clone().addScaledVector(front, 2.6).addScaledVector(side, -2.2).setY(0.35); at = head; fov = 46; roll = 0.28; }
        else if (k === 4) { pos = stage.clone().addScaledVector(front, 7.4).addScaledVector(side, -1.2).setY(1.25); at = stage.clone().setY(1.7); fov = 52; }   // (from the back of the crowd: their heads, the stage past them)
        else { pos = stage.clone().addScaledVector(front, 4).addScaledVector(side, 1.5).setY(3.3); at = stage.clone().setY(1.2); fov = 50; }
        lines = inBeat < 0.12 ? 1 : 0;
        break;
      }
      case 'chorus': case 'finale': {   // (a cut every beat, snapping in; confetti and pyro on every other; BOOF! each time)
        const fin = sec.name === 'finale';
        const half = Math.floor(t / (BEAT / 2)), hk = (t / (BEAT / 2)) % 1, k = half % 5, zoom = 1 - Math.min(1, hk * 3);
        if (fin) { const a = t * 0.7; pos = stage.clone().addScaledVector(front, 3.2 + 2.2 * Math.cos(a)).addScaledVector(side, 3.4 * Math.sin(a)).setY(1.1 + 0.9 * (0.5 + 0.5 * Math.sin(a * 1.3))); at = stage.clone().setY(1.6); fov = 44 + 16 * zoom; }
        else if (k === 0) { pos = head.clone().addScaledVector(front, 1.6).addScaledVector(side, 0.3); at = head; fov = 34 + 24 * zoom; }
        else if (k === 1) { pos = stage.clone().addScaledVector(front, 7).addScaledVector(side, -2).setY(0.6); at = stage.clone().setY(1.9); fov = 48 + 10 * zoom; roll = -0.2; }
        else if (k === 2) { pos = stage.clone().addScaledVector(front, 5.4).addScaledVector(side, 4.2).setY(1.7); at = stage.clone().addScaledVector(front, 5.8).addScaledVector(side, -0.6).setY(1.2); fov = 50; }   // (the crowd, from off to the side: cheering, clapping, rallying)
        else if (k === 3) { pos = stage.clone().addScaledVector(front, 2.8).addScaledVector(side, 2.6).setY(0.5); at = head; fov = 42 + 14 * zoom; roll = 0.3; }
        else { pos = stage.clone().addScaledVector(front, 3).setY(3.6); at = stage.clone().setY(1.3); fov = 56; }
        if (onHit && beat % 2 === 0) { fx?.burst(fin ? 80 : 45); fx?.flare(fin ? 1 : 0.5); }
        if (beat % 2 === 0 && since < 0.45) { title = 'BOOF!'; kk = Math.min(1, since * 8); }
        if (fin && t > 98.4) { title = 'DEAD AIR'; sub = 'EVERY NIGHT  ·  THE CREW LOUNGE'; kk = 1; }   // (after the last BRAINS card, not over it)
        lines = since < 0.15 ? 1 : 0; flash = fin && since < 0.05 ? 0.5 : 0;
        if (fin) shake(1);
        break;
      }
      case 'bridge': {   // (one lamp, a slow push into his face for the whisper; then Kirky, not sure about any of this)
        const s = sec.s;
        if (s < 0.6) { const z = s / 0.6; pos = head.clone().addScaledVector(front, 2.2 - 1.0 * z).addScaledVector(side, -0.4); at = head; fov = 40 - 10 * z; }
        else { pos = kirky.clone().addScaledVector(front, -1.2).addScaledVector(side, 0.5); at = kirky; fov = 36; title = '?'; kk = Math.min(1, (s - 0.6) * 4); }
        break;
      }
      case 'mosh': {   // (the pit: the four of them running rings round him; the camera hand-held)
        if (beat % 2 === 0) { pos = stage.clone().addScaledVector(front, 0.3).addScaledVector(side, -2.6).setY(2.0); at = kirky; fov = 50; }
        else { pos = kirky.clone().addScaledVector(front, 3.2).addScaledVector(side, 1.6).setY(0.6); at = kirky; fov = 48; roll = 0.15; }
        shake(1.4); lines = inBeat < 0.1 ? 1 : 0;
        if (onHit && beat % 4 === 0) fx?.flare(0.4);
        if (sec.s < 0.25) { title = 'THE PIT'; kk = Math.min(1, sec.s * 6); }
        break;
      }
      case 'surf': {   // (the star out over their heads)
        const sp = star.pos.clone().setY(star.y + 1.2), k = beat % 3;
        if (k === 0) { pos = sp.clone().addScaledVector(front, 2.6).addScaledVector(side, 1.4).setY(sp.y + 0.3); at = sp; fov = 42; }
        else if (k === 1) { pos = sp.clone().addScaledVector(side, -3).setY(0.7); at = sp; fov = 46; roll = -0.22; }
        else { pos = sp.clone().setY(sp.y + 2.4).addScaledVector(front, 0.6); at = sp.clone().setY(0.5); fov = 60; }
        if (sec.s < 0.2) { title = 'CROWD SURF'; kk = Math.min(1, sec.s * 7); }
        lines = inBeat < 0.1 ? 1 : 0;
        break;
      }
      default: {   // 'end': the flash, the cheer, and Kirky's word on it
        const s = sec.s;
        pos = stage.clone().addScaledVector(front, 6).addScaledVector(side, 1.2).setY(1.6); at = stage.clone().setY(1.5); fov = 50; flash = s < 0.08 ? 0.9 : 0;
        say = ['Kirky', 'Every night. ...Great.'];
        if (!c.clapped) { c.clapped = true; sound?.crowd?.('cheer', room.pos); fx?.burst(140); fx?.flare(1); songOn?.level(0.55, 1.0); }   // (and the song, as it comes round again, under the room)
      }
    }
    // (the words of it, as cards, each for a few seconds)
    if (sec.name !== 'end' && !(sec.name === 'finale' && t > 98.4)) { const L = SHOW_LYRICS.filter((l) => l[0] <= t).at(-1); if (L && t - L[0] < 3.6) say = ['The Warden', L[1]]; }   // (no card under the end card)
    // (the finale: Kirky pulled up onto the stage with them, still dancing)
    if (sec.name === 'finale') { room.pos.lerp(new S(STAGE.x, 0, STAGE.z - 0.9), Math.min(1, dt * 1.5)); room.yaw = Math.PI; }
    cam.position.copy(pos); cam.lookAt(at); cam.fov = fov; cam.updateProjectionMatrix();
    if (roll) cam.rotateZ(roll);
    if (!api.recording) hud?.cine?.(true, lines, flash, title, kk, sub, '', say);
    if (t >= SHOW_TIME) {
      show = null; hud?.cine?.(false); holdMusic(0.8); if (hud?.banner) hud.banner('ENCORE', 0xffcf4a); game.points += 300;
      songOn?.level(0.55, 1.5);   // (the band plays on, under the room)
      fx?.clear();
    }
  }

  api = {
    get inside() { return inside; },
    get room() { return room; },
    get scene() { return room?.scene; },
    get camera() { return room?.camera; },
    // (built ahead of time, while nobody is looking: the casino is a lot to put together, and the airlock should not stall)
    prepare() { return openCasino().then((c) => { casino = c; if (!room) build(); warm(); }); },
    async enter() {
      await api.prepare();
      inside = true;
      document.exitPointerLock?.();
      casino.enter({
        room, purse, drinks, award, friends: false, others: friends, style: 'casino-station', leave: 'Back out there',
        paytable: '7 7 7 &times;40 &middot; &#x1F514;&#x1F514;&#x1F514; &times;10 &middot; BAR &times;5 &middot; &#x1F352;&#x1F352;&#x1F352; &times;3 &middot; &#x1F352;&#x1F352; stake back &middot; &#x1F480;&#x1F480;&#x1F480; gilds your gun',
        onLeave: () => { inside = false; setRadio(false); holdMusic(0); if (songOn) { songOn.stop(); songOn = null; } onOut(); },
      });
      room.kirky.applyLook({ ...walker.look });
      setRadio(true);
      holdMusic(0.6);
    },
    // Each frame while you are in here (index.js): the casino's own, and the airlock's light, brighter as they hit it.
    update(dt, input) {
      if (!inside) return;
      casino.update(dt, show ? STILL : input);   // (the show has the controls for the moment: nothing pressed)
      glow = Math.max(0, glow - dt * 1.6);
      if (room.airlock) room.airlock.intensity = 3 + 22 * glow + 2 * Math.sin(performance.now() / 300);
      // The stage: up on it, he is up on it; and dancing on it, for long enough, is the open mic.
      const up = onStage(room.pos);
      if (up) room.kirky.root.position.y += STAGE.h;
      const dancing = up && room.emoter.playing === 4 && !bandOn;
      if (dancing) { danced += dt; if (danced > 4 && solo()) startShow(); } else danced = Math.max(0, danced - dt);
      prompt = up && !bandOn ? (waiting || (danced > 0.3 ? 'OPEN MIC  ·  keep dancing...' : 'OPEN MIC  ·  T to dance')) : '';   // (with friends: how many of you are dancing)
      runBand(dt);
      if (show) runShow(dt);
    },
    get prompt() { return prompt; },
    // Dancing on the stage, just now (with friends, index.js starts it when every one of you is).
    get dancing() { return inside && onStage(room.pos) && room.emoter.playing === 4 && !bandOn; },
    get playing() { return !!show; },
    set waiting(text) { waiting = text || ''; },
    recording: false,   // (the film being made: the cut-in played live, with nothing over it)
    // The tests, and a new run: the stage cleared.
    show: () => { if (inside) { startShow(); return true; } return false; },
    clearStage() { if (band) { band.list.length = 0; band.draw(0); } show = null; bandOn = false; danced = 0; if (room?.stageSpots) for (const s of room.stageSpots) s.intensity = 0; if (songOn) { songOn.stop(); songOn = null; } fx?.clear(); },
    // Something hit the airlock door, from outside.
    hit(k = 1) { glow = Math.min(1, glow + 0.5 * k); },
    // Out, from the game's side (the game is over, or the mode is being left).
    leave() { if (inside) { if (show) { show = null; hud?.cine?.(false); fx?.clear(); } casino.leave(); } },
  };
  return api;
}

// ---- The room -----------------------------------------------------------------------------------------------------
// The casino's room with the station round it: kit floor and ceiling, kit walls (windows on the crater behind the
// table), the airlock you came in by, pipe columns where the hall has its marble ones, crates where it has his statues
// (both are in the way of your feet there: room.js's blockers), worn carpet, and lamps on chains.
function dress(room, { add, std, stand, glow, bulb, W, D, TABLE, ROU }, pieces) {
  const scene = room.scene;
  scene.background = new THREE.Color(0x030305);
  scene.fog = new THREE.FogExp2(0x040406, 0.018);
  scene.add(new THREE.HemisphereLight(0x3a4560, 0x140d08, 0.5));
  const kit = kitWelder(pieces), put = kit.place;
  const walls = ['WallAstra_Straight', 'WallAstra_Straight_Divided', 'WallAstra_Straight_Flat', 'WallBand_Straight'];
  let k = 0;
  const wall = (name, x, z, yaw) => { put(name, x, 0, z, yaw); put('TopCables_Straight', x, 0, z, yaw); put('BottomMetal_Straight', x, 0, z, yaw); };
  // Floor and ceiling, a cell at a time.
  for (let x = -17; x <= 19; x += 4) for (let z = -13; z <= 15; z += 4) {
    put((Math.round(x + z) / 4) % 3 === 0 ? 'Platform_Metal' : 'Platform_DarkPlates', x, 0, z);
    put('Platform_DarkPlates', x, CEILING, z, 0, PI);
  }
  // The walls. The far one (behind his table) has windows; the near one is broken in the middle by the airlock.
  for (let x = -17; x <= 19; x += 4) wall(Math.abs(x - TABLE.x - 1) <= 5 ? 'WallWindow_Straight' : walls[k++ % walls.length], x, -D / 2 + FACE, -PI / 2);
  for (const x of [-20, -16, -12, -8, -4, 4, 8, 12, 16, 20]) wall(walls[k++ % walls.length], x, D / 2 - FACE, PI / 2);
  for (let z = -13; z <= 15; z += 4) { wall(walls[k++ % walls.length], -W / 2 + FACE, z, 0); wall(walls[k++ % walls.length], W / 2 - FACE, z, PI); }
  put('Door_Frame_Square', 0, 0, D / 2, 0);
  // Pipes up to the ceiling where the hall has columns, and crates where it has his statues.
  for (const x of [-12.5, 12.5]) for (const z of [-11, -4, 3, 10]) put('Column_Pipes', x, 0, z, x > 0 ? PI : 0);
  for (const x of [-7, 7]) { put('Prop_Crate4', x, 0.56, -12.2, 0.2 * x); put('Prop_Crate3', x + 0.1, 1.68, -12.3, -0.3); }
  // What has been left about.
  for (const [name, x, y, z, yaw] of [['Prop_Barrel_Large', -16.8, 0, 13.2, 0], ['Prop_Barrel_Large', -15.9, 0, 13.8, 0], ['Prop_Crate4', 16.2, 0.56, 13.0, 0.4],
    ['Prop_Computer', -3.4, 0, 14.2, PI], ['Prop_Vent_Wide', 9, 3.4, -14.9, 0], ['Prop_Vent_Wide', -9, 3.4, -14.9, 0], ['Prop_Chest', 16.5, 0, -13.2, PI / 2]]) put(name, x, y, z, yaw);
  scene.add(kit.finish());
  // (the kit's glass is grey and solid: out here the windows are for looking out of)
  kit.group.traverse((o) => {
    if (!o.isMesh || o.material.name !== 'M_Glass') return;
    o.material = o.material.clone();
    Object.assign(o.material, { transparent: true, opacity: 0.14, depthWrite: false, roughness: 0.05, metalness: 0.2 });
    o.material.color.set(0x9fb8d8);
    o.castShadow = false;
  });
  // The airlock, shut, and its red light (it flares as they hit it: lounge.hit).
  for (const half of [-1, 1]) {
    const panel = pieces.Door_Metal.clone(true);
    panel.position.set(0, 0, D / 2);
    panel.rotation.y = half < 0 ? 0 : PI;
    scene.add(panel);
  }
  room.airlock = new THREE.PointLight(0xff2a14, 4, 9, 1.8);
  room.airlock.position.set(0, 4.3, D / 2 - 1.2);
  scene.add(room.airlock);
  add(new THREE.SphereGeometry(0.12, 12, 8), glow(0xff3a20), 0, 4.55, D / 2 - 0.35);

  // Beyond the windows: the floor of the crater, its rim, the stars, and the Earth, low and blue.
  const view = new THREE.Mesh(new THREE.PlaneGeometry(64, 16), new THREE.MeshBasicMaterial({ map: crater(), toneMapped: false, color: 0xb0b0b0, fog: false }));
  view.position.set(0, 1.6, -D / 2 - 9);
  scene.add(view);

  // Worn carpet under the tables (and a strip from the airlock).
  const loader = new THREE.TextureLoader(), base = `${import.meta.env.BASE_URL}textures/deadair/`;
  const carpet = (w, d, x, z) => {
    const map = loader.load(`${base}carpet.jpg`), normal = loader.load(`${base}carpet_nor.jpg`);
    map.colorSpace = THREE.SRGBColorSpace;
    for (const t of [map, normal]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(w / 3, d / 3); }
    add(new THREE.PlaneGeometry(w, d).rotateX(-PI / 2), std(0x8a7a70, 0.95, { map, normalMap: normal }), x, 0.014, z);
  };
  carpet(9, 8, TABLE.x, TABLE.z + 0.6);
  carpet(7.5, 5, ROU.x, ROU.z + 0.4);
  carpet(3, 9, 0, 10.5);

  // Light: lamps on chains over the tables, warm (the only warm light out here); a cold one over the slots that has
  // seen better days; and the dark everywhere else.
  room.chandeliers = [];
  const shade = std(0x1c1d20, 0.5, { metalness: 0.7, side: THREE.DoubleSide }), chain = std(0x3a3b3e, 0.6, { metalness: 0.6 });
  const lamp = (x, z, colour, power, drop) => {
    const g = new THREE.Group();
    g.position.set(x, CEILING, z);
    add(new THREE.CylinderGeometry(0.012, 0.012, drop, 5).translate(0, -drop / 2, 0), chain, 0, 0, 0, g);
    add(new THREE.CylinderGeometry(0.12, 0.62, 0.42, 20, 1, true).translate(0, -drop - 0.1, 0), shade, 0, 0, 0, g);
    add(new THREE.SphereGeometry(0.09, 10, 8), bulb, 0, -drop - 0.22, 0, g);
    scene.add(g);
    room.chandeliers.push(g);
    const light = new THREE.PointLight(colour, power, 13, 1.7);
    light.position.set(x, CEILING - drop - 0.35, z);
    scene.add(light);
    return light;
  };
  lamp(TABLE.x, TABLE.z, 0xffc78a, 42, 1.1);
  lamp(ROU.x - 1.2, ROU.z, 0xffc78a, 30, 1.2);
  lamp(ROU.x + 1.6, ROU.z, 0xffc78a, 22, 1.2);
  lamp(-W / 2 + 3, -6, 0xb8c8ff, 9, 0.8);
  lamp(-W / 2 + 3, 6, 0xb8c8ff, 9, 0.8);
  lamp(0, 9, 0xffc78a, 12, 0.9);

  // The stage: a riser with a lit lip, a curtain behind it, rails at its sides, a mic in the middle, three spots that
  // are off, and a sign. Empty. (lounge.js's open mic.)
  {
    const riser = add(new THREE.BoxGeometry(STAGE.w, STAGE.h, STAGE.d), std(0x1a1b1f, 0.6, { metalness: 0.5 }), STAGE.x, STAGE.h / 2, STAGE.z);
    riser.receiveShadow = true;
    add(new THREE.BoxGeometry(STAGE.w, 0.03, 0.04), glow(0xffcf4a), STAGE.x, STAGE.h, STAGE.z - STAGE.d / 2);   // (the lip, lit)
    const curtain = add(new THREE.PlaneGeometry(STAGE.w + 1.2, 3.6, 24, 1), std(0x6a0d12, 0.9, { map: curtainTexture(), side: THREE.DoubleSide }), STAGE.x, 1.9, D / 2 - FACE + 0.08);
    curtain.rotation.y = PI;
    for (const sx of [-1, 1]) put('Platform_Rails_4', STAGE.x + sx * (STAGE.w / 2 - 0.2), STAGE.h, STAGE.z, sx > 0 ? PI / 2 : -PI / 2);
    const steel = std(0x9a9ca2, 0.35, { metalness: 0.8 });
    add(new THREE.CylinderGeometry(0.16, 0.2, 0.03, 16), steel, STAGE.x, STAGE.h + 0.015, STAGE.z - 0.3);           // the mic stand: its foot
    add(new THREE.CylinderGeometry(0.014, 0.014, 1.35, 8), steel, STAGE.x, STAGE.h + 0.69, STAGE.z - 0.3);          // the pole
    const boom = add(new THREE.CylinderGeometry(0.011, 0.011, 0.5, 8), steel, STAGE.x, STAGE.h + 1.46, STAGE.z - 0.5); boom.rotation.x = -0.9;
    room.stageMic = add(new THREE.CapsuleGeometry(0.035, 0.09, 4, 10), std(0x202226, 0.5, { metalness: 0.6 }), STAGE.x, STAGE.h + 1.6, STAGE.z - 0.72);   // the mic (the star takes it off the stand)
    room.stageSpots = [-1.8, 0, 1.8].map((dx, i) => {
      const spot = new THREE.SpotLight(i === 1 ? 0xfff0c0 : i ? 0xff8a6a : 0x8ab8ff, 0, 11, 0.42, 0.5, 1.1);
      spot.position.set(STAGE.x + dx, CEILING - 0.2, STAGE.z - 2.2);
      spot.target.position.set(STAGE.x + dx * 0.5, STAGE.h + 1.2, STAGE.z);
      spot.userData.ph = i * 2.1;
      scene.add(spot, spot.target);
      add(new THREE.CylinderGeometry(0.1, 0.16, 0.3, 12), std(0x1c1d20, 0.5, { metalness: 0.7 }), STAGE.x + dx, CEILING - 0.3, STAGE.z - 2.2);
      return spot;
    });
    const mic = FIT.sign(['OPEN MIC', 'EVERY NIGHT  ·  NOBODY CAME'], 4.2, 1.0, { size: 0.42, color: '#ffb44a', board: '#0d0b09' });
    mic.position.set(STAGE.x, 3.9, D / 2 - 0.62);
    mic.rotation.y = PI;
    scene.add(mic);
  }
  // Signs: the room's name over the airlock; the rules and the house's take on the far wall, by his table.
  const title = FIT.sign(['CREW LOUNGE', 'DECK C  ·  KEEP THE AIRLOCK SEALED'], 6.4, 1.2, { size: 0.42, color: '#ffb44a', board: '#0d0b09' });
  title.position.set(0, 3.95, D / 2 - 0.62);
  title.rotation.y = PI;
  const rules = FIT.sign(['BLACKJACK PAYS 3 TO 2', 'DEALER STANDS ON 17'], 4.4, 1.0, { size: 0.42, color: '#d8cdb8', board: '#0d0b09' });
  rules.position.set(TABLE.x - 5.2, 3.5, -D / 2 + 0.62);
  room.houseSign = FIT.sign(['BABITUS GOYITUS', 'THE HOUSE HAS TAKEN 0'], 4.4, 1.0, { size: 0.42, color: '#ffd76a', board: '#0d0b09' });
  room.houseSign.position.set(TABLE.x + 5.2, 3.5, -D / 2 + 0.62);
  scene.add(title, rules, room.houseSign);
}

// A curtain: red velvet, in folds (light and dark bands, with a little noise).
function curtainTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  for (let x = 0; x < 512; x++) {
    const fold = 0.55 + 0.45 * Math.sin(x / 512 * Math.PI * 22) ** 2, n = (Math.random() - 0.5) * 0.08;
    g.fillStyle = `rgb(${Math.round(150 * (fold + n))}, ${Math.round(22 * fold)}, ${Math.round(28 * fold)})`;
    g.fillRect(x, 0, 1, 128);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// The crater, out of the windows: the Earth hanging over the rim, stars, grey rock under a black sky.
function crater() {
  const c = document.createElement('canvas'); c.width = 2048; c.height = 512;
  const g = c.getContext('2d'), w = c.width, h = c.height;
  g.fillStyle = '#000002'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 900; i++) { const b = Math.random() ** 3; g.fillStyle = `rgba(230,236,255,${0.25 + 0.75 * b})`; g.fillRect(Math.random() * w, Math.random() * h * 0.6, 1 + b * 1.6, 1 + b * 1.6); }
  // the Earth: a fat crescent, blue and white
  const ex = w * 0.58, ey = h * 0.33, er = 46;
  const earth = g.createRadialGradient(ex - 25, ey - 10, 8, ex, ey, er);
  earth.addColorStop(0, '#bfe0ff'); earth.addColorStop(0.55, '#3d7ec9'); earth.addColorStop(1, '#0d2340');
  g.fillStyle = earth; g.beginPath(); g.arc(ex, ey, er, 0, PI * 2); g.fill();
  g.fillStyle = 'rgba(0,0,2,0.93)'; g.beginPath(); g.arc(ex + 34, ey + 8, er * 0.95, 0, PI * 2); g.fill();
  // the rim, far off, and the crater floor, nearer, lit only by the Earth
  const ridge = (base, rough, colour) => { g.fillStyle = colour; g.beginPath(); g.moveTo(0, h); for (let x = 0; x <= w; x += 16) g.lineTo(x, base - rough * (0.5 + 0.5 * Math.sin(x * 0.004 + base) * Math.sin(x * 0.011)) - Math.random() * rough * 0.15); g.lineTo(w, h); g.fill(); };
  ridge(h * 0.58, 70, '#25272e');
  ridge(h * 0.66, 34, '#3a3c44');
  const floor = g.createLinearGradient(0, h * 0.66, 0, h);
  floor.addColorStop(0, 'rgba(92,96,108,0.55)'); floor.addColorStop(1, 'rgba(26,27,31,0.95)');
  g.fillStyle = floor; g.fillRect(0, h * 0.68, w, h * 0.32);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
