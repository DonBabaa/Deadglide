// Sandbox HUD (HTML overlay): speed bar, ollie charge, state, trick popups.
import { config } from '../config.js';

const $ = (id) => document.getElementById(id);
const speedFill = $('speed-fill'), speedText = $('speed-text'), chargeFill = $('charge-fill');
const state = $('state'), popups = $('popups'), overlay = $('overlay'), crosshair = $('crosshair');
const scorePoints = $('score-points'), scoreMult = $('score-mult'), scoreHeat = $('score-heat'), weaponsEl = $('weapons');
let shownMult = 1, shownWeapons = '', shownStreak = 0, shownPowers = null, shownLine = '', lineCount = 0, shownRide = '';
const chestMarker = $('chest-marker'), chestLabel = chestMarker.querySelector('span');
const hpFill = $('hp-fill'), hpText = $('hp-text'), statsEl = $('stats'), hurtEl = $('hurt'), xpFill = $('xp-fill'), xpLevel = $('xp-level'), buffsEl = $('buffs');

export const hud = {
  clock: (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`,

  update(skater, aiming, hp, horde, xp, maxHp, buffs) {
    // Active timed effects, e.g. "Frenzy 7s".
    buffsEl.textContent = Object.entries(buffs).filter(([, t]) => t > 0).map(([name, t]) => `${name} ${Math.ceil(t)}s`).join('   ');
    xpFill.style.width = `${xp.maxed ? 100 : Math.min(100, (xp.xp / xp.needed) * 100)}%`;
    xpLevel.textContent = xp.maxed ? `Level ${xp.level}  ·  max` : `Level ${xp.level}`;
    crosshair.classList.toggle('aiming', aiming);
    hpFill.style.width = `${Math.max(0, (hp / maxHp) * 100)}%`;
    hpFill.classList.toggle('low', hp / maxHp < 0.3);
    hpText.textContent = `${Math.ceil(hp)} / ${maxHp}`;
    statsEl.textContent = `${this.clock(horde.time)}   Wave ${horde.wave}   ${horde.kills} kills`;
    const speed = skater.speed;
    speedFill.style.width = `${Math.min(100, (speed / config.skate.maxSpeed) * 100)}%`;
    speedFill.classList.toggle('hot', speed > config.skate.pushMaxSpeed);
    speedText.textContent = Math.round(speed * 3.6);
    chargeFill.style.width = `${skater.charge * 100}%`;
    state.textContent = skater.grinding ? 'Grind' : !skater.grounded && skater.airTime > 0.1 ? 'Air' : skater.drifting && skater.speed > 3 ? 'Slide' : '';
  },

  // Sniper scope overlay: up while aiming a scoped gun.
  scope(up) { $('scope').classList.toggle('up', up); },
  // The glass whites out for an instant when the laser fires.
  scopeFlash() {
    const glass = $('scope-glass');
    glass.classList.remove('flash');
    void glass.offsetWidth;
    glass.classList.add('flash');
  },

  // Score, multiplier and style meter.
  score(score) {
    scorePoints.textContent = Math.floor(score.points).toLocaleString();
    scoreHeat.style.width = `${score.heat * 100}%`;
    if (score.multiplier !== shownMult) {
      scoreMult.textContent = `x${score.multiplier}`;
      if (score.multiplier > shownMult) {   // pop when it goes up
        scoreMult.classList.remove('bump');
        void scoreMult.offsetWidth;
        scoreMult.classList.add('bump');
      }
      shownMult = score.multiplier;
    }
  },

  // The guns you own, numbered, with the one in hand highlighted.
  weapons(weapon, all) {
    const key = weapon.owned.join() + weapon.def.id;
    if (key === shownWeapons) return;
    shownWeapons = key;
    weaponsEl.replaceChildren(...weapon.owned.map((id, i) => {
      const row = document.createElement('div');
      row.className = id === weapon.def.id ? 'current' : '';
      row.innerHTML = `<b>${i + 1}</b>`;
      row.append(all[id].name);
      return row;
    }));
  },

  // Flash the crosshair when a shot lands.
  // kind: 'hit', 'crit' (headshot) or 'kill'.
  hitMarker(kind) {
    const el = $('hitmarker');
    el.className = '';
    void el.offsetWidth;   // restart the animation
    el.className = kind;
  },

  // Kill streak under the score: the count, and a bar showing how long you have to keep it going.
  streak(score, window) {
    const el = $('streak'), on = score.streak >= 2;
    el.classList.toggle('hidden', !on);
    if (!on) { shownStreak = 0; return; }
    $('streak-time').style.width = `${Math.max(0, score.streakTime / window) * 100}%`;
    if (score.streak !== shownStreak) {
      $('streak-count').textContent = score.streak;
      el.classList.remove('bump');
      void el.offsetWidth;
      el.classList.add('bump');
      shownStreak = score.streak;
    }
  },

  // Points at the HotBox Zone. Pass null to hide it.
  zoneMarker(x, y, metres) {
    const el = $('zone-marker');
    el.classList.toggle('hidden', x === null);
    if (x === null) return;
    el.style.transform = `translate(${x * window.innerWidth - 11}px, ${y * window.innerHeight - 11}px)`;
    el.querySelector('span').textContent = `HotBox ${Math.round(metres)} m`;
  },

  // Capture bar, shown while you stand in a zone (progress 0..1), or null to hide it.
  capture(progress) {
    const el = $('capture');
    el.classList.toggle('hidden', progress === null);
    if (progress !== null) $('capture-fill').style.width = `${progress * 100}%`;
  },

  // Shield charge (0..1) as a thin blue bar under the HP bar; hidden if you have no shield.
  shield(charge, owned) {
    $('shield-bar').classList.toggle('hidden', !owned);
    $('shield-fill').style.width = `${charge * 100}%`;
    $('hp').classList.toggle('shielded', charge > 0);
  },

  // The power-ups you own, e.g. "TOZTOXIK III", each in its own colour.
  powers(list) {
    const key = list.map((p) => p.label).join();
    if (key === shownPowers) return;
    shownPowers = key;
    $('powers').replaceChildren(...list.map((p) => {
      const el = document.createElement('span');
      el.textContent = p.label;
      el.style.color = `#${p.color.toString(16).padStart(6, '0')}`;
      return el;
    }));
  },

  // Points at the exit portal. Pass null to hide it.
  portalMarker(x, y, metres) {
    const el = $('portal-marker');
    el.classList.toggle('hidden', x === null);
    if (x === null) return;
    el.style.transform = `translate(${x * window.innerWidth - 13}px, ${y * window.innerHeight - 13}px)`;
    el.querySelector('span').textContent = `Exit ${Math.round(metres)} m`;
  },

  // The boss's health bar across the top (health 0..1), or null to hide it.
  // Free Ride with friends: the session's code and who's riding, best line first.
  // ride: { code, status, hosting, board() } (freeride/ride.js), or null to hide the panel.
  ride(ride) {
    const el = $('ride');
    el.classList.toggle('hidden', !ride);
    if (!ride) return;
    const rows = ride.board(), key = `${ride.code}|${ride.status}|${rows.map((r) => `${r.name}:${r.best}:${Math.round(r.line / 100)}`).join()}`;
    if (key === shownRide) return;
    shownRide = key;
    const status = $('ride-status');
    status.textContent = ride.code ? `${ride.hosting ? 'Hosting' : 'Session'}  ` : ride.status;
    if (ride.code) status.append(Object.assign(document.createElement('b'), { textContent: ride.code }));
    $('ride-board').replaceChildren(...rows.map((r) => {
      const li = document.createElement('li'), cell = (cls, text) => Object.assign(document.createElement('span'), { className: cls, textContent: text });
      if (r.me) li.className = 'me';
      li.append(cell('who', r.name), cell('now', r.line > 0 ? `+${Math.round(r.line).toLocaleString()}` : ''), cell('best', Math.round(r.best).toLocaleString()));
      return li;
    }));
  },
  // Free Ride: the line you're building. line: a Lines (systems/lines.js), or null to hide it.
  line(line) {
    const el = $('line');
    el.classList.toggle('hidden', !line);
    if (!line) return;
    const live = line.count > 0, key = `${line.count}:${line.points}:${line.best}:${line.session}`;
    $('line-time').style.width = `${line.left * 100}%`;
    if (key === shownLine) return;
    if (live && line.count > lineCount) { el.classList.add('bump'); setTimeout(() => el.classList.remove('bump'), 90); }
    lineCount = line.count;
    shownLine = key;
    el.classList.toggle('live', live);
    $('line-total').textContent = line.total.toLocaleString();
    $('line-sum').textContent = live ? `${line.points.toLocaleString()} \u00d7 ${line.count}` : 'Land a trick to start a line';
    $('line-items').replaceChildren(...line.items.slice(-3).map((item) => {
      const li = document.createElement('li'), points = document.createElement('span');
      li.textContent = item.label;
      points.textContent = `+${item.points.toLocaleString()}`;
      li.append(points);
      return li;
    }));
    $('line-best').textContent = `Best line ${line.best.toLocaleString()}${line.session ? `  \u00b7  this session ${line.session.toLocaleString()}` : ''}`;
  },
  boss(health, name = '') {
    const el = $('boss'), on = health !== null;
    document.body.classList.toggle('boss-fight', on);
    el.classList.toggle('hidden', !on);
    if (!on) return;
    if (name) $('boss-name').textContent = name;
    $('boss-fill').style.width = $('boss-lag').style.width = `${Math.max(0, health) * 100}%`;   // (the lagging bar catches up slowly, in CSS)
    el.classList.toggle('enraged', health < 0.4);
  },
  // The overtime clock (seconds since the boss died), or null to hide it.
  escape(seconds) {
    const el = $('escape'), on = seconds !== null;
    document.body.classList.toggle('escaping', on);
    el.classList.toggle('hidden', !on);
    if (!on) return;
    el.querySelector('small').textContent = 'Overtime';
    el.querySelector('span').textContent = this.clock(seconds);
    el.classList.toggle('late', seconds > 40);   // by now they're coming thick and fast
  },
  // The Long Way Down: your time so far, and how far behind you the collapse is (null: hide it).
  run(time, gap) {
    const el = $('escape'), on = time !== null;
    el.classList.toggle('hidden', !on);
    if (!on) return;
    el.querySelector('small').textContent = `The collapse  ·  ${Math.max(0, Math.round(gap))} m behind`;
    el.querySelector('span').textContent = time;
    el.classList.toggle('late', gap < 45);
  },
  // Cutscene overlays. flash: the whole screen in one colour (lightning, a blink to black,
  // a white-out); pass null to let it fade away. dread: darkness and red closing in from the edges.
  flash(color, opacity = 1) {
    const el = $('flash');
    el.classList.toggle('fade', color === null);
    if (color !== null) el.style.background = color;
    el.style.opacity = color === null ? 0 : opacity;
  },
  dread(amount) { $('dread').style.opacity = amount; },
  // Speed lines round the edge of the screen (0 = none), for cut-ins.
  lines(amount) { $('lines').style.opacity = amount; },

  // A line of story across the bottom of the screen (null: take it away). hint: small print under it.
  caption(text, hint = '') {
    const el = $('caption');
    if (text && el.dataset.text !== text) { el.dataset.text = text; el.innerHTML = ''; el.append(text); if (hint) el.append(Object.assign(document.createElement('small'), { textContent: hint })); }
    el.classList.toggle('on', !!text);
  },

  // His name slams onto the middle of the screen when he arrives.
  bossIntro(name, label = 'Final boss') {
    const el = $('boss-intro');
    el.querySelector('small').textContent = label;
    el.querySelector('span').textContent = name;
    el.classList.remove('hidden');
    void el.offsetWidth;   // restart the animation
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
    hurtEl.classList.remove('on');
    void hurtEl.offsetWidth;
    hurtEl.classList.add('on');
  },
  hideBossIntro() { $('boss-intro').classList.add('hidden'); },
  // The name of where you have just got to, across the screen for a couple of seconds (play carries on under it).
  place(name, label, stay = false) {
    const el = $('boss-intro');
    el.querySelector('small').textContent = label;
    el.querySelector('span').textContent = name;
    el.classList.remove('hidden');
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
    clearTimeout(this.placeTimer);
    if (!stay) this.placeTimer = setTimeout(() => el.classList.add('hidden'), 2600);   // (stay: until hideBossIntro)
  },

  // Gold carried this run (lost if you die), or null to hide it.
  gold(amount) {
    const el = $('gold');
    el.classList.toggle('hidden', amount === null);
    if (amount !== null) el.innerHTML = `<i class="coin"></i>${Math.floor(amount).toLocaleString()}`;
  },

  // The player's nickname, by the health bar.
  name(text) { $('player-name').textContent = text; },

  // Points at a chest: x / y are screen fractions (0..1), or pass null to hide it.
  chestMarker(x, y, metres) {
    chestMarker.classList.toggle('hidden', x === null);
    if (x === null) return;
    chestMarker.style.transform = `translate(${x * window.innerWidth - 6}px, ${y * window.innerHeight - 6}px)`;
    chestLabel.textContent = `${Math.round(metres)} m`;
  },

  // The HP bar glows green for a moment when you heal.
  flashHeal() {
    const bar = $('hp');
    bar.classList.remove('heal');
    void bar.offsetWidth;
    bar.classList.add('heal');
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
