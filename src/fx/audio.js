// Synthesized sound effects (WebAudio, no files). Music lives in music.js and
// shares the audio context and volume controls set up here.
import { config } from '../config.js';

export const audio = { ctx: null, noise: null, sfx: null, music: null, muted: false, sfxMuted: false };   // muted = the music is off

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
  gain.gain.value = volume;
  src.connect(gain).connect(audio.sfx);
  src.start();
  return true;
}
const midi = (n) => 440 * 2 ** ((n - 69) / 12);

// Browsers only allow audio after a click/keypress; call this from one.
// Returns true once sound is available.
export function unlockAudio() {
  if (!audio.ctx) {
    let ctx;
    try { ctx = new AudioContext(); } catch { return false; }
    audio.ctx = ctx;
    // Everything goes through a gentle compressor so loud moments don't clip.
    const master = ctx.createDynamicsCompressor();
    master.connect(ctx.destination);
    audio.sfx = ctx.createGain();
    audio.music = ctx.createGain();
    audio.sfx.connect(master);
    audio.music.connect(master);
    audio.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = audio.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    applyVolume();
    loadSamples();
  }
  if (audio.ctx.state === 'suspended') audio.ctx.resume();
  return true;
}

// Push the tuning-panel volumes (and the mute toggle) to the mixer.
export function applyVolume() {
  if (!audio.ctx) return;
  const t = audio.ctx.currentTime;
  audio.sfx.gain.setTargetAtTime(audio.sfxMuted ? 0 : config.audio.sfxVolume, t, 0.05);
  audio.music.gain.setTargetAtTime(audio.muted ? 0 : config.audio.musicVolume, t, 0.05);
}
export function toggleMusic() {
  audio.muted = !audio.muted;
  applyVolume();
  return !audio.muted;
}

const ready = () => audio.ctx && audio.ctx.state === 'running';

// ---- Building blocks ---------------------------------------------------------

// A pitched tone that slides from one frequency to another and fades out.
function tone(type, from, to, time, volume, at = 0) {
  const ctx = audio.ctx, t = ctx.currentTime + at, osc = ctx.createOscillator(), gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(to, t + time);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(volume, t + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.001, t + time);
  osc.connect(gain).connect(audio.sfx);
  osc.start(t);
  osc.stop(t + time + 0.02);
}

// A burst of filtered noise whose filter sweeps from one frequency to another.
function hiss(filterType, from, to, time, volume, at = 0) {
  const ctx = audio.ctx, t = ctx.currentTime + at;
  const src = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
  src.buffer = audio.noise;
  src.playbackRate.value = 0.9 + Math.random() * 0.2;
  filter.type = filterType;
  filter.frequency.setValueAtTime(from, t);
  filter.frequency.exponentialRampToValueAtTime(to, t + time);
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + time);
  src.connect(filter).connect(gain).connect(audio.sfx);
  src.start(t);
  src.stop(t + time + 0.02);
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
  const ctx = audio.ctx, t = ctx.currentTime + at;
  const src = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), drive = ctx.createWaveShaper(), gain = ctx.createGain();
  src.buffer = audio.noise;
  src.playbackRate.value = 0.9 + Math.random() * 0.2;
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(from, t);
  filter.frequency.exponentialRampToValueAtTime(to, t + time * 0.9);
  drive.curve = clipper();
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + time);
  src.connect(filter).connect(drive).connect(gain).connect(audio.sfx);
  src.start(t);
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
  // Launcher: a hollow "thoomp" out of the tube.
  launcher(r) {
    tone('sine', 200 * r, 42, 0.32, 0.85);
    tone('triangle', 290 * r, 110, 0.16, 0.3);
    blast(1000 * r, 140, 0.22, 0.4);
    hiss('bandpass', 520, 180, 0.35, 0.2, 0.02);
    hiss('lowpass', 700, 90, 0.8, 0.12, 0.08);
  },
};
export function playShot(id) {
  if (!ready() || playSample(id)) return;
  (SHOTS[id] || SHOTS.pistol)(0.94 + Math.random() * 0.12);
}

