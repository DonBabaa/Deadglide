// Synthesized sound effects (WebAudio, no files). Music lives in music.js and
// shares the audio context and volume controls set up here.
import { config } from '../config.js';

export const audio = { ctx: null, noise: null, sfx: null, music: null, muted: false };
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

export function playShot() {
  if (!ready()) return;
  hiss('lowpass', 5200, 500, 0.16, 0.32);   // crack
  tone('sine', 170, 45, 0.11, 0.4);         // thump
}

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

// Level up: a quick rising fanfare.
export function playLevelUp() {
  if (!ready()) return;
  [68, 72, 75, 80, 84].forEach((note, i) => tone('triangle', midi(note), midi(note), 0.4, 0.14, i * 0.07));
}
