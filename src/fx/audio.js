// Synthesized sound effects (WebAudio, no files). Music lives in music.js and
// shares the audio context and volume controls set up here.
import { config } from '../config.js';

// sfx / music: the two volume controls. duck: turns the music down for a moment (cutscenes) without touching its volume setting.
export const audio = { ctx: null, noise: null, sfx: null, music: null, duck: null, score: null, out: null, verb: null, verbOut: null, sends: null, places: null, tails: null, muted: false, sfxMuted: false };   // muted = the music is off

// Recorded sounds (optional). Any audio file dropped into src/assets/sounds/
// replaces the synthesized sound of the same name: e.g. sniper.mp3 replaces
// the built-in sniper shot. See the README in that folder.
const files = import.meta.glob('../assets/sounds/*.{mp3,ogg,wav,m4a}', { eager: true, query: '?url', import: 'default' });
const samples = {};   // name -> decoded AudioBuffer, once loaded
function loadSamples() {
  for (const [path, url] of Object.entries(files)) {
    const name = path.split('/').pop().replace(/\.\w+$/, '');
    fetch(url).then((r) => r.arrayBuffer()).then((data) => audio.ctx.decodeAudioData(data)).then((buffer) => { samples[name] = buffer; }).catch(() => {});
  }
}
// Plays a recorded sound if there is one. Returns false if there isn't.
function playSample(name, volume = 1) {
  if (!samples[name]) return false;
  const src = audio.ctx.createBufferSource(), gain = audio.ctx.createGain();
  src.buffer = samples[name];
  gain.gain.value = volume * mix.level;
  src.connect(gain).connect(out());
  ends.push(audio.ctx.currentTime, audio.ctx.currentTime + Math.min(1.5, src.buffer.duration));
  src.start();
  return true;
}
const midi = (n) => 440 * 2 ** ((n - 69) / 12);

// ---- The mixer -----------------------------------------------------------------------------------
// Everything ends up in one place:
//   effects -> a gentle compressor \
//                                   +-> master -> limiter -> soft clip -> out
//   music   -> a gentle compressor /
// The limiter and the soft clip are what stop a wall of gunfire from crackling: whatever is thrown at them, what
// comes out never goes over full scale. (A compressor on its own does not promise that.)
//
// Effects do not go straight to the effects bus: each is sent to a "place", one of a few fixed positions across the
// stereo field, near or far. Near places send a little of the sound to the reverb, far ones a lot. The reverb itself
// is a generated impulse response, one per kind of space (setSpace): open air, a cave, a hall, the Moon.
const PANS = [-0.6, -0.3, 0, 0.3, 0.6];
const SPACES = {
  //        seconds  how fast it dies  how dull   how loud   sent from near / far
  open: { time: 1.2, decay: 3.2, dull: 0.5, level: 0.55, near: 0.05, far: 0.3 },    // the cemetery, the hill
  cave: { time: 3.0, decay: 1.9, dull: 0.82, level: 0.9, near: 0.14, far: 0.5 },    // the Catacombs
  hall: { time: 1.9, decay: 2.3, dull: 0.35, level: 0.7, near: 0.09, far: 0.4 },    // the House, the casino
  moon: { time: 0.4, decay: 4.5, dull: 0.88, level: 0.3, near: 0.03, far: 0.12 },   // hardly any air to carry it
};
let space = 'open';

// A reverb tail made from noise: two channels that die away, the top end going first.
function impulse(ctx, { time, decay, dull }) {
  const n = Math.floor(ctx.sampleRate * time), buffer = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c);
    let low = 0;
    for (let i = 0; i < n; i++) {
      const k = i / n, soft = dull + (0.97 - dull) * k;   // (duller as it goes on)
      low = low * soft + (Math.random() * 2 - 1) * (1 - soft);
      data[i] = low * (1 - k) ** decay * (i < 180 ? i / 180 : 1);
    }
  }
  return buffer;
}

function build(ctx) {
  audio.ctx = ctx;
  const squash = (threshold, knee, ratio, attack, release) => { const c = ctx.createDynamicsCompressor(); c.threshold.value = threshold; c.knee.value = knee; c.ratio.value = ratio; c.attack.value = attack; c.release.value = release; return c; };
  const level = (v) => { const g = ctx.createGain(); g.gain.value = v; return g; };
  // The way out.
  const master = level(1), limiter = squash(-5, 3, 20, 0.002, 0.09), pre = level(0.5), clip = ctx.createWaveShaper();
  const curve = new Float32Array(2049);
  for (let i = 0; i < curve.length; i++) { const x = ((i / 1024) - 1) * 2; curve[i] = x / (1 + x ** 4) ** 0.25; }   // straight up to about 0.6, then bending over to 1
  clip.curve = curve;
  clip.oversample = '2x';
  master.connect(limiter).connect(pre).connect(clip).connect(ctx.destination);
  audio.out = clip;   // (the very end of the chain: for measuring)
  const sfxOut = squash(-16, 8, 3, 0.015, 0.14), musicOut = squash(-18, 8, 3, 0.01, 0.2);
  sfxOut.connect(level(0.66)).connect(master);       // (made up to the level the game has always been mixed at)
  musicOut.connect(level(0.59)).connect(master);
  audio.sfx = level(1);
  audio.music = level(1);
  audio.duck = level(1);
  audio.sfx.connect(sfxOut);
  audio.music.connect(audio.duck).connect(musicOut);
  // The story's own music (fx/score.js): on the music's volume control, but not held down with the level's music.
  audio.score = level(1);
  audio.score.connect(musicOut);
  // The reverb, and the places that feed it.
  audio.verb = ctx.createConvolver();
  audio.verbOut = level(0.5);
  audio.verb.connect(audio.verbOut).connect(audio.sfx);
  audio.sends = { near: level(0.05), far: level(0.3) };
  const placeBus = level(Math.SQRT2);   // (a panner halves the power of a sound in the middle: put it back)
  placeBus.connect(audio.sfx);
  audio.places = {};
  for (const reach of ['near', 'far']) {
    audio.sends[reach].connect(audio.verb);
    audio.places[reach] = PANS.map((pan) => {
      const node = ctx.createStereoPanner ? ctx.createStereoPanner() : level(1);
      if (node.pan) node.pan.value = pan;
      node.connect(placeBus);
      node.connect(audio.sends[reach]);
      return node;
    });
  }
  audio.tails = {};
  audio.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = audio.noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  overdrive = null;
  setSpace(space);
}

// What kind of place the sound is in: 'open', 'cave', 'hall' or 'moon' (see SPACES). main.js sets it with the level.
export function setSpace(name) {
  space = SPACES[name] ? name : 'open';
  if (!audio.ctx) return;
  const S = SPACES[space];
  audio.verb.buffer = audio.tails[space] || (audio.tails[space] = impulse(audio.ctx, S));
  audio.verbOut.gain.value = S.level;
  audio.sends.near.gain.value = S.near;
  audio.sends.far.gain.value = S.far;
}

// Browsers only allow audio after a click/keypress; call this from one.
// Returns true once sound is available.
export function unlockAudio() {
  if (!audio.ctx) {
    let ctx;
    try { ctx = new AudioContext(); } catch { return false; }
    build(ctx);
    applyVolume();
    loadSamples();
  }
  if (audio.ctx.state === 'suspended') audio.ctx.resume();
  return true;
}

// For measuring (not used by the game): play whatever `fn` plays into a context that is not connected to the
// speakers, and return what came out as an AudioBuffer. The live mixer is put back afterwards.
export async function renderOffline(fn, seconds = 3) {
  const live = { ...audio }, liveEnds = ends.splice(0), liveLast = { ...lastPlayed }, liveFlame = flame, liveDrive = overdrive;
  for (const k in lastPlayed) delete lastPlayed[k];
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * 44100), 44100);
  offline = true;
  flame = null;
  let buffer = null;
  try {
    build(ctx);
    await fn(ctx);
    buffer = await ctx.startRendering();
  } finally {
    offline = false;
    Object.assign(audio, live);
    ends.length = 0;
    ends.push(...liveEnds);
    for (const k in lastPlayed) delete lastPlayed[k];
    Object.assign(lastPlayed, liveLast);
    flame = liveFlame;
    overdrive = liveDrive;
  }
  return buffer;
}
let offline = false;

// Push the volumes (and the mute toggles) to the mixer. Safe to call often: it only
// does anything when a value has actually changed.
const applied = { sfx: null, music: null };
export function applyVolume() {
  if (!audio.ctx) return;
  const t = audio.ctx.currentTime, sfx = audio.sfxMuted ? 0 : config.audio.sfxVolume, music = audio.muted ? 0 : config.audio.musicVolume;
  if (sfx !== applied.sfx) { applied.sfx = sfx; audio.sfx.gain.cancelScheduledValues(t); audio.sfx.gain.setTargetAtTime(sfx, t, 0.05); }
  if (music !== applied.music) {
    applied.music = music;
    for (const bus of [audio.music, audio.score]) { bus.gain.cancelScheduledValues(t); bus.gain.setTargetAtTime(music, t, 0.05); }
  }
}
export function toggleMusic() {
  audio.muted = !audio.muted;
  applyVolume();
  return !audio.muted;
}

const ready = () => audio.ctx && (offline || audio.ctx.state === 'running');

