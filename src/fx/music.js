// Generated background music: haunted drum & bass / jungle at 172 BPM, which
// turns to hard rock (same tempo, same key) when the final boss arrives.
// The casino has its own: a slow swing trio (brushes, walking bass, piano).
// Nothing is recorded. A small sequencer schedules synthesized drums and sub
// bass under a graveyard's worth of atmosphere: uneasy pads, a tolling bell,
// a wailing ghost voice, a broken music box and gusts of wind.
// To change the groove, edit the patterns below (16 steps = one bar,
// numbers are how hard each hit is played, 0 = silent).
import { audio, applyVolume } from './audio.js';

const BPM = 172, STEP = 60 / BPM / 4, BAR = STEP * 16;
const midi = (n) => 440 * 2 ** ((n - 69) / 12);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

//             1 . . .  2 . . .  3 . . .  4 . . .
const KICK = [
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0],
  [1, 0, 0, 0.6, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0.5, 0, 0],
];
const SNARE = [
  [0, 0, 0, 0, 1, 0, 0, 0.25, 0, 0.2, 0, 0, 1, 0, 0, 0],
  [0, 0, 0, 0, 1, 0, 0, 0.3, 0, 0.3, 0, 0, 1, 0, 0.35, 0.5],
];
const FILL_KICK = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const FILL_SNARE = [0, 0, 0, 0, 1, 0, 0, 0.4, 0.5, 0, 0.6, 0, 0.7, 0.8, 0.9, 1];
const BASS_HITS = [[0, 5], [6, 3], [10, 5]];   // [step, length in steps]

// Two bars per chord. F minor, leaning on the notes that make it uneasy:
// the flat second (Gb), the tritone, a diminished chord to finish.
const CHORDS = [
  { root: 29, notes: [53, 56, 60, 64, 67] },   // F minor with a major 7th
  { root: 30, notes: [54, 58, 61, 65, 72] },   // Gb major 7 (#11): a half-step shadow
  { root: 25, notes: [49, 52, 56, 59, 63] },   // Db minor
  { root: 24, notes: [48, 51, 54, 57, 61] },   // C diminished (b9)
];
const SCALE = [77, 79, 80, 82, 84, 85, 88, 89];              // F harmonic minor, for the music box
const WAILS = [[77, 76, 80, 79], [84, 83, 80, 76], [72, 78, 77, 73]];   // ghost-voice phrases, one note per bar

// Hard rock: palm-muted power chords chugging eighth notes. Semitones above the root (F) for each eighth
// of the bar; anything that isn't the root is hit open and rings.
const RIFFS = [
  [0, 0, 3, 0, 0, 5, 0, 3],
  [0, 0, 3, 0, 0, 6, 5, 3],   // (the 6 is the tritone)
  [0, 0, 3, 0, 0, 5, 0, 3],
  [0, 0, 8, 7, 5, 3, 1, 0],   // walking back down to the root
];
const ROCK_KICK = [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0.8, 0, 0, 0, 0, 0.6];
const ROCK_SNARE = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0];

// Casino: swing at 116 BPM. Each beat is three steps (the swing), so a bar is 12.
// Two bars per chord round a ii-V-I-VI in C: the bass walks four notes to the bar,
// the piano stabs a voicing here and there.
const SWING_STEP = 60 / 116 / 3;
const LOUNGE = [
  { walk: [38, 41, 45, 48, 50, 48, 45, 44], chord: [60, 64, 65, 69] },   // Dm9
  { walk: [43, 47, 50, 53, 55, 53, 50, 49], chord: [59, 64, 65, 69] },   // G13
  { walk: [36, 40, 43, 45, 48, 45, 43, 40], chord: [59, 62, 64, 67] },   // Cmaj9
  { walk: [45, 49, 52, 55, 57, 55, 52, 39], chord: [61, 65, 67, 72] },   // A7 (b13), leading back to D
];
const LICKS = [[76, 79, 81, 79], [84, 81, 79, 76], [72, 74, 76, 79, 81], [81, 79, 75, 74, 72]];   // vibraphone phrases

let started = false, step = 0, nextTime = 0, echo = null, style = 'dnb', amp = null, lick = null;

// 'dnb' (the usual music), 'rock' (the boss fight) or 'casino'. The new groove starts from bar one, at once.
export function setMusicStyle(next) {
  if (next === style) return;
  style = next;
  step = 0;
  if (audio.ctx) nextTime = audio.ctx.currentTime + 0.05;
}

