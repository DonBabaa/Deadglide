// Sandbox HUD (HTML overlay): speed bar, ollie charge, state, trick popups.
import { config } from '../config.js';

const $ = (id) => document.getElementById(id);
const speedFill = $('speed-fill'), speedText = $('speed-text'), chargeFill = $('charge-fill');
const state = $('state'), popups = $('popups'), overlay = $('overlay'), crosshair = $('crosshair');
const heartsEl = $('hearts'), statsEl = $('stats'), hurtEl = $('hurt'), xpFill = $('xp-fill'), xpLevel = $('xp-level');

export const hud = {
  clock: (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`,

  update(skater, aiming, hearts, horde, xp, maxHearts) {
    xpFill.style.width = `${Math.min(100, (xp.xp / xp.needed) * 100)}%`;
    xpLevel.textContent = `Level ${xp.level}`;
    crosshair.classList.toggle('aiming', aiming);
    heartsEl.textContent = '\u2665'.repeat(Math.max(0, hearts)) + '\u2661'.repeat(Math.max(0, maxHearts - hearts));
    statsEl.textContent = `${this.clock(horde.time)}   Wave ${horde.wave}   ${horde.kills} kills`;
    const speed = skater.speed;
    speedFill.style.width = `${Math.min(100, (speed / config.skate.maxSpeed) * 100)}%`;
    speedFill.classList.toggle('hot', speed > config.skate.pushMaxSpeed);
    speedText.textContent = Math.round(speed * 3.6);
    chargeFill.style.width = `${skater.charge * 100}%`;
    state.textContent = skater.grinding ? 'Grind' : !skater.grounded && skater.airTime > 0.1 ? 'Air' : skater.drifting && skater.speed > 3 ? 'Slide' : '';
  },

  // Red flash round the edges when you take a hit.
  flashHurt() {
    hurtEl.classList.remove('on');
    void hurtEl.offsetWidth;   // restart the animation
    hurtEl.classList.add('on');
  },

  popup(text, kind = '') {
    const el = document.createElement('div');
    el.className = `popup ${kind}`;
    el.textContent = text;
    popups.replaceChildren(el);
    el.addEventListener('animationend', () => el.remove());
  },

  showOverlay(title, hint) {
    $('overlay-title').textContent = title;
    $('overlay-hint').textContent = hint;
    overlay.classList.remove('hidden');
  },
  hideOverlay() { overlay.classList.add('hidden'); },
};
