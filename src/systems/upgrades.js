// The upgrade pool. Each level-up offers three of these at random.
// Add an upgrade by adding an entry:
//   rarity: 'common' | 'rare'   (rare ones turn up about a third as often)
//   max:    how many times it can be taken
//   description: text, or a function of how many you already have (for upgrades whose
//                later levels read differently from the first)
//   requires: a HotBox power-up id; the upgrade is only offered once you own that power-up
//   pair:     two power-up ids (a synergy): only offered once you own both; `combo` is the flag it sets (stats.combo)
//   any:      power-up ids, at least one of which you must own
// The deal leans toward what you have (the balance pass, 2026-10-16: the cards were dealt as if you had nothing, and
// the gun's three cards were the whole game): improvements to the power-ups you hold come up twice as often, one of
// the three is always one of them if any is left, and a synergy for a pair you hold comes up often.
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
  // (the gun's own, kept below what the power-ups can come to: stacked, they made it thirty times what it started as, and
  // the bot that played it took them and nothing else)
  { id: 'damage', name: 'Hollow Points', description: '+20% bullet damage.', rarity: 'common', max: 6, apply: (s) => { s.damage += 0.2; } },
  { id: 'fireRate', name: 'Rapid Fire', description: '+15% fire rate.', rarity: 'common', max: 5, apply: (s) => { s.fireRate += 0.15; } },
  { id: 'split', name: 'Split Shot', description: '+1 bullet per shot, fanned out.', rarity: 'rare', max: 2, apply: (s) => { s.projectiles += 1; } },
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
  // (each a little less than it was, +25% (thorns and frost +30%) where it was +35% / +40%: now that they are dealt to you
  // more often and a HotBox lets you choose, they stack higher, and the game must not get easy. Measured: da/power.mjs)
  { id: 'gasSize', requires: 'gas', name: 'TozToxik: Wider Cloud', description: '+25% gas radius, round you and along the trail.', rarity: 'common', max: 4, apply: (s) => { s.power.gas.size += 0.25; } },
  { id: 'gasDamage', requires: 'gas', name: 'TozToxik: Stronger Dose', description: '+25% gas damage.', rarity: 'common', max: 5, apply: (s) => { s.power.gas.damage += 0.25; } },
  { id: 'fireCount', requires: 'fire', name: 'Ring of Fire: Extra Flame', description: '+1 fireball in the ring.', rarity: 'rare', max: 3, apply: (s) => { s.power.fire.count += 1; } },
  { id: 'fireDamage', requires: 'fire', name: 'Ring of Fire: Hotter', description: '+25% fireball damage.', rarity: 'common', max: 5, apply: (s) => { s.power.fire.damage += 0.25; } },
  { id: 'fireSize', requires: 'fire', name: 'Ring of Fire: Wider Ring', description: '+20% ring radius.', rarity: 'common', max: 3, apply: (s) => { s.power.fire.size += 0.2; } },
  { id: 'seekCount', requires: 'seekers', name: 'Grave Seekers: Extra Skull', description: '+1 skull in every volley.', rarity: 'rare', max: 3, apply: (s) => { s.power.seekers.count += 1; } },
  { id: 'seekRate', requires: 'seekers', name: 'Grave Seekers: Restless', description: 'Volleys come 25% faster.', rarity: 'common', max: 4, apply: (s) => { s.power.seekers.rate += 0.25; } },
  { id: 'seekDamage', requires: 'seekers', name: 'Grave Seekers: Heavier Skulls', description: '+25% skull damage.', rarity: 'common', max: 5, apply: (s) => { s.power.seekers.damage += 0.25; } },
  { id: 'thornDamage', requires: 'thorns', name: 'Thorns: Sharper', description: '+30% thorn damage.', rarity: 'common', max: 5, apply: (s) => { s.power.thorns.damage += 0.3; } },
  { id: 'thornSize', requires: 'thorns', name: 'Thorns: Longer Reach', description: '+25% thorn reach.', rarity: 'common', max: 3, apply: (s) => { s.power.thorns.size += 0.25; } },
  { id: 'boltCount', requires: 'lightning', name: 'Chain Lightning: Longer Chain', description: 'Each bolt jumps to 2 more monsters.', rarity: 'common', max: 4, apply: (s) => { s.power.lightning.count += 2; } },
  { id: 'boltRate', requires: 'lightning', name: 'Chain Lightning: Storm', description: 'Bolts strike 25% more often.', rarity: 'common', max: 4, apply: (s) => { s.power.lightning.rate += 0.25; } },
  { id: 'boltDamage', requires: 'lightning', name: 'Chain Lightning: More Volts', description: '+25% bolt damage.', rarity: 'common', max: 5, apply: (s) => { s.power.lightning.damage += 0.25; } },
  { id: 'shieldSize', requires: 'shield', name: 'Shield: Thicker', description: '+20% shield capacity.', rarity: 'common', max: 4, apply: (s) => { s.power.shield.size += 0.2; } },
  { id: 'shieldRate', requires: 'shield', name: 'Shield: Quick Recharge', description: 'The shield starts recharging 15% sooner.', rarity: 'common', max: 4, apply: (s) => { s.power.shield.rate += 0.15; } },
  { id: 'frostSize', requires: 'frost', name: 'Frost Aura: Wider', description: '+20% frost radius.', rarity: 'common', max: 4, apply: (s) => { s.power.frost.size += 0.2; } },
  { id: 'frostDamage', requires: 'frost', name: 'Frost Aura: Bitter', description: '+30% frost damage.', rarity: 'common', max: 5, apply: (s) => { s.power.frost.damage += 0.3; } },
  { id: 'rainCount', requires: 'rain', name: 'Bone Rain: Downpour', description: '+1 bone in every fall.', rarity: 'rare', max: 3, apply: (s) => { s.power.rain.count += 1; } },
  { id: 'rainRate', requires: 'rain', name: 'Bone Rain: Restless', description: 'Bones fall 25% more often.', rarity: 'common', max: 4, apply: (s) => { s.power.rain.rate += 0.25; } },
  { id: 'rainDamage', requires: 'rain', name: 'Bone Rain: Heavier', description: '+25% bone damage.', rarity: 'common', max: 5, apply: (s) => { s.power.rain.damage += 0.25; } },
  { id: 'skin', name: 'Thick Skin', description: '+0.2 s of safety after taking a hit.', rarity: 'common', max: 2, apply: (s) => { s.invulnerable += 0.2; } },
  // --- Synergies: two power-ups (or one and your gun) made into one thing. Once each, strong, and only for what you hold. ---
  { id: 'thermal', pair: ['fire', 'frost'], name: 'Thermal Shock', description: 'SYNERGY · Fire and Frost: frozen monsters take +30% from your fire, burning ones +30% from your frost.', rarity: 'synergy', max: 1, apply: (s) => { s.combo.thermal = true; } },
  { id: 'conductor', pair: ['lightning', 'frost'], name: 'Superconductor', description: 'SYNERGY · Lightning and Frost: bolts do +40% to frozen monsters, and jump to 2 more of them.', rarity: 'synergy', max: 1, apply: (s) => { s.combo.conductor = true; s.power.lightning.count += 2; } },
  { id: 'combust', pair: ['gas', 'fire'], name: 'Combustion', description: 'SYNERGY · TozToxik and Ring of Fire: burning monsters take +50% from your gas, and your fire burns the sick ones twice as long.', rarity: 'synergy', max: 1, apply: (s) => { s.combo.combust = true; } },
  { id: 'spiked', pair: ['thorns', 'shield'], name: 'Spiked Shell', description: 'SYNERGY · Thorns and Shield: while the shield holds, your thorns do +60% damage and reach a third further.', rarity: 'synergy', max: 1, apply: (s) => { s.combo.spiked = true; } },
  { id: 'barrage', pair: ['seekers', 'rain'], name: 'Grave Barrage', description: 'SYNERGY · Grave Seekers and Bone Rain: one more skull in every volley and one more bone in every fall, both 20% faster.', rarity: 'synergy', max: 1, apply: (s) => { s.combo.barrage = true; s.power.seekers.count += 1; s.power.rain.count += 1; s.power.seekers.rate += 0.2; s.power.rain.rate += 0.2; } },
  { id: 'wounds', any: ['fire', 'frost', 'gas'], name: 'Open Wounds', description: 'SYNERGY · Your gun and what ails them: bullets do +25% to anything burning, frozen or sick.', rarity: 'synergy', max: 1, apply: (s) => { s.combo.wounds = true; } },
];