// Guards against a flood of sound effects (hundreds of monsters dying at once, a gun firing sixty times a second),
// which makes the audio crackle and drop out:
//   voices  how many effect sounds are playing right now, counted from when each is due to end (so one that never
//           reports back cannot be counted for ever). Past MAX_VOICES, new ones are skipped; small sounds (a hit, a
//           pickup) give way sooner than that, at BUSY, so that there is always room for a gunshot.
//   spaced  true if the named sound hasn't played in the last `gap` seconds (and marks it as played).
const MAX_VOICES = 90, BUSY = 56;
const ends = [];   // every sound due to be heard: when it starts and when it ends, one after the other
function voices() {
  const now = audio.ctx.currentTime;
  let playing = 0;
  for (let i = ends.length - 2; i >= 0; i -= 2) {
    if (ends[i + 1] <= now) ends.splice(i, 2);
    else if (ends[i] <= now + 0.02) playing++;   // (one scheduled for later in a scene is not using anything yet)
  }
  return playing;
}
const full = () => voices() >= MAX_VOICES;
const busy = () => voices() >= BUSY;
// Everything that is sounding or due to: kept so that it can all be cut off at once (stopAllSounds).
const sources = new Set();
export function stopAllSounds() {
  if (!audio.ctx) return;
  for (const source of sources) { try { source.stop(); } catch {} }
  sources.clear();
  ends.length = 0;
  setFlame(false);
}
const lastPlayed = {};
function spaced(name, gap) {
  const now = audio.ctx.currentTime;
  if (now - (lastPlayed[name] ?? -1) < gap) return false;
  lastPlayed[name] = now;
  return true;
}

// Where the sound being built right now is going, and how loud. The play functions set this (through `placed`) and
// the building blocks read it.
//   reach  'near' (dry, close) or 'far' (a lot of the room on it)
//   pan    -1 (left) .. 1 (right)
//   level  everything in it is multiplied by this
//   thin   true: leave out its long tails (a gun firing faster than its own echo)
const mix = { reach: 'near', pan: 0, level: 1, thin: false };
// While a story scene plays, every effect is this much louder (cutscenes.js sets it): the scene is all there is to hear.
let boost = 1;
export const sceneBoost = (k) => { boost = k; };
function placed(how, fn) {
  const was = { ...mix };
  Object.assign(mix, how);
  try { return fn(); } finally { Object.assign(mix, was); }
}
const far = (fn, pan = 0) => placed({ reach: 'far', pan }, fn);
const loud = (k, fn) => placed({ level: mix.level * k }, fn);   // the same sound, k times the level
const around = () => (Math.random() - 0.5) * 1.3;   // somewhere off to one side or the other
// The node to connect to. Anything low goes down the middle (bass off to one side just sounds wrong).
function out(low = false) {
  const pan = low ? 0 : mix.pan;
  let nearest = 0;
  for (let i = 1; i < PANS.length; i++) if (Math.abs(PANS[i] - pan) < Math.abs(PANS[nearest] - pan)) nearest = i;
  return audio.places[mix.reach][nearest];
}

// ---- Building blocks ---------------------------------------------------------

// A pitched tone that slides from one frequency to another and fades out.
function tone(type, from, to, time, volume, at = 0) {
  if (full()) return;
  const ctx = audio.ctx, t = ctx.currentTime + at, osc = ctx.createOscillator(), gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(to, t + time);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume * mix.level * boost), t + Math.min(0.006, time * 0.3));
  gain.gain.exponentialRampToValueAtTime(0.001, t + time);
  osc.connect(gain).connect(out(Math.max(from, to) < 260));
  ends.push(t, t + time);
  sources.add(osc);
  osc.onended = () => sources.delete(osc);
  osc.start(t);
  osc.stop(t + time + 0.02);
}

// A burst of filtered noise whose filter sweeps from one frequency to another.
function hiss(filterType, from, to, time, volume, at = 0) {
  if (full() || (mix.thin && time >= 0.2)) return;
  const ctx = audio.ctx, t = ctx.currentTime + at;
  const src = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
  src.buffer = audio.noise;
  src.loop = true;   // (the noise is a second long: anything longer goes round again)
  src.playbackRate.value = 0.9 + Math.random() * 0.2;
  filter.type = filterType;
  filter.frequency.setValueAtTime(from, t);
  filter.frequency.exponentialRampToValueAtTime(to, t + time);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.linearRampToValueAtTime(volume * mix.level * boost, t + Math.min(0.0015, time * 0.15));   // (a hair of fade-in: starting at full is a click)
  gain.gain.exponentialRampToValueAtTime(0.001, t + time);
  src.connect(filter).connect(gain).connect(out(filterType === 'lowpass' && Math.max(from, to) < 400));
  ends.push(t, t + time);
  sources.add(src);
  src.onended = () => sources.delete(src);
  src.start(t, Math.random() * 0.5);
  src.stop(t + time + 0.02);
}

// A voice: a buzz at the pitch of a throat, through two filters that shape it into a vowel ([first, second] formant,
// in Hz: about [700, 1150] is "ah", [450, 900] "uh", [350, 2000] "ee").
function voiced(from, to, time, volume, at = 0, vowel = [700, 1150]) {
  if (full()) return;
  const ctx = audio.ctx, t = ctx.currentTime + at, osc = ctx.createOscillator(), gain = ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(to, t + time);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(volume * mix.level * boost, t + Math.min(0.025, time * 0.3));
  gain.gain.exponentialRampToValueAtTime(0.001, t + time);
  vowel.forEach((f, i) => {
    const band = ctx.createBiquadFilter(), level = ctx.createGain();
    band.type = 'bandpass';
    band.frequency.value = f;
    band.Q.value = 5;
    level.gain.value = i ? 0.55 : 1;
    osc.connect(band).connect(level).connect(gain);
  });
  gain.connect(out());
  ends.push(t, t + time);
  sources.add(osc);
  osc.onended = () => sources.delete(osc);
  osc.start(t);
  osc.stop(t + time + 0.02);
}

// ---- Sounds ------------------------------------------------------------------

// A muzzle blast: noise pushed hard into a clipper, so it hits like a slap rather than a hiss.
let overdrive = null;
function clipper() {
  if (!overdrive) {
    overdrive = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) overdrive[i] = Math.tanh(((i / 512) - 1) * 6);
  }
  return overdrive;
}
function blast(from, to, time, volume, at = 0) {
  if (full()) return;
  const ctx = audio.ctx, t = ctx.currentTime + at;
  const src = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), drive = ctx.createWaveShaper(), gain = ctx.createGain();
  src.buffer = audio.noise;
  src.loop = true;
  src.playbackRate.value = 0.9 + Math.random() * 0.2;
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(from, t);
  filter.frequency.exponentialRampToValueAtTime(to, t + time * 0.9);
  drive.curve = clipper();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.linearRampToValueAtTime(volume * mix.level * boost, t + Math.min(0.0015, time * 0.15));
  gain.gain.exponentialRampToValueAtTime(0.001, t + time);
  src.connect(filter).connect(drive).connect(gain).connect(out());
  ends.push(t, t + time);
  sources.add(src);
  src.onended = () => sources.delete(src);
  src.start(t, Math.random() * 0.5);
  src.stop(t + time + 0.03);
}

// Gunshots, built the way a real one is: the crack of the round, an overdriven
// muzzle blast, a thump of low end you feel, the action working, and the report
// rolling away. `r` detunes every shot a little so bursts don't sound stamped out.
// (Drop pistol.mp3, machineGun.mp3, shotgun.mp3 or launcher.mp3 into
// src/assets/sounds/ and the recording plays instead.)
const SHOTS = {
  // 9 mm pistol: a short, dry bark and the slide snapping back.
  pistol(r) {
    hiss('highpass', 5200 * r, 2600, 0.018, 0.5);
    blast(4600 * r, 260, 0.12, 0.42);
    tone('sine', 165 * r, 46, 0.1, 0.6);
    tone('triangle', 340 * r, 90, 0.05, 0.25);
    hiss('lowpass', 1500, 180, 0.4, 0.1, 0.03);
    tone('square', 2200, 1500, 0.014, 0.035, 0.075);
  },
  // Assault rifle on full auto: tighter and harder, each round on top of the last one's tail.
  machineGun(r) {
    hiss('highpass', 6000 * r, 3200, 0.012, 0.36);
    blast(3800 * r, 340, 0.075, 0.36);
    tone('sine', 140 * r, 52, 0.07, 0.5);
    hiss('lowpass', 1100, 240, 0.22, 0.07, 0.02);
  },
  // 12 gauge: a boom with a long tail, then the pump racked back and forward.
  shotgun(r) {
    hiss('highpass', 4200 * r, 1800, 0.03, 0.5);
    blast(3200 * r, 110, 0.32, 0.6);
    tone('sine', 98 * r, 26, 0.55, 0.85);
    tone('sine', 170 * r, 40, 0.26, 0.5);
    hiss('lowpass', 950, 90, 1.2, 0.26, 0.05);
    hiss('lowpass', 600, 100, 0.6, 0.1, 0.3);
    hiss('bandpass', 2000, 900, 0.05, 0.2, 0.27); tone('square', 430, 300, 0.035, 0.06, 0.27);
    hiss('bandpass', 2600, 1300, 0.045, 0.18, 0.38); tone('square', 560, 420, 0.03, 0.05, 0.38);
  },
  // Hand Cannon: a magnum. Bigger and longer than the pistol, with a heavy thump under it.
  revolver(r) {
    hiss('highpass', 4600 * r, 2000, 0.025, 0.55);
    blast(3600 * r, 150, 0.24, 0.6);
    tone('sine', 120 * r, 34, 0.32, 0.85);
    tone('triangle', 260 * r, 70, 0.1, 0.3);
    hiss('lowpass', 1000, 120, 0.9, 0.2, 0.04);
  },
  // Frostbite: a lance of ice. A crack, a rush of cold air, and a glassy ring.
  cryo(r) {
    tone('sine', 900 * r, 240, 0.14, 0.4);
    hiss('highpass', 6500 * r, 2600, 0.16, 0.22);
    hiss('bandpass', 1400, 500, 0.12, 0.2);
    tone('triangle', 3400 * r, 3000, 0.22, 0.06, 0.02);
    tone('sine', 5100 * r, 4700, 0.3, 0.035, 0.03);
  },
  // Sawblade Launcher: steel leaving steel. A spring's clack, then the blade ringing as it spins up.
  saw(r) {
    tone('sine', 170 * r, 70, 0.07, 0.45);
    hiss('highpass', 6200, 3000, 0.1, 0.22);
    tone('sawtooth', 1850 * r, 2650, 0.2, 0.11);
    tone('square', 2780 * r, 3950, 0.24, 0.05);
    tone('sine', 4170 * r, 4170, 0.42, 0.06, 0.01);
    tone('sine', 6230 * r, 6230, 0.3, 0.03, 0.01);
  },
  // Launcher: a hollow "thoomp" out of the tube.
  launcher(r) {
    tone('sine', 200 * r, 42, 0.32, 0.85);
    tone('triangle', 290 * r, 110, 0.16, 0.3);
    blast(1000 * r, 140, 0.22, 0.4);
    hiss('bandpass', 520, 180, 0.35, 0.2, 0.02);
    hiss('lowpass', 700, 90, 0.8, 0.12, 0.08);
  },
};
// rate: how many shots a second the gun is firing right now. Past about eighteen a second separate shots stop being
// shots and turn into a buzz (and enough of them at once is what used to make the sound break up), so a faster gun
// still makes eighteen a second: each a little quieter and a little higher, and without its echo unless there is
// room for one.
const SHOT_GAP = 1 / 18;
export function playShot(id, rate = 0) {
  if (!ready() || !spaced('shot', Math.min(SHOT_GAP, rate > 0 ? 1 / rate : SHOT_GAP) * 0.98) || voices() > MAX_VOICES - 8) return;
  if (playSample(id)) return;
  const heard = Math.min(rate, 18), dense = heard > 10;
  placed({ reach: 'near', pan: (Math.random() - 0.5) * 0.3, level: dense ? Math.sqrt(10 / heard) : 1, thin: dense && !spaced('shotTail', 0.16) }, () => {
    (SHOTS[id] || SHOTS.pistol)((0.94 + Math.random() * 0.12) * (1 + Math.min(0.18, Math.max(0, rate - 12) / 300)));
  });
}