export const playHeadshot = () => ready() && (tone('square', 1700, 1100, 0.07, 0.09), tone('sine', 2600, 2600, 0.12, 0.07));
export const playSwitch = () => ready() && (hiss('highpass', 3000, 5000, 0.05, 0.12), tone('square', 320, 240, 0.05, 0.08, 0.05));

export const playHit = () => ready() && tone('square', 900, 500, 0.04, 0.05);     // bullet hits a monster
export const playKill = () => ready() && tone('triangle', 260, 60, 0.16, 0.3);    // monster goes down
export const playHurt = () => ready() && tone('sawtooth', 180, 50, 0.35, 0.35);   // you got clawed

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

export const playPickup = () => ready() && tone('sine', 1250 + Math.random() * 300, 1900, 0.07, 0.05);   // XP gem collected

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
  [68, 72, 75, 80, 84].forEach((note, i) => tone('triangle', midi(note), midi(note), 0.4, 0.14, i * 0.07));
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
  src.connect(filter).connect(drive).connect(gain).connect(audio.sfx);
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
}

// HotBox captured: a rising sweep into a bright chord.
export function playPowerup() {
  if (!ready()) return;
  hiss('bandpass', 500, 5000, 0.45, 0.12);
  [65, 72, 77, 84].forEach((note, i) => tone('triangle', midi(note), midi(note), 0.7, 0.13, 0.12 + i * 0.05));
}
// Turn the music down to `level` (a fraction of its volume) for `seconds`.
export function duckMusic(level, seconds) {
  if (!ready()) return;
  const t = audio.ctx.currentTime, full = audio.muted ? 0 : config.audio.musicVolume;
  audio.music.gain.cancelScheduledValues(t);
  audio.music.gain.setTargetAtTime(full * level, t, 0.08);
  audio.music.gain.setTargetAtTime(full, t + seconds, 0.2);
}