const owns = (id) => stats.power[id]?.level > 0;
const open = (u) => (stats.taken[u.id] || 0) < u.max && (!u.requires || owns(u.requires)) && (!u.pair || u.pair.every(owns)) && (!u.any || u.any.some(owns));
// How often each comes up against the others: a common 3, a rare 1; what improves a power-up you hold 6 (a rare one 2):
// it is your build; a synergy you can take 2.5 (rare, but earned).
const weightOf = (u) => (u.rarity === 'synergy' ? 2 : u.requires ? (u.rarity === 'rare' ? 1.5 : 4.5) : u.rarity === 'rare' ? 1 : 3);   // (boosters 4.5, not 6: measured too easy)
// Up to `count` different upgrades that can still be taken. One is always for your build (an improvement to a power-up
// you hold, or a synergy) if there is one left to take.
export function rollUpgrades(count = 3) {
  const pool = UPGRADES.filter(open);
  const picks = [];
  const draw = (from) => {
    const weights = from.map(weightOf);
    let r = Math.random() * weights.reduce((a, b) => a + b, 0), i = 0;
    while ((r -= weights[i]) > 0 && i < from.length - 1) i++;
    const u = from[i];
    pool.splice(pool.indexOf(u), 1);
    return u;
  };
  const build = pool.filter((u) => u.requires || u.pair || u.any);
  if (build.length) picks.push(draw(build));
  while (picks.length < count && pool.length) picks.push(draw(pool));
  for (let i = picks.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [picks[i], picks[j]] = [picks[j], picks[i]]; }   // (not always first)
  return picks;
}

export function takeUpgrade(upgrade, run) {
  stats.taken[upgrade.id] = (stats.taken[upgrade.id] || 0) + 1;
  upgrade.apply(stats, run);
}