export function startMusic() {
  if (started || !audio.ctx) return;
  started = true;
  const ctx = audio.ctx;

  // Long, dark echo for everything atmospheric.
  echo = ctx.createGain();
  const delay = ctx.createDelay(1), feedback = ctx.createGain(), damp = ctx.createBiquadFilter();
  delay.delayTime.value = STEP * 3;
  feedback.gain.value = 0.6;
  damp.type = 'lowpass';
  damp.frequency.value = 1900;
  echo.connect(delay);
  delay.connect(damp).connect(feedback).connect(delay);
  damp.connect(audio.music);

  nextTime = ctx.currentTime + 0.1;
  setInterval(() => {
    applyVolume();
    // Schedule a little ahead; further when the tab is in the background and timers run slow.
    const horizon = ctx.currentTime + (document.hidden ? 1.5 : 0.25);
    if (nextTime < ctx.currentTime) nextTime = ctx.currentTime + 0.05;   // fell behind (tab was asleep)
    while (nextTime < horizon) {
      schedule(step++, nextTime);
      nextTime += style === 'casino' ? SWING_STEP : STEP;
    }
  }, 60);
}

function schedule(index, t) {
  if (style === 'rock') return rock(index, t);
  if (style === 'casino') return lounge(index, t);
  const bar = Math.floor(index / 16), s = index % 16;
  const chord = CHORDS[Math.floor(bar / 2) % CHORDS.length];
  const intro = bar < 4;                          // atmosphere and hats only
  const breakdown = !intro && bar % 32 < 2;       // every so often the drums drop out
  const fill = bar % 8 === 7;                     // roll into the next phrase

  if (s === 0) {
    if (bar % 2 === 0) pad(t, BAR * 2, chord.notes);          // a new chord every two bars
    if (bar % 8 === 0) bell(t, 41);                           // the chapel bell tolls
    if (bar % 4 === 2) wind(t, BAR * 2);
    if (bar % 8 === 4) wail(t, pick(WAILS));                  // something is singing out there
  }
  // Music box: stray notes, slightly out of tune, lost in the echo.
  if (s % 2 === 0 && Math.random() < 0.11) musicBox(t, pick(SCALE));

  // Hats run throughout, a touch looser on the off-steps.
  const hatLevel = s % 2 === 0 ? 0.55 : Math.random() < 0.7 ? 0.22 : 0;
  if (hatLevel) hat(t, hatLevel * (intro ? 0.6 : 1), !intro && bar % 2 === 1 && (s === 6 || s === 14));

  if (intro || breakdown) return;
  const kick = fill ? FILL_KICK[s] : KICK[bar % 2][s];
  const snare = fill ? FILL_SNARE[s] : SNARE[bar % 2][s];
  if (kick) drumKick(t, kick);
  if (snare) drumSnare(t, snare);
  for (const [at, length] of BASS_HITS) if (s === at) bass(t, STEP * length, chord.root);
}

function rock(index, t) {
  const bar = Math.floor(index / 16), s = index % 16, riff = RIFFS[bar % 4], roll = bar % 4 === 3 && s >= 10;
  if (s === 0 && bar % 4 === 0) noiseBurst(t, 1.5, 0.2, 'highpass', 4500);   // crash cymbal
  if (s === 0 && bar % 8 === 0) bell(t, 41);                                  // the chapel bell is still tolling
  if (s === 0 && bar % 8 === 4) wail(t, pick(WAILS));

  if (ROCK_KICK[s]) drumKick(t, ROCK_KICK[s]);
  if (roll) drumSnare(t, 0.45 + (s - 10) * 0.1);                              // snare roll into the next four bars
  else if (ROCK_SNARE[s]) drumSnare(t, 1.1);
  if (s % 2 === 0) noiseBurst(t, 0.09, s % 4 === 0 ? 0.11 : 0.07, 'highpass', 6500);   // ride

  if (s % 2 === 0) {
    const up = riff[s / 2], open = up !== 0 || s === 0;
    guitar(t, 41 + up, open ? STEP * 1.9 : STEP * 1.25, !open);
    bass(t, STEP * 1.7, 29 + up);
  }
}

