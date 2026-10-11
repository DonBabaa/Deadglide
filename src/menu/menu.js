// The main menu (HTML over the menu scene): pick a level, then launch it.
// The launch panel has a Creative mode switch; when it's on you choose what
// you start with: guns, upgrades, and a couple of rule changes.
import { WEAPONS } from '../player/weapons.js';
import { UPGRADES, describe } from '../systems/upgrades.js';
import { POWERUPS } from '../player/powerups.js';
import { getName, setName, cleanName } from '../ui/playerName.js';
import { LEVELS } from '../world/level.js';

const $ = (id) => document.getElementById(id);
const root = $('menu'), home = $('menu-home'), launch = $('menu-launch');
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
nameInput.addEventListener('keydown', (e) => { if (e.code === 'Enter') $('level-1').click(); });

for (const n of [1, 2]) $(`level-${n}`).addEventListener('click', () => {
  if (!getName()) {   // no name yet: point at the box instead of going on
    nameInput.classList.remove('missing');
    void nameInput.offsetWidth;
    nameInput.classList.add('missing');
    nameInput.focus();
    return;
  }
  level = n;
  launch.querySelector('h2').textContent = LEVELS[n].name;
  launch.querySelector('.tagline').textContent = LEVELS[n].tagline;
  home.classList.add('hidden');
  launch.classList.remove('hidden');
});
$('menu-back').addEventListener('click', () => { launch.classList.add('hidden'); home.classList.remove('hidden'); });
toggle.addEventListener('click', () => setCreative(!creative));
$('menu-play').addEventListener('click', () => {
  // A copy, so later menu changes don't alter a run in progress. null = a normal run.
  onStart?.(creative ? { weapons: [...loadout.weapons], upgrades: { ...loadout.upgrades }, powers: { ...loadout.powers }, monsters: loadout.monsters, noDamage: loadout.noDamage } : null, level);
});

export const menu = {
  onStart(callback) { onStart = callback; },
  show(best) {
    nameInput.value = getName();
    nameInput.classList.remove('missing');
    $('menu-best').textContent = best > 0 ? `Best score ${best.toLocaleString()}` : '';
    launch.classList.add('hidden');
    $('menu-shop').classList.add('hidden');
    home.classList.remove('hidden');
    root.classList.remove('hidden');
    document.body.classList.add('in-menu');
  },
  hide() {
    root.classList.add('hidden');
    document.body.classList.remove('in-menu');
  },
};
