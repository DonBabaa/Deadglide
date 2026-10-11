// The gold count-up on the "Level complete" screen: the run's gold pours into
// the bank. The number climbs, coins drop onto a stack and each one chinks,
// rising in pitch; the more you earned, the longer it runs and the taller the
// stack. It ends on a cash-register ring.
import { playCoin, playCashIn } from '../fx/audio.js';

const $ = (id) => document.getElementById(id);
const box = $('tally'), stack = $('tally-stack'), earnedText = $('tally-earned'), bankText = $('tally-bank');
const MAX_COINS = 24;
let running = 0;   // changes whenever a count-up starts or is cancelled, so an old one stops

export const goldTally = {
  // earned: gold from this run. before: what was in the bank already.
  show(earned, before) {
    const mine = ++running;
    box.classList.remove('hidden', 'done');
    stack.replaceChildren();
    earnedText.textContent = `+${earned.toLocaleString()}`;
    bankText.textContent = before.toLocaleString();
    if (earned <= 0) return;

    const duration = Math.min(4.5, 0.9 + earned / 160);                    // seconds: a bigger haul takes longer to count
    const coins = Math.min(MAX_COINS, Math.max(3, Math.ceil(earned / 20)));   // ...and stacks higher
    const start = performance.now() + 500;                                 // (a beat for the screen to settle first)
    let shown = 0, dropped = 0, lastChink = 0;

    const tick = (now) => {
      if (mine !== running) return;
      const k = Math.max(0, Math.min(1, (now - start) / (duration * 1000)));
      const eased = 1 - (1 - k) ** 2;   // quick at first, slowing into the total
      const counted = Math.round(earned * eased);
      if (counted !== shown) {
        shown = counted;
        earnedText.textContent = `+${(earned - counted).toLocaleString()}`;
        bankText.textContent = (before + counted).toLocaleString();
        if (now - lastChink > 55) { lastChink = now; playCoin(eased); }
      }
      while (dropped < Math.floor(eased * coins)) {
        const coin = document.createElement('i');
        coin.style.bottom = `${dropped * 7}px`;
        coin.style.left = `${Math.sin(dropped * 2.4) * 4}px`;   // not perfectly straight
        stack.append(coin);
        dropped++;
      }
      if (k < 1) return requestAnimationFrame(tick);
      box.classList.add('done');   // the total bumps
      playCashIn();
    };
    requestAnimationFrame(tick);
  },

  hide() {
    running++;
    box.classList.add('hidden');
  },
};