// Something is coming up out of the ground. Three seconds of it getting worse:
// a rumble you feel, a heartbeat that speeds up, strings sliding out of tune,
// stone grinding, and a rush of air into the roar.
export function playDread() {
  if (!ready()) return;
  duckMusic(0.03, 2.9);
  tone('sine', 36, 30, 3.3, 0.55);
  tone('sawtooth', 41, 38, 3.1, 0.1);
  [0.3, 0.52, 1.05, 1.27, 1.7, 1.9, 2.2, 2.38, 2.58, 2.72, 2.84].forEach((at, i) => tone('sine', 72, 36, 0.15, i % 2 ? 0.4 : 0.6, at));
  [72, 73, 78, 79, 84, 85].forEach((note, i) => tone('sawtooth', midi(note), midi(note) * (1.06 + 0.02 * i), 2.75, 0.028, 0.2));
  hiss('lowpass', 260, 900, 2.5, 0.3, 0.5);
  for (let i = 0; i < 14; i++) hiss('bandpass', 300 + Math.random() * 500, 150, 0.12, 0.2, 0.6 + Math.random() * 2.2);   // stones
  hiss('bandpass', 300, 5200, 0.85, 0.3, 2.15);
}
// The boss finally bursts: a wet detonation with a long low tail.
export function playBossBurst() {
  if (!ready()) return;
  hiss('highpass', 2500, 900, 0.08, 0.5);
  blast(3000, 60, 1.6, 0.7);
  tone('sine', 110, 22, 1.8, 0.9);
  tone('sine', 60, 20, 2.4, 0.5, 0.05);
  hiss('lowpass', 900, 70, 2.4, 0.3, 0.2);
  for (let i = 0; i < 10; i++) hiss('bandpass', 500 + Math.random() * 700, 200, 0.12, 0.16, 0.25 + Math.random() * 1.3);   // bits landing
}
// One of the smaller bursts as he comes apart.
export const playBossPop = () => ready() && (blast(1600 + Math.random() * 800, 160, 0.22, 0.3), tone('sine', 150, 50, 0.2, 0.3));
// Lightning close by: the crack, then the roll.
export function playThunder() {
  if (!ready()) return;
  hiss('highpass', 3400, 1400, 0.07, 0.5);
  blast(2600, 70, 1.5, 0.5, 0.03);
  tone('sine', 74, 24, 1.3, 0.5, 0.03);
  hiss('lowpass', 500, 70, 1.8, 0.25, 0.4);
}
// The exit portal tearing open: the air rips, a boom, then a rising shimmer.
export function playPortalOpen() {
  if (!ready()) return;
  hiss('highpass', 700, 9000, 0.45, 0.32);
  blast(2000, 80, 0.9, 0.5);
  tone('sine', 95, 28, 1.1, 0.75);
  [57, 64, 69, 76, 81].forEach((note, i) => tone('sine', midi(note), midi(note + 12), 1.5, 0.07, 0.15 + i * 0.1));
  hiss('bandpass', 400, 3800, 1.6, 0.1, 0.2);
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
  blast(1100, 140, 1.7, 0.5);
  tone('sawtooth', 330, 105, 1.4, 0.13);
  tone('square', 220, 78, 1.6, 0.09);
  tone('sawtooth', 95, 32, 2.2, 0.3);
  tone('sawtooth', 142, 47, 2.0, 0.16, 0.05);
  tone('sine', 60, 28, 2.4, 0.4);
  hiss('lowpass', 900, 120, 2.2, 0.3);
  [0.9, 1.5].forEach((at) => tone('sine', 70, 30, 0.5, 0.45, at));   // footfalls
}
// He throws: a wet heave.
export const playBossThrow = () => ready() && (hiss('bandpass', 250, 900, 0.35, 0.16), tone('sawtooth', 110, 60, 0.3, 0.1));
// ...and it lands.
export const playSplat = () => ready() && (hiss('lowpass', 1400, 160, 0.28, 0.22), tone('sine', 130, 45, 0.22, 0.2));
// He's dead: a long collapsing groan.
export function playBossDeath() {
  if (!ready()) return;
  tone('sawtooth', 130, 24, 2.8, 0.3);
  tone('sine', 80, 22, 3, 0.45);
  hiss('lowpass', 2400, 80, 2.6, 0.35);
  [0, 0.25, 0.55, 1].forEach((at) => hiss('bandpass', 700, 200, 0.4, 0.2, at));
}
// The exit portal tearing open, and the sound of going through it.
export function playPortal() {
  if (!ready()) return;
  hiss('bandpass', 300, 4200, 1.4, 0.12);
  [57, 64, 69, 76, 81].forEach((note, i) => tone('sine', midi(note), midi(note + 12), 1.2, 0.1, i * 0.12));
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

  // Turn the music down for the length of the cutscene.
  const level = audio.muted ? 0 : config.audio.musicVolume;
  audio.music.gain.cancelScheduledValues(t);
  audio.music.gain.setTargetAtTime(level * 0.06, t, 0.05);
  audio.music.gain.setTargetAtTime(level, t + 3.0, 0.25);

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
// One coin landing on the pile. progress 0..1 through the count: they ring higher as it goes.
export function playCoin(progress = 0) {
  if (!ready()) return;
  const f = 1500 + 1300 * progress + Math.random() * 120;
  tone('sine', f, f, 0.09, 0.07);
  tone('triangle', f * 1.5, f * 1.5, 0.05, 0.035);
}
// The count is done: a cash-register ring.
export function playCashIn() {
  if (!ready()) return;
  hiss('highpass', 6000, 3000, 0.06, 0.2);
  tone('square', 620, 520, 0.05, 0.08);
  [84, 88, 91, 96].forEach((note, i) => { tone('sine', midi(note), midi(note), 0.9, 0.11, 0.07 + i * 0.03); tone('triangle', midi(note) * 2, midi(note) * 2, 0.4, 0.03, 0.07 + i * 0.03); });
}
// The shield taking a hit for you: a glassy ping.
export const playShieldHit = () => ready() && (tone('sine', 1900, 900, 0.18, 0.16), tone('triangle', 2850, 1400, 0.12, 0.07));