// A headshot: a crack, a punch you feel, and the ring of it.
export function playHeadshot() {
  if (!ready() || !spaced('headshot', 0.07)) return;
  placed({ reach: 'far', pan: around() * 0.4 }, () => {
    blast(5200, 500, 0.07, 0.6);
    hiss('highpass', 6500, 2500, 0.03, 0.4);
    tone('sine', 120, 38, 0.24, 0.9);
    tone('triangle', 240, 70, 0.1, 0.4);
    tone('square', 1500, 700, 0.05, 0.14);
    tone('sine', 2500, 2450, 0.3, 0.12, 0.01);
    tone('sine', 3760, 3700, 0.2, 0.05, 0.01);
  });
}
export const playSwitch = () => ready() && loud(1.5, () => (hiss('highpass', 3000, 5000, 0.05, 0.12), tone('square', 320, 240, 0.05, 0.08, 0.05)));

export const playHit = () => ready() && loud(4.5, () => !busy() && spaced('hit', 0.05) && placed({ pan: around() }, () => { const f = 760 + Math.random() * 320; tone('square', f, f * 0.55, 0.04, 0.045); hiss('bandpass', 1800, 700, 0.035, 0.07); }));     // bullet hits a monster: a tick and a bit of thud
// A monster goes down: a crunch, a thud and something wet. Kills come in runs, so each one after the first in a run is
// a little quieter and pitched a little differently, and they are spread out to either side.
let lastKill = -1, run = 0;
export function playKill() {
  if (!ready() || busy() || !spaced('kill', 0.06)) return;
  const now = audio.ctx.currentTime;
  run = now - lastKill < 0.25 ? Math.min(run + 1, 6) : 0;
  lastKill = now;
  const f = 150 + Math.random() * 70 + run * 6;
  placed({ pan: around(), level: mix.level * (1 - 0.07 * run) }, () => {
    blast(2600, 280, 0.07, 0.24);
    tone('sine', f, 42, 0.17, 0.45);
    tone('triangle', f * 2, 80, 0.07, 0.15);
    hiss('bandpass', 1100, 350, 0.13, 0.15, 0.015);
  });
}
// You got clawed: a grunt ("ugh"), the breath going out of him, and the thump of it landing.
export function playHurt() {
  if (!ready() || !spaced('hurt', 0.12)) return;
  const pitch = 0.92 + Math.random() * 0.16;
  voiced(165 * pitch, 92 * pitch, 0.24, 2.6, 0, [470, 950]);
  voiced(168 * pitch, 96 * pitch, 0.2, 1.1, 0.01, [600, 1400]);
  hiss('bandpass', 700, 380, 0.16, 0.22);
  tone('sine', 95, 42, 0.16, 0.5);
  hiss('bandpass', 1500, 500, 0.06, 0.2);
}

// Landing a trick: a thump as the wheels hit, a rush of air, and a bright
// rising chime (in the music's key). Bigger tricks ring more notes.
const CHIME = [80, 84, 87, 92, 96, 99];   // Ab5 C6 Eb6 Ab6 C7 Eb7
export function playTrickLand(boost = 3) {
  if (!ready()) return;
  tone('sine', 120, 50, 0.18, 0.5);
  hiss('bandpass', 900, 7000, 0.3, 0.12);
  const notes = Math.min(CHIME.length, 3 + Math.floor(boost / 4));
  for (let i = 0; i < notes; i++) {
    const f = midi(CHIME[i]), at = 0.03 + i * 0.055;
    tone('sine', f, f, 0.55, 0.16, at);
    tone('triangle', f * 2, f * 2, 0.25, 0.05, at);   // a little sparkle on top
  }
}

export const playPickup = () => ready() && loud(3, () => !busy() && spaced('pickup', 0.05) && placed({ pan: around() * 0.6 }, () => tone('sine', 1250 + Math.random() * 300, 1900, 0.07, 0.05)));   // XP gem collected

// Opening a chest: a creak and a bright two-note ding.
export function playChest() {
  if (!ready()) return;
  hiss('bandpass', 400, 1800, 0.18, 0.1);
  tone('triangle', midi(77), midi(77), 0.3, 0.16, 0.08);
  tone('triangle', midi(84), midi(84), 0.5, 0.16, 0.2);
}

// Level up: a quick rising fanfare.
export function playLevelUp() {
  if (!ready()) return;
  duckMusic(0.35, 1.6);
  far(() => {
    // The lift: a rush up into it, and a drum under the first note.
    hiss('bandpass', 400, 6000, 0.28, 0.14);
    tone('sine', 80, 160, 0.26, 0.3);
    tone('sine', 110, 46, 0.4, 0.75, 0.26);
    // Four notes climbing (in the music's key), each with a brassy edge...
    [68, 72, 75, 80].forEach((note, i) => {
      const at = 0.26 + i * 0.085;
      tone('triangle', midi(note), midi(note), 0.32, 0.2, at);
      tone('sawtooth', midi(note), midi(note), 0.22, 0.05, at);
    });
    // ...into the chord, held, with the octave ringing over it and sparks coming off.
    [68, 72, 75, 80, 84, 87].forEach((note) => {
      tone('triangle', midi(note), midi(note), 1.3, 0.11, 0.6);
      tone('sawtooth', midi(note), midi(note), 0.9, 0.028, 0.6);
    });
    tone('sine', midi(92), midi(92), 1.5, 0.1, 0.62);
    tone('sine', 104, 52, 0.5, 0.6, 0.6);
    hiss('highpass', 6000, 9500, 1.1, 0.12, 0.6);
    for (let k = 0; k < 10; k++) { const f = 2800 + Math.random() * 4000; tone('sine', f, f, 0.22, 0.035, 0.68 + Math.random() * 0.8); }
  });
}

// Picking up a heart: two soft rising notes.
export function playHeal() {
  if (!ready()) return;
  tone('sine', midi(72), midi(72), 0.25, 0.14);
  tone('sine', midi(79), midi(79), 0.35, 0.14, 0.09);
}

// The sniper: modelled on a .50 calibre anti-materiel rifle (Barrett M82).
// A supersonic crack, an overdriven muzzle blast, a sub-bass thump you feel,
// the heavy action clanking as it cycles, and a long report rolling away.
// (Put a real recording at src/assets/sounds/sniper.mp3 and it plays instead.)
export function playSniper() {
  if (!ready()) return;
  if (playSample('sniper')) return;
  const ctx = audio.ctx, t = ctx.currentTime;

  const src = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), drive = ctx.createWaveShaper(), gain = ctx.createGain();
  src.buffer = audio.noise;
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(5200, t);
  filter.frequency.exponentialRampToValueAtTime(140, t + 0.38);
  drive.curve = clipper();
  gain.gain.setValueAtTime(0.6, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
  mix.reach = 'far';
  src.connect(filter).connect(drive).connect(gain).connect(out());
  ends.push(t, t + 0.42);
  src.start(t);
  src.stop(t + 0.45);

  hiss('highpass', 5000, 1800, 0.035, 0.6);          // supersonic crack
  tone('sine', 72, 22, 0.95, 0.8);                   // the thump in your chest
  tone('sine', 130, 34, 0.5, 0.6);
  tone('triangle', 240, 60, 0.2, 0.35);

  hiss('highpass', 3200, 2400, 0.03, 0.22, 0.12);    // the action cycling: bolt back...
  tone('square', 1750, 1300, 0.035, 0.07, 0.12);
  hiss('highpass', 2600, 2000, 0.03, 0.16, 0.2);     // ...and home
  tone('square', 2300, 1700, 0.03, 0.05, 0.2);

  hiss('lowpass', 1100, 90, 1.9, 0.32, 0.06);        // the report rolling away
  hiss('lowpass', 800, 120, 0.6, 0.16, 0.3);         // slap-back echoes
  hiss('lowpass', 520, 100, 0.8, 0.09, 0.62);
  hiss('lowpass', 380, 80, 1.0, 0.05, 1.05);
  mix.reach = 'near';
}

