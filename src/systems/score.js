// Score and the style meter.
//
// Everything stylish earns points: kills, landed tricks, grinds, and simply
// going fast. It also heats the style meter. Fill the meter and your
// multiplier goes up (x1 to x8), and every point you earn is multiplied by it.
// The meter cools all the time, slower the faster you're going; let it empty
// and you drop a multiplier. Getting hit resets it to x1.
import { config } from '../config.js';
import { load, store } from './storage.js';
import { difficulty } from './difficulty.js';

const KEY = 'best';

// Kill-streak milestones, announced when you reach them.
const STREAKS = { 3: 'Triple kill', 5: 'Killing spree', 10: 'Rampage', 15: 'Massacre', 25: 'Unstoppable', 40: 'Graveyard shift', 60: 'Death incarnate' };

export class Score {
  constructor() {
    this.best = Number(load(KEY)) || 0;
    this.reset();
  }

  reset() {
    this.points = 0;
    this.multiplier = 1;
    this.heat = 0;        // 0..1, how full the style meter is
    this.topMultiplier = 1;
    this.streak = 0;        // kills in a row, each within streakWindow seconds of the last
    this.streakTime = 0;    // seconds left to keep it going
    this.bestStreak = 0;
  }

  // Earn `points` (before the multiplier) and warm the meter by `heat`.
  add(points, heat = 0) {
    const S = config.score;
    this.points += points * this.multiplier * difficulty.score;
    this.heat += heat;
    while (this.heat >= 1 && this.multiplier < S.maxMultiplier) {
      this.heat -= 1;
      this.multiplier++;
      this.topMultiplier = Math.max(this.topMultiplier, this.multiplier);
    }
    this.heat = Math.min(1, this.heat);
  }

  // Returns the name of a kill-streak milestone if this kill reached one.
  kill(base, { elite, headshot, airborne }) {
    const S = config.score;
    const streakBonus = 1 + S.streakBonus * Math.min(20, this.streak);   // each kill in a streak is worth more
    this.add(base * (elite ? 10 : 1) * (headshot ? S.headshotBonus : 1) * (airborne ? S.airKillBonus : 1) * streakBonus, S.killHeat * (headshot ? 1.5 : 1) * (elite ? 4 : 1));
    this.streak++;
    this.streakTime = S.streakWindow;
    this.bestStreak = Math.max(this.bestStreak, this.streak);
    return STREAKS[this.streak] || null;
  }
  trick(boost) { this.add(boost * config.score.trickPoints, config.score.trickHeat + boost * 0.03); }
  grind(metres) { this.add(metres * config.score.grindPoints, metres * 0.01); }

  // Every frame: points for speed, and the meter cooling off.
  update(dt, speed) {
    if (this.streak > 0 && (this.streakTime -= dt) <= 0) this.streak = 0;   // too slow: the streak is over
    const S = config.score, fast = Math.max(0, speed - S.speedThreshold);
    if (fast > 0) this.points += fast * S.speedPoints * this.multiplier * difficulty.score * dt;
    const pace = Math.min(1, speed / config.skate.pushMaxSpeed);                    // going fast keeps it warm
    this.heat -= S.cooling * (1 + 0.2 * (this.multiplier - 1)) * (1 - 0.7 * pace) * dt;
    if (this.heat < 0) {
      if (this.multiplier > 1) { this.multiplier--; this.heat = 0.6; }
      else this.heat = 0;
    }
  }

  onHurt() {
    this.multiplier = 1;
    this.heat = 0;
  }

  // Call when the run ends. Returns true if this was a new best.
  finish() {
    const total = Math.floor(this.points);
    if (total <= this.best) return false;
    this.best = total;
    store(KEY, String(total));
    return true;
  }
}