function lounge(index, t) {
  const S = SWING_STEP, bar = Math.floor(index / 12), s = index % 12, beat = Math.floor(s / 3), on = s % 3 === 0;
  const { walk, chord } = LOUNGE[Math.floor(bar / 2) % LOUNGE.length], second = bar % 2;

  // Drums, played with brushes: the ride's "ding, ding-a-ding", a hi-hat on two and four, a swish on the snare.
  if (on) noiseBurst(t, 0.22, 0.05, 'highpass', 7000);
  if (s % 3 === 2 && beat % 2 === 1) noiseBurst(t, 0.12, 0.032, 'highpass', 7500);
  if (on && beat % 2 === 1) noiseBurst(t, 0.05, 0.07, 'highpass', 9500);
  if (on) noiseBurst(t, S * 2.6, 0.022, 'bandpass', 2600, 0.6);
  if (s === 0 && bar % 4 === 0) drumKick(t, 0.28);

  // Walking bass: a note on every beat.
  if (on) upright(t, S * 2.8, walk[second * 4 + beat]);

  // Piano: a chord on the one, and again just ahead of three or four, not the same way every bar.
  if (s === 0 || (s === (bar % 3 === 1 ? 8 : 5) && bar % 2 === 0) || (s === 11 && bar % 4 === 3)) keys(t, s === 0 ? S * 5 : S * 2, chord, s === 0 ? 1 : 0.7);

  // Vibraphone: every few bars it plays a short phrase, swung, then leaves space.
  if (s === 0 && bar % 4 === 1 && Math.random() < 0.8) lick = { notes: pick(LICKS), at: 0 };
  if (lick && (s % 3 === 0 || s % 3 === 2)) {
    vibes(t, lick.notes[lick.at++]);
    if (lick.at >= lick.notes.length) lick = null;
  }
}

// Upright bass: a round, woody pluck.
function upright(t, time, note) {
  const ctx = audio.ctx, f = midi(note), out = ctx.createGain();
  envelope(out, t, 0.5, 0.012, t + time);
  out.connect(audio.music);
  for (const [type, ratio, level] of [['sine', 1, 0.7], ['triangle', 2, 0.22], ['sine', 3, 0.06]]) {
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f * ratio * 1.02, t);            // the string settles onto the note
    osc.frequency.exponentialRampToValueAtTime(f * ratio, t + 0.05);
    gain.gain.value = level;
    osc.connect(gain).connect(out);
    osc.start(t);
    osc.stop(t + time + 0.05);
  }
}

// Piano chord: soft hammers, a little spread from bottom note to top.
function keys(t, time, notes, loud) {
  const ctx = audio.ctx, out = ctx.createBiquadFilter();
  out.type = 'lowpass';
  out.frequency.value = 2600;
  out.connect(audio.music);
  notes.forEach((note, i) => {
    const begin = t + i * 0.012;
    for (const [type, ratio, level] of [['triangle', 1, 0.055], ['sine', 2, 0.02]]) {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = midi(note) * ratio;
      envelope(gain, begin, level * loud, 0.008, begin + time);
      osc.connect(gain).connect(out);
      osc.start(begin);
      osc.stop(begin + time + 0.05);
    }
  });
}

// Vibraphone: a pure note with a slow shimmer that rings on.
function vibes(t, note) {
  const ctx = audio.ctx, f = midi(note), osc = ctx.createOscillator(), over = ctx.createOscillator(), gain = ctx.createGain(), shimmer = ctx.createOscillator(), depth = ctx.createGain();
  osc.frequency.value = f;
  over.frequency.value = f * 4;
  envelope(gain, t, 0.07, 0.004, t + 1.6);
  shimmer.frequency.value = 5.5;
  depth.gain.value = 0.02;
  shimmer.connect(depth).connect(gain.gain);
  const overGain = ctx.createGain();
  envelope(overGain, t, 0.012, 0.002, t + 0.25);
  osc.connect(gain).connect(audio.music);
  over.connect(overGain).connect(audio.music);
  for (const o of [osc, over, shimmer]) { o.start(t); o.stop(t + 1.65); }
}

