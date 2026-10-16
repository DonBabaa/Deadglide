// The story's own music. While a story scene plays, the level's music is held right down (audio.js: holdMusic) and
// one of these cues plays in its place: a short pattern that loops for as long as the scene lasts (a scene waits for
// the player, so nobody knows how long that will be) and fades out when it ends. They are kept quiet and slow on
// purpose: the scene's sounds (a bell, a chip landing, a drag on a cigarette) are meant to be heard over them.
//   playCue(name)   start one (or carry on, if it is the one already playing)
//   stopCue()       fade out whatever is playing
// A cue is { bpm, steps, play(step, t, I) }: `steps` eighth notes to the loop; play() is called for each one in
// turn, a little ahead of time, with the instruments (I) to play it on.
import { audio } from './audio.js';

const midi = (n) => 440 * 2 ** ((n - 69) / 12);

// The instruments. Each takes the time to play at, a note (MIDI number), and how loud.
function instruments(ctx, out) {
  const voice = (type, f, t, attack, hold, release, volume) => {
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = f;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + attack);
    gain.gain.setValueAtTime(volume, t + attack + hold);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
    osc.connect(gain).connect(out);
    osc.start(t);
    osc.stop(t + attack + hold + release + 0.05);
  };
  return {
    // A soft chord that swells in and out: notes, how long, how loud.
    pad(t, notes, seconds, volume = 0.05) {
      for (const n of notes) { voice('sine', midi(n), t, seconds * 0.3, seconds * 0.3, seconds * 0.6, volume); voice('triangle', midi(n) * 1.003, t, seconds * 0.4, seconds * 0.2, seconds * 0.6, volume * 0.35); }
    },
    // A struck string: the overtones die first.
    keys(t, n, volume = 0.09) {
      const f = midi(n);
      voice('triangle', f, t, 0.006, 0.02, 1.6, volume);
      voice('sine', f * 2, t, 0.004, 0.01, 0.7, volume * 0.35);
      voice('sine', f * 3, t, 0.004, 0.01, 0.3, volume * 0.12);
    },
    // A round low note.
    bass(t, n, seconds = 0.5, volume = 0.16) {
      voice('sine', midi(n), t, 0.012, seconds * 0.5, seconds * 0.5, volume);
      voice('triangle', midi(n) * 2, t, 0.012, seconds * 0.2, seconds * 0.4, volume * 0.18);
    },
    // A short bowed stab (for something tense that keeps time).
    pulse(t, n, volume = 0.05) {
      voice('sawtooth', midi(n), t, 0.01, 0.06, 0.12, volume * 0.5);
      voice('triangle', midi(n), t, 0.01, 0.06, 0.16, volume);
    },
    // A small bell.
    bell(t, n, volume = 0.05) {
      const f = midi(n);
      voice('sine', f, t, 0.004, 0.02, 1.8, volume);
      voice('sine', f * 2.76, t, 0.004, 0.01, 0.6, volume * 0.25);
    },
    // A brushed tick.
    tick(t, volume = 0.03) {
      const src = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
      src.buffer = audio.noise;
      filter.type = 'highpass';
      filter.frequency.value = 7000;
      gain.gain.setValueAtTime(volume, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      src.connect(filter).connect(gain).connect(out);
      src.start(t, Math.random() * 0.5);
      src.stop(t + 0.07);
    },
  };
}