// HotBox captured: a rising sweep into a bright chord.
export function playPowerup() {
  if (!ready()) return;
  hiss('bandpass', 500, 5000, 0.45, 0.12);
  [65, 72, 77, 84].forEach((note, i) => tone('triangle', midi(note), midi(note), 0.7, 0.13, 0.12 + i * 0.05));
}
// Turn the music down to `level` (a fraction of its volume) for `seconds`.
// Hold the music at `level` (a fraction of its volume) until told otherwise: a scene is playing, and what happens in
// it should be heard. holdMusic(null) lets it back up.
let held = null;
export function holdMusic(level) {
  held = level;
  if (!audio.ctx) return;
  const t = audio.ctx.currentTime;
  audio.duck.gain.cancelScheduledValues(t);
  audio.duck.gain.setTargetAtTime(level ?? 1, t, level == null ? 0.4 : 0.1);
}
export function duckMusic(level, seconds) {
  if (!ready() || held != null) return;   // (already held down for a scene)
  const t = audio.ctx.currentTime;
  audio.duck.gain.cancelScheduledValues(t);
  audio.duck.gain.setTargetAtTime(level, t, 0.08);
  audio.duck.gain.setTargetAtTime(1, t + seconds, 0.2);
}

// Something is coming up out of the ground. Three seconds of it getting worse:
// a rumble you feel, a heartbeat that speeds up, strings sliding out of tune,
// stone grinding, and a rush of air into the roar.
export function playDread() {
  if (!ready()) return;
  far(() => {
    duckMusic(0.03, 2.9);
    tone('sine', 36, 30, 3.3, 0.55);
    tone('sawtooth', 41, 38, 3.1, 0.1);
    [0.3, 0.52, 1.05, 1.27, 1.7, 1.9, 2.2, 2.38, 2.58, 2.72, 2.84].forEach((at, i) => tone('sine', 72, 36, 0.15, i % 2 ? 0.4 : 0.6, at));
    [72, 73, 78, 79, 84, 85].forEach((note, i) => tone('sawtooth', midi(note), midi(note) * (1.06 + 0.02 * i), 2.75, 0.028, 0.2));
    hiss('lowpass', 260, 900, 2.5, 0.3, 0.5);
    for (let i = 0; i < 14; i++) hiss('bandpass', 300 + Math.random() * 500, 150, 0.12, 0.2, 0.6 + Math.random() * 2.2);   // stones
    hiss('bandpass', 300, 5200, 0.85, 0.3, 2.15);
  });
}
// The boss finally bursts: a wet detonation with a long low tail.
export function playBossBurst() {
  if (!ready()) return;
  far(() => {
    hiss('highpass', 2500, 900, 0.08, 0.5);
    blast(3000, 60, 1.6, 0.7);
    tone('sine', 110, 22, 1.8, 0.9);
    tone('sine', 60, 20, 2.4, 0.5, 0.05);
    hiss('lowpass', 900, 70, 2.4, 0.3, 0.2);
    for (let i = 0; i < 10; i++) hiss('bandpass', 500 + Math.random() * 700, 200, 0.12, 0.16, 0.25 + Math.random() * 1.3);   // bits landing
  });
}
// One of the smaller bursts as he comes apart.
export const playBossPop = () => ready() && loud(1.5, () => spaced('pop', 0.05) && far(() => (blast(1600 + Math.random() * 800, 160, 0.22, 0.3), tone('sine', 150, 50, 0.2, 0.3)), around() * 0.6));
// Lightning close by: the crack, then the roll.
// The casino coming down: a long way off at first, then all of it.
export function playRumble() {
  if (!ready()) return;
  far(() => {
    tone('sine', 48, 30, 4.2, 0.6);
    hiss('lowpass', 300, 60, 4.5, 0.35);
    blast(900, 50, 2.5, 0.4, 0.6);
    hiss('lowpass', 500, 80, 3, 0.3, 1.8);
    tone('sine', 62, 26, 2.4, 0.4, 2.0);
  });
}
// Off the last ramp: the air going past, and then not much.
export function playWhoosh() {
  if (!ready()) return;
  far(() => {
    hiss('bandpass', 300, 2400, 0.9, 0.35);
    hiss('highpass', 2000, 6000, 1.2, 0.15, 0.2);
    tone('sine', 90, 220, 1.1, 0.3);
  });
}
// A lighter: the wheel, and the flame catching.
export function playLighter() {
  if (!ready()) return;
  loud(3, () => {
    hiss('highpass', 5000, 3000, 0.03, 0.4);
    tone('square', 900, 600, 0.02, 0.1);
    hiss('bandpass', 800, 400, 0.5, 0.12, 0.06);
  });
}
export function playThunder() {
  if (!ready()) return;
  far(() => {
    hiss('highpass', 3400, 1400, 0.07, 0.5);
    blast(2600, 70, 1.5, 0.5, 0.03);
    tone('sine', 74, 24, 1.3, 0.5, 0.03);
    hiss('lowpass', 500, 70, 1.8, 0.25, 0.4);
  });
}
// The exit portal tearing open: the air rips, a boom, then a rising shimmer.
export function playPortalOpen() {
  if (!ready()) return;
  far(() => {
    hiss('highpass', 700, 9000, 0.45, 0.32);
    blast(2000, 80, 0.9, 0.5);
    tone('sine', 95, 28, 1.1, 0.75);
    [57, 64, 69, 76, 81].forEach((note, i) => tone('sine', midi(note), midi(note + 12), 1.5, 0.07, 0.15 + i * 0.1));
    hiss('bandpass', 400, 3800, 1.6, 0.1, 0.2);
  });
}
// Being pulled through it: everything rushes upward, then a thump as it shuts.
export function playExit() {
  if (!ready()) return;
  duckMusic(0.15, 2.2);
  hiss('bandpass', 250, 6500, 1.3, 0.3);
  tone('sine', 180, 1700, 1.3, 0.22);
  tone('triangle', 270, 2550, 1.3, 0.08);
  [0, 0.09, 0.18, 0.27].forEach((at, i) => tone('sine', midi(88 + i * 3), midi(88 + i * 3), 0.5, 0.07, 1.25 + at));
  tone('sine', 130, 34, 0.6, 0.7, 1.55);
  blast(1500, 90, 0.5, 0.35, 1.55);
}

