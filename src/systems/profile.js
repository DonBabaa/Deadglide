// What you keep between runs: gold, and what you've bought with it.
// It is saved in this browser (localStorage), so it survives refreshes and
// restarts, but not clearing the site's data or switching browser or device.
//
// Gold is only banked when you leave a level through the exit portal.
//
// Everything the shop sells is listed here:
//   PERMANENT  small bonuses you buy level by level
//   UNLOCKS    one-off purchases that change how a run plays
//   GUNS       guns to unlock (so they can turn up in chests), and to start a run holding
import { WEAPONS } from '../player/weapons.js';
import { load, store } from './storage.js';

const KEY = 'profile';
const PRICES = [100, 200, 350, 550, 800];   // each permanent upgrade's five levels

export const PERMANENT = [
  { id: 'hide', name: 'Thick Hide', per: '+8 max HP', apply: (s, n) => { s.maxHp += 8 * n; } },
  { id: 'eye', name: 'Sharp Eye', per: '+4% bullet damage', apply: (s, n) => { s.damage += 0.04 * n; } },
  { id: 'learner', name: 'Fast Learner', per: '+5% XP', apply: (s, n) => { s.xpGain += 0.05 * n; } },
  { id: 'arms', name: 'Long Arms', per: '+8% pickup range', apply: (s, n) => { s.pickupRadius += 0.08 * n; } },
  { id: 'tooth', name: 'Gold Tooth', per: '+6% gold found', apply: (s, n) => { s.goldGain += 0.06 * n; } },
  { id: 'wheels', name: 'Fresh Wheels', per: '+2% top pushing speed', apply: (s, n) => { s.topSpeed += 0.02 * n; } },
].map((u) => ({ ...u, max: PRICES.length, prices: PRICES }));

export const UNLOCKS = [
  { id: 'reroll', name: 'Reroll', price: 600, description: 'Once per level-up, redraw the three cards.' },
  { id: 'headStart', name: 'Head Start', price: 900, description: 'Begin every run with one random power-up.' },
  { id: 'secondChance', name: 'Second Chance', price: 1500, description: 'Once per run, survive a killing blow with 30 HP.' },
];

// unlock: the price to make it turn up in chests (0 = it always can). start: the price to be able to begin a run with it.
export const GUNS = [
  { id: 'machineGun', unlock: 0, start: 300 },
  { id: 'revolver', unlock: 300, start: 700 },
  { id: 'shotgun', unlock: 400, start: 800 },
  { id: 'cryo', unlock: 700, start: 1500 },
  { id: 'launcher', unlock: 900, start: 1800 },
  { id: 'saw', unlock: 1100, start: 2200 },
  { id: 'sniper', unlock: 1500, start: 3000 },
  { id: 'flamer', unlock: 1800, start: 3500 },
].map((g) => ({ ...g, name: WEAPONS[g.id].name, description: WEAPONS[g.id].description }));

// cosmetics: see systems/cosmetics.js (owned: things bought, look: what's worn in each slot, gold / goldOff: gold gun skins owned / switched off)
// houseTake: gold the casino has won off you, less what you've won off it (it can go negative)
// wagered: all the gold you have ever put down in the casino, win or lose (it dresses Babitus for the last fight)
// reached: the furthest locked level you have got to (see LEVELS in world/level.js)
// cleared: the levels you have finished (their numbers): each can be started from the menu from then on. 5 in it: you have finished the game.
const fresh = () => ({ gold: 0, houseTake: 0, wagered: 0, reached: 0, cleared: [], upgrades: {}, unlocks: {}, guns: [], starts: [], startGun: null, cosmetics: { owned: [], look: {}, gold: [], goldOff: [] } });
export const profile = fresh();

