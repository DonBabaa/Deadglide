// Synthesized sound effects (WebAudio, no files). Music lives in music.js and
// shares the audio context and volume controls set up here.
import { config } from '../config.js';

export const audio = { ctx: null, noise: null, sfx: null, music: null, muted: false };

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
  audio.sfx.gain.setTargetAtTime(config.audio.sfxVolume, t, 0.05);
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

// pitch / loud come from the weapon: a sniper is deep and loud, a machine gun thin and quick.
export function playShot(pitch = 1, loud = 1) {
  if (!ready()) return;
  hiss('lowpass', 5200 * pitch, 500 * pitch, 0.16 / pitch, Math.min(0.6, 0.32 * loud));   // crack
  tone('sine', 170 * pitch, 45 * pitch, 0.11 / pitch, Math.min(0.7, 0.4 * loud));          // thump
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
let overdrive = null;
export function playSniper() {
  if (!ready()) return;
  if (playSample('sniper')) return;
  const ctx = audio.ctx, t = ctx.currentTime;

  // Muzzle blast: noise pushed hard into a clipper, so it hits like a slap rather than a hiss.
  if (!overdrive) {
    overdrive = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) overdrive[i] = Math.tanh(((i / 512) - 1) * 6);
  }
  const src = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), drive = ctx.createWaveShaper(), gain = ctx.createGain();
  src.buffer = audio.noise;
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(5200, t);
  filter.frequency.exponentialRampToValueAtTime(140, t + 0.38);
  drive.curve = overdrive;
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