// The final boss roars: a bellow from the chest with a scream on top.
export function playBossIntro() {
  if (!ready()) return;
  far(() => {
    blast(1100, 140, 1.7, 0.5);
    tone('sawtooth', 330, 105, 1.4, 0.13);
    tone('square', 220, 78, 1.6, 0.09);
    tone('sawtooth', 95, 32, 2.2, 0.3);
    tone('sawtooth', 142, 47, 2.0, 0.16, 0.05);
    tone('sine', 60, 28, 2.4, 0.4);
    hiss('lowpass', 900, 120, 2.2, 0.3);
    [0.9, 1.5].forEach((at) => tone('sine', 70, 30, 0.5, 0.45, at));   // footfalls
  });
}
// He throws: a wet heave.
export const playBossThrow = () => ready() && loud(2.4, () => spaced('throw', 0.08) && far(() => (hiss('bandpass', 250, 900, 0.35, 0.16), tone('sawtooth', 110, 60, 0.3, 0.1))));
// ...and it lands.
export const playSplat = () => ready() && loud(1.3, () => spaced('splat', 0.1) && placed({ pan: around() }, () => (hiss('lowpass', 1400, 160, 0.28, 0.22), tone('sine', 130, 45, 0.22, 0.2))));
// He's dead: a long collapsing groan.
export function playBossDeath() {
  if (!ready()) return;
  far(() => {
    tone('sawtooth', 130, 24, 2.8, 0.3);
    tone('sine', 80, 22, 3, 0.45);
    hiss('lowpass', 2400, 80, 2.6, 0.35);
    [0, 0.25, 0.55, 1].forEach((at) => hiss('bandpass', 700, 200, 0.4, 0.2, at));
  });
}
// The exit portal tearing open, and the sound of going through it.
export function playPortal() {
  if (!ready()) return;
  far(() => {
    hiss('bandpass', 300, 4200, 1.4, 0.12);
    [57, 64, 69, 76, 81].forEach((note, i) => tone('sine', midi(note), midi(note + 12), 1.2, 0.1, i * 0.12));
  });
}
// The HotBox cutscene. A long drag on the cigarette (the paper crackling) and
// the breath out, over a West Coast beat in the early-2000s Los Angeles style,
// at 93 BPM: staccato piano chords hammering straight eighth notes, a hard kick
// with a snare and clap on the two and four, tight straight hi-hats, a gliding
// analogue-synth bass, and the high sine "whistle" lead coming in over the top.
// The game's music is turned down underneath.
export function playDrag() {
  if (!ready()) return;
  const ctx = audio.ctx, t = ctx.currentTime;

  duckMusic(0.06, 3.0);   // the game's music steps back for the length of the cutscene

  // The smoke itself, quietly, under the beat.
  hiss('bandpass', 500, 2200, 1.0, 0.08, 0.45);
  hiss('lowpass', 2600, 400, 1.2, 0.12, 1.6);

  const EIGHTH = 60 / 93 / 2;
  const at = (eighth) => eighth * EIGHTH;

  // Piano: short, hard chords on every eighth note (the top note moves, the rhythm never does).
  const room = ctx.createBiquadFilter();
  room.type = 'lowpass';
  room.frequency.value = 3400;
  room.connect(audio.sfx);
  const stab = (notes, start, loud) => notes.forEach((note) => {
    const begin = t + start, f = midi(note);
    [['triangle', f, 0.075], ['sine', f * 2, 0.03], ['sine', f * 3, 0.012]].forEach(([type, freq, volume]) => {   // a struck string: the overtones die first
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, begin);
      gain.gain.exponentialRampToValueAtTime(volume * loud, begin + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.001, begin + 0.2);
      osc.connect(gain).connect(room);
      osc.start(begin);
      osc.stop(begin + 0.23);
    });
  });
  const CHORDS = [[67, 70, 74], [67, 70, 74], [67, 70, 74], [67, 70, 75], [67, 70, 75], [67, 70, 74], [65, 69, 74], [65, 69, 72], [67, 70, 74], [67, 70, 74]];   // G minor, leaning on Eb and F
  CHORDS.forEach((notes, i) => stab([notes[0] - 12, ...notes], at(i), i % 2 ? 0.8 : 1));

  // Drums: dry and hard. Kick on the one, the "and" of two, and three; snare and clap together on two and four.
  for (const e of [0, 3, 4, 8]) {
    tone('sine', 150, 40, 0.26, 0.9, at(e));
    tone('triangle', 300, 60, 0.05, 0.3, at(e));
  }
  for (const e of [2, 6]) {
    hiss('bandpass', 2000, 1400, 0.16, 0.5, at(e));
    tone('triangle', 200, 140, 0.09, 0.3, at(e));
    [0, 0.011, 0.023].forEach((late) => hiss('bandpass', 1200, 1000, 0.09, 0.26, at(e) + late));   // the clap: a few hands, not quite together
  }
  for (let e = 0; e < 10; e += 0.5) hiss('highpass', 9500, 9000, 0.03, e % 1 ? 0.035 : 0.075, at(e));   // sixteenth hats, the in-between ones ghosted

  // Bass: one fat synth voice that slides from note to note.
  const bass = ctx.createOscillator(), bassFilter = ctx.createBiquadFilter(), bassGain = ctx.createGain();
  bass.type = 'sawtooth';
  bassFilter.type = 'lowpass';
  bassFilter.frequency.value = 260;
  bassFilter.Q.value = 6;
  bass.frequency.setValueAtTime(midi(31), t);
  bassGain.gain.setValueAtTime(0.0001, t);
  for (const [e, note, length] of [[0, 31, 1.3], [3, 31, 0.8], [4, 27, 1.6], [6, 29, 1.6], [8, 31, 2]]) {   // G . G Eb . F . G
    bass.frequency.setTargetAtTime(midi(note), t + at(e), 0.025);
    bassGain.gain.setTargetAtTime(0.5, t + at(e), 0.008);
    bassGain.gain.setTargetAtTime(0.0001, t + at(e) + length * EIGHTH * 0.85, 0.03);
  }
  bass.connect(bassFilter).connect(bassGain).connect(audio.sfx);
  bass.start(t);
  bass.stop(t + 3.25);

  // The whistle: a pure high note that slides in over the second half, with a slow wobble.
  const lead = ctx.createOscillator(), wobble = ctx.createOscillator(), depth = ctx.createGain(), leadGain = ctx.createGain();
  lead.type = 'sine';
  wobble.frequency.value = 5.2;
  depth.gain.value = 9;
  wobble.connect(depth).connect(lead.frequency);
  lead.frequency.setValueAtTime(midi(82), t + at(4));
  lead.frequency.setTargetAtTime(midi(86), t + at(4), 0.06);    // up into D
  lead.frequency.setTargetAtTime(midi(84), t + at(7), 0.04);    // C
  lead.frequency.setTargetAtTime(midi(79), t + at(8), 0.05);    // and down to G
  leadGain.gain.setValueAtTime(0.0001, t + at(4));
  leadGain.gain.exponentialRampToValueAtTime(0.05, t + at(4) + 0.08);
  leadGain.gain.setValueAtTime(0.05, t + at(8) + 0.2);
  leadGain.gain.exponentialRampToValueAtTime(0.001, t + 3.15);
  lead.connect(leadGain).connect(audio.sfx);
  lead.start(t + at(4)); wobble.start(t + at(4));
  lead.stop(t + 3.2); wobble.stop(t + 3.2);
}
// Casino: a card sliding off the shoe, a chip set down, and losing a hand.
export const playCard = () => ready() && loud(3.3, () => (hiss('highpass', 3500, 7000, 0.07, 0.16), tone('triangle', 900, 500, 0.03, 0.04)));
export const playChip = () => ready() && loud(2.2, () => (tone('sine', 2600, 2400, 0.05, 0.08), tone('sine', 3900, 3500, 0.04, 0.05, 0.03)));
export const playLose = () => ready() && (tone('sawtooth', 220, 110, 0.35, 0.12), tone('sine', 165, 80, 0.5, 0.2, 0.08));
// Babitus laughing: a run of deep, wet "ha"s that climbs and falls.
export function playLaugh() {
  if (!ready()) return;
  far(() => {
    // "Ha, ha, ha...": each one a puff of breath and then the vowel, dropping in pitch as it goes; the run speeds up,
    // peaks, and winds down into two long ones.
    const GAPS = [0.2, 0.17, 0.15, 0.14, 0.14, 0.16, 0.2, 0.27, 0.36], PITCH = [1, 1.12, 1.2, 1.24, 1.18, 1.08, 0.98, 0.88, 0.78];
    let at = 0;
    GAPS.forEach((gap, i) => {
      const f = 128 * PITCH[i] * (0.97 + Math.random() * 0.06), long = i >= GAPS.length - 2 ? 1.7 : 1, loudness = 0.7 + 0.3 * Math.sin((i / (GAPS.length - 1)) * Math.PI);
      hiss('bandpass', 1300, 800, 0.05, 0.3 * loudness, at);                                  // the "h"
      voiced(f * 1.12, f * 0.82, 0.1 * long, 2.4 * loudness, at + 0.025, [760, 1180]);      // the "a"
      voiced(f * 1.13, f * 0.83, 0.09 * long, 0.9 * loudness, at + 0.03, [900, 2500]);
      tone('sine', f * 0.5, f * 0.42, 0.1 * long, 0.25 * loudness, at + 0.025);               // the chest under it
      at += gap;
    });
  });
}
// The bar. A cocktail shaker (ice rattling), a pour, a clink, a cork, a glass on marble, a swallow.
export const playShake = () => ready() && loud(5, () => (hiss('bandpass', 3200 + Math.random() * 800, 1800, 0.06, 0.16), tone('triangle', 1900, 1500, 0.03, 0.03)));
export const playPour = () => ready() && loud(2.2, () => (hiss('bandpass', 900, 2600, 1.1, 0.1), hiss('lowpass', 500, 1400, 1.1, 0.06)));
export const playClink = () => ready() && loud(1.4, () => (tone('sine', 3100, 3000, 0.35, 0.09), tone('sine', 4650, 4500, 0.25, 0.05)));
export const playCork = () => ready() && loud(1.2, () => (tone('sine', 420, 140, 0.09, 0.4), hiss('highpass', 2500, 6000, 0.25, 0.14, 0.03)));
export const playGlassDown = () => ready() && loud(3, () => (tone('sine', 520, 300, 0.07, 0.14), tone('triangle', 1700, 1500, 0.05, 0.04)));
export const playGulp = () => ready() && (tone('sine', 150, 260, 0.09, 0.2), tone('sine', 280, 170, 0.1, 0.16, 0.1));
// Tipsy: a hiccup, and the slow sinking wobble as the room starts to move.
export const playHic = () => ready() && (tone('sine', 420, 900, 0.07, 0.2), tone('triangle', 900, 520, 0.09, 0.12, 0.07));
export function playWoozy() {
  if (!ready()) return;
  duckMusic(0.35, 4.6);
  [0, 0.5, 1.0, 1.5, 2.0].forEach((at, i) => tone('sine', 520 - i * 50, 300 - i * 30, 0.55, 0.1, at));   // a slide whistle running out of puff
  hiss('lowpass', 900, 200, 2.4, 0.06, 0.9);
}
// One too many: a stomach turning over, the heave itself, and it landing in the bucket.
export const playGurgle = () => ready() && loud(0.55, () => [0, 0.09, 0.2, 0.33].forEach((at, i) => tone('sine', 90 + i * 22, 150 - i * 12, 0.11, 0.3, at)));
export function playRetch() {
  if (!ready()) return;
  far(() => {
    duckMusic(0.2, 3.2);
    tone('sawtooth', 260, 70, 0.9, 0.22);
    tone('sine', 150, 55, 1.1, 0.4);
    blast(1500, 180, 0.9, 0.3);
    hiss('bandpass', 900, 300, 1.0, 0.2);
  });
}
// The dealer, in a fog of somebody's cigarette: four dry coughs.
export const playCough = () => ready() && far(() => [0.17, 0.87, 1.57, 2.27].forEach((at) => (hiss('bandpass', 750, 280, 0.17, 0.3, at), tone('sawtooth', 200, 85, 0.15, 0.13, at))));
export const playSplash = () => ready() && loud(2.6, () => (hiss('lowpass', 1800, 300, 0.14, 0.2), tone('sine', 240 + Math.random() * 120, 110, 0.1, 0.12)));
// Slot machines: the lever, the reels ticking round, each one clunking to a stop, and a big win.
export const playLever = () => ready() && loud(2, () => (tone('square', 220, 110, 0.12, 0.1), hiss('lowpass', 1200, 300, 0.2, 0.12, 0.05)));
export const playReel = () => ready() && loud(6, () => spaced('reel', 0.05) && tone('square', 1400 + Math.random() * 500, 1200, 0.02, 0.03));
export const playReelStop = () => ready() && (tone('sine', 300, 120, 0.1, 0.3), tone('triangle', 1100, 900, 0.05, 0.08));
export function playJackpot() {
  if (!ready()) return;
  duckMusic(0.25, 3.4);
  [72, 76, 79, 84, 79, 84, 88, 91].forEach((note, i) => { tone('square', midi(note), midi(note), 0.14, 0.07, i * 0.1); tone('sine', midi(note + 12), midi(note + 12), 0.2, 0.06, i * 0.1); });   // a rising fanfare
  for (let i = 0; i < 26; i++) tone('sine', 1700 + Math.random() * 1500, 1500, 0.07, 0.05, 0.9 + i * 0.07);   // coins pouring out
}
// Roulette: the ball running round the rim, ticking over the frets slower and slower, then clattering into a pocket.
export function playWheel(seconds = 4.2) {
  if (!ready()) return;
  loud(1.8, () => {
    hiss('bandpass', 2600, 900, seconds, 0.05);
    for (let t = 0.1, gap = 0.05; t < seconds; t += gap, gap *= 1.09) tone('triangle', 2200, 1800, 0.02, 0.045, t);
    [0, 0.13, 0.22].forEach((delay, i) => tone('sine', 900 - i * 130, 480, 0.05, 0.11, seconds + delay));
  });
}
// Bones: a dry clatter (the skull boss putting himself together, and bits of him falling off).
export function playBones(seconds = 0.6) {
  if (!ready()) return;
  loud(1.6, () => {
    far(() => {
      for (let t = 0; t < seconds; t += 0.03 + Math.random() * 0.05) {
        const f = 700 + Math.random() * 1300;
        tone('triangle', f, f * 0.55, 0.035, 0.07, t);
      }
      hiss('bandpass', 1800, 700, seconds, 0.05);
    });
  });
}
// Free Ride's targets going down. A dead astronaut: his radio, at last, a squelch of static and two falling beeps.
// An alien: a warble that slides off the top of your hearing. The golden one: a run of chimes.
export const playRadio = () => ready() && loud(1.3, () => (hiss('bandpass', 2400, 900, 0.28, 0.22), tone('square', 880, 880, 0.07, 0.07, 0.05), tone('square', 660, 660, 0.09, 0.07, 0.14)));
export const playAlien = () => ready() && loud(1.3, () => (tone('sine', 520, 2600, 0.38, 0.16), tone('triangle', 780, 3900, 0.38, 0.07), tone('sine', 2600, 300, 0.22, 0.1, 0.36)));
export function playGolden() {
  if (!ready()) return;
  [84, 88, 91, 96, 100, 103].forEach((note, i) => { tone('sine', midi(note), midi(note), 0.5, 0.09, i * 0.06); tone('triangle', midi(note + 12), midi(note + 12), 0.3, 0.04, i * 0.06); });
}

