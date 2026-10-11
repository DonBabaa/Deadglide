// Lines: Free Ride's score. A line is everything you string together without
// stopping: tricks, grinds, big airs, gaps. It starts with the first thing that
// scores and is worth (the points of everything in it) x (how many things are in it),
// so a long line is worth far more than the same tricks done one at a time.
//
// A line is banked when you roll along for config.freeRide.lineGap seconds
// without adding to it. It is lost, for nothing, if you land sloppy, fall in the
// lava, or (later) get shot off your board.
//
// main.js feeds it (add, fail, update) and reads `events` for what to show:
//   { type: 'banked', total, count, record }   { type: 'lost', total, why }
import { config } from '../config.js';
import { load, store } from './storage.js';

export class Lines {
  constructor() {
    this.best = Math.max(0, Math.floor(Number(load('bestLine')) || 0));   // your best ever, on this computer
    this.events = [];
    this.reset();
  }

  reset() {
    this.items = [];   // { label, points }
    this.points = 0;
    this.idle = 0;     // seconds rolled since the line was last added to
    this.session = 0;  // your best this session
  }

  get count() { return this.items.length; }
  get total() { return this.points * this.count; }
  // 1 when just added to, falling to 0 as the line is about to be banked.
  get left() { return this.count ? Math.max(0, 1 - this.idle / config.freeRide.lineGap) : 0; }

  add(label, points) {
    points = Math.round(points);
    if (points <= 0) return;
    this.items.push({ label, points });
    this.points += points;
    this.idle = 0;
  }

  // rolling: on the ground and not grinding (time in the air or on a rail doesn't count against you).
  update(dt, rolling) {
    if (!this.count) return;
    if (rolling) this.idle += dt;
    if (this.idle >= config.freeRide.lineGap) this.bank();
  }

  bank() {
    const total = this.total, count = this.count;
    if (!count) return;
    this.clear();
    this.session = Math.max(this.session, total);
    const record = total > this.best;
    if (record) { this.best = total; store('bestLine', String(total)); }
    this.events.push({ type: 'banked', total, count, record });
  }

  fail(why) {
    if (!this.count) return;
    const total = this.total;
    this.clear();
    this.events.push({ type: 'lost', total, why });
  }

  clear() {
    this.items = [];
    this.points = 0;
    this.idle = 0;
  }
}