// Distorted guitar: a power chord (root, fifth, octave) of saws into a shared amp.
// muted: palm-muted, so short and dark.
function guitar(t, note, time, muted) {
  const ctx = audio.ctx, end = t + time;
  if (!amp) {
    // The amp: everything is driven hard into a clipper together, then through a speaker's worth of filtering.
    amp = ctx.createGain();
    const drive = ctx.createWaveShaper(), top = ctx.createBiquadFilter(), bottom = ctx.createBiquadFilter(), out = ctx.createGain();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) curve[i] = Math.tanh(((i / 512) - 1) * 9);
    drive.curve = curve;
    amp.gain.value = 2.5;
    top.type = 'lowpass';
    top.frequency.value = 3400;
    bottom.type = 'highpass';
    bottom.frequency.value = 95;
    out.gain.value = 0.085;
    amp.connect(drive).connect(top).connect(bottom).connect(out).connect(audio.music);
  }
  const pick = ctx.createBiquadFilter(), gain = ctx.createGain();
  pick.type = 'lowpass';
  pick.frequency.setValueAtTime(muted ? 1500 : 5000, t);
  pick.frequency.exponentialRampToValueAtTime(muted ? 500 : 2600, end);
  envelope(gain, t, muted ? 0.5 : 0.75, 0.004, end);
  pick.connect(gain).connect(amp);
  for (const [interval, detune] of [[0, -6], [0, 7], [7, 0], [12, 5]]) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = midi(note + interval);
    osc.detune.value = detune;
    osc.connect(pick);
    osc.start(t);
    osc.stop(end + 0.03);
  }
}

// ---- Helpers -----------------------------------------------------------------

function envelope(gain, t, peak, attack, end) {
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(peak, t + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);
}

// A slow wobble applied to an oscillator's pitch (in cents).
function vibrato(osc, t, end, rate, cents) {
  const ctx = audio.ctx, lfo = ctx.createOscillator(), depth = ctx.createGain();
  lfo.frequency.value = rate;
  depth.gain.value = cents;
  lfo.connect(depth).connect(osc.detune);
  lfo.start(t);
  lfo.stop(end);
}

function noiseBurst(t, time, volume, filterType, frequency, rate = 1) {
  const ctx = audio.ctx, src = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
  src.buffer = audio.noise;
  src.playbackRate.value = rate;
  filter.type = filterType;
  filter.frequency.value = frequency;
  envelope(gain, t, volume, 0.002, t + time);
  src.connect(filter).connect(gain).connect(audio.music);
  src.start(t, Math.random() * 0.5);
  src.stop(t + time + 0.02);
}

// ---- Drums and bass ------------------------------------------------------------

function drumKick(t, level) {
  const ctx = audio.ctx, osc = ctx.createOscillator(), gain = ctx.createGain();
  osc.frequency.setValueAtTime(165, t);
  osc.frequency.exponentialRampToValueAtTime(46, t + 0.09);
  envelope(gain, t, 0.9 * level, 0.003, t + 0.24);
  osc.connect(gain).connect(audio.music);
  osc.start(t);
  osc.stop(t + 0.26);
}

function drumSnare(t, level) {
  const ctx = audio.ctx, osc = ctx.createOscillator(), gain = ctx.createGain();
  noiseBurst(t, 0.15, 0.5 * level, 'highpass', 1400, 0.9 + Math.random() * 0.25);   // the crack
  osc.type = 'triangle';                                                            // the body
  osc.frequency.setValueAtTime(230, t);
  osc.frequency.exponentialRampToValueAtTime(170, t + 0.07);
  envelope(gain, t, 0.3 * level, 0.002, t + 0.1);
  osc.connect(gain).connect(audio.music);
  osc.start(t);
  osc.stop(t + 0.12);
}

const hat = (t, level, open) => noiseBurst(t, open ? 0.2 : 0.04, 0.16 * level, 'highpass', 8000);

// Sub bass: a sine underneath, with two detuned saws an octave up so it still
// comes through on small speakers.
function bass(t, time, note) {
  const ctx = audio.ctx, end = t + time, f = midi(note);
  const out = ctx.createGain(), filter = ctx.createBiquadFilter();
  envelope(out, t, 1, 0.012, end + 0.08);
  out.connect(audio.music);
  filter.type = 'lowpass';
  filter.Q.value = 5;
  filter.frequency.setValueAtTime(520, t);
  filter.frequency.exponentialRampToValueAtTime(230, end);
  filter.connect(out);
  const voices = [['sine', f, 0, 0.5, out], ['sawtooth', f * 2, 9, 0.1, filter], ['sawtooth', f * 2, -9, 0.1, filter]];
  for (const [type, freq, detune, level, target] of voices) {
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    osc.detune.value = detune;
    gain.gain.value = level;
    osc.connect(gain).connect(target);
    osc.start(t);
    osc.stop(end + 0.1);
  }
}