// A gas vent letting go under you.
export const playVent = () => ready() && far(() => (hiss('bandpass', 700, 3200, 0.5, 0.35), hiss('highpass', 5000, 2500, 0.35, 0.12), tone('sine', 90, 240, 0.3, 0.3)));

// A sawblade glancing off stone: a bright ring.
export function playClang() {
  if (!ready() || !spaced('clang', 0.05)) return;
  loud(2, () => {
    const f = 2900 + Math.random() * 1100;
    tone('sine', f, f, 0.3, 0.07);
    tone('sine', f * 1.51, f * 1.51, 0.22, 0.04);
    tone('square', f * 0.7, f * 0.5, 0.04, 0.05);
    hiss('highpass', 7000, 4000, 0.05, 0.12);
  });
}

// The flamethrower's roar: one continuous sound that runs for as long as the trigger is held.
// Put a recording called flamer.mp3 (or .ogg / .wav) in src/assets/sounds/ and it is looped instead of this one.
let flame = null;
export function setFlame(on) {
  if (!ready() || (!flame && !on)) return;
  const ctx = audio.ctx;
  if (!flame) {
    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(audio.sfx);
    if (samples.flamer) {
      const src = ctx.createBufferSource();
      src.buffer = samples.flamer;
      src.loop = true;
      src.connect(out);
      src.start();
      flame = { out, level: 0.9 };
    } else {
      // Built from noise: a low roar whose tone flutters, the rush of gas over it, a hiss on top, and a rumble underneath.
      const noise = (rate) => { const n = ctx.createBufferSource(); n.buffer = audio.noise; n.loop = true; n.playbackRate.value = rate; n.start(); return n; };
      const filter = (type, f, q = 0.7) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
      const level = (v) => { const g = ctx.createGain(); g.gain.value = v; return g; };
      const roar = filter('lowpass', 560);
      noise(0.6).connect(roar).connect(level(1)).connect(out);
      noise(0.9).connect(filter('bandpass', 1500, 0.5)).connect(level(0.4)).connect(out);
      noise(1.3).connect(filter('highpass', 4500)).connect(level(0.1)).connect(out);
      for (const [hz, depth] of [[11, 190], [3.7, 120]]) {   // two wobbles that never line up: it gutters like a real flame
        const lfo = ctx.createOscillator(), amount = level(depth);
        lfo.frequency.value = hz;
        lfo.connect(amount).connect(roar.frequency);
        lfo.start();
      }
      const rumble = ctx.createOscillator();
      rumble.type = 'sawtooth';
      rumble.frequency.value = 48;
      rumble.connect(filter('lowpass', 130)).connect(level(0.5)).connect(out);
      rumble.start();
      flame = { out, level: 0.5 };
    }
  }
  if (flame.on === on) return;
  flame.on = on;
  const t = ctx.currentTime;
  flame.out.gain.cancelScheduledValues(t);
  flame.out.gain.setTargetAtTime(on ? flame.level : 0, t, on ? 0.05 : 0.1);
  if (on) { tone('sine', 150, 45, 0.25, 0.35); hiss('lowpass', 2200, 400, 0.3, 0.3); }   // the whoomp as it lights
}

// One coin landing on the pile. progress 0..1 through the count: they ring higher as it goes.
export function playCoin(progress = 0) {
  if (!ready() || !spaced('coin', 0.03)) return;
  loud(3, () => {
    const f = 1500 + 1300 * progress + Math.random() * 120;
    tone('sine', f, f, 0.09, 0.07);
    tone('triangle', f * 1.5, f * 1.5, 0.05, 0.035);
  });
}
// The count is done: a cash-register ring.
export function playCashIn() {
  if (!ready()) return;
  hiss('highpass', 6000, 3000, 0.06, 0.2);
  tone('square', 620, 520, 0.05, 0.08);
  [84, 88, 91, 96].forEach((note, i) => { tone('sine', midi(note), midi(note), 0.9, 0.11, 0.07 + i * 0.03); tone('triangle', midi(note) * 2, midi(note) * 2, 0.4, 0.03, 0.07 + i * 0.03); });
}
// The shield taking a hit for you: a glassy ping.
export const playShieldHit = () => ready() && loud(2, () => spaced('shield', 0.08) && (tone('sine', 1900, 900, 0.18, 0.16), tone('triangle', 2850, 1400, 0.12, 0.07)));

// ---- The story ---------------------------------------------------------------------------------
// Sounds made for particular moments of the story scenes (cutscenes.js says where each is used). Most are "far":
// they have the room on them. Lengths are in seconds, and match the shots they play under.
const rnd = (a, b) => a + Math.random() * (b - a);

// A line of story moving on: the softest tick.
export const playNext = () => ready() && spaced('next', 0.05) && (tone('sine', 1100, 900, 0.04, 0.11), hiss('highpass', 5000, 7000, 0.02, 0.07));

// -- The cemetery --
// Night wind, for as long as the scene runs.
export function playWind(seconds = 8, level = 1) {
  if (!ready()) return;
  loud(1.4, () => {
    far(() => {
      hiss('bandpass', 300, 520, seconds, 0.22 * level);
      hiss('bandpass', 700, 420, seconds * 0.8, 0.12 * level, seconds * 0.15);
      hiss('highpass', 3000, 5200, seconds * 0.5, 0.03 * level, seconds * 0.3);
    });
  });
}
// A church bell, a long way off: one toll, and its echo of a second.
export function playBell() {
  if (!ready()) return;
  far(() => [0, 2.3].forEach((at, n) => [[1, 3.2, 0.14], [2, 2.4, 0.07], [2.4, 1.8, 0.05], [3, 1.4, 0.035], [4.2, 0.9, 0.02], [5.4, 0.6, 0.012]].forEach(([part, time, volume]) => {
    tone('sine', 196 * part, 196 * part * 0.995, time, volume * (n ? 0.5 : 1), at);
  })), -0.5);
}
// A crow, three times.
export function playCrow() {
  if (!ready()) return;
  loud(2.5, () => {
    far(() => [0, 0.34, 0.66].forEach((at) => {
      tone('sawtooth', rnd(590, 650), 470, 0.17, 0.06, at);
      tone('square', rnd(880, 960), 700, 0.15, 0.02, at);
      hiss('bandpass', 1600, 1000, 0.17, 0.09, at);
    }), 0.6);
  });
}
// A drag on a cigarette: the air going in, and the paper crackling.
export function playInhale(seconds = 1.2) {
  if (!ready()) return;
  loud(2, () => {
    hiss('bandpass', 2400, 4200, seconds, 0.06);
    hiss('lowpass', 700, 1200, seconds, 0.03);
    for (let i = 0; i < seconds * 16; i++) hiss('highpass', 6000, 8000, 0.008, rnd(0.04, 0.1), Math.random() * seconds);
  });
}
// ...and the breath out.
export function playExhale(seconds = 1.8) {
  if (!ready()) return;
  loud(1.5, () => {
    hiss('lowpass', 1700, 480, seconds, 0.16);
    hiss('bandpass', 900, 400, seconds * 0.9, 0.07, 0.08);
  });
}

