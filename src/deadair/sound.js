// What DEAD AIR sounds like. In the dark it is mostly what you hear that tells you where they are, so:
//   - every zombie's voice comes from where it is (HRTF: in front, behind, above), and comes muffled and dull when
//     there is a wall between you
//   - the station has a sound of its own: a hum, air in the vents, metal ticking and groaning as it cools, a bang a
//     long way off, from somewhere dark; and a drone under all of it that rises the closer they are
//   - a ring of metal round everything (its own reverb: corridors of steel)
//   - when you are hurt the world goes dull and far off, and your heart is in your ears
//
//   const sound = createDeadSound(station);  sound.load();
//   sound.update(dt, camera, { danger, hurt })  each frame
//   sound.voice(z, 'groan' | 'scream' | 'claw'); sound.step(); sound.reload(); sound.sting(); ...
//   sound.music.want('dread' | 'hunt' | 'swarm' | 'lounge' | null); sound.music.cue(name) -> clock; .jingle(i); .sting(p); .laugh(p)
import * as THREE from 'three';
import { audio, unlockAudio } from '../fx/audio.js';

const BASE = `${import.meta.env.BASE_URL}sounds/deadair/`;
const VOICES = 24, STINGS = 5, PA_FILES = [...Array.from({ length: 10 }, (_, i) => `pa${i}.wav`), 'pa_dark.wav', 'pa_copy.wav', 'pa_welcome.wav', 'pa_mastre.wav', ...Array.from({ length: 9 }, (_, i) => `log${i + 1}.wav`)];
// Recorded (CREDITS.txt): the guns, his breath, his feet on the plates, what a round does to meat and to metal, three more drones.
// (and, off the internet: see CREDITS.txt. zm_*: real zombies, two of them many groans in one file that are cut up on load
// (SEGMENTS); ghost*: long moans, for far off and the screamer's call; bed_freezer: a cramped-passage ambience loop;
// and his music: see MUSIC_FILES)
const REAL_FILES = ['zm_darsycho.ogg', 'zm_ghoul.ogg', 'zm_ian1.ogg', 'zm_ian2.ogg', 'zm_ian3.ogg', 'zm_fast.ogg', 'ghost1.mp3', 'ghost2.mp3', 'ghost3.mp3', 'ghost4.mp3', 'ghost5.mp3',
  'shot_pistol.wav', 'shot_machineGun.wav', 'shot_shotgun.wav', 'shot_revolver.wav', 'shot_sniper.wav', 'breath_run.wav', 'breath_scared.wav', 'breath_freaked.wav', 'gasp.wav',
  ...Array.from({ length: 8 }, (_, i) => `step${i}.ogg`), 'impact_meat01.ogg', 'impact_meat02.ogg', 'impact_metal.ogg', 'drone_truth.mp3', 'drone_log.mp3', 'drone_cryptid.mp3'];
const DRONES = [['drone_station', 2400], ['drone_deep', 900], ['drone_truth', 1600], ['drone_log', 1800], ['drone_cryptid', 1200], ['bed_freezer', 1400]];   // (the old ambient track is gone: his music, below, plays in its place)
const SEGMENTS = ['zm_darsycho', 'zm_ghoul'];   // (files of many groans: cut into one each on load)
const BEDS = ['bed_freezer.ogg', 'show_song.ogg'];   // (show_song: the band's number, his own, made with Suno)   // (loaded after everything else: the track is big, and nothing waits for it)
// The reloads' recordings (each a part of one: see reload.js, which says which plays when).
const RELOAD_FILES = ['pistol_out.wav', 'pistol_in.wav', 'pistol_rack.wav', 'rifle_out.wav', 'rifle_in.wav', 'rifle_bolt.wav', 'pump.wav', 'clip1.wav', 'clip2.wav', 'round.wav',
  'shell_first.mp3', 'shell.mp3', 'shotgun_rack.mp3', 'shell_chamber.mp3'];
// His music (dl/Audio, made with Suno; cut and levelled by tools/master_audio.py, encoded to AAC), in sounds/deadair/music:
// the loops (dread, hunt, swarm; the lounge's), the cues of the way in and out, the objectives' jingles, stingers, laughs.
const MUSIC_FILES = ['cue_way_in', 'dread', 'hunt', 'swarm', 'cue_way_out', 'lounge', 'jingle_1', 'jingle_2', 'jingle_3',
  ...Array.from({ length: 10 }, (_, i) => `sting_${i + 1}`), ...Array.from({ length: 4 }, (_, i) => `laugh_${i + 1}`)];
const MUSIC_LEVEL = 0.9;   // (on the game's music volume)
const fwd = new THREE.Vector3(), upv = new THREE.Vector3();