// at(step, { step: note, ... }): the note for this step, if it has one.
const CUES = {
  // The cemetery (the opening, the first chip): A minor, slow, a few notes of piano over a held chord.
  grave: { bpm: 56, steps: 32, play(s, t, I) {
    if (s === 0) { I.pad(t, [45, 52, 57, 60], 8.4); I.bass(t, 33, 3); }
    if (s === 16) { I.pad(t, [41, 48, 57, 60], 8.4); I.bass(t, 29, 3); }
    const tune = { 0: 76, 3: 72, 6: 69, 10: 71, 16: 72, 19: 69, 22: 65, 26: 64 }[s];
    if (tune) I.keys(t, tune);
  } },
  // The Catacombs (their opening, Rubistus dying, the ladder): a drone, a slow heartbeat, and notes that do not belong.
  deep: { bpm: 48, steps: 32, play(s, t, I) {
    if (s % 16 === 0) I.pad(t, [38, 45, 50], 10, 0.06);
    if (s % 8 === 0) { I.bass(t, 26, 0.5, 0.2); I.bass(t + 0.28, 26, 0.4, 0.12); }
    const tune = { 4: 80, 12: 74, 20: 75, 27: 69 }[s];
    if (tune) I.bell(t, tune, 0.045);
  } },
  // The city at night: a walking bass, brushes, a chord on the off-beat, three notes of something like a tune.
  city: { bpm: 84, steps: 16, play(s, t, I) {
    if (s % 2 === 0) I.bass(t, [38, 41, 45, 48, 38, 48, 45, 41][s / 2], 0.34, 0.17);
    I.tick(t, s % 2 ? 0.035 : 0.014);
    if (s === 3 || s === 11) for (const n of [53, 57, 60]) I.keys(t, n, 0.035);
    const tune = { 6: 69, 7: 72, 14: 74 }[s];
    if (tune) I.bell(t, tune, 0.04);
  } },
  // The House (the takings, the way out, the house winning): something tense that keeps time.
  house: { bpm: 100, steps: 16, play(s, t, I) {
    if (s === 0) I.pad(t, [36, 43, 51], 4.8, 0.05);
    I.pulse(t, s % 2 ? 55 : 48, s % 4 === 0 ? 0.06 : 0.035);
    if (s === 0 || s === 8) I.bass(t, 24, 0.5, 0.2);
    const tune = { 4: 75, 12: 74 }[s];
    if (tune) I.keys(t, tune, 0.06);
  } },
  // The casino coming down: low, fast and getting nowhere.
  collapse: { bpm: 120, steps: 16, play(s, t, I) {
    I.bass(t, s % 2 ? 40 : 28, 0.22, 0.17);
    I.tick(t, 0.02);
    if (s === 0) I.pad(t, [40, 47, 55], 4, 0.05);
    if (s % 4 === 2) I.pulse(t, [64, 67, 69, 71][(s - 2) / 4], 0.05);
  } },
  // Off the last ramp: a chord that does not resolve, and four notes turning over.
  air: { bpm: 60, steps: 16, play(s, t, I) {
    if (s === 0) I.pad(t, [50, 57, 64, 69], 8, 0.055);
    const tune = { 0: 81, 4: 76, 8: 74, 12: 76 }[s];
    if (tune) I.bell(t, tune, 0.045);
  } },
  // The Moon: A flat major, at last. Four chords and a tune that goes up.
  moon: { bpm: 52, steps: 32, play(s, t, I) {
    if (s % 8 === 0) {
      const bar = s / 8;
      I.pad(t, [[44, 51, 60], [41, 48, 56], [49, 56, 65], [51, 58, 67]][bar], 4.6, 0.055);
      I.bass(t, [32, 29, 37, 39][bar], 2.6, 0.15);
    }
    const tune = { 0: 72, 3: 75, 6: 80, 8: 77, 11: 75, 14: 72, 16: 73, 19: 77, 22: 80, 24: 79, 27: 75, 30: 70 }[s];
    if (tune) I.keys(t, tune, 0.08);
  } },
};

const LEVEL = 1.5;   // how loud a cue is: clearly there, a little under the level music it replaces
let cue = null;   // the one playing: { name, def, out, play, step, next, timer }

// Recorded cues (his, made with Suno: see tools/extract_audio.py): one plays once, from the first frame of its scene,
// and the scene is cut to it. Fetched ahead (preloadCues) so that it is there when the scene starts; if it is not,
// the generated cue of the same name plays instead (or nothing).
const RECORDED = { moon_down: 'cue_moon_down.aac', moon_up: 'cue_moon_up.aac' };   // (his, made with Suno: tools/master_audio.py)
const RECORDED_LEVEL = { moon_down: 1.0, moon_up: 1.0 };
const recorded = {};
export function preloadCues(names = Object.keys(RECORDED)) {
  const ctx = audio.ctx;
  if (!ctx) return;
  for (const name of names) {
    if (recorded[name] || !RECORDED[name]) continue;
    recorded[name] = fetch(`${import.meta.env.BASE_URL}sounds/music/${RECORDED[name]}`).then((r) => r.arrayBuffer()).then((data) => ctx.decodeAudioData(data)).then((b) => { recorded[name] = b; return b; }).catch(() => { recorded[name] = null; });
  }
}

export function stopCue(fade = 1.2) {
  if (!cue) return;
  const { out, timer } = cue, t = audio.ctx.currentTime;
  const src = cue.src;
  cue = null;
  clearInterval(timer);
  if (src) setTimeout(() => { try { src.stop(); } catch {} }, fade * 1000 + 600);
  out.gain.cancelScheduledValues(t);
  out.gain.setTargetAtTime(0, t, fade / 4);
  setTimeout(() => out.disconnect(), fade * 1000 + 2500);   // (after its last notes have died away)
}

export function playCue(name) {
  if (cue?.name === name) return;
  stopCue();
  const ctx = audio.ctx, def = CUES[name];
  const buffer = recorded[name];
  if (ctx && ctx.state === 'running' && buffer && buffer.getChannelData) {   // (the recording, once, from now)
    const out = ctx.createGain(), src = ctx.createBufferSource();
    out.gain.value = RECORDED_LEVEL[name] ?? 1;
    out.connect(audio.score);
    src.buffer = buffer; src.connect(out); src.start(ctx.currentTime + 0.02);
    cue = { name, out, timer: 0, src };
    return;
  }
  if (!ctx || ctx.state !== 'running' || !def) return;
  const out = ctx.createGain();
  out.gain.value = LEVEL;
  out.connect(audio.score);   // (on the music's volume control)
  const playing = cue = { name, out, step: 0, next: ctx.currentTime + 0.08, I: instruments(ctx, out), timer: 0 };
  const beat = 60 / def.bpm / 2;
  const fill = () => {
    if (playing.next < ctx.currentTime - 0.2) playing.next = ctx.currentTime + 0.05;   // (the tab was asleep: carry on from now, not from then)
    while (playing.next < ctx.currentTime + 0.3) {
      def.play(playing.step, playing.next, playing.I);
      playing.step = (playing.step + 1) % def.steps;
      playing.next += beat;
    }
  };
  fill();
  playing.timer = setInterval(fill, 80);
}