// -- The chips --
// A chip in the air, turning over and over.
export function playChipFlip(seconds = 1.8) {
  if (!ready()) return;
  loud(1.8, () => {
    hiss('bandpass', 4000, 6500, seconds, 0.02);
    for (let t = 0, gap = 0.11; t < seconds; t += gap, gap = Math.max(0.035, gap * 0.93)) tone('sine', rnd(3300, 3600), 3200, 0.05, 0.05, t);   // (faster and faster, down to a flutter)
  });
}
// ...landing: it rings, and rattles round to a stop.
export function playChipLand() {
  if (!ready()) return;
  tone('sine', 180, 90, 0.06, 0.25);
  tone('sine', 2900, 2860, 0.6, 0.14);
  tone('sine', 4350, 4300, 0.4, 0.07);
  for (let i = 0, t = 0.09, gap = 0.07; i < 9; i++, t += gap, gap *= 0.82) tone('sine', 2650, 2550, 0.03, 0.08 * (1 - i / 10), t);
}

// -- The Catacombs --
// Water dripping somewhere in the dark.
export function playDrips(seconds = 6) {
  if (!ready()) return;
  loud(2.2, () => {
    for (let i = 0; i < seconds * 1.4; i++) {
      const f = rnd(900, 1600), at = Math.random() * seconds;
      far(() => (tone('sine', f, f * 1.8, 0.05, 0.09, at), tone('sine', f * 0.5, f * 0.45, 0.04, 0.04, at + 0.012)), around());
    }
  });
}
// The air down there: a drone you feel more than hear.
export function playCaveAir(seconds = 7) {
  if (!ready()) return;
  far(() => {
    tone('sine', 55, 52, seconds, 0.12);
    tone('sine', 82.5, 80, seconds, 0.055);
    hiss('lowpass', 220, 160, seconds, 0.1);
  });
}
// The way out opening overhead: a scrape of iron, and the light.
export function playHatch() {
  if (!ready()) return;
  loud(1.5, () => {
    far(() => {
      hiss('bandpass', 900, 1400, 0.5, 0.16);
      tone('sine', 220, 440, 1.1, 0.07, 0.3);
      tone('sine', 330, 660, 1.1, 0.05, 0.4);
      hiss('bandpass', 2000, 6000, 0.9, 0.05, 0.3);
    });
  });
}
// Up an iron ladder, a rung at a time.
export function playLadder(seconds = 2.4) {
  if (!ready()) return;
  loud(1.4, () => {
    far(() => {
      for (let t = 0; t < seconds; t += 0.36) {
        tone('triangle', rnd(500, 580), 380, 0.07, 0.14, t);
        tone('sine', rnd(1250, 1400), 1100, 0.14, 0.05, t);
        hiss('highpass', 3000, 2000, 0.03, 0.09, t);
      }
    });
  });
}

// -- The city, and the way in --
// A manhole lid: it rattles, scrapes aside, and goes over on its back.
export function playManhole() {
  if (!ready()) return;
  far(() => {
    for (let t = 0; t < 0.55; t += 0.07) tone('triangle', rnd(280, 340), 240, 0.04, 0.1, t);
    hiss('bandpass', 700, 1300, 0.6, 0.26, 0.58);
    tone('sawtooth', 120, 90, 0.6, 0.06, 0.58);
    blast(1800, 200, 0.12, 0.35, 1.2);
    tone('sine', 310, 290, 1.0, 0.24, 1.2);
    tone('sine', 823, 800, 0.7, 0.1, 1.2);
    tone('sine', 1370, 1340, 0.45, 0.05, 1.2);
  });
}
// The city at night: its hum, traffic a few streets off, and a siren that is not coming this way.
export function playCity(seconds = 10) {
  if (!ready()) return;
  loud(1.8, () => {
    far(() => {
      tone('sine', 110, 108, seconds, 0.05);
      hiss('lowpass', 520, 380, seconds, 0.1);
      hiss('bandpass', 1100, 700, seconds * 0.6, 0.02, seconds * 0.2);
    });
    far(() => { for (let i = 0; i < 6; i++) tone('sine', i % 2 ? 540 : 680, i % 2 ? 540 : 680, 0.55, 0.014, 2.2 + i * 0.55); }, -0.6);
  });
}
// The casino, seen: a chord with a drum under it.
export function playReveal() {
  if (!ready()) return;
  far(() => {
    tone('sine', 73, 50, 1.1, 0.6);
    hiss('lowpass', 800, 200, 1.3, 0.12);
    [38, 50, 57, 62, 65, 69].forEach((note, i) => {
      tone('sawtooth', midi(note), midi(note), 2.0, 0.035, 0.02 * i);
      tone('sine', midi(note), midi(note), 2.4, 0.06, 0.02 * i);
    });
  });
}
// Pushing off: three kicks, and the wheels getting up to speed.
export function playPushOff(seconds = 2.4) {
  if (!ready()) return;
  hiss('bandpass', 300, 1300, seconds, 0.2);
  tone('sawtooth', 60, 160, seconds, 0.05);
  [0, 0.5, 0.95].forEach((at) => { tone('sine', 110, 60, 0.1, 0.3, at); hiss('lowpass', 900, 300, 0.09, 0.12, at); });
}
// Two big doors, opened with a skateboard: the bang, the wood, and the glass in them.
export function playDoorsBurst() {
  if (!ready()) return;
  far(() => {
    blast(2600, 120, 0.5, 0.7);
    tone('sine', 90, 35, 0.8, 0.8);
    hiss('lowpass', 900, 100, 1.5, 0.22, 0.1);
    for (let i = 0; i < 6; i++) hiss('bandpass', rnd(1200, 2700), 500, 0.06, 0.32, Math.random() * 0.16);
    for (let i = 0; i < 10; i++) { const f = rnd(3000, 6500); tone('sine', f, f * 0.9, rnd(0.15, 0.35), 0.045, rnd(0.1, 0.65)); }
  });
}

// -- The House --
// The chandelier, moving.
export function playChandelier() {
  if (!ready()) return;
  loud(1.6, () => {
    for (let i = 0; i < 12; i++) { const f = rnd(2500, 6000), at = Math.random() * 1.3; far(() => tone('sine', f, f * 0.995, 0.55, 0.04, at), around()); }
  });
}
// A deck riffled and squared.
export function playShuffle() {
  if (!ready()) return;
  loud(1.5, () => {
    let t = 0;
    for (let gap = 0.05; t < 0.75; t += gap, gap = Math.max(0.02, gap * 0.93)) hiss('highpass', 3500, 6000, 0.012, 0.11, t);
    hiss('bandpass', 1500, 4000, 0.25, 0.09, t);
    tone('triangle', 500, 300, 0.04, 0.1, t + 0.26);
  });
}
// Three reels, stopping one after another, each with its bell.
export function playReelsStop() {
  if (!ready()) return;
  [0, 0.38, 0.76].forEach((at, i) => {
    tone('sine', 300, 120, 0.1, 0.32, at);
    tone('triangle', 1100, 900, 0.05, 0.1, at);
    tone('sine', midi(84 + i * 4), midi(84 + i * 4), 0.6, 0.1, at + 0.02);
  });
}
// The takings: a great many chips, all at once.
export function playCoinsPour(seconds = 2.6) {
  if (!ready()) return;
  loud(1.4, () => {
    hiss('highpass', 4000, 6000, seconds, 0.035);
    for (let i = 0; i < seconds * 15; i++) { const f = rnd(1700, 3500), at = Math.random() ** 0.8 * seconds; placed({ pan: around() }, () => tone('sine', f, f * 0.94, 0.07, 0.06, at)); }
  });
}
// A marble floor giving way.
export function playFloorCrack() {
  if (!ready()) return;
  far(() => {
    blast(3000, 300, 0.18, 0.55);
    hiss('bandpass', 2500, 600, 0.1, 0.32, 0.05);
    tone('sine', 50, 28, 2.3, 0.65, 0.1);
    hiss('lowpass', 400, 80, 2.5, 0.32, 0.1);
    for (let i = 0; i < 12; i++) hiss('bandpass', rnd(500, 1300), 250, 0.1, 0.16, rnd(0.2, 1.8));
  });
}