// ---- Atmosphere ----------------------------------------------------------------

// Pad: widely detuned saws that swell in and sag out, each voice wavering a little.
function pad(t, time, notes) {
  const ctx = audio.ctx, end = t + time + 2.5;
  const out = ctx.createGain(), filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(380, t);
  filter.frequency.linearRampToValueAtTime(950, t + time * 0.6);
  filter.frequency.linearRampToValueAtTime(420, end);
  out.gain.setValueAtTime(0.0001, t);
  out.gain.linearRampToValueAtTime(0.034, t + 1.4);
  out.gain.setValueAtTime(0.034, t + time);
  out.gain.linearRampToValueAtTime(0.0001, end);
  filter.connect(out);
  out.connect(audio.music);
  out.connect(echo);
  for (const note of notes) {
    for (const detune of [-13, 11]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = midi(note);
      osc.detune.value = detune;
      vibrato(osc, t, end, 0.15 + Math.random() * 0.3, 9);
      osc.connect(filter);
      osc.start(t);
      osc.stop(end + 0.05);
    }
  }
}

// Chapel bell: a cluster of clashing partials (with the minor third real bells have) ringing out.
function bell(t, note) {
  const ctx = audio.ctx, f = midi(note), out = ctx.createGain();
  out.gain.value = 0.2;
  out.connect(audio.music);
  out.connect(echo);
  for (const [ratio, level, ring] of [[0.5, 0.5, 4.5], [1, 1, 3.8], [1.19, 0.7, 3], [1.5, 0.4, 2.2], [2, 0.5, 1.8], [2.74, 0.25, 1.2], [4.07, 0.12, 0.8]]) {
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.frequency.value = f * ratio;
    envelope(gain, t, 0.3 * level, 0.004, t + ring);
    osc.connect(gain).connect(out);
    osc.start(t);
    osc.stop(t + ring + 0.05);
  }
}

// Ghost voice: one thin, wavering tone that slides between four notes, a bar each.
function wail(t, phrase) {
  const ctx = audio.ctx, end = t + BAR * phrase.length, osc = ctx.createOscillator(), gain = ctx.createGain();
  osc.frequency.setValueAtTime(midi(phrase[0]) * 0.94, t);   // scoop up into the first note
  phrase.forEach((note, i) => {
    osc.frequency.exponentialRampToValueAtTime(midi(note), t + BAR * i + 0.45);
    osc.frequency.setValueAtTime(midi(note), t + BAR * (i + 1) - 0.2);
  });
  vibrato(osc, t, end + 1, 5.3, 22);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.linearRampToValueAtTime(0.03, t + 0.8);
  gain.gain.setValueAtTime(0.03, end - 0.6);
  gain.gain.linearRampToValueAtTime(0.0001, end + 0.8);
  osc.connect(gain);
  gain.connect(audio.music);
  gain.connect(echo);
  osc.start(t);
  osc.stop(end + 1);
}

// Music box: a small glassy tone with an off-key overtone.
function musicBox(t, note) {
  const ctx = audio.ctx, f = midi(note) * (1 + (Math.random() - 0.5) * 0.012), out = ctx.createGain();
  out.connect(audio.music);
  out.connect(echo);
  for (const [ratio, level, ring] of [[1, 0.05, 0.7], [3.01, 0.014, 0.25]]) {
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.frequency.value = f * ratio;
    envelope(gain, t, level, 0.003, t + ring);
    osc.connect(gain).connect(out);
    osc.start(t);
    osc.stop(t + ring + 0.05);
  }
}

// Wind: filtered noise that rises and dies away.
function wind(t, time) {
  const ctx = audio.ctx, end = t + time, src = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
  src.buffer = audio.noise;
  src.loop = true;
  filter.type = 'bandpass';
  filter.Q.value = 3;
  filter.frequency.setValueAtTime(260, t);
  filter.frequency.exponentialRampToValueAtTime(700 + Math.random() * 500, t + time * 0.5);
  filter.frequency.exponentialRampToValueAtTime(300, end);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.linearRampToValueAtTime(0.07, t + time * 0.5);
  gain.gain.linearRampToValueAtTime(0.0001, end);
  src.connect(filter).connect(gain).connect(audio.music);
  src.start(t);
  src.stop(end + 0.05);
}
