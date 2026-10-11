// The main menu (HTML over the menu scene): pick a level, then launch it.
// The launch panel has a Creative mode switch; when it's on you choose what
// you start with: guns, upgrades, and a couple of rule changes.
import { WEAPONS } from '../player/weapons.js';
import { UPGRADES, describe } from '../systems/upgrades.js';
import { POWERUPS } from '../player/powerups.js';
import { getName, setName, cleanName } from '../ui/playerName.js';
import { LEVELS } from '../world/level.js';
import { profile } from '../systems/profile.js';
import { leaderboard } from '../ui/leaderboard.js';

const $ = (id) => document.getElementById(id);
const root = $('menu'), home = $('menu-home'), launch = $('menu-launch'), levels = $('menu-levels');
const ALL = new URLSearchParams(location.search).has('all');   // (?all in the address: every level on the list, for testing)
const toggle = $('creative-toggle'), loadoutBox = $('loadout');

// What Creative mode will start you with.
const loadout = { weapons: new Set(), upgrades: {}, powers: {}, monsters: true, noDamage: false };
let creative = false, onStart = null, level = 1;

function chip(label, isOn, flip) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'chip';
  b.textContent = label;
  const paint = () => b.classList.toggle('on', isOn());
  b.addEventListener('click', () => { flip(); paint(); });
  paint();
  return b;
}

function buildLoadout() {
  const weapons = $('loadout-weapons'), upgrades = $('loadout-upgrades'), rules = $('loadout-rules');
  for (const w of Object.values(WEAPONS)) {
    if (w.id === 'pistol') continue;   // you always have the pistol
    weapons.append(chip(w.name, () => loadout.weapons.has(w.id), () => (loadout.weapons.has(w.id) ? loadout.weapons.delete(w.id) : loadout.weapons.add(w.id))));
  }
  // A "name  -  n  +" row that keeps a count in `store[id]`.
  const stepper = (store, id, label, tip, max) => {
    const row = document.createElement('div'), count = document.createElement('span');
    row.className = 'stepper';
    row.title = tip;
    const show = () => { count.textContent = store[id] || 0; row.classList.toggle('on', !!store[id]); };
    const step = (text, by) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = text;
      b.addEventListener('click', () => { store[id] = Math.max(0, Math.min(max, (store[id] || 0) + by)); show(); });
      return b;
    };
    const name = document.createElement('label');
    name.textContent = label;
    row.append(name, step('-', -1), count, step('+', 1));
    show();
    return row;
  };
  for (const u of UPGRADES) {
    if (u.id === 'heal' || u.requires) continue;   // healing is pointless at the start; power-up boosters come up in play
    upgrades.append(stepper(loadout.upgrades, u.id, u.name, describe(u, 0), Math.min(u.max, 8)));
  }
  for (const [id, p] of Object.entries(POWERUPS)) $('loadout-powers').append(stepper(loadout.powers, id, p.name, p.description, p.max));
  rules.append(
    chip('Monsters', () => loadout.monsters, () => { loadout.monsters = !loadout.monsters; }),
    chip('Take no damage', () => loadout.noDamage, () => { loadout.noDamage = !loadout.noDamage; }),
  );
}
buildLoadout();

function setCreative(on) {
  creative = on;
  toggle.textContent = `Creative mode: ${on ? 'on' : 'off'}`;
  toggle.classList.toggle('on', on);
  loadoutBox.classList.toggle('hidden', !on);
}

// Your nickname: needed before you can play (it goes by your health bar and on the leaderboard).
const nameInput = $('menu-name');
nameInput.addEventListener('input', () => {
  const clean = cleanName(nameInput.value);
  if (clean !== nameInput.value.trim()) nameInput.value = clean;   // drop characters that aren't allowed as they're typed
  setName(nameInput.value);
  nameInput.classList.remove('missing');
});
nameInput.addEventListener('keydown', (e) => { if (e.code === 'Enter') $('menu-start').click(); });

