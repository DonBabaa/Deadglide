// Why you are down here, and what to do about it. Four things, one after the other, each a line at the top left of
// the screen: get the power on (the Reactor's core), get a signal out (the Med Bay's uplink), hold out until the shuttle
// comes, and get everyone to Dock 1. Then you are out, and that is a win.
//
// And the cut-ins that tell it: the way in (everyone lined up, lit by their cigarettes, before the station takes them),
// and the Golden Hour (what it is, and what it does). Dave the Diver cut-ins: hard cuts, snap zooms, speed lines.
//
// And the tips: a line the first time something new is in front of you, once per browser; and the help card (H or Tab).
//
//   const story = createStory(ctx);   ctx: { station, hud, sound, walker, dead, others, camera, game(), me(), everyone(), hosting(), tell, say, playLighter, onPower, onWin, tip }
//   story.update(dt)   story.offer(pos) -> { text, price, act } | null   story.entrance(dt) -> true while it plays
//   story.goldenShot(t, C, k, ...) -> what the camera and the screen do
import * as THREE from 'three';
import { CORE, UPLINK, NINE_DAYS, signTexture } from './station.js';
import { LIFT_BAY } from './lift.js';

export const STEPS = [
  { id: 'power', title: 'RESTORE POWER', detail: 'The deck is dark. Prime the core in the Reactor.', at: () => new THREE.Vector3(CORE.x, 0, CORE.z), hold: 8 },
  { id: 'signal', title: 'SEND THE SIGNAL', detail: 'Every channel is dead air. Start the Med Bay uplink, and keep it alive.', at: () => new THREE.Vector3(UPLINK.x, 0, UPLINK.z), hold: 45 },
  { id: 'hold', title: 'HOLD OUT', detail: 'They heard you. The lift is coming back down: hold until round', at: null },
  { id: 'escape', title: 'GET TO THE LIFT', detail: 'The lift is down, at the west end of the Arrival Bay. Everyone in: hold a rail (E); the last one in pulls the lever (F).', at: () => new THREE.Vector3(LIFT_BAY.x, 0, LIFT_BAY.z), hold: 4 },
  { id: 'out', title: 'YOU GOT OUT', detail: '', at: null },
];
const HOLD_ROUNDS = 3;
// What Kirky (and the shuttle) say, as it goes. [who, line]
const LINES = {
  begin: ['Kirky', 'Power first. Then the radio. Then home, and I never leave the dome again.'],
  power: ['Kirky', 'Lights. Great. Now I can see what has been eating the crew.'],
  signalOn: ['Kirky', 'This is Deck C. We have a situation. Send the lift back down. Send it now.'],
  signalOff: ['Dome control', 'Copy, Deck C. The lift is on its way. Three rounds. Hold on.'],
  holdOn: ['Kirky', '"Hold on," he says.'],
  hold: ['Kirky', 'That is our ride. Dock 1. Nobody stops to loot.'],
  out: ['Kirky', 'Next time, we take the stairs.'],
  benny: ['Dome control', 'Deck C. How many?'],
  kept: ['Kirky', 'They kept the days. Someone should know.'],
  log1: ['Kirky', 'Nine days. He kept the days.'],
  log3: ['Kirky', '...'],
  log5: ['Kirky', 'Dima.'],
  log7: ['Kirky', 'He took the shuttle. ...So it is the lift, or nothing.'],
  log9: ['Kirky', '...We were here.'],
  chip: ['Kirky', 'G.O.Y. ...He signs everything.'],
  showOver: ['Kirky', 'That never happened.'],
};
// A line the first time each of these is in front of you.
export const TIPS = {
  start: 'Your objective is at the top left  ·  H or Tab: the help card, every control and feature',
  melee: 'F: melee when one is on you  ·  it knocks them back',
  reload: 'R: reload  ·  a wall gun sells ammo for a gun you carry (E)',
  gold: 'Gold is for the Crew Lounge tables, behind the Med Bay: unseal it with E',
  door: 'Doors cost points  ·  a hit is 10, a kill 60, a headshot 100',
  down: 'Down: shoot from the floor  ·  a friend holds E to get you up  ·  you bleed out in 30 s',
  golden: 'G: the Golden BOOF is charged  ·  30 seconds of triple damage, free ammo, double points',
  boof: 'Every kill charges the Golden BOOF (bottom left)  ·  at 25, press G',
  duct: 'The crawlspace: W on, S back  ·  no gun down there  ·  it is the old shaft access, and not only yours',
  crate: 'The crate rolls a gun for 950  ·  take it within 9 seconds or it is gone',
  pickup: 'MAX AMMO fills every gun you carry  ·  NUKE kills everything alive',
  lounge: 'The Crew Lounge is safe  ·  gamble gold at the tables for upgrades  ·  the drinks are perks',
  warden: 'The Warden: broad, slow, every fifth round  ·  500 bounty to whoever drops him',
  signal: 'The uplink draws them: every one of them in the station is coming here',
  grab: 'Grabbed: mash F to throw it off  ·  a friend can shoot it off you  ·  it bites in three seconds',
  dance: 'T: dance  ·  there is an open mic in the Crew Lounge',
  screamer: 'A screamer: the yellow one  ·  it calls the others  ·  kill it first (100 extra)',
  chip: "Babitus's chip: G.O.Y  ·  worth 500 gold at the Crew Lounge tables  ·  he signs everything",
};
// The station's PA, between rounds: recorded messages from a crew that is not there any more. (And one for the dark.)
export const PA = [
  'This is a recorded message. All crew to their stations. All crew... all crew...',
  'Reminder: the Crew Lounge is for off-duty personnel only. Off-duty is everyone. Now.',
  'Medical reports a minor incident in the Med Bay. Minor. Mostly.',
  'The surface lift is out of service until further notice. Further notice is not coming.',
  'Please do not feed the research subjects.',
  'Day nine. Still no carrier. The station thanks you for your patience.',
  'If you can hear this, you are not the crew. Please leave.',
  'Life support is nominal. Life is not.',
  'The Warden has left his post. The Warden has left his post. The Warden has...',
  'Would the owner of the hat please come to the Reactor. The hat is fine. Come anyway.',
];
export const PA_DARK = 'Power rerouted to life support. Lights out on Deck C. Good luck.';
// On the card, when it is over: what it said on the stone.
export const EPITAPHS = [
  'He died as he lived: reloading.',
  'Kirky\'s last words: "I\'ve got this."',
  'Cause of death: the Med Bay. He opened it.',
  'He was going to quit smoking next week.',
  'They found his hat. They did not find the rest.',
  'He pressed E. It was not a door.',
  'Last seen running toward the noise.',
  'His best round was still ahead of him. So were they.',
  'Nobody dies before the lift, he said.',
  'The lighter caught on the third go. He did not.',
];
const S = THREE.Vector3;