// -- The hill --
// Something very big starting to give: a groan, and the pings of it under strain.
export function playCreak(seconds = 2.2) {
  if (!ready()) return;
  far(() => {
    tone('sawtooth', 70, 52, seconds, 0.2);
    tone('sawtooth', 141, 97, seconds * 0.9, 0.08, 0.1);
    hiss('bandpass', 400, 250, seconds, 0.12);
    for (let i = 0; i < 5; i++) tone('triangle', rnd(900, 1500), 500, 0.08, 0.09, Math.random() * seconds);
  });
}
// A lot of windows going at once.
export function playGlass() {
  if (!ready()) return;
  far(() => {
    hiss('highpass', 5000, 9000, 0.28, 0.28);
    for (let i = 0; i < 14; i++) { const f = rnd(3500, 8000); tone('sine', f, f * 0.85, rnd(0.12, 0.32), 0.05, Math.random() * 0.5); }
  });
}
// The dust coming: a roar that opens up as it gets nearer.
export function playDustWave(seconds = 3) {
  if (!ready()) return;
  far(() => {
    hiss('lowpass', 200, 1500, seconds, 0.42);
    hiss('bandpass', 300, 950, seconds, 0.22, 0.2);
    tone('sine', 40, 62, seconds, 0.45);
  });
}
// The three of them, rising: three voices sliding up, not quite in tune with each other.
export function playGhosts() {
  if (!ready()) return;
  [[220, -0.6], [277, 0.6], [330, 0]].forEach(([f, pan], i) => far(() => {
    tone('sine', f, f * 1.5, 1.9, 0.08, i * 0.12);
    tone('sine', f * 1.012, f * 1.53, 1.9, 0.06, i * 0.12 + 0.05);
    tone('triangle', f * 2, f * 2.9, 1.6, 0.022, i * 0.12 + 0.2);
  }, pan));
  far(() => hiss('bandpass', 1200, 2600, 2.0, 0.06));
}
// One of them winding up to throw. side: -1 (on your left), 1 (right) or 0 (ahead).
export const playGhostTell = (side = 0) => ready() && loud(1.3, () => spaced('tell', 0.2) && far(() => (tone('sine', 420, 780, 0.85, 0.11), tone('sine', 426, 794, 0.85, 0.07, 0.03), hiss('bandpass', 1500, 3200, 0.85, 0.05)), side * 0.6));
// ...and letting go.
export const playGhostThrow = () => ready() && spaced('ghostThrow', 0.1) && far(() => (hiss('bandpass', 400, 1900, 0.35, 0.38), tone('sine', 320, 120, 0.3, 0.18)));
// The name of where you have got to, coming up.
export function playZone() {
  if (!ready()) return;
  loud(1.3, () => {
    far(() => {
      tone('sine', midi(57), midi(57), 1.5, 0.08);
      tone('sine', midi(64), midi(64), 1.5, 0.06, 0.08);
      tone('sine', midi(69), midi(69), 1.3, 0.04, 0.16);
      hiss('bandpass', 800, 2400, 0.8, 0.05);
    });
  });
}
// Caught: the roar arriving, the weight of it, and then everything muffled.
export function playBuried() {
  if (!ready()) return;
  duckMusic(0.05, 4.5);
  far(() => {
    hiss('lowpass', 300, 2300, 2.4, 0.5);
    tone('sine', 45, 70, 2.4, 0.4);
    blast(1200, 60, 1.6, 0.55, 2.9);
    tone('sine', 60, 22, 2.4, 0.85, 2.9);
    hiss('lowpass', 300, 60, 2.2, 0.28, 3.1);
  });
}
// Off the end of the world: everything drops away, and what is left is very quiet.
export function playHush(seconds = 6) {
  if (!ready()) return;
  duckMusic(0.08, seconds);
  tone('sine', 110, 110, seconds, 0.035);
  tone('sine', 165, 165.5, seconds, 0.022);
  hiss('highpass', 5000, 7000, seconds, 0.006);
}

// -- The Moon --
// Nothing, for a long time: four notes, barely there.
export function playVoid(seconds = 10) {
  if (!ready()) return;
  far(() => [45, 52, 57, 64].forEach((note, i) => {
    tone('sine', midi(note), midi(note) * 1.003, seconds, 0.035, i * 0.9);
    tone('sine', midi(note + 12), midi(note + 12) * 0.998, seconds * 0.8, 0.012, 1.5 + i * 0.9);
  }));
}
// Landing in dust, with hardly any air to carry the sound.
export function playMoonLand() {
  if (!ready()) return;
  tone('sine', 85, 30, 0.7, 0.85);
  hiss('lowpass', 500, 90, 1.0, 0.38);
  hiss('bandpass', 700, 300, 1.5, 0.09, 0.1);
}
// His last cigarette, and what has happened to it: a dry snap, and two notes going down.
export function playSnap() {
  if (!ready()) return;
  loud(1.8, () => {
    hiss('highpass', 3500, 2000, 0.02, 0.24);
    tone('triangle', 1400, 700, 0.03, 0.1);
    tone('sine', midi(67), midi(67), 0.4, 0.06, 0.14);
    tone('sine', midi(63), midi(63), 0.7, 0.06, 0.44);
  });
}
// The end: a chord that has finally got where it was going, and stays there.
export function playEndChord() {
  if (!ready()) return;
  far(() => {
    tone('sine', 52, 51, 4, 0.3);
    [44, 51, 56, 60, 63, 68, 72].forEach((note, i) => {
      tone('sine', midi(note), midi(note), 7.5, 0.06, i * 0.13);
      tone('triangle', midi(note + 12), midi(note + 12), 4.5, 0.012, i * 0.13 + 0.05);
    });
    hiss('bandpass', 600, 3000, 2.2, 0.035);
  });
}
// A line of the credits coming up.
export const playCredit = () => ready() && loud(1.5, () => far(() => (tone('sine', midi(75), midi(75), 1.0, 0.06), tone('sine', midi(80), midi(80), 1.0, 0.04, 0.07))));

// -- Afterwards --
// What you get for finishing: a fanfare, a crash, and sparks.
export function playFanfare() {
  if (!ready()) return;
  duckMusic(0.2, 4.5);
  far(() => {
    [68, 72, 75].forEach((note, i) => { tone('sawtooth', midi(note), midi(note), 0.16, 0.05, i * 0.12); tone('triangle', midi(note), midi(note), 0.18, 0.12, i * 0.12); });
    [68, 75, 80, 84, 87].forEach((note) => { tone('sawtooth', midi(note), midi(note), 1.8, 0.04, 0.38); tone('triangle', midi(note), midi(note), 2.2, 0.09, 0.38); });
    tone('sine', 104, 50, 0.5, 0.6, 0.38);
    hiss('highpass', 6000, 9000, 1.4, 0.14, 0.38);
    for (let i = 0; i < 18; i++) { const f = rnd(2600, 6500); tone('sine', f, f, 0.25, 0.035, rnd(0.5, 2.4)); }
  });
}
// A title landing: a hit you feel, and a chord opening over it.
export function playTitleSting() {
  if (!ready()) return;
  far(() => {
    tone('sine', 65, 38, 1.3, 0.75);
    blast(1500, 100, 0.5, 0.38);
    hiss('lowpass', 700, 120, 1.4, 0.16);
    [56, 63, 68].forEach((note, i) => tone('triangle', midi(note), midi(note), 1.5, 0.06, 0.03 + i * 0.02));
  });
}
// A saucer going over, a long way off.
export function playSaucer(seconds = 10) {
  if (!ready()) return;
  far(() => {
    tone('sine', 520, 615, seconds, 0.034);
    tone('sine', 527, 606, seconds, 0.024);
    tone('sine', 1040, 1230, seconds, 0.009);
  });
}

// The sound of going fast: one continuous sound for as long as you are riding. The wind (louder and higher the faster
// you go), the wheels on the ground (gone the moment you leave it), steel on a rail, wheels sliding sideways.
//   speed: 0..1 of top speed.  grounded, grinding, sliding: what the board is doing.
let ride = null, rideAt = 0;
export function setRide(speed, grounded = false, grinding = false, sliding = false) {
  if (!ready() || (!ride && speed <= 0)) return;
  const ctx = audio.ctx;
  if (!ride) {
    const noise = (rate) => { const n = ctx.createBufferSource(); n.buffer = audio.noise; n.loop = true; n.playbackRate.value = rate; n.start(); return n; };
    const filter = (type, f, q = 0.7) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
    const level = () => { const g = ctx.createGain(); g.gain.value = 0; g.connect(audio.sfx); return g; };
    ride = { wind: level(), wheels: level(), rail: level(), slide: level(), windTone: filter('bandpass', 500, 0.6), wheelTone: filter('lowpass', 200, 0.9) };
    noise(1).connect(ride.windTone).connect(ride.wind);
    noise(0.7).connect(ride.wheelTone).connect(ride.wheels);
    const scrape = filter('bandpass', 3100, 5);
    noise(1.4).connect(scrape).connect(ride.rail);
    noise(1.9).connect(filter('highpass', 6500)).connect(ride.rail);
    noise(1.1).connect(filter('bandpass', 950, 1.4)).connect(ride.slide);
  }
  if (ctx.currentTime - rideAt < 0.05 && speed > 0) return;   // (twenty times a second is plenty)
  rideAt = ctx.currentTime;
  const t = ctx.currentTime, to = (param, value, lag = 0.08) => param.setTargetAtTime(value, t, lag), v = mix.level;
  to(ride.wind.gain, speed * speed * 0.6 * v, 0.15);
  to(ride.windTone.frequency, 420 + speed * 2300, 0.15);
  to(ride.wheels.gain, grounded && !grinding ? Math.min(1, speed * 2.2) * 0.34 * v : 0, grounded ? 0.05 : 0.02);
  to(ride.wheelTone.frequency, 150 + speed * 900);
  to(ride.rail.gain, grinding ? (0.16 + speed * 0.3) * v : 0, 0.03);
  to(ride.slide.gain, sliding ? (0.12 + speed * 0.3) * v : 0, 0.04);
}
// Leaving the ground with a trick wound up: the air going past the board.
export function playAir() {
  if (!ready() || !spaced('air', 0.2)) return;
  hiss('bandpass', 500, 3400, 0.22, 0.2);
  hiss('highpass', 3000, 8000, 0.16, 0.07, 0.04);
}
// One more in the streak: a note, a step up the scale for every kill in a row (and back to the bottom when it breaks).
const STEPS = [0, 2, 4, 7, 9];
export function playKillNote(streak = 1) {
  if (!ready() || busy() || !spaced('note', 0.05)) return;
  const n = Math.min(19, Math.max(0, streak - 1)), f = 392 * Math.pow(2, Math.floor(n / 5) + STEPS[n % 5] / 12);
  tone('triangle', f, f * 1.003, 0.16, 0.13);
  tone('sine', f * 2, f * 2.01, 0.1, 0.06);
}
