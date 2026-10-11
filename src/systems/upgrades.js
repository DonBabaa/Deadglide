// The upgrade pool. Each level-up offers three of these at random.
// Add an upgrade by adding an entry:
//   rarity: 'common' | 'rare'   (rare ones turn up about a third as often)
//   max:    how many times it can be taken
//   description: text, or a function of how many you already have (for upgrades whose
//                later levels read differently from the first)
//   requires: a HotBox power-up id; the upgrade is only offered once you own that power-up
//   apply(stats, run): change the player's stats (see player/stats.js);
//                      `run` has heal(n) for upgrades that restore HP.
import { stats } from '../player/stats.js';
import { config } from '../config.js';

const RAM = 40;   // Deck Spikes: damage per level
// Deck Spikes: the speed (km/h) you must be going to ram, at a given level. Each level needs less.
export const ramSpeed = (level) => config.horde.ramSpeed * (1 - 0.06 * (Math.max(1, level) - 1));
const ramKmh = (level) => Math.round(ramSpeed(level) * 3.6);

// What taking an upgrade would do, given how many of it you already have.
export const describe = (u, owned = 0) => (typeof u.description === 'function' ? u.description(owned) : u.description);

export const UPGRADES = [
  { id: 'damage', name: 'Hollow Points', description: '+25% bullet damage.', rarity: 'common', max: 8, apply: (s) => { s.damage += 0.25; } },
  { id: 'fireRate', name: 'Rapid Fire', description: '+20% fire rate.', rarity: 'common', max: 6, apply: (s) => { s.fireRate += 0.2; } },
  { id: 'split', name: 'Split Shot', description: '+1 bullet per shot, fanned out.', rarity: 'rare', max: 4, apply: (s) => { s.projectiles += 1; } },
  { id: 'pierce', name: 'Grindstone', description: 'Bullets pass through one more monster.', rarity: 'common', max: 4, apply: (s) => { s.pierce += 1; } },
  { id: 'air', name: 'Air Superiority', description: '+50% damage while you are in the air.', rarity: 'common', max: 4, apply: (s) => { s.airDamage += 0.5; } },
  { id: 'spikes', name: 'Deck Spikes', description: (n) => n ? `Ramming hits harder and needs less speed: ${RAM * n} to ${RAM * (n + 1)} damage, from ${ramKmh(n)} to ${ramKmh(n + 1)} km/h.` : `Riding into monsters at over ${ramKmh(1)} km/h deals ${RAM} damage to them instead of hurting you. Elites and bosses still hurt.`, rarity: 'rare', max: 4, apply: (s) => { s.ramDamage += RAM; } },
  { id: 'shockwave', name: 'Shockwave Landing', description: (n) => n ? `The landing ring hits harder: ${40 * n} to ${40 * (n + 1)} damage.` : 'Landing a trick releases a ring that deals 40 damage to everything nearby.', rarity: 'rare', max: 4, apply: (s) => { s.shockwave += 40; } },
  { id: 'style', name: 'Style Points', description: (n) => n ? `Double damage after a trick lasts longer: ${3 * n} to ${3 * (n + 1)} seconds.` : 'Landing a trick doubles your damage for 3 seconds.', rarity: 'common', max: 3, apply: (s) => { s.trickBuff += 3; } },
  { id: 'magnet', name: 'Bone Magnet', description: '+50% XP pickup range.', rarity: 'common', max: 4, apply: (s) => { s.pickupRadius += 0.5; } },
  { id: 'xp', name: 'Quick Learner', description: '+20% XP from everything.', rarity: 'common', max: 5, apply: (s) => { s.xpGain += 0.2; } },
  { id: 'speed', name: 'Hot Wheels', description: '+10% top pushing speed.', rarity: 'common', max: 5, apply: (s) => { s.topSpeed += 0.1; } },
  { id: 'heart', name: 'Second Wind', description: '+15 maximum HP, and heal 15.', rarity: 'rare', max: 3, apply: (s, run) => { s.maxHp += 15; run.heal(15); } },
  { id: 'heal', name: 'Patch Up', description: 'Heal 20 HP.', rarity: 'common', max: 99, apply: (s, run) => run.heal(20) },
  // --- Power-up boosters: these only turn up once you own the power-up they improve. ---
  { id: 'gasSize', requires: 'gas', name: 'TozToxik: Wider Cloud', description: '+25% gas radius, round you and along the trail.', rarity: 'common', max: 4, apply: (s) => { s.power.gas.size += 0.25; } },
  { id: 'gasDamage', requires: 'gas', name: 'TozToxik: Stronger Dose', description: '+35% gas damage.', rarity: 'common', max: 5, apply: (s) => { s.power.gas.damage += 0.35; } },
  { id: 'fireCount', requires: 'fire', name: 'Ring of Fire: Extra Flame', description: '+1 fireball in the ring.', rarity: 'rare', max: 3, apply: (s) => { s.power.fire.count += 1; } },
  { id: 'fireDamage', requires: 'fire', name: 'Ring of Fire: Hotter', description: '+35% fireball damage.', rarity: 'common', max: 5, apply: (s) => { s.power.fire.damage += 0.35; } },
  { id: 'fireSize', requires: 'fire', name: 'Ring of Fire: Wider Ring', description: '+20% ring radius.', rarity: 'common', max: 3, apply: (s) => { s.power.fire.size += 0.2; } },
  { id: 'seekCount', requires: 'seekers', name: 'Grave Seekers: Extra Skull', description: '+1 skull in every volley.', rarity: 'rare', max: 3, apply: (s) => { s.power.seekers.count += 1; } },
  { id: 'seekRate', requires: 'seekers', name: 'Grave Seekers: Restless', description: 'Volleys come 25% faster.', rarity: 'common', max: 4, apply: (s) => { s.power.seekers.rate += 0.25; } },
  { id: 'seekDamage', requires: 'seekers', name: 'Grave Seekers: Heavier Skulls', description: '+35% skull damage.', rarity: 'common', max: 5, apply: (s) => { s.power.seekers.damage += 0.35; } },
  { id: 'thornDamage', requires: 'thorns', name: 'Thorns: Sharper', description: '+40% thorn damage.', rarity: 'common', max: 5, apply: (s) => { s.power.thorns.damage += 0.4; } },
  { id: 'thornSize', requires: 'thorns', name: 'Thorns: Longer Reach', description: '+25% thorn reach.', rarity: 'common', max: 3, apply: (s) => { s.power.thorns.size += 0.25; } },
  { id: 'boltCount', requires: 'lightning', name: 'Chain Lightning: Longer Chain', description: 'Each bolt jumps to 2 more monsters.', rarity: 'common', max: 4, apply: (s) => { s.power.lightning.count += 2; } },
  { id: 'boltRate', requires: 'lightning', name: 'Chain Lightning: Storm', description: 'Bolts strike 25% more often.', rarity: 'common', max: 4, apply: (s) => { s.power.lightning.rate += 0.25; } },
  { id: 'boltDamage', requires: 'lightning', name: 'Chain Lightning: More Volts', description: '+35% bolt damage.', rarity: 'common', max: 5, apply: (s) => { s.power.lightning.damage += 0.35; } },
  { id: 'shieldSize', requires: 'shield', name: 'Shield: Thicker', description: '+20% shield capacity.', rarity: 'common', max: 4, apply: (s) => { s.power.shield.size += 0.2; } },
  { id: 'shieldRate', requires: 'shield', name: 'Shield: Quick Recharge', description: 'The shield starts recharging 15% sooner.', rarity: 'common', max: 4, apply: (s) => { s.power.shield.rate += 0.15; } },
  { id: 'frostSize', requires: 'frost', name: 'Frost Aura: Wider', description: '+20% frost radius.', rarity: 'common', max: 4, apply: (s) => { s.power.frost.size += 0.2; } },
  { id: 'frostDamage', requires: 'frost', name: 'Frost Aura: Bitter', description: '+40% frost damage.', rarity: 'common', max: 5, apply: (s) => { s.power.frost.damage += 0.4; } },
  { id: 'rainCount', requires: 'rain', name: 'Bone Rain: Downpour', description: '+1 bone in every fall.', rarity: 'rare', max: 3, apply: (s) => { s.power.rain.count += 1; } },
  { id: 'rainRate', requires: 'rain', name: 'Bone Rain: Restless', description: 'Bones fall 25% more often.', rarity: 'common', max: 4, apply: (s) => { s.power.rain.rate += 0.25; } },
  { id: 'rainDamage', requires: 'rain', name: 'Bone Rain: Heavier', description: '+35% bone damage.', rarity: 'common', max: 5, apply: (s) => { s.power.rain.damage += 0.35; } },
  { id: 'skin', name: 'Thick Skin', description: '+0.2 s of safety after taking a hit.', rarity: 'common', max: 2, apply: (s) => { s.invulnerable += 0.2; } },
];

// Up to `count` different upgrades that can still be taken.
export function rollUpgrades(count = 3) {
  const pool = UPGRADES.filter((u) => (stats.taken[u.id] || 0) < u.max && (!u.requires || stats.power[u.requires].level > 0));
  const picks = [];
  while (picks.length < count && pool.length) {
    const weights = pool.map((u) => (u.rarity === 'rare' ? 1 : 3));
    let r = Math.random() * weights.reduce((a, b) => a + b, 0), i = 0;
    while ((r -= weights[i]) > 0) i++;
    picks.push(pool.splice(i, 1)[0]);
  }
  return picks;
}

export function takeUpgrade(upgrade, run) {
  stats.taken[upgrade.id] = (stats.taken[upgrade.id] || 0) + 1;
  upgrade.apply(stats, run);
}
