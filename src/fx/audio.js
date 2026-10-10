// Synthesized sound effects (WebAudio, no files).
let ctx = null, noise = null;

// Browsers only allow audio after a click/keypress; call this from one.
export function unlockAudio() {
  if (!ctx) {
    try { ctx = new AudioContext(); } catch { return; }
    noise = ctx.createBuffer(1, ctx.sampleRate * 0.25, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
}

export function playShot() {
  if (!ctx || ctx.state !== 'running') return;
  const t = ctx.currentTime;

  // Crack: filtered noise burst.
  const src = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), crack = ctx.createGain();
  src.buffer = noise;
  src.playbackRate.value = 0.9 + Math.random() * 0.2;
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(5200, t);
  filter.frequency.exponentialRampToValueAtTime(500, t + 0.14);
  crack.gain.setValueAtTime(0.32, t);
  crack.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
  src.connect(filter).connect(crack).connect(ctx.destination);
  src.start(t);
  src.stop(t + 0.2);

  // Thump: short falling sine.
  const osc = ctx.createOscillator(), thump = ctx.createGain();
  osc.frequency.setValueAtTime(170, t);
  osc.frequency.exponentialRampToValueAtTime(45, t + 0.1);
  thump.gain.setValueAtTime(0.4, t);
  thump.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  osc.connect(thump).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.13);
}

// A short pitched blip: the basis of the small combat sounds.
function blip(type, from, to, time, volume) {
  if (!ctx || ctx.state !== 'running') return;
  const t = ctx.currentTime, osc = ctx.createOscillator(), gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(to, t + time);
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + time);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + time + 0.01);
}

export const playHit = () => blip('square', 900, 500, 0.04, 0.05);       // bullet hits a monster
export const playKill = () => blip('triangle', 260, 60, 0.16, 0.3);      // monster goes down
export const playHurt = () => blip('sawtooth', 180, 50, 0.35, 0.35);     // you got clawed