export function createStory(ctx) {
  const { station, hud, sound, walker, dead, others, camera } = ctx;
  let seen = new Set();
  try { seen = new Set(JSON.parse(localStorage.getItem('deadair.tips') || '[]')); } catch {}
  const tip = (id) => { if (seen.has(id) || !TIPS[id]) return; seen.add(id); try { localStorage.setItem('deadair.tips', JSON.stringify([...seen])); } catch {} hud.tip(TIPS[id]); };
  let saying = null, sayFor = 0;   // the line on the screen now, and for how long
  const speak = (key) => { const L = LINES[key]; if (!L) return; saying = L; sayFor = 5.5; hud.say(L[0], L[1]); };
  // Any line at all (the ending's count).
  const line = (who, text) => { saying = [who, text]; sayFor = 5.5; hud.say(who, text); };
  const st = () => ctx.game().story;
  let lastStep = -1, lastK = -1, blink = 0;

  // ---- The objective, each frame: the host moves it on; everyone shows it. ----
  function update(dt) {
    const game = ctx.game(), s = game.story, step = STEPS[s.step];
    if (sayFor > 0 && (sayFor -= dt) <= 0) { saying = null; hud.say('', ''); }
    if (!step || game.over) { show(); return; }
    if (ctx.hosting() || !ctx.coop()) run(dt, game, s, step);
    show();
  }
  function run(dt, game, s, step) {
    const folk = ctx.everyone().filter((p) => p.alive && !p.safe);
    if (step.id === 'power') {
      // Priming: someone has to stand by it. It fills while anyone is there, and leaks when nobody is.
      if (s.busy) {
        const near = folk.some((p) => p.pos.distanceTo(step.at()) < 3.2);
        s.k = Math.max(0, Math.min(1, s.k + (near ? dt / step.hold : -dt / 6)));
        if (!near && s.k <= 0) { s.busy = ''; sync(); }
        if (s.k >= 1) { advance('power'); ctx.onPower(); hud.banner('POWER RESTORED', 0x9ae6ff); }
      }
    } else if (step.id === 'signal') {
      if (s.busy) {
        // (with friends, the dish only turns while one of you cranks it: the console alone sends nothing)
        const cranked = !ctx.coop() || (ctx.cranking?.() ?? true);
        s.k = Math.min(1, s.k + (cranked ? dt / step.hold : 0));
        // (the uplink is a siren to them)
        if ((blink += dt) > 2) { blink = 0; dead.heard(step.at().clone().setY(1.2)); }
        if (s.k >= 1) { advance('signalOff'); s.until = game.round + HOLD_ROUNDS; sync(); hud.banner('SIGNAL SENT', 0x7dffb0); setTimeout(() => speak('holdOn'), 4200); }
      }
    } else if (step.id === 'hold') {
      if (game.round >= s.until && game.left <= 0 && dead.alive === 0) { advance('hold'); docked(); }
    } else if (step.id === 'escape') {
      // (the rails, and the lever: index.js's boarding; it says when the lever is pulled, and plays the way out; the win comes at the end of that)
      s.k = ctx.seated ? ctx.seated() : 0;
      if (ctx.hatchShut?.() && (ctx.hosting() || !ctx.coop())) { s.step++; s.k = 0; s.busy = ''; sync(); }
    }
  }
  // The signal answered: the lift is sent back down (index.js moves it; the cut-in shows it coming).
  function docked() {
    hud.banner('THE LIFT IS COMING', 0xffcf4a); sound.station?.();
    ctx.liftCall?.();
  }
  function advance(line) { const s = st(); s.step++; s.k = 0; s.busy = ''; sync(); speak(line); sound.sting?.(0.8); }
  function sync() { const s = st(); ctx.tell({ da: 'story', s: [s.step, Math.round(s.k * 1000) / 1000, s.until, s.busy] }); }
  // A guest: the host's word on it (in the snapshot, and when it changes).
  function apply(arr) {
    if (!Array.isArray(arr)) return;
    const s = st(), step = +arr[0] || 0;
    if (step !== s.step) {
      const went = step > s.step;
      s.step = step; s.k = 0;
      if (went) { const id = STEPS[step - 1]?.id; if (id === 'power') { ctx.onPower(); hud.banner('POWER RESTORED', 0x9ae6ff); speak('power'); } else if (id === 'signal') { hud.banner('SIGNAL SENT', 0x7dffb0); speak('signalOff'); } else if (id === 'hold') { docked(); speak('hold'); } else if (id === 'escape') ctx.onWin(); }
    }
    s.k = +arr[1] || 0; s.until = +arr[2] || 0; s.busy = String(arr[3] || '');
  }
  // Someone (a guest) pressed E at the core or the uplink: the host starts it.
  function begin(what) {
    const s = st(), step = STEPS[s.step];
    if (!step || step.id !== what || s.busy) return;
    s.busy = what; s.k = Math.max(s.k, 0.001);
    if (what === 'signal') { speak('signalOn'); tip('signal'); }
    sync();
    ctx.tell({ da: 'began', what });
  }

  // The PA: a crackle, a line, a crackle. i < 0: the lights-out one.
  function pa(i) {
    const line = i < 0 ? PA_DARK : PA[((i % PA.length) + PA.length) % PA.length];
    sound.pa?.();
    setTimeout(() => { saying = ['PA', line]; sayFor = 6; hud.say('PA', line); }, 350);
  }

  function show() {
    const game = ctx.game(), s = game.story, step = STEPS[s.step];
    if (!step) { hud.objective('', '', -1); return; }
    const me = ctx.me();
    let detail = step.detail;
    if (step.id === 'hold') detail = `${step.detail} ${s.until}  ·  this is round ${game.round}`;
    else if (step.at) {
      const d = Math.round(me.pos.distanceTo(step.at()));
      if (step.id === 'power' && !station.isOpenZone('r')) detail += `  ·  the Reactor door: two keys, KEY A in the bay, KEY B in Lab 2`;
      else if (step.id === 'signal' && !station.isOpenZone('m')) detail += `  ·  the Med Bay door is 1000`;
      detail += `  ·  ${d} m`;
    }
    const k = s.busy || step.id === 'escape' ? s.k : -1;
    hud.objective(step.title, detail, k, lastStep !== s.step);
    lastStep = s.step; lastK = k;
  }

  // Press E at the core, or the uplink: what it says, and what it does.
  function offer(pos) {
    const s = st(), step = STEPS[s.step];
    if (!step || !step.at) return null;
    if (step.id === 'power' && station.isOpenZone('r') && pos.distanceTo(step.at()) < 2.8 && !s.busy) {
      const hands = ctx.atCore?.() ?? 1, need = (ctx.party?.() ?? 1) >= 4 ? 2 : 1;   // (four of you: the rod takes two hands)
      if (hands < need) return { text: `The rod takes two hands  ·  ${hands} of 2 of you at the core`, price: 0, act: () => {} };
      return { text: need > 1 ? 'Press E to prime the core  ·  two of you: stay by it while it charges' : 'Press E to prime the core  ·  stay by it while it charges', price: 0, act: () => { if (ctx.hosting() || !ctx.coop()) begin('power'); else ctx.say({ da: 'begin', what: 'power' }); } };
    }
    if (step.id === 'signal' && station.isOpenZone('m') && pos.distanceTo(step.at()) < 3.2 && !s.busy) return { text: ctx.coop() ? 'Press E to start the uplink  ·  45 seconds, and only while one of you cranks the dish (at the wheel: the mouse round in circles)' : 'Press E to start the uplink  ·  45 seconds of broadcast, and they will all hear it', price: 0, act: () => { if (ctx.hosting() || !ctx.coop()) begin('signal'); else ctx.say({ da: 'begin', what: 'signal' }); } };
    return null;
  }

  // ---- The way in ----
  // The way in: the cage coming down the shaft with the lot of them in it, the landing that throws them off their feet,
  // the dark, the lamps clicking on one by one, Kirky's lighter that will not catch, the PA, the name of the place.
  // It tells you where you are and what to do. Click skips it.
  const L = 7.6;              // the landing (the lift lands at 6.8)
  // ...and at the end of it (his ask): out of the lift and into the bay, a line of them, the torches on one by one, a
  // puff each in the beams, and then the name of the place.
  const OUT = L + 16.0, WALK = 3.6, TORCH = OUT + WALK + 0.3, PUFF = TORCH + 3.2, SMOKE = PUFF + 2.9, NAME = SMOKE + 2.7;   // (NAME: 36.3, on the cue's hit)
  const ENTRANCE = NAME + 3.0;
  const cast = [];   // [{ k: SkaterModel, pos, face, drag, look, id, rail }]: him, and the friends who are here
  let lit = 0, board = null, welcomed = false, landed = false;
  function stage() {
    cast.length = 0;
    const c = walker.pos.clone(), face = walker.face, front = new S(Math.sin(face), 0, Math.cos(face)), side = new S(front.z, 0, -front.x);
    const folk = [{ k: walker.model, id: 'me' }, ...[...others.map.values()].map((o) => ({ k: o.model, id: o.id }))].slice(0, 4);
    const n = folk.length;
    const lift = ctx.lift?.(), rails = lift ? lift.rails : [];
    folk.forEach(({ k, id }, i) => {
      const pos = c.clone().addScaledVector(side, (i - (n - 1) / 2) * 1.15).addScaledVector(front, (i % 2) * 0.35);
      const line = c.clone().addScaledVector(front, 5.2).addScaledVector(side, (i - (n - 1) / 2) * 1.45);   // (where each stops, in the line)
      cast.push({ k, id, pos, from: pos.clone(), line, face, drag: 1.2 + i * 0.9, look: 0.6 + i * 1.7, lamp: TORCH + 0.35 + i * 0.7, puff: PUFF + i * 0.3, rail: rails[i % Math.max(1, rails.length)] || pos });
    });
    cast.lineC = c.clone().addScaledVector(front, 5.2);
    lit = 0; welcomed = false; landed = false;
    ctx.liftIn?.();
    // (his board, come down with them: snapped across the deck by the landing, the two halves on the plates in front of him:
    // the tail upside down, wheels in the air; the nose on its own trucks with its broken end on the floor)
    const k = walker.model;
    if (k.board && ctx.scene) {
      const [tail, nose] = snapBoard(k.board);
      // (the two halves end to end across the break, a hand's width apart, across his path: the tail flipped, wheels in the
      // air; the nose turned off the line, its broken end dug into the plates)
      const B = c.clone().addScaledVector(front, 1.7).addScaledVector(side, 0.1), yawB = face + Math.PI / 2, CUT = 0.035;
      const tailG = new THREE.Group(); tailG.position.copy(B).setY(0.035); tailG.rotation.set(0, yawB, Math.PI); tailG.add(tail);
      const noseG = new THREE.Group(); noseG.position.copy(B).setY(0.12); noseG.rotation.set(0, yawB, 0);
      const pivot = new THREE.Group(); pivot.position.set(0, 0, CUT + 0.16); pivot.rotation.set(0.28, 0.5, 0.06); noseG.add(pivot);
      nose.position.set(0, 0, -CUT); pivot.add(nose);
      board = new THREE.Group(); board.add(tailG, noseG); ctx.scene.add(board);
      board.userData.break = B.clone().setY(0.06);
      // (his lamp, knocked off him, on the plates beside it: what the board is seen by)
      const glow = new THREE.PointLight(0xffd9a0, 0, 3.2, 1.6); glow.position.copy(board.userData.break).addScaledVector(front, 0.5).addScaledVector(side, -0.35).setY(0.45); ctx.scene.add(glow); board.userData.glow = glow;
    }
  }
  function entrance(t, dt) {
    if (!cast.length) stage();
    const lift = ctx.lift?.(), LA = lift ? lift.at : walker.pos.clone(), LY = lift ? lift.y : 0, LH = lift ? lift.half : 2;
    const k = walker.model, front = new S(Math.sin(walker.face), 0, Math.cos(walker.face)), side = new S(front.z, 0, -front.x), mid = walker.pos.clone();
    const down = t >= 6.8;                 // (landed: thrown out of the cage, onto the plates)
    const heap = down && t < L + 4.8;
    if (down && !landed) { landed = true; sound.slam?.(LA.clone().setY(0.3)); sound.thud?.(mid.clone().setY(0.2)); sound.sting?.(0.7); }
    for (const c of cast) {
      c.k.root.visible = true;
      if (!down) {   // (in the cage, a hand on a rail, looking at the floor coming up)
        c.k.root.position.copy(c.rail).setY(LY); c.k.root.rotation.set(0, Math.atan2(LA.x - c.rail.x, LA.z - c.rail.z), 0);
        c.k.play?.('pistolidle', 1, 1, undefined, false);
      } else {
        c.k.root.position.copy(c.pos); c.k.root.rotation.set(0, c.face + (heap ? 0.5 * Math.sin(c.look) : 0), 0);
        // (down in a heap, where the landing threw them: the clip's floor pose is its last frame, held there. Told through the
        // walker's (and party.js's) own forceClip: their updates play their own clip and pose the body before this runs, so a
        // play() from here would always be a frame too late and never show)
        const at = Math.min(1.98, 0.9 + (t - 6.8) * 2.4), friend = c.id === 'me' ? null : others.map.get(c.id);
        if (heap) { if (c.id === 'me') walker.forceClip = { name: 'fallover', at }; else if (friend) friend.forceClip = { name: 'fallover', at }; else c.k.play?.('fallover', 1, 1, at, false); }
        else if (t >= OUT) {   // (out of the lift and into the line: walking, then stood, square on)
          const e = Math.min(1, (t - OUT) / WALK), w = e * e * (3 - 2 * e);
          c.pos.lerpVectors(c.from, c.line, w);
          const clip = e < 0.97 ? { name: 'walk' } : { name: 'idle' };
          if (c.id === 'me') { walker.forceClip = clip; walker.pos.set(c.pos.x, walker.pos.y, c.pos.z); } else if (friend) friend.forceClip = clip; else c.k.play?.(clip.name, 1, 1, undefined, false);
          c.k.root.position.copy(c.pos);
        }
        else { if (c.id === 'me') walker.forceClip = null; else if (friend) friend.forceClip = null; c.k.play?.('pistolidle', 1, 1, undefined, false); }
      }
      const drag = Math.max(0, 1 - Math.abs(((t + 4 - c.drag) % 4.2) - 0.5) * 3);
      const p2 = SMOKE + 0.1 + (c.puff - PUFF);   // (and a second drag, in the quiet after it)
      c.k.inhale = t > L + 9.0 && t < L + 12.6 ? drag : t >= c.puff && t < c.puff + 0.9 ? Math.min(1, (t - c.puff) * 2.5) : t >= p2 && t < p2 + 0.7 ? Math.min(1, (t - p2) * 2.5) : 0;
      if ((t >= c.puff + 0.9 && t < c.puff + 2.3) || (t >= p2 + 0.7 && t < p2 + 2.3)) c.k.exhale?.(dt, 1.1);   // (the puff: out into the torches' beams)
      const sweep = Math.sin(t * 0.9 + c.look) * 0.5, lookAt = c.pos.clone().addScaledVector(front, 8).addScaledVector(side, sweep * 5).setY(1.1);
      c.k.updateArm?.(dt, lookAt, false);
      c.k.updateSmoke?.(dt);
      // (the lamps: each clicks on in its turn)
      if (!heap && down && t >= c.lamp && !c.lit) { c.lit = true; if (c.id === 'me') { walker.power = 1; sound.swap?.(); } else ctx.lampOn?.(c.id, c.pos); }
    }
    walker.view.visible = false;
    const mouth = k.ember ? k.ember.getWorldPosition(new S()) : mid.clone().setY(1.45);
    let cam, at, fov, lines = 0, flash = 0, title = '', sub = '', kk = 0, say = null;
    const inCage = (dx, dz, y) => new S(LA.x + dx, LY + y, LA.z + dz);
    if (t < 3.0) {           // from the bay floor, up the shaft: the cage's lamp coming down out of the dark
      const s = t / 3.0;
      cam = new S(LA.x + 1.3, 1.0, LA.z + 1.5); at = new S(LA.x, LY + 1.2, LA.z); fov = 56 - 10 * s;
      walker.power = 0; lines = 0.4; flash = s < 0.05 ? 0.4 : 0;
      title = 'SHACKLETON STATION'; sub = 'Deck C  ·  nine days after the last transmission'; kk = Math.min(1, s * 2.5);
      if (t - dt <= 0) sound.sting?.(0.5);
    } else if (t < 6.4) {    // inside the cage: the four of them at the rails, the shaft's strips streaming up past
      const s = (t - 3.0) / 3.4;
      const far = cast[Math.min(cast.length - 1, 1)] || cast[0];
      cam = inCage(0.8, -0.8, 1.55); at = far.rail.clone().setY(LY + 1.25); fov = 46; lines = 0.5;
      walker.power = 0;
      say = ['Dome control', s < 0.5 ? 'Deck C in five. Mind the stop: the brake is not what it was.' : 'Four. Three. Two.'];
    } else if (t < L) {      // the slam: a flash, black, the lamp dying
      const s = (t - 6.4) / (L - 6.4);
      // (under the shaft, up at the cage's lamp as it comes down the last of it at us; as it hits, low in the bay through the gateway)
      if (down) { cam = new S(LA.x + LH + 2.6, 0.5, LA.z + 1.2); at = new S(LA.x, 1.0, LA.z); fov = 50; }
      else { cam = new S(LA.x + 1.2, 0.6, LA.z + 1.4); at = new S(LA.x, Math.max(1.2, LY + 1.2), LA.z); fov = 58 - 6 * s; }
      flash = down && t < 7.1 ? 1 : 0; walker.power = 0; lines = down ? 0 : 0.7;
      if (t > 7.1) { title = ''; }
    } else if (t < L + 4.8) {    // the heap: low along the plates, the lot of them down, his board against the wall
      const s = (t - L) / 4.8;
      cam = mid.clone().addScaledVector(front, -1.85).addScaledVector(side, 0.55 - 0.3 * s).setY(0.5); at = mid.clone().addScaledVector(front, 0.5).setY(0.35); fov = 46;   // (from past his head, low, in the lift's open gateway: along him, the others beyond)
      walker.power = 0.3; lines = s < 0.08 ? 0.5 : 0; flash = s < 0.05 ? 0.6 : 0;
      if (s > 0.2 && s < 0.55) say = ['Kirky', '...Mind the stop, he said.'];
      else if (s >= 0.55) {   // (the board: low over the break, the two halves in the lamp, him flat out beyond)
        const B = board?.userData.break || mid.clone().addScaledVector(front, 1.65);
        const u = (s - 0.55) / 0.45;
        cam = B.clone().addScaledVector(front, 0.95 - 0.1 * u).addScaledVector(side, 0.35).setY(0.8 - 0.08 * u); at = B.clone().addScaledVector(front, -0.15).setY(0.04); fov = 40;   // (down at the break, close: him flat out beyond it)
        say = ['Kirky', '...No board. Great.']; flash = u < 0.04 ? 0.3 : 0;
        if (board?.userData.glow) board.userData.glow.intensity = 4.5 * Math.min(1, u * 6);
      }
    } else if (t < L + 9.0) {    // up: along the line of faces, each lamp clicking on in its turn
      const s = (t - L - 4.8) / 4.2, n = cast.length;
      const from = mid.clone().addScaledVector(side, -(n - 1) / 2 * 1.15 - 0.8).addScaledVector(front, 2.4).setY(1.3), to = mid.clone().addScaledVector(side, (n - 1) / 2 * 1.15 + 0.8).addScaledVector(front, 2.4).setY(1.3);
      cam = from.lerp(to, s); const who = cast[Math.min(n - 1, Math.max(0, Math.round(s * (n - 1))))]; at = (who ? who.pos.clone() : mid.clone()).addScaledVector(front, 0.1).setY(1.45); fov = 34;   // (on the face the camera is passing, from a little under it)
      if (!cast[0].lit) walker.power = 0;
      lines = s < 0.06 ? 0.6 : 0;
      say = ['Kirky', s < 0.3 ? 'Everyone up.' : s < 0.6 ? '...Nobody broke anything. Nobody but the board.' : 'The lift is going back without us. ...Of course it is.'];
    } else if (t < L + 12.6) {   // his face: the lighter that will not catch; when it does, what it lights first is her hand on the wall
      const s = (t - L - 9.0) / 3.6;
      const click = [0.15, 0.3, 0.48];
      for (const c of click) if (s >= c && s - dt / 3.6 < c) { if (c < 0.4) sound.swap?.(); else ctx.playLighter(); }
      if (s < 0.6) { cam = mouth.clone().addScaledVector(front, 0.8).addScaledVector(side, 0.55).add(new S(0, -0.04, 0)); at = mouth.clone().add(new S(0, 0.05, 0)); fov = 34; say = ['Kirky', 'Deck is dark. Power is in the Reactor. Radio is in the Med Bay.']; }
      else { const W = NINE_DAYS, n = new S(W.nx, 0, W.nz), u = (s - 0.6) / 0.4; cam = new S(W.x, W.y - 0.35, W.z).addScaledVector(n, 3.4 - 0.5 * u).addScaledVector(side, 0.45); at = new S(W.x, W.y - 0.05, W.z); fov = 44 - 3 * u; say = ['Kirky', '...Nine days.']; lines = s < 0.66 ? 1 : 0; }   // (far enough back for both words, closing slowly)
      flash = s > 0.48 && s < 0.54 ? 0.3 : 0;
    } else if (t < L + 16.0) {   // the station: wide, from high in the corner, the four of them small in the red; the PA
      const s = (t - L - 12.6) / 3.4;
      cam = mid.clone().addScaledVector(front, 9.0 - 1.0 * s).addScaledVector(side, 5.0).setY(3.8 - 0.3 * s); at = mid.clone().addScaledVector(front, -2.5).setY(1.0); fov = 50;   // (from across the bay, high: the four of them small, the lift behind them)
      if (!welcomed) { welcomed = true; sound.welcome?.(); }
      say = ['PA', 'Welcome to Shackleton Station. Current crew complement: zero.'];
    } else if (t < TORCH) {      // out of the lift: from out in the bay, low, them walking at us and lining up
      const s = (t - OUT) / (TORCH - OUT), lc = cast.lineC || mid;
      cam = lc.clone().addScaledVector(front, 5.6 - 1.2 * s).addScaledVector(side, 0.9).setY(1.25); at = lc.clone().addScaledVector(front, -1.6 * (1 - s)).setY(1.2); fov = 50 - 4 * s;
      lines = s < 0.08 ? 0.6 : 0; flash = s < 0.04 ? 0.4 : 0;
      lift?.light?.(1);   // (the cage's lamp behind them: the light they walk out of)
      say = s > 0.55 ? ['Kirky', 'Line up. Lamps on.'] : null;
    } else if (t < PUFF) {       // the torches: along the line, each one clicking on in its turn
      const s = (t - TORCH) / (PUFF - TORCH), lc = cast.lineC || mid, n = cast.length, spread = (n - 1) * 0.72 + 0.6;
      // (from behind them and off the end of the line, along the way they face: each beam cutting out into the dark of the bay)
      cam = lc.clone().addScaledVector(front, -2.2 + 0.4 * s).addScaledVector(side, spread + 1.9).setY(1.75); at = lc.clone().addScaledVector(front, 6.5).addScaledVector(side, -0.6).setY(0.9); fov = 52;
      for (const c of cast) if (Math.abs(t - c.lamp) < 0.06) lines = 0.7;
    } else if (t < SMOKE) {      // the puff: on him, close, the smoke rolling out into the beams
      const s = (t - PUFF) / (SMOKE - PUFF), me = (cast.find((c) => c.id === 'me') || cast[0]).pos;
      // (his profile: the ember, and the cloud rolling out of him into his own beam)
      cam = me.clone().addScaledVector(side, 1.35 - 0.15 * s).addScaledVector(front, 0.45).setY(1.55); at = me.clone().addScaledVector(front, 0.55).setY(1.5); fov = 40;
      say = s > 0.6 ? ['Kirky', '...Right.'] : null;
    } else if (t < NAME) {       // the quiet (the music's held breath): a second drag, the smoke standing in his beam
      // (his face three-quarters on, from out of his beam: the second cloud rolling out of him, lit from behind by it)
      const s = (t - SMOKE) / (NAME - SMOKE), me = (cast.find((c) => c.id === 'me') || cast[0]).pos;
      cam = me.clone().addScaledVector(front, 2.3 - 0.3 * s).addScaledVector(side, -1.4 + 0.2 * s).setY(1.15); at = me.clone().addScaledVector(front, 0.6).setY(1.5); fov = 44;
    } else {                     // the name of it
      const s = (t - NAME) / (ENTRANCE - NAME);
      cam = mid.clone().addScaledVector(front, -1.8 + 0.6 * s).addScaledVector(side, -0.7).setY(1.7); at = mid.clone().addScaledVector(front, 10).setY(1.3); fov = 56;
      lines = s < 0.1 ? 1 - s * 10 : 0;
      title = s < 0.62 ? 'DEAD AIR' : ''; sub = s < 0.62 ? 'Shackleton Station  ·  Deck C' : ''; kk = Math.min(1, s / 0.62);
      say = s >= 0.62 ? ['Kirky', 'Power. Signal. The lift. Nobody dies before the lift.'] : null;
    }
    camera.position.copy(cam); camera.lookAt(at); camera.fov = fov; camera.updateProjectionMatrix();
    hud.cine(true, lines, flash, title, kk, sub, 'Click to skip', say);
    return t < ENTRANCE;
  }
  // His board in two: two copies of it, each mesh's triangles sorted by which side of the break (across the deck, a little off
  // the middle, ragged) their middle falls in the board's own space. Returns [tail, nose].
  function snapBoard(src) {
    src.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(src.matrixWorld).invert();
    const halves = [src.clone(true), src.clone(true)], from = [], into = [[], []];
    src.traverse((o) => { if (o.isMesh) from.push(o); });
    halves.forEach((h, i) => { h.visible = true; h.position.set(0, 0, 0); h.rotation.set(0, 0, 0); h.traverse((o) => { o.visible = true; if (o.isMesh) { into[i].push(o); o.castShadow = o.receiveShadow = true; } }); });
    const cut = 0.035, v = new S(), w = new S();
    const pick = (g, list) => {
      const out = new THREE.BufferGeometry();
      for (const [name, attr] of Object.entries(g.attributes)) {
        const n = attr.itemSize, arr = new attr.array.constructor(list.length * 3 * n);
        list.forEach((t, k) => { for (let c = 0; c < 3 * n; c++) arr[k * 3 * n + c] = attr.array[t * 3 * n + c]; });
        out.setAttribute(name, new THREE.BufferAttribute(arr, n, attr.normalized));
      }
      return out;
    };
    from.forEach((m, n) => {
      const M = new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld);
      const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry;
      const pos = g.attributes.position, tris = pos.count / 3, a = [], b = [];
      for (let t = 0; t < tris; t++) {
        v.set(0, 0, 0);
        for (let k = 0; k < 3; k++) v.add(w.fromBufferAttribute(pos, t * 3 + k));
        v.multiplyScalar(1 / 3).applyMatrix4(M);
        const jag = Math.sin(v.x * 95) * 0.018 + Math.sin(v.x * 37 + 1.3) * 0.012;   // (splintered, not sawn)
        (v.z + jag < cut ? a : b).push(t);
      }
      into[0][n].geometry = pick(g, a);
      into[1][n].geometry = pick(g, b);
    });
    return halves;
  }
  function entranceDone() {
    walker.forceClip = null;
    for (const c of cast) if (c.id !== 'me') { ctx.lampOn?.(c.id, null); const o = others.map.get(c.id); if (o) o.forceClip = null; }
    cast.length = 0;
    if (board) { board.userData.glow?.removeFromParent(); board.removeFromParent(); board = null; }
    walker.model.inhale = 0;
    walker.power = 1;
    hud.cine(false);
    speak('begin');
    tip('start');
  }

  // ---- The Golden Hour: what the camera does for each moment of it (index.js runs the clock and the light) ----
  //   0 - 0.6   his mouth: the gold BOOF, the drag, the ember blazing; a flash
  //   0.6 - 1.5 the nearest one of them, close: it does not know what it is looking at (speed lines, a "?")
  //   1.5 - 3.1 low in front of him, the smoke pouring gold: GOLDEN HOUR, and what it does
  //   3.1 - end the cough
  function goldenShot(t, C, head, front, side, mouth, k) {
    let cam, at, fov, lines = 0, flash = 0, title = '', sub = '', say = null, kk = 0, puff = 0;
    const WHAT = '30 seconds  ·  triple damage  ·  free ammo  ·  double points';
    if (t < 1.4) {   // "Hold up": his face, from in front and a little to the side
      const s = t / 1.4;
      cam = head.clone().addScaledVector(front, 1.25 - 0.15 * s).addScaledVector(side, 0.55).add(new S(0, -0.08, 0)); at = head.clone().add(new S(0, -0.12, 0)); fov = 36;
      say = ['Kirky', 'Hold up. Let me hit that boof.']; k.inhale = 0;
    } else if (t < 2.7) {   // the drag: the ember under the brim of his hat, flaring
      const s = (t - 1.4) / 1.3;
      cam = mouth.clone().addScaledVector(front, 0.62).addScaledVector(side, 0.24).add(new S(0, -0.06, 0)); at = mouth.clone().add(new S(0, 0.03, 0)); fov = 44 - 6 * s;
      k.inhale = Math.min(1, s * 2.2); lines = s > 0.6 ? (s - 0.6) * 2.5 : 0; flash = s > 0.9 ? (s - 0.9) * 10 : 0;
    } else if (t < 4.7) {   // the BOOF: a lungful out, a cloud rolling over everything
      const s = (t - 2.7) / 2;
      // (from his side, a little ahead: the cloud rolls out across the frame, not into the lens)
      cam = head.clone().addScaledVector(front, 1.5 + 0.3 * s).addScaledVector(side, 1.7).add(new S(0, -0.2, 0)); at = head.clone().addScaledVector(front, 0.6).add(new S(0, -0.25, 0)); fov = 50;
      k.inhale = 0; puff = s < 0.8 ? 2.2 : 0; lines = s < 0.3 ? 1 - s / 0.3 : 0; flash = s < 0.08 ? 0.6 : 0;
      title = 'BOOF'; kk = Math.min(1, s * 3);
    } else if (t < 5.7) {   // one of them, looking on
      const s = (t - 4.7) / 1;
      const z = nearestOf(head, 14);
      if (z) {
        const zf = new S(Math.sin(z.yaw), 0, Math.cos(z.yaw));
        cam = z.head.clone().addScaledVector(zf, 1.7 - 0.35 * Math.min(1, s * 3)).add(new S(0, 0.15, 0)); at = z.head.clone().add(new S(0, -0.05, 0)); fov = 44 - 8 * Math.min(1, s * 3);
        title = '?'; kk = Math.min(1, s * 2);
      } else { cam = head.clone().addScaledVector(front, 2.4).add(new S(0, -1.0, 0)).addScaledVector(side, -0.6); at = head.clone().add(new S(0, -0.3, 0)); fov = 60 - 16 * Math.min(1, s * 3); }
      lines = 1;
    } else if (t < 7.0) {   // what it does, spelled out
      const s = (t - 5.7) / 1.3;
      cam = head.clone().addScaledVector(front, 2.6 + 0.3 * s).add(new S(0, -0.6, 0)).addScaledVector(side, -0.4); at = head.clone().add(new S(0, -0.3, 0)); fov = 50;
      title = 'GOLDEN HOUR'; sub = WHAT; kk = s; say = ['Kirky', 'Thirty seconds. Everything dies.'];
    } else {   // the cough
      const s = (t - 7.0) / (C - 7.0);
      cam = head.clone().addScaledVector(front, 2.9).add(new S(0, -0.5, 0)).addScaledVector(side, -0.3 + 0.25 * Math.sin(s * 40) * (1 - s)); at = head.clone().add(new S(0, -0.3, 0)); fov = 50;
      title = 'GOLDEN HOUR'; sub = WHAT; kk = 1; say = ['Kirky', s < 0.45 ? 'Cough—' : '...I am fine. Shoot something.'];
      if (s - dt0 <= 0 || (s >= 0.3 && s - dt0 < 0.3)) sound.puff?.(1.5);
    }
    return { cam, at, fov, lines, flash, title, sub, say, kk, puff };
  }
  let dt0 = 0.016;
  function nearestOf(p, far) {
    let best = null, bd = far;
    for (const z of dead.list) { if (z.hp <= 0 || z.state === 'dead' || z.state === 'feed') continue; const d = z.pos.distanceTo(p); if (d < bd) { bd = d; best = z; } }
    return best;
  }

  // Where the objective is (for the marker), and what to call it: { at, title } or null.
  function where() { const step = STEPS[st().step]; return step && step.at ? { at: step.at(), title: step.title } : null; }
  return { STEPS, update, show, offer, apply, begin, speak, line, tip, pa, where, entrance, entranceDone, ENTRANCE, goldenShot, set dt(v) { dt0 = v; }, get saying() { return saying; } };
}