// Play: the list of where you can start. The cemetery, always; anywhere else once you have finished it; and Free Ride.
$('menu-start').addEventListener('click', () => {
  if (!getName()) {   // no name yet: point at the box instead of going on
    nameInput.classList.remove('missing');
    void nameInput.offsetWidth;
    nameInput.classList.add('missing');
    nameInput.focus();
    return;
  }
  home.classList.add('hidden');
  levels.classList.remove('hidden');
});
$('levels-back').addEventListener('click', () => { levels.classList.add('hidden'); home.classList.remove('hidden'); });
// The editor's list of scenes (only with ?editor in the address: see the cinematics in main.js).
$('menu-cinema-open').classList.toggle('hidden', !new URLSearchParams(location.search).has('editor'));
$('menu-cinema-open').addEventListener('click', () => { home.classList.add('hidden'); $('menu-cinema').classList.remove('hidden'); });
$('cinema-back').addEventListener('click', () => { $('menu-cinema').classList.add('hidden'); home.classList.remove('hidden'); });

for (const n of [1, 2, 3, 4, 5]) $(`level-${n}`).addEventListener('click', () => {
  level = n;
  toggle.classList.toggle('hidden', !!LEVELS[n].freeRide);   // (Free Ride has no loadout to choose)
  if (LEVELS[n].freeRide) setCreative(false);
  $('ride-box').classList.toggle('hidden', !LEVELS[n].freeRide);
  $('ride-note').textContent = '';
  $('line-board-box').classList.toggle('hidden', !LEVELS[n].freeRide && !LEVELS[n].descent);   // Free Ride opens on its board of best lines, the Long Way Down on its fastest times
  $('line-board-box').querySelector('.menu-label').textContent = LEVELS[n].descent ? 'Fastest down the hill' : 'Best lines';
  if (LEVELS[n].freeRide) leaderboard.showLines();
  if (LEVELS[n].descent) leaderboard.showRuns();
  launch.querySelector('h2').textContent = LEVELS[n].name;
  launch.querySelector('.tagline').textContent = LEVELS[n].tagline;
  levels.classList.add('hidden');
  launch.classList.remove('hidden');
});
$('menu-back').addEventListener('click', () => { launch.classList.add('hidden'); levels.classList.remove('hidden'); });
toggle.addEventListener('click', () => setCreative(!creative));
// Free Ride with friends: host a session, or join one with its code. (Start, as ever, is riding alone.)
$('ride-host').addEventListener('click', () => onStart?.(null, level, { host: true }));
$('ride-join').addEventListener('click', () => {
  const code = $('ride-code').value.trim().toUpperCase();
  if (code.length < 4) { $('ride-note').textContent = 'Type the code your friend gave you'; $('ride-code').focus(); return; }
  onStart?.(null, level, { join: code });
});
$('ride-code').addEventListener('keydown', (e) => { e.stopPropagation(); if (e.code === 'Enter') $('ride-join').click(); });
$('ride-code').addEventListener('keyup', (e) => e.stopPropagation());
$('menu-play').addEventListener('click', () => {
  // A copy, so later menu changes don't alter a run in progress. null = a normal run.
  onStart?.(creative ? { weapons: [...loadout.weapons], upgrades: { ...loadout.upgrades }, powers: { ...loadout.powers }, monsters: loadout.monsters, noDamage: loadout.noDamage } : null, level);
});

export const menu = {
  onStart(callback) { onStart = callback; },
  show(best) {
    for (const n in LEVELS) $(`level-${n}`).classList.toggle('hidden', !(ALL || +n === 1 || LEVELS[n].freeRide || profile.cleared.includes(+n)));
    const done = [1, 2, 4, 5].filter((n) => profile.cleared.includes(n)).length;
    $('menu-start-desc').textContent = done ? `Start a run \u00b7 or go back to a level you have finished (${done} of 4)` : 'Start a run \u00b7 the cemetery';
    levels.classList.add('hidden');
    $('menu-cinema').classList.add('hidden');
    nameInput.value = getName();
    nameInput.classList.remove('missing');
    $('menu-best').textContent = best > 0 ? `Best score ${best.toLocaleString()}` : '';
    launch.classList.add('hidden');
    $('menu-shop').classList.add('hidden');
    home.classList.remove('hidden');
    root.classList.remove('hidden');
    document.body.classList.add('in-menu');
  },
  // Open on the editor's list of scenes (coming back from one).
  showCinema() { home.classList.add('hidden'); $('menu-cinema').classList.remove('hidden'); },
  hide() {
    root.classList.add('hidden');
    document.body.classList.remove('in-menu');
  },
};