try {
  const saved = JSON.parse(load(KEY));
  if (saved && typeof saved === 'object') {
    profile.gold = Math.max(0, Math.floor(Number(saved.gold) || 0));
    profile.houseTake = Math.floor(Number(saved.houseTake) || 0);
    profile.wagered = Math.max(0, Math.floor(Number(saved.wagered) || 0));
    profile.reached = Math.max(0, Math.min(6, Math.floor(Number(saved.reached) || 0)));
    profile.cleared = Array.isArray(saved.cleared) ? saved.cleared.filter((n) => Number.isInteger(n) && n > 0 && n < 10) : [];
    for (const u of PERMANENT) profile.upgrades[u.id] = Math.max(0, Math.min(u.max, Math.floor(Number(saved.upgrades?.[u.id]) || 0)));
    for (const u of UNLOCKS) profile.unlocks[u.id] = !!saved.unlocks?.[u.id];
    profile.guns = GUNS.map((g) => g.id).filter((id) => saved.guns?.includes(id));
    profile.starts = GUNS.map((g) => g.id).filter((id) => saved.starts?.includes(id));
    profile.startGun = profile.starts.includes(saved.startGun) ? saved.startGun : null;
    const strings = (list) => (Array.isArray(list) ? list.filter((x) => typeof x === 'string').slice(0, 200) : []);
    const c = saved.cosmetics || {};
    profile.cosmetics.owned = strings(c.owned);
    profile.cosmetics.gold = strings(c.gold);
    profile.cosmetics.goldOff = strings(c.goldOff);
    for (const slot in c.look || {}) if (typeof c.look[slot] === 'string') profile.cosmetics.look[slot] = c.look[slot];
  }
} catch {}

export const saveProfile = () => save();
function save() {
  store(KEY, JSON.stringify(profile));
}

export const level = (id) => profile.upgrades[id] || 0;
// The editor (?editor in the address) has everything: every gun, every cosmetic, every costume, every level.
export const EDITOR = new URLSearchParams(location.search).has('editor');
export const hasUnlock = (id) => !!profile.unlocks[id];
// Can this gun turn up in chests?
export const gunUnlocked = (id) => { if (EDITOR) return true; const g = GUNS.find((gun) => gun.id === id); return !g || g.unlock === 0 || profile.guns.includes(id); };

// The casino won `amount` off you this hand (negative: you won it off the casino). `bet`: what you had put down.
export function houseTook(amount, bet = 0) {
  profile.houseTake += Math.floor(amount);
  profile.wagered += Math.max(0, Math.floor(bet));
  save();
}

// You have got as far as level `n` (6: finished the game).
export function reach(n) {
  if (n <= profile.reached) return;
  profile.reached = n;
  save();
}

// You have finished level `n`.
export function clear(n) {
  if (profile.cleared.includes(n)) return;
  profile.cleared.push(n);
  save();
}
export const finished = () => profile.cleared.includes(5);

export function bank(amount) {
  profile.gold += Math.max(0, Math.floor(amount));
  save();
}

// Take `price` from the bank and run `then`. Returns false (and does nothing) if you can't afford it.
export function pay(price, then) {
  if (profile.gold < price) return false;
  profile.gold -= price;
  then();
  save();
  return true;
}

export const nextPrice = (upgrade) => upgrade.prices[level(upgrade.id)] ?? null;   // null = maxed
export const buyUpgrade = (upgrade) => nextPrice(upgrade) !== null && pay(nextPrice(upgrade), () => { profile.upgrades[upgrade.id] = level(upgrade.id) + 1; });
export const buyUnlock = (unlock) => !hasUnlock(unlock.id) && pay(unlock.price, () => { profile.unlocks[unlock.id] = true; });
export const buyGun = (gun) => !gunUnlocked(gun.id) && pay(gun.unlock, () => { profile.guns.push(gun.id); });
// Buying the right to start with a gun also picks it as your starting gun.
export const buyStart = (gun) => gunUnlocked(gun.id) && !profile.starts.includes(gun.id) && pay(gun.start, () => { profile.starts.push(gun.id); profile.startGun = gun.id; });
// Choose which gun (of the ones you've paid to start with) you begin with; the same one again = none.
export function chooseStart(id) {
  if (!profile.starts.includes(id)) return;
  profile.startGun = profile.startGun === id ? null : id;
  save();
}

// Add everything bought to a fresh set of run stats (see player/stats.js).
export function applyPermanent(stats) {
  for (const u of PERMANENT) if (level(u.id)) u.apply(stats, level(u.id));
}