export function createDeadSound(station) {
  let ctx = null, bus = null, world = null, dull = null, verbIn = null, roomTone = null, drones = [], loaded = false, loading = null, quiet = 0, mus = null, musLoops = null;
  const buffers = {}, segs = {};
  // The groans in a file of them: where each is (RMS over 20 ms windows above a floor, gaps under 0.3 s bridged, nothing under 0.3 s kept).
  function cutUp(name) {
    const b = buffers[name]; if (!b) return;
    const data = b.getChannelData(0), win = Math.round(b.sampleRate * 0.02), out = [];
    let on = null, lastLoud = -1;
    for (let i = 0; i + win <= data.length; i += win) {
      let sum = 0; for (let k = i; k < i + win; k++) sum += data[k] * data[k];
      const loud = Math.sqrt(sum / win) > 0.03, t = i / b.sampleRate;
      if (loud) { if (on === null) on = t; lastLoud = t; }
      else if (on !== null && t - lastLoud > 0.3) { if (lastLoud - on > 0.3) out.push([on, lastLoud + 0.15]); on = null; }
    }
    if (on !== null && lastLoud - on > 0.3) out.push([on, Math.min(b.duration, lastLoud + 0.15)]);
    segs[name] = out;
  }
  const at = (p) => p.clone();
  let ear = new THREE.Vector3(), creak = 4, heart = 0, shut = false, last = { danger: 0, hurt: 0, dark: 0, signal: 0, hard: 0 }, lastShot = {};
  let dread = null, distant = 3, overhead = 25, hush = 0, wantOpen = false, nudged = 0;   // (the dread chord; when the next far-off one is heard; when something next crosses the ceiling; a hush going on)

  function build() {
    if (bus || !audio.ctx) return !!bus;
    ctx = audio.ctx;
    const g = (v) => { const n = ctx.createGain(); n.gain.value = v; return n; };
    bus = g(0);                                  // (faded in as the mode opens, out as it closes)
    bus.connect(audio.sfx);
    dull = ctx.createBiquadFilter(); dull.type = 'lowpass'; dull.frequency.value = 20000; dull.Q.value = 0.4;
    dull.connect(bus);
    world = g(1); world.connect(dull);
    // The ring of the place: a tail of noise, combed so that it rings like a steel corridor, dying over two seconds.
    const verb = ctx.createConvolver();
    verb.buffer = steelTail(ctx, 1.5);   // (shorter and lower than it was: less of the ring, more of the sound itself)
    verbIn = g(1);
    verbIn.connect(verb).connect(g(0.28)).connect(dull);
    // His music: on the game's music volume, faded in and out with the mode. The loops have a gain of their own, so that
    // a jingle or a cue can push them down under it.
    mus = g(0); mus.connect(audio.score || audio.sfx);
    musLoops = g(1); musLoops.connect(mus);
    // The station's hum and its air: always there.
    roomTone = hum();
    dread = dreadPad();
    return true;
  }

  // ---- Loading the recordings (once): they are small, and fetched the first time the mode opens.
  function load() {
    if (loading || !build()) return loading;
    const names = [...Array.from({ length: VOICES }, (_, i) => `voice${i + 1}.wav`), ...Array.from({ length: STINGS }, (_, i) => `sting${i + 1}.wav`), 'drone_station.mp3', 'drone_deep.mp3',
      ...RELOAD_FILES, ...PA_FILES, ...REAL_FILES];
    loading = Promise.all(names.map((name) => fetch(BASE + name).then((r) => r.arrayBuffer()).then((data) => ctx.decodeAudioData(data)).then((b) => { buffers[name.replace(/\.\w+$/, '')] = b; }).catch(() => {}))).then(() => {
      loaded = true;
      for (const name of SEGMENTS) cutUp(name);
      startDrones();
      // (the beds, after: when they are in, their drones start)
      Promise.all(BEDS.map((name) => fetch(BASE + name).then((r) => r.arrayBuffer()).then((data) => ctx.decodeAudioData(data)).then((b) => { buffers[name.replace(/\.\w+$/, '')] = b; }).catch(() => {}))).then(startDrones);
    });
    // (his music, alongside: not waited for by anything; a loop asked for before it is in starts when it is)
    for (const name of MUSIC_FILES) fetch(`${BASE}music/${name}.aac`).then((r) => r.arrayBuffer()).then((data) => ctx.decodeAudioData(data)).then((b) => { buffers[`m_${name}`] = b; }).catch(() => {});
    return loading;
  }
  // Every drone whose recording is in and that is not going yet.
  function startDrones() {
    DRONES.forEach(([name, cut], i) => {
      if (drones[i] || !buffers[name]) return;
      drones[i] = (() => {
        const src = ctx.createBufferSource(), level = ctx.createGain(), low = ctx.createBiquadFilter();
        src.buffer = buffers[name]; src.loop = true;
        low.type = 'lowpass'; low.frequency.value = cut;
        level.gain.value = 0;
        src.connect(low).connect(level).connect(world);
        src.start(0, Math.random() * src.buffer.duration);
        return { src, level };
      })();
    });
  }

  // ---- A sound from a place: HRTF, quieter with distance, and muffled if something solid is in the way.
  let crateHumOn = false;
  // ---- The budget (his report, twice: with a crowd of them and the guns going, the sound stopped). Every sound from a
  // place has a panner, filters and a send of its own, and the browser renders all of them on one thread: too many at
  // once and it cannot keep up, and everything cuts out. So, very conservatively, and in this order:
  //   1. the music: never counted, never touched (its own bus: sound.music);
  //   2. what is yours (your gun, your feet, your breath, the PA): a few at once of its own (OWN_MOST);
  //   3. the dead nearest you: their voices, their feet, the hits on them, a handful of each, the nearest first (one
  //      nearer than the farthest of its kind going takes its place);
  //   4. the station's own noises (env): the first to go, and none at all while any of them is close or it is busy.
  // Nothing new at all while too much is going (SFX_MOST), but for the nearest; no more than a few new ones in a tenth
  // of a second; only the three nearest within 9 m are HRTF, the rest equal-power. And any place that is not one (NaN)
  // is refused: it would put NaN through the mix, and that is silence for good.
  const CAPS = { voice: 4, step: 3, hit: 3, hitx: 2, fx: 6, env: 2 };
  const FARTHEST = { voice: 28, step: 15, hit: 28, hitx: 16, fx: 45, env: 60 };
  const ALL = 12, HRTF_MOST = 3, HRTF_NEAR = 9, SFX_MOST = 26, OWN_MOST = 10, PER_TENTH = 5;
  const voices = [], own = [], budget = { made: 0, dropped: 0, live: 0, peak: 0, errors: 0 };
  let tokens = PER_TENTH, tokenAt = 0, catNow = null;
  // (every one-shot this makes is counted while it sounds: started, and not yet ended)
  const counted = (src) => { budget.live++; budget.peak = Math.max(budget.peak, budget.live); src.addEventListener('ended', () => { budget.live--; }, { once: true }); return src; };
  function admit(p, cat = 'fx', dur = 1) {
    cat = catNow || cat;
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) { budget.dropped++; return null; }
    const d = ear.distanceTo(p), now = ctx.currentTime;
    if (d > (FARTHEST[cat] ?? 45)) { budget.dropped++; return null; }
    if (cat === 'env' && (last.danger > 0.2 || budget.live > SFX_MOST * 0.4)) { budget.dropped++; return null; }   // (the station keeps quiet while they are about)
    for (let i = voices.length - 1; i >= 0; i--) if (voices[i].end <= now) voices.splice(i, 1);
    tokens = Math.min(PER_TENTH, tokens + (now - tokenAt) * PER_TENTH * 10); tokenAt = now;
    const near = d < 6 && (cat === 'voice' || cat === 'hit' || cat === 'step');
    let mine = 0, hrtf = 0, farthest = null, farAll = null;
    for (const v of voices) { if (v.cat === cat) { mine++; if (!farthest || v.d > farthest.d) farthest = v; } if (!farAll || v.d > farAll.d) farAll = v; if (v.hrtf) hrtf++; }
    const full = mine >= (CAPS[cat] ?? 6) || voices.length >= ALL || budget.live >= SFX_MOST || tokens < 1;
    if (full) {
      // (full: the nearest are the ones heard. One nearer than the farthest of its kind (or of all, if that is what is
      // full) takes its place, that one faded out quickly; and never when it is the rate that is spent, unless it is close)
      const victim = mine >= (CAPS[cat] ?? 6) ? farthest : farAll;
      if ((tokens < 1 && !near) || !victim || d > victim.d * 0.75 || !victim.kill) { budget.dropped++; return null; }
      victim.kill(); voices.splice(voices.indexOf(victim), 1); budget.dropped++;
    }
    tokens = Math.max(0, tokens - 1);
    const v = { end: now + Math.min(8, Math.max(0.05, dur)) + 0.1, cat, d, kill: null, hrtf: d < HRTF_NEAR && hrtf < HRTF_MOST };
    voices.push(v); budget.made++;
    return v;
  }
  // What is yours (not from a place: your gun, your feet, your breath): a few at once; past that, the newest waits for
  // nothing (it is not made). important: the PA, a sting, a scare's own (always made).
  function admitOwn(dur, important = false) {
    const now = ctx.currentTime;
    for (let i = own.length - 1; i >= 0; i--) if (own[i] <= now) own.splice(i, 1);
    if (!important && (own.length >= OWN_MOST || budget.live >= SFX_MOST + 6)) { budget.dropped++; return false; }
    own.push(now + Math.min(6, Math.max(0.05, dur)) + 0.05);
    return true;
  }
  function placed(node, p, { level = 1, wet = 0.35, ref = 1.6, open = false, hrtf = true } = {}) {
    const pan = ctx.createPanner();
    pan.panningModel = hrtf ? 'HRTF' : 'equalpower'; pan.distanceModel = 'inverse'; pan.refDistance = ref; pan.rolloffFactor = 1.15; pan.maxDistance = 80;
    if (pan.positionX) { pan.positionX.value = p.x; pan.positionY.value = p.y; pan.positionZ.value = p.z; } else pan.setPosition(p.x, p.y, p.z);
    const blocked = !open && !station.see(ear, p), muffle = ctx.createBiquadFilter(), gain = ctx.createGain();
    muffle.type = 'lowpass'; muffle.frequency.value = blocked ? 650 : 16000;
    gain.gain.value = level * (blocked ? 0.55 : 1);
    node.connect(muffle).connect(gain).connect(pan);
    pan.connect(world);
    if (wet > 0.05) { const send = ctx.createGain(); send.gain.value = wet * (blocked ? 1.6 : 1); pan.connect(send).connect(verbIn); }   // (none for what is barely wet: a node fewer)
    return { pan, gain };
  }
  function sample(name, p, { level = 1, rate = 1, wet = 0.35, ref, from = 0, length, cat = 'fx' } = {}) {
    if (!ready() || !buffers[name]) return null;
    const dur = (length || buffers[name].duration - from) / Math.max(0.1, rate);
    const a = p ? admit(p, cat, dur) : null;
    if (p ? !a : !admitOwn(dur, cat === 'own!')) return null;
    const src = counted(ctx.createBufferSource());
    src.buffer = buffers[name];
    src.playbackRate.value = rate;
    if (p) { const { gain } = placed(src, p, { level, wet, ref, hrtf: a.hrtf }); a.kill = () => { const t = ctx.currentTime; gain.gain.setTargetAtTime(0, t, 0.015); try { src.stop(t + 0.08); } catch {} }; }
    else { const gn = ctx.createGain(); gn.gain.value = level; src.connect(gn).connect(world); const s = ctx.createGain(); s.gain.value = wet; gn.connect(s).connect(verbIn); }
    if (length) src.start(0, from, length); else src.start();
    return src;
  }
  const ready = () => !!(bus && loaded && !quiet);

  // ---- His music. A loop (dread, hunt, swarm; the lounge) starts somewhere in itself and crossfades into another when
  // it is asked for, and into its own start as it runs out. A cue plays once from its start, with the loops gone under
  // it, and can say how far into it it is (the scenes keep time by that). A jingle pushes the loops down under it.
  const music = (() => {
    const XF = 4;   // (seconds of a crossfade)
    let cur = null, cue = null, duckTo = 1, duckFor = 0, wanted = null;
    const log = [], note = (what) => { log.push(what); if (log.length > 16) log.shift(); };   // (what it last played: the tests)
    const startLoop = (name, from = null) => {
      const b = buffers[`m_${name}`]; if (!b) return null;
      const src = ctx.createBufferSource(), gn = ctx.createGain(), t = ctx.currentTime;
      src.buffer = b; src.connect(gn).connect(musLoops);
      const off = from ?? Math.random() * Math.max(0, b.duration - 60);   // (the same opening every time would grow old)
      gn.gain.setValueAtTime(0.0001, t); gn.gain.linearRampToValueAtTime(1, t + (from === 0 ? XF : 2.5));
      src.start(t, off);
      return { name, src, gain: gn, endAt: t + (b.duration - off) };
    };
    const fadeOut = (n, src, secs) => { const t = ctx.currentTime; n.gain.cancelScheduledValues(t); n.gain.setValueAtTime(Math.max(0.0001, n.gain.value), t); n.gain.linearRampToValueAtTime(0.0001, t + secs); try { src.stop(t + secs + 0.1); } catch {} };
    const m = {
      get wanted() { return wanted; },
      get playing() { return cur?.name || null; },
      get log() { return log.slice(); },
      note,
      // The loop to be playing (null: none), crossfaded to if it is not the one already.
      want(name) {
        wanted = name;
        if (!ctx || cue || cur?.name === name) return;
        if (cur) { fadeOut(cur.gain, cur.src, XF); cur = null; }
        if (name) cur = startLoop(name);
      },
      // A cue, once, from its start (or from `from` seconds in: the scene was already that far along when it came in), the
      // loops faded out under it. Returns a clock: seconds into it (-1 once it is over, or while the sound is asleep).
      cue(name, level = 1, from = 0) {
        if (!ctx || !mus) return null;
        m.endCue(0.3);
        const b = buffers[`m_${name}`]; if (!b || from >= b.duration) return null;
        if (cur) { fadeOut(cur.gain, cur.src, 1.2); cur = null; }
        const src = ctx.createBufferSource(), gn = ctx.createGain(), t0 = ctx.currentTime + 0.03;
        gn.gain.value = level; src.buffer = b; src.connect(gn).connect(mus); src.start(t0, from);
        const c = cue = { name, src, gain: gn, t0: t0 - from, length: b.duration };
        src.onended = () => { if (cue === c) cue = null; };
        return () => (cue === c && ctx.state === 'running' ? ctx.currentTime - c.t0 : -1);
      },
      // (in, and the sound awake to play it)
      ready(name) { return !!(ctx && ctx.state === 'running' && buffers[`m_${name}`]); },
      endCue(fade = 2.5) { if (!cue) return; const c = cue; cue = null; fadeOut(c.gain, c.src, fade); },
      get cueName() { return cue?.name || null; },
      cueTime() { return cue ? ctx.currentTime - cue.t0 : -1; },
      has(name) { return !!buffers[`m_${name}`]; },
      // The loops down to `to` for `secs` (a jingle, a line on the PA), then back up.
      duck(to = 0.4, secs = 4) { duckTo = Math.min(duckTo, to); duckFor = Math.max(duckFor, secs); },
      // An objective done: the child's tune (a music box, a toy piano), the loops down under it.
      jingle(i = 1) {
        const b = buffers[`m_jingle_${i}`]; if (!b || !mus) return;
        m.duck(0.2, b.duration + 0.4); note(`jingle_${i}`);
        const src = ctx.createBufferSource(), gn = ctx.createGain(); gn.gain.value = 1.1; src.buffer = b; src.connect(gn).connect(mus); src.start(ctx.currentTime + 0.05);
      },
      // A stinger: everywhere at once (p null) or from a place, as they come through.
      sting(p = null, level = 1) { const n = 1 + Math.floor(Math.random() * 10); if (buffers[`m_sting_${n}`] && ready()) note(`sting_${n}`); if (buffers[`m_sting_${n}`]) sample(`m_sting_${n}`, p, { level: 0.95 * level, wet: 0.08, ref: 6 }); },
      // A laugh, from somewhere in the dark (muffled through the walls, if that is where it is).
      laugh(p) { const n = 1 + Math.floor(Math.random() * 4); if (buffers[`m_laugh_${n}`] && ready()) note(`laugh_${n}`); if (buffers[`m_laugh_${n}`]) sample(`m_laugh_${n}`, p, { level: 1.5, rate: rnd(0.9, 1.04), wet: 0.15, ref: 3.5 }); },
      update(dt, hushed = 1) {
        if (!ctx || !musLoops) return;
        if (wanted && !cur && !cue && buffers[`m_${wanted}`]) cur = startLoop(wanted);   // (asked for before it was in)
        if (cur && ctx.currentTime > cur.endAt - XF - 0.05) { const next = startLoop(cur.name, 0); fadeOut(cur.gain, cur.src, XF); cur = next; }   // (round again)
        if (duckFor > 0) duckFor -= dt; else duckTo = Math.min(1, duckTo + dt * 0.4);
        musLoops.gain.setTargetAtTime(duckTo * (hushed < 1 ? 0.15 : 1), ctx.currentTime, hushed < 1 ? 0.08 : 0.3);
      },
    };
    return m;
  })();
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (list) => list[Math.floor(Math.random() * list.length)];

  // A recording, everywhere at once (yours: your gun, your feet, your breath). cap: seconds before its tail is faded
  // out (a gun's recording rings on for eight seconds; an automatic cannot have forty of those going).
  function one(name, { level = 1, rate = 1, wet = 0.35, cap = 0, offset = 0, dur = 0 } = {}) {
    const b = buffers[name]; if (!b) return null;
    if (!admitOwn(cap > 0 ? cap + 0.4 : dur > 0 ? dur : b.duration / rate)) return null;
    const src = counted(ctx.createBufferSource()); src.buffer = b; src.playbackRate.value = rate;
    const g = ctx.createGain(); g.gain.value = level;
    const s = ctx.createGain(); s.gain.value = wet;
    src.connect(g).connect(world); g.connect(s).connect(verbIn);
    const t = ctx.currentTime;
    if (dur > 0) src.start(t, Math.min(offset, Math.max(0, b.duration - dur)), dur); else src.start(t, offset);
    if (cap > 0) { g.gain.setValueAtTime(level, t + cap); g.gain.setTargetAtTime(0, t + cap, 0.07); src.stop(t + cap + 0.4); }
    return src;
  }

  // ---- Made here, not recorded.
  // A recording out of a little speaker: band-passed (no bottom, no top), a touch of distortion, everywhere at once.
  function speaker(name, { level = 1, f = 1400, q = 1.2 } = {}) {
    const b = buffers[name]; if (!b) return;
    admitOwn(b.duration, true);
    const src = counted(ctx.createBufferSource()); src.buffer = b;
    const band = ctx.createBiquadFilter(); band.type = 'bandpass'; band.frequency.value = f; band.Q.value = q;
    const crush = ctx.createWaveShaper(); const curve = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = (i / 127.5) - 1; curve[i] = Math.tanh(x * 2.4) / Math.tanh(2.4); } crush.curve = curve;
    const g = ctx.createGain(); g.gain.value = level * 1.6;
    src.connect(band).connect(crush).connect(g).connect(bus);
    src.start();
  }
  // One of the real ones: a single recording, or one groan out of a file of them. kind: 'groan' | 'fast' | 'feed'.
  function moan(kind, p, { level = 1, rate = 1, wet = 0.4, ref = 3, cat = 'voice' } = {}) {
    if (kind === 'fast' && Math.random() < 0.5) return sample('zm_fast', p, { level, rate, wet, ref, cat });
    const singles = kind === 'feed' ? ['zm_ian2', 'zm_ian3'] : ['zm_ian1', 'zm_ian2', 'zm_ian3'];
    const many = kind === 'feed' ? 'zm_ghoul' : pick(['zm_darsycho', 'zm_ghoul']);
    const cuts = segs[many];
    if (cuts && cuts.length && Math.random() < 0.65) { const [a, b] = pick(cuts); return sample(many, p, { level, rate, wet, ref, from: a, length: (b - a) / rate, cat }); }
    return sample(pick(singles), p, { level, rate, wet, ref, cat });
  }
  function noise(seconds, { type = 'bandpass', f = 1000, f2 = f, q = 1, level = 0.4, attack = 0.002, p = null, wet = 0.3, at = 0, cat = 'fx' } = {}) {
    if (!bus || !(level > 0.0001)) return;   // (a ramp to nothing is an error, not a silence)
    const a = p ? admit(p, cat, seconds + at) : null;
    if (p ? !a : !admitOwn(seconds + at, cat === 'own!')) return;
    const t = ctx.currentTime + at, src = counted(ctx.createBufferSource()), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
    src.buffer = audio.noise; src.loop = true;
    filter.type = type; filter.Q.value = q;
    filter.frequency.setValueAtTime(f, t); filter.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + seconds);
    gain.gain.setValueAtTime(0.0001, t); gain.gain.exponentialRampToValueAtTime(level, t + attack); gain.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    src.connect(filter).connect(gain);
    if (p) { placed(gain, p, { wet, hrtf: a.hrtf }); a.kill = () => { const k = ctx.currentTime; gain.gain.cancelScheduledValues(k); gain.gain.setTargetAtTime(0.0001, k, 0.015); try { src.stop(k + 0.08); } catch {} }; } else { gain.connect(world); const s = ctx.createGain(); s.gain.value = wet; gain.connect(s).connect(verbIn); }
    src.start(t, Math.random()); src.stop(t + seconds + 0.05);
  }
  function tone(seconds, { type = 'sine', f = 200, f2 = f, level = 0.3, attack = 0.003, p = null, wet = 0.25, at = 0, cat = 'fx' } = {}) {
    if (!bus || !(level > 0.0001)) return;   // (a ramp to nothing is an error, not a silence)
    const a = p ? admit(p, cat, seconds + at) : null;
    if (p ? !a : !admitOwn(seconds + at, cat === 'own!')) return;
    const t = ctx.currentTime + at, osc = counted(ctx.createOscillator()), gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f, t); osc.frequency.exponentialRampToValueAtTime(Math.max(10, f2), t + seconds);
    gain.gain.setValueAtTime(0.0001, t); gain.gain.exponentialRampToValueAtTime(level, t + attack); gain.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    osc.connect(gain);
    if (p) { placed(gain, p, { wet, hrtf: a.hrtf }); a.kill = () => { const k = ctx.currentTime; gain.gain.cancelScheduledValues(k); gain.gain.setTargetAtTime(0.0001, k, 0.015); try { osc.stop(k + 0.08); } catch {} }; } else { gain.connect(world); const s = ctx.createGain(); s.gain.value = wet; gain.connect(s).connect(verbIn); }
    osc.start(t); osc.stop(t + seconds + 0.05);
  }
  // The station's hum: the mains (50 Hz and its second), air moving in the ducts. Never stops while you are in there.
  function hum() {
    const out = ctx.createGain(); out.gain.value = 0.0;
    out.connect(world);
    // The mains: a hum you hear on any speaker (its harmonics, not just the 50 Hz under them), and a buzz in it.
    for (const [f, v, type] of [[50, 0.05, 'sine'], [100, 0.04, 'sine'], [150, 0.02, 'sine'], [200, 0.012, 'triangle'], [300, 0.006, 'sawtooth']]) {
      const o = ctx.createOscillator(), gn = ctx.createGain(); o.type = type; o.frequency.value = f; gn.gain.value = v; o.connect(gn).connect(out); o.start();
    }
    // The air handlers: a low roar that breathes (slowly louder and softer), and a hiss over it.
    const air = ctx.createBufferSource(), low = ctx.createBiquadFilter(), gn = ctx.createGain();
    air.buffer = audio.noise; air.loop = true; low.type = 'lowpass'; low.frequency.value = 320; gn.gain.value = 0.16;
    const lfo = ctx.createOscillator(), depth = ctx.createGain(); lfo.frequency.value = 0.07; depth.gain.value = 0.07; lfo.connect(depth).connect(gn.gain); lfo.start();
    air.connect(low).connect(gn).connect(out); air.start();
    const hiss = ctx.createBufferSource(), band = ctx.createBiquadFilter(), hg = ctx.createGain();
    hiss.buffer = audio.noise; hiss.loop = true; band.type = 'bandpass'; band.frequency.value = 2200; band.Q.value = 0.5; hg.gain.value = 0.018;
    hiss.connect(band).connect(hg).connect(out); hiss.start(0, 1.3);
    // And under everything, felt more than heard: the reactor, turning.
    const sub = ctx.createOscillator(), sg = ctx.createGain(); sub.frequency.value = 31; sg.gain.value = 0.09; sub.connect(sg).connect(out); sub.start();
    return out;
  }
  // The dread: a chord that is wrong (a root, a minor second over it, a tritone), low and filtered, that comes up as they
  // close in; and, very close, strings scraping high over it. Its loudness and brightness follow the danger.
  function dreadPad() {
    const out = ctx.createGain(); out.gain.value = 0; out.connect(world);
    const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 300; tone.Q.value = 2; tone.connect(out);
    for (const [f, type, v] of [[55, 'sawtooth', 0.05], [58.3, 'sawtooth', 0.045], [77.8, 'triangle', 0.05], [110.2, 'sawtooth', 0.025]]) {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.value = f; o.detune.value = (Math.random() - 0.5) * 12; g.gain.value = v; o.connect(g).connect(tone); o.start();
    }
    const high = ctx.createGain(); high.gain.value = 0; high.connect(world);
    const trem = ctx.createOscillator(), td = ctx.createGain(); trem.frequency.value = 7.3; td.gain.value = 0.004; trem.connect(td).connect(high.gain); trem.start();
    for (const f of [1661, 1760, 1864]) { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sawtooth'; o.frequency.value = f; g.gain.value = 0.0035; const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 8; o.connect(bp).connect(g).connect(high); o.start(); }
    return { out, tone, high };
  }

  // ---- What the rest of the mode asks for.
  const api = {
    has: (name) => !!buffers[name],   // (the tests)
    cuts: (name) => segs[name] || null,
    load,
    music,
    get ready() { return ready(); },
    // Open (fade in) / closed (fade out).
    open(on) {
      if (on && !audio.ctx) unlockAudio();
      if (!build()) return;
      load();
      const t = ctx.currentTime;
      bus.gain.cancelScheduledValues(t); bus.gain.setTargetAtTime(on ? 1.25 : 0, t, on ? 0.6 : 0.25);
      mus.gain.cancelScheduledValues(t); mus.gain.setTargetAtTime(on ? MUSIC_LEVEL : 0, t, 0.6);
      if (!on) { music.want(null); music.endCue(1.5); }
      roomTone.gain.setTargetAtTime(on ? 1 : 0, t, 1.5);
      quiet = on ? 0 : 1;
      wantOpen = on;
    },
    // (what state it is all in: the tests, and anyone whose sound has gone)
    state() { return { ctx: ctx?.state ?? 'none', bus: bus ? +bus.gain.value.toFixed(3) : null, sfx: audio.sfx ? +audio.sfx.gain.value.toFixed(3) : null, quiet, loaded, wantOpen, drones: drones.filter(Boolean).length, hush: +hush.toFixed(2), voices: voices.length, made: budget.made, dropped: budget.dropped, live: budget.live, peak: budget.peak, errors: budget.errors }; },
    update(dt, camera, { danger = 0, hurt = 0, dark = false, signal = false, hard = false } = {}) {
      // (a watchdog: the browser can put the context to sleep, and a bus shut by mistake would be silence for good)
      nudged -= dt;
      if (wantOpen && bus && nudged <= 0) {
        nudged = 1.5;
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});
        if (quiet || bus.gain.value < 0.05) { quiet = 0; const t0 = ctx.currentTime; bus.gain.cancelScheduledValues(t0); bus.gain.setTargetAtTime(1.25, t0, 0.3); }
      }
      if (!bus) return;
      // Where you are listening from: the camera (not while you are in the lounge: what is out there stays out there).
      if (shut) { if (!quiet) { creak -= dt; if (creak <= 0) { creak = rnd(5, 14); api.station(); } } return; }
      ear.copy(camera.position);
      camera.getWorldDirection(fwd); upv.set(0, 1, 0).applyQuaternion(camera.quaternion);
      const L = ctx.listener, t = ctx.currentTime;
      if (L.positionX) {
        L.positionX.setTargetAtTime(ear.x, t, 0.02); L.positionY.setTargetAtTime(ear.y, t, 0.02); L.positionZ.setTargetAtTime(ear.z, t, 0.02);
        L.forwardX.setTargetAtTime(fwd.x, t, 0.02); L.forwardY.setTargetAtTime(fwd.y, t, 0.02); L.forwardZ.setTargetAtTime(fwd.z, t, 0.02);
        L.upX.setTargetAtTime(upv.x, t, 0.02); L.upY.setTargetAtTime(upv.y, t, 0.02); L.upZ.setTargetAtTime(upv.z, t, 0.02);
      } else { L.setPosition(ear.x, ear.y, ear.z); L.setOrientation(fwd.x, fwd.y, fwd.z, upv.x, upv.y, upv.z); }
      if (quiet) return;
      // The drones: the station's always, the deep one coming up under it as they close on you.
      last.danger += (danger - last.danger) * Math.min(1, dt * 1.5);
      last.dark += ((dark ? 1 : 0) - last.dark) * Math.min(1, dt * 0.8);
      last.signal += ((signal ? 1 : 0) - last.signal) * Math.min(1, dt * 1.2);
      last.hard += ((hard ? 1 : 0) - last.hard) * Math.min(1, dt * 0.5);
      const hushed = hush > 0 ? 0.06 : 1;   // (dead air: everything drops away for a moment)
      if (hush > 0) hush -= dt;
      if (drones[0]) drones[0].level.gain.setTargetAtTime((0.55 - 0.15 * last.danger) * (1 - 0.4 * last.dark) * hushed, t, hush > 0 ? 0.08 : 0.6);
      if (drones[1]) drones[1].level.gain.setTargetAtTime((0.12 + 0.6 * last.danger) * hushed, t, 0.5);
      if (roomTone) roomTone.gain.setTargetAtTime(hushed, t, hush > 0 ? 0.05 : 1.2);
      if (dread) {
        const d = Math.min(1, last.danger * 1.15 + 0.25 * last.dark);
        dread.out.gain.setTargetAtTime(d * d * 0.6 * hushed, t, 0.4);
        dread.tone.frequency.setTargetAtTime(220 + 1300 * d, t, 0.5);
        dread.high.gain.setTargetAtTime(d > 0.6 ? (d - 0.6) * 0.5 * hushed : 0, t, 0.3);
      }
      // Somewhere else in the station, one of them: far off, through the walls (more often the more of them there are).
      distant -= dt;
      if (distant <= 0 && !hush) { distant = rnd(4, 11) * (1 - 0.35 * last.danger); api.faraway(); }
      // Something crossing the ceiling over you, now and then.
      overhead -= dt;
      if (overhead <= 0) { overhead = rnd(28, 60); api.overhead(); }
      if (drones[2]) drones[2].level.gain.setTargetAtTime(0.4 * last.dark, t, 0.8);          // (lights out: the one that is all wrong)
      if (drones[3]) drones[3].level.gain.setTargetAtTime(0.32 * last.signal, t, 0.6);       // (the broadcast: a captain's last log under it)
      if (drones[4]) drones[4].level.gain.setTargetAtTime((0.16 + 0.14 * last.danger) * last.hard, t, 0.8);   // (Nightmare: something in a cage)
      if (drones[5]) drones[5].level.gain.setTargetAtTime((0.26 + 0.16 * last.dark) * (1 - 0.5 * last.danger) * hushed, t, 0.9);   // (the cramped passage: the calm is not calm)
      music.update(dt, hushed);
      // Hurt: the world goes dull, and your heart is in your ears.
      last.hurt += (hurt - last.hurt) * Math.min(1, dt * 4);
      if (!shut) dull.frequency.setTargetAtTime(20000 * Math.pow(0.04, last.hurt), t, 0.08);
      if (last.hurt > 0.25) {
        heart -= dt;
        if (heart <= 0) { heart = 0.95 - 0.35 * last.hurt; api.heartbeat(0.5 + last.hurt * 0.6); }
      }
      // The station itself, now and then, from somewhere you cannot see.
      creak -= dt;
      if (creak <= 0) { creak = rnd(5, 14) * (1 - 0.4 * last.danger); api.station(); }
    },
    // A zombie's voice, from where it is.
    voice(z, what) {
      const p = z.head && Number.isFinite(z.head.x) ? z.head : z.pos;
      if (what === 'scream') { sample(`voice${pick([16, 17, 18, 21, 19])}`, p, { cat: 'voice', level: 2.1, rate: rnd(1.05, 1.25), wet: 0.3, ref: 4.5 }); return; }
      if (what === 'claw') { sample(`voice${pick([2, 5, 6, 11, 13, 24])}`, p, { cat: 'voice', level: 1.2, rate: rnd(0.95, 1.15), wet: 0.2 }); noise(0.16, { type: 'highpass', f: 2600, f2: 900, level: 0.5, p }); return; }
      if (what === 'die') { sample(`voice${pick([1, 9, 12, 15, 20])}`, p, { cat: 'voice', level: 0.9, rate: rnd(0.75, 0.9), wet: 0.4 }); noise(0.3, { f: 300, f2: 90, q: 0.7, level: 0.35, p, at: 0.6 }); return; }
      if (what === 'feed') { if (Math.random() < 0.5) moan('feed', p, { cat: 'voice', level: 0.7, rate: rnd(0.7, 0.85), wet: 0.3 }); else sample(`voice${pick([3, 7, 8, 14])}`, p, { cat: 'voice', level: 0.6, rate: rnd(0.6, 0.75), wet: 0.3 }); noise(0.25, { f: 700, f2: 400, q: 2, level: 0.12, p, at: 0.2 }); return; }
      if (what === 'call') { sample(`ghost${pick([1, 2, 3, 4])}`, p, { cat: 'voice', level: 1.7, rate: rnd(0.9, 1.05), wet: 0.6, ref: 3 }); return; }   // (the screamer: a long one, the whole deck hears it)
      const fast = z.kind === 'sprinter' || z.kind === 'runner';
      if (Math.random() < 0.55) { moan(fast ? 'fast' : 'groan', p, { cat: 'voice', level: fast ? 2.0 : 1.8, rate: fast ? rnd(1.0, 1.15) : rnd(0.8, 0.95), wet: 0.3, ref: 4.5 }); return; }   // (a real one, as often as not)
      sample(`voice${1 + Math.floor(Math.random() * VOICES)}`, p, { cat: 'voice', level: fast ? 2.1 : 1.8, rate: fast ? rnd(0.95, 1.12) : rnd(0.68, 0.88), wet: 0.3, ref: 4.5 });
    },
    // Something heavy: a sting, as something comes at you out of the dark.
    sting(level = 1) {
      sample(`sting${1 + Math.floor(Math.random() * STINGS)}`, null, { level: 0.8 * level, rate: rnd(0.9, 1.05), wet: 0.4, cat: 'own!' });
      noise(0.9, { type: 'lowpass', f: 3000, f2: 120, level: 0.45 * level, attack: 0.004, wet: 0.6 });
      tone(1.4, { f: 62, f2: 38, level: 0.6 * level, wet: 0.3 });
    },
    // A round begins: a boom through the station, and a lot of them, a long way off.
    roundStart(n) {
      if (!ready()) return;
      tone(3, { f: 48, f2: 30, level: 0.7, attack: 0.02, wet: 0.8 });
      noise(2.6, { type: 'lowpass', f: 900, f2: 60, level: 0.4, attack: 0.01, wet: 0.9 });
      for (let i = 0; i < Math.min(9, 3 + n); i++) {
        const far = new THREE.Vector3(rnd(0, station.width * 4), 1.5, rnd(0, station.depth * 4));
        setTimeout(() => (Math.random() < 0.5 ? moan('groan', far, { level: 0.7, rate: rnd(0.7, 0.9), wet: 0.9, ref: 1 }) : sample(`voice${1 + Math.floor(Math.random() * VOICES)}`, far, { level: 0.6, rate: rnd(0.55, 0.8), wet: 0.9, ref: 1 })), 600 + i * rnd(150, 380));
      }
    },
    // A round is over: the drone lifts, a low swell, quiet.
    roundEnd() {
      if (!ready()) return;
      tone(4, { type: 'triangle', f: 110, f2: 82, level: 0.18, attack: 0.8, wet: 0.9 });
      tone(4, { type: 'sine', f: 165, f2: 123, level: 0.1, attack: 1, wet: 0.9 });
    },
    // The station: a groan of metal, a bang far off, the vents, something dragged.
    station() {
      if (!ready()) return;
      const p = new THREE.Vector3(rnd(0, station.width * 4), rnd(1, 4.5), rnd(0, station.depth * 4)), k = Math.random();
      if (k < 0.35) { const f = rnd(110, 240); noise(rnd(1.2, 2.6), { f, f2: f * rnd(0.55, 0.8), q: 26, level: 0.5, attack: 0.3, p, wet: 0.8 }); }
      else if (k < 0.55) { tone(1.6, { f: rnd(55, 80), f2: 30, level: 0.6, attack: 0.004, p, wet: 1 }); noise(0.5, { type: 'lowpass', f: 1600, f2: 200, level: 0.5, p, wet: 1 }); }
      else if (k < 0.75) { for (let i = 0; i < 6; i++) noise(0.05, { f: rnd(2500, 4200), q: 8, level: 0.25, p, at: i * rnd(0.05, 0.12), wet: 0.6 }); }
      else if (k < 0.9) noise(rnd(2, 3.5), { type: 'bandpass', f: 400, f2: 180, q: 1.5, level: 0.22, attack: 0.6, p, wet: 0.7 });
      else sample(`voice${1 + Math.floor(Math.random() * VOICES)}`, p, { level: 0.35, rate: rnd(0.5, 0.65), wet: 1, ref: 1 });
    },
    // His feet on the plates: a walk is a heel and a sole; a run comes down harder and heavier, with the breath of it.
    step(level = 1, running = false) {
      if (!ready()) return;
      // (a recorded boot on a grate, if it is here; heavier and quicker when he runs; a thud of his weight under a run)
      if (buffers.step0) {
        one(`step${Math.floor(Math.random() * 8)}`, { level: (running ? 0.85 : 0.55) * level, rate: running ? rnd(1.0, 1.12) : rnd(0.92, 1.04), wet: running ? 0.1 : 0.06 });
        if (running) tone(0.12, { f: rnd(70, 85), f2: 40, level: 0.3 * level, attack: 0.003, wet: 0.08 });
        // (foley: the kit on him, the sling's clink and the lamp's bracket; the rub of his jacket)
        noise(0.05, { type: 'highpass', f: rnd(3800, 5200), level: (running ? 0.16 : 0.07) * level, attack: 0.002, at: 0.03, wet: 0.04 });
        if (running || Math.random() < 0.5) tone(0.04, { type: 'triangle', f: rnd(2400, 3100), f2: rnd(2000, 2400), level: (running ? 0.05 : 0.025) * level, attack: 0.002, at: 0.05, wet: 0.05 });
        noise(0.16, { type: 'bandpass', f: rnd(900, 1500), q: 0.9, level: (running ? 0.1 : 0.06) * level, attack: 0.05, at: 0.02, wet: 0.03 });
        return;
      }
      if (running) {
        tone(0.12, { f: rnd(70, 85), f2: 40, level: 0.4 * level, attack: 0.003, wet: 0.2 });
        noise(0.09, { f: rnd(900, 1400), q: 1.2, level: 0.22 * level, attack: 0.002, wet: 0.25 });
        noise(0.05, { type: 'highpass', f: 3000, level: 0.08 * level, at: 0.03, wet: 0.2 });
        return;
      }
      noise(0.06, { f: rnd(1700, 2600), q: 1.4, level: 0.1 * level, attack: 0.002, wet: 0.15 });
      tone(0.09, { f: rnd(85, 110), f2: 55, level: 0.14 * level, wet: 0.1 });
      noise(0.04, { f: rnd(2600, 3400), q: 2, level: 0.05 * level, at: 0.09, wet: 0.15 });   // (the sole, after the heel)
    },
    // His breath, running (or hurt): in and out, through the nose.
    puff(level = 1) {
      if (!ready()) return;
      if (buffers.breath_run) { one('breath_run', { level: 0.5 * level, rate: rnd(0.95, 1.05), wet: 0.02, offset: Math.random() * 17, dur: 1.15, cap: 1.0 }); return; }
      noise(0.22, { type: 'bandpass', f: 520, f2: 380, q: 1.1, level: 0.11 * level, attack: 0.08, wet: 0.02 }); noise(0.28, { type: 'bandpass', f: 420, f2: 300, q: 1.1, level: 0.09 * level, attack: 0.1, at: 0.3, wet: 0.02 });
    },
    // Hurt badly: the breathing of a man who is scared (a slice of a long recording of one).
    scared(level = 1) { if (ready()) one('breath_scared', { level: 0.55 * level, wet: 0.03, offset: Math.random() * 12, dur: 2.0, cap: 1.8 }); },
    // Grabbed: the gasp as it gets hold of you; the breath that goes out of you at each lunge.
    gasp() { if (ready()) one('gasp', { level: 0.9, wet: 0.1, dur: 1.4, cap: 1.2 }); },
    freaked() { if (ready()) one('breath_freaked', { level: 0.8, rate: rnd(0.95, 1.1), wet: 0.08 }); },
    // Your gun: its recording (the tail cut short on an automatic, so that the shots do not pile up into a roar).
    shot(id = 'pistol', auto = false) {
      if (!ready()) return;
      const now = ctx.currentTime;
      if (now - (lastShot[id] || 0) < 0.045) return;
      lastShot[id] = now;
      one(buffers[`shot_${id}`] ? `shot_${id}` : 'shot_pistol', { level: id === 'sniper' || id === 'revolver' ? 1 : id === 'shotgun' ? 0.95 : 0.8, rate: rnd(0.97, 1.03), wet: 0.55, cap: auto ? 0.7 : id === 'machineGun' ? 1.2 : 2.6 });
    },
    // One of them coming through (a grille kicked out of the ceiling, a panel): a hard bang of steel where it is, and
    // the thing clattering down onto the plates under it.
    burst(p, level = 1) {
      if (!ready()) return;
      music.note('burst');
      if (buffers.impact_metal) sample('impact_metal', p, { level: 1.2 * level, rate: rnd(0.55, 0.72), wet: 0.22, ref: 3.5 });
      tone(0.4, { f: rnd(64, 86), f2: 32, level: 0.85 * level, attack: 0.002, p, wet: 0.22 });
      noise(0.2, { type: 'lowpass', f: 2600, f2: 260, level: 0.75 * level, attack: 0.001, p, wet: 0.25 });
      const floor = p.clone().setY(0.2);
      for (let i = 0; i < 5; i++) noise(0.05, { type: 'bandpass', f: rnd(1700, 3600), q: 4, level: 0.34 * level * (1 - i * 0.16), attack: 0.001, p: floor, at: 0.38 + i * rnd(0.07, 0.16), wet: 0.18 });
      tone(0.12, { f: rnd(90, 120), f2: 50, level: 0.4 * level, attack: 0.002, p: floor, at: 0.36, wet: 0.15 });
    },
    // A round into the wall: metal, where it hit.
    ricochet(p) { if (ready() && buffers.impact_metal) sample('impact_metal', p, { cat: 'hitx', level: rnd(0.35, 0.6), rate: rnd(0.8, 1.25), wet: 0.45, ref: 1.4 }); },
    // One of theirs, on the plates, near: a scuff and a thud, heavier when it runs.
    zstep(p, running) {
      if (!ready()) return;
      // (bare feet and rags on steel plate: one of the recorded steps, slowed and heavy. One source a step: a crowd of
      // them running is a great many steps)
      if (buffers.step0) sample(`step${Math.floor(Math.random() * 8)}`, p, { cat: 'step', level: running ? 1.4 : 1.0, rate: running ? rnd(0.78, 0.9) : rnd(0.62, 0.74), wet: 0, ref: 3.2 });
      else tone(0.09, { cat: 'step', f: rnd(55, 75), f2: 38, level: running ? 0.7 : 0.48, attack: 0.003, p, wet: 0 });
    },
    // A round into one of them: the slap and the wet of it. big: a shotgun's, a melee's.
    meat(p, big = false) {
      if (!ready()) return;
      if (buffers.impact_meat01) sample(pick(['impact_meat01', 'impact_meat02']), p, { cat: 'hit', level: big ? 1.3 : 0.85, rate: rnd(0.88, 1.08), wet: 0.35, ref: 1.6 });
      noise(0.04, { cat: 'hitx', type: 'bandpass', f: 1900, q: 2, level: big ? 0.5 : 0.32, attack: 0.001, p, wet: 0.3 });
      noise(0.14, { cat: 'hitx', type: 'lowpass', f: 600, f2: 150, level: big ? 0.7 : 0.45, attack: 0.002, p, wet: 0.4 });
      tone(0.1, { cat: 'hitx', f: big ? 95 : 130, f2: 50, level: big ? 0.5 : 0.3, attack: 0.002, p, wet: 0.3 });
    },
    // The PA coming on: a crackle, the recorded voice (i: which; -1: the lights-out one) out of a tinny speaker in the
    // ceiling, a hum under it, and the crackle again when it is done. Says how long it runs.
    // The station's welcome, as you land (the PA, the same voice).
    welcome() {
      if (!ready()) return 4;
      const b = buffers.pa_welcome, secs = b ? b.duration : 4;
      music.duck(0.35, secs + 0.8);
      noise(0.3, { type: 'bandpass', f: 2400, f2: 1200, q: 0.7, level: 0.32, attack: 0.005, wet: 0.7 });
      if (b) setTimeout(() => speaker('pa_welcome', { level: 0.95, f: 1400, q: 1.2 }), 380);
      return secs + 0.4;
    },
    // The PA, round ten: Mastre of the Month (the same voice, the same crackle).
    mastre() {
      if (!ready()) return 6;
      const b = buffers.pa_mastre, secs = b ? b.duration : 6;
      music.duck(0.35, secs + 0.8);
      noise(0.3, { type: 'bandpass', f: 2400, f2: 1200, q: 0.7, level: 0.32, attack: 0.005, wet: 0.7 });
      tone(secs + 0.6, { type: 'square', f: 60, f2: 60, level: 0.012, attack: 0.3, wet: 0.9 });
      if (b) setTimeout(() => speaker('pa_mastre', { level: 0.95, f: 1400, q: 1.2 }), 380);
      setTimeout(() => noise(0.18, { type: 'bandpass', f: 1800, f2: 900, q: 0.8, level: 0.22, attack: 0.003, wet: 0.7 }), (secs + 0.5) * 1000);
      return secs + 0.4;
    },
    // A recorder playing by itself, somewhere else in the station: the click, then his voice small and far.
    logFar(day, p) {
      if (!ready()) return;
      noise(0.08, { type: 'highpass', f: 3000, f2: 1500, level: 0.5, attack: 0.002, p, wet: 0.5 });
      setTimeout(() => sample(`log${day}`, p, { level: 0.9, rate: 1.0, wet: 0.7, ref: 1.6 }), 240);
    },
    // One of Jun's recorders: a click, his voice small and close (a recorder, not the PA), the tape's hiss under it.
    log(day) {
      if (!ready()) return 4;
      const name = `log${day}`, b = buffers[name], secs = b ? b.duration : 4;
      music.duck(0.3, secs + 0.8);
      noise(0.08, { type: 'highpass', f: 3000, f2: 1500, level: 0.4, attack: 0.002, wet: 0.2 });   // (the click)
      noise(secs + 0.3, { type: 'bandpass', f: 5000, q: 0.4, level: 0.03, attack: 0.1, wet: 0.2 });   // (hiss)
      if (b) setTimeout(() => sample(name, null, { level: 1.1, rate: 1.06, wet: 0.15 }), 220);
      return secs + 0.5;
    },
    pa(i = 0) {
      if (!ready()) return 6;
      const name = i < 0 ? 'pa_dark' : `pa${((i % 10) + 10) % 10}`, b = buffers[name], secs = b ? b.duration : 5.5;
      music.duck(0.35, secs + 0.9);
      noise(0.3, { type: 'bandpass', f: 2400, f2: 1200, q: 0.7, level: 0.32, attack: 0.005, wet: 0.7 });
      tone(secs + 0.6, { type: 'square', f: 60, f2: 60, level: 0.012, attack: 0.3, wet: 0.9 });
      noise(secs + 0.4, { type: 'bandpass', f: 3000, q: 0.5, level: 0.012, attack: 0.3, wet: 0.9 });
      if (b) setTimeout(() => speaker(name, { level: 0.9, f: 1400, q: 1.2 }), 380);
      setTimeout(() => noise(0.18, { type: 'bandpass', f: 1800, f2: 900, q: 0.8, level: 0.22, attack: 0.003, wet: 0.7 }), (secs + 0.5) * 1000);
      return secs;
    },
    // Over the radio (the shuttle): tighter, with static under it.
    radio(name = 'pa_copy') {
      if (!ready()) return 4;
      const b = buffers[name], secs = b ? b.duration : 4;
      music.duck(0.35, secs + 0.6);
      noise(secs + 0.5, { type: 'bandpass', f: 2600, q: 0.4, level: 0.05, attack: 0.1, wet: 0.1 });
      noise(0.12, { type: 'highpass', f: 2000, level: 0.25, attack: 0.002, wet: 0.2 });
      if (b) speaker(name, { level: 1, f: 1900, q: 2.2 });
      setTimeout(() => noise(0.1, { type: 'highpass', f: 2000, level: 0.2, attack: 0.002, wet: 0.2 }), (secs + 0.1) * 1000);
      return secs;
    },
    // One of them a long way off: a voice in another part of the station, low and smeared by the walls between.
    faraway() {
      if (!ready()) return;
      const a = Math.random() * Math.PI * 2, d = rnd(22, 38);
      const p = new THREE.Vector3(ear.x + Math.cos(a) * d, rnd(0.5, 3), ear.z + Math.sin(a) * d);
      const k = Math.random();
      if (k < 0.3) sample(`ghost${pick([1, 2, 3, 4, 5])}`, p, { level: 2.2, rate: rnd(0.7, 0.95), wet: 1.5, ref: 9 });   // (a long moan, somewhere in the station)
      else if (k < 0.7) sample(`voice${1 + Math.floor(Math.random() * VOICES)}`, p, { level: 2.4, rate: rnd(0.5, 0.75), wet: 1.4, ref: 9 });
      else if (k < 0.85) sample(`voice${pick([16, 17, 18, 21])}`, p, { level: 2.2, rate: rnd(0.6, 0.8), wet: 1.6, ref: 9 });   // (a scream, far off)
      else { for (let i = 0; i < 5; i++) noise(0.09, { type: 'lowpass', f: 900, level: 0.5, p, at: i * rnd(0.25, 0.45), wet: 1.2 }); }   // (something hammering on a door)
    },
    // Something crossing the ceiling: heavy, slow steps, across from one side to the other, over your head.
    overhead() {
      if (!ready()) return;
      const a = Math.random() * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a), n = 5 + Math.floor(Math.random() * 4);
      for (let i = 0; i < n; i++) {
        const s = (i / (n - 1)) * 2 - 1, p = new THREE.Vector3(ear.x + dx * s * 6, 5.6, ear.z + dz * s * 6), at = i * rnd(0.55, 0.8);
        tone(0.25, { f: rnd(48, 62), f2: 30, level: 0.9, attack: 0.004, p, at, wet: 0.6 });
        noise(0.12, { type: 'lowpass', f: 700, f2: 200, level: 0.45, p, at, wet: 0.6 });
        if (Math.random() < 0.3) noise(0.5, { type: 'bandpass', f: 1800, f2: 900, q: 4, level: 0.08, p, at: at + 0.1, wet: 0.8 });   // (dust off the plates)
      }
    },
    // Dead air: everything drops away for a moment, and then something. (index.js: before a scare, between rounds.)
    deadAir(seconds = 2.2, then = 'scream') {
      if (!ready()) return;
      hush = seconds;
      setTimeout(() => {
        if (then === 'scream') { const a = Math.random() * Math.PI * 2; sample(`voice${pick([16, 17, 18, 21])}`, new THREE.Vector3(ear.x + Math.cos(a) * 12, 1.6, ear.z + Math.sin(a) * 12), { level: 2.4, rate: rnd(0.85, 1.05), wet: 0.9, ref: 6 }); api.sting(0.6); }
        else if (then === 'bang') api.bang(1.2);
      }, seconds * 1000);
    },
    // One of them close behind you that you have not seen: its breath, wet, right there.
    behind(z) {
      if (!ready()) return;
      const p = (z.head || z.pos).clone();
      sample(`voice${pick([3, 7, 8, 10, 14, 22])}`, p, { level: 0.9, rate: rnd(0.48, 0.62), wet: 0.12, ref: 2.5 });
    },
    // The melee: the swing of it, and whether it found anything.
    swing(hit) {
      if (!ready()) return;
      noise(0.16, { type: 'bandpass', f: 1200, f2: 300, q: 0.9, level: 0.3, attack: 0.02, wet: 0.2 });
      if (hit) noise(0.08, { type: 'lowpass', f: 900, f2: 200, level: 0.6, attack: 0.001, at: 0.06, wet: 0.4 });
    },
    // A breath, right behind your ear (a scare: nothing is there).
    breath(p) {
      if (!ready()) return;
      // (right at your ear, and loud: it is meant to make you jump)
      noise(1.3, { type: 'bandpass', f: 600, f2: 380, q: 1.2, level: 0.85, attack: 0.35, p, wet: 0.02 });
      noise(0.9, { type: 'bandpass', f: 900, f2: 500, q: 1.5, level: 0.5, attack: 0.2, p, at: 1.4, wet: 0.02 });
      noise(0.5, { type: 'lowpass', f: 300, f2: 150, level: 0.45, attack: 0.05, p, at: 1.35, wet: 0.02 });
      sample(`voice${pick([3, 7, 14])}`, p, { level: 1.4, rate: 0.5, wet: 0.02, ref: 0.6 });
    },
    // A cough: a hard bark from the chest, rough, and the wheeze in after it.
    cough(p, hard = 1) {
      if (!ready()) return;
      noise(0.16, { type: 'bandpass', f: rnd(500, 700), f2: 260, q: 1.6, level: 0.7 * hard, attack: 0.004, p, wet: 0.15 });
      tone(0.14, { type: 'sawtooth', f: rnd(130, 160), f2: 70, level: 0.22 * hard, attack: 0.004, p, wet: 0.15 });
      noise(0.35, { type: 'highpass', f: 1800, f2: 1200, level: 0.12 * hard, attack: 0.08, p, at: 0.18, wet: 0.1 });
    },
    // The power going: everything winding down, the hum dying, and far off in the dark, a scream.
    blackout() {
      if (!ready()) return;
      tone(1.6, { type: 'sawtooth', f: 100, f2: 18, level: 0.25, attack: 0.01, wet: 0.6 });
      tone(1.4, { type: 'sine', f: 50, f2: 12, level: 0.5, attack: 0.01, wet: 0.4 });
      noise(0.5, { type: 'highpass', f: 3000, f2: 800, level: 0.3, wet: 0.5 });
      const far = new THREE.Vector3(rnd(0, station.width * 4), 2, rnd(0, station.depth * 4));
      setTimeout(() => sample(`voice${pick([16, 17, 18])}`, far, { level: 0.9, rate: rnd(0.7, 0.85), wet: 1, ref: 1.2 }), 900);
    },
    // A nuke: the whole station rings with it.
    nuke() {
      if (!ready()) return;
      noise(0.08, { type: 'highpass', f: 1800, f2: 600, level: 1, attack: 0.001, wet: 1 });
      noise(2.2, { type: 'lowpass', f: 2500, f2: 60, level: 0.9, attack: 0.01, wet: 1 });
      tone(2.6, { f: 60, f2: 24, level: 0.9, attack: 0.01, wet: 0.8 });
      tone(3, { type: 'triangle', f: 228, f2: 220, level: 0.08, attack: 0.05, wet: 1 });
    },
    // The crate's hum: a low electric drone with a slow throb, from where it stands (started once, never stopped).
    crateHum(p) {
      if (!ready() || crateHumOn) return;
      crateHumOn = true;
      const mix = ctx.createGain(); mix.gain.value = 0.0001;
      for (const [f, g] of [[58, 0.5], [116, 0.28], [174, 0.12], [1160, 0.03]]) { const o = ctx.createOscillator(), og = ctx.createGain(); o.type = f > 500 ? 'sine' : 'triangle'; o.frequency.value = f; og.gain.value = g; o.connect(og).connect(mix); o.start(); }
      const lfo = ctx.createOscillator(), depth = ctx.createGain(); lfo.frequency.value = 0.9; depth.gain.value = 0.3; lfo.connect(depth).connect(mix.gain); lfo.start();
      mix.gain.setTargetAtTime(0.55, ctx.currentTime, 2);
      placed(mix, p, { level: 0.09, wet: 0.5, ref: 2.2, open: true });
    },
    // The Reactor's crate: its lid creaking open, the click of each gun going by, the chime it stops on, and it closing.
    crate(what) {
      if (!ready()) return;
      if (what === 'open') { noise(0.6, { f: 300, f2: 180, q: 6, level: 0.3, attack: 0.1, wet: 0.5 }); tone(0.8, { type: 'triangle', f: 440, f2: 880, level: 0.1, attack: 0.3, wet: 0.7 }); }
      else if (what === 'tick') tone(0.04, { type: 'square', f: 1800, level: 0.03, wet: 0.3 });
      else if (what === 'done') { tone(0.6, { type: 'triangle', f: 660, level: 0.14, wet: 0.7 }); tone(0.8, { type: 'triangle', f: 990, level: 0.1, at: 0.1, wet: 0.7 }); }
      else tone(0.5, { f: 180, f2: 90, level: 0.2, wet: 0.5 });
    },
    // One landing (out of the vent): a thump on the plates.
    // A rubber chicken, squeezed: the squeak, and the wheeze after it.
    squeak(p) { if (ready()) { tone(0.13, { type: 'square', f: 2100, f2: 1250, level: 0.26, p, wet: 0.3 }); tone(0.2, { type: 'sawtooth', f: 1400, f2: 650, level: 0.2, p, wet: 0.3, at: 0.11 }); noise(0.09, { type: 'bandpass', f: 2600, f2: 1800, level: 0.14, p, at: 0.02 }); } },
    // A drop of blood on the plates.
    drip(p) { if (ready()) tone(0.06, { type: 'sine', f: 1900, f2: 700, level: 0.11, p, wet: 0.35 }); },
    // Six slow steps on the deck over your head.
    overhead(p) { if (ready()) for (let i = 0; i < 6; i++) { const at = i * 0.42, lv = 0.3 + 0.08 * Math.sin(i); tone(0.14, { type: 'sine', f: 110, f2: 55, level: lv, p, wet: 0.65, at }); noise(0.09, { type: 'lowpass', f: 420, f2: 160, level: lv * 0.5, p, wet: 0.6, at }); } },
    // The airlock shut behind you: the breath he lets out, and a warm chord under it.
    relief() { if (!ready()) return; one('breath_scared', { level: 0.45, rate: 0.8, wet: 0.08, dur: 2.6, cap: 2.4 }); for (const [f, at] of [[196, 0.3], [247, 0.45], [294, 0.6]]) tone(2.4, { type: 'sine', f, f2: f, level: 0.05, attack: 0.5, wet: 0.6, at }); },
    thud(p) { if (ready()) { tone(0.25, { f: 90, f2: 40, level: 0.7, p, wet: 0.4 }); noise(0.2, { type: 'lowpass', f: 1200, f2: 200, level: 0.5, p, wet: 0.5 }); } },
    // A friend's shot, from where they are: a crack, the boom of it, and the corridors ringing with it.
    shotFrom(p, gun = 'pistol') {
      if (!ready()) return;
      const big = gun === 'shotgun' || gun === 'revolver', rifle = gun === 'machineGun';
      noise(0.05, { type: 'highpass', f: 2600, f2: 1400, q: 0.7, level: big ? 0.8 : 0.6, attack: 0.001, p, wet: 0.6 });
      noise(big ? 0.35 : 0.22, { type: 'lowpass', f: big ? 1400 : 2000, f2: 150, q: 0.7, level: big ? 0.9 : rifle ? 0.55 : 0.65, attack: 0.002, p, wet: 0.8 });
      tone(big ? 0.3 : 0.18, { f: big ? 90 : 130, f2: 40, level: big ? 0.7 : 0.45, attack: 0.002, p, wet: 0.5 });
    },
    // A part of a reload, recorded: in his hands, so right by your ear, and a little of the room's ring on it.
    part(name) {
      if (!ready() || !buffers[name]) return;
      sample(name, null, { level: 0.95, rate: rnd(0.97, 1.03), wet: 0.12 });
    },
    // Something dropped on the plates: a magazine (a clack and a skitter), or a spent case (a bright tink or two).
    clatter(kind, p, level = 1) {
      if (!ready()) return;
      if (kind === 'mag') {
        noise(0.06, { f: rnd(2400, 3200), q: 3, level: 0.35 * level, p, wet: 0.35 });
        tone(0.12, { type: 'triangle', f: rnd(1500, 1900), f2: 1400, level: 0.06 * level, p, wet: 0.4 });
        tone(0.08, { f: 140, f2: 80, level: 0.25 * level, p, wet: 0.2 });
        noise(0.05, { f: rnd(2600, 3600), q: 4, level: 0.18 * level, p, at: rnd(0.06, 0.1), wet: 0.35 });
      } else {
        const f = rnd(3800, 5600);
        tone(0.16, { f, f2: f * 0.98, level: 0.07 * level, p, wet: 0.5 });
        tone(0.1, { f: f * 1.47, level: 0.03 * level, p, wet: 0.5 });
        if (Math.random() < 0.6) tone(0.1, { f: f * 1.05, level: 0.04 * level, p, at: rnd(0.08, 0.16), wet: 0.5 });
      }
    },
    reload(seconds) {
      if (!ready()) return;
      noise(0.05, { type: 'highpass', f: 3200, q: 3, level: 0.22, wet: 0.1 });                                   // the magazine out
      tone(0.06, { type: 'square', f: 600, f2: 300, level: 0.05, at: 0.02 });
      noise(0.07, { f: 1800, q: 4, level: 0.28, at: seconds * 0.55, wet: 0.1 });                                  // the new one in
      tone(0.05, { type: 'square', f: 420, f2: 260, level: 0.06, at: seconds * 0.55 });
      noise(0.09, { type: 'highpass', f: 2400, f2: 1600, q: 2, level: 0.25, at: seconds * 0.85, wet: 0.1 });       // the slide
      tone(0.05, { type: 'square', f: 900, f2: 500, level: 0.05, at: seconds * 0.9 });
    },
    dry() { if (ready()) { noise(0.03, { type: 'highpass', f: 4000, q: 5, level: 0.2, wet: 0.05 }); tone(0.03, { type: 'square', f: 1400, level: 0.04 }); } },
    swap() { if (ready()) { noise(0.12, { f: 1400, f2: 2400, q: 2, level: 0.15, wet: 0.1 }); tone(0.05, { type: 'square', f: 700, level: 0.04, at: 0.1 }); } },
    heartbeat(level) {
      tone(0.16, { f: 62, f2: 42, level: 0.5 * level, attack: 0.01, wet: 0 });
      tone(0.14, { f: 58, f2: 40, level: 0.38 * level, attack: 0.01, at: 0.22, wet: 0 });
    },
    // A door sliding open: air, then the panels going.
    door(p) { if (ready()) { noise(1.1, { f: 2800, f2: 600, q: 0.8, level: 0.4, attack: 0.02, p, wet: 0.5 }); tone(0.9, { type: 'sawtooth', f: 70, f2: 48, level: 0.12, attack: 0.1, p, wet: 0.5 }); tone(0.3, { f: 90, f2: 40, level: 0.4, p, at: 0.85, wet: 0.7 }); } },
    // Bought something: a dull terminal chime.
    buy() { if (ready()) { tone(0.25, { type: 'triangle', f: 880, level: 0.12, wet: 0.4 }); tone(0.35, { type: 'triangle', f: 1320, level: 0.1, at: 0.09, wet: 0.4 }); } },
    deny() { if (ready()) { tone(0.18, { type: 'square', f: 180, level: 0.06, wet: 0.2 }); tone(0.18, { type: 'square', f: 150, level: 0.06, at: 0.16, wet: 0.2 }); } },
    // Something heavy on the airlock door, heard from inside the lounge: steel, and the whole frame ringing with it.
    bang(level = 1, p = null) {
      if (!bus) return;
      tone(0.5, { f: 70, f2: 38, level: 0.55 * level, attack: 0.004, wet: 0.5, p });
      noise(0.25, { type: 'lowpass', f: 900, f2: 120, level: 0.5 * level, attack: 0.003, wet: 0.6, p });
      tone(0.9, { type: 'triangle', f: 196, f2: 190, level: 0.05 * level, attack: 0.005, wet: 0.8, p });
      tone(0.7, { type: 'triangle', f: 287, f2: 280, level: 0.03 * level, attack: 0.005, wet: 0.8, p });
    },
    // In the lounge: the station is still out there, through the walls (dull, far off); out again, as it is.
    inside(on) {
      if (!bus) return;
      const t = ctx.currentTime;
      shut = on;
      dull.frequency.setTargetAtTime(on ? 420 : 20000, t, 0.3);
      world.gain.setTargetAtTime(on ? 0.45 : 1, t, 0.3);
    },
    // A song, straight onto the bus (not through the station: it is in the room with you, however shut the station is).
    // Returns { stop(), level(v) }, or null if it is not in yet.
    song(name, { level = 1, loop = true } = {}) {
      if (!bus || !buffers[name]) return null;
      const src = ctx.createBufferSource(), gn = ctx.createGain();
      src.buffer = buffers[name]; src.loop = loop;
      gn.gain.value = level;
      src.connect(gn).connect(bus);
      const t0 = ctx.currentTime;
      src.start(t0);
      return { stop() { try { gn.gain.setTargetAtTime(0, ctx.currentTime, 0.2); src.stop(ctx.currentTime + 1); } catch {} }, level(v, over = 0.8) { gn.gain.setTargetAtTime(v, ctx.currentTime, over); }, time: () => ctx.currentTime - t0, length: src.buffer.duration };
    },
    // The crowd (them): a roar as the band comes on, applause (of a kind) at the end: a lot of them at once, close round you.
    crowd(kind, p) {
      if (!ready()) return;
      const n = kind === 'roar' ? 7 : 5;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2, q = new THREE.Vector3(p.x + Math.cos(a) * 2.5, 1.4, p.z + Math.sin(a) * 2.5);
        setTimeout(() => (kind === 'roar' ? moan('groan', q, { level: 1.2, rate: rnd(0.9, 1.2), wet: 0.6, ref: 2, }) : sample(`voice${pick([16, 17, 18, 21])}`, q, { level: 0.7, rate: rnd(1.1, 1.4), wet: 0.6, ref: 2 })), i * rnd(60, 220));
      }
      noise(kind === 'roar' ? 1.6 : 2.4, { type: 'bandpass', f: 500, f2: 900, q: 0.6, level: kind === 'roar' ? 0.5 : 0.35, attack: 0.2, wet: 0.8 });
    },
    // Decompression: the siren (two tones, over and over) and the air going out past you.
    siren(seconds = 10) {
      if (!ready()) return;
      for (let i = 0; i < seconds * 2; i++) tone(0.45, { type: 'square', f: i % 2 ? 620 : 470, level: 0.07, attack: 0.01, at: i * 0.5, wet: 0.6 });
      noise(seconds, { type: 'bandpass', f: 600, f2: 900, q: 0.5, level: 0.5, attack: 0.6, wet: 0.5 });
    },
    // The air going: a roar up the shaft for as long as it is open, gusting, and the shriek of it through the hatch's edge.
    wind(seconds = 10) {
      if (!ready()) return;
      noise(seconds, { type: 'lowpass', f: 520, f2: 260, level: 0.9, attack: 0.25, wet: 0.25 });
      noise(seconds, { type: 'bandpass', f: 1300, f2: 800, q: 0.7, level: 0.45, attack: 0.5, wet: 0.35 });
      for (let i = 0; i < seconds * 1.5; i++) noise(0.5 + Math.random() * 0.4, { type: 'bandpass', f: rnd(1800, 3200), q: 3, level: 0.18, attack: 0.15, at: i / 1.5 + Math.random() * 0.3, wet: 0.4 });   // (the gusts)
    },
    // The outer door slamming shut.
    slam(p) { if (!ready()) return; tone(0.5, { f: 70, f2: 35, level: 0.9, attack: 0.004, p, wet: 0.6 }); noise(0.3, { type: 'lowpass', f: 1200, f2: 100, level: 0.7, attack: 0.002, p, wet: 0.6 }); },
    // A pipe letting go: a hiss, hard then dying, from where it is.
    steam(p) {
      if (!ready()) return;
      noise(1.6, { type: 'bandpass', f: 3400, f2: 1800, q: 0.8, level: 0.9, attack: 0.01, p, wet: 0.5 });
      noise(0.12, { type: 'highpass', f: 2000, f2: 4000, level: 0.7, attack: 0.002, p, wet: 0.3 });
    },
    // A cable giving way over your head, and what was on it coming down.
    cable(p) {
      if (!ready()) return;
      noise(0.5, { type: 'bandpass', f: 900, f2: 1600, q: 2, level: 0.5, attack: 0.004, p, wet: 0.6 });
      tone(0.6, { type: 'triangle', f: 480, f2: 190, level: 0.2, attack: 0.003, p, wet: 0.6 });
    },
    // Them at the airlock, heard from inside the lounge: a groan through the door, nails down it, now and then a fist on it.
    atDoor(p, n = 1) {
      if (!ready()) return;
      const k = Math.random();
      if (k < 0.45) moan('groan', p, { level: 1.6 + 0.2 * Math.min(3, n), rate: rnd(0.75, 0.95), wet: 0.7, ref: 2 });
      else if (k < 0.75) { for (let i = 0; i < 3; i++) noise(0.14, { type: 'bandpass', f: 2400, f2: 1500, q: 2.5, level: 0.35, p, at: i * rnd(0.12, 0.2), wet: 0.5 }); }   // (nails down the door)
      else api.bang(0.9 + 0.3 * Math.min(3, n), p);
    },
    // You are down.
    down() { if (ready()) { tone(3, { f: 40, f2: 25, level: 0.8, attack: 0.01, wet: 0.6 }); noise(2.5, { type: 'lowpass', f: 1200, f2: 50, level: 0.5, wet: 0.8 }); } },
  };
  void at;
  // Nothing in here may throw into the game: a sound that fails is a sound not heard (his report: the sound stopped,
  // and with it whatever came after it in that frame). The station's own noises are marked as such while they are made.
  const ENV = new Set(['station', 'faraway', 'overhead']);
  for (const [k, desc] of Object.entries(Object.getOwnPropertyDescriptors(api))) {
    if (typeof desc.value !== 'function' || k === 'music') continue;
    const f = desc.value, env = ENV.has(k);
    api[k] = (...a) => { if (env) catNow = 'env'; try { return f.apply(api, a); } catch (e) { budget.errors++; return null; } finally { if (env) catNow = null; } };
  }
  return api;
}

// A steel room's ring: noise dying away, with a few resonances (the corridor's own notes) combed into it.
function steelTail(ctx, seconds) {
  const n = Math.floor(ctx.sampleRate * seconds), buffer = ctx.createBuffer(2, n, ctx.sampleRate);
  const notes = [93, 141, 228, 371, 512, 707].map((f) => (2 * Math.PI * f) / ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buffer.getChannelData(c);
    let low = 0;
    for (let i = 0; i < n; i++) {
      const k = i / n;
      low = low * 0.6 + (Math.random() * 2 - 1) * 0.4;
      let ring = 0;
      for (let j = 0; j < notes.length; j++) ring += Math.sin(notes[j] * i + c * 1.7 + j) * (0.05 / (1 + j * 0.4));
      d[i] = (low * 0.85 + ring * (0.5 + 0.5 * k)) * (1 - k) ** 2.6 * (i < 220 ? i / 220 : 1);
    }
  }
  return buffer;
}
