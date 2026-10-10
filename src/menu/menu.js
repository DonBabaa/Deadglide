// The main menu (HTML over the menu scene): pick a level, then launch it.
// The launch panel has a Creative mode switch; when it's on you choose what
// you start with: guns, upgrades, and a couple of rule changes.
import { WEAPONS } from '../player/weapons.js';
import { UPGRADES } from '../systems/upgrades.js';

const $ = (id) => document.getElementById(id);
const root = $('menu'), home = $('menu-home'), launch = $('menu-launch');
const toggle = $('creative-toggle'), loadoutBox = $('loadout');

// What Creative mode will start you with.
const loadout = { weapons: new Set(), upgrades: {}, monsters: true, noDamage: false };
let creative = false, onStart = null;

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
  for (const u of UPGRADES) {
    if (u.id === 'heal') continue;     // healing is pointless at the start
    const max = Math.min(u.max, 8), row = document.createElement('div'), count = document.createElement('span');
    row.className = 'stepper';
    row.title = u.description;
    const show = () => { count.textContent = loadout.upgrades[u.id] || 0; row.classList.toggle('on', !!loadout.upgrades[u.id]); };
    const step = (text, by) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = text;
      b.addEventListener('click', () => { loadout.upgrades[u.id] = Math.max(0, Math.min(max, (loadout.upgrades[u.id] || 0) + by)); show(); });
      return b;
    };
    const name = document.createElement('label');
    name.textContent = u.name;
    row.append(name, step('-', -1), count, step('+', 1));
    show();
    upgrades.append(row);
  }
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

$('level-1').addEventListener('click', () => { home.classList.add('hidden'); launch.classList.remove('hidden'); });
$('menu-back').addEventListener('click', () => { launch.classList.add('hidden'); home.classList.remove('hidden'); });
toggle.addEventListener('click', () => setCreative(!creative));
$('menu-play').addEventListener('click', () => {
  // A copy, so later menu changes don't alter a run in progress. null = a normal run.
  onStart?.(creative ? { weapons: [...loadout.weapons], upgrades: { ...loadout.upgrades }, monsters: loadout.monsters, noDamage: loadout.noDamage } : null);
});

export const menu = {
  onStart(callback) { onStart = callback; },
  show(best) {
    $('menu-best').textContent = best > 0 ? `Best score ${best.toLocaleString()}` : '';
    launch.classList.add('hidden');
    home.classList.remove('hidden');
    root.classList.remove('hidden');
    document.body.classList.add('in-menu');
  },
  hide() {
    root.classList.add('hidden');
    document.body.classList.remove('in-menu');
  },
};
